// =============================================================================
// ACCEPTANCE — the Generator v2 §4 acceptance dials, wired into the bench (G5a).
// -----------------------------------------------------------------------------
// Pure functions: given the bench's collected per-run rows + per-segment telemetry
// (bench_core.mjs) + a perf reading (perf_probe.mjs), compute the eight acceptance
// dials from docs/Minos_Generator_v2.md §4 and format the machine-readable report
// (the JSON artifact) + the printed dial table. No I/O, no engine import, no rng.
//
// THE EIGHT DIALS (spec §4 + the G3 playtest synthesis' fit-flag ask):
//   1. die@segment-1   — RAW seg-1 snap rate (the band+content-floor lever). target 8–18%.
//                        Also reports seg-1 DEATH rate (stitch-suppressed) for context.
//   2. run length      — aggregate mean + per-archetype spread. target mean 6–12, spread ≤ 3×.
//   3. viability spread — per-archetype score median vs grand median. target none <0.5× / >1.5×.
//   4. boss-death share — deaths on boss segments / all deaths. target 35–60%.
//   5. p99/p50 score   — pooled across archetypes. target ≥ 4× (gap analysis if unmet).
//   6. pred vs realized — joint-probe pSnapPredicted vs realized snap, binned MAE. target ≤ 0.05.
//   7. fit-flag rates  — band / nofit-hard / nofit-easy shares by patron (no target; a read).
//   8. probe cost      — ms/segment (perf_probe). target ≤ ~70ms (the G2/G3 envelope).
// =============================================================================

// ---- targets (the pass/fail contract) ------------------------------------------------
export const TARGETS = {
  die1:        { lo: 0.08, hi: 0.18, label: 'die@seg-1 (raw snap)' },
  runMean:     { lo: 6,    hi: 12,   label: 'mean run length' },
  runSpread:   { max: 3,             label: 'run-length spread (×)' },
  viability:   { lo: 0.5,  hi: 1.5,  label: 'viability spread' },
  bossDeath:   { lo: 0.35, hi: 0.60, label: 'boss-death share' },
  scoreRatio:  { min: 4,             label: 'p99/p50 score' },
  calibMAE:    { max: 0.05,          label: 'pred-vs-realized P(snap) MAE' },
  probeMs:     { max: 70,            label: 'probe cost ms/segment' },
};

// ---- small stats helpers -------------------------------------------------------------
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const sortNum = xs => [...xs].sort((a, b) => a - b);
export function median(xs){ if (!xs.length) return 0; const s = sortNum(xs); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
// percentile by linear interpolation on the sorted sample (p in [0,1]).
export function percentile(xs, p){
  if (!xs.length) return 0;
  const s = sortNum(xs); if (s.length === 1) return s[0];
  const idx = p * (s.length - 1), lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

// ---- the acceptance computation ------------------------------------------------------
// rows: { name: [ {name,seed,score,segments,terminalBoss,tripped}, ... ] }
// segRecs: [ {name,seed,segIndex,patronIndex,boss,pSnapTarget,pSnapPredicted,fit,snap}, ... ]
// perf: { msPerSeg, evalsPerSeg } | null
export function computeAcceptance(rows, segRecs, perf = null){
  const names = Object.keys(rows);
  const allRows = names.flatMap(n => rows[n]);
  const played = allRows.filter(r => !r.tripped);   // exclude guard-tripped runaways from rate dials
  const runaways = allRows.filter(r => r.tripped).length;

  // 1. die@seg-1 — RAW snap rate at segIndex 0 (per archetype + aggregate) + the death rate.
  const seg1 = segRecs.filter(s => s.segIndex === 0);
  const die1Agg = seg1.length ? mean(seg1.map(s => s.snap)) : 0;
  const die1By = {};
  for (const n of names){ const s = seg1.filter(x => x.name === n); die1By[n] = s.length ? mean(s.map(x => x.snap)) : 0; }
  const death1Agg = played.length ? played.filter(r => r.segments === 0).length / played.length : 0;

  // 2. run length — aggregate mean + per-archetype means + spread (max/min).
  const segByArch = {}; for (const n of names) segByArch[n] = mean(rows[n].map(r => r.segments));
  const runMean = mean(played.map(r => r.segments));
  const archMeans = names.map(n => segByArch[n]);
  const runSpread = Math.min(...archMeans) > 0 ? Math.max(...archMeans) / Math.min(...archMeans) : Infinity;

  // 3. viability — per-archetype score median vs grand median (median of medians).
  const scoreMed = {}; for (const n of names) scoreMed[n] = median(rows[n].map(r => r.score));
  const grand = median(names.map(n => scoreMed[n]));
  const viabHi = grand * TARGETS.viability.hi, viabLo = grand * TARGETS.viability.lo;
  const over = names.filter(n => scoreMed[n] > viabHi);
  const under = names.filter(n => scoreMed[n] < viabLo);

  // 4. boss-death share — of runs that DIED (all played runs end by a snap), the share on a boss seg.
  const deaths = played;   // every non-tripped run ends by a terminal snap
  const bossDeaths = deaths.filter(r => r.terminalBoss === true).length;
  const bossDeathShare = deaths.length ? bossDeaths / deaths.length : 0;

  // 5. p99/p50 score ratio — pooled across archetypes.
  const scores = played.map(r => r.score);
  const p50 = percentile(scores, 0.50), p99 = percentile(scores, 0.99), p90 = percentile(scores, 0.90);
  const scoreRatio = p50 > 0 ? p99 / p50 : Infinity;

  // 6. predicted vs realized P(snap) — bin segments by pSnapPredicted, compare to realized snap rate.
  const cal = segRecs.filter(s => s.pSnapPredicted != null);
  const NB = 10; const bins = Array.from({ length: NB }, () => ({ n: 0, predSum: 0, realSum: 0 }));
  for (const s of cal){ const bi = Math.min(NB - 1, Math.floor(s.pSnapPredicted * NB)); const b = bins[bi]; b.n++; b.predSum += s.pSnapPredicted; b.realSum += s.snap; }
  let calibW = 0, calibErrW = 0;
  const calibBins = [];
  for (let i = 0; i < NB; i++){ const b = bins[i]; if (!b.n) continue; const pm = b.predSum / b.n, rr = b.realSum / b.n; calibBins.push({ lo: i / NB, hi: (i + 1) / NB, n: b.n, predMean: pm, realRate: rr, err: Math.abs(pm - rr) }); calibW += b.n; calibErrW += b.n * Math.abs(pm - rr); }
  const calibMAE = calibW ? calibErrW / calibW : 0;
  const calibAggPred = cal.length ? mean(cal.map(s => s.pSnapPredicted)) : 0;
  const calibAggReal = cal.length ? mean(cal.map(s => s.snap)) : 0;

  // 7. fit-flag rates — overall + by patron index (0,1,2,3+). The playtest's ask (no target).
  const fitRec = segRecs.filter(s => s.fit != null);
  const fitShare = recs => { const n = recs.length || 1; const c = k => recs.filter(s => s.fit === k).length; return { n: recs.length, band: c('band') / n, nofitHard: c('nofit-hard') / n, nofitEasy: c('nofit-easy') / n }; };
  const fitOverall = fitShare(fitRec);
  const fitByPatron = {};
  for (const p of [0, 1, 2, 3]){ const recs = fitRec.filter(s => (p === 3 ? s.patronIndex >= 3 : s.patronIndex === p)); if (recs.length) fitByPatron[p === 3 ? '3+' : String(p)] = fitShare(recs); }

  // 7b. OVERSHOOT distribution (Fix 6) — pSnapPredicted − pSnapTarget: how much the fitted set overshoots
  // the band target (positive = HARDER than intended, the nofit-hard direction). The playtest campaign's
  // headline "~.015–.04 overshoot" is the MEAN over ALL segments, which averages away a bad TAIL concentrated
  // at seg-1 / patron-0 openers (the content floor can't reach the low early band target → nofit-hard). So the
  // instrument now also reports the |overshoot| p90/p99 + a per-patron signed mean, making that tail visible
  // (a seed sitting at +.10–.19 at seg-1 is EXPECTED, not an outlier). No target — a diagnostic read.
  const overRec = segRecs.filter(s => s.pSnapTarget != null && s.pSnapPredicted != null);
  const overOf = s => s.pSnapPredicted - s.pSnapTarget;
  const overStats = recs => { const ov = recs.map(overOf), abs = ov.map(Math.abs);
    return { n: recs.length, mean: mean(ov), absMean: mean(abs), p90: percentile(abs, 0.90), p99: percentile(abs, 0.99), max: abs.length ? Math.max(...abs) : 0 }; };
  const overshoot = { overall: overStats(overRec), seg1: overStats(overRec.filter(s => s.segIndex === 0)), byPatron: {} };
  for (const p of [0, 1, 2, 3]){ const recs = overRec.filter(s => (p === 3 ? s.patronIndex >= 3 : s.patronIndex === p)); if (recs.length) overshoot.byPatron[p === 3 ? '3+' : String(p)] = overStats(recs); }

  // 8. probe cost — from the perf probe (may be null when not measured).
  const probeMs = perf ? perf.msPerSeg : null;
  const evalsPerSeg = perf ? perf.evalsPerSeg : null;

  // ---- pass/fail verdicts --------------------------------------------------------------
  const inRange = (v, lo, hi) => v >= lo && v <= hi;
  const dials = [
    { key: 'die1',       label: TARGETS.die1.label,      value: die1Agg,        target: `${pct(TARGETS.die1.lo)}–${pct(TARGETS.die1.hi)}`, pass: inRange(die1Agg, TARGETS.die1.lo, TARGETS.die1.hi), fmt: pct },
    { key: 'runMean',    label: TARGETS.runMean.label,   value: runMean,        target: `${TARGETS.runMean.lo}–${TARGETS.runMean.hi}`,     pass: inRange(runMean, TARGETS.runMean.lo, TARGETS.runMean.hi), fmt: f1 },
    { key: 'runSpread',  label: TARGETS.runSpread.label, value: runSpread,      target: `≤ ${TARGETS.runSpread.max}`,                       pass: runSpread <= TARGETS.runSpread.max, fmt: x => f1(x) + '×' },
    { key: 'viability',  label: TARGETS.viability.label, value: over.length + under.length, target: 'none <0.5× / >1.5×', pass: over.length === 0 && under.length === 0, fmt: () => (over.length || under.length) ? `>1.5×: ${over.join(',') || '—'} · <0.5×: ${under.join(',') || '—'}` : 'all in band' },
    { key: 'bossDeath',  label: TARGETS.bossDeath.label, value: bossDeathShare, target: `${pct(TARGETS.bossDeath.lo)}–${pct(TARGETS.bossDeath.hi)}`, pass: inRange(bossDeathShare, TARGETS.bossDeath.lo, TARGETS.bossDeath.hi), fmt: pct },
    { key: 'scoreRatio', label: TARGETS.scoreRatio.label, value: scoreRatio,    target: `≥ ${TARGETS.scoreRatio.min}×`,                     pass: scoreRatio >= TARGETS.scoreRatio.min, fmt: x => f1(x) + '×' },
    { key: 'calibMAE',   label: TARGETS.calibMAE.label,  value: calibMAE,       target: `≤ ${TARGETS.calibMAE.max}`,                        pass: calibMAE <= TARGETS.calibMAE.max, fmt: f3 },
    { key: 'probeMs',    label: TARGETS.probeMs.label,   value: probeMs,        target: `≤ ${TARGETS.probeMs.max}ms`,                       pass: probeMs == null ? null : probeMs <= TARGETS.probeMs.max, fmt: x => x == null ? 'n/a' : f1(x) + 'ms' },
  ];

  return {
    n: { runs: allRows.length, played: played.length, runaways, segments: segRecs.length, seg1: seg1.length },
    dials,
    detail: {
      die1: { agg: die1Agg, byArchetype: die1By, death1: death1Agg },
      runLength: { mean: runMean, byArchetype: segByArch, spread: runSpread },
      viability: { grandMedian: grand, scoreMedian: scoreMed, over, under },
      bossDeath: { share: bossDeathShare, bossDeaths, deaths: deaths.length },
      score: { p50, p90, p99, ratio: scoreRatio },
      calibration: { mae: calibMAE, aggPredicted: calibAggPred, aggRealized: calibAggReal, bins: calibBins },
      fitFlags: { overall: fitOverall, byPatron: fitByPatron },
      overshoot,
      perf,
    },
  };
}

// ---- formatting ----------------------------------------------------------------------
const f1 = x => (x == null || !isFinite(x)) ? '∞' : (Math.round(x * 10) / 10).toFixed(1);
const f3 = x => (x == null || !isFinite(x)) ? '∞' : (Math.round(x * 1000) / 1000).toFixed(3);
const pct = x => (x == null || !isFinite(x)) ? '∞' : (Math.round(x * 1000) / 10).toFixed(1) + '%';
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

export function printDialTable(acc, label = ''){
  const L = label ? ` — ${label}` : '';
  console.log(`\nACCEPTANCE DIALS${L}  (${acc.n.played}/${acc.n.runs} runs played, ${acc.n.segments} segments${acc.n.runaways ? `, ${acc.n.runaways} runaways` : ''})`);
  console.log(`${pad('dial', 30)} ${lpad('value', 10)}  ${pad('target', 14)}  verdict`);
  console.log('─'.repeat(30) + ' ' + '─'.repeat(10) + '  ' + '─'.repeat(14) + '  ' + '─'.repeat(8));
  for (const d of acc.dials){
    const v = d.fmt ? d.fmt(d.value) : String(d.value);
    const verdict = d.pass == null ? '·' : (d.pass ? 'PASS' : 'FAIL');
    console.log(`${pad(d.label, 30)} ${lpad(v, 10)}  ${pad(d.target, 14)}  ${verdict}`);
  }
  // the fit-flag read (dial 7, no pass/fail) + the seg-1 context
  const f = acc.detail.fitFlags.overall;
  console.log(`\nfit-flags (overall): band ${pct(f.band)} · nofit-hard ${pct(f.nofitHard)} · nofit-easy ${pct(f.nofitEasy)}  (n=${f.n})`);
  const byP = acc.detail.fitFlags.byPatron;
  for (const p of Object.keys(byP)){ const s = byP[p]; console.log(`  patron ${pad(p, 3)}: band ${pct(s.band)} · nofit-hard ${pct(s.nofitHard)} · nofit-easy ${pct(s.nofitEasy)}  (n=${s.n})`); }
  // Fix 6 — the OVERSHOOT tail (pred−target): mean hides it, p90 reveals it. seg-1/patron-0 carry the tail.
  const ov = acc.detail.overshoot; const sgn = x => (x >= 0 ? '+' : '') + f3(x);
  if (ov && ov.overall.n){
    console.log(`overshoot (pred−target): mean ${sgn(ov.overall.mean)} · |p90| ${f3(ov.overall.p90)} · |p99| ${f3(ov.overall.p99)} · |max| ${f3(ov.overall.max)}  (n=${ov.overall.n})`);
    if (ov.seg1.n) console.log(`  seg-1: mean ${sgn(ov.seg1.mean)} · |p90| ${f3(ov.seg1.p90)} · |max| ${f3(ov.seg1.max)}  (n=${ov.seg1.n}) — the content-floor tail`);
    for (const p of Object.keys(ov.byPatron)){ const s = ov.byPatron[p]; console.log(`  patron ${pad(p, 3)}: overshoot mean ${sgn(s.mean)} · |p90| ${f3(s.p90)}  (n=${s.n})`); }
  }
  console.log(`seg-1: raw snap ${pct(acc.detail.die1.agg)} · death ${pct(acc.detail.die1.death1)} · per-archetype snap ` +
    Object.entries(acc.detail.die1.byArchetype).map(([n, v]) => `${n} ${pct(v)}`).join(' · '));
  const sc = acc.detail.score;
  console.log(`score: p50 ${f1(sc.p50)} · p90 ${f1(sc.p90)} · p99 ${f1(sc.p99)} · p99/p50 ${f1(sc.ratio)}×`);
  const cal = acc.detail.calibration;
  console.log(`calibration: MAE ${f3(cal.mae)} · agg pred ${pct(cal.aggPredicted)} vs realized ${pct(cal.aggRealized)}`);
  if (acc.detail.perf) console.log(`probe: ${f1(acc.detail.perf.msPerSeg)}ms/seg · ${f1(acc.detail.perf.evalsPerSeg)} evals/seg`);
  const nfails = acc.dials.filter(d => d.pass === false).length;
  console.log(`\n${acc.dials.filter(d => d.pass === true).length} PASS · ${nfails} FAIL · ${acc.dials.filter(d => d.pass == null).length} n/a`);
}

export { f1, f3, pct };
