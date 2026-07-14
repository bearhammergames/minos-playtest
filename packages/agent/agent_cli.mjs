#!/usr/bin/env node
// =============================================================================
// SPELLSPUN — remote agent transport (the Node CLI over the session core)
//
//   node agent_cli.mjs                 interactive: one JSON action per line on
//                                      stdin → one JSON result per line on stdout
//   node agent_cli.mjs --seed 42       same, seeded (reproducible)
//   node agent_cli.mjs --demo [N]      scripted reference agent plays N runs
//                                      through the public protocol (conformance)
//
// This is a THIN wrapper: the game state machine lives in session.mjs (browser-safe,
// no process/DOM), so the CLI and the web client (apps/client) drive the SAME rules —
// a Run Record's actions replay byte-for-byte through here. This file adds only the
// Node I/O: CLI-flag parsing → session.configure(), the demo, and the stdin/stdout loop.
// Debug flags: --witnesses ids · --curse ids · --wish id · --warp kind[:sym][:count] ·
// --enchant effect[:scope][:extra] (effect ∈ deepen/erode/convert/release/ward/expose/reroll/lock/echo) ·
// --sigil scope|expose · --ench-test · --balance k=v[,k=v] (§8 trim: balance overrides) ·
// --disable id[,id] (§8 trim: disable content). See AGENT_PLAY.md for the protocol.
// =============================================================================

import { newRun, act, serializeState, legalActions, configure } from './session.mjs';

// ---- CLI flags → session defaults ------------------------------------------------
const argv = process.argv;
const list = (f) => { const i = argv.indexOf(f); return (i >= 0 && argv[i + 1]) ? String(argv[i + 1]).split(',').map(s => s.trim()).filter(Boolean) : []; };
const str  = (f) => { const i = argv.indexOf(f); return (i >= 0 && argv[i + 1]) ? String(argv[i + 1]).trim() : null; };
const flag = (f) => { const i = argv.indexOf(f); return i >= 0 ? (argv[i + 1] ?? true) : null; };

// --warp kind[:symbol][:count] → a raw ritual warp (numbers → count, else → symbol).
function parseWarpSpec(spec){
  const [kind, a, b] = String(spec).split(':');
  if (!kind) return null;
  const isNum = s => s != null && /^\d+$/.test(s);
  const params = {};
  for (const x of [a, b]){ if (isNum(x)) params.count = +x; else if (x) params.symbol = x; }
  return { kind, params };
}
// --enchant effect[:scope][:extra] → a transformer/verb enchantment. The trigger is derived from the
// effect (deepen/erode/convert land at on_resolve; release at on_keep; ward/expose/reroll at on_roll;
// the pseudo-effect `echo` = an on_reroll reroll). `extra` is pips (numeric) or a convert `to` colour.
// forced is effect-aware: ward auto-fires (forced:true); expose/release/reroll/echo are OFFERED
// (forced:false); chosen scope forces forced:false; the rest (deepen/erode/convert/lock) auto-fire
// unless chosen. Backward-compatible with `deepen:self:1` / `deepen:chosen:1`.
function parseEnchantSpec(spec){
  const [effect, scope, extra] = String(spec).split(':');
  if (!effect) return null;
  const sc = scope || 'self';
  const realEffect = effect === 'echo' ? 'reroll' : effect;
  const TRIG = { deepen:'on_resolve', erode:'on_resolve', convert:'on_resolve', release:'on_keep',
                 ward:'on_roll', expose:'on_roll', reroll:'on_roll', lock:'on_roll' };
  const trigger = effect === 'echo' ? 'on_reroll' : (TRIG[effect] || 'on_roll');
  const offered = new Set(['expose', 'release', 'reroll', 'echo']);   // OFFERED verbs never auto-fire
  const forced = effect === 'ward' ? true : (sc === 'chosen' ? false : !offered.has(effect));
  const params = {};
  if (extra){ if (/^\d+$/.test(extra)) params.pips = +extra; else params.to = extra; }
  if (realEffect === 'convert' && params.to == null) params.to = 'need';
  return { id: `debug_${effect}_${sc}`, trigger, condition: null, scope: sc, effect: realEffect, polarity: 'boon',
    forced, lifetime: 'permanent', cost: {}, params };
}
// --balance parses a "true"/"false"/number/string leaf value (booleans/numbers first, else raw string).
function parseBalanceValue(raw){
  if (raw === 'true')  return true;
  if (raw === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}
// --balance k=v[,k=v] → the §8 override map { 'dot.path': value } (see balance.js §C0).
function parseBalanceSpec(kvs){
  const out = {};
  for (const kv of kvs){
    const eq = kv.indexOf('=');
    if (eq < 0) continue;
    out[kv.slice(0, eq).trim()] = parseBalanceValue(kv.slice(eq + 1).trim());
  }
  return out;
}

configure({
  witnesses: list('--witnesses'),   // §5b loadout (only when on('witnesses'))
  curses:    list('--curse'),       // C0 curse-warp injection
  wish:      str('--wish'),         // force a specific patron wish (deterministic testing)
  warps:     list('--warp').map(parseWarpSpec).filter(Boolean),
  enchants:  list('--enchant').map(parseEnchantSpec).filter(Boolean),
  enchTest:  argv.includes('--ench-test'),
  sigil:     str('--sigil'),         // etch an on_roll forced:false reroll SIGIL of this scope on die 0
  balance:         parseBalanceSpec(list('--balance')),   // §8 trim substrate — balance overrides { 'dot.path': value }
  disabledContent: list('--disable'),                     // §8 trim substrate — content ids to trim from the live pools
});

// ---- demo (scripted conformance agent through the public protocol only) -----------
function demoPolicy(state, legal){
  if (state.phase === 'perk'){
    const order = ['reweave', 'glimmer', 'steady', 'deepen', 'roll_lock', 'grasping'];
    for (const id of order){
      const c = legal.find(x => x.type === 'perk' && x.args?.id === id);
      if (c) return { type:'perk', ...c.args };
    }
    const any = legal.find(x => x.type === 'perk');
    return any ? { type:'perk', ...any.args } : null;
  }
  if (state.phase === 'stitch') return { type:'stitch' };
  if (state.phase === 'transform') return { type:'transform', skip:true };   // the demo plays clean — decline chosen transformers
  if (state.phase === 'segment' || state.phase === 'knot'){
    // FOCUSED play (the line the generator's reach probes model): pick the most
    // reachable rung and keep ONLY faces that advance its still-unmet requirements.
    if (state.tray && state.spinsTaken >= 1){
      const target = [...state.rungs].sort((a, b) => (b.reach_estimate || 0) - (a.reach_estimate || 0))[0];
      const need = { ...target.req };
      for (const t of state.tray) if (t.kept && need[t.symbol]) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag || 1));
      for (const t of state.tray){
        if (t.kept || t.locked || t.symbol === 'blank') continue;
        if (t.symbol === 'fang') continue;   // the demo plays CLEAN: no fang, no forced curse
        if ((need[t.symbol] || 0) > 0 && legal.some(x => x.type === 'keep' && x.args?.i === t.i))
          return { type:'keep', i: t.i };
      }
    }
    const anyMet = (state.metNow || []).length > 0;
    if (anyMet) return { type:'resolve' };
    if (state.rollsLeft > 0) return { type:'spin' };
    return { type:'resolve' };
  }
  return null;
}

if (flag('--demo')){
  const n = parseInt(flag('--demo')) || 3;
  let errors = 0;
  for (let run = 0; run < n; run++){
    const seed = 1000 + run * 7919;
    let r = act({ type:'new_run', seed });
    let steps = 0;
    while (!r.state.over && steps++ < 400){
      const legal = legalActions();
      const a = demoPolicy(r.state, legal);
      if (!a){ console.error(`demo stuck at phase ${r.state.phase}`); errors++; break; }
      r = act(a);
      if (!r.ok){ console.error(`ERROR seed ${seed}: ${JSON.stringify(a)} → ${r.error}`); errors++; break; }
    }
    const s = r.state;
    console.log(`seed ${seed}: score ${s.score ?? '?'} over ${s.thread.length} segments, knot ${s.knot ? (s.knot.hit ? (s.knot.tight ? 'TIGHT' : 'tied') : 'slipped') : 'none'}, stitches ${s.stitchSaves}, ${steps} actions`);
  }
  console.log(errors === 0 ? 'demo: all runs clean' : `demo: ${errors} errors`);
  process.exit(errors === 0 ? 0 : 1);
}

// ---- interactive JSON-lines loop ------------------------------------------------
const seed = flag('--seed');
const ev = newRun(seed != null ? +seed : undefined);
process.stdout.write(JSON.stringify({
  ok: true,
  hello: 'spellspun agent protocol v1 — send {"type":"legal"} for options; see AGENT_PLAY.md',
  state: serializeState(), events: ev,
}) + '\n');

let buf = '';
process.stdin.on('data', chunk => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0){
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (!line) continue;
    let out;
    try { out = act(JSON.parse(line)); }
    catch (e){ out = { ok:false, error: 'bad JSON: ' + e.message }; }
    process.stdout.write(JSON.stringify(out) + '\n');
  }
});
process.stdin.on('end', () => process.exit(0));
