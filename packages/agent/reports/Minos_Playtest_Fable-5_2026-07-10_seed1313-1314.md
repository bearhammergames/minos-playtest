# Minos Agent Playtest — Fable 5 — 2026-07-10 — seeds 1313, 1314

**Build:** branch `generator-v2` (working tree), complete tuned Generator v2 (kernel + joint probe
+ snap-band with campaign numbers + dynamic rung-sets/apex). **Focus:** the Tuning Campaign
report §14 feel-validation list. **Conformance:** `npm run demo` → `demo: all runs clean` ✓.
**Method:** replay driver (`packages/agent/driver.mjs`), one directive per segment decided at the
pause, deliberate perk picks via the `perks` key (driver defaults endorsed-and-reconstructed or
overridden — every override annotated in the playbooks). Playbooks: `_tmp/playbook_1313.json`,
`_tmp/playbook_1314.json` (fully deterministic; replaying either reproduces its run byte-exactly —
verified by diff at three checkpoints on 1314).

## Runs

| seed | score | segments | knot | stitches | notes |
|---|---|---|---|---|---|
| 1313 | 20 | 3 (snap in seg 4) | cut (snap) | 0 saves / 1 miss | died on patron 2's EASY segment chasing a 17% bloom with fangs refused; 1 corrupt; Veiled boss survived via floor |
| 1314 | 449 | 14 (snap in seg 15) | cut (snap) | 2 saves / 1 miss | died at patron 5's BOSS at pSnap .479 vs target .45; 3 corrupts; apex offered seg 6 (Demanding One), escaped untested; chain body×13 |

(Note: on snap the engine CUTS the knot (`doSnapEnd`) — the driver never pauses for a knot
directive, so the brief's "driver pauses once more for the KNOT" only applies to a natural end,
which neither run reached. Both playbooks carry no `knot` key for that reason.)

## Focus verdicts

### 1. Pacing under the .05 ramp

**Seed 1314 (the full arc): the curve reads as designed and the ending felt earned.** 14 segments
across 5 patrons — above the bench's ~10 average but shaped right: a scrappy nofit-hard opening
(seg 1: predicted .16 vs target .06), a corrupt-funded midgame where three load-bearing fangs
bought blooms and etched harsh liens, two boss peaks that needed saves (seg 9 Hasty: stitch save;
seg 13: stitch save on a "44%" true), one clean exhale (seg 10: predicted .12 UNDER target .15,
the only merciful segment of the run — it one-spun and banked the milestone), then targets
.30 → .375 → .45 visibly crushing the board in patrons 4–5 (seg 11 bloom priced 0.4%, seg 14
bloom 0.8%, seg 15 a 2-rung rested set). Death came at the boss, 0.03 over the band target, with
the debt I had chosen (the lien locked my insurance fang all segment). I saw the wall coming at
the pause and said so in the directive note before spinning. That is an asymptote ending, not a
clamp cliff.

**Seed 1313 is the counter-arc: 3 segments, and the curve did NOT kill me — I did**, chasing a
16.7% bloom over a 57.5% true at patron 2's opener. But the board seeded it: that segment was
nofit-hard (.254 predicted vs .09 target) **with a 12.5% floor** — the survival anchor was the
WORST rung on the board. When the anchor doesn't anchor, the "safe" line is a 57% off-chain true
and everything else is a coin-flip; a greedy player (me) reads that as "no safe line anyway."
Anchor inversion showed 3 more times on 1314 (segs 4, 8, 9-boss, 11 — floor priced at or below
the true). If the floor's job is §survival, segments where it prices under 15% while a ceiling
rung prices 3× higher are the pacing rough edge I'd look at.

### 2. Seg-1 fairness

**Feels fair: tense, survivable, honest.** Both openings were nofit-hard but both resolved in 2
spins without fangs (1313: true 28% hit; 1314: floor 55% hit). Neither felt like a coin-flip
because a ≥32% floor always existed at seg 1 and the marker told the truth about the rest.
**But the campaign's "~.015–.04 above target" overshoot claim does not match what the telemetry
showed me at seg 1:** 1313 printed predicted .25 vs target .06 (+.19), 1314 .1625 vs .06 (+.10).
Either the §-claim measures something else (realized die@1 vs target, post-mercy aggregate) or
these seeds sit in a bad tail — flagging the discrepancy with both seeds attached so it can be
replayed. Also of note: **nofit-hard is not a patron-0 phenomenon** — it recurred at 8 of the 18
segment-deals I saw (1313: segs 1, 4; 1314: segs 1, 2, 5, 7, 11-pre-redeal, 13), i.e. most
patron-openers and several mediums. Realized outcomes stayed fine, but the marker reads less like
an "early clamp" and more like the default state of a debt-carrying hand.

### 3. Boss texture

Six boss segments seen. **Verdict: the band ×1.5 always shows up; the WISH only sometimes does.**
- **Deliberate peaks (great):** 1314 seg 9 (Hasty One, 2 spins + a spirit REST + Seized locks —
  survived only by the stitch, then "The Hasty One pays out: +1 spin" — the constraint+payback
  loop is fully legible); 1314 seg 6 (Demanding One — the apex boss, see §4); 1314 seg 15
  (Veiled One at target .45 — the death, and it felt like a boss killing me with my own liens).
- **Flat peaks:** 1313 seg 3 (Veiled One): the veil never mattered because the true gate priced
  5.4% — the veil hid a bloom nobody could reach; the segment played as "take your floor." 1314
  seg 3 (Fang-Fancier, jackpot species): zero physics, and her 3-bead contract was arithmetically
  dead on arrival (0 beads, 1 segment left) — the G3 "jackpot bosses carry no physics" note stands.
  1314 seg 12 (Generous One): one-spin bloom, free reroll never needed — anticlimax (though the
  band .375 is why it COULD have been a peak).
- **Death share:** 1 of my 2 deaths was at a boss. The non-boss death (1313 seg 4) was a
  self-inflicted gamble on a nofit-hard easy segment — consistent with the campaign's ~45%
  boss-share rather than contradicting it.
- **Species-stacking wrinkle:** 1314 seg 15 = Veiled One boss + composer rested mind → the
  2-rung set had NO bloom for the veil to hide. Twist made moot by the rest. Worth a rule:
  a veil boss should probably pin the bloom into the set.

### 4. The apex

**Appeared exactly once — seed 1314 seg 6, via The Demanding One (route b):**
`apex★(body·conc, ~28% reach)`, value 10, req `{body:2}` concentrated — keyed precisely to the
die-0 body face I had deepened one perk earlier. As composition it read as **earned richness**:
my strongest colour, my deepen, disclosed at boss start ("her condition: 4 rungs demanded — the
ceiling extends"), and the 4-rung hardened set still landed in band (.2125 vs .225).
**But it escaped untested, for a reportable reason:** the replay driver's target vocabulary
(`floor|true|bloom|chain|tight`) predates G4 — **there is no way to target an apex rung**. My
fallback (target the body true, hope die 0's deep face gets kept en route, let value-ordered
auto-resolve promote) died on spin 1 when the driver kept die 0's MIND face for the true's mind
slot, forechecking the deep face for the segment. So: offered ✓, legible ✓, chase-worthiness
**untested** (driver gap, not design gap).
**The intent-path apex never appeared:** power hovered .36–.43 all run — the rider/lien treadmill
never let pricedPower approach the .55 gate even at 14 segments with 2 grafts and a deepen. On
this evidence a default-debt player will only ever meet the apex through The Demanding One.
**Counterfactual glimpse worth a designer look (replayable):** on 1314, swapping the seg-5 Deepen
target from die0-body to die1-spirit made seg 6 compose the apex as `pure body` at
**reach_estimate 0** (and the bloom at 1.3%) — the forced `count:4` condition composes an apex
even when its reach is zero. A 0%-reach value-10 rung is pure noise on the board; the forced path
maybe wants the same "never filler" floor the intent path has.

### 5. The rest, the god-window, reach honesty

- **2-rung rest:** seen twice on 1314 (seg 9 pre-redeal variant, seg 15). Event copy — "the
  spirit/mind thread rests this segment — one fewer way to survive" — is excellent and honest
  (pNone visibly rose; seg 15 predicted .479). It never rested my live body chain ✓. The seg-9
  variant produced the most interesting board of the run: the rest made the BLOOM the de-facto
  anchor (43% vs floor 29%), i.e. the richest rung was also the safest — a genuinely novel
  decision texture.
- **God-window:** three windows on 1314 (after the seg-7→8 Scour, the seg-11→12 Warding etch, the
  seg-13→14 Graft), each opening with "the world lags behind your hand — your strength outpaces
  the weave (a comfort window opens)" and closing next segment with "the world catches up…".
  Copy is legible, the triggers were exactly the power-ups (the Scour one was instant, as
  designed). Each lasted 1 segment (α=.5 catches fast). The FELT effect is subtle at this power
  level — seg 12's one-spin bloom happened inside a window and did feel generous, but I could not
  have told you the offered set was leaner-priced without the telemetry. Not illegible, just quiet.
- **Reach estimates track outcomes — and beat my hand-math.** ~17% chases went 1-for-2, both to
  the final spin (1313 seg 2 corrupt-saved, 1313 seg 4 died). "33–44%" trues needed stitch saves
  twice (1314 segs 13, 15). The 75% floor one-spun; 51–57% floors two-spun. Where I estimated
  ~45% by naive per-die math on the 1313 seg-2/seg-4 blooms, the kernel's ~17% was the better
  predictor — the locks/erode/take-rate pricing is doing real work. One systematic caveat: the
  probe prices in take-rates for offered tempo (sigils, the Generous reroll) that the DRIVER
  never taps, so estimates mildly over-read for driver play (they'd be right for a human).

## Decision log highlights (all replayable from the playbooks)

1. **1313 seg 2 — the reach-vs-gut test.** Bloom body quoted 17.5%; my hand-math said 40%+. I
   chased. It came down to the last spin and only a load-bearing fang landed it — corrupt, harsh
   Seized Spin lien. The probe was right; that lien then locked dice ~6 more times across the run.
2. **1313 seg 4 — the fang refusal that died.** Same-shape chase (16.7%) with `keepFangs:false`
   after 3 banes. Missed by one body; the stitch tray drew the dead mana face twice; SNAP.
   Post-mortem: no fang showed on the final spin anyway — the refusal never actually decided
   anything; variance did. Refusing felt right at 3 banes; dying to it felt like my bet, not the
   game's.
3. **1314 seg 7 — the rider with teeth.** Final spin, die 4 rolled the bloom-completing body — and
   its Errant Spin rider RESPUN IT INTO CHARM, forcing the fang to carry (corrupt #3). A mild
   rider converting a clean bloom into a corrupt one is the debt-front-door working exactly as
   written, and it was completely legible in the event log.
4. **1314 seg 9 boss — the stitch save.** Hasty One (2 spins) + Seized locks on both spins + a
   43% bloom-as-anchor: no rung met, stitch flew, "STITCH SAVE — resolved bloom (body) for 6 × 3."
   Then the wish PAID OUT +1 spin. Best-feeling segment of the session.
5. **1314 seg 15 — the earned death.** True needed `body2+mind1+mana1`. The driver kept die 2 —
   the only mana die — on a BODY face (greedy-keep gap); Seized Spin locked the fang (the only
   other mana source) for the entire segment; the stitch excludes fangs. The three liens I bought
   in segs 2/4/7 assembled the death. Harsh, legible in hindsight, invisible at decision time —
   which I think is what a debt model is supposed to feel like.

## The four designer questions

- **When did you stop and why?** Every directive was stop-at-target; I one-spun or two-spun 6
  segments on 1314 (Patient Needle paid +4 × 3). But a structural observation: `metNow` is
  monotone (keeps are final, a met rung stays met), so once ANY rung is met, spinning on toward a
  higher rung is nearly free — the only live costs are on_keep banes and fang temptation. The real
  stop decision is therefore WHICH colour to commit keeps to on spin 1, not when to stop spinning.
  If the designer wants "the stop is the choice" to bite per-spin, something must make late spins
  costly (the curse family does this today only sparsely).
- **Did you ever refuse a fang?** Once deliberately (1313 seg 4, `keepFangs:false` at 3 banes) —
  and the refusal turned out to be causally irrelevant (no fang showed at the wire). Every
  lastResort fang-keep that DID fire (1313 seg 2; 1314 segs 4, 5, 7) was correct at the moment
  (corrupt-vs-dead is no contest) and expensive later: three harsh Seized Spin liens ultimately
  locked the insurance fang at the death boss, and Curse drain took -42 of 1314's ~490 gross
  (-8 of 1313's 28). The fang's cost LANDS, but as a slow tax with one dramatic payoff, not as a
  pick-time deterrent — at pick time it still never feels wrong.
- **Where did the curve bite?** 1314: patron 5 (targets .30/.45) — seg 13's "44%" true needed a
  stitch, segs 14/15 blooms priced ≤1%, seg 15 killed me. Tension was real from patron 3 onward
  (every boss went to the wire); DOOM only arrived exactly at the end. 1313: the bite was seg 4's
  anchor inversion (floor 12.5%) — early doom driven by hand shape, not segIndex.
- **Was anything illegible?** (a) Run-1's body×3 chain scored ZERO combo/streak lines at the
  tally — chain investment under ~5 reads as worthless and nothing warns you (1313 tally:
  `COMBOS: []`). (b) The Generous One's desc still says "a free reroll EACH segment" while the
  physics are boss-only — stale copy vs the greybox change (1314, patron 4). (c) The pips
  multiplier on the score line ("resolved bloom for 6 × 3 pips") is never explained anywhere in
  state — I inferred it as woven-pips-of-req. (d) The veil-with-no-bloom collision (1314 seg 15).
  (e) Positive: `nofit-hard`, the rest event, the window pair, the wish payout, and the lien etch
  events were all immediately understandable at the pause.

## Bug-suspects & harness gaps (ranked)

1. **Forced apex ignores the reach floor** (1314 seg 6 counterfactual): The Demanding One's
   `count:4` can compose a `pure` apex at `reach_estimate: 0` — "never filler" holds for the
   intent path but not the forced path. Replay: playbook_1314 with perk 6 as bare `{card:1}`.
2. **Driver: no apex target** — the replay driver's directive vocabulary predates G4; an apex can
   only complete by accident. Add `"apex"` (and maybe `"rest"-aware chain fallback) before the
   next validation round.
3. **Driver: `legal[0]` default perk is pathological** — it parked Shift banes onto die 0 face 0
   five times on 1314 (the deepened apex face!), Twin-Etched a bane-carrying face, and on 1313
   Excised a face off the die it had just Grafted. Stale `perkPref` (old pool ids) makes the
   fallback fire constantly. Cheap fix: a sane bare-auto preference list for the new pool.
4. **Driver: greedy keeps can spend a unique ingredient die on a generic slot** — the 1314 death
   (die 2, the only mana source, kept as body). A "rarest-source-last" keep heuristic would make
   driver play match the probe's focused line much better.
5. **Driver: never taps sigils / wishReroll / release**, while the probe prices their take-rates —
   estimates mildly over-read for driver play (visible on the Generous boss, 1314 seg 12).
6. **Seg-1 overshoot telemetry vs campaign claim** (§2 above): +.10 to +.19 observed at seg 1 on
   both seeds vs the claimed ~.015–.04. Possibly a metric mismatch; replayable.
7. Minor copy: Generous One "each segment" (stale); chain-milestone resets on corrupt are silent
   (I only deduced why my ×3 chain hadn't banked a spin).

## Score strategy (next 5 runs)

Commit to the hand's richest colour at seg 1 and never leave it except for anchor-inverted
boards; treat ~17% blooms as boss-only bets; buy Deepen > Graft > witness > anything, and Scour
the first harsh lien the moment a royal offers it (the seg-8 Scour bought the best two segments
of the run); park all Shift banes on the mana face; and if the apex ever appears with an
apex-aware driver, a concentrated body:2 at 28% for value 10 is the best price the late game
offers — take it over any bloom.
