# Playtest synthesis — ModifierList v2 stack (2026-07-09)

*Two informed runs on branch `modifier-v2` (post-slice-5), focus: the v2 modifier surfaces.
Runs: seed 20260709 (score 102 / 5 segments) and seeds 51+52 (4 / 1 seg snap; 198 / 8 segments).
Full reports beside this file. Bugs found here were fixed same-day (`witness_bugfix_test.mjs`,
19 assertions) — noted inline as FIXED.*

## Convergent findings (both runs, independently)

1. **The ladder inversion works and reads.** Both runs observed grade buying rarer drafts and
   cleaner riders, never flat score. The premise of the redesign (worth channel → drafted, worn,
   loud) held up in play: witness fires are visible and the draft decision is felt. This is the
   qualitative half of the ⚖3.7-adjacent verdict; the quantitative half waits on the
   feature-complete re-bench (Standing Rule 4).
2. **Witness-draft duplicate bug** (both runs): pool exhaustion re-offered worn witnesses;
   duplicates inked and stacked (a Thousand Cuts ×4 portrait; over-ink zeroed shared tallies).
   **FIXED** — rarity now widens before exclusion is violated, and a fizzle guard makes duplicate
   ink impossible.
3. **The worth economy is witness-dominated.** Seed 52 banked 51 pts of witness worth; the
   archetype bench echoes it (debtor 120 median, wit μ 51.8, >1.5× grand median). Rule-4
   placeholder magnitudes are hot — a tuning target for the snap-band bench session, not a
   design flaw: the *shape* (worth arrives through play-style scorers, not chips) did its job.
4. **The fang cost lands now.** Seed 52's one load-bearing fang billed −24 at tally and read as
   a price; seed 20260709 refused two fangs under a live Spotless contract, stitch-saved, and
   collected +25. Direct, positive evidence for ⚖3.4 ("do players ever refuse a Fang?") — yes,
   when a contract makes refusal meaningful.

## Divergent / single-run observations

- **Jackpot contracts are the strongest strategic input in the stack** (20260709): Spotless made
  fang-refusal correct-and-painful; Fang-Fancier inverted the fang policy in one segment. The
  other run never rolled a twist/jackpot in 3 patrons (species-weight variance) — consider a
  weight bump if exposure stays this low; feeds ⚖3.13.
- **Chain milestone**: fired twice and shaped stops in one run; priced-in but never fired in the
  other. A corrupt bead failed to reset the streak (spec violation) — **FIXED**. Progress is now
  serialized (`s.chainRun`) for the client.
- **Ash riders make the new sigil-verb cards bad buys at ash grade** (20260709) — pricing
  observation for the bench; also a driver limitation (static perkPref can't condition on grade).
- **Legibility gaps found and FIXED**: ladder offers now logged to the event stream; rider cards
  now disclose the bane's effect text, not just band+name; `thousand_cuts` desc now says
  "per distinct symbol".

## Follow-ups mapped to the audit / backlog

| Finding | Lands on |
|---|---|
| Fang refusal under contracts observed | ⚖3.4 — keep collecting; the telemetry now exists |
| Witness worth magnitudes hot; ash-grade rider pricing | Rule-4 re-derivation at the snap-band bench session |
| Twist/jackpot exposure variance | ⚖3.13 (wish species weights) |
| AGENT_PLAY still teaches the knot; snap ends runs without one; declining the stitch is strictly dominated | audit 2.3/1.5 — the snap-relic design owns both |
| Replay driver can't tap sigils / release / condition perkPref on grade | the "grow the archetype bench (v2 knobs)" pick-up item |

*Method note: driver conformance green on all runs; playbooks under `_tmp/`. These are 2–3 runs —
signals, not statistics.*
