// =============================================================================
// ARCHETYPES — the seven named builds (§11 of the Modifier Stack) as SEED-GENERAL
// scripted policies. This is the "archetype playbook" content the bench was missing.
// -----------------------------------------------------------------------------
// The inaugural playbook (reports/) was a per-SEED script: a fixed segments[] list
// bound to one seed's rungs, immutable pre-spin — it could not pivot when the tray
// turned, and it did not generalize across seeds. An ARCHETYPE is the opposite: a
// build IDENTITY expressed as a policy — pure, deterministic FUNCTIONS OF THE LIVE
// PROTOCOL STATE. It reads the board every spin (so it pivots), and the SAME policy
// plays any seed (so the bench can run it over hundreds). No engine import, no rng,
// no Date.now — reproducible: same archetype + seed ⇒ same run, byte for byte.
//
// Each archetype is a bag of KNOBS the shared decision functions below read:
//   witnesses   — the loadout set at new_run (the passive worth scorers it leans on)
//   targetMode  — how it picks which rung to chase   ('reach'|'tier'|'chain'|'rotate'|'multi'|'tight')
//   tier        — the tier targetMode:'tier' prefers  ('floor'|'true'|'bloom')
//   stopMode    — when it resolves                    ('early'|'target'|'any'|'push'|'multi')
//   fangPolicy  — how it treats the wild/debt fang    ('refuse'|'lastResort'|'early')
//   perkPref    — ordered id preference when drafting  (legacy + ladder ids)
//   cardBias    — ladder-card tiebreak {rarityWeight, blemishedBonus, cleanBonus}
//   stitch      — the stitch-phase choice             ('stitch' default; 'snap' possible)
//
// The roster maps 1:1 onto the witness registry (which was authored WITH these builds
// in mind) and onto the acceptance gate the whole modifier stack exists to answer:
// "≥4/7 archetypes viable, none >1.5× median" (Modifier Stack §11). This tool is what
// eventually measures that gate — but the numbers stay Rule-4 placeholders until the
// feature-complete re-bench (CLAUDE.md §0); the bench EXERCISES the stack, it does not
// (yet) seal balance.
// =============================================================================

// A ladder card's serialized form omits its axis; infer it from the id (the closed
// LADDER_BOONS set in reward_ladder.js). Used only for readability of cardBias intent.
export const AXIS_OF_ID = Object.freeze({
  glimmer: 'worth', bright_glimmer: 'worth', radiant_glimmer: 'worth', steady: 'worth',
  reweave: 'tempo', deepen: 'reach',
});
const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, mythic: 3 };
const KEEP_BUDGET = 2;   // pips of a rung a focused spin can plausibly bank (salvage heuristic)

// -----------------------------------------------------------------------------
// PURE DECISION HELPERS over protocol state
// -----------------------------------------------------------------------------

// remaining pip need toward a rung given the KEPT tray faces. Kept fangs are wild and
// fill the largest remaining holes (mirrors how the engine scores a kept fang).
export function needFor(rung, tray){
  const need = { ...(rung.req || {}) };
  let fangs = 0;
  for (const t of (tray || [])){
    if (!t.kept) continue;
    if (t.symbol === 'fang'){ fangs++; continue; }
    if ((need[t.symbol] || 0) > 0) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag || 1));
  }
  while (fangs > 0){
    const holes = Object.keys(need).filter(s => need[s] > 0).sort((a, b) => need[b] - need[a] || (a < b ? -1 : 1));
    if (!holes.length) break;
    need[holes[0]]--; fangs--;
  }
  return need;
}
export function totalNeed(need){ return Object.values(need).reduce((a, v) => a + Math.max(0, v), 0); }

// chooseTarget — the rung the archetype chases THIS spin. Recomputed every spin, so it
// PIVOTS: a rung the tray has floated close to (low remaining need) wins the tiebreak,
// which is exactly the Bloom-pivot the inaugural report's fixed directive couldn't make.
// `greedy` builds order by rung VALUE first (chase the fat rung); the rest by CLOSENESS.
// A "salvage" clause keeps the build ALIVE (switch off an unreachable identity pick to a
// reachable rung) without erasing identity while the identity is still reachable.
export function chooseTarget(state, knobs){
  const rungs = state.rungs || [];
  if (!rungs.length) return null;
  const tray = state.tray || [];
  const chain = state.thread && state.thread.chain;
  const liveBlooms = (state.thread && state.thread.liveBloomColours) || [];
  const spins = Math.max(state.rollsLeft || 1, 1);
  const greedy = knobs.targetMode === 'multi' || knobs.tier === 'bloom' || knobs.greed;

  const scored = rungs.map((r, i) => {
    let pref = 0;
    if (knobs.targetMode === 'tier')        pref = r.tier === knobs.tier ? 0 : 1;
    else if (knobs.targetMode === 'chain')  pref = (chain && r.colour === chain) ? 0 : 1;
    else if (knobs.targetMode === 'rotate') pref = (chain && r.colour !== chain) ? 0 : 1;
    else if (knobs.targetMode === 'tight')  pref = liveBlooms.includes(r.colour) ? 0 : 1;
    return { r, i, pref, rem: totalNeed(needFor(r, tray)), reach: r.reach_estimate || 0, value: r.value || 0 };
  });
  const cmp = greedy
    ? (a, b) => a.pref - b.pref || b.value - a.value || a.rem - b.rem || b.reach - a.reach || a.i - b.i
    : (a, b) => a.pref - b.pref || a.rem - b.rem || b.reach - a.reach || b.value - a.value || a.i - b.i;
  const sorted = scored.slice().sort(cmp);
  const top = sorted[0];
  if (top.rem > spins * KEEP_BUDGET){                                   // identity pick can't finish?
    const reachable = sorted.filter(s => s.rem <= spins * KEEP_BUDGET); // salvage to the best REACHABLE
    if (reachable.length) return reachable[0].r;
  }
  return top.r;
}

// fang keep decision — the debt gamble, per archetype. `refuse` never touches a fang;
// `lastResort` is corrupt-vs-dead insurance (only on the final spin, still short);
// `early` is the Debtor line — bank the wild whenever it fills a hole, accepting the
// load-bearing corruption + forced curse (which is what its witnesses are paid to want).
function fangKeep(policy, state, remNeed){
  if (policy === 'early')      return remNeed > 0;
  if (policy === 'lastResort') return (state.rollsLeft || 0) <= 0 && remNeed > 0;
  return false;   // 'refuse' / unknown
}

// chooseKeep — the loose die index to keep now, or null (nothing worth keeping). Keeps
// toward the target's still-unmet need; a `multi` build keeps toward ANY unmet rung
// (fishing for the double-completion). `legalKeeps` is the set of keep-legal die indices
// (already respects a keepCap curse), so the pick can never be rejected.
export function chooseKeep(state, target, knobs, legalKeeps){
  const tray = state.tray || [];
  const rungs = state.rungs || [];
  const byI = i => tray.find(t => t.i === i);
  const primaryNeed = target ? needFor(target, tray) : {};
  const primTot = totalNeed(primaryNeed);
  for (const di of (legalKeeps || [])){
    const t = byI(di);
    if (!t || t.symbol === 'blank') continue;
    if (t.symbol === 'fang'){ if (fangKeep(knobs.fangPolicy, state, primTot)) return di; continue; }
    const helps = knobs.targetMode === 'multi'
      ? rungs.some(r => (needFor(r, tray)[t.symbol] || 0) > 0)
      : (primaryNeed[t.symbol] || 0) > 0;
    if (helps) return di;
  }
  return null;
}

// decideStop — resolve now, or spin again? The stop IS the choice (AGENT_PLAY.md), so
// this is where the identities most diverge: the Miser banks the instant anything lights
// (leaving spins → the on_stop_early witness); the Zealot pushes every spin chasing the
// Bloom; the Glutton holds out for the second rung. The last spin always resolves.
export function decideStop(state, target, knobs){
  const met = state.metNow || [];
  const targetMet = !!target && met.some(m => m.tier === target.tier && m.colour === target.colour);
  const anyMet = met.length > 0;
  if ((state.rollsLeft || 0) <= 0) return true;   // no spins left — must resolve
  switch (knobs.stopMode){
    case 'early':  return targetMet || anyMet;            // bank fast, keep the spins as worth
    case 'any':    return anyMet;                         // settle for the rotated colour
    case 'multi':  return met.length >= 2;                // hold out for the double-completion
    case 'push':   return targetMet && (target.tier === 'bloom' || knobs.tier === 'bloom');
    case 'target':
    default:       return targetMet;
  }
}

// choosePerk — draft a card by the build's id preference + a ladder-card tiebreak. A
// FORCED curse (fang corruption) is the only card offered → take it. Deepen auto-picks
// its face (the CLI targets the most-demanded rune) — {card} alone suffices.
export function choosePerk(state, knobs){
  const offer = state.perkOffer || [];
  if (!offer.length) return { type: 'perk', card: 0 };
  if (offer.every(c => c.kind === 'curse')) return { type: 'perk', card: offer[0].card };
  const pool = offer.filter(c => c.kind !== 'curse');
  const cands = pool.length ? pool : offer;
  let best = cands[0], bestScore = -Infinity;
  for (const c of cands){
    const s = scoreCard(c, knobs);
    if (s > bestScore){ bestScore = s; best = c; }
  }
  return { type: 'perk', card: best.card };
}
function scoreCard(c, knobs){
  const pref = knobs.perkPref || [];
  const pi = pref.indexOf(c.id);
  let s = pi >= 0 ? (100 - pi * 10) : 0;
  const bias = knobs.cardBias || {};
  if (bias.rarityWeight)   s += (RARITY_RANK[c.rarity] || 0) * bias.rarityWeight;
  if (bias.blemishedBonus && c.blemished) s += bias.blemishedBonus;
  if (bias.cleanBonus     && !c.blemished) s += bias.cleanBonus;
  return s;
}

// -----------------------------------------------------------------------------
// THE ROSTER — seven builds (Modifier Stack §11). Witness loadouts drawn from the
// 16-strong registry (content/witnesses.js); each build pairs a strategy with the
// witnesses authored to reward it. Loadouts are ≤5 (the portrait-slot budget).
// -----------------------------------------------------------------------------
export const ARCHETYPES = Object.freeze({
  // Miser — safe floor-farming, stop-early. The canonical non-exploit / accessibility
  // build: bank the Floor the instant it lights, keep the spins as worth. (Danger:
  // dominance-by-boredom — the gate must confirm it's viable but not TOP.)
  miser: {
    blurb: 'safe floor-farming; banks the instant anything lights',
    witnesses: ['patient_needle', 'miser_eye', 'the_edge', 'unbroken_line'],   // long_thread CUT (§4.2) → the_edge (Slice 2)
    targetMode: 'tier', tier: 'floor', stopMode: 'early', fangPolicy: 'refuse',
    perkPref: ['steady', 'glimmer', 'bright_glimmer', 'radiant_glimmer', 'reweave', 'deepen'],
    cardBias: { cleanBonus: 12 },
    stitch: 'stitch',
  },
  // Monk — mono-colour Concentration + depth. Chase the CHAIN colour's rung every
  // segment, deepen its faces (deep_ink). The jam's proven dominant exploit — here to
  // be measured against its containment (Concentration trim, cost-aware Σpips pricing).
  monk: {
    blurb: 'mono-colour concentration; extends the chain, deepens its runes',
    witnesses: ['unbroken_line', 'deep_ink', 'the_edge', 'patient_needle'],   // long_thread CUT (§4.2) → the_edge (Slice 2)
    targetMode: 'chain', stopMode: 'target', fangPolicy: 'refuse',
    perkPref: ['deepen', 'steady', 'reweave', 'glimmer', 'bright_glimmer', 'radiant_glimmer'],
    cardBias: {},
    stitch: 'stitch',
  },
  // Weaver — broad Trinity, rotate the three colours. Chase a colour DIFFERENT from the
  // chain (breaks → wanderers_mark; three distinct → Trinity). Must stay meaningful vs
  // the Monk (Trinity worth kept rich by design).
  weaver: {
    blurb: 'broad Trinity; rotates colours off the chain',
    witnesses: ['wanderers_mark', 'thousand_cuts', 'twin_needle', 'the_moth'],
    targetMode: 'rotate', stopMode: 'any', fangPolicy: 'refuse',
    perkPref: ['radiant_glimmer', 'bright_glimmer', 'glimmer', 'steady', 'reweave', 'deepen'],
    cardBias: { rarityWeight: 5 },
    stitch: 'stitch',
  },
  // Tempoist — reroll / extra-spin / stitch economy. Efficient reach, banks tempo
  // (reweave first), leans on the Stitch save (knotted_rope). Danger: stitch-farming;
  // containment is the ash-grade stitch draw.
  tempoist: {
    blurb: 'tempo economy; banks spins, leans on the stitch',
    witnesses: ['knotted_rope', 'gamblers_vein', 'twin_needle'],
    targetMode: 'reach', stopMode: 'target', fangPolicy: 'refuse',
    perkPref: ['reweave', 'deepen', 'steady', 'glimmer', 'bright_glimmer', 'radiant_glimmer'],
    cardBias: {},
    stitch: 'stitch',
  },
  // Zealot — Bloom greed, push. Chase the fat 6-value rung, use every spin
  // (gamblers_vein spin==3, the_zealot bloom tier). Danger: double-feeds on Bloom
  // (score + royal draw) — the gate watches it doesn't invert the Monk exploit.
  zealot: {
    blurb: 'bloom greed; pushes every spin for the fat rung',
    witnesses: ['the_zealot', 'gamblers_vein', 'bloomkeeper', 'deep_ink'],
    targetMode: 'tier', tier: 'bloom', stopMode: 'push', fangPolicy: 'lastResort',
    perkPref: ['deepen', 'reweave', 'radiant_glimmer', 'bright_glimmer', 'glimmer', 'steady'],
    cardBias: { rarityWeight: 8 },
    stitch: 'stitch',
  },
  // Glutton — multi-completion fishing. Hold out for the SECOND rung in one segment
  // (twin_needle rungs≥2, mixed draw, Multi/All-three scoring). Self-limiting (spends
  // spins to fish); the gate confirms it stays spice, not a dominant loop.
  glutton: {
    blurb: 'multi-completion fishing; holds out for the double rung',
    witnesses: ['twin_needle', 'gamblers_vein', 'deep_ink', 'thousand_cuts'],
    targetMode: 'multi', stopMode: 'multi', fangPolicy: 'lastResort',
    perkPref: ['reweave', 'deepen', 'bright_glimmer', 'glimmer', 'radiant_glimmer', 'steady'],
    cardBias: { rarityWeight: 6 },
    stitch: 'stitch',
  },
  // Debtor — the fang/curse economy. KEEP FANGS to complete (accept the load-bearing
  // corruption + forced curse), farm the cursed run (debtors_grin +2/cursed segment,
  // the cursed-run jackpot). Danger: fray must still kill blooms — if banes become
  // strictly good the build breaks. The one build that exercises the debt coil.
  debtor: {
    blurb: 'fang/curse economy; banks the wild, farms the cursed run',
    witnesses: ['debtors_grin', 'wanderers_mark', 'gamblers_vein', 'second_skin'],
    targetMode: 'reach', stopMode: 'target', fangPolicy: 'early',
    perkPref: ['radiant_glimmer', 'bright_glimmer', 'glimmer', 'deepen', 'reweave', 'steady'],
    cardBias: { blemishedBonus: 25, rarityWeight: 4 },
    stitch: 'stitch',
  },
});

// The knot is a free final cast — everyone plays it the same: chase a rung matching a
// live bloom colour (the TIGHT bonus), push all three free spins, fang only as
// corrupt-vs-dead insurance. Used by the driver whenever state.phase === 'knot'.
export const KNOT_KNOBS = Object.freeze({
  targetMode: 'tight', stopMode: 'push', fangPolicy: 'lastResort', perkPref: [], cardBias: {},
});

export const ARCHETYPE_NAMES = Object.freeze(Object.keys(ARCHETYPES));
