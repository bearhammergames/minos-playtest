// =============================================================================
// ARCHETYPE DRIVER — the automated archetype BENCH + the acceptance INSTRUMENT.
// -----------------------------------------------------------------------------
// Plays a named build (archetypes.mjs) to completion, headless, over many seeds, and
// aggregates what the stack DID — now ALSO computing the Generator v2 §4 acceptance
// dials (die@seg-1, run length + spread, viability, boss-death, p99/p50, predicted-
// vs-realized P(snap), fit-flag rates, probe cost) and emitting a machine-readable
// JSON artifact beside the printed table. The play-and-collect engine lives in
// bench_core.mjs (shared with the sweep harness); the dial math in acceptance.mjs.
//
// It speaks ONLY the public JSON-lines protocol (no engine import for PLAY) — so it
// drives the REAL engine + every wired stack system with ZERO rule duplication. The
// perf dial (perf_probe.mjs) is the one in-process TIMING read (never state/rng).
//
// Usage:
//   node archetype_driver.mjs <name|all> [--seeds a,b,c] [--n N] [--seed0 S] [--verbose] [--json]
//   node archetype_driver.mjs all  --n 30                 # the campaign seed count
//   node archetype_driver.mjs all  --n 30 --out reports/x.json   # write the acceptance JSON
//   node archetype_driver.mjs all  --no-accept            # legacy table only (skip dials/perf)
//   node archetype_driver.mjs zealot --n 50 --json        # one JSON row per run (for reports)
//
// NOTE (CLAUDE.md §0): the aggregate numbers EXERCISE the stack. Post-G5 the acceptance
// dials give them pass/fail meaning against the spec's targets, but the CHOSEN numbers
// are bench-DERIVED (2026-07-10 campaign), not eternal — re-sweep at feature-complete.
// =============================================================================
import { writeFileSync } from 'fs';
import { runBench, ARCHETYPES, ARCHETYPE_NAMES } from './bench_core.mjs';
import { computeAcceptance, printDialTable } from './acceptance.mjs';
import { measureProbe } from './perf_probe.mjs';

// ---- aggregate + report (the legacy table — UNCHANGED numbers on the default config) --
const mean   = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const median = xs => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const f1 = x => (Math.round(x * 10) / 10).toFixed(1);
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

function aggregate(name, rows){
  const scores = rows.map(r => r.score);
  const segs = rows.map(r => r.segments);
  return {
    name, n: rows.length,
    scoreMean: mean(scores), scoreMed: median(scores),
    segMean: mean(segs), segMax: Math.max(0, ...segs),
    die1: rows.filter(r => r.segments === 0).length / rows.length,
    witMean: mean(rows.map(r => r.witnessScore)),
    curseMean: mean(rows.map(r => r.cursed)),
    bloomMean: mean(rows.map(r => r.blooms)),
    stitchMean: mean(rows.map(r => r.stitches)),
    runaways: rows.filter(r => r.tripped).length,
  };
}

function report(all, seeds){
  const aggs = Object.entries(all).map(([name, rows]) => aggregate(name, rows));
  const cols = [
    ['archetype', 11, a => pad(a.name, 11)],
    ['score μ',    8, a => lpad(f1(a.scoreMean), 8)],
    ['score ~',    8, a => lpad(f1(a.scoreMed), 8)],
    ['segs μ',     7, a => lpad(f1(a.segMean), 7)],
    ['segs⤒',      6, a => lpad(a.segMax, 6)],
    ['die@1',      6, a => lpad(Math.round(a.die1 * 100) + '%', 6)],
    ['wit μ',      7, a => lpad(f1(a.witMean), 7)],
    ['curse μ',    8, a => lpad(f1(a.curseMean), 8)],
    ['bloom μ',    8, a => lpad(f1(a.bloomMean), 8)],
    ['stch μ',     7, a => lpad(f1(a.stitchMean), 7)],
    ['run⚑',       5, a => lpad(a.runaways, 5)],
  ];
  console.log(`\nARCHETYPE BENCH — ${aggs.length} build(s) × ${seeds.length} seed(s) (seeds ${seeds.slice(0, 6).join(',')}${seeds.length > 6 ? ',…' : ''})`);
  console.log(cols.map(([h, w]) => (h === 'archetype' ? pad(h, w) : lpad(h, w))).join(' '));
  console.log(cols.map(([, w]) => '─'.repeat(w)).join(' '));
  for (const a of aggs) console.log(cols.map(([, , fn]) => fn(a)).join(' '));

  if (aggs.length > 1){
    const meds = aggs.map(a => a.scoreMed);
    const grand = median(meds);
    const hi = grand * 1.5, lo = grand * 0.5;
    const flags = aggs.filter(a => a.scoreMed > hi).map(a => a.name);
    const weak = aggs.filter(a => a.scoreMed < lo).map(a => a.name);
    console.log(`\nviability read (SMOKE, not a verdict): grand median ${f1(grand)} · >1.5×: ${flags.length ? flags.join(', ') : 'none'} · <0.5×: ${weak.length ? weak.join(', ') : 'none'}`);
  }
  console.log('legend: score ~ = median · segs⤒ = deepest run · die@1 = %runs that DIED at segment 1 · wit μ = witness worth · run⚑ = runaway(action-capped) runs');
  console.log('NOTE: exercises the stack; the ACCEPTANCE DIALS below give the §4 pass/fail read (Rule-4 numbers now bench-derived — re-sweep at feature-complete).');
}

// ---- CLI -----------------------------------------------------------------------------
const argv = process.argv.slice(2);
const getFlag = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const has = f => argv.includes(f);

const nameArg = (argv[0] && !argv[0].startsWith('--')) ? argv[0] : 'all';
const names = nameArg === 'all' ? ARCHETYPE_NAMES : [nameArg];
const unknown = names.filter(n => !ARCHETYPES[n]);
if (unknown.length){
  console.error(`unknown archetype: ${unknown.join(', ')}\nknown: ${ARCHETYPE_NAMES.join(', ')} | all`);
  process.exit(2);
}

let seeds;
const seedsArg = getFlag('--seeds');
if (seedsArg){
  seeds = seedsArg.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !Number.isNaN(n));
} else {
  const n = parseInt(getFlag('--n') || '12', 10);
  const s0 = parseInt(getFlag('--seed0') || '1000', 10);
  seeds = Array.from({ length: n }, (_, i) => (s0 + i * 7919) >>> 0);   // demo-style diverse spacing
}
if (!seeds.length){ console.error('no seeds'); process.exit(2); }

const verbose = has('--verbose');
const asJson = has('--json');
const doAccept = !has('--no-accept');
const outFile = getFlag('--out');
const perfReps = parseInt(getFlag('--perf-reps') || '8', 10);

const onRow = (row) => {
  if (asJson) console.log(JSON.stringify(row));
  else if (verbose) console.log(`${pad(row.name, 11)} seed ${lpad(row.seed, 10)} → score ${lpad(row.score, 4)}  segs ${lpad(row.segments, 3)}  knot ${pad(row.knot, 5)}  wit ${lpad(row.witnessScore, 4)}  curse ${row.cursed}  bloom ${row.blooms}  stch ${row.stitches}${row.tripped ? '  ⚑RUNAWAY' : ''}`);
};

const { rows, segRecs } = await runBench(names, seeds, { onRow });

if (!asJson) report(rows, seeds);

if (doAccept){
  // the perf dial — measured on the SAME (default, un-overridden) config the bench ran.
  const perf = measureProbe({}, perfReps);
  const acc = computeAcceptance(rows, segRecs, perf);
  printDialTable(acc, `${names.length} builds × ${seeds.length} seeds`);
  if (outFile){
    writeFileSync(outFile, JSON.stringify({ archetypes: names, seeds, overrides: {}, acceptance: acc }, null, 2));
    console.log(`\nwrote acceptance JSON → ${outFile}`);
  }
}
