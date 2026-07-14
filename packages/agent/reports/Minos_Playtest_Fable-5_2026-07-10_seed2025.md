# Minos Agent Playtest — Fable 5 — 2026-07-10 — seed 2025

**Focus:** field-check of the G5a tuning campaign's STRUCTURAL RESIDUAL (viability dial:
zealot 0.42× / miser 1.7× median — diagnosed as a witness-layer issue, not a band lever).
Played a deliberately bloom-chasing (zealot-line) run on the tuned `generator-v2` build
(ramp .05), informed, via the replay driver. Playbook (the full annotated decision log):
`_tmp/playbook_2025.json`. Conformance: `npm run demo` → `demo: all runs clean` before play.

## Runs

| seed | score | segments | knot | stitches | notes |
|---|---|---|---|---|---|
| 2025 | 1026 | 21 | none (snap; knot is cut in-engine) | 4 saves + 1 miss (the miss ended the run) | 7 clean blooms, 0 corrupts, zealot inked at draw 14, died seg 22 to rider-debt compounding on a 61% true |

Run went 21 segments (well past the ~4-segment threshold), so the single seed covers the brief.

## Decision log highlights (all replayable from the playbook)

1. **seg 2 — the first real chase.** Bloom(mind:3+charm:1) priced **26.7%** vs true 28% /
   floor 52%. EV: bloom ≈ .267×(18 base + 5 miracle) ≈ 6.1 vs floor ≈ 1.0. Chased, landed
   spin 2. When the band prices a bloom near the true, the chase is simply correct.
2. **seg 13 — the flagship floor-vs-bloom moment** (the brief's direct question). Floor 66%
   vs mind bloom 22.9% (true mana-gated at 1.7% — effectively absent). Paper math: bloom EV
   ≈ 6.0 vs floor ≈ 1.3, **but** a miss risked ~25–30% run-death against a 12-bead banked
   thread whose future depth ticks were worth ~40–57/segment. The math said coin flip; a
   five-bloom build *felt* like it should chase without hesitation. That gap between feel
   and math IS the zealot's 0.42× — see the verdict below. (Chased; landed spin 3; the
   royal draw then finally offered The Zealot.)
3. **seg 15 — the mirror bent a "met" pool, legibly.** Kept mind:2+spirit:1+charm:1 (the
   true's exact req) but the Mirrored One zeroed the lowest kept face — `metNow` honestly
   refused it, three spins failed, and the stitch landed the true for 3×4. The preview
   never lied. Best boss texture of the run.
4. **seg 21 — a stitched bloom at the band ceiling (.60).** Chased an 11.3% body bloom with
   a banked spin; the mirror zeroed my kept mana four spins running; the stitch tray came
   back body-heavy and resolved **bloom 6×4 = 24, "The Zealot speaks — +4."** The
   desperation re-throw completing the ceiling rung was the run's best moment.
5. **seg 22 — death by debt, not by band.** pSnapTarget was only .27 (patron-8 easy stage)
   and the true read 60.8%, but Errant Spin, Slipspin, and the Seer's coupled bane rerolled
   the completing dice out from under three consecutive spins, and the stitch tray held zero
   charm. The accumulated rider blemishes (5+, all from auto-picked ridered reach cards)
   killed the run at a segment the band had priced as comfortable.

## THE FIELD-CHECK VERDICT: the zealot diagnosis

**The campaign's "witness-layer, not a band lever" diagnosis is half right. "Not a band
lever" is fully confirmed. But the witness PAYOUT MAGNITUDES are the smallest of four
structural terms — the dominant one is the DEPTH BONUS in the scoring layer.**

Score composition of this 1026-point, 21-segment, 7-bloom run:

| line | pts | share |
|---|---|---|
| Depth woven (`DEPTH_BONUS {from:3, base:3, step:3}`, session.mjs) | **570** | **55.6%** |
| Strands woven (of which the 7 blooms: 132) | 201 | 19.6% |
| Weave patterns (Five-of-a-Kind 30, Stitch×3 30, Deep Weave×3 18, Double Trinity 10) | 88 | 8.6% |
| Chains 43 · Miracles 35 · Streak 26 · Length 21 · Ingredients 17 · Trinity 11 · Mixed 8 | 161 | 15.7% |
| **Witnesses (Zealot 2 fires: +2, +4; Deep Ink: 0 fires in 21 segments)** | **6** | **0.58%** |

1. **Band: EXONERATED, with data.** Every bloom that priced ≥20% was chased and landed
   (segs 2, 4, 6, 7, 13, 16 — five in-spins, one on spin 1). Blooms priced ≤11% missed as
   predicted (seg 21's stitch rescue notwithstanding). Reach estimates tracked reality all
   run — the mirror-warped and debt-laden segments priced visibly lower and played that way.
   Bloom rungs are NOT underpaid by the band's pricing; when the menu offers a live bloom,
   chasing it is correct and the game rewards it (a landed bloom paid 18–24 base vs a
   floor's 2–3, plus miracle/combo tail).
2. **The depth bonus is the real spread engine.** It pays `3+(segIndex−3)×3` per survived
   segment — cumulative-quadratic in run length, and **tier-blind**: a floor cash banks the
   same tick as a bloom. At seg 21 one more survived segment = +57 guaranteed points ≈ 10×
   this run's ENTIRE witness line, ≈ 2× a landed bloom's full package. So the marginal
   value of survival GROWS every segment while the bloom's marginal payout stays flat
   (~25 over a floor) — past ~seg 10 every rational player is a miser, whatever their
   witnesses say. Miser 1.7× / zealot 0.42× is mostly this term compounding: 21 segments
   → 570 depth; a 4.8-segment zealot median run → ~21. The campaign's phrase "witness/
   scoring layer" holds only if DEPTH_BONUS is named as the scoring-layer lever; the
   witness payloads themselves (±2–6 pts) are noise at both ends of the spread.
3. **Witness layer: broken for zealots, but at the EXPOSURE and SCALING level, not raw
   magnitude.** (a) *Exposure famine:* the_zealot (rare, weight 2) first appeared at draw
   **14 of 22** (segment 13); bloomkeeper never appeared in 22 draws; miser_eye was offered
   **three times** unprompted; patient_needle/thousand_cuts appeared in nearly every ash
   draw. A player deliberately building the zealot engine could not buy it for 12 segments.
   (b) *Growing-from-zero:* the zealot's growing payload counts only post-ink fires — the
   five blooms landed before draw 14 paid it nothing; final total 6 pts on a seven-bloom
   run. The miser's flat +3 pays from wherever it's worn — no ramp-up tax. (c) *Dead
   support witness:* Deep Ink (drafted seg 1, filter depth≥3 pips) fired **zero times in 21
   segments** because no Deepen was ever offered (see 4) — the hand ended the run all-mag-1.
4. **Bloom AVAILABILITY is the second structural term (composer/menu, not band targets).**
   Only 6 of 21 segments carried a bloom priced ≥20%. The rest were dead by construction:
   **mana-gated shapes ×7** (true/bloom demanding mana:1 against a 1-mana hand — priced
   0.0–4%), **concentrated shapes ×2 at 0.000** (require a deepened face; **22 draws
   offered zero Deepens** — the G3 famine note reproduced live, G5a §12.6 confirmed),
   **pure shapes ×2 at ≤0.8%**, plus two composed 2-rung sets with **no bloom axis at all**
   (segs 15, 20). The fitter is holding the band by shipping unreachable ceilings as
   tension filler — "richness" that cannot be bought. A zealot identity is only
   *expressible* ~30% of segments; the other 70% it is forced to play miser or die.
5. **Combo values: minor, and they cap.** Miracles (+5 each) and Deep Weave ×3 (+18, one
   tier only) genuinely drove my chase EV early — but they are flat/one-shot and stop
   scaling after bloom 3, exactly when the depth stream starts outgrowing them.
6. **A fourth anti-zealot term nobody named: the fang.** A load-bearing fang corrupts the
   bead — which kills the Miracle, breaks Deep-Weave/N-of-a-Kind windows, and voids the
   chain. The corrupt cost lands SPECIFICALLY on bloom-chasers (a miser's floor loses
   almost nothing to corruption). Refusing fangs is near-mandatory on this line — see
   Fang economy below.

**Recommended levers, in order:** (1) make DEPTH_BONUS tier-aware (e.g. bloom segment ticks
×1.5–2) or otherwise let greed compound the way survival does; (2) fix zealot-line draft
exposure (weight/pity for build-defining rares, or credit prior blooms at ink time);
(3) composer guard: don't ship concentrated/mana-gated ceilings the hand cannot express
(gate them like the apex gates on power) — a dead ceiling is a 2-rung segment wearing a
3-rung costume; (4) only then revisit payload magnitudes (+2 growing vs +3 flat is not the
main event).

## The apex question

**The apex never arrived — not late, never.** 21 segments, 8 patrons, and `power` peaked at
~0.464 (pricedPower ~0.457) against `apexPowerGate` 0.55. The reward economy this run
offered (grafts + sigils + debt verbs, zero Deepens) adds faces — which self-price — so
power never climbs; the value-10 apex is gated behind a hand strength the ladder never
sold me. On this seed the apex cannot rebalance the deep line because it is unreachable;
"arrives too late" is optimistic — check whether ANY archetype's realized power crosses .55
in the bench telemetry before trusting the apex as the late-game bloom answer.

## The four designer questions

- **When did you stop and why?** Almost never voluntarily — 15 of 21 resolves fired the
  moment the target lit (spins left on the table at segs 1, 2, 4, 5, 7, 11, 13, 14, 16
  per the log). The two-sided reason: early stops protect the chain, and the driver
  resolves on target-met (no "overshoot for a richer rung" verb — a driver limit worth
  noting; a human might have kept spinning at seg 14's met floor to fish the 5.8% bloom).
  My genuine stop-policy: cash instantly on met when the next tier read <15%; push
  otherwise.
- **Did you ever refuse a fang?** Yes, structurally — `lastResort` all run, and fangs were
  kept only 3 times, never load-bearing (0 corrupts, no lien ever etched). On a bloom line
  the fang's cost LANDS: a corrupt bloom loses the +5 miracle, the Deep-Weave/ofAKind
  windows, and the chain — ~15+ pts of tail vs a floor's ~2. The fang economy works as
  designed against zealots; arguably too well (it is one more term in the anti-greed stack).
- **Where did the curve bite?** Segs 15–21 (patrons 5–7): bands .40–.60, composed 2-rung
  sets, predicted snap .42–.57 — every segment a coin flip, survival increasingly
  stitch-carried (4 saves). But the actual DEATH came at seg 22's band .27 from
  **accumulated rider debt** (three bane families firing every spin), not from the band.
  The G3 open question — rider-debt treadmill vs ramp — reads WORSE under ramp .05: the
  run outlived the band's designed wall and was killed by its own perk debt. Also seg-1
  fairness: `nofit-hard` opened the run (target .06, predicted .10) and it felt completely
  fair — floor 73%, three live rungs. The campaign's "honest clamp" claim holds in the field.
- **Was anything illegible?** Two real items. (1) **The veil leaks:** seg 9's segment-start
  event printed `bloom(mind·conc, ~0% reach)` while `state.rungs` correctly showed only
  `{tier:"bloom", veiled:true}` — the event discloses the veiled rung's colour, shape, and
  reach. Info-leak bug (minor here since the rung was dead anyway, but it defeats the twist).
  (2) **A veil that cannot lift:** the same composed 2-rung set had NO True rung — the
  Veiled One's lift condition ("meet the True") was unsatisfiable all segment. Composer ×
  twist interaction worth a guard. Honourable mention: `bonuses.bonusSpinsBanked` always
  printed 0 at pause even when a milestone/payout spin was banked (it is consumed into the
  segment before the pause) — telemetry nit, confused me twice.

## Feel verdicts (general)

- **Pacing under ramp .05:** good shape — tension climbed legibly (.06 → .60 across 8
  patrons), the mid-game (segs 4–12) was the best stretch (real choices every segment),
  and the run ended by asymptote, not by cliff. But 21 segments is double the tuned mean —
  the stitch net (4 saves) plus rider-RNG variance carried me far past the design intent,
  and the last third was a bloomless floor treadmill that overstayed its welcome by ~3
  segments. The top-end content ceiling (§5 read 6) is FELT: late sets got *narrower*
  (2-rung, dead ceilings) rather than *richer*.
- **Seg-1 fairness:** fair. nofit-hard marker present, realized mercy fine (73% floor).
- **Boss texture:** Mirrored One is the star (bends resolves legibly, created both my
  hardest fail and best save). Constraint bosses (Hasty/Widow/Fevered) read clearly and
  their payouts (+1 spin) land. The Veiled One was a dud on both encounters here (see
  illegibility). Jackpot patron (Chain-Keeper) arrived only at seg 22 — no read.
- **Reward ladder feel:** the rider-debt economy is the shadow protagonist. Every ridered
  pick (auto-picked by the driver's `cards[0]` fallback — noted harness bias, it plays
  Graft/Shift-first like a miser) added a blemish; by seg 17 three bane families fired
  nearly every spin and eventually ended the run. Meanwhile the offers I actually wanted
  (Deepen, bloomkeeper, the zealot) never or barely surfaced. Draw variety felt like the
  same six cards after patron 3.

## Bug-suspects (all seed 2025, replayable from the playbook)

1. **Veiled-rung info leak** — segment-start event discloses the veiled bloom's colour/
   shape/reach (seg 9, seg event vs `state.rungs`).
2. **Veil with no True rung to lift it** — composer 2-rung rest × Veiled One (seg 9).
3. **Dead-ceiling composition** — mana-gated (×7) / concentrated-with-no-deepen (×2) /
   pure (×2) rungs priced 0–4% shipped as the segment's entire ceiling; plus **zero Deepen
   offers in 22 draws** (famine, §12.6) making `concentrated` structurally impossible.
4. **apexPowerGate unreachable** — power ceiling ~.46 over 21 segments; apex never entered.
5. **Driver (not engine):** lastResort kept a wasted fang at seg 3 because the true filler
   (charm) sat later in tray order; `stopWhen:"target"` and `"push"` are behaviourally
   identical in driver.mjs (both resolve at target-met or spins-out); driver auto-takes
   the stitch (fine — I'd have taken all five).
6. **Telemetry nit:** banked bonus spins never visible at a pause (consumed pre-pause).

## Score strategy (next 5 runs)

Draft the witnesses that actually fire (patient_needle on a stop-early line, thousand_cuts,
the_edge on a push line) instead of holding out for the build-defining rare; refuse ridered
reach cards past 2 blemishes (the debt treadmill is deadlier than the band); chase any
bloom ≥20%, never below 12% before seg 15; treat mana-gated/concentrated/pure ceilings as
absent; play for depth ticks past patron 5 because nothing else scales.

*Playbook: `_tmp/playbook_2025.json` (12 annotated segment directives). Build: branch
`generator-v2`, working tree over e4997c6. Driver: `packages/agent/driver.mjs` (replay
pattern). Conformance `npm run demo` clean before play.*
