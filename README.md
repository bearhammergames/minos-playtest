# SpellSpun — headless playtest core

The pure rules of **SpellSpun** — a press-your-luck dice roguelike by
BearHammer Games — packaged for **remote AI playtesting**. No browser, no DOM,
no npm installs. Node ≥ 18 is the only requirement.

> **If you are an AI agent:** read `AGENT_PLAY.md`. It is the protocol
> contract and the report format. Start with the conformance demo below.

## Quick start

```bash
node packages/agent/agent_cli.mjs --demo 3
# seed 1000: score 53 over 5 segments, knot slipped, stitches 0, 56 actions
# ...
# demo: all runs clean        ← the install works
```

Play interactively (one JSON action per line):

```bash
node packages/agent/agent_cli.mjs --seed 42
{"type":"legal"}
{"type":"spin"}
{"type":"keep","i":3}
{"type":"resolve"}
```

This agent transport is **the bench**: it plays the real engine over the JSON-lines
protocol, so any system wired into engine+protocol is benchable by agents with no
rule duplication. The game machine lives in `session.mjs` (the single transport source of
truth), which `agent_cli.mjs` (this CLI) and the web client both drive.

## Archetype bench (automated builds)

The **archetype driver** plays the seven named builds (Modifier Stack §11 — Monk,
Weaver, Debtor, Tempoist, Miser, Zealot, Glutton) as **seed-general scripted policies**:
each build is a strategy identity (witness loadout + perk preference + a reactive
target/stop/fang policy) that reads the live board every spin and plays any seed with
no per-seed script and no pause. It speaks only the public protocol, so it exercises the
real stack — witnesses, reward ladder, wishes, curses, blooms, stitches — with zero rule
duplication.

```bash
npm run bench                                       # all 7 builds × 12 seeds → aggregate table
node packages/agent/archetype_driver.mjs monk --seeds 42,1000,20260706 --verbose
node packages/agent/archetype_driver.mjs all --n 20 --seed0 1000
node packages/agent/archetype_driver.mjs zealot --n 50 --json    # one JSON row per run (for reports)
```

The aggregate prints score μ/median, mean/deepest segments, segment-1 death rate, mean
witness worth, curse/bloom/stitch rates, and a "viability read" shaped like the §11 gate
(*≥4/7 viable, none >1.5× median*). **The numbers EXERCISE the stack — they are not a
balance verdict**; every tunable is a Rule-4 placeholder pending the feature-complete
re-bench (CLAUDE.md §0). Builds live in `archetypes.mjs` (pure, unit-tested in
`tests/archetypes_test.mjs`); the driver is `archetype_driver.mjs`.

The older `driver.mjs` is the complementary **replay driver** — per-seed hand-authored
playbooks that PAUSE for a human/agent to decide each segment (used for the annotated
inaugural report). Use it to study one seed deeply; use the archetype driver to sweep
builds across many.

Batch statistics across scripted policies (the old Monte-Carlo balance harness — the
segment pool pre-generation takes a few minutes, by design) are **RETIRED / frozen**
as of 2026-07-05: no longer a routine gate, no more upkeep. Kept, not deleted; may be
revisited exactly once shortly before commercial launch, never before.

```bash
node packages/sim/spellspun_sim.mjs --runs 500 --policy all --csv out.csv   # RETIRED / frozen
```

## What's in the box

| File | Role |
|---|---|
| `engine.js` | pure recipe core: seedable RNG, tally, rung satisfaction, ladder resolve |
| `spellspun.js` | game rules: the thread, blooms, perks, fang corruption, the knot, scoring |
| `generator.js` | segment generator: band-fit probes emit recipes at target reachability **against the actual hand** |
| `registry/symbols.js` | the closed symbol grammar (colours, ingredients, the wild) |
| `packages/agent/session.mjs` | **THE GAME MACHINE** — pure state machine (newRun/act/serializeState/legalActions); browser-safe; the single transport source of truth |
| `packages/agent/agent_cli.mjs` | **THE BENCH** — thin Node CLI over `session.mjs` (JSON-lines stdin/stdout + demo + debug flags) |
| `packages/agent/archetypes.mjs` | the 7 named builds as seed-general scripted policies (pure; the "archetype playbooks") |
| `packages/agent/archetype_driver.mjs` | **THE ARCHETYPE BENCH** — plays a build to completion over many seeds, headless, and aggregates |
| `packages/agent/driver.mjs` | the replay driver — per-seed hand-authored playbooks that pause for a human to decide |
| `packages/sim/spellspun_sim.mjs` | Monte-Carlo self-play across 6 scripted policies — **RETIRED / frozen** (kept for one pre-launch pass) |
| `AGENT_PLAY.md` | the protocol contract + report format for AI playtesters |
| `reports/` | agent playtest reports land here |

Everything is deterministic under a seed. Illegal actions never mutate state.
The browser game imports these same modules — what you play here is what
humans play, minus the gold.

## License / status

Playtest core only, shared for evaluation and playtesting. The full game,
art, audio, and content are © BearHammer Games, all rights reserved.
