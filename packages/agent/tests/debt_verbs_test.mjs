// =============================================================================
// DEBT VERBS TEST (§D2 — the reach channel's relocate/cleanse cards + second_skin's channel)
// -----------------------------------------------------------------------------
// Drives the REAL session core. Covers:
//   • shift  — the EXACT bane ench object moves (identity ===); source loses / target gains;
//              shifting a D1 twin's bane leaves the cloned original untouched; a bane shifted
//              onto a later-EXCISED face dies with the face; bane polarity is DATA-DRIVEN
//              (a ward sharing the face is never grabbed); deterministic bare-auto parking.
//   • scour  — strips + erodes 1 pip (floor 1 — a mag-1 face scours free).  absolve — pure strip.
//   • all three FIZZLE hand-blind with a clear event when no bane is worn.
//   • legalActions enumerates (bane faces)×(other faces) for shift + (bane faces) for scour/absolve,
//     each + the bare auto pick; applying a card through the ladder moves/strips as expected.
//   • second_skin — a WORN consuming cleanse witness refuses exactly its 3 liens then the 4th
//     etches; charges count DOWN in state; not-worn / gate-off ⇒ inert (byte-identical); event text.
//   • pool gating — debt.shift/cleanse OFF ⇒ the reach pool is byte-identical to D1 HEAD (zero debt
//     rng); ON ⇒ the three cards are offered and Shift fills the reach channel's COMMON slot.
//   • determinism — a full run with the default (debt-on) pool replays byte-for-byte.
// The debt verbs + the lien interceptor + a live-hand accessor are exported (like the D1 face verbs)
// so the identity/charge asserts drive them directly, without fighting a play policy for banes.
// Not a KNOWN_FAIL — a design gate.
// =============================================================================
import { newRun, act, serializeState, legalActions, configure,
         shiftBane, scourBane, absolveBane, tryRefuseLien, firstBaneIdx, _handRef,
         copyEtchFace, exciseFace } from '../session.mjs';
import { drawLadder } from '../../engine/reward_ladder.js';
import { makeRng } from '../../engine/engine.js';
import { setBalanceOverrides, clearBalanceOverrides, setDisabledContent } from '../../engine/balance.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };

// a VALID bane (polarity:'bane') and ward (polarity:'boon') for direct/injected setup.
const mkBane = name => ({ id: 'test_' + name, trigger: 'on_keep', condition: null, scope: 'random',
  effect: 'reroll', polarity: 'bane', forced: true, lifetime: 'permanent', cost: {}, params: { count: 1 }, band: 'mild', name });
const mkWard = name => ({ id: 'test_' + name, trigger: 'on_roll', condition: null, scope: 'self',
  effect: 'ward', polarity: 'boon', forced: true, lifetime: 'permanent', cost: {}, params: {}, name });

configure({}); clearBalanceOverrides(); setDisabledContent([]);

// =============================================================================
// PART 1 — the debt verbs directly on the live hand (identity / strip / erode+floor / fizzle / polarity).
// =============================================================================
{
  // shift: the EXACT bane object moves; source loses, target gains; the event names it.
  newRun(1); let hand = _handRef();
  const b = mkBane('ident'); hand.dice[0].faces[0].ench = [b];
  const ev = []; shiftBane({ die: 0, face: 0, toDie: 1, toFace: 0 }, ev);
  ok((hand.dice[1].faces[0].ench || []).includes(b), 'shift: the EXACT bane object lands on the target face (identity ===)');
  ok(!(hand.dice[0].faces[0].ench || []).includes(b) && (hand.dice[0].faces[0].ench || []).length === 0, 'shift: the source face loses the bane');
  ok(ev.some(e => /moves from die 0 face 0 to die 1 face 0/.test(e)), 'shift: the event names what moved where');

  // twin: shifting the D1-cloned twin's bane leaves the original UNTOUCHED (independent instances).
  newRun(1); hand = _handRef();
  const orig = mkBane('twin'); hand.dice[0].faces[0].ench = [orig];
  copyEtchFace(hand.dice[0], hand.dice[0].faces[0], []);   // die 0 now 4 faces; [3] = twin (deep-cloned ench)
  const twinFace = hand.dice[0].faces[3], twinBane = twinFace.ench[0];
  ok(twinBane && twinBane !== orig, 'twin: the D1 copy is an independent bane instance');
  shiftBane({ die: 0, face: 3, toDie: 2, toFace: 0 }, []);   // shift the TWIN's bane
  ok((hand.dice[0].faces[0].ench || []).includes(orig) && hand.dice[0].faces[0].ench.length === 1, 'twin: the original bane is UNTOUCHED by shifting the twin');
  ok((twinFace.ench || []).length === 0, 'twin: the twin face lost its bane');
  ok((hand.dice[2].faces[0].ench || []).includes(twinBane), 'twin: the twin bane (its own instance) moved to the target');

  // shift onto a face that is later EXCISED → the bane dies with the face.
  newRun(1); hand = _handRef();
  const dying = mkBane('excise'); hand.dice[0].faces[0].ench = [dying];
  shiftBane({ die: 0, face: 0, toDie: 1, toFace: 2 }, []);
  ok((hand.dice[1].faces[2].ench || []).includes(dying), 'excise-death: the shifted bane sits on die 1 face 2');
  exciseFace(hand.dice[1], hand.dice[1].faces[2], []);
  ok(!hand.dice.some(d => d.faces.some(f => (f.ench || []).includes(dying))), 'excise-death: excising the target face removes the shifted bane from the whole hand (dies with the face)');

  // scour: strips + erodes 1 pip (floor 1 — a mag-1 face is free). absolve: pure strip.
  newRun(1); hand = _handRef();
  const sf = hand.dice[0].faces[0]; sf.mag = 3; sf.ench = [mkBane('scour')];
  scourBane({ die: 0, face: 0 }, []);
  ok((sf.ench || []).length === 0 && sf.mag === 2, 'scour: strips the bane AND erodes 1 pip (3→2)');
  const sf1 = hand.dice[1].faces[0]; sf1.mag = 1; sf1.ench = [mkBane('scour1')];
  scourBane({ die: 1, face: 0 }, []);
  ok((sf1.ench || []).length === 0 && sf1.mag === 1, 'scour: a mag-1 face scours FREE (erode floored at 1)');
  const af = hand.dice[2].faces[0]; af.mag = 2; af.ench = [mkBane('absolve')];
  absolveBane({ die: 2, face: 0 }, []);
  ok((af.ench || []).length === 0 && af.mag === 2, 'absolve: pure strip — no erode (mag 2 stays 2)');

  // polarity is DATA-DRIVEN — a ward (boon) sharing the face, listed FIRST, is never grabbed (D3 trap).
  newRun(1); hand = _handRef();
  const ward = mkWard('W'), bane = mkBane('poldata');
  hand.dice[0].faces[0].ench = [ward, bane];   // ward FIRST, bane second
  ok(firstBaneIdx(hand.dice[0].faces[0]) === 1, 'polarity: firstBaneIdx skips the leading ward, finds the bane at index 1');
  absolveBane({ die: 0, face: 0 }, []);
  ok((hand.dice[0].faces[0].ench || []).length === 1 && hand.dice[0].faces[0].ench[0] === ward,
     'polarity: absolve strips the BANE and leaves the ward (matches the polarity field, not the effect name)');

  // fizzles hand-blind (deepen-style precedent) — a clear event, no crash, when no bane is worn.
  newRun(1);
  const e1 = [], e2 = [], e3 = [];
  shiftBane({}, e1); scourBane({}, e2); absolveBane({}, e3);
  ok(e1.some(e => /no debt to move/.test(e)), 'shift fizzles with a clear event when no bane is worn');
  ok(e2.some(e => /no debt to lift/.test(e)), 'scour fizzles with a clear event when no bane is worn');
  ok(e3.some(e => /no debt to lift/.test(e)), 'absolve fizzles with a clear event when no bane is worn');

  // bare shift auto (first bane → the deterministic parking spot) — same setup twice ⇒ identical hand.
  const bareShiftSig = () => { newRun(7); const h = _handRef(); h.dice[3].faces[1].ench = [mkBane('bare')];
    shiftBane({}, []); return h.dice.map(d => d.faces.map(f => `${f.symbol}${f.mag}:${(f.ench || []).length}`).join(',')).join('|'); };
  ok(bareShiftSig() === bareShiftSig(), 'shift: the bare auto (first bane → parking spot) is deterministic (same setup ⇒ identical hand)');
}

// =============================================================================
// PART 2 — legalActions enumerates sources × targets (+ bare) at a perk holding a debt card.
// =============================================================================
{
  const ALL_REACH = ['reweave', 'deepen', 'respin_sigil', 'flanking_sigil', 'wild_sigil', 'spinwrights_sigil',
    'open_hand', 'carvers_sigil', 'ward_sigil', 'augurs_sigil', 'echo_sigil',
    'graft_face', 'copy_etch', 'excise_face', 'cursed_graft', 'shift_bane', 'scour', 'absolve',
    'grinning_bargain', 'seers_bargain', 'louts_bargain'];   // §D3 bargains are default-on reach cards — trim them too
  const trimFor = keep => ({ balance: { 'witnesses.enabled': false, 'rewardLadder.blemishRiders': false },
    disabledContent: ALL_REACH.filter(id => id !== keep), enchants: [mkBane('inj')] });   // banes on ALL of die 0's 3 faces
  const effectOf = { shift_bane: 'shift', scour: 'scour', absolve: 'absolve' };

  const playToPerk = (seed, opts) => {
    let st = act({ type: 'new_run', seed, ...opts }).state, guard = 0;
    while (!st.over && guard++ < 80){
      if (st.phase === 'perk') return st;
      if (st.phase === 'transform'){ st = act({ type: 'transform', skip: true }).state; continue; }
      if (st.phase === 'stitch'){ st = act({ type: 'stitch' }).state; continue; }
      if (st.phase === 'segment' || st.phase === 'knot'){
        if ((st.spinsTaken || 0) === 0){ st = act({ type: 'spin' }).state; continue; }
        const target = [...st.rungs].filter(x => x.req).sort((a, b) => (b.reach_estimate || 0) - (a.reach_estimate || 0))[0];
        const need = { ...(target ? target.req : {}) };
        for (const t of st.tray) if (t.kept && need[t.symbol]) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag || 1));
        const kd = (st.tray || []).find(t => !t.kept && !t.locked && t.symbol !== 'blank' && t.symbol !== 'fang' && (need[t.symbol] || 0) > 0);
        if (kd){ st = act({ type: 'keep', i: kd.i }).state; continue; }
        if ((st.metNow || []).length > 0 || (st.rollsLeft || 0) <= 0){ st = act({ type: 'resolve' }).state; continue; }
        st = act({ type: 'spin' }).state; continue;
      }
      break;
    }
    return null;
  };
  const reachDebtPerk = keep => {
    for (let seed = 1; seed <= 250; seed++){
      const st = playToPerk(seed, trimFor(keep));
      if (!st) continue;
      const card = (st.perkOffer || []).find(c => c.boon && c.boon.effect === effectOf[keep]);
      if (card) return { seed, st, card };
    }
    return null;
  };
  const countBaneFaces = st => st.hand.reduce((n, d) => n + d.faces.filter(f => (f.ench || []).some(e => e.polarity === 'bane')).length, 0);

  const sh = reachDebtPerk('shift_bane');
  ok(!!sh, 'shift: reached a perk holding a Shift card (banes injected on die 0)');
  if (sh){
    ok(countBaneFaces(sh.st) === 3, `shift: die 0's 3 faces each carry a bane at the perk (got ${countBaneFaces(sh.st)})`);
    const totalFaces = sh.st.hand.reduce((n, d) => n + d.faces.length, 0);
    const L = legalActions().filter(x => x.type === 'perk' && x.args && x.args.card === sh.card.card);
    const withArgs = L.filter(x => x.args.die != null && x.args.face != null && x.args.toDie != null && x.args.toFace != null);
    const bare = L.filter(x => x.args.die == null);
    ok(withArgs.length === 3 * (totalFaces - 1) && bare.length === 1,
       `shift: legalActions enumerates (3 bane faces)×(${totalFaces - 1} other faces) + 1 bare (got ${withArgs.length} + ${bare.length})`);
    ok(withArgs.every(x => !(x.args.toDie === x.args.die && x.args.toFace === x.args.face)), 'shift: no enumerated variant targets the source face');
    const src = withArgs.find(x => x.args.die === 0);
    const r = act({ type: 'perk', card: sh.card.card, die: src.args.die, face: src.args.face, toDie: src.args.toDie, toFace: src.args.toFace });
    ok((r.state.hand[src.args.toDie].faces[src.args.toFace].ench || []).some(e => e.polarity === 'bane'),
       'shift: applying the card through the ladder moves a bane onto the chosen target face');
  }

  for (const keep of ['scour', 'absolve']){
    const d = reachDebtPerk(keep);
    ok(!!d, `${keep}: reached a perk holding the card`);
    if (d){
      const L = legalActions().filter(x => x.type === 'perk' && x.args && x.args.card === d.card.card);
      const withFace = L.filter(x => x.args.die != null && x.args.face != null && x.args.toDie == null);
      const bare = L.filter(x => x.args.die == null);
      ok(withFace.length === 3 && bare.length === 1, `${keep}: enumerates 3 bane-face sources + 1 bare (got ${withFace.length} + ${bare.length})`);
      const s0 = d.st.hand[0].faces.filter(f => (f.ench || []).some(e => e.polarity === 'bane')).length;
      const r = act({ type: 'perk', card: d.card.card, die: 0, face: 0 });
      ok(r.state.hand[0].faces.filter(f => (f.ench || []).some(e => e.polarity === 'bane')).length === s0 - 1,
         `${keep}: applying the card strips one bane from the chosen face (${s0}→${s0 - 1})`);
    }
  }
  clearBalanceOverrides(); setDisabledContent([]); configure({});
}

// =============================================================================
// PART 3 — second_skin: the deferred cleanse witness finally gets its channel.
// =============================================================================
{
  clearBalanceOverrides(); setDisabledContent([]);
  // worn ⇒ 3 charges; refuses 3 liens, the 4th etches; charges count DOWN in state; event names them.
  newRun(11, { witnesses: ['second_skin'], balance: {} });
  const w0 = (serializeState().witnesses || [])[0];
  ok(w0 && w0.id === 'second_skin' && w0.charges === 3, 'second_skin: worn with 3 charges surfaced in s.witnesses');
  const ev = [];
  ok(tryRefuseLien(ev) === true, 'second_skin: the 1st load-bearing lien is refused');
  ok(serializeState().witnesses[0].charges === 2, 'second_skin: the charge counts down 3→2 in state');
  ok(ev.some(e => /drinks the ink — the lien is refused \(2 left\)/.test(e)), 'second_skin: the refusal event names the remaining charges');
  ok(tryRefuseLien(ev) === true && tryRefuseLien(ev) === true, 'second_skin: the 2nd + 3rd liens are refused');
  ok(serializeState().witnesses[0].charges === 0, 'second_skin: charges reach 0 after three refusals');
  ok(tryRefuseLien(ev) === false, 'second_skin: the 4th lien is NOT refused (0 charges) — it etches');
  ok(serializeState().witnesses[0].charges === 0, 'second_skin: at 0 it stays WORN but inert (charges 0)');
  ok((serializeState().witnesses[0].fires || 0) === 0, 'second_skin: the interceptor does not inflate the witness fire count');

  // not-worn ⇒ inert: no refusal, no charge state, no event (a non-second_skin run is byte-identical).
  newRun(11, { witnesses: ['patient_needle'], balance: {} });
  const ev2 = [];
  ok(tryRefuseLien(ev2) === false && ev2.length === 0, 'not-worn: tryRefuseLien is a no-op (false, no event) for a non-cleanse loadout');
  ok(!('charges' in ((serializeState().witnesses || [])[0] || {})), 'not-worn: a non-cleanse witness surfaces NO charges field (byte-identical state)');

  // gate-first: witnesses master OFF ⇒ the interceptor is inert even with second_skin "worn".
  newRun(11, { witnesses: ['second_skin'], balance: { 'witnesses.enabled': false } });
  ok(tryRefuseLien([]) === false, 'gate-first: witnesses master OFF ⇒ the lien interceptor is inert (loadout ignored)');
  clearBalanceOverrides(); setDisabledContent([]);

  // byte-identity: a full run with a non-second_skin loadout NEVER touches the second_skin channel and replays exactly.
  const runNoSkin = () => { let r = act({ type: 'new_run', seed: 314, witnesses: ['patient_needle'], balance: {}, disabledContent: [] }), g = 0;
    const evs = []; while (!r.state.over && g++ < 400){ const a = clean(r.state, legalActions()); if (!a) break; r = act(a); evs.push(...(r.events || [])); } return evs; };
  const runA = runNoSkin(), runB = runNoSkin();
  ok(JSON.stringify(runA) === JSON.stringify(runB), 'byte-identity: a non-second_skin run replays byte-for-byte (determinism)');
  // the CHANNEL fires the "drinks the ink" refusal only when a cleanse witness is WORN. Match that event
  // specifically — NOT the bare witness NAME "Second Skin", which legitimately appears as a reward-ladder
  // DRAFT offer (surfaced once the §G3 band's longer native runs reach that draw). The channel stays inert.
  ok(!runA.some(e => /drinks the ink/.test(e)), 'byte-identity: a non-second_skin run never fires the cleanse channel (inert)');
  clearBalanceOverrides(); setDisabledContent([]);
}

// =============================================================================
// PART 4 — pool gating: debt OFF ⇒ byte-identical to D1 HEAD; ON ⇒ offered + the common-slot fill.
// =============================================================================
{
  clearBalanceOverrides(); setDisabledContent([]);
  const sweep = () => { const seen = new Set();
    for (const tier of ['floor', 'true', 'bloom']) for (let s = 1; s <= 300; s++){
      const d = drawLadder({ tier, metTiers: [tier] }, makeRng(s * 13 + 1));
      for (const c of d.cards) if (c.boon && c.boon.id) seen.add(c.boon.id);
    } return seen; };
  const DEBT = ['shift_bane', 'scour', 'absolve'];

  const onSeen = sweep();
  ok(DEBT.every(id => onSeen.has(id)), 'pool: debt ON ⇒ all three debt cards are offered by drawLadder');

  // the DELIBERATE common-slot change: with debt.shift ON, a floor/ash reach slot fills with an EXACT
  // COMMON match instead of WIDENING to the whole channel on a miss. §D-fix3 the common reach pool is now
  // {shift_bane, graft_face} (Graft went uncommon→common for exposure), so the slot is one of those two
  // commons — the assertion is "always a common card" (the common-slot fill), no longer "always Shift".
  let floorReachCommon = true, sawShift = false, sawGraft = false;
  for (let s = 1; s <= 120; s++){
    const d = drawLadder({ tier: 'floor', metTiers: ['floor'] }, makeRng(s));
    const reach = d.cards.find(c => c.kind === 'blessing');
    if (!reach || reach.rarity !== 'common') floorReachCommon = false;
    if (reach && reach.boon.id === 'shift_bane') sawShift = true;
    if (reach && reach.boon.id === 'graft_face') sawGraft = true;
  }
  ok(floorReachCommon, 'pool: with debt.shift ON, the floor/ash reach slot fills with a COMMON card (the common-slot fill — replaces the old widen-on-miss)');
  ok(sawShift && sawGraft, 'pool: §D-fix3 the common reach pool is {shift_bane, graft_face} — both are reachable in the ash reach slot');

  // debt OFF ⇒ NONE offered, and the gate draws ZERO rng (poisoning the debt content changes nothing).
  setBalanceOverrides({ 'debt.shift': false, 'debt.cleanse': false });
  const offSeen = sweep();
  ok(DEBT.every(id => !offSeen.has(id)), 'pool: debt OFF ⇒ NO debt card offered (pool byte-identical to D1 HEAD)');
  const norm = d => JSON.stringify(d.cards.map(c => c.kind === 'draft' ? c.witnessId : c.boon.id));
  const cleanDraw = norm(drawLadder({ tier: 'floor', metTiers: ['floor'] }, makeRng(5)));
  setDisabledContent(DEBT);   // poison the already-gated-off debt ids
  const poisonedDraw = norm(drawLadder({ tier: 'floor', metTiers: ['floor'] }, makeRng(5)));
  setDisabledContent([]);
  ok(cleanDraw === poisonedDraw, 'pool: debt OFF ⇒ the debt cards draw ZERO rng (gate-first neutrality — the draw is byte-identical)');
  clearBalanceOverrides(); setDisabledContent([]);
}

// =============================================================================
// PART 5 — determinism: a full run with the DEFAULT (debt-on) pool replays byte-for-byte.
// =============================================================================
{
  clearBalanceOverrides(); setDisabledContent([]); configure({});
  const playFull = seed => {
    let r = act({ type: 'new_run', seed }), g = 0; const stream = [];
    while (!r.state.over && g++ < 400){ const a = clean(r.state, legalActions()); if (!a) break; r = act(a); stream.push(JSON.stringify(a)); }
    return { stream: stream.join('|'), score: r.state.score };
  };
  const a = playFull(20260709), b = playFull(20260709);
  ok(a.stream === b.stream && a.score === b.score, 'determinism: same seed + same policy ⇒ identical action stream + final score (debt cards in the default pool)');
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
console.log(`\ndebt verbs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
