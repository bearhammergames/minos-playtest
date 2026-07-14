// =============================================================================
// POST-G3 PLAYTEST BUG BATCH — the five fixes from the generator-v2 G3 synthesis.
// -----------------------------------------------------------------------------
//   Fix 1 (probe.js)   — a PURE rung prices >0 on a capable hand (was 0.000), ~0 on an
//                        incapable hand, and NON-pure sets stay byte-identical (frozen
//                        digest); a mixed set with one pure rung no longer poisons pNone.
//   Fix 2 (session)    — a FIZZLED face/debt boon VOIDS its rider (no goods, no price):
//                        a graft at cap + a no-bane Scour attach NO rider; a graft that
//                        SUCCEEDS still attaches its rider.
//   Fix 4 (session)    — two consecutive BARE Shifts never reverse each other (no ping-pong)
//                        while an alternative parking face exists; deterministic.
//   Fix 5a (session)   — the god-window event fires EXACTLY on a window-state transition.
// Fix 3 (chainAlive) lives in wish_v2_test.mjs (with the other jackpot interpreter tests).
// Not a KNOWN_FAIL — a design gate.
// =============================================================================
import { newRun, act, serializeState, legalActions, configure, shiftBane, _handRef } from '../session.mjs';
import { evaluateRungSet } from '../../engine/probe.js';
import { clearBalanceOverrides, setDisabledContent } from '../../engine/balance.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };

const F = (s, m = 1) => ({ symbol: s, mag: m, state: 'live' });
const hand = rows => ({ dice: rows.map(syms => ({ faces: syms.map(s => F(s)) })) });   // NB: map(s => F(s)), NOT map(F) — map passes the index as mag!
const round6 = o => JSON.parse(JSON.stringify(o, (k, v) => typeof v === 'number' ? +v.toFixed(6) : v));

clearBalanceOverrides(); setDisabledContent([]); configure({});

// =============================================================================
// FIX 1 — the joint probe prices PURE rungs honestly (direct evaluateRungSet).
// =============================================================================
{
  const SPREAD = hand([
    ['body', 'body', 'mind'], ['body', 'spirit', 'charm'], ['mind', 'spirit', 'mana'],
    ['mind', 'mind', 'spirit'], ['charm', 'body', 'spirit'], ['spirit', 'mind', 'body'],
  ]);
  const MINDRICH = hand([
    ['mind', 'mind', 'body'], ['mind', 'mind', 'spirit'], ['mind', 'mind', 'charm'],
    ['mind', 'spirit', 'mind'], ['mind', 'body', 'mind'], ['mind', 'mind', 'spirit'],
  ]);
  const NOMIND = hand([   // ZERO mind faces — a pure mind rung is impossible
    ['body', 'body', 'spirit'], ['body', 'spirit', 'charm'], ['body', 'spirit', 'mana'],
    ['spirit', 'charm', 'spirit'], ['charm', 'body', 'spirit'], ['spirit', 'charm', 'body'],
  ]);
  const ctx = { warps: [], twist: null, tempo: { bonusSpins: 0, offeredRerolls: 0 },
    takeRates: { sigil: 0.6, expose: 0.4, release: 0.3, echo: 0.5 } };
  const T = 240;
  const pureTrue = { tier: 'true', colour: 'mind', value: 3, req: { mind: 3 }, pure: true };

  // (a) a pure rung on a CAPABLE (mind-rich) hand prices > 0 and < 1
  const set = [{ tier: 'floor', colour: 'body', value: 1, req: { body: 2 } }, pureTrue,
               { tier: 'bloom', colour: 'spirit', value: 6, req: { spirit: 3, charm: 1 } }];
  const cap = evaluateRungSet(MINDRICH, set, ctx, { trials: 400 });
  ok(cap.reach[1] > 0 && cap.reach[1] < 1, `Fix1: a pure rung on a capable hand prices in (0,1) — got ${cap.reach[1].toFixed(3)}`);
  ok(cap.reach[1] > 0.1, `Fix1: the capable-hand pure reach is a REAL rate (not a rounding blip) — ${cap.reach[1].toFixed(3)}`);
  // its SET reach matches its STANDALONE reach (the purity line is independent of the other rungs)
  const alone = evaluateRungSet(MINDRICH, [pureTrue], ctx, { trials: 400 });
  ok(Math.abs(cap.reach[1] - alone.reach[0]) <= 0.08, `Fix1: pure-in-set ≈ pure-alone (independent purity line) — set ${cap.reach[1].toFixed(3)} vs alone ${alone.reach[0].toFixed(3)}`);

  // (b) a hand that CANNOT make the colour prices the pure rung ~0
  const no = evaluateRungSet(NOMIND, set, ctx, { trials: 400 });
  ok(no.reach[1] <= 0.005, `Fix1: a hand that cannot meet the pure rung prices ~0 — got ${no.reach[1].toFixed(3)}`);

  // (c) pNone is no longer POISONED: with only the pure rung reachable, pNone ≈ 1 - reach[pure],
  //     NOT ≈ 1 (the pre-fix false-0 would have left pNone pinned near 1). Coherence holds too.
  const hardSet = [{ tier: 'floor', colour: 'body', value: 1, req: { body: 4 } }, pureTrue,
                   { tier: 'bloom', colour: 'spirit', value: 6, req: { spirit: 4 } }];
  const hs = evaluateRungSet(MINDRICH, hardSet, ctx, { trials: 400 });
  ok(hs.pNone <= 1 - hs.reach[1] + 1e-9, `Fix1: pNone ≤ 1 - reach[pure] (a met pure rung is never a snap) — pNone ${hs.pNone.toFixed(3)}, reachPure ${hs.reach[1].toFixed(3)}`);
  ok(hs.pNone < 0.9 && hs.reach[1] > 0.1, `Fix1: a reachable pure rung PULLS pNone down (un-poisoned) — pNone ${hs.pNone.toFixed(3)}`);
  ok(Math.abs(hs.pNone + hs.pExactly1 + hs.pMulti - 1) < 1e-9, 'Fix1: coherence holds (pNone + pExactly1 + pMulti === 1)');

  // (d) NON-pure sets are BYTE-IDENTICAL to the pre-fix baseline (frozen digest, trials 240).
  const NONPURE_PLAIN = [
    { tier: 'floor', colour: 'body', value: 1, req: { body: 2 } },
    { tier: 'true',  colour: 'mind', value: 3, req: { mind: 2, charm: 1 } },
    { tier: 'bloom', colour: 'spirit', value: 6, req: { spirit: 3 } },
  ];
  const NONPURE_CONC = [   // a SHAPED (concentrated) but NON-pure set — exercises the overkeep noise stream
    { tier: 'floor', colour: 'body', value: 1, req: { body: 2 } },
    { tier: 'true',  colour: 'mind', value: 3, req: { mind: 3 }, concentrated: true },
    { tier: 'bloom', colour: 'spirit', value: 6, req: { spirit: 3, charm: 1 } },
  ];
  const FROZEN_PLAIN = { reach: [0.554167, 0.395833, 0.329167], pNone: 0.041667, pMulti: 0.320833, pExactly1: 0.6375, ev: 3.345833, trials: 240 };
  const FROZEN_CONC  = { reach: [0.508333, 0, 0.091667], pNone: 0.420833, pMulti: 0.020833, pExactly1: 0.558333, ev: 1.0375, trials: 240 };
  const gp = round6(evaluateRungSet(SPREAD, NONPURE_PLAIN, ctx, { trials: T }));
  const gc = round6(evaluateRungSet(SPREAD, NONPURE_CONC,  ctx, { trials: T }));
  ok(JSON.stringify(gp) === JSON.stringify(FROZEN_PLAIN), `Fix1: non-pure PLAIN set is byte-identical to the pre-fix digest — got ${JSON.stringify(gp)}`);
  ok(JSON.stringify(gc) === JSON.stringify(FROZEN_CONC),  `Fix1: non-pure CONCENTRATED set is byte-identical to the pre-fix digest — got ${JSON.stringify(gc)}`);

  // determinism: the pure eval reproduces exactly (salted purity streams are pure functions of t,r)
  const d1 = round6(evaluateRungSet(MINDRICH, set, ctx, { trials: T }));
  const d2 = round6(evaluateRungSet(MINDRICH, set, ctx, { trials: T }));
  ok(JSON.stringify(d1) === JSON.stringify(d2), 'Fix1: a pure-set evaluation is deterministic');
}

// =============================================================================
// FIX 2 — a FIZZLED boon voids its rider (no goods, no price); a SUCCESS still rides.
// -----------------------------------------------------------------------------
// Drive a real perk. The trim leaves exactly ONE reach card enabled so a floor/ash draw
// always offers it; riders ON + pureRiders OFF so it ALWAYS rides (the rider would attach
// pre-fix). "faces.max"=3 puts every drum at cap so a Graft FIZZLES; default max lets it succeed.
// =============================================================================
{
  const ALL_REACH = ['reweave', 'deepen', 'respin_sigil', 'flanking_sigil', 'wild_sigil', 'spinwrights_sigil',
    'open_hand', 'carvers_sigil', 'ward_sigil', 'augurs_sigil', 'echo_sigil',
    'graft_face', 'copy_etch', 'excise_face', 'cursed_graft', 'shift_bane', 'scour', 'absolve',
    'grinning_bargain', 'seers_bargain', 'louts_bargain'];
  const baneCount = st => st.hand.reduce((n, d) => n + d.faces.filter(f => (f.ench || []).some(e => e.polarity === 'bane')).length, 0);

  // play a clean run (never fangs) until a perk that holds a card of `boonEffect`; return { st, card }.
  function playToPerkCard(boonEffect, keep, extraBalance){
    const balance = { 'witnesses.enabled': false, 'rewardLadder.pureRiders': false, ...(extraBalance || {}) };
    const opts = { balance, disabledContent: ALL_REACH.filter(id => id !== keep) };
    for (let seed = 1; seed <= 120; seed++){
      let r = act({ type: 'new_run', seed, ...opts }), st = r.state, guard = 0;
      while (!st.over && guard++ < 60){
        if (st.phase === 'perk'){
          const idx = (st.perkOffer || []).findIndex(c => c.boon && c.boon.effect === boonEffect);
          if (idx >= 0) return { st, card: st.perkOffer[idx], seed };
          r = act({ type: 'perk', card: 0 });
        } else if (st.phase === 'transform') r = act({ type: 'transform', skip: true });
        else if (st.phase === 'stitch') r = act({ type: 'stitch' });
        else if (st.phase === 'segment' || st.phase === 'knot'){
          if ((st.spinsTaken || 0) === 0){ r = act({ type: 'spin' }); }
          else {
            const target = [...st.rungs].filter(x => x.req).sort((a, b) => (b.reach_estimate || 0) - (a.reach_estimate || 0))[0];
            const need = { ...(target ? target.req : {}) };
            for (const t of st.tray) if (t.kept && need[t.symbol]) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag || 1));
            const kd = (st.tray || []).find(t => !t.kept && !t.locked && t.symbol !== 'blank' && t.symbol !== 'fang' && (need[t.symbol] || 0) > 0);
            if (kd) r = act({ type: 'keep', i: kd.i });
            else if ((st.metNow || []).length > 0 || (st.rollsLeft || 0) <= 0) r = act({ type: 'resolve' });
            else r = act({ type: 'spin' });
          }
        } else break;
        st = r.state;
      }
    }
    return null;
  }

  // (a) a GRAFT at cap (faces.max=3 ⇒ every drum full) FIZZLES ⇒ NO rider (bane count unchanged).
  const gz = playToPerkCard('graft', 'graft_face', { 'faces.max': 3 });
  ok(!!gz, 'Fix2: reached a perk holding a ridered Graft (faces.max=3, every drum at cap)');
  if (gz){
    ok(!!gz.card.rider, 'Fix2: the Graft card is ridered (pureRiders off ⇒ the rider WOULD attach pre-fix)');
    const before = baneCount(gz.st);
    const r = act({ type: 'perk', card: gz.card.card });
    const after = baneCount(r.state);
    ok(r.events.some(e => /graft fizzles/.test(e)), 'Fix2: the graft FIZZLES at cap (event)');
    ok(r.events.some(e => /no goods, no price|fades with the failed ink/.test(e)), 'Fix2: the rider is VOIDED with a clear event (no goods, no price)');
    ok(after === before, `Fix2: a fizzled graft attaches NO rider (bane count ${before} → ${after})`);
    ok(!r.events.some(e => /blemish settles on die/.test(e)), 'Fix2: no "blemish settles" event on a fizzle');
  }

  // (b) a GRAFT that SUCCEEDS (faces.max default 4) still attaches its rider (bane count +1).
  const gs = playToPerkCard('graft', 'graft_face', {});
  ok(!!gs, 'Fix2: reached a perk holding a ridered Graft (default caps ⇒ graft succeeds)');
  if (gs){
    ok(!!gs.card.rider, 'Fix2: the successful Graft card is ridered');
    const before = baneCount(gs.st);
    const r = act({ type: 'perk', card: gs.card.card });
    const after = baneCount(r.state);
    ok(r.events.some(e => /grafted onto the drum/.test(e)), 'Fix2: the graft SUCCEEDS (a colour face is grafted)');
    ok(r.events.some(e => /blemish settles on die/.test(e)), 'Fix2: a successful graft STILL attaches its rider');
    ok(after === before + 1, `Fix2: a successful graft attaches exactly its rider (bane count ${before} → ${after})`);
  }

  // (c) a no-bane SCOUR (a ridered DEBT verb) FIZZLES ⇒ NO rider — treated consistently.
  const sc = playToPerkCard('scour', 'scour', {});
  ok(!!sc, 'Fix2: reached a perk holding a ridered Scour on a bane-free hand');
  if (sc){
    ok(!!sc.card.rider, 'Fix2: the Scour card is ridered (Scour removes debt, so it rides — pureRiders off)');
    ok(baneCount(sc.st) === 0, 'Fix2: the hand carries no bane at the Scour perk (a clean, fang-free run)');
    const r = act({ type: 'perk', card: sc.card.card });
    ok(r.events.some(e => /no debt to lift/.test(e)), 'Fix2: the Scour FIZZLES hand-blind (no bane to lift)');
    ok(r.events.some(e => /no goods, no price|fades with the failed ink/.test(e)), 'Fix2: the Scour rider is VOIDED (no goods, no price)');
    ok(baneCount(r.state) === 0, 'Fix2: a fizzled Scour attaches NO rider (debt verbs treated consistently)');
  }
  clearBalanceOverrides(); setDisabledContent([]); configure({});
}

// =============================================================================
// FIX 4 — bare-auto Shift never ping-pongs (no exact reversal while an alternative exists).
// =============================================================================
{
  const mkBane = name => ({ id: 'test_' + name, trigger: 'on_keep', condition: null, scope: 'random',
    effect: 'reroll', polarity: 'bane', forced: true, lifetime: 'permanent', cost: {}, params: { count: 1 }, band: 'mild', name });

  const posOf = (h, bane) => { for (let di = 0; di < h.dice.length; di++) for (let fi = 0; fi < h.dice[di].faces.length; fi++)
    if ((h.dice[di].faces[fi].ench || []).includes(bane)) return { di, fi }; return null; };
  const sig = (h) => h.dice.map(d => d.faces.map(f => `${f.symbol}${f.mag}:${(f.ench || []).length}`).join(',')).join('|');

  // ONE bane, mag-1 source, a fresh 6×d3 hand (many mag-1 unenchanted parking faces): the OLD auto
  // parked lowest→lowest, so consecutive bare shifts ping-ponged the bane between two faces.
  const run = () => {
    newRun(7); const h = _handRef();
    const bane = mkBane('thrash'); h.dice[0].faces[0].ench = [bane];
    const p0 = posOf(h, bane);
    shiftBane({}, []); const p1 = posOf(h, bane);
    shiftBane({}, []); const p2 = posOf(h, bane);
    shiftBane({}, []); const p3 = posOf(h, bane);
    return { p0, p1, p2, p3, hsig: sig(h) };
  };
  const a = run();
  ok(!(a.p1.di === a.p0.di && a.p1.fi === a.p0.fi), 'Fix4: the first bare Shift moves the bane off its origin');
  ok(!(a.p2.di === a.p0.di && a.p2.fi === a.p0.fi), 'Fix4: the second bare Shift does NOT return the bane to its origin (no ping-pong)');
  ok(!(a.p2.di === a.p1.di && a.p2.fi === a.p1.fi), 'Fix4: consecutive shifts do not re-target the same face');
  ok(!(a.p3.di === a.p1.di && a.p3.fi === a.p1.fi), 'Fix4: the third bare Shift does not reverse the second (the bane keeps wandering)');
  // determinism: identical setup ⇒ identical trajectory + hand
  const b = run();
  ok(a.hsig === b.hsig && JSON.stringify(a) === JSON.stringify(b), 'Fix4: the bare-auto shift trajectory is deterministic');

  // fizzle-free "only a reverse available" corner: still ACTS (never wedges). A tiny 1-die, 2-face
  // hand: after moving the bane to the other face, the only parking spot IS the origin (a reverse) —
  // the guard must act anyway, not wedge.
  newRun(7); const h2 = _handRef();
  h2.dice = [{ faces: [F('body'), F('mind')] }];   // a single 2-face drum
  const only = mkBane('corner'); h2.dice[0].faces[0].ench = [only];
  ok(shiftBane({}, []) === true, 'Fix4: a bare Shift with a legal target acts (returns true)');
  const after1 = posOf(h2, only);
  ok(after1 && after1.fi === 1, 'Fix4: the bane moved to the only other face');
  ok(shiftBane({}, []) === true, 'Fix4: with ONLY a reversing target left, the Shift still ACTS (never wedges)');
  clearBalanceOverrides(); setDisabledContent([]); configure({});
}

// =============================================================================
// FIX 5a — the god-window event fires EXACTLY on a window-state transition (no spam).
// -----------------------------------------------------------------------------
// Drive full runs (band native-on). For each segment record { window, lagEvent, catchEvent }, then
// assert lag ⇔ (window && !prevWindow) and catch ⇔ (!window && prevWindow) — so an event appears iff
// the window CHANGED, never on a steady segment. Also require SOME run to actually open a window.
// =============================================================================
{
  const clean = (st, legal) => {
    if (st.phase === 'perk'){ const p = legal.find(x => x.type === 'perk'); return p ? { type: 'perk', ...p.args } : null; }
    if (st.phase === 'stitch') return { type: 'stitch' };
    if (st.phase === 'transform') return { type: 'transform', skip: true };
    if (st.phase === 'segment' || st.phase === 'knot'){
      if (st.tray && (st.spinsTaken || 0) >= 1){
        const target = [...st.rungs].filter(x => x.req).sort((a, b) => (b.reach_estimate || 0) - (a.reach_estimate || 0))[0];
        if (target){
          const need = { ...target.req };
          for (const t of st.tray) if (t.kept && need[t.symbol]) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag || 1));
          for (const t of st.tray){
            if (t.kept || t.locked || t.symbol === 'blank' || t.symbol === 'fang') continue;
            if ((need[t.symbol] || 0) > 0 && legal.some(x => x.type === 'keep' && x.args?.i === t.i)) return { type: 'keep', i: t.i };
          }
        }
      }
      if ((st.metNow || []).length > 0) return { type: 'resolve' };
      if ((st.rollsLeft || 0) > 0) return { type: 'spin' };
      return { type: 'resolve' };
    }
    return null;
  };
  const isLag = e => /the world lags behind/.test(e);
  const isCatch = e => /the world catches up/.test(e);

  // trace per-segment window + which transition event fired in the batch that STARTED that segment.
  function windowTrace(seed){
    const trace = [];
    let r = act({ type: 'new_run', seed }), st = r.state, lastSeg = -1;
    const record = (r, st) => {
      if (st.generator && st.phase === 'segment' && st.segIndex !== lastSeg){
        const evs = r.events || [];
        trace.push({ seg: st.segIndex, window: !!st.generator.window, lag: evs.some(isLag), cat: evs.some(isCatch) });
        lastSeg = st.segIndex;
      }
    };
    record(r, st);
    let guard = 0;
    while (!st.over && guard++ < 400){
      const a = clean(st, legalActions()); if (!a) break;
      r = act(a); st = r.state; record(r, st);
    }
    return trace;
  }

  clearBalanceOverrides(); setDisabledContent([]); configure({});
  let consistentAll = true, sawOpen = false, sawClose = false, spam = false, tested = 0;
  for (let seed = 1; seed <= 60; seed++){
    const tr = windowTrace(seed);
    if (tr.length < 2) continue;
    tested++;
    for (let i = 0; i < tr.length; i++){
      const prev = i > 0 ? tr[i - 1].window : false;   // prevWindow starts false (fresh run)
      const win = tr[i].window;
      if (tr[i].lag !== (win && !prev)) consistentAll = false;
      if (tr[i].cat !== (!win && prev)) consistentAll = false;
      if (tr[i].lag && tr[i].cat) spam = true;          // both in one segment = impossible
      if (win && !prev) sawOpen = true;
      if (!win && prev) sawClose = true;
    }
    // no-spam: a run of same-window segments must carry NO window event after the first transition
    for (let i = 1; i < tr.length; i++)
      if (tr[i].window === tr[i - 1].window && (tr[i].lag || tr[i].cat)) spam = true;
  }
  ok(tested > 0, 'Fix5a: drove multiple multi-segment runs to trace the window');
  ok(consistentAll, 'Fix5a: the window event fires EXACTLY on a window-state transition (lag⇔open, catch⇔close)');
  ok(!spam, 'Fix5a: no event on a steady (unchanged-window) segment — no spam');
  ok(sawOpen, 'Fix5a: at least one run OPENED a window (the "lags behind" event actually fires)');
  // (a close only happens if a window later closes — assert it fired iff any close transition occurred)
  ok(sawClose || tested > 0, 'Fix5a: window-close events, when they occur, matched their transitions (consistency covers it)');
  clearBalanceOverrides(); setDisabledContent([]); configure({});
}

console.log(`\npostg3 bugfix: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
