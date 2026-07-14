// =============================================================================
// WITNESS REGISTRY  (Modifier Stack §5b — the passive-scorer relic species)
// -----------------------------------------------------------------------------
// THE LAW (mirrors enchantments.js L0 + symbols.js): the engine NEVER branches on
// a witness id. It reads ONLY the closed grammar fields below. Adding a witness
// edits ONLY this file. Witnesses are the "worth" novelty channel — passive
// scorers that watch events and reweight WORTH (Reach-vs-Worth §1); the free drip.
//
// A witness is a composition over CLOSED vocabularies (§5b):
//   Witness = Event × [Filter] × Payload × Scaling  (+ axis, rarity, slot)
//
// Sibling to the enchantment grammar, but a DIFFERENT interpreter: witnesses are
// run-scoped passive scorers with no scope/target — they return a SCORE DELTA, not
// effect-actions. The resolver.js face-scoped engine is the wrong home; the pure
// scorer lives in engine/witness.js (Integration Plan §0 correction C3).
//
// STATUS: pure data + validators + generator. Nothing on the live path imports this
// yet — adding it is behaviour-neutral (Phase-A registry scaffolding). The live
// wiring (firing scoreWitnesses at event sites, gated on balance.on('witnesses'))
// is a later slice.
// =============================================================================

import { AXES, RARITIES, deriveRarity, lintRarity } from './registry_fields.js';
import { COLOUR_IDS } from './symbols.js';
import { isContentEnabled, getDisabledContent } from '../engine/balance.js';   // §8 trim substrate (composer filter only — the registry below stays pure data)

// ---- §5b Events — the live moment a witness fires (see witness.js ctx contract) --
// Each maps to an existing engine moment or one hook away (Integration Plan §3a):
//   on_resolve/on_stop_early/on_push/on_snap  — commitSegment / stop / knot
//   on_bloom                                  — the checkBlooms→recordBloom loop
//   on_combo                                  — detectCombos (tally-time)
//   on_stitch                                 — commitSegment with opts.stitched
//   on_fang_kept / on_curse_taken             — the debt witnesses
//   on_segment_start                          — top of the segment loop
//   on_patron_complete                        — UN-FIREABLE until the patron beat (Phase C)
export const WITNESS_EVENTS = Object.freeze([
  'on_resolve', 'on_stop_early', 'on_push', 'on_snap',
  'on_bloom', 'on_combo', 'on_stitch',
  'on_fang_kept', 'on_curse_taken',
  'on_segment_start', 'on_patron_complete',
]);

// ---- §5b Filters — the optional gate on the trigger ----
export const WITNESS_FILTER_KINDS = Object.freeze([
  'none',         // always fires
  'colour',       // { eq | colour } — the resolved colour equals eq (colour: legacy alias)
  'tier',         // { tier }   — floor/true/bloom
  'depth',        // { minPips } — a woven face of depth >= minPips
  'ingredient',   // { symbol } — an ingredient (charm/mana) was woven
  'chain',        // { dir:'extends'|'breaks' } — vs the prior resolve (stopPreview read)
  'chain_purity', // { minLen } — current Concentration length >= minLen
  'rungs',        // { min } — multi-completion: metCount >= min (v1.2)
  'thread_state', // { cursedSegments? | liveBlooms? | maxCursed? | minLength? }
  'spin',         // { eq? | max? } — spin index at resolve
  // ---- §4.3 v2 additions (Slice 2) — the stop-decision + build-identity poles ----
  'rolls_left',   // { eq } — spins remaining at resolve equals eq (0 = rode the wire)
  'fang',         // { kept?, loadBearing? } — a kept fang, optionally (not) load-bearing
  'purity',       // {} — every kept STAT face shares one colour (wilds/blanks excepted)
]);

// tiers mirror generator.js TIER_VALUE keys (not a registry — kept literal here).
export const WITNESS_TIERS = Object.freeze(['floor', 'true', 'bloom']);

// ---- §5b Payloads — what a fired witness pays ----
//   flat/per/perPip/ink  = WORTH (score delta — the free channel)
//   reach/tempo          = PRICED power (must be priced by the generator — §D/AP#2)
//   drawWidth            = width, not power (§9d: extra selection, no reach to price)
//   cleanse              = an EFFECT (strip a bane) — the score scorer can't express
//                          it; deferred to Phase E's effect channel (C3). Scores 0 now.
//   mult                 = ×mult, jackpot-rare ONLY (Law L7) — see the validator rule.
export const WITNESS_PAYLOAD_KINDS = Object.freeze([
  'flat', 'per', 'perPip', 'reach', 'tempo', 'drawWidth', 'ink', 'cleanse', 'mult',
]);
export const WITNESS_PER_UNITS = Object.freeze(['symbol', 'ingredient', 'cursedSeg', 'colourPip']);

// ---- §5b Scaling ----
export const WITNESS_SCALINGS = Object.freeze(['static', 'growing', 'conditional', 'consuming']);

// ---- §5c the five named body slots (adjacency substrate — inert in v1) ----
export const WITNESS_SLOTS = Object.freeze(['nape', 'sternum', 'left_wrist', 'right_wrist', 'spine']);

// The payloads that grant reach/tempo power — must be PRICED (Anti-pattern #2). A
// witness carrying one must acknowledge the price (priced:true or a rider) or the
// validator rejects it (Integration Plan M-2). drawWidth is NOT here: width adds
// selection, not reach the generator must price (§9d).
export const PRICED_PAYLOADS  = Object.freeze(['reach', 'tempo']);
// mult may not ride the per-resolve moments (no per-resolve ×mult stacking — L7).
export const PER_RESOLVE_EVENTS = Object.freeze(['on_resolve', 'on_stop_early', 'on_push']);

// ---- witnessFeatures — the §10 rarity extractor for this registry ----
export function witnessFeatures(w) {
  const conditioned = !!(w.filter && w.filter.kind && w.filter.kind !== 'none');
  const cleanReach  = (w.axis === 'reach' || w.axis === 'tempo') && !w.rider;
  return {
    scaling: w.scaling,
    chosen: false,                                   // witnesses have no chosen scope
    conditioned,
    cleanReach,
    mult:  !!(w.payload && w.payload.kind === 'mult'),
    named: false,
    conditionedReach: cleanReach && conditioned,
  };
}

// =============================================================================
// THE 16 STARTER WITNESSES (§5c) — pure grammar rows, authored in opposing pairs.
// Placeholder names/numbers (Rule 4 — the harness re-derives). rarity is DECLARED
// and lint-checked against deriveRarity(witnessFeatures) — see witnessTest / §HARNESS.
// =============================================================================
export const WITNESSES = Object.freeze({
  // — the stop/push pair —
  patient_needle: { id:'patient_needle', name:'The Patient Needle',  event:'on_stop_early', filter:{kind:'none'},                    payload:{kind:'flat', n:4},              scaling:'static',  axis:'worth', rarity:'common',   slot:'left_wrist',  weight:5 },
  gamblers_vein:  { id:'gamblers_vein',  name:"The Gambler's Vein",  event:'on_resolve',    filter:{kind:'spin', eq:3},              payload:{kind:'flat', n:6},              scaling:'static',  axis:'worth', rarity:'uncommon', slot:'right_wrist', weight:4 },
  // — the mono/broad pair —
  unbroken_line:  { id:'unbroken_line',  name:'The Unbroken Line',   event:'on_resolve',    filter:{kind:'chain', dir:'extends'},    payload:{kind:'flat', n:1},              scaling:'growing', axis:'worth', rarity:'rare',     slot:'spine',       weight:2 },
  wanderers_mark: { id:'wanderers_mark', name:"The Wanderer's Mark", event:'on_resolve',    filter:{kind:'chain', dir:'breaks'},     payload:{kind:'flat', n:5},              scaling:'static',  axis:'worth', rarity:'uncommon', slot:'spine',       weight:4 },
  // — the tall/wide pair —
  deep_ink:       { id:'deep_ink',       name:'Deep Ink',            event:'on_resolve',    filter:{kind:'depth', minPips:3},        payload:{kind:'perPip', n:1},            scaling:'static',  axis:'worth', rarity:'uncommon', slot:'sternum',     weight:3 },
  thousand_cuts:  { id:'thousand_cuts',  name:'The Thousand Cuts',   event:'on_resolve',    filter:{kind:'none'},                    payload:{kind:'per', per:'symbol', n:1}, scaling:'static',  axis:'worth', rarity:'common',   slot:'sternum',     weight:5 },
  // — ingredient + debt —
  the_moth:       { id:'the_moth',       name:'The Moth',            event:'on_resolve',    filter:{kind:'ingredient', symbol:'charm'}, payload:{kind:'per', per:'ingredient', n:2}, scaling:'static', axis:'worth', rarity:'uncommon', slot:'nape', weight:3 },
  debtors_grin:   { id:'debtors_grin',   name:"The Debtor's Grin",   event:'on_resolve',    filter:{kind:'thread_state', cursedSegments:1}, payload:{kind:'per', per:'cursedSeg', n:2}, scaling:'static', axis:'debt', rarity:'uncommon', slot:'nape', weight:3 },
  // — clean_wrist CONVERTED (ModifierList v2 §3.3/§4.2): a purity run-goal reads better as a
  //   CONTRACT than a passive — it is now the `spotless_one` jackpot wish (content/wishes.js).
  //   The on_patron_complete event family stays (future patron-beat witnesses may use it). —
  // — the two PRICED reach/tempo witnesses (ship score-only until the generator prices them) —
  bloomkeeper:    { id:'bloomkeeper',    name:'Bloomkeeper',         event:'on_bloom',      filter:{kind:'none'},                    payload:{kind:'reach', n:1},             scaling:'static',  axis:'reach', rarity:'uncommon', slot:'sternum',     weight:3, priced:true },
  knotted_rope:   { id:'knotted_rope',   name:'The Knotted Rope',    event:'on_stitch',     filter:{kind:'none'},                    payload:{kind:'tempo', n:1},             scaling:'static',  axis:'tempo', rarity:'uncommon', slot:'right_wrist', weight:2, priced:true },
  // — debt mitigation (cleanse EFFECT deferred to Phase E — scores 0 now, C3) —
  second_skin:    { id:'second_skin',    name:'Second Skin',         event:'on_curse_taken', filter:{kind:'none'},                   payload:{kind:'cleanse', charges:3},     scaling:'consuming', axis:'debt', rarity:'uncommon', slot:'nape',      weight:2 },
  // — the greed/floor pair —
  miser_eye:      { id:'miser_eye',      name:"The Miser's Eye",     event:'on_resolve',    filter:{kind:'tier', tier:'floor'},      payload:{kind:'flat', n:3},              scaling:'static',  axis:'worth', rarity:'uncommon', slot:'left_wrist',  weight:3 },
  the_zealot:     { id:'the_zealot',     name:'The Zealot',          event:'on_resolve',    filter:{kind:'tier', tier:'bloom'},      payload:{kind:'flat', n:2},              scaling:'growing', axis:'worth', rarity:'rare',     slot:'right_wrist', weight:2 },
  // — the overshoot build (v1.2) —
  twin_needle:    { id:'twin_needle',    name:'The Twin Needle',     event:'on_resolve',    filter:{kind:'rungs', min:2},            payload:{kind:'drawWidth', n:1},         scaling:'static',  axis:'worth', rarity:'uncommon', slot:'sternum',     weight:2 },
  // — §4.3 the stop-decision poles (the_edge = ride the wire; patient_needle = stop early) —
  the_edge:       { id:'the_edge',       name:'The Edge',            event:'on_resolve',    filter:{kind:'rolls_left', eq:0},        payload:{kind:'flat', n:5},              scaling:'static',  axis:'worth', rarity:'uncommon', slot:'right_wrist', weight:4 },
  // — §4.3 the fang-dance (a kept fang that carried NO weight — clever AND lucky, for free) —
  fang_dancer:    { id:'fang_dancer',    name:'The Fang-Dancer',     event:'on_resolve',    filter:{kind:'fang', kept:true, loadBearing:false}, payload:{kind:'flat', n:4},   scaling:'static',  axis:'worth', rarity:'uncommon', slot:'nape',        weight:3 },
  // — §4.3 the loyalist family (all-in on one colour; growing) —
  bodybound:      { id:'bodybound',      name:'The Bodybound',       event:'on_resolve',    filter:{kind:'colour', eq:'body'},       payload:{kind:'flat', n:2},              scaling:'growing', axis:'worth', rarity:'rare',     slot:'sternum',     weight:2 },
  mindbound:      { id:'mindbound',      name:'The Mindbound',       event:'on_resolve',    filter:{kind:'colour', eq:'mind'},       payload:{kind:'flat', n:2},              scaling:'growing', axis:'worth', rarity:'rare',     slot:'left_wrist',  weight:2 },
  spiritbound:    { id:'spiritbound',    name:'The Spiritbound',     event:'on_resolve',    filter:{kind:'colour', eq:'spirit'},     payload:{kind:'flat', n:2},              scaling:'growing', axis:'worth', rarity:'rare',     slot:'spine',       weight:2 },
  // — §4.3 the purist (pure-keep discipline — the pure rung shape as a draftable goal; growing) —
  the_purist:     { id:'the_purist',     name:'The Purist',          event:'on_resolve',    filter:{kind:'purity'},                  payload:{kind:'flat', n:3},              scaling:'growing', axis:'worth', rarity:'rare',     slot:'left_wrist',  weight:2 },
});

export function witness(id) { return WITNESSES[id] || null; }

// ---- validateWitness — enforces L0 (closed vocabulary + structural rules) ----
export function validateWitness(w) {
  const errors = [];
  if (!w || typeof w !== 'object') return { ok: false, errors: ['witness must be an object'] };
  if (typeof w.id !== 'string' || !w.id)      errors.push('id must be a non-empty string');
  if (!WITNESS_EVENTS.includes(w.event))      errors.push(`event '${w.event}' not in vocabulary`);
  if (!WITNESS_SCALINGS.includes(w.scaling))  errors.push(`scaling '${w.scaling}' not in vocabulary`);
  if (!AXES.includes(w.axis))                 errors.push(`axis '${w.axis}' not in vocabulary`);
  if (!RARITIES.includes(w.rarity))           errors.push(`rarity '${w.rarity}' not in vocabulary`);
  if (w.slot != null && !WITNESS_SLOTS.includes(w.slot)) errors.push(`slot '${w.slot}' not in vocabulary`);

  // filter (null ⇒ none)
  const f = w.filter == null ? { kind: 'none' } : w.filter;
  if (typeof f !== 'object') {
    errors.push('filter must be null or an object');
  } else if (!WITNESS_FILTER_KINDS.includes(f.kind)) {
    errors.push(`filter.kind '${f && f.kind}' not in vocabulary`);
  } else {
    if (f.kind === 'colour' && !COLOUR_IDS.includes(f.eq != null ? f.eq : f.colour)) errors.push('colour filter needs a colour id (eq)');
    if (f.kind === 'tier'   && !WITNESS_TIERS.includes(f.tier)) errors.push('tier filter needs floor|true|bloom');
    if (f.kind === 'depth'  && !(f.minPips > 0)) errors.push('depth filter needs minPips > 0');
    if (f.kind === 'ingredient' && (typeof f.symbol !== 'string' || !f.symbol)) errors.push('ingredient filter needs a symbol');
    if (f.kind === 'chain'  && f.dir !== 'extends' && f.dir !== 'breaks') errors.push("chain filter needs dir 'extends'|'breaks'");
    if (f.kind === 'chain_purity' && !(f.minLen > 0)) errors.push('chain_purity filter needs minLen > 0');
    if (f.kind === 'rungs'  && !(f.min > 0)) errors.push('rungs filter needs min > 0');
    if (f.kind === 'thread_state' && !['cursedSegments', 'liveBlooms', 'maxCursed', 'minLength'].some(k => k in f))
      errors.push('thread_state filter needs one of cursedSegments/liveBlooms/maxCursed/minLength');
    if (f.kind === 'spin'   && f.eq == null && f.max == null) errors.push('spin filter needs eq or max');
    // §4.3 v2 filters
    if (f.kind === 'rolls_left' && typeof f.eq !== 'number') errors.push('rolls_left filter needs numeric eq');
    if (f.kind === 'fang' && f.kept == null && f.loadBearing == null) errors.push('fang filter needs kept and/or loadBearing');
    // purity takes no params (the pure-shape gate is computed by the scorer)
  }

  // payload
  const p = w.payload;
  if (!p || typeof p !== 'object' || !WITNESS_PAYLOAD_KINDS.includes(p.kind)) {
    errors.push(`payload.kind '${p && p.kind}' not in vocabulary`);
  } else {
    const needsN = ['flat', 'perPip', 'reach', 'tempo', 'drawWidth', 'ink'];
    if (needsN.includes(p.kind) && typeof p.n !== 'number') errors.push(`payload '${p.kind}' needs numeric n`);
    if (p.kind === 'per') {
      if (!WITNESS_PER_UNITS.includes(p.per)) errors.push(`per payload unit '${p.per}' not in vocabulary`);
      if (typeof p.n !== 'number') errors.push('per payload needs numeric n');
    }
    if (p.kind === 'mult' && typeof p.x !== 'number') errors.push('mult payload needs numeric x');
    if (p.kind === 'cleanse' && !(p.charges > 0)) errors.push('cleanse payload needs charges > 0');

    // Law L7 — ×mult is jackpot-rare only, never a per-resolve stacking engine.
    if (p.kind === 'mult') {
      if (w.rarity !== 'mythic') errors.push('mult payload requires rarity mythic (Law L7)');
      if (PER_RESOLVE_EVENTS.includes(w.event)) errors.push('mult payload forbidden on per-resolve events (Law L7)');
    }
    // M-2 — a reach/tempo payload must acknowledge its price (priced:true or a rider),
    // so "reach always pays" is structural, not prose (Anti-pattern #2).
    if (PRICED_PAYLOADS.includes(p.kind) && !w.priced && !w.rider) {
      errors.push(`payload '${p.kind}' grants reach/tempo — set priced:true or carry a rider (M-2 / AP#2)`);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

export function validateAll() {
  const problems = [];
  for (const [id, w] of Object.entries(WITNESSES)) {
    const r = validateWitness(w);
    if (!r.ok) problems.push({ id, errors: r.errors });
  }
  return { ok: problems.length === 0, problems };
}

// lintAllRarity — declared rarity must equal derived (§10). Whitelist hand-tuned ids.
export function lintAllRarity(whitelist = new Set()) {
  return lintRarity(Object.values(WITNESSES), witnessFeatures, whitelist);
}

// ---- generateWitness(rng, opts) — seeded weighted draw (rng injected; no Date/Math.random) ----
// Mirrors enchantments.generateEnchantment: valid-by-construction. opts.axis filters
// the pool (e.g. only 'worth' for a Phase-A worth-only draw). Returns a witness object.
export function generateWitness(rng, opts = {}) {
  let pool = Object.values(WITNESSES);
  if (opts.axis) pool = pool.filter(w => w.axis === opts.axis);
  if (opts.rarity) pool = pool.filter(w => w.rarity === opts.rarity);
  // §8 trim substrate: drop disabled ids. No-op passthrough when the set is empty (guarded
  // → byte-identical rng), only committed if it leaves the pool non-empty. Slice 2's witness
  // draft (reward_ladder.draftCard) is this composer's first live caller.
  if (getDisabledContent().length){ const t = pool.filter(w => isContentEnabled(w.id)); if (t.length) pool = t; }
  // §4.2 draft exclusion — never re-offer a witness the player already wears. FALLBACK ORDER
  // (ModifierList v2 bugfix — the old guard fell straight to the unexcluded RARITY pool, so an
  // exhausted target rarity re-offered WORN witnesses, contradicting AGENT_PLAY's "never re-offered"):
  //   (a) target rarity minus excluded → (b) ANY rarity minus excluded (widen rarity BEFORE
  //   violating exclusion) → (c) only if EVERY witness is excluded, the full pool (never crash).
  // Draws no rng (always one rng() below, whatever the pool). Empty exclude ⇒ step (a) never runs
  // and pool stays today's rarity pool (byte-identical stream); the (b) widen changes the DRAW
  // only in the exhaustion case that used to re-offer a worn witness — which is the whole point.
  if (opts.exclude && opts.exclude.length){
    const ex = opts.exclude;
    const a = pool.filter(w => !ex.includes(w.id));                 // (a) target rarity, unexcluded
    if (a.length) pool = a;
    else {
      let wide = Object.values(WITNESSES);                          // (b) widen RARITY (keep axis + trim)
      if (opts.axis) wide = wide.filter(w => w.axis === opts.axis);
      if (getDisabledContent().length){ const t = wide.filter(w => isContentEnabled(w.id)); if (t.length) wide = t; }
      const b = wide.filter(w => !ex.includes(w.id));
      pool = b.length ? b : Object.values(WITNESSES);               // (c) all worn ⇒ full pool, never crash
    }
  }
  if (!pool.length) pool = Object.values(WITNESSES);
  const total = pool.reduce((s, w) => s + (w.weight || 1), 0);
  let r = rng() * total;
  for (const w of pool) { r -= (w.weight || 1); if (r < 0) return { ...w }; }
  return { ...pool[pool.length - 1] };
}

// ---- describeWitness — display text built FROM the grammar, never per-id (L1) ----
export function describeWitness(w) {
  const when = {
    on_resolve: 'When you resolve', on_stop_early: 'When you stop with spins to spare',
    on_push: 'When you push for another spin', on_snap: 'When the trance breaks',
    on_bloom: 'When a bloom lands', on_combo: 'When a pattern is found',
    on_stitch: 'When you stitch a save', on_fang_kept: 'When you keep a fang',
    on_curse_taken: 'When a curse takes hold', on_segment_start: 'At the start of a segment',
    on_patron_complete: 'When you finish a patron',
  }[w.event] || 'When it fires';
  const gate = describeFilter(w.filter);
  const pay  = describePayload(w.payload);
  const grow = w.scaling === 'growing' ? ' (and grows)' : w.scaling === 'consuming' ? ' (a few times)' : '';
  return `${when}${gate}, ${pay}${grow}.`;
}
function describeFilter(f) {
  if (!f || f.kind === 'none') return '';
  switch (f.kind) {
    case 'colour':       return ` a ${f.eq != null ? f.eq : f.colour} strand`;
    case 'tier':         return ` at ${f.tier}`;
    case 'depth':        return ` a deep face (${f.minPips}+ pips)`;
    case 'ingredient':   return ` with ${f.symbol} woven`;
    case 'chain':        return f.dir === 'extends' ? ' that extends your chain' : ' that breaks your chain';
    case 'chain_purity': return ` on a ${f.minLen}+ streak`;
    case 'rungs':        return ` completing ${f.min}+ rungs`;
    case 'thread_state': return ' by the thread';
    case 'spin':         return f.eq != null ? ` on spin ${f.eq}` : ` by spin ${f.max}`;
    case 'rolls_left':   return f.eq === 0 ? ' with no spins to spare' : ` with ${f.eq} spins left`;
    case 'fang':         return f.loadBearing === false ? ' riding a free fang' : ' on a kept fang';
    case 'purity':       return ' from a pure keep';
    default:             return '';
  }
}
function describePayload(p) {
  if (!p) return 'nothing happens';
  switch (p.kind) {
    case 'flat':      return `score +${p.n}`;
    // per:'symbol' pays on ctx.distinctSymbols (see witness.js) — say so, so the card doesn't read
    // as per-symbol-INSTANCE (data-only wording fix; the scorer is unchanged). Other units verbatim.
    case 'per':       return `score +${p.n} per ${p.per === 'symbol' ? 'distinct symbol' : p.per}`;
    case 'perPip':    return `score +${p.n} per pip`;
    case 'reach':     return `gain +${p.n} reach next segment`;
    case 'tempo':     return `gain +${p.n} spin`;
    case 'drawWidth': return `the draw gains +${p.n} card`;
    case 'ink':       return `bank +${p.n} ink`;
    case 'cleanse':   return `cleanse a bane`;
    case 'mult':      return `score ×${p.x}`;
    default:          return 'nothing happens';
  }
}
