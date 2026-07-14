// Playtest driver — speaks ONLY the public JSON-lines protocol to agent_cli.mjs.
// Replays the playbook from the seed (determinism = identical trajectory), executes
// per-segment strategy directives, and PAUSES (prints state, exits) whenever it
// reaches a segment/knot with no directive yet — so the playing agent can read the
// board and decide. Used for the inaugural report in reports/.
//
// Usage:  node driver.mjs playbook.json
//
// playbook.json:
// {
//   "seed": 20260704,
//   "perkPref": ["reweave","deepen","glimmer","steady"],   // default pick order (fallback: cards[0])
//   "perks": [ {"args":{"card":0,"die":1,"to":"spirit"},"note":"targeted Graft"}, ... ],   // §Fix7 OPTIONAL:
//                                                                    // deliberate targeted picks in encounter
//                                                                    // order; absent ⇒ perkPref/cards[0] default
//   "segments": [ {"target":"true","keepFangs":false,"stopWhen":"target","note":"..."}, ... ],
//   "knot": {"target":"tight","keepFangs":true,"stopWhen":"push"}   // absent → pause at the knot (knot is CUT in-engine)
// }
// target:   "floor" | "true" | "bloom" | "chain" (the current chain colour's rung)
//           | "tight" (a rung matching a live bloom colour, else best reach)
// stopWhen: "target" = resolve the moment the target rung lights
//           "any"    = resolve the moment ANY rung lights
//           "push"   = keep spinning until the target lights or spins run out
// keepFangs: true | false | "lastResort" (refuse fangs while spins remain; take them
//            on the final spin when still short — the corrupt-vs-dead insurance)
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const CLI = fileURLToPath(new URL('./agent_cli.mjs', import.meta.url)); // resolve beside this file, so the driver runs from any cwd
const pb = JSON.parse(readFileSync(process.argv[2] || 'playbook.json', 'utf8'));
const p = spawn('node', [CLI, '--seed', String(pb.seed)]);
let buf = ''; const q = [];
p.stdout.on('data', d => { buf += d; let nl;
  while ((nl = buf.indexOf('\n')) >= 0){ const l = buf.slice(0,nl); buf = buf.slice(nl+1); if (l.trim()) q.shift()?.(JSON.parse(l)); } });
const send = a => new Promise(res => { q.push(res); p.stdin.write(JSON.stringify(a) + '\n'); });
const log = [];
const first = await new Promise(res => q.push(res));
let st = first.state; log.push(...first.events);

function pause(reason){
  console.log('=== PAUSE:', reason, '===');
  console.log('LOG so far:'); log.forEach(e => console.log('  ', e));
  console.log('THREAD:', JSON.stringify({ length: st.thread.length, chain: st.thread.chain,
    colours: st.thread.colours, frayed: st.thread.frayed, corrupt: st.thread.corrupt,
    liveBloomColours: st.thread.liveBloomColours, curses: st.curses,
    bonuses: st.bonuses, stitchSaves: st.stitchSaves }));
  if (st.rungs) console.log('RUNGS:', JSON.stringify(st.rungs, null, 1));
  // §post-G3 Fix 5c — surface the generator telemetry block (power / pSnap / band / window / fit) at a
  // pause when present. Guarded by presence, so a plain run WITHOUT the block (generator2 off) prints
  // byte-identically to before — both playtesters hand-patched this in, now it's the default.
  if (st.generator) console.log('GENERATOR:', JSON.stringify(st.generator));
  if (st.hand) console.log('HAND:', st.hand.map(d => `${d.die}[${d.faces.map(f=>f.symbol+(f.mag>1?`(${f.mag})`:'')).join(',')}]`).join(' '));
  if (st.over){ console.log('SCORE:', st.score); console.log('LINES:', JSON.stringify(st.scoreLines));
    console.log('COMBOS:', JSON.stringify(st.combos)); console.log('KNOT:', JSON.stringify(st.knot)); }
  p.stdin.end(); process.exit(0);
}

async function playSpinPhase(directive){
  const rungs = st.rungs;
  let target;
  if (directive.target === 'tight')
    target = rungs.find(r => (st.thread.liveBloomColours||[]).includes(r.colour))
          || [...rungs].sort((a,b)=>(b.reach_estimate||0)-(a.reach_estimate||0))[0];
  else if (['floor','true','bloom'].includes(directive.target))
    target = rungs.find(r => r.tier === directive.target);
  else if (directive.target === 'chain')
    target = rungs.find(r => r.colour === st.thread.chain) || rungs.find(r => r.tier === 'floor');
  else target = [...rungs].sort((a,b)=>(b.reach_estimate||0)-(a.reach_estimate||0))[0];

  while (true){
    if (st.phase === 'stitch'){ const r = await send({ type:'stitch' }); log.push(...r.events); st = r.state; return; }
    if (st.phase !== 'segment' && st.phase !== 'knot') return;
    if (st.spinsTaken === 0){ const r = await send({ type:'spin' }); log.push(...r.events); st = r.state; continue; }
    const need = { ...target.req };
    for (const t of st.tray) if (t.kept && need[t.symbol]) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag||1));
    let kept1 = false;
    const lr = await send({ type:'legal' });
    for (const t of st.tray){
      if (t.kept || t.locked || t.symbol === 'blank') continue;
      if (t.symbol === 'fang'){
        const totalNeed = Object.values(need).reduce((a,v)=>a+Math.max(0,v),0);
        // §Fix7 credit already-kept fangs — a kept fang is a wild that fills one need slot, so lastResort
        // must not chain-keep a SECOND, wasted fang after the first already covers the shortfall (which
        // upgraded a survivable keep into corrupt + extra lien exposure — seeds 20260711/20260712). Only
        // the lastResort branch reads netNeed, so keepFangs true/false/undefined stay byte-identical.
        const keptFangs = st.tray.filter(x => x.kept && x.symbol === 'fang').length;
        const netNeed = Math.max(0, totalNeed - keptFangs);
        if (directive.keepFangs === 'lastResort'){
          if (!(st.rollsLeft === 0 && netNeed > 0)) continue;   // corrupt-vs-dead insurance only
        } else if (!directive.keepFangs) continue;
      }
      else if ((need[t.symbol] || 0) <= 0) continue;
      if (lr.legal.some(x => x.type==='keep' && x.args?.i === t.i)){
        const r = await send({ type:'keep', i: t.i }); log.push(...r.events); st = r.state; kept1 = true; break;
      }
    }
    if (kept1) continue;
    const met = st.metNow || [];
    const targetMet = met.some(m => m.tier === target.tier && m.colour === target.colour);
    const anyMet = met.length > 0;
    const stop = directive.stopWhen === 'target' ? targetMet
               : directive.stopWhen === 'any'    ? anyMet
               : /* push */ (st.rollsLeft <= 0 || targetMet);
    if (!stop && st.rollsLeft > 0){ const r = await send({ type:'spin' }); log.push(...r.events); st = r.state; continue; }
    const r = await send({ type:'resolve' }); log.push(...r.events); st = r.state;
    if (st.phase === 'stitch'){ const r2 = await send({ type:'stitch' }); log.push(...r2.events); st = r2.state; }
    return;
  }
}

let perkCursor = 0;
async function playPerk(){
  // §Fix7 TARGETED PERK HOOK (upstreamed from driver_ext_20260709) — a playbook MAY carry
  //   "perks": [ { "args": { "card": N, "die"?, "face"?, "to"?, "toDie"?, "toFace"?, "slot"? }, "note": "" }, … ]
  // consumed in encounter order; an entry drives a DELIBERATE targeted pick (a Graft's die/to, an
  // enchant/bargain's die/face, a Shift's toDie/toFace, a draft's slot). BYTE-IDENTICAL DEFAULT: with no
  // `perks` key (or once its entries run out) the cursor never advances and the pick falls through to the
  // EXACT existing perkPref/cards[0] behaviour — so every existing playbook and the demo replay unchanged.
  const entry = (pb.perks || [])[perkCursor];
  if (entry){
    perkCursor++;
    const r = await send({ type:'perk', ...entry.args }); log.push(...r.events);
    if (!r.ok){ console.log('PERK PICK FAILED:', r.error); pause('illegal targeted perk pick — fix the playbook `perks` entry'); }
    st = r.state; return;
  }
  const pref = pb.perkPref || ['reweave','deepen','glimmer','steady'];
  const lr = await send({ type:'legal' });
  const cards = lr.legal.filter(x => x.type === 'perk');
  let pick = null;
  for (const id of pref){ pick = cards.find(c => c.args?.id === id); if (pick) break; }
  if (!pick) pick = cards[0];
  const r = await send({ type:'perk', ...pick.args }); log.push(...r.events); st = r.state;
}

let guard = 0;
while (!st.over && guard++ < 2000){
  if (st.phase === 'perk'){ await playPerk(); continue; }
  if (st.phase === 'segment'){
    const d = (pb.segments || [])[st.segIndex];
    if (!d) pause(`segment ${st.segIndex + 1} needs a directive`);
    await playSpinPhase(d); continue;
  }
  if (st.phase === 'knot'){
    if (!pb.knot) pause('the KNOT needs a directive');
    await playSpinPhase(pb.knot); continue;
  }
  if (st.phase === 'stitch'){ const r = await send({ type:'stitch' }); log.push(...r.events); st = r.state; continue; }
  break;
}
pause(st.over ? 'RUN COMPLETE' : 'guard tripped');
