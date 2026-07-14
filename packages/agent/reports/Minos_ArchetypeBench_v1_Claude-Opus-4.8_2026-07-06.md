# Minos — Archetype Bench v1 — Claude (Opus 4.8) — 2026-07-06

*Introduces the **archetype bench** (`packages/agent/archetype_driver.mjs` +
`archetypes.mjs`) — the automated half of the agent playtest harness (HANDOVER
"Pick up first" #1). This is a TOOL-introduction + smoke report: it proves the seven
named builds (Modifier Stack §11) drive the real engine, reach the wired stack systems,
and produce a legible per-build read. Every number is reproducible — the policy is a
pure function of protocol state, so `--seed …` replays byte-for-byte.*

> **Not a balance verdict.** Per CLAUDE.md §0, all tunables are Rule-4 placeholders; the
> real numbers get re-derived at feature-complete. These runs measure that the builds
> *exercise* the stack (and expose where they don't), not that the balance is right.

## What the tool is

An **archetype** is a build IDENTITY expressed as a seed-general scripted policy: a
witness loadout + a perk preference + a reactive target/stop/fang rule that reads the
live board every spin. Unlike the older `driver.mjs` (per-seed hand-authored script that
pauses for a human), the archetype driver plays any seed to completion, headless, with no
script — so one build sweeps hundreds of seeds. It speaks **only** the public JSON-lines
protocol, so it exercises witnesses, the reward ladder, wishes, curses, blooms and
stitches against the real engine with **zero rule duplication** — the whole point of the
sim→agent-bench move.

The seven builds map 1:1 onto the witness registry (authored with them in mind):

| build | identity | witnesses | fang |
|---|---|---|---|
| **Miser** | safe floor-farming, bank the instant anything lights | patient_needle, miser_eye, long_thread, unbroken_line | refuse |
| **Monk** | mono-colour Concentration + depth (chase the chain) | unbroken_line, deep_ink, long_thread, patient_needle | refuse |
| **Weaver** | broad Trinity, rotate off the chain | wanderers_mark, thousand_cuts, twin_needle, the_moth | refuse |
| **Tempoist** | tempo economy, bank spins, lean on the stitch | knotted_rope, gamblers_vein, twin_needle | refuse |
| **Zealot** | Bloom greed, push every spin | the_zealot, gamblers_vein, bloomkeeper, deep_ink | lastResort |
| **Glutton** | multi-completion fishing (hold for the 2nd rung) | twin_needle, gamblers_vein, deep_ink, thousand_cuts | lastResort |
| **Debtor** | fang/curse economy, farm the cursed run | debtors_grin, wanderers_mark, gamblers_vein, second_skin | early |

## Canonical run — `node archetype_driver.mjs all --n 30 --seed0 1000`

```
archetype    score μ  score ~  segs μ  segs⤒  die@1   wit μ  curse μ  bloom μ  stch μ  run⚑
─────────── ──────── ──────── ─────── ────── ────── ─────── ──────── ──────── ─────── ─────
miser           66.2     26.0     3.2     12    23%    15.6      0.0      0.8     0.8     0
monk            42.8     18.5     2.0     11    23%     5.4      0.0      0.3     0.6     0
weaver          54.6     23.5     2.5     12    23%    14.1      0.0      0.6     0.5     0
tempoist        47.8     29.0     3.0     12    23%     4.6      0.0      0.5     0.8     0
zealot          36.2     13.5     1.7      8    40%     6.0      0.6      0.2     0.3     0
glutton         21.0      9.0     1.1      5    50%     6.7      0.3      0.0     0.1     0
debtor          55.6     33.0     4.0     10     3%    24.2      2.7      0.1     0.3     0
```
`score ~` = median · `segs⤒` = deepest run · `die@1` = %runs snapped at segment 1 ·
`wit μ` = witness worth · `run⚑` = action-capped runaways (none — the snap-band is bounded).

## What this proves (the point of the exercise)

- **Every build reaches the stack.** All seven fire witnesses (`wit μ > 0`); Zealot,
  Glutton and Debtor take curses via fang corruption; Miser/Weaver/Tempoist record blooms;
  everyone stitches. Runs reach segment 12. The stack is no longer *dormant on the bench* —
  it is being played.
- **The debt coil is exercised for the first time.** Debtor's `early` fang policy gives it
  the **lowest segment-1 death rate (3%)** — the wild keeps it alive — and it farms **2.7
  curses/run** (debtors_grin firing per cursed segment → the **highest witness worth, 24.2**).
  The fang→curse→cursed-run loop the design leans on now has an agent that walks it.
- **The identities are legible and diverge as designed.** Miser banks fast and deep;
  Zealot/Glutton run hot (40–50% die@1 — the greed cost is real); Monk stays shallow under
  the current tuning; Tempoist stitches most. This is exactly the differentiation the
  witness registry was built to reward.
- **It hints at the §11 dangers.** Glutton flags `<0.5× median` (its named "self-limiting"
  danger — it spends spins to fish and dies at segment 1 half the time). Miser tops raw
  mean (its named "dominance-by-accessibility" danger). These are *smoke*, not verdicts —
  but the bench is clearly pointing its instruments at the questions §11 asks.

## Caveats / reads for the eventual re-bench

- **Seed-set sensitivity.** The `viability read` flipped between n=20 (Miser flagged >1.5×)
  and n=30 (only Glutton flagged). Small samples are noisy; the real re-bench needs a large,
  fixed seed corpus. The tool reports the read; it does not (and must not yet) assert it.
- **Segment-1 is hot for everyone** (23–50% die@1), echoing the two inaugural single-seed
  reports. Under the current bounded-DECAY generator, a target-locked keep policy dies early
  a lot. This is the **#1 balance target** (`costAwareGenerator.snapBandController`, still
  OFF/untuned) — and the archetype bench is now the instrument that can tune it: sweep the
  P(snap) band and watch die@1 / mean-segs / the viability spread move together.
- **Policy sophistication is deliberately modest (v1).** Deepen auto-picks its face; the
  knot chases one tight rung (not the double-knot bonus); Monk doesn't yet exploit
  Concentration depth the way the jam build proved possible. These are the obvious v2 knobs
  — but v1 is honest, reactive, and seed-general, which is what the bench needed first.

## What it unblocks

The snap-band tune (HANDOVER #2) is no longer bench-blind: `npm run bench` is the dial's
readout. Flip `snapBandController` on, sweep `NUMBERS.snapBand`, and the die@1 / segs / §11
spread become a live gauge. The archetype bench is the instrument the feature-complete
re-derivation runs through.

## Reproduce

```bash
npm run bench                                            # all 7 × 12 seeds
node packages/agent/archetype_driver.mjs all --n 30 --seed0 1000
node packages/agent/archetype_driver.mjs debtor --n 8 --verbose   # watch the curse coil
node packages/agent/tests/archetypes_test.mjs            # pure policy unit test (28 assertions)
```
