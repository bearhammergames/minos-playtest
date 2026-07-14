// slice4_verbs_test.mjs — the ModifierList v2 slice-4 L1 verbs wired into the session firing path:
//   convert (Carver's Sigil)  — chosen on_resolve transformer; {di,to} colour recast, permanent.
//   release (Open Hand)        — ambient on_keep un-keep offer; once per segment per etched face.
//   ward    (Warding Sigil)    — standing interceptor: refuses ONE forced bane effect, then bites.
//   expose  (Augur's Sigil)    — a PEEK sigil: pre-draws the die's next face; lands on any re-throw.
//   echo    (Echo Sigil)       — an on_reroll offer raised only by a forced bane reroll; once/window.
//   erode applier              — floors mag at 1 (a deepened face loses its pip; mag-1 is no target).
//   chain milestone [EXP]      — every 3rd consecutive extend banks a spin; experiment-off ⇒ neutral.
// Drives the REAL engine in-process (act/legalActions/configure), injecting via the --enchant/--sigil
// debug seams. Determinism: every re-throw path routes through throwFace, so a peek replays byte-exact.
import { act, legalActions, configure } from '../session.mjs';
import { COLOUR_IDS } from '../../content/symbols.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };

// build a valid enchantment (validateEnchantment-clean) from a partial spec.
const E = o => ({ id: 't_' + (o.effect || o.trigger), condition: null, polarity: 'boon', forced: false,
  lifetime: 'permanent', cost: {}, params: {}, ...o });

// greedy driver: play until `pred(state)` is true (or done/guard). Keeps a loose die toward progress,
// resolves on metNow, takes perk card 0, SKIPS transforms by default (pred catches the ones we want).
function playUntil(pred, seed, opts = {}){
  configure({ enchants: opts.enchants || [], sigil: opts.sigil, wish: opts.wish });
  let r = act({ type: 'new_run', seed, balance: opts.balance || {} });
  let s = r.state, g = 0; const events = [...(r.events || [])];
  while (!s.over && g++ < 400 && !pred(s)){
    if (s.phase === 'perk') r = act({ type: 'perk', card: 0 });
    else if (s.phase === 'transform') r = act({ type: 'transform', skip: true });
    else if (s.phase === 'stitch') r = act({ type: 'stitch' });
    else if (s.phase === 'segment' || s.phase === 'knot'){
      if ((s.spinsTaken || 0) === 0) r = act({ type: 'spin' });
      else if ((s.metNow || []).length) r = act({ type: 'resolve' });
      else if ((s.rollsLeft || 0) > 0){
        const loose = (s.tray || []).find(t => !t.kept && !t.locked && t.symbol !== 'blank');
        r = (loose && legalActions().some(x => x.type === 'keep' && x.args.i === loose.i)) ? act({ type: 'keep', i: loose.i }) : act({ type: 'spin' });
      } else r = act({ type: 'resolve' });
    } else break;
    events.push(...(r.events || [])); s = r.state;
  }
  return { s, events };
}

// =============================================================================
// convert (Carver's Sigil) — chosen on_resolve transformer; {di,to} colour recast, permanent.
// =============================================================================
const convertEnch = E({ effect: 'convert', trigger: 'on_resolve', scope: 'chosen', params: { to: 'need' }, name: 'Carver' });
const SEEDS = [1, 42, 777, 1000, 8919, 24757, 64352, 999, 5, 7, 12, 3, 20260704];
let convFound = null;
for (const seed of SEEDS){
  const { s } = playUntil(st => st.phase === 'transform' && st.transformOffer && st.transformOffer.effect === 'convert', seed, { enchants: [convertEnch] });
  if (s.phase === 'transform' && s.transformOffer.effect === 'convert' && s.transformOffer.candidates.length){ convFound = { seed, s }; break; }
}
ok(!!convFound, 'convert: reaches the transform phase with candidates');
if (convFound){
  const off = convFound.s.transformOffer;
  ok(Array.isArray(off.colours) && off.colours.length === COLOUR_IDS.length, 'convert: transformOffer carries the `colours` list');
  const c = off.candidates[0];
  const legal = legalActions();
  ok(legal.some(x => x.type === 'transform' && x.args.di === c.i && x.args.to == null), 'convert: {di} (default `to`) is legal');
  ok(off.colours.filter(col => col !== c.symbol).every(col => legal.some(x => x.type === 'transform' && x.args.di === c.i && x.args.to === col)),
     'convert: {di,to} enumerated per colour ≠ the face\'s current colour');
  ok(!legal.some(x => x.type === 'transform' && x.args.di === c.i && x.args.to === c.symbol), 'convert: never offers to convert to the face\'s current colour');

  // explicit `to` — apply, then the permanent hand face carries the chosen colour.
  const target = off.colours.find(col => col !== c.symbol);
  const r1 = act({ type: 'transform', di: c.i, to: target });
  ok(r1.state.hand[c.i].faces[c.fi].symbol === target, `convert: explicit to=${target} recasts die ${c.i} face ${c.fi} permanently`);

  // omitted `to` — deterministic default (a colour ≠ current); same seed ⇒ same default both times.
  const runOmit = () => { const { s } = playUntil(st => st.phase === 'transform' && st.transformOffer && st.transformOffer.effect === 'convert', convFound.seed, { enchants: [convertEnch] });
    const cc = s.transformOffer.candidates[0]; const rr = act({ type: 'transform', di: cc.i }); return rr.state.hand[cc.i].faces[cc.fi].symbol; };
  const d1 = runOmit(), d2 = runOmit();
  ok(COLOUR_IDS.includes(d1) && d1 !== convFound.s.transformOffer.candidates[0].symbol, `convert: omitted to ⇒ default colour (${d1})`);
  ok(d1 === d2, 'convert: the default `to` is deterministic (same seed ⇒ same colour)');
}

// =============================================================================
// release (Open Hand) — ambient on_keep un-keep offer; once per segment per etched face.
// =============================================================================
{
  const releaseEnch = E({ effect: 'release', trigger: 'on_keep', scope: 'chosen', name: 'Open Hand' });
  configure({ enchants: [releaseEnch] });
  let r = act({ type: 'new_run', seed: 1, balance: {} });
  r = act({ type: 'spin' }); let s = r.state;
  ok(!s.releaseOffers, 'release: no offer before any die is kept');
  const other = s.tray.find(t => t.i !== 0 && !t.kept && !t.locked && t.symbol !== 'blank');
  ok(!!other, 'release: a second die is available to keep');
  r = act({ type: 'keep', i: other.i }); s = r.state;
  const offer = (s.releaseOffers || []).find(o => o.di === 0);
  ok(!!offer && offer.targets.includes(other.i), `release: an offer rises (etched face 0 shown + die ${other.i} kept)`);
  ok(legalActions().some(x => x.type === 'release' && x.args.target === other.i), 'release: {type:release,target} is a legal action');
  const rr = act({ type: 'release', target: other.i }); s = rr.state;
  ok(s.tray.find(t => t.i === other.i).kept === false, `release: die ${other.i} is un-kept (back to the pool)`);
  // once per segment per etched face — re-keep, the SAME etched face offers no more (it never re-spun).
  r = act({ type: 'keep', i: other.i }); s = r.state;
  ok(!(s.releaseOffers || []).some(o => o.di === 0), 'release: once per segment — the spent etched face offers no second release');
}

// =============================================================================
// ward (Warding Sigil) — refuses exactly ONE forced bane effect, then the next bites.
// =============================================================================
const ward = E({ effect: 'ward', trigger: 'on_roll', scope: 'self', forced: true, name: 'Ward' });
{
  // on_roll: two forced self-reroll banes — the first is refused (ward spent), the second rerolls.
  const baneR = E({ effect: 'reroll', trigger: 'on_roll', scope: 'self', forced: true, polarity: 'bane', name: 'BaneR' });
  configure({ enchants: [ward, baneR, baneR] });
  act({ type: 'new_run', seed: 3, balance: {} });
  const ev = act({ type: 'spin' }).events;
  ok(ev.some(e => /ward holds/.test(e)), 'ward(on_roll): absorbs one forced bane (the ward holds)');
  ok(ev.some(e => /respins die 0/.test(e)), 'ward(on_roll): the SECOND forced bane bites (ward is spent)');
  ok(ev.filter(e => /ward holds/.test(e)).length === 1, 'ward(on_roll): exactly one absorption');
}
{
  // on_keep: two forced self-lock banes — first refused, second locks (proves the SAME choke point).
  const baneL = E({ effect: 'lock', trigger: 'on_keep', scope: 'self', forced: true, polarity: 'bane', name: 'BaneL' });
  configure({ enchants: [ward, baneL, baneL] });
  act({ type: 'new_run', seed: 3, balance: {} });
  act({ type: 'spin' });
  const kr = act({ type: 'keep', i: 0 });
  ok(kr.events.some(e => /ward holds/.test(e)), 'ward(on_keep): absorbs one forced bane at on_keep too');
  ok(kr.state.tray.find(t => t.i === 0).locked === true, 'ward(on_keep): the second forced bane locks die 0 (ward spent)');
}
{
  // ward NEVER blocks a player-invoked reroll (a sigil tap passes no polarity ⇒ not a forced bane).
  configure({ enchants: [ward], sigil: 'self' });
  act({ type: 'new_run', seed: 3, balance: {} });
  const s = act({ type: 'spin' }).state;
  ok((s.sigils || []).some(sg => sg.di === 0 && sg.effect === 'reroll'), 'ward: a reroll sigil is offered alongside the ward');
  const tap = act({ type: 'sigil', di: 0 });
  ok(tap.events.some(e => /respins die 0/.test(e)) && !tap.events.some(e => /ward holds/.test(e)), 'ward: a player sigil reroll is NOT warded');
  const fi = tap.state.tray.find(t => t.i === 0).fi;
  ok((tap.state.hand[0].faces[fi].ench || []).some(e => e.effect === 'ward'), 'ward: still present after a player reroll (not consumed)');
}

// =============================================================================
// expose (Augur's Sigil) — a PEEK; the pre-drawn face lands on the next re-throw (spin AND wish_reroll).
// =============================================================================
{
  // path 1 — the next SPIN lands the peeked face; the peek is consumed once.
  configure({ sigil: 'expose' });
  act({ type: 'new_run', seed: 42, balance: {} });
  let s = act({ type: 'spin' }).state;
  const sg = (s.sigils || []).find(x => x.di === 0);
  ok(sg && sg.effect === 'expose', 'expose: a peek-sigil is offered (effect:expose)');
  s = act({ type: 'sigil', di: 0 }).state;
  const peek = (s.peeks || []).find(p => p.di === 0);
  ok(!!peek, 'expose: tapping the peek surfaces s.peeks for the die');
  s = act({ type: 'spin' }).state;
  const landed = s.tray.find(t => t.i === 0);
  ok(landed.symbol === peek.face.symbol && landed.mag === peek.face.mag, 'expose: the next SPIN lands exactly the peeked face');
  ok(!(s.peeks || []).some(p => p.di === 0), 'expose: the peek is consumed (gone after the re-throw)');
}
{
  // path 2 — a wish_reroll (Generous One) lands the peeked face too (any re-throw path via throwFace).
  // §Change-2 the free reroll is now BOSS-segment-only; patronLen=1 makes segment 0 the boss so it's offered.
  configure({ sigil: 'expose', wish: 'generous_one' });
  act({ type: 'new_run', seed: 42, balance: { 'wishes.patronLen': 1 } });
  let s = act({ type: 'spin' }).state;
  s = act({ type: 'sigil', di: 0 }).state;   // peek die 0
  const peek = (s.peeks || []).find(p => p.di === 0);
  ok(!!peek && !!s.wishReroll, 'expose: a peek + a wish reroll are both available');
  s = act({ type: 'wish_reroll', di: 0 }).state;
  const landed = s.tray.find(t => t.i === 0);
  ok(peek && landed.symbol === peek.face.symbol && landed.mag === peek.face.mag, 'expose: a wish_reroll lands the peeked face');
}

// =============================================================================
// echo (Echo Sigil) — an on_reroll offer raised ONLY by a forced bane reroll; free; once per window.
// =============================================================================
const echo = E({ effect: 'reroll', trigger: 'on_reroll', scope: 'self', name: 'Echo' });
{
  const baneR = E({ effect: 'reroll', trigger: 'on_roll', scope: 'self', forced: true, polarity: 'bane', name: 'BaneR' });
  configure({ enchants: [echo, baneR, baneR] });
  const rollsFull = act({ type: 'new_run', seed: 3, balance: {} }).state;
  const r = act({ type: 'spin' }); const s = r.state;
  ok(r.events.filter(e => /answers/.test(e)).length === 1, 'echo: a forced bane reroll raises exactly one echo (once per window)');
  const eSig = (s.sigils || []).find(sg => sg.di === 0 && sg.effect === 'reroll');
  ok(!!eSig, 'echo: the echo offer is a free reroll sigil on the rerolled die');
  const rolls = s.rollsLeft;
  const tap = act({ type: 'sigil', di: 0 });
  ok(tap.state.rollsLeft === rolls, 'echo: tapping the echo is FREE (rollsLeft unchanged)');
}
{
  // a PLAYER-invoked reroll never raises an echo (only forced bane rerolls do).
  configure({ enchants: [echo], sigil: 'self' });
  act({ type: 'new_run', seed: 3, balance: {} });
  act({ type: 'spin' });
  const tap = act({ type: 'sigil', di: 0 });
  ok(!tap.events.some(e => /answers/.test(e)), 'echo: a player-invoked reroll raises NO echo');
}

// =============================================================================
// erode applier — floors mag at 1 (a deepened face loses its pip; a mag-1 face is no target).
// =============================================================================
{
  const deepenEnch = E({ effect: 'deepen', trigger: 'on_resolve', scope: 'chosen', params: { pips: 1 }, name: 'Whetstone' });
  const erodeEnch  = E({ effect: 'erode',  trigger: 'on_resolve', scope: 'chosen', params: { pips: 1 }, name: 'Grinder' });
  let erFound = null;
  for (const seed of SEEDS){
    const { s } = playUntil(st => st.phase === 'transform' && st.transformOffer && st.transformOffer.effect === 'deepen', seed, { enchants: [deepenEnch, erodeEnch] });
    if (s.phase === 'transform' && s.transformOffer.effect === 'deepen' && s.transformOffer.candidates.length){ erFound = seed; break; }
  }
  ok(!!erFound, 'erode: reaches a deepen→erode transform batch');
  if (erFound){
    const { s } = playUntil(st => st.phase === 'transform' && st.transformOffer && st.transformOffer.effect === 'deepen', erFound, { enchants: [deepenEnch, erodeEnch] });
    const cd = s.transformOffer.candidates[0];
    const afterDeepen = act({ type: 'transform', di: cd.i }).state;
    ok(afterDeepen.hand[cd.i].faces[cd.fi].mag === 2, 'erode: deepen raises the face to mag 2');
    ok(afterDeepen.transformOffer && afterDeepen.transformOffer.effect === 'erode', 'erode: the erode transform follows');
    ok(afterDeepen.transformOffer.candidates.every(x => afterDeepen.hand[x.i].faces[x.fi].mag > 1), 'erode: only mag>1 faces are erode candidates (floor — a mag-1 face is no target)');
    const ec = afterDeepen.transformOffer.candidates.find(x => x.i === cd.i);
    ok(!!ec, 'erode: the deepened face is now an erode candidate');
    const afterErode = act({ type: 'transform', di: cd.i }).state;
    ok(afterErode.hand[cd.i].faces[cd.fi].mag === 1, 'erode: the deepened face loses its pip (mag 2 → 1, floored)');
  }
}

// =============================================================================
// chain milestone [EXPERIMENT] — every 3rd consecutive extend banks a spin; experiment-off ⇒ neutral.
// A CHAIN-CHASING policy (keep toward the current chain colour, resolve it) manufactures the
// consecutive same-colour beads the milestone counts.
// =============================================================================
{
  const CSEEDS = [];
  for (let s = 1; s <= 220; s++) CSEEDS.push(s * 97 + 11);
  const chainChase = (seed, balance) => {
    configure({});
    let r = act({ type: 'new_run', seed, balance }); let s = r.state, g = 0; const ev = [...(r.events || [])];
    while (!s.over && g++ < 600){
      if (s.phase === 'perk') r = act({ type: 'perk', card: 0 });
      else if (s.phase === 'transform') r = act({ type: 'transform', skip: true });
      else if (s.phase === 'stitch') r = act({ type: 'stitch' });
      else if (s.phase === 'segment' || s.phase === 'knot'){
        if ((s.spinsTaken || 0) === 0){ r = act({ type: 'spin' }); }
        else {
          const chain = s.thread.chain;
          const rungs = s.rungs || [];
          const target = ((rungs.find(x => x.colour === chain) || rungs[0]) || {}).colour;
          if ((s.metNow || []).some(m => m.colour === target)){ r = act({ type: 'resolve' }); }
          else {
            const loose = (s.tray || []).filter(t => !t.kept && !t.locked && t.symbol !== 'blank');
            const pick = loose.find(t => t.symbol === target || t.symbol === 'fang');
            if (pick && legalActions().some(x => x.type === 'keep' && x.args.i === pick.i)) r = act({ type: 'keep', i: pick.i });
            else if ((s.rollsLeft || 0) > 0) r = act({ type: 'spin' });
            else r = act({ type: 'resolve' });   // out of rolls — meet whatever / snap
          }
        }
      } else break;
      ev.push(...(r.events || [])); s = r.state;
    }
    return { banks: ev.filter(e => /chain holds/.test(e)).length, result: { score: s.score, segs: s.thread.length, stitches: s.stitchSaves } };
  };
  // §D2 isolate the pre-debt reward pool: the debt cards (shift_bane fills the reach channel's COMMON
  // slot) change what the chain-chase policy's blind `card:0` pick does + perturb the rng stream, which
  // masks the milestone across this seed set. The chain-milestone experiment is orthogonal to the debt
  // cards, so turn them off (identically on BOTH runs, so the on/off byte-identity check stays valid).
  // §D3 the bargain family + the pure-rider roll perturb the same rng stream (extra pool members + an extra
  // rng draw per ridered card), so isolate them here too — orthogonal to the milestone, off on BOTH runs.
  // §G5 SPEED — this block plays 440 full runs (220 seeds × on/off), each firing the joint probe per
  // segment; at the default 240 trials that dominated the suite (~200s, over the runner's 180s per-file
  // budget → the intermittent 36/37 fail). Cut the PROBE trials for these runs only: the milestone's
  // firing + the on/off byte-identity are independent of probe PRECISION, and the override is applied
  // IDENTICALLY to both the on AND off runs, so all three assertions below stay exactly as strong (the
  // seed COVERAGE — the thing that manufactures the chains — is unchanged at 220). ~2.4× faster.
  const DEBT_OFF = { 'debt.shift': false, 'debt.cleanse': false, 'vocab.bargains': false, 'rewardLadder.pureRiders': false, 'generator2.trials': 100 };
  let onBanks = 0, offBanks = 0, onlyEffectHolds = true;
  for (const seed of CSEEDS){
    const on = chainChase(seed, { ...DEBT_OFF });                                   // native — chainMilestone on
    const off = chainChase(seed, { ...DEBT_OFF, 'experiments.enabled': false });    // experiment off
    onBanks += on.banks; offBanks += off.banks;
    if (on.banks === 0 && JSON.stringify(on.result) !== JSON.stringify(off.result)) onlyEffectHolds = false;
  }
  ok(onBanks > 0, `chain milestone: the "chain holds" bank fires on some run (${onBanks} banks over ${CSEEDS.length} seeds)`);
  ok(offBanks === 0, 'chain milestone: never fires with the experiment off (neutral)');
  ok(onlyEffectHolds, 'chain milestone: a run that banked 0 is byte-identical on/off (the banked spin is the ONLY effect)');
}

console.log(`\nslice4 verbs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
