// =============================================================================
// ACCEPTANCE TEST — the Generator v2 §4 dial math (acceptance.mjs), unit-tested on
// SYNTHETIC bench data (slice G5a instrument). Pure + fast: no full runs, no engine
// — it feeds hand-crafted rows + per-segment records and asserts each of the eight
// dials computes its documented value + pass/fail verdict against the §4 targets.
// This is the guard that the instrument reads its own dials correctly.
// =============================================================================
import { computeAcceptance, median, percentile, TARGETS } from '../acceptance.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };
const approx = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const dial = (acc, key) => acc.dials.find(d => d.key === key);

// ---- helpers stats ------------------------------------------------------------------
ok(median([]) === 0, 'median: empty → 0');
ok(median([5]) === 5, 'median: singleton');
ok(median([1, 2, 3]) === 2, 'median: odd');
ok(median([1, 2, 3, 4]) === 2.5, 'median: even');
ok(approx(percentile([10, 20, 30, 40, 50], 0.5), 30), 'percentile: p50 mid');
ok(approx(percentile([0, 100], 0.99), 99), 'percentile: interpolates');
ok(percentile([], 0.5) === 0, 'percentile: empty → 0');

// ---- synthetic bench data -----------------------------------------------------------
// Two archetypes. `rich` has a fat-tailed score (one screenshot run) + long runs; `lean`
// short + low. Terminal-boss flags set so boss-death share is exactly computable.
const mkRow = (name, score, segments, terminalBoss, tripped = false) => ({ name, score, segments, terminalBoss, tripped });
const rows = {
  rich: [
    mkRow('rich', 100, 8, true),  mkRow('rich', 120, 9, false),
    mkRow('rich', 4000, 14, true), mkRow('rich', 90, 7, true),
  ],
  lean: [
    mkRow('lean', 40, 5, false), mkRow('lean', 50, 6, true),
    mkRow('lean', 45, 5, false), mkRow('lean', 55, 6, true),
  ],
};

// per-segment records: seg 0 for each of the 8 runs (mark 2 of 8 as raw snaps → 25%),
// plus calibration-friendly predicted/realized pairs and fit flags by patron.
const seg = (name, segIndex, patronIndex, boss, snap, pSnapPredicted, fit) =>
  ({ name, segIndex, patronIndex, boss, snap, pSnapPredicted, fit, pSnapTarget: pSnapPredicted });
const segRecs = [
  // segIndex 0 across 8 runs: 2 snaps → die@1 raw = 25%
  seg('rich', 0, 0, false, 1, 0.20, 'nofit-hard'), seg('rich', 0, 0, false, 0, 0.10, 'band'),
  seg('rich', 0, 0, false, 0, 0.10, 'band'),        seg('rich', 0, 0, false, 0, 0.10, 'band'),
  seg('lean', 0, 0, false, 1, 0.20, 'nofit-hard'), seg('lean', 0, 0, false, 0, 0.10, 'band'),
  seg('lean', 0, 0, false, 0, 0.10, 'band'),        seg('lean', 0, 0, false, 0, 0.10, 'band'),
  // a later patron with a nofit-easy (fit-flag by-patron read)
  seg('rich', 3, 1, false, 0, 0.05, 'nofit-easy'), seg('rich', 4, 1, true, 1, 0.30, 'band'),
];

const acc = computeAcceptance(rows, segRecs, { msPerSeg: 42, evalsPerSeg: 18 });

// 1. die@seg-1 — raw snap rate at segIndex 0 = 2/8 = 0.25 (out of the 8-18% band → FAIL)
ok(approx(dial(acc, 'die1').value, 0.25), `die1 = 25% (got ${dial(acc, 'die1').value})`);
ok(dial(acc, 'die1').pass === false, 'die1: 25% is outside 8-18% → FAIL');
ok(approx(acc.detail.die1.byArchetype.rich, 0.25) && approx(acc.detail.die1.byArchetype.lean, 0.25), 'die1: per-archetype snap split');

// 2. run length — aggregate mean of the 8 played runs, per-archetype means, spread.
const meanSegs = (8 + 9 + 14 + 7 + 5 + 6 + 5 + 6) / 8;   // = 7.5
ok(approx(dial(acc, 'runMean').value, meanSegs), `runMean = ${meanSegs}`);
ok(dial(acc, 'runMean').pass === true, 'runMean: 7.5 in 6-12 → PASS');
const richMean = (8 + 9 + 14 + 7) / 4, leanMean = (5 + 6 + 5 + 6) / 4;
ok(approx(dial(acc, 'runSpread').value, richMean / leanMean), 'runSpread = richMean/leanMean');

// 3. viability — score medians per archetype vs grand median.
ok(approx(acc.detail.viability.scoreMedian.rich, median(rows.rich.map(r => r.score))), 'viability: rich median');
ok(approx(acc.detail.viability.scoreMedian.lean, median(rows.lean.map(r => r.score))), 'viability: lean median');

// 4. boss-death — of the 8 runs (all played), terminalBoss=true count / 8. rich: 3 boss, lean: 2 boss = 5/8.
ok(approx(dial(acc, 'bossDeath').value, 5 / 8), `bossDeath = 5/8 (got ${dial(acc, 'bossDeath').value})`);

// 5. p99/p50 — pooled scores; p50 is the median, p99 near the 4000 tail.
const ratio = dial(acc, 'scoreRatio').value;
ok(ratio >= TARGETS.scoreRatio.min, `scoreRatio ${ratio} ≥ 4 (the fat tail) → PASS`);

// 6. calibration — binned MAE over the 10 records with pSnapPredicted.
const cal = acc.detail.calibration;
ok(cal.bins.length > 0, 'calibration: bins populated');
ok(cal.mae >= 0 && cal.mae <= 1, 'calibration: MAE in [0,1]');
// hand-check the .10-bin: 6 records predicted 0.10, all realized 0 → err 0.10 in that bin.
const bin10 = cal.bins.find(b => b.lo <= 0.10 && b.hi > 0.10);
ok(bin10 && bin10.n === 6 && approx(bin10.realRate, 0) && approx(bin10.predMean, 0.10), 'calibration: the 0.10 bin has 6 recs, realized 0');

// 7. fit-flags — overall shares + by patron; patron 0 has the 8 segIndex-0 records (6 band, 2 nofit-hard).
const p0 = acc.detail.fitFlags.byPatron['0'];
ok(p0 && p0.n === 8 && approx(p0.nofitHard, 2 / 8) && approx(p0.band, 6 / 8), 'fit-flags: patron-0 shares (2/8 nofit-hard)');
const p1 = acc.detail.fitFlags.byPatron['1'];
ok(p1 && p1.n === 2 && approx(p1.nofitEasy, 1 / 2), 'fit-flags: patron-1 has the nofit-easy');

// 8. probe cost — from the perf reading; 42ms ≤ 70 → PASS.
ok(approx(dial(acc, 'probeMs').value, 42) && dial(acc, 'probeMs').pass === true, 'probeMs: 42ms ≤ 70 → PASS');

// runaways excluded from the rate dials
const rows2 = { a: [mkRow('a', 10, 3, false), mkRow('a', 0, 0, false, true)] };
const acc2 = computeAcceptance(rows2, [], null);
ok(acc2.n.runaways === 1 && acc2.n.played === 1, 'runaways: tripped run excluded from played');
ok(dial(acc2, 'probeMs').value === null && dial(acc2, 'probeMs').pass === null, 'probeMs: null perf → n/a verdict');

// ---- Fix 6 — OVERSHOOT distribution (pred − target): the MEAN hides a tail the p90 reveals -------------
// 20 mid/late segments overshoot +0.01 (in-band); 4 seg-1 / patron-0 openers overshoot +0.19 (the content-
// floor tail the campaign's ~.015–.04 MEAN averaged away). Assert the instrument now surfaces the tail.
{
  const segOv = (segIndex, patronIndex, target, predicted) =>
    ({ name: 'x', segIndex, patronIndex, boss: false, snap: 0, fit: 'band', pSnapTarget: target, pSnapPredicted: predicted });
  const ovRecs = [];
  for (let i = 0; i < 20; i++) ovRecs.push(segOv(3 + (i % 4), 1 + (i % 3), 0.30, 0.31));   // mid: +0.01
  for (let i = 0; i < 4; i++)  ovRecs.push(segOv(0, 0, 0.06, 0.25));                        // seg-1 patron-0: +0.19
  const accOv = computeAcceptance({ x: [mkRow('x', 100, 8, true)] }, ovRecs, null);
  const ov = accOv.detail.overshoot;
  ok(ov && ov.overall.n === 24, `Fix6: overshoot detail present over all band segments (n=${ov && ov.overall.n})`);
  ok(approx(ov.overall.mean, (20 * 0.01 + 4 * 0.19) / 24, 1e-9), `Fix6: the MEAN overshoot is small (+${ov.overall.mean.toFixed(3)}) — it hides the tail`);
  ok(ov.overall.mean < 0.05 && ov.overall.p90 >= 0.18, `Fix6: |p90| (${ov.overall.p90.toFixed(3)}) EXPOSES the tail the mean (${ov.overall.mean.toFixed(3)}) averages away`);
  ok(approx(ov.seg1.mean, 0.19, 1e-9) && ov.seg1.n === 4, `Fix6: the seg-1 breakdown carries the +0.19 tail (mean ${ov.seg1.mean.toFixed(3)}, n=${ov.seg1.n})`);
  ok(ov.byPatron['0'] && approx(ov.byPatron['0'].mean, 0.19, 1e-9), 'Fix6: per-patron breakdown — patron 0 shows the elevated overshoot');
  ok(ov.byPatron['1'] && ov.byPatron['1'].mean < 0.05, 'Fix6: per-patron breakdown — a mid patron shows the small in-band overshoot');
}

console.log(`\nacceptance dials: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
