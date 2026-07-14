// =============================================================================
// TRIM SUBSTRATE TEST  (ModifierList v2 §8 step-1 — the dev-panel trim substrate)
// -----------------------------------------------------------------------------
// Proves the run-config trim layer that every later slice's content must be
// toggleable through:
//   (a) NEUTRALITY — an empty override map + empty disabled set is byte-identical
//       (events AND full serialized-state stream) to making no trim calls at all;
//   (b) SYSTEM TOGGLE — a balance override flips a real gate: {'rewardLadder.enabled':
//       false} routes the perk phase to the legacy drawPerks offer (observable diff),
//       and the trim state is echoed in state.config;
//   (c) CONTENT TRIM — a disabled ladder-boon id never appears in offers, and a
//       disabled wish id never rolls (composer-level sweeps + a control that proves
//       they DO appear otherwise), plus same-seed + same-trim determinism.
//
// Drives the REAL session core (session.mjs) + the balance/composer seams directly,
// so it exercises the whole channel: new_run opts → applyRunConfig → balance.js →
// on()/isContentEnabled → the live composers → serializeState echo.
// =============================================================================
import { act, serializeState } from '../session.mjs';
import {
  setBalanceOverrides, clearBalanceOverrides, getBalanceOverrides,
  setDisabledContent, getDisabledContent, on,
} from '../../engine/balance.js';
import { makeRng } from '../../engine/engine.js';
import { drawLadder } from '../../engine/reward_ladder.js';
import { generateWish } from '../../content/wishes.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  FAIL:', name); } };

// A deterministic "keep toward the most reachable rung, resolve when met" policy — enough
// to weave a full run. Captures every event AND the full serialized state after each act,
// so neutrality/determinism are compared over the WHOLE run, not just the final score.
function playCapture(newRunAction){
  let r = act(newRunAction);
  const events = [...(r.events || [])];
  const states = [JSON.stringify(r.state)];
  let st = r.state, guard = 0;
  while (!st.over && guard++ < 1500){
    let a;
    if (st.phase === 'perk') a = { type: 'perk', card: 0 };
    else if (st.phase === 'transform') a = { type: 'transform', skip: true };
    else if (st.phase === 'stitch') a = { type: 'stitch' };
    else if (st.phase === 'segment' || st.phase === 'knot'){
      if ((st.spinsTaken || 0) === 0) a = { type: 'spin' };
      else {
        const target = [...st.rungs].sort((x, y) => (y.reach_estimate || 0) - (x.reach_estimate || 0))[0];
        const need = { ...target.req };
        for (const t of st.tray) if (t.kept && need[t.symbol]) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag || 1));
        const kd = (st.tray || []).find(t => !t.kept && !t.locked && t.symbol !== 'blank' && t.symbol !== 'fang' && (need[t.symbol] || 0) > 0);
        if (kd) a = { type: 'keep', i: kd.i };
        else if ((st.metNow || []).length > 0 || (st.rollsLeft || 0) <= 0) a = { type: 'resolve' };
        else a = { type: 'spin' };
      }
    } else break;
    r = act(a);
    events.push(...(r.events || []));
    states.push(JSON.stringify(r.state));
    st = r.state;
  }
  return { events, states };
}

// Play until the perk phase (or the run ends) and return that state — for the gate-flip test.
function playToPerk(newRunAction){
  let r = act(newRunAction);
  let st = r.state, guard = 0;
  while (!st.over && st.phase !== 'perk' && guard++ < 400){
    let a;
    if (st.phase === 'transform') a = { type: 'transform', skip: true };
    else if (st.phase === 'stitch') a = { type: 'stitch' };
    else if (st.phase === 'segment' || st.phase === 'knot'){
      if ((st.spinsTaken || 0) === 0) a = { type: 'spin' };
      else {
        const target = [...st.rungs].sort((x, y) => (y.reach_estimate || 0) - (x.reach_estimate || 0))[0];
        const need = { ...target.req };
        for (const t of st.tray) if (t.kept && need[t.symbol]) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag || 1));
        const kd = (st.tray || []).find(t => !t.kept && !t.locked && t.symbol !== 'blank' && t.symbol !== 'fang' && (need[t.symbol] || 0) > 0);
        if (kd) a = { type: 'keep', i: kd.i };
        else if ((st.metNow || []).length > 0 || (st.rollsLeft || 0) <= 0) a = { type: 'resolve' };
        else a = { type: 'spin' };
      }
    } else break;
    r = act(a);
    st = r.state;
  }
  return st.phase === 'perk' ? st : null;
}

// =============================================================================
// (a) NEUTRALITY — MUST run FIRST, while the module is pristine, so the CONTROL branch
// truly makes NO trim-setter calls (the faithful "no calls at all" baseline).
// =============================================================================
for (const seed of [12345, 20260708, 8919]){
  const control = playCapture({ type: 'new_run', seed });               // zero trim-setter calls
  setBalanceOverrides({}); setDisabledContent([]);                       // the explicit empty trim
  const empty = playCapture({ type: 'new_run', seed });
  check(`neutral seed ${seed}: same event stream`, JSON.stringify(control.events) === JSON.stringify(empty.events));
  check(`neutral seed ${seed}: same serialized-state stream`, JSON.stringify(control.states) === JSON.stringify(empty.states));
  check(`neutral seed ${seed}: no config key emitted (state byte-identical to today)`,
    !JSON.parse(control.states[0]).config && !JSON.parse(empty.states[0]).config);
  clearBalanceOverrides(); setDisabledContent([]);
}

// =============================================================================
// (b) SYSTEM TOGGLE — {'rewardLadder.enabled': false} flips the perk phase from the
// Reward Ladder (graded draw + state.draw) to the legacy drawPerks offer (no grade,
// no draw). Driven through the SESSION CONFIG channel (new_run.balance), so the whole
// plumbing is exercised, and the trim is echoed in state.config.
// =============================================================================
clearBalanceOverrides(); setDisabledContent([]);
const ladder = playToPerk({ type: 'new_run', seed: 777, balance: {} });                              // ladder ON (explicit empty ⇒ clean ambient)
const legacy = playToPerk({ type: 'new_run', seed: 777, balance: { 'rewardLadder.enabled': false } }); // ladder OFF ⇒ legacy path

check('ladder path reached a perk offer', ladder != null);
check('legacy path reached a perk offer', legacy != null);
if (ladder && legacy){
  check('ladder path: state.draw present (graded draw)', ladder.draw != null);
  check('ladder path: perk cards carry a grade', ladder.perkOffer.length > 0 && ladder.perkOffer.every(c => c.grade));
  check('override flips gate: legacy path has NO state.draw', legacy.draw == null);
  check('override flips gate: legacy perk cards carry NO grade', legacy.perkOffer.every(c => c.grade === undefined));
  check('the flip is observable (offer differs)', JSON.stringify(ladder.perkOffer) !== JSON.stringify(legacy.perkOffer));
}
check('trim echoed in state.config', legacy != null && legacy.config && legacy.config.balance['rewardLadder.enabled'] === false);
check('untrimmed run emits no config key', ladder != null && ladder.config === undefined);
clearBalanceOverrides(); setDisabledContent([]);

// =============================================================================
// (c) CONTENT TRIM — a disabled id vanishes from the LIVE composer pools (with a control
// that proves it appears otherwise), and the disabled set never crashes a composer.
// =============================================================================
// ---- ladder boon: shift_bane (§D2 — the reach channel's COMMON card; it fills the floor/ash reach
//      slot that used to WIDEN on a miss, so it now surfaces in EVERY floor reach offer, making it the
//      clean trim target. (reweave — uncommon — no longer surfaces in floor draws after the D2 common-
//      slot fill.) draft cards carry no `boon`, so guard the access) ----
setDisabledContent([]);
let ctrlShift = 0;
for (let s = 1; s <= 300; s++){ const d = drawLadder({ tier: 'floor', metTiers: ['floor'] }, makeRng(s)); if (d.cards.some(c => c.boon && c.boon.id === 'shift_bane')) ctrlShift++; }
setDisabledContent(['shift_bane']);
let trimShift = 0;
for (let s = 1; s <= 300; s++){ const d = drawLadder({ tier: 'floor', metTiers: ['floor'] }, makeRng(s)); if (d.cards.some(c => c.boon && c.boon.id === 'shift_bane')) trimShift++; }
check('control: shift_bane DOES appear in ladder reach offers', ctrlShift > 0);
check('disabled ladder-boon id never appears in offers (300 seeds)', trimShift === 0);

// ---- wish: hasty_one (1 of 3 constraint wishes) ----
setDisabledContent([]);
let ctrlWish = 0;
for (let s = 1; s <= 300; s++){ if (generateWish(makeRng(s)).id === 'hasty_one') ctrlWish++; }
setDisabledContent(['hasty_one']);
let trimWish = 0;
for (let s = 1; s <= 300; s++){ if (generateWish(makeRng(s)).id === 'hasty_one') trimWish++; }
check('control: hasty_one DOES roll', ctrlWish > 0);
check('disabled wish id never rolls (300 seeds)', trimWish === 0);

// over-trim guard: disabling EVERY wish must not crash (falls through to the full pool).
setDisabledContent(['grasping_widow', 'hasty_one', 'soaked_scholar']);
let overTrimOk = true;
try { for (let s = 1; s <= 20; s++) if (!generateWish(makeRng(s))) overTrimOk = false; } catch { overTrimOk = false; }
check('over-trimming a whole pool never crashes the composer', overTrimOk);
clearBalanceOverrides(); setDisabledContent([]);

// =============================================================================
// (d) DETERMINISM — same seed + same trim + same actions ⇒ identical run.
// =============================================================================
setBalanceOverrides({ 'rewardLadder.mixedDraw': false });
setDisabledContent(['reweave']);
const d1 = playCapture({ type: 'new_run', seed: 555 });
const d2 = playCapture({ type: 'new_run', seed: 555 });
check('same seed + same trim → identical event stream', JSON.stringify(d1.events) === JSON.stringify(d2.events));
check('same seed + same trim → identical state stream',  JSON.stringify(d1.states) === JSON.stringify(d2.states));
check('the applied trim is still ambient after the run', getBalanceOverrides()['rewardLadder.mixedDraw'] === false && getDisabledContent().includes('reweave'));
clearBalanceOverrides(); setDisabledContent([]);

console.log(`\ntrim substrate: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
