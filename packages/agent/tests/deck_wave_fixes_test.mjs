// =============================================================================
// DECK WAVE FIXES TEST (2026-07-09 playtest batch — Fixes 1–5)
// -----------------------------------------------------------------------------
// The playtest-found batch on branch `deck-wave`:
//   Fix 1 — within-draw reach DEDUPE: an ash/stitch/trade/royal draw never offers duplicate reach
//           ids while a distinct card exists; the exhaustion fallback still fills the draw (dup allowed
//           only when the whole channel is used up).
//   Fix 2 — shift_bane is `neverRider` (pure relocation adds no debt); scour/absolve STILL ride (they
//           remove debt — the Station-Rule price).
//   Fix 3 — graft_face uncommon→common: it draws at ASH grade and the common reach pool is
//           {shift_bane, graft_face}, both reachable.
//   Fix 4 — lien/rider placement avoids IDENTICAL STACKING: repeated same-name banes never stack on one
//           face while a clean face exists; the full-stack fallback works once every face carries it.
//   Fix 5 — reachCaveat present EXACTLY when warps or forced-bane faces exist; absent on a clean hand
//           (byte-identical serialization); + determinism of the whole default pipeline.
// Drives the REAL session core + the pure ladder composer. Not a KNOWN_FAIL — a design gate.
// =============================================================================
import { newRun, act, serializeState, legalActions, configure, attachBane, _handRef } from '../session.mjs';
import { drawLadder } from '../../engine/reward_ladder.js';
import { makeRng } from '../../engine/engine.js';
import { setBalanceOverrides, clearBalanceOverrides, setDisabledContent, BALANCE } from '../../engine/balance.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };
const reachOf = d => d.cards.filter(c => c.kind === 'blessing');

const ALL_REACH = ['reweave', 'deepen', 'respin_sigil', 'flanking_sigil', 'wild_sigil', 'spinwrights_sigil',
  'open_hand', 'carvers_sigil', 'ward_sigil', 'augurs_sigil', 'echo_sigil',
  'graft_face', 'copy_etch', 'excise_face', 'cursed_graft', 'shift_bane', 'scour', 'absolve',
  'grinning_bargain', 'seers_bargain', 'louts_bargain'];

configure({}); clearBalanceOverrides(); setDisabledContent([]);

// =============================================================================
// FIX 1 — within-draw reach dedupe.
// =============================================================================
{
  clearBalanceOverrides(); setDisabledContent([]);
  // no draw offers duplicate reach ids while distinct cards exist (the full pool always has alternatives).
  let anyDup = false, sawMultiReach = false;
  for (const spec of [{ tier: 'true', metTiers: ['true'] }, { tier: 'true', metTiers: ['true'], stitched: true },
                      { tier: 'bloom', metTiers: ['bloom'] }, { tier: 'bloom', metTiers: ['floor', 'true', 'bloom'] }]){
    for (let s = 1; s <= 400; s++){
      const ids = reachOf(drawLadder(spec, makeRng(s * 7 + 1))).map(c => c.boon.id);
      if (ids.length >= 2) sawMultiReach = true;
      if (new Set(ids).size !== ids.length) anyDup = true;
    }
  }
  ok(sawMultiReach, 'Fix1: the sweep actually exercises multi-reach draws (≥2 reach cards)');
  ok(!anyDup, 'Fix1: no draw offers duplicate reach ids while distinct cards exist (1600 draws)');

  // the specific reported case: a STITCH draw (2 reach, common:100) used to ship Shift·Shift; now distinct.
  let stitchAllDistinct = true;
  for (let s = 1; s <= 300; s++){
    const ids = reachOf(drawLadder({ tier: 'true', metTiers: ['true'], stitched: true }, makeRng(s * 3 + 5))).map(c => c.boon.id);
    if (new Set(ids).size !== ids.length) stitchAllDistinct = false;
  }
  ok(stitchAllDistinct, 'Fix1: the stitch/ash draw (2 common reach slots) ships DISTINCT reach ids (the reported Shift·Shift twin is gone)');

  // EXHAUSTION FALLBACK — collapse the reach pool to a single card; the 2-reach stitch draw must still
  // FILL (both slots that one card — a duplicate allowed only when the whole channel is used up).
  setDisabledContent(ALL_REACH.filter(id => id !== 'shift_bane'));
  let filled = true, bothShift = true;
  for (let s = 1; s <= 100; s++){
    const reach = reachOf(drawLadder({ tier: 'true', metTiers: ['true'], stitched: true }, makeRng(s)));
    if (reach.length !== 2) filled = false;
    if (!reach.every(c => c.boon.id === 'shift_bane')) bothShift = false;
  }
  ok(filled && bothShift, 'Fix1: exhaustion fallback — a one-card reach pool still fills the 2-reach draw (dup allowed only when the channel is exhausted)');
  setDisabledContent([]);
}

// =============================================================================
// FIX 2 — shift_bane never rides; scour + absolve still do (Station Rule).
// =============================================================================
{
  clearBalanceOverrides(); setDisabledContent([]);
  // pin pureRiders OFF so a ridered card can't luck into pure (isolates the rider contract); witnesses off
  // ⇒ draft slots degrade to reach (more reach samples).
  setBalanceOverrides({ 'rewardLadder.pureRiders': false, 'witnesses.enabled': false });
  let sawShift = false, shiftEverRidered = false, scourRidered = false, absolveRidered = false;
  for (const tier of ['floor', 'true', 'bloom']) for (let s = 1; s <= 500; s++){
    for (const c of reachOf(drawLadder({ tier, metTiers: [tier] }, makeRng(s * 11 + 3)))){
      if (c.boon.id === 'shift_bane'){ sawShift = true; if (c.blemished || c.rider) shiftEverRidered = true; }
      if (c.boon.id === 'scour'   && c.blemished && c.rider) scourRidered = true;
      if (c.boon.id === 'absolve' && c.blemished && c.rider) absolveRidered = true;
    }
  }
  ok(sawShift && !shiftEverRidered, 'Fix2: shift_bane NEVER carries a rider (neverRider — pure relocation adds no debt)');
  ok(scourRidered && absolveRidered, 'Fix2: scour + absolve STILL ride a Station-Rule rider (they REMOVE debt — priced, deliberate)');
  clearBalanceOverrides(); setDisabledContent([]);
}

// =============================================================================
// FIX 3 — graft_face is a common that draws at ash; common pool = {shift_bane, graft_face}.
// =============================================================================
{
  clearBalanceOverrides(); setDisabledContent([]);
  let graftAtAsh = false, sawShift = false, sawGraft = false, graftRidesMildAtAsh = false;
  for (let s = 1; s <= 400; s++){
    for (const c of reachOf(drawLadder({ tier: 'floor', metTiers: ['floor'] }, makeRng(s)))){
      if (c.boon.id === 'graft_face'){ sawGraft = true; if (c.grade === 'ash' && c.rarity === 'common') graftAtAsh = true; }
      if (c.boon.id === 'shift_bane') sawShift = true;
    }
  }
  ok(graftAtAsh, 'Fix3: graft_face draws at ASH grade as a common (reachable before the survival wall)');
  ok(sawShift && sawGraft, 'Fix3: the common reach pool is {shift_bane, graft_face} — both reachable in the ash reach slot');

  // a common Graft at ash still RIDES mild (self-pricing holds — Station Rule): pin pureRiders off.
  setBalanceOverrides({ 'rewardLadder.pureRiders': false, 'witnesses.enabled': false });
  for (let s = 1; s <= 400 && !graftRidesMildAtAsh; s++)
    for (const c of reachOf(drawLadder({ tier: 'floor', metTiers: ['floor'] }, makeRng(s))))
      if (c.boon.id === 'graft_face' && c.grade === 'ash' && c.blemished && c.rider && c.rider.band === 'mild') graftRidesMildAtAsh = true;
  ok(graftRidesMildAtAsh, 'Fix3: a common Graft at ash still rides a MILD rider (self-pricing / Station Rule holds)');
  clearBalanceOverrides(); setDisabledContent([]);
}

// =============================================================================
// FIX 4 — identical-stacking avoidance in bane placement (attachBane).
// =============================================================================
{
  const mkBane = (() => { let n = 0; return () => ({ id: 'lien_' + (++n), name: 'Seized Spin', trigger: 'on_roll',
    condition: null, scope: 'random', effect: 'lock', polarity: 'bane', forced: true, lifetime: 'permanent',
    cost: {}, params: { count: 1 }, band: 'harsh' }); })();
  const countMax = hand => { let mx = 0, tot = 0; for (const d of hand.dice) for (const f of d.faces){
    const c = (f.ench || []).filter(e => e.name === 'Seized Spin').length; mx = Math.max(mx, c); tot += c; } return { mx, tot }; };

  newRun(123);
  const hand = _handRef();
  const totalFaces = hand.dice.reduce((n, d) => n + d.faces.length, 0);
  ok(totalFaces === 18, `Fix4: fresh hand has 18 faces (6×d3) to place onto (got ${totalFaces})`);
  let cleanWhilePossible = true;
  for (let k = 0; k < totalFaces; k++){ attachBane(mkBane()); if (countMax(hand).mx > 1) cleanWhilePossible = false; }
  ok(cleanWhilePossible, 'Fix4: repeated identical liens NEVER stack on one face while a clean face exists');
  const before = countMax(hand);
  ok(before.mx === 1 && before.tot === totalFaces, `Fix4: after ${totalFaces} liens every face carries exactly one (18 placed, no stack)`);
  attachBane(mkBane());   // 19th — every face now carries it ⇒ full-stack fallback stacks on the drawn face
  const after = countMax(hand);
  ok(after.mx === 2 && after.tot === totalFaces + 1, 'Fix4: full-stack fallback — once every face carries the bane, the next one stacks (deterministically)');

  // a DIFFERENT-name bane is placed freely even when every face already carries "Seized Spin" (match is by name).
  const other = { id: 'o', name: 'Slipspin', trigger: 'on_keep', condition: null, scope: 'random', effect: 'reroll',
    polarity: 'bane', forced: true, lifetime: 'permanent', cost: {}, params: { count: 1 }, band: 'mild' };
  const at = attachBane(other);
  ok((hand.dice[at.di].faces[at.fi].ench || []).some(e => e.name === 'Slipspin'),
     'Fix4: a different-name bane places freely (avoidance matches the NAME/shape, not any bane)');

  // determinism — the same seed + same placements land identically.
  const placeSig = seed => { newRun(seed); const h = _handRef(); const mk = (() => { let n = 0; return () =>
    ({ id: 't' + (++n), name: 'Seized Spin', trigger: 'on_roll', condition: null, scope: 'random', effect: 'lock',
      polarity: 'bane', forced: true, lifetime: 'permanent', cost: {}, params: { count: 1 }, band: 'harsh' }); })();
    const out = []; for (let k = 0; k < 5; k++) out.push(JSON.stringify(attachBane(mk()))); return out.join('|'); };
  ok(placeSig(777) === placeSig(777), 'Fix4: bane placement is deterministic (same seed ⇒ identical placements)');
}

// =============================================================================
// FIX 5 — reachCaveat present exactly when warps / forced-bane faces exist.
//   §G2 UPDATE (2026-07-09): the reachCaveat is now the LEGACY (flag-off) stopgap — with
//   generator2.jointProbe native-on, the reach_estimates ARE kernel-aware (priced with the
//   warps/twist/banes) so the caveat retires (spec §5, suppressed in serializeState). This
//   block forces jointProbe OFF to exercise the surviving stopgap path; the suppression-
//   when-on behavior is covered in generator_v2_test.mjs.
// =============================================================================
{
  configure({}); clearBalanceOverrides(); setDisabledContent([]);
  const jpWas = BALANCE.generator2.jointProbe; BALANCE.generator2.jointProbe = false;   // §G2 the caveat is the flag-off stopgap now
  const forcedBane = name => ({ id: name, name, trigger: 'on_roll', condition: null, scope: 'random', effect: 'lock',
    polarity: 'bane', forced: true, lifetime: 'permanent', cost: {}, params: { count: 1 }, band: 'harsh' });

  // clean hand (segment 1, no warps, no banes) ⇒ NO reachCaveat key (byte-identical serialization).
  newRun(5);
  ok(!('reachCaveat' in serializeState()), 'Fix5: a clean hand (no warps, no forced banes) has NO reachCaveat key (byte-identical)');

  // a forced bane on the hand ⇒ reachCaveat { warps:0, banedFaces:1 }.
  newRun(5); _handRef().dice[0].faces[0].ench = [forcedBane('Seized Spin')];
  let s = serializeState();
  ok(s.reachCaveat && s.reachCaveat.warps === 0 && s.reachCaveat.banedFaces === 1,
     `Fix5: one forced-bane face ⇒ reachCaveat {warps:0, banedFaces:1} (got ${JSON.stringify(s.reachCaveat)})`);

  // an active warp (injected curse warp) ⇒ reachCaveat { warps:1, banedFaces:0 }.
  newRun(5, { warps: [{ kind: 'keepCap', params: { count: 2 } }] });
  s = serializeState();
  ok(s.reachCaveat && s.reachCaveat.warps === 1 && s.reachCaveat.banedFaces === 0,
     `Fix5: an active warp ⇒ reachCaveat {warps:1, banedFaces:0} (got ${JSON.stringify(s.reachCaveat)})`);

  // both a warp AND two forced-bane faces ⇒ { warps:1, banedFaces:2 }.
  newRun(5, { warps: [{ kind: 'keepCap', params: { count: 2 } }] });
  const h = _handRef();
  h.dice[0].faces[0].ench = [forcedBane('Seized Spin')];
  h.dice[1].faces[1].ench = [forcedBane('Slipspin')];
  s = serializeState();
  ok(s.reachCaveat && s.reachCaveat.warps === 1 && s.reachCaveat.banedFaces === 2,
     `Fix5: warp + two baned faces ⇒ reachCaveat {warps:1, banedFaces:2} (got ${JSON.stringify(s.reachCaveat)})`);

  // a boon-only ench (a ward, polarity:'boon') does NOT trigger the caveat (match the polarity FIELD).
  newRun(5); _handRef().dice[0].faces[0].ench = [{ id: 'w', name: 'Ward', trigger: 'on_roll', condition: null,
    scope: 'self', effect: 'ward', polarity: 'boon', forced: true, lifetime: 'permanent', cost: {}, params: {} }];
  ok(!('reachCaveat' in serializeState()), 'Fix5: a boon ench (ward) does NOT raise the caveat (matches the polarity field, not the effect)');

  // byte-identity: a clean run (no riders / no wishes / never a fang) NEVER emits reachCaveat in any state.
  clearBalanceOverrides();
  let r = act({ type: 'new_run', seed: 4242, balance: { 'rewardLadder.blemishRiders': false, 'wishes.enabled': false, 'witnesses.enabled': false } });
  let st = r.state, guard = 0, everCaveat = false;
  while (!st.over && guard++ < 400){ if ('reachCaveat' in st) everCaveat = true; const a = clean(st, legalActions()); if (!a) break; r = act(a); st = r.state; }
  ok(!everCaveat, 'Fix5: a clean (no-rider/no-wish/no-fang) run never emits reachCaveat — the caveat is additive, byte-neutral on a clean hand');
  clearBalanceOverrides();
  BALANCE.generator2.jointProbe = jpWas;   // §G2 restore the native flag
}

// =============================================================================
// DETERMINISM — the whole default pipeline (dedupe + attachBane + reachCaveat) replays byte-for-byte.
// =============================================================================
{
  clearBalanceOverrides(); setDisabledContent([]); configure({});
  const playFull = seed => { let r = act({ type: 'new_run', seed }), g = 0; const stream = [];
    while (!r.state.over && g++ < 400){ const a = clean(r.state, legalActions()); if (!a) break; r = act(a); stream.push(JSON.stringify(a) + '#' + JSON.stringify(r.state.reachCaveat || null)); }
    return { stream: stream.join('|'), score: r.state.score }; };
  const a = playFull(20260709), b = playFull(20260709);
  ok(a.stream === b.stream && a.score === b.score, 'determinism: same seed + policy ⇒ identical action+caveat stream + score (the full default deck-wave pipeline)');
}

// a deterministic demo-style clean policy (keeps toward the most-reachable rung; never fangs).
function clean(st, legal){
  if (st.phase === 'perk'){ const p = legal.find(x => x.type === 'perk'); return p ? { type: 'perk', ...p.args } : null; }
  if (st.phase === 'stitch') return { type: 'stitch' };
  if (st.phase === 'transform') return { type: 'transform', skip: true };
  if (st.phase === 'segment' || st.phase === 'knot'){
    if (st.tray && (st.spinsTaken || 0) >= 1){
      const target = [...st.rungs].filter(x => x.req).sort((a, b) => (b.reach_estimate || 0) - (a.reach_estimate || 0))[0];
      if (target){
        const need = { ...target.req };
        for (const t of st.tray) if (t.kept && need[t.symbol]) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag || 1));
        for (const t of st.tray){
          if (t.kept || t.locked || t.symbol === 'blank' || t.symbol === 'fang') continue;
          if ((need[t.symbol] || 0) > 0 && legal.some(x => x.type === 'keep' && x.args?.i === t.i)) return { type: 'keep', i: t.i };
        }
      }
    }
    if ((st.metNow || []).length > 0) return { type: 'resolve' };
    if ((st.rollsLeft || 0) > 0) return { type: 'spin' };
    return { type: 'resolve' };
  }
  return null;
}

clearBalanceOverrides(); setDisabledContent([]); configure({});
console.log(`\ndeck wave fixes: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
