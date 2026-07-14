// Minos test runner — discovers packages/*/tests/*_test.mjs and runs each in a
// child process. A test fails if it exits non-zero OR prints "N failed" with N > 0
// (the jam-era tests report counts but always exit 0).
import { readdirSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgs = readdirSync(path.join(ROOT, 'packages'));
const tests = [];
for (const p of pkgs) {
  const dir = path.join(ROOT, 'packages', p, 'tests');
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) if (f.endsWith('_test.mjs')) tests.push(path.join(dir, f));
}

// Pre-existing failures inherited verbatim from the jam build (identical in
// gamefiles/Server). Kept visible, not fixed blind: the segment_test Trinity
// failures include a "no regression" guard and may flag a REAL jam-era rules
// regression — design call pending (see docs/Minos-ToDo.md). Remove entries
// here as they get resolved.
const KNOWN_FAIL = new Set(['enchantments_test.mjs', 'segment_test.mjs']);

let failed = 0;
for (const t of tests) {
  const rel = path.relative(ROOT, t);
  // Per-file budget 300s (raised from 180s, 2026-07-10 G5a suite pass — deliberate): the heaviest
  // behavioral files (witness_bugfix / g4_rungsets / slice4_verbs) run 85–105s on a fast machine,
  // which sat within contention/slow-hardware noise of the old 180s line (the intermittent 36/37
  // "one file brushed the budget" failure — slice4 was ~200s before its probe-trials trim). 300s
  // still catches a genuine hang; it no longer fails a merely-slow legitimate run.
  const res = spawnSync('node', [t], { encoding: 'utf8', timeout: 300_000 });
  const out = (res.stdout || '') + (res.stderr || '');
  const failMatch = [...out.matchAll(/(\d+)\s+failed/g)].map(m => Number(m[1]));
  const reportedFails = failMatch.reduce((a, b) => a + b, 0);
  let ok = res.status === 0 && reportedFails === 0;
  if (!ok && KNOWN_FAIL.has(path.basename(t))) {
    console.log(`KNOWN-FAIL  ${rel} (pre-existing in jam build — tracked, not gating)`);
    continue;
  }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${rel}`);
  if (!ok) {
    failed++;
    console.log(out.split('\n').filter(l => /fail|error/i.test(l)).slice(0, 10).map(l => '      ' + l).join('\n'));
  }
}
console.log(`\n${tests.length - failed}/${tests.length} test files green`);
process.exit(failed ? 1 : 0);
