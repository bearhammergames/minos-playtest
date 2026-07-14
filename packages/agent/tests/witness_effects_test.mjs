// witness_effects_test.mjs — the reach economy's effect-application channel. The witness
// SCORER (witness.js) is covered by witness_test.mjs; this proves agent_cli APPLIES the
// tempo payload (knotted_rope: on_stitch → a priced +1 spin), the one effect the cost-aware
// generator can price today. Drives real Tempoist play (which stitch-saves) via the protocol.
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { ARCHETYPES, KNOT_KNOBS, chooseTarget, chooseKeep, decideStop, choosePerk } from '../archetypes.mjs';

const CLI = fileURLToPath(new URL('../agent_cli.mjs', import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };

function makeClient(){
  const p = spawn('node', [CLI]);
  let buf = ''; const q = [];
  p.stdout.on('data', d => { buf += d; let nl; while ((nl = buf.indexOf('\n')) >= 0){ const l = buf.slice(0, nl); buf = buf.slice(nl + 1); if (l.trim()) q.shift()?.(JSON.parse(l)); } });
  const hello = new Promise(res => q.push(res));
  const send = a => new Promise(res => { q.push(res); p.stdin.write(JSON.stringify(a) + '\n'); });
  return { hello, send, close: () => p.stdin.end() };
}

// play a build to completion, return the full event log (same policy as archetype_driver).
async function playRun(client, knobs, seed){
  // §G3 — pin the snap-band OFF: this test isolates WITNESS tempo/effects, and the native band both slows
  // full runs (per-segment SET-fit cost) and lengthens them (drafting/firing a tempo witness the short
  // DECAY-era runs never reached). The band is covered by generator_v2_band_test + the bench.
  let r = await client.send({ type: 'new_run', seed, witnesses: knobs.witnesses, balance: { 'generator2.band': false } });
  const events = [...(r.events || [])];
  let st = r.state, guard = 0;
  while (!st.over && guard++ < 3000){
    if (!r.ok && r.error) break;
    if (st.phase === 'perk') r = await client.send(choosePerk(st, knobs));
    else if (st.phase === 'stitch') r = await client.send({ type: knobs.stitch || 'stitch' });
    else if (st.phase === 'segment' || st.phase === 'knot'){
      const active = st.phase === 'knot' ? KNOT_KNOBS : knobs;
      if ((st.spinsTaken || 0) === 0) r = await client.send({ type: 'spin' });
      else {
        const target = chooseTarget(st, active);
        let legalKeeps;
        if (st.curses && st.curses.keepCap){ const lr = await client.send({ type: 'legal' }); legalKeeps = lr.legal.filter(x => x.type === 'keep').map(x => x.args.i); }
        else legalKeeps = (st.tray || []).filter(t => !t.kept && !t.locked && t.symbol !== 'blank').map(t => t.i);
        const keepDie = chooseKeep(st, target, active, legalKeeps);
        if (keepDie != null) r = await client.send({ type: 'keep', i: keepDie });
        else if (decideStop(st, target, active)) r = await client.send({ type: 'resolve' });
        else if ((st.rollsLeft || 0) > 0) r = await client.send({ type: 'spin' });
        else r = await client.send({ type: 'resolve' });
      }
    } else break;
    events.push(...(r.events || []));
    st = r.state;
  }
  return events;
}

const SEEDS = [1000, 8919, 16838, 24757, 32676, 40595, 48514, 56433, 64352, 72271];
const client = makeClient();
await client.hello;

// knotted_rope (tempo, on_stitch): a STITCH SAVE grants exactly one priced tempo spin.
let saves = 0, tempos = 0;
for (const s of SEEDS){
  const ev = await playRun(client, ARCHETYPES.tempoist, s);
  saves  += ev.filter(e => /STITCH SAVE/.test(e)).length;
  tempos += ev.filter(e => /witness tempo/.test(e)).length;
}
ok(tempos > 0, `witness tempo fires for a tempo loadout (tempos=${tempos}, saves=${saves})`);
ok(tempos === saves, `witness tempo fires exactly once per stitch save (tempos=${tempos}, saves=${saves})`);

// a loadout with NO tempo payload (Miser: patient_needle/miser_eye/…) grants no tempo.
let miserTempos = 0;
for (const s of SEEDS){ const ev = await playRun(client, ARCHETYPES.miser, s); miserTempos += ev.filter(e => /witness tempo/.test(e)).length; }
ok(miserTempos === 0, `a non-tempo loadout grants no tempo (miserTempos=${miserTempos})`);

// determinism: same build + seed replays the identical event log.
const a = await playRun(client, ARCHETYPES.tempoist, 1000);
const b = await playRun(client, ARCHETYPES.tempoist, 1000);
ok(JSON.stringify(a) === JSON.stringify(b), 'tempoist run replays byte-identically');

client.close();
console.log(`\nwitness_effects: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
