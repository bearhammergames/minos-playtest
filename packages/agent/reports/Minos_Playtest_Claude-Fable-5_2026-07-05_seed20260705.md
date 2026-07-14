# SpellSpun (Minos) Agent Playtest — Claude (Fable 5) — 2026-07-05

*One informed run via the replay-driver pattern (`node packages/agent/driver.mjs
_tmp/playbook_20260705.json`), per the playtester agent protocol. The annotated
playbook — every directive with its reasoning in the `note` field — is kept at
`_tmp/playbook_20260705.json` and replays this run exactly. The `npm run demo`
conformance check was skipped this session by instruction (already verified green
earlier today). Every claim below carries seed 20260705.*

## Runs

| seed | score | segments | knot | stitches | notes |
|---|---|---|---|---|---|
| 20260705 | **4** | **0** | tied (mind, not tight, metCount 1) | 0 (attempted 1, missed) | snapped at segment 1 chasing True(body); stitch missed Bloom by one mana; see below |

## Decision log highlights

**Segment 1, the read (seed 20260705).** Rungs: floor(spirit:2+mind:1, ~61%) ·
true(body:3+mind:1, ~48%) · bloom(mind:3+body:1+mana:1, ~23%). No chain yet, so
segment 1 sets identity. EV: True 0.48 × 3 = 1.44 vs floor 0.61 × 1 = 0.61. The hand
carried body on three of six dice (0, 1, 4). Directive: **target True, stop on
target, fangs last-resort only.**

**The mind flood that couldn't be caught.** Spin 1: `0:body 1:fang 2:spirit 3:spirit
4:mind 5:fang` — kept body and mind; True needed body×2 more. Spin 2 then served
**four minds** (`2:mind 3:mind 5:mind` plus the kept one) and not one body. A human
would have pivoted on the spot — Bloom is mind:3+body:1+mana:1 and the tray was
suddenly shouting mind — but the directive was locked to True before the first spin,
so the driver kept nothing and spun again. Spin 3: mana, spirit, mind. Still no body.

**Corrupt-vs-dead insurance, exercised.** On the last spin, still short body×2, the
`lastResort` fang policy fired and kept die 1's fang — exactly the insurance the
previous report (seed 20260704) wished for. It wasn't enough: one wild cannot cover a
two-pip hole. Resolve met nothing; the Stitch in Time flew `body fang mind mind mind
fang` — body×1, mind×3, fangs excluded — which is Bloom minus **one mana**. The
stitch missed, the thread snapped at segment 1.

**The knot.** No live blooms, so no tight knot available; the mind knot (mind:3+
charm:1) had best reach at 62%. Directive: target tight (falls back to best reach),
push, fangs last-resort. Two spins of disciplined mind/charm keeps tied it without
needing a fang. Final: **score 4, all of it the knot.**

## The stop decision (designer question 1)

Never exercised as designed — no rung ever lit, so there was no early resolve to
report and `stopPreview` stayed `NONE` throughout. The shadow of the decision showed
up instead as the *pivot problem*: the moment the dice turned mind-heavy on spin 2,
the correct stop-adjacent move was to change targets, not to stop. The driver's
per-segment directive can't do that (see Legibility/Workflow). Two runs in a row now
(20260704, 20260705) where the EXTEND/BREAK tension never appeared because segment 1
never completed — the stop decision remains untested territory for this harness.

## Fang economy (designer question 2)

Yes, I refused fangs — twice on spins 1–2 (per `lastResort`), then took one on the
final spin as corrupt-vs-dead insurance. Finding: **the fang insurance has a
capacity limit that the previous report's framing missed.** Seed 20260704 died
needing one pip and mourned the refused fang; seed 20260705 took the fang and died
anyway because it needed two. So the real fang economics are: a late fang converts a
one-pip deficit into a corrupt completion, but a two-pip deficit is dead either way
— which means the *early* fang keep (spin 1, while outs remain) is the genuinely
interesting gamble, and `lastResort` never makes it. A directive vocabulary word
like `keepFangs:"early"` would let an agent test that line.

## Difficulty curve (designer question 3)

Cannot report a curve from a run that ended at segment 1 — but that is itself the
data point: **two consecutive seeds (20260704, 20260705) snapped at segment 1
chasing the ~48–51% True rung.** Small sample, and both were informed EV-positive
choices, but if the pattern held over more seeds it would suggest the True reach
estimates are optimistic against a target-locked keep policy, or that segment 1
variance is hotter than the estimates imply. Worth a batch check: sim the
target-True policy over 500 seeds and compare realized True-completion rate at
segment 1 against the printed reach_estimate.

## Legibility issues (designer question 4) — including workflow notes

- **Knot rungs print `"value": 0`** yet the knot scored 4 (score line "The knot: 4").
  The value field on knot rungs doesn't reflect what tying it is worth, which made
  the knot look pointless at decision time. Either print the actual knot value or
  annotate it (seed 20260705, knot phase).
- **The board itself is legible.** Rungs, reach estimates, hand faces, and the event
  log were all readable at each pause; I never resolved into a rung I didn't expect
  (trivially — I never resolved into any rung).
- **Workflow: the directive is pre-spin and immutable**, so an "informed" agent
  cannot react to the dice — the mind flood on spin 2 (seed 20260705) was an obvious
  Bloom pivot no directive could express. Per-segment granularity tests policy, not
  play. Even one extra pause-point ("pause after spin 1 if no target progress")
  would close most of the gap.
- **Workflow: the driver auto-takes the Stitch** (it never sends `snap`), so the
  stitch/snap choice — a real decision in the protocol — is not exercisable from a
  playbook.
- **Workflow: minor** — the pause banner doesn't echo `rollsLeft`/`spinsTaken` or
  `stopPreview` (both mid-segment concepts, absent at pause time), which is fine,
  but the knot pause could state "value fields are 0 at the knot; scoring comes from
  the knot line" to prevent the confusion above.

## Score strategy (next 5 runs)

1. **Open on Floor when True's reach is below ~55%.** Both date seeds died to True at
   ~48–51%. Floor at 61% starts the chain and banks a colour; True can wait for a
   segment where the hand density backs it.
2. Add and test a **pivot heuristic** (needs harness support): if after spin 1 the
   tray holds ≥3 pips of an off-target rung's colour and 0 progress toward target,
   retarget.
3. Test **early fang keeps** on bloom chases, accepting the curse, to price
   corruption against a 6-point rung — `lastResort` provably arrives too late to
   matter for deficits ≥2 (seed 20260705).
4. Vary seeds away from date-adjacent values in case the generator's segment-1 band
   behaves similarly on nearby seeds (superstition, but cheap to test).
5. Actually reach segment 3+ so the stop decision, chain scoring, and curse pressure
   produce data — the two runs to date have tested the snap path and knot path
   thoroughly and the core loop not at all.
