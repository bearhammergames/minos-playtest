# Playtest synthesis — the Deck Wave (2026-07-09, second round)

*Two focused sessions on branch `deck-wave` (post-D4): seeds 77+78 (18/2 segs, 7/1 — both
died on or before their boss) and 20260710–14 (best 183/9 segs; 4 runs, all replay-exact).
Full reports beside this file. Bugs were fixed same-day in the deck-wave fix batch
(`deck_wave_fixes_test.mjs`, 22 asserts) — marked FIXED inline.*

## Convergent findings (both sessions, independently)

1. **The reach estimate lies under debt and wishes — the round's top issue.** Estimates
   ignore active warps and lien-baned faces; both testers chased healthy-looking floors
   (77–89%) into lien-lock deaths, and a warped boss rung priced identically to its
   unwarped twin. **Shipped now:** the honesty caveat (`s.reachCaveat` + the client's `~/⚠`
   treatment) so the number never *pretends* to be adjusted. **Recorded follow-up:**
   warp/enchant-aware probing — a real design+perf task that belongs with the snap-band
   bench session, not a hotfix.
2. **The fang's real price is the lien, not the tally drain.** "One deliberate refusal
   converted a 47% True into a snap"; "the lien, not the −12/−23 drain, changed my keeps."
   Direct ⚖3.4 evidence for the second consecutive round — the fang cost lands, and it
   lands through the face-bane channel, exactly where the v2 redesign moved it.
3. **The debt verbs read as intended once debt exists** — Shift was engaged deliberately
   (cold-parking an on_keep lock onto a fang face) and the placement decision was real.
   The two blemishes on the family were both mechanical: duplicate Shift twins every
   ash/stitch draw (no reach dedupe — **FIXED**) and Shift itself being debt-positive
   (its rider ADDED a bane per use, 1→3 across two picks — **FIXED**, Shift is now
   neverRider; the pick is its price).

## Divergent / single-run observations

- **The face economy was statistically invisible in organic play** (0 face cards in ~15
  draws across 4 runs) — the uncommon/rare → trade/royal funnel is too slow for real run
  lengths, which was blocking the ⚖3.2 test outside the trim panel. **Partial fix shipped:**
  `graft_face` is now common (Rule-4 exposure tuning; also gives the dedupe a second common
  to vary with). Copy/excise/cursed-graft exposure remains bench-session tuning. Graft's
  self-pricing was verified headlessly regardless: 2 mind grafts moved a body floor
  0.536→0.396 and eased mind shapes — repricing is real and bidirectional.
- **Same-face lien stacking** (double Seized Spin on one face, double-firing) — **FIXED**:
  bane placement now prefers faces not already carrying that bane (fate keeps its rng;
  degenerate stacks need a full hand of them).
- **Bargains behaved**: a deliberate etch-seat choice was made (Seer's on a low-traffic
  face), the coupled pair displayed and fired correctly, and the coupling guard held in
  play. Too few sightings for a feel verdict — bench/next round.
- **The boss-wish model read clean** (run 1's words) — announce → anticipation → the squeeze.
  Both seed-77 runs *died on or before their boss segment*, though: the boss double-squeeze
  note from the patron round stands (easy/medium/boss staging remains the open ToDo item).
- **Snap-band floors** are still far off the promised band (0.33–0.54 observed) — the
  pre-existing #1 tuning target; nothing new, re-confirmed.
- **Harness**: the targeted-perk driver hook is upstreamed (playbooks can now express
  {card,die,face,to,slot} picks; defaults byte-identical), and the lastResort fang
  over-keep accounting is fixed. AGENT_PLAY's knot/mandatory-curse drift corrected.

## Follow-ups mapped

| Finding | Lands on |
|---|---|
| Warp/debt-aware reach probing | snap-band bench session (with the caveat flag as the stopgap) |
| Face-economy exposure beyond graft | Rule-4 re-derivation; panel-trim remains the deliberate test rig |
| Lien-first fang pricing confirmed ×2 | ⚖3.4 — telemetry keeps agreeing |
| Boss segments killing runs pre-boss | the easy/medium/boss staging ToDo (intra-patron difficulty) |
| Bargain feel verdict | needs exposure — next playtest round |

*Method: driver conformance green on all runs; playbooks + the (now-upstreamed) driver
extension sit beside the reports. Six runs total — signals, not statistics.*
