// =============================================================================
// GENERATOR v2 — G3 BAND TEST  (the intent model: band × asymmetric lag × the
// power→ceiling SET fit, wired into the generator + the session)
// -----------------------------------------------------------------------------
//   BAND MATH  — pSnapTarget composition across patrons/positions incl. clamps;
//                the BOSS position gets stage[last]; a patronLen ≠ stage.length
//                interpolates monotonically easy→boss.
//   FIT        — realized pNone lands within fitTol of target (the fit's own
//                guarantee, statistically); the knapsack's EV ≥ the naive per-tier
//                (band-off) fit's EV; the fit budget is respected; the no-fit
//                fallback sets a marker and never crashes (3 distinct colours hold).
//   LAG        — graft ⇒ pricedPower < power_now (window true) for ~2 segments and
//                the offered richness stays at the OLD level; erode ⇒ pricedPower
//                tracks down INSTANTLY (no window).
//   HONESTY    — the displayed reach estimates + pSnapPredicted read the ACTUAL
//                hand (power_now), never the lagged pricedPower (G2 contract holds).
//   NEUTRALITY — band-off, generateSegment IGNORES the band opts (patron/priorEma)
//                and attaches no band telemetry (the byte-identity-vs-G2-HEAD proof
//                is the worktree demo-stream diff, reported separately).
//   SESSION    — s.generator gains { pSnapTarget, pricedPower, window } band-on,
//                absent band-off; determinism throughout.
// =============================================================================
import { BALANCE, num } from '../../engine/balance.js';
import { makeRng } from '../../engine/engine.js';
import {
  generateSegment, resetShapeMemory, pSnapTarget, stageMultiplier, BAND_DEFAULT,
} from '../../engine/generator.js';
import { evaluateRungSet, handPower } from '../../engine/probe.js';
import { newRun, serializeState } from '../session.mjs';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  FAIL:', name); } };
const approx = (a, b, tol) => Math.abs(a - b) <= tol;

const F = (s) => ({ symbol: s, mag: 1, state: 'live' });
const mkHand = rows => ({ dice: rows.map(syms => ({ faces: syms.map(F) })) });
const HAND = mkHand([
  ['body', 'body', 'mind'], ['body', 'spirit', 'charm'], ['mind', 'spirit', 'mana'],
  ['mind', 'mind', 'spirit'], ['charm', 'body', 'spirit'], ['spirit', 'mind', 'body'],
]);
// a WEAK hand (fangs/blanks dilute every colour) and a STRONG one (a deep body build)
const WEAK   = mkHand([['fang','fang','mind'], ['charm','fang','mana'], ['mind','fang','charm'],
                       ['fang','mana','charm'], ['charm','mana','fang'], ['fang','charm','mana']]);
const STRONG = mkHand([['body','body','body'], ['body','body','mind'], ['body','spirit','body'],
                       ['mind','body','spirit'], ['body','charm','body'], ['spirit','body','body']]);

// the ctx generateSegment builds for a CLEAN (no warp/twist) call — for honesty cross-checks
const cleanCtx = () => ({ warps: [], twist: null, tempo: { bonusSpins: 0, offeredRerolls: 0 },
  takeRates: num('generator2.takeRates', { sigil: 0.6, expose: 0.4, release: 0.3, echo: 0.5 }) });

// §G4 — this file gates the G3 BAND mechanism in ISOLATION, so it disables the G4 composer
// (rungs/apexRungs) throughout: with them off the band produces the pure 3-rung set it did pre-G4
// (byte-identical), and the dynamic-rung behaviour is gated by its own g4_rungsets_test.mjs.
const setBand = on => { BALANCE.generator2.enabled = on; BALANCE.generator2.jointProbe = on; BALANCE.generator2.band = on; BALANCE.generator2.rungs = false; BALANCE.generator2.apexRungs = false; };
const trials = num('generator2.trials', 240);
// a rung-set's ceiling richness (true+bloom demand) — the lag observable (mirrors generator.setRichness)
const demand = r => { let d = 0; for (const k of Object.keys(r.req)) d += r.req[k]; return d + (r.concentrated ? 1 : 0) + (r.pure ? 2 : 0) + (r.req.mana ? 0.5 : 0); };
const ceilingRichness = seg => demand(seg.rungs[1]) + demand(seg.rungs[2]);

const bandCfg = num('generator2.band', BAND_DEFAULT);
const genBand = (hand, patron, priorEma, seed = 77, segIndex = 0) => {
  resetShapeMemory();
  return generateSegment(hand, {}, { rng: makeRng(seed), segIndex, patron, priorEma });
};

// ============================================================================
// 1. BAND MATH — composition, clamps, boss position, patronLen interpolation
// ============================================================================
{
  const b = BAND_DEFAULT;
  check('band: patron0 pos0 = base0×stage[0]', approx(pSnapTarget(0, 0, 3, b), 0.10 * 0.6, 1e-9));
  check('band: patron0 pos1 = base0×stage[1]', approx(pSnapTarget(0, 1, 3, b), 0.10 * 1.0, 1e-9));
  check('band: patron0 pos2 (boss) = base0×stage[2]', approx(pSnapTarget(0, 2, 3, b), 0.10 * 1.5, 1e-9));
  check('band: ramp raises base (patron3 pos1)', approx(pSnapTarget(3, 1, 3, b), (0.10 + 0.03 * 3) * 1.0, 1e-9));
  check('band: CEIL clamp (patron20 boss)', approx(pSnapTarget(20, 2, 3, b), b.ceil, 1e-9));
  check('band: FLOOR clamp (tiny band)', approx(pSnapTarget(0, 0, 3, { ...b, base0: 0.02 }), b.floor, 1e-9));

  // BOSS always gets stage[last] regardless of patronLen
  const last = b.stage[b.stage.length - 1];
  check('band: boss@len3 = stage[last]',  approx(stageMultiplier(2, 3, b.stage), last, 1e-9));
  check('band: boss@len5 = stage[last]',  approx(stageMultiplier(4, 5, b.stage), last, 1e-9));
  check('band: first@len5 = stage[0]',    approx(stageMultiplier(0, 5, b.stage), b.stage[0], 1e-9));
  check('band: len1 IS its own boss',     approx(stageMultiplier(0, 1, b.stage), last, 1e-9));

  // a patronLen ≠ stage.length interpolates MONOTONICALLY easy→boss, endpoints exact
  const len4 = [0, 1, 2, 3].map(p => stageMultiplier(p, 4, b.stage));
  check('band: len4 pos0 = stage[0]',     approx(len4[0], b.stage[0], 1e-9));
  check('band: len4 pos3 (boss) = stage[last]', approx(len4[3], last, 1e-9));
  check('band: len4 monotone increasing', len4.every((v, i) => i === 0 || v > len4[i - 1]));
  // out-of-range position clamps (defensive)
  check('band: position clamps into range', approx(stageMultiplier(9, 3, b.stage), last, 1e-9));
}

// ============================================================================
// 2. FIT — within-tol, knapsack EV ≥ naive, budget respected, no-fit fallback
// ============================================================================
{
  setBand(true);
  try {
    const tol = bandCfg.fitTol, budget = num('generator2.fitBudget', 24);
    let banded = 0, within = 0, evalOK = true, total = 0;
    let evWins = 0, evTies = 0, evComparisons = 0;
    for (let s = 0; s < 24; s++){
      const patron = { index: s % 4, position: s % 3, len: 3 };
      const seg = genBand(HAND, patron, null, 1000 + s * 7919, patron.index * 3 + patron.position);
      const g = seg.generator; total++;
      if (g.evals > budget) evalOK = false;
      check(`fit: 3 distinct colours (seed ${s})`, new Set(seg.rungs.map(r => r.colour)).size === 3);
      if (g.fit === 'band'){
        banded++;
        // the fit's OWN guarantee: a 'band' marker means pNone landed within fitTol of target
        if (approx(g.pSnapPredicted, g.pSnapTarget, tol + 0.005)) within++;
        // knapsack ≥ naive: the band set's EV vs the band-OFF per-tier fit's EV on the SAME hand
        setBand(false);
        const naive = genBand(HAND, patron, null, 1000 + s * 7919, patron.index * 3 + patron.position);
        setBand(true);
        const ctx = cleanCtx();
        const evBand  = evaluateRungSet(HAND, seg.rungs,   ctx, { trials }).ev;
        const evNaive = evaluateRungSet(HAND, naive.rungs, ctx, { trials }).ev;
        evComparisons++;
        if (evBand >= evNaive - 0.15) evWins++;   // ≥ within a small statistical slack
        if (evBand > evNaive + 0.15) evTies++;     // strict wins (the knapsack actually improved)
      }
    }
    check('fit: budget respected (evals ≤ fitBudget every segment)', evalOK);
    // a healthy majority fit; the misses are high-target patrons where the fresh spread hand clears even
    // the hardest 3-rung set (the floor menu caps at c3) — the documented G3-without-apex tension ceiling.
    check('fit: majority achieve a within-band fit (≥ 65%)', banded / total >= 0.65);
    check('fit: banded segments land pNone within fitTol', banded > 0 && within === banded);
    check('fit: knapsack EV ≥ naive per-tier EV (≥ 90% of comparisons)', evComparisons > 0 && evWins / evComparisons >= 0.9);
    check('fit: knapsack STRICTLY beats naive on a real share (≥ 25%)', evTies / Math.max(1, evComparisons) >= 0.25);

    // NO-FIT FALLBACK — a debt-riddled WEAK hand at the LOWEST target (patron0 pos0, ~6% snap) cannot be
    // made safe enough: even the easiest set OVERSHOOTS the band ⇒ a graceful clamp to nofit-hard + a
    // marker, no crash, 3 distinct colours hold, budget respected.
    const nofit = genBand(WEAK, { index: 0, position: 0, len: 3 }, null, 77, 0);
    check('fit: no-fit clamps to a marker (not "band"), never crashes', nofit.generator.fit !== 'band');
    check('fit: no-fit on a too-weak hand is nofit-HARD (overshoots the easy band)', nofit.generator.fit === 'nofit-hard');
    check('fit: no-fit still emits 3 valid distinct-colour rungs', new Set(nofit.rungs.map(r => r.colour)).size === 3);
    check('fit: no-fit still within budget', nofit.generator.evals <= budget);
  } finally { setBand(false); }
}

// ============================================================================
// 3. LAG ASYMMETRY — graft opens a window (~2 segments), erode does NOT
// ============================================================================
{
  setBand(true);
  try {
    const patron = { index: 1, position: 1, len: 3 };
    // converge the EMA on the WEAK hand first (its equilibrium priced power)
    const wSeg = genBand(WEAK, patron, null);
    const weakEma = wSeg.generator.powerEma;

    // GRAFT: jump from WEAK's world to the STRONG hand — the world lags for a segment or two
    const g1 = genBand(STRONG, patron, weakEma);
    const g2 = genBand(STRONG, patron, g1.generator.powerEma);
    // the CONVERGED strong offering (ema already at STRONG's power) — the "deserved" richness
    const strongConv = genBand(STRONG, patron, g1.generator.power);   // seed the ema high

    check('lag(graft): power_now jumps above the weak ema', g1.generator.power > weakEma + 0.02);
    check('lag(graft): seg1 window OPEN (pricedPower < power_now)', g1.generator.window === true && g1.generator.pricedPower < g1.generator.power);
    check('lag(graft): seg2 window STILL open (~2-segment god-window)', g2.generator.window === true && g2.generator.pricedPower < g2.generator.power);
    check('lag(graft): pricedPower CLIMBS toward power across the window', g2.generator.pricedPower > g1.generator.pricedPower);
    check('lag(graft): offered richness LAGS the converged strong offer', ceilingRichness(g1) <= ceilingRichness(strongConv));

    // ERODE: jump from STRONG's world (high ema) to the WEAK hand — priced DOWN instantly
    const strongEma = strongConv.generator.powerEma;   // a high, converged-strong ema
    const e1 = genBand(WEAK, patron, strongEma);
    check('lag(erode): power_now drops below the strong ema', e1.generator.power < strongEma - 0.02);
    check('lag(erode): NO window (pricedPower == power_now, priced down instantly)',
      e1.generator.window === false && approx(e1.generator.pricedPower, e1.generator.power, 1e-9));
  } finally { setBand(false); }
}

// ============================================================================
// 4. HONESTY — displayed reach + pSnapPredicted read the ACTUAL hand, not the lag
// ============================================================================
{
  setBand(true);
  try {
    const patron = { index: 1, position: 1, len: 3 };
    // a windowed segment (STRONG hand, lagged low ema): the DISPLAY must not inherit pricedPower
    const wSeg = genBand(WEAK, patron, null);
    const seg = genBand(STRONG, patron, wSeg.generator.powerEma);
    check('honesty: window is genuinely open for this segment', seg.generator.window === true);
    // telemetry power === the honest handPower of the ACTUAL hand (not pricedPower)
    const honestPower = handPower(STRONG, cleanCtx(), { trials });
    check('honesty: telemetry power === honest handPower(actual hand)', approx(seg.generator.power, +honestPower.toFixed(4), 0.0001));
    check('honesty: power > pricedPower (so power did NOT inherit the lag)', seg.generator.power > seg.generator.pricedPower);
    // pSnapPredicted + reach estimates === re-evaluating the EMITTED rungs on the ACTUAL hand
    const re = evaluateRungSet(STRONG, seg.rungs, cleanCtx(), { trials });
    check('honesty: pSnapPredicted === actual-hand pNone of the emitted set', approx(seg.generator.pSnapPredicted, re.pNone, 0.03));
    check('honesty: reach_estimates (_p) === actual-hand per-rung reach', seg.rungs.every((r, i) => approx(r._p, re.reach[i], 0.06)));
  } finally { setBand(false); }
}

// ============================================================================
// 5. NEUTRALITY — band-off ignores band opts + attaches no band telemetry
// ============================================================================
{
  setBand(false);   // joint + band all OFF (legacy DECAY path)
  const rungsJSON = seg => JSON.stringify(seg.rungs.map(r => ({ req: r.req, p: r._p })));
  resetShapeMemory(); const a = generateSegment(HAND, {}, { rng: makeRng(77), segIndex: 0, patron: { index: 2, position: 1, len: 3 }, priorEma: 0.5 });
  resetShapeMemory(); const b = generateSegment(HAND, {}, { rng: makeRng(77), segIndex: 0 });   // no band opts at all
  check('neutrality: band-off IGNORES patron/priorEma (byte-identical rungs)', rungsJSON(a) === rungsJSON(b));
  check('neutrality: band-off attaches no band telemetry', a.generator === undefined && b.generator === undefined);

  // joint ON but band OFF: G2 telemetry present, band fields ABSENT
  BALANCE.generator2.enabled = true; BALANCE.generator2.jointProbe = true; BALANCE.generator2.band = false;
  try {
    resetShapeMemory();
    const j = generateSegment(HAND, {}, { rng: makeRng(77), segIndex: 0, patron: { index: 2, position: 1, len: 3 }, priorEma: 0.5 });
    check('neutrality: joint-on/band-off keeps G2 telemetry', j.generator && typeof j.generator.power === 'number');
    check('neutrality: joint-on/band-off has NO band fields', j.generator.pSnapTarget === undefined && j.generator.pricedPower === undefined && j.generator.window === undefined);
  } finally { setBand(false); }
}

// ============================================================================
// 6. DETERMINISM — same seed + inputs ⇒ same rungs + same telemetry
// ============================================================================
{
  setBand(true);
  try {
    const patron = { index: 2, position: 2, len: 3 };
    const x = genBand(HAND, patron, 0.4, 20260709, 8);
    const y = genBand(HAND, patron, 0.4, 20260709, 8);
    check('determinism: identical rungs', JSON.stringify(x.rungs) === JSON.stringify(y.rungs));
    check('determinism: identical telemetry (incl powerEma/pricedPower/window)', JSON.stringify(x.generator) === JSON.stringify(y.generator));
  } finally { setBand(false); }
}

// ============================================================================
// 7. SESSION — s.generator carries the band block band-on, absent band-off
// ============================================================================
{
  setBand(true);
  try {
    newRun(4242, {});
    const s = serializeState();
    check('session band-on: s.generator has band block', s.generator
      && typeof s.generator.pSnapTarget === 'number'
      && typeof s.generator.pricedPower === 'number'
      && typeof s.generator.window === 'boolean');
    check('session band-on: pSnapTarget matches patron seg1 (patron0 pos0)', approx(s.generator.pSnapTarget, pSnapTarget(0, 0, 3, bandCfg), 1e-6));
    check('session band-on: reach_estimates still present + honest', s.rungs.every(r => typeof r.reach_estimate === 'number'));
  } finally { setBand(false); }

  setBand(false);
  BALANCE.generator2.enabled = true; BALANCE.generator2.jointProbe = true; BALANCE.generator2.band = false;
  try {
    newRun(4242, {});
    const s = serializeState();
    check('session band-off: G2 telemetry present, band fields absent',
      s.generator && s.generator.pSnapTarget === undefined && s.generator.window === undefined);
  } finally { setBand(false); }
}

console.log(`\ngenerator v2 (G3 band): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
