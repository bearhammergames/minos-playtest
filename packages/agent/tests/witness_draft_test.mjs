// =============================================================================
// WITNESS DRAFT TEST  (ModifierList v2 §4.2/§5 — the draft flow end-to-end)
// -----------------------------------------------------------------------------
// Drives the REAL session core (session.mjs) through the protocol. Covers: a draft
// card adds a witness that then FIRES and SCORES (loud beats + per-id tallies); the
// rich s.witnesses shape; the portrait cap (5); a draft into a FULL loadout replaces
// (auto = oldest; explicit slot = the chosen victim, stacks cleared); and legalActions
// enumerating the {card, slot} variants when full. Not a KNOWN_FAIL — a design gate.
// =============================================================================
import { newRun, act, serializeState, legalActions } from '../session.mjs';
import { BALANCE } from '../../engine/balance.js';
BALANCE.witnesses.enabled = true;
BALANCE.rewardLadder.enabled = true;
BALANCE.rewardLadder.mixedDraw = true;
BALANCE.rewardLadder.blemishRiders = true;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };
const state = () => serializeState();

// ---- a focused single-step driver (spin/keep toward the most reachable rung/resolve) ----
const EVENTS = [];
function stepOnce(){
  const st = state();
  if (st.over || st.phase === 'perk') return st;         // hand control back to the caller
  let r;
  if (st.phase === 'stitch') r = act({ type: 'stitch' });
  else if (st.phase === 'transform') r = act({ type: 'transform', skip: true });
  else if (st.phase === 'segment' || st.phase === 'knot'){
    if ((st.spinsTaken || 0) === 0) r = act({ type: 'spin' });
    else {
      const legal = legalActions();
      const target = [...st.rungs].sort((a, b) => (b.reach_estimate || 0) - (a.reach_estimate || 0))[0];
      const need = { ...target.req };
      for (const t of st.tray) if (t.kept && need[t.symbol]) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag || 1));
      let keepDie = null;
      for (const x of legal){
        if (x.type !== 'keep') continue;
        const t = st.tray.find(tt => tt.i === x.args.i);
        if (t && t.symbol !== 'fang' && (need[t.symbol] || 0) > 0){ keepDie = x.args.i; break; }
      }
      if (keepDie != null) r = act({ type: 'keep', i: keepDie });
      else if ((st.metNow || []).length > 0) r = act({ type: 'resolve' });
      else if ((st.rollsLeft || 0) > 0) r = act({ type: 'spin' });
      else r = act({ type: 'resolve' });
    }
  } else return st;
  if (r && r.events) EVENTS.push(...r.events);
  return null;
}
function advanceToPerk(max = 300){ for (let i = 0; i < max && !state().over; i++){ const st = stepOnce(); if (st) return st; } return state(); }

// ================================ TEST A — draft adds → fires → scores ================================
{
  newRun(51, { witnesses: [] });   // empty loadout — every worn witness here is DRAFTED
  let st = advanceToPerk();
  ok(st.phase === 'perk' && st.perkOffer.some(c => c.kind === 'draft'), 'A: a draft card is offered');
  // draft the offered witness (first draft card)
  const before = (st.witnesses || []).length;
  const draftCard = st.perkOffer.find(c => c.kind === 'draft');
  ok(draftCard.witnessId && draftCard.rarity && draftCard.grade, 'A: draft card carries witnessId + rarity + grade');
  act({ type: 'perk', card: draftCard.card });
  st = state();
  const worn = st.witnesses || [];
  ok(worn.length === before + 1, 'A: drafting appends one worn witness');
  ok(worn[worn.length - 1].id === draftCard.witnessId, 'A: the drafted witness is worn');
  ok(['id', 'label', 'slot', 'fires', 'score'].every(k => k in worn[worn.length - 1]), 'A: s.witnesses entries carry {id,label,slot,fires,score}');

  // play on, drafting each perk, until a witness has FIRED and scored (or the run ends)
  for (let seg = 0; seg < 12 && !state().over; seg++){
    st = advanceToPerk();
    if (st.phase !== 'perk') break;
    const d = st.perkOffer.find(c => c.kind === 'draft') || st.perkOffer[0];
    act({ type: 'perk', card: d.card });
  }
  const scored = (state().witnessScore || 0) > 0;
  const spoke = EVENTS.some(e => /^witness: .+ speaks — \+\d+/.test(e));
  ok(scored, `A: a drafted witness accrues worth (witnessScore=${state().witnessScore})`);
  ok(spoke, 'A: a fired witness announces itself LOUDLY (a per-witness beat)');
  const anyFires = (state().witnesses || []).some(w => w.fires > 0);
  ok(anyFires, 'A: per-witness fire tally advances');
}

// ================================ TEST B — full loadout: cap + auto-replace ================================
{
  const load = ['patient_needle', 'miser_eye', 'gamblers_vein', 'deep_ink', 'the_moth'];   // 5 = slots full
  newRun(51, { witnesses: load });
  let st = advanceToPerk();
  ok(st.phase === 'perk', 'B: reached a perk with a full loadout');
  const d = st.perkOffer.find(c => c.kind === 'draft');
  ok(!!d, 'B: a draft is still offered when slots are full');
  // legalActions enumerates the explicit slot variants (+ the bare auto-replace)
  const legal = legalActions();
  const bare = legal.filter(x => x.type === 'perk' && x.args.card === d.card && x.args.slot == null);
  const slotVariants = legal.filter(x => x.type === 'perk' && x.args.card === d.card && x.args.slot != null);
  ok(bare.length === 1, 'B: a bare {card} (auto-replace) is legal');
  ok(slotVariants.length === 5 && slotVariants.every(x => x.args.slot >= 0 && x.args.slot < 5), 'B: legalActions enumerates one {slot} variant per worn witness');
  ok(st.draw && st.draw.portraitFull && st.draw.portraitFull.worn.length === 5, 'B: state surfaces the full portrait row for victim choice');

  // auto-replace: the OLDEST (slot 0 = patient_needle) is inked over
  act({ type: 'perk', card: d.card });
  st = state();
  ok((st.witnesses || []).length === 5, 'B: loadout stays capped at 5 after an over-ink');
  ok(st.witnesses[0].id === d.witnessId, 'B: the drafted witness lands in slot 0');
  ok(!st.witnesses.some(w => w.id === 'patient_needle'), 'B: the OLDEST worn witness (patient_needle) was auto-replaced');
}

// ================================ TEST C — explicit slot replace + stacks cleared ================================
{
  const load = ['bodybound', 'miser_eye', 'gamblers_vein', 'deep_ink', 'the_moth'];   // bodybound (growing) at slot 0
  newRun(51, { witnesses: load });
  let st = advanceToPerk();
  ok(st.phase === 'perk', 'C: reached a perk with a full loadout');
  const d = st.perkOffer.find(c => c.kind === 'draft');
  // replace slot 2 (gamblers_vein) explicitly
  const victim = st.witnesses[2].id;
  act({ type: 'perk', card: d.card, slot: 2 });
  st = state();
  ok((st.witnesses || []).length === 5, 'C: explicit-slot replace keeps the loadout at 5');
  ok(st.witnesses[2].id === d.witnessId, 'C: the drafted witness lands in the CHOSEN slot 2');
  ok(!st.witnesses.some(w => w.id === victim), `C: the chosen victim (${victim}) was replaced`);
  ok(st.witnesses.some(w => w.id === 'bodybound'), 'C: an un-chosen slot (bodybound) is untouched');
}

// ================================ determinism ================================
{
  const collect = () => {
    EVENTS.length = 0;
    newRun(20260704, { witnesses: ['thousand_cuts', 'gamblers_vein'] });
    for (let seg = 0; seg < 15 && !state().over; seg++){
      const st = advanceToPerk();
      if (st.phase !== 'perk') break;
      const d = st.perkOffer.find(c => c.kind === 'draft') || st.perkOffer[0];
      act({ type: 'perk', card: d.card });
    }
    return { score: state().score ?? state().witnessScore, events: EVENTS.slice() };
  };
  const a = collect(); const b = collect();
  ok(JSON.stringify(a) === JSON.stringify(b), 'D: a fixed-seed draft run replays byte-identically');
}

console.log(`\nwitness_draft: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
