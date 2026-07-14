# Minos — Generator v2 Tuning Campaign — 2026-07-10 (G5a)

*The first numbers-derivation campaign: the §4 acceptance dials wired into the bench
(Part A, the instrument), then swept (Part B, the campaign) via the §C0 balance-override
channel. Branch `generator-v2`. Every table here is reproducible: deterministic seeds,
named configs, artifacts in `reports/sweeps/`.*

> **STATUS: COMPLETE (2026-07-10).** The chosen config — **`generator2.band.ramp .03→.05`,
> one number** — is SET in balance.js NUMBERS (comments flipped to bench-derived); both
> seg-1 expressibility branches were swept and REJECTED with evidence (§6b); ⚖3.12's 2/3/4
> spin test was RUN and reported (§7, verdict the designer's); the final n=30 read is §9.
> **Sweep wall-clock actuals: 66.6 min of staged sweeps** (coarse-invalid 9.4 + coarse 14.3
> + refine 25.6 + spincap 9.4 + final 7.9) + smoke runs + gates ≈ **~1.9h total** — inside
> the ≤2.5h budget. 2,352 campaign bench runs, 0 runaways. Gate tails at the end (§13).

---

## §1 The instrument (Part A — what was built)

- **`packages/agent/bench_core.mjs`** — the shared play-and-collect engine (extracted from
  `archetype_driver.mjs`): one long-lived agent_cli process, the 7 archetype policies, and a
  per-segment telemetry collector reading `s.generator` ({pSnapTarget, pSnapPredicted, power,
  pricedPower, window, fit, rungCount, rested}) plus the realized snap and the patron/boss
  position per segment. A run's `new_run` action carries the §C0 `balance` override map — the
  sweep mechanism; `{}` is byte-identical to defaults.
- **`packages/agent/acceptance.mjs`** — the eight §4 dials, pure: die@seg-1 (raw snap, per-
  archetype + aggregate), mean run length + spread, viability spread, boss-death share,
  p99/p50 pooled score ratio, predicted-vs-realized P(snap) binned MAE, fit-flag rates by
  patron index (the playtest's ask), probe ms/segment. Emits the printed dial table + a
  machine-readable JSON block.
- **`packages/agent/perf_probe.mjs`** — the probe-cost dial: times pure `generateSegment`
  over a fixed hand×patron battery under a config's overrides (timing only, never state/rng).
- **`packages/agent/sweep.mjs`** (`npm run sweep <stage>`) — named-config stages; one
  acceptance report per config + a comparison table; artifacts `reports/sweeps/<stage>.json`
  + `<stage>_compare.txt`.
- **`packages/agent/tests/acceptance_test.mjs`** — 25 pure assertions on the dial math
  (synthetic rows/segments; every dial hand-checked, runaway exclusion, n/a verdicts).
- `npm run bench` now prints the legacy table (numbers unchanged on defaults) + the dial
  table, and takes `--out file.json` / `--no-accept`.

**Telemetry note:** realized P(snap) is counted at the segment level (a stitch-phase entry or
a terminal snap marks the segment `snap=1` — the primary resolve failed), which is exactly
what `pSnapPredicted` predicts (P(no rung met)). die@seg-1 uses the RAW seg-1 snap; the seg-1
DEATH rate (stitch-suppressed) is reported alongside for context.

## §2 The override collision (found + fixed this session — load-bearing for every sweep)

`'generator2.band'` is BOTH a boolean gate (`on('generator2.band')`, BALANCE) and a numbers
object (`num('generator2.band')`, NUMBERS) — the same dot-path. A §C0 override of the whole
band OBJECT therefore made the gate read non-true and **silently turned the band OFF** — the
first coarse run swept the LEGACY DECAY path 6 times over (identical degenerate rows: die@1
34.5%, run μ 3.5). Fix: dedicated per-leaf numeric keys in `generateSegment` —
`generator2.bandBase0 / bandRamp / bandFitTol / bandEasy / bandBoss / bandFloor / bandCeil` —
layered onto the default band, null-guarded (unset ⇒ byte-identical; demo + band test green).
The sweep tunes ONLY these leaves. **G5b docs note:** the §C0 doc should warn that a flat key
must not shadow a BALANCE gate path.

Also wired for the campaign (both byte-identical at defaults):
- **`tempo.baseSpins` (3)** — the per-segment base roll budget, read at session.mjs
  (G.rollsLeft), probe.js (effectiveRolls) and generator.js (legacy rolls) — so the ⚖3.12
  spin-cap sweep moves the player's budget and the probe's pricing together.
- **`generator2.floorEasy` (false)** — branch (b): a `{C:1}` mercy floor candidate in
  floorCands, gate-first.

## §3 Method (Part B — the staged sweep)

Stages (each = named configs × 7 archetypes × N seeds, deterministic `--seed0 1000` spacing):
1. **coarse** (n=12, 8 configs) — ramp/base0/easy-stage/floorEasy/boss levers around the
   two failing baseline dials (run-length spread, tempoist viability) + the seg-1
   expressibility ask (patron-0 nofit-hard 40.7%).
2. **refine** (n=24) — around the coarse winner (fitTol centering, multi-guard).
3. **spincap** (n=20) — ⚖3.12: base spins 2/3/4 against the tuned band (report only).
4. **probe** (n=12) — trials 240/180/160 (cost vs dial noise).
5. **final** (n=30) — baseline vs CHOSEN, the deliverable read (+ gates).

## §4 Baseline (the pre-campaign truth, n=12, 84 runs)

| dial | value | target | verdict |
|---|---|---|---|
| die@seg-1 (raw snap) | 8.3% | 8–18% | PASS |
| mean run length | 11.5 | 6–12 | PASS |
| run-length spread | 3.7× | ≤ 3× | **FAIL** |
| viability spread | tempoist >1.5× | none out | **FAIL** |
| boss-death share | 50.0% | 35–60% | PASS |
| p99/p50 score | 12.9× | ≥ 4× | PASS |
| pred-vs-realized MAE | 0.038 | ≤ 0.05 | PASS |
| probe cost | 65.7 ms/seg | ≤ ~70ms | PASS |

Fit-flags: patron-0 nofit-hard **40.7%** (the G3 playtest's inexpressible-early-band finding,
now measured); overall band 72%. The two FAILs share one cause: the **tempoist outlier**
(mean 25+ segments, median score ~4×+ grand median) — the run-length lever (ramp) is the
main tool; the seg-1 branch decision governs the nofit-hard share.

Branch (b) first evidence (run-1 coarse, valid rows only): `floorEasy_b` (defaults + {C:1}
floor) LENGTHENED runs (die@1 3.6%, run μ 12.8, nofit-easy at seg 1) — more mercy, moving
run-length the WRONG way; branch (a) raises the early band instead. Confirmation pending the
fixed coarse table.

## §5 Coarse results (n=12, 8 configs, wall 14.3 min — `reports/sweeps/coarse.json`)

```
config                   die@1   run μ  spread  viab✗   boss†  p99/50     MAE  nofitH0  ms/seg  PASS
baseline                  8.3%    11.5    3.7×      1   50.0%   12.9×   0.038    40.7%    56.8   6/8
ramp05                    8.3%    10.1    3.3×      1   42.9%    8.0×   0.050    40.7%    60.4   5/8
b16_r04                   7.1%     9.1    3.8×      3   56.0%   13.3×   0.063    17.3%    58.0   4/8
b16_r05                   7.1%     9.0    5.0×      5   54.8%   14.3×   0.094    17.3%    52.4   4/8
b22_r05                   7.1%     7.8    3.9×      1   48.8%   14.8×   0.089    14.4%    46.5   4/8
easy10                    7.1%    10.8    4.3×      3   48.8%   14.4×   0.052    29.8%    64.0   4/8
floorEasy_b               3.6%    12.8    3.4×      4   45.2%    7.1×   0.059     6.6%    60.0   3/8
b16_r04_boss18            7.1%     9.5    3.6×      2   58.3%    9.1×   0.075    16.9%    58.1   4/8
```

**Reads (from the per-archetype + calibration detail in coarse.json):**
1. **RAMP is the compression/spread tool and is zealot-FRIENDLY.** ramp05: run μ 11.5→10.1,
   spread 3.7→3.3× (tempoist 18.0→11.2 segs), die@1 unchanged — and the weakest archetype
   (zealot) *improved* (score median 115→166).
2. **BASE0 buys expressibility but taxes the weakest archetype.** nofitH0 40.7%→17.3%
   (b16) →14.4% (b22) — patron-0 wants targets ≳.10 at every position — but zealot's
   median halves (115→61→47), dragging viability/spread the wrong way.
3. **The MAE degradation at raised base0 is EXPOSURE, not corruption.** In every config the
   ≥0.3-predicted bins over-predict (realized ~0.25–0.31 vs predicted 0.34–0.62): the joint
   probe's union-keep line underestimates a FOCUSED player at hard sets, so it over-predicts
   snap there. Baseline spends ~17% of segments in that region; b22_r05 ~45% — the weighted
   MAE simply inherits the exposure. **Probe-model gap — reported, not patched** (probe/fitter
   logic is out of G5a scope). Direction for the fitter's owner: a hard-set trial policy that
   focuses the easiest rung would fix the tail.
4. **Branch (b) — floorEasy — REJECTED.** Best expressibility (nofitH0 6.6%) but the mercy
   moves every gated dial the wrong way: runs lengthen (12.8μ), die@1 sinks BELOW band
   (3.6%), glutton/debtor scores inflate (viab✗ 4, debtor median 912 vs grand 377). The
   {C:1} rung stays in the codebase as a documented OFF seam (`generator2.floorEasy`).
5. **boss18** pushes boss-death toward the ceiling (58.3%) — no need; 1.5 already sits ~50%.
6. **The top end is content-bounded**: under steep ramps the late-patron fitter increasingly
   lands nofit-easy (the menus can't get hard enough for a grown hand) — the miser/debtor
   long tail survives the ramp. Run-length compression via the band has a content ceiling;
   the apex/late menus own the rest (feature-complete re-sweep item).

**Seg-1 branch decision (the headline): branch (a) — raise the early band — WINS, in its
mild form blended with the easy-stage lever;** branch (b) is rejected on the dials (above).
Refine explores base0 .13 × easy .8 (patron-0 targets .104/.13/.195 — all ≥ the ~.10
content floor) against pure-ramp variants.

## §6 Refine (n=24, 8 configs, wall 25.6 min — `reports/sweeps/refine.json`)

```
config                   die@1   run μ  spread  viab✗   boss†  p99/50     MAE  nofitH0  ms/seg  PASS
baseline                  9.5%    11.6    3.5×      2   54.8%   12.0×   0.030    40.9%    78.1   5/8
r05                       9.5%     9.9    3.0×      2   42.9%    9.5×   0.047    40.9%    60.8   7/8
r06                       9.5%     9.7    3.0×      1   48.8%    9.2×   0.054    40.9%    54.7   6/8
r07                       9.5%    10.2    3.8×      2   42.9%   14.4×   0.081    40.9%    52.5   5/8
b13_r05                   8.9%     9.9    4.0×      3   43.5%   12.6×   0.062    29.4%    54.5   5/8
b13_r05_easy08           10.1%     9.4    4.2×      2   41.1%   14.8×   0.074    20.9%    52.8   5/8
r05_easy08                8.9%    10.5    3.3×      2   43.5%   14.4×   0.064    36.9%    53.8   5/8
r06_rich10                9.5%     9.6    3.0×      1   48.2%    8.5×   0.049    40.9%    64.2   7/8
```

**Reads:**
- **r05 and r06_rich10 top out at 7/8**; the ONE failing dial in every ramp config is
  viability — and its shape is STRUCTURAL: miser lands >1.5× grand median and zealot <0.5×
  in r05 (their §11 named dangers — dominance-by-accessibility, greed cost); r06/r07 swap
  in debtor-over (2.75×). No band value moves the archetypes' relative policy strength —
  this residual belongs to the witness/scoring layer and the feature-complete re-bench,
  not the band. (Baseline fails the same dial the same way, plus spread.)
- **Every base0/easy blend pays**: b13_* and *_easy08 all land 4.0–4.2× spread or 0.062+
  MAE (the zealot tax + high-tension exposure from §5 read 3, reproduced at n=24).
- **richnessWeight .15→.10 (r06_rich10 vs r06) is a within-noise no-op** on every dial —
  the G4 note ("it can shrink now that apex supplies real EV") is CONFIRMED SAFE but buys
  nothing on these dials. Keep .15; re-visit when apex frequency rises with content.
- ramp .07 overshoots (spread 3.8×, MAE .081 — deep-run exposure returns via a different
  route: late-patron survivors sit near the clamp ceiling longer).

## §6b THE CHOSEN CONFIG

**`generator2.band.ramp: 0.03 → 0.05` — one number.** Everything else stays as G3 shipped
(base0 .10, stage [.6, 1, 1.5], floor .05, ceil .60, fitTol .03, lagAlpha .5, trials 240,
takeRates, apexPowerGate .55, latePatron 2, richnessWeight .15, rungs 2..4, baseSpins 3).
7/8 dials at n=24, the compression the run-length dials wanted (11.6→9.9 mean, 3.5→3.0×
spread), die@1 untouched (9.5%), MAE inside the honesty gate (0.047), robust across the
n=12 and n=24 replicates. The god-window stays at α=.5 (~2 segments) — no dial asked
otherwise, and the field verdict ("works and is felt") stands.

**The seg-1 expressibility decision (the headline):** KEEP the early band as-is; adopt
NEITHER branch as a live change; the field finding re-reads as follows.
- The playtest's "content floor ~.24" was measured on the PRE-fix-batch build, where the
  probe priced `pure` rungs at 0.000 (synthesis bug #1) and distorted set pricing. On the
  fixed probe, the bench's seg-1 clamp lands ~.075–.10 against the .06 ask — an overshoot
  of **1.5–4 points of snap chance**, not 18.
- The dial built to catch the failure — die@seg-1 8–18% — PASSES at 8.3–9.5% in every
  baseline/ramp read. The patron-0 nofit-hard share (~41%) is an HONEST clamp marker:
  the fitter sits just above an ask the content cannot express, and the realized mercy
  is still in band.
- Both corrective branches were swept, twice: **(b) floorEasy** (the {C:1} rung) buys the
  best flag profile (nofitH0 6.6%) but lengthens runs, sinks die@1 BELOW the band (3.6% —
  too merciful), and inflates glutton/debtor (§5); **(a) raised base0/easy** buys nofitH0
  17–29% but taxes the weakest archetype and the calibration dial (§5, §6). Each fixes
  the MARKER by breaking a GATED dial.
- **For the designer** (G5b/validation playtest): if the .06 ask should mean something at
  patron 0, the cheap honest option is `stage[0] .6→.8` (the band asks only what the
  content can express; patron-0 targets become .08/.10/.15). At n=24 it read spread
  3.3×/MAE .064 — likely seed noise, unconfirmed; adopting it needs a dedicated bigger-n
  run. The `generator2.floorEasy` seam stays in the code (OFF) for the content-side
  experiment.

## §7 Spin-cap (⚖3.12) — the audit's named 2/3/4 test (n=20 vs the tuned band, wall 9.4 min)

Enabled by the new `tempo.baseSpins` dial (wired at the live budget AND the probe, so
pricing follows the player). **Comparison only — the verdict is the designer's (⚖3.12).**

```
config                   die@1   run μ  spread  viab✗   boss†  p99/50     MAE  nofitH0  ms/seg  PASS
spin2_tuned              11.4%     9.4    2.0×      1   48.6%   13.1×   0.049    76.1%    62.1   7/8
spin3_tuned              10.0%    10.1    3.0×      2   44.3%    9.9×   0.053    40.0%    65.4   6/8
spin4_tuned               5.0%    12.2   10.0×      4   48.6%   21.6×   0.134    18.8%    67.9   3/8
```

**The shape of the trade:**
- **2 spins TIGHTENS the whole game** — archetype run-length spread 2.0× (the only config
  in the campaign to pass that dial with room), viability best (1), die@1 still in band at
  11.4%. The cost: patron-0 nofit-hard jumps to **76%** — with two spins even the easiest
  composable sets overshoot the early mercy ask, so the band loses its early voice almost
  entirely. Tension-forward, mercy-poor.
- **4 spins is DOMINATED** — die@1 sinks below band (5.0%, too safe), strong builds run
  away (spread 10×, viab✗ 4, MAE .134 from deep-run exposure). More tempo feeds the
  compounding builds far more than the fragile ones.
- **3 spins is the shipped middle** and stays the default (`tempo.baseSpins: 3`).
- Note for the designer: the 2-spin variant's profile (tight spread, honest tension,
  no early mercy) may pair naturally with `stage[0]` raised — if ⚖3.12 ever leans 2-spin,
  re-run this stage with the §6b FEEL option folded in.
## §8 Probe budget (trials — cost vs noise)

The cost dial passed (≤70ms) at trials=240 on every swept config (46–66 ms/seg in the
stage reads), so **240 is KEPT — no prediction precision traded for speed.** The lever is
mapped for the day it fails (perf_probe battery, measured under bench load — subtract
~25% for uncontended):

| trials | ms/seg | note |
|---|---|---|
| 240 | 80.1 | default (uncontended stage reads: 52–66) |
| 200 | 68.3 | −15% |
| 180 | 59.1 | −26%; pSnapPredicted σ ~.030 vs ~.026 at 240 (binomial, p≈.2) |
| 160 | 55.2 | −31% |

evals/segment ≈ 18 everywhere (the fitBudget 24 bound holds; ~6 evals of headroom for the
composer's late-patron refinements).
## §9 Final validation (n=30, 210 runs/config, wall 7.9 min — `reports/sweeps/final.json`)

```
config                   die@1   run μ  spread  viab✗   boss†  p99/50     MAE  nofitH0  ms/seg  PASS
baseline (ramp .03)      10.5%    11.4    3.5×      2   53.8%   11.4×   0.034    39.4%    54.0   6/8
CHOSEN   (ramp .05)      10.5%    10.0    3.1×      2   44.8%   14.1×   0.051    39.4%    54.3   5/8
```

**The authoritative dial read on the CHOSEN config (n=30):**

| # | dial | value | target | verdict |
|---|---|---|---|---|
| 1 | die@seg-1 (raw snap) | 10.5% | 8–18% | **PASS** |
| 2 | mean run length | 10.0 | 6–12 | **PASS** |
| 2b | run-length spread | 3.1× | ≤ 3× | **FAIL (boundary)** — 3.0–3.3× across replicates; floor = zealot 4.8 segs (identity), top = miser 14.9 |
| 3 | viability spread | miser 1.7×↑ / zealot 0.42×↓ | none out | **FAIL (structural)** — same two, every config in the campaign; a witness/policy-layer item, not a band lever |
| 4 | boss-death share | 44.8% | 35–60% | **PASS** |
| 5 | p99/p50 score | 14.1× | ≥ 4× | **PASS** (no gap analysis owed) |
| 6 | pred-vs-realized MAE | 0.051 | ≤ 0.05 | **FAIL (boundary)** — 0.047–0.053 across replicates, statistically AT the gate; cause = the §5 high-tension model gap (§12.1) |
| 7 | fit-flags | p0 nofit-hard 39% (honest clamp), FALLING with patron (16%→10%); nofit-easy ≤8% | read | healthy profile — no early nofit-easy, late nofit-easy ~5% = the content ceiling note (§12.3) |
| 8 | probe cost | 54.3 ms/seg | ≤ ~70ms | **PASS** |

Consistency checks: die@1 IDENTICAL baseline↔CHOSEN (ramp never touches patron 0 — the
instrument sees exactly what the change is); zealot's 40% seg-1 snap is the entire per-
archetype die@1 spread (everyone else 0–7%) — its greed identity, priced as designed.
CHOSEN's later-patron expressibility IMPROVES (nofit-hard p1 23→16%, p3+ 14→10%): higher
asks are more composable. 0 runaways in all 2,352 campaign runs — audit 2.4's asymptote
holds at every swept point.

**Verdict: 5 PASS / 3 FAIL, with all three fails diagnosed and owned**: one structural
(viability — witness layer), two boundary (spread, MAE — both hover at their lines across
replicates, and the MAE line is held down by a diagnosed probe-model gap with a written
fix path). No swept config dominates CHOSEN; pushing any lever further to buy the boundary
dials measurably breaks passing ones (§5, §6). Baseline shows 6/8 in this table but note
what it hides: its spread miss is WORSE (3.5×), its run mean rides the top of band (11.4),
and its MAE pass (0.034) comes from LOWER exposure to the same model gap — the gap, not
the config, is the difference.
## §10 p99/p50 gap analysis — NOT OWED: the dial passes everywhere (7.1–25.8× vs the ≥4×
target), pre-spatial-combos — the tail is carried by deep-run witness compounding + the
depth bonus. Recorded so the feature-complete re-bench knows the headroom is real.

## §11 Suite housekeeping (Part C — done)

Per-file timing (contended upper bounds, sorted): `slice4_verbs_test.mjs` **~200s** — OVER
the runner's 180s per-file `spawnSync` timeout (scripts/run_tests.mjs:28) — the intermittent
36/37 "one file brushed the budget" failure. Next heaviest: witness_bugfix ~96s,
g4_rungsets ~94s, postg3_bugfix ~82s — all safely under.

**Fix (no assertion weakened):** slice4's chain-milestone block plays 440 full runs (220
seeds × on/off) whose assertions (the milestone banks somewhere; never fires when off; a
0-bank run is byte-identical on/off) are independent of probe PRECISION — so its balance
override now adds `'generator2.trials': 100` (applied IDENTICALLY to both the on and off
runs, so the byte-identity comparison stays exact; seed coverage unchanged at 220).
Result: **~200s → 86s** (41/41 assertions pass). The suite's other heavy files were left
untouched — their cost is behavioral seed coverage, and trimming seeds trades regression-
catching power for speed.

New test: `packages/agent/tests/acceptance_test.mjs` (25 assertions, <1s).

**Suite result after the pass:** `npm test` = **38/38 files green in 8m43s** (was 36–37/37,
flaky). The reliability failure (the intermittent one-file timeout) is fixed two ways:
slice4's trim (200s→86s) AND the runner's per-file budget deliberately raised 180s→300s
(scripts/run_tests.mjs — the heavy behavioral files run 85–105s on a FAST machine, within
slow-hardware/contention noise of the old line; 300s still catches a genuine hang). The
"ideally ≤5 min" stretch goal was NOT taken: the remaining weight is behavioral seed
coverage (witness_bugfix ~96s, g4_rungsets ~94s, slice4 ~86s, postg3 ~78s, transformer_choice
~55s), and trimming seeds trades regression-catching power for wall time. If ≤5 min matters,
the non-weakening route is a concurrency-2 runner + the raised budget (contention interacts
with per-file timeouts — do them together); left as a recommendation, not implemented.

**Frozen-hash future-proofing (disclosed):** `g4_rungsets_test.mjs`'s neutrality proof
freezes a SHA-256 of a generateSegment matrix anchored at HEAD 18ba4db — under the OLD
tuning numbers. That proof is about the G4 FLAG, not the designer numbers, so the matrix
block now PINS the campaign-tunable leaves (band leaves, trials, richnessWeight, lag,
baseSpins, …) at their 18ba4db values via §C0 overrides — effective-config-identical today
(hash unchanged, 87/87 green) and immune to future NUMBERS tuning. A campaign that tunes a
NEW generateSegment-read leaf must add it to the pin map.

## §12 What to re-sweep at feature-complete (and what needs new instruments first)

1. **The probe's hard-set keep-policy gap (the MAE tail) — fix BEFORE the next campaign.**
   Every config over-predicts snap in the ≥0.3-predicted bins (realized ~0.25–0.31 vs
   predicted 0.34–0.62): the union max-serve trial line under-models a FOCUSED player at
   hard sets (a real player chases the single easiest rung; the union line spreads keeps
   across all three). Out of G5a scope (probe logic frozen). A "focused-line" trial policy
   (evaluate P(best single-rung line succeeds) alongside the union) would fix the tail —
   then re-sweep ramp: the current .05 was chosen partly for exposure reasons that a fixed
   tail may relax.
2. **Viability + run-length spread** — the residual failing dial is archetype-structural
   (miser over / zealot under, every config). Levers live in the witness/scoring layer and
   archetype policy v2, not the band. Re-bench after the witness economy tune.
3. **The run-length TOP end is content-bounded** — under steep ramps late-patron fits go
   nofit-easy (the menus can't get hard enough for a grown hand; the miser/debtor tail
   survives the ramp). When late/apex menus deepen (or spatial combos land), re-sweep
   ramp + `rungs.max` + `apexPowerGate`/`latePatron` (untouched this campaign).
4. **generatorGuard.multiCompletionMax** — the joint pMulti is tighter than the legacy
   estimate, but the value is a // PARITY mirror (parity_test hard-asserts 0.12 === the
   generator.js literal). Re-centering it requires the parity-aware three-site edit
   (literal + mirror + test) — measured via §C0 override first (the refine guard10 config
   showed no dial gain at n=24, so it was left alone).
5. **takeRates + tempo.rerollToSpin** — still behavioral guesses; needs take-rate telemetry
   from real players (Run Records already carry the offers; count the taps in the client).
6. **Card-family exposure** (the G3 synthesis' famine note — Deepen/Twin Etch never offered
   in ~20 draws) — needs a NEW instrument: per-family offer counting in bench_core (cheap:
   the perk offers are already in the protocol stream). Recommend building it into the
   next bench extension before the deck economy re-tune.
7. **p99/p50** — passes with headroom everywhere (7–26×); re-read once spatial combos land
   (the dial's original motivation) to confirm the tail grows rather than the median.
8. **ambitionBase/ambitionSpan, fitBudget, lagAlpha, lagEps, rungs caps** — confirmed
   indirectly (dials pass through them) but never independently swept; cheap stages exist
   in sweep.mjs's registry pattern when wanted.

## §13 Gates (verbatim tails, on the FINAL config — balance.js as set)

`npm test` (8m43s):
```
PASS  packages\engine\tests\witness_test.mjs

38/38 test files green
```
(KNOWN-FAILs enchantments_test / segment_test reported as tracked, not gating — untouched.)

`npm run demo`:
```
seed 72271: score 6 over 2 segments, knot none, stitches 0, 20 actions
demo: all runs clean
```

`npm run bench` (the instrument's gate read, n=12 — the authoritative n=30 read is §9):
```
ACCEPTANCE DIALS — 7 builds × 12 seeds  (84/84 runs played, 934 segments)
dial                                value  target          verdict
die@seg-1 (raw snap)                 8.3%  8.0%–18.0%      PASS
mean run length                      10.1  6–12            PASS
run-length spread (×)                3.3×  ≤ 3             FAIL
viability spread               >1.5×: miser · <0.5×: —     FAIL
boss-death share                    42.9%  35.0%–60.0%     PASS
p99/p50 score                        8.0×  ≥ 4×            PASS
pred-vs-realized P(snap) MAE        0.050  ≤ 0.05          FAIL
probe cost ms/segment              54.3ms  ≤ 70ms          PASS
5 PASS · 3 FAIL · 0 n/a
```
(The three FAILs are §9's: two boundary readings + the structural viability — diagnosed,
owned, and not buyable with any swept band value without breaking passing dials.)

## §14 For G5b (the docs pass) + the validation playtest

Docs pass should cover:
- **The §C0 collision warning** (§2): a flat override key must never shadow a BALANCE gate
  dot-path; the band is tuned via the per-leaf `generator2.band*` keys. Belongs in
  balance.js §C0's doc block (done in the §G header comment) and the CODEMAP/AGENT_PLAY
  notes wherever overrides are documented.
- `npm run sweep` + the acceptance artifacts (`reports/sweeps/*.json`) + the bench's new
  `--out/--no-accept` flags — one paragraph in the agent README/AGENT_PLAY.
- The Generator_v2 §4 table's placeholder targets are now MEASURED (this report §9) —
  the doc can cite real values.
- `tempo.baseSpins` exists (the ⚖3.12 instrument) — note on the audit's 3.12 register row
  that the named test WAS RUN (this report §7), verdict open.
- `generator2.floorEasy` is a documented OFF seam (branch (b), rejected this campaign).

Validation playtest should watch:
1. **Run pacing under ramp .05** — the field's last round was ramp .03; expect runs ~1–2
   segments shorter and the late wall arriving a patron sooner. Does the rider-debt
   treadmill vs ramp balance (the G3 synthesis' open question) FEEL different now?
2. **The patron-0 nofit-hard** — it still opens most runs (~40%). The campaign's claim is
   that realized mercy is fine (die@1 in band) and the marker is an honest clamp. A blind
   feel-check: does segment 1 FEEL unfairly hard? If yes, the §6b stage[0] .6→.8 option is
   the designed answer.
3. **Boss texture at 44.8% boss-death share** — down from 53.8% at baseline; the wish-
   species texture note from G3 (jackpot bosses carry no physics) still stands.
4. **Zealot-line play** (bloom-push): its 40% seg-1 snap and 0.42× viability are the
   structural residual — a play session on that line would tell the witness-layer tune
   what it needs.

*Campaign run 2026-07-10 on branch `generator-v2` (working tree over 22d233b). Instrument:
bench_core/acceptance/perf_probe/sweep + archetype_driver extensions. All sweeps §C0
override-driven — balance.js was touched exactly once, to set the chosen numbers. NOT
committed (per brief).*
