// =============================================================================
// SLICE-4 POOLS TEST (ModifierList v2 §2.2/§2.3 — the content/pool layer)
// -----------------------------------------------------------------------------
//   • erode banes (Dulling Spin / Twin Dulling Spin) enter generateBane's pool ONLY
//     when on('debt.erode') — gate-first, flag off ⇒ pool byte-identical; the cruel Twin
//     never rides a card (bandForBoon never returns cruel).
//   • the five slice-4 vocab reach cards (open_hand / carvers_sigil / ward_sigil /
//     augurs_sigil / echo_sigil) are in LADDER_BOONS, tagged with their `vocab` gate, and
//     offered ONLY under on('vocab.<tag>') — flags off ⇒ the reach pool is byte-identical to
//     the slice-2 set. Reach cards ride a bane per the Station Rule (blemished, M-2).
// Pure unit test of the pools (not the retired sim bench).
// =============================================================================
import { BALANCE } from '../balance.js';
BALANCE.rewardLadder.enabled = true;
BALANCE.rewardLadder.blemishRiders = true;
// §D3 pin pureRiders OFF: this test asserts the Station-Rule "a drawn reach card rides a bane" invariant.
// The D3 pure-ink lottery deliberately relaxes that (an uncommon/rare reach may ship clean) — it has its
// own gate in bargains_test — so isolate it here to keep the always-ridered assertion deterministic.
BALANCE.rewardLadder.pureRiders = false;
BALANCE.witnesses.enabled = true;
// §D1 this test guards the slice-4 VOCAB pool; the ⚖3.2 face cards are a separate gated family
// with their own test. Turn the faces family off so the reach-pool sweeps below are unpolluted by
// face cards (the untagged-pool assertion also excludes b.faces — a face card is gated, not always-on).
BALANCE.faces.enabled = false;
// §D2 likewise the debt cards (shift/scour/absolve) are their OWN gated family (their own test) — turn
// off their leaves so this vocab sweep + the untagged-pool assertion stay unpolluted by debt cards.
// (Leave debt.enabled + debt.erode ON — the erode-bane test above needs them.)
BALANCE.debt.shift = false; BALANCE.debt.cleanse = false;

const { generateBane } = await import('../../content/enchantments.js');
const { drawLadder, LADDER_BOONS, bandForBoon } = await import('../reward_ladder.js');
const { makeRng } = await import('../engine.js');
const { setBalanceOverrides } = await import('../balance.js');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  FAIL:', name); } };

// ---- erode banes: in the generateBane pool ONLY when on('debt.erode') ----------------
setBalanceOverrides({ 'debt.erode': false });   // gate off (master debt.enabled still native-true)
let erodeOff = 0;
for (let s = 1; s <= 1000; s++) if (generateBane(makeRng(s)).effect === 'erode') erodeOff++;
check('erode OFF ⇒ generateBane never draws an erode bane', erodeOff === 0);

setBalanceOverrides({});   // native — debt.erode on
let erodeOn = 0, dullNames = new Set();
for (let s = 1; s <= 1000; s++){ const b = generateBane(makeRng(s)); if (b.effect === 'erode'){ erodeOn++; dullNames.add(b.name); } }
check('erode ON ⇒ erode banes DO enter the pool', erodeOn > 0);
check('erode banes are the Dulling Spin family', [...dullNames].every(n => /Dulling Spin/.test(n)));

// the harsh Dulling Spin CAN ride a card; the cruel Twin NEVER rides (bandForBoon never returns cruel).
check('bandForBoon never returns cruel (the Twin Dulling Spin cannot ride)',
  ['common', 'uncommon', 'rare', 'mythic'].every(r => ['ash', 'trade', 'royal'].every(g => bandForBoon(r, g) !== 'cruel')));
let harshErodeRode = false;
for (let s = 1; s <= 400; s++){ const b = generateBane(makeRng(s * 7 + 1), { band: 'harsh' }); if (b.effect === 'erode' && b.band === 'harsh') harshErodeRode = true; }
check('the harsh Dulling Spin is a legal rider (band harsh)', harshErodeRode);

// ---- the five slice-4 vocab cards live in LADDER_BOONS, tagged + gated ----------------
const NEW = {
  open_hand:     { vocab: 'wave3_releaseRender', effect: 'release', trigger: 'on_keep',    rarity: 'uncommon' },
  carvers_sigil: { vocab: 'wave2_convertDeepen', effect: 'convert', trigger: 'on_resolve', rarity: 'rare' },
  ward_sigil:    { vocab: 'ward',                effect: 'ward',    trigger: 'on_roll',     rarity: 'uncommon' },
  augurs_sigil:  { vocab: 'expose',              effect: 'expose',  trigger: 'on_roll',     rarity: 'rare' },
  echo_sigil:    { vocab: 'onReroll',            effect: 'reroll',  trigger: 'on_reroll',   rarity: 'uncommon' },
};
for (const [id, spec] of Object.entries(NEW)){
  const card = LADDER_BOONS.find(b => b.id === id);
  check(`${id}: present in LADDER_BOONS`, !!card);
  if (card) check(`${id}: reach axis + vocab '${spec.vocab}' + ench(${spec.trigger}/${spec.effect}) + ${spec.rarity}`,
    card.axis === 'reach' && card.vocab === spec.vocab && card.effect === 'enchant'
    && card.ench.effect === spec.effect && card.ench.trigger === spec.trigger && card.rarity === spec.rarity);
}

// ---- pool byte-identity: the vocab-tagged cards are EXACTLY these 5; the untagged pool is
// the slice-2 set (so with vocab off — which filters out every tagged card — the reach pool is
// byte-identical to before this slice). ----
// §D3 the BARGAIN family (vocab:'bargains') is a separate D3-gated family with its own test — exclude it
// here (as the untagged check below already excludes the faces/debt families) so this stays scoped to slice-4.
const tagged = LADDER_BOONS.filter(b => b.vocab && b.vocab !== 'bargains').map(b => b.id).sort();
check('exactly the 5 slice-4 cards carry a (non-bargain) vocab tag', JSON.stringify(tagged) === JSON.stringify(Object.keys(NEW).sort()));
const untagged = LADDER_BOONS.filter(b => !b.vocab && !b.faces && !b.debt && b.effect !== undefined).map(b => b.id).sort();   // §D1/§D2 exclude the faces- and debt-gated families
const SLICE2 = ['deepen', 'flanking_sigil', 'respin_sigil', 'reweave', 'spinwrights_sigil', 'wild_sigil'].sort();
check('the untagged (always-on) reach/worth pool is the slice-2 set', JSON.stringify(untagged) === JSON.stringify(SLICE2));

// ---- drawLadder offers the new cards with vocab ON, and NONE with vocab OFF -----------
function sweepIds(){
  const seen = new Set();
  for (const tier of ['floor', 'true', 'bloom']) for (let s = 1; s <= 400; s++){
    const d = drawLadder({ tier, metTiers: [tier] }, makeRng(s * 13 + 1));
    for (const c of d.cards) if (c.boon && c.boon.id) seen.add(c.boon.id);
  }
  return seen;
}
const onSeen = sweepIds();
check('vocab ON ⇒ every new card is offered by drawLadder', Object.keys(NEW).every(id => onSeen.has(id)));
// riders per Station Rule: a drawn new card (reach) is blemished + carries a rider band.
let newCardRidered = true, sawNewInBloom = false;
for (let s = 1; s <= 400; s++){
  const d = drawLadder({ tier: 'bloom', metTiers: ['bloom'] }, makeRng(s * 5 + 2));
  for (const c of d.cards) if (c.boon && NEW[c.boon.id]){ sawNewInBloom = true; if (!(c.blemished && c.rider && c.rider.band)) newCardRidered = false; }
}
check('a drawn slice-4 reach card rides a bane (blemished, Station Rule)', sawNewInBloom && newCardRidered);

BALANCE.vocab.enabled = false;   // the vocab master off ⇒ every tagged card filtered from the pool
const offSeen = sweepIds();
check('vocab OFF ⇒ NONE of the new cards are offered (pool byte-identical to slice-2)',
  Object.keys(NEW).every(id => !offSeen.has(id)));
BALANCE.vocab.enabled = true;

console.log(`\nslice4 pools: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
