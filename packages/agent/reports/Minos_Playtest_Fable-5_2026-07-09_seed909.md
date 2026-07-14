# Minos Agent Playtest — Fable 5 — 2026-07-09 — seed 909 (generator-v2 branch)

**Focus:** how the new snap-band generator FEELS (G1 physics kernel, G2 joint probe, G3
band/lag/ceiling, all native-on). Branch `generator-v2` @ `387998f`. Conformance:
`npm run demo` → `demo: all runs clean` before play.

**Method:** replay-driver pattern (`packages/agent/driver.mjs` semantics; a print-only
telemetry copy at `_tmp/driver_t.mjs` — identical action behaviour, additionally prints
`state.generator` / patron / wish at each segment). Playbook: `_tmp/playbook_909.json`
(quoted below). One full informed run; run length 6 segments ≥ the 4-segment threshold, so
no second seed was required.

## Runs

| seed | score | segments | knot | stitches | notes |
|---|---|---|---|---|---|
| 909 | 136 | 6 | none (cut in-engine — driver never pauses for it) | 1 attempted, missed | snapped seg 7 chasing a 44% bloom with the contract already met; death by greed, not attrition |

Score lines (seed 909): Strands woven (6) 37 · Length 6 · Ingredients 5 · Colour streak 10 ·
Chains 15 · Miracles 5 · Depth woven 30 · Curse drain −2 · Weave patterns 30 (✺ Five of a
Kind). Chain: mind×6, never broken. Thread corrupt from segment 1 (one load-bearing fang).

## Generator telemetry vs outcome (the honesty ledger)

| seg | pSnapTarget | pSnapPredicted | fit | power | pricedPower | window | boss | outcome |
|---|---|---|---|---|---|---|---|---|
| 1 | .060 | **.242** | nofit-hard | .4285 | .4285 | – | – | true(mind) — saved by a load-bearing FANG on the last spin (corrupt + harsh lien) |
| 2 | .100 | .150 | nofit-hard | .3882 | .3882 | – | – | floor(mind) on spin 2, 1 spin unused |
| 3 | .150 | .200 | nofit-hard | .4028 | .4028 | – | boss (Chain-Keeper, jackpot: no physics) | true(mind) on spin 2, 1 spin unused |
| 4 | .078 | .150 | nofit-hard | .4188 | .4122 | **true** | – | **bloom(mind) 6×3 — the god-window segment paid the run's biggest tally** |
| 5 | .130 | .100 | (in band) | .3493 | .3493 | – | – | floor(mind) on spin 2, 3 spins unused |
| 6 | .195 | **.346** | nofit-hard | .3389 | .3389 | – | boss (Grasping Widow, keepCap 2) | true(mind) on the literal last spin, no fang needed |
| 7 | .096 | .129 | nofit-hard | .3389 | .3389 | – | – | **SNAP** — bloom(mind) 44% missed over 5 spins; stitch flew and missed |

Sum of predicted P(snap) over the run ≈ 1.32 expected snaps; realized = 1 snap + 1
fang-save + 1 last-spin boss escape. The predictions read true at run grain.

## Decision-log highlights (from `_tmp/playbook_909.json`)

1. **Seg 1 — the honest inversion.** floor(spirit) ~31% vs true(mind) ~40%: the floor read
   BELOW the true because 2 spirit pips were scarcer in the hand than the mind/charm spread.
   Directive: `"true(mind) 40% reads ABOVE floor 31% (honest inversion…) open a mind chain"`.
   Outcome: hit, but only via last-resort fang → corrupt + harsh Seized Spin lien. The
   inversion was correct — I trusted it and it told the truth.
2. **Seg 4 — the god-window.** After the 2nd Graft: `window:true` (power .4188 > priced
   .4122) and the offer held bloom(mind) at **29%, above true(spirit) 25%** — richer, worth
   6, in my chain colour. Directive: `"GOD-WINDOW open… the window's richer offer, push for
   it"`. It landed: 6×3=18 + threeOfAKind + chain milestone (+1 spin banked). The window
   FELT like a reward — a visibly richer shelf, not an easier one.
3. **Seg 6 — the boss double-squeeze.** Widow keepCap 2 + band ×1.5: target .195, predicted
   **.346 nofit-hard** — the run's peak tension, disclosed up front. Also the second honesty
   datum: floor(body) 28% < true(mind) 40% because **the debt ink sits on the body dice**
   (harsh lien die 0, mild riders die 1) — the kernel prices WHERE the debt lives. Survived
   on the final spin's exact face. Tense-but-fair is precisely what it felt like.
4. **Seg 7 — death by greed.** bloom(mind) topped the board at 44% (floor 34%, true 20%),
   worth 6, chain-extending, Reweave spin banked. I pushed; had mind2+charm by spin 3 of 5
   and the third mind never came; Seized Spin locked the charm die on the last spin; the
   stitch missed. A 44% shot missing is not a lie. Floor(spirit) 34% was the survival line
   and I declined it with open eyes.

## The stop decision

Stopped at target the moment it lit in segs 2, 3, 4, 5 (leaving 1–3 spins unused each time;
`stopWhen:"target"` throughout). The driver cannot pivot mid-segment: in seg 7, a live
player holding mind2+charm after spin 3 would at least consider hedging into floor(spirit)
keeps — the directive-immutability limit bit exactly once, on the fatal segment. Honest
data, but worth remembering when reading the snap.

## Fang economy

Policy `lastResort` all run. Refused fangs on spins 2–3 of seg 1 until the final spin forced
the insurance (corrupt + harsh lien — the price was REAL: that lien alone kept the fitter in
nofit-hard for the whole run and cost −2 curse drain at tally). Refused a fang on seg 7 spin
4 (rollsLeft 1, per policy) — defensible: die 5 could still roll the needed mind. The
stitch-fang exclusion then produced the run's one table-feel wart (below).

## Difficulty curve — the band verdicts (the focus questions)

- **TENSION / "does the mercy overshoot?" — inverted in practice.** The band ASKED for
  gentle (.06 → .078 → .096 early targets) but could not deliver it: **6 of 7 segments were
  `nofit-hard`** — the easiest set the generator could compose for this debted 6×d3 hand sat
  2–4× ABOVE target (seg 1: target .06, predicted .24). The early game is not too safe; the
  band's mercy is aspirational and the CONTENT FLOOR is the real early curve. The bench's
  die@1 ≈ 0% is plausibly fang/stitch insurance absorbing that .24, not band mercy. Tuning
  lead: track the fit-flag rate on the bench — while most segments are nofit-hard, the ramp
  (+3%/patron) isn't governing anything and sweeping it will look inert.
- **Run length felt natural.** 6 segments (bench 4.5–16.6): ended in a push I chose, on the
  mildest-predicted segment of the back half (.129) — the run did not drag, and the end
  read as my fault, which is the good kind of ending.
- **HONESTY: pass.** Both floor/true inversions tracked verifiable hand structure; the 70%
  and 77% floors hit inside 2 spins; the 44% death-bloom had 2 of 4 pips by spin 3 and
  plausibly missed; the ledger above sums to ~1.3 expected snaps vs 1 realized + 2 near
  things. No estimate read false. The retired "~/⚠" caveat was correctly absent.
- **GOD-WINDOW: pass, with one designed subtlety.** The window opened exactly once (seg 4,
  after Graft #2) and the very next offer was the richer-in-my-colour bloom that paid 18.
  Subtlety: Graft #1 opened NO window because it landed the same beat as the harsh fang
  lien — debt prices down through `min(power, EMA)` instantly and eats the graft's lag.
  Correct per design; a player who grafts while freshly corrupted will never see their
  window and may feel the card lied. Consider surfacing this (the client could show the
  window state).
- **WEAKNESS REPRICING: survivable, yes.** Rider accumulation dropped power .42 → .35 and
  the world answered with a 77% chain-colour floor and the run's only in-band fit (seg 5) —
  reachable rungs, not over-hardened ones. But the DEBT EXITS never came: in 7 ladder
  draws I saw exactly one Scour (seg 1, before my cleanse-first `perkPref` was set) and
  zero Absolve after; my declared pref `["absolve","scour",…]` never matched an offer. The
  drip in (5 riders etched) vastly outpaced the exits offered. Feels-survivable but
  smells-unpayable; check the reach-channel's cleanse card weights.
- **BOSS STAGING: fair now.** The Widow boss was the run's honest peak (.346 predicted,
  disclosed keepCap, survived by play) — deliberate and readable. Note: when the wish is a
  JACKPOT species (Chain-Keeper), the boss segment carries only the ×1.5 band and no
  physics — boss #1 (target .15/predicted .20) accordingly felt like a mere Tuesday. Boss
  texture currently depends heavily on wish species.
- **CEILING: richer, not easier — visible.** As the deck grew (two grafts, 6→4-face drums),
  chain-colour blooms climbed 4.6% (seg 2) → 29% (seg 4) → 44% (seg 7) while floors held
  ~28–49% — the generator reached for deeper shapes in my strong colour rather than
  flattening difficulty. This is the intended power-to-ceiling feel and it's already
  legible in one run.

## Legibility issues

1. **Chain-Keeper's contract is degenerate at patronLen 3** (bug-suspect, both directions):
   patron 1's `chainAlive target:4` was mathematically impossible (max chain = 3 by patron
   end from a fresh thread; it duly failed 3/4), and patron 3's identical contract signed
   **pre-met** (run-long chain already 6). Either scale the target to patronLen or make it
   relative ("keep your chain alive through my patronage").
2. **Stitch-fang exclusion reads like a bug at the table:** the seg-7 stitch landed a fang
   on die 5 and still "missed" — correct per rules (fangs excluded from the stitch's
   answer) but the event log shows a wild sitting in a losing tray. Wants a line of copy
   ("the fang does not answer the stitch").
3. **Bare-Shift ping-pong:** the driver's default picks moved the same harsh lien die0
   f0→f1 (perk 2) then f1→f0 (perk 5). Both were auto-picks, but the bare parking heuristic
   happily oscillates on one drum — a cheap guard (exclude the bane's previous face?) would
   stop replays reading silly.
4. **Driver limits that bit (protocol, not engine):** (a) perk encounters are auto-consumed
   before the next pause — deliberate picks require pinning history (`perks[]` replay
   entries; I probed and pinned encounters 1–2, then governed 3+ by declared `perkPref`);
   (b) no mid-segment pivot (seg 7 hedge, above); (c) the driver auto-took the stitch — I
   endorse that take, but it wasn't a decision.
5. **Segment-1 telemetry is invisible at the first pause** — the stock driver prints no
   `state.generator`; I patched a print-only copy. Given G5's tuning campaign will want the
   fit-flag rate, the driver should print the GEN block natively.

## Score strategy (next 5 runs)

Same chain-first spine (mind Concentration + milestone spins compounded well), but: hedge
the late blooms (target bloom only with ≥2 pips of it already kept by mid-segment — the
driver would need a hedge directive to express this); refuse the seg-1 fang insurance if a
Second Skin-style cleanse ever shows (the lien defined the whole run's fit); and test
whether an early Excise on the mana/fang faces raises `power` enough to pull the fitter
into band, which this run never saw before seg 5.

---
*Playbook (decision log): `_tmp/playbook_909.json` · telemetry driver copy:
`_tmp/driver_t.mjs` (print-only diff of `packages/agent/driver.mjs`). Every number above
replays from seed 909 on `generator-v2` @ `387998f`.*
