// RETIRED 2026-07-05: frozen — not a routine gate. The Monte-Carlo sim + this golden
// digest are no longer run in CI or as a checkpoint; agent-CLI playtesting is the bench.
// Kept (not deleted) for one possible pre-launch revisit. Logic below is unchanged.
//
// Minos golden regression gate.
//
//   node scripts/golden_gate.mjs          → run the sealed config, compare digest, exit 1 on drift
//   node scripts/golden_gate.mjs --seal   → re-seal the baseline (do this ON PURPOSE after a
//                                            deliberate rules/tuning change, and say so in the commit)
//
// The sim is fully deterministic (same seed + policy → same rows), so the digest
// compares exactly. Replaces the retired BoneDie-era study.js golden gate.
import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GOLDEN = path.join(ROOT, 'packages', 'sim', 'golden', 'digest_40x6_seed7.json');
const CONFIG = { runs: 40, policy: 'all', seed: 7 }; // sealed config — change only with a reseal

const tmpDir = path.join(ROOT, '_tmp', `golden_gate_${process.pid}`); // own dir — nothing else may clean it mid-run
mkdirSync(tmpDir, { recursive: true });
const tmpJson = path.join(tmpDir, 'golden_rows.json');

console.log(`golden gate: sim --runs ${CONFIG.runs} --policy ${CONFIG.policy} --seed ${CONFIG.seed} (pool build takes a few minutes)`);
const res = spawnSync('node', [
  path.join(ROOT, 'packages', 'sim', 'spellspun_sim.mjs'),
  '--runs', String(CONFIG.runs), '--policy', CONFIG.policy, '--seed', String(CONFIG.seed),
  '--json', tmpJson,
], { encoding: 'utf8', timeout: 30 * 60_000, cwd: ROOT });
if (res.status !== 0) {
  console.error('sim run failed:\n' + (res.stderr || res.stdout));
  process.exit(1);
}

const rows = JSON.parse(readFileSync(tmpJson, 'utf8'));
rmSync(tmpDir, { recursive: true, force: true });

const byPolicy = {};
for (const r of rows) (byPolicy[r.policy] ??= []).push(r);
const digest = { config: CONFIG, totalRuns: rows.length, policies: {} };
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
for (const [name, rs] of Object.entries(byPolicy).sort()) {
  digest.policies[name] = {
    n: rs.length,
    scoreMean: +mean(rs.map(r => r.score)).toFixed(6),
    scoreMedian: med(rs.map(r => r.score)),
    segsMean: +mean(rs.map(r => r.segmentsSurvived)).toFixed(6),
    segsMedian: med(rs.map(r => r.segmentsSurvived)),
    snapMean: +mean(rs.map(r => r.snapAtSegment)).toFixed(6),
  };
}

if (process.argv.includes('--seal')) {
  mkdirSync(path.dirname(GOLDEN), { recursive: true });
  writeFileSync(GOLDEN, JSON.stringify(digest, null, 2));
  console.log(`SEALED → ${path.relative(ROOT, GOLDEN)}`);
  process.exit(0);
}

if (!existsSync(GOLDEN)) {
  console.error(`no golden baseline at ${path.relative(ROOT, GOLDEN)} — run: npm run golden:seal`);
  process.exit(1);
}
const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
const a = JSON.stringify(golden, null, 2), b = JSON.stringify(digest, null, 2);
if (a === b) {
  console.log('REGRESSION OK — digest matches golden');
  process.exit(0);
}
console.error('REGRESSION DRIFT — digest differs from golden:');
const al = a.split('\n'), bl = b.split('\n');
for (let i = 0; i < Math.max(al.length, bl.length); i++) {
  if (al[i] !== bl[i]) console.error(`  golden: ${al[i] ?? '∅'}\n  actual: ${bl[i] ?? '∅'}`);
}
console.error('If this change is intentional, reseal with: npm run golden:seal (and say so in the commit message).');
process.exit(1);
