// =============================================================================
// PERF PROBE — the probe-cost dial (Generator v2 §4 dial 8): ms/segment + evals/seg.
// -----------------------------------------------------------------------------
// The ONLY part of the acceptance instrument that imports the engine directly, and
// only for TIMING — it calls the pure generateSegment over a fixed battery of hands
// × patron contexts under a config's §C0 overrides and reports the mean wall-clock
// ms + the (deterministic) evaluateRungSet-call count per segment. Timing is a
// measurement, never fed into state or rng, so determinism is untouched (the number
// itself varies by machine — it is a perf guard, not a Run-Record field).
//
// The battery spans the hands the band actually prices differently: a fresh spread
// hand, a deep single-colour build (rich ceiling), a debt-diluted weak hand (weakness
// repricing), and a deepened hand (concentrated/pure shapes) — across early→late
// patrons and easy/boss positions. It is a PROXY for real per-segment cost, sized to
// answer "≤ ~70ms (the G2/G3 envelope)" and to catch a trials/fitBudget blow-up.
// =============================================================================
import { performance } from 'perf_hooks';
import { generateSegment, resetShapeMemory } from '../engine/generator.js';
import { makeRng } from '../engine/engine.js';
import { setBalanceOverrides, clearBalanceOverrides } from '../engine/balance.js';

const F = (s, mag = 1) => ({ symbol: s, mag, state: 'live' });
const mkHand = rows => ({ dice: rows.map(faces => ({ faces })) });

// the battery — four hands the fitter prices along different axes.
const HANDS = {
  fresh: mkHand([
    [F('body'), F('body'), F('mind')], [F('body'), F('spirit'), F('charm')], [F('mind'), F('spirit'), F('mana')],
    [F('mind'), F('mind'), F('spirit')], [F('charm'), F('body'), F('spirit')], [F('spirit'), F('mind'), F('body')],
  ]),
  strong: mkHand([
    [F('body'), F('body'), F('body')], [F('body'), F('body'), F('mind')], [F('body'), F('spirit'), F('body')],
    [F('mind'), F('body'), F('spirit')], [F('body'), F('charm'), F('body')], [F('spirit'), F('body'), F('body')],
  ]),
  weak: mkHand([
    [F('fang'), F('fang'), F('mind')], [F('charm'), F('fang'), F('mana')], [F('mind'), F('fang'), F('charm')],
    [F('fang'), F('mana'), F('charm')], [F('charm'), F('mana'), F('fang')], [F('fang'), F('charm'), F('mana')],
  ]),
  deep: mkHand([
    [F('body', 3), F('body', 2), F('mind')], [F('body', 2), F('body'), F('mind', 2)], [F('body'), F('spirit', 2), F('body')],
    [F('mind', 2), F('body', 2), F('spirit')], [F('body'), F('charm'), F('body', 2)], [F('spirit'), F('body', 2), F('body')],
  ]),
};
// early/mid-weighted (matches where most real segments live); one boss for the apex path. Deliberately
// NOT stacked with deep-late apex-forcing combos, so the ms read reflects a TYPICAL segment, not the
// worst case (the apex refinement is a minority of real segments).
const PATRONS = [
  { index: 0, position: 0, len: 3 }, { index: 0, position: 2, len: 3 },   // seg-1 mercy + first boss
  { index: 1, position: 1, len: 3 }, { index: 2, position: 2, len: 3 },   // mid + one late boss
];

// measureProbe(overrides, reps) — mean ms + evals per generateSegment across the battery.
export function measureProbe(overrides = {}, reps = 6){
  setBalanceOverrides(overrides || {});
  try {
    const handKeys = Object.keys(HANDS);
    const calls = [];
    // build the call list (hand × patron × prior-ema state), so timing spans the fit's branches.
    for (const hk of handKeys) for (const p of PATRONS) for (const ema of [null, 0.5]) calls.push({ hand: HANDS[hk], patron: p, priorEma: ema });

    // warm-up (JIT) — one untimed pass.
    resetShapeMemory();
    for (const c of calls) generateSegment(c.hand, {}, { rng: makeRng(1234), segIndex: c.patron.index * 3 + c.patron.position, patron: c.patron, priorEma: c.priorEma });

    let totalMs = 0, totalEvals = 0, n = 0;
    for (let rep = 0; rep < reps; rep++){
      resetShapeMemory();
      for (let i = 0; i < calls.length; i++){
        const c = calls[i];
        const opts = { rng: makeRng((7919 * rep + i + 3) >>> 0), segIndex: c.patron.index * 3 + c.patron.position, patron: c.patron, priorEma: c.priorEma };
        const t0 = performance.now();
        const seg = generateSegment(c.hand, {}, opts);
        totalMs += performance.now() - t0;
        totalEvals += (seg.generator && seg.generator.evals) || 0;
        n++;
      }
    }
    return { msPerSeg: totalMs / n, evalsPerSeg: totalEvals / n, samples: n };
  } finally {
    clearBalanceOverrides();
  }
}

// CLI: node perf_probe.mjs [--balance k=v,...]
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('perf_probe.mjs')){
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--balance');
  const overrides = {};
  if (i >= 0 && argv[i + 1]) for (const kv of argv[i + 1].split(',')){ const eq = kv.indexOf('='); if (eq > 0){ const v = kv.slice(eq + 1); overrides[kv.slice(0, eq)] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : (v === 'true' ? true : v === 'false' ? false : v); } }
  const r = measureProbe(overrides, 8);
  console.log(`probe cost: ${r.msPerSeg.toFixed(2)} ms/segment · ${r.evalsPerSeg.toFixed(1)} evals/segment (${r.samples} samples)`);
}
