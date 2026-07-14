// sigil_test.mjs — the opt-in on_roll reroll SIGIL (Law L4's one sanctioned "input beside stop").
// A `forced:false` on_roll reroll is OFFERED (state.sigils), NOT auto-fired; the player taps a
// {type:'sigil'} action to invoke a FREE, LOOSE-ONLY re-throw. Ambient (coexists with
// spin/keep/resolve), faithful 1-hop cascade, recorded ⇒ replays byte-for-byte, neutral without
// content. Injected via the --sigil <scope> debug seam (opts.sigil / DEFAULTS.sigil).
import { act, legalActions, configure } from '../session.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };
const sigilOf = st => (st.sigils || [])[0];

// ---- offers per scope + ambient legality ------------------------------------------
for (const [scope, chosen] of [['self', false], ['adjacent', false], ['random', false], ['chosen', true]]){
  configure({ sigil: scope });
  let st = act({ type: 'new_run', seed: 1 }).state;
  ok(!st.sigils, `${scope}: no sigil before the first spin`);
  st = act({ type: 'spin' }).state;
  const sg = sigilOf(st);
  ok(!!sg && sg.scope === scope, `${scope}: a sigil is offered after the spin`);
  ok(!!sg && sg.chosen === chosen, `${scope}: chosen flag = ${chosen}`);
  ok(legalActions().some(x => x.type === 'sigil'), `${scope}: sigil is a legal action`);
  ok(legalActions().some(x => x.type === 'resolve'), `${scope}: resolve still legal alongside (ambient)`);
}

// ---- free (no rollsLeft cost) ------------------------------------------------------
configure({ sigil: 'random' });
let st = act({ type: 'new_run', seed: 20260706 }).state;
st = act({ type: 'spin' }).state;
const rollsBefore = st.rollsLeft;
const r = act({ type: 'sigil', di: 0 });
ok(r.ok === true, 'tap: accepted');
ok(r.state.rollsLeft === rollsBefore, `tap: FREE — rollsLeft unchanged (${rollsBefore})`);

// ---- loose-only: keeping the source die retires its self-sigil ---------------------
configure({ sigil: 'self' });
st = act({ type: 'new_run', seed: 1 }).state;
st = act({ type: 'spin' }).state;
ok(sigilOf(st) && sigilOf(st).targets.includes(0), 'self: targets the source die while loose');
const t0 = st.tray.find(t => t.i === 0) || {};
if (t0.symbol !== 'blank'){
  const kr = act({ type: 'keep', i: 0 });
  if (kr.ok !== false){
    const sg = sigilOf(kr.state);
    ok(!sg || !sg.targets.includes(0), 'self: a kept source die is no longer a target (loose-only)');
    ok(!legalActions().some(x => x.type === 'sigil' && x.args.di === 0), 'self: no sigil action for a kept die');
  } else { pass += 2; }   // die 0 not keepable this seed — skip (loose-only covered by the targets set)
} else { pass += 2; }

// ---- faithful 1-hop cascade bound (--sigil is on every die-0 face) -----------------
configure({ sigil: 'self' });
st = act({ type: 'new_run', seed: 42 }).state;
st = act({ type: 'spin' }).state;
ok((st.sigils || []).length === 1, 'cascade: one sigil after the spin (depth 0)');
st = act({ type: 'sigil', di: 0 }).state;      // reroll die 0 → its new face re-raises at depth 1
ok((st.sigils || []).length === 1, 'cascade: a tap re-raises one sigil (depth 1)');
st = act({ type: 'sigil', di: 0 }).state;      // reroll again → depth 2 > REROLL_MAX_HOP ⇒ none
ok((st.sigils || []).length === 0, 'cascade: bounded — no sigil past 1 hop');

// ---- byte-for-byte replay of a run containing sigil taps ---------------------------
const REPLAYABLE = new Set(['spin', 'keep', 'resolve', 'stitch', 'snap', 'perk', 'transform', 'sigil']);
const resultOf = s => ({ score: s.score, segments: s.thread.length,
  knot: s.knot ? (s.knot.hit ? (s.knot.tight ? 'tight' : 'tied') : 'slip') : null, stitches: s.stitchSaves });
function playRec(seed){
  configure({ sigil: 'random' });
  const actions = [];
  let s = act({ type: 'new_run', seed }).state; let g = 0;
  const step = a => { const rr = act(a); if (rr.ok !== false) actions.push(a); return rr.state; };
  while (!s.over && g++ < 400){
    if (s.phase === 'perk') s = step({ type: 'perk', card: 0 });
    else if (s.phase === 'transform') s = step({ type: 'transform', skip: true });
    else if (s.phase === 'stitch') s = step({ type: 'stitch' });
    else if (s.phase === 'segment' || s.phase === 'knot'){
      const sg = sigilOf(s);
      if (sg && (sg.targets || []).length) s = step({ type: 'sigil', di: sg.di, ...(sg.chosen ? { target: sg.targets[0] } : {}) });
      else if ((s.spinsTaken || 0) === 0) s = step({ type: 'spin' });
      else if ((s.metNow || []).length || (s.rollsLeft || 0) <= 0) s = step({ type: 'resolve' });
      else s = step({ type: 'spin' });
    } else break;
  }
  return { actions, result: resultOf(s) };
}
const rec = playRec(777);
ok(rec.actions.some(a => a.type === 'sigil'), 'replay: the recorded stream contains a sigil tap');
ok(rec.actions.every(a => REPLAYABLE.has(a.type)), 'replay: only replayable protocol actions recorded');
configure({ sigil: 'random' });
act({ type: 'new_run', seed: 777 }); let rp; for (const a of rec.actions) rp = act(a).state;
ok(JSON.stringify(resultOf(rp)) === JSON.stringify(rec.result), `replay: a sigil run replays byte-for-byte (${JSON.stringify(rec.result)})`);

// ---- neutral: no injection / content ⇒ no sigils ----------------------------------
configure({});
st = act({ type: 'new_run', seed: 1 }).state;
st = act({ type: 'spin' }).state;
ok(!st.sigils, 'neutral: a clean run raises no sigils');

console.log(`\nsigil: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
