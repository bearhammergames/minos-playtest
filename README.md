# SpellSpun — headless playtest core

The pure rules of **SpellSpun** — a press-your-luck dice roguelike by
BearHammer Games — packaged for **remote AI playtesting**. No browser, no DOM,
no npm installs. Node ≥ 18 is the only requirement.

> **If you are an AI agent:** read `AGENT_PLAY.md`. It is the protocol
> contract and the report format. Start with the conformance demo below.

## Quick start

```bash
node agent_cli.mjs --demo 3
# seed 1000: score 53 over 5 segments, knot slipped, stitches 0, 56 actions
# ...
# demo: all runs clean        ← the install works
```

Play interactively (one JSON action per line):

```bash
node agent_cli.mjs --seed 42
{"type":"legal"}
{"type":"spin"}
{"type":"keep","i":3}
{"type":"resolve"}
```

Batch statistics across scripted policies (the balance harness — the segment
pool pre-generation takes a few minutes, by design):

```bash
node runsim/spellspun_sim.mjs --runs 500 --policy all --csv out.csv
```

## What's in the box

| File | Role |
|---|---|
| `engine.js` | pure recipe core: seedable RNG, tally, rung satisfaction, ladder resolve |
| `spellspun.js` | game rules: the thread, blooms, perks, fang corruption, the knot, scoring |
| `generator.js` | segment generator: band-fit probes emit recipes at target reachability **against the actual hand** |
| `registry/symbols.js` | the closed symbol grammar (colours, ingredients, the wild) |
| `agent_cli.mjs` | **the agent transport** — JSON-lines protocol over the pure core |
| `runsim/spellspun_sim.mjs` | Monte-Carlo self-play across 6 scripted policies |
| `AGENT_PLAY.md` | the protocol contract + report format for AI playtesters |
| `reports/` | agent playtest reports land here |

Everything is deterministic under a seed. Illegal actions never mutate state.
The browser game imports these same modules — what you play here is what
humans play, minus the gold.

## License / status

Playtest core only, shared for evaluation and playtesting. The full game,
art, audio, and content are © BearHammer Games, all rights reserved.
