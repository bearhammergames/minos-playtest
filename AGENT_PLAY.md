# SpellSpun — Remote Agent Play Protocol (v1)

You are an AI agent asked to playtest **SpellSpun**, a press-your-luck dice
roguelike. This package is the game's **pure core** — no browser, no DOM, no
dependencies. If you have Node ≥ 18, you can play.

```
node agent_cli.mjs --demo 3        # conformance check (should print "demo: all runs clean")
node agent_cli.mjs --seed 42       # play interactively: one JSON action per stdin line
node runsim/spellspun_sim.mjs --runs 500 --policy all   # batch statistics (pool build takes minutes)
```

## The game in one paragraph

You are the **Enchantress**. A patron brings one wish; you spin it into a
thread, **segment by segment**. Each segment offers **three rungs** — Floor
(worth 1), True (3), Bloom (6) — each demanding a recipe of rune pips, each a
**different colour** (body / mind / spirit). You spin six dice (up to 3 spins),
**keep** the faces you want (keeps are final), and **resolve** whenever you
choose — you auto-complete the highest-value rung your kept pool satisfies.
**The stop is the choice:** stopping early protects your colour chain
(consecutive same-colour segments score streaks; varied colours score
Trinities); pushing on chases richer rungs but risks completing an off-colour
one — or nothing. Satisfy no rung and the thread **snaps**: you get one free
final cast (**the knot**), then the run is scored. A kept **fang** is a wild
that fills any slot — but if it was *load-bearing* (the rung only completed
because of it), the thread corrupts and a **curse is mandatory**. Between
segments you draw 1 of 3 perks. Difficulty rises each segment. Go as far as
you can; leave the longest, finest thread.

## Protocol

One JSON object per line on stdin → one JSON result per line on stdout.
First line out is a hello + initial state.

| Action | When | Effect |
|---|---|---|
| `{"type":"state"}` | always | full state |
| `{"type":"legal"}` | always | every action valid right now (descriptors are directly playable) |
| `{"type":"new_run","seed":123}` | always | fresh run (seed optional; same seed = same run) |
| `{"type":"spin"}` | segment/knot, `rollsLeft > 0` | roll all loose dice |
| `{"type":"keep","i":N}` | after a spin | keep die N's shown face. **Keeps are final.** |
| `{"type":"resolve"}` | after ≥1 spin | stop: auto-complete the highest-value satisfied rung |
| `{"type":"stitch"}` | when offered | the Stitch in Time: reroll the loose dice once; the whole shown tray (fangs excluded) answers |
| `{"type":"snap"}` | when offered | decline the stitch, accept the snap |
| `{"type":"perk","id":"...","die":N,"face":M}` | perk phase | take a card; `die`/`face` target Deepen (omit to auto-pick) |

### State highlights (read these before acting)

- `rungs[]` — the three recipes: `req` (pip demands), `value`, `colour`, and
  `reach_estimate` (the generator's probability a focused player reaches it).
- `tray[]` — the six dice: shown `symbol`, `mag` (pips), `kept`, `locked`.
- `metNow[]` — rungs your kept pool satisfies **right now**.
- `stopPreview` — **the most important read in the game.** What resolving now
  does: `EXTEND` (continues your colour chain), `BREAK` (scores but breaks the
  chain), `CORRUPT` (a fang would be load-bearing → mandatory curse), `NONE`
  (you'd snap — or stitch).
- `thread` — the run's memory: `chain` (current colour), `colours` history,
  `frayed` colours (can't bloom), `liveBloomColours` (a knot matching one is
  a "tight knot" bonus).
- `curses` — active handicaps: `rollLock` (a die locks each spin), `keepCap`
  (max keeps per spin).

### Contracts you can rely on

1. **Full information.** The state is everything; nothing is hidden.
2. **Validation-first.** Illegal `act` returns `{ok:false, error}` and mutates
   nothing. Errors are written to be read by an agent.
3. **Determinism.** Same seed + same action sequence = same run, exactly.
4. **Keeps are final.** There is no unkeep. Decide before you keep.
5. **Phases gate actions.** During `perk`/`stitch` only their actions are
   legal. `legal` never lies.

## What "playing well" means here

Mechanical skill is recipe-reading and press-your-luck timing. But the game is
*about* one tension: **stop early and stay pure, or push and go broad.**
Streaks of one colour score Concentration; rotating all three scores Trinity;
the fang saves segments now and bills you later. The designer's questions —
the data no scripted policy can give:

1. **When do you stop, and why?** Note every resolve where you left spins
   unused, and what the stopPreview said.
2. **Do you ever refuse a fang?** If keeping a fang never feels wrong, its
   cost isn't landing.
3. **Where does the difficulty curve bite?** Report the segment where runs
   start feeling doomed rather than tense.
4. **Was the choice legible?** Any moment you resolved and got a different
   rung than you expected — quote the state.

## Report format

After playing (suggest: 5+ interactive runs across different seeds, plus one
`--demo` conformance check), write a markdown report:

```
# SpellSpun Agent Playtest — <model name> — <date>
## Runs
| seed | score | segments | knot | stitches | notes |
## Decision log highlights   (3-5 moments: state → choice → why)
## The stop decision         (when you stopped early and what drove it)
## Fang economy              (did the corrupt cost change your keeps?)
## Difficulty curve          (where tension became doom; snap segments)
## Legibility issues         (anything surprising or unclear in the rules/state)
## Score strategy            (what you'd do differently next 5 runs)
```

Commit the report to `reports/` or return it to the person who asked.
