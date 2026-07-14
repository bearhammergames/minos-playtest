# Minos (SpellSpun) Agent Playtest — Claude (Fable 5) — 2026-07-09 — deck-wave

*Focus: the Deck Wave surfaces (face economy §D1, debt verbs §D2, bargains + pure riders
§D3, second_skin fang-lien interception). Branch `deck-wave` (HEAD 363f669). Two informed
runs via the replay-driver pattern (`node packages/agent/driver.mjs _tmp/playbook_77.json`
/ `_tmp/playbook_78.json`); the annotated playbooks (every directive carries its reasoning
in `note`) replay both runs exactly. Seed 77 was the assigned run; it snapped at segment 3
(under 4 segments), so seed 78 was played per instruction. `npm run demo` conformance:
green ("demo: all runs clean") at session start. Every claim carries its seed.*

*Perk steering disclosure: the driver has no perk pause — picks come from a global
`perkPref` id list, falling back to `cards[0]`. I front-loaded the pref with every Deck
Wave id (cursed_graft, excise_face, graft_face, copy_etch, the three bargains, scour,
absolve, draft_second_skin) and inserted `scour`/`absolve` mid-run on seed 77 only after
verifying neither id had appeared in any past offer; the post-edit replay log was diffed
identical through all previously observed picks. **No pref id was EVER matched** — every
pick was the `cards[0]` fallback (see Focus findings 1).*

## Runs

| seed | score | segments | knot | stitches | notes |
|---|---|---|---|---|---|
| 77 | 18 | 2 | — (knot is CUT in this build) | 1 save, 1 miss | Fevered One (constraint, boss-seg-3). Corrupt at seg 1 (load-bearing fang on True). Shift auto-picked twice; 3 banes by seg 3; snapped ON the boss segment |
| 78 | 7 | 1 | — | 0 saves, 1 miss | Mirrored One (twist, never reached its boss seg). Corrupt at seg 1 (load-bearing fang on True). Deliberate fang REFUSAL at seg 2 converted a 47%-reach True into a snap |

Seed 77 tally: Strands 9 · Length 2 · Ingredients 2 · **Curse drain −3** · Patterns 8
(Stitch combo 8). Seed 78 tally: Strands 6 · Length 1 (no curse-drain line despite the
corrupt — presumably no adjacent bead to drain at length 1; worth a designer confirm).

## Focus findings — the Deck Wave surfaces

### 1. What a short run actually sees of the Deck Wave: Shift, Shift, and Shift again

Across both runs the ladder composed **6 reach slots** (77: trade seg 1, stitch-ash seg 2;
78: trade seg 1). They resolved as **five Shift commons and one Wild Sigil uncommon**. Not
one face-economy card, not one bargain, no scour/absolve, no second_skin draft, no rare+
reach card. This is structural, not seed luck:

- `drawTables.true` weights are `common 60 / uncommon 35 / rare 5`, and the uncommon mass
  is split across ~12 uncommons ⇒ any SPECIFIC uncommon (graft_face, cursed_graft,
  seers/louts bargain, scour) is ~3% per trade slot. A run that dies inside 3 segments
  (both of mine did) has effectively **zero access to §D1/§D3**. The Deck Wave's face for
  a struggling player is the Shift card, repeatedly.
- **FACE ECONOMY: never offered** (seeds 77+78, 6 reach slots). The d4-dilution vs
  d2-consistency decision and the reprice-after-reshape check could not be exercised. If
  the designer wants D1 touched in playtests, either the weights need a bump or playtests
  need `--balance` weight overrides / longer-surviving seeds.
- **PURE RIDERS: not reached.** The only >common reach card drawn (Wild Sigil, uncommon,
  seed 78 seg 1) rolled its 85% side and shipped ridered ("…a mild blemish settles on die
  1 face 1"). No rare+ reach ever composed, so the rarity→cleanliness gradient is
  untestable from these runs — it is starved by the same weights as D1.

### 2. BUG-SUSPECT — duplicate Shift cards in one offer (reach-side dedup missing)

Seen **three times in two runs**, e.g. seed 77 seg 1 trade draw: `Shift (trade/common) ·
Shift (trade/common) · draft: The Patient Needle`; seed 77 seg 2 stitch draw: `Shift ·
Shift · draft · draft`. Mechanism (packages/engine/reward_ladder.js): `draftCard` pushes
each drawn witness into `exclude`, but `reachCard` has **no within-draw exclusion**, and
the reach channel has exactly **one** common card (shift_bane, by §D2 design). So any
draw whose reach slots both roll common ships identical twins — and the **stitch table
(`reach: 2`, `weights: {common: 100}`) ships Shift+Shift EVERY time**, deterministically.
This is the reach-side mirror of Bug A (worn-witness re-offer) from the seed 51-52
report. Two identical cards in a pick-1 offer reads as a UI bug and wastes a slot of an
already-desperate ash draw.

### 3. DEBT VERBS — live both times, never a fizzle, but Shift is debt-POSITIVE

KEY WATCH answered for these seeds: **Shift was never offered while I carried no debt**
— both auto-picks (seed 77, segs 1 and 2 boundaries) had a live fang lien to act on, so
the dead-card fizzle never occurred. Reason: a load-bearing fang preceded every draw
(fang-heavy hands corrupt early, and corrupts are what create debt), so in practice the
common Shift and early debt arrive together. The fizzle path needs a debtless seed to
observe; not seen here.

What WAS seen — **the common "cleanse" verb grew my debt every time I used it**:

- Seed 77 seg 1: fang lien etches Seized Spin on die 2 f0 → Shift (auto) moves it to die
  0 f0 → **Shift's own mild rider (Slipspin) settles on die 0 f0**. One bane became two.
- Seed 77 seg 2: Shift (auto) moves Seized Spin from die 0 f0 to **die 0 f1 — the OTHER
  body face of the same drum** → rider settles a second Slipspin on die 2 f1 (a spirit
  face I needed). Two banes became three, and the body drum now carried banes on 2 of 3
  faces.

Shift relocates (M-2-safe) but it RIDES, so each use is net **+1 mild bane**. By seg 3 my
hand carried 3 banes from one corrupt + two "cleanses". Seized Spin then fired five times
across the run (locked die 2, die 4, die 3, die 4, die 1 — seeds 77+78 logs), including
locking my double-mind die 3 on the boss segment. Design question: is the entry-level
debt verb supposed to be negative-sum? It FEELS like a payday loan — possibly intended,
but nothing in the card copy signals it ("the ink stays, you chose where" reads like a
favour). Also note the bare auto-target is strategically poor: it parked a harsh lock
bane onto the same drum's sibling face (lowest-index parking rule), which no human would
choose — perk-arg targeting is invisible to the replay driver (harness limit, noted).

### 4. BARGAINS + second_skin: never offered (see 1) — coupled-bane guard untested here

No bargain ever composed (uncommon/rare, ~3%/slot). The etch-seat decision, the coupled
bane's shift-immunity, and second_skin's lien refusal all remain unexercised by live
play in these seeds. (The coupling guard has unit coverage per AGENT_PLAY; this is a
playtest-reach gap, not a correctness claim.)

### 5. Boss-segment wish model — legible and correct (seed 77)

The greybox 3-seg patron read exactly as documented, verified by probe at each pause:
segs 1-2 `wish.active:false`, `curses.rerollOnRoll` empty; seg 3 `boss:true`,
`active:true`, `rerollOnRoll:[{symbol:'body',count:1}]`, and the once-per-patron event
"the patron leans in — The Fevered One takes hold" fired at seg-3 start. The warp's
per-spin event is also loud ("rerollOnRoll: a body reels and rerolls (die 0 → body)") —
though this instance rerolled INTO body, which reads slightly comic; cosmetic. Playing
INTO the anti-body boss with a body chain was a deliberate, legible risk that failed
honestly. The Fevered One's patron-complete payout was never observed (the thread
snapped mid-boss) — the constraint's repayment leg is still unwitnessed by the bench.

### 6. BUG-SUSPECT — reach estimates are warp-, debt-, and wish-blind

Seed 77: `true(body)` showed `reach_estimate 0.354` at seg 1 (clean hand, no warp) and
**0.354 again at seg 3** — with the Fevered One's body-reroll active AND two of the
hand's four body faces carrying banes (Seized Spin, Slipspin). Source-confirmed:
`generator.js probeFor()` calls `pReach(hand, rung, 'none', …)` — the probe rolls the
actual hand shape (so §D1 reshapes WOULD reprice, as designed) but ignores active
curses, wish physics, and enchants. The number reads as a promise ("~35% for a focused
player") and it materially lied on the boss segment; I snapped chasing it. Either feed
the probe the live warp context or relabel the estimate in the UI ("shape odds,
before curses/wish").

Related tier inversion, seed 77 seg 3: **floor 0.325 < true 0.354** — the survival rung
was offered HARDER than the score rung. With the snap-band controller targeting
`floorReach ≈ 0.84`, a 0.33 floor means the band's promise (P(snap) 12-20%) was off by
~3x that segment. Both runs died with observed floors of 0.33-0.54.

## Decision-log highlights (all quotable from the playbooks)

1. **Seed 77 seg 1** — took True(body, 35%) over Floor(spirit, 75%) for the trade-grade
   draw ("3pts + trade-grade draw beats 1pt ash"). Needed the last-resort fang to close
   it → corrupt, Seized Spin lien. The trade draw it bought offered Shift/Shift/draft —
   the grade upgrade purchased nothing I wanted.
2. **Seed 77 seg 2** — tried to break the body chain pre-boss (True spirit, 33%). Zero
   spirit showed in three spins while my own Seized Spin locked dice 2 and 4; the
   auto-stitch resolved Floor(body) — the break attempt FAILED and the chain extended
   anyway. A stitch save re-deciding your colour for you is legible but brutal.
3. **Seed 77 seg 3 (boss)** — played into the anti-body wish for the chain-milestone
   spin (+1 on 3rd extend). The lastResort fang policy watched die 1 show fang on spins
   1-2 and refused it; by spin 3 (the only moment lastResort takes it) the fang had
   rolled away to charm. Stitch missed. SNAP. **Insurance that only buys on the final
   spin doesn't exist unless the fang politely waits.**
4. **Seed 78 seg 2** — the deliberate fang refusal (`keepFangs:false`, 47%-reach True).
   The driver then kept die 2 — the hand's ONLY mana face — as a MIND pip, making
   True(mind2+mana1) uncompletable from spin 2 onward; die 5's shown fang (refused,
   twice) was the only wild that could have filled the mana slot. Snap, run over, 7
   points. Half driver-greed artifact (no conflict reservation for single-source
   ingredients), half real texture: **single-source ingredient demands (1 mana face in
   the hand) make a 47% estimate feel like a lie when any keep touches that die.**

## The four designer questions

**When did you stop, and why?** Never voluntarily early. Every resolve happened either
at target-met on the last permitted keep or at rollsLeft 0. The band never presented a
board where stopping early beat pushing — floors were 0.33-0.54 by seg 2-3, so "stop and
bank the floor" was rarely even ON the table (twice the floor wasn't met by the kept
pool at all). Partly a driver artifact (stopWhen:target has no "bank the floor at spin
2" option — no mid-segment pivot), but mostly the curve: with floors this low the stop
decision degenerates to "push or die."

**Did you ever refuse a fang?** Yes, twice, deliberately. Seed 78 seg 2's hard refusal
(reasoning quoted above) killed the run — refusing at 47% reach was WRONG because the
single mana source made true reach far below the estimate. Seed 77's lastResort policy
is a softer refusal and it leaked (highlight 3). The corrupt price is landing — both
runs corrupted at seg 1 and both liens materially strangled later segments (5 forced
locks) — but the alternative to the fang was snapping. **The fang bill is real and still
worth paying almost always; what changed my behaviour was the LIEN (a permanent hand
bane), not the score drain (−3 once, absent once).**

**Where did the curve bite?** Segment 2-3, both seeds — doom, not tension. The compound
is: fang corrupt at seg 1 → lien bane → Shift "cleanse" adds riders → 3 banes firing
locks → floors at 0.33-0.54 → stitch → ash draw → more Shift. Once the debt spiral
started at seg 1 neither run ever felt winnable again. The snap-band's 12-20% target did
not describe my experience (2 snaps in 5 played segments, plus 2 stitch rescues).

**Was anything illegible?** (a) The reach estimate on the boss segment — quoted above,
the state said 0.354 and the truth was far lower; that is the one place the "preview
never lies" contract is broken in spirit. (b) Rider disclosure at draw time is still
band+name only ("…a mild blemish settles on die 1 face 1" — WHAT does Errant Spin do? I
had to probe `hand[].faces[].ench[].desc` to price my own debt) — same finding as the
seed 51-52 report, unchanged in deck-wave. (c) Duplicate Shift offers read as a bug even
though they're weight-math. (d) Minor: "a body reels and rerolls (die 0 → body)" —
rerolling into the same face needs a wink in the copy.

## Score strategy (next 5 runs)

Target floors until the hand earns a real True (deepened faces or 4+ of a colour);
treat any rung whose off-colour ingredient has a single source die as one tier harder
than its estimate; take shown fangs greedily UNLESS already corrupt this patron; never
pick Shift while it rides (relocation is not worth +1 bane) — prefer any draft; spend
`--balance drawTables` overrides (or long-surviving seeds) to actually reach the D1/D3
surfaces, which two honest short runs never saw.

## Harness notes (driver limits that bit, per protocol)

- Directives are pre-spin and immutable: no pivot when seg-77-2's spirit never showed,
  no floor-banking option, no conflict-aware keep (the die-2 mana loss, seed 78 seg 2).
- The driver auto-takes the Stitch on a would-be snap (fired 3 times; correct per spec).
- No perk pause: all picks were `cards[0]` fallbacks since no Deck Wave id was ever
  offered; perk targeting args (Shift's park face) are un-steerable, so bare-auto
  quality is itself a finding (see Focus 3).
- The knot is CUT in this build ("No knot; a snap relic may one day grant a last cast")
  — the playbooks' `knot` key was never consulted; runs table column kept for format.
