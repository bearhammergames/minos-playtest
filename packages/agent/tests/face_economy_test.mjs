// =============================================================================
// FACE ECONOMY TEST (§D1 ⚖3.2 — dice gain/lose faces as a progression axis)
// -----------------------------------------------------------------------------
// Drives the REAL session core. Covers the four face verbs (graft / copy-etch / excise /
// cursed-graft), their caps + deep-clone independence (via the exported pure verbs), the
// excise index-integrity repair (shown-face clamp + event, below-shown decrement, peek void),
// their acquisition through the Reward Ladder (targeting variants + bare auto picks), the
// faces flag-family gating (byte-identical all-off; cursed_graft NEVER ridered), and determinism.
// The trim collapses the reach pool to the target face card so the perk offer is deterministic.
// =============================================================================
import { newRun, act, serializeState, legalActions, configure,
         graftFace, copyEtchFace, exciseFace, cursedGraft, faceCaps, fixFaceIndex } from '../session.mjs';
import { COLOUR_IDS } from '../../content/symbols.js';
import { drawLadder } from '../../engine/reward_ladder.js';
import { makeRng } from '../../engine/engine.js';
import { setBalanceOverrides, clearBalanceOverrides, setDisabledContent } from '../../engine/balance.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };
const F = (symbol, mag = 1) => ({ symbol, mag, state: 'live' });

// every reach + face card EXCEPT the one we keep, so the reach pool collapses to it. witnesses off
// (draft slots degrade to reach) + (for most tests) riders off ⇒ every drawn card is that one card.
const ALL_REACH = ['reweave', 'deepen', 'respin_sigil', 'flanking_sigil', 'wild_sigil', 'spinwrights_sigil',
  'open_hand', 'carvers_sigil', 'ward_sigil', 'augurs_sigil', 'echo_sigil',
  'graft_face', 'copy_etch', 'excise_face', 'cursed_graft',
  'shift_bane', 'scour', 'absolve',   // §D2 the debt cards join the reach pool (default on) — trim them out too so the pool collapses to `keep`
  'grinning_bargain', 'seers_bargain', 'louts_bargain'];   // §D3 the bargain cards join the reach pool (default on) — trim them too
const trimFor = (keep, extraBalance = {}) => ({
  balance: { 'witnesses.enabled': false, 'rewardLadder.blemishRiders': false, ...extraBalance },
  disabledContent: ALL_REACH.filter(id => id !== keep),
});

// greedy floor policy → the FIRST perk phase. Returns { st, preTray } (preTray = the tray captured
// just before the resolve that produced this perk — so a caller knows each die's shown face index).
function playToPerkTray(seed, opts){
  configure({});   // clear any lingering debug injections
  let st = act({ type: 'new_run', seed, ...opts }).state, guard = 0, preTray = null;
  while (!st.over && guard++ < 80){
    if (st.phase === 'perk') return { st, preTray };
    if (st.phase === 'transform'){ st = act({ type: 'transform', skip: true }).state; continue; }
    if (st.phase === 'stitch'){ st = act({ type: 'stitch' }).state; continue; }
    if (st.phase === 'segment' || st.phase === 'knot'){
      if ((st.spinsTaken || 0) === 0){ st = act({ type: 'spin' }).state; continue; }
      const target = [...st.rungs].filter(x => x.req).sort((a, b) => (b.reach_estimate || 0) - (a.reach_estimate || 0))[0];
      const need = { ...(target ? target.req : {}) };
      for (const t of st.tray) if (t.kept && need[t.symbol]) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag || 1));
      const kd = (st.tray || []).find(t => !t.kept && !t.locked && t.symbol !== 'blank' && t.symbol !== 'fang' && (need[t.symbol] || 0) > 0);
      if (kd){ st = act({ type: 'keep', i: kd.i }).state; continue; }
      if ((st.metNow || []).length > 0 || (st.rollsLeft || 0) <= 0){
        preTray = st.tray.map(t => ({ i: t.i, fi: t.fi, symbol: t.symbol, mag: t.mag }));
        st = act({ type: 'resolve' }).state; continue;
      }
      st = act({ type: 'spin' }).state; continue;
    }
    break;
  }
  return { st: null, preTray: null };
}
// first seed reaching a perk holding a face card of `effect`; returns { seed, st, card } or null.
function reachVerb(effect, keep, opts = {}){
  for (let seed = 1; seed <= 200; seed++){
    const { st, preTray } = playToPerkTray(seed, trimFor(keep, opts.extraBalance));
    if (!st) continue;
    const card = (st.perkOffer || []).find(c => c.boon && c.boon.effect === effect);
    if (card) return { seed, st, preTray, card };
  }
  return null;
}
const faceSig = st => st.hand.map(d => d.faces.map(f => `${f.symbol}${f.mag}`).join(',')).join('|');

// =============================================================================
// PART 1 — the pure verbs directly (caps fizzle; each applies; copy deep-clone independence).
// =============================================================================
{
  const { min: FMIN, max: FMAX } = faceCaps();
  ok(FMIN === 2 && FMAX === 4, `faceCaps reads NUMBERS.faces (min ${FMIN} / max ${FMAX})`);

  // caps fizzle (no-op)
  const die4 = { faces: [F('body'), F('mind'), F('spirit'), F('body')] };
  ok(graftFace(die4, 'body', []) === false && die4.faces.length === 4, 'graft fizzles at max (no-op)');
  ok(cursedGraft(die4, []) === false && die4.faces.length === 4, 'cursed_graft fizzles at max (no-op)');
  ok(copyEtchFace(die4, die4.faces[0], []) === false && die4.faces.length === 4, 'copy fizzles at max (no-op)');
  const die2 = { faces: [F('body'), F('mind')] };
  ok(exciseFace(die2, die2.faces[0], []) === -1 && die2.faces.length === 2, 'excise fizzles at min (no-op)');

  // each applies below max / above min
  const g = { faces: [F('body'), F('mind'), F('spirit')] };
  ok(graftFace(g, 'mind', []) === true && g.faces.length === 4 && g.faces[3].symbol === 'mind' && g.faces[3].mag === 1, 'graft pushes a plain colour face {symbol,mag:1}');
  const cg = { faces: [F('body'), F('mind'), F('spirit')] };
  ok(cursedGraft(cg, []) === true && cg.faces[3].symbol === 'fang' && cg.faces[3].mag === 1 && !('isWild' in cg.faces[3]),
     'cursed_graft pushes a fang face matching the native shape (no isWild ON the face — it lives on the symbol)');
  const ex = { faces: [F('body'), F('mind'), F('spirit')] };
  ok(exciseFace(ex, ex.faces[1], []) === 1 && ex.faces.length === 2 && !ex.faces.some(f => f.symbol === 'mind'), 'excise removes the chosen face (drum reshapes shorter)');

  // copy-etch DEEP-CLONE independence: the twin's symbol/mag AND ench are independent instances.
  const src = { faces: [{ symbol: 'body', mag: 2, state: 'live',
    ench: [{ effect: 'ward', name: 'W', trigger: 'on_roll', scope: 'self', forced: true, params: { count: 1 } }] }] };
  copyEtchFace(src, src.faces[0], []);
  const orig = src.faces[0], twin = src.faces[1];
  ok(twin.symbol === 'body' && twin.mag === 2, 'copy: twin duplicates symbol + mag');
  ok(twin.ench && twin.ench !== orig.ench, 'copy: twin ench is a DISTINCT array');
  ok(twin.ench[0] && twin.ench[0] !== orig.ench[0], 'copy: twin ench object is a DISTINCT instance');
  ok(twin.ench[0].params && twin.ench[0].params !== orig.ench[0].params, 'copy: twin ench params is a distinct object');
  twin.ench[0].params.count = 99;   // mutate the twin's ench
  twin.ench.splice(0, 1);           // consume the twin's ward
  ok(orig.ench.length === 1 && orig.ench[0].params.count === 1, 'copy: consuming/mutating the twin ench leaves the original UNTOUCHED');

  // fixFaceIndex — the pure deterministic index-repair rule
  ok(fixFaceIndex(2, 2) === 0 && fixFaceIndex(0, 0) === 0, 'fixFaceIndex: the removed face itself clamps to 0');
  ok(fixFaceIndex(3, 1) === 2 && fixFaceIndex(2, 0) === 1, 'fixFaceIndex: a face above the removed one decrements');
  ok(fixFaceIndex(1, 2) === 1 && fixFaceIndex(0, 3) === 0, 'fixFaceIndex: a face below the removed one is unchanged');
}

// =============================================================================
// PART 2 — each verb through the REAL session (acquire from the ladder, apply targeted).
// =============================================================================
{
  const g = reachVerb('graft', 'graft_face');
  ok(!!g, 'graft: reached a perk holding a Graft card');
  if (g){
    const before = g.st.hand[1].faces.length;
    const r = act({ type: 'perk', card: g.card.card, die: 1, to: 'spirit' });
    ok(r.state.hand[1].faces.length === before + 1 && r.state.hand[1].faces.at(-1).symbol === 'spirit',
       'graft: {die:1,to:spirit} pushes a spirit face onto die 1');
  }

  const c = reachVerb('copy', 'copy_etch');
  ok(!!c, 'copy: reached a perk holding a Twin Etch card');
  if (c){
    const src = c.st.hand[0].faces[0];
    const r = act({ type: 'perk', card: c.card.card, die: 0, face: 0 });
    const faces = r.state.hand[0].faces;
    ok(faces.length === c.st.hand[0].faces.length + 1 && faces.at(-1).symbol === src.symbol && faces.at(-1).mag === src.mag,
       'copy: {die:0,face:0} twins that face onto the same drum');
  }

  const e = reachVerb('excise', 'excise_face');
  ok(!!e, 'excise: reached a perk holding an Excise card');
  if (e){
    const before = e.st.hand[0].faces.length, sym0 = e.st.hand[0].faces[0].symbol;
    const r = act({ type: 'perk', card: e.card.card, die: 0, face: 0 });
    ok(r.state.hand[0].faces.length === before - 1, 'excise: {die:0,face:0} removes a face (drum reshapes shorter)');
  }

  const cg = reachVerb('cursed_graft', 'cursed_graft');
  ok(!!cg, 'cursed_graft: reached a perk holding a Fang Graft card');
  if (cg){
    const before = cg.st.hand[2].faces.length;
    const r = act({ type: 'perk', card: cg.card.card, die: 2 });
    ok(r.state.hand[2].faces.length === before + 1 && r.state.hand[2].faces.at(-1).symbol === 'fang',
       'cursed_graft: {die:2} pushes a fang face onto die 2');
  }
}

// =============================================================================
// PART 3 — legalActions enumerates the targeting variants + the bare auto pick.
// =============================================================================
{
  const g = reachVerb('graft', 'graft_face');
  if (g){
    const L = legalActions().filter(x => x.type === 'perk' && x.args && x.args.card === g.card.card);
    const withArgs = L.filter(x => x.args.die != null && x.args.to != null);
    const bare = L.filter(x => x.args.die == null);
    ok(withArgs.length === 6 * 3 && bare.length === 1, `graft: enumerates dice-below-max × 3 colours (${withArgs.length}) + 1 bare`);
    ok(withArgs.every(x => COLOUR_IDS.includes(x.args.to)), 'graft: every targeted variant names a colour `to`');
  }
  const cg = reachVerb('cursed_graft', 'cursed_graft');
  if (cg){
    const L = legalActions().filter(x => x.type === 'perk' && x.args && x.args.card === cg.card.card);
    const withDie = L.filter(x => x.args.die != null), bare = L.filter(x => x.args.die == null);
    ok(withDie.length === 6 && withDie.every(x => x.args.to == null && x.args.face == null) && bare.length === 1,
       `cursed_graft: enumerates dice-below-max (${withDie.length}, no colour/face) + 1 bare`);
  }
  const c = reachVerb('copy', 'copy_etch');
  if (c){
    const L = legalActions().filter(x => x.type === 'perk' && x.args && x.args.card === c.card.card);
    ok(L.filter(x => x.args.face != null).length === 6 * 3 && L.filter(x => x.args.die == null).length === 1,
       'copy: enumerates a variant per legal face (6×3) + 1 bare');
  }
  const e = reachVerb('excise', 'excise_face');
  if (e){
    const L = legalActions().filter(x => x.type === 'perk' && x.args && x.args.card === e.card.card);
    ok(L.filter(x => x.args.face != null).length === 6 * 3 && L.filter(x => x.args.die == null).length === 1,
       'excise: enumerates a variant per legal face (6×3) + 1 bare');
  }
}

// =============================================================================
// PART 4 — bare auto picks resolve DETERMINISTICALLY (same seed + same actions ⇒ same hand).
// =============================================================================
{
  const barePick = (effect, keep, seed) => {
    const { st } = playToPerkTray(seed, trimFor(keep));
    if (!st) return null;
    const card = (st.perkOffer || []).find(c => c.boon && c.boon.effect === effect);
    if (!card) return null;
    return faceSig(act({ type: 'perk', card: card.card }).state);   // BARE auto pick
  };
  for (const [effect, keep] of [['graft', 'graft_face'], ['copy', 'copy_etch'], ['excise', 'excise_face'], ['cursed_graft', 'cursed_graft']]){
    let sd = null; for (let seed = 1; seed <= 120 && sd == null; seed++) if (barePick(effect, keep, seed)) sd = seed;
    ok(sd != null, `${effect}: reached a bare-pick seed`);
    if (sd != null){
      const a = barePick(effect, keep, sd), b = barePick(effect, keep, sd);
      ok(a === b, `${effect}: the bare auto pick is deterministic (same seed ⇒ identical hand)`);
    }
  }
}

// =============================================================================
// PART 5 — excise index integrity (shown-face clamp + event; below-shown decrement; peek void).
// =============================================================================
{
  // shown-face fell: excise the die's currently-SHOWN face → clamp + a "shown face fell" event.
  let done = false;
  for (let seed = 1; seed <= 200 && !done; seed++){
    const { st, preTray } = playToPerkTray(seed, trimFor('excise_face'));
    if (!st || !preTray) continue;
    const card = (st.perkOffer || []).find(c => c.boon && c.boon.effect === 'excise');
    if (!card) continue;
    const D = preTray[0].i, SF = preTray[0].fi;   // die 0's shown face index
    done = true;
    const r = act({ type: 'perk', card: card.card, die: D, face: SF });
    ok(r.events.some(e => new RegExp(`die ${D}'s shown face fell`).test(e)),
       'excise the SHOWN face → the tray clamps to face 0 with a "shown face fell" event');
  }
  ok(done, 'excise index: reached a perk with an excise card (shown-face path)');

  // below-shown: excise a face BELOW the shown one → shown unchanged (no "fell" event), just decrement.
  let done2 = false;
  for (let seed = 1; seed <= 400 && !done2; seed++){
    const { st, preTray } = playToPerkTray(seed, trimFor('excise_face'));
    if (!st || !preTray) continue;
    const card = (st.perkOffer || []).find(c => c.boon && c.boon.effect === 'excise');
    if (!card) continue;
    const die = preTray.find(t => t.fi >= 1);   // a die whose shown face is NOT index 0
    if (!die) continue;
    done2 = true;
    const r = act({ type: 'perk', card: card.card, die: die.i, face: die.fi - 1 });
    ok(!r.events.some(e => /shown face fell/.test(e)), 'excise a face BELOW the shown one → shown face unchanged (no "fell" event)');
    ok(r.events.some(e => /is excised/.test(e)), 'excise below-shown still removes the face');
  }
  ok(done2, 'excise index: reached a die showing face index ≥ 1 (below-shown path)');

  // peek void: a queued Augur peek on the excised die is cleared, with an event.
  let done3 = false;
  for (let seed = 1; seed <= 400 && !done3; seed++){
    configure({ sigil: 'expose' });   // etch an on_roll expose (peek) sigil onto all of die 0's faces
    let r = act({ type: 'new_run', seed, ...trimFor('excise_face') });
    let st = r.state, guard = 0, peeked = false;
    while (!st.over && guard++ < 40){
      if (st.phase !== 'segment') break;
      if ((st.spinsTaken || 0) === 0){ st = act({ type: 'spin' }).state; continue; }
      const sig = (st.sigils || []).find(s => s.di === 0 && s.effect === 'expose');
      const die0loose = st.tray.find(t => t.i === 0 && !t.kept && !t.locked && t.symbol !== 'blank');
      if (sig && die0loose && (st.metNow || []).length > 0){
        st = act({ type: 'sigil', di: 0 }).state;         // PEEK die 0 (do not consume it)
        peeked = (st.peeks || []).some(p => p.di === 0);
        st = act({ type: 'resolve' }).state;              // resolve WITHOUT re-throwing die 0 ⇒ the peek survives into perk
        if (st.phase === 'perk' && peeked){
          const card = (st.perkOffer || []).find(c => c.boon && c.boon.effect === 'excise');
          if (card){
            done3 = true;
            const rr = act({ type: 'perk', card: card.card, die: 0, face: 0 });   // excise die 0 → void its peek
            ok(rr.events.some(e => /voids die 0's pending peek/.test(e)),
               'excise a die with a queued peek → the peek is voided (event)');
          }
        }
        break;
      }
      const target = [...st.rungs].filter(x => x.req).sort((a, b) => (b.reach_estimate || 0) - (a.reach_estimate || 0))[0];
      const need = { ...(target ? target.req : {}) };
      for (const t of st.tray) if (t.kept && need[t.symbol]) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag || 1));
      const kd = (st.tray || []).find(t => t.i !== 0 && !t.kept && !t.locked && t.symbol !== 'blank' && t.symbol !== 'fang' && (need[t.symbol] || 0) > 0);
      if (kd){ st = act({ type: 'keep', i: kd.i }).state; continue; }
      if ((st.rollsLeft || 0) > 0){ st = act({ type: 'spin' }).state; continue; }
      break;
    }
  }
  configure({});
  ok(done3, 'excise index: reached a perk with a live peek on the excised die (peek-void path)');
}

// =============================================================================
// PART 6 — ladder gating: cards present per-flag; pool byte-identical all-off; cursed_graft never ridered.
// =============================================================================
{
  const FACE_IDS = ['graft_face', 'copy_etch', 'excise_face', 'cursed_graft'];
  const sweepIds = () => { const seen = new Set();
    for (const tier of ['floor', 'true', 'bloom']) for (let s = 1; s <= 300; s++){
      const d = drawLadder({ tier, metTiers: [tier] }, makeRng(s * 13 + 1));
      for (const c of d.cards) if (c.boon && c.boon.id) seen.add(c.boon.id);
    } return seen; };

  clearBalanceOverrides(); setDisabledContent([]);   // faces family default ON; clear the trim left by the session tests
  const onSeen = sweepIds();
  ok(FACE_IDS.every(id => onSeen.has(id)), 'ladder: faces ON ⇒ every face card is offered by drawLadder');

  // cursed_graft is NEVER ridered, even when it lands in a ridered draw (the fang IS the price).
  let cgSeen = false, cgClean = true;
  for (const tier of ['floor', 'true', 'bloom']) for (let s = 1; s <= 300; s++){
    const d = drawLadder({ tier, metTiers: [tier] }, makeRng(s * 13 + 1));
    for (const c of d.cards) if (c.boon && c.boon.id === 'cursed_graft'){ cgSeen = true; if (c.blemished || c.rider) cgClean = false; }
  }
  ok(cgSeen && cgClean, 'ladder: cursed_graft is NEVER ridered (blemished:false, no rider — always)');
  // per-leaf gating: master on but a single leaf off ⇒ only that card vanishes.
  setBalanceOverrides({ 'faces.excise': false });
  const noExcise = sweepIds();
  ok(!noExcise.has('excise_face') && noExcise.has('graft_face'), 'ladder: a single leaf off (faces.excise) drops ONLY that card');

  setBalanceOverrides({ 'faces.enabled': false });
  const offSeen = sweepIds();
  ok(FACE_IDS.every(id => !offSeen.has(id)), 'ladder: faces master OFF ⇒ NO face card offered (pool byte-identical to pre-D1)');
  clearBalanceOverrides();
}

// =============================================================================
// PART 7 — a ridered face card (graft/copy/excise) carries a rider under the Station Rule.
// =============================================================================
{
  // witnesses off but riders ON (extraBalance overrides the trim's rider-off) ⇒ a graft card is ridered.
  // §D3 pin pureRiders OFF: this test isolates the Station-Rule rider (D1), not the D3 pure-ink lottery —
  // with pure riders on, an uncommon graft has a 15% chance to ship clean, which would flake this assertion.
  let found = null;
  for (let seed = 1; seed <= 200 && !found; seed++){
    const { st } = playToPerkTray(seed, trimFor('graft_face', { 'rewardLadder.blemishRiders': true, 'rewardLadder.pureRiders': false }));
    if (st){ const card = (st.perkOffer || []).find(c => c.boon && c.boon.effect === 'graft'); if (card) found = card; }
  }
  ok(!!found, 'rider: reached a Graft card with riders on');
  if (found) ok(found.blemished === true && !!found.rider && !!found.rider.band, 'rider: a graft card is blemished + carries a rider band (Station Rule)');
}

clearBalanceOverrides(); setDisabledContent([]); configure({});
console.log(`\nface economy: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
