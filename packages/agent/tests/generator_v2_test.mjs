// =============================================================================
// GENERATOR v2 — G2 INTEGRATION TEST  (the joint probe wired into the generator
// + the session: honesty, telemetry, and flag-off NEUTRALITY)
// -----------------------------------------------------------------------------
// Covers the WIRING (probe_test covers the evaluator itself):
//   HONESTY   — with the joint probe on, a WARPED segment's serialized rung
//               reach_estimates differ from its unwarped twin (the seed-77 lie,
//               fixed); the reachCaveat retires on that path (present flag-off,
//               absent flag-on).
//   TELEMETRY — s.generator = { power, pSnapPredicted } appears flag-on, absent
//               flag-off; the joint path keeps the 3-distinct-colour invariant.
//   NEUTRALITY— flag-off, generateSegment IGNORES the new opts (warps/twist/
//               offeredRerolls) and is deterministic (the byte-identity-vs-HEAD
//               proof is the worktree stream diff, reported separately).
// =============================================================================
import { BALANCE } from '../../engine/balance.js';
import { makeRng } from '../../engine/engine.js';
import { generateSegment, resetShapeMemory } from '../../engine/generator.js';
import { newRun, serializeState } from '../session.mjs';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  FAIL:', name); } };

const F = (s) => ({ symbol: s, mag: 1, state: 'live' });
const HAND = { dice: [
  ['body', 'body', 'mind'], ['body', 'spirit', 'charm'], ['mind', 'spirit', 'mana'],
  ['mind', 'mind', 'spirit'], ['charm', 'body', 'spirit'], ['spirit', 'mind', 'body'],
].map(syms => ({ faces: syms.map(F) })) };

const KEEP_CAP = { kind: 'keepCap', params: { count: 1 } };   // a strong warp — a clear reach delta when priced

const setJoint = on => { BALANCE.generator2.enabled = on; BALANCE.generator2.jointProbe = on; };
const rungsJSON = seg => JSON.stringify(seg.rungs.map(r => ({ req: r.req, p: r._p })));

// ---- NEUTRALITY (flag-off): new opts ignored, output deterministic -----------------
{
  setJoint(false);
  try {
    resetShapeMemory(); const a = generateSegment(HAND, {}, { rng: makeRng(77), segIndex: 0, warps: [KEEP_CAP], twist: { kind: 'mirror' } });
    resetShapeMemory(); const b = generateSegment(HAND, {}, { rng: makeRng(77), segIndex: 0 });   // no new opts at all
    check('flag-off: warps/twist opts are IGNORED (byte-identical rungs)', rungsJSON(a) === rungsJSON(b));
    check('flag-off: no telemetry attached', a.generator === undefined && b.generator === undefined);
    resetShapeMemory(); const c = generateSegment(HAND, {}, { rng: makeRng(77), segIndex: 0 });
    check('flag-off: deterministic', rungsJSON(b) === rungsJSON(c));
  } finally { setJoint(false); }
}

// ---- HONESTY: a warped segment prices differently from its unwarped twin ------------
{
  setJoint(true);
  try {
    resetShapeMemory(); const warped   = generateSegment(HAND, {}, { rng: makeRng(77), segIndex: 0, warps: [KEEP_CAP] });
    resetShapeMemory(); const unwarped = generateSegment(HAND, {}, { rng: makeRng(77), segIndex: 0, warps: [] });
    check('flag-on: warped rungs differ from unwarped twin (the seed-77 lie, fixed)', rungsJSON(warped) !== rungsJSON(unwarped));
    check('flag-on: 3 distinct colours (joint path)', new Set(warped.rungs.map(r => r.colour)).size === 3);
    check('flag-on: every reach_estimate in [0,1]', warped.rungs.every(r => r._p >= 0 && r._p <= 1));
    check('flag-on: telemetry present + shaped', warped.generator
      && typeof warped.generator.power === 'number' && warped.generator.power >= 0 && warped.generator.power <= 1
      && typeof warped.generator.pSnapPredicted === 'number' && warped.generator.pSnapPredicted >= 0 && warped.generator.pSnapPredicted <= 1);
    check('flag-on: deterministic (same seed → same rungs + telemetry)', (() => {
      resetShapeMemory(); const w2 = generateSegment(HAND, {}, { rng: makeRng(77), segIndex: 0, warps: [KEEP_CAP] });
      return rungsJSON(w2) === rungsJSON(warped) && JSON.stringify(w2.generator) === JSON.stringify(warped.generator);
    })());
  } finally { setJoint(false); }
}

// ---- SESSION: s.generator telemetry present flag-on, absent flag-off ----------------
{
  setJoint(true);
  try {
    newRun(4242, {});
    const s = serializeState();
    check('session flag-on: s.generator present', s.generator && typeof s.generator.power === 'number' && typeof s.generator.pSnapPredicted === 'number');
    check('session flag-on: reach_estimates present on rungs', s.rungs.every(r => typeof r.reach_estimate === 'number'));
  } finally { setJoint(false); }
  setJoint(false);
  newRun(4242, {});
  check('session flag-off: s.generator absent', serializeState().generator === undefined);
}

// ---- SESSION: reachCaveat retires flag-on, stays flag-off (with debt) ---------------
{
  // enchTest injects a forced on_roll reroll bane on die 0's faces → a debt hand
  setJoint(false);
  newRun(4242, { enchTest: true });
  const off = serializeState();
  check('session flag-off + debt: reachCaveat PRESENT', off.reachCaveat && off.reachCaveat.banedFaces > 0);

  setJoint(true);
  try {
    newRun(4242, { enchTest: true });
    const on = serializeState();
    check('session flag-on + debt: reachCaveat SUPPRESSED (honest estimates)', on.reachCaveat === undefined);
    check('session flag-on + debt: telemetry still present', on.generator && typeof on.generator.power === 'number');
  } finally { setJoint(false); }
}

console.log(`\ngenerator v2 (G2 wiring): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
