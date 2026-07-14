// transformer_choice_test.mjs — the CHOSEN-target choice protocol (the 'transform' phase):
// the first agent decision beyond keeps/perks. A chosen-scope deepen transformer fires at
// on_resolve and OFFERS a choice of which face to grind; the agent picks (or skips). Drives
// real Miser play (completes floors → resolves fire) with an --enchant deepen:chosen injection.
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { ARCHETYPES, KNOT_KNOBS, chooseTarget, chooseKeep, decideStop, choosePerk } from '../archetypes.mjs';

const CLI = fileURLToPath(new URL('../agent_cli.mjs', import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };

function makeClient(args = []){
  const p = spawn('node', [CLI, ...args]);
  let buf = ''; const q = [];
  p.stdout.on('data', d => { buf += d; let nl; while ((nl = buf.indexOf('\n')) >= 0){ const l = buf.slice(0, nl); buf = buf.slice(nl + 1); if (l.trim()) q.shift()?.(JSON.parse(l)); } });
  const hello = new Promise(res => q.push(res));
  const send = a => new Promise(res => { q.push(res); p.stdin.write(JSON.stringify(a) + '\n'); });
  return { hello, send, close: () => p.stdin.end() };
}

// play Miser to completion; `onTransform(offer) → action` decides each transform choice.
async function playRun(client, seed, onTransform){
  const knobs = ARCHETYPES.miser;
  let r = await client.send({ type: 'new_run', seed, witnesses: knobs.witnesses });
  const events = [...(r.events || [])]; let st = r.state, guard = 0, offers = 0;
  while (!st.over && guard++ < 3000){
    if (!r.ok && r.error) break;
    if (st.phase === 'perk') r = await client.send(choosePerk(st, knobs));
    else if (st.phase === 'transform'){ offers++; r = await client.send(onTransform(st.transformOffer)); }
    else if (st.phase === 'stitch') r = await client.send({ type: 'stitch' });
    else if (st.phase === 'segment' || st.phase === 'knot'){
      const active = st.phase === 'knot' ? KNOT_KNOBS : knobs;
      if ((st.spinsTaken || 0) === 0) r = await client.send({ type: 'spin' });
      else {
        const target = chooseTarget(st, active);
        const lk = (st.tray || []).filter(t => !t.kept && !t.locked && t.symbol !== 'blank').map(t => t.i);
        const keepDie = chooseKeep(st, target, active, lk);
        if (keepDie != null) r = await client.send({ type: 'keep', i: keepDie });
        else if (decideStop(st, target, active)) r = await client.send({ type: 'resolve' });
        else if ((st.rollsLeft || 0) > 0) r = await client.send({ type: 'spin' });
        else r = await client.send({ type: 'resolve' });
      }
    } else break;
    events.push(...(r.events || [])); st = r.state;
  }
  return { events, st, offers };
}
const die0max = st => Math.max(1, ...(st.hand ? st.hand[0].faces.map(f => f.mag) : [1]));
const SEEDS = [1000, 8919, 24757, 32676, 48514, 64352];

const pickC = makeClient(['--enchant', 'deepen:chosen:1']);   // fire a CHOSEN deepen (→ the choice phase)
const skipC = makeClient(['--enchant', 'deepen:chosen:1']);
const plainC = makeClient([]);
await Promise.all([pickC.hello, skipC.hello, plainC.hello]);

// PICK: at each transform offer, pick the first candidate → a DEEPEN face grinds deeper. Count only
// DEEPEN offers as the deepen invariant's denominator: a run may ALSO draft a non-deepen chosen-scope
// transformer (e.g. Carver's Sigil, effect 'convert', which recasts a colour — no "grinds deeper" event),
// whose offers must not be conflated with the injected deepen under test (off.effect keys them apart).
let offers = 0, grinds = 0, validOffers = 0, maxMag = 1;
for (const s of SEEDS){
  const { events, st, offers: o } = await playRun(pickC, s, off => {
    if (off.candidates.length){ if (off.effect === 'deepen') validOffers++; return { type: 'transform', di: off.candidates[0].i }; }
    return { type: 'transform', skip: true };
  });
  offers += o;
  grinds += events.filter(e => /grinds .* deeper/.test(e)).length;
  maxMag = Math.max(maxMag, die0max(st));
}
ok(offers > 0, `the transform choice phase is reached (offers=${offers})`);
ok(validOffers > 0 && grinds > 0, `picking a candidate grinds a face deeper (validOffers=${validOffers}, grinds=${grinds})`);
ok(grinds === validOffers, `every valid DEEPEN pick grinds exactly once (grinds=${grinds}, validOffers=${validOffers})`);

// SKIP: always decline → no face ever grinds.
let skipGrinds = 0, skipOffers = 0;
for (const s of SEEDS){ const { events, offers: o } = await playRun(skipC, s, () => ({ type: 'transform', skip: true })); skipOffers += o; skipGrinds += events.filter(e => /grinds/.test(e)).length; }
ok(skipOffers > 0 && skipGrinds === 0, `skipping every offer grinds nothing (offers=${skipOffers}, grinds=${skipGrinds})`);

// NEUTRALITY: no chosen transformer ⇒ the transform phase never appears.
let plainOffers = 0;
for (const s of SEEDS){ const { offers: o } = await playRun(plainC, s, () => ({ type: 'transform', skip: true })); plainOffers += o; }
ok(plainOffers === 0, `no transform phase without a chosen transformer (offers=${plainOffers})`);

// DETERMINISM: same seed + same choices replays identically.
const a = await playRun(pickC, 1000, off => off.candidates.length ? { type: 'transform', di: off.candidates[0].i } : { type: 'transform', skip: true });
const b = await playRun(pickC, 1000, off => off.candidates.length ? { type: 'transform', di: off.candidates[0].i } : { type: 'transform', skip: true });
ok(JSON.stringify(a.events) === JSON.stringify(b.events), 'the choice run replays byte-identically');

pickC.close(); skipC.close(); plainC.close();
console.log(`\ntransformer_choice: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
