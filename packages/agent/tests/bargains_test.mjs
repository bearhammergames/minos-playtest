// =============================================================================
// BARGAINS TEST (§D3 — the BARGAIN family + pure riders by rarity)
// -----------------------------------------------------------------------------
// Drives the REAL session core. Covers:
//   PART 1  the three bargains etch BOTH halves (a boon offer + a forced bane) on the SAME chosen
//           face with a shared pairId; grinning_bargain END-TO-END — its boon raises a chosen reroll
//           spin-sigil AND its forced bane locks the neighbours; the perkOffer discloses both halves.
//   PART 2  the COUPLING GUARD — shift/scour/absolve SKIP a coupled bane (they act on free-standing
//           debt only, or fizzle if only coupled debt exists); the guard lives in firstBaneIdx.
//   PART 3  copy_etch (D1) twin — the twin's halves stay coupled to EACH OTHER (shared pairId) and are
//           INDEPENDENT instances of the original (distinct objects; emptying the twin leaves the original).
//   PART 4  PURE RIDERS by rarity — commons never pure, uncommon/rare within loose bounds of the config,
//           neverRider cards always pure (no roll); a chance of 1.0 ⇒ always pure (the mythic contract);
//           pure ⇒ blemished:false + no rider, ridered ⇒ blemished:true + a rider (no mismatch).
//   PART 5  determinism (same seed + actions ⇒ identical stream) + the neutrality contract (bargains OFF
//           + pureRiders OFF ⇒ the D3 additions draw ZERO rng ⇒ byte-identical to D2 HEAD).
// The debt verbs + firstBaneIdx + copyEtchFace + a live-hand accessor are exported (like the D1/D2 verbs)
// so the coupling/identity asserts drive them directly without fighting a play policy for banes.
// Not a KNOWN_FAIL — a design gate.
// =============================================================================
import { newRun, act, serializeState, legalActions, configure,
         shiftBane, scourBane, absolveBane, firstBaneIdx, copyEtchFace, _handRef } from '../session.mjs';
import { drawLadder } from '../../engine/reward_ladder.js';
import { makeRng } from '../../engine/engine.js';
import { setBalanceOverrides, clearBalanceOverrides, setDisabledContent, num } from '../../engine/balance.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };

configure({}); clearBalanceOverrides(); setDisabledContent([]);

const BARGAINS = ['grinning_bargain', 'seers_bargain', 'louts_bargain'];
// every reach id EXCEPT the one we keep, so the reach pool collapses to it (faces off ⇒ the face cards
// drop out; witnesses off ⇒ draft slots degrade to reach; riders off ⇒ no rider ench pollutes the hand;
// wishes off ⇒ no warp bends the test segment). vocab.bargains stays ON so the bargain we keep survives.
const ALL_REACH = ['reweave', 'deepen', 'respin_sigil', 'flanking_sigil', 'wild_sigil', 'spinwrights_sigil',
  'open_hand', 'carvers_sigil', 'ward_sigil', 'augurs_sigil', 'echo_sigil',
  'graft_face', 'copy_etch', 'excise_face', 'cursed_graft', 'shift_bane', 'scour', 'absolve',
  'grinning_bargain', 'seers_bargain', 'louts_bargain'];
const trimFor = keep => ({
  balance: { 'witnesses.enabled': false, 'rewardLadder.blemishRiders': false, 'faces.enabled': false, 'wishes.enabled': false },
  disabledContent: ALL_REACH.filter(id => id !== keep),
});

// play the clean floor policy until the FIRST perk phase; return that state (or null on run-end).
function playToPerk(seed, opts){
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
}

// =============================================================================
// PART 1 — the three bargains etch two coupled halves on the chosen face; grinning e2e.
// =============================================================================
{
  const D = 2, F = 1;   // interior die (neighbours 1 & 3 both exist), a valid d3 face index
  let etchOk = false, e2e = false;
  for (let seed = 1; seed <= 80 && !e2e; seed++){
    const st = playToPerk(seed, trimFor('grinning_bargain'));
    if (!st) continue;
    const card = (st.perkOffer || []).find(c => c.boon && c.boon.effect === 'bargain');
    if (!card) continue;
    let r = act({ type: 'perk', card: card.card, die: D, face: F });
    if (r.state.phase !== 'segment') continue;   // want a single-pick draw so EXACTLY one bargain is etched
    const hand = _handRef();
    const face = hand.dice[D].faces[F];
    const boon = (face.ench || []).find(x => x.polarity === 'boon');
    const bane = (face.ench || []).find(x => x.polarity === 'bane');
    if (!etchOk && boon && bane){
      etchOk = true;
      ok((face.ench || []).length === 2, 'grinning: exactly TWO enchants land on the chosen face (one boon, one bane)');
      ok(boon.effect === 'reroll' && boon.scope === 'chosen' && boon.forced === false && boon.trigger === 'on_roll',
         'grinning: the BOON half is on_roll·chosen·reroll·forced:false');
      ok(bane.effect === 'lock' && bane.scope === 'adjacent' && bane.forced === true && bane.trigger === 'on_roll',
         'grinning: the BANE half is on_roll·adjacent·lock·forced:true');
      ok(typeof boon.pairId === 'string' && boon.pairId.length > 0 && boon.pairId === bane.pairId,
         'grinning: both halves share a non-empty pairId (coupled per-etch instance)');
      const stray = hand.dice.reduce((n, d, di) => n + d.faces.reduce((m, f, fi) => m + ((di === D && fi === F) ? 0 : (f.ench || []).length), 0), 0);
      ok(stray === 0, 'grinning: no ench landed on any OTHER face (both halves on the chosen face)');
      // perkOffer discloses BOTH halves structurally (D4)
      ok(card.bargain && card.bargain.boon && card.bargain.bane
         && card.bargain.boon.effect === 'reroll' && card.bargain.bane.effect === 'lock',
         'grinning: the perkOffer card discloses both halves (bargain.boon + bargain.bane)');
      // real-path coupling guard tie-in: scour the ACTUAL etched coupled bane → fizzle (protected)
      const gev = []; scourBane({ die: D, face: F }, gev);
      const stillCoupled = (hand.dice[D].faces[F].ench || []).some(x => x.polarity === 'bane' && x.pairId);
      ok(stillCoupled && gev.some(e => /no debt to lift/.test(e)),
         'guard: a REAL ladder-etched bargain bane is NOT scourable (coupled) — the verb fizzles, the bane stays');
    }
    // end-to-end: spin until die D shows face F, then assert the boon sigil rose + the bane seized the neighbours
    let s = r.state, g = 0;
    while (!s.over && g++ < 8 && s.phase === 'segment' && (s.rollsLeft || 0) > 0){
      s = act({ type: 'spin' }).state;
      const tD = (s.tray || []).find(t => t.i === D);
      if (tD && tD.fi === F){
        const sig = (s.sigils || []).find(x => x.di === D && x.effect === 'reroll');
        ok(!!sig && sig.chosen === true, 'grinning e2e: the BOON half raised a CHOSEN reroll spin-sigil on the etched drum (offered, not auto-fired)');
        const n1 = (s.tray || []).find(t => t.i === D - 1), n2 = (s.tray || []).find(t => t.i === D + 1);
        ok(!!n1 && n1.locked && !!n2 && n2.locked, 'grinning e2e: the BANE half fired FORCED — both neighbour drums seized (locked)');
        e2e = true;
        break;
      }
    }
  }
  ok(etchOk, 'grinning: reached a single-pick perk and etched the bargain (composition verified)');
  ok(e2e, 'grinning: reached a spin showing the etched face (end-to-end sigil + forced lock verified)');
  clearBalanceOverrides(); setDisabledContent([]); configure({});
}

// PART 1b — seers + louts etch the correct coupled composition (no firing; grinning covers firing).
{
  const specs = {
    seers_bargain: { boon: { effect: 'expose', scope: 'self',     forced: false, trigger: 'on_roll' },
                     bane: { effect: 'reroll', scope: 'random',   forced: true,  trigger: 'on_roll' } },
    louts_bargain: { boon: { effect: 'reroll', scope: 'adjacent', forced: false, trigger: 'on_roll' },
                     bane: { effect: 'lock',   scope: 'adjacent', forced: true,  trigger: 'on_keep' } },
  };
  for (const [id, spec] of Object.entries(specs)){
    let done = false;
    for (let seed = 1; seed <= 80 && !done; seed++){
      const st = playToPerk(seed, trimFor(id));
      if (!st) continue;
      const card = (st.perkOffer || []).find(c => c.boon && c.boon.effect === 'bargain');
      if (!card) continue;
      ok(card.bargain && card.bargain.boon && card.bargain.bane, `${id}: perkOffer discloses both halves (bargain.boon + bargain.bane)`);
      const r = act({ type: 'perk', card: card.card, die: 2, face: 0 });
      if (r.state.phase !== 'segment') continue;
      const face = _handRef().dice[2].faces[0];
      const boon = (face.ench || []).find(x => x.polarity === 'boon');
      const bane = (face.ench || []).find(x => x.polarity === 'bane');
      ok(boon && bane && boon.pairId && boon.pairId === bane.pairId, `${id}: both halves etched on the chosen face, coupled (shared pairId)`);
      ok(boon && boon.effect === spec.boon.effect && boon.scope === spec.boon.scope && boon.forced === spec.boon.forced && boon.trigger === spec.boon.trigger,
         `${id}: BOON half is ${spec.boon.trigger}·${spec.boon.scope}·${spec.boon.effect}·forced:${spec.boon.forced}`);
      ok(bane && bane.effect === spec.bane.effect && bane.scope === spec.bane.scope && bane.forced === spec.bane.forced && bane.trigger === spec.bane.trigger,
         `${id}: BANE half is ${spec.bane.trigger}·${spec.bane.scope}·${spec.bane.effect}·forced:${spec.bane.forced}`);
      done = true;
    }
    ok(done, `${id}: reached a single-pick perk and etched the bargain`);
  }
  clearBalanceOverrides(); setDisabledContent([]); configure({});
}

// a VALID free-standing bane (no pairId) + a coupled pair (shared pairId) for direct setup.
const mkFreeBane = name => ({ id: 'free_' + name, trigger: 'on_keep', condition: null, scope: 'random',
  effect: 'reroll', polarity: 'bane', forced: true, lifetime: 'permanent', cost: {}, params: { count: 1 }, band: 'mild', name });
let _pairN = 0;
const mkCoupled = () => { const pid = 'tp_' + (++_pairN);
  return [ { id: 'cb_boon', trigger: 'on_roll', condition: null, scope: 'chosen',   effect: 'reroll', polarity: 'boon', forced: false, lifetime: 'permanent', cost: {}, params: {}, pairId: pid, name: 'CoupBoon' },
           { id: 'cb_bane', trigger: 'on_roll', condition: null, scope: 'adjacent', effect: 'lock',   polarity: 'bane', forced: true,  lifetime: 'permanent', cost: {}, params: {}, pairId: pid, name: 'CoupBane' } ]; };

// =============================================================================
// PART 2 — the coupling guard: debt verbs skip coupled banes (act on free-standing debt only).
// =============================================================================
{
  // firstBaneIdx (the single choke point) skips a coupled bane, finds a free-standing one.
  newRun(1); let hand = _handRef();
  hand.dice[0].faces[0].ench = mkCoupled();                                    // [coupBoon, coupBane]
  ok(firstBaneIdx(hand.dice[0].faces[0]) === -1, 'guard: firstBaneIdx = -1 for a face carrying ONLY a coupled bane (coupled banes are skipped)');
  hand.dice[0].faces[1].ench = [...mkCoupled(), mkFreeBane('mix')];            // coupled boon, coupled bane, then a FREE bane at index 2
  ok(firstBaneIdx(hand.dice[0].faces[1]) === 2, 'guard: firstBaneIdx skips the leading coupled bane and finds the free-standing one');

  // scour/absolve/shift on an EXPLICIT coupled-only face → FIZZLE (protected); the coupled bane stays.
  newRun(1); hand = _handRef();
  hand.dice[0].faces[0].ench = mkCoupled();
  const ev1 = []; scourBane({ die: 0, face: 0 }, ev1);
  ok(ev1.some(e => /no debt to lift/.test(e)) && hand.dice[0].faces[0].ench.some(x => x.polarity === 'bane'),
     'guard: scour on a coupled-only face fizzles — the coupled bane is protected');
  const ev2 = []; absolveBane({ die: 0, face: 0 }, ev2);
  ok(ev2.some(e => /no debt to lift/.test(e)) && hand.dice[0].faces[0].ench.some(x => x.polarity === 'bane'),
     'guard: absolve on a coupled-only face fizzles — the coupled bane is protected');
  const ev3 = []; shiftBane({ die: 0, face: 0, toDie: 1, toFace: 0 }, ev3);
  ok(ev3.some(e => /no debt to move/.test(e)) && hand.dice[0].faces[0].ench.some(x => x.polarity === 'bane'),
     'guard: shift of a coupled-only face fizzles — the coupled bane is protected');

  // the BARE auto skips the coupled bane and acts on the FREE-STANDING one (the next free bane).
  newRun(1); hand = _handRef();
  hand.dice[0].faces[0].ench = mkCoupled();                                    // coupled (die 0) — must be skipped
  hand.dice[3].faces[0].ench = [mkFreeBane('target')];                         // free-standing (die 3)
  scourBane({}, []);                                                            // bare auto
  ok((hand.dice[3].faces[0].ench || []).length === 0 && hand.dice[0].faces[0].ench.some(x => x.polarity === 'bane'),
     'guard: the bare scour auto skips the coupled bane and strips the FREE-STANDING one (die 3)');
  // legalActions parity: the enumeration predicate matches the selector — a coupled-only die is never a source.
  ok(firstBaneIdx(hand.dice[0].faces[0]) === -1, 'guard: after the free bane is gone, the coupled die still enumerates as no source (firstBaneIdx = -1)');

  // fizzle when ONLY coupled debt exists (no free-standing bane anywhere).
  newRun(1); hand = _handRef();
  hand.dice[0].faces[0].ench = mkCoupled();
  const e5 = [], e6 = [], e7 = [];
  scourBane({}, e5); absolveBane({}, e6); shiftBane({}, e7);
  ok(e5.some(e => /no debt/.test(e)) && e6.some(e => /no debt/.test(e)) && e7.some(e => /no debt/.test(e)),
     'guard: with ONLY coupled debt on the hand, all three debt verbs fizzle (no free-standing bane to act on)');
  ok(hand.dice[0].faces[0].ench.filter(x => x.polarity === 'bane').length === 1, 'guard: the coupled bane survives every debt verb (protected end-to-end)');
  clearBalanceOverrides(); setDisabledContent([]); configure({});
}

// =============================================================================
// PART 3 — the D1 copy_etch twin keeps its halves coupled to each other, independent of the original.
// =============================================================================
{
  newRun(1); const hand = _handRef();
  hand.dice[0].faces[0].ench = mkCoupled();
  const origBoon = hand.dice[0].faces[0].ench[0], origBane = hand.dice[0].faces[0].ench[1];
  copyEtchFace(hand.dice[0], hand.dice[0].faces[0], []);                        // die 0 grows a twin face at the end
  const twinFace = hand.dice[0].faces[hand.dice[0].faces.length - 1];
  const twinBoon = (twinFace.ench || []).find(x => x.polarity === 'boon');
  const twinBane = (twinFace.ench || []).find(x => x.polarity === 'bane');
  ok(twinBoon && twinBane, 'twin: the copy carries BOTH coupled halves');
  ok(twinBoon !== origBoon && twinBane !== origBane, 'twin: the twin halves are INDEPENDENT instances (distinct objects from the original)');
  ok(twinBoon.pairId === twinBane.pairId, 'twin: the twin halves stay coupled to EACH OTHER (shared pairId)');
  ok(origBoon.pairId === origBane.pairId, 'twin: the original halves remain coupled (untouched by the copy)');
  ok(firstBaneIdx(twinFace) === -1, 'twin: the twin coupled bane is skipped by the guard too (protected, like the original)');
  twinFace.ench = [];                                                          // the twin loses its runes (excise/ward consume) — the original must be intact
  ok((hand.dice[0].faces[0].ench || []).length === 2 && hand.dice[0].faces[0].ench[0] === origBoon,
     'twin: emptying the twin face leaves the ORIGINAL pair intact (independent instances — the D1 copy contract)');
  clearBalanceOverrides(); setDisabledContent([]); configure({});
}

// =============================================================================
// PART 4 — PURE RIDERS by rarity ("better play buys pure ink").
// =============================================================================
{
  // witnesses off ⇒ draft slots degrade to reach (more reach cards to sample); riders + pureRiders native-on.
  // Sample commons from floor, uncommon/rare from TRUE (true has no guaranteeRareReach re-price to contaminate).
  setBalanceOverrides({ 'witnesses.enabled': false });
  const stat = { common: { n: 0, pure: 0 }, uncommon: { n: 0, pure: 0 }, rare: { n: 0, pure: 0 } };
  let neverRiderClean = true, invariantOk = true;
  for (const tier of ['floor', 'true']) for (let s = 1; s <= 3000; s++){
    const d = drawLadder({ tier, metTiers: [tier] }, makeRng(s * 31 + 7));
    for (const c of d.cards){
      if (c.kind !== 'blessing' || !c.boon) continue;
      if (c.boon.neverRider){ if (c.blemished || c.rider) neverRiderClean = false; continue; }   // neverRider: unconditionally pure, excluded from rate stats
      if (stat[c.rarity]){ stat[c.rarity].n++; if (!c.blemished) stat[c.rarity].pure++; }
      if (c.blemished && !c.rider) invariantOk = false;                        // ridered ⇒ must carry a rider
      if (!c.blemished && c.rider)  invariantOk = false;                        // pure ⇒ must have NO rider
    }
  }
  const uRate = stat.uncommon.pure / Math.max(1, stat.uncommon.n);
  const rRate = stat.rare.pure / Math.max(1, stat.rare.n);
  ok(stat.common.n > 100 && stat.common.pure === 0, `pure: commons are NEVER pure (${stat.common.pure}/${stat.common.n} pure — chance 0)`);
  ok(stat.uncommon.n > 300 && uRate > 0.07 && uRate < 0.25, `pure: uncommon pure rate ≈ 0.15 (got ${uRate.toFixed(3)} over ${stat.uncommon.n})`);
  ok(stat.rare.n > 100 && rRate > 0.27 && rRate < 0.53, `pure: rare pure rate ≈ 0.40 (got ${rRate.toFixed(3)} over ${stat.rare.n})`);
  ok(neverRiderClean, 'pure: neverRider cards (cursed_graft / bargains) are ALWAYS pure — blemished:false, no rider (they never draw the roll)');
  ok(invariantOk, 'pure: a pure card reads blemished:false with NO rider; a ridered card is blemished:true WITH a rider (no mismatch)');
  // mythic: no mythic reach card exists in the pool yet, so verify the config contract + prove that a pure
  // chance of 1.0 ⇒ ALWAYS pure via an override (the code reads num('riderPure.<rarity>'), never the rarity id).
  ok(num('riderPure.mythic', 0) === 1 && num('riderPure.common', 0) === 0, 'pure: config contract — common=0 (never pure), mythic=1.0 (always pure)');
  setBalanceOverrides({ 'witnesses.enabled': false, 'riderPure.uncommon': 1.0 });
  let allPureAt1 = true, sawUnc = false;
  for (let s = 1; s <= 400; s++){
    const d = drawLadder({ tier: 'true', metTiers: ['true'] }, makeRng(s * 17 + 3));
    for (const c of d.cards) if (c.kind === 'blessing' && c.boon && c.rarity === 'uncommon' && !c.boon.neverRider){ sawUnc = true; if (c.blemished) allPureAt1 = false; }
  }
  ok(sawUnc && allPureAt1, 'pure: a pure chance of 1.0 ⇒ EVERY eligible card ships pure (the mythic=1.0 contract — the code reads num(), not the rarity id)');
  clearBalanceOverrides();
}

// =============================================================================
// PART 5 — determinism + the neutrality contract (bargains OFF + pureRiders OFF ⇒ byte-identical to D2 HEAD).
// =============================================================================
{
  clearBalanceOverrides(); setDisabledContent([]); configure({});
  // determinism: a full DEFAULT run (bargains on, pureRiders on) replays byte-for-byte.
  const playFull = seed => {
    let r = act({ type: 'new_run', seed }), g = 0; const stream = [];
    while (!r.state.over && g++ < 400){ const a = clean(r.state, legalActions()); if (!a) break; r = act(a); stream.push(JSON.stringify(a)); }
    return { stream: stream.join('|'), score: r.state.score };
  };
  const a = playFull(20260709), b = playFull(20260709);
  ok(a.stream === b.stream && a.score === b.score, 'determinism: same seed + policy ⇒ identical action stream + score (bargains + pure riders in the default pool)');

  // neutrality: with D3 gated OFF, the D3 additions draw ZERO rng ⇒ byte-identical to D2 HEAD (poisoning idiom).
  clearBalanceOverrides(); setDisabledContent([]);
  const norm = d => JSON.stringify(d.cards.map(c => c.kind === 'draft'
    ? ('W:' + c.witnessId)
    : (c.boon.id + ':' + (c.blemished ? 'b' : 'p') + (c.rider ? (':' + c.rider.name) : ''))));
  const sweepSig = () => { const sigs = [];
    for (const tier of ['floor', 'true', 'bloom']) for (let s = 1; s <= 200; s++)
      sigs.push(norm(drawLadder({ tier, metTiers: [tier] }, makeRng(s * 13 + 1)))); return sigs.join('#'); };

  setBalanceOverrides({ 'vocab.bargains': false, 'rewardLadder.pureRiders': false });
  const ref = sweepSig();
  ok(!ref.includes('bargain'), 'gate: vocab.bargains OFF ⇒ no bargain card in any draw');
  // POISON the D3 additions (disable the bargain ids + poison the riderPure numbers) — with both flags off
  // this draws ZERO extra rng, so the whole sweep is byte-identical (⇒ byte-identical to the pre-D3 D2 HEAD).
  setDisabledContent(BARGAINS);
  setBalanceOverrides({ 'vocab.bargains': false, 'rewardLadder.pureRiders': false,
    'riderPure.common': 0.9, 'riderPure.uncommon': 0.9, 'riderPure.rare': 0.9 });
  const poisoned = sweepSig();
  setDisabledContent([]);
  ok(ref === poisoned, 'gate: bargains + pureRiders OFF ⇒ poisoning the D3 content/config changes NOTHING (zero new rng ⇒ byte-identical to D2 HEAD)');

  // pureRiders OFF ⇒ every rideable reach card is blemished (the D2 always-ridered behaviour, no pure cards).
  setBalanceOverrides({ 'vocab.bargains': false, 'rewardLadder.pureRiders': false, 'witnesses.enabled': false });
  let allRidered = true, sawRideable = false;
  for (const tier of ['true', 'bloom']) for (let s = 1; s <= 300; s++){
    const d = drawLadder({ tier, metTiers: [tier] }, makeRng(s * 9 + 4));
    for (const c of d.cards) if (c.kind === 'blessing' && c.boon && !c.boon.neverRider){ sawRideable = true; if (!c.blemished) allRidered = false; }
  }
  ok(sawRideable && allRidered, 'gate: pureRiders OFF ⇒ every rideable reach card is blemished (byte-identical D2 rider behaviour — no pure cards)');
  clearBalanceOverrides(); setDisabledContent([]); configure({});
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
console.log(`\nbargains: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
