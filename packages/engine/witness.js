// =============================================================================
// WITNESS SCORER  (Modifier Stack §5b — the engineering core, Integration Plan §3a)
// -----------------------------------------------------------------------------
// PURE + surface-agnostic + id-BLIND. Given the player's witness loadout, the event
// that just fired, and a frozen CONTEXT snapshot of that moment, it returns the
// score DELTA the witnesses contribute plus any non-score EFFECTS (reach/tempo/
// draw-width/cleanse) for the caller to apply. It NEVER mutates and NEVER branches
// on a witness id (L1 — dispatch on filter.kind / payload.kind only).
//
// WHY a separate scorer (not resolver.js): resolveEnchantments is face-scoped and
// returns effect-actions against target dice. Witnesses are run-scoped passive
// scorers with no scope/target — they return a {delta} (Integration Plan §0 C3).
//
// THE CONTEXT CONTRACT (the caller builds this at each event site; every field
// optional, absent ⇒ that filter/payload reads 0/false — an OFF/empty context can
// never fabricate score):
//   {
//     colour, tier,                 // the resolved rung (on_resolve family)
//     spin,                         // spin index at resolve (for the `spin` filter)
//     metCount,                     // # rungs completed this segment (for `rungs`)
//     chainExtends, chainBreaks,    // vs the prior resolve (stopPreview EXTEND/BREAK read)
//     chainLen,                     // current Concentration length (for `chain_purity`)
//     ingredients: { charm, mana }, // woven ingredient counts (for `ingredient`)
//     ingredientCount,              // total ingredient pips woven (for per:'ingredient')
//     distinctSymbols,              // # distinct symbols woven (for per:'symbol')
//     colourPips,                   // resolved-colour pips (for per:'colourPip')
//     depthPips, maxDepth,          // deepest woven face pips (for `depth` / perPip)
//     cursedSegments, liveBlooms,   // thread state (for `thread_state` / per:'cursedSeg')
//     threadLength,                 // thread.length (for thread_state.minLength)
//     growStacks: { [id]: n },      // per-witness 'growing' counter the CALLER maintains
//   }
//
// RETURNS: { delta:Number, effects:[{ kind, n?/x?, source }], fired:Number,
//           firedIds:[id], hits:[{ id, delta, kind }] }.
//   Non-score payloads (reach/tempo/drawWidth/ink/cleanse/mult) contribute 0 to
//   delta and appear in `effects` for the caller to apply — the score scorer stays
//   pure worth. (mult is validated jackpot-only; it rides `effects`, never delta.)
//   `hits` is the PER-WITNESS breakdown (score delta + payload kind for each witness that
//   fired) so a caller can surface a LOUD beat per witness + track per-id tallies (§4.2).
// =============================================================================

// ---- filter gate (id-blind; reads only the closed filter grammar) ----
function filterHolds(filter, ctx) {
  const f = filter || { kind: 'none' };
  switch (f.kind) {
    case 'none':         return true;
    case 'colour':       return ctx.colour === (f.eq != null ? f.eq : f.colour);   // eq (new) | colour (legacy alias)
    case 'tier':         return ctx.tier === f.tier;
    case 'depth':        return (ctx.maxDepth || 0) >= f.minPips;
    case 'ingredient':   return ((ctx.ingredients && ctx.ingredients[f.symbol]) || 0) > 0;
    case 'chain':        return f.dir === 'extends' ? !!ctx.chainExtends : !!ctx.chainBreaks;
    case 'chain_purity': return (ctx.chainLen || 0) >= f.minLen;
    case 'rungs':        return (ctx.metCount || 0) >= f.min;
    case 'spin':         return f.eq != null ? ctx.spin === f.eq : (ctx.spin || 0) <= f.max;
    case 'thread_state':
      if ('cursedSegments' in f && !((ctx.cursedSegments || 0) >= f.cursedSegments)) return false;
      if ('liveBlooms'     in f && !((ctx.liveBlooms || 0)     >= f.liveBlooms))     return false;
      if ('maxCursed'      in f && !((ctx.cursedSegments || 0) <= f.maxCursed))      return false;
      if ('minLength'      in f && !((ctx.threadLength || 0)   >= f.minLength))      return false;
      return true;
    // ---- §4.3 v2 filters (Slice 2). Absent ctx ⇒ reads 0/false, so it never fabricates. ----
    case 'rolls_left':   return ctx.rollsLeft === f.eq;                             // strict: absent (undefined) never equals eq
    case 'fang': {                                                                  // a kept fang, optionally (not) load-bearing
      const keptOk = f.kept        == null || (!!(ctx.fangsKept > 0)  === f.kept);
      const lbOk   = f.loadBearing == null || (!!ctx.fangLoadBearing === f.loadBearing);
      return keptOk && lbOk;
    }
    case 'purity':       return !!ctx.keptPure;                                     // every kept STAT face shares one colour
    default:             return false;   // out-of-vocab never holds (validateWitness guards authoring)
  }
}

// ---- the score half of a payload (worth). Non-score payloads return 0 here. ----
function payloadScore(p, ctx, stacks) {
  switch (p.kind) {
    case 'flat':   return p.n * stacks;
    case 'perPip': return p.n * (ctx.depthPips || 0) * stacks;
    case 'per':
      if (p.per === 'symbol')     return p.n * (ctx.distinctSymbols || 0) * stacks;
      if (p.per === 'ingredient') return p.n * (ctx.ingredientCount || 0) * stacks;
      if (p.per === 'cursedSeg')  return p.n * (ctx.cursedSegments || 0) * stacks;
      if (p.per === 'colourPip')  return p.n * (ctx.colourPips || 0) * stacks;
      return 0;
    default:       return 0;   // reach/tempo/drawWidth/ink/cleanse/mult are EFFECTS, not score
  }
}
const EFFECT_PAYLOADS = new Set(['reach', 'tempo', 'drawWidth', 'ink', 'cleanse', 'mult']);

// ---- scoreWitnesses — the pure entry point ----
export function scoreWitnesses(witnesses, event, ctx = {}) {
  let delta = 0, fired = 0;
  const effects = [];
  const firedIds = [];
  const hits = [];
  if (!Array.isArray(witnesses)) return { delta, effects, fired, firedIds, hits };
  for (const w of witnesses) {
    if (!w || w.event !== event) continue;              // trigger must match this moment
    if (!filterHolds(w.filter, ctx)) continue;          // filter gate (frozen context)
    fired += 1; firedIds.push(w.id);
    // 'growing' scores base × (prior fires + 1). The caller maintains ctx.growStacks[id]
    // (the count of PRIOR fires) and increments it for each id in firedIds after this call,
    // so this stays pure and id is used ONLY to look up caller state (never to branch — L1).
    const stacks = w.scaling === 'growing' ? (((ctx.growStacks && ctx.growStacks[w.id]) || 0) + 1) : 1;
    const p = w.payload || { kind: 'flat', n: 0 };
    const d = payloadScore(p, ctx, stacks);
    delta += d;
    hits.push({ id: w.id, delta: d, kind: p.kind });    // the per-witness breakdown (loud firing + per-id tallies)
    if (EFFECT_PAYLOADS.has(p.kind)) {
      effects.push({ kind: p.kind, n: p.n, x: p.x, charges: p.charges, source: w.id });
    }
  }
  return { delta, effects, fired, firedIds, hits };
}
