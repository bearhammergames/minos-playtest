// =============================================================================
// POST-G4 VALIDATION-ROUND BUG BATCH — the fixes from the Fable-5 2026-07-10 playtests
// (seeds 2025 / 1313 / 1314). Drives the pure generator/probe AND the real session core.
// Not a KNOWN_FAIL — a design gate. Covers:
//   Fix 1 (session) — the VEIL info-leak: with veiled_one active on the boss segment, the
//                     segment-start "rungs offered" event must NOT disclose the veiled bloom's
//                     colour/shape/reach; state.rungs masks it; both reveal only on the lift.
//   Fix 2 (session) — the VEIL lift resolver (veilPlan): with no True rung, the lift falls back
//                     to the lowest-value non-veiled rung; if the bloom is the ONLY rung, VOID.
//   Fix 3 (generator)— the forced/intent APEX respects the MIN_REACH floor: a dead preferred
//                     shape tries the other, then degrades to a reachable bloom-menu shape at
//                     VALUE 10 (the demand survives); reachable apexes are kept unchanged.
//   Fix 4 (generator)— TIER-LABEL / difficulty ORDERING: post-fit, floor reach ≥ true reach ≥
//                     bloom reach always holds (apex unaffected); union/pNone + shapes unchanged.
//   Fix 5 (wishes)  — desc audit: no constraint/twist desc claims whole-patron "each segment"
//                     physics (boss-gated); the Generous One copy is corrected.
// =============================================================================
import { BALANCE, num, clearBalanceOverrides, setDisabledContent } from '../../engine/balance.js';
import { makeRng } from '../../engine/engine.js';
import { generateSegment, resetShapeMemory } from '../../engine/generator.js';
import { evaluateRungSet } from '../../engine/probe.js';
import { newRun, act, serializeState, legalActions, configure, veilPlan } from '../session.mjs';
import { WISHES } from '../../content/wishes.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };

const F  = s => ({ symbol: s, mag: 1, state: 'live' });
const Fm = (s, m) => ({ symbol: s, mag: m, state: 'live' });
const mkHand = rows => ({ dice: rows.map(syms => ({ faces: syms.map(x => (typeof x === 'string' ? F(x) : Fm(x[0], x[1]))) })) });
const ctx = () => ({ warps: [], twist: null, tempo: { bonusSpins: 0, offeredRerolls: 0 },
  takeRates: num('generator2.takeRates', { sigil: 0.6, expose: 0.4, release: 0.3, echo: 0.5 }) });
const MIN_REACH = 0.015;   // mirror of generator.js MIN_REACH (the dead-end floor)

// hands: a weak mixed hand, a deep strong-body hand, and a DEAD-APEX hand (strongest colour = mind on
// only 2 mag-1 faces + no deep face → both conc mind:2 and pure mind:3 price ~0 → the apex must degrade).
const FRESH   = mkHand([['body','body','mind'],['body','spirit','fang'],['mind','spirit','mana'],['mind','mind','spirit'],['charm','charm','body'],['fang','mind','charm']]);
const DEEP    = mkHand([[['body',2],'body','mind'],[['body',2],'mind','body'],['mind','spirit','mana'],[['spirit',2],'spirit','mind'],['body','charm','body'],['mind','body','spirit']]);
const DEADMIND= mkHand([['mind','charm','fang'],['mind','charm','fang'],['body','charm','fang'],['spirit','charm','fang'],['charm','charm','fang'],['charm','charm','mana']]);

const setG4 = (rungs, apex) => { BALANCE.generator2.enabled = true; BALANCE.generator2.jointProbe = true; BALANCE.generator2.band = true; BALANCE.generator2.rungs = rungs; BALANCE.generator2.apexRungs = apex; };
const gen = (hand, patron, opts = {}) => { resetShapeMemory(); return generateSegment(hand, {}, { rng: makeRng(opts.seed ?? 77), segIndex: opts.segIndex ?? (patron.index * 3 + patron.position), patron, priorEma: opts.priorEma ?? null, twist: opts.twist ?? null, liveChainColour: opts.liveChainColour ?? null }); };

clearBalanceOverrides(); setDisabledContent([]); configure({});

// =============================================================================
// FIX 2 — veilPlan: the lift/void resolver (pure logic, both fallback + void paths).
// =============================================================================
{
  const rFloor = { tier: 'floor', colour: 'body',   value: 1,  req: { body: 2 },   _p: 0.6 };
  const rTrue  = { tier: 'true',  colour: 'mind',   value: 3,  req: { mind: 3 },   _p: 0.3 };
  const rBloom = { tier: 'bloom', colour: 'spirit', value: 6,  req: { spirit: 3 }, _p: 0.1 };
  const rApex  = { tier: 'apex',  colour: 'body',   value: 10, req: { body: 2 }, concentrated: true, _p: 0.2 };

  const full = veilPlan([rFloor, rTrue, rBloom]);
  ok(full.bloom === rBloom && full.liftRung === rTrue && !full.void, 'Fix2: full set → lift is the TRUE, not void');

  const noTrue = veilPlan([rFloor, rBloom]);   // a 2-rung rest that dropped the True
  ok(noTrue.liftRung === rFloor && !noTrue.void, 'Fix2: no-True (floor+bloom) → lift falls back to the lowest-value non-veiled rung (floor)');

  const noTrueApex = veilPlan([rBloom, rApex]);   // no floor/true — only the apex can lift
  ok(noTrueApex.liftRung === rApex && !noTrueApex.void, 'Fix2: no-True (bloom+apex) → lift falls back to the only non-veiled rung (apex)');

  const bloomOnly = veilPlan([rBloom]);
  ok(bloomOnly.void === true && bloomOnly.liftRung == null, 'Fix2: the bloom is the ONLY rung → VOID (nothing to hide behind)');

  const noBloom = veilPlan([rFloor, rTrue]);
  ok(noBloom.bloom == null && !noBloom.void, 'Fix2: no bloom in the set → nothing to veil (not void — outside Fix2 scope)');

  // lowest-value tiebreak is deterministic across orderings
  const a = veilPlan([rTrue, rBloom, rFloor]);   // reordered — lift is still the true
  ok(a.liftRung === rTrue, 'Fix2: lift resolution is order-independent (finds the True regardless of position)');
}

// =============================================================================
// FIX 1 — the veil info-leak: the segment-start event + state both mask the bloom; reveal on lift.
// =============================================================================
{
  clearBalanceOverrides();
  BALANCE.wishes.enabled = true; BALANCE.wishes.twists = true;
  setG4(true, true);
  const BOSS1 = { 'wishes.patronLen': 1 };   // seg 0 is the boss ⇒ veil active immediately

  const r0 = act({ type: 'new_run', seed: 7, wish: 'veiled_one', balance: BOSS1 });
  const st = r0.state;
  ok(st.wish && st.wish.twist && st.wish.twist.kind === 'veil' && st.wish.active, 'Fix1: veiled_one is boss-active on seg 0');

  // (a) STATE masks the bloom — the entry carries ONLY {tier, veiled}, no colour/req/value/reach.
  const veiledEntry = (st.rungs || []).find(x => x.veiled);
  ok(veiledEntry && veiledEntry.tier === 'bloom', 'Fix1: state.rungs masks the bloom (veiled:true)');
  ok(veiledEntry && Object.keys(veiledEntry).sort().join(',') === 'tier,veiled',
    `Fix1: the masked bloom leaks NO colour/req/value/reach (keys: ${veiledEntry && Object.keys(veiledEntry).join(',')})`);

  // (b) the segment-start EVENT genericizes the bloom — "a veiled demand", no "bloom(colour…, ~%reach)".
  const offEv = (r0.events || []).find(e => /rungs offered/.test(e));
  ok(offEv && /bloom \(a veiled demand\)/.test(offEv), `Fix1: the offered-rungs event prints "bloom (a veiled demand)" (got: ${offEv})`);
  ok(offEv && !/bloom\(/.test(offEv), 'Fix1: the offered-rungs event does NOT leak the bloom in the disclosing "bloom(colour…" format');
  // the leak would surface the bloom's real colour; confirm no colour token rides inside a bloom disclosure.
  ok(offEv && !/(body|mind|spirit)[^)]*\)\s*$/.test(offEv.split('·').pop()), 'Fix1: the LAST (bloom) rung token carries no colour/reach while veiled');

  // (c) CONTROL — a NON-veiled bloom (plain run, no wish) prints the disclosing format (genericization is veil-only).
  clearBalanceOverrides();
  const rc = act({ type: 'new_run', seed: 7 });
  const evc = (rc.events || []).find(e => /rungs offered/.test(e));
  ok(evc && /bloom\(/.test(evc) && !/veiled demand/.test(evc), 'Fix1: an unveiled run keeps the disclosing "bloom(colour…" format (byte-identical to before)');
  clearBalanceOverrides();

  // (d) REVEAL — driving the boss segment to MEET THE LIFT (true) rung unmasks the bloom (colour/req return);
  //     while unmet, the bloom stays masked. Try seeds until one lets us reach the true in the spins available.
  BALANCE.wishes.enabled = true; BALANCE.wishes.twists = true; setG4(true, true);
  let revealed = false, everMaskedBeforeLift = true, tried = 0;
  for (let seed = 1; seed <= 120 && !revealed; seed++){
    let r = act({ type: 'new_run', seed, wish: 'veiled_one', balance: BOSS1 });
    let s = r.state;
    if (!(s.wish && s.wish.active && (s.rungs || []).some(x => x.veiled))) continue;
    tried++;
    const trueRung = (s.rungs || []).find(x => x.tier === 'true');
    if (!trueRung) continue;   // (a rested-true boss — the Fix 2 path, covered by veilPlan above)
    let guard = 0;
    while (!s.over && guard++ < 40){
      if (s.phase !== 'segment') break;
      if ((s.spinsTaken || 0) === 0){ r = act({ type: 'spin' }); s = r.state; continue; }
      // while the true is unmet, the bloom must stay masked (no premature reveal)
      if (!(s.metNow || []).some(m => m.tier === 'true') && !(s.rungs || []).some(x => x.veiled)) everMaskedBeforeLift = false;
      const need = { ...trueRung.req };
      for (const t of s.tray) if (t.kept && need[t.symbol]) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag || 1));
      const kd = (s.tray || []).find(t => !t.kept && !t.locked && t.symbol !== 'blank' && t.symbol !== 'fang' && (need[t.symbol] || 0) > 0);
      if (kd){ r = act({ type: 'keep', i: kd.i }); s = r.state; continue; }
      // true met? check the bloom revealed (colour/req back).
      if ((s.metNow || []).some(m => m.tier === 'true')){
        const bloom = (s.rungs || []).find(x => x.tier === 'bloom');
        if (bloom && !bloom.veiled && bloom.colour && bloom.req){ revealed = true; }
        break;
      }
      if ((s.rollsLeft || 0) > 0){ r = act({ type: 'spin' }); s = r.state; continue; }
      break;
    }
  }
  ok(tried > 0, 'Fix1: reached a veiled boss segment with a True lift rung');
  ok(everMaskedBeforeLift, 'Fix1: the bloom stays masked on every pre-lift read (no leak before the True is met)');
  ok(revealed, 'Fix1: meeting the True (the lift) UNMASKS the bloom (colour + req return) — the veil lifts, not before');
  clearBalanceOverrides(); setDisabledContent([]); configure({});
}

// =============================================================================
// FIX 3 — the forced/intent apex respects the MIN_REACH floor (degrade a dead shape, keep the demand).
// =============================================================================
{
  setG4(true, true);
  const isoReach = (hand, apex) => evaluateRungSet(hand, [apex], ctx(), { trials: 240 }).reach[0] || 0;

  // (a) forced apex (The Demanding One, count:4) on a DEAD-apex hand → DEGRADES to a reachable shape at value 10.
  let degraded = 0, v10 = 0, present = 0;
  for (let s = 0; s < 16; s++){
    const r = gen(DEADMIND, { index: 2, position: 2, len: 3 }, { seed: 5000 + s, twist: { kind: 'rungs', params: { count: 4 } } });
    const apex = r.rungs.find(x => x.tier === 'apex');
    if (apex){ present++; if (apex.value === 10) v10++; if (r.generator.apexDegraded) degraded++; }
  }
  ok(present === 16, `Fix3: the forced apex is ALWAYS composed (the demand never drops) — ${present}/16`);
  ok(v10 === 16, `Fix3: the (degraded) forced apex keeps VALUE 10 — the demand stays — ${v10}/16`);
  ok(degraded === 16, `Fix3: a dead-shape forced apex DEGRADES every time (apexDegraded flag) — ${degraded}/16`);
  // the degraded apex is a REACHABLE bloom-menu shape on the strongest colour (mind), not the raw conc/pure.
  const one = gen(DEADMIND, { index: 2, position: 2, len: 3 }, { seed: 5000, twist: { kind: 'rungs', params: { count: 4 } } });
  const degApex = one.rungs.find(x => x.tier === 'apex');
  ok(degApex && !degApex.pure && isoReach(DEADMIND, degApex) >= MIN_REACH,
    `Fix3: the degraded apex is a shape the hand can touch (isolated reach ${isoReach(DEADMIND, degApex).toFixed(3)} ≥ ${MIN_REACH})`);
  ok(one.generator.apexDegraded === true, 'Fix3: the degrade is disclosed in the generator telemetry');

  // (b) forced apex on a CAPABLE (deep-body) hand → a real apex shape, value 10, reach floor respected, NOT degraded.
  let capReachOk = 0, capPresent = 0;
  for (let s = 0; s < 12; s++){
    const r = gen(DEEP, { index: 2, position: 2, len: 3 }, { seed: 6000 + s, twist: { kind: 'rungs', params: { count: 4 } } });
    const apex = r.rungs.find(x => x.tier === 'apex');
    if (apex){ capPresent++; if (isoReach(DEEP, apex) >= MIN_REACH && apex.value === 10) capReachOk++; }
  }
  ok(capPresent > 0 && capReachOk === capPresent, `Fix3: a capable hand's forced apex is reachable (isolated ≥ MIN) at value 10 — ${capReachOk}/${capPresent}`);

  // (c) the REACH-FLOOR INVARIANT across the sweep: EVERY emitted apex (forced or intent) has isolated reach ≥ MIN.
  //     (either the preferred shape was reachable, or it degraded to a reachable one — never a 0%-reach demand.)
  let apexTotal = 0, apexFloorOk = 0;
  const sweepHands = [FRESH, DEEP, DEADMIND];
  for (let s = 0; s < 24; s++){
    const hand = sweepHands[s % 3];
    // forced (demanding) + intent (strong-late high-ema) paths both exercised
    const cases = [
      gen(hand, { index: 2 + (s % 3), position: 2, len: 3 }, { seed: 7000 + s, twist: { kind: 'rungs', params: { count: 4 } } }),
      gen(hand, { index: 2 + (s % 3), position: 2, len: 3 }, { seed: 7500 + s, priorEma: 0.7 }),   // intent apex (power-gated)
    ];
    for (const r of cases){
      const apex = r.rungs.find(x => x.tier === 'apex');
      if (apex){ apexTotal++; if (isoReach(hand, apex) >= MIN_REACH) apexFloorOk++; }
    }
  }
  ok(apexTotal > 0, `Fix3: the sweep exercised apex composition (${apexTotal} apexes across forced + intent paths)`);
  ok(apexFloorOk === apexTotal, `Fix3: EVERY emitted apex respects the MIN_REACH floor — ${apexFloorOk}/${apexTotal} (no dead demand ships)`);

  // (d) intent-path apex is reach-guarded too — a strong-late DEADMIND-ish intent apex would degrade rather than
  //     ship 0-reach. (DEEP intent apex is reachable; the guard is the same apexAxis routed via buildApexPlan.)
  const intent = gen(DEEP, { index: 3, position: 2, len: 3 }, { seed: 8123, priorEma: 0.7 });
  const intentApex = intent.rungs.find(x => x.tier === 'apex');
  ok(!intentApex || isoReach(DEEP, intentApex) >= MIN_REACH, 'Fix3: an intent-path apex, when offered, also respects the reach floor');
}

// =============================================================================
// FIX 4 — tier-label / difficulty ORDERING (floor≥true≥bloom reach), stream-neutral (same shapes/rng).
// =============================================================================
{
  const shapeKey = set => set.rungs.map(r => `${r.colour}:${JSON.stringify(r.req)}:${r.concentrated ? 'c' : ''}${r.pure ? 'p' : ''}`).sort().join('|');
  const reachKey = set => set.rungs.map(r => r._p).sort((a, b) => a - b).join(',');
  const sweepHands = [FRESH, DEEP, DEADMIND];

  // OFF (composer/relabel off) vs ON at an EARLY patron with NO twist: the ONLY difference is the relabel
  // (rest/apex refinement is late-patron-gated; relabel is rng-free), so this isolates Fix 4 as stream-neutral.
  let inv = 0, invBad = 0, sameShapes = 0, samePNone = 0, sameReachSet = 0, n = 0, offInversions = 0;
  for (let s = 0; s < 48; s++){
    const patron = { index: s % 2, position: s % 3, len: 3 };   // patron 0/1 — no composer refinement
    const hand = sweepHands[s % 3];
    setG4(false, false); const off = gen(hand, patron, { seed: 1000 + s * 7 });
    setG4(true, true);   const on  = gen(hand, patron, { seed: 1000 + s * 7 });
    n++;
    // union / stream neutrality: identical shapes, identical reach multiset, identical predicted pNone
    if (shapeKey(off) === shapeKey(on)) sameShapes++;
    if (reachKey(off) === reachKey(on)) sameReachSet++;
    if (off.generator.pSnapPredicted === on.generator.pSnapPredicted) samePNone++;
    // was the OFF set inverted? (a "floor" reach below the "true", or "true" below "bloom")
    const oF = off.rungs.find(r => r.tier === 'floor'), oT = off.rungs.find(r => r.tier === 'true'), oB = off.rungs.find(r => r.tier === 'bloom');
    if (oF && oT && oB && !(oF._p >= oT._p - 1e-9 && oT._p >= oB._p - 1e-9)) offInversions++;
    // ON invariant: floor reach ≥ true reach ≥ bloom reach
    const F_ = on.rungs.find(r => r.tier === 'floor'), T_ = on.rungs.find(r => r.tier === 'true'), B_ = on.rungs.find(r => r.tier === 'bloom');
    if (F_ && T_ && B_){ inv++; if (!(F_._p >= T_._p - 1e-9 && T_._p >= B_._p - 1e-9)) invBad++; }
  }
  ok(sameShapes === n, `Fix4: relabel preserves the exact SHAPES (union unchanged) — ${sameShapes}/${n}`);
  ok(sameReachSet === n, `Fix4: relabel preserves the exact reach multiset — ${sameReachSet}/${n}`);
  ok(samePNone === n, `Fix4: relabel is stream-neutral — predicted pNone identical OFF vs ON — ${samePNone}/${n}`);
  ok(inv > 0 && invBad === 0, `Fix4: post-relabel floor reach ≥ true reach ≥ bloom reach ALWAYS holds — ${inv - invBad}/${inv}`);
  ok(offInversions > 0, `Fix4: the pre-fix (OFF) fitter DID emit inverted sets that the relabel corrects (${offInversions} found — the bug is real)`);

  // ON invariant holds on the COMPOSER-refined late sets too (2-rung rest, 4-rung apex): non-apex order holds; apex is value 10.
  setG4(true, true);
  let lateInv = 0, lateBad = 0, apexUntouched = 0, apexSeen = 0;
  for (let s = 0; s < 40; s++){
    const hand = sweepHands[s % 3];
    const twist = (s % 2) ? { kind: 'rungs', params: { count: 4 } } : null;
    const r = gen(hand, { index: 3, position: 2, len: 3 }, { seed: 9000 + s, priorEma: 0.7, twist });
    const na = r.rungs.filter(x => x.tier !== 'apex');
    const F_ = na.find(x => x.tier === 'floor'), T_ = na.find(x => x.tier === 'true'), B_ = na.find(x => x.tier === 'bloom');
    if (F_ && T_ && B_){ lateInv++; if (!(F_._p >= T_._p - 1e-9 && T_._p >= B_._p - 1e-9)) lateBad++; }
    const apex = r.rungs.find(x => x.tier === 'apex');
    if (apex){ apexSeen++; if (apex.value === 10) apexUntouched++; }
  }
  ok(lateInv > 0 && lateBad === 0, `Fix4: the invariant holds on composer-refined 3-rung late sets too — ${lateInv - lateBad}/${lateInv}`);
  ok(apexSeen === 0 || apexUntouched === apexSeen, `Fix4: the apex is NEVER relabeled (stays value 10, the ceiling) — ${apexUntouched}/${apexSeen}`);
  clearBalanceOverrides(); setDisabledContent([]); configure({});
}

// =============================================================================
// FIX 5 — desc audit: no constraint/twist desc claims whole-patron "each segment" physics (boss-gated).
// =============================================================================
{
  // the boss-gated species are constraint + twist (jackpots stay patron-wide — audited separately, not touched).
  const gated = Object.values(WISHES).filter(w => w.species === 'constraint' || w.species === 'twist');
  const stale = gated.filter(w => /each segment/i.test(w.desc || ''));
  ok(stale.length === 0, `Fix5: no boss-gated (constraint/twist) desc claims "each segment" physics — offenders: ${stale.map(w => w.id).join(',') || 'none'}`);

  // the specific offender is corrected + still describes its free reroll.
  ok(!/each segment/i.test(WISHES.generous_one.desc), 'Fix5: the Generous One no longer says "each segment"');
  ok(/free reroll/i.test(WISHES.generous_one.desc), 'Fix5: the Generous One still describes its free reroll');
  ok(/segment/i.test(WISHES.generous_one.desc) && /(leans in|watches|final|boss)/i.test(WISHES.generous_one.desc),
    `Fix5: the corrected copy scopes the reroll to the boss segment (got: "${WISHES.generous_one.desc}")`);

  // jackpot descs (patron-wide goals) are intentionally NOT rewritten — sanity that they still read patron-wide.
  ok(/patronage|while she watches|whole/i.test(WISHES.spotless_one.desc), 'Fix5: jackpot descs still describe patron-wide goals (untouched)');
}

console.log(`\npostg4 bugfix: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
