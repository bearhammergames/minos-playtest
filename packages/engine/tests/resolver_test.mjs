// Unit + adversarial tests for the enchantment resolver core.
// Run: node _resolver_test.mjs   (exit 0 = pass)
import { resolveEnchantments, expireEnchantments, EFFECT_PHASE_RANK } from '../resolver.js';
import { validateEnchantment } from '../../content/enchantments.js';
import { FEVERED_COAL } from '../../content/faces.js';

let pass = 0, fail = 0;
function check(n, c) { if (c) { pass++; } else { fail++; console.error('  FAIL:', n); } }

// ---- snapshot builders ----
function unit(di, fi, seatId, shownSymbol, ench = [], extra = {}) {
  return { di, fi, seatId, shownSymbol, mag: 1, state: 'live', locked: false, wounded: false, kept: false, ench, ...extra };
}
function snap(moment, units, opts = {}) {
  const unitBySeat = {}; units.forEach(u => unitBySeat[u.seatId] = u);
  let neighborsBySeat = opts.neighborsBySeat;
  if (!neighborsBySeat) {                       // default: linear adjacency in seatId order
    const seats = units.map(u => u.seatId).slice().sort((a, b) => a - b);
    neighborsBySeat = {};
    seats.forEach((s, i) => { neighborsBySeat[s] = [seats[i - 1], seats[i + 1]].filter(x => x != null); });
  }
  return { moment, units, unitBySeat, neighborsBySeat, totals: opts.totals || {}, states: opts.states || {}, chosen: opts.chosen || null };
}
const ench = (o) => ({ polarity: 'boon', forced: false, condition: null, params: {}, ...o });
const act = (r) => r.actions;

// ---- no-op / empty ----
check('no ench => no actions', act(resolveEnchantments(snap('on_roll', [unit(0, 0, 0, 'body')]))).length === 0);
check('null snapshot safe', act(resolveEnchantments(null)).length === 0);

// ---- trigger filter ----
check('wrong-moment ench does not fire',
  act(resolveEnchantments(snap('on_roll', [unit(0, 0, 0, 'body', [ench({ trigger: 'on_keep', scope: 'self', effect: 'lock' })])]))).length === 0);

// ---- every effect emits an action (core is moment/effect-agnostic) ----
for (const eff of ['reroll', 'lock', 'release', 'convert', 'deepen', 'erode', 'render', 'ward', 'expose']) {
  const r = resolveEnchantments(snap('on_roll', [unit(0, 0, 0, 'body', [ench({ trigger: 'on_roll', scope: 'self', effect: eff, params: { pips: 1 } })])]));
  check(`effect ${eff} emits one self action`, r.actions.length === 1 && r.actions[0].effect === eff);
}

// ---- conditions ----
// adjacency: neighbor shows the required symbol
const adjEnch = [ench({ trigger: 'on_roll', scope: 'self', effect: 'convert', condition: { kind: 'adjacency', symbol: 'fang' }, params: { to: 'need' } })];
check('adjacency holds (neighbor shows fang)',
  act(resolveEnchantments(snap('on_roll', [unit(1, 0, 0, 'fang'), unit(0, 0, 1, 'spirit', adjEnch)]))).length === 1);
check('adjacency fails (no neighbor shows fang)',
  act(resolveEnchantments(snap('on_roll', [unit(1, 0, 0, 'body'), unit(0, 0, 1, 'spirit', adjEnch)]))).length === 0);
// total
const totEnch = [ench({ trigger: 'on_keep', scope: 'self', effect: 'lock', condition: { kind: 'total', symbol: 'body', n: 3 } })];
check('total holds (>=3)',  act(resolveEnchantments(snap('on_keep', [unit(0, 0, 0, 'body', totEnch)], { totals: { body: 3 } }))).length === 1);
check('total fails (<3)',   act(resolveEnchantments(snap('on_keep', [unit(0, 0, 0, 'body', totEnch)], { totals: { body: 2 } }))).length === 0);
// state
const pcEnch = [ench({ trigger: 'on_wound', scope: 'self', effect: 'ward', condition: { kind: 'state', state: 'pact_charged' } })];
check('state pact_charged holds', act(resolveEnchantments(snap('on_wound', [unit(0, 0, 0, 'spirit', pcEnch)], { states: { pact_charged: true } }))).length === 1);
check('state pact_charged fails', act(resolveEnchantments(snap('on_wound', [unit(0, 0, 0, 'spirit', pcEnch)], { states: { pact_charged: false } }))).length === 0);
check('state wounded (self) holds',
  act(resolveEnchantments(snap('on_wound', [unit(0, 0, 0, 'spirit', [ench({ trigger: 'on_wound', scope: 'self', effect: 'erode', condition: { kind: 'state', state: 'wounded' } })], { wounded: true })]))).length === 1);

// ---- scope ----
// adjacent: a middle face targets both neighbors
const adjReroll = [ench({ trigger: 'on_roll', scope: 'adjacent', effect: 'reroll', forced: true })];
const rAdj = resolveEnchantments(snap('on_roll', [unit(0, 0, 0, 'body'), unit(1, 0, 1, 'body', adjReroll), unit(2, 0, 2, 'body')]));
check('adjacent targets both neighbors', rAdj.actions.length === 2 && rAdj.actions.every(a => a.effect === 'reroll'));
check('adjacent targets are seats 0 and 2', new Set(rAdj.actions.map(a => a.target.seatId)).size === 2 && rAdj.actions.some(a => a.target.seatId === 0) && rAdj.actions.some(a => a.target.seatId === 2));
// row: targets every unit
const rowDeep = [ench({ trigger: 'on_resolve', scope: 'row', effect: 'deepen', forced: true, params: { pips: 1 } })];
check('row targets all 3', resolveEnchantments(snap('on_resolve', [unit(0, 0, 0, 's', rowDeep), unit(1, 0, 1, 's'), unit(2, 0, 2, 's')])).actions.length === 3);
// chosen
const chosenRel = [ench({ trigger: 'on_keep', scope: 'chosen', effect: 'release', forced: false })];
const target = unit(9, 0, 9, 'mind');
check('chosen with a choice => 1 action', resolveEnchantments(snap('on_keep', [unit(0, 0, 0, 'body', chosenRel), target], { chosen: target })).actions.length === 1);
check('chosen with NO choice => 0 actions (no-op)', resolveEnchantments(snap('on_keep', [unit(0, 0, 0, 'body', chosenRel)])).actions.length === 0);

// ---- phase-stack ordering (spec §5.2): release<reroll<convert<lock<deepen<ward ----
check('phase ranks ordered', EFFECT_PHASE_RANK.release < EFFECT_PHASE_RANK.reroll && EFFECT_PHASE_RANK.reroll < EFFECT_PHASE_RANK.convert && EFFECT_PHASE_RANK.convert < EFFECT_PHASE_RANK.lock && EFFECT_PHASE_RANK.lock < EFFECT_PHASE_RANK.deepen && EFFECT_PHASE_RANK.deepen < EFFECT_PHASE_RANK.ward);
const mixed = resolveEnchantments(snap('on_roll', [
  unit(0, 0, 0, 'body', [ench({ trigger: 'on_roll', scope: 'self', effect: 'lock', forced: true })]),
  unit(1, 0, 1, 'body', [ench({ trigger: 'on_roll', scope: 'self', effect: 'reroll', forced: true })]),
  unit(2, 0, 2, 'body', [ench({ trigger: 'on_roll', scope: 'self', effect: 'release', forced: true })]),
]));
check('actions sorted by phase (release, reroll, lock)',
  mixed.actions.map(a => a.effect).join(',') === 'release,reroll,lock');

// ---- fire-once: one ench targeting row counts as ONE firing (N target actions) ----
const fo = resolveEnchantments(snap('on_resolve', [unit(0, 0, 0, 's', rowDeep), unit(1, 0, 1, 's'), unit(2, 0, 2, 's')]));
check('fire-once: 3 target actions but firedCount === 1', fo.actions.length === 3 && fo.firedCount === 1);

// ---- adversarial loop: two mutually-triggering enchantments terminate in one pass ----
const loopA = [ench({ trigger: 'on_roll', scope: 'adjacent', effect: 'reroll', forced: true })];
const loopB = [ench({ trigger: 'on_roll', scope: 'adjacent', effect: 'reroll', forced: true })];
const loop = resolveEnchantments(snap('on_roll', [unit(0, 0, 0, 'body', loopA), unit(1, 0, 1, 'body', loopB)]));
check('mutual-trigger pair fires each once, no cascade', loop.firedCount === 2 && loop.actions.length === 2);

// ---- lifetime tagging ----
check('lifetime defaults to permanent',
  resolveEnchantments(snap('on_roll', [unit(0, 0, 0, 'b', [ench({ trigger: 'on_roll', scope: 'self', effect: 'convert' })])])).actions[0].lifetime === 'permanent');
check('lifetime carried through',
  resolveEnchantments(snap('on_keep', [unit(0, 0, 0, 'b', [ench({ trigger: 'on_keep', scope: 'self', effect: 'expose', lifetime: 'stage' })])])).actions[0].lifetime === 'stage');

// ---- expireEnchantments boundary sweep ----
const h = { dice: [
  { faces: [
    { symbol: 'body', ench: [ench({ trigger: 'on_roll', scope: 'self', effect: 'convert', lifetime: 'permanent' }), ench({ trigger: 'on_keep', scope: 'self', effect: 'lock', lifetime: 'encounter' })] },
    { symbol: 'spirit', ench: [ench({ trigger: 'on_keep', scope: 'self', effect: 'expose', lifetime: 'stage' })] },
  ] },
] };
const removed = expireEnchantments(h, 'encounter');
check('expire(encounter) removed exactly 1', removed === 1);
check('permanent survives encounter sweep', h.dice[0].faces[0].ench.length === 1 && h.dice[0].faces[0].ench[0].lifetime === 'permanent');
check('stage survives encounter sweep', h.dice[0].faces[1].ench.length === 1);
check('expire(stage) then removes the stage one', expireEnchantments(h, 'stage') === 1 && h.dice[0].faces[1].ench.length === 0);

// ---- PHASE 6: the Fevered Coal — the first real face-ench content (§9 "The Last Gift") ----
// The Coal's enchantment must be in-vocab, and at the on_wound moment it must deepen the
// ADJACENT die (a dying face passing strength down the row), NOT itself.
const coalEnch = FEVERED_COAL.ench[0];
check('Coal ench validates (in-vocab)', validateEnchantment(coalEnch).ok === true);
check('Coal ench is on_wound -> deepen adjacent (boon, forced, pips:1)',
  coalEnch.trigger==='on_wound' && coalEnch.scope==='adjacent' && coalEnch.effect==='deepen'
  && coalEnch.polarity==='boon' && coalEnch.forced===true && coalEnch.params.pips===1);
// the Coal at seat 1 is wounded; only ITS on_wound fires (the neighbors carry no ench),
// and it deepens both neighbors (seats 0 and 2) by 1 pip — never itself.
const coalFire = resolveEnchantments(snap('on_wound', [
  unit(0, 0, 0, 'spirit'),
  unit(1, 0, 1, 'spirit', [coalEnch], { wounded: true }),
  unit(2, 0, 2, 'spirit'),
]));
check('Coal on_wound fires once', coalFire.firedCount === 1);
check('Coal deepens the adjacent seats (0 and 2), not self (1)',
  coalFire.actions.length === 2 && coalFire.actions.every(a => a.effect==='deepen' && a.params.pips===1)
  && coalFire.actions.every(a => a.target.seatId !== 1)
  && coalFire.actions.some(a => a.target.seatId === 0) && coalFire.actions.some(a => a.target.seatId === 2));

console.log(`\nresolver core: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
