# SpellSpun — Remote Agent Play Protocol (v1)

You are an AI agent asked to playtest **SpellSpun**, a press-your-luck dice
roguelike. This package is the game's **pure core** — no browser, no DOM, no
dependencies. If you have Node ≥ 18, you can play.

```
node packages/agent/agent_cli.mjs --demo 3        # conformance check (should print "demo: all runs clean")
node packages/agent/agent_cli.mjs --seed 42       # play interactively: one JSON action per stdin line
```

> **Bench:** agent-CLI playtesting (this harness + the `/playtest` skill) is the bench.
> The Monte-Carlo sim (`packages/sim/spellspun_sim.mjs`) is **retired** (frozen 2026-07-05).

## The game in one paragraph

You are the **Enchantress**. A patron brings one wish; you spin it into a
thread, **segment by segment**. Each segment offers **three rungs** — Floor
(worth 1), True (3), Bloom (6) — each demanding a recipe of rune pips, each a
**different colour** (body / mind / spirit). You spin six dice (up to 3 spins),
**keep** the faces you want (and **un-keep** them again before you resolve), and **resolve** whenever you
choose — you auto-complete the highest-value rung your kept pool satisfies.
**The stop is the choice:** stopping early protects your colour chain
(consecutive same-colour segments score streaks; varied colours score
Trinities); pushing on chases richer rungs but risks completing an off-colour
one — or nothing. Satisfy no rung and the thread **snaps** — the run **ends**
and is scored (the **knot** is CUT: `doSnapEnd` ends the run; a future *snap
relic* may one day grant a last cast — `doSnapToKnot` is dormant). A kept
**fang** is a wild that fills any slot — but if it was *load-bearing* (the rung
only completed because of it), the thread **corrupts** and a **lien bane** is
etched onto a face (the §7 debt model — no mandatory curse pick; the lien is
cleansable later by the debt verbs). Between
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
| `{"type":"keep","i":N}` | after a spin | keep die N's shown face. Keeps are no longer *final* — see `unkeep`. |
| `{"type":"unkeep","i":N}` | segment/knot, after a spin, for a KEPT die | **AMBIENT UN-KEEP** (Bear verdict 2026-07-14): let a kept die N go — it drops back to the loose pool and rerolls next spin. **FREE, no rng.** Legal for any **manually**-kept die that is **not `locked` and not `forced`** (a forcedKeep die is the ritual's demand, held). **No keepCap gate and no `rollsLeft` gate** — un-keeping frees the DIE, **never the `keepSpend` BUDGET** (a `keepCap` curse's bite survives: keep→unkeep→re-keep cannot launder the cap), and un-kept dice are **excluded from the resolve pool**, so dropping a profane keep can flip a `pure`/`exact` rung **met** even at 0 rolls (a real line). Distinct from — and coexists with — the Open Hand `release` verb (below). |
| `{"type":"resolve"}` | after ≥1 spin | stop: auto-complete the highest-value satisfied rung |
| `{"type":"stitch"}` | when offered | the Stitch in Time: reroll the loose dice once; the whole shown tray (fangs excluded) answers |
| `{"type":"snap"}` | when offered | decline the stitch, accept the snap |
| `{"type":"perk","card":N}` / `{…"slot":M}` | perk phase | take card N (pick by `card` index; `id` also accepted). A **draft** card inks a **witness** into a portrait slot; when all 5 slots are full it OVER-INKS — `"slot":M` names the worn witness (0-based) to replace, or omit it to auto-replace the **oldest** (slot 0). `die`/`face` **target a chosen face** for a Deepen reach card OR a face-ETCH **enchant** reach card (the reroll / Open Hand / Carver's / Warding / Augur's / Echo sigils) OR a **§D3 BARGAIN** card (the pair's boon+bane both land on the named face): the named `{die,face}` is deepened / etched. **Omit both** ⇒ AUTO: a Deepen auto-picks the most-demanded deepenable face; an **enchant / bargain card keeps the original RANDOM etch** (rng draw and all), so a bare pick is replay-exact and old records still replay. `legalActions` enumerates one `{card,id,die,face}` per legal face (for an enchant / bargain card: **every face** — hand faces are never blank; fang faces included, matching the random etch's reachable set) PLUS the bare auto pick. **§D1 FACE-ECONOMY cards** take their own targeting args — Graft/Fang Graft: `die` (`to` colour for Graft); Twin Etch/Excise: `{die,face}` — with a deterministic bare auto pick (see the Face economy section). **§D2 DEBT cards** act on a **bane** (first `polarity:'bane'` ench on a face) — Shift: `{die,face,toDie,toFace}` (move it); Scour/Absolve: `{die,face}` (strip it) — bare auto + fizzle-when-no-bane (see the Debt verbs section). |
| `{"type":"transform","di":N}` / `{"type":"transform","di":N,"to":C}` / `{"type":"transform","skip":true}` | transform phase | a chosen transformer offers a choice: transform die N's shown face (see `state.transformOffer.candidates` — each carries `i`/`fi`/`symbol`/`mag`), or skip (it's optional). **`convert`** (Carver's Sigil) also takes a `to` **colour** (`body`/`mind`/`spirit`, from `state.transformOffer.colours`, ≠ the face's current colour); **omit `to`** ⇒ the deterministic default (the colour the just-resolved rungs demanded most). deepen/erode ignore `to`. The recast is **permanent** (its reach lands next segment). |
| `{"type":"sigil","di":N}` / `{"type":"sigil","di":N,"target":M}` | segment/knot, when `state.sigils` lists one | INVOKE an opt-in sigil raised by die N's face. Its `effect` (see `state.sigils[].effect`) is either **`reroll`** — a **FREE, loose-only** re-throw (self/adjacent/random auto-target; `chosen` needs a `target` die), or **`expose`** (Augur's Sigil) — a **PEEK**: pre-draws die N's next face into `state.peeks` (no re-throw; the peeked face lands on that die's NEXT re-throw from any path). **Ambient & optional** (Law L4): coexists with spin/keep/resolve; ignoring it is just another move. A tapped reroll may raise ONE more sigil (bounded cascade). An **echo** sigil (Echo Sigil) is a `reroll` sigil auto-raised when a **forced bane** rerolls your echo-etched die. |
| `{"type":"release","target":M}` | segment/knot, when `state.releaseOffers` lists one | Open Hand — the ench-driven **undo** verb: **un-keep** kept die M (it rerolls next spin). **FREE**, no rng. Offered while an etched `release` face is shown AND another die is kept; **once per segment per etched face**. Does **not** refund the keepCap window budget. **Coexists with the ambient `unkeep` verb above** (distinct action type + `releaseUsed` budget, unaffected by an unkeep). NOTE: ambient un-keep now does the same for free & unconditionally, so Open Hand's *scarcity* is largely redundant — kept as-is pending Bear's call on a distinguishing power. |
| `{"type":"wish_reroll","di":N}` | segment, when `state.wishReroll` is present | The Generous One's **FREE, once-per-segment, loose-only** re-throw of die N (no `rollsLeft` cost; draws rng at action time so it replays exactly). **Ambient & optional** — ignoring it is just another move. Each use is billed one **mild bane per 2 uses** at her patronage's end. |

### State highlights (read these before acting)

- `rungs[]` — the recipes, **2–4 of them** as of §G4 (usually three; a boss/late composer may rest a colour
  → 2, or add an apex → 4): `req` (pip demands), `value`, `colour`, and `reach_estimate` (the generator's
  probability a focused player reaches it). A `tier:"apex"` rung (value 10) REUSES a colour with a distinct
  shape — see the dynamic-rung-sets section below. Two optional **rung SHAPES** vary the GOAL (never the
  symbols), surfaced as boolean flags on the rung:
  - **`concentrated:true`** — the single-colour req `{C:m}` is met only if **ONE kept face of C shows mag ≥ m**
    (a face DEEPENED through use). Pip-SUMS don't answer it (three mag-1 C faces ≠ a concentrated 3), so it
    self-gates until a Deepen lands — a shallow hand prices it near 0.
  - **`pure:true`** (or `pure:'<colour>'`) — the req is met only if **EVERY kept stat face is the demanded
    colour** — wilds (fangs promoted to `__wild__`) and blanks excepted. ONE off-colour keep VOIDS it (the
    loyal-build shape). Because a segment's three rungs carry three DISTINCT colours, chasing a pure rung
    means keeping ONLY its colour and rerolling the rest; its `reach_estimate` is priced on that purity-
    respecting line (not the mixed max-serve line), so a pure rung on a hand rich in its colour reads a real,
    non-zero reach — a hand that can't make that colour reads ~0.
- `reach_estimate` — **HONEST as of Generator v2 G2** (native `generator2.jointProbe`). The estimate now
  comes from the JOINT probe (packages/engine/probe.js), which simulates the segment through the shared
  physics KERNEL — so it IS priced with the active wish warps, the twist, and forced-bane (lien/rider)
  firings, not just the hand shape. A warped boss rung no longer prices like its unwarped twin; a floor
  that reads 60% is a floor that survives ~60% under the debt it actually carries.
- `reachCaveat` — **the LEGACY §D-fix5 stopgap, now flag-off ONLY.** With `generator2.jointProbe` native-on
  it is **SUPPRESSED** (the estimates above are honest, so the "~/⚠" warning retires). It still appears on
  the flag-off (legacy shape-only probe) path: `reachCaveat = { warps:N, banedFaces:M }` whenever a warp is
  active or a hand face carries a forced bane, marking those estimates UNADJUSTED. The client keys its
  "~"/"⚠" rendering off `reachCaveat` presence only, so on the native path the numbers simply read plain.
- `generator` — **§G2/§G3 generator telemetry** (present ONLY when `generator2.jointProbe` is on). Per segment
  `{ power, pSnapPredicted }`, plus a **band block** `{ pSnapTarget, pricedPower, window }` when the snap-band
  is on (`generator2.band`, native). `power` ∈ [0,1] is the stable **hand-strength scalar** (mean per-rung reach
  of a fixed canonical calibration ladder, evaluated hand-intrinsically — no boss warps/twist, no banked-spin
  tempo, but WITH standing debt + the hand's own offered sigils; it drops instantly under debt, G3 smooths its
  rise). `pSnapPredicted` ∈ [0,1] is the probe's **predicted P(no rung met)** for THIS segment's rung set under
  the full kernel (warps/twist/banes/take-rates). §G3 band block: `pSnapTarget` ∈ [0.05,0.60] is the designed
  **tension target** for this patron-position (`base(patronIndex) × stage(position)`, ramped + clamped — the
  fit lands `pSnapPredicted` within `fitTol` of it); `pricedPower` = `min(power, EMA(power, α))` is the
  **lagged** strength the fitter sizes the CEILING (offered values/shapes) against — a graft's `pricedPower`
  trails `power` for ~2 segments; `window` (bool) is true while `power > pricedPower` ("the world hasn't caught
  up" — a graft's comfort window). A `fit` marker (`'nofit-hard'`/`'nofit-easy'`) appears ONLY when no set
  landed in the band (a graceful clamp to the nearest achievable). `pSnapTarget`/`pSnapPredicted`/reach numbers
  are ALWAYS the honest actual-hand read — only the offered ceiling lags. All flow into the Run Record for the
  tuning campaign (predicted-vs-realized P(snap) is the information kernel's honesty gate).
- `tray[]` — the six dice: shown `symbol`, `mag` (pips), `kept`, `locked`,
  `forced` (a ritual `forcedKeep` auto-locked this die into the kept row), and
  `fi` (the index of the shown face into `hand[i].faces` — the drum's current face).
- `metNow[]` — rungs your kept pool satisfies **right now**.
- `sigils[]` — opt-in sigils raised by this spin's faces (Law L4's one sanctioned "input
  beside stop"): each `{di, effect, name, scope, desc, chosen, targets}` you MAY invoke via
  `{"type":"sigil",...}`, or ignore. `effect:'reroll'` = a **FREE, loose-only** reroll (`targets` =
  the loose dice it can re-throw; for `chosen`, the set you pick one from). `effect:'expose'` = a
  **PEEK** tap (Augur's Sigil) that fills `state.peeks` instead of re-throwing.
- `peeks[]` — a pre-drawn look at a die's next throw (from an `expose` tap): each `{di, face:{symbol, mag}}`
  is the face that die's **next re-throw** (spin / sigil / bane / wish_reroll — any path) will land, then
  the peek is consumed. Present only while a peek is queued.
- `releaseOffers[]` — Open Hand un-keep offers: each `{di, fi, name, desc, targets}` lets you
  `{"type":"release","target":M}` to un-keep one of the kept dice in `targets` (once per segment per
  etched face). Present only while an etched `release` face is shown and a die is kept.
- `stopPreview` — **the most important read in the game.** What resolving now
  does: `EXTEND` (continues your colour chain), `BREAK` (scores but breaks the
  chain), `CORRUPT` (a fang would be load-bearing → mandatory curse), `NONE`
  (you'd snap — or stitch).
- **THE STITCH EXCLUDES FANGS** (legibility note): the Stitch in Time answers with the WHOLE shown tray
  **fangs excluded** — a stitch is never fang-completed (a wild can't save the last bet). So a stitch tray
  that *looks* full can still MISS because a fang sits in a slot the rung needs: the fang does not answer
  the stitch. This is BY DESIGN (the fang saves a normal resolve, not the desperation re-throw), not a bug.
- `thread` — the run's memory: `chain` (current colour), `colours` history,
  `frayed` colours (can't bloom), `liveBloomColours` (a knot matching one is
  a "tight knot" bonus), and `outcomes[]` — one bead per resolved segment:
  `{tier, colour, value, colourPips, corrupt, cursedHere, stitched, metCount}`,
  plus two additive present-only-when-meaningful fields: `colours` (ALL met
  colours, dominant first — only on a mixed bead) and `frayed` (only when true).
- `curses` — the active ritual-warp constraints (from curses, and a patron's wish):
  `keepCap` (max keeps/spin), `lockDice` (dice that lock each spin), `rollLimit`
  (fewer rolls this segment), `forcedKeep` (rolled faces of a symbol auto-lock into
  your kept row — **enforced**; the Soaked Scholar's mana), `rerollOnRoll` (the first
  N faces of a symbol reel and reroll once — **enforced**), and `lockFirstKeeps`
  (authored, inert while keeps are already final).

### Witnesses — experimental, flag-gated (Modifier Stack §5b, Phase A)

Passive scorers (the "tattoo relics") that watch events and add **worth** at the
tally. OFF by default — they appear only when `balance.js on('witnesses')` is enabled,
so a default run is unchanged. When active:

- Set a starting loadout with `--witnesses id1,id2,…` (CLI) or `{"type":"new_run","witnesses":["patient_needle",…]}`.
- **Acquisition is now the DRAFT slot** (§4.2): the Reward Ladder's worth cards are **witness
  drafts** — pick a `kind:"draft"` perk card to ink that witness into a **portrait slot** (max
  **5**, `witnesses.portraitSlots`). Slots full ⇒ drafting OVER-INKS a worn witness (`"slot":M`
  chooses the victim; omit ⇒ oldest). Worn witnesses are never re-offered. When the portrait is
  full, `state.draw.portraitFull` lists the worn row for victim choice, and `legalActions` in the
  perk phase enumerates one `{"card":i,"slot":j}` variant per worn witness (plus the bare auto-replace).
- `state.witnesses` is an **array of objects** `{id, label, slot, fires, score}` — the worn row
  with each witness's accumulated fire count and worth. *(Shape change: it was an array of id
  strings before Slice 2.)* `state.witnessScore` stays the run total; the final tally shows a
  **`Witnesses`** score line.
- Witnesses fire **LOUDLY**: every scoring witness pushes a `witness: <name> speaks — +N` run
  event at the moment it fires. They draw **no rng**. A witness's **tempo** payload (a banked spin
  — e.g. the Knotted Rope on a stitch save) is **applied and PRICED by the cost-aware generator**
  (AP#2/§14). **Reach** payloads still wait on the snap-band controller and **draw-width** on the
  ladder-width economy — those stay recorded, inert (`witnessEffectsDeferred` counts them). A
  pure-worth loadout still changes only the score.
- **`cleanse` witnesses have a live channel (§D2).** A worn **consuming** cleanse witness (**Second
  Skin**, `charges:3`) is a **standing interceptor at the fang lien**: when a load-bearing fang would
  etch its harsh LIEN bane, Second Skin **drinks the ink** — one charge spent, **no bane etch** (it
  protects the FACE, not the score — the corrupt stamp / cursedHere / neighbour-drain / score
  consequences all stay). Event: `… drinks the ink — the lien is refused (N left)`. Its remaining
  charges surface as `state.witnesses[].charges` (3→2→1→0); at 0 it stays worn but **inert** (the
  lien etches). Dispatch is **id-blind** (the cleanse payload + consuming scaling, not the id) and
  gate-first (witnesses master + the `fang` event family). A run NOT wearing it is **byte-identical**
  to before — only worn-loadout behaviour changes. (`cleanse` no longer counts as `witnessEffectsDeferred`.)

### Reward Ladder — experimental, flag-gated (Modifier Stack §9, Phase A)

The between-segment perk draw, **priced by the tier you resolved**. OFF by default (the
flat `drawPerks` runs); active only when `balance.js on('rewardLadder')`. When on:

- The resolved tier sets the **ink grade**: Floor→ash, True→trade, Bloom→royal. Each draw is
  two channels (v2 — the inversion fix): **reach** cards (the priced deck verbs — Deepen +1 pip,
  Reweave +1 spin, the reroll **sigils**) each with a disclosed **rider** bane, and **draft**
  cards (`kind:"draft"`) — the **worth** slot, now a **witness** offered for wear (`witnessId`,
  `rarity`, `desc`, `label`). Grade buys rarer/cleaner cards, **never flat score** — the old
  Glimmer/Steady family is CUT. At royal (Bloom) one reach card is a guaranteed **rare+**.
  `state.perkOffer` cards gain `grade`/`rarity`/`blemished`, draft cards add `witnessId`, reach
  cards add `rider`; `state.draw` gives the grade + `picksRemaining` (+ `portraitFull` when the
  witness slots are full). Reach is AP#2-safe: priced by the generator's probe next segment, and
  the rider is the up-front blemished price.
- Degradations keep the draw WIDTH fixed and are gate-first: with `on('witnesses')` **off**, draft
  slots compose as reach cards instead (an all-reach draw, no witness-pool rng); with riders off,
  reach slots compose as drafts (no unpriced reach ships).
- **Mixed Draw** (`mixedDraw` sub-flag): completing 2+ rungs adds a card at each extra rung's
  grade and may let you **pick more than one** (all-three → pick 2 of 5). Pick cards **by
  index**: `{"type":"perk","card":N}` — ids can repeat in a mixed draw, so `card` beats `id`.
- Riders **bite when `flag('enchantments')` is on** (the bane attaches to a random face and
  fires during spins/keeps — see below); with the resolver off they are recorded but inert.
  Sub-flags: `blemishRiders`, `stitchAshGrade`.
- **The reach channel's COMMON slot (§D2):** the reach pool had no common card, so a floor/ash draw's
  reach slot used to **widen** to the whole channel on a miss. `shift_bane` (Shift) and (§D-fix3)
  `graft_face` (Graft) are the reach channel's common cards and **fill that slot** — a floor/ash reach
  card is a common (Shift or Graft). Gated on `debt.shift` / `faces.graft`; both off ⇒ the slot widens as
  before (byte-identical to pre-§D2).
- **§D-fix1 WITHIN-DRAW REACH DEDUPE:** a reach boon id already offered in THIS draw (the whole offer —
  base + every mixed-draw extra) is skipped so the offer never ships identical twin reach cards (the
  common pool being one card, `common = {shift_bane, graft_face}`, used to ship *Shift · Shift* every
  ash/stitch draw). The fallback ladder prefers a **distinct** card, widening rarity before repeating an
  id: (1) exact target rarity distinct → (2) highest at-or-below rarity distinct → (3) the whole channel
  distinct → (4) only when the whole channel is exhausted, a duplicate. Deterministic and rng-neutral for
  any draw that would NOT have duped (the extra rng is drawn only on a would-be duplicate).

### Face economy — the ⚖3.2 faces-as-progression axis (§D1, flag-gated)

Dice **gain and lose faces** as a progression axis. The base hand stays **6×d3**; a drum's
face count may range **`num('faces.min',2)`..`num('faces.max',4)`** (2..4). The **containment is
structural** (no snap-band needed): adding a face is **self-pricing** — every OTHER face on that
drum shows less often — and the generator's reach probes roll the **actual hand** (`rollDie` reads
`faces.length` per die), so any face change **auto-reprices** difficulty on the NEXT segment (AP#2/§14).

- **The flag family** (`balance.js` `BALANCE.faces`, NATIVE/on): `faces.enabled` master +
  per-leaf `graft` / `copyEtch` / `excise` / `cursedGraft`. **This master IS the ⚖3.2 A/B switch** —
  with it off (or every leaf off) the Reward-Ladder pool is **byte-identical** to before D1 (the four
  face cards filter out of the draw gate-first, drawing zero rng). Trim per-run via the §8 channel
  (`--balance faces.enabled=false` / `{"type":"new_run","balance":{"faces.excise":false}}`).
- **The four cards** (Reward-Ladder REACH cards, so they ride a Station-Rule rider **except**
  cursed_graft) and their `{"type":"perk"}` targeting args:
  - **`graft_face`** (Graft, **common** — §D-fix3 exposure tuning, was uncommon; Rule-4, so the face
    economy is reachable before the survival wall — it now shares the ash/trade common slot with Shift and
    still RIDES mild at ash per the Station Rule, `boon.effect:'graft'`) — push a plain colour face. Args
    `{die, to}` (`to` = a colour id). **Bare** ⇒ auto: the **most-demanded colour** of the
    just-resolved segment, onto the **first drum below max**. `legalActions` enumerates dice-below-max × 3 colours + the bare pick.
  - **`copy_etch`** (Twin Etch, rare, `boon.effect:'copy'`) — duplicate a face onto its OWN drum;
    the twin deep-clones symbol/mag **and** its enchants as **independent instances** (a consumed
    ward on the twin never touches the original). Args `{die, face}`. **Bare** ⇒ auto: the
    **highest-value face** (most enchants, then highest mag, then lowest index) on a drum below max.
  - **`excise_face`** (Excise, rare, `boon.effect:'excise'`) — TRUE removal; the drum reshapes so the
    remaining faces each show more often. Excising an enchanted face **deletes** its enchants (your
    choice). Args `{die, face}`. **Bare** ⇒ auto: the **lowest-mag unenchanted face** (lowest index).
  - **`cursed_graft`** (Fang Graft, uncommon, `boon.effect:'cursed_graft'`) — push a **fang** wild
    face (matches the native fang shape). **NEVER ridered** — the fang IS the price
    (`blemished:false` always). Args `{die}`. **Bare** ⇒ auto: the first drum below max.
- **Caps FIZZLE** cleanly (event, no-op): graft/copy/cursed_graft at max faces, excise at min faces.
- **Index integrity on excise** (deterministic, no rng): the reshaped drum repairs every stored face
  index — the tray's shown face (clamped to 0 with a *shown face fell* event if it WAS the excised
  one; else decremented if it sat above it), a queued Augur peek (**voided**, event), and pending
  sigils on that die (dropped). Enchants live ON face objects, so they travel/die with their face.
- `state.perkOffer[]` face cards surface `boon.effect` (`graft`/`copy`/`excise`/`cursed_graft`) +
  `grade`/`rarity`/`blemished` (+ `rider` when ridered) so a client can render the "which drum/face"
  targeting flow (D4).

### Debt verbs — the reach channel's relocate/cleanse cards (§D2, flag-gated)

Three Reward-Ladder REACH cards act on **banes** — the debt front door's exits. **"A bane" is
data-driven**: the *first **FREE-STANDING** ench on a face whose `polarity` field is `'bane'`* (a `ward`
etc. is a `'boon'` and is never touched — match the field, not the effect name). **FREE-STANDING** = fang
LIENS + card RIDERS; a **§D3 bargain's coupled bane** (it carries a `pairId`) is **skipped** — see the
coupling guard below. **§D-fix2 Shift is `neverRider`** (pure relocation grants zero reach power — the
common debt-management card must not itself ADD debt; the pick opportunity is its price). **Scour + Absolve
still RIDE** a Station-Rule rider (reach axis) — they REMOVE debt, so their reach price is the disclosed
rider (a Scour that strips a bane may re-etch one via its reach price). All three **move/strip ENCH objects
and change mag — they never move or reorder FACES** (no index repair).

- **`shift_bane`** (Shift, **common**, **neverRider — no rider**, `boon.effect:'shift'`, gate `debt.shift`) — **MOVE** one bane
  (the exact ench OBJECT — identity preserved) from a chosen face to another face (possibly another
  drum). Total debt is constant (the M-2-safe cleanse — you choose where the ink sits). Args
  `{die, face, toDie, toFace}` (target ≠ source). **Bare** ⇒ auto: the FIRST bane (lowest `[di,fi]`)
  → the **lowest-mag unenchanted parking face** (excluding the source). `legalActions` enumerates
  (bane-carrying faces) × (every OTHER face) + the bare pick.
- **`scour`** (Scour, uncommon, `boon.effect:'scour'`, gate `debt.cleanse`) — **STRIP** one bane from
  a chosen face AND **erode that face 1 pip** (floor 1 — a mag-1 face scours **free**). Args
  `{die, face}`. **Bare** ⇒ the first bane-carrying face.
- **`absolve`** (Absolve, rare, `boon.effect:'absolve'`, gate `debt.cleanse`) — **pure strip** of one
  bane from a chosen face (no erode cost). Args `{die, face}`. **Bare** ⇒ the first bane-carrying face.
- All three **FIZZLE with a clear event when the hand carries no bane** (`the ink holds no debt to
  move/lift`) — the composer stays hand-blind (deepen fizzles the same way). `legalActions` for
  scour/absolve enumerates (bane-carrying faces) + the bare pick.
- Enchants **travel/die with their face**: a bane shifted onto a face that is later EXCISED dies with
  the drum; shifting a copy-etch **twin**'s bane leaves the D1-cloned original (its own instance) untouched.
- **Flags** (`balance.js` `BALANCE.debt`, NATIVE/on): `debt.shift` (Shift) + `debt.cleanse`
  (Scour + Absolve). Off ⇒ the cards filter out of the draw gate-first (pool byte-identical to pre-§D2).

### The BARGAIN family — compound boon+bane cards (§D3, flag-gated)

Three Reward-Ladder REACH cards that etch **TWO coupled enchants on the SAME chosen face** — one **boon**
half (offered, `forced:false` where the effect supports an offer) and one **bane** half (`forced:true`):
one face, one devil's bargain. They target exactly like the enchant cards — `{die, face}` args etch the
pair onto that face; a **bare** pick draws ONE random face and BOTH halves land there. `legalActions`
enumerates one `{card,id,die,face}` per face + the bare auto pick. The three:

- **`grinning_bargain`** (The Grinning Bargain, **rare**) — boon `on_roll·chosen·reroll` (tap to re-spin
  ANY other drum) + bane `on_roll·adjacent·lock` (its neighbours seize every spin it shows).
- **`seers_bargain`** (The Seer's Bargain, **uncommon**) — boon `on_roll·self·expose` (tap to PEEK this
  drum's next throw) + bane `on_roll·random·reroll` (another drum stirs errantly when it shows).
- **`louts_bargain`** (The Lout's Bargain, **uncommon**) — boon `on_roll·adjacent·reroll` (tap to freely
  re-throw the neighbours) + bane `on_keep·adjacent·lock` (keeping this face seizes the neighbours).

None is common (a devil's bargain is never entry-level — this also leaves the floor/ash common slot as
Shift, §D2). Each is **`neverRider`**: the coupled bane IS the disclosed price, so a bargain never ALSO
rides a Station-Rule rider (nor draws a pure-rider roll). The card `desc` discloses both halves in prose;
`state.perkOffer[]` also surfaces them structurally as `boon.effect:'bargain'` + a **`bargain`** object
`{ boon:{effect,scope,trigger,forced,desc}, bane:{…} }`. On the hand, the two coupled `ench` each carry a
shared **`pairId`** (`state.hand[].faces[].ench[].pairId`) so a reader can group them and tell a coupled
bane from free-standing debt.

- **THE COUPLING GUARD** (a firm rule): a bargain's bane half is stamped with a `pairId`, which makes it
  **NON-shiftable / NON-cleansable** — the §D2 debt verbs (Shift/Scour/Absolve) **SKIP** it and act only on
  **free-standing** debt (fang liens + card riders). Stripping a coupled bane would be free reach (the
  common Shift card would trivially defuse every bargain). The guard lives at the single selector choke
  point (`firstBaneIdx` in `session.mjs`): a coupled bane is invisible to it, so an explicit debt verb on a
  coupled-only face **fizzles** (`no debt to move/lift`), the bare auto picks the next **free** bane, and a
  hand with only coupled debt fizzles all three. `legalActions` enumerates the same free-only source set.
- A **ward CAN still eat one firing** of a bargain's bane (the per-fire interceptor, `tryWard`) — but the
  `on_roll` bane re-fires every spin, so a single ward is self-limiting (one refused firing, not a strip).
- The D1 **copy_etch** twin of a coupled face keeps its halves coupled to EACH OTHER (the `pairId` copies)
  and stays an INDEPENDENT instance of the original (distinct objects) — its coupled bane is protected too.
- **Flag** (`balance.js` `BALANCE.vocab.bargains`, NATIVE/on). Off ⇒ the three cards filter out of the draw
  gate-first (pool byte-identical to pre-§D3, zero rng).

### Pure riders by rarity — "better play buys pure ink" (§D3, flag-gated)

Every ridered reach card now has a **rarity-scaled chance to ship PURE** (no rider): `NUMBERS.riderPure =
{ common:0, uncommon:0.15, rare:0.4, mythic:1.0 }` (Rule-4 placeholders). When `on('rewardLadder.pureRiders')`
(NATIVE/on) and a card's rarity chance is > 0, **one** rng roll decides: **pure** ⇒ `blemished:false`, no
`rider` key (disclosed at draw as today); **not pure** ⇒ the Station-Rule band exactly as before. So `blemished`
and the presence of a `rider` field always agree — a pure card reads `{blemished:false}` with **no** `rider`;
a ridered card reads `{blemished:true, rider:{band,name,desc}}`. Grade still buys access (rarer cards), and now
the rarer the card the likelier it comes clean. Gate-first / rng-neutral: flag **off** ⇒ **ZERO** new rng
(byte-identical to pre-§D3); **common** cards (chance 0) and **`neverRider`** cards (cursed_graft, bargains)
skip the roll entirely (no wasted rng). *(No mythic reach card exists in the pool yet — the mythic=1.0 leaf is
config-verified; a chance of 1.0 always ships pure.)*

### Enchantment resolver — experimental, flag-gated (Modifier Stack L1)

Face enchantments (banes/riders + the reroll/lock family) fire during the roll when
`flag('enchantments')` (`packages/engine/flags.js`) is on; OFF by default (no face carries
ench ⇒ nothing fires ⇒ neutral). When on:

- A face's enchantments fire at their moment: `on_roll` (every shown face, after a spin),
  `on_keep` (the just-kept face), and `on_resolve` (after the rung is scored). `reroll`
  re-throws a target die, `lock` freezes one — scoped self / adjacent / random / row. A
  **`forced:false` on_roll reroll does NOT auto-fire** — it raises an opt-in **spin-sigil**
  (`state.sigils`) the player taps to invoke (the `sigil` action above; Law L4).
  `state.hand[].faces[].ench` lists a face's enchantments as **structured objects**
  (`{name, effect, scope, trigger, polarity, forced, params?, desc}` — `desc` is the grammar
  humanizer, so a client can tell an OPTIONAL player-targeted action from a forced auto-firing
  one and show what each does); `state.enchFired` counts fires.
- **Transformer boons** — `deepen` / `erode` / `convert` are wired: they change a face
  **PERMANENTLY** (deepen +pips, capped at `DEEPEN_MAX`; erode −pips, floored at 1; **convert**
  recasts the symbol to a colour). They fire at `on_resolve`, AFTER the rung is scored, so the reach
  lands on the **next** segment — the generator's probe re-prices the changed hand, so it never ships
  free (**AP#2/§14 clean**). `erode` is also a **bane** (`debt.erode` native/on): the *Dulling Spin*
  family wears a random drum −1 pip at `on_keep` (floored at 1, so only a **deepened** face feels it).
- A **`chosen`-scope** transformer (the player owns the target) opens the **`transform` phase**
  after the resolve: `state.transformOffer` (`{effect, name, polarity, params, desc, candidates}`, plus
  `colours` for `convert`) names the effect + lists the candidate dice; you `transform` a chosen face
  (a `convert` may name a `to` colour) or `skip`. This is the first agent decision beyond keeps/perks.
  `forced` self/random transformers auto-fire (no choice). `render` remains the effect follow-on.
- **Slice-4 verbs** (all native, each gated by a `vocab` leaf; carried by the reach ladder cards
  Open Hand / Carver's Sigil / Warding Sigil / Augur's Sigil / Echo Sigil):
  - `release` (Open Hand) — an **ambient on_keep** un-keep offer (`state.releaseOffers`); the `release`
    action above. Once per segment per etched face; does not refund the keepCap budget.
  - `ward` (Warding Sigil) — a **standing interceptor** (presence-checked, never a fired trigger):
    while a die's shown face carries an unconsumed ward, the **next forced bane effect**
    (reroll/lock/erode) that would strike it is **refused** and the ward is spent. Never blocks a
    player-invoked reroll.
  - `expose` (Augur's Sigil) — an on_roll **peek sigil** (see `sigils[].effect === 'expose'` +
    `state.peeks`).
  - `echo` (Echo Sigil) — an `on_reroll` reroll that fires ONLY when a **forced bane** rerolls the
    echo-etched die, raising a free self-reroll sigil (capped once per spin-window per die).
- **Ladder riders** (§9b) attach here: picking a blemished ash card settles its bane on a random
  face, which then bites on later throws. That's the disclosed-price debt with teeth.
- Debug: `--ench-test` injects a forced on_roll reroll bane on die 0; `--enchant effect[:scope][:extra]`
  (`extra` = pips **or** a convert `to` colour; effect ∈ deepen/erode/convert/release/ward/expose/reroll/
  lock, plus the pseudo-effect `echo` = an on_reroll reroll) and `--sigil scope|expose` attach a
  boon/verb to die 0's faces so the resolver is directly observable without an acquisition path.

### Patron wishes — native, flag-gated (Modifier Stack §6)

A boss-blind wish, read **before you sit down**. Active when `on('wishes')` (native/on). Each
patron is **`num('wishes.patronLen', 3)` segments** long — a BALANCE-OWNED number
(`NUMBERS.wishes.patronLen`, default **3**), so the §C0 override channel tunes it per-run for free
(`--balance wishes.patronLen=5` / `{"type":"new_run","balance":{"wishes.patronLen":5}}`). Each patron
carries **one** wish — `state.wish` (`id`/`label`/`desc`/`species`/**`active`**) and `state.patron`
(`index`/`segment`/`length`, plus **`seg`** [1-based]/**`len`**/**`boss`**) show it.

**THE BOSS SEGMENT (2026-07-09 greybox change).** A wish ROLLS at patron start and stays VISIBLE
from segment 1 (informed consent — play toward/around it), but its play-bending **PHYSICS apply
ONLY on the patron's LAST segment — the "boss" segment** (`segsThisPatron === patronLen - 1`, i.e.
`state.patron.boss === true`). Off the boss segment the constraint warp is absent from `state.curses`,
twists don't bend the resolve / mask the bloom / offer the free reroll, and **`state.wish.active` is
`false`**; on the boss segment the warp joins `state.curses`, the twist takes hold, and
`state.wish.active` flips **`true`**. At boss-segment start a `the patron leans in — <label> takes
hold` event fires (once per patron). **JACKPOT CONTRACTS are the exception — they stay patron-WIDE**
(window, live progress, evaluation at patronComplete, and fangCourt's drain suppression all span the
whole patronage, unchanged; `state.wish.contract` is present throughout regardless of `active`).
(Curse warps in `state.curses` are ALWAYS-on — they're not wishes.) There are three species (each
trimmable per-run: `wishes.twists`, `wishes.jackpots`):

- **constraint** — bends a verb of the ritual **for the boss segment only** (folds into
  `state.curses` there). `keepCap` / `rollLimit` / `forcedKeep` / `rerollOnRoll` all **enforced**, dispatched
  through the *same* `ritual.js` as the curses. At patron complete it **pays out** a granted verb
  coupled to what it made scarce (the Hasty One takes a roll, repays a spin) — never a score delta.
- **twist** — changes the resolve **physics** on the patron's **boss segment only** (`state.wish.twist.kind`):
  - `mirror` (The Mirrored One) — among your kept STAT faces the **tallest counts double**, the
    **lowest counts zero** (dropped). `metNow` / `stopPreview` reflect it — the preview never lies.
  - `veil` (The Veiled One) — the **Bloom rung is masked** (`state.rungs` shows `{tier:"bloom",
    veiled:true}` with no `req`/`colour`/`value`/`reach_estimate`) until you **meet the True rung**,
    then it **latches** revealed for the rest of the segment. Purely informational — a blind bloom
    hit still counts.
  - `freeReroll` (The Generous One) — surfaces `state.wishReroll` `{label, targets}` and the
    `wish_reroll` action (above): a free, once-per-segment loose re-throw, **offered only on the boss
    segment**. Billed one mild bane per 2 uses at her patronage's end. NOTE (greybox): with the free
    reroll now boss-only, a patron affords **at most one** use, so the per-2-uses lien effectively
    never bills at `patronLen ≥ 2` — flagged for the designer.
  - `rungs` (§G4 — The Merciless One / The Demanding One) — a **boss RUNG-CONDITION**: it bends the
    generated rung SET (not the resolve physics — no pool transform). Merciless `forbid:['floor']` strips
    the survival anchor (no easy out; the anchor moves to True); Demanding `count:4` adds an apex. Needs
    the composer (`on('generator2.rungs')`); inert otherwise. Disclosed at boss-segment start. See the
    dynamic-rung-sets section.
- **jackpot** — a visible **contract** paid on its own tally line, evaluated at patron complete
  (`state.wish.contract` `{kind, target, progress, met}` shows live progress). The payout is a
  disclosed **score** bonus (`jackpot.n`) on a **`Patron jackpot`** tally line — **never** a hidden
  multiplier; `0` ⇒ no line. Kinds: `spotless` (zero corrupt/cursed beads this patronage — the
  *inverse* contract, met ⇔ `progress <= target`), `chainAlive` (**"never break the chain while she
  watches"** — met iff EVERY segment of her patronage extends ONE un-corrupt colour chain, i.e. her
  whole window is a monochrome, alive run of length `patronLen`; **arriving** with a long chain does NOT
  pre-satisfy — only HER beads count, and a single break/corrupt fails it. `contract.progress` = segments
  chained so far this patronage, `contract.target` = `patronLen`. patronLen-independent: always achievable,
  never automatic), `fangCourt` (**while she watches a load-bearing fang drains no neighbour** —
  the corrupt stamp stays, blooms still break — and ≥ `n` corrupt beads this patronage pays out).

Debug: `--curse grasping,roll_lock` applies curse warps; `--wish mirrored_one` forces a specific
wish (deterministic; any species); `--warp forcedKeep:mana,rerollOnRoll:body:1` injects raw ritual
warps (for warps no content carries yet).

### Experiments — bench-gated trial mechanics (`experiments.*`)

Live-but-provisional mechanics, on by default so the bench can measure them, each trimmable off
(`experiments.enabled` master + per-leaf) and gate-first (an OFF experiment draws no rng ⇒ byte-neutral).

- **Chain milestone** (`experiments.chainMilestone`) — every **3rd consecutive same-colour
  chain-extend** (run-long) banks **+1 spin** next segment (event *"the chain holds — the next segment
  owes a spin"*; folds into your banked bonus spins). A chain **break / corrupt** resets the streak.

### Generator v2 — the joint probe (native, `generator2.jointProbe`)

The generator's difficulty MEASUREMENT is now a single kernel-aware evaluator (the joint probe,
packages/engine/probe.js) instead of the legacy per-rung `pReach` probes. Per candidate rung-set it
simulates a full segment through the shared physics **kernel** — the probe suffers the SAME banes,
warps, wards and twist the player does — and reads per-rung reach, `pNone` (the snap read), `pMulti`
(the multi-completion guard, which retires the separate 450-trial sim), and payout EV in one pass.
This is what makes the reach numbers honest (see `reach_estimate` / `reachCaveat` above) and produces
the `generator` telemetry. It changes the MEASUREMENT only — the fitter still targets the same curve
(the snap-band **intent** is G3). Flip `generator2.enabled` / `generator2.jointProbe` off ⇒ the legacy
`pReach` path, byte-identical to the pre-G2 (G1) build.

- **Offered boons priced as take-rates** (`num('generator2.takeRates')` = `{ sigil:0.6, expose:0.4,
  release:0.3, echo:0.5 }`). A hand's tappable **on_roll** boons — a reroll spin-sigil (`sigil`) or an
  Augur peek (`expose`) — are not simulated as choices; they fold into the probe's **effective rolls**
  as `count × takeRate × num('tempo.rerollToSpin')` (0.5), the fraction of the time a real player taps
  them. So a hand carrying more/stronger offered rerolls prices its rungs slightly harder (the reach it
  buys is measured, not free). Banked spins + the Generous One's per-segment free reroll price the same
  way (as whole / fractional extra rolls). `echo` prices in-probe (a bane reroll of an echo face gets a
  free re-throw); `release` is reserved (not yet an effective-roll term).
- **Trials**: `num('generator2.trials')` (240) per candidate/set evaluation.

### Generator v2 — the snap-band intent (native, `generator2.band`)

The generator's difficulty **INTENT** is now the snap-band (§G3), not the legacy DECAY curve. Instead of
decaying three independent per-tier reach targets by segIndex, it pins **P(snap)-per-segment** to a designed
band and chooses the three rungs as a **SET** (a power→ceiling knapsack):

- **The band** = `clamp(0.05..0.60, base(patronIndex) × stage(position))` — `base` ramps `+0.03` per patron
  (unbounded → runs end by asymptote, not a clamp cliff), `stage` = easy/medium/**boss** multipliers
  (×0.6 / ×1.0 / ×1.5) over the patron's segments. So tension is held roughly constant per patron-position and
  climbs across patrons; the boss segment is the hardest of its patron. Surfaced as `state.generator.pSnapTarget`.
- **Asymmetric lag** — the fitter sizes the offered **ceiling** (which values/shapes it reaches for) against
  `pricedPower = min(power, EMA(power, α=0.5))`: a graft plays "overpowered" (offered its OLD, leaner richness)
  for ~2 segments before the world catches up (`state.generator.window` true), but a debt/erode hit prices
  **down instantly** (the `min`). Survival (`pSnapTarget`) and all displayed reach numbers stay honest to the
  ACTUAL hand — only the *choice of rungs* lags.
- **The SET fit** searches candidate rung-sets (the existing per-tier menus, 3 distinct colours) for the set
  whose joint `pNone` lands within `fitTol` (0.03) of the band while MAXIMIZING EV + affordable richness,
  budget-bounded by `num('generator2.fitBudget')` (24) evaluations/segment. When no set fits (a hand too weak
  for even the easiest band, or too strong for a late band without the G4 apex), it clamps to the nearest and
  flags `state.generator.fit` = `'nofit-hard'` / `'nofit-easy'`.

Flip `generator2.band` off ⇒ the legacy DECAY target path, byte-identical to G2 HEAD (the snap-band demotes
DECAY to that fallback). All band numbers are Rule-4 placeholders (G5's tuning campaign sweeps them).

### Generator v2 — dynamic rung-sets (native, `generator2.rungs` / `generator2.apexRungs`)

The rung SET is now an OUTPUT, not a fixed three (§G4). A composer hands the G3 fitter a PLAN — one survival
**anchor** (full menu, floor-swept) + N **ceiling** axes — so a segment may carry **2–4 rungs**
(`NUMBERS.rungs {min:2,max:4}`). Early / patron-0 play is byte-identical to G3: the composer refines only
**late** (`num('generator2.latePatron',2)`) segments and boss conditions, and it draws **no rng** (flag on or
off, the rng stream + the default 3-rung set are identical). A composed set's `rungSpec` merges sources by
precedence **boss/twist > relic > intent** (the `relic` source is a RESERVED seam — `BALANCE.relics` stays off).

- **The apex tier** (`generator2.apexRungs`, native) — a 4th rung that REUSES the hand's **strongest colour**
  with a distinct SHAPE (`concentrated` if that colour can show a deep face, else `pure`) at **value 10**
  (`tier:"apex"`). It enters ONLY (a) via the intent on a *comfortable, strong* (`pricedPower ≥
  num('generator2.apexPowerGate',0.55)`) *late* hand whose 3-rung fit already **bands** — the fitter then
  HARDENS the base rungs to hold tension (§3.2 polarity), keeping the apex only if the set STILL bands; or
  (b) via an external rung-condition (the Demanding One). **Never filler** — a weak or early hand never sees
  it. It **value-orders** in auto-resolve (10 > bloom 6), extends metCount / mixed-draw width, and an apex
  completion **draws at royal** (no new grade). `state.rungs[]` surfaces it like any rung (`tier:"apex"`,
  `value:10`, `concentrated`/`pure`); the client renders an amber accent + a ★.
- **The 2-rung rest** — at a high late target the composer may REST a colour (drop a ceiling axis): fewer
  ways to survive ⇒ pNone RISES (the tension tool that closes the strong-hand `nofit-easy` clamp; count
  reduction is NOT a mercy). The intent NEVER rests the player's **live-chain** colour; a boss MAY rest any
  colour (disclosed). `state.generator.rested` names the idled colour, `state.generator.rungCount` the count,
  and a *"the {colour} thread rests this segment"* event fires. Chains/blooms in the rested colour stall that
  segment.
- **Boss rung-conditions** — a new twist kind **`'rungs'`** (`state.wish.twist.kind === 'rungs'`) carries a
  rungSpec the composer consumes (`twistRungSpec`, id-blind); it bends GENERATION, not resolve physics (no
  pool transform). Two boss wishes (rare spice, `wishes.twists`): **The Merciless One**
  (`twist:{kind:'rungs',params:{forbid:['floor']}}` — "no easy out"; the survival anchor MOVES to True, and
  the forbidden floor is NEVER re-admitted even by the tension fallback) and **The Demanding One**
  (`twist:{kind:'rungs',params:{count:4}}` — an apex demand; the ceiling extends and the set hardens). Both
  are boss-gated like all twists AND composer-gated (inert with `generator2.rungs` off). Disclosed in the
  wish `desc` + segment events.

Flip `generator2.rungs` off ⇒ the composer never runs, byte-identical to G3 HEAD (18ba4db). `generator`
telemetry gains `rungCount` (composer-on) and `rested` (a 2-rung rest) — both absent flag-off / on an
unrefined segment, so a Run Record stays byte-identical there.

### Trim substrate — the run-config channel (Modifier List v2 §8, step-1)

Every modifier **system** (a balance flag) and every individual **content item** (a
ladder boon / wish / witness, by id) is toggleable at run-config time, deterministically —
the substrate the greybox dev panel trims a run with. Two independent channels, both
applied at `new_run` **before any rng is drawn**, so the trim shapes every seeded draw:

- **Balance overrides** — a flat map of `on()`/`num()` **dot-path → value**:
  `{ "rewardLadder.enabled": false, "witnesses.enabled": false, "snapBand.targetLo": 0.15 }`.
  A key is exactly the path `on()`/`num()` already read; the value substitutes for that
  BALANCE/NUMBERS leaf (booleans gate, numbers tune). A master is `"<system>.enabled"` —
  override it to flip a whole system. Set it via `{"type":"new_run","balance":{…}}` (or CLI
  `--balance rewardLadder.enabled=false,witnesses.enabled=false`; values parse as
  true/false/number/string). It **never mutates** the designer's BALANCE/NUMBERS; an EMPTY
  map is byte-identical to a default run.
- **Disabled content** — an array of content ids trimmed out of the live draw pools:
  `{"type":"new_run","disabledContent":["glimmer","hasty_one"]}` (CLI `--disable glimmer,hasty_one`).
  A disabled id never appears in a Reward-Ladder offer / never rolls as a wish / (Slice 2)
  never drafts as a witness. An EMPTY set is a no-op passthrough (the rng stream is unchanged).

When a run is trimmed, `state.config` echoes it: `{ balance:{…}, disabledContent:[…] }` (so a
Run Record captures the trim and the client can display it). A default (untrimmed) run emits
**no** `config` key. Same seed + same trim + same actions ⇒ identical run.

### Contracts you can rely on

1. **Full information.** The state is everything; nothing is hidden.
2. **Validation-first.** Illegal `act` returns `{ok:false, error}` and mutates
   nothing. Errors are written to be read by an agent.
3. **Determinism.** Same seed + same action sequence = same run, exactly.
4. **Un-keep is ambient** (Bear verdict 2026-07-14) — any **manually**-kept, non-`locked`, non-`forced`
   die can be let go before you resolve via `{"type":"unkeep","i":N}` (FREE, no rng, no `rollsLeft` /
   `keepCap` gate). The old "keeps are final" rule is retired; the only holds are the ritual's
   (`forced`) and enchantment locks (`locked`). Un-keeping **never refunds the `keepCap` budget** (the
   die is freed, the spend is not). The **Open Hand** `release` verb (`state.releaseOffers`) is a
   distinct, ench-driven un-keep that coexists with it.
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
