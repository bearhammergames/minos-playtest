import { ENCHANTMENTS } from './enchantments.js';   // Phase 7: forge-acquirable enchanted faces

// =============================================================================
// PHASE 7 — FORGE ENCHANTED FACES (the dusk-forge / shop offering of migrated relics
// as fished faces). === DESIGNER SURFACE: redesign these freely. ===  Each is a face
// (symbol/mag) carrying a composed enchantment from registry/enchantments.js. The forge
// offers one per visit when FLAGS.enchantments is ON (gated → OFF shop is byte-identical);
// buying places it on a die of your choosing (appendFace carries the ench, Phase 6). The
// symbols/mags/costs below are PLACEHOLDERS — pick what the redesign wants. NOTE: only the
// wired moments fire today (on_wound, on_resolve) — Renderer's Mark renders to fuel; the
// rest place intact but stay inert until their moment/applier is wired (on_keep release,
// chosen-scope convert/deepen) to match the redesign.
export const FORGE_ENCHANTED_FACES = [
  { id:'renderers_mark', label:"Renderer's Mark", symbol:'spirit', mag:1, cost:4, ench:[ ENCHANTMENTS.renderers_mark ] },
  { id:'the_open_hand',  label:'The Open Hand',   symbol:'charm',  mag:1, cost:3, ench:[ ENCHANTMENTS.open_hand ] },
  { id:'bone_carver',    label:'Bone Carver',     symbol:'body',   mag:1, cost:4, ench:[ ENCHANTMENTS.bone_carver ] },
  { id:'the_whetstone',  label:'The Whetstone',   symbol:'mind',   mag:1, cost:4, ench:[ ENCHANTMENTS.the_whetstone ] },
  // PHASE 7 reroll family (designer renames). `jostle` (adjacent) is the first WIRED reroll
  // face: banking it OFFERS an explicit re-throw of its seating-row neighbours (never auto-fired).
  { id:'jostle',         label:'The Jostle',      symbol:'body',   mag:1, cost:3, ench:[ ENCHANTMENTS.jostle ] },
  { id:'second_wind',    label:'Second Wind',     symbol:'spirit', mag:1, cost:3, ench:[ ENCHANTMENTS.second_wind ] },
  { id:'loaded_die',     label:'The Loaded Die',  symbol:'mind',   mag:1, cost:4, ench:[ ENCHANTMENTS.loaded_die ] },
];

// =============================================================================
// NAMED FACES (Progression_v1) — the miracle gifts. The authoring law:
// character comes from NAME + MAGNITUDE + PROVENANCE, and at most one twist
// drawn from vocabulary the engine already has (wild, OR — Phase 6 — a face
// ENCHANTMENT from the closed grammar in registry/enchantments.js). If a face
// needs a NEW rule (not in that grammar), it's a relic wearing a face's clothes.
// face = { id, label, symbol, mag, wild?, ench? } ; provenance (from) is stamped
// at grant time with the pilgrim's identity.
// =============================================================================
export const NAMED_FACES = {
  spirit: [
    { id:'marens_ember',  label:"Maren's Ember",          symbol:'spirit', mag:2 },
    { id:'lantern_wick',  label:'The Lantern-Wick',       symbol:'spirit', mag:2 },
  ],
  body: [
    { id:'drovers_knuckle', label:"The Drover's Knuckle", symbol:'body', mag:2 },
    { id:'yoke_scar',       label:'The Yoke-Scar',        symbol:'body', mag:2 },
  ],
  mind: [
    { id:'widows_eye',    label:"Widow's Eye",            symbol:'mind', mag:2 },
    { id:'cartographers_doubt', label:"The Cartographer's Doubt", symbol:'mind', mag:2 },
  ],
  charm: [ { id:'the_dowry',     label:'The Dowry',       symbol:'charm', mag:2 } ],
  mana:  [ { id:'pilgrims_coal', label:"Pilgrim's Coal",  symbol:'mana',  mag:2 } ],
  rare:  [ { id:'moon_tooth',    label:'The Moon-Tooth',  symbol:'__wild__', mag:1, wild:true } ],
};
// The face the pact leaves behind — not a gift. Stamped onto one restored face
// when a pilgrim is drained: sin, visible in the hand, banking pact-charge faster.
export const THE_GRUDGE = { id:'the_grudge', label:'the Grudge', symbol:'fang', mag:2 };

// PHASE 6 — the SEAL's reward: the richest gift in the game, a named ENCHANTED face
// (Face Enchantments §9 "The Last Gift"). Granted ONLY by a met Seal — it is NOT in the
// random gift pools above, so it can never enter a hand except through the deepest reach.
// Its enchantment `on_wound -> deepen adjacent` is a dying face passing its strength down
// the seating row to its neighbor. The grant stamps `symbol` to the rite's serve-stat so
// the Coal is a useful deep face for that lineage (§6 default: spirit ✦2).
export const FEVERED_COAL = {
  id:'fevered_coal', label:'the Fevered Coal', symbol:'spirit', mag:2,
  ench:[{ id:'last_gift', trigger:'on_wound', condition:null, scope:'adjacent',
          effect:'deepen', polarity:'boon', forced:true, lifetime:'permanent', params:{ pips:1 } }],
};
