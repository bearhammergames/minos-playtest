// =============================================================================
// BALANCE — the single designer-facing setup file for progression systems.
// -----------------------------------------------------------------------------
// Sibling to flags.js (same Phase-0 posture: fully commented, behaviour-neutral,
// nothing imports it yet). flags.js owns the ENGINEERING toggles — a whole
// subsystem exists or does not (seating / enchantments / afflictions / stages /
// faceDebuffs). balance.js owns the DESIGN toggles: which Modifier-Stack v1
// systems are live, their granular per-feature sub-switches, and the tunable
// NUMBERS a designer wants to sweep — all in ONE place a designer can read.
//
// This is the "quick route balance setup file to quickly and granularly enable/
// disable different progression systems" the ToDo asks for (Minos-ToDo.md).
//
// WHY A SIBLING, NOT A FOLD-IN INTO flags.js:
//   flags.js promises "turning one ON must be the ONLY thing that changes
//   behavior," and each of its five flags maps 1:1 to one built-or-near-built
//   ENGINEERING subsystem. The systems below are DESIGN surfaces — mostly
//   unbuilt, each carrying sub-toggles AND tunable numbers. Folding them in would
//   (a) break flags.js's clean 1-flag-1-subsystem read and (b) bury designer
//   tuning under engineering flags. Two files, two audiences, two questions:
//     flag(name)  answers "does this subsystem EXIST?"          (engineering)
//     on(path)    answers "is this balance system LIVE, and how granularly?" (design)
//   If they ever merge, merge INTO balance.js and keep flag() a thin alias — do
//   NOT scatter tuning back into flags.js.
//
// THE CONTRACT (inherited from flags.js, tightened for numbers):
//   1. THE STACK IS NATIVE (2026-07-05; extended by ModifierList v2, 2026-07-09): the
//      BUILT systems — witnesses, reward ladder, wishes (all three species), tempo
//      pricing, debt (erode/shift/cleanse), the vocab waves, experiments (+ the face-
//      enchantment resolver in flags.js) — default ON. The modifier stack IS the game now. UNBUILT
//      (relics; vocab render/inscribe) and UNTUNED-or-WATCH
//      (snapBandController, chainLoyaltyBump) stay OFF. Flip any master to false to
//      isolate/A-B it (or trim per-run via §C0). Every system still carries an
//      `enabled` master; sub-toggles are read ONLY when their master is on.
//   2. GATE-FIRST, RNG-SECOND. A consumer reads its toggle BEFORE drawing any
//      rng() (the debuffs.js:71 idiom: `if (!on(...)) return;` ABOVE the first
//      rng()). An OFF system must consume ZERO randomness, or it desyncs every
//      downstream seed and a same-seed replay diverges even though the feature did
//      nothing. This is the single most important rule in the file.
//   3. BALANCE holds ONLY booleans; NUMBERS holds every tunable value. This keeps
//      on() total over booleans (a number can never masquerade as a live gate).
//   4. NUMBERS.* is the designer's tuning surface, but entries tagged // PARITY
//      are ALSO the live source in spellspun.js / generator.js and, for two of
//      them (DIFF_BASE / DEPTH_BONUS), hand-copied into packages/agent/session.mjs
//      — the single transport source of truth now that the Monte-Carlo sim is
//      retired (packages/sim/spellspun_sim.mjs is frozen, no longer a co-source).
//      This file does NOT own them yet — it MIRRORS them for one-place visibility.
//      Editing a // PARITY number here changes NOTHING until the §PARITY migration;
//      editing the ORIGINAL without syncing every listed site is a determinism bug
//      the parity test + agent-CLI conformance will catch.
//   5. Nothing imports this file yet. Adding it is behavior-neutral (like flags.js
//      at Phase 0). Consumers gate on it at their seams as each system is built.
// =============================================================================

// -----------------------------------------------------------------------------
// §A  SYSTEM + SUB-TOGGLES  — the granular on/off surface (all booleans; BUILT stack NATIVE/on).
// -----------------------------------------------------------------------------
// Convention: every system carries an `enabled` master. Sub-toggles are read ONLY
// when `enabled` is true — a consumer checks the master first, and on() ANDs it in
// automatically (§C). So you can say "reward ladder ON but mixedDraw OFF",
// "witnesses ON but riders OFF", "cost-aware generator ON, tempo input only", etc.
//
// A sub-toggle tagged // PRICED gates a reach/tempo-granting feature. Per
// Anti-pattern #2 (no unpriced reach — the jam's Deepen failure), it must stay OFF
// until costAwareGenerator.enabled reads that reach-power. on() cannot AND across
// SYSTEMS, so the consumer checks the generator gate too — each PRICED comment
// spells the dependency out (e.g. `on('vocab.inscribe') && on('costAwareGenerator')`).

export const BALANCE = {

  // --- §5b WITNESSES: the passive worth-scorer relic species (the Balatro layer) ---
  // A Witness = Event × [Filter] × Payload × Scaling (+ axis/rarity/slot). It fires
  // on the live event surface (commitSegment / checkBlooms / resolveKnot).
  // Registry: packages/content/witnesses.js (new, mirrors enchantments.js).
  // Scorer:   packages/engine/witness.js `scoreWitnesses` (new, pure, id-blind).
  witnesses: {
    enabled: true,           // NATIVE (on; flip false to isolate) — witness registry + on_* hooks + tally line
    // Event families — a witness fires only if BOTH the master AND its event's family is on.
    events: {
      resolve:        true,  // on_resolve / on_stop_early / on_push / on_snap (per-segment core)
      bloom:          true,  // on_bloom (the checkBlooms→recordBloom loop)
      combo:          false, // on_combo — NOT WIRED (tally-time sweep); stays off
      stitch:         true,  // on_stitch (commitSegment with opts.stitched)
      fang:           true,  // on_fang_kept / on_curse_taken (the debt witnesses)
      segmentStart:   true,  // on_segment_start (endurance witnesses)
      patronComplete: true,  // on_patron_complete (fires now — the patron beat is live)
    },
    reachPayloadsPriced: false, // PRICED — the REACH + draw-width witness payloads ship score-only (reach
                                // is inert until the snap-band controller meters it; draw-width until the
                                // ladder-width economy — Anti-pattern #2). Stays off. NOTE: the TEMPO payload
                                // is already live — it applies via costAwareGenerator.readsTempoPower (the
                                // generator prices the granted spin), so it does NOT wait on this flag.
    consumingCharges: true,     // 'consuming'/'growing' scaling (the run-long pet witnesses)
  },

  // --- §9 THE REWARD LADDER: the tier-priced perk draw --------------------------
  // Floor→ash / True→trade / Bloom→royal draw grades. Composer: drawLadder() beside
  // (never replacing) drawPerks in spellspun.js. Reads res.metTiers — already
  // computed & returned by resolveSegment, currently dead on the wire.
  rewardLadder: {
    enabled: true,           // NATIVE (on; flip false to isolate) — tier-priced draw grades
    mixedDraw: true,         // §9d — extra completed rungs add cards at their grade + widen the pick
    blemishRiders: true,     // §9b — the bane-rider on Rough-draw reach cards (bites when flag('enchantments'))
    stitchAshGrade: true,    // §9a — stitch save → Rough (ash) grade regardless of resolved tier
    pureRiders: true,        // §D3 — NATIVE: "better play buys pure ink". A rarity-scaled chance (NUMBERS.riderPure)
                             // that a ridered reach card ships PURE (blemished:false, no rider). Gate-first: OFF ⇒
                             // ZERO new rng (byte-identical to D2 HEAD — reachCard). commons (chance 0) + neverRider
                             // cards (cursed_graft) skip the roll entirely (no wasted rng). Rule-4 placeholders.
    chainLoyaltyBump: false, // §9a WATCH KNOB — OFF (grade-inflation risk, AP#8; needs the bench)
  },

  // --- §10 RARITY: the derived access stat (draw weights / unlock order / frame) --
  // Rarity governs ACCESS, never power (§10 invariant). Derivation is pure grammar
  // (deriveRarity), never per-id. Weights in NUMBERS.rarityDerivation.
  rarity: {
    enabled: true,           // NATIVE (on) — the rarity field + derivation
    deriveFromGrammar: true, // §10 rarity is COMPUTED from grammar, hand-tuned by exception
    lintDeclaredVsComputed: false, // §E content-CI lint (schema gate, not runtime) — off
  },

  // --- §L2/§5a RELICS — the transformer (reach/tempo active) species ------------
  relics: {
    enabled: false,          // master — relic acquisition + on-portrait plumbing (1-of-3 at patron beat)
    transformers: false,     // PRICED / §5a — reach-heavy actives (Open Palm / Carver / Whetstone).
                             // Stays OFF until costAwareGenerator reads relic reach-power — AP#2.
    adjacency: false,        // §3.11 PARKED substrate — slot-adjacency effects. Authored-but-inert;
                             // must stay OFF (constitution 3.11 is parked, substrate only).
  },

  // --- §6/§L3 PATRON WISHES — the boss-blind ritual-warp layer -------------------
  // A Wish = ritual-warp Kind × Intensity(stage) × Payout-coupling, patron-scoped.
  // Dispatch: packages/engine/ritual.js (new, pure, reads only `kind` — the
  // interpreter content/curses.js was always SCHEMA for but never had). NOTE: the
  // live curses are the 2-entry CURSES array in spellspun.js (roll_lock/grasping);
  // content/curses.js is DORMANT BoneDie schema — wishes build a NEW dispatch, they
  // do not "reuse" a wired one (see §PARITY note and the plan's §0 correction C1).
  wishes: {
    enabled: true,           // NATIVE (on; flip false to isolate) — wish wrapper + ritual dispatch + payout.
                             // The patron-beat scaffold is live in agent_cli; a wish rolls per patron.
    constraints: true,       // species 1 — keepCap/rollLimit/forcedKeep/rerollOnRoll all ENFORCED (surface, session.mjs)
    twists:      true,       // species 2 — NATIVE (v2 slice 3): mirror (resolve physics) / veil (hidden bloom) / freeReroll (generous). Trim per-run via 'wishes.twists'.
    jackpots:    true,       // species 3 — NATIVE (v2 slice 3): spotless / chainAlive / fangCourt — a visible score CONTRACT, its own tally line (never a hidden mult). Trim via 'wishes.jackpots'.
    payoutCoupling: true,    // §6.2 — payout coupled to what the wish made scarce (granted verb, never score)
    intensityRidesStage: false, // §6.3 — DEFERRED (stage-curve intensity not built)
  },

  // --- §L4 DEBT verbs — the credit economy's connective tissue ------------------
  // fang (loan) / forced-curse (interest) / fray (damaged credit) are ALREADY LIVE,
  // so this master gates the NEW verbs ONLY — OFF = today's behavior exactly.
  // (The BANE_POOL `band` field is pure additive DATA — authoring it is behaviour-
  // neutral by construction, so it needs no toggle; its CONSUMPTION is gated by
  // rewardLadder.blemishRiders.)
  debt: {
    enabled: true,           // NATIVE (slice 4; on) — the NEW debt verbs (fang/curse/fray stay as-is either way)
    erode: true,             // §7 — NATIVE (slice 4): the generic price verb (face −1 pip). generateBane's
                             // erode banes (dulling_spin) enter its pool ONLY under this flag (gate-first).
    shift: true,             // §D2 — NATIVE: the M-2-safe RELOCATION verb (move one bane face→face; total debt
                             // constant — you can't erase the ink, you choose where it sits). Gates the shift_bane
                             // ladder card, which fills the reach channel's COMMON slot (floor/ash draws).
    cleanse: true,           // §D2 — NATIVE: the scarce anti-debt verb (STRIP a bane). Gates scour (strip + the
                             // face erodes 1 pip, floor 1) and absolve (pure strip). Built now — was dormant (Phase E).
  },

  // --- §L0/§4 FACE-EDIT + ENCHANTMENT VOCABULARY WAVES — independent drips -------
  // Each wave is one new WORD in the existing enchantment grammar (enchantments.js).
  // The engine still reads ONLY grammar; a wave gate just controls whether that
  // grammar is OFFERED / wired. `enabled` off = the shipped reroll+lock set only;
  // on = each wave toggles independently under it.
  vocab: {
    enabled: true,           // NATIVE (slice 4; on) — the vocab-drip system (each leaf gates its ladder card)
    inscribe:            false, // PRICED / §3 — faces-as-progression (the drum gains a wedge; 1.6 LOCKED).
                                // OFF until costAwareGenerator reads face inventory — AP#2.
    wave2_convertDeepen: true,  // NATIVE (slice 4) — convert (Carver's Sigil, colour recast — no added depth).
                                // Gates the carvers_sigil ladder card; each convert card rides a bane (priced).
    wave3_releaseRender: true,  // NATIVE (slice 4) — release ONLY (Open Hand, the undo verb). render NOT wired.
                                // Gates the open_hand ladder card.
    ward:                true,  // NATIVE (slice 4) — the standing ward interceptor (Warding Sigil). Gates ward_sigil.
    expose:              true,  // NATIVE (slice 4) — the peek sigil (Augur's Sigil). Gates augurs_sigil.
    onReroll:            true,  // NATIVE (slice 4) — the on_reroll echo sigil (Echo Sigil). Gates echo_sigil.
    bargains:            true,  // NATIVE (§D3) — the BARGAIN family: compound boon+bane cards (one face, two
                                // coupled runes — a devil's bargain). Gates grinning_bargain/seers_bargain/
                                // louts_bargain. OFF ⇒ the three cards filter out gate-first (pool byte-identical
                                // to D2 HEAD). The coupled bane is neverRidered — the bane half IS the price.
    wave4_conditions:    false, // §4 W4 — adjacency/total/state conditions. CROSS-DEP: conditions make
                                // seating order matter → a consumer must ALSO check flag('seating').
    namedFaces:          false, // §3 — character faces (mag 2 + ≤1 grammar twist).
  },

  // --- §D THE COST-AWARE GENERATOR — the containment for all reach/tempo power ---
  // The system that makes clean reach safe to ship. Until ON, every PRICED toggle
  // above must stay OFF (Anti-pattern #2). Its own toggle so the harness can A/B
  // "generator reads reach-power" vs the blind generator.
  costAwareGenerator: {
    enabled: true,           // NATIVE (on) — the generator prices tempo (the snap-band stays off, below)
    readsFaceInventory: true, // §D input 1 — Σpips + face-count (already priced by the probe; informational)
    readsDepth:         true, // §D input 2 — Σdepth (already priced by the probe; informational)
    readsTempoPower:    true, // §D input 3 — prices banked spins/rerolls (the real new input)
    snapBandController: false, // §D — OFF: the P(snap) band is UNTUNED (runs run away at the placeholder;
                               // demo can hit the 400-step cap). Keep the bounded DECAY curve. #1 TUNING TARGET.
  },

  // --- §4.1 EXPERIMENTS — bench-gated trial mechanics (adopt-or-drop on the archetype bench) ---
  // Live mechanics carried as EXPERIMENTS: on by default so the bench can measure them, but the
  // constitution marks them provisional (§9 trim guide: flex). Flip a leaf off to A/B it out. Each
  // is gate-first + rng-free (drawing no randomness), so an OFF experiment is byte-neutral.
  experiments: {
    enabled: true,           // NATIVE (slice 4; on) — the experiment harness master
    chainMilestone: true,    // §4.1 [EXPERIMENT] — every 3rd consecutive chain-extend banks +1 spin,
                             // routed through tempo so the cost-aware generator re-prices it (containment for free).
  },

  // --- §D1 ⚖3.2 FACE ECONOMY — dice gain/lose faces as a progression axis --------
  // Opens the ⚖3.2 "faces-as-progression" test (docs/Minos_ThreePileAudit_v1.md). The
  // CONTAINMENT is structural: adding a face is SELF-PRICING (every other face on that
  // drum shows less often), and the cost-aware generator's reach probes roll the ACTUAL
  // hand (rollDie reads faces.length per die), so any face change auto-reprices difficulty
  // next segment — no free reach ships (AP#2/§14 clean). The base hand stays 6×d3; face
  // counts may range NUMBERS.faces.min..max (2..4). This master IS the ⚖3.2 A/B switch:
  // with `enabled` off (or every leaf off) the Reward-Ladder pool is BYTE-IDENTICAL to
  // today (the four face cards filter out of the draw gate-first, drawing zero rng).
  // Each leaf gates ONE ladder card (graft / copy-etch / excise / cursed-graft).
  faces: {
    enabled: true,           // NATIVE (D1; on; flip false to isolate/A-B) — the face-economy master
    graft:       true,       // Graft (graft_face) — push a plain colour face (self-pricing)
    copyEtch:    true,       // Twin Etch (copy_etch) — duplicate a face onto the same drum (ench copies too)
    excise:      true,       // Excise (excise_face) — true removal; the drum reshapes (remaining faces show more)
    cursedGraft: true,       // Fang Graft (cursed_graft) — push a fang wild face; NEVER ridered (the fang IS the price)
  },

  // --- §G GENERATOR v2 — the cost-aware intent-setter (docs/Minos_Generator_v2.md) ---
  // The generator re-designed as band (tension held constant) × ceiling (power pays out in
  // score) over a JOINT PROBE that suffers banes/warps EXACTLY as the player does — via the
  // shared physics KERNEL (packages/engine/kernel.js, §1.2), never a re-implemented rule. Built
  // in slices G1–G5 (§6); every leaf here is DORMANT until its slice lands, so an OFF generator2
  // is byte-identical to the legacy DECAY generator. G1 (the kernel) ships NO behavior — it is a
  // byte-identical refactor with NO flag of its own (the kernel is unconditionally the physics
  // now); this block is the SEAM the later slices flip. Every number is a Rule-4 placeholder.
  generator2: {
    enabled:    true,        // NATIVE (G2; on 2026-07-09) — the joint probe is the generator's measurement now (flip false ⇒ the legacy DECAY generator, byte-identical to G1 HEAD)
    jointProbe: true,        // §G2 NATIVE — the single rung-set evaluator (union/multi/EV in one pass, kernel-aware) + the hand-power reading + honest reach_estimates
    band:       true,        // §G3 NATIVE (2026-07-09) — the snap-band intent (ramp × stage × clamps) + asymmetric lag EMA + power→ceiling SET fit; demotes DECAY to the band-OFF legacy path (flip false ⇒ byte-identical to G2 HEAD)
    rungs:      true,        // §G4 NATIVE (2026-07-10) — dynamic rung-sets (the rungSpec contract + composer, 2-rung rest, twist kind 'rungs'). Flip false ⇒ the composer never runs, byte-identical to G3 HEAD (18ba4db). Early/patron-0 play is byte-identical either way (the intent refinement is late-patron-gated).
    apexRungs:  true,        // §G4/§3.3 NATIVE (2026-07-10) — the earned 4th-slot apex tier (colour-repeating, a distinct concentrated/pure shape + value 10). Intent-offered on a comfortable, strong, late hand; also enters via an external rungSpec source (the Demanding One boss). Flip false ⇒ no intent apex.
    floorEasy:  false,       // §G5 branch (b) SEAM — the MERCY floor candidate ({C:1}) in floorCands (the "content-floor" branch of the seg-1 expressibility decision). Gate-first: OFF ⇒ c1 never enters ⇒ byte-identical. The G5 campaign sweeps this against branch (a) (the raised early band); see the campaign report for the decision + why. Flip on (or via §C0) to A/B it.
  },
};

// -----------------------------------------------------------------------------
// §B  NUMBERS  — the tunable constants, centralized for the designer.
// -----------------------------------------------------------------------------
// TWO CLASSES of number live here, and the distinction is LOAD-BEARING:
//
//   NEW numbers (draw tables, mixed-draw picks, bane bands, rarity derivation,
//     inscribe ceiling, the tempo exchange rate, the snap band, portrait slots):
//     owned HERE. No parity site exists because the system is new. Free to tune
//     once the owning system is wired and reads from here.
//
//   // PARITY numbers (SCORE, BLOOM_VALUE, DEEPEN_MAX, DECAY, the 0.12 guard,
//     DIFF_BASE, DEPTH_BONUS, TIER_VALUE): the live source of truth is ELSEWHERE
//     (spellspun.js / generator.js), and DIFF_BASE / DEPTH_BONUS are ALSO hand-
//     copied into session.mjs — the single transport source of truth now that the
//     Monte-Carlo sim is retired (spellspun_sim.mjs is frozen, not a co-source).
//     They are MIRRORED here for one-place visibility ONLY. This file does not yet
//     feed them. Do NOT `import { NUMBERS }` into the engine to replace them without
//     the §PARITY migration — a silent fork desyncs the engine/agent consts, which
//     the parity test catches.
// -----------------------------------------------------------------------------

export const NUMBERS = {

  // ===== NEW numbers — owned here (no parity site; system unbuilt) =============

  // §5c Witness portrait slots (scarcity = build identity). v1 RECORDS slot
  // position but scores position-blind (adjacency substrate authored-but-inert).
  // Read only when witnesses.enabled.
  witnesses: { portraitSlots: 5 },

  // §D1 ⚖3.2 FACE-COUNT caps — the balance-owned window a drum's face count may range
  // in (the base hand is 6×d3; graft/copy raise it, excise lowers it). OWNED here (a NEW
  // number, no parity site), live-read via num('faces.min',2)/num('faces.max',4) at every
  // consumer (the four face verbs in session.mjs). Per-run tunable via the §C0 override
  // channel ('faces.min'/'faces.max'). Rule-4 placeholder pending the snap-band bench.
  faces: { min: 2, max: 4 },

  // §6/§8 Patron cadence — segments per patron (the wish-beat length). OWNED here
  // (a NEW number, no parity site), live-read via num('wishes.patronLen', 3) at every
  // consumer (session.mjs patronComplete threshold + the patron/segment surface). The
  // patron's LAST segment (segsThisPatron === patronLen - 1) is the BOSS segment where
  // the wish's play-bending physics take hold. Per-run tunable via the §C0 override
  // channel ('wishes.patronLen'). Rule-4 placeholder pending the snap-band bench.
  wishes: { patronLen: 3 },

  // §9a/§5 Reward-Ladder draw tables (ModifierList v2 — the inversion fix). Two channels
  // per table: `reach` = the priced deck verbs (deepen/reweave/sigils, ridered per M-2);
  // `draft` = the new WORTH slot — a witness offered for wear (§4.2), NOT flat score. Grade
  // buys RARER, CLEANER cards, never "more points": `guaranteeRareReach` moves the guaranteed
  // rare onto the REACH side (the worth-side glimmers are CUT, §4.4). `reach`/`draft`/
  // `guaranteeRareReach`/`weights` are read by the composer once rewardLadder.enabled. Weight
  // sums are arbitrary. Rule-4: PLACEHOLDERS pending harness re-derivation, not truths.
  drawTables: {
    floor:  { grade: 'ash',   cards: 3, reach: 1, draft: 2,
              weights: { common: 100, uncommon: 0,  rare: 0,  mythic: 0 } },
    true:   { grade: 'trade', cards: 3, reach: 2, draft: 1,
              weights: { common: 60,  uncommon: 35, rare: 5,  mythic: 0 } },
    bloom:  { grade: 'royal', cards: 3, reach: 2, draft: 1, guaranteeRareReach: true,
              weights: { common: 0,   uncommon: 50, rare: 22, mythic: 3 } },
    stitch: { grade: 'ash',   cards: 4, reach: 2, draft: 2,   // desperation ink is ash ink (§9a)
              weights: { common: 100, uncommon: 0,  rare: 0,  mythic: 0 } },
  },

  // §9d Mixed-draw widths. extraCardPerExtraRung = cards added per rung above the
  // highest completed; picks[n] = how many you keep from the widened draw.
  mixedDraw: {
    extraCardPerExtraRung: 1, // one added card per extra completed rung, at its own grade
    picks: { 2: 1, 3: 2 },    // 2 rungs → pick 1 of 4; 3 rungs → pick 2 of 5 (the Full Palette)
  },

  // §4/§9b Bane severity BANDS — the one dial riders, staged curses and wish
  // intensity all draw from. Maps onto BANE_POOL entries (enchantments.js) by
  // SHAPE (count/lock/adjacency), never by id.
  //   ridesCards — §9b/Anti-pattern #7 made STRUCTURAL, not prose: mild & harsh may
  //   ride a Reward-Ladder card; cruel NEVER rides (curses / late-stage wishes only).
  baneBands: {
    mild:  { maxCount: 1, allowLock: false, allowAdjacent: false, ridesCards: true  },
    harsh: { maxCount: 2, allowLock: true,  allowAdjacent: true,  ridesCards: true  },
    cruel: { maxCount: 2, allowLock: true,  allowAdjacent: true,  ridesCards: false }, // curses/late wishes only
  },

  // §9b THE STATION RULE, as data (not prose): the rider band a card carries is a
  // function of the boon's rarity vs the draw's grade. A boon AT/BELOW its station
  // (a common in an ash draw) rides mild; a boon ABOVE its station (a rare surfacing
  // in a Rough/ash draw — the gambler's card) rides harsh; cruel never rides. A
  // composer reads THIS, so the anti-inflation coupling is structural (Law L1),
  // matching how cruel.ridesCards is structural above. null ⇒ no rider (clean card).
  riderStation: {
    onStation:    'mild',  // boon rarity ≤ draw grade → mild rider
    aboveStation: 'harsh', // boon rarity > draw grade (a rare in a Rough draw) → harsh rider
    cruel:        null,    // cruel is never a rider — belongs to curses/late wishes
  },

  // §D3 PURE-RIDER chance — "better play buys pure ink". Read only when
  // on('rewardLadder.pureRiders'). Per-rarity probability that an otherwise-ridered reach
  // card ships PURE (blemished:false, no rider). Commons never (0) — an ash draw always
  // pays; the rarer the card the likelier it comes clean, up to mythic (always pure). One
  // rng roll is drawn per eligible card (chance > 0, not neverRider). Rule-4 PLACEHOLDERS
  // pending the harness — the shape (rarity-scaled, common=0, mythic=1) is what matters.
  riderPure: { common: 0, uncommon: 0.15, rare: 0.4, mythic: 1.0 },

  // §10 Rarity DERIVATION (the step-up checklist). Read only when
  // rarity.enabled && rarity.deriveFromGrammar. Designer tunes the step weights.
  rarityDerivation: {
    base: 'common',
    stepUp: { growingOrConsuming: 1, chosenScope: 1, hasCondition: 1, cleanReachOrTempo: 1 },
    mythicTriggers: ['multPayload', 'namedFace', 'conditionedReach'], // hard-capped at mythic
  },

  // §3 Inscribe soft ceiling — costAwareGenerator prices each face past this MORE
  // than linearly (diminishing returns emerge from COST, not a rule). Read only
  // when costAwareGenerator.enabled.
  inscribe: { softCeiling: 18, harnessSweepTo: 24 },

  // §D Tempo pricing — the reroll↔spin exchange rate the probe uses when
  // costAwareGenerator.readsTempoPower. rerollToSpin not independently swept this campaign.
  //   baseSpins — the per-segment BASE roll budget (was a hardcoded 3 in session.mjs +
  //   probe.js). Wired to num('tempo.baseSpins', 3) at BOTH the live budget (session
  //   G.rollsLeft) AND the probe's effectiveRolls so a spin-cap sweep moves player and
  //   pricing together. ⚖3.12's named 2/3/4 test WAS RUN (2026-07-10 campaign §7):
  //   2 = tight/tense (spread 2.0×) but mercy-poor (patron-0 nofit-hard 76%); 4 = dominated
  //   (runaway spread 10×, die@1 below band); 3 KEPT — the verdict stays the designer's
  //   (⚖3.12 register). Per-run tunable via §C0 ('tempo.baseSpins'). NEW number (no parity site).
  tempo: { rerollToSpin: 0.5, spinCapSweep: [2, 3, 4], baseSpins: 3 },

  // §D Snap-band target — the controller holds realized P(snap)-per-segment in this
  // band instead of the linear DECAY ramp. Read only when snapBandController.
  snapBand: { targetLo: 0.12, targetHi: 0.20 },

  // §G GENERATOR v2 — the intent model's tuning surface (band ramp/stage/clamps, lag α,
  // trials/candidate, apex value, rungSpec caps). BENCH-DERIVED 2026-07-10 (the G5 tuning
  // campaign, reports/Minos_TuningCampaign_2026-07-10.md): the band RAMP was re-derived; the
  // rest were swept-and-CONFIRMED or left at G3/G4 values with the campaign's rationale noted
  // per entry. All remain panel-overridable per-run via §C0 — the band via the per-LEAF keys
  // generator2.bandBase0/bandRamp/bandFitTol/bandEasy/bandBoss/bandFloor/bandCeil (the whole-
  // object key 'generator2.band' COLLIDES with the boolean gate of the same dot-path and must
  // NOT be used as an override — campaign §2). Re-sweep at feature-complete (campaign §12).
  // The canonical spec lives in docs/Minos_Generator_v2.md (§1.4, §2.1, §2.2, §3).
  generator2: {
    // §G2 §1.4 — trials per JOINT candidate/set evaluation (the probe budget). Bench-derived
    // 2026-07-10 (campaign §8): KEPT 240 — probe cost passes the ≤70ms envelope at every swept
    // config, so no prediction precision was traded for speed (180 saves ~28% if it ever fails).
    trials: 240,
    // §G2 §1.1 — OFFERED-boon take-rates: the fraction of the time a player taps each offer,
    // folded into effective rolls at the tempo.rerollToSpin exchange rate. sigil = a tappable
    // reroll spin-sigil; expose = an Augur peek; release/echo reserved (echo prices in-probe
    // as a free re-throw after a bane reroll; release is not yet an effective-roll term).
    takeRates: { sigil: 0.6, expose: 0.4, release: 0.3, echo: 0.5 },
    // §G3 §2.1 — THE SNAP-BAND (the tension target, native-on when generator2.band):
    //   pSnapTarget(patronIndex, position) = clamp(floor..ceil, base(patronIndex) × stage(position)),
    //   base(patronIndex) = base0 + ramp·patronIndex  (the unbounded RAMP → runs end by asymptote, not
    //   a clamp cliff — closes audit 2.4); stage[] = the easy/medium/BOSS shape multipliers (last = boss,
    //   interpolated when patronLen ≠ stage.length). fitTol = the ± window the SET fit must land pNone in.
    // BENCH-DERIVED 2026-07-10 (campaign §6b): ramp .03→.05 — the ONE campaign change (run mean
    // 11.6→9.9, archetype spread 3.5→3.0×, die@1/boss-death/MAE all in band; 7/8 dials at n=24).
    // base0/stage CONFIRMED as-is: both seg-1 expressibility branches (raised early band /
    // floorEasy content) were swept and REJECTED on the gated dials — the patron-0 nofit-hard
    // marker is an honest content-floor clamp (overshoot ~.015–.04) and realized seg-1 mercy
    // passes its dial (campaign §6b; designer FEEL option recorded there: stage[0] .6→.8).
    band: { base0: 0.10, ramp: 0.05, stage: [0.6, 1.0, 1.5], floor: 0.05, ceil: 0.60, fitTol: 0.03 },
    // §G3 §2.2 — asymmetric-lag EMA weight α (the "god-window" feel dial): pricedPower =
    // min(power_now, EMA(power, α)). Higher α = the world catches a graft faster (tighter window).
    // KEPT .5 (2026-07-10 campaign): the ~2-segment window is field-confirmed ("works and is
    // felt", G3 synthesis) and no acceptance dial asked for a change — not independently swept.
    lagAlpha: 0.5,
    // §G3 §2.2 — the window-flag epsilon: telemetry `window` = power_now > pricedPower + lagEps (a
    // float-noise guard so a converged EMA doesn't read as an open window).
    lagEps: 0.005,
    // §G3 §2.4 — the SET-fit search budget: max evaluateRungSet calls per segment (the knapsack's
    // deterministic bound; sized to ≈ the legacy per-tier probe cost — G5 sweeps it).
    fitBudget: 24,
    // §G3 §2.4/§2.2 — the pricedPower→ceiling AMBITION gate: a candidate (true/bloom tier) is admitted
    // into the ceiling search iff its DEMAND (pip cost + shape surcharge) ≤ ambitionBase + pricedPower·
    // ambitionSpan (monotone in pricedPower — more power admits a superset, so the offered set never
    // gets poorer). richnessWeight = the per-richness-point premium in the fit objective so a strong
    // hand is actually OFFERED the deeper shapes it can support at the same tension (principle 1).
    // richnessWeight bench-swept 2026-07-10 (campaign §6): .15→.10 measured a within-noise no-op on
    // every dial — the G4 "can shrink" note is CONFIRMED SAFE; KEPT .15 (no dial gain from moving).
    // ambitionBase/Span not independently swept this campaign (re-sweep at feature-complete).
    ambitionBase: 2, ambitionSpan: 6, richnessWeight: 0.15,
    // §G4 §3.3 — the INTENT-apex gates (read only when on('generator2.apexRungs')). apexPowerGate = the
    // pricedPower floor below which a hand is never offered an apex (a weak hand can't earn the 4th slot);
    // latePatron = the patronIndex from which the intent may REFINE the G3 fit at all (both the 2-rung rest
    // and the apex are LATE-patron tools — early/patron-0 play stays byte-identical to G3). Rule-4 placeholders.
    apexPowerGate: 0.55, latePatron: 2,
  },
  // §G4 §3.1 — the rung-COUNT window a composed set may range in (mirrors NUMBERS.faces). OWNED here (a NEW
  // number, no parity site); live-read via num('rungs.min',2)/num('rungs.max',4) in the composer. A boss/twist
  // rungSpec count clamps into this window; forbid that would empty the set clamps back up to min. Per-run
  // tunable via the §C0 override channel. Rule-4 placeholder pending the G5 tuning campaign.
  rungs: { min: 2, max: 4 },

  // ===== // PARITY numbers — MIRROR ONLY. Live source noted per entry. =========
  // These exist so a designer SEES the whole tuning surface in one file. The engine
  // still reads the ORIGINALS. Changing a value HERE changes nothing until the
  // §PARITY migration; changing the ORIGINAL without updating every parity site
  // listed forks the engine/agent consts. Kept honest by the parity test (§HARNESS).

  // PARITY — live source: spellspun.js `export const SCORE`. NOT copied into the
  // agent (it imports tallyScore, which reads it); mirrored here for visibility.
  score: {
    multiRung: 4, allThree: 20, miracle: 5, knotDouble: 6, knotTriple: 14,
    cursedRunLen: 5, cursedJackpot: 40,
  },

  // PARITY — live source: spellspun.js `export const BLOOM_VALUE`. Mirror only.
  bloomValue: { tricolor: 0, threeOfAKind: 5, hatTrick: 8 },

  // PARITY — live source: spellspun.js `export const DEEPEN_MAX`. Also relied on by
  // deepenable(), which the agent imports. Mirror only.
  deepenMax: 2,

  // PARITY — live source: generator.js `export const DECAY` (MUTATED IN PLACE by the
  // dev panel / window.Tune at runtime). generateSegment reads it every call. If
  // NUMBERS.decay ever becomes the source, the live-mutation seam must point at the
  // SAME object or the dev panel and balance file disagree mid-run.
  //   ⚠ Prereq P2 (steepen decay) EDITS the live DECAY — that same commit MUST update
  //   this mirror or parity_test.mjs (§HARNESS) fails. The mirror is not optional.
  decay: { step: 0.03, floorClamp: 0.18, trueClamp: 0.10, bloomClamp: 0.05, lateGate: 7 },

  // PARITY — live source: generator.js — the literal `0.12` in the multi-completion
  // GUARD loop (`while (multiCompletionRate(...) > 0.12 ...)`, generator.js:227) and
  // MIN_REACH 0.015 (generator.js:151). §9d promotes multiCompletionMax from a fixed
  // guard to the FREQUENCY DIAL for the beloved mixed-draw moment (harness sweep
  // 0.12 → 0.18). (Phase A moves the literal into DECAY.multiGuard; keep this mirror
  // synced when it does.)
  generatorGuard: { multiCompletionMax: 0.12, minReach: 0.015 },

  // PARITY — live source: DIFF_BASE, duplicated VERBATIM in session.mjs (the single
  // transport source of truth) AND play.js. Base target reachabilities. (Formerly also
  // in spellspun_sim.mjs; the sim is retired, so the agent is now authoritative.)
  diffBase: { floor: 0.55, true: 0.32, bloom: 0.16 },

  // PARITY — live source: DEPTH_BONUS, duplicated VERBATIM in session.mjs (the single
  // transport source of truth) AND play.js (#16 escalating depth reward). (Formerly also
  // in spellspun_sim.mjs; the sim is retired, so the agent is now authoritative.)
  depthBonus: { from: 3, base: 3, step: 3, on: true },

  // PARITY — live source: TIER_VALUE in generator.js. Mirror only. (§G4 added apex:10 — the mirror
  // MUST track it, per the §PARITY firewall; parity_test.mjs asserts NUMBERS.tierValue === TIER_VALUE.)
  tierValue: { floor: 1, true: 3, bloom: 6, apex: 10 },
};

// -----------------------------------------------------------------------------
// §C0  RUN-CONFIG OVERRIDES  — the trim substrate (ModifierList v2 §8 step-1).
// -----------------------------------------------------------------------------
// A run-scoped layer that lets a host (the greybox dev panel, an A/B harness, the
// agent CLI) TRIM the game for a single run WITHOUT mutating the BALANCE/NUMBERS
// designer surface. Two independent registries, both deterministic and rng-free to
// read (gate-first — reading a trim never draws randomness):
//
//   1. THE OVERRIDE MAP (setBalanceOverrides / clearBalanceOverrides) — a flat map of
//      DOT-PATH KEY → value. The key is EXACTLY the path on() / num() already navigate;
//      the value substitutes for the BALANCE/NUMBERS leaf it names. Representation:
//        { 'rewardLadder.mixedDraw': false,   // a SUB-toggle → on('rewardLadder.mixedDraw')
//          'witnesses.enabled':      false,    // a MASTER    → on('witnesses') and all its subs
//          'snapBand.targetLo':      0.15 }    // a NUMBER    → num('snapBand.targetLo')
//      A master is the leaf '<system>.enabled' — override it to flip a whole system.
//      on() reads BOOLEAN leaves (coerced === true); num() reads NUMBER leaves. A path
//      absent from the map falls through to BALANCE/NUMBERS unchanged, so an EMPTY map
//      is byte-identical to today (the neutrality contract). Overrides NEVER mutate
//      BALANCE/NUMBERS — they are consulted first, then those objects are the fallback.
//
//   2. THE DISABLED-CONTENT SET (setDisabledContent / isContentEnabled) — a set of
//      content ids the LIVE pool composers must trim out before drawing (reward_ladder
//      drawBoon, wishes generateWish, witnesses generateWitness). isContentEnabled(id)
//      is the composer's filter predicate. An EMPTY/UNSET set is a no-op passthrough:
//      the composer skips the filter entirely, so the rng stream is byte-identical.
//
// DETERMINISM: a host applies these at newRun BEFORE the first rng() (session.mjs), so
// the trim deterministically shapes every seeded draw. Same seed + same trim + same
// actions ⇒ identical run. Reading a trim draws no rng (fail-safe, gate-first).
// -----------------------------------------------------------------------------

let OVERRIDES = {};            // flat dot-path → value (booleans consumed by on(), numbers by num())
let DISABLED  = new Set();     // content ids trimmed out of the LIVE pool composers

// setBalanceOverrides(map) — REPLACE the override map (a shallow copy is stored, so a
// later mutation of the caller's object cannot leak in). Passing {} / null clears it.
export function setBalanceOverrides(overrides){
  OVERRIDES = (overrides && typeof overrides === 'object') ? { ...overrides } : {};
}
export function clearBalanceOverrides(){ OVERRIDES = {}; }
// getBalanceOverrides() — a stable COPY of the active overrides (for the Run Record echo
// + the dev panel). Snapshotting, not the live object, so callers can't mutate the map.
export function getBalanceOverrides(){ return { ...OVERRIDES }; }

// setDisabledContent(ids) — REPLACE the disabled-content set (an array of content ids).
// Passing [] / null clears it (an empty set ⇒ zero behaviour change, rng-neutral).
export function setDisabledContent(ids){ DISABLED = new Set(Array.isArray(ids) ? ids : []); }
export function getDisabledContent(){ return [...DISABLED]; }
// isContentEnabled(id) — the composer filter predicate. True unless the id is trimmed.
// A composer MUST guard with `if (getDisabledContent().length)` (or an equivalent size
// check) so an empty set is a no-op passthrough (see §C0 point 2 / the composer sites).
export function isContentEnabled(id){ return !DISABLED.has(id); }

// private — does the override map carry this EXACT dot-path key?
function hasOverride(path){ return Object.prototype.hasOwnProperty.call(OVERRIDES, path); }

// -----------------------------------------------------------------------------
// §C  READ HELPERS  — how a system gates on this file at its seam.
// -----------------------------------------------------------------------------

// on(path) — the master-aware boolean read (the flag() upgrade). Pass a dot path;
// the system's `enabled` master is ANDed in automatically, so a sub-toggle can
// NEVER fire while its system is off. It is TOTAL over booleans: it returns true
// ONLY for a boolean-true leaf under an enabled master — a number, an object
// (group), an unknown path, or a masterless read all return false (fail-safe: a
// mistyped or non-boolean gate is OFF, never a crash and never accidentally true).
// Examples:
//   on('witnesses')                  -> BALANCE.witnesses.enabled
//   on('witnesses.events.resolve')   -> witnesses.enabled && events.resolve
//   on('rewardLadder.mixedDraw')     -> rewardLadder.enabled && mixedDraw
//   on('vocab.wave2_convertDeepen')  -> vocab.enabled && wave2_convertDeepen
//   on('witnesses.events')           -> false (a group object is not a gate; read a leaf)
// on() cannot AND across SYSTEMS — a PRICED sub-toggle's dependency on
// costAwareGenerator (AP#2) is the consumer's responsibility, e.g.
//   if (on('vocab.inscribe') && on('costAwareGenerator')) { ... }
//
// USAGE AT A SEAM (the debuffs.js:71 idiom — GATE FIRST, THEN rng):
//   import { on } from '../engine/balance.js';
//   export function drawReward(finish, rng, ...) {
//     if (!on('rewardLadder')) return drawPerks(finish, rng, ...); // untouched legacy path
//     // ... ladder logic; rng() only ever drawn PAST this gate ...
//   }
export function on(path) {
  const parts = String(path).split('.');
  const system = BALANCE[parts[0]];
  if (system == null || typeof system !== 'object') return false; // unknown / non-system → OFF
  // master gate (§C0 override-aware): the system's `enabled` leaf, substitutable via the
  // flat override key '<system>.enabled'. An OFF master ⇒ every read under it is OFF.
  const masterKey = parts[0] + '.enabled';
  const master = hasOverride(masterKey) ? OVERRIDES[masterKey] : system.enabled;
  if (master !== true) return false;
  if (parts.length === 1) return true;                            // on('witnesses') === the (overridable) master
  // leaf (§C0 override-aware): a full-path override wins over the BALANCE tree. This also
  // lets a host toggle a leaf a LATER slice will add before it exists in BALANCE.
  if (hasOverride(path)) return OVERRIDES[path] === true;
  let node = system;
  for (let i = 1; i < parts.length; i++) {
    if (node == null || typeof node !== 'object') return false;
    node = node[parts[i]];
  }
  return node === true;   // ONLY a boolean-true leaf gates ON; numbers/objects/undefined → false
}

// num(path, fallback) — read a tunable NUMBER (or number-bearing object). Never
// gates; a number is just data. Returns `fallback` (default undefined) if absent,
// so a consumer can keep its own literal as the safety default — a missing number
// degrades to today's constant, not to undefined:
//   const guard = num('generatorGuard.multiCompletionMax', 0.12);
export function num(path, fallback = undefined) {
  // §C0 override-aware: a full-path override wins over the NUMBERS tree (flat keys only —
  // a composer that reads a whole table OBJECT, e.g. num('drawTables.floor'), is tuned by
  // overriding that object, not a nested leaf).
  if (hasOverride(path)){ const v = OVERRIDES[path]; return v === undefined ? fallback : v; }
  const parts = String(path).split('.');
  let node = NUMBERS;
  for (const p of parts) {
    if (node == null || typeof node !== 'object') return fallback;
    node = node[p];
  }
  return node === undefined ? fallback : node;
}

// BALANCE and NUMBERS are exported above for callers that snapshot/restore in
// tests (the debuffs_test.mjs save/set/restore idiom) or drive per-run A/B sweeps
// in the sim (mutate a copy between runs, never the shared object mid-run).

// =============================================================================
// §PARITY  — the determinism / parity firewall for the // PARITY numbers.
// -----------------------------------------------------------------------------
// The // PARITY block above is a MIRROR, not a source. DIFF_BASE and DEPTH_BONUS
// are physically hand-copied into session.mjs (the single transport source of
// truth now that the Monte-Carlo sim is retired — spellspun_sim.mjs is frozen, no
// longer a co-source); the rest are single-sourced in the engine. The migration
// order, if this file is ever to OWN them, is STRICT:
//
//   Step 1 (this commit): mirror only. Nothing imports NUMBERS into the engine.
//           Live behavior is unchanged because no live read changed. ✔ neutral.
//   Step 2 (later, deliberate, own commit): make spellspun.js / generator.js
//           IMPORT the value from NUMBERS instead of declaring it, AND update
//           session.mjs to import the SAME (deleting its DIFF_BASE/DEPTH_BONUS
//           copies), AND update AGENT_PLAY.md. Run `npm test && npm run demo`.
//           Copied faithfully, the parity test stays green and agent-CLI
//           conformance is IDENTICAL. If it drifts, a copy was wrong — fix the
//           copy.
//   Step 3 (only when a designer INTENTIONALLY changes a value): tune in NUMBERS,
//           sync session.mjs, re-run the gates, and say so in the commit.
//
// HARD RULES (the firewall):
//   • NEVER FORK. If NUMBERS.score.multiRung and spellspun.js SCORE.multiRung ever
//     hold different values, that is a bug — the parity test (§HARNESS) fails.
//     This is the CLAUDE.md parity rule: rules changes live in shared pure modules;
//     duplicated constants MUST be synced if touched. With the sim retired, the only
//     surviving DIFF_BASE/DEPTH_BONUS copy is session.mjs — it is authoritative.
//   • Any prereq or Phase-A edit that touches a // PARITY-mirrored number (DECAY via
//     P2; the 0.12 guard via Phase A) MUST update the mirror here in the SAME commit
//     — the parity test is what catches a forgotten mirror.
//   • DECAY is mutated in place at runtime (generator.js). A future source-move must
//     reuse the SAME object, not a copy.
//   • costAwareGenerator.enabled is the ONE §A toggle whose ON state legitimately
//     re-prices every segment (mutates generateSegment's targets). That change must
//     be an isolated, labelled commit — never bundled.
//   • Determinism law binds everything here: no Date.now() / Math.random(); every
//     consumer gates BEFORE its first rng() so an OFF system draws zero randomness.
//
// §HARNESS — one cheap test freezes this firewall (land it with balance.js per the
// integration plan §1, not deferred): a parity_test.mjs that asserts each // PARITY
// entry === its live const (spellspun.js SCORE/BLOOM_VALUE/DEEPEN_MAX, generator.js
// DECAY/TIER_VALUE and the 0.12/0.015 literals) AND === the DIFF_BASE/DEPTH_BONUS
// copy in session.mjs (the single transport source of truth; the sim copy is
// retired). Wired into `npm test` — the surviving quick checks are `npm test`
// (unit) + `npm run demo` (agent-CLI conformance); the golden gate is retired.
// =============================================================================
