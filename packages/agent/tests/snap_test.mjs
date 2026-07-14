// snap_test.mjs — SNAP now ENDS the run. The post-snap knot is retired as a default (audit 2.3: the
// consolation "reads as punishment" → it becomes a future SNAP RELIC; the knot machinery is kept
// dormant). The STITCH (the pre-snap "one more bet", audit 1.5) still precedes the snap. This freezes:
//   • snap is legal only in the stitch phase,
//   • it ENDS the run (phase 'done', over:true, a score, and NO knot),
//   • a recorded stream containing a snap replays byte-for-byte.
import { act, legalActions, configure } from '../session.mjs';
configure({});

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };
const resultOf = st => ({ score: st.score, segments: st.thread.length,
  knot: st.knot ? (st.knot.hit ? (st.knot.tight ? 'tight' : 'tied') : 'slip') : null, stitches: st.stitchSaves });

// Drive a seed to a stitch offer (spin, keep nothing, resolve with loose dice), then snap.
function toStitch(seed){ act({ type: 'new_run', seed }); act({ type: 'spin' }); return act({ type: 'resolve' }).state; }

const st = toStitch(16838);
ok(st.phase === 'stitch', `reaches the stitch phase (got ${st.phase})`);
ok(legalActions().some(x => x.type === 'snap'), 'snap is legal in the stitch phase');

const r = act({ type: 'snap' });
ok(r.ok === true, 'snap is accepted by act()');
ok(r.state.over === true && r.state.phase === 'done', `snap ENDS the run (over + phase 'done'; got over=${r.state.over} phase=${r.state.phase})`);
ok(!r.state.knot, 'a snap-ended run carries no knot (the consolation is gone)');
ok(typeof r.state.score === 'number', 'a snap-ended run is scored');

// snap outside the stitch phase is rejected (the run is over now — only new_run is legal)
const bad = act({ type: 'snap' });
ok(bad.ok === false, 'snap after the run is over fails');

// Replay contract: a stream that snaps replays to the same result. Records EVERY protocol action.
function playSnapRun(seed){
  const actions = [];
  let st = act({ type: 'new_run', seed }).state;
  const step = a => { const rr = act(a); if (rr.ok !== false) actions.push(a); return rr.state; };
  let guard = 0;
  while (!st.over && guard++ < 60){
    if (st.phase === 'segment' || st.phase === 'knot') st = (st.spinsTaken || 0) === 0 ? step({ type: 'spin' }) : step({ type: 'resolve' });
    else if (st.phase === 'stitch') st = step({ type: 'snap' });
    else if (st.phase === 'perk') st = step({ type: 'perk', card: 0 });
    else if (st.phase === 'transform') st = step({ type: 'transform', skip: true });
    else break;
  }
  return { actions, result: resultOf(st) };
}
const rec = playSnapRun(16838);
ok(rec.actions.some(a => a.type === 'snap'), 'the recorded stream contains a snap');
act({ type: 'new_run', seed: 16838 });
let rp; for (const a of rec.actions) rp = act(a).state;
ok(JSON.stringify(resultOf(rp)) === JSON.stringify(rec.result), `a snap run replays byte-for-byte (${JSON.stringify(rec.result)})`);

console.log(`\nsnap: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
