// =============================================================================
// GENERATOR TEST  (Phase B — cost-aware tempo pricing + the snap-band controller)
// -----------------------------------------------------------------------------
// Verifies the Phase-B MECHANISM (not its tuning, which the agent bench re-derives):
//   1. pReach's new `rolls` param is byte-identical at the default (3) and MONOTONIC
//      (more rolls ⇒ ≥ reach) — the basis of tempo pricing.
//   2. generateSegment flags-off is deterministic + unchanged (DECAY path).
//   3. the snap-band controller (flag-on) keeps the 3-distinct-colour invariant and
//      targets P(snap) directly (no segIndex decay) — the fix for the unbounded-run bug.
// A pure unit test (not the retired sim bench).
// =============================================================================
import { BALANCE } from '../balance.js';
const { makeRng } = await import('../engine.js');
const { pReach, pReachHuman, generateSegment, resetShapeMemory } = await import('../generator.js');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  FAIL:', name); } };

const F = (symbol, mag = 1) => ({ symbol, mag, state: 'live' });
const HAND = { dice: [
  ['body','body','mind'], ['body','spirit','fang'], ['mind','spirit','mana'],
  ['mind','mind','spirit'], ['charm','charm','body'], ['fang','mind','charm'],
].map(syms => ({ faces: syms.map(s => F(s)) })) };

const rungMid  = { req: { body: 2 } };            // a reachable floor rung
const rungHard = { req: { body: 3, mind: 1 } };   // a harder rung

// ---- 1. tempo probe: byte-identical default + monotonic in rolls ----
check('pReach default === rolls:3', pReach(HAND, rungMid, 'none', 600) === pReach(HAND, rungMid, 'none', 600, 3));
check('pReachHuman default === rolls:3', pReachHuman(HAND, rungHard, 'none', 600) === pReachHuman(HAND, rungHard, 'none', 600, undefined, 3));
const p2 = pReach(HAND, rungHard, 'none', 800, 2);
const p3 = pReach(HAND, rungHard, 'none', 800, 3);
const p4 = pReach(HAND, rungHard, 'none', 800, 4);
check('more rolls ⇒ ≥ reach (monotonic tempo)', p2 <= p3 + 1e-9 && p3 <= p4 + 1e-9);
check('4 rolls strictly easier than 2 for a hard rung', p4 > p2);
// fractional rolls sit between whole steps
const p35 = pReach(HAND, rungHard, 'none', 2000, 3.5);
check('fractional rolls (3.5) between 3 and 4', p35 >= p3 - 0.03 && p35 <= p4 + 0.03);

// ---- 2. generateSegment flags-off: deterministic + invariant ----
const genOff = () => { resetShapeMemory(); return generateSegment(HAND, {}, { rng: makeRng(77), segIndex: 5 }); };
const a = genOff(), b = genOff();
check('flags-off generateSegment is deterministic', JSON.stringify(a.rungs.map(r => r.req)) === JSON.stringify(b.rungs.map(r => r.req)));
check('flags-off: 3 distinct colours', new Set(a.rungs.map(r => r.colour)).size === 3);

// ---- 3. snap-band controller (flag-on): invariant holds, no segIndex decay ----
BALANCE.costAwareGenerator.enabled = true;
BALANCE.costAwareGenerator.snapBandController = true;
BALANCE.costAwareGenerator.readsTempoPower = true;
try {
  resetShapeMemory();
  const early = generateSegment(HAND, {}, { rng: makeRng(77), segIndex: 0 });
  resetShapeMemory();
  const late  = generateSegment(HAND, {}, { rng: makeRng(77), segIndex: 30 });
  check('snap-band: 3 distinct colours', new Set(early.rungs.map(r => r.colour)).size === 3);
  // no segIndex decay — the snap-band TARGET is the SAME early vs deep (unlike DECAY): this IS the
  // unbounded-run-bug fix. §G2 update: assert on the TARGET (what the controller guarantees), not the
  // emitted req — the latter also swings on the late-candidate MENU (segIndex ≥ DECAY.lateGate, an
  // orthogonal feature) which the native joint probe now re-prices, so req can legitimately differ.
  check('snap-band: no segIndex decay (early === late targets)',
    JSON.stringify(early.target) === JSON.stringify(late.target));
  // tempo pricing: banked spins make a given target HARDER to hold → the fitter reaches
  // for a harder rung set (or equal when the cand pool caps out). Assert it runs + stays valid.
  resetShapeMemory();
  const tempo = generateSegment(HAND, {}, { rng: makeRng(77), segIndex: 0, tempo: { bonusSpins: 3 } });
  check('tempo-priced segment still 3 distinct colours', new Set(tempo.rungs.map(r => r.colour)).size === 3);
} finally {
  BALANCE.costAwareGenerator.enabled = false;
  BALANCE.costAwareGenerator.snapBandController = false;
  BALANCE.costAwareGenerator.readsTempoPower = false;
}

console.log(`\ngenerator (Phase B): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
