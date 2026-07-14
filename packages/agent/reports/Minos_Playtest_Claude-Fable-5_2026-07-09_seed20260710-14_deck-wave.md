# Minos Agent Playtest — Claude (Fable 5) — 2026-07-09 — seeds 20260710/20260711 (+20260712, 20260714) — deck-wave

*Full informed runs via the replay-driver pattern on branch `deck-wave` (ModifierList v2
stack + Deck Wave §D1–D3). `npm run demo` conformance: green (`demo: all runs clean`) at
session start. FOCUS: the Deck Wave surfaces — face economy, debt verbs, bargains, pure
riders, chain×faces.*

**Driver note (disclosed up front):** the stock `driver.mjs` cannot express a targeted
perk pick — it sends the *first* legal variant matching a `perkPref` id, which for a
Graft card is always `die 0, to body` and for an enchant card `die 0, face 0`. Since
deliberate targeting IS this session's focus, I used a thin extension driver
(`reports/driver_ext_20260709.mjs`, same segment/knot directive semantics and the same
known limits — pre-spin immutable directives, auto-stitch on would-be snap) that
additionally **pauses at every perk/transform phase** and consumes explicit
`perks: [{args:{card,die,face,toDie,toFace,slot},note}]` entries from the playbook. It
speaks only the public JSON-lines protocol. The annotated playbooks
(`reports/playbook_2026071*.json`) replay every run exactly:
`node packages/agent/reports/driver_ext_20260709.mjs packages/agent/reports/playbook_20260712.json`.
**Recommend upstreaming the perk-pause into driver.mjs** — without it the deck wave is
untestable by the documented protocol.

## Runs

| seed | score | segments | knot | stitches | notes |
|---|---|---|---|---|---|
| 20260710 | 27 | 2 woven (died seg 3, boss) | none — snap ends the run (no knot in engine) | 1 save (seg 1) + 1 fatal miss (seg 3) | Sanctioned run 1. Stitched bloom seg 1 → **ash** draw (stitchAshGrade). Corrupt seg 2 (lastResort fang); Curse drain **−12** vs the 6 pts the fang rescued |
| 20260711 | 7 | 1 woven (died seg 2) | none | 1 fatal miss | Sanctioned run 2. **A 77% floor died to the fang lien**: Seized Spin locked the die that was SHOWING the needed mind, 3 spins running |
| 20260712 | **183** | **9 woven** (died seg 10) | none | 2 saves + 1 fatal miss | Supplementary (FOCUS coverage; both sanctioned runs <4 segs per the brief). Shift engaged deliberately; Debtor's Grin economy; one royal draw; 3 corrupts, drain −23 |
| 20260714 | 14 | 2 woven (died seg 3, boss) | none | 1 fatal miss | Supplementary probe (seed-scanned so a **bargain** would actually be offered). Seer's Bargain taken with a deliberate etch seat |

Side data: a segment-1-only scan of seeds 20260713–20 (true-target policy) snapped
**4 of 8** runs in segment 1 — segment-1 mortality is severe under any value-seeking
opener.

20260712 score lines: Strands (9) 41 · Length 9 · Ingredients 9 · Colour streak 4 ·
**Depth woven 84** · Witnesses 51 · Curse drain −23 · Weave patterns 8. Combos:
Stitch ×1 (+8), **Cursed ×3 (+0)**.

## FOCUS verdicts (the deck-wave surfaces)

### Face economy — NEVER SURFACED in play (the headline)
Across 4 runs, 21 segments and ~15 ladder draws (~16 reach slots), **not one of
graft_face / copy_etch / excise_face / cursed_graft was ever offered.** I verified
headlessly that this is pacing, not a bug: 2000 sampled `buildDraw('true')` calls give a
healthy 60/34.5/5.4 rarity split with all four face cards present at expected rates
(graft 126, cursed_graft 111, copy 25, excise 23 per 4000 reach slots). Expected
deck-wave sightings for my session ≈ 1.4; zero was a p≈0.22 outcome. But the structural
read stands: **face cards live at uncommon/rare, uncommon+ lives at trade/royal, and
trade/royal ink lives past the exact survival wall that kills most runs in segments
1–3.** A player could play five runs of this game and never learn dice can gain faces.
If ⚖3.2 faces-as-progression is core fantasy, it needs an earlier guaranteed moment
(e.g. a face card pinned into the first trade draw, or a patron whose payout is a graft).
- The reshape-repricing claim was verified mechanically instead (generator API, same
  rng): grafting 2 mind faces (d4, d5) onto the 20260711 hand moves floor `body:3` from
  **p=0.536 → 0.396** and eases mind shapes (floor `mind:2+charm:1` p=0.711). Self-pricing
  is real and **bidirectional** — grafting your chain colour taxes every off-colour
  segment. So no, grafting chain colour should not make chains free — the probes reprice
  — but nobody will *feel* that until exposure is fixed.
- cursed_graft / fang_fancier chase: unreachable this session (see Fang economy for the
  cursed-line economy I could reach).

### Debt verbs — Shift is everywhere, and refusing it is usually right
`shift_bane` was offered **9–10 times across 15 draws** (it fills EVERY ash reach slot
by design, usually as an identical pair — see Legibility). Scour/Absolve: never offered.
- **The trap (all seeds):** with no free-standing bane on the hand, Shift is *strictly
  negative* — the boon fizzles ("the ink holds no debt to move") but the blemish rider
  still etches. It was the correct refuse in 8 of 9 offers.
- **The skill layer exists but is NARROW (seed 20260712, the one engaged Shift):** only
  **on_keep** banes have a cold seat. I parked the harsh `Spinlock (on_keep random-lock)`
  from a sometimes-kept charm face onto the **fang face d5f0** — fangs are kept only at
  spins-out (lastResort), when a random lock has nothing left to lock. It later fired
  exactly there (seg 8: "Spinlock seizes die 4" at rollsLeft 0) — **harmless. Placement-
  as-timing works and felt genuinely clever.**
- **on_roll banes have NO cold seat at 3-face drums** — every face shows 1/3, and the
  firing happens at roll, before any decision. Worse, there's an inversion: an on_roll
  bane on a *keepable* face gets silenced when you keep it, so the "hot" faces are the
  quiet seats and fang/charm faces are the loud ones. Shift's placement game only gets
  interesting once the face economy makes drums heterogeneous (a 4-face drum shows each
  face 1/4) — **D1 and D2 need each other, and D1 never shows up.**
- Rider asymmetry reads oddly (20260712 seg 3→4): the card whose identity is "you choose
  where the ink sits" pays its own price on a RANDOM face — mine landed on a chain-mind
  face and later fired… in my favour (respun d2 into the bottleneck mana, seg 5). Random
  is random; the *feel* is off-brand for the relocate verb.

### Bargains — engaged (Seer's, seed 20260714); fairly priced at a deliberate seat
- **The etch-seat decision is real.** Three seat archetypes emerged: (1) *min-max
  silence* — seat on the mana face you keep instantly (keeping silences on_roll pairs
  for the segment) = neuter both halves; (2) *cadence-exposed* — seat on a cold charm
  face that shows often; (3) *fang seat* — moderate cadence, never kept. I took (2):
  d4f0 charm on the deadest drum, because the boon (peek d4's next throw) is exactly the
  "will this drum turn body?" info a body-chain run wants. That reasoning space is a
  good sign — the seat mattered.
- **Cadence in play (seg 2, 20260714):** d4 showed the etched charm → coupled bane fired
  (respun d0, spirit→spirit, harmless) → tapped the boon → *"die 4's next throw will be
  body"* → next spin d4 showed body, as promised. One forced random respin + one honored
  peek per show: at this seat the every-show cadence felt **fairly priced, arguably
  boon-favoured** — but note the bane (`random reroll ×1`) is the mildest in the family.
  The Grinning Bargain's adjacent-LOCK at every show would be a different animal (locks
  were the single deadliest effect all session — see Difficulty), and I'd want a run
  where it's offered before calling the family priced.
- `pairId` surfaces cleanly in `hand[].faces[].ench` (`pair:pair_1` on both halves) and
  the event copy is excellent ("etches a devil's bargain onto die 4 face 0 — boon expose
  + coupled bane reroll (pair_1)"). The coupling guard also composes correctly with the
  draw: in the seg-2 ash draw my only debt was the coupled bane, so the offered Shift
  would have fizzled *and* still etched its rider — correctly refused.
- One emergent nuance worth keeping: d4 carries TWO charm faces and only f0 is etched —
  same-symbol siblings dilute an etched face's cadence (the tray shows "charm" either
  way; only `fi` disambiguates). Clients should render etched faces distinctly.

### Pure riders — no read
Zero pure cards in ~8 rider-eligible uncommon/rare draws (expected ≈1.1 at 0.15/0.4);
even the royal guaranteed-rare (Augur's Sigil, 20260712 seg 8) came blemished. Small
sample, config verified only. "Clean because rare" cannot become legible at this
exposure rate — same funnel problem as the face economy.

## Decision log highlights (playbook quotes, all replayable)

1. **20260710 seg 3 (boss, Soaked Scholar):** all three rungs repriced to a flat ~33%
   because the forced mana keeps FEED true and bloom — "flat reach means value
   dominates: bloom mind 6pts + royal draw". Best generator moment of the session; the
   push died (stitch missed) but the decision was legible and fun.
2. **20260711 seg 2 (the run-killer):** playbook note — "keepFangs FALSE: never corrupt
   a 1pt floor with stitch unspent." The fang lien then locked the die *showing the
   needed mind* for 3 straight spins and the 77% floor snapped the run. The principled
   fang refusal lost; the debt system, not the dice, was the killer.
3. **20260712 seg 3→4 (the engaged Shift):** "parked it on d5f0 FANG face — fangs are
   kept only at spins-out where a random lock is dead. Cold-parking = timing, not
   colour." Validated in play at seg 8.
4. **20260712 seg 7 (contract fold):** Chain-Keeper jackpot (chainAlive ≥4, pays 20 —
   *learned from source, the state hides the payout*) was dead-on-arrival: body only
   appeared at the 21% bloom tier, and the line needed three straight body resolves.
   "~9% for +20 vs risking ~70 banked." Folded to an 89% floor — which then needed the
   stitch anyway (see Difficulty).
5. **20260714 seg 1→2 (the etch seat):** "the min-max seat (mana d2f2, instant keep =
   silence both halves) was considered and rejected as answering nothing" — the one
   perk decision this session with three genuinely different right answers.

## The stop decision
Stopped at target with spins to spare 5 times (Patient Needle paid +4 on three of
them); the stopPreview never lied. But the real stop lesson of this branch: **depth
woven is the run's dominant currency** (84 of 183 on 20260712 — 46%, growing
superlinearly per segment), so the correct stop policy converged on "floor-first
survival, push only when reach ≥ ~45% AND the rung extends the chain or buys needed
ink." Every hero-push below 30% this session (20260710 seg 3, 20260712 seg 8's 27%
bloom being the lucky exception, 20260714 seg 3) ended or nearly ended the run.

## Fang economy
The cost LANDS now — three different ways:
- **Tally:** Curse drain −12 for one corrupt (20260710 — double the 6 pts the fang
  rescued), −23 for three (20260712).
- **The lien itself is the real price:** every corrupt etched a harsh on_roll/on_keep
  bane, and those banes killed or nearly killed segments for the rest of the run
  (20260711's 77% floor; 20260712's 89% floor needing the stitch). Fang debt compounds;
  the tally line is the smallest part.
- **Refusals:** I refused fangs outright at 1-pt floors (20260711 seg 2, 20260712 segs
  1/7/9 with `keepFangs:false` or no fang kept) and got punished exactly once —
  which is correct design tension. lastResort insurance stayed right on bosses because
  **snap now ends the run** (no knot), making corrupt strictly better than death.
- **Cursed-line economy (the reachable half of the FOCUS ask):** The Debtor's Grin
  (royal draft, 20260712 seg 8) pays +2 × cursedSegs per eligible resolve — at 3
  corrupts it fired +6 immediately. Leaning INTO corrupt as a build is real. The
  Fang-Dancer (+4 per *free*-fang resolve) was offered mid-Chain-Keeper contract, whose
  no-corrupt demand made it anti-synergy — a nice cross-system tension. But note both
  cursed payoffs arrived AFTER my corrupts by chance; there's no way to *plan* a cursed
  build when the enabling cards (cursed_graft, fang witnesses) are this rare.
- **Stacked liens:** 20260712's third corrupt landed a second identical Seized Spin on
  d2f1 — one spirit show then fired TWO locks (seg 9). If the lien generator shouldn't
  stack same-face, it does today.

## Difficulty curve
- **Segment 1 is the deadliest wall:** 4/8 scanned seeds + both near-deaths in
  sanctioned runs. Under the current bands, an informed player's best segment-1 move is
  almost always the floor — value-seeking openers are ~coin-flips.
- **Mid-run (segs 4–8, 20260712) was the sweet spot** — tense, survivable, decisions
  about chains/contracts/ink all live.
- **Seg 9–10 late-gate bites hard:** best rung 33%, `pure` shapes at 2.5–3.2%. Doom
  arrived at seg 10 (all-sub-33% board + bane web).
- **The invisible curve is the debt web, and the probes don't price it.** Three
  exhibits: (a) 20260711 seg 2 — floor `mind:3` stated 77%, killed by the lien's random
  lock freezing a mind-showing die; (b) 20260712 seg 7 — floor `mind:3` stated **89%**,
  survived only via stitch after Seized Spin locked d0-showing-mind for 3 spins;
  (c) 20260712 seg 3 — floor `body:3` priced 0.536, the EXACT number the same
  4-body-face hand produced with no warp in 20260710 seg 1, despite the Fevered One's
  body-reroll warp being active — **wish warps and ench firings appear absent from the
  reach probes.** As debt accumulates, `reach_estimate` drifts from "the most important
  read in the game" toward fiction. Either the probes should roll the ench/warp context,
  or the UI should stop quoting two-decimal reach on a debt-laden hand.

## Legibility issues
1. **Snap→knot doc drift (all seeds):** AGENT_PLAY.md's opening paragraph and protocol
   both promise "one free final cast (the knot)" on snap; the engine ends the run
   ("SNAP — … (No knot; a snap relic may one day grant a last cast.)",
   `doSnapToKnot` dormant). The previous report flagged this too — AGENT_PLAY.md still
   hasn't been updated and it cost me a planned knot directive slot in every playbook.
   Same drift: "a curse is mandatory" for load-bearing fangs — v2 actually etches a lien
   bane, no curse pick happens.
2. **Jackpot payout hidden (20260712 segs 6–9):** `state.wish.contract` shows
   kind/target/progress/met but not the payout (`n:20` — larger than my entire run-1
   score). The 21%-bloom-vs-89%-floor contract decision is impossible to make informed
   without reading `content/wishes.js`.
3. **`pure` rungs are a bare flag (20260712 segs 9–10):** `{req:{mind:3}, pure:true,
   reach 0.032}` two segments after `mind:3` priced 0.889. Nothing in the state explains
   "voids on any off-colour keep". Needs a `desc` like the veil has.
4. **Witness desc leaks internals (20260712 seg 8):** The Debtor's Grin — "When you
   resolve by the thread, score +2 per cursedSeg." Raw variable name, opaque clause.
5. **"Bloom" means two systems (all seeds):** the 6-value RUNG tier and the thread
   combo pattern behind `liveBloomColours`. After resolving a bloom rung,
   `liveBloomColours: []` reads like a bug (I filed it as one before reading
   `checkBlooms`).
6. **Ash draws are monotone Shift pairs:** by §D2 design the common reach slot is
   always Shift, so most ash/trade draws open "Shift · Shift · draft" — sometimes
   byte-identical twins (same rider band and name). When the dupes differ only by rider
   (Errant Spin vs Slipspin, 20260712 seg 7) the choice is real but visually buried.
   Consider de-duping identical cards or guaranteeing distinct riders on dupes.
7. **Fang pips don't pay colour pips** (`resolved true (body) for 3 × 1 pips`,
   20260712 seg 4): correct rule, but nothing warns that a fang-heavy resolve pays less
   before you resolve.
8. **Witness-pool exhaustion upgrades ash drafts** (20260712 seg 3: rare Spiritbound/
   uncommon Fang-Dancer in a 100%-common ash draw once both common witnesses are worn).
   Emergent, arguably delightful — flagging in case it's not intended.

## Score strategy (next 5 runs)
Floor-first until trade ink is affordable; push only chain-extending 45%+ trues; treat
every fang as a permanent −1 die-segment somewhere downstream, not a 1-off −12; wear
Patient Needle + The Edge early (they pay on opposite resolve endings); take The
Debtor's Grin the moment corrupts ≥2; refuse Shift unless an on_keep bane sits on a
face I actually keep; seat any bargain on a high-show face whose peek/reroll targets my
chain colour; and if a Graft ever appears, graft the chain colour onto the two drums
that lack it and re-read the next segment's probes before believing the chain got
cheaper.

## Bug-suspects (ranked)
1. **Reach probes ignore active wish warps** — floor body3 p=0.536 identical with and
   without the Fevered One's rerollOnRoll (20260712 seg 3 vs 20260710 seg 1, same
   4-body-face count). If intended, it undercuts the boss segment's informed consent.
2. **Reach probes ignore ench firings** — stated 77–89% floors dying/near-dying to lien
   locks (20260711 seg 2; 20260712 seg 7). Systemic, worsens with debt.
3. **Same-face lien stacking** — second Seized Spin onto already-baned d2f1
   (20260712 seg 8); double-fire observed seg 9.
4. **AGENT_PLAY.md drift** — snap/knot and mandatory-curse text (above).
5. Driver (not engine): stock `driver.mjs` need-accounting doesn't credit kept fangs —
   lastResort chain-kept a second, wasted fang twice (20260711 seg 1, 20260712 seg 4),
   each time upgrading a survivable keep into corrupt+extra exposure. Worth fixing
   alongside the perk-pause upstream.

## Driver limits that bit (as instructed, noted not fought)
- **Auto-stitch** fired 6 times; twice it would have been my choice anyway; at
  20260710 seg 1 it converted a bloom into ash ink (stitchAshGrade) with no say.
- **Pre-spin immutable directives**: could not pivot to the unveiled bloom
  (20260712 seg 6 — veiled rungs also carry no `req` for the keep logic), could not use
  the Seer's peek information in keep decisions (20260714 — the log proves the peek
  honored, but a script can't act on it), could not stop over-keeping fangs.
