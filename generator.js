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
import { STAT_IDS, COLOUR_IDS } from './registry/symbols.js';

setScoringMode('set');

// ---- Reachability probe: P(a focused max-serve player reaches `rung` in 3 rolls).
// Models the line a real player takes — keep ONLY faces that advance a still-unmet
// part of the rung, reroll everything else — so the emitted rungs are as hard as
// their target says.
export function pReach(hand, rung, curseId = "none", trials = 1200) {
  const ctx = curseContext(curseId);
  const needSyms = Object.keys(rung.req);
  let met = 0;
  for (let t = 0; t < trials; t++) {
    const rng = makeRng(7 * t + 3);
    let kept = []; let pool = hand.dice.map((_, i) => i);
    for (let r = 0; r < 3; r++) {
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
export function pReachHuman(hand, rung, curseId = "none", trials = 1200, overkeepP = OVERKEEP_P) {
  const ctx = curseContext(curseId);
  const needSyms = Object.keys(rung.req);
  let met = 0;
  for (let t = 0; t < trials; t++) {
    const rng = makeRng(7 * t + 3);
    const noise = makeRng(131 * t + 17);
    let kept = []; let pool = hand.dice.map((_, i) => i);
    for (let r = 0; r < 3; r++) {
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
export const TIER_VALUE = { floor: 1, true: 3, bloom: 6 };   // the knot scores flat (+tight), not a per-rung value

// Per-tier candidate recipes mixing a PRIMARY colour C (which the candidate keeps
// strictly dominant, so it defines the rung's colour — "2 Body 1 Mind is a red
// segment") with an optional SECONDARY colour D, smoothed by Charm and gated by
// Mana at True/Bloom. Charm/secondary step cost by ONE at a time. Concentrated
// candidates stay single-colour (the shape reads one deep face).
function floorCands(C, D){ return {
  c2:      { req:{ [C]:2 } },
  c2sec:   { req:{ [C]:2, [D]:1 } },              // 2 primary + 1 secondary (the mixed colour)
  c2charm: { req:{ [C]:2, charm:1 } },
  c3:      { req:{ [C]:3 } },
};}
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
function probeFor(hand, rung){
  return (rung.concentrated || rung.exact || rung.pure)
    ? pReachHuman(hand, rung, 'none', 280)
    : pReach(hand, rung, 'none', 280);
}

// the band-fitter never offers a rung the hand essentially CANNOT reach — below
// this a "rung" is a dead end the player can only fail. A pure safety net: it
// only catches near-0% rungs (legitimately-hard blooms at a few % are untouched).
const MIN_REACH = 0.015;

// Live-tunable difficulty curve — the dev-panel "Balance" section + window.Tune mutate
// this object in place; generateSegment reads it each call, so changes take effect on the
// next segment with no reload. (step = reach lost per survived segment; *Clamp = the floor
// each tier's reach can't decay below.)
export const DECAY = { step: 0.03, floorClamp: 0.18, trueClamp: 0.10, bloomClamp: 0.05, lateGate: 7 };   // lateGate: segIndex from which true/bloom escalate to the harder LATE menu (#5)

// pick the candidate whose reachability is closest to `target` — but only among
// REACHABLE candidates, so a too-steep option (e.g. a colour-quad at ~1%) never
// gets chosen. If every candidate is unreachable (shouldn't happen — the cheap
// charm-smoothed option is always reachable), fall back to the easiest.
function fitTier(hand, tier, colour, cands, target){
  const measured = Object.entries(cands).map(([name, rung]) => ({ name, rung, p: probeFor(hand, rung) }));
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
  const decay = DECAY.step * (opts.segIndex || 0);
  const target = {
    floor: clamp(DECAY.floorClamp, (difficulty.floor ?? 0.55) - decay),
    true:  clamp(DECAY.trueClamp,  (difficulty.true  ?? 0.32) - decay),
    bloom: clamp(DECAY.bloomClamp, (difficulty.bloom ?? 0.16) - decay),
  };
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
  const rungs = [
    fitTier(hand, 'floor', colourByTier.floor, floorCands(colourByTier.floor, sec.floor), target.floor),
    fitTier(hand, 'true',  colourByTier.true,  trueCandSet,  target.true),
    fitTier(hand, 'bloom', colourByTier.bloom, bloomCandSet, target.bloom),
  ];

  // MULTI-COMPLETION RARITY GUARD — keep two-at-once genuinely rare so auto-resolve
  // almost never has to break a tie. If broad-greedy play makes 2+ rungs too often,
  // re-fit True (then Bloom) to a harder target. We re-use the SAME pools (with the
  // MIN_REACH floor in fitTier) so the rung gets harder but stays REACHABLE.
  let guard = 0;
  while (multiCompletionRate(hand, rungs) > 0.12 && guard < 3){
    const shrink = Math.pow(0.70, guard + 1);   // 0.70, 0.49, 0.343 — compounds each pass (no wasted iteration)
    if (guard % 2 === 0)
      rungs[1] = fitTier(hand, 'true',  colourByTier.true,  trueCandSet,  target.true  * shrink);
    else
      rungs[2] = fitTier(hand, 'bloom', colourByTier.bloom, bloomCandSet, target.bloom * shrink);
    guard++;
  }

  if (new Set(rungs.map(r=>r.colour)).size !== 3)
    throw new Error('SpellSpun invariant violated: the three rungs must carry three distinct colours');

  return { rungs, colourByTier, target };
}

// Probability that BROAD-GREEDY play satisfies 2+ of these rungs at once. A
// conservative UPPER bound (keeps every wanted face), so passing the guard means
// real focused play makes two-at-once even rarer.
export function multiCompletionRate(hand, rungs, trials = 450){
  const wanted = new Set();
  rungs.forEach(r => Object.keys(r.req).forEach(s => wanted.add(s)));
  let multi = 0;
  for (let t=0; t<trials; t++){
    const rng = makeRng(9*t + 5);
    let kept = []; let pool = hand.dice.map((_,i)=>i);
    for (let r=0;r<3;r++){
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
