// =============================================================================
// REGISTRY FIELDS — the stack-wide axis + rarity vocabulary (Modifier Stack §10/§13)
// -----------------------------------------------------------------------------
// Two data-only fields every Modifier-Stack registry entry gains:
//   axis    — what KIND of power it is (reach/worth/tempo/debt). The cost-aware
//             generator keys on this (§1); reach/tempo must be priced, worth is free.
//   rarity  — an ACCESS tier (common/uncommon/rare/mythic), NEVER a power stat
//             (§10 invariant). The Reward Ladder keys on this (draw weights).
// Both are closed vocabularies, engine-readable per Law L1: the engine reads the
// FIELD, it never branches on an id. (Same contract as symbols.js's boolean flags.)
//
// deriveRarity() computes rarity FROM the grammar (§10 checklist) so an author
// cannot inflate it; lintRarity() asserts declared === derived (whitelisted
// exceptions). The step weights mirror balance.js NUMBERS.rarityDerivation — kept
// in prose sync (this is the reference implementation; NUMBERS is the visibility
// mirror, same posture as the // PARITY block).
//
// STATUS: pure data + pure functions. Nothing on the live path imports this yet —
// adding it is behaviour-neutral (Phase-A registry scaffolding).
// =============================================================================

export const AXES     = Object.freeze(['reach', 'worth', 'tempo', 'debt']);
export const RARITIES = Object.freeze(['common', 'uncommon', 'rare', 'mythic']);

export const isAxis   = a => AXES.includes(a);
export const isRarity = r => RARITIES.includes(r);

// deriveRarity(features) — the §10 step-up checklist as a pure function over a
// NORMALIZED feature descriptor. Each registry supplies its own extractor (so
// heterogeneous pool shapes — a witness's `scaling`/`filter`, an enchantment's
// `condition`/`scope` — don't mis-derive; Integration Plan §7a). Fields:
//   { scaling, chosen, conditioned, cleanReach, mult, named, conditionedReach }
// Steps (each +1): growing|consuming scaling · chosen scope · carries a condition ·
//   clean reach/tempo (reach axis, no rider). Cap at mythic.
// mythic (hard cap): a mult payload · a named face · conditioned reach.
export function deriveRarity(f = {}) {
  if (f.mult || f.named || f.conditionedReach) return 'mythic';
  let step = 0;
  if (f.scaling === 'growing' || f.scaling === 'consuming') step += 1;
  if (f.chosen)      step += 1;
  if (f.conditioned) step += 1;
  if (f.cleanReach)  step += 1;
  return RARITIES[Math.min(step, RARITIES.length - 1)];
}

// lintRarity(entries, featuresOf, whitelist) — declared must equal derived.
// featuresOf(entry) is the registry's extractor; whitelist is the set of ids
// allowed to diverge (hand-tuned exceptions, §10). Returns
// { ok, problems:[{ id, declared, derived }] }. This is an `npm test` schema gate,
// NOT the golden behavioural digest (Integration Plan §7a).
export function lintRarity(entries, featuresOf, whitelist = new Set()) {
  const has = whitelist && typeof whitelist.has === 'function' ? id => whitelist.has(id) : () => false;
  const problems = [];
  for (const e of entries) {
    if (has(e.id)) continue;
    const derived = deriveRarity(featuresOf(e));
    if (e.rarity !== derived) problems.push({ id: e.id, declared: e.rarity, derived });
  }
  return { ok: problems.length === 0, problems };
}
