# SpellSpun/Minos Agent Playtest — Fable 5 (claude-fable-5) — 2026-07-09

**Branch:** `generator-v2` (387998f — G1 physics kernel, G2 joint probe, G3 snap-band, all native-on).
**Focus:** generator stress — aggressive building, patron 4+ depth, deliberate debt line, telemetry audit, nofit markers.
**Conformance:** `npm run demo` → `demo: all runs clean` (checked before play).
**Method:** replay driver (`packages/agent/driver.mjs`) with playbooks `_tmp/playbook_424242.json` / `_tmp/playbook_424243.json`
(both verified byte-identical against the stock driver at run end). Per-segment `s.generator` telemetry captured with a
read-only replay logger (a driver copy with extra printing only — the stock driver's pause does not print the generator
block; action logic untouched).

## Runs

| seed | score | segments | knot | stitches | notes |
|---|---|---|---|---|---|
| 424242 | 31 | 2 | none (snap is CUT) | 0 (1 offered, missed) | snapped on patron-1 boss (Grasping Widow keepCap 2); mind drought + immutable pre-spin directive |
| 424243 | 759 | 19 | none (snap is CUT) | 3 saves | reached **patron 7.2**; 7 grafts + 2 excises + 1 fang graft; 3 corrupts; ~10 liens (3 harsh) at death; snapped on a 62% true |

## Telemetry log — seed 424243 (the long run)

`power / pricedPower / pSnapTarget / pSnapPredicted / window / fit` per segment, plus the realized outcome:

| seg | patron | power | priced | target | predicted | win | fit | outcome |
|---|---|---|---|---|---|---|---|---|
| 1 | 1.1 | .4472 | .4472 | .060 | .0917 | – | **nofit-hard** | bloom mind hit (1 spin) |
| 2 | 1.2 | .4479 | .4476 | .100 | .0917 | – | | floor hit |
| 3 | 1.3B | .4590 | .4533 | .150 | .1417 | **W** | | true hit (1 spin) |
| 4 | 2.1 | .4729 | .4631 | .078 | .1000 | **W** | | floor hit + **corrupt #1** |
| 5 | 2.2 | .4625 | .4625 | .130 | .1542 | – | | floor hit |
| 6 | 2.3B | .4646 | .4637 | .195 | .1458 | – | **nofit-easy** | **stitch save** → true |
| 7 | 3.1 | .4875 | .4756 | .096 | .1208 | **W** | | bloom body hit (1 spin) |
| 8 | 3.2 | .4604 | .4604 | .160 | .1708 | – | | true hit |
| 9 | 3.3B | .4785 | .4732 | .240 | .2792 | **W** | **nofit-hard** | true hit (1 spin) |
| 10 | 4.1 | .4604 | .4604 | .114 | .1375 | – | | bloom body hit |
| 11 | 4.2 | .4479 | .4479 | .190 | .1875 | – | | **PURE mind×3 @0.000 hit in 2 spins** |
| 12 | 4.3B | .4458 | .4458 | .285 | .3083 | – | | true hit |
| 13 | 5.1 | .4257 | .4257 | .132 | .1167 | – | | floor hit (1 spin) |
| 14 | 5.2 | .4257 | .4257 | .220 | .2417 | – | | pure bloom miss → fang floor, **corrupt #2** |
| 15 | 5.3B | .4417 | .4369 | .330 | .3833 | – | **nofit-hard** | true hit |
| 16 | 6.1 | .4410 | .4389 | .150 | .3292 | – | **nofit-hard** | bloom body hit |
| 17 | 6.2 | .4340 | .4340 | .250 | .2500 | – | | **stitch save** → floor |
| 18 | 6.3B | .4451 | .4408 | .375 | .3667 | – | | true hit, **corrupt #3** |
| 19 | 7.1 | .4542 | .4475 | .168 | .1917 | **W** | | **stitch save** → bloom body |
| 20 | 7.2 | .4542 | .4508 | .280 | .2958 | – | | **SNAP** (62% true missed) |

Seed 424242: S1 `.4451/.4451/.060/.1333/nofit-hard` (bloom hit) · S2 `.4493/.4472/.100/.100` (floor hit) ·
S3 boss `.4528/.4500/.150/.175` (SNAP, stitch missed).

## Focus verdicts

### 1. BUILD AGGRESSIVELY — does the response read as designed?

**Partially.** The mechanism is visible and mostly honest, but the card mix and the debt treadmill distort it.

- **God-window per upgrade: CONFIRMED at ~1–2 segments** for grafts. Windows opened at S3–S4 (after the S2 graft),
  S7 (after the S6 graft), S9, S19 (after the S18 graft) — seed 424243. `window` uses an eps deadband
  (`generator.js:471, powerNow > pricedPower + eps`), so the tiny +.003 power bump of 424242's S2 graft never registered
  (S3 read `window:false` at gap .0028) — by design, but it means small upgrades produce no felt window at all.
- **Re-tighten at richer offers: HALF-TRUE.** The good half: by P6–P7 my 7-graft body engine was being offered
  build-matched rungs — true body 53–62%, bloom body 32% at .28–.375 tension (424243 S16–S20). Richness bought by power,
  tension held. The bad half: the 3-distinct-colours set rule + a colour-concentrated build makes the third rung a
  DEAD SLOT nearly every segment — bloom spirit priced 0.046 (S2), 0.000 (S5), 0.000 (S8), 0.017 (S16), floor spirit
  0.017–0.021 (S18–S20). "Richness" was often one real rung, one decent rung, one corpse.
- **The fang graft priced power DOWN** (.4875→.4604, window slammed shut instantly, 424243 S7→S8). The wild face's
  completion value appears underweighted vs its dilution+lien risk — a designed-to-be-tempting card that the generator
  treats as pure debt. Worth a designer look: is that intended?
- **Card availability skewed the experiment:** across ~20 perk encounters I was offered Graft ×7 (took all), Excise ×3
  (took 2), Fang Graft ×1 (took it), **Deepen ×0 and Twin Etch ×0**. The "grafts, deepens, twins" axis was 90% grafts —
  either pool weighting or rarity gating keeps deepen/copy_etch out of a 19-segment run entirely.

### 2. GO DEEP — does lategame tension materialize?

**Yes — and the ramp is not the reason.** I reached patron 7 (segment 20). Realized tension: P1–P4 mostly coasted
(predicted .09–.19, most segments resolved in 1–2 spins); the wall arrived at the **P5 boss** (S15, predicted .383,
nofit-hard) and never left. But look at S16: the band asked for an EASY segment (target .150) and the generator could
only deliver .329 — **the tension came from ~10 accumulated rider liens, not from the +3%/patron base ramp.** Every
reach card ships a blemish; by P6 the debt treadmill (Scour/Absolve riders re-etching what they strip — S9's Scour and
S10's Absolve each billed a fresh mild) had eaten more power than grafts added (power peak .4875 at S7 → .4257 at S13).
The run's end felt **asymptote in pressure, accident in trigger**: three segments of ~.30 predicted, death on the
segment whose target rung read 62% — four throws produced zero mind faces because seven body grafts had hollowed the
colour out of my own hand. A self-built brittleness — thematic, arguably good design, but the *proximate* cause reads
as bad luck, not the wall.

### 3. DEBT LINE — is the cursed line viable?

**Viable, genuinely priced, and occasionally glorious.** I ran keepFangs true for patron 1–4 (424243) and lastResort
after; took 3 load-bearing corrupts (S4, S14, S18) and carried 5–10 liens from S12 to death.

- The joint probe visibly prices the debt: reach numbers stayed sane on a baned hand, and predicted P(snap) tracked the
  bane storms (S17's "50%" true died to seven forced firings in one segment — the number had priced them; I hit the tail).
- Banes are not pure downside in play: Errant Spins respun INTO needed faces at least four times (S13's floor was
  handed to me by my own bane; S16's bloom got its final body from the harsh Twin Errant respinning a fang). The
  texture is genuinely press-your-luck, not a pure tax.
- The final bill was legible: **Curse drain −37** on the tally, `Cursed ×3` combo line worth 0.
- BUT the debt VERBS underperform (see bug-suspects: bare-auto Shift thrash, cleanse riders re-etching).

### 4. TELEMETRY AUDIT — kernel honesty

Predicted vs realized was believable **except for one systematic hole**:

- **PURE rungs price at 0.000 while being very completable.** 424243 S11: true `mind×3, pure:true` displayed
  `reach 0.000`; I targeted it as a deliberate diagnostic and completed it in **two spins, no fangs** (5 mind-capable
  faces). The cause is in the shape model: pure voids on any off-colour keep (`generator.js:265`; the probe models an
  `overkeepP` error, `probe.js:125,192`) — but 0.000 says the probe's simulated player *never* plays colour-loyal.
  Counter-test S14 (bloom `mind×4 pure` @0.000) genuinely missed — so pure-rung reach is zero *regardless* of actual
  difficulty. Because these dead-read rungs inflate the set's pNone, they also poison `pSnapPredicted` and plausibly
  caused the S15/S16 nofit-hards. **This is the information kernel failing on exactly the "richer shapes" G3 reaches
  for at late patrons.**
- Otherwise: S6's nofit-easy predicted under-tension yet nearly killed me (bane variance) — one sample, not a fault;
  S20's .2958 ended the run — within its own error bars.

### 5. nofit MARKERS — field evidence

All contexts (all seed 424243 unless noted):

| marker | where | context |
|---|---|---|
| nofit-hard | S1 (both seeds) | **the starting hand cannot make the seg-1 band** (target .06, nearest .092/.133) — consistent across seeds; either the seg-1 target is too generous or the starter menus lack an easy-enough set |
| nofit-easy | S6 (P2 boss) | body-stacked hand, boss target .195, nearest .146 — set degenerated to 81%/4%/0.8%. **The G4 apex-rung gap, exactly as predicted**: the fitter wants more tension and has no richer shape to reach for |
| nofit-hard | S9 (P3 boss) | target .24, nearest .279 — dead spirit rung inflates union pNone (colour-concentration side-effect) |
| nofit-hard | S15 (P5 boss) | target .33, nearest .383 — debt-drowned hand, no rung >28% |
| nofit-hard | S16 (P6.1) | **worst gap: target .150, nearest .329** — an "easy" slot the generator couldn't make easy; rider debt, not ramp |

Note the asymmetry: nofit-easy appeared exactly once (pre-debt, boss, strong hand — the apex case); nofit-hard is the
common failure and is mostly *debt-and-dead-rung* driven.

## Decision-log highlights (quotable from the playbooks)

1. **424242 S3 (boss, keepCap 2) — the pivot that wasn't.** Spin 1 showed both spirit faces (floor completable
   immediately); my pre-spin directive said `target:true` (mind, 47%) and the driver cannot pivot mid-segment. Mind
   never came; stitch missed; run over at 2 segments. Playbook note: "true mind 47% best reach, extends chain to 3."
   A human stops at that floor. **Driver limit bit hard here.**
2. **424243 S6 (nofit-easy boss) — the lien storm.** An 81% floor nearly snapped: Errant Spin rerolled a needed body
   into a fang, the harsh Twin Errant stole d0's shown body on the last spin; the stitch's whole-tray rule then
   resolved true(spirit) instead. Under-tense on paper, heart-stopper in play.
3. **424243 S11 — the 0.000 diagnostic.** Playbook note: "true mind3 PURE priced 0.000 but my read is 50–70% —
   deliberately testing the kernel." Landed in 2 spins. The single most valuable moment of the session.
4. **424243 S19 — stitch save #3 into the bloom.** Seized Spin locked d4 (locked ≠ kept, so the pool missed body×3+mana);
   the stitch's whole-tray answer completed the 6×3 bloom exactly. Also the segment where the fizzled Graft billed its
   rider (bug-suspect #1).
5. **424243 S20 — the death.** 62% true, chain body×6, Chain-Keeper contract pre-met and 2 segments from paying:
   four throws, zero mind faces. The 7-graft body engine died of its own colour hole.

## The four designer questions

**When did you stop, and why?** Almost never with spins in hand — the generator's bands made most targets land on
spin 1–2 naturally (P1–P4 resolved early because the *target lit*, not because I banked safety; e.g. 424243 S1/S3/S7/S9
one-spin resolves). The only deliberate early-stops were `stopWhen:"target"` directives on floors (S2, S4, S5, S13)
protecting the chain and the run. From P5 on there was nothing to "stop" about — every segment consumed all spins.

**Did you ever refuse a fang?** Yes, structurally: `lastResort` refused shown fangs on every non-final spin (e.g.
424243 S6 spin 1, fang shown and passed). And once at the POLICY level: I ran `keepFangs:true` through the
Fang-Fancier patron *chasing* corrupts and got zero — the run was too clean for fangs to go load-bearing, then corrupt
#1 landed one segment *after* she left (S4). The fang's cost lands (harsh liens hurt: Twin Errant Spin stole
game-relevant faces repeatedly) — but the fangCourt contract couldn't make me corrupt *on demand*.

**Where did the curve bite?** Seed 424242: instantly (P1 boss, keepCap 2 + a colour drought). Seed 424243: the P5 boss
(S15) is where tense became grim — predicted .38, no rung above 28%, and every subsequent "easy" slot still read ~.30
because of rider debt. Doom-feeling never fully arrived; it stayed "tense" until it was suddenly over.

**Was anything illegible?** Four things.
1. **`pure:true` rungs are undocumented in AGENT_PLAY.md** — no explanation that off-colour keeps VOID them, and their
   reach 0.000 gives the player no usable signal (it reads "impossible", it means "the probe won't try").
2. **A fizzled boon billing its rider** (S19: "Graft: every drum is full — the graft fizzles … a mild blemish settles
   on die 5 face 0") reads as a rules violation of the disclosed-price principle.
3. **Locked ≠ kept** (S19: Seized Spin locked a die showing a needed face; `metNow` excluded it; the stitch then counted
   it). Correct per rules, but the first encounter is a trap.
4. **Jackpot contracts don't scale to patronLen 3:** fangCourt-3 was structurally out of reach in a clean patron
   (0/3, 424243 P1); chainAlive-4 was mathematically impossible at P5 entry (chain 1, 3 segments) and trivially pre-met
   at P7 entry (chain 5). Neither ever presented a live decision.

## Bug-suspects (ranked)

1. **Fizzled Graft still bills its rider** — 424243, post-S19 ash draw, all drums at faces.max. Boon no-op + bane etch
   = negative card. (Either refund the rider or filter capped Grafts from the draw.)
2. **Joint probe prices `pure` rungs at 0.000 regardless of hand** — 424243 S11 (completed at 0.000 in 2 spins) vs S14
   (miss). Inflates pSnapPredicted for every pure-carrying set; likely a cause of late nofit-hards; makes G3's "richer
   shapes" unreadable. Suspect the probe's chase policy never plays colour-loyal (overkeepP models the error but the
   base policy seems to void pure ~always).
3. **The 3-distinct-colours set rule + concentrated builds = permanent dead rung** — bloom/floor spirit at 0.000–0.05
   in 8 of 20 segments (424243). The fitter "fits the band" with degenerate 1-real-rung sets. G4 apex work should
   probably include shape-substitution for the starved colour (pure/concentrated rungs in the BUILD's colour were the
   right idea — but see #2).
4. **Bare-auto Shift thrash** — three auto Shift picks moved the SAME mild bane d0f0→f1→f0→f1 (424243 S3/S8-end,
   S13-end parked onto the chain-colour face both times). The auto heuristic ("first bane → lowest-mag unenchanted
   face") should at least exclude round-tripping and prefer off-colour parking.
5. **Seg-1 nofit-hard on both seeds** — the .06 opening target is below what the starting hand can express (predicted
   .092/.133). Cosmetic (clamp works) but it means the telemetry opens on a red flag every run.
6. Minor: cleanse verbs on the ladder (Scour/Absolve) re-etching a mild via their rider makes them read as paid Shifts
   (S9, S10) — priced-as-designed, but the net-zero feel undermines the "debt exit" fantasy.

## Driver limits that bit (protocol notes, not engine faults)

- Pre-spin immutable directives: killed 424242 (S3 floor pivot unavailable); forced pure-target keeps (which,
  ironically, is what made the S11 pure-rung diagnostic clean).
- No `wish_reroll` support: the Generous One's boss-segment free reroll went untapped (P3 boss, 424243) — though the
  probe had priced it as a take-rate, so telemetry stayed honest.
- Auto-stitch on would-be snap: 3 saves in 424243 — all three were the run's best moments; fine.
- Bare-auto perk targeting (no pause at perk phase): the Shift thrash, the always-body auto-Graft, and the auto-Excise
  cutting a body face from the body build (S12-end) are driver-pick artifacts a human would avoid.

## Score strategy (next 5 runs)

Drop `shift_bane` from perkPref (bare Shift is a wasted card); prefer witness drafts at ash over it. Keep grafts but
STOP grafting one colour past ~3 extra faces — the S20 death says colour-holes kill deep runs; alternate graft colours
to keep all three rungs live (also starves the dead-rung degeneracy). Target pure rungs whenever displayed reach is
0.000 and the hand is colour-loyal — they are systematically underpriced free value until #2 is fixed. Run keepFangs
lastResort always; true only under fangCourt AND only if failing rungs on purpose is on the table.
