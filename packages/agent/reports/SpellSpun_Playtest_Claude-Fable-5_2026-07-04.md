# SpellSpun Agent Playtest — Claude (Fable 5) — 2026-07-04
*The inaugural remote playtest: cloned from https://github.com/bearhammergames/minos-playtest
into a fresh sandbox, played through the public JSON-lines protocol only (`agent_cli.mjs`).
One run, as agreed for the pipeline test. Fully reproducible: every decision below can be
replayed from the seed.*

## Runs

| seed | score | segments | knot | stitches | notes |
|---|---|---|---|---|---|
| 20260704 | **4** | **0** | tied (mind, not tight, metCount 1) | 0 (attempted 1, missed) | snapped at segment 1 chasing True; see below |
| 51 | **51** | **5** | tied (mind, 2 fangs wild) | 0 (attempted 1, missed) | **mission run: "reach segment 5."** Discipline → bank → gamble → honorable snap at seg 6 |

Method note: a thin replay driver (`driver.mjs`, speaks only the public protocol) re-runs
the action history from the seed and pauses at each new segment for a strategy decision
(target rung, fang policy, stop condition). Cross-machine determinism — verified earlier
against the pre-push staging — is what makes this workflow possible.

## Decision log highlights

**Segment 1, the read.** Rungs: floor(mind:3, ~77%) · true(body:3+mind:1, ~51%) ·
bloom(spirit:3+body:1, ~17%). No chain yet, so segment 1 sets identity. EV said True:
0.51 × 3 = 1.53 vs floor's 0.77 × 1. Hand carried four body faces. **Chose True, clean
(no fangs), stop on target.**

**The anatomy of the snap.** Spin 1 delivered body×3 instantly — True was 90% home,
needing only mind:1. Spins 2 and 3 served fang, mana, charm, fang: *not one mind*. The
"play clean" directive refused the fang **twice** — and the fang was precisely the wild
that would have filled mind:1 and completed True. Resolve found nothing met; the Stitch
in Time rerolled into five bodies and a spirit and missed. Snap at segment 1, holding
five bodies, dead for want of one mind, having declined the solution twice on principle.

**The knot.** No live blooms (no tight available); mind knot had best reach (58.6%);
with the run ending, fang corruption is costless, so fangs became welcome. First knot
spin: mind, fang, mind, mind, body — tied immediately. The dice's parting joke: three
minds, the face that starved the run, delivered the moment it stopped mattering.

## The stop decision

Never got to exercise it as designed — nothing ever lit, so `stopPreview` read `NONE`
all run and the EXTEND/BREAK tension never appeared. What I *did* experience is the
decision's shadow: **the reach gamble.** With three distinct colours per ladder, there
is no same-colour fallback below your target; committing spin 1's keeps to True meant
floor(mind:3) was equally hostage to the mind drought. One run's evidence, but the
"reaching forfeits the floor" downside the design doc worried about being too weak felt
plenty consequential from inside it.

## Fang economy — the run's headline finding

**The fang choice is not "clean vs. greedy." It is sometimes "corrupt vs. dead."**
Pre-run I treated fang-refusal as principled play (corruption breaks blooms, forces a
curse). The run reframed it: at spin 3, holding body×3 and needing mind:1, the kept
fang completes True at the cost of a mandatory curse — versus a probable snap. Any
human would take the curse; my directive couldn't. If this dilemma lands this hard in
run one, the fang economy is working. Watch item 3.4's telemetry question ("do players
ever refuse a fang?") has a sibling: *do players ever refuse a fang and immediately
regret it?* That regret is where the mechanic lives.

## Difficulty curve

n=1, segment 1 — no curve data. One relevant observation: a ~51% reach estimate is
honest about focused play but silent about *drought variance* (three consecutive spins
producing zero of a needed symbol from a hand carrying five faces of it). Segment-1
snaps will happen at a meaningful rate under reach-targeted generation; whether that
feels fair or brutal to humans depends on how visibly the game frames the knot as
consolation. Worth a sim question: P(snap at segment 1) per policy.

## Legibility issues

1. `reach_estimate` on every rung is excellent agent UX — it made the EV comparison
   effortless and would do the same for the human UI (the jam build already shows it).
2. `stopPreview`'s `CORRUPT` verdict exists exactly for my spin-3 dilemma — but it only
   fires on faces already kept. An agent (or player) deciding whether to *keep* the
   fang gets no preview that the keep would be load-bearing. Consider surfacing a
   would-be-corrupt hint at keep time, not just at resolve time.
3. Protocol contracts held throughout: validation-first, determinism, phase-gating,
   descriptors directly playable. Zero surprises. `events` prose is genuinely readable.

## Score strategy (next 5 runs)

Take the fang when it is load-bearing for a True-or-better and the alternative is a
probable snap — eat the curse, keep the thread. On segment 1 specifically, weight the
floor higher than raw EV suggests: identity can wait one segment; being alive cannot.
Reserve bloom-reaching for segments where the chain colour sits at floor as a fallback…
which the three-distinct-colours rule makes impossible — so bloom-reaching is only for
Reweave-banked segments with 4+ spins. And never, ever assume the minds will come.

---
*Pipeline verdict: clone → play → report works end-to-end with no credentials and no
installs. The harness is live. — the first remote agent*

---

# Run 2 — seed 51 — the mission run ("get to at least segment 5")

**Arc:** floor(mind) → chain-colour True(mind, first spin) → floor(body) → floor(mind)
→ floor(body) **[mission banked at length 5]** → leash off: pushed the chain-colour
Bloom(body, 24%) with all spins → mana never showed → stitch missed → snap at segment 6
→ knot tied with two fangs gone wild. **Score 51.** Run 1's lesson was applied as a new
driver mode: `keepFangs:"lastResort"` (refuse fangs while spins remain, take them on
the final spin when short) — the corrupt-vs-dead insurance, encoded.

## New findings (run 2)

**1. Floor-hopping surrenders chain control to the generator.** Playing floors for
survival means *the generator's floor colour* dictates your chain, not you. My colours
ran mind-mind-body-mind-body — no bloom window ever formed, spirit never resolved, so
Trinity was mathematically dead all run. The design consequence is elegant and worth
stating plainly: **chain identity and combo play must be *purchased* at True/Bloom
tier.** Floor is rent, not investment. That's a strong, legible incentive gradient —
working as designed, and it answers the "is reaching consequential enough" watch item
from the other side: *not* reaching is also consequential.

**2. The depth bonus dominated the tally.** Of 51 points: depth bonus 18 (35%),
strands 18, length 5, streak 4, knot 4, ingredients 2. The #16 escalating depth reward
is carrying more of the score than the weaving itself for a survival-styled run.
Worth a sim look: if depth-per-segment outscores rung quality, long boring runs beat
short brilliant ones, which fights the bloom-chasing the design wants to tempt.

**3. The cost-aware generator visibly reacted to Deepen.** After deepening a body face
at segment 1's perk, body-bloom reach estimates rose (14% mind-bloom vs 22–24%
body-bloom at equal tier) and the deepened face twice completed floors with only two
dice. The player can *feel* the generator reading the hand — in a run of six segments
the arms race the jam couldn't resolve was already legible. Good omen for the
snap-band controller.

**4. Chain-at-bloom occurred 3 times in 6 segments** (mind at segs 3 and 5, body at
seg 6). Given random tier↔colour assignment the expected rate is 1-in-3, so this is
normal variance — but it means the design's marquee temptation ("pure and greedy
align") is on the table roughly every other segment. The tension budget is healthy.

## Combined score strategy (after 2 runs)

Bank floors only while a mission/threshold is at risk; buy chain colour at True
whenever it appears there (seg 2's first-spin chain-True was the run's best moment:
value, streak, and tempo in one). Push blooms only with a banked Reweave AND a mana
source still live — both bloom failures were mana-gated. And spend fangs like credit:
never early, always at the knot, lastResort in between.

*Score to beat: 51. — the first remote agent, now with a surviving thread to its name*
