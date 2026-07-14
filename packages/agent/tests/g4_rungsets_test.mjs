// =============================================================================
// GENERATOR v2 §G4 — DYNAMIC RUNG-SETS (the composer, the apex tier, the 2-rung rest,
// boss rung-conditions). Drives the pure generator + probe + engine directly AND the
// REAL session core (session.mjs) for the boss-gated flows. Not a KNOWN_FAIL — a design gate.
// -----------------------------------------------------------------------------
// Covers (per the G4 brief):
//   COMPOSER  — merge precedence (twist forbid beats intent count); validation (forbid all
//               three tiers clamps sane, never crashes); anchor moves under forbid:['floor']
//               and the tension fallback NEVER re-admits a forbidden floor (trap 4).
//   APEX      — absent at low power / early patrons; appears on a strong late hand; value-orders
//               in resolveLadder; completion draws at ROYAL; prices via the honest shaped lines;
//               and the composer reduces the nofit-easy clamp on strong late hands.
//   2-RUNG    — the intent never rests the live-chain colour; a boss MAY rest any colour; union
//               math is coherent at 2 and 4 rungs; the rest is disclosed in state + events.
//   WISHES    — merciless_one / demanding_one validate; species-gated; boss-gated physics.
//   NEUTRAL   — rungs + apexRungs OFF ⇒ byte-identical to HEAD 18ba4db (a frozen-matrix hash);
//               determinism throughout.
// =============================================================================
import crypto from 'crypto';
import { BALANCE, num, setBalanceOverrides, clearBalanceOverrides, setDisabledContent } from '../../engine/balance.js';
import { makeRng } from '../../engine/engine.js';
import { resolveLadder } from '../../engine/engine.js';
import { generateSegment, resetShapeMemory, composeRungSpec, TIER_VALUE } from '../../engine/generator.js';
import { evaluateRungSet } from '../../engine/probe.js';
import { drawLadder } from '../../engine/reward_ladder.js';
import { twistRungSpec, TWIST_KINDS, twistKeptPool } from '../../engine/ritual.js';
import { WISHES, validateWish, generateWish } from '../../content/wishes.js';
import { newRun, act, serializeState, legalActions, configure } from '../session.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };

const F  = (s) => ({ symbol: s, mag: 1, state: 'live' });
const Fm = (s, m) => ({ symbol: s, mag: m, state: 'live' });
const mkHand = rows => ({ dice: rows.map(syms => ({ faces: syms.map(x => (typeof x === 'string' ? F(x) : Fm(x[0], x[1]))) })) });

// a fresh (weak, power ~0.43) hand, a DEEP strong body build (power ~0.59 ≥ apexPowerGate), a no-body hand
const FRESH  = mkHand([['body','body','mind'],['body','spirit','fang'],['mind','spirit','mana'],['mind','mind','spirit'],['charm','charm','body'],['fang','mind','charm']]);
const DEEP   = mkHand([[['body',2],'body','mind'],[['body',2],'mind','body'],['mind','spirit','mana'],[['spirit',2],'spirit','mind'],['body','charm','body'],['mind','body','spirit']]);
const NOBODY = mkHand([['mind','mind','spirit'],['mind','spirit','charm'],['spirit','mind','mana'],['spirit','spirit','mind'],['charm','mind','spirit'],['mind','spirit','charm']]);
const ctx = () => ({ warps: [], twist: null, tempo: { bonusSpins: 0, offeredRerolls: 0 },
  takeRates: num('generator2.takeRates', { sigil: 0.6, expose: 0.4, release: 0.3, echo: 0.5 }) });

const setG4 = (rungs, apex) => {
  BALANCE.generator2.enabled = true; BALANCE.generator2.jointProbe = true; BALANCE.generator2.band = true;
  BALANCE.generator2.rungs = rungs; BALANCE.generator2.apexRungs = apex;
};
// a direct band-path generateSegment (no session), late-patron-aware
const gen = (hand, patron, opts = {}) => {
  resetShapeMemory();
  return generateSegment(hand, {}, { rng: makeRng(opts.seed ?? 77), segIndex: opts.segIndex ?? (patron.index * 3 + patron.position),
    patron, priorEma: opts.priorEma ?? null, twist: opts.twist ?? null, liveChainColour: opts.liveChainColour ?? null });
};

clearBalanceOverrides(); setDisabledContent([]); configure({});

// =============================================================================
// COMPOSER — the rungSpec merge + validation + anchor/trap-4
// =============================================================================
{
  setG4(true, true);
  // merge precedence — a twist forbid supersedes a lower-precedence intent count (§3.1)
  const m = composeRungSpec([{ count: 4, source: 'intent' }, { forbid: ['floor'], source: 'twist' }]);
  ok(m.forbid.includes('floor') && m.count == null, `composer: twist forbid beats intent count (got ${JSON.stringify(m)})`);
  const m2 = composeRungSpec([{ count: 4, source: 'twist' }]);
  ok(m2.count === 4, 'composer: a lone twist count survives the merge');
  // relic is a reserved seam — a relic source merges below a twist (precedence room only)
  const m3 = composeRungSpec([{ count: 2, source: 'relic' }, { count: 4, source: 'twist' }]);
  ok(m3.count === 4, 'composer: twist outranks relic on a count conflict (relic seam reserved)');

  // validation — forbid ALL three tiers clamps sanely (re-adds up to NUMBERS.rungs.min), never crashes
  let crashed = false, seg;
  try { seg = gen(FRESH, { index: 2, position: 2, len: 3 }, { twist: { kind: 'rungs', params: { forbid: ['floor', 'true', 'bloom'] } } }); }
  catch (e) { crashed = true; }
  ok(!crashed, 'composer: forbid all three tiers does NOT crash');
  ok(seg && seg.rungs.length >= num('rungs.min', 2), `composer: forbid-all clamps up to >= min rungs (got ${seg && seg.rungs.length})`);
  ok(seg && new Set(seg.rungs.filter(r => r.tier !== 'apex').map(r => r.colour)).size === seg.rungs.filter(r => r.tier !== 'apex').length,
    'composer: forbid-all still emits distinct-colour rungs');

  // anchor moves under forbid:['floor'] + trap 4 — a forbidden FLOOR NEVER reappears (even via the
  // tension fallback, which widens within the ALLOWED cands only). Sweep seeds/patrons incl. weak hands.
  let floorSeen = 0, forbidRuns = 0, restedFloor = 0;
  for (let s = 0; s < 40; s++){
    const patron = { index: 2 + (s % 3), position: s % 3, len: 3 };
    const hand = (s % 2) ? FRESH : DEEP;
    const r = gen(hand, patron, { seed: 300 + s * 13, twist: { kind: 'rungs', params: { forbid: ['floor'] } } });
    forbidRuns++;
    if (r.rungs.some(x => x.tier === 'floor')) floorSeen++;
    if (r.generator.rested) restedFloor++;
    ok(new Set(r.rungs.filter(x => x.tier !== 'apex').map(x => x.colour)).size === r.rungs.filter(x => x.tier !== 'apex').length, `composer: forbid-floor set stays distinct (seed ${s})`);
  }
  ok(floorSeen === 0, `composer: trap 4 — a forbidden floor NEVER reappears (saw ${floorSeen}/${forbidRuns})`);
  ok(restedFloor === forbidRuns, `composer: forbid-floor rests the floor colour every time (${restedFloor}/${forbidRuns})`);
}

// =============================================================================
// APEX — machinery, entry conditions, pricing, draw grade
// =============================================================================
{
  setG4(true, true);
  // (machinery) value-orders in resolveLadder: apex (10) beats a same-colour bloom (6)
  const pool = [Fm('body', 2), Fm('body', 1)];   // 3 body pips (meets bloom body:3) + a mag-2 face (meets apex conc body:2)
  const rungs = [{ tier: 'bloom', colour: 'body', value: 6, req: { body: 3 } },
                 { tier: 'apex',  colour: 'body', value: 10, req: { body: 2 }, concentrated: true }];
  const won = resolveLadder(pool, rungs);
  ok(won.tier === 'apex' && won.value === 10, `apex: resolveLadder value-orders the apex above bloom (won ${won.tier}/${won.value})`);
  ok(TIER_VALUE.apex === 10, 'apex: TIER_VALUE.apex === 10');

  // (draw grade) an apex completion draws at ROYAL — no new grade
  BALANCE.rewardLadder.enabled = true;
  const draw = drawLadder({ tier: 'apex', metTiers: ['apex'] }, makeRng(5));
  ok(draw.grade === 'royal', `apex: an apex completion draws at ROYAL (got ${draw.grade})`);

  // (pricing) the shaped apex prices honestly through evaluateRungSet — >0 on a capable hand, ~0 on an incapable one
  const apexConc = { tier: 'apex', colour: 'body', value: 10, req: { body: 2 }, concentrated: true };
  const apexPure = { tier: 'apex', colour: 'body', value: 10, req: { body: 3 }, pure: true };
  const capConc = evaluateRungSet(DEEP, [apexConc], ctx(), { trials: 400 });
  ok(capConc.reach[0] > 0.05, `apex: concentrated prices a REAL rate on a deep-body hand (${capConc.reach[0].toFixed(3)})`);
  const incapConc = evaluateRungSet(NOBODY, [apexConc], ctx(), { trials: 400 });
  ok(incapConc.reach[0] <= 0.02, `apex: concentrated prices ~0 on a hand with no deep body (${incapConc.reach[0].toFixed(3)})`);
  const capPure = evaluateRungSet(DEEP, [apexPure], ctx(), { trials: 400 });
  ok(capPure.reach[0] > 0 && capPure.reach[0] < 1, `apex: pure prices in (0,1) on a body-rich hand (${capPure.reach[0].toFixed(3)})`);
  ok(evaluateRungSet(NOBODY, [apexPure], ctx(), { trials: 400 }).reach[0] <= 0.01, 'apex: pure prices ~0 on a no-body hand');

  // (entry) ABSENT at low power / early patrons; PRESENT on a strong late hand (many seeds)
  let apexEarly = 0, apexWeak = 0, apexStrongLate = 0, strongLateRuns = 0;
  for (let s = 0; s < 40; s++){
    // early: DEEP hand but patron 0 (index 0 < latePatron) → the intent never offers an apex
    if (gen(DEEP, { index: 0, position: s % 3, len: 3 }, { seed: 500 + s }).rungs.some(r => r.tier === 'apex')) apexEarly++;
    // weak: FRESH hand (power < apexPowerGate) at a LATE patron → power gate blocks the apex
    if (gen(FRESH, { index: 3, position: 2, len: 3 }, { seed: 600 + s }).rungs.some(r => r.tier === 'apex')) apexWeak++;
    // strong + late: DEEP hand, late patron, priorEma high (pricedPower high) → apex is offered
    strongLateRuns++;
    if (gen(DEEP, { index: 2 + (s % 3), position: 2, len: 3 }, { seed: 700 + s, priorEma: 0.7 }).rungs.some(r => r.tier === 'apex')) apexStrongLate++;
  }
  ok(apexEarly === 0, `apex: ABSENT at patron 0 (early) even on a strong hand (saw ${apexEarly})`);
  ok(apexWeak === 0, `apex: ABSENT on a weak (low-power) hand at a late patron (saw ${apexWeak})`);
  ok(apexStrongLate > 0, `apex: PRESENT on a strong late hand under the intent conditions (${apexStrongLate}/${strongLateRuns})`);

  // (nofit-easy closure) a strong late hand that pre-G4 (rungs OFF) clamps nofit-easy: with the composer ON
  // the 2-rung rest raises tension, so fewer segments stay stuck below the band (statistical, fixed seeds).
  const STRONG = mkHand([['body','body','body'],['body','mind','body'],['mind','mind','spirit'],['spirit','spirit','mind'],['body','spirit','charm'],['mind','body','spirit']]);
  let easyOff = 0, closedOn = 0;
  for (let s = 0; s < 30; s++){
    const patron = { index: 3, position: 2, len: 3 };
    setG4(false, false); const off = gen(STRONG, patron, { seed: 800 + s, priorEma: 0.3 });
    if (off.generator.fit !== 'nofit-easy') continue;
    easyOff++;
    setG4(true, true); const on = gen(STRONG, patron, { seed: 800 + s, priorEma: 0.3 });
    // closed iff it lands in-band OR its |pNone - target| shrank vs the OFF clamp
    const t = on.generator.pSnapTarget;
    if (on.generator.fit === 'band' || Math.abs(on.generator.pSnapPredicted - t) < Math.abs(off.generator.pSnapPredicted - t) - 1e-9) closedOn++;
  }
  ok(easyOff > 0, `apex/rest: found strong-late segments that clamp nofit-easy pre-G4 (${easyOff})`);
  ok(closedOn >= Math.ceil(easyOff * 0.5), `apex/rest: the composer CLOSES a majority of them toward the band (${closedOn}/${easyOff})`);
  setG4(true, true);
}

// =============================================================================
// 2-RUNG REST — the live-chain guard, the boss override, union math, disclosure
// =============================================================================
{
  setG4(true, true);
  const STRONG = mkHand([['body','body','body'],['body','mind','body'],['mind','mind','spirit'],['spirit','spirit','mind'],['body','spirit','charm'],['mind','body','spirit']]);
  const COLS = ['body', 'mind', 'spirit'];
  // (intent guard) the intent NEVER rests the player's live-chain colour
  let intentRests = 0, guardViolations = 0;
  for (let s = 0; s < 45; s++){
    const live = COLS[s % 3];
    const r = gen(STRONG, { index: 3, position: 2, len: 3 }, { seed: 900 + s, priorEma: 0.3, liveChainColour: live });
    if (r.generator.rested){ intentRests++; if (r.generator.rested === live) guardViolations++; }
  }
  ok(intentRests > 0, `2-rung: the intent rests a colour on some strong-late segment (${intentRests})`);
  ok(guardViolations === 0, `2-rung: the intent NEVER rests the live-chain colour (violations ${guardViolations})`);

  // (boss override) a boss MAY rest any colour — merciless forbids the floor even when it is the live chain
  const probe = gen(FRESH, { index: 2, position: 2, len: 3 }, { seed: 4242, twist: { kind: 'rungs', params: { forbid: ['floor'] } } });
  const bossRested = probe.generator.rested;
  ok(!!bossRested, 'boss rest: a merciless (forbid-floor) boss rests a colour');
  const probe2 = gen(FRESH, { index: 2, position: 2, len: 3 }, { seed: 4242, twist: { kind: 'rungs', params: { forbid: ['floor'] } }, liveChainColour: bossRested });
  ok(probe2.generator.rested === bossRested, 'boss rest: the boss rests that colour EVEN when it is the live chain (the cruelty knob)');

  // (union math) coherent at 2 and 4 rungs (pNone + pExactly1 + pMulti === 1)
  const floor = { tier: 'floor', colour: 'body', value: 1, req: { body: 2 } };
  const trueR = { tier: 'true', colour: 'mind', value: 3, req: { mind: 2, charm: 1 } };
  const bloom = { tier: 'bloom', colour: 'spirit', value: 6, req: { spirit: 3 } };
  const apex  = { tier: 'apex', colour: 'body', value: 10, req: { body: 2 }, concentrated: true };
  const r2 = evaluateRungSet(DEEP, [floor, bloom], ctx(), { trials: 240 });
  ok(Math.abs(r2.pNone + r2.pExactly1 + r2.pMulti - 1) < 1e-9, 'union: coherence holds at 2 rungs');
  const r4 = evaluateRungSet(DEEP, [floor, trueR, bloom, apex], ctx(), { trials: 240 });
  ok(Math.abs(r4.pNone + r4.pExactly1 + r4.pMulti - 1) < 1e-9, 'union: coherence holds at 4 rungs');
  ok(r4.reach.length === 4 && r2.reach.length === 2, 'union: the reach vector length tracks the rung count');
}

// =============================================================================
// SESSION — the boss wishes end-to-end (disclosure + boss-gating), via patronLen=1 (seg 0 is the boss)
// =============================================================================
{
  clearBalanceOverrides();
  BALANCE.wishes.enabled = true; BALANCE.wishes.twists = true;
  setG4(true, true);
  const BOSS1 = { 'wishes.patronLen': 1 };

  // merciless_one — the boss segment (seg 0 at patronLen 1) rests the floor colour: 2 rungs, s.generator.rested
  // set, the disclosure event fires. Spin once so the rungs surface with a fit.
  {
    const r0 = act({ type: 'new_run', seed: 51, wish: 'merciless_one', balance: BOSS1 });
    const st = r0.state;
    ok(st.wish && st.wish.twist && st.wish.twist.kind === 'rungs' && st.wish.active, 'session: merciless twist is a boss-active rungs condition');
    ok((st.rungs || []).length === 2 && !(st.rungs || []).some(r => r.tier === 'floor'), `session: merciless yields a 2-rung set with NO floor (got ${(st.rungs||[]).map(r=>r.tier).join(',')})`);
    ok(st.generator && st.generator.rested, 'session: s.generator.rested discloses the rested colour');
    ok((r0.events || []).some(e => /thread rests|no .*rung answers|Floor is barred|condition/.test(e)), 'session: the rung-condition is disclosed in events');
  }

  // demanding_one — the boss segment gets a 4th APEX rung (count 4)
  {
    const r0 = act({ type: 'new_run', seed: 51, wish: 'demanding_one', balance: BOSS1 });
    const st = r0.state;
    const apexRung = (st.rungs || []).find(r => r.tier === 'apex');
    ok((st.rungs || []).length === 4 && !!apexRung, `session: demanding yields a 4-rung set incl. an apex (got ${(st.rungs||[]).length})`);
    ok(apexRung && apexRung.value === 10, 'session: the apex rung surfaces value 10');
    ok((r0.events || []).some(e => /rungs demanded|ceiling extends|takes hold/.test(e)), 'session: the demanding condition is disclosed');
  }

  // boss-gating: the rung condition is INERT off the boss segment (patronLen 3 → seg 0/1 normal, seg 2 boss)
  {
    clearBalanceOverrides();
    const r0 = act({ type: 'new_run', seed: 51, wish: 'merciless_one' });   // default patronLen 3
    const st0 = serializeState();
    ok((st0.rungs || []).length === 3 && (st0.rungs || []).some(r => r.tier === 'floor') && !st0.wish.active,
      'session: merciless is INERT on segment 1 (3 rungs incl. floor, wish not active)');
  }
  clearBalanceOverrides(); setG4(true, true);
}

// =============================================================================
// WISHES — the two new rows validate + species-gate + boss-gate (data-level)
// =============================================================================
{
  ok(TWIST_KINDS.includes('rungs'), "wishes: TWIST_KINDS includes 'rungs'");
  ok(validateWish(WISHES.merciless_one).ok, 'wishes: merciless_one validates');
  ok(validateWish(WISHES.demanding_one).ok, 'wishes: demanding_one validates');
  ok(twistRungSpec(WISHES.merciless_one.twist).forbid.includes('floor'), 'wishes: twistRungSpec reads merciless forbid');
  ok(twistRungSpec(WISHES.demanding_one.twist).count === 4, 'wishes: twistRungSpec reads demanding count');
  ok(twistRungSpec({ kind: 'mirror' }) === null && twistRungSpec(null) === null, 'wishes: twistRungSpec is null for non-rungs twists');
  ok(twistKeptPool({ kind: 'rungs', params: {} }, [{ symbol: 'body', mag: 1 }]).length === 1, "wishes: a 'rungs' twist carries NO resolve-pool transform (byte-neutral)");
  // species gating — with wishes.twists OFF, generateWish never yields a twist species
  const savT = BALANCE.wishes.twists; BALANCE.wishes.twists = false;
  let anyTwist = false;
  for (let s = 0; s < 200; s++){ const w = generateWish(makeRng(s * 101 + 3)); if (w.species === 'twist') anyTwist = true; }
  ok(!anyTwist, 'wishes: twists OFF ⇒ merciless/demanding never roll (species-gated)');
  BALANCE.wishes.twists = savT;
}

// =============================================================================
// NEUTRALITY — rungs + apexRungs OFF ⇒ byte-identical to HEAD 18ba4db (frozen-matrix hash)
// -----------------------------------------------------------------------------
// §G5 PIN: the frozen hash below is anchored at the 18ba4db-era TUNING NUMBERS. This proof is
// about the G4 FLAG (composer off ⇒ same stream), NOT about the designer numbers — so the
// campaign-tunable leaves generateSegment reads are PINNED here via §C0 overrides at their
// 18ba4db values (identical to the values in force when the hash was frozen ⇒ the hash is
// unchanged today), which keeps this anchor valid when the tuning campaign (G5) retunes
// balance.js NUMBERS. A future campaign that tunes a NEW generateSegment-read leaf must add
// it to this pin map (or the hash breaks for a non-flag reason).
// =============================================================================
{
  setBalanceOverrides({
    'generator2.bandBase0': 0.10, 'generator2.bandRamp': 0.03, 'generator2.bandEasy': 0.6,
    'generator2.bandBoss': 1.5, 'generator2.bandFitTol': 0.03, 'generator2.bandFloor': 0.05,
    'generator2.bandCeil': 0.60, 'generator2.trials': 240, 'generator2.fitBudget': 24,
    'generator2.richnessWeight': 0.15, 'generator2.lagAlpha': 0.5, 'generator2.apexPowerGate': 0.55,
    'generator2.latePatron': 2, 'tempo.baseSpins': 3, 'tempo.rerollToSpin': 0.5,
    'generator2.floorEasy': false,
  });
  const f = (s, m = 1) => ({ symbol: s, mag: m, state: 'live' });
  const hand = rows => ({ dice: rows.map(syms => ({ faces: syms.map(x => (typeof x === 'string' ? f(x) : f(x[0], x[1]))) })) });
  const HANDS = {
    fresh:  hand([['body','body','mind'],['body','spirit','fang'],['mind','spirit','mana'],['mind','mind','spirit'],['charm','charm','body'],['fang','mind','charm']]),
    strong: hand([['body','body','body'],['body','mind','body'],['mind','mind','spirit'],['spirit','spirit','mind'],['body','spirit','charm'],['mind','body','spirit']]),
    deep:   hand([[['body',2],'body','mind'],[['body',2],'mind','body'],['mind','spirit','mana'],[['spirit',2],'spirit','mind'],['body','charm','body'],['mind','body','spirit']]),
  };
  const round4 = o => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' ? +v.toFixed(4) : v)));
  const matrix = () => {
    const out = {};
    for (const [hn, h] of Object.entries(HANDS))
      for (const seed of [1, 7, 42, 909, 20260710])
        for (const [pi, pos, len] of [[0,0,3],[0,2,3],[2,1,3],[3,2,3],[5,2,3]])
          for (const ema of [null, 0.3, 0.7]){
            resetShapeMemory();
            const seg = generateSegment(h, {}, { seedTag: seed, segIndex: pi*3+pos, patron: { index: pi, position: pos, len }, priorEma: ema });
            out[`${hn}|s${seed}|p${pi}.${pos}|e${ema}`] = round4({
              rungs: seg.rungs.map(r => ({ tier:r.tier, colour:r.colour, value:r.value, req:r.req, _p:r._p, _cand:r._cand, ...(r.concentrated?{c:1}:{}), ...(r.pure?{pu:r.pure}:{}) })),
              gen: seg.generator,
            });
          }
    return out;
  };
  const hashOf = o => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
  // frozen from HEAD 18ba4db (band native-on, no composer) — the G4 flag-off stream must reproduce it exactly.
  const BASELINE = '946a77c61f66f5080d634294516ba880213690e309b9cfadf47b78681c773b27';

  setG4(false, false);
  const offH = hashOf(matrix());
  ok(offH === BASELINE, `neutrality: rungs+apex OFF ⇒ byte-identical to HEAD 18ba4db (hash ${offH.slice(0, 12)})`);
  // determinism: the flag-OFF matrix reproduces itself
  ok(hashOf(matrix()) === offH, 'neutrality: the flag-off matrix is deterministic');

  setG4(true, true);
  const onH = hashOf(matrix());
  ok(onH !== BASELINE, 'neutrality: the composer ON demonstrably changes late segments');
  ok(hashOf(matrix()) === onH, 'determinism: the composer-ON matrix is deterministic (rng-free composer)');
  setG4(true, true);
}

clearBalanceOverrides(); setDisabledContent([]); configure({});
console.log(`\ng4 rungsets: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
