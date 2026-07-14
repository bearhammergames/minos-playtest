// =============================================================================
// CURSE REGISTRY
// -----------------------------------------------------------------------------
// THE LAW (Curses_v1): a curse is a rule of the RITUAL, never a tax on the
// result. The test for every entry: does it alter at least one keep/reroll
// fork per roll? Flat stat multipliers (scaleSymbol) are legacy and deprecated
// for new pilgrims — read once, played around never.
//
// EFFECT KINDS:
//   scaleSymbol   { symbolId, factor }   static multiplier (LEGACY — deprecated)
//   blanksCount   { factor }             rolled blanks subtract value
//   lockDice      { count }              N dice frozen at first roll
//   noCurse       {}                     null
//   triggerTrap   { rules:[...] }        reverse-relic. Conditional triggers that
//                                        fire DURING the roll loop, fire-once each.
//
// v4 RITUAL KINDS (the Curses_v1 set — each bends a verb of the roll):
//   keepCap        { count }                    keep at most N dice per roll
//   forcedKeep     { symbol }                   rolled faces of symbol lock into
//                                               the kept row; the die leaves the
//                                               pool (the old-age-preview curse)
//   rerollOnRoll   { symbol, count }            first N faces of symbol per throw
//                                               are immediately rerolled once
//   rollLimit      { rolls }                    fewer rolls this encounter
//   resolutionBurn { fromKept, drains, per }    each kept face of fromKept drains
//                                               `per` faces of `drains` at resolution
//   overflowBurn   { per }                      kept pips above the satisfied rung
//                                               spill back as drain
//
// v6B THE LEGACY SET (Conditions_Reference_v1 — six new curses; each bends a verb):
//   lockFirstKeeps { count }                    the FAMISHED — first N stat faces
//                                               kept each throw lock (no reroll/
//                                               release). bends `keep`.
//   rotHeld        { tier }                     the SOURING — a face kept across
//                                               >1 roll rots a pip at resolve.
//                                               tier 'wilting' = deep faces only;
//                                               'rotting' = any face. bends `keep`+`resolve`.
//   freeReroll     { fangPer }                  the OPEN VEIN — one free reroll per
//                                               throw (no roll spent); each banks
//                                               `fangPer` fang to pact. bends `reroll`.
//   tithe          { goldPerPip }               the TITHE — at resolve, 1 gold per
//                                               stat-pip above the partial rung.
//                                               bends `economy`. [WATCH — see GDD §6.5]
//   mirror         {}                            the MIRROR — at resolve, highest
//                                               kept stat-pip counts double, lowest
//                                               kept stat face counts zero. bends
//                                               `resolve`. [WATCH — see GDD §6.5]
//   uncapToll      { tier }                      the HOLLOW HOUR — the Fates' Portion
//                                               cap is suspended. tier 'dimming' =
//                                               this rite; 'long_dark' = whole night
//                                               (nightmare). bends `toll`. GATED:
//                                               never youth; rare.
//
// A trap rule:
//   { when:   { symbol, count, basis },   basis = 'kept' | 'rolled'
//     then:   { effect, ... } }
//   basis 'kept'   : counts magnitude of that symbol among KEPT faces (legible;
//                    player chooses whether to bank the triggering face).
//   basis 'rolled' : counts magnitude rolled THIS throw (pure hazard, less choice).
//   Each rule fires at most ONCE per attempt (at the crossing).
//
//   Effects (verb set, handled in engine.js applyTrapEffect):
//     loseReroll  {}                     reduce remaining rolls by 1
//     lockDie     { which:'random'|'best' } pin a still-rerollable die in place
//     blankKept   { symbol?, count }     remove `count` kept faces (of `symbol` if given)
// =============================================================================

export const CURSES = {
  none:        { id:'none',        label:'(no curse)',          kind:'noCurse',     params:{} },
  dull_mind:   { id:'dull_mind',   label:'Dulls the Mind',      kind:'scaleSymbol', params:{ symbolId:'mind',   factor:0.5 } },
  weak_body:   { id:'weak_body',   label:'Saps the Body',       kind:'scaleSymbol', params:{ symbolId:'body',   factor:0.5 } },
  cold_spirit: { id:'cold_spirit', label:'Chills the Spirit',   kind:'scaleSymbol', params:{ symbolId:'spirit', factor:0.5 } },
  suspicion:   { id:'suspicion',   label:'Wreathed in Suspicion', kind:'blanksCount', params:{ factor:1 } },
  binding:     { id:'binding',     label:'Binding Presence',    kind:'lockDice',    params:{ count:1 } },

  // --- TRAP CURSES (reverse-relics) ---------------------------------------------
  greedy_flesh: {
    id:'greedy_flesh', label:'Greedy Flesh',
    desc:'The 3rd Body you keep costs a re-roll.',
    kind:'triggerTrap',
    params:{ rules:[ { when:{ symbol:'body', count:3, basis:'kept' }, then:{ effect:'loseReroll' } } ] }
  },
  hungry_ether: {
    id:'hungry_ether', label:'Hungry Ether',
    desc:'Roll 3 Mana in one throw and a die is locked.',
    kind:'triggerTrap',
    params:{ rules:[ { when:{ symbol:'mana', count:3, basis:'rolled' }, then:{ effect:'lockDie', which:'random' } } ] }
  },
  jealous_spirit: {
    id:'jealous_spirit', label:'Jealous Spirit',
    desc:'The 3rd Spirit you keep blanks a kept Mind.',
    kind:'triggerTrap',
    params:{ rules:[ { when:{ symbol:'spirit', count:3, basis:'kept' }, then:{ effect:'blankKept', symbol:'mind', count:1 } } ] }
  },
  twin_snare: {
    id:'twin_snare', label:'Twin Snare',
    desc:'2 kept Body locks a die; 4 kept Body costs a re-roll.',
    kind:'triggerTrap',
    params:{ rules:[
      { when:{ symbol:'body', count:2, basis:'kept' }, then:{ effect:'lockDie', which:'random' } },
      { when:{ symbol:'body', count:4, basis:'kept' }, then:{ effect:'loseReroll' } }
    ] }
  },

  // --- THE CURSES_v1 SET (ritual curses — see SavageLight_Curses_v1.md) --------
  grasping: {
    id:'grasping', label:'The Grasping',
    desc:'Her hands will not open. Keep at most 2 dice per roll.',
    kind:'keepCap', params:{ count:2 }
  },
  cloying: {
    id:'cloying', label:'The Cloying',
    desc:'She is soaked in raw ether. Rolled Mana locks itself among your kept faces.',
    kind:'forcedKeep', params:{ symbol:'mana' }
  },
  fever_flesh: {
    id:'fever_flesh', label:'Fever-Flesh',
    desc:'The flesh will not settle. The first Body in each throw shudders and rerolls.',
    kind:'rerollOnRoll', params:{ symbol:'body', count:1 }
  },
  fleeting: {
    id:'fleeting', label:'The Fleeting',
    desc:'She is going quickly. Two rolls, not three.',
    kind:'rollLimit', params:{ rolls:2 }
  },
  ember_veined: {
    id:'ember_veined', label:'Ember-Veined',
    desc:'Her veins run with fire. Each kept Mana sears one Body from your hand.',
    kind:'resolutionBurn', params:{ fromKept:'mana', drains:'body', per:1 }
  },
  brimming: {
    id:'brimming', label:'The Brimming',
    desc:'She cannot hold more than she asked. What spills, scalds.',
    // RARE SLOT — precision rungs won the home for this muscle (RungGrammar_v1).
    // Cut entirely if exact-rungs land in playtest.
    kind:'overflowBurn', params:{ per:1 }
  },

  // --- THE LEGACY SET (Conditions_Reference_v1) -------------------------------
  // Six new curses. Each bends a verb (the §0 law); none is a flat tax. Two of
  // them (tithe, mirror) ship on a WATCH flag (GDD §6.5) — kept for breadth so
  // novelty-fatigue testing has content, each carrying its convicting test.
  famished: {
    id:'famished', label:'The Famished',
    desc:'She is hungry, and takes what you offer first. The first two stat faces you keep each throw are seized — locked, unrerollable.',
    kind:'lockFirstKeeps', params:{ count:2 }
  },
  souring: {
    id:'souring', label:'The Souring',
    desc:'What you hold too long goes bad in your hand. A face kept across more than one roll rots a pip at the resolve.',
    // tier rides the age curve (free-intensity lever 1): 'wilting' (gentle, youth/
    // middle) rots deep faces only; 'rotting' (severe, old) rots any held face.
    kind:'rotHeld', params:{ tier:'wilting' }
  },
  open_vein: {
    id:'open_vein', label:'The Open Vein',
    desc:'A generous curse, which is the worst kind. Each throw grants a free reroll — but each one feeds a fang to the pact.',
    kind:'freeReroll', params:{ fangPer:1 }
  },
  tithe: {
    id:'tithe', label:'The Tithe',
    desc:'She will not be over-served for free. For every pip of stat above her floor, the rite takes a coin from your purse.',
    // WATCH (GDD §6.5): convicting test — does it ever change a keep/route
    // decision, or only the gold tally? If only the tally, rework to economy-
    // routing or cut. Shipped for breadth; economy-dependent (GDD §11).
    kind:'tithe', params:{ goldPerPip:1 }
  },
  mirror: {
    id:'mirror', label:'The Mirror',
    desc:'She sees you crooked. Your tallest kept face counts double; your smallest counts for nothing at all.',
    // WATCH (GDD §6.5): convicting test — is there a hand where Mirror changes a
    // keep decision that a Concentration rung wouldn\u2019t? If not, cut as redundant.
    kind:'mirror', params:{}
  },
  hollow_hour: {
    id:'hollow_hour', label:'The Hollow Hour',
    desc:'In her hour the Fates\u2019 mercy fails. Fall short and the toll takes its whole due, wounded or whole, nothing held back.',
    // GATED (Conditions §1.6): never youth; rare; toll-bending is unique to this
    // curse. tier 'dimming' (this rite) / 'long_dark' (whole night — nightmare).
    kind:'uncapToll', params:{ tier:'dimming' }
  },
};

// The assignable ritual set (legacy scaleSymbol curses excluded by design).
// v6B: the six legacy curses join. hollow_hour is NOT in the general bag — it is
// gated (old-age only, rare) and assigned by a dedicated path in the generator
// (see assignCurse / the nightmare gate). tithe & mirror ride a WATCH flag but
// are assignable so playtest can measure them.
export const RITUAL_CURSE_IDS = ['grasping','cloying','fever_flesh','fleeting','ember_veined','brimming',
  'famished','souring','open_vein','tithe','mirror'];

// Curses gated out of the general assignment bag (special placement only).
export const GATED_CURSE_IDS = ['hollow_hour'];

// Curses that carry an age-scaled intensity tier (free-intensity lever 1).
// The generator swaps the tier param by phase; youth never sees the severe tier.
export const TIERED_CURSES = {
  souring:     { gentle:'wilting',  severe:'rotting'   },
  hollow_hour: { gentle:'dimming',  severe:'long_dark' },
};

export function curse(id) { return CURSES[id] || CURSES.none; }

// Return a curse definition with its tier param resolved for a phase. Youth and
// middle get the gentle tier; old age may get the severe tier. Non-tiered curses
// pass through unchanged. (The generator calls this so the same curse id matures
// as the hand ages — the curse itself is the same friend, grown crueler.)
export function curseForPhase(id, phaseName, severe = false) {
  const base = curse(id);
  const tiers = TIERED_CURSES[id];
  if (!tiers) return base;
  const tier = (severe && phaseName === 'old') ? tiers.severe : tiers.gentle;
  return { ...base, params: { ...base.params, tier } };
}

