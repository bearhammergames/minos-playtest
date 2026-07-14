// =============================================================================
// WISHES TEST  (Modifier Stack §6 — the patron-wish registry)
// -----------------------------------------------------------------------------
// Verifies the wish data validates, the CONSTRAINT species' warps dispatch through
// the SAME ritual.js as the curses (no new engine branch), the v2 TWIST / JACKPOT
// species carry their closed-vocab fields, payouts are granted verbs (never score),
// generateWish is seeded/valid-by-construction, and species inclusion is GATE-FIRST
// (twists/jackpots OFF ⇒ the constraint-only pool + rng draw is byte-identical).
// =============================================================================
import { WISHES, WISH_SPECIES, PAYOUT_KINDS, validateWish, validateAll, generateWish } from '../wishes.js';
import { keepConstraints, rollBudget, validateWarp, TWIST_KINDS, JACKPOT_KINDS } from '../../engine/ritual.js';
import { BALANCE } from '../../engine/balance.js';
import { makeRng } from '../../engine/engine.js';

let pass = 0, fail = 0;
const check = (n, c) => { if (c) pass++; else { fail++; console.error('  FAIL:', n); } };

check('3 species', WISH_SPECIES.length === 3);
check('validateAll() ok', validateAll().ok);

// ---- CONSTRAINT species: warp dispatches through ritual.js (twists/jackpots carry no warp) ----
for (const w of Object.values(WISHES).filter(w => w.species === 'constraint'))
  check(`${w.id} warp is a valid ritual warp`, validateWarp(w.warp).ok);

// the constraint wishes dispatch to the right constraints (reusing the curse dispatch)
check('grasping_widow → keepCap 2', keepConstraints([WISHES.grasping_widow.warp]).cap === 2);
check('hasty_one → rollLimit 2',    rollBudget([WISHES.hasty_one.warp]).maxRolls === 2);
check('soaked_scholar → forcedKeep mana', keepConstraints([WISHES.soaked_scholar.warp]).forced.includes('mana'));
// Part A — the new constraint on the already-live rerollOnRoll surface
check('fevered_one → rerollOnRoll body', WISHES.fevered_one.warp.kind === 'rerollOnRoll' && WISHES.fevered_one.warp.params.symbol === 'body');
check('fevered_one warp valid', validateWarp(WISHES.fevered_one.warp).ok);

// ---- TWIST species (Part B): closed-vocab twist {kind} in TWIST_KINDS, no warp ----
for (const w of Object.values(WISHES).filter(w => w.species === 'twist')){
  check(`${w.id} carries a twist.kind in vocabulary`, w.twist && TWIST_KINDS.includes(w.twist.kind));
  check(`${w.id} carries NO warp (twists don't impose ritual constraints)`, !w.warp);
}
check('mirrored_one → mirror', WISHES.mirrored_one.twist.kind === 'mirror');
check('veiled_one → veil',     WISHES.veiled_one.twist.kind === 'veil');
check('generous_one → freeReroll', WISHES.generous_one.twist.kind === 'freeReroll');

// ---- JACKPOT species (Part C): closed-vocab jackpot {kind, numeric n}, no warp ----
for (const w of Object.values(WISHES).filter(w => w.species === 'jackpot')){
  check(`${w.id} carries a jackpot.kind in vocabulary`, w.jackpot && JACKPOT_KINDS.includes(w.jackpot.kind));
  check(`${w.id} carries a numeric jackpot.n (disclosed score payout)`, typeof w.jackpot.n === 'number');
  check(`${w.id} carries NO warp + NO score payout (jackpots pay via the contract line)`, !w.warp);
}
check('spotless_one → spotless', WISHES.spotless_one.jackpot.kind === 'spotless');
check('chain_keeper → chainAlive (patronLen-scaled, no fixed len)', WISHES.chain_keeper.jackpot.kind === 'chainAlive' && WISHES.chain_keeper.jackpot.params.len === undefined);   // §post-G3 Fix 3 — target is now patronLen (ctx-supplied), not a fixed 4
check('fang_fancier → fangCourt n 3', WISHES.fang_fancier.jackpot.kind === 'fangCourt' && WISHES.fang_fancier.jackpot.params.n === 3);

// payouts (where present) are GRANTED VERBS, never a score delta (Wish Law 1 / AP#6)
for (const w of Object.values(WISHES)) check(`${w.id} payout is a granted verb`, !w.payout || PAYOUT_KINDS.includes(w.payout.kind));

// ---- generateWish: seeded, valid-by-construction, filterable ----
let seed = 999;
const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
for (let i = 0; i < 20; i++) check(`generateWish #${i} valid`, validateWish(generateWish(rng)).ok);
check('species filter', generateWish(rng, { species: 'constraint' }).species === 'constraint');

// ---- Part D — GATE-FIRST species inclusion (determinism firewall) ----
// A reference draw over the constraint-only pool (same order/weights as the registry). With
// twists/jackpots OFF, generateWish MUST produce the byte-identical single-rng() draw.
const CONSTRAINTS = Object.values(WISHES).filter(w => w.species === 'constraint');
function drawFrom(pool, r){ const total = pool.reduce((s, w) => s + (w.weight || 1), 0); let x = r() * total; for (const w of pool){ x -= (w.weight || 1); if (x < 0) return w.id; } return pool[pool.length - 1].id; }
{
  const savT = BALANCE.wishes.twists, savJ = BALANCE.wishes.jackpots, savE = BALANCE.wishes.enabled;
  BALANCE.wishes.enabled = true; BALANCE.wishes.twists = false; BALANCE.wishes.jackpots = false;
  let identical = true, allConstraint = true;
  for (let s = 1; s <= 250; s++){
    const got = generateWish(makeRng(s)).id;
    if (got !== drawFrom(CONSTRAINTS, makeRng(s))) identical = false;
    if (!CONSTRAINTS.some(w => w.id === got)) allConstraint = false;
  }
  check('twists/jackpots OFF: pool is constraint-only (250 seeds)', allConstraint);
  check('twists/jackpots OFF: draw is byte-identical to a constraint-only pool', identical);

  // flags ON: twists AND jackpots can now roll (native default)
  BALANCE.wishes.twists = true; BALANCE.wishes.jackpots = true;
  let sawTwist = false, sawJackpot = false;
  for (let s = 1; s <= 500; s++){ const sp = generateWish(makeRng(s)).species; if (sp === 'twist') sawTwist = true; if (sp === 'jackpot') sawJackpot = true; }
  check('twists ON: a twist can roll', sawTwist);
  check('jackpots ON: a jackpot can roll', sawJackpot);

  // one flag on, one off: the off species never rolls
  BALANCE.wishes.twists = true; BALANCE.wishes.jackpots = false;
  let sawJackpot2 = false;
  for (let s = 1; s <= 500; s++){ if (generateWish(makeRng(s)).species === 'jackpot') sawJackpot2 = true; }
  check('jackpots OFF (twists on): no jackpot rolls', !sawJackpot2);

  BALANCE.wishes.twists = savT; BALANCE.wishes.jackpots = savJ; BALANCE.wishes.enabled = savE;
}

// ---- validation rejects the bad shapes ----
check('bad species rejected', !validateWish({ id:'x', species:'nope', warp:{ kind:'keepCap' } }).ok);
check('constraint missing warp rejected', !validateWish({ id:'x', species:'constraint' }).ok);
check('twist missing twist.kind rejected', !validateWish({ id:'x', species:'twist' }).ok);
check('twist bad twist.kind rejected', !validateWish({ id:'x', species:'twist', twist:{ kind:'nope' } }).ok);
check('jackpot missing jackpot rejected', !validateWish({ id:'x', species:'jackpot' }).ok);
check('jackpot non-numeric n rejected', !validateWish({ id:'x', species:'jackpot', jackpot:{ kind:'spotless' } }).ok);
check('score payout rejected', !validateWish({ id:'x', species:'constraint', warp:{ kind:'keepCap' }, payout:{ kind:'score' } }).ok);

console.log(`\nwishes: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
