// =============================================================================
// SWEEP HARNESS — the Generator v2 tuning campaign engine (slice G5a, Part B).
// -----------------------------------------------------------------------------
// Runs the archetype bench across NAMED parameter configs via the §C0 balance-
// override channel (setBalanceOverrides, carried in each new_run action), emitting
// one acceptance report (acceptance.mjs dials) per config PLUS a comparison table so
// the campaign can read what each dial did as a parameter moved. Deterministic: same
// configs + seeds ⇒ same reports. The bench + perf probe are the SAME instruments
// `npm run bench` prints, so a sweep row IS a bench acceptance read under overrides.
//
// Usage:
//   node sweep.mjs <stage> [--n N] [--seed0 S] [--seeds a,b,..] [--out dir] [--quiet]
//   node sweep.mjs coarse   --n 12          # the coarse grid (run-length + seg-1 levers)
//   node sweep.mjs refine   --n 24          # refine around the coarse winners
//   node sweep.mjs spincap  --n 20          # ⚖3.12 the 2/3/4 base-spin comparison
//   node sweep.mjs final    --n 30          # baseline vs the chosen config (the deliverable read)
//   node sweep.mjs list                     # print the config registry, run nothing
//
// A CONFIG = { name, note, overrides } where overrides is the flat §C0 dot-path map.
// {} is the baseline (byte-identical to balance.js defaults — the neutrality contract).
// Long sweeps: run in the background and poll the --out JSON (a single Bash call caps
// at 10 min).  The comparison table is printed AND written to <out>/<stage>_compare.txt.
// =============================================================================
import { writeFileSync, mkdirSync } from 'fs';
import { makeClient, runBench, ARCHETYPE_NAMES } from './bench_core.mjs';
import { computeAcceptance, printDialTable, f1, pct } from './acceptance.mjs';
import { measureProbe } from './perf_probe.mjs';

// =============================================================================
// THE CONFIG REGISTRY — each stage is an ordered list of named override maps.
// -----------------------------------------------------------------------------
// THE BAND is tuned via DEDICATED per-leaf numeric keys (generator2.bandBase0 / bandRamp
// / bandFitTol / bandEasy / bandBoss / bandFloor / bandCeil), NOT the whole-object key
// 'generator2.band' — that key COLLIDES with the boolean gate on('generator2.band') (a
// shared dot-path), so an object override would silently turn the band OFF. generator.js
// layers these leaves onto the default band (null-guarded ⇒ byte-identical when unset).
// Branch (b) — the easier floor candidate — is the CONTENT toggle 'generator2.floorEasy'.
const bandOv = (o = {}) => {
  const K = { base0: 'bandBase0', ramp: 'bandRamp', fitTol: 'bandFitTol', easy: 'bandEasy', boss: 'bandBoss', floor: 'bandFloor', ceil: 'bandCeil' };
  const m = {}; for (const k of Object.keys(o)) if (o[k] != null) m[`generator2.${K[k]}`] = o[k];
  return m;
};

const STAGES = {
  // ---- COARSE: the failing dials are run-length SPREAD (3.7×) + tempoist VIABILITY (both = the
  //      tempoist outlier running long), and patron-0 nofit-hard 40.7% (the seg-1 expressibility ask).
  //      Levers: RAMP + base0 COMPRESS (bite deep runs → the outlier); base0/easy RAISE early expressibility;
  //      floorEasy is branch (b). Baseline already passes 6/8 — so the grid nudges, not overhauls. ----
  coarse: [
    { name: 'baseline',   note: 'balance.js defaults (base0 .10 ramp .03 easy .6)', overrides: {} },
    { name: 'ramp05',     note: 'ramp .03→.05 (asymptote bites deep runs)', overrides: bandOv({ ramp: 0.05 }) },
    { name: 'b16_r04',    note: 'A: base0 .10→.16 ramp .04 (early expr + mild compress)', overrides: bandOv({ base0: 0.16, ramp: 0.04 }) },
    { name: 'b16_r05',    note: 'A: base0 .16 ramp .05', overrides: bandOv({ base0: 0.16, ramp: 0.05 }) },
    { name: 'b22_r05',    note: 'A: base0 .22 ramp .05 (strong early expr)', overrides: bandOv({ base0: 0.22, ramp: 0.05 }) },
    { name: 'easy10',     note: 'A-lite: seg-1 easy .6→1.0 (base0 .10) — targeted expr only', overrides: bandOv({ easy: 1.0 }) },
    { name: 'floorEasy_b',note: 'B: easier {C:1} floor cand (band default)', overrides: { 'generator2.floorEasy': true } },
    { name: 'b16_r04_boss18', note: 'A + boss 1.5→1.8 (boss-death lever)', overrides: bandOv({ base0: 0.16, ramp: 0.04, boss: 1.8 }) },
  ],

  // ---- REFINE + SPINCAP + PROBE + FINAL: their band is filled from the coarse winner (edited post-coarse).
  //      The `TUNED` constant below is the running best; refine explores around it. ----
  refine: [],   // populated after coarse (see TUNED)
  spincap: [],
  probe: [],
  final: [],
};

// THE RUNNING BEST band (updated after each stage as the campaign converges).
// COARSE READ (n=12, reports/sweeps/coarse.json): RAMP = the compression/spread tool AND
// zealot-friendly (its score median ROSE under ramp05); BASE0 raises early expressibility
// (nofitH0 40.7%→17.3%/14.4%) but TAXES the weakest archetype (zealot median 115→61→47)
// and raises MAE by EXPOSURE to the probe's miscalibrated ≥0.3-pred region (a reported
// probe-model gap, not a calibration corruption); floorEasy (branch b) REJECTED — best
// expressibility (6.6%) but runs lengthen (12.8μ), glutton/debtor inflate (viab 4), die@1
// sinks below band (3.6%). REFINE: mild base0 (.13) × easy-stage (.8) blends for
// expressibility, ramp .05–.07 for compression, one richnessWeight shrink probe (G4 note).
// REFINE READ (n=24, reports/sweeps/refine.json): r05 (ramp .03→.05, NOTHING else) and
// r06_rich10 both 7/8; every base0/easy blend pays in spread/MAE (the zealot tax + high-
// tension exposure). The one dial failing everywhere is VIABILITY — structural to the
// archetype policies (miser over / zealot under in every ramp config; debtor over in
// r06/r07), not a band lever. richnessWeight .15→.10 measured a within-noise no-op (safe,
// not beneficial — keep .15). CHOSEN: ramp .05 alone — one number, 7/8, robust n=12+n=24.
const TUNED = { ramp: 0.05 };
STAGES.refine = [
  { name: 'baseline',       note: 'defaults (n=24 confidence read)',        overrides: {} },
  { name: 'r05',            note: 'ramp .05 (coarse spread winner)',        overrides: bandOv({ ramp: 0.05 }) },
  { name: 'r06',            note: 'ramp .06 (more compression)',            overrides: bandOv({ ramp: 0.06 }) },
  { name: 'r07',            note: 'ramp .07 (most compression)',            overrides: bandOv({ ramp: 0.07 }) },
  { name: 'b13_r05',        note: 'base0 .13 ramp .05 (mild A)',            overrides: bandOv({ base0: 0.13, ramp: 0.05 }) },
  { name: 'b13_r05_easy08', note: 'base0 .13 ramp .05 easy .8 (expr blend: patron-0 targets .104/.13/.195)', overrides: bandOv({ base0: 0.13, ramp: 0.05, easy: 0.8 }) },
  { name: 'r05_easy08',     note: 'ramp .05 easy .8 (expr via stage only)', overrides: bandOv({ ramp: 0.05, easy: 0.8 }) },
  { name: 'r06_rich10',     note: 'ramp .06 + richnessWeight .15→.10 (G4: apex supplies real EV now)', overrides: { ...bandOv({ ramp: 0.06 }), 'generator2.richnessWeight': 0.10 } },
];
STAGES.spincap = [
  { name: 'spin2_tuned', note: 'base spins 2 + tuned band', overrides: { ...bandOv(TUNED), 'tempo.baseSpins': 2 } },
  { name: 'spin3_tuned', note: 'base spins 3 (default) + tuned band', overrides: { ...bandOv(TUNED), 'tempo.baseSpins': 3 } },
  { name: 'spin4_tuned', note: 'base spins 4 + tuned band', overrides: { ...bandOv(TUNED), 'tempo.baseSpins': 4 } },
];
STAGES.probe = [
  { name: 'trials240', note: 'trials 240 (default) + tuned band', overrides: { ...bandOv(TUNED) } },
  { name: 'trials180', note: 'trials 180', overrides: { ...bandOv(TUNED), 'generator2.trials': 180 } },
  { name: 'trials160', note: 'trials 160', overrides: { ...bandOv(TUNED), 'generator2.trials': 160 } },
];
STAGES.final = [
  // NOTE: the baseline row pins the PRE-campaign band explicitly (not {}), so this stage keeps
  // reading "before vs after" even once balance.js NUMBERS carry the chosen values.
  { name: 'baseline', note: 'pre-campaign defaults (ramp .03, pinned)', overrides: bandOv({ ramp: 0.03 }) },
  { name: 'CHOSEN', note: 'the campaign recommendation (ramp .05; trials stay 240 — cost passes)', overrides: bandOv(TUNED) },
];

// =============================================================================
// RUN A STAGE — bench every config (sharing one agent_cli process), compute dials.
// =============================================================================
async function runStage(stageName, seeds, opts = {}){
  const configs = STAGES[stageName];
  if (!configs){ console.error(`unknown stage '${stageName}' — known: ${Object.keys(STAGES).join(', ')}`); process.exit(2); }
  const names = ARCHETYPE_NAMES;
  const client = makeClient();
  await client.hello;
  const results = [];
  const t0 = Date.now();
  for (const cfg of configs){
    const ct = Date.now();
    const { rows, segRecs } = await runBench(names, seeds, { client, overrides: cfg.overrides });
    const perf = measureProbe(cfg.overrides, opts.perfReps || 6);
    const acc = computeAcceptance(rows, segRecs, perf);
    const secs = ((Date.now() - ct) / 1000).toFixed(0);
    results.push({ config: cfg, acc });
    if (!opts.quiet) printDialTable(acc, `${cfg.name} — ${cfg.note}`);
    console.log(`  [${cfg.name}] ${secs}s`);
  }
  client.close();
  const wallMin = ((Date.now() - t0) / 60000).toFixed(1);
  const table = comparisonTable(stageName, seeds, results, wallMin);
  console.log(table);
  // artifacts
  const outDir = opts.out || 'packages/agent/reports/sweeps';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/${stageName}.json`, JSON.stringify({ stage: stageName, seeds, wallMin: +wallMin,
    results: results.map(r => ({ name: r.config.name, note: r.config.note, overrides: r.config.overrides, acceptance: r.acc })) }, null, 2));
  writeFileSync(`${outDir}/${stageName}_compare.txt`, table);
  console.log(`\nwrote ${outDir}/${stageName}.json + ${stageName}_compare.txt  (stage wall ${wallMin} min)`);
  return results;
}

// ---- the comparison table (the campaign's readout) -----------------------------------
function comparisonTable(stageName, seeds, results, wallMin){
  const pad = (s, n) => String(s).padEnd(n);
  const lp = (s, n) => String(s).padStart(n);
  const D = (acc, key) => acc.dials.find(d => d.key === key);
  const cols = [
    ['config',       22, r => pad(r.config.name, 22)],
    ['die@1',         7, r => lp(pct(D(r.acc, 'die1').value), 7)],
    ['run μ',         7, r => lp(f1(D(r.acc, 'runMean').value), 7)],
    ['spread',        7, r => lp(f1(D(r.acc, 'runSpread').value) + '×', 7)],
    ['viab✗',         6, r => lp(D(r.acc, 'viability').value, 6)],
    ['boss†',         7, r => lp(pct(D(r.acc, 'bossDeath').value), 7)],
    ['p99/50',        7, r => lp(f1(D(r.acc, 'scoreRatio').value) + '×', 7)],
    ['MAE',           7, r => lp((Math.round(D(r.acc, 'calibMAE').value * 1000) / 1000).toFixed(3), 7)],
    ['nofitH0',       8, r => { const p = r.acc.detail.fitFlags.byPatron['0']; return lp(p ? pct(p.nofitHard) : '—', 8); }],
    ['ms/seg',        7, r => lp(f1(D(r.acc, 'probeMs').value), 7)],
    ['PASS',          5, r => lp(r.acc.dials.filter(d => d.pass === true).length + '/8', 5)],
  ];
  const lines = [];
  lines.push(`\n===== SWEEP COMPARISON — stage '${stageName}' — ${ARCHETYPE_NAMES.length} builds × ${seeds.length} seeds (wall ${wallMin} min) =====`);
  lines.push(cols.map(([h, w]) => (h === 'config' ? pad(h, w) : lp(h, w))).join(' '));
  lines.push(cols.map(([, w]) => '─'.repeat(w)).join(' '));
  for (const r of results) lines.push(cols.map(([, , fn]) => fn(r)).join(' '));
  lines.push('legend: die@1=raw seg-1 snap (t 8-18%) · run μ (t 6-12) · spread (t ≤3×) · viab✗=# archetypes out of band · boss† (t 35-60%) · p99/50 (t ≥4×) · MAE (t ≤.05) · nofitH0=patron-0 nofit-hard share · ms/seg (t ≤70)');
  lines.push('targets are the §4 acceptance dials; PASS/8 counts the pass/fail dials green (fit-flags/nofitH0 are reads, not gated).');
  return lines.join('\n');
}

// =============================================================================
// CLI
// =============================================================================
const argv = process.argv.slice(2);
const getFlag = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const stage = (argv[0] && !argv[0].startsWith('--')) ? argv[0] : null;

if (!stage || stage === 'list'){
  console.log('sweep stages:');
  for (const [s, cfgs] of Object.entries(STAGES)){
    console.log(`\n  ${s}:`);
    for (const c of cfgs) console.log(`    ${c.name.padEnd(24)} ${c.note}`);
  }
  console.log('\nusage: node sweep.mjs <stage> [--n N] [--seed0 S] [--seeds a,b] [--out dir] [--quiet] [--perf-reps N]');
  process.exit(0);
}

let seeds;
const seedsArg = getFlag('--seeds');
if (seedsArg){ seeds = seedsArg.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !Number.isNaN(n)); }
else {
  const n = parseInt(getFlag('--n') || '12', 10);
  const s0 = parseInt(getFlag('--seed0') || '1000', 10);
  seeds = Array.from({ length: n }, (_, i) => (s0 + i * 7919) >>> 0);
}

await runStage(stage, seeds, {
  out: getFlag('--out'),
  quiet: argv.includes('--quiet'),
  perfReps: parseInt(getFlag('--perf-reps') || '6', 10),
});
