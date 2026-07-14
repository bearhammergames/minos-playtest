// =============================================================================
// ENCHANT TARGET TEST  (greybox feedback Change 3 — ladder enchant cards target a chosen face)
// -----------------------------------------------------------------------------
// Drives the REAL session core. A Reward-Ladder ENCHANT card (respin_sigil etc.) now etches onto
// a CHOSEN face (deepen-style {die,face}) instead of a random one; a BARE pick keeps EXACTLY the
// old random etch (rng draw and all) so simple drivers never wedge and old records replay. Covers:
//   • legalActions enumerates one {card,id,die,face} per legal face + the bare auto pick;
//   • an explicit {die,face} etches THAT exact face (verify the ench sits there, nowhere else);
//   • a bare pick still etches (randomly) and replays byte-identically (rng-stable);
//   • deepen's existing {die,face} flow is unchanged (a control).
// The trim substrate forces the reach pool to a single enchant (or deepen) card so the perk offer
// is deterministic — witnesses off (draft slots degrade to reach) + riders off (no rider ench
// pollutes the "only the chosen face changed" assertion). Not a KNOWN_FAIL — a design gate.
// =============================================================================
import { newRun, act, serializeState, legalActions } from '../session.mjs';
import { clearBalanceOverrides, setDisabledContent } from '../../engine/balance.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };

// Every reach boon EXCEPT the one we want to force (so the reach pool collapses to it). Combined
// with witnesses OFF (draft slots become reach) + riders OFF, every drawn card is that one boon.
const ALL_REACH = ['reweave', 'deepen', 'respin_sigil', 'flanking_sigil', 'wild_sigil', 'spinwrights_sigil',
  'open_hand', 'carvers_sigil', 'ward_sigil', 'augurs_sigil', 'echo_sigil',
  'shift_bane', 'scour', 'absolve',   // §D2 the debt cards are default-on reach cards — trim them out too so the pool collapses to `keep`
  'grinning_bargain', 'seers_bargain', 'louts_bargain'];   // §D3 the bargain cards are default-on reach cards — trim them too
const trimFor = keep => ({
  // §D1 also turn the ⚖3.2 face family OFF so the four face cards don't pollute the collapsed reach pool.
  balance: { 'witnesses.enabled': false, 'rewardLadder.blemishRiders': false, 'faces.enabled': false },
  disabledContent: ALL_REACH.filter(id => id !== keep),
});

// play the clean floor policy until the FIRST perk phase; return that state (or null on run-end).
function playToPerk(seed, opts){
  let st = act({ type: 'new_run', seed, ...opts }).state, guard = 0;
  while (!st.over && guard++ < 80){
    if (st.phase === 'perk') return st;
    if (st.phase === 'transform'){ st = act({ type: 'transform', skip: true }).state; continue; }
    if (st.phase === 'stitch'){ st = act({ type: 'stitch' }).state; continue; }
    if (st.phase === 'segment' || st.phase === 'knot'){
      if ((st.spinsTaken || 0) === 0){ st = act({ type: 'spin' }).state; continue; }
      const target = [...st.rungs].filter(x => x.req).sort((a, b) => (b.reach_estimate || 0) - (a.reach_estimate || 0))[0];
      const need = { ...(target ? target.req : {}) };
      for (const t of st.tray) if (t.kept && need[t.symbol]) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag || 1));
      const kd = (st.tray || []).find(t => !t.kept && !t.locked && t.symbol !== 'blank' && t.symbol !== 'fang' && (need[t.symbol] || 0) > 0);
      if (kd){ st = act({ type: 'keep', i: kd.i }).state; continue; }
      if ((st.metNow || []).length > 0 || (st.rollsLeft || 0) <= 0){ st = act({ type: 'resolve' }).state; continue; }
      st = act({ type: 'spin' }).state; continue;
    }
    break;
  }
  return null;
}
const totalEnch = st => st.hand.reduce((n, d) => n + d.faces.reduce((m, f) => m + ((f.ench || []).length), 0), 0);

// =============================================================================
// ENCHANT TARGETING — explicit {die,face} etches THAT face; legalActions enumerates the variants
// =============================================================================
{
  const ENCH = trimFor('respin_sigil');
  let done = false;
  for (let seed = 1; seed <= 120 && !done; seed++){
    const st = playToPerk(seed, ENCH);
    if (!st) continue;
    const card = (st.perkOffer || []).find(c => c.boon && c.boon.effect === 'enchant');
    if (!card) continue;
    done = true;
    // the perk card exposes its boon effect so a client can pick the "Etch a face" label
    ok(card.boon.effect === 'enchant', 'enchant targeting: the perk card surfaces boon.effect === "enchant"');
    // legalActions enumerates one {card,id,die,face} per face (6 dice × 3 faces = 18) + a bare pick
    const legal = legalActions().filter(x => x.type === 'perk' && x.args && x.args.card === card.card);
    const withFace = legal.filter(x => x.args.die != null && x.args.face != null);
    const bare = legal.filter(x => x.args.die == null);
    ok(withFace.length === 18, `enchant targeting: legalActions enumerates a variant per legal face (got ${withFace.length}, expected 18)`);
    ok(bare.length === 1, 'enchant targeting: legalActions still offers the bare auto pick');
    ok(totalEnch(st) === 0, 'enchant targeting: the hand is enchant-free before the pick (riders off)');
    // pick a SPECIFIC face and verify the ench lands on THAT exact face, nowhere else
    const D = 3, F = 1;
    const r = act({ type: 'perk', card: card.card, die: D, face: F });
    const face = r.state.hand[D].faces[F];
    ok((face.ench || []).some(e => e.effect === 'reroll'), `enchant targeting: the explicit {die:${D},face:${F}} etch lands on THAT exact face`);
    ok(totalEnch(r.state) === 1, 'enchant targeting: exactly ONE ench landed — only the chosen face (no random spillover)');
  }
  ok(done, 'enchant targeting: reached a perk with an enchant card to target');
}

// =============================================================================
// BARE PICK — still etches randomly (rng draw and all) AND replays byte-identically
// =============================================================================
{
  const ENCH = trimFor('respin_sigil');
  const barePick = seed => {
    const st = playToPerk(seed, ENCH);
    if (!st) return null;
    const card = (st.perkOffer || []).find(c => c.boon && c.boon.effect === 'enchant');
    if (!card) return null;
    return act({ type: 'perk', card: card.card }).state;   // NO die/face → the old random etch
  };
  let seedGood = null;
  for (let seed = 1; seed <= 120 && seedGood == null; seed++) if (barePick(seed)) seedGood = seed;
  ok(seedGood != null, 'enchant targeting: a bare-pick seed was reached');
  if (seedGood != null){
    const s1 = barePick(seedGood);
    ok(totalEnch(s1) === 1, `enchant targeting: a BARE pick still etches (randomly) — one ench landed (total=${totalEnch(s1)})`);
    const sig = s => s.hand.map((d, di) => d.faces.map((f, fi) => `${di}:${fi}:${(f.ench || []).length}`).join('|')).join(',');
    const s2 = barePick(seedGood);
    ok(sig(s1) === sig(s2), 'enchant targeting: the bare (random) etch replays byte-identically (rng-stable — old records replay)');
  }
}

// =============================================================================
// DEEPEN — the existing {die,face} flow is unchanged (a control)
// =============================================================================
{
  const DEEP = trimFor('deepen');
  let done = false;
  for (let seed = 1; seed <= 120 && !done; seed++){
    const st = playToPerk(seed, DEEP);
    if (!st) continue;
    const card = (st.perkOffer || []).find(c => c.boon && c.boon.effect === 'pip');
    if (!card) continue;
    const legal = legalActions().filter(x => x.type === 'perk' && x.args && x.args.card === card.card && x.args.die != null);
    if (!legal.length) continue;
    done = true;
    const D = legal[0].args.die, F = legal[0].args.face;
    const magBefore = st.hand[D].faces[F].mag;
    const r = act({ type: 'perk', card: card.card, die: D, face: F });
    ok(r.state.hand[D].faces[F].mag === magBefore + 1, `deepen: explicit {die:${D},face:${F}} deepens that face (${magBefore}→${magBefore + 1}) — flow unchanged`);
  }
  ok(done, 'deepen: reached a perk with a deepen card + a deepenable face');
}

clearBalanceOverrides(); setDisabledContent([]);
console.log(`\nenchant_target: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
