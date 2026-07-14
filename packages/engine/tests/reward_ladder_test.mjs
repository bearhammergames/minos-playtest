// =============================================================================
// REWARD LADDER TEST  (Modifier Stack §9/§9d + ModifierList v2 §5 — the inversion fix)
// -----------------------------------------------------------------------------
// Covers the v2 composition: tier→grade (§9a), the REACH/DRAFT channel split (§5 —
// reach = priced verbs + rider; draft = a worn WITNESS, the worth slot), the royal
// guaranteed-rare REACH, the flat-score glimmer family CUT (§4.4), draft exclusion +
// the §8 disabled-content trim, the witnesses-off all-reach degradation (zero witness-
// pool rng), the Mixed Draw (§9d) + stitch-ash, the station rule, and determinism.
// A pure unit test of the composer (not the retired sim bench).
// =============================================================================
import { BALANCE } from '../balance.js';
BALANCE.rewardLadder.enabled = true;
BALANCE.rewardLadder.mixedDraw = true;
BALANCE.rewardLadder.blemishRiders = true;
BALANCE.rewardLadder.stitchAshGrade = true;
BALANCE.witnesses.enabled = true;   // drafts compose from the witness registry
// §D1 this is the PRE-D1 composer guard — the ⚖3.2 face cards get their own test
// (face_economy_test.mjs). Turning the faces family OFF keeps this test's pool byte-identical
// to before D1 (the four face cards filter out gate-first), so every assertion below holds
// unchanged — which itself PROVES the ⚖3.2 A/B neutrality contract (faces off ⇒ no change).
BALANCE.faces.enabled = false;

const { drawLadder, bandForBoon, riderBane, LADDER_BOONS } = await import('../reward_ladder.js');
const { makeRng } = await import('../engine.js');
const { setDisabledContent } = await import('../balance.js');
const { WITNESSES } = await import('../../content/witnesses.js');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  FAIL:', name); } };
const isReach = c => c.kind === 'blessing' && c.boon && (c.boon.axis === 'reach' || c.boon.axis === 'tempo');
const isDraft = c => c.kind === 'draft';
const reachCards = d => d.cards.filter(isReach);
const draftCards = d => d.cards.filter(isDraft);
const norm = d => ({ grade: d.grade, picks: d.picks, mixed: d.mixed,
  cards: d.cards.map(c => ({ kind: c.kind, grade: c.grade, rarity: c.rarity, blemished: !!c.blemished,
    ref: c.kind === 'draft' ? c.witnessId : c.boon.id, riderBand: c.rider ? c.rider.band : null })) });

// ---- §4.4: the flat-score worth family is CUT; the reach pool survives ----
check('glimmer/steady family absent from LADDER_BOONS',
  !LADDER_BOONS.some(b => ['glimmer', 'bright_glimmer', 'radiant_glimmer', 'steady'].includes(b.id)));
check('reach pool keeps reweave/deepen/the 4 sigils',
  ['reweave', 'deepen', 'respin_sigil', 'flanking_sigil', 'wild_sigil', 'spinwrights_sigil'].every(id => LADDER_BOONS.some(b => b.id === id)));

// ---- floor → ash: 1 reach (ridered) + 2 draft ----
const floor = drawLadder({ tier: 'floor', metTiers: ['floor'] }, makeRng(1));
check('floor → ash grade',        floor.grade === 'ash');
check('floor → 3 cards',          floor.cards.length === 3);
check('floor → 1 reach + 2 draft', reachCards(floor).length === 1 && draftCards(floor).length === 2);
// §D-fix2 the ash common reach card is now Shift (the only common with faces off), which is neverRider —
// pure relocation grants zero reach power, so the common debt card ships UNRIDERED (blemished:false, no
// rider). (Was: "floor reach card ridered" — true before Shift joined the neverRider set.)
check('floor reach card is the neverRider Shift (common, unridered)',
  reachCards(floor).every(c => c.boon.id === 'shift_bane' && !c.blemished && !c.rider));
check('floor draft cards carry witnessId + rarity + desc + label',
  draftCards(floor).every(c => c.witnessId && WITNESSES[c.witnessId] && c.rarity && c.desc && c.label && c.grade === 'ash'));

// ---- true → trade: 2 reach + 1 draft ----
const tru = drawLadder({ tier: 'true', metTiers: ['true'] }, makeRng(1));
check('true → trade grade',       tru.grade === 'trade');
check('true → 2 reach + 1 draft', reachCards(tru).length === 2 && draftCards(tru).length === 1);

// ---- bloom → royal: 2 reach + 1 draft, a guaranteed rare+ REACH (§5) ----
const bloom = drawLadder({ tier: 'bloom', metTiers: ['bloom'] }, makeRng(1));
check('bloom → royal grade',      bloom.grade === 'royal');
check('bloom → 2 reach + 1 draft', reachCards(bloom).length === 2 && draftCards(bloom).length === 1);
let everyBloomHasRareReach = true;
for (let s = 1; s <= 200; s++){
  const bl = drawLadder({ tier: 'bloom', metTiers: ['bloom'] }, makeRng(s));
  if (!reachCards(bl).some(c => c.rarity === 'rare' || c.rarity === 'mythic')) everyBloomHasRareReach = false;
}
check('every bloom draw guarantees a rare+ REACH card', everyBloomHasRareReach);

// ---- drafts exclude the witnesses the player already wears (§4.2) ----
// (Best-effort: exclusion holds as long as it doesn't empty the rolled rarity pool — the
//  documented fallback. This worn set leaves every rarity with alternatives, so it always holds.)
const worn = ['patient_needle', 'gamblers_vein', 'the_edge', 'bodybound'];   // 1 common, 2 uncommon, 1 rare
let noWornOffered = true;
for (let s = 1; s <= 200; s++){
  const d = drawLadder({ tier: 'true', metTiers: ['true'] }, makeRng(s), { wornWitnesses: worn });
  if (draftCards(d).some(c => worn.includes(c.witnessId))) noWornOffered = false;
}
check('drafts never re-offer a worn witness (pool has alternatives)', noWornOffered);

// ---- drafts respect the §8 disabled-content trim ----
setDisabledContent(['thousand_cuts']);   // one of the two common witnesses — floor drafts must skip it
let trimHeld = true;
for (let s = 1; s <= 200; s++){
  const d = drawLadder({ tier: 'floor', metTiers: ['floor'] }, makeRng(s));
  if (draftCards(d).some(c => c.witnessId === 'thousand_cuts')) trimHeld = false;
}
check('drafts respect the disabled-content trim', trimHeld);
setDisabledContent([]);

// ---- witnesses OFF ⇒ all-reach draw, zero witness-pool rng (the degradation) ----
BALANCE.witnesses.enabled = false;
const floorNoWit = drawLadder({ tier: 'floor', metTiers: ['floor'] }, makeRng(1));
check('witnesses off → 3 cards (width preserved)', floorNoWit.cards.length === 3);
check('witnesses off → all reach, no drafts',      draftCards(floorNoWit).length === 0 && floorNoWit.cards.every(isReach));
// no witness-pool rng: with witnesses off, poisoning the witness pool changes NOTHING
// (generateWitness is never reached — gate-first). The draw is byte-identical.
const offClean = norm(drawLadder({ tier: 'floor', metTiers: ['floor'] }, makeRng(9)));
setDisabledContent(['thousand_cuts', 'patient_needle', 'the_edge', 'bodybound']);
const offPoisoned = norm(drawLadder({ tier: 'floor', metTiers: ['floor'] }, makeRng(9)));
setDisabledContent([]);
check('witnesses-off draw ignores the witness pool (no witness rng)', JSON.stringify(offClean) === JSON.stringify(offPoisoned));
BALANCE.witnesses.enabled = true;

// ---- §9d: the Mixed Draw — extra rungs add a card at their own grade ----
const mix2 = drawLadder({ tier: 'true', metTiers: ['true', 'floor'] }, makeRng(2));
check('True+Floor → base trade',         mix2.grade === 'trade');
check('True+Floor → 4 cards (3+1)',      mix2.cards.length === 4);
check('True+Floor → one ash extra card', mix2.cards.filter(c => c.grade === 'ash').length === 1);
// §D-fix2 the extra ash card is a reach card at ash grade (a floor draw's reach slot). It is no longer
// guaranteed RIDERED: with faces off the ash common is the neverRider Shift (unridered), and the within-draw
// dedupe (Fix 1) may widen it to a distinct card. So we assert the stable contract — a reach card, ash grade.
check('True+Floor extra ash card is a reach card at ash grade',
  (() => { const c = mix2.cards.find(x => x.grade === 'ash'); return !!c && c.kind === 'blessing'; })());
check('True+Floor → pick 1 of 4, mixed', mix2.picks === 1 && mix2.mixed === true);

const allThree = drawLadder({ tier: 'bloom', metTiers: ['floor', 'true', 'bloom'] }, makeRng(3));
check('all-three → royal base',            allThree.grade === 'royal');
check('all-three → 5 cards (3+1+1)',       allThree.cards.length === 5);
check('all-three → 1 ash + 1 trade extra', allThree.cards.filter(c => c.grade === 'ash').length === 1 && allThree.cards.filter(c => c.grade === 'trade').length === 1);
check('all-three → pick 2 of 5 (Full Palette)', allThree.picks === 2);

// ---- §9a: a stitch save forces the ash base even if it hit True ----
const stitch = drawLadder({ tier: 'true', metTiers: ['true'], stitched: true }, makeRng(4));
check('stitch → ash base despite True', stitch.grade === 'ash');
check('stitch → baseTier "stitch"',     stitch.baseTier === 'stitch');
check('stitch → 4 cards',               stitch.cards.length === 4);

// ---- riders OFF ⇒ no unpriced reach: reach slots degrade to drafts (M-2) ----
BALANCE.rewardLadder.blemishRiders = false;
const floorNoRiders = drawLadder({ tier: 'floor', metTiers: ['floor'] }, makeRng(1));
check('riders off → no ridered/blemished cards', floorNoRiders.cards.every(c => !c.blemished && !c.rider));
check('riders off → reach slot degrades to draft (all draft, witnesses on)',
  floorNoRiders.cards.every(isDraft) && floorNoRiders.cards.length === 3);
BALANCE.rewardLadder.blemishRiders = true;

// ---- mixedDraw OFF ⇒ single completion only ----
BALANCE.rewardLadder.mixedDraw = false;
const noMix = drawLadder({ tier: 'true', metTiers: ['true', 'floor'] }, makeRng(2));
check('mixedDraw off → no mixed, base only', noMix.mixed === false && noMix.cards.length === 3);
BALANCE.rewardLadder.mixedDraw = true;

// ---- §9b station rule (M-5) ----
check('common in ash → mild',     bandForBoon('common', 'ash') === 'mild');
check('rare in ash → harsh',      bandForBoon('rare', 'ash') === 'harsh');
check('uncommon in royal → mild', bandForBoon('uncommon', 'royal') === 'mild');
const rb = riderBane('common', 'ash', makeRng(9));
check('riderBane draws a mild bane', rb && rb.band === 'mild' && rb.polarity === 'bane');

// ---- determinism (id-stripped: rider ids use a global seq; bands/grades/witnesses are seeded) ----
const r1 = norm(drawLadder({ tier: 'bloom', metTiers: ['floor', 'true', 'bloom'] }, makeRng(42)));
const r2 = norm(drawLadder({ tier: 'bloom', metTiers: ['floor', 'true', 'bloom'] }, makeRng(42)));
check('same seed → same draw structure', JSON.stringify(r1) === JSON.stringify(r2));

console.log(`\nreward ladder: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
