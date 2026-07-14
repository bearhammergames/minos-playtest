# Playtest synthesis — Generator v2 after G3 (band + lag + ceiling)

*Two sessions on branch `generator-v2` @ `387998f` (G1 kernel, G2 joint probe, G3 band —
all native-on): seed 909 (136 / 6 segs, natural-feeling death) and seeds 424242+424243
(31 / 2 segs boss death; **759 / 19 segs, patron 7.2** — the deepest recorded run).
**PAUSE POINT: findings are RECORDED, NOT FIXED** — the fix batch is the first action on
resume, before G4. Full reports beside this file.*

## The headline: the band works, but the CONTENT FLOOR governs the early game

Both seeds opened segment 1 `nofit-hard` (band asks .06; the easiest composable set sits
~.24), and run 909 was nofit-hard 6 of 7 segments. **The mercy overshoot we inferred from
the bench is inverted** — the band isn't too gentle, it's *inexpressible*: the candidate
menus have no rung easy enough to hit the early targets, so the fitter clamps and the
content floor sets real difficulty. (Bench die@1 ~0% reconciles via stitch saves.)
**G5's #1 decision:** raise the early band to meet the content floor, or add genuinely
easier floor candidates so the band can express mercy — and add the fit-flag rate to the
bench dials either way.

## Design verdicts (convergent, both sessions)

- **The god-window works and is felt** — ~1–2 segments per upgrade, `window:true` in
  telemetry, and run 909's window paid the run's biggest tally ("felt like a reward").
  Legibility nit: a window opened-and-eaten by a simultaneous lien is correct (`min()`)
  but invisible — wants an event line.
- **Power buys ceiling, confirmed in the field** — chain-colour blooms climbed 4.6% → 29%
  → 44% as one deck grew; the deep run was offered 53–62% build-matched Trues at .28–.375
  tension. Richer, never easier. Principle 1 delivered.
- **Debt is honestly priced now** — banes helped repeatedly; the cursed line is viable;
  weakness repricing produced the run's only in-band fit. BUT the late wall is built by
  the **rider-debt treadmill**, not the +3%/patron ramp (S16: target .150, achievable
  .329) — G5 must decide whether debt-as-asymptote is the intended ending mechanism or
  the ramp should carry more of it.
- **Boss staging reads fair when the wish has physics** (the Widow at ×1.5 was "the honest
  peak"); a jackpot-wish boss carries no physics, so boss texture swings hard by species —
  a G5 balance note (or a G4 rung-condition: jackpot bosses could carry a rung twist).
- **`nofit-easy` observed at a P2 boss** — the field evidence for G4's apex rung, exactly
  as predicted.

## Bugs (fix batch on resume, priority order)

1. **The probe prices `pure` rungs at 0.000 regardless of hand** — proven by experiment
   (a 0.000-reach pure mind×3 completed in 2 spins). Cause hypothesis: the union max-serve
   trial policy keeps any advancing face, so it always profanes purity. Poisons
   pSnapPredicted late (pure shapes enter the menus at lateGate) and likely drives late
   nofit-hards. The trial policy needs a pure-aware keep line.
2. **A fizzled Graft (drums at cap) still bills its rider bane** — the price without the
   goods. Fizzle must void the rider (or the card shouldn't be offered at cap).
3. **Chain-Keeper's `chainAlive` target 4 is degenerate at patronLen 3** — impossible at
   patron 1, pre-met by patron 3; never a live decision (both sessions). Scale the target
   with patronLen or reprice the contract.
4. **Bare-auto Shift thrashes** — the deterministic parking heuristic ping-pongs one bane
   between two faces across picks. Auto-pick should skip faces it just vacated.
5. `pure` rung shape undocumented in AGENT_PLAY.md; the stitch's fang-exclusion reads as a
   bug to players (legibility copy); the stock driver can't print `s.generator` at pauses
   (harness nicety — both testers hand-patched).

## Exposure notes (recurring theme, G5 weights)

Deepen/Twin Etch never offered in ~20 draws; Scour/Absolve nearly absent while 5+ riders
etched in. The rare tier is famine-prone at real run lengths — same funnel as the deck
wave found; the sweep should treat card-family exposure as a first-class dial.

## One composition observation for G4

The 3-distinct-colour rule leaves concentrated builds a permanent 0–5% corpse rung (the
off-colour slot). The G4 composer's 2-rung rest (the off-colour rests) or a colour-doubled
apex is the designed answer — field-confirmed as wanted, not just theorized.

*Method: driver conformance green; playbooks in `_tmp/` (909) and beside the reports.
Three runs + one stress build — signals, not statistics.*
