// =============================================================================
// RELIC REGISTRY
// =============================================================================

export const RELICS = {
  // --- v5F THE REROLL FAMILY & THE DARK SHELF ---------------------------------
  // Rerolls are agency and compounding luck; they come in early (youth slot-2
  // guarantee). The dark shelf is fang-fed under SHAPE A: a fang spent on a
  // relic STILL banks its pact — the relief is local, the bill is global.
  // Dark relics never write costs onto the player's sheet; they charge the meter
  // that charges the world.
  splinter:       { id:'splinter',       label:'The Splinter',     trigger:'midroll', cost:{}, charges:'perPilgrim',
                    kind:'sacrificeReroll', params:{} },
  last_light:     { id:'last_light',     label:'Last Light',       trigger:'midroll', cost:{}, charges:'perPilgrim',
                    kind:'hailMary', params:{} },
  carrion_shield: { id:'carrion_shield', label:'Carrion Shield',   trigger:'reckon',  cost:{}, charges:'perPilgrim',
                    kind:'tollShield', params:{ reduce:1 } },
  red_tithe:      { id:'red_tithe',      label:'The Red Tithe',    trigger:'passive', cost:{},
                    kind:'sinPays', params:{ goldPerFang:1 } },
  // v5H THE CONVERSION FAMILY — fuel is scarce by census (one mana face in
  // eighteen); the chains players liked are first-class. Law: no relic may
  // cost more fuel than one conversion can produce.
  fat_purse:      { id:'fat_purse',      label:'Fat of the Purse', trigger:'midroll', cost:{}, charges:'perPilgrim',
                    kind:'convertFuel', params:{ from:'charm', fuel:1, uses:2 } },
  black_tallow:   { id:'black_tallow',   label:'Black Tallow',     trigger:'midroll', cost:{}, charges:'perPilgrim',
                    kind:'convertFuel', params:{ from:'fang', fuel:2, pact:1 } },

  // PHASE 7 — removed 5 vestigial entries (transmute_sm, transmute_bs, wildcard, echo_roll,
  // anointing): they had NO live play handler and were absent from play.js SHOP_RELICS (dead
  // registry-vs-live drift). Their intent survives in the enchantment grammar — convert (the
  // transmutes), wildToNeed (hollow, live), deepen (anointing≈Whetstone twin) — to be authored
  // as migrated face-enchantments, not relics.

  // --- v3 TRIAL MID-ROLL TRANSFORMERS -----------------------------------------
  // The agency pass adds decisions INSIDE the gamble. Each is one clean rule that
  // changes what a roll can BECOME, never what you permanently have (transformer,
  // not accumulator — System_Var's relic law). All are run-acquired and modelled
  // as policy-evaluable so the bench can still produce a survival spread + Pareto.
  //
  // v4 REPRICING (Relics_v1): the trial relics were free because mana was
  // uncontested when they were built. Kindling clauses, Ember-Veined, and The
  // Cloying now contest mana — so the costs become real without touching a
  // single effect. cost.mana is paid from the FUEL KEPT THIS ENCOUNTER.
  //
  // 1) Carver — convert ONE kept off-symbol stat face into the symbol the recipe
  //    is short on (any-stat -> needed-stat). The purest decisions-per-roll add:
  //    every roll gains a "salvage this die or reroll it?" fork. Per-pilgrim charge.
  carver:   { id:'carver',   label:'Bone Carver',    trigger:'resolution', cost:{ mana:1 }, charges:'perPilgrim',
              kind:'convertToNeed', params:{ amount:1 } },
  // 2) Hollow Token (run) — let ONE blank face count as the needed symbol this
  //    resolution. Couples to the thesis: in old age (faces blanking) it claws
  //    value the CLEAN way — a legitimate alternative to draining a pilgrim.
  //    WATCH: may compete with the pact (see the clean_wild policy isolation).
  hollow:   { id:'hollow',   label:'Hollow Token',   trigger:'resolution', cost:{ mana:1 }, charges:'perRun', runUses:3,
              kind:'wildToNeed', params:{ count:1 } },
  // 3) Echo — reroll ONE die without spending a roll. "Push one more on just this
  //    die" without risking the whole hand. Modelled as a one-rung reach nudge.
  echo:     { id:'echo',     label:'Echo of the Hunt', trigger:'midroll', cost:{ mana:1 }, charges:'perPilgrim',
              kind:'oneDieReroll', params:{} },

  // --- THE RELICS_v1 SET (SavageLight_Relics_v1.md) -----------------------------
  // The law: relics rescue PLANS; the pact rescues LIFE. Each of these counters
  // a constraint, enables a shape, or converts a surplus — none bails out a
  // failing resolution (that territory belongs to the pact, and to the watched
  // Hollow Token).
  //
  // THE OPEN PALM — the undo verb. Once per pilgrim, release one kept face back
  // to the rolling pool. Counters: Cloying's forced keep, Brimming / precision
  // overflow, hedge-keep regret. Free — the charge is the cost.
  open_palm: { id:'open_palm', label:'The Open Palm', trigger:'midroll', cost:{}, charges:'perPilgrim',
               kind:'releaseKept', params:{ count:1 } },
  // THE UNMOVED BONE — curse armor, SCOPED to roll-phase interference only
  // (Fever-Flesh's reroll, a trap's lockDie). Does NOT touch keep caps, forced
  // keeps, or resolution curses — blanket immunity would defuse the curse layer.
  // Activation costs 1 mana for the encounter.
  unmoved_bone: { id:'unmoved_bone', label:'The Unmoved Bone', trigger:'encounter', cost:{ mana:1 }, charges:'perPilgrim',
                  kind:'steadyDice', params:{} },
  // THE TALLOW-RENDER — surplus into fuel. At resolution, before the rite
  // measures, burn excess kept serve faces; each yields 1 mana of fuel. The hub
  // of the mana economy: dumps what Precision forbids, feeds Kindling, and is
  // the clean answer to Ember-Veined (rendered fuel is LEDGER mana, not a kept
  // face — the Render fires before the burn counts).
  tallow_render: { id:'tallow_render', label:'The Tallow-Render', trigger:'resolution', cost:{}, charges:'perPilgrim',
                   kind:'renderKept', params:{ yield:1 } },

  // --- UNGATED in v5: magnitude is live (the §4.1 scoring flip) ------------------
  // THE WHETSTONE — +1 mag to one kept face at resolution. The finishing stone
  // for concentration rungs; one face, one pip, expensive.
  whetstone_true: { id:'whetstone_true', label:'The Whetstone', trigger:'resolution', cost:{ mana:2 }, charges:'perPilgrim',
                    kind:'boostKeptMag', params:{ amount:1 } },
  // THE AUGUR'S MARK — name a stat before a throw; 2+ landing gain +1 mag this
  // encounter. The called shot. Bench model is naive (marks the hand's richest
  // stat on the first throw); the playable carries the real bet.
  augur_mark:     { id:'augur_mark', label:"The Augur's Mark", trigger:'preThrow', cost:{ mana:1 }, charges:'perPilgrim',
                    kind:'calledShot', params:{ threshold:2, boost:1 } },

  // --- PASSIVE ECONOMY / PACT RELICS --------------------------------------------
  // These two were fully wired into BOTH surfaces (play.js + runsim) and bought by
  // sim policies (builder→Coin-Tongue, addict→Carrion-Gift), but were MISSING from
  // this registry — so relic('Coin-Tongue') returned undefined and the registry
  // disagreed with the live game. Registered here for consistency. They are passive
  // (checked inline like red_tithe, never dispatched through applyRelic), so the
  // `kind` is descriptive only. NOTE the legacy Capitalized-Hyphen ids: every
  // reference in the codebase uses these exact strings (play.js:125/856/983,
  // runloop.js:202/215/235, runpolicies.js:185/227), so they are kept verbatim —
  // canonicalizing to snake_case is a Phase-7 (relic migration) cleanup.
  // PHASE 7 — id-casing reconciled to snake_case (was 'Coin-Tongue'/'Carrion-Gift'); renamed
  // in lockstep across play.js / runloop.js / runpolicies.js. Behavior-neutral (the golden
  // digest captures stats, not id strings) — proven by REGRESSION OK. Labels keep their prose.
  'coin_tongue':  { id:'coin_tongue',  label:'The Coin-Tongue',  trigger:'passive', cost:{}, charges:'perPilgrim',
                    kind:'charmGoldMult', params:{ mult:2 } },        // doubles gold per banked charm
  'carrion_gift': { id:'carrion_gift', label:'The Carrion-Gift', trigger:'passive', cost:{}, charges:'perPilgrim',
                    kind:'pactBoon', params:{ pactThreshold:2, kickback:1 } }, // pact fuels at 2 fangs, +1 kickback
};

export function relic(id) { return RELICS[id]; }
