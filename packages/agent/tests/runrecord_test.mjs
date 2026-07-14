// runrecord_test.mjs — the Run Record contract (Minos_RunRecord_v1.md), the LOCKED Phase-D
// acceptance property: a recorded action stream (source-agnostic — the web client records the
// SAME act() inputs) replays to the SAME result. Both the client and the CLI drive session.mjs,
// so this holds by construction; the test freezes it as a gate. Headless (imports session.mjs).
import { newRun, act, configure } from '../session.mjs';
configure({});

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };
const resultOf = st => ({ score: st.score, segments: st.thread.length,
  knot: st.knot ? (st.knot.hit ? (st.knot.tight ? 'tight' : 'tied') : 'slip') : null, stitches: st.stitchSaves });
const REPLAYABLE = new Set(['spin', 'keep', 'resolve', 'stitch', 'snap', 'perk', 'transform', 'sigil']);

// play a run, recording exactly the protocol actions a client would (new_run excluded — the
// seed captures it). A modest "keep toward the best rung, resolve when met" policy.
function playAndRecord(seed){
  const actions = [];
  let r = act({ type: 'new_run', seed }); let st = r.state, guard = 0;
  while (!st.over && guard++ < 1500){
    let a;
    if (st.phase === 'perk') a = { type: 'perk', card: 0 };
    else if (st.phase === 'transform') a = { type: 'transform', skip: true };
    else if (st.phase === 'stitch') a = { type: 'stitch' };
    else if (st.phase === 'segment' || st.phase === 'knot'){
      if ((st.spinsTaken || 0) === 0) a = { type: 'spin' };
      else {
        const target = [...st.rungs].sort((x, y) => (y.reach_estimate || 0) - (x.reach_estimate || 0))[0];
        const need = { ...target.req };
        for (const t of st.tray) if (t.kept && need[t.symbol]) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag || 1));
        const kd = (st.tray || []).find(t => !t.kept && !t.locked && t.symbol !== 'blank' && t.symbol !== 'fang' && (need[t.symbol] || 0) > 0);
        if (kd) a = { type: 'keep', i: kd.i };
        else if ((st.metNow || []).length > 0 || (st.rollsLeft || 0) <= 0) a = { type: 'resolve' };
        else a = { type: 'spin' };
      }
    } else break;
    r = act(a); if (r.ok !== false) actions.push(a); st = r.state;
  }
  return { actions, result: resultOf(st) };
}
// replay a recorded action stream on a fresh run of the SAME seed.
function replay(seed, actions){
  act({ type: 'new_run', seed });
  let st;
  for (const a of actions){ const r = act(a); st = r.state; }
  return resultOf(st);
}

for (const seed of [1, 42, 1000, 20260706, 8919, 64352]){
  const { actions, result } = playAndRecord(seed);
  ok(actions.every(a => REPLAYABLE.has(a.type)), `seed ${seed}: only replayable protocol actions recorded`);
  const rr = replay(seed, actions);
  ok(JSON.stringify(result) === JSON.stringify(rr), `seed ${seed}: record replays to the same result (${JSON.stringify(result)} vs ${JSON.stringify(rr)})`);
  // and again — determinism of the replay itself
  ok(JSON.stringify(replay(seed, actions)) === JSON.stringify(rr), `seed ${seed}: replay is itself deterministic`);
}

console.log(`\nrunrecord: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
