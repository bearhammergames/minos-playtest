// =============================================================================
// WISH REGISTRY  (Modifier Stack §6 / L3 — patron wishes, the boss-blind layer)
// -----------------------------------------------------------------------------
// A Wish = ritual-warp Kind × Intensity(stage) × Payout-coupling, scoped to a patron
// and read BEFORE you sit down (legibility = informed consent). Pure DATA
// (content-as-data): a wish's `warp` is dispatched through engine/ritual.js — the SAME
// interpreter the curses migrated onto (C0), so wishes add no new engine branch.
//
// §6.2 the payout is COUPLED to the demand: the patron pays in what they made scarce
// (a granted verb / draw-bias — NEVER a score delta, never a flat tax; Wish Law 1/AP#6).
//
// STATUS: pure data + validate/generate. MVP = the CONSTRAINT species (take a verb away);
// Twists (change the physics) + Jackpots (the sanctioned ×mult) are a later wave. Numbers
// are Rule-4 placeholders. Consumed by agent_cli behind on('wishes').
// =============================================================================

import { isContentEnabled, getDisabledContent, on } from '../engine/balance.js';   // §8 trim substrate + §6 gate-first species inclusion (composer filter only — the registry stays pure data)
import { TWIST_KINDS, JACKPOT_KINDS } from '../engine/ritual.js';   // §6 v2 the closed twist/jackpot vocabularies (single-sourced with their interpreter)

export const WISH_SPECIES  = Object.freeze(['constraint', 'twist', 'jackpot']);
// PAYOUT_KINDS = the granted-verb payouts (constraints/twists couple these to what they made
// scarce — NEVER a score delta; Wish Law 1 / AP#6). JACKPOTS deliberately do NOT use payout:
// their reward is a disclosed SCORE line via the `jackpot` CONTRACT (evaluated at patronComplete,
// paid on its own tally line), not a granted verb — a clean, separate channel.
export const PAYOUT_KINDS  = Object.freeze(['bonusSpins', 'cleanse', 'drawBias']);   // granted verbs, never score

export const WISHES = Object.freeze({
  // — Constraints: take a verb away; the payout gives back tempo they made scarce —
  grasping_widow: {
    id:'grasping_widow', species:'constraint', label:'The Grasping Widow',
    desc:'Her hands will not open — keep at most 2 dice per spin.',
    warp:  { kind:'keepCap', params:{ count:2 } },
    payout:{ kind:'bonusSpins', n:1 },   // took keeps → repays a spin (coupled)
    axis:'debt', rarity:'uncommon', weight:5,
  },
  hasty_one: {
    id:'hasty_one', species:'constraint', label:'The Hasty One',
    desc:'She is going quickly — two spins, not three.',
    warp:  { kind:'rollLimit', params:{ rolls:2 } },
    payout:{ kind:'bonusSpins', n:1 },   // took a roll → repays a spin next patron (coupled)
    axis:'debt', rarity:'uncommon', weight:5,
  },
  soaked_scholar: {
    id:'soaked_scholar', species:'constraint', label:'The Soaked Scholar',
    desc:'Rolled Mana locks itself into your kept row.',
    warp:  { kind:'forcedKeep', params:{ symbol:'mana' } },   // enforcement lands with the forcedKeep wave
    payout:{ kind:'bonusSpins', n:1 },
    axis:'debt', rarity:'rare', weight:2,
  },
  // Part A (v2) — a NEW constraint on the already-live rerollOnRoll surface (pure content).
  fevered_one: {
    id:'fevered_one', species:'constraint', label:'The Fevered One',
    desc:'The flesh will not settle — the first Body you roll each spin shudders and rerolls.',
    warp:  { kind:'rerollOnRoll', params:{ symbol:'body', count:1 } },
    payout:{ kind:'bonusSpins', n:1 },   // takes roll certainty → repays a spin (coupled)
    axis:'debt', rarity:'uncommon', weight:4,
  },

  // — Twists: change the resolve PHYSICS for one patron (closed-vocab twist.kind; no warp) —
  mirrored_one: {
    id:'mirrored_one', species:'twist', label:'The Mirrored One',
    desc:'She sees you crooked — your tallest kept face counts double, your lowest for nothing at all.',
    twist:{ kind:'mirror', params:{} },
    axis:'worth', rarity:'uncommon', weight:3,
  },
  veiled_one: {
    id:'veiled_one', species:'twist', label:'The Veiled One',
    desc:'The Bloom stays hidden until you have earned the True — reach it, and the veil lifts.',
    twist:{ kind:'veil', params:{} },
    axis:'reach', rarity:'uncommon', weight:3,
  },
  generous_one: {
    id:'generous_one', species:'twist', label:'The Generous One',
    // Fix 5 — the free reroll fires ONLY on the boss segment (boss-gated, like every twist since the
    // boss-gating round). The old copy said "each segment"; corrected to the segment she leans in on.
    desc:'A free reroll on the segment she leans in — but for every two she grants, a mild blemish settles at her end.',
    twist:{ kind:'freeReroll', params:{} },
    axis:'debt', rarity:'uncommon', weight:3,
  },
  // §G4 — BOSS RUNG-CONDITIONS (twist kind 'rungs'): the wish bends the generated rung SET on the boss
  // segment (the generator composes with twistRungSpec — id-blind). Rare spice (the blessed cadence). Both
  // require the composer (on('generator2.rungs')) to have any effect — inert otherwise; boss-gated like all twists.
  merciless_one: {
    id:'merciless_one', species:'twist', label:'The Merciless One',
    desc:'No easy out while she watches — the Floor is barred; only the True and the Bloom answer.',
    twist:{ kind:'rungs', params:{ forbid:['floor'] } },   // strips the survival anchor → the anchor role moves to True (fewer ways to survive)
    axis:'reach', rarity:'rare', weight:2,
  },
  demanding_one: {
    id:'demanding_one', species:'twist', label:'The Demanding One',
    desc:'She demands more — a fourth, apex rung joins the segment, and the set hardens to hold its tension.',
    twist:{ kind:'rungs', params:{ count:4 } },   // extends the ceiling with an apex; the band compensates by hardening (§3.2 polarity)
    axis:'worth', rarity:'rare', weight:2,
  },

  // — Jackpots: a visible CONTRACT paid on its own tally line (closed-vocab jackpot.kind) —
  spotless_one: {
    id:'spotless_one', species:'jackpot', label:'The Spotless One',
    desc:'Weave her whole patronage without a single corrupt or cursed bead, and she rewards the purity.',
    jackpot:{ kind:'spotless', n:25, params:{} },   // Rule-4 placeholder payout
    axis:'worth', rarity:'uncommon', weight:3,
  },
  chain_keeper: {
    id:'chain_keeper', species:'jackpot', label:'The Chain-Keeper',
    desc:'Never break the chain while she watches — weave her whole patronage in one unbroken colour.',
    // §post-G3 Fix 3 — chainAlive is now patronLen-scaled + window-based (evalJackpot reads ctx.patronLen):
    // met iff EVERY segment of her patronage extends one un-corrupt colour chain (arriving with a long
    // chain does NOT pre-satisfy). params.len is a defensive fallback only (the live target is patronLen).
    jackpot:{ kind:'chainAlive', n:20, params:{} },
    axis:'worth', rarity:'uncommon', weight:3,
  },
  fang_fancier: {
    id:'fang_fancier', species:'jackpot', label:'The Fang-Fancier',
    desc:'While she watches, a load-bearing fang drains no neighbour — bank three corrupt beads for her jackpot.',
    jackpot:{ kind:'fangCourt', n:30, params:{ n:3 } },
    axis:'debt', rarity:'rare', weight:2,
  },
});

export function wish(id){ return WISHES[id] || null; }

// validateWish — light structural gate (content-as-data). The `warp.kind` is dispatched
// by ritual.js, whose validateWarp is the authority; here we check the wish shape.
export function validateWish(w){
  const errors = [];
  if (!w || typeof w !== 'object') return { ok: false, errors: ['wish must be an object'] };
  if (typeof w.id !== 'string' || !w.id) errors.push('id must be a non-empty string');
  if (!WISH_SPECIES.includes(w.species)) errors.push(`species '${w.species}' not in vocabulary`);
  // per-species required fields (the closed vocabularies live in ritual.js — single source):
  //   constraint → a ritual `warp` (dispatched by ritual.js)
  //   twist      → a `twist` {kind ∈ TWIST_KINDS}    (the resolve-physics change)
  //   jackpot    → a `jackpot` {kind ∈ JACKPOT_KINDS, numeric n}   (the score contract)
  if (w.species === 'constraint'){
    if (!w.warp || typeof w.warp !== 'object' || typeof w.warp.kind !== 'string') errors.push('a constraint wish needs a warp {kind,...}');
  } else if (w.species === 'twist'){
    if (!w.twist || typeof w.twist !== 'object' || !TWIST_KINDS.includes(w.twist.kind)) errors.push(`a twist wish needs twist {kind in ${TWIST_KINDS.join('|')}}`);
  } else if (w.species === 'jackpot'){
    if (!w.jackpot || typeof w.jackpot !== 'object' || !JACKPOT_KINDS.includes(w.jackpot.kind)) errors.push(`a jackpot wish needs jackpot {kind in ${JACKPOT_KINDS.join('|')}}`);
    else if (typeof w.jackpot.n !== 'number') errors.push('a jackpot wish needs a numeric jackpot.n (the disclosed score payout)');
  }
  if (w.payout && !PAYOUT_KINDS.includes(w.payout.kind)) errors.push(`payout '${w.payout.kind}' not in vocabulary (never a score delta)`);
  return errors.length ? { ok: false, errors } : { ok: true };
}

export function validateAll(){
  const problems = [];
  for (const [id, w] of Object.entries(WISHES)){ const r = validateWish(w); if (!r.ok) problems.push({ id, errors: r.errors }); }
  return { ok: problems.length === 0, problems };
}

// generateWish(rng, opts) — seeded weighted draw (rng injected; valid by construction).
// opts.species filters; opts.patronIndex is the hook for intensity-by-stage (later wave).
export function generateWish(rng, opts = {}){
  let pool = Object.values(WISHES);
  if (opts.species) pool = pool.filter(w => w.species === opts.species);   // explicit species (a forced/test draw) bypasses the gate
  else {
    // §6 GATE-FIRST species inclusion (no rng drawn — a pure balance read BEFORE the draw):
    // constraints are the always-on spine; twists ride on('wishes.twists'), jackpots on
    // ('wishes.jackpots'). Both flags OFF ⇒ the pool is the SAME 3 constraints in the SAME
    // order as before v2, so the single rng() draw below is BYTE-IDENTICAL to today.
    const twists = on('wishes.twists'), jackpots = on('wishes.jackpots');
    pool = pool.filter(w => w.species === 'constraint'
      || (w.species === 'twist'   && twists)
      || (w.species === 'jackpot' && jackpots));
  }
  // §8 trim substrate: drop disabled ids. No-op passthrough when the set is empty (guarded
  // → byte-identical rng), and only commit the trim if it leaves the pool non-empty (an
  // over-trim of the whole species falls through to the pool below, never crashes).
  if (getDisabledContent().length){ const t = pool.filter(w => isContentEnabled(w.id)); if (t.length) pool = t; }
  if (!pool.length) pool = Object.values(WISHES);
  const total = pool.reduce((s, w) => s + (w.weight || 1), 0);
  let r = rng() * total;
  for (const w of pool){ r -= (w.weight || 1); if (r < 0) return { ...w }; }
  return { ...pool[pool.length - 1] };
}
