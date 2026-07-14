// =============================================================================
// REWARD LADDER  (Modifier Stack §9/§9d — the tier-priced / mixed draw composer)
// -----------------------------------------------------------------------------
// PURE. The tier you resolve prices the draw you earn: Floor→ash / True→trade /
// Bloom→royal, and each EXTRA completed rung pours its own grade into the draw
// (the Mixed Draw, §9d — pays in WIDTH, never grade, per Anti-pattern #8). Reads
// res.metTiers, which resolveSegment already computes and returns.
//
// §9b/§5 Reach-vs-Draft channels (ModifierList v2 — the inversion fix). A card is either a
//   • REACH card  — a priced reach/tempo boon (deepen/reweave/sigils) that carries a
//                   disclosed bane RIDER (drawn from BANE_POOL by band) when riders are on.
//                   Reach never ships unridered in normal play — that is the debt front door.
//   • DRAFT card  — the new WORTH slot: a WITNESS offered for wear (§4.2), composed via
//                   generateWitness (this is its first live caller). Grade buys rarer/cleaner
//                   deck cards, never "more points" — the flat-score glimmer family is CUT (§4.4).
// Degradations keep the draw WIDTH fixed, gate-first (a flag is read BEFORE any rng): riders
// OFF ⇒ reach slots compose as drafts (no unpriced reach — M-2); witnesses OFF ⇒ draft slots
// compose as reach cards, and NO witness-pool rng is drawn (an all-reach draw).
//
// Sub-flags (read live via balance.on): rewardLadder.mixedDraw · .blemishRiders ·
// .stitchAshGrade. Tunables via balance NUMBERS (drawTables / picks / riderStation).
// The reach BOON POOL below is placeholder content (Rule 4); draft cards draw from the
// witness registry (content/witnesses.js). The SHAPE (reach=priced verbs, draft=worn
// witnesses) is what matters now.
//
// STATUS: pure; rng injected. Wired live behind on('rewardLadder') in agent_cli.
// =============================================================================

import { num, on, isContentEnabled, getDisabledContent } from './balance.js';
import { generateBane } from '../content/enchantments.js';
import { generateWitness, describeWitness } from '../content/witnesses.js';   // §4.2 draft slot — the worth channel is now worn witnesses

// §G4 the APEX tier (value 10) ranks ABOVE bloom and DRAWS AT ROYAL — no new draw grade is minted
// (design choice: apex reuses the bloom/royal table, so completing an apex pays the richest existing draw).
const TIER_RANK   = { floor: 0, true: 1, bloom: 2, apex: 3 };
const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, mythic: 3 };
const GRADE_STATION = { ash: 'common', trade: 'uncommon', royal: 'rare' };   // §9b station baseline
const TABLE_FOR_TIER = { floor: 'floor', true: 'true', bloom: 'bloom', apex: 'bloom' };

// ---- the REACH BOON POOL (Rule 4) — the priced deck-verb cards -------------------
// reach/tempo channel = the priced verbs (deepen/reweave/sigils) that ride a rider.
// effect ∈ spin|pip|enchant — the agent applies these (reuses the live verbs). The
// worth channel is GONE (§4.4): the flat-score glimmer/steady family is CUT; worth now
// arrives as DRAFT cards (worn witnesses, composed in draftCard below), never flat score.
export const LADDER_BOONS = Object.freeze([
  { id:'reweave',         kind:'blessing', axis:'tempo', rarity:'uncommon', effect:'spin',  mag:1,  label:'Reweave',         desc:'+1 spin on the next segment.' },
  { id:'deepen',          kind:'blessing', axis:'reach', rarity:'rare',     effect:'pip',   mag:1,  label:'Deepen',          desc:'Choose a rune face | it counts DOUBLE for good.' },
  // (The Whetstone — a self-grinding deepen-on-resolve reach card — was AXED as unbalanced
  //  (deepen broke the difficulty curve, audit 3.3). The deepen MECHANISM + the one-shot `deepen`
  //  card above stay; only the auto-self-deepening acquisition card is gone.)
  // Opt-in REROLL SIGILS (Law L4's sanctioned tap): a reach boon that ETCHES an on_roll
  // forced:false reroll — when that face is spun it raises a tappable sigil (the player MAY
  // invoke a free, loose-only re-throw). `forced:false` in the ench sticks (applyLadderBoon
  // spreads b.ench last). Reach axis ⇒ always blemished/ridered (AP#2 / M-2).
  { id:'respin_sigil',       kind:'blessing', axis:'reach', rarity:'uncommon', effect:'enchant',
    ench:{ trigger:'on_roll', scope:'self',     effect:'reroll', forced:false, params:{} },
    label:'Respin Sigil',       desc:'Etch a face | when spun, tap its sigil to re-throw that drum (free).' },
  { id:'flanking_sigil',     kind:'blessing', axis:'reach', rarity:'uncommon', effect:'enchant',
    ench:{ trigger:'on_roll', scope:'adjacent', effect:'reroll', forced:false, params:{} },
    label:'Flanking Sigil',     desc:'Etch a face | when spun, tap its sigil to re-throw its neighbour drums (free).' },
  { id:'wild_sigil',         kind:'blessing', axis:'reach', rarity:'uncommon', effect:'enchant',
    ench:{ trigger:'on_roll', scope:'random', effect:'reroll', forced:false, params:{} },
    label:'Wild Sigil',         desc:'Etch a face | when spun, tap its sigil to re-throw a random drum (free).' },
  { id:'spinwrights_sigil',  kind:'blessing', axis:'reach', rarity:'rare',     effect:'enchant',
    ench:{ trigger:'on_roll', scope:'chosen', effect:'reroll', forced:false, params:{} },
    label:"Spinwright's Sigil", desc:'Etch a face | when spun, tap its sigil to re-throw a drum you choose (free).' },

  // ── slice-4 VOCAB CARDS (ModifierList v2 §2.2/§2.3). Each carries a `vocab` tag; drawBoon offers
  // it ONLY when on('vocab.<tag>') (gate-first, below). Reach axis ⇒ always ridered/blemished (AP#2).
  // The verbs are interpreted by the session firing path (session.mjs), never here (content-as-data).
  { id:'open_hand',      kind:'blessing', axis:'reach', rarity:'uncommon', effect:'enchant', vocab:'wave3_releaseRender',
    ench:{ trigger:'on_keep', scope:'chosen', effect:'release', forced:false, params:{} },
    label:'Open Hand',        desc:'Etch a face | while it shows and a drum is kept, release a kept drum back to the pool (undo).' },
  { id:'carvers_sigil',  kind:'blessing', axis:'reach', rarity:'rare',     effect:'enchant', vocab:'wave2_convertDeepen',
    ench:{ trigger:'on_resolve', scope:'chosen', effect:'convert', forced:false, params:{ to:'need' } },
    label:"Carver's Sigil",   desc:'Etch a face | when a rung resolves, recast a chosen face into the colour you need (next segment).' },
  { id:'ward_sigil',     kind:'blessing', axis:'reach', rarity:'uncommon', effect:'enchant', vocab:'ward',
    ench:{ trigger:'on_roll', scope:'self', effect:'ward', forced:true, params:{} },
    label:'Warding Sigil',    desc:'Etch a face | it wards its drum — the next bane that would strike it is refused.' },
  { id:'augurs_sigil',   kind:'blessing', axis:'reach', rarity:'rare',     effect:'enchant', vocab:'expose',
    ench:{ trigger:'on_roll', scope:'self', effect:'expose', forced:false, params:{} },
    label:"Augur's Sigil",    desc:'Etch a face | when spun, tap to PEEK this drum’s next throw before you decide.' },
  { id:'echo_sigil',     kind:'blessing', axis:'reach', rarity:'uncommon', effect:'enchant', vocab:'onReroll',
    ench:{ trigger:'on_reroll', scope:'self', effect:'reroll', forced:false, params:{} },
    label:'Echo Sigil',       desc:'Etch a face | when a bane rerolls its drum, tap for one free re-throw.' },

  // ── §D1 ⚖3.2 FACE-ECONOMY CARDS — faces as a progression axis. Each carries a `faces` tag;
  // drawBoon offers it ONLY when on('faces.<tag>') (gate-first, below). Reach axis ⇒ ridered per
  // the Station Rule — EXCEPT cursed_graft, which is `neverRider` (the fang IS the price; §D1 rule).
  // The verbs (graft/copy/excise/cursed_graft) are interpreted by the session firing path
  // (session.mjs applyLadderBoon), never here (content-as-data). Adding a face is SELF-PRICING and
  // the generator's probe rolls the actual hand, so any face change auto-reprices next segment (AP#2).
  // §D-fix3 EXPOSURE TUNING (Rule 4): graft_face rarity uncommon→COMMON — 4 playtest runs / ~15 draws never
  // surfaced a face card (uncommon+ lives at trade/royal, past the survival wall that kills segments 1–3), so
  // the ⚖3.2 face economy was statistically invisible in organic play. Common puts Graft in the ash/trade common
  // slot beside Shift (a common graft at ash still RIDES mild per the Station Rule — self-pricing holds), and the
  // common reach pool becomes {shift_bane, graft_face} so the within-draw dedupe yields variety, not a lone card.
  { id:'graft_face',   kind:'blessing', axis:'reach', rarity:'common',   effect:'graft',        faces:'graft',
    label:'Graft',            desc:'Graft a new colour face onto a drum | it shows less of everything else.' },
  { id:'copy_etch',    kind:'blessing', axis:'reach', rarity:'rare',     effect:'copy',         faces:'copyEtch',
    label:'Twin Etch',        desc:'Twin a face onto its own drum | the copy carries its etchings, its own instance.' },
  { id:'excise_face',  kind:'blessing', axis:'reach', rarity:'rare',     effect:'excise',       faces:'excise',
    label:'Excise',           desc:'Excise a face from a drum | the rest of that drum shows more often.' },
  { id:'cursed_graft', kind:'blessing', axis:'reach', rarity:'uncommon', effect:'cursed_graft', faces:'cursedGraft', neverRider:true,
    label:'Fang Graft',       desc:'Graft a FANG face onto a drum | a wild that fills any slot — but the fang is the price.' },

  // ── §D2 DEBT VERBS — the reach channel's relocate/cleanse cards. Each carries a `debt` tag;
  // drawBoon offers it ONLY when on('debt.<tag>') (gate-first, below). The verbs (shift/scour/
  // absolve) are interpreted by the session firing path (session.mjs applyLadderBoon), never here
  // (content-as-data). Scour/Absolve RIDE per the Station Rule — they REMOVE debt, so their reach price is
  // the disclosed rider (a Scour that strips a bane may re-etch one via its rider — the cleanse is reach, so
  // it is priced; AP#2/M-2). shift_bane is the reach channel's FIRST COMMON card: it fills the common slot
  // that used to WIDEN on a miss. §D-fix2 shift_bane goes `neverRider:true` (joins cursed_graft / the bargains):
  // Shift grants ZERO reach POWER — it is pure relocation (total debt is constant), so the common debt-management
  // card must not itself ADD debt (playtest: two Shift uses turned 1 bane into 3, each pick riding a new rider).
  // The pick opportunity IS its price; M-2 ("reach never ships unridered") holds because a neverRider card is a
  // priced-by-structure card, not free reach. This does NOT relax Scour/Absolve — they still ride (they remove debt).
  { id:'shift_bane', kind:'blessing', axis:'reach', rarity:'common',   effect:'shift',   debt:'shift', neverRider:true,
    label:'Shift',   desc:'Move one bane from a chosen face to another face | the ink stays, you choose where it sits.' },
  { id:'scour',      kind:'blessing', axis:'reach', rarity:'uncommon', effect:'scour',   debt:'cleanse',
    label:'Scour',   desc:'Strip one bane from a chosen face | that face erodes one pip (floor 1). Scrape the ink off, take some skin.' },
  { id:'absolve',    kind:'blessing', axis:'reach', rarity:'rare',     effect:'absolve', debt:'cleanse',
    label:'Absolve', desc:'Strip one bane from a chosen face | a clean lift, no cost to the face.' },

  // ── §D3 THE BARGAIN FAMILY — compound boon+bane cards (one face, one devil's bargain). Each carries a
  // `vocab:'bargains'` tag; drawBoon offers it ONLY when on('vocab.bargains') (gate-first, below). A bargain
  // etches TWO enchants on the SAME chosen face: a `boonEnch` (offered — forced:false where the effect
  // supports offers) and a `baneEnch` (forced:true), sharing a coupling marker (pairId, stamped per etch in
  // session.mjs applyLadderBoon). The COUPLED BANE is `neverRider:true` — the bane half IS the disclosed price
  // (like cursed_graft's fang), so a bargain never ALSO rides a Station-Rule rider (one boon, one bane, clean).
  // The coupling marker makes the bane NON-shiftable/cleansable by the D2 debt verbs (stripping it would be
  // free reach — the guard lives in session.mjs firstBaneIdx). NONE is common (deliberate: keeps the floor/ash
  // common slot as Shift, §D2) — a devil's bargain is never an entry-level card. Interpreted by session.mjs
  // (content-as-data). Targeted etch like all enchant cards ({die,face} args + bare auto). Rarities per §10
  // (access derived from grammar, offset by the forced coupled bane which forfeits the clean-reach step).
  { id:'grinning_bargain', kind:'blessing', axis:'reach', rarity:'rare',     effect:'bargain', vocab:'bargains', neverRider:true,
    boonEnch:{ trigger:'on_roll', scope:'chosen',   effect:'reroll', forced:false, params:{} },
    baneEnch:{ trigger:'on_roll', scope:'adjacent', effect:'lock',   forced:true,  params:{} },
    label:'The Grinning Bargain', desc:'Etch one face with two runes. | BOON: tap to re-spin ANY other drum (free). | BANE: its neighbour drums seize when it shows (forced).' },
  { id:'seers_bargain',    kind:'blessing', axis:'reach', rarity:'uncommon', effect:'bargain', vocab:'bargains', neverRider:true,
    boonEnch:{ trigger:'on_roll', scope:'self',     effect:'expose', forced:false, params:{} },
    baneEnch:{ trigger:'on_roll', scope:'random',   effect:'reroll', forced:true,  params:{ count:1 } },
    label:"The Seer's Bargain",   desc:'Etch one face with two runes. | BOON: tap to PEEK this drum’s next throw. | BANE: another drum stirs errantly when it shows (forced).' },
  { id:'louts_bargain',    kind:'blessing', axis:'reach', rarity:'uncommon', effect:'bargain', vocab:'bargains', neverRider:true,
    boonEnch:{ trigger:'on_roll', scope:'adjacent', effect:'reroll', forced:false, params:{} },
    baneEnch:{ trigger:'on_keep', scope:'adjacent', effect:'lock',   forced:true,  params:{} },
    label:"The Lout's Bargain",   desc:'Etch one face with two runes. | BOON: tap to freely re-throw its neighbour drums. | BANE: keeping this face seizes its neighbours (forced).' },
]);

// weighted rarity pick from a grade's weights map (deterministic; rng injected)
function pickRarity(weights, rng) {
  const entries = Object.entries(weights || {}).filter(([, w]) => w > 0);
  if (!entries.length) return 'common';
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [rar, w] of entries) { r -= w; if (r < 0) return rar; }
  return entries[entries.length - 1][0];
}

// draw a boon from a channel ('worth' | 'reach'), preferring the target rarity. `exclude` = the boon
// ids already offered THIS draw (Fix 1 within-draw dedupe — see the fallback ladder below).
function drawBoon(channel, targetRarity, rng, exclude = []) {
  let pool = LADDER_BOONS.filter(b => channel === 'reach' ? (b.axis === 'reach' || b.axis === 'tempo') : b.axis === 'worth');
  // §4 slice-4 vocab gating (gate-first, rng-second): a card tagged with a `vocab` leaf is offered
  // ONLY when on('vocab.<leaf>'). Untagged cards (reweave/deepen/the reroll sigils) always pass, so
  // the reach pool is never empty, and with vocab off the pool is byte-identical to the slice-2 state.
  pool = pool.filter(b => !b.vocab || on('vocab.' + b.vocab));
  // §D1 faces gating (gate-first, rng-second): a card tagged with a `faces` leaf is offered ONLY
  // when on('faces.<leaf>'). Untagged cards always pass. With the faces master OFF (or every leaf
  // off), all four face cards filter out and the pool is BYTE-IDENTICAL to the pre-D1 state (same
  // members, same order, same length ⇒ the rng draw below is unchanged — the ⚖3.2 A/B neutrality).
  pool = pool.filter(b => !b.faces || on('faces.' + b.faces));
  // §D2 debt gating (gate-first, rng-second): a card tagged with a `debt` leaf is offered ONLY when
  // on('debt.<leaf>'). Untagged cards always pass. With debt.shift + debt.cleanse OFF, the three debt
  // cards filter out and the pool is BYTE-IDENTICAL to the pre-D2 (D1 HEAD) state (same members, same
  // order, same length ⇒ the rng draw below is unchanged). NOTE the deliberate common-slot change: with
  // debt.shift ON, shift_bane is the reach channel's FIRST common card, so a floor/ash draw's common
  // slot now resolves to the exact-common match (Shift) instead of WIDENING to the whole channel.
  pool = pool.filter(b => !b.debt || on('debt.' + b.debt));
  // §8 trim substrate: drop disabled ids from the LIVE pool. No-op passthrough when the
  // set is empty (guarded) so the rng stream is byte-identical; only commit the trim if it
  // leaves the channel non-empty (never hand back an empty pool → a crash on an over-trim).
  if (getDisabledContent().length){ const t = pool.filter(b => isContentEnabled(b.id)); if (t.length) pool = t; }
  // The NATURAL, priced candidate set (unchanged): exact rarity, else the HIGHEST rarity AT OR BELOW the
  // target (never leak DOWN to a weaker card — a mythic roll can't hand out a common), else (nothing at or
  // below, e.g. reach has no common card) the whole channel. Draws ONE rng — the pick index.
  const exact = pool.filter(b => b.rarity === targetRarity);
  const below = pool.filter(b => (RARITY_RANK[b.rarity] ?? 0) <= (RARITY_RANK[targetRarity] ?? 0));
  const top = below.length ? Math.max(...below.map(b => RARITY_RANK[b.rarity] ?? 0)) : null;
  const belowTop = below.length ? below.filter(b => (RARITY_RANK[b.rarity] ?? 0) === top) : [];
  const natural = exact.length ? exact : (belowTop.length ? belowTop : pool);
  const pick = natural[Math.floor(rng() * natural.length)];
  // Fix 1 — WITHIN-DRAW REACH DEDUPE. If this id was NOT already offered this draw, ship it EXACTLY as
  // before (byte-identical rng + result — an empty exclude, i.e. the draw's first reach slot, always lands
  // here). Only a would-be DUPLICATE walks the distinct fallback ladder (one extra rng), so a run that never
  // dupes draws the identical stream. THE FALLBACK LADDER — prefer a distinct card, widening rarity per the
  // existing at-or-below rule BEFORE repeating an id:
  //   1. exact target rarity, distinct   2. highest at-or-below rarity, distinct   3. the whole channel, distinct
  //   4. (every distinct card already offered — the channel is exhausted) ⇒ allow the duplicate.
  if (!exclude.length || !exclude.includes(pick.id)) return { ...pick };
  for (const tier of [exact, belowTop, pool]){
    const avail = tier.filter(b => !exclude.includes(b.id));
    if (avail.length) return { ...avail[Math.floor(rng() * avail.length)] };
  }
  return { ...pick };   // channel exhausted — a duplicate is the only option left
}

// §9b STATION RULE (M-5, as data): rider band = boon rarity vs draw grade.
export function bandForBoon(boonRarity, grade) {
  const station  = num('riderStation', { onStation: 'mild', aboveStation: 'harsh', cruel: null });
  const expected = GRADE_STATION[grade] || 'common';
  return (RARITY_RANK[boonRarity] ?? 0) > (RARITY_RANK[expected] ?? 0) ? station.aboveStation : station.onStation;
}
export function riderBane(boonRarity, grade, rng) {
  const band = bandForBoon(boonRarity, grade);
  if (!band) return null;
  return generateBane(rng, { band });
}

// a REACH card (the priced channel) — carries a disclosed rider WHEN riders are on
// (§9b / M-2: reach never ships unridered in normal play; the rider IS the up-front price).
function reachCard(grade, weights, rng, riders, exclude = []) {
  const boon = drawBoon('reach', pickRarity(weights, rng), rng, exclude);
  // §D1 a `neverRider` boon (cursed_graft — the fang IS the price; §D3 a bargain — the coupled bane IS the
  // price; §D-fix2 shift_bane — pure relocation grants zero reach power, the pick opportunity is its price)
  // never rides, so it stays blemished:false and draws NO riderBane rng. With faces/bargains OFF such a boon
  // is never drawn (shift is gated on debt.shift), so boon.neverRider is falsy ⇒ byte-identical (neutrality).
  let rideThis = !!riders && !boon.neverRider;
  // §D3 PURE RIDERS ("better play buys pure ink") — a rarity-scaled chance the card ships PURE (no rider).
  // Gate-first / rng-neutral ORDERING (the neutrality contract): the roll happens ONLY when the flag is on
  // AND this card would otherwise ride (rideThis) — so with the flag OFF, or on a neverRider/degraded card,
  // ZERO extra rng is drawn and the stream is byte-identical to D2 HEAD. commons (chance 0) also skip the
  // roll (guarded by pureChance > 0), so an ash draw never wastes rng either — both documented skips.
  if (rideThis && on('rewardLadder.pureRiders')) {
    const pureChance = num('riderPure.' + boon.rarity, 0);
    if (pureChance > 0 && rng() < pureChance) rideThis = false;   // pure ink this draw — no rider
  }
  const card = { id: boon.id, kind: 'blessing', label: boon.label, desc: boon.desc, boon, grade, rarity: boon.rarity, blemished: rideThis };
  if (rideThis) card.rider = riderBane(boon.rarity, grade, rng);
  return card;
}
// a DRAFT card (the new WORTH slot — §4.2): a fully-disclosed witness offered for wear.
// Composes via generateWitness (its first live caller — the §8 trim filter inside it goes
// live here). `exclude` = ids the player already wears (and drafts already offered this
// draw); generateWitness falls back to the unexcluded pool if the target rarity exhausts.
// Draws witness-pool rng — the CALLER gates on on('witnesses') BEFORE reaching here.
function draftCard(grade, weights, rng, exclude) {
  const rarity = pickRarity(weights, rng);
  const w = generateWitness(rng, { rarity, exclude });
  exclude.push(w.id);   // don't re-offer the same witness later in this same draw
  return { kind: 'draft', id: 'draft_' + w.id, witnessId: w.id, rarity: w.rarity,
           label: w.name, desc: describeWitness(w), grade, blemished: false };
}

// build a full draw from a table key (floor/true/bloom/stitch). Two channels — `reach`
// (priced verbs, ridered) and `draft` (worn witnesses). Degradations keep the WIDTH fixed
// and are gate-first (a flag is read BEFORE any rng): riders OFF ⇒ a reach slot composes as
// a DRAFT (no unpriced reach — M-2); witnesses OFF ⇒ a draft slot composes as a REACH card
// and NO witness-pool rng is drawn (all-reach). The double-off corner ships unridered reach.
// `reachSeen` (Fix 1) mirrors the draft `exclude`: the reach boon ids already offered this draw, so a
// reach slot never repeats an id while a distinct card exists (see drawBoon's fallback ladder). Threaded
// across the whole drawLadder (base + every mixed-draw extra) so the OFFER the player sees has no dup reach.
export function buildDraw(tableKey, rng, riders, exclude = [], reachSeen = []) {
  const t = num('drawTables.' + tableKey);
  if (!t) return { grade: 'trade', cards: [] };
  const canDraft = on('witnesses');   // gate-first: read the flag BEFORE any generateWitness rng
  const nReach = t.reach || 0;
  const nDraft = t.draft || 0;
  const cards = [];
  const reach = () => { const c = reachCard(t.grade, t.weights, rng, riders, reachSeen); reachSeen.push(c.boon.id); return c; };
  const draft = () => draftCard(t.grade, t.weights, rng, exclude);
  // reach slots: ridered reach if riders on; else degrade to a draft (M-2), or an unridered reach if witnesses are also off.
  for (let i = 0; i < nReach; i++) cards.push(riders ? reach() : (canDraft ? draft() : reach()));
  // draft slots: a witness draft if witnesses on; else degrade to a reach card.
  for (let i = 0; i < nDraft; i++) cards.push(canDraft ? draft() : reach());
  // guaranteeRareReach (royal, §5): if no REACH card rolled rare+, upgrade one to a rare
  // reach (Deepen / Spinwright's Sigil) — the guaranteed rare now lives on the REACH side.
  if (t.guaranteeRareReach) {
    const reachCards = cards.filter(c => c.kind === 'blessing');
    if (reachCards.length && !reachCards.some(c => (RARITY_RANK[c.rarity] ?? 0) >= RARITY_RANK.rare)) {
      const rare = drawBoon('reach', 'rare', rng, reachSeen);
      const c0 = reachCards[0];
      Object.assign(c0, { id: rare.id, label: rare.label, desc: rare.desc, boon: rare, rarity: rare.rarity });
      reachSeen.push(rare.id);   // Fix 1 — the guaranteed rare joins the dedupe memo so a later mixed-draw extra can't repeat it
      // §D1 if the upgraded slot was UN-ridered (a cursed_graft base) and the new rare is a normal
      // rideable reach, price it — a rare reach must not ship unridered (AP#2). Draws NO extra rng
      // with the faces family OFF (the base slot is always already ridered there), so neutrality holds.
      if (riders && !c0.blemished && !rare.neverRider){ c0.blemished = true; c0.rider = riderBane(rare.rarity, t.grade, rng); }
    }
  }
  return { grade: t.grade, cards };
}

// §9d picks: 1 or 2 completed rungs → pick 1; 3+ rungs (incl. a §G4 4-rung all-complete) → pick 2 (the
// Full Palette). The table is keyed by exact count; a 4-completion falls back to the 3-rung pick (2).
function picksFor(nCompleted) {
  const table = num('mixedDraw.picks', { 2: 1, 3: 2 });
  return nCompleted >= 3 ? (table[nCompleted] ?? table[3] ?? 2) : 1;
}

// drawLadder(res, rng, opts) — the §9/§9d composer. res = { tier, metTiers?, stitched? }.
// opts.wornWitnesses = the ids the player already wears (excluded from draft slots so a worn
// witness is never re-offered). Reads the rewardLadder sub-flags live. Returns
// { grade, baseTier, cards, picks, mixed }.
export function drawLadder(res, rng, opts = {}) {
  const exclude   = opts.wornWitnesses ? opts.wornWitnesses.slice() : [];   // grows as drafts compose (copy — never mutate the caller's)
  const reachSeen = [];   // Fix 1 — reach boon ids offered this draw; threaded through the base + every extra so the OFFER has no duplicate reach card while a distinct one exists.
  const riders    = on('rewardLadder.blemishRiders');
  const mixed     = on('rewardLadder.mixedDraw');
  const stitchAsh = on('rewardLadder.stitchAshGrade');
  const completed = (mixed && res.metTiers && res.metTiers.length) ? res.metTiers.slice() : [res.tier];
  let highest = completed[0];
  for (const t of completed) if ((TIER_RANK[t] ?? -1) > (TIER_RANK[highest] ?? -1)) highest = t;
  // §9a: a stitch save forces the Ash base (when stitchAshGrade on) AFTER the highest
  // grade is computed — an ash stitch that hit True must not upgrade.
  const ashStitch = !!res.stitched && stitchAsh;
  const base = buildDraw(ashStitch ? 'stitch' : TABLE_FOR_TIER[highest], rng, riders, exclude, reachSeen);
  const cards = base.cards.slice();
  // §9d: every EXTRA completed rung adds one card at ITS OWN grade (width, not grade).
  const extras = completed.slice();
  extras.splice(extras.indexOf(highest), 1);
  for (const t of extras) {
    const d = buildDraw(TABLE_FOR_TIER[t], rng, riders, exclude, reachSeen);
    if (d.cards.length) cards.push(d.cards[0]);
  }
  return {
    grade: base.grade,
    baseTier: ashStitch ? 'stitch' : highest,
    cards,
    picks: mixed ? picksFor(completed.length) : 1,
    mixed: extras.length > 0,
  };
}
