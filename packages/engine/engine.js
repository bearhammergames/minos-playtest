// =============================================================================
// ENGINE — pure recipe rules for SpellSpun. No DOM. RNG injected. Reads ONLY
// symbol flags. Imported by BOTH play.html (browser) and the headless harness.
// -----------------------------------------------------------------------------
// This is the recipe core kept from BoneDie: set-counting satisfaction
// (tally / meetsRung) with magnitude (pips), the __wild__ wild-fill, and the
// pure / exact / concentrated rung SHAPES. The BoneDie economy (Fates-drain,
// tithe, mirror, relics, traps, curse scaling) is gone — SpellSpun's curses act
// at the play-loop level, not inside the tally.
// =============================================================================
import { STAT_IDS, sym } from '../content/symbols.js';

// ---- Seedable RNG (mulberry32). Injected everywhere so runs are reproducible.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Hand / face helpers -------------------------------------------------------
export function makeFace(symbol, mag = 1, state = 'live') { return { symbol, mag, state }; }

export function rollDie(die, rng) {
  const i = Math.floor(rng() * die.faces.length);
  const f = die.faces[i];
  return f.state === 'blank'
    ? { symbol:'blank', mag:0, fi:i }
    : { symbol:f.symbol, mag:f.mag, fi:i, ...(f.wounded?{wounded:true}:{}), ...(f.name?{name:f.name}:{}) };
}

export function rollHand(hand, rng, lockedIdx = new Set()) {
  return hand.dice.map((die, i) => lockedIdx.has(i) ? null : rollDie(die, rng));
}

// ---- Curse context (stub) ------------------------------------------------------
// Kept so the band probes (pReach) can call it uniformly. SpellSpun's tally never
// scales or blanks, so this always returns the neutral context.
export function curseContext() { return { scale:{}, blankFactor:0 }; }

// ---- Tally ---------------------------------------------------------------------
//   stats  : summed magnitude per symbol (kept for callers that read .stats)
//   counts : PIPS showing per recipe symbol (the set-collection reading) — a 2-pip
//            Body face counts as 2 Body toward a recipe. This is the recipe currency.
//   magBy  : total magnitude per symbol (a quality/tiebreak signal)
export function tally(faces, curseCtx = { scale:{}, blankFactor:0 }) {
  const stats = {}, counts = {}, magBy = {};
  STAT_IDS.forEach(id => { stats[id] = 0; counts[id] = 0; magBy[id] = 0; });
  let blankPenalty = 0;
  for (const f of faces) {
    if (!f) continue;
    const s = sym(f.symbol);
    if (f.symbol === 'blank') { blankPenalty += (curseCtx.blankFactor || 0); continue; }
    if (s.satisfiesRecipe) {
      const factor = curseCtx.scale[f.symbol] ?? 1;
      stats[f.symbol] += f.mag * factor;
      magBy[f.symbol] += f.mag;
      counts[f.symbol] += (f.mag || 1) * factor;
    }
  }
  if (blankPenalty) STAT_IDS.forEach(id => { stats[id] = Math.max(0, stats[id] - blankPenalty); });
  STAT_IDS.forEach(id => { counts[id] = Math.floor(counts[id]); });
  return { stats, counts, magBy };
}

// ---- Rung satisfaction ---------------------------------------------------------
// SCORING_MODE: 'set' counts FACES/PIPS of a symbol (the collection hunt). Kept
// switchable for parity with the band probes.
export let SCORING_MODE = 'set';
export function setScoringMode(m) { SCORING_MODE = m; }

export function meetsRung(stats, faces, rung, counts = null) {
  let supply;
  if (SCORING_MODE === 'set') supply = counts || tallyCounts(faces);
  else supply = stats;
  const need = { ...rung.req };
  for (const id of Object.keys(need)) need[id] -= (supply[id] || 0);
  let wilds = faces.filter(f => f && f.symbol === '__wild__').length; // a wild = one face
  const remaining = Object.entries(need).filter(([,v]) => v > 0).sort((a,b)=>b[1]-a[1]);
  for (const [id] of remaining) {
    while (need[id] > 0 && wilds > 0) { need[id]--; wilds--; }
  }
  let gap = Object.values(need).reduce((a,v)=> a + Math.max(0,v), 0);
  let met = gap <= 0;

  // --- RUNG SHAPES. Shapes vary the GOAL, never the symbols. ---
  // PURITY: only the demanded symbols may be kept (wilds/blanks excepted).
  if (met && rung.pure) {
    const allowed = rung.pure === true ? Object.keys(rung.req) : [rung.pure];
    const profane = faces.filter(f => f && f.symbol !== 'blank' && f.symbol !== '__wild__'
                                 && STAT_IDS.includes(f.symbol) && !allowed.includes(f.symbol)).length;
    if (profane > 0) { met = false; gap = Math.max(gap, profane); }
  }
  // CONCENTRATION (single-symbol req {s:m}): met only if ONE kept face of s has mag>=m.
  // Pip-sums don't satisfy it; only a face deepened through use can answer. Self-gates
  // in the generator: shallow hands probe ~0, so band-fit won't offer it until depth exists.
  if (rung.concentrated) {
    const [cs, cm] = Object.entries(rung.req)[0];
    const best = faces.reduce((b,f)=> (f && f.symbol===cs && (f.mag||1)>b) ? (f.mag||1) : b, 0);
    if (best < cm) { met = false; gap = Math.max(gap, cm - best); }
  }
  // PRECISION (exact): exactly the asked counts, no more — any kept stat pip beyond
  // the rung's exact demand voids it (wilds are special & free).
  if (met && rung.exact) {
    const raw = counts || tallyCounts(faces);
    let excess = 0;
    for (const id of STAT_IDS) {
      const want = rung.req[id] || 0;
      excess += Math.max(0, (raw[id] || 0) - want);
    }
    if (excess > 0) { met = false; gap = Math.max(gap, excess); }
  }

  return { met, gap, shortBy: Object.fromEntries(Object.entries(need).filter(([,v])=>v>0)) };
}

// Excess kept faces above a rung's demand (counting demanded-symbol overflow + undemanded).
export function excessOverRung(faces, rung) {
  const raw = tallyCounts(faces);
  const bySymbol = {}; let total = 0;
  for (const id of STAT_IDS) {
    const have = raw[id] || 0, want = (rung.req[id] || 0);
    const ex = Math.max(0, have - want);
    if (ex > 0) { bySymbol[id] = ex; total += ex; }
  }
  return { total, bySymbol };
}

// lightweight face-count used by meetsRung when full counts weren't passed
function tallyCounts(faces) {
  const c = {}; STAT_IDS.forEach(id => c[id] = 0);
  for (const f of faces) { if (f && f.symbol !== 'blank' && f.symbol !== '__wild__' && c[f.symbol] !== undefined) c[f.symbol] += (f.mag || 1); }
  return c;
}

// ---- Resolve a ladder (highest-VALUE met rung wins) ----------------------------
// SpellSpun's rungs carry explicit { tier, colour, value }. We pick the satisfied
// rung of greatest value (Floor 1 < True 3 < Bloom 6) — the doc's auto-resolve.
// The fang->wild promotion and bloom/corruption bookkeeping live in spellspun.js,
// which calls this on the promoted face set.
export function resolveLadder(faces, rungs) {
  const { stats, counts } = tally(faces);
  let hit = -1, bestVal = -1; const perRung = [];
  rungs.forEach((rung, i) => {
    const m = meetsRung(stats, faces, rung, counts);
    perRung.push({ index:i, tier:rung.tier, colour:rung.colour, value:rung.value||0, ...m });
    if (m.met && (rung.value || 0) > bestVal) { bestVal = rung.value || 0; hit = i; }
  });
  const won = hit >= 0 ? rungs[hit] : null;
  return { hit, tier: won?won.tier:null, colour: won?won.colour:null, value: won?(won.value||0):0, perRung };
}
