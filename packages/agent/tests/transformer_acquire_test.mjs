// transformer_acquire_test.mjs — the ACQUISITION PATH: reach transformers reached through REAL
// play, not the --enchant/--sigil injector. A Reward-Ladder reach card (a reroll SIGIL) ETCHES a
// persistent on_roll reroll onto a face AND rides a bane (the AP#2 blemished-reach price), and the
// etched face then RAISES a tappable sigil in play. (The Whetstone — a self-grinding deepen — was
// axed as unbalanced; the reroll sigils are the live acquirable reach transformers.)
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

// play Miser, but DRAFT a reroll SIGIL whenever one is offered (else Miser's normal pick).
const SIGIL_IDS = new Set(['respin_sigil', 'flanking_sigil', 'wild_sigil', 'spinwrights_sigil']);
function pickPerk(st){
  const w = (st.perkOffer || []).find(c => SIGIL_IDS.has(c.id));
  return w ? { type: 'perk', card: w.card } : choosePerk(st, ARCHETYPES.miser);
}
async function playRun(client, seed){
  const knobs = ARCHETYPES.miser;
  let r = await client.send({ type: 'new_run', seed, witnesses: knobs.witnesses });
  const events = [...(r.events || [])]; let st = r.state, guard = 0, sawSigil = false;
  while (!st.over && guard++ < 3000){
    if (!r.ok && r.error) break;
    if (st.sigils && st.sigils.length) sawSigil = true;   // the etched sigil RAISED on a later spin
    if (st.phase === 'perk') r = await client.send(pickPerk(st));
    else if (st.phase === 'transform') r = await client.send({ type: 'transform', skip: true });
    else if (st.phase === 'stitch') r = await client.send({ type: 'stitch' });   // stitch stays; a snap ends the run
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
  return { events, sawSigil };
}

// a broad seed set so the (probabilistic) sigil offers + later raises are non-vacuous.
const SEEDS = Array.from({ length: 24 }, (_, i) => (1000 + i * 7919) >>> 0);
// §D2 isolate the pre-debt reach pool: the debt cards (shift_bane fills the reach channel's COMMON
// slot; scour/absolve enter uncommon/rare) crowd out the reroll SIGILS this acquisition test targets.
// The debt cards are their own gated family — turning them off restores the widened reach pool so the
// sigils surface in ash draws as before (this test is about SIGIL acquisition, not the debt cards).
// §D3 also pin pureRiders OFF: this test asserts the M-2 invariant "every etched reach sigil carried its
// rider" (riders >= etched). The D3 pure-ink lottery deliberately relaxes that (an uncommon/rare reach may
// ship clean), so it is isolated here — the pure-rider path has its own gate in bargains_test.
const client = makeClient(['--balance', 'debt.shift=false,debt.cleanse=false,rewardLadder.pureRiders=false']);
await client.hello;

let etched = 0, riders = 0, sigilRuns = 0;
for (const s of SEEDS){
  const { events: ev, sawSigil } = await playRun(client, s);
  etched += ev.filter(e => /Sigil: etches reroll/.test(e)).length;
  riders += ev.filter(e => /blemish settles/.test(e)).length;
  if (sawSigil) sigilRuns++;
}
ok(etched > 0, `a reroll-sigil card is draftable — etches an on_roll reroll onto a face (etched=${etched})`);
ok(sigilRuns > 0, `the etched sigil RAISES in play (state.sigils offered) (runs=${sigilRuns})`);
ok(riders > 0, `a reach card rides a bane — the AP#2 blemished-reach price (riders=${riders})`);
// every etched sigil also settled its rider (a reach card is never unpriced — M-2).
ok(riders >= etched, `every etched sigil carried its rider (riders=${riders} ≥ etched=${etched})`);

// determinism: same seed replays the identical event log.
const a = await playRun(client, 1000);
const b = await playRun(client, 1000);
ok(JSON.stringify(a) === JSON.stringify(b), 'the acquisition run replays byte-identically');

client.close();
console.log(`\ntransformer_acquire: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
