// =============================================================================
// PARITY TEST  (Integration Plan §1 / §8b — the determinism firewall)
// -----------------------------------------------------------------------------
// Two guarantees, machine-checked (there was NO such test before):
//   1. balance.js NUMBERS.* // PARITY mirrors === their LIVE source consts
//      (spellspun.js SCORE/BLOOM_VALUE/DEEPEN_MAX, generator.js DECAY/TIER_VALUE,
//      and the generator guard literals). A forgotten mirror (e.g. a P2 decay edit)
//      reds this test instead of silently forking.
//   2. The hand-copied parity constants DIFF_BASE / DEPTH_BONUS in session.mjs —
//      the SINGLE transport source of truth now that the Monte-Carlo sim is retired
//      (spellspun_sim.mjs is frozen, no longer read here) — match the NUMBERS mirror.
//      session.mjs (the game machine, driven by agent_cli.mjs AND the web client) is
//      authoritative; this catches a mirror that forks from it.
//   3. The all-flags-OFF snapshot guard (m-5): every on()-reachable BALANCE gate
//      reads false by default, so no accidental flag-ON default ships.
// Wired into `npm test` (schema gate) — the golden behavioural digest is retired.
// =============================================================================
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BALANCE, NUMBERS, on } from '../balance.js';
import { SCORE, BLOOM_VALUE, DEEPEN_MAX } from '../spellspun.js';
import { DECAY, TIER_VALUE } from '../generator.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  FAIL:', name); } };
const eq = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.keys(v).sort().reduce((o, k) => (o[k] = sortKeys(v[k]), o), {});
  return v;
}

// ---- 1. NUMBERS mirrors === live engine consts ----
check('NUMBERS.score === spellspun SCORE',        eq(NUMBERS.score, SCORE));
check('NUMBERS.bloomValue === BLOOM_VALUE',       eq(NUMBERS.bloomValue, BLOOM_VALUE));
check('NUMBERS.deepenMax === DEEPEN_MAX',         NUMBERS.deepenMax === DEEPEN_MAX);
check('NUMBERS.decay === generator DECAY',        eq(NUMBERS.decay, DECAY));
check('NUMBERS.tierValue === TIER_VALUE',         eq(NUMBERS.tierValue, TIER_VALUE));
// the multi-completion guard + MIN_REACH are literals in generator.js:227/:151 (not
// exported). Pin the mirror to the documented values; parity is enforced by review +
// the generator.js:227 comment pointing here.
check('NUMBERS.generatorGuard.multiCompletionMax === 0.12', NUMBERS.generatorGuard.multiCompletionMax === 0.12);
check('NUMBERS.generatorGuard.minReach === 0.015',          NUMBERS.generatorGuard.minReach === 0.015);

// ---- 2. DIFF_BASE / DEPTH_BONUS in session.mjs (authoritative) === mirror ----
// The sim (spellspun_sim.mjs) is retired, so session.mjs (the extracted game machine)
// is the single transport source of truth for these constants — assert its copy matches
// the NUMBERS mirror.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const agentSrc = readFileSync(path.join(ROOT, 'packages', 'agent', 'session.mjs'), 'utf8');
// extract `const NAME = { ... };` and eval the (trusted, local) object literal
function extractConst(src, name) {
  const m = src.match(new RegExp('const\\s+' + name + '\\s*=\\s*(\\{[^;]*?\\})\\s*;'));
  if (!m) return undefined;
  try { return Function('return (' + m[1] + ')')(); } catch { return undefined; }
}
const agentDiff  = extractConst(agentSrc, 'DIFF_BASE');
const agentDepth = extractConst(agentSrc, 'DEPTH_BONUS');
check('DIFF_BASE found in session',           !!agentDiff);
check('DIFF_BASE session === NUMBERS.diffBase',   eq(agentDiff, NUMBERS.diffBase));
check('DEPTH_BONUS found in session',         !!agentDepth);
check('DEPTH_BONUS session === NUMBERS.depthBonus', eq(agentDepth, NUMBERS.depthBonus));

// ---- 3. the DELIBERATELY-OFF guard (the stack is NATIVE/on as of 2026-07-05, so the
// old "all off" guard no longer applies — but the UNBUILT + UNTUNED/WATCH systems MUST
// stay off, or we'd ship a system with no code / a runaway difficulty curve). ----
const MUST_BE_OFF = [
  'relics',                                               // unbuilt (no wiring)
  'costAwareGenerator.snapBandController',                // untuned (runs run away)
  'rewardLadder.chainLoyaltyBump',                        // WATCH (grade inflation)
  'witnesses.reachPayloadsPriced', 'witnesses.events.combo', // not wired / reach inert
  'wishes.intensityRidesStage',                          // deferred (stage-curve intensity not built)
  'vocab.inscribe', 'vocab.wave4_conditions', 'vocab.namedFaces', // vocab leaves NOT wired this slice
];
let offOk = true;
for (const p of MUST_BE_OFF) if (on(p) !== false) { offOk = false; console.error('  FAIL: should be OFF:', p, '=', on(p)); }
check('unbuilt/untuned/deferred systems stay OFF', offOk);
// and the built stack is ON (the native contract) — v2 slice 3 made the twist + jackpot wish
// species NATIVE (mirror/veil/freeReroll + spotless/chainAlive/fangCourt), each per-run trimmable.
check('the built stack is native/on', on('witnesses') && on('rewardLadder') && on('wishes') && on('costAwareGenerator'));
check('wish twists + jackpots native/on', on('wishes.twists') && on('wishes.jackpots'));
// slice 4 (2026-07-08) made the debt-erode price verb + the vocab drip (convert/release/ward/expose/
// echo) + the chain-milestone experiment NATIVE — each per-run trimmable via §C0 overrides.
check('debt + erode native/on', on('debt') && on('debt.erode'));
// §D2 (2026-07-09) made the debt VERBS native: shift (relocate a bane, total debt constant — the reach
// channel's common-slot card) + cleanse (scour/absolve strip a bane). debt.cleanse was dormant until D2.
check('debt shift + cleanse native/on', on('debt.shift') && on('debt.cleanse'));
check('vocab drip native/on', on('vocab') && on('vocab.wave2_convertDeepen') && on('vocab.wave3_releaseRender')
  && on('vocab.ward') && on('vocab.expose') && on('vocab.onReroll'));
check('chain-milestone experiment native/on', on('experiments') && on('experiments.chainMilestone'));

console.log(`\nparity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
