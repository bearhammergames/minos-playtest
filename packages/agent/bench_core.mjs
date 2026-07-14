// =============================================================================
// BENCH CORE — the shared play-and-collect engine for the archetype bench AND the
// acceptance instrument / sweep harness (Generator v2 slice G5a).
// -----------------------------------------------------------------------------
// Extracted from archetype_driver.mjs so BOTH the plain bench (npm run bench) and
// the tuning sweep (npm run sweep) drive runs through the SAME code: one long-lived
// agent_cli process, the seed-general archetype policies, and — new for G5 — a
// per-SEGMENT telemetry collector that reads s.generator (the joint-probe band
// readings) and the realized snap/boss outcome each segment. It speaks ONLY the
// public JSON-lines protocol (no engine import), so it drives the REAL engine with
// zero rule duplication — the whole point of the retired-sim → agent-bench move.
//
// THE SWEEP MECHANISM (§C0): each run's new_run action carries `balance` — the flat
// dot-path override map applyRunConfig() installs BEFORE the first rng() draw. So a
// config is expressed purely as overrides; the engine numbers are never mutated for
// a sweep. Passing {} is byte-identical to the balance.js defaults (the neutrality
// contract), so the default-config bench reproduces the legacy table exactly.
//
// DETERMINISM: new_run fully resets the engine (resetShapeMemory + fresh seeded rng
// + setBalanceOverrides), so reusing one process across seeds/configs is both fast
// and deterministic. Same archetype + seed + overrides ⇒ same run, byte for byte.
// =============================================================================
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import {
  ARCHETYPES, ARCHETYPE_NAMES, KNOT_KNOBS,
  chooseTarget, chooseKeep, decideStop, choosePerk,
} from './archetypes.mjs';

const CLI = fileURLToPath(new URL('./agent_cli.mjs', import.meta.url));
export const GUARD = 4000;   // action cap per run — a runaway (an untuned band) trips it

// ---- a tiny long-lived protocol client (one agent_cli process drives every run) -----
export function makeClient(){
  const p = spawn('node', [CLI]);
  let buf = ''; const q = [];
  p.stdout.on('data', d => { buf += d; let nl;
    while ((nl = buf.indexOf('\n')) >= 0){ const l = buf.slice(0, nl); buf = buf.slice(nl + 1); if (l.trim()) q.shift()?.(JSON.parse(l)); } });
  p.stderr.on('data', () => {});
  const hello = new Promise(res => q.push(res));
  const send = a => new Promise(res => { q.push(res); p.stdin.write(JSON.stringify(a) + '\n'); });
  return { hello, send, close: () => p.stdin.end() };
}

// ---- play ONE run of one archetype on one seed, fully automated ----------------------
// Returns { row, segs } where `segs` is the per-segment telemetry (the G5 addition):
// each entry = { segIndex, patronIndex, boss, pSnapTarget, pSnapPredicted, fit,
// rungCount, rested, snap } — snap = 1 iff the player met NO rung on the primary
// resolve (the realized P(snap) the joint probe predicts), whether or not a stitch
// then saved it. The default archetype table numbers are UNCHANGED (same decisions).
export async function playRun(client, name, seed, opts = {}){
  const knobs = ARCHETYPES[name];
  const newRunAction = { type: 'new_run', seed, witnesses: knobs.witnesses };
  if (opts.overrides) newRunAction.balance = opts.overrides;   // §C0 sweep channel (absent ⇒ defaults)
  let r = await client.send(newRunAction);
  let st = r.state;
  let guard = 0, tripped = false;

  // --- per-segment telemetry collection ---------------------------------------------
  const segs = [];
  const segByIdx = new Map();
  const patronLenGuess = (st.patron && st.patron.len) || 3;
  const noteSeg = () => {
    if (st.phase !== 'segment') return;
    const idx = st.segIndex;
    if (segByIdx.has(idx)) return;
    const g = st.generator || null;
    const rec = {
      name, seed, segIndex: idx,
      patronIndex: st.patron ? st.patron.index : Math.floor(idx / patronLenGuess),
      boss: st.patron ? !!st.patron.boss : (idx % patronLenGuess === patronLenGuess - 1),
      pSnapTarget:    (g && g.pSnapTarget    != null) ? g.pSnapTarget    : null,
      pSnapPredicted: (g && g.pSnapPredicted != null) ? g.pSnapPredicted : null,
      power:          (g && g.power          != null) ? g.power          : null,
      pricedPower:    (g && g.pricedPower    != null) ? g.pricedPower    : null,
      window:         (g && g.window != null) ? !!g.window : null,
      fit:  g ? (g.fit || 'band') : null,   // s.generator omits `fit` for an in-band segment ⇒ 'band'
      rungCount: (g && g.rungCount != null) ? g.rungCount : (st.rungs ? st.rungs.length : null),
      rested: (g && g.rested) || null,
      snap: 0,
    };
    segByIdx.set(idx, rec);
    segs.push(rec);
  };
  const markSnap = () => { const rec = segByIdx.get(st.segIndex); if (rec) rec.snap = 1; };
  noteSeg();

  while (!st.over){
    if (guard++ >= GUARD){ tripped = true; break; }
    if (st.phase === 'perk'){ r = await client.send(choosePerk(st, knobs)); st = r.state; noteSeg(); continue; }
    if (st.phase === 'transform'){
      const c = st.transformOffer && st.transformOffer.candidates;
      r = await client.send(c && c.length ? { type: 'transform', di: c[0].i } : { type: 'transform', skip: true });
      st = r.state; noteSeg(); continue;
    }
    if (st.phase === 'stitch'){ markSnap(); r = await client.send({ type: knobs.stitch || 'stitch' }); st = r.state; noteSeg(); continue; }
    if (st.phase === 'segment' || st.phase === 'knot'){
      const active = st.phase === 'knot' ? KNOT_KNOBS : knobs;
      if ((st.spinsTaken || 0) === 0){ r = await client.send({ type: 'spin' }); st = r.state; continue; }
      const target = chooseTarget(st, active);
      let legalKeeps;
      if (st.curses && st.curses.keepCap){
        const lr = await client.send({ type: 'legal' });
        legalKeeps = lr.legal.filter(x => x.type === 'keep').map(x => x.args.i);
      } else {
        legalKeeps = (st.tray || []).filter(t => !t.kept && !t.locked && t.symbol !== 'blank').map(t => t.i);
      }
      const keepDie = chooseKeep(st, target, active, legalKeeps);
      if (keepDie != null){ r = await client.send({ type: 'keep', i: keepDie }); st = r.state; continue; }
      if (decideStop(st, target, active)){ r = await client.send({ type: 'resolve' }); st = r.state; noteSeg(); continue; }
      if ((st.rollsLeft || 0) > 0){ r = await client.send({ type: 'spin' }); st = r.state; continue; }
      r = await client.send({ type: 'resolve' }); st = r.state; noteSeg(); continue;
    }
    break;   // unexpected phase
  }
  // a run ends ONLY by a snap (doSnapEnd → finishRun; the knot is dormant in real play) — so the
  // final in-progress segment snapped. Guard-tripped runaways are excluded (no clean terminal snap).
  if (st.over && !tripped) markSnap();

  return { row: summarize(name, seed, st, tripped), segs };
}

// what the run DID — the signals that say the build reached the stack, not just a score.
// `terminalBoss` (G5) = whether the run-ending snap fell on a boss segment (for the boss-death dial).
function summarize(name, seed, st, tripped){
  const th = st.thread || {};
  const outcomes = th.outcomes || [];
  return {
    name, seed,
    score: st.score ?? 0,
    segments: th.length ?? 0,
    terminalBoss: st.patron ? !!st.patron.boss : null,   // patron state at the snap (the run-ender)
    knot: st.knot ? (st.knot.hit ? (st.knot.tight ? 'tight' : 'tied') : 'slip') : 'none',
    stitches: st.stitchSaves ?? 0,
    witnessScore: st.witnessScore ?? 0,
    cursed: outcomes.filter(o => o.cursedHere).length,
    corrupt: outcomes.filter(o => o.corrupt).length,
    blooms: (th.bloomsRecorded || []).length,
    tripped,
  };
}

// ---- run a whole bench (names × seeds), collecting rows + per-segment telemetry ------
// Returns { rows: { name: [row,...] }, segRecs: [rec,...] }. `opts.overrides` applies the
// same §C0 override map to every run (a sweep config); `opts.onRow` is an optional per-run
// callback (the CLI uses it for --verbose / --json streaming).
export async function runBench(names, seeds, opts = {}){
  const client = opts.client || makeClient();
  if (!opts.client) await client.hello;
  const rows = {};
  const segRecs = [];
  for (const nm of names){
    rows[nm] = [];
    for (const seed of seeds){
      const { row, segs } = await playRun(client, nm, seed, { overrides: opts.overrides });
      rows[nm].push(row);
      for (const s of segs) segRecs.push(s);
      if (opts.onRow) opts.onRow(row, segs);
    }
  }
  if (!opts.client) client.close();
  return { rows, segRecs };
}

export { ARCHETYPE_NAMES, ARCHETYPES };
