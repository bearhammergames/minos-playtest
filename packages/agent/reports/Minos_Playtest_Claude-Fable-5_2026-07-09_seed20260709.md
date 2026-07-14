# Minos Agent Playtest — Claude (Fable 5) — 2026-07-09 — seed 20260709 (modifier-v2)

*One full informed run via the replay-driver pattern (`node packages/agent/driver.mjs
_tmp/playbook_20260709.json`) on branch `modifier-v2`, focused on the ModifierList v2
surfaces (reward ladder inversion, witness drafting, wishes, slice-4 verbs, chain
milestone). `npm run demo` conformance: green (`demo: all runs clean`) at session start.
The annotated playbook — every directive with its reasoning in `note` — is at
`_tmp/playbook_20260709.json` and replays this run exactly. Deterministic side-replays
through `agent_cli.mjs` (same seed, same actions) were used read-only to inspect perk
offers the driver auto-picks through. Every claim carries seed 20260709. The run
reached segment 6 (5 woven), so the conditional second seed (20260710) was not
triggered per the task's under-3-segments rule.*

## Runs

| seed | score | segments | knot | stitches | notes |
|---|---|---|---|---|---|
| 20260709 | **102** | **5 woven** (died seg 6) | **none — knot is REMOVED by design** (see Legibility) | 1 save (seg 5) + 1 fatal miss (seg 6) | Spotless jackpot paid +25; portrait filled 5/5 (with a duplicate-witness bug); died to an all-≤35% board under Fang-Fancier |

Score lines: Strands 19 · Length 5 · Ingredients 3 · Colour streak 8 · Depth woven 18 ·
**Patron jackpot 25** · Witnesses 16 · Weave patterns 8 (A Stitch in Time). Thread:
`[mind, mind, body, mind, mind]`, no corrupt, no curses, no blooms.

## Decision log highlights (from the playbook notes)

1. **Seg 1 — the wish read the whole opening.** Patron 1 rolled **The Spotless One**
   (jackpot: zero corrupt/cursed beads for 5 segments → +25). +25 dwarfed every prior
   report's full-run score, so the contract became the strategy: strict
   `keepFangs:false`, floor-first survival. Note: *"Spotless jackpot (+25) live: no
   fangs at all, no curses… True at 34% is a trap; floor(mind) 77% sets the mind
   chain."* Resolved floor(mind) on spin 2 with a spin to spare.
2. **Seg 3 — the priced chain break.** Mind chain ×2; the only mind rung was the 14%
   bloom. I priced the extend at ~+8 tally swing (Concentration 6 vs 4 + Three-of-a-Kind
   +6) plus the milestone spin, against a ~50% run-death risk that would also forfeit
   the unevaluated +25 (jackpots pay at patron COMPLETE — dying early loses the whole
   contract). Broke the chain deliberately: floor(body, 54%), stop on target. The tally
   later confirmed the arithmetic: Colour streak paid exactly 8 (two 2-runs).
3. **Seg 4 — the tier inversion segment.** true(mind) at **47%** out-reached
   floor(spirit) at **34%** while paying 3×, and the standing chain was length 1 so the
   BREAK cost zero. Took True, rode the wire (spin 3), got the run's only trade-grade
   draw.
4. **Seg 5 — the fang refusal with real teeth.** The 77% floor went cold: spin 2 served
   `1:fang … 5:fang` and zero minds. Keeping a fang completes floor but a load-bearing
   fang = corrupt bead = the +25 burns. The directive refused both fangs, spin 3 also
   missed, and the auto-stitch flew `mind mind mind mind charm` — **STITCH SAVE,
   floor(mind) 1×4 pips, "The Spotless One is satisfied — +25."** The single best beat
   of the run: the contract made fang-refusal genuinely painful and genuinely correct.
5. **Seg 6 — the contract flip, and death.** Patron 2 rolled **The Fang-Fancier**
   (jackpot: 3 corrupt beads → +30, drain stayed). Fang policy inverted to
   `keepFangs:true` in one segment — I *wanted* load-bearing fangs now. Board was
   floor 34% / true 35% / bloom 14%; targeted true(body) with two kept fang wilds, but
   body never showed again after spin 1, and the kept fangs then **shrank the stitch**
   (fangs are excluded from the stitch tray, so only 4 dice answered: `mind×3 + charm`,
   which satisfied nothing on a spirit-floor board). Stitch missed → SNAP → run over,
   **no knot**.

## The stop decision (designer question 1)

Stopped with spins in hand at segs 1, 2, 3 (all `stopWhen:"target"`, resolving the
moment floor lit). Three drivers, in order: (a) the Spotless contract made every extra
spin pure downside once a rung lit; (b) chain protection — off-colour overshoot risk;
(c) from seg 3 onward, **The Patient Needle paid +4 per stop-with-spins-to-spare**,
which is the first time the stop decision has had a direct score line attached — it
fired at seg 3 and visibly did NOT fire at seg 4 (rode the wire, `rollsLeft 0`). The
witness pair (patient_needle vs the_edge) successfully turns the stop timing into a
build identity. The stopPreview never contradicted a resolve.

## Fang economy (designer question 2)

**Yes — refused fangs, and for the first time in this seed-line's reports the refusal
cost was legible and correct.** Seg 5 spin 2: two fangs shown, floor two pips short,
contract live — refusing them nearly killed the run (saved by the stitch) and was still
right: corrupt = −25 contract + a face bane + a broken streak, vs floor's +1. The
jackpot species does what the base corrupt-cost alone never did in prior reports: it
prices the fang.
Then Fang-Fancier flipped the sign and I *chased* corruption — and found the hidden
second price: **kept fangs are excluded from the stitch tray**, so a fang-heavy keep
strategy thins your own safety net (seg 6 died partly to this). That is documented
behaviour (AGENT_PLAY: "fangs excluded"), but its strategic weight — fang keeps trade
away stitch coverage — was a discovery and is excellent, if currently invisible,
tension.

## Difficulty curve (designer question 3)

The curve bit at **segment 6**: floor 34% / true 35% / bloom 14% — the *floor itself*
became a coin flip, so there was no safe line at all, only which coin to flip. The
slide was visible earlier: floor reach 77% (segs 1, 2, 5) → 54% (seg 3) → 34% (segs 4,
6). When the floor drops under ~50%, a no-fang policy is living on the stitch; seg 5
already needed it. Meanwhile the **Depth woven** line (+3/+6/+9… per segment from seg
4) paid 18 of the 102 — survival deep into the curve is now correctly the richest
single income after the jackpot, which makes the seg-6 all-coin-flip board feel like
the run's real wall: tense at seg 5, doomed at seg 6.

## Modifier v2 surfaces (the focus)

### Reward ladder — inversion & rider legibility
- **The inversion reads correctly and was observable end-to-end.** Floor finishes →
  ash draws (1 reach + 2 drafts, all-common weights); the True finish → trade draw
  (2 reach + 1 draft); no flat-score card ever appeared. The seg-5 stitch save
  correctly forced the 4-card **ash** desperation draw despite resolving a rung.
- **Riders are legible as a price, and the price gradient is the actual teaching.**
  Every reach card disclosed `blemished:true` + `rider:{band,name}` up front. At ash,
  every reach card carried a **harsh** rider (uncommon boon above the common station):
  Flanking Sigil/`harsh: Twin Slipspin` (seg 1), Echo Sigil/`harsh: Spinlock` (seg 2),
  Ward Sigil/`harsh: Spinlock` (seg 3). At trade the same verbs came **mild**
  (Respin/`mild: Slipspin`, Ward/`mild: Errant Spin`). Informed response: never buy
  reach at ash, buy at trade+ — which is exactly "better finishes → cleaner cards."
  Flag for the designer: at ash the reach slot is nearly decorative (harsh rider on a
  common-grade draw), so a floor-grinding player may never interact with the deck-verb
  economy at all.
- **BUG — the witness draft pool exhausts and re-offers worn witnesses, including
  duplicates within one draw.** Ash drafts roll 100% common rarity, and the common
  witness pool is only TWO deep (patient_needle, thousand_cuts). Once both are worn,
  `generateWitness`'s exclusion fallback (packages/content/witnesses.js — the
  `if (t.length) pool = t` guard) silently discards the worn-exclusion, so:
  seg-3's draw offered `draft_patient_needle` **twice in the same draw** (in-draw
  duplicate despite `exclude.push`); seg-4's draw offered both already-worn commons;
  and the session ink path accepted duplicates without complaint — final portrait:
  `[thousand_cuts, patient_needle, thousand_cuts, thousand_cuts, thousand_cuts]`
  (worn 5/5). This contradicts AGENT_PLAY's "Worn witnesses are never re-offered."
- **Duplicates STACK at fire time**: seg 4's resolve logged `witness: The Thousand
  Cuts speaks — +2` twice (2 copies), seg 5 three times. Witnesses paid 16 total, most
  of it accidental stacking. If stacking is not intended, both the composer fallback
  (escalate rarity instead of un-excluding) and the ink path (refuse/no-op a duplicate)
  need a guard.

### Witness drafting — the loud fire & the portrait
- Drafting itself reads well: `kind:'draft'` cards carry `witnessId`/`rarity`/grammar
  desc; inking logs `X is inked (worn N/5)`; every fire is a loud
  `witness: <name> speaks — +N` event at the moment of scoring. The on_stop_early gate
  (Patient Needle) visibly fired or didn't based on `rollsLeft`. Portrait reached the
  5-slot cap; over-ink replacement was never exercised (the run ended first).
- Worn-row display nit: each worn entry's `score` is the per-ID pooled tally, so
  duplicate rows all display the same number (both thousand_cuts rows showed 6 when
  their individual contributions were 4 and 2).

### Wishes — both patrons rolled jackpots, and both shaped play
- Patron 1 **Spotless One** (`state.wish.contract {kind:'spotless', target:0,
  progress:0, met:true}` — live progress readable): dictated 5 segments of strict
  fang refusal and floor-first targeting; paid its own `Patron jackpot +25` tally
  line. Verified in code that riders/blemishes do NOT count against spotless (only
  corrupt/cursedHere beads), so buying blemished reach under the contract is legal —
  worth surfacing in the wish desc someday.
- Patron 2 **Fang-Fancier** flipped my fang policy in a single segment (see decision
  log #5). Contract shaped decisions: emphatically yes, both times, in opposite
  directions — the jackpot species is the strongest strategic input in the v2 stack.
- Not rolled this run: constraints and all three twists (mirror/veil/freeReroll).
- Timing note: jackpots evaluate only at patron COMPLETE, so an early death forfeits
  the whole contract — this silently multiplied the value of safe play in segs 1-5
  and is a big (currently implicit) part of the spotless contract's pull.

### Slice-4 sigil verbs — offered, never bought (composition + harness limits)
Ward/Echo/Respin/Flanking sigils all appeared in offers (with riders as designed), but
none was ever acquired, for two stacked reasons worth designer attention: (a) at ash
grade their harsh riders made them genuinely bad buys versus clean drafts — the informed
play was to refuse; (b) the driver's static `perkPref` can't express "buy ward only when
its rider is mild," so the one attractive window (the seg-4→5 trade draw) auto-resolved
to a draft. Consequence: `sigil`/`release`/`transform`/`peeks` went unexercised this
run. Additionally I kept `carvers_sigil` deliberately last in the preference order
because **driver.mjs has no `transform`-phase handler** — drafting it would strand the
replay at `guard tripped` (driver limit, flagged rather than fought).

### Chain milestone — priced into a decision, never fired
No `the chain holds` event this run (best streak: 2 consecutive extends, twice). It DID
enter the seg-3 bloom-vs-floor pricing — and I initially mis-priced it: the milestone
pays on every 3rd *extend* (a 4-bead same-colour run), one bead further than my note
assumed. Which surfaces the legibility gap: **`G.chainRun` is not serialized** — there
is no state field showing milestone progress, so a player must re-derive it from the
colours history (including the corrupt/fray reset subtleties). One integer in `state`
(or the thread block) would fix it. It did not change any stop decision beyond seg 3's
already-negative bloom EV.

## Legibility issues (designer question 4)

1. **AGENT_PLAY.md protocol drift — the knot no longer exists.** The engine ends the
   run on snap (`doSnapEnd`: "No knot; a snap relic may one day grant a last cast";
   `doSnapToKnot` is dormant), but AGENT_PLAY.md still teaches the knot as the live
   consolation cast, the driver still accepts a top-level `knot` directive, and the
   report template still carries a knot column. Update the contract doc (CLAUDE.md
   requires it on protocol changes). Corollary: **declining the stitch is now strictly
   dominated** — `snap` ends the run for nothing, so the stitch/snap fork is no longer
   a decision; if that's intended, the snap action is dead protocol weight.
2. **"score +1 per symbol" means per DISTINCT symbol.** The Thousand Cuts paid +1 on a
   pure 3-mind weave (ctx.distinctSymbols), where the desc reads as per symbol
   instance. One word ("per distinct symbol") fixes it. Also quietly makes the card
   anti-synergise with mono-colour play — which would be a nice tension if disclosed.
3. **The ladder draw's event log doesn't list the offer.** The legacy path logged
   `the Fates offer: id(kind) | …`; the ladder path logs only
   `the Reward Ladder — ash draw: pick 1 of 3`. The offer lives in `state.perkOffer`,
   but the event stream (= the Run Record a human reads back) loses what was offered
   and declined — I had to side-replay the run to audit my own draws.
4. **Witness dup re-offer / stacking** (detailed above) — behaviour contradicts the
   documented "never re-offered" contract; whichever way the design lands, doc and
   engine should agree.
5. The board itself stayed honest: reach estimates tracked outcomes plausibly
   (2 misses in 7 attempts at estimates 77/77/54/47/77/35, both misses at ≤77 after
   cold spins), `metNow`/resolve never surprised me, and rider disclosure on cards was
   complete.

## Driver/harness notes (bit this session)

- Static, run-global `perkPref` cannot condition on grade/rider band — it silently
  bought the third Thousand Cuts over a mild-ridered Ward Sigil (seg 4→5 draw), and
  changing the pref mid-run would retro-change earlier picks (determinism replays the
  whole book), so it was left honest.
- No `transform`-phase handler in driver.mjs — Carver's Sigil is undraftable in a
  driver run without stranding the replay.
- Directives are pre-spin and immutable (known limit): seg 6 wanted a pivot when body
  never re-showed; the directive could not react.
- Driver auto-takes the stitch — now moot as a lost decision (see Legibility #1: the
  stitch is strictly correct post-knot-removal).
- Pause banner prints the wish only via the event log and never `state.wish.contract`
  progress; fine for this run (I side-replayed for it), but a
  `WISH: {...contract}` line in `pause()` would make jackpot play self-serve.

## Score strategy (next runs)

1. The jackpot lens generalises: read the wish FIRST, derive fang/stop policy from the
   contract, not from base EV — worth +25/+30 against typical 1-6 point rungs.
2. Buy reach verbs only at trade/royal grade (mild riders); at ash, draft. If the dup
   bug is fixed, ash drafts get more interesting (the common pool must deepen).
3. Hold one keep-slot's worth of restraint on fangs even under Fang-Fancier: the
   stitch-tray exclusion means the third kept fang can cost more than its wild is worth.
4. To exercise the untouched surfaces (sigil taps, release, peeks, twists,
   constraints, over-ink replacement, chain milestone firing), future focused runs
   should either use `--wish`/`--enchant` debug injectors or a driver with a perk
   pause — the natural draw composition plus a static pref reached none of them in 6
   segments.
