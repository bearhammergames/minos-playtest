// =============================================================================
// RITUAL TEST  (Modifier Stack §6 — the ritual-warp dispatch + the C0 migration)
// -----------------------------------------------------------------------------
// Verifies the pure dispatch is id-BLIND (Law L1) and that the 2 LIVE curses'
// warps produce exactly the constraints the old id-branch produced (keepCap 2 /
// lockDice 1) — the contract the C0 migration must preserve.
// =============================================================================
import { RITUAL_KINDS, validateWarp, keepConstraints, spinConstraints, rollBudget, warpView } from '../ritual.js';
import { CURSES } from '../spellspun.js';

let pass = 0, fail = 0;
const check = (n, c) => { if (c) pass++; else { fail++; console.error('  FAIL:', n); } };

check('6 ritual kinds', RITUAL_KINDS.length === 6);

// ---- the 2 live curses' warps (the C0 contract) ----
const grasping = CURSES.find(c => c.id === 'grasping').warp;
const rollLock = CURSES.find(c => c.id === 'roll_lock').warp;
check('grasping warp valid',      validateWarp(grasping).ok);
check('roll_lock warp valid',     validateWarp(rollLock).ok);
check('grasping → keepCap 2',     keepConstraints([grasping]).cap === 2);
check('roll_lock → lockDice 1',   spinConstraints([rollLock]).lockCount === 1);
check('grasping → no lockCount',  spinConstraints([grasping]).lockCount === 0);
check('roll_lock → no keepCap',   keepConstraints([rollLock]).cap === 0);
check('both → cap 2 + lock 1',    keepConstraints([grasping, rollLock]).cap === 2 && spinConstraints([grasping, rollLock]).lockCount === 1);

// ---- the wish kinds (dispatch present; enforcement lands with the wish waves) ----
check('rollLimit → maxRolls',     rollBudget([{ kind:'rollLimit', params:{ rolls:2 } }]).maxRolls === 2);
check('forcedKeep → forced sym',  keepConstraints([{ kind:'forcedKeep', params:{ symbol:'mana' } }]).forced.includes('mana'));
check('rerollOnRoll → rerolls',   spinConstraints([{ kind:'rerollOnRoll', params:{ symbol:'body', count:1 } }]).rerolls.length === 1);
check('lockFirstKeeps → lockFirst', keepConstraints([{ kind:'lockFirstKeeps', params:{ count:2 } }]).lockFirst === 2);

// ---- strictest-wins, id-blindness, empties, validation ----
check('strictest keepCap wins',   keepConstraints([{ kind:'keepCap', params:{ count:3 } }, { kind:'keepCap', params:{ count:1 } }]).cap === 1);
check('lockDice stacks',          spinConstraints([{ kind:'lockDice', params:{ count:1 } }, { kind:'lockDice', params:{ count:2 } }]).lockCount === 3);
check('id-blind (source ignored)', keepConstraints([{ kind:'keepCap', params:{ count:2 }, source:'a' }]).cap === keepConstraints([{ kind:'keepCap', params:{ count:2 }, source:'b' }]).cap);
check('empty → no constraints',   keepConstraints([]).cap === 0 && spinConstraints([]).lockCount === 0 && rollBudget([]).maxRolls === null);
check('bad kind rejected',        !validateWarp({ kind:'smite' }).ok);
check('forcedKeep needs symbol',  !validateWarp({ kind:'forcedKeep', params:{} }).ok);

// ---- warpView (state/telemetry) ----
const v = warpView([grasping, rollLock]);
check('warpView keepCap+lockDice', v.keepCap === 2 && v.lockDice === 1);

console.log(`\nritual: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
