// =============================================================================
// PROBE TEST  (Generator v2 §2.3 / slice G2 — the joint evaluator)
// -----------------------------------------------------------------------------
// Engine-level unit coverage of packages/engine/probe.js (evaluateRungSet +
// handPower), driven DIRECTLY (the evaluator is a pure function — no flags gate
// it; the GATING lives in generator.js and is covered in the agent-level
// generator_v2 test). Four families:
//   SANITY      — on a clean hand a 1-rung joint eval reproduces pReach (same
//                 physics, same behavioral line) within a loose tolerance.
//   INFORMATION — banes / keepCap / rollLimit price LOWER; a ward prices HIGHER;
//                 the mirror twist changes outcomes; an offered sigil raises reach
//                 monotonically with its take-rate; banked spins price.
//   COHERENCE   — pNone + pExactly1 + pMulti === 1; ev is consistent with the
//                 met distribution.
//   POWER       — handPower is stable, in [0,1], and drops under debt.
// =============================================================================
import { makeRng } from '../engine.js';
import { pReach, pReachHuman } from '../generator.js';
import { evaluateRungSet, handPower } from '../probe.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  FAIL:', name); } };

const F = (symbol, mag = 1, ench = null) => ({ symbol, mag, state: 'live', ...(ench ? { ench } : {}) });
const hand = rows => ({ dice: rows.map(syms => ({ faces: syms.map(s => Array.isArray(s) ? F(s[0], s[1] || 1, s[2]) : F(s)) })) });

// a spread hand (all three colours reachable) — the sanity/information substrate
const HAND = hand([
  ['body', 'body', 'mind'], ['body', 'spirit', 'charm'], ['mind', 'spirit', 'mana'],
  ['mind', 'mind', 'spirit'], ['charm', 'body', 'spirit'], ['spirit', 'mind', 'body'],
]);

// ench constructors
const baneReroll = () => ({ trigger: 'on_roll', condition: null, scope: 'self', effect: 'reroll', polarity: 'bane', forced: true, params: {} });
const ward       = () => ({ effect: 'ward', name: 'Ward', polarity: 'boon', forced: false });
const sigil      = () => ({ trigger: 'on_roll', condition: null, scope: 'self', effect: 'reroll', polarity: 'boon', forced: false, params: {} });

// attach an ench to EVERY face carrying `symbol` (a deep copy — never mutate the shared hand)
function withEnchOn(h, symbol, mk){
  return { dice: h.dice.map(d => ({ faces: d.faces.map(f =>
    f.symbol === symbol ? { ...f, ench: [...(f.ench || []), mk()] } : { ...f }) })) };
}

const R = (req, extra = {}) => ({ tier: 'floor', colour: Object.keys(req)[0], value: 1, req, ...extra });

// ---- SANITY: 1-rung joint reach ≈ pReach (clean hand, plain rung) ------------------
{
  const T = 500, tol = 0.06;
  const rungs = [ R({ body: 2 }), R({ mind: 2 }), R({ spirit: 3 }), R({ body: 3, mind: 1 }), R({ mind: 2, charm: 1 }) ];
  let worst = 0;
  for (const r of rungs){
    const legacy = pReach(HAND, r, 'none', T, 3);
    const joint  = evaluateRungSet(HAND, [r], {}, { trials: T }).reach[0];
    worst = Math.max(worst, Math.abs(legacy - joint));
    check(`sanity ${JSON.stringify(r.req)}: joint≈pReach (Δ${Math.abs(legacy - joint).toFixed(3)})`, Math.abs(legacy - joint) <= tol);
  }
  // across several hands (seed-varied), the mean absolute gap stays tight
  let sum = 0, n = 0;
  for (let s = 0; s < 6; s++){
    const rng = makeRng(1000 + s * 7919);
    const h = hand(Array.from({ length: 6 }, () => Array.from({ length: 3 }, () => ['body', 'mind', 'spirit', 'charm'][Math.floor(rng() * 4)])));
    const r = R({ body: 2 });
    sum += Math.abs(pReach(h, r, 'none', T, 3) - evaluateRungSet(h, [r], {}, { trials: T }).reach[0]); n++;
  }
  check(`sanity mean |Δ| across hands ≤ 0.04 (${(sum / n).toFixed(3)})`, sum / n <= 0.04);
  // shaped rung: joint (overkeep line) ≈ pReachHuman
  const shaped = R({ body: 2 }, { concentrated: true });
  const lh = pReachHuman(HAND, shaped, 'none', T, undefined, 3);
  const jh = evaluateRungSet(HAND, [shaped], {}, { trials: T }).reach[0];
  check(`sanity shaped: joint≈pReachHuman (Δ${Math.abs(lh - jh).toFixed(3)})`, Math.abs(lh - jh) <= tol);
}

// ---- INFORMATION: banes price LOWER, a ward recovers -------------------------------
{
  const T = 800;
  const rung = R({ body: 2 });
  const clean = evaluateRungSet(HAND, [rung], {}, { trials: T }).reach[0];
  // a forced on_roll reroll bane on every BODY face — a shown body is rerolled away before it can be kept
  const baned = evaluateRungSet(withEnchOn(HAND, 'body', baneReroll), [rung], {}, { trials: T }).reach[0];
  check(`bane prices lower (clean ${clean.toFixed(2)} > baned ${baned.toFixed(2)})`, baned < clean - 0.03);
  // a ward on the same body faces refuses the bane → reach recovers toward clean
  let warded = withEnchOn(HAND, 'body', baneReroll);
  warded = withEnchOn(warded, 'body', ward);
  const wr = evaluateRungSet(warded, [rung], {}, { trials: T }).reach[0];
  check(`ward prices higher than baned (warded ${wr.toFixed(2)} > baned ${baned.toFixed(2)})`, wr > baned + 0.02);
}

// ---- INFORMATION: keepCap and rollLimit warps price lower --------------------------
{
  const T = 800;
  const rung = R({ body: 3 });
  const base = evaluateRungSet(HAND, [rung], {}, { trials: T }).reach[0];
  const keepCap  = evaluateRungSet(HAND, [rung], { warps: [{ kind: 'keepCap',   params: { count: 1 } }] }, { trials: T }).reach[0];
  const rollLim  = evaluateRungSet(HAND, [rung], { warps: [{ kind: 'rollLimit', params: { rolls: 2 } }] }, { trials: T }).reach[0];
  check(`keepCap prices lower (base ${base.toFixed(2)} > cap ${keepCap.toFixed(2)})`, keepCap < base - 0.02);
  check(`rollLimit prices lower (base ${base.toFixed(2)} > lim ${rollLim.toFixed(2)})`, rollLim < base - 0.02);
}

// ---- INFORMATION: the mirror twist changes trial outcomes --------------------------
{
  const T = 800;
  const rungs = [ R({ body: 3 }), R({ mind: 2, spirit: 1 }) ];
  const plain  = evaluateRungSet(HAND, rungs, {}, { trials: T });
  const mirror = evaluateRungSet(HAND, rungs, { twist: { kind: 'mirror' } }, { trials: T });
  const moved = Math.abs(plain.reach[0] - mirror.reach[0]) + Math.abs(plain.pNone - mirror.pNone) + Math.abs(plain.ev - mirror.ev);
  check(`mirror twist changes outcomes (Δ ${moved.toFixed(3)})`, moved > 0.02);
  // veil is informational — twistKeptPool is a no-op for it, so it must NOT change scoring
  const veil = evaluateRungSet(HAND, rungs, { twist: { kind: 'veil' } }, { trials: T });
  check('veil twist is informational (no scoring change)', veil.reach[0] === plain.reach[0] && veil.pNone === plain.pNone);
}

// ---- INFORMATION: an offered sigil raises reach monotonically with its take-rate ---
{
  const T = 1000;
  const rung = R({ body: 3 });
  const sh = withEnchOn(HAND, 'mind', sigil);   // a reroll sigil on the mind faces (an offered boon)
  const at = rate => evaluateRungSet(sh, [rung], { takeRates: { sigil: rate, expose: 0, release: 0, echo: 0 } }, { trials: T }).reach[0];
  const r0 = at(0.0), r5 = at(0.6), r9 = at(1.0);
  check(`sigil take-rate monotone (${r0.toFixed(3)} ≤ ${r5.toFixed(3)} ≤ ${r9.toFixed(3)})`, r0 <= r5 + 1e-9 && r5 <= r9 + 1e-9);
  check('sigil at rate 1.0 strictly raises reach vs 0.0', r9 > r0);
}

// ---- INFORMATION: banked spins price (parity with readsTempoPower) -----------------
{
  const T = 800;
  const rung = R({ body: 3 });
  const r0 = evaluateRungSet(HAND, [rung], { tempo: { bonusSpins: 0 } }, { trials: T }).reach[0];
  const r2 = evaluateRungSet(HAND, [rung], { tempo: { bonusSpins: 2 } }, { trials: T }).reach[0];
  check(`bonusSpins raise reach (${r0.toFixed(2)} < ${r2.toFixed(2)})`, r2 > r0);
  // offered rerolls (the wish free-reroll channel) also raise reach
  const rr = evaluateRungSet(HAND, [rung], { tempo: { bonusSpins: 0, offeredRerolls: 2 } }, { trials: T }).reach[0];
  check('offered rerolls raise reach', rr > r0);
}

// ---- COHERENCE: the distribution sums to 1; ev tracks the met distribution ---------
{
  const T = 600;
  const rungs = [ R({ body: 2 }, { tier: 'floor', value: 1 }), { tier: 'true', colour: 'mind', value: 3, req: { mind: 2 } }, { tier: 'bloom', colour: 'spirit', value: 6, req: { spirit: 3 } } ];
  const ev = evaluateRungSet(HAND, rungs, {}, { trials: T });
  check('pNone + pExactly1 + pMulti === 1', Math.abs(ev.pNone + ev.pExactly1 + ev.pMulti - 1) < 1e-9);
  check('ev within [0, max tier value]', ev.ev >= 0 && ev.ev <= 6 + 1e-9);
  check('ev > 0 iff some rung ever met', (ev.ev > 0) === (ev.pNone < 1));
  check('per-rung reach in [0,1]', ev.reach.every(p => p >= 0 && p <= 1));
  check('trials echoed', ev.trials === T);
}

// ---- POWER: stable, in-range, drops under debt -------------------------------------
{
  const T = 400;
  const p1 = handPower(HAND, {}, { trials: T });
  const p2 = handPower(HAND, {}, { trials: T });
  check('handPower deterministic', p1 === p2);
  check('handPower in [0,1]', p1 >= 0 && p1 <= 1);
  // a debt-riddled hand (reroll banes on every colour face) reads WEAKER (principle 2)
  let debt = HAND;
  for (const c of ['body', 'mind', 'spirit']) debt = withEnchOn(debt, c, baneReroll);
  const pd = handPower(debt, {}, { trials: T });
  check(`debt hand reads weaker (clean ${p1.toFixed(3)} > debt ${pd.toFixed(3)})`, pd < p1 - 0.02);
}

console.log(`\nprobe (Generator v2 G2): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
