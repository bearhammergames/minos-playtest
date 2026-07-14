// =============================================================================
// THE JOINT PROBE  (Generator v2 §2.3 / §1 — the information kernel, slice G2)
// -----------------------------------------------------------------------------
// PURE + id-BLIND. ONE evaluator that replaces the legacy per-rung probes
// (pReach / pReachHuman / multiCompletionRate) with a SINGLE trial pass:
//   • roll the hand through a full segment under the PHYSICS KERNEL (kernel.js,
//     consumer #2 — the probe suffers banes/warps/wards EXACTLY as the player
//     does, never a re-implemented rule),
//   • score the resulting kept pool against EVERY rung at once (twist-aware),
//   • measure per-rung reach, pNone (the snap read), pMulti (P(2+)), EV — all on
//     the SAME trials, one pass.
//
// It is consumed by generator.js (candidate pricing + the multi-completion guard
// + the hand-power reading) ONLY behind on('generator2.jointProbe'); flag-off, the
// generator keeps its legacy pReach path byte-identical (see generator.js).
//
// DETERMINISM: every trial draws from its OWN makeRng derivation (never the run
// stream, never a peek — a trial never peeks). Same hand+rungs+ctx ⇒ same result
// on any machine. Nothing here touches process/DOM or reads module state.
//
// WHAT THE PROBE MODELS (the three information tiers, §1.1):
//   • Forced, on-face   — SIMULATED: a shown face carrying a forced on_roll bane
//                         (reroll/lock/erode) fires ward-aware inside the trial.
//   • Forced, ambient   — SIMULATED: keepCap / lockDice / rollLimit / forcedKeep /
//                         rerollOnRoll warps + the mirror twist play on the trial.
//   • Offered / behav.  — TAKE-RATES: tappable sigils/expose/wish-rerolls fold into
//                         effective rolls (`effRolls += count × takeRate × exchange`).
//   • Standing state    — wards are simulated on-face; second_skin is NOT priced
//                         here (it prices ACQUISITION, not per-segment reach — §1.1).
//
// DOCUMENTED APPROXIMATIONS (G3/kernel knobs — see the G2 report):
//   • BANES are priced SOURCE-LOCAL and on_roll only. G1's trap says "forced banes
//     fired ward-aware on SHOWN faces … apply lockEntry/reroll/erodeMag by the
//     bane's effect" — the effect lands on the die showing the baned face, NOT the
//     live scope-resolved target (the kernel exposes no scope helper; targetsForScope
//     is CONTENT, not a rule the probe may inline). on_keep forced banes are not
//     priced (the trap's "shown faces" = on_roll; on_keep banes are partly
//     self-blocking). Net effect on reach is faithful ("one die disrupted per firing").
//   • Fangs are never KEPT by the trial policy (parity with pReach's advancesRung),
//     so fang→wild promotion at resolve is a no-op here (kept for safety).
//
// PURE RUNGS — the dedicated PURITY line (§post-G3 Fix 1). A `pure` rung is met ONLY if
// EVERY kept stat face is its allowed colour (meetsRung's purity gate). The union max-serve
// line keeps faces for ALL three rungs (three DISTINCT colours), so a pure rung is ALWAYS
// profaned by the off-colour keeps the other rungs demand — it priced 0.000 on any hand,
// which poisoned pNone late (pure shapes enter the menus at lateGate). FIX: when the set
// contains a pure rung, that rung is scored on its OWN purity-respecting simulation — a
// second kernel run whose keep line serves ONLY the pure rung (keep its colour, reroll the
// rest; the overkeep error still profanes it occasionally — exactly the legacy pReachHuman
// line for that rung alone). Each pure rung gets an INDEPENDENT rng derivation (salted by
// rung index), so the UNION line's streams are untouched: a set with NO pure rung runs none
// of this and is BYTE-IDENTICAL to before. pNone/pMulti/EV then aggregate the union verdict
// for non-pure rungs with the purity verdict for pure rungs — the two lines model two focused
// players (the legacy priced each shaped rung on its own line too), a documented blend that
// un-poisons pNone. (pMulti may read a hair high when a union rung AND a pure rung both meet —
// no single player achieves both — but that only makes the multi-guard more conservative.)
// =============================================================================
import { makeRng, tally, meetsRung } from './engine.js';
import { STAT_IDS, COLOUR_IDS } from '../content/symbols.js';
import { num } from './balance.js';
import { rollBudget, keepConstraints, twistKeptPool } from './ritual.js';
import {
  throwFaceIdx, lockEntry, rerollGuard, erodeMag, wardIndex, consumeEnchAt, echoEnch,
  rollLockWarp, rerollOnRollWarp, forcedKeepWarp,
} from './kernel.js';

const OVERKEEP_P = 0.35;                                  // parity with generator.js pReachHuman OVERKEEP_P
const DEFAULT_TAKE_RATES = { sigil: 0.6, expose: 0.4, release: 0.3, echo: 0.5 };   // §1.1 Rule-4 placeholders
// Fix 1 — the per-pure-rung rng offset. A large odd constant (golden-ratio hash): the purity
// sub-line for pure rung index r derives its streams from (mainSeed + PURE_SALT·(r+1)) >>> 0,
// so each pure rung gets an INDEPENDENT, deterministic stream that never collides with the
// union line's (7t+3 / 131t+17) — the union simulation stays byte-identical for every set.
const PURE_SALT = 0x9E3779B9;

// -----------------------------------------------------------------------------
// PART B — the information model: effective rolls (spec §1.1)
// -----------------------------------------------------------------------------

// offeredBoonRolls(hand, takeRates, exchange) — the hand's OFFERED boons folded into
// fractional effective rolls. Counts each on_roll forced:false ench (a tappable reroll
// SIGIL or an EXPOSE peek) at its behavioral take-rate × the reroll→spin exchange rate.
// Flat count (per spec §1.1 — "count the hand's offerable enchants"), NOT show-weighted.
function offeredBoonRolls(hand, takeRates, exchange){
  const tr = takeRates || DEFAULT_TAKE_RATES;
  let add = 0;
  for (const d of hand.dice) for (const f of d.faces){
    for (const e of (f.ench || [])){
      if (e.trigger !== 'on_roll' || e.forced) continue;             // only OFFERED (opt-in) on_roll boons
      if (e.effect === 'reroll') add += (tr.sigil  ?? 0) * exchange;
      else if (e.effect === 'expose') add += (tr.expose ?? 0) * exchange;
    }
  }
  return add;
}

// effectiveRolls(hand, ctx) — the segment's rolling budget as a fractional count.
//   base SPINS  = 3 + banked spins, CAPPED by a rollLimit warp (the Hasty One)
//   + offered rerolls (wish free-reroll, tempo) × exchange   — free actions, added ON TOP
//   + the hand's offered sigils/expose (offeredBoonRolls)    — free actions, added ON TOP
// The exchange rate is num('tempo.rerollToSpin', 0.5) (the existing reach economy dial).
// A rollLimit caps the SPINS; free rerolls model as fractional passes beyond the cap (a
// free reroll bypasses the roll limit in live play) — an inherited imprecision of the
// fractional-rolls model (pReach's), documented for G5's budget sweep.
function effectiveRolls(hand, ctx){
  const exchange = num('tempo.rerollToSpin', 0.5);
  const tempo = ctx.tempo || {};
  let spins = num('tempo.baseSpins', 3) + (tempo.bonusSpins || 0);   // ⚖3.12 spin-cap: the probe prices the SAME base budget as live play (default 3)
  const { maxRolls } = rollBudget(ctx.warps || []);
  if (maxRolls != null) spins = Math.min(spins, maxRolls);           // rollLimit caps the base spins
  const rerollFrac = exchange * (tempo.offeredRerolls || 0) + offeredBoonRolls(hand, ctx.takeRates, exchange);
  return spins + rerollFrac;
}

// -----------------------------------------------------------------------------
// TRIAL INTERNALS — the kept-pool builder + the two behavioral keep lines
// -----------------------------------------------------------------------------

// does this hand carry any ench the trial must MUTATE (erode a mag / consume a ward) or
// FIRE (a forced on_roll bane)? If not, the trial skips the per-trial hand copy AND the
// bane pass entirely (the clean-hand fast path — the vast majority of candidate evals).
function handHasLiveEnch(hand){
  for (const d of hand.dice) for (const f of d.faces)
    for (const e of (f.ench || []))
      if (e.effect === 'ward' || e.effect === 'erode' || (e.forced && e.polarity === 'bane')) return true;
  return false;
}

// a deep-ish per-trial hand copy — faces (mag) + ench arrays are the only things a trial
// mutates (erode lowers a face mag; a ward is consumed). Symbols/other fields are shared.
function copyHand(hand){
  return { dice: hand.dice.map(d => ({ faces: d.faces.map(f => ({ ...f, ench: f.ench ? f.ench.map(e => ({ ...e })) : f.ench })) })) };
}

// keptCounts(tray) — PIPS showing per stat symbol among KEPT dice (the max-serve "have").
// Reads the tray (the captured shown symbol/mag) exactly as live keptPool does.
function keptCounts(tray){
  const c = {};
  for (const e of tray) if (e.kept && STAT_IDS.includes(e.symbol)) c[e.symbol] = (c[e.symbol] || 0) + (e.mag || 1);
  return c;
}

// shouldKeep — the union of the two legacy behavioral lines:
//   MAX-SERVE (pReach's advancesRung, generalized): keep a stat face iff it still advances
//     an UNMET need of ANY rung in the set (have < req). Fang/blank are never kept (parity).
//   OVERKEEP (pReachHuman): when the SET contains a shaped rung, a stat face that serves
//     nothing is kept anyway with probability overkeepP — the error that VOIDS pure/exact/
//     concentrated rungs (drawn from a separate noise stream, exactly as pReachHuman).
function shouldKeep(symbol, counts, rungs, overkeepOn, overkeepP, noiseRng){
  if (!STAT_IDS.includes(symbol)) return false;                       // fang/blank/mana-nonrecipe never kept
  const have = counts[symbol] || 0;
  for (const r of rungs){
    const need = (r.req && r.req[symbol]) || 0;
    if (need > 0 && have < need) return true;                         // advances a still-short rung need
  }
  if (overkeepOn && noiseRng() < overkeepP) return true;              // the overkeep error (shaped sets only)
  return false;
}

// fireForcedBanes — the trial's on_roll forced-bane pass (a stripped, kernel-composed
// fireEnch): gather every forced on_roll bane (reroll/lock/erode) on the SHOWN faces,
// sort reroll-first (live parity), apply each SOURCE-LOCAL. Ward refuses one bane
// (wardIndex + consumeEnchAt on the trial hand). Echo softens a bane reroll (a free
// re-throw follows — the second throw is taken). Mutates `tray` (reroll/lock) and the
// trial hand `th` (erode mag / ward consume). Draws only from `rollRng`.
function fireForcedBanes(th, tray, rollRng){
  const actions = [];
  for (const e of tray){
    if (e.symbol === 'blank') continue;
    const face = th.dice[e.di].faces[e.fi];
    for (const en of (face.ench || []))
      if (en.trigger === 'on_roll' && en.forced && en.polarity === 'bane'
          && (en.effect === 'reroll' || en.effect === 'lock' || en.effect === 'erode'))
        actions.push({ di: e.di, en });
  }
  if (!actions.length) return;
  actions.sort((a, b) => (a.en.effect === 'reroll' ? 0 : 1) - (b.en.effect === 'reroll' ? 0 : 1));
  for (const { di, en } of actions){
    const ti = tray.findIndex(x => x.di === di);
    if (ti < 0) continue;
    const face = th.dice[di].faces[tray[ti].fi];
    const wi = wardIndex(face);
    if (wi >= 0){ face.ench = consumeEnchAt(face.ench, wi); continue; }   // the ward holds — bane refused, ward spent
    if (en.effect === 'lock'){
      const lr = lockEntry(tray[ti]); if (lr.changed) tray[ti] = lr.entry;
    } else if (en.effect === 'reroll'){
      if (rerollGuard(tray[ti])){
        let nf = throwFaceIdx(th.dice[di], rollRng, null);
        if (echoEnch(face)) nf = throwFaceIdx(th.dice[di], rollRng, null);   // echo: the free re-throw (price it — a second chance)
        tray[ti] = { ...tray[ti], symbol: nf.symbol, mag: nf.mag, fi: nf.fi };
      }
    } else {   // erode — a PERMANENT trial-hand mag grind (future shows read the lower mag)
      const er = erodeMag(face, (en.params && en.params.pips) || 1);
      if (er.changed) face.mag = er.mag;
    }
  }
}

// runTrialTray — ONE trial's full segment simulation under the kernel, returning the kept
// TRAY. Extracted from evaluateRungSet so BOTH the union line (keepRungs = the whole set) and
// a pure rung's dedicated PURITY line (keepRungs = [thePureRung]) share the EXACT physics; the
// two lines differ ONLY in which rungs the keep policy serves and in their rng streams (passed
// in). Byte-identical to the pre-Fix1 inline loop when called with the full set + (7t+3, 131t+17).
function runTrialTray(hand, keepRungs, warps, cap, live, effRolls, overkeepOn, overkeepP, rollRng, noiseRng){
  const whole = Math.floor(effRolls), frac = effRolls - whole;
  const nSpins = whole + (frac > 0 && rollRng() < frac ? 1 : 0);          // fractional roll → a coin, seeded from THIS trial (frac 0 ⇒ no draw)
  const th = live ? copyHand(hand) : hand;                               // mutate a COPY only when banes/wards live
  const tray = hand.dice.map((d, di) => ({ di, symbol: 'blank', mag: 0, fi: 0, kept: false, keptWin: -1, locked: false }));
  const keepSpend = {};
  let spinsTaken = 0;

  for (let s = 0; s < nSpins; s++){
    // ① rollLock warp — only from the trial's 2nd spin onward (the caller owns the gate)
    if (spinsTaken >= 1)
      for (const di of rollLockWarp(tray, warps, rollRng)){
        const ri = tray.findIndex(x => x.di === di);
        if (ri >= 0) tray[ri] = { ...tray[ri], locked: true };
      }
    // ② reroll the loose (non-kept, non-locked) dice — a trial never peeks (peekedIdx = null)
    for (let i = 0; i < tray.length; i++){
      const e = tray[i];
      if (e.kept || e.locked) continue;
      const nf = throwFaceIdx(th.dice[e.di], rollRng, null);
      tray[i] = { ...e, symbol: nf.symbol, mag: nf.mag, fi: nf.fi };
    }
    spinsTaken++;
    // ③ rerollOnRoll warp (the Fevered) — the kernel draws via the trial throwFn
    { const { tray: nt } = rerollOnRollWarp(tray, warps, di => throwFaceIdx(th.dice[di], rollRng, null));
      for (let i = 0; i < nt.length; i++) tray[i] = nt[i]; }
    // ④ forcedKeep warp (the Soaked Scholar) — auto-lock demanded symbols (keptWin = spinsTaken-1)
    { const { tray: nt } = forcedKeepWarp(tray, warps, spinsTaken - 1);
      for (let i = 0; i < nt.length; i++) tray[i] = nt[i]; }
    // forced on_roll banes fire on the shown faces (ward/echo-aware) — BEFORE the manual keeps
    if (live) fireForcedBanes(th, tray, rollRng);
    // the manual keep pass (the behavioral line), keepCap-limited per spin window
    const win = spinsTaken - 1;
    const counts = keptCounts(tray);
    for (let i = 0; i < tray.length; i++){
      const e = tray[i];
      if (e.kept || e.locked || e.symbol === 'blank') continue;
      if (cap && (keepSpend[win] || 0) >= cap) break;                    // keepCap: no more manual keeps this window
      if (shouldKeep(e.symbol, counts, keepRungs, overkeepOn, overkeepP, noiseRng)){
        tray[i] = { ...e, kept: true, keptWin: win };
        keepSpend[win] = (keepSpend[win] || 0) + 1;
        counts[e.symbol] = (counts[e.symbol] || 0) + (e.mag || 1);       // incremental "have" (di-order, matches pReach)
      }
    }
    if (!tray.some(e => !e.kept && !e.locked)) break;                    // no loose dice left (pReach's early break)
  }
  return tray;
}

// the kept pool of a trial's tray, twist-transformed + fang→__wild__ promoted — the read
// meetsRung scores against (mirror bends the resolve; veil/freeReroll return the pool as-is).
function keptWithWild(tray, twist){
  const pool = twistKeptPool(twist, tray.filter(e => e.kept).map(e => ({ symbol: e.symbol, mag: e.mag })));
  return pool.map(f => f.symbol === 'fang' ? { ...f, symbol: '__wild__' } : f);
}

// -----------------------------------------------------------------------------
// PART A — the joint evaluator (spec §2.3)
// -----------------------------------------------------------------------------

// evaluateRungSet(hand, rungs, ctx, opts) — ONE pass over N seeded trials.
//   ctx  = { warps (raw), twist, tempo:{bonusSpins, offeredRerolls}, takeRates }
//   opts = { trials?, overkeepP? }
// Returns { reach:[per-rung], pNone, pMulti, pExactly1, ev, trials }, everything
// measured on the SAME trials so pNone + pExactly1 + pMulti === 1 by construction and
// ev is consistent with the met distribution (auto-resolve pays the highest met value).
export function evaluateRungSet(hand, rungs, ctx = {}, opts = {}){
  const trials = opts.trials ?? num('generator2.trials', 240);
  const warps = ctx.warps || [];
  const twist = ctx.twist || null;
  const overkeepP = opts.overkeepP ?? OVERKEEP_P;
  const overkeepOn = rungs.some(r => r.concentrated || r.exact || r.pure);   // the set is "shaped"
  const { cap } = keepConstraints(warps);                                    // keepCap (0 = uncapped)
  const effRolls = effectiveRolls(hand, ctx);
  const live = handHasLiveEnch(hand);                                        // clean-hand fast path if false
  // Fix 1 — pure rung indices get a DEDICATED purity line (below). Empty for non-pure sets ⇒
  // the loop below is byte-identical to the pre-Fix1 union-only path (no extra sim, no extra rng).
  const pureIdx = []; for (let r = 0; r < rungs.length; r++) if (rungs[r].pure) pureIdx.push(r);

  const met = new Array(rungs.length).fill(0);
  let noneMet = 0, multiMet = 0, exactly1 = 0, evSum = 0;

  for (let t = 0; t < trials; t++){
    // THE UNION (max-serve) LINE — the SAME derivation pReach uses (makeRng(7t+3)), so a 1-rung
    // plain clean-hand eval reproduces pReach's rolls; a separate noise stream matches pReachHuman.
    const tray = runTrialTray(hand, rungs, warps, cap, live, effRolls, overkeepOn, overkeepP,
      makeRng((7 * t + 3) >>> 0), overkeepOn ? makeRng((131 * t + 17) >>> 0) : null);
    // score the kept pool against EVERY rung — twist-aware (mirror bends the resolve read;
    // veil/freeReroll return the pool unchanged: the veil is informational, ignored here).
    const withWild = keptWithWild(tray, twist);
    const { stats, counts } = tally(withWild);
    const metThis = rungs.map(r => meetsRung(stats, withWild, r, counts).met);

    // Fix 1 — PURE OVERRIDE: a pure rung is scored on its OWN purity-respecting line (keep ONLY
    // its allowed colour — runTrialTray with the pure rung as the sole keep-rung), NOT the union
    // pool (which the other rungs' off-colour keeps always profane → the false 0.000). Its stream
    // is salted per rung, so the union line above is untouched. Only runs when pureIdx is non-empty.
    for (const r of pureIdx){
      const salt = (PURE_SALT * (r + 1)) >>> 0;
      const ptray = runTrialTray(hand, [rungs[r]], warps, cap, live, effRolls, true, overkeepP,
        makeRng((7 * t + 3 + salt) >>> 0), makeRng((131 * t + 17 + salt) >>> 0));
      const pw = keptWithWild(ptray, twist);
      const pt = tally(pw);
      metThis[r] = meetsRung(pt.stats, pw, rungs[r], pt.counts).met;
    }

    let n = 0, bestVal = 0;
    for (let r = 0; r < rungs.length; r++)
      if (metThis[r]){ met[r]++; n++; bestVal = Math.max(bestVal, rungs[r].value || 0); }
    if (n === 0) noneMet++; else if (n === 1) exactly1++;
    if (n >= 2) multiMet++;
    evSum += bestVal;                                                      // auto-resolve pays the highest met value
  }

  return {
    reach: met.map(c => c / trials),
    pNone: noneMet / trials,
    pMulti: multiMet / trials,
    pExactly1: exactly1 / trials,
    ev: evSum / trials,
    trials,
  };
}

// -----------------------------------------------------------------------------
// PART B — the hand-power reading (spec §1.3)
// -----------------------------------------------------------------------------
// The CANONICAL calibration rung-set: a fixed per-colour ladder (floor c2 + true c3 per
// colour). Deliberately INDEPENDENT of the current segment's rungs (§1.3 — else G3's lag
// EMA becomes noise). The floor tier catches WEAKNESS (banes drop it), the true tier
// gives HEADROOM (depth/graft raises it) — so `power` discriminates both ends and is a
// stable per-segment scalar. Rule-4 placeholder (a G3 knob — the report flags it).
const CANONICAL_RUNGS = [
  ...COLOUR_IDS.map(c => ({ tier: 'floor', colour: c, value: 1, req: { [c]: 2 } })),
  ...COLOUR_IDS.map(c => ({ tier: 'true',  colour: c, value: 3, req: { [c]: 3 } })),
];

// handPower(hand, ctxBase, opts) — the stable hand-strength scalar: the MEAN per-rung
// reach of the canonical set under a HAND-INTRINSIC context. DESIGN DECISION (documented,
// a G3 knob): power strips the TRANSIENT ambient (no boss warps/twist, no banked-spin
// tempo) but KEEPS standing debt (banes are on the hand faces, always simulated) and the
// hand's own offered sigils (via takeRates). Rationale: principle 2 (asymmetric lag) and
// §1.3 both want a reading that does NOT swing on a segment's particulars — a boss warp is
// a segment particular, permanent debt is not. So a debt-riddled hand always reads weaker;
// a boss segment does not spuriously read the hand as weak.
export function handPower(hand, ctxBase = {}, opts = {}){
  const ctxPower = {
    warps: [], twist: null,
    tempo: { bonusSpins: 0, offeredRerolls: 0 },
    takeRates: ctxBase.takeRates,
  };
  const ev = evaluateRungSet(hand, CANONICAL_RUNGS, ctxPower, opts);
  return ev.reach.reduce((a, b) => a + b, 0) / ev.reach.length;
}
