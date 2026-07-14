// unkeep_test.mjs — AMBIENT UN-KEEP (Bear verdict 2026-07-14): "any kept die can be clicked to
// release before resolving." A base protocol verb {type:'unkeep',i} (NOT ench-gated), sibling to
// the Open Hand `release` verb but unconditional (no etched face, no per-segment budget).
//
// Pins:
//   happy path            — keep → unkeep drops the die back to the pool; it rerolls next spin.
//   keepCap non-refund     — under a keepCap curse, unkeep frees the DIE, never the BUDGET (the
//                            cap's bite survives; keep→unkeep→re-keep cannot launder it).
//   forced / locked refusal— a forcedKeep die and a kept-then-locked die refuse unkeep (legal + act).
//   resolve semantics      — un-kept dice are EXCLUDED from the scoring pool (metNow shrinks), so
//                            unkeep at 0 rolls stays LEGAL (no rollsLeft gate) — dropping a profane
//                            keep flips a `pure` rung met, a real 0-roll line (proved via resolveSegment).
//   replay determinism     — a recorded stream containing unkeeps replays to the identical result.
//   release coexistence    — Open Hand `release` and ambient `unkeep` are distinct, both legal, coexist.
import { act, legalActions, configure } from '../session.mjs';
import { resolveSegment } from '../../engine/spellspun.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };
const E = o => ({ id: 't_' + (o.effect || o.trigger), condition: null, polarity: 'boon', forced: false,
  lifetime: 'permanent', cost: {}, params: {}, ...o });

// =============================================================================
// happy path — keep then unkeep; the die drops back to the loose pool (rerolls next spin).
// A base verb: no enchantments configured, no flags flipped.
// =============================================================================
{
  configure({});
  let r = act({ type: 'new_run', seed: 1, balance: {} });
  r = act({ type: 'spin' }); let s = r.state;
  const d = s.tray.find(t => !t.kept && !t.locked && t.symbol !== 'blank');
  ok(!!d, 'happy: a loose die is available to keep');
  ok(!legalActions().some(x => x.type === 'unkeep'), 'happy: no unkeep offered before any die is kept');
  r = act({ type: 'keep', i: d.i }); s = r.state;
  ok(s.tray.find(t => t.i === d.i).kept === true, `happy: die ${d.i} is kept`);
  ok(legalActions().some(x => x.type === 'unkeep' && x.args.i === d.i), 'happy: unkeep becomes legal for the kept die');
  r = act({ type: 'unkeep', i: d.i }); s = r.state;
  ok(r.ok !== false, 'happy: unkeep succeeds');
  ok(s.tray.find(t => t.i === d.i).kept === false, `happy: die ${d.i} is un-kept (back to the pool)`);
  ok(r.events.some(e => /unkept die/.test(e)), 'happy: the action narrates a log line (pushEvents)');
  // re-keepable, and it rerolls with the next spin (loose again)
  ok(legalActions().some(x => x.type === 'keep' && x.args.i === d.i), 'happy: the un-kept die is keepable again');
  const before = s.tray.find(t => t.i === d.i).fi;
  r = act({ type: 'spin' }); s = r.state;
  ok(s.tray.find(t => t.i === d.i).kept === false, 'happy: the un-kept die stayed loose across the spin (was re-thrown)');
  // (fi may or may not change on a re-throw — the point is it participated in the spin, not that the face differs)
  void before;
  // unkeep an already-loose die is refused
  const rl = act({ type: 'unkeep', i: d.i });
  ok(rl.ok === false && /not kept/.test(rl.error), 'happy: unkeep of a loose (un-kept) die is refused');
}

// =============================================================================
// keepCap NON-REFUND — the curse's bite survives an unkeep. Under keepCap count:1, one manual keep
// spends the window budget; un-keeping frees the DIE but NOT the budget (keepSpend untouched), so no
// further keep is legal and a re-keep is refused. keep→unkeep→re-keep cannot launder the cap.
// =============================================================================
{
  configure({ warps: [{ kind: 'keepCap', params: { count: 1 } }] });
  let r = act({ type: 'new_run', seed: 1, balance: {} });
  r = act({ type: 'spin' }); let s = r.state;
  ok(s.curses && s.curses.keepCap === 1, 'keepCap: the cap-1 warp is active');
  const a1 = s.tray.find(t => !t.kept && !t.locked && t.symbol !== 'blank');
  r = act({ type: 'keep', i: a1.i }); s = r.state;
  ok(!legalActions().some(x => x.type === 'keep'), 'keepCap: the single keep spends the window — no keep legal');
  ok(legalActions().some(x => x.type === 'unkeep' && x.args.i === a1.i), 'keepCap: unkeep is still legal (uncapped)');
  r = act({ type: 'unkeep', i: a1.i }); s = r.state;
  ok(s.tray.find(t => t.i === a1.i).kept === false, 'keepCap: the die is un-kept');
  ok(!legalActions().some(x => x.type === 'keep'), 'keepCap: NON-REFUND — keep is STILL not legal after the unkeep (budget survives)');
  const rk = act({ type: 'keep', i: a1.i });
  ok(rk.ok === false && /keep cap/.test(rk.error), 'keepCap: a re-keep is refused (keep→unkeep→re-keep cannot launder the cap)');
}

// =============================================================================
// FORCED refusal — a forcedKeep die (the ritual's demand, kept:true + forced:true) refuses unkeep.
// =============================================================================
{
  configure({ warps: [{ kind: 'forcedKeep', params: { symbol: 'body' } }] });
  let r = act({ type: 'new_run', seed: 1, balance: {} });   // seed 1 → die 0 shows body → forced
  r = act({ type: 'spin' }); let s = r.state;
  const fd = s.tray.find(t => t.forced);
  ok(!!fd && s.tray.find(t => t.i === fd.i).kept === true, 'forced: a forcedKeep die is kept + forced');
  ok(!legalActions().some(x => x.type === 'unkeep' && x.args.i === fd.i), 'forced: unkeep is NOT offered for a forced die (inert)');
  const rf = act({ type: 'unkeep', i: fd.i });
  ok(rf.ok === false && /forced keep/.test(rf.error), 'forced: an explicit unkeep of a forced die is refused');
}

// =============================================================================
// LOCKED refusal — a manually-kept die then LOCKED by an on_keep self-lock bane refuses unkeep.
// =============================================================================
{
  const lockBane = E({ effect: 'lock', trigger: 'on_keep', scope: 'self', forced: true, polarity: 'bane', name: 'Seize' });
  configure({ enchants: [lockBane] });
  let r = act({ type: 'new_run', seed: 1, balance: {} });
  r = act({ type: 'spin' });
  r = act({ type: 'keep', i: 0 }); let s = r.state;
  const t0 = s.tray.find(t => t.i === 0);
  ok(t0.kept === true && t0.locked === true, 'locked: keeping die 0 fires its on_keep self-lock (kept + locked)');
  ok(!legalActions().some(x => x.type === 'unkeep' && x.args.i === 0), 'locked: unkeep is NOT offered for a locked die (inert)');
  const rl = act({ type: 'unkeep', i: 0 });
  ok(rl.ok === false && /locked/.test(rl.error), 'locked: an explicit unkeep of a kept+locked die is refused');
}

// =============================================================================
// RESOLVE SEMANTICS — the finding that fixes the legality choice.
//   (a) un-kept dice are EXCLUDED from the scoring pool (keptPool filters t.kept) — metNow shrinks.
//   (b) so unkeep at 0 rolls stays LEGAL (no rollsLeft gate): dropping a PROFANE keep flips a `pure`
//       rung met (proved directly via resolveSegment) — a real, score-improving 0-roll line.
// =============================================================================
{
  // (a) exclusion — build a kept pool that meets a rung, then unkeep one and watch metNow shrink.
  configure({});
  // seed-scan for a spin state where keeping two same-colour dice lights a rung, then unkeep drops it.
  let found = false;
  for (const seed of [1, 2, 3, 42, 777, 1000, 8919, 20260714]) {
    let r = act({ type: 'new_run', seed, balance: {} });
    r = act({ type: 'spin' }); let s = r.state;
    // greedily keep loose stat dice toward the highest-reach rung until a rung lights
    const target = [...(s.rungs || [])].filter(x => !x.veiled).sort((a, b) => (b.reach_estimate || 0) - (a.reach_estimate || 0))[0];
    if (!target || !target.req) continue;
    let lastKept = null;
    for (let guard = 0; guard < 12 && !(s.metNow || []).length; guard++) {
      const need = { ...target.req };
      for (const t of s.tray) if (t.kept && need[t.symbol]) need[t.symbol] -= (t.mag || 1);
      const kd = (s.tray || []).find(t => !t.kept && !t.locked && t.symbol !== 'blank' && (need[t.symbol] || 0) > 0);
      if (kd && legalActions().some(x => x.type === 'keep' && x.args.i === kd.i)) { r = act({ type: 'keep', i: kd.i }); lastKept = kd.i; }
      else if ((s.rollsLeft || 0) > 0) r = act({ type: 'spin' });
      else break;
      s = r.state;
    }
    if ((s.metNow || []).length && lastKept != null) {
      const before = (s.metNow || []).length;
      r = act({ type: 'unkeep', i: lastKept }); s = r.state;
      const after = (s.metNow || []).length;
      ok(after < before, `exclusion (seed ${seed}): un-keeping a scoring die shrinks metNow ${before}→${after} (un-kept dice do not score)`);
      found = true;
      break;
    }
  }
  ok(found, 'exclusion: found a seed where a kept die lit a rung (to prove the un-keep drops it)');

  // (b) 0-roll legality — no rollsLeft gate. Drive to rollsLeft 0 with a kept die.
  configure({});
  let r = act({ type: 'new_run', seed: 1, balance: {} });
  r = act({ type: 'spin' });
  r = act({ type: 'keep', i: 0 });
  r = act({ type: 'spin' });
  r = act({ type: 'spin' }); let s = r.state;
  ok((s.rollsLeft || 0) === 0 && s.tray.find(t => t.i === 0).kept, '0-roll: reached rollsLeft 0 with a kept die');
  ok(legalActions().some(x => x.type === 'unkeep' && x.args.i === 0), '0-roll: unkeep is STILL legal at 0 rolls (no rollsLeft gate)');
  ok(act({ type: 'unkeep', i: 0 }).ok !== false, '0-roll: unkeep at 0 rolls succeeds');

  // (b, cont.) WHY it is not a trap — dropping a profane keep flips a `pure` rung met (engine-direct).
  const pureRung = { tier: 'true', colour: 'body', value: 3, req: { body: 3 }, pure: 'body' };
  const profane = resolveSegment([{ symbol: 'body', mag: 1 }, { symbol: 'body', mag: 1 }, { symbol: 'body', mag: 1 }, { symbol: 'mind', mag: 1 }], [pureRung]);
  const clean   = resolveSegment([{ symbol: 'body', mag: 1 }, { symbol: 'body', mag: 1 }, { symbol: 'body', mag: 1 }], [pureRung]);
  ok(profane.hit < 0, 'pure-rung: an off-colour (profane) keep VOIDS the pure rung (unmet)');
  ok(clean.hit >= 0, 'pure-rung: dropping the profane keep flips the pure rung MET — a real 0-roll un-keep line');
}

// =============================================================================
// REPLAY DETERMINISM — a recorded stream containing unkeeps replays to the identical result.
// The un-keep draws no rng, so same seed + same actions (incl. unkeeps) ⇒ byte-identical run.
// =============================================================================
{
  const resultOf = st => ({ score: st.score, segments: st.thread.length,
    knot: st.knot ? (st.knot.hit ? (st.knot.tight ? 'tight' : 'tied') : 'slip') : null, stitches: st.stitchSaves });
  // a policy that DELIBERATELY un-keeps: keep the first loose die, then unkeep it every other spin.
  function playAndRecord(seed) {
    configure({});
    const actions = [];
    let r = act({ type: 'new_run', seed }); let st = r.state, guard = 0, flip = 0;
    while (!st.over && guard++ < 1500) {
      let a;
      if (st.phase === 'perk') a = { type: 'perk', card: 0 };
      else if (st.phase === 'transform') a = { type: 'transform', skip: true };
      else if (st.phase === 'stitch') a = { type: 'stitch' };
      else if (st.phase === 'segment' || st.phase === 'knot') {
        if ((st.spinsTaken || 0) === 0) a = { type: 'spin' };
        else {
          const kept = (st.tray || []).find(t => t.kept && !t.locked && !t.forced);
          const loose = (st.tray || []).find(t => !t.kept && !t.locked && t.symbol !== 'blank' && t.symbol !== 'fang');
          if (kept && (flip++ % 3 === 2)) a = { type: 'unkeep', i: kept.i };            // periodically un-keep
          else if (loose && (st.rollsLeft || 0) > 0 && Math.abs(loose.i) % 2 === 0) a = { type: 'keep', i: loose.i };
          else if ((st.metNow || []).length > 0 || (st.rollsLeft || 0) <= 0) a = { type: 'resolve' };
          else a = { type: 'spin' };
        }
      } else break;
      r = act(a); if (r.ok !== false) actions.push(a); st = r.state;
    }
    return { actions, result: resultOf(st) };
  }
  function replay(seed, actions) {
    configure({});
    act({ type: 'new_run', seed });
    let st;
    for (const a of actions) st = act(a).state;
    return resultOf(st);
  }
  for (const seed of [1, 42, 1000, 20260714, 8919]) {
    const { actions, result } = playAndRecord(seed);
    ok(actions.some(a => a.type === 'unkeep'), `replay (seed ${seed}): the recorded stream actually contains unkeeps`);
    const rr = replay(seed, actions);
    ok(JSON.stringify(result) === JSON.stringify(rr), `replay (seed ${seed}): a stream with unkeeps replays to the same result (${JSON.stringify(result)})`);
    ok(JSON.stringify(replay(seed, actions)) === JSON.stringify(rr), `replay (seed ${seed}): the replay is itself deterministic`);
  }
}

// =============================================================================
// RELEASE COEXISTENCE — Open Hand `release` and ambient `unkeep` are distinct action types that
// coexist. With an Open Hand ench etched, a kept die may be BOTH a release target AND unkeepable;
// both actions are legal (the client picks — release takes precedence there, documented in app.mjs).
// =============================================================================
{
  const releaseEnch = E({ effect: 'release', trigger: 'on_keep', scope: 'chosen', name: 'Open Hand' });
  configure({ enchants: [releaseEnch] });
  let r = act({ type: 'new_run', seed: 1, balance: {} });
  r = act({ type: 'spin' }); let s = r.state;
  const other = s.tray.find(t => t.i !== 0 && !t.kept && !t.locked && t.symbol !== 'blank');
  r = act({ type: 'keep', i: other.i }); s = r.state;   // die 0 (etched) shows + `other` kept ⇒ release offer rises
  const legal = legalActions();
  const relLegal = legal.some(x => x.type === 'release' && x.args.target === other.i);
  const unkLegal = legal.some(x => x.type === 'unkeep' && x.args.i === other.i);
  ok(relLegal, 'coexist: Open Hand release targets the kept die');
  ok(unkLegal, 'coexist: ambient unkeep ALSO targets the same kept die (both legal, distinct types)');
  // firing unkeep does NOT consume the Open Hand per-segment budget (releaseUsed) — the offer survives.
  r = act({ type: 'unkeep', i: other.i }); s = r.state;
  ok(s.tray.find(t => t.i === other.i).kept === false, 'coexist: unkeep un-kept the die');
  // re-keep → the Open Hand offer is still available (unkeep did not spend it)
  r = act({ type: 'keep', i: other.i }); s = r.state;
  ok((s.releaseOffers || []).some(o => o.di === 0 && o.targets.includes(other.i)),
     'coexist: the Open Hand release offer survives an ambient unkeep (its budget is independent)');
}

console.log(`\nunkeep: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
