// transformer_test.mjs — the transformer-boon enchantment resolver. The reroll/lock resolver
// is covered elsewhere; this proves agent_cli fires the DEEPEN transformer at on_resolve and
// grows the hand face PERMANENTLY (the AP#2-clean reach: the deepened face is priced by the
// probe next segment). Drives real Miser play (which completes floors → resolves fire).
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

async function playRun(client, knobs, seed){
  let r = await client.send({ type: 'new_run', seed, witnesses: knobs.witnesses });
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
        const legalKeeps = (st.tray || []).filter(t => !t.kept && !t.locked && t.symbol !== 'blank').map(t => t.i);
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
  return { events, st };
}
const die0max = st => Math.max(1, ...(st.hand ? st.hand[0].faces.map(f => f.mag) : [1]));
const SEEDS = [1000, 8919, 24757, 32676, 48514, 64352];

// --enchant deepen:self on die 0: at each resolve, die 0's shown face grinds +1 pip (permanent,
// capped at DEEPEN_MAX). Over a run, die 0 ends deeper than it started, and grind events fire.
// `--disable deepen` trims the LADDER Deepen boon (v2 cut the clean worth cards the Miser used to
// prefer, so it now drafts the ladder Deepen and grows dice on its own) — isolating THIS test to
// the injected --enchant transformer. The trim never touches the enchant (id debug_deepen_self).
const deepenC = makeClient(['--enchant', 'deepen:self:1', '--disable', 'deepen']);
const plainC = makeClient(['--disable', 'deepen']);
await Promise.all([deepenC.hello, plainC.hello]);

let grinds = 0, deepened = 0, maxMag = 1;
for (const s of SEEDS){
  const { events, st } = await playRun(deepenC, ARCHETYPES.miser, s);
  grinds += events.filter(e => /grinds .* deeper/.test(e)).length;
  const m = die0max(st); maxMag = Math.max(maxMag, m);
  if (m > 1) deepened++;
}
ok(grinds > 0, `deepen fires at on_resolve (grinds=${grinds})`);
ok(maxMag === 2, `die 0 deepens to DEEPEN_MAX=2, never past (maxMag=${maxMag})`);
ok(deepened > 0, `die 0 ends deeper than it started on ≥1 seed (deepened=${deepened}/${SEEDS.length})`);

// NEUTRALITY: with no --enchant, no face grows and no grind event fires.
let plainGrinds = 0, plainMax = 1;
for (const s of SEEDS){ const { events, st } = await playRun(plainC, ARCHETYPES.miser, s); plainGrinds += events.filter(e => /grinds/.test(e)).length; plainMax = Math.max(plainMax, die0max(st)); }
ok(plainGrinds === 0 && plainMax === 1, `neutral without the enchant (grinds=${plainGrinds}, die0max=${plainMax})`);

// DETERMINISM: same seed replays the identical event log.
const a = await playRun(deepenC, ARCHETYPES.miser, 1000);
const b = await playRun(deepenC, ARCHETYPES.miser, 1000);
ok(JSON.stringify(a.events) === JSON.stringify(b.events), 'deepen run replays byte-identically');

deepenC.close(); plainC.close();
console.log(`\ntransformer: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
