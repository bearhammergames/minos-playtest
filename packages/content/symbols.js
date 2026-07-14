// =============================================================================
// SYMBOL REGISTRY — SpellSpun
// -----------------------------------------------------------------------------
// The engine NEVER branches on a symbol's name/id. It reads ONLY these flags.
// To add a symbol (colour, ingredient, or anything) append an entry here.
//
//   satisfiesRecipe : can it count toward a recipe rung? (colours + ingredients)
//   isColour        : does it define a rung's IDENTITY and feed blooms? (B / M / S)
//   isIngredient    : a recipe filler that is NOT a colour (charm cheap, mana gate)
//   isMana          : the rare gating ingredient (generator allows it only at True/Bloom)
//   isWild          : the joker — a kept Fang promotes to a wild '__wild__' at resolve
//   glyph / color   : UI only.
//
// CONTRACT: adding a recipe-satisfying symbol must require editing ONLY this file.
// =============================================================================

export const SYMBOLS = {
  // --- The three COLOURS: they define a rung's identity and feed blooms. ---
  body:   { id:'body',   label:'Body',   glyph:'ᛒ', color:'#c46e6e',
            satisfiesRecipe:true, isColour:true },
  mind:   { id:'mind',   label:'Mind',   glyph:'ᛗ', color:'#6ea8c4',
            satisfiesRecipe:true, isColour:true },
  spirit: { id:'spirit', label:'Spirit', glyph:'ᛯ', color:'#c4b16e',
            satisfiesRecipe:true, isColour:true },

  // --- INGREDIENTS: count toward recipes, but are never a colour, never a bloom. ---
  charm:  { id:'charm',  label:'Charm',  glyph:'ᛟ', color:'#6ec48c',
            satisfiesRecipe:true, isIngredient:true },                  // cheap filler — the difficulty smoother
  mana:   { id:'mana',   label:'Mana',   glyph:'ᛥ', color:'#8c6ec4',
            satisfiesRecipe:true, isIngredient:true, isMana:true },     // rare gate — generator allows it only at True/Bloom

  // --- THE WILD: inert until a kept fang is promoted to '__wild__' at resolve. ---
  fang:   { id:'fang',   label:'Fang',   glyph:'ᚨ', color:'#b03a3a',
            satisfiesRecipe:false, isWild:true },

  // --- BLANK: the absence. Dead space. Referenced widely; not a real ingredient. ---
  blank:  { id:'blank',  label:'—',      glyph:'·', color:'#3a3a3a',
            satisfiesRecipe:false },
};

// Convenience views the engine/generator/UI use (all derived from flags, never hardcoded):
export const STAT_IDS       = Object.values(SYMBOLS).filter(s => s.satisfiesRecipe).map(s => s.id); // colours + ingredients
export const COLOUR_IDS     = Object.values(SYMBOLS).filter(s => s.isColour).map(s => s.id);
export const INGREDIENT_IDS = Object.values(SYMBOLS).filter(s => s.isIngredient).map(s => s.id);
export const MANA_IDS       = Object.values(SYMBOLS).filter(s => s.isMana).map(s => s.id);

export function sym(id) { return SYMBOLS[id] || SYMBOLS.blank; }
