// =============================================================================
// WITNESS BUGFIX TEST  (modifier-v2 playtest fixes — seeds 20260709 / 52)
// -----------------------------------------------------------------------------
// Covers the two bugs + the legibility surfaces found in playtest and fixed on
// this branch. Drives the REAL session core (session.mjs) + unit-tests the pure
// generateWitness fallback. Not a KNOWN_FAIL — a regression gate.
//   1. generateWitness exclusion fallback ORDER: target-rarity → widen rarity →
//      (only if all worn) full pool. A worn witness is NEVER re-offered while a
//      non-worn one remains; the empty-exclude stream is untouched.
//   2. session draft FIZZLE guard: a worn witness that slips through (the exhausted
//      full-pool corner) is never inked/stacked — it fizzles.
//   3. s.chainRun serialization (present on, absent off — OFF-path byte-neutrality).
//   4. Bug 2 — a CORRUPT bead (load-bearing fang) resets the chain-milestone streak.
//   5. Legibility — ladder rider carries a `desc` (what the bane DOES).
// =============================================================================
import { newRun, act, serializeState, legalActions, configure } from '../session.mjs';
import { BALANCE, setDisabledContent } from '../../engine/balance.js';
import { generateWitness, WITNESSES } from '../../content/witnesses.js';
import { drawLadder } from '../../engine/reward_ladder.js';
import { makeRng } from '../../engine/engine.js';

// §G3 — pin the generator's snap-band OFF for this witness-feature test. It drives many full runs to
// exercise the ladder/witness/chain-milestone logic; the band (native-on) makes runs longer AND pays the
// SET-fit probe cost per segment, which both slows these runs past the runner timeout and shifts their
// trajectory (drafting/firing witnesses the short DECAY-era runs never reached). Isolating on the stable
// legacy generator keeps this test about WITNESSES, not the difficulty model (the band is covered by
// generator_v2_band_test + the bench). configure() DEFAULTS flow to every newRun below (no per-call balance).
configure({ balance: { 'generator2.band': false } });
BALANCE.witnesses.enabled = true;
BALANCE.rewardLadder.enabled = true;
BALANCE.rewardLadder.mixedDraw = true;
BALANCE.rewardLadder.blemishRiders = true;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };
const state = () => serializeState();

const ALL_IDS  = Object.values(WITNESSES).map(w => w.id);
const COMMONS  = Object.values(WITNESSES).filter(w => w.rarity === 'common').map(w => w.id);

// ================================ 1 — generateWitness fallback ORDER (unit) ================================
{
  // (a) a NON-exhausting exclude stays in the target rarity — step (a) governs, no needless widen.
  const oneCommon = [COMMONS[0]];
  let stayCommon = true;
  for (let s = 1; s <= 300; s++){
    const w = generateWitness(makeRng(s), { rarity: 'common', exclude: oneCommon });
    if (w.rarity !== 'common' || oneCommon.includes(w.id)) stayCommon = false;
  }
  ok(stayCommon, '1a: a non-exhausting exclude stays in the target rarity (step a — no needless widen)');

  // (b) the EXHAUSTION case — wear EVERY common → target rarity 'common' is empty. The draw must
  //     WIDEN to another rarity and must NEVER re-offer a worn (excluded) witness.
  const wornRarity = COMMONS.slice();   // both commons worn
  let noWorn = true, widened = true;
  for (let s = 1; s <= 500; s++){
    const w = generateWitness(makeRng(s), { rarity: 'common', exclude: wornRarity });
    if (wornRarity.includes(w.id)) noWorn = false;   // NEVER re-offer a worn witness
    if (w.rarity === 'common')     widened = false;  // the exhausted rarity widened past 'common'
  }
  ok(noWorn,  '1b: an exhausted target rarity NEVER re-offers a worn witness (widen before violating exclusion)');
  ok(widened, '1b: an exhausted target rarity WIDENS to a surviving rarity');

  // (c) the never-crash floor — literally every witness excluded → the full pool, no throw.
  let crashed = false, got = null;
  try { got = generateWitness(makeRng(7), { rarity: 'common', exclude: ALL_IDS.slice() }); }
  catch { crashed = true; }
  ok(!crashed && got && got.id, '1c: every witness excluded ⇒ full-pool fallback, never crashes');
}

// ================================ 1' — INTEGRATION via drawLadder (playtest seed 20260709) ================================
{
  // Wear BOTH commons so the COMMON rarity is worn out; every other rarity keeps alternatives.
  // A floor draw (common-weighted drafts) must never re-offer the worn commons — it widens instead.
  const worn = COMMONS.slice();
  let noWorn = true, widened = false, draftsSeen = 0;
  for (let s = 1; s <= 400; s++){
    const d = drawLadder({ tier: 'floor', metTiers: ['floor'] }, makeRng(s), { wornWitnesses: worn });
    for (const c of d.cards) if (c.kind === 'draft'){
      draftsSeen++;
      if (worn.includes(c.witnessId)) noWorn = false;
      if (WITNESSES[c.witnessId] && WITNESSES[c.witnessId].rarity !== 'common') widened = true;
    }
  }
  ok(draftsSeen > 0, `1': floor draws produced draft cards (${draftsSeen})`);
  ok(noWorn,  "1': a worn-out RARITY is never re-offered through drawLadder (seed-20260709 bug)");
  ok(widened, "1': the exhausted-rarity draft widens to a surviving rarity");
}

// ---- a focused single-step driver (spin/keep toward the most reachable rung/resolve) ----
// `keepFang` = also grab a loose fang when offered (to induce load-bearing / CORRUPT beads).
function makeDriver(keepFang){
  return function stepOnce(){
    const st = state();
    if (st.over || st.phase === 'perk') return st;
    let r;
    if (st.phase === 'stitch') r = act({ type: 'stitch' });
    else if (st.phase === 'transform') r = act({ type: 'transform', skip: true });
    else if (st.phase === 'segment' || st.phase === 'knot'){
      if ((st.spinsTaken || 0) === 0) r = act({ type: 'spin' });
      else {
        const legal = legalActions();
        const target = [...st.rungs].sort((a, b) => (b.reach_estimate || 0) - (a.reach_estimate || 0))[0];
        const need = { ...(target ? target.req : {}) };
        for (const t of st.tray) if (t.kept && need[t.symbol]) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag || 1));
        let keepDie = null;
        if (keepFang){
          const fang = legal.find(x => x.type === 'keep' && (st.tray.find(tt => tt.i === x.args.i) || {}).symbol === 'fang');
          if (fang) keepDie = fang.args.i;
        }
        if (keepDie == null) for (const x of legal){
          if (x.type !== 'keep') continue;
          const t = st.tray.find(tt => tt.i === x.args.i);
          if (t && t.symbol !== 'fang' && (need[t.symbol] || 0) > 0){ keepDie = x.args.i; break; }
        }
        if (keepDie != null) r = act({ type: 'keep', i: keepDie });
        else if ((st.metNow || []).length > 0) r = act({ type: 'resolve' });
        else if ((st.rollsLeft || 0) > 0) r = act({ type: 'spin' });
        else r = act({ type: 'resolve' });
      }
    } else return st;
    return null;
  };
}
function advanceToPerk(step, max = 300){ for (let i = 0; i < max && !state().over; i++){ const st = step(); if (st) return st; } return state(); }

// ================================ 2 — session FIZZLE guard (defense-in-depth) ================================
{
  // Exhaust the ENABLED pool to the two worn commons, so generateWitness's (c) full-pool fallback
  // can re-surface a WORN witness. The session's draft branch MUST fizzle it — never ink/stack.
  setDisabledContent(ALL_IDS.filter(id => !COMMONS.includes(id)));
  const step = makeDriver(false);
  let fizzles = 0, dupSeen = false;
  for (let seed = 1; seed <= 80; seed++){
    newRun(seed, { witnesses: COMMONS.slice() });   // both enabled witnesses already worn (2/5)
    for (let seg = 0; seg < 10 && !state().over; seg++){
      const st = advanceToPerk(step);
      if (st.phase !== 'perk') break;
      const d = st.perkOffer.find(c => c.kind === 'draft');
      const pick = d || st.perkOffer[0];
      const r = act({ type: 'perk', card: pick.card });
      if (r && r.events && r.events.some(e => /the mark is already worn — the ink fades/.test(e))) fizzles++;
      const ids = (state().witnesses || []).map(w => w.id);
      if (new Set(ids).size !== ids.length) dupSeen = true;   // the invariant: never a duplicate id
    }
  }
  setDisabledContent([]);
  ok(!dupSeen,     '2: the loadout NEVER holds a duplicate witness id (no silent stacking)');
  ok(fizzles > 0,  `2: a re-offered worn witness FIZZLES ("the ink fades") — guard exercised (${fizzles}x)`);
}

// ================================ 3 — s.chainRun serialization (on/off) ================================
{
  // OFF path — the field is ABSENT (byte-neutrality: the change adds nothing when the experiment is off).
  BALANCE.experiments.chainMilestone = false;
  newRun(51, { witnesses: [] });
  ok(!('chainRun' in state()), '3: chainRun is ABSENT when the experiment is off (OFF-path byte-neutrality)');
  const stepOff = makeDriver(false);
  let sawOff = false;
  for (let seg = 0; seg < 6 && !state().over; seg++){ const st = advanceToPerk(stepOff); if (st.phase === 'perk'){ if ('chainRun' in st) sawOff = true; const d = st.perkOffer.find(c => c.kind === 'draft') || st.perkOffer[0]; act({ type: 'perk', card: d.card }); } else break; }
  ok(!sawOff, '3: chainRun stays absent across a full OFF run');

  // ON path — present, well-formed (next === 3 - run%3), and it actually COUNTS (run > 0 on a chain).
  BALANCE.experiments.chainMilestone = true;
  const stepOn = makeDriver(false);
  let shapeOk = true, maxRun = 0, present = false;
  for (const seed of [51, 20260704, 8919, 1000, 42]){
    newRun(seed, { witnesses: [] });
    const s0 = state();
    if ('chainRun' in s0){ present = true; if (s0.chainRun.next !== 3 - (s0.chainRun.run % 3)) shapeOk = false; }
    for (let seg = 0; seg < 20 && !state().over; seg++){
      const st = advanceToPerk(stepOn);
      if (st.phase !== 'perk') break;
      if ('chainRun' in st){ present = true; maxRun = Math.max(maxRun, st.chainRun.run);
        if (st.chainRun.next !== 3 - (st.chainRun.run % 3)) shapeOk = false; }
      const d = st.perkOffer.find(c => c.kind === 'draft') || st.perkOffer[0];
      act({ type: 'perk', card: d.card });
    }
  }
  ok(present, '3: chainRun is PRESENT when the experiment is on');
  ok(shapeOk, '3: chainRun.next always equals 3 - (run % 3)');
  ok(maxRun >= 1, `3: chainRun.run actually COUNTS consecutive extends (max seen ${maxRun})`);
}

// ================================ 4 — Bug 2: a CORRUPT bead resets the milestone streak ================================
{
  // A load-bearing fang stamps the bead corrupt; corrupt breaks chains everywhere else, so it must
  // reset G.chainRun too — even when the bead's colour matches the prior (chainExtends would be true).
  // Invariant: right after ANY corrupt bead commits, chainRun.run === 0. Isolate the corrupt clause
  // by also flagging corrupt beads whose colour MATCHES the prior bead (where the OLD code kept counting).
  BALANCE.experiments.chainMilestone = true;
  const step = makeDriver(true);   // keep fangs → induce corrupt beads
  let corruptSeen = 0, sameColourCorruptSeen = 0, resetHeld = true;
  for (let seed = 1; seed <= 120; seed++){
    newRun(seed, { witnesses: [] });
    let prevLen = 0, prevColour = null;
    for (let seg = 0; seg < 20 && !state().over; seg++){
      const st = advanceToPerk(step);
      if (st.phase !== 'perk') break;
      const outs = (st.thread && st.thread.outcomes) || [];
      const last = outs[outs.length - 1];
      if (last && outs.length > prevLen){                 // a bead committed since we last looked
        if (last.corrupt){
          corruptSeen++;
          const cr = ('chainRun' in st) ? st.chainRun.run : null;
          if (cr !== 0) resetHeld = false;                // must be 0 after a corrupt bead
          if (prevColour && last.colour === prevColour && !(st.thread.frayed || []).includes(last.colour)) sameColourCorruptSeen++;
        }
        prevColour = last.colour;
      }
      prevLen = outs.length;
      const d = st.perkOffer.find(c => c.kind === 'draft') || st.perkOffer[0];
      act({ type: 'perk', card: d.card });
    }
  }
  ok(corruptSeen > 0, `4: the fang-keeping driver induced corrupt beads (${corruptSeen})`);
  ok(resetHeld, '4: chainRun.run === 0 immediately after EVERY corrupt bead (the streak resets)');
  // The strong, bug-specific case: a corrupt bead on the SAME colour as the prior — the exact case
  // the old code miscounted. Assert reset held on it too (covered by resetHeld); report if observed.
  console.log(`  note: same-colour corrupt beads observed = ${sameColourCorruptSeen} (the exact Bug-2 case)`);
  ok(resetHeld || sameColourCorruptSeen === 0, '4: same-colour corrupt beads also reset the streak');
}

// ================================ 5 — Legibility 6: ladder rider carries a `desc` ================================
{
  BALANCE.rewardLadder.blemishRiders = true;
  const step = makeDriver(false);
  let riderSeen = 0, allHaveDesc = true;
  for (let seed = 1; seed <= 40 && riderSeen < 3; seed++){
    newRun(seed, { witnesses: [] });
    for (let seg = 0; seg < 12 && !state().over; seg++){
      const st = advanceToPerk(step);
      if (st.phase !== 'perk') break;
      for (const c of (st.perkOffer || [])) if (c.rider){
        riderSeen++;
        if (typeof c.rider.desc !== 'string' || !c.rider.desc.length) allHaveDesc = false;
      }
      const d = st.perkOffer.find(c => c.kind === 'draft') || st.perkOffer[0];
      act({ type: 'perk', card: d.card });
    }
  }
  ok(riderSeen > 0, `5: blemished ladder cards surfaced riders (${riderSeen})`);
  ok(allHaveDesc, '5: every rider carries a non-empty desc (what the bane DOES, not just its band)');
}

console.log(`\nwitness_bugfix: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
