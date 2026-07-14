// Unit tests for the face-debuff class (item D). Run: node registry/_debuffs_test.mjs
import { FLAGS } from '../../engine/flags.js';
import {
  FACE_DEBUFFS, debuffMeta,
  debuffsOf, hasDebuff, faceHasPermanentDebuff, addDebuff,
  clearEncounterDebuffs, healOneDebuff,
  assignAgeDebuff, assignRiteDebuff,
} from '../debuffs.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) pass++; else { fail++; console.log('  FAIL:', name); } };
const freshHand = () => ({ dice: [
  { _name: 'A', faces: [{ state: 'live', symbol: 'mind', mag: 1 }, { state: 'live', symbol: 'body', mag: 1 }] },
  { _name: 'B', faces: [{ state: 'live', symbol: 'spirit', mag: 1 }] },
] });
const ALWAYS = () => 0;          // rng that always clears the frequency gate + picks index 0
const NEVER  = () => 0.999;      // rng that never clears the frequency gate

// ── vocabulary ──────────────────────────────────────────────────────────────
check('vocab has the 4 chosen kinds', ['lock_on_roll','muted','brittle','veiled'].every(k => FACE_DEBUFFS[k]));
check('debuffMeta returns label+glyph', debuffMeta('lock_on_roll')?.label === 'Bound' && !!debuffMeta('lock_on_roll')?.glyph);
check('debuffMeta unknown -> null', debuffMeta('nope') === null);

// ── pure helpers ─────────────────────────────────────────────────────────────
{
  const f = {};
  addDebuff(f, 'muted', 'permanent', 'age');
  check('addDebuff attaches', hasDebuff(f, 'muted') && debuffsOf(f).length === 1);
  addDebuff(f, 'muted', 'permanent', 'age');
  check('addDebuff never stacks the same kind', debuffsOf(f).length === 1);
  addDebuff(f, 'brittle', 'encounter', 'rite');
  check('addDebuff adds distinct kinds', debuffsOf(f).length === 2);
  check('faceHasPermanentDebuff sees the permanent one', faceHasPermanentDebuff(f));
}
{
  const f = { debuffs: [{ kind: 'lock_on_roll', lifetime: 'permanent' }, { kind: 'veiled', lifetime: 'encounter' }] };
  const removed = healOneDebuff(f);
  check('healOneDebuff removes a PERMANENT one', removed?.lifetime === 'permanent' && debuffsOf(f).length === 1);
  check('healOneDebuff leaves the encounter one', hasDebuff(f, 'veiled'));
  healOneDebuff(f);   // only an encounter debuff remains -> nothing to heal
  check('healOneDebuff returns null when no permanent left', debuffsOf(f).length === 1 && hasDebuff(f, 'veiled'));
}
{
  const hand = freshHand();
  hand.dice[0].faces[0].debuffs = [{ kind: 'lock_on_roll', lifetime: 'permanent' }, { kind: 'muted', lifetime: 'encounter' }];
  hand.dice[1].faces[0].debuffs = [{ kind: 'veiled', lifetime: 'encounter' }];
  clearEncounterDebuffs(hand);
  check('clearEncounterDebuffs drops encounter, keeps permanent', hasDebuff(hand.dice[0].faces[0], 'lock_on_roll') && !hasDebuff(hand.dice[0].faces[0], 'muted'));
  check('clearEncounterDebuffs clears a fully-encounter face', debuffsOf(hand.dice[1].faces[0]).length === 0);
}

// ── gated assigners: OFF draws zero rng + mutates nothing ─────────────────────
const wasOn = FLAGS.faceDebuffs;
FLAGS.faceDebuffs = false;
{
  let rngCalls = 0; const rng = () => { rngCalls++; return 0; };
  const hand = freshHand();
  const r1 = assignAgeDebuff(hand, 'old', rng);
  const pil = {}; const r2 = assignRiteDebuff(pil, hand, 'old', rng);
  check('OFF: assignAgeDebuff is a no-op', r1 === null);
  check('OFF: assignRiteDebuff is a no-op', r2 === null && !pil.riteDebuff);
  check('OFF: assigners draw ZERO rng (byte-identical)', rngCalls === 0);
  check('OFF: no debuffs attached', hand.dice.every(d => d.faces.every(f => !(f.debuffs && f.debuffs.length))));
}

// ── gated assigners: ON ──────────────────────────────────────────────────────
FLAGS.faceDebuffs = true;
{
  const hand = freshHand();
  const r = assignAgeDebuff(hand, 'old', ALWAYS);
  check('ON old: assignAgeDebuff attaches a PERMANENT debuff', r && faceHasPermanentDebuff(hand.dice[r.di].faces[r.fi]));
  check('ON: the attached age debuff is from the AGE pool', r && ['lock_on_roll','brittle','muted'].includes(r.kind));
}
{
  const hand = freshHand();
  check('ON youth: assignAgeDebuff never fires (youth-protected)', assignAgeDebuff(hand, 'youth', ALWAYS) === null);
  check('ON: high-roll rng skips the frequency gate', assignAgeDebuff(freshHand(), 'old', NEVER) === null);
}
{
  const hand = freshHand(); const pil = {};
  const r = assignRiteDebuff(pil, hand, 'old', ALWAYS);
  check('ON: assignRiteDebuff sets pilgrim.riteDebuff', r && pil.riteDebuff && pil.riteDebuff.kind === r.kind);
  check('ON: rite debuff is ENCOUNTER lifetime on the bound die', hand.dice[r.di].faces.every(f => f.state !== 'live' || debuffsOf(f).some(d => d.lifetime === 'encounter')));
  check('ON: rite kind is from the RITE pool', ['lock_on_roll','muted','veiled'].includes(r.kind));
}
FLAGS.faceDebuffs = wasOn;

console.log(`\nface-debuff class (item D): ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
