// =============================================================================
// SEGMENT GENERATOR — SpellSpun.
// -----------------------------------------------------------------------------
// Reuses BoneDie's band-fitting probes (pReach / pReachHuman) to emit recipe
// rungs at TARGET reachabilities, but constrained to SpellSpun's shape:
//   - THREE rungs (Floor / True / Bloom),
//   - THREE DISTINCT colours (one Body, one Mind, one Spirit),
//   - tier<->colour randomized per segment (so satisfying one never trivially
//     satisfies another — auto-resolve is almost always unambiguous),
//   - Charm-smoothed costs (step by ONE, never leap a whole colour),
//   - Mana gated to True / Bloom (the rare "pure gate").
// The difficulty knob is the target profile; it decays one notch per survived
// segment. A rarity guard keeps two-rungs-at-once genuinely rare.
// =============================================================================
import { makeRng, tally, curseContext, meetsRung, rollDie, setScoringMode } from './engine.js';
import { STAT_IDS, COLOUR_IDS } from '../content/symbols.js';
import { on, num } from './balance.js';   // Phase B — cost-aware generator gates (flag-off ⇒ legacy DECAY)
import { evaluateRungSet, handPower } from './probe.js';   // §G2 the JOINT probe (kernel-aware) — used ONLY behind on('generator2.jointProbe')
import { twistRungSpec } from './ritual.js';   // §G4 the boss 'rungs' rung-condition accessor (id-blind) — used ONLY behind on('generator2.rungs')

setScoringMode('set');

// ---- Reachability probe: P(a focused max-serve player reaches `rung` in 3 rolls).
// Models the line a real player takes — keep ONLY faces that advance a still-unmet
// part of the rung, reroll everything else — so the emitted rungs are as hard as
// their target says.
export function pReach(hand, rung, curseId = "none", trials = 1200, rolls = 3) {
  const ctx = curseContext(curseId);
  const needSyms = Object.keys(rung.req);
  const whole = Math.floor(rolls), frac = rolls - whole;   // Phase B: fractional tempo (rerolls-as-spins)
  let met = 0;
  for (let t = 0; t < trials; t++) {
    const rng = makeRng(7 * t + 3);
    // one extra roll with probability `frac`, seeded from THIS trial's rng. frac===0
    // (the default rolls=3) short-circuits BEFORE rng() → no draw → byte-identical.
    const nRolls = whole + (frac > 0 && rng() < frac ? 1 : 0);
    let kept = []; let pool = hand.dice.map((_, i) => i);
    for (let r = 0; r < nRolls; r++) {
      const nx = [];
      for (const di of pool) {
        const f = rollDie(hand.dice[di], rng);
        if (advancesRung(f, kept, rung, ctx, needSyms)) kept.push(f);
        else nx.push(di);
      }
      pool = nx; if (!pool.length) break;
    }
    const { stats, counts } = tally(kept, ctx);
    if (meetsRung(stats, kept, rung, counts).met) met++;
  }
  return met / trials;
}

// Does keeping face `f` move us toward an unsatisfied requirement of `rung`?
function advancesRung(f, kept, rung, ctx, needSyms){
  if (!STAT_IDS.includes(f.symbol)) return false;     // fang/blank never serve a recipe directly
  if (!needSyms.includes(f.symbol)) return false;     // off-target: reroll to chase need
  const { counts } = tally(kept, ctx);
  const have = counts[f.symbol] || 0;
  return have < (rung.req[f.symbol] || 0);            // only keep if still short on it
}

// REALISTIC REACH PROBE (the human line) — used for shaped (concentrated/exact)
// rungs, whose difficulty is behavioural: over-keeping a tempting off-target face
// voids them. Models that error with probability OVERKEEP_P so shapes are placed
// honestly (a concentration rung lands where a real player actually reaches it).
const OVERKEEP_P = 0.35;
export function pReachHuman(hand, rung, curseId = "none", trials = 1200, overkeepP = OVERKEEP_P, rolls = 3) {
  const ctx = curseContext(curseId);
  const needSyms = Object.keys(rung.req);
  const whole = Math.floor(rolls), frac = rolls - whole;   // Phase B: fractional tempo
  let met = 0;
  for (let t = 0; t < trials; t++) {
    const rng = makeRng(7 * t + 3);
    const noise = makeRng(131 * t + 17);
    const nRolls = whole + (frac > 0 && rng() < frac ? 1 : 0);
    let kept = []; let pool = hand.dice.map((_, i) => i);
    for (let r = 0; r < nRolls; r++) {
      const nx = [];
      for (const di of pool) {
        const f = rollDie(hand.dice[di], rng);
        if (advancesRung(f, kept, rung, ctx, needSyms)) { kept.push(f); continue; }
        if (STAT_IDS.includes(f.symbol) && noise() < overkeepP) { kept.push(f); continue; }
        nx.push(di);
      }
      pool = nx; if (!pool.length) break;
    }
    const { counts } = tally(kept, ctx);
    if (meetsRung(stats0(), kept, rung, counts).met) met++;
  }
  return met / trials;
}
function stats0(){ return {}; }   // meetsRung ignores its first arg in set mode

// =============================================================================
// SpellSpun tier model
// =============================================================================
// §G4 §3.3 the APEX tier (value 10): a colour-REPEATING 4th rung with a distinct shape. resolveLadder
// value-orders it automatically (10 > bloom 6), metCount/mixed-draw width extend naturally, and an apex
// completion maps to the ROYAL draw grade (reward_ladder TABLE_FOR_TIER.apex → 'bloom'; no new grade).
export const TIER_VALUE = { floor: 1, true: 3, bloom: 6, apex: 10 };   // the knot scores flat (+tight), not a per-rung value

// Per-tier candidate recipes mixing a PRIMARY colour C (which the candidate keeps
// strictly dominant, so it defines the rung's colour — "2 Body 1 Mind is a red
// segment") with an optional SECONDARY colour D, smoothed by Charm and gated by
// Mana at True/Bloom. Charm/secondary step cost by ONE at a time. Concentrated
// candidates stay single-colour (the shape reads one deep face).
function floorCands(C, D){
  const cands = {
    c2:      { req:{ [C]:2 } },
    c2sec:   { req:{ [C]:2, [D]:1 } },              // 2 primary + 1 secondary (the mixed colour)
    c2charm: { req:{ [C]:2, charm:1 } },
    c3:      { req:{ [C]:3 } },
  };
  // §G5 branch (b) — the MERCY floor candidate: a single-face {C:1} rung, far easier than c2 (reach ~90%),
  // so the fitter can EXPRESS the early band's low pSnapTarget (~.06) that the c2-floored menu can't reach
  // (the "content floor governs early game" finding). Gate-first behind on('generator2.floorEasy'): OFF ⇒
  // c1 never enters ⇒ byte-identical. Priced through the probe exactly like any rung (no free reach — the
  // easy floor just RAISES pMulti, which the multi-guard already penalizes, so it self-limits).
  if (on('generator2.floorEasy')) cands.c1 = { req:{ [C]:1 } };
  return cands;
}
function trueCands(C, D){ return {
  c2sec:     { req:{ [C]:2, [D]:1 } },
  c2charm:   { req:{ [C]:2, charm:1 } },
  c3:        { req:{ [C]:3 } },
  c2mana:    { req:{ [C]:2, mana:1 } },
  c3sec:     { req:{ [C]:3, [D]:1 } },
  c2secCharm:{ req:{ [C]:2, [D]:1, charm:1 } },
  c3conc:    { req:{ [C]:3 }, concentrated:true },
};}
function bloomCands(C, D){ return {
  c2sec:     { req:{ [C]:2, [D]:1 } },            // cost 3 — reachable-but-rich mixed floor of the pool
  c2mana:    { req:{ [C]:2, mana:1 } },           // cost 3, mana-gated
  c3sec:     { req:{ [C]:3, [D]:1 } },            // cost 4, mixed
  c3charm:   { req:{ [C]:3, charm:1 } },          // cost 4
  c3mana:    { req:{ [C]:3, mana:1 } },           // cost 4, mana-gated
  c3secMana: { req:{ [C]:3, [D]:1, mana:1 } },    // cost 5, mixed + gated
  c4:        { req:{ [C]:4 } },                   // the deep quad
  c3conc:    { req:{ [C]:3 }, concentrated:true },// the depth-face miracle (self-gates until a Deepen lands)
};}

// LATE candidates (segIndex >= DECAY.lateGate) — harder shapes the fitter reaches for once the run
// runs long / the hand deepens. Consulted ONLY past the gate, so early/mid game is untouched. 'pure'
// voids on any off-colour keep; c4/c5 demand real depth. (#5 late-game escalation.)
function trueLateCands(C, D){ return { ...trueCands(C, D),
  c3pure:    { req:{ [C]:3 }, pure:true },
  c2secMana: { req:{ [C]:2, [D]:1, mana:1 } },
};}
function bloomLateCands(C, D){ return { ...bloomCands(C, D),
  c4sec:  { req:{ [C]:4, [D]:1 } },
  c4pure: { req:{ [C]:4 }, pure:true },
  c5:     { req:{ [C]:5 } },
};}

// The rung's COLOUR is the colour with the most count in its recipe (the primary).
function dominantColour(req){
  let best = null, bestN = -1;
  for (const c of COLOUR_IDS){ const n = req[c] || 0; if (n > bestN){ bestN = n; best = c; } }
  return best;
}

// shaped rungs are measured by the human line; sum rungs by the max-serve line.
//   §G2: with a joint ctx present (on('generator2.jointProbe')), a candidate is priced by a
//   1-rung JOINT evaluation — kernel-aware (warps/twist/banes/take-rates) and, on a clean
//   hand with a plain rung, byte-for-byte the same rolls as pReach (same makeRng(7t+3)
//   derivation + same behavioral line), so the measurement changes ONLY where information
//   does. ctx null (flag-off) ⇒ the untouched legacy path, byte-identical to G1 HEAD.
function probeFor(hand, rung, rolls = 3, ctx = null){
  if (ctx) return evaluateRungSet(hand, [rung], ctx, { trials: num('generator2.trials', 240) }).reach[0];
  return (rung.concentrated || rung.exact || rung.pure)
    ? pReachHuman(hand, rung, 'none', 280, undefined, rolls)
    : pReach(hand, rung, 'none', 280, rolls);
}

// the band-fitter never offers a rung the hand essentially CANNOT reach — below
// this a "rung" is a dead end the player can only fail. A pure safety net: it
// only catches near-0% rungs (legitimately-hard blooms at a few % are untouched).
const MIN_REACH = 0.015;

// Live-tunable difficulty curve — the dev-panel "Balance" section + window.Tune mutate
// this object in place; generateSegment reads it each call, so changes take effect on the
// next segment with no reload. (step = reach lost per survived segment; *Clamp = the floor
// each tier's reach can't decay below.)
//   §G3 STATUS: this is now the LEGACY flag-off target path. When on('generator2.band') the DECAY
//   curve + its clamps are BYPASSED ENTIRELY by the snap-band intent model (§G3, below) — the band
//   HOLDS P(snap) directly (ramp × stage), so no per-segIndex decay is read. DECAY survives only as
//   the band-off fallback (byte-identical to G2 HEAD). The `late`/lateGate menu-escalation gate stays
//   shared (both paths key the harder LATE candidate menus on segIndex — trap 5).
export const DECAY = { step: 0.03, floorClamp: 0.18, trueClamp: 0.10, bloomClamp: 0.05, lateGate: 7 };   // lateGate: segIndex from which true/bloom escalate to the harder LATE menu (#5)

// Phase B — THE (DORMANT) SNAP-BAND CONTROLLER placeholder. §G3 SUPERSEDES this: the real snap-band
// intent (ramp × stage × clamps + asymmetric lag + the power→ceiling SET fit) lives in generateSegment
// behind on('generator2.band'). This early per-tier-ratio placeholder is NOT that system — it stayed
// OFF (costAwareGenerator.snapBandController) and is now a LEGACY relic on the band-OFF path only: it
// targets P(snap) via a crude floorReach = 1 − P(snap) with fixed tier ratios (no lag, no set fit, no
// ramp). Kept (rename nothing) as the flag-off fallback; the band gate is the live successor. PLACEHOLDER
// ratios (Rule 4). (the achievable floor is also bounded by the candidate pool's easiest rung).
export const SNAP_BAND_RATIOS = { floor: 1.0, true: 0.6, bloom: 0.3 };
function snapBandTargets(opts = {}){
  const band = num('snapBand', { targetLo: 0.12, targetHi: 0.20 });
  const pSnap = (band.targetLo + band.targetHi) / 2;
  const floorReach = Math.max(0.05, Math.min(0.95, (1 - pSnap) + (opts.reachBonus || 0)));
  return {
    floor: floorReach * SNAP_BAND_RATIOS.floor,
    true:  floorReach * SNAP_BAND_RATIOS.true,
    bloom: floorReach * SNAP_BAND_RATIOS.bloom,
  };
}

// pick the candidate whose reachability is closest to `target` — but only among
// REACHABLE candidates, so a too-steep option (e.g. a colour-quad at ~1%) never
// gets chosen. If every candidate is unreachable (shouldn't happen — the cheap
// charm-smoothed option is always reachable), fall back to the easiest.
function fitTier(hand, tier, colour, cands, target, rolls = 3, ctx = null){
  const measured = Object.entries(cands).map(([name, rung]) => ({ name, rung, p: probeFor(hand, rung, rolls, ctx) }));
  const reachable = measured.filter(m => m.p >= MIN_REACH);
  const pool = reachable.length ? reachable : measured;
  let best = pool[0];
  for (const m of pool){ if (Math.abs(m.p - target) < Math.abs(best.p - target)) best = m; }
  return {
    tier, colour: dominantColour(best.rung.req), label: tier, value: TIER_VALUE[tier],
    req: best.rung.req,
    ...(best.rung.concentrated ? { concentrated:true } : {}),
    ...(best.rung.pure ? { pure: best.rung.pure } : {}),   // #5 carry the pure shape into the emitted rung so meetsRung enforces it
    _p: +best.p.toFixed(3), _cand: best.name,
  };
}

// =============================================================================
// GENERATOR v2 §G3 — THE INTENT MODEL: band × asymmetric lag × power→ceiling SET fit.
// -----------------------------------------------------------------------------
// Native behind on('generator2.band'). When ON the legacy DECAY/snap-band TARGET path
// (above) is bypassed ENTIRELY: the tension target is the designed BAND (ramp × stage ×
// clamps, §2.1), the CEILING (which values/shapes are offered) lags hand strength via an
// asymmetric EMA (§2.2), and the three rungs are chosen as a SET (the knapsack, §2.4) —
// not three independent per-tier reach fits. Everything here is behind the band gate; flag-
// off, generateSegment keeps the legacy path byte-identical (see the fit dispatch below).
//
// THE ONE SPEC CORRECTION (orchestrator's, overriding §2.2's ambiguous wording): the FITTER
// sizes the CEILING against pricedPower = min(power_now, EMA) — a hand that just got STRONGER
// is briefly offered its OLD richness (the comfort window, ~2 segments at α=0.5), a hand that
// got WEAKER is priced down INSTANTLY (the `min`). The tension side (pSnapTarget) and ALL
// DISPLAY/TELEMETRY use the HONEST power_now evaluation of the actual hand (the joint probe
// rolls the real hand); only the world's CHOICE OF RUNGS (the ceiling) lags.
// =============================================================================

// §2.1 pSnapTarget = clamp(floor..ceil, base(patronIndex) × stage(position)). The BOSS position
// (position === patronLen-1) always lands stage[last]; position 0 lands stage[0]; middle positions
// linearly interpolate the stage vector across [0, patronLen-1], so a patronLen that differs from
// stage.length still ramps monotonically easy→boss (documented interpolation).
export const BAND_DEFAULT = { base0: 0.10, ramp: 0.03, stage: [0.6, 1.0, 1.5], floor: 0.05, ceil: 0.60, fitTol: 0.03 };

export function stageMultiplier(position, patronLen, stage){
  const last = stage.length - 1;
  if (patronLen <= 1) return stage[last];                          // a 1-segment patron IS its own boss
  const pos = Math.max(0, Math.min(patronLen - 1, position | 0));
  const frac = (pos / (patronLen - 1)) * last;                     // pos 0 → 0 (stage[0]); pos patronLen-1 → last (stage[last])
  const lo = Math.floor(frac), hi = Math.ceil(frac);
  return lo === hi ? stage[lo] : stage[lo] + (stage[hi] - stage[lo]) * (frac - lo);
}

export function pSnapTarget(patronIndex, position, patronLen, band = BAND_DEFAULT){
  const base = band.base0 + band.ramp * (patronIndex || 0);
  const mul  = stageMultiplier(position || 0, patronLen || 1, band.stage);
  return Math.max(band.floor, Math.min(band.ceil, base * mul));
}

// §2.4/§2.2 the pricedPower AMBITION gate + richness. A ceiling candidate's DEMAND = its pip cost +
// a shape surcharge (concentrated/pure/mana are the shapes only a supporting hand answers). pricedPower
// buys a monotone ambition BUDGET; a candidate is admitted iff demand ≤ budget (the leanest is ALWAYS
// admitted, so a fittable set exists at pricedPower 0). MORE pricedPower ⇒ a SUPERSET of candidates ⇒
// the max-objective set the search can find never gets poorer — the monotonicity contract.
function rungDemand(rung){
  const req = rung.req || {};
  let pips = 0; for (const k of Object.keys(req)) pips += req[k];
  let sur = 0;
  if (rung.concentrated) sur += 1;      // a depth-face shape (self-gates until a Deepen lands)
  if (rung.pure)         sur += 2;      // pure voids on any off-colour keep (the loyal-build shape)
  if (req.mana)          sur += 0.5;    // the rare pure-gate ingredient
  return pips + sur;
}
// setRichness — the ceiling richness the fit objective rewards (true+bloom only; the floor is the
// survival anchor, never a ceiling). A strong hand is thereby OFFERED the deeper shapes it can support
// at the same tension (principle 1); the pricedPower gate bounds what's reachable, so the offered
// richness LAGS during a graft's comfort window (leaner sets stay offered ~2 segments).
function setRichness(ceilingRungs){
  return ceilingRungs.reduce((a, r) => a + (rungDemand(r) - 2), 0);   // −2: bias so the leanest c2-class shape scores ~0
}
function ambitionBudget(pricedPower){
  const base = num('generator2.ambitionBase', 2), span = num('generator2.ambitionSpan', 6);
  return base + Math.max(0, Math.min(1, pricedPower)) * span;
}

// build an emitted rung from a candidate (mirrors fitTier's shape; _p filled from the joint reach).
function mkRung(tier, colour, cand, reach){
  return {
    tier, colour: dominantColour(cand.req), label: tier, value: TIER_VALUE[tier], req: cand.req,
    ...(cand.concentrated ? { concentrated: true } : {}),
    ...(cand.pure ? { pure: cand.pure } : {}),
    _p: +(+reach || 0).toFixed(3), _cand: cand._name,
  };
}

// admit(cands, pricedPower) — the ambition-gated, richest→leanest candidate list for a CEILING tier.
function admit(cands, pricedPower){
  const entries = Object.entries(cands).map(([name, rung]) => ({ ...rung, _name: name, _demand: rungDemand(rung) }));
  const minDemand = Math.min(...entries.map(e => e._demand));
  const budget = ambitionBudget(pricedPower);
  const kept = entries.filter(e => e._demand <= budget || e._demand === minDemand);
  kept.sort((a, b) => (b._demand - a._demand) || (a._name < b._name ? -1 : a._name > b._name ? 1 : 0));  // richest first, name-stable
  return kept;
}
// the ceiling STAIRCASE: richest→leanest (trueIdx, bloomIdx) pairs, reducing the currently-richer axis
// each step (ties toward bloom). Visits ≤ |T|+|B|-1 pairs (NOT |T|×|B|) — the budget-bounded reuse.
function ceilingStair(Tadm, Badm){
  const pairs = [[0, 0]]; let ti = 0, bi = 0;
  while (ti < Tadm.length - 1 || bi < Badm.length - 1){
    const canT = ti < Tadm.length - 1, canB = bi < Badm.length - 1;
    if (canB && (!canT || Badm[bi]._demand >= Tadm[ti]._demand)) bi++; else ti++;
    pairs.push([ti, bi]);
  }
  return pairs;
}

// fitBandSet — the SET fit (§2.4 knapsack). Returns { rungs, pNone, pMulti, ev, evals, marker }.
// SEARCH: walk the ceiling staircase (true/bloom) richest→leanest, FLOOR-SWEEPING (the survival dial)
// at each ceiling to bring set-pNone into the band; among every within-band set MAXIMIZE the objective
// (measured ev + a richness premium − a multi-completion penalty). Two admission passes:
//   ① AMBITION-GATED (pricedPower): the lag/richness shaping — a strong hand is offered deeper shapes,
//      and the offered richness LAGS during a graft's window (leaner sets stay ~2 segments).
//   ② TENSION FALLBACK (full menu): ONLY if pass ① found no within-band set AND was too EASY — widen
//      to the harder rungs the gate withheld, so the band's run-BOUNDING tension stays reachable
//      (reaching UP for tension rather than clamping short). Pays cost only when ① undershoots.
// Falls back to the closest-pNone set when nothing fits (marker set, never a crash). Deterministic +
// budget-bounded by num('generator2.fitBudget', 24) evaluateRungSet calls across BOTH passes.
function fitBandSet(hand, tiers, target, tol, ctx, trials, pricedPower){
  const budget = num('generator2.fitBudget', 24);
  const richW  = num('generator2.richnessWeight', 0.15);
  const guardMax = num('generatorGuard.multiCompletionMax', 0.12);
  const Fall = Object.entries(tiers.floor.cands).map(([name, rung]) => ({ ...rung, _name: name }));  // floor: FULL menu (survival anchor, never ambition-gated)

  let evals = 0;
  let best = null;     // max-objective set with pNone within tol
  let bestAny = null;  // closest-pNone set (the graceful fallback)
  const objectiveOf = (r, rungs) =>
    r.ev + richW * setRichness([rungs[1], rungs[2]]) - (r.pMulti > guardMax ? 100 * (r.pMulti - guardMax) : 0);
  const evalSet = (fc, tc, bc) => {
    evals++;
    const rungs = [ mkRung('floor', tiers.floor.colour, fc, 0), mkRung('true', tiers.true.colour, tc, 0), mkRung('bloom', tiers.bloom.colour, bc, 0) ];
    const r = evaluateRungSet(hand, rungs, ctx, { trials });
    for (let i = 0; i < rungs.length; i++) rungs[i]._p = +(r.reach[i] || 0).toFixed(3);   // honest per-rung reach for display
    return { rungs, pNone: r.pNone, pMulti: r.pMulti, ev: r.ev, obj: objectiveOf(r, rungs) };
  };
  const consider = (res) => {
    if (Math.abs(res.pNone - target) <= tol){ if (!best || res.obj > best.obj + 1e-9) best = res; }
    if (!bestAny || Math.abs(res.pNone - target) < Math.abs(bestAny.pNone - target)) bestAny = res;
  };

  // run the ceiling staircase over an admitted (Tadm,Badm). Returns true iff it UNDERSHOT (the closest
  // floor at some ceiling fell below target−tol — leaner ceilings only get easier, so we stopped short).
  const runStair = (Tadm, Badm) => {
    let undershot = false;
    for (const [ti, bi] of ceilingStair(Tadm, Badm)){
      if (evals >= budget) break;
      let floorHit = null;                                   // the floor closest to target at THIS ceiling
      for (const f of Fall){
        if (evals >= budget) break;
        const res = evalSet(f, Tadm[ti], Badm[bi]);
        consider(res);
        if (!floorHit || Math.abs(res.pNone - target) < Math.abs(floorHit.pNone - target)) floorHit = res;
      }
      if (floorHit && floorHit.pNone < target - tol){ undershot = true; break; }
    }
    return undershot;
  };

  // ① the ambition-gated ceiling (lag + richness). ② if it found nothing AND undershot, widen to the
  // FULL menu (pricedPower = 1 ⇒ every candidate admitted) so tension is reachable (run-bounding).
  const undershot = runStair(admit(tiers.true.cands, pricedPower), admit(tiers.bloom.cands, pricedPower));
  if (!best && undershot && evals < budget)
    runStair(admit(tiers.true.cands, 1), admit(tiers.bloom.cands, 1));

  const chosen = best || bestAny;
  const marker = best ? 'band' : (chosen && chosen.pNone > target ? 'nofit-hard' : 'nofit-easy');
  return { rungs: chosen.rungs, pNone: chosen.pNone, pMulti: chosen.pMulti, ev: chosen.ev, evals, marker };
}

// =============================================================================
// GENERATOR v2 §G4 — DYNAMIC RUNG-SETS: the composer + the N-axis SET fitter.
// -----------------------------------------------------------------------------
// Native behind on('generator2.rungs'). The composer hands G3's fitter a PLAN — one ANCHOR (the survival
// dial: full menu, floor-swept) + N CEILING axes (ambition-gated) — instead of the hard floor/true/bloom
// triple. That lets a boss condition FORBID a tier (the anchor moves), the intent REST a colour (2 rungs,
// higher tension), or an APEX join (4 rungs, richness). fitBandSetPlan is fitBandSet generalized to N
// ceiling axes; the DEFAULT 3-tier segment still runs through the untouched fitBandSet above (byte-identical
// to G3 HEAD), so the composer only ever RE-fits a non-default plan. Everything here is rng-free.
// =============================================================================

// the ceiling STAIRCASE, generalized to N axes: from richest→leanest, reduce the currently-richest axis
// (highest _demand at its current index) that can still step; ties resolve toward the LATER axis (matching
// fitBandSet's bloom-preference). For N=2 this reproduces the 2-axis ceilingStair sequence exactly; a single-
// candidate axis (the apex) never steps, so a count-4 staircase is no longer than the count-3 one.
function ceilingStairN(axes){
  const idx = axes.map(() => 0);
  const combos = [idx.slice()];
  const canStep = a => idx[a] < axes[a].length - 1;
  while (idx.some((_, a) => canStep(a))){
    let pick = -1, best = -Infinity;
    for (let a = 0; a < axes.length; a++){
      if (!canStep(a)) continue;
      const d = axes[a][idx[a]]._demand;
      if (d >= best){ best = d; pick = a; }   // >= so a later axis wins ties (bloom-preference parity)
    }
    if (pick < 0) break;
    idx[pick]++; combos.push(idx.slice());
  }
  return combos;
}

// fitBandSetPlan — the SET fit over a composed PLAN. plan = { anchor:{tier,colour,cands}, ceiling:[{...}] }.
// Same search shape as fitBandSet: walk the ceiling staircase richest→leanest, ANCHOR-sweeping (full menu)
// at each ceiling; MAXIMIZE the objective among within-band sets; the two admission passes (ambition-gated,
// then the TENSION FALLBACK at pricedPower=1) are identical — BUT the fallback widens within the composer's
// ALLOWED (pruned) cands, so a boss forbid is NEVER re-admitted (trap 4). Returns the fitBandSet shape.
function fitBandSetPlan(hand, plan, target, tol, ctx, trials, pricedPower){
  const budget  = num('generator2.fitBudget', 24);
  const richW   = num('generator2.richnessWeight', 0.15);
  const guardMax = num('generatorGuard.multiCompletionMax', 0.12);
  const Aall = Object.entries(plan.anchor.cands).map(([name, rung]) => ({ ...rung, _name: name }));   // anchor: FULL menu (survival dial)

  let evals = 0, best = null, bestAny = null;
  const objectiveOf = (r, rungs) => r.ev + richW * setRichness(rungs.slice(1)) - (r.pMulti > guardMax ? 100 * (r.pMulti - guardMax) : 0);
  const evalSet = (anchorCand, ceilCands) => {
    evals++;
    const rungs = [ mkRung(plan.anchor.tier, plan.anchor.colour, anchorCand, 0),
      ...plan.ceiling.map((c, i) => mkRung(c.tier, c.colour, ceilCands[i], 0)) ];
    const r = evaluateRungSet(hand, rungs, ctx, { trials });
    for (let i = 0; i < rungs.length; i++) rungs[i]._p = +(r.reach[i] || 0).toFixed(3);
    return { rungs, pNone: r.pNone, pMulti: r.pMulti, ev: r.ev, obj: objectiveOf(r, rungs) };
  };
  const consider = (res) => {
    if (Math.abs(res.pNone - target) <= tol){ if (!best || res.obj > best.obj + 1e-9) best = res; }
    if (!bestAny || Math.abs(res.pNone - target) < Math.abs(bestAny.pNone - target)) bestAny = res;
  };
  const runStair = (ceilAdms) => {
    let undershot = false;
    for (const combo of ceilingStairN(ceilAdms)){
      if (evals >= budget) break;
      let anchorHit = null;
      for (const a of Aall){
        if (evals >= budget) break;
        const ceilCands = combo.map((ix, ax) => ceilAdms[ax][ix]);
        const res = evalSet(a, ceilCands);
        consider(res);
        if (!anchorHit || Math.abs(res.pNone - target) < Math.abs(anchorHit.pNone - target)) anchorHit = res;
      }
      if (anchorHit && anchorHit.pNone < target - tol){ undershot = true; break; }
    }
    return undershot;
  };
  const undershot = runStair(plan.ceiling.map(c => admit(c.cands, pricedPower)));
  if (!best && undershot && evals < budget)
    runStair(plan.ceiling.map(c => admit(c.cands, 1)));   // TENSION FALLBACK — widen within the ALLOWED cands (never re-admit a forbidden tier)

  const chosen = best || bestAny;
  const marker = best ? 'band' : (chosen && chosen.pNone > target ? 'nofit-hard' : 'nofit-easy');
  return { rungs: chosen.rungs, pNone: chosen.pNone, pMulti: chosen.pMulti, ev: chosen.ev, evals, marker };
}

// prefer `alt` over `base` iff it is in-band and base is not, else if it lands closer to the target.
function fitCloser(alt, base, target, tol){
  const aB = Math.abs(alt.pNone - target) <= tol, bB = Math.abs(base.pNone - target) <= tol;
  if (aB !== bB) return aB;
  return Math.abs(alt.pNone - target) < Math.abs(base.pNone - target);
}

// --- the composer's building blocks (all PURE, rng-free) -----------------------------------------------

// per-colour hand strength = Σ pips of that colour's faces (count × depth). The apex reuses the STRONGEST.
function colourStrength(hand){
  const s = {}; for (const c of COLOUR_IDS) s[c] = 0;
  for (const d of hand.dice) for (const f of d.faces)
    if (COLOUR_IDS.includes(f.symbol)) s[f.symbol] += (f.mag || 1);
  return s;
}
function strongestColour(hand){
  const s = colourStrength(hand); let best = COLOUR_IDS[0];
  for (const c of COLOUR_IDS) if (s[c] > s[best]) best = c;   // ties → COLOUR_IDS order (strict >)
  return best;
}
function handHasDeepFace(hand, C){
  for (const d of hand.dice) for (const f of d.faces) if (f.symbol === C && (f.mag || 1) >= 2) return true;
  return false;
}
// §3.3 the apex AXIS — a single, colour-repeating ceiling candidate at value 10, REACH-GUARDED (Fix 3).
// The preferred SHAPE is concentrated (a deep C face) if the hand can show one, else pure (the loyal-build
// shape). Fix 3: price the shape through the joint probe and never ship a DEAD demand — if the preferred
// shape prices below MIN_REACH, try the OTHER shape; if BOTH are dead, DEGRADE to the richest REACHABLE
// bloom-menu candidate on C (the demand STAYS value 10 — the tier decides value — but the shape is one the
// hand can theoretically touch). Priced via evaluateRungSet, which is self-seeded (makeRng inside), so this
// draws NO segment rng — the composer stays deterministic + segment-stream-neutral. Returns { cands, degraded }.
// ONE candidate either way, so the ceiling staircase never grows. A genuinely incapable hand (nothing reachable)
// still gets its preferred demand priced ~0 — never a crash, never filler beyond the intent.
function apexAxis(C, hand, ctx, trials){
  const reachOf = rung => (evaluateRungSet(hand, [rung], ctx, { trials }).reach[0] || 0);
  const conc = { name: 'apexConc', rung: { req: { [C]: 2 }, concentrated: true } };
  const pure = { name: 'apexPure', rung: { req: { [C]: 3 }, pure: true } };
  const [first, second] = handHasDeepFace(hand, C) ? [conc, pure] : [pure, conc];
  if (reachOf(first.rung)  >= MIN_REACH) return { cands: { [first.name]:  first.rung  }, degraded: false };
  if (reachOf(second.rung) >= MIN_REACH) return { cands: { [second.name]: second.rung }, degraded: false };
  // both apex shapes dead — DEGRADE to the richest REACHABLE bloom-menu shape on C (value stays 10 via the tier).
  const D = COLOUR_IDS.find(x => x !== C) || C;
  const menu = Object.entries(bloomCands(C, D)).map(([name, rung]) => ({ name, rung, p: reachOf(rung), demand: rungDemand(rung) }));
  const reachable = menu.filter(m => m.p >= MIN_REACH);
  if (reachable.length){
    reachable.sort((a, b) => (b.demand - a.demand) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));   // richest, name-stable
    return { cands: { ['apexDeg_' + reachable[0].name]: { ...reachable[0].rung } }, degraded: true };
  }
  return { cands: { [first.name]: first.rung }, degraded: false };   // nothing reachable — ship the preferred demand
}

// §3.1 mergeRungSpec — merge source specs by precedence (intent < relic < twist/boss < debug); a LATER
// (higher-precedence) source wins on `count`, and a FORBID redefines structure so it supersedes a lower-
// precedence count (so a boss twist forbid beats an intent count). require/extra concatenate. The `relic`
// source is a RESERVED seam (BALANCE.relics off — nothing emits it yet); the merge just leaves room for it.
export function composeRungSpec(sources){
  const rank = { intent: 0, relic: 1, twist: 2, boss: 2, debug: 3 };
  const ordered = (sources || []).filter(Boolean).slice()
    .sort((a, b) => (rank[a.source] ?? 0) - (rank[b.source] ?? 0));   // stable sort → equal-rank keeps input order
  const merged = { forbid: [], require: [], extra: [], sources: [] };
  for (const s of ordered){
    merged.sources.push(s.source);
    if (s.forbid && s.forbid.length){ merged.forbid = [...new Set([...merged.forbid, ...s.forbid])]; delete merged.count; }
    if (s.count != null) merged.count = s.count;
    if (s.require && s.require.length) merged.require.push(...s.require);
    if (s.extra && s.extra.length) merged.extra.push(...s.extra);
  }
  return merged;
}

const lowestValueIdx = (slots) => { let i0 = 0; for (let i = 1; i < slots.length; i++) if ((TIER_VALUE[slots[i].tier] || 0) < (TIER_VALUE[slots[i0].tier] || 0)) i0 = i; return i0; };

// finalizePlan(slots) — designate the ANCHOR (the lowest-value = survival tier; so forbid:['floor'] moves
// the anchor to True automatically) + the CEILING axes (the rest, order preserved) + the RESTED colour (a
// base colour no NON-apex slot carries). Returns the plan fitBandSetPlan consumes.
function finalizePlan(slots, colourByTier){
  const ai = lowestValueIdx(slots);
  const anchor = slots[ai];
  const ceiling = slots.filter((_, i) => i !== ai);
  const carried = new Set(slots.filter(s => s.tier !== 'apex').map(s => s.colour));
  let rested = null;
  for (const t of ['floor', 'true', 'bloom']){ const c = colourByTier[t]; if (!carried.has(c)){ rested = c; break; } }
  return { anchor, ceiling, rested, apexDegraded: slots.some(s => s._apexDegraded) };   // Fix 3 telemetry — a forced/intent apex bent to a reachable shape
}

// buildTierPlan — the declarative-spec → plan builder (the boss/twist path). forbid REMOVES base tiers
// (clamped up to NUMBERS.rungs.min if it would empty the set — "forbid all three tiers" never crashes);
// count ADDS apex slots up to NUMBERS.rungs.max, or drops the highest-value ceiling down to count. The
// per-tier menus come straight from defaultTiers, so floor/true/bloom are the SAME late-aware menus the
// G3 fit uses. require/extra are structurally accepted (reserved for later sources).
function buildTierPlan(merged, { colourByTier, hand, defaultTiers, ctx, trials }){
  const base = ['floor', 'true', 'bloom'];
  const min = num('rungs.min', 2), max = num('rungs.max', 4);
  const forbid = new Set(merged.forbid || []);
  let tiers = base.filter(t => !forbid.has(t));
  for (const t of base){ if (tiers.length >= min) break; if (!tiers.includes(t)) tiers.push(t); }   // forbid-emptied → re-add sanely
  const slots = tiers.map(t => ({ tier: t, colour: defaultTiers[t].colour, cands: defaultTiers[t].cands }));
  const count = merged.count != null ? Math.max(min, Math.min(max, merged.count)) : slots.length;
  while (slots.length < count && slots.length < max){
    const C = strongestColour(hand);
    const ax = apexAxis(C, hand, ctx, trials);   // Fix 3 — the forced apex respects the MIN_REACH floor
    slots.push({ tier: 'apex', colour: C, cands: ax.cands, _apexDegraded: ax.degraded });
  }
  while (slots.length > count && slots.length > min){
    const ai = lowestValueIdx(slots);
    let dropIdx = -1, dropVal = -Infinity;
    for (let i = 0; i < slots.length; i++){ if (i === ai) continue; const v = TIER_VALUE[slots[i].tier] || 0; if (v > dropVal){ dropVal = v; dropIdx = i; } }
    if (dropIdx < 0) break; slots.splice(dropIdx, 1);
  }
  return finalizePlan(slots, colourByTier);
}

// buildApexPlan — the intent's 4-rung richness plan: floor/true/bloom + an apex on the strongest colour.
// Fix 3 — the intent apex is reach-guarded too (the power gate admits it, but a dead shape still degrades):
// a strong hand with no deep face on its strongest colour would otherwise be offered a 0-reach pure apex.
function buildApexPlan(defaultTiers, colourByTier, hand, ctx, trials){
  const C = strongestColour(hand);
  const ax = apexAxis(C, hand, ctx, trials);
  const slots = [
    { tier: 'floor', colour: defaultTiers.floor.colour, cands: defaultTiers.floor.cands },
    { tier: 'true',  colour: defaultTiers.true.colour,  cands: defaultTiers.true.cands },
    { tier: 'bloom', colour: defaultTiers.bloom.colour, cands: defaultTiers.bloom.cands },
    { tier: 'apex',  colour: C, cands: ax.cands, _apexDegraded: ax.degraded },
  ];
  return finalizePlan(slots, colourByTier);
}

// §Fix4 — TIER-LABEL / DIFFICULTY ORDERING. The set fit chooses the ceiling/anchor SHAPES that hold the
// band, but nothing forces the chosen shapes' evaluated reach to match the tier VALUE order — so a "floor"
// (the survival anchor a player reads as the safe line) can price HARDER than the "true", and the labels
// lie about the difficulty ordering. After the fit, re-pair the NON-APEX tier labels to shapes by DESCENDING
// reach: the EASIEST shape wears the lowest-value label present (floor), the HARDEST wears the highest-value
// label present (bloom). The apex is never relabeled (value 10 — the ceiling, hardest by construction). Only
// tier/label/value move on each rung — req/colour/shape/_p stay put — so union/pNone, the rng stream, and
// colour-distinctness are ALL unchanged; only the LABELS (and thus scoring value) get reassigned. In-place, rng-free.
function relabelByReach(rungs){
  const nonApex = rungs.filter(r => r.tier !== 'apex');
  if (nonApex.length < 2) return rungs;
  const labels = nonApex.map(r => r.tier).sort((a, b) => (TIER_VALUE[a] || 0) - (TIER_VALUE[b] || 0));   // labels present, ascending value
  const byReach = nonApex.slice().sort((a, b) =>
    ((b._p || 0) - (a._p || 0)) || (COLOUR_IDS.indexOf(a.colour) - COLOUR_IDS.indexOf(b.colour)));        // easiest (highest reach) first, colour-stable ties
  byReach.forEach((r, i) => { const t = labels[i]; r.tier = t; r.label = t; r.value = TIER_VALUE[t]; });
  return rungs;
}

// buildRestPlan — the intent's 2-rung tension plan: keep the floor anchor + ONE ceiling; rest a ceiling
// colour that is NOT the player's live chain (source='intent'). Prefers to rest TRUE (keeping the richer
// Bloom ceiling); if True's colour IS the live chain, rests Bloom instead. Returns null if neither can rest.
function buildRestPlan(defaultTiers, colourByTier, liveChain){
  let restTier = null;
  if (colourByTier.true  !== liveChain) restTier = 'true';
  else if (colourByTier.bloom !== liveChain) restTier = 'bloom';
  if (!restTier) return null;
  const keep = restTier === 'true' ? 'bloom' : 'true';
  const slots = [
    { tier: 'floor', colour: defaultTiers.floor.colour, cands: defaultTiers.floor.cands },
    { tier: keep,    colour: defaultTiers[keep].colour, cands: defaultTiers[keep].cands },
  ];
  return finalizePlan(slots, colourByTier);
}

// anti-repeat memory for the colour permutation (variety across segments)
let recentPerms = [];
export function resetShapeMemory(){ recentPerms = []; }
function shuffleColours(rng){
  const a = COLOUR_IDS.slice();
  for (let i=a.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
const samePerm = (a,b) => a.length===b.length && a.every((x,i)=>x===b[i]);
const clamp = (min, v) => Math.max(min, v);

// MAIN — generate a segment's three rungs.
//   difficulty: { floor, true, bloom } base target reachabilities (0..1).
//   opts: { rng, seedTag, segIndex } — segIndex applies the "one notch harder" decay.
export function generateSegment(hand, difficulty = {}, opts = {}) {
  const rng = opts.rng || makeRng(((opts.seedTag||0) * 2654435761) >>> 0);
  // Phase B — cost-aware tempo pricing: price the ACTUAL rolls the player has this
  // segment (3 + banked spins + rerolls-as-fractional-spins) so a tempo advantage is
  // priced out of the rungs. Flag-off ⇒ rolls=3 ⇒ the probe is byte-identical.
  const tempo = opts.tempo || {};
  const baseSpins = num('tempo.baseSpins', 3);   // ⚖3.12 spin-cap (default 3 ⇒ byte-identical); only read on the legacy band-OFF fit
  const rolls = on('costAwareGenerator.readsTempoPower')
    ? baseSpins + (tempo.bonusSpins || 0) + num('tempo.rerollToSpin', 0.5) * (tempo.rerolls || 0)
    : baseSpins;
  // §G2 — the JOINT probe. When on, candidate pricing routes through the kernel-aware
  // evaluator (which suffers the ACTIVE warps/twist/banes + prices offered boons as
  // take-rates). ctx null ⇒ the legacy pReach path, byte-identical to G1 HEAD. The FIT
  // still targets the same curve (DECAY / snap-band) — G2 changes the MEASUREMENT, not
  // the intent (the band is G3). The session passes what WILL be active this segment.
  const joint = on('generator2') && on('generator2.jointProbe');
  const ctx = joint ? {
    warps: opts.warps || [],
    twist: opts.twist || null,
    tempo: { bonusSpins: tempo.bonusSpins || 0, offeredRerolls: tempo.offeredRerolls || 0 },
    takeRates: num('generator2.takeRates', { sigil: 0.6, expose: 0.4, release: 0.3, echo: 0.5 }),
  } : null;
  const trials = num('generator2.trials', 240);
  // Targets: the snap-band controller targets P(snap) directly; else the legacy DECAY curve.
  let target;
  if (on('costAwareGenerator.snapBandController')){
    target = snapBandTargets(opts);
  } else {
    const decay = DECAY.step * (opts.segIndex || 0);
    target = {
      floor: clamp(DECAY.floorClamp, (difficulty.floor ?? 0.55) - decay),
      true:  clamp(DECAY.trueClamp,  (difficulty.true  ?? 0.32) - decay),
      bloom: clamp(DECAY.bloomClamp, (difficulty.bloom ?? 0.16) - decay),
    };
  }
  // assign distinct colours to tiers, avoiding the exact previous permutation
  let perm = shuffleColours(rng);
  for (let t=0; t<4 && recentPerms.length && samePerm(perm, recentPerms[recentPerms.length-1]); t++) perm = shuffleColours(rng);
  recentPerms.push(perm); if (recentPerms.length > 3) recentPerms.shift();
  const colourByTier = { floor: perm[0], true: perm[1], bloom: perm[2] };
  // each tier may mix in a SECONDARY colour (a random other colour) — the primary
  // stays dominant, so the rung's identity colour is unchanged.
  const secOf = C => { const o = COLOUR_IDS.filter(x => x !== C); return o[Math.floor(rng()*o.length)]; };
  const sec = { floor: secOf(colourByTier.floor), true: secOf(colourByTier.true), bloom: secOf(colourByTier.bloom) };

  // Past DECAY.lateGate, true+bloom draw from the harder LATE menu so the decayed (clamped) target pulls
  // toward genuinely tougher reachable rungs (escalation from ~seg 7; #5). Floor stays on the normal menu
  // so the run remains survivable.
  const late = (opts.segIndex || 0) >= (DECAY.lateGate ?? Infinity);
  const trueCandSet  = late ? trueLateCands(colourByTier.true,  sec.true)  : trueCands(colourByTier.true,  sec.true);
  const bloomCandSet = late ? bloomLateCands(colourByTier.bloom, sec.bloom) : bloomCands(colourByTier.bloom, sec.bloom);

  // §G3 — THE BAND PATH. When on('generator2.band') the DECAY target + fitTier per-tier fits + the
  // guard loop above are ALL bypassed for the intent model: a scalar pSnapTarget (band, §2.1), the
  // asymmetric-lag EMA (§2.2), and the power→ceiling SET fit (§2.4). Flag-off ⇒ the legacy branch
  // below runs UNCHANGED (byte-identical to G2 HEAD). Band requires the joint probe (needs ctx).
  const bandOn = joint && on('generator2.band');
  if (bandOn){
    // §G5 — the band params, with per-LEAF §C0 override hooks. The whole-object key 'generator2.band'
    // COLLIDES with the boolean gate on('generator2.band') (a shared dot-path: BALANCE holds the gate,
    // NUMBERS the object), so overriding the object would silently turn the band OFF. The tuning sweep
    // therefore tunes these dedicated numeric leaves instead; each is null-guarded, so an unset leaf
    // leaves the default band untouched (byte-identical). base0/ramp/fitTol + the easy/boss stage
    // multipliers + the floor/ceil clamps are the campaign's levers. (bench-derived 2026-07-10.)
    const bandBase = num('generator2.band', BAND_DEFAULT);
    const band = { ...bandBase, stage: [...bandBase.stage] };
    const ovNum = (k, cur) => { const v = num(k); return v == null ? cur : v; };
    band.base0  = ovNum('generator2.bandBase0', band.base0);
    band.ramp   = ovNum('generator2.bandRamp',  band.ramp);
    band.fitTol = ovNum('generator2.bandFitTol', band.fitTol);
    band.floor  = ovNum('generator2.bandFloor', band.floor);
    band.ceil   = ovNum('generator2.bandCeil',  band.ceil);
    band.stage[0] = ovNum('generator2.bandEasy', band.stage[0]);
    band.stage[band.stage.length - 1] = ovNum('generator2.bandBoss', band.stage[band.stage.length - 1]);
    const patron = opts.patron || { index: 0, position: 0, len: 3 };   // session supplies patron seg/len (fallback = seg 1 of a 3-patron)
    const targetSnap = pSnapTarget(patron.index, patron.position, patron.len, band);
    // §2.2 asymmetric lag — the EMA is session-persisted (opts.priorEma = G.powerEma); we fold power_now
    // in here and return the update. pricedPower = min(power_now, ema): a JUMP up is smoothed (ema < now →
    // window), a DROP passes straight through (min ⇒ ema never keeps a debt-riddled hand priced strong).
    const alpha = num('generator2.lagAlpha', 0.5);
    const powerNow = handPower(hand, ctx, { trials });        // the HONEST power (display/telemetry never lags)
    const priorEma = (opts.priorEma != null) ? opts.priorEma : null;
    const ema = (priorEma == null) ? powerNow : alpha * powerNow + (1 - alpha) * priorEma;
    const pricedPower = Math.min(powerNow, ema);
    // The default 3-tier menus (floor anchor + true/bloom ceiling) — the G3 set the §G4 composer refines.
    const defaultTiers = {
      floor: { colour: colourByTier.floor, cands: floorCands(colourByTier.floor, sec.floor) },
      true:  { colour: colourByTier.true,  cands: trueCandSet },
      bloom: { colour: colourByTier.bloom, cands: bloomCandSet },
    };
    // §G4 THE COMPOSER (behind on('generator2.rungs')). Flag-OFF ⇒ the EXACT G3 fitBandSet below runs
    // (byte-identical to HEAD 18ba4db). Flag-ON ⇒ a boss 'rungs' twist forces its plan; ELSE the G3 fit
    // runs and, ONLY at late patrons, the intent REFINES it once: a nofit-easy fit RESTS a colour (2 rungs
    // → fewer survival paths → higher pNone), a comfortable strong band-fit adds an APEX (4 rungs → richness
    // at held tension, §3.2). Every branch here is rng-FREE, and early/patron-0 play never refines, so the
    // rng stream + the default rungs are byte-identical to G3 whether the flag is on or off.
    let fit, rested = null, refitEvals = 0, apexDegraded = false;
    const rungsOn = on('generator2.rungs');
    const twistSpec = rungsOn ? twistRungSpec(opts.twist) : null;   // boss 'rungs' rung-condition (or null)
    if (twistSpec){
      const merged = composeRungSpec([{ count: 3, source: 'intent' }, twistSpec]);   // twist > intent (§3.1)
      const plan = buildTierPlan(merged, { colourByTier, hand, defaultTiers, ctx, trials });
      fit = fitBandSetPlan(hand, plan, targetSnap, band.fitTol, ctx, trials, pricedPower);
      rested = plan.rested; apexDegraded = plan.apexDegraded;
    } else {
      fit = fitBandSet(hand, defaultTiers, targetSnap, band.fitTol, ctx, trials, pricedPower);   // ← G3 verbatim
      if (rungsOn && (patron.index || 0) >= num('generator2.latePatron', 2)){
        if (fit.marker === 'nofit-easy'){
          const plan = buildRestPlan(defaultTiers, colourByTier, opts.liveChainColour);   // TENSION: rest a colour
          if (plan){
            const alt = fitBandSetPlan(hand, plan, targetSnap, band.fitTol, ctx, trials, pricedPower);
            refitEvals += alt.evals;
            if (fitCloser(alt, fit, targetSnap, band.fitTol)){ fit = alt; rested = plan.rested; }
          }
        } else if (fit.marker === 'band' && on('generator2.apexRungs')
                   && pricedPower >= num('generator2.apexPowerGate', 0.55)){
          const plan = buildApexPlan(defaultTiers, colourByTier, hand, ctx, trials);   // RICHNESS: the earned 4th slot (reach-guarded, Fix 3)
          const alt = fitBandSetPlan(hand, plan, targetSnap, band.fitTol, ctx, trials, pricedPower);
          refitEvals += alt.evals;
          if (alt.marker === 'band'){ fit = alt; apexDegraded = plan.apexDegraded; }   // keep the apex ONLY if the hardened set still holds the band (§3.2)
        }
      }
    }
    const rungs = fit.rungs;
    if (rungsOn) relabelByReach(rungs);   // Fix 4 — tier labels follow evaluated reach (floor easiest … bloom hardest); apex untouched. rng-free, stream-neutral.
    const nonApex = rungs.filter(r => r.tier !== 'apex');   // §G4 the apex REUSES a colour; the non-apex rungs stay distinct
    if (new Set(nonApex.map(r => r.colour)).size !== nonApex.length)
      throw new Error('SpellSpun invariant violated: the non-apex rungs must carry distinct colours');
    const eps = num('generator2.lagEps', 0.005);
    const generator = {
      power: +powerNow.toFixed(4),                            // HONEST (§2.2 correction — display never lags)
      pSnapPredicted: +fit.pNone.toFixed(4),                  // realized pNone of the fitted set (kernel-honest, G2)
      pSnapTarget: +targetSnap.toFixed(4),
      pricedPower: +pricedPower.toFixed(4),
      window: powerNow > pricedPower + eps,                   // "the world hasn't caught up" (a graft's comfort window)
      powerEma: ema,                                          // session persists this into G.powerEma
      fit: fit.marker,                                        // 'band' | 'nofit-hard' | 'nofit-easy' (never crashes)
      evals: fit.evals + refitEvals,                          // measured evaluateRungSet calls this segment (perf telemetry)
      // §G4 telemetry — present ONLY when the composer altered the default set, so a flag-OFF run (and any
      // unrefined flag-ON segment) leaves the generator object byte-identical to G3.
      ...(rungsOn ? { rungCount: rungs.length } : {}),
      ...(rested ? { rested } : {}),
      ...(apexDegraded ? { apexDegraded: true } : {}),   // Fix 3 — a forced/intent apex bent to a reachable shape (the demand stays value 10)
    };
    return { rungs, colourByTier, target: { pSnap: targetSnap }, generator };
  }

  const rungs = [
    fitTier(hand, 'floor', colourByTier.floor, floorCands(colourByTier.floor, sec.floor), target.floor, rolls, ctx),
    fitTier(hand, 'true',  colourByTier.true,  trueCandSet,  target.true,  rolls, ctx),
    fitTier(hand, 'bloom', colourByTier.bloom, bloomCandSet, target.bloom, rolls, ctx),
  ];

  // MULTI-COMPLETION RARITY GUARD — keep two-at-once genuinely rare so auto-resolve
  // almost never has to break a tie. If greedy play makes 2+ rungs too often, re-fit
  // True (then Bloom) to a harder target. We re-use the SAME pools (with the MIN_REACH
  // floor in fitTier) so the rung gets harder but stays REACHABLE.
  //   §G2: with the joint probe on, the guard reads pMulti from ONE kernel-aware set
  //   evaluation (the separate 450-trial multiCompletionRate sim retires on this path);
  //   telemetry (power + the pNone snap read) falls out of the SAME final evaluation.
  const guardMax = num('generatorGuard.multiCompletionMax', 0.12);
  let generator = null;
  if (joint){
    let ev = evaluateRungSet(hand, rungs, ctx, { trials });
    let guard = 0;
    while (ev.pMulti > guardMax && guard < 3){
      const shrink = Math.pow(0.70, guard + 1);
      if (guard % 2 === 0) rungs[1] = fitTier(hand, 'true',  colourByTier.true,  trueCandSet,  target.true  * shrink, rolls, ctx);
      else                 rungs[2] = fitTier(hand, 'bloom', colourByTier.bloom, bloomCandSet, target.bloom * shrink, rolls, ctx);
      ev = evaluateRungSet(hand, rungs, ctx, { trials });
      guard++;
    }
    // §G2 telemetry (spec §4) — the stable hand-power scalar (lag/ceiling input, §1.3) and
    // the predicted P(snap) (pNone of the priced set): additive, surfaced into Run Records.
    generator = { power: +handPower(hand, ctx, { trials }).toFixed(4), pSnapPredicted: +ev.pNone.toFixed(4) };
  } else {
    let guard = 0;
    while (multiCompletionRate(hand, rungs, 450, rolls) > 0.12 && guard < 3){   // legacy literal — untouched for byte-identity
      const shrink = Math.pow(0.70, guard + 1);   // 0.70, 0.49, 0.343 — compounds each pass (no wasted iteration)
      if (guard % 2 === 0)
        rungs[1] = fitTier(hand, 'true',  colourByTier.true,  trueCandSet,  target.true  * shrink, rolls);
      else
        rungs[2] = fitTier(hand, 'bloom', colourByTier.bloom, bloomCandSet, target.bloom * shrink, rolls);
      guard++;
    }
  }

  if (new Set(rungs.map(r=>r.colour)).size !== 3)
    throw new Error('SpellSpun invariant violated: the three rungs must carry three distinct colours');

  return { rungs, colourByTier, target, ...(generator ? { generator } : {}) };
}

// Probability that BROAD-GREEDY play satisfies 2+ of these rungs at once. A
// conservative UPPER bound (keeps every wanted face), so passing the guard means
// real focused play makes two-at-once even rarer.
export function multiCompletionRate(hand, rungs, trials = 450, rolls = 3){
  const wanted = new Set();
  rungs.forEach(r => Object.keys(r.req).forEach(s => wanted.add(s)));
  const whole = Math.floor(rolls), frac = rolls - whole;   // Phase B: tempo-aware guard
  let multi = 0;
  for (let t=0; t<trials; t++){
    const rng = makeRng(9*t + 5);
    const nRolls = whole + (frac > 0 && rng() < frac ? 1 : 0);
    let kept = []; let pool = hand.dice.map((_,i)=>i);
    for (let r=0;r<nRolls;r++){
      const nx=[];
      for (const di of pool){
        const f = rollDie(hand.dice[di], rng);
        if (wanted.has(f.symbol)) kept.push(f); else nx.push(di);
      }
      pool = nx; if (!pool.length) break;
    }
    const { stats, counts } = tally(kept);
    let met = 0; rungs.forEach(r => { if (meetsRung(stats, kept, r, counts).met) met++; });
    if (met >= 2) multi++;
  }
  return multi / trials;
}

// THE KNOT — the free final cast on snap: three rungs, one per colour, each tuned
// to ~50% reach. The play loop / tallyScore handle the tight-knot bonus by colour.
export function generateKnot(hand){
  return COLOUR_IDS.map(C => {
    // a secondary colour for the mixed candidates (gives the fitter intermediate
    // difficulties so each colour can land near 50%, not just the coarse 2/3 steps)
    const D = COLOUR_IDS.find(x => x !== C);
    const cands = {
      c2:      { req:{ [C]:2 } },             // easiest
      c2charm: { req:{ [C]:2, charm:1 } },    // +1 cheap ingredient
      c2sec:   { req:{ [C]:2, [D]:1 } },      // +1 off-colour
      c3:      { req:{ [C]:3 } },             // deep single colour
      c3charm: { req:{ [C]:3, charm:1 } },    // harder — for over-abundant colours
      c3sec:   { req:{ [C]:3, [D]:1 } },      // harder still
    };
    let best=null, bestErr=Infinity;
    for (const [name, rung] of Object.entries(cands)){
      const p = pReach(hand, rung, 'none', 140);   // fewer trials — the knot fires synchronously at SNAP; keep it sub-frame
      const e = Math.abs(p - 0.50);
      if (e < bestErr){ bestErr=e; best={name,rung,p}; }
    }
    return { tier:'knot', colour:C, label:'knot', req: best.rung.req, _p:+best.p.toFixed(3), _cand: best.name };
  });
}
