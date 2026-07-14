# Minos (SpellSpun) Agent Playtest — Claude (Fable 5) — 2026-07-09 — modifier-v2

*Focus: the ModifierList v2 surfaces (reward-ladder inversion, witness drafting, wishes,
slice-4 sigil verbs, chain milestone). Two informed runs via the replay-driver pattern
(`node packages/agent/driver.mjs _tmp/playbook_51.json` / `_tmp/playbook_52.json`); the
annotated playbooks (every directive carries its reasoning in `note`) replay both runs
exactly. Seed 51 was the assigned run; it snapped at segment 2, touching almost no v2
surface, so a second run (seed 52, stated at the time) was played per the protocol
default of two. `npm run demo` conformance: green ("demo: all runs clean") at session
start. Every claim carries its seed.*

*Perk steering disclosure: the driver has no perk pause — picks come from a global
`perkPref` id list (default never drafts a witness, see Harness notes). I steered picks
by reading each offer at its pause boundary and appending ids for FUTURE offers only;
all previously observed picks were preserved and verified identical by replay diff.
Two late picks (seed 52, segments 7/8 offers) were mis-steered by this global list —
called out below where they matter.*

## Runs

| seed | score | segments | knot | stitches | notes |
|---|---|---|---|---|---|
| 51 | 4 | 1 | — (knot is CUT in this build) | 0 (1 attempted, missed) | Grasping Widow (keepCap 2). Snapped at seg 2 chasing the chain True; the driver's greedy keeps froze the hand's only mana die as a mind pip |
| 52 | **198** | **8** | — | 1 (2 attempted) | Hasty One → Grasping Widow. 7×mind chain, 2 chain milestones, 1 load-bearing fang (corrupt), 5/5 portrait, 6 witness drafts, snapped at seg 9 |

Seed 52 tally: Strands 49 · Length 8 · Ingredients 10 · Colour streak 12 · Chains 10 ·
Miracles 5 · Depth 63 · **Witnesses 51** · **Curse drain −24** · Patterns 14 · combos
(3-of-a-kind 6, Stitch 8).

## Focus findings — the v2 surfaces

### 1. Reward ladder (inversion + riders)

Observed compositions match the v2 spec, and grade legibly buys cleaner/rarer, never
flat score (no Glimmer/Steady ever appeared):

- **ash (Floor)**: 1 reach + 2 drafts. Every ash reach card carried a **harsh** rider —
  seed 51 seg 1 (Augur's Sigil rare + Twin Errant Spin), seed 52 segs 1/6/8 offers
  (Warding Sigil + Spinlock, Reweave + Twin Slipspin, Carver's Sigil + Spinlock). This
  is **structural, not luck**: the reach pool (`LADDER_BOONS`) has no common-rarity
  card, so an ash draw's reach slot is always above station ⇒ always harsh. If ash
  reach is meant to sometimes ride mild, the pool needs a common reach card.
- **trade (True)**: 2 reach + 1 draft; on-station uncommons rode **mild** (Open Hand /
  Flanking / Echo / Ward + Slipspin/Errant Spin), while a rare Deepen surfacing in a
  trade draw rode **harsh** (Twin Errant Spin) — the station rule reads exactly as
  designed once you know it (seed 52, segs 3/5/6/8 offers).
- **stitch**: the seg-3 bloom (seed 52) was saved by the stitch and the draw came as
  **ash, pick 1 of 4** ("desperation ink") — losing the royal draw for a 6-point bloom
  stings but is legible §9a behaviour.
- **Rider disclosure is only partial**: the card shows `rider:{band:"harsh",name:"Twin
  Errant Spin"}` — band + name, **no effect/trigger/scope text**. You must already know
  the bane bestiary to price the card. The etched face's `ench[].desc` explains it only
  AFTER purchase. Suggest carrying the bane's desc onto the offer card.
- No royal draw was ever earned (the only bloom finish was stitch-degraded), so the
  `guaranteeRareReach` path is untested here.

### 2. Witness drafting — fires loudly, two real bugs

Six drafts across seed 52 (Thousand Cuts, Unbroken Line, Thousand Cuts again,
The Edge, Patient Needle, Patient Needle again). Every fire was a loud, correct,
per-event `witness: <name> speaks — +N` line; filters were exact:

- Patient Needle fired on spins-to-spare stops (segs 6, 7) and stayed silent on the
  seg-8 wire ride; The Edge fired exactly once, on that wire ride (+5, rollsLeft 0).
- Unbroken Line's growing payload read clean (+1, +2, +3, +4, +5) and was silent on
  the deliberate seg-8 chain break.
- Thousand Cuts pays **+1 per DISTINCT symbol kind**, not per die — kept
  {mana, mind, mind} paid +2 (seed 52 seg 2). The desc "score +1 per symbol" is
  ambiguous; players will read "per kept die."
- 5-slot portrait: `state.draw.portraitFull` surfaced the worn row correctly; over-ink
  auto-replaced the oldest slot; "X is inked over Y" events read well.

**BUG A — worn witnesses ARE re-offered** (contradicts AGENT_PLAY.md "Worn witnesses
are never re-offered"). Seen four times on seed 52 (segs 4, 7, 8, 9 offers), worst at
seg 9: **two identical `draft_patient_needle` cards in one 3-card offer** while
patient_needle was worn. Mechanism (packages/content/witnesses.js `generateWitness`):
the rarity filter is applied FIRST — ash/stitch draws roll `common`, and the common
witness pool has exactly two members (patient_needle, thousand_cuts) — then the
worn-exclusion empties the pool and the "fall back to the unexcluded pool" branch
readmits worn ids (defeating even the within-draw dedupe). Fallback should widen
RARITY, not readmit worn ids. Until then every ash draw after both commons are worn
must offer a duplicate.

**BUG B — duplicate copies share an id-keyed accumulator.** A re-drafted witness
double-fires (correctly paid twice — "Thousand Cuts speaks +2" twice per resolve, both
counted in witnessScore/tally), but `state.witnesses[]` rows for the same id all
display the id-total fires/score (summing rows overcounts vs `witnessScore`), and
over-inking ONE copy zeroes the displayed stats of the SURVIVING copy (seen segs 7-9,
seed 52). Portrait rows need per-slot accounting.

### 3. Wishes — constraints only, by variance

Three patrons across both runs, all **constraint** species: Grasping Widow (keepCap 2,
seed 51), Hasty One (rollLimit 2) then Grasping Widow again (seed 52). Both enforced
exactly through `state.curses`. The payout verb landed legibly at patron complete —
**"The Hasty One pays out: +1 spin"** (seed 52 seg 5→6) — and the cost-aware generator
visibly priced the granted spin into the next segment's reach estimates. No twist or
jackpot ever rolled: pool weights make constraints 16/33 (~48%), so three straight is
~11% — unlucky, not broken. **The jackpot-contract focus question is therefore
untested**; a `--wish spotless_one`-forced session is the cheap follow-up.

### 4. Slice-4 sigil verbs — offered, but unplayable in replay mode

Cards for all five appeared (Augur's, Warding, Open Hand, Echo, Carver's), so vocab
gating and pool composition work. But the **replay driver cannot tap sigils, release,
or wish_reroll**, and it stalls on the transform phase (untouched in its main loop) —
so I stopped buying reach cards entirely after seg 1: under this harness an etched verb
is dead weight whose rider still bites. This is a harness verdict, not a game one, and
it made "drafts only" the strictly dominant perk policy. The one passive test that DID
run: seed 51's Augur's etch raised expose sigils that went untapped (no crash, cleanly
ignorable per Law L4).

### 5. Chain milestone — fired twice, shaped play, one spec question

- "the chain holds — the next segment owes a spin" fired at the 3rd and 6th extends
  (seed 52 segs 4 and 7), and the owed spin was visibly repriced by the generator
  (seg 5 estimates 65/56/33 vs the usual mid-30s; seg 8 ran 4 spins).
- It genuinely changed decisions: the seg-3 bloom chase at 24% was partly bought by
  the pending 3rd-extend bank; seg 7's true-pick note says "milestone watch."
- **Spec question**: seg 4's milestone fired on the SAME resolve as a load-bearing-fang
  corrupt, and the streak was NOT reset by the corrupt (segs 5-6-7 fired the next
  milestone). AGENT_PLAY.md says "a chain break / corrupt resets the streak." A break
  DID reset it (seg 8). Either the corrupt-reset is unimplemented or fires before the
  corrupt lands — worth a designed answer.

## Decision-log highlights

1. **Seed 51, seg 2 (the death).** Target true(mind:2+mana:1, 49%) to extend. Spin 1
   showed minds on dice 2 and 3; the driver kept both — die 2 is the hand's ONLY mana
   face. Mana became unreachable except by fang; no fang showed on the last spin;
   stitch missed; snap at score 4. The prior reports' "target-locked keeps
   underperform the sticker reach" now has a mechanism: **greedy keeps freeze
   bottleneck dice**.
2. **Seed 52, seg 3 (the save).** All rungs ≤34% under Hasty. Chose bloom(mind, 24%)
   for chain + milestone + 6 pts. Two spins left it one mind short; the auto-stitch
   flew and HIT — "STITCH SAVE — resolved bloom (mind) for 6", threeOfAKind, chain 3.
   Best moment of the session; the ash "pick 1 of 4" that followed was the price.
3. **Seed 52, seg 4 (the fang bill).** Last-resort fang covered mana on the final
   spin: "a FANG was load-bearing — the weave corrupts; a harsh bane (Spinlock) etches
   onto die 3 face 2", the live mind bloom died with it, and the tally later itemized
   **Curse drain −24**. The corrupt cost lands hard in v2.
4. **Seed 52, seg 8 (the priced-out chain).** After 7×mind, the chain-colour rung came
   back `pure:true` at **3.9%** reach. I broke the chain deliberately via floor(body,
   65%) — the generator made "stop being greedy" a legible, numbers-backed choice.
5. **Seed 52, seg 9 (the end).** True(body, 32%) to extend the new chain; three spins
   and a stitch produced one body total and zero fangs to even refuse. Snap at 198.

## The stop decision

Stopped the moment the target lit whenever possible (segs 2, 5, 6, 7 of seed 52 —
seg 5 stopped after spin 1 with two spins spare). The v2 worth economy drives this:
the witness suite paid ~8-12 per resolve regardless of tier, so ANY completion beat
rung greed — I played more conservatively than the jam scoring would reward, and it
produced the best Minos score on file. The one deliberate anti-stop was seg 8's chain
break (see highlight 4), which is really a stop decision at the strategy level.

## Fang economy

Fangs were refused on every non-final spin (lastResort policy) across both runs. One
was taken load-bearing (seed 52 seg 4) and its price was itemized and FELT: mandatory
harsh curse etch + bloom killed + −24 at tally (≈12% of the final score). Yes — the
cost lands now. Two harness notes: the driver keeps a wasted fang before scanning
later tray dice for the real symbol (seed 52 seg 1 kept fang AND the charm it needed),
and at seed 52 seg 9 the insurance simply never appeared — 32% with no backstop is the
real number behind that death.

## Difficulty curve

Seed 52: tense from seg 3 (all rungs ≤34% under Hasty's 2 spins — constraint wishes
stack multiplicatively with decay), relieved by milestone spins (segs 5, 8 played at
3-4 spins with 50-65% floors), then terminal at segs 8-9: chain-colour rungs priced to
~4% (`pure:true`) and everything else ~32%. Seed 51 died at seg 2 to a 49% rung — same
band the 2026-07-04/05 reports died in. Segment ~3 under a constraint wish and segment
~8-9 generally is where tense becomes doomed.

## Legibility issues

- **AGENT_PLAY.md is stale on the knot**: the game paragraph and the knot directive
  workflow still describe the free final cast, but session.mjs `doSnapEnd` ends the
  run with no knot ("a snap relic may one day grant a last cast") — both snaps ended
  runs directly. Update the contract doc (and the driver brief) or agents will plan
  for a phase that never comes.
- Rider cards disclose band+name but not the bane's effect (see Focus 1).
- "score +1 per symbol" means distinct symbol KINDS (see Focus 2).
- Resolve lines read "resolved floor (mind) for 1 × 2 pips" — value × woven pips, but
  nothing explains the multiplication; the tally's "Strands woven" line doesn't
  back-reference it.
- `pure:true` on rungs (seed 52 segs 8-9) is undocumented in AGENT_PLAY.md.
- Witness portrait rows mislead on duplicates (BUG B above).
- Never resolved into an unexpected rung — `metNow`/auto-complete stayed truthful.

## Harness notes (driver limits that bit — not game bugs)

1. Pre-spin immutable directives: killed seed 51 (bottleneck-die bury); a keep
   vocabulary word like `protect:[die]` or a mid-segment pause would close it.
2. Auto-stitch: fired twice; both were pure upside since snap now ends the run — the
   stitch/snap choice is currently no choice at all (snap is strictly worse), which
   itself is a design observation worth confirming intentional.
3. The perk channel: no pause, global `perkPref`, default falls back to card 0 —
   and `buildDraw` composes reach slots first, so **the default driver never drafts a
   witness**. Steering via pref can't say "never re-draft a worn id", which cost me
   two no-op over-inks (seed 52, segs 7/8 offers, both `thousand_cuts` over
   `thousand_cuts`). A `draftPref`/per-offer pause is the fix.
4. Transform phase is unhandled (main loop breaks → guard trip): I avoided Carver's
   Sigil deliberately; any run that picks it in a fallback strands the playbook.
5. Sigil/release/wish_reroll actions are never emitted — the whole slice-4 verb layer
   is invisible to replay-driver playtests (see Focus 4).

## Score strategy (next 5 runs)

1. Drafts-first stays correct under this driver; with a sigil-capable driver, re-test
   whether a mild-ridered trade reach card beats the 4th-5th witness.
2. Open on the highest-reach chain-colour rung, but NEVER target a recipe whose
   ingredient lives solely on a die that also carries the target colour (the seed-51
   killer) until the driver can protect dice.
3. Break chains proactively when the chain-colour rung prices below ~15% — the
   generator telegraphs the end of a chain's economic life.
4. Force a jackpot wish (`--wish spotless_one` / `chain_keeper`) in one session to
   answer the untested contract-shaped-play question.
5. Wear Wanderer's Mark before a planned break segment; pair The Edge with constraint
   patrons (rollLimit) and Patient Needle with free ones — the stop-decision witnesses
   are patron-sensitive in a way the drafting UI could surface.
