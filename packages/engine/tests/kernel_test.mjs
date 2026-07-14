// =============================================================================
// KERNEL TEST  (Generator v2 §1.2 / slice G1 — the pure physics kernel)
// -----------------------------------------------------------------------------
// Pure unit coverage of packages/engine/kernel.js: the die re-throw primitive
// (peek consumed exactly once, NO rng draw on the peek path), the forced-effect
// trio (reroll guard / lock / erode floors at 1), ward find+consume, the echo
// predicate, and the three warp cores (lockDice draw order, rerollOnRoll count +
// cross-symbol behavior, forcedKeep). The byte-identical proof vs a HEAD worktree
// is run separately (a full-run state+event stream diff across seeds × flag-mixes —
// see the G1 report); this file is the fast, dependency-free contract check.
// =============================================================================
import {
  throwFaceIdx, lockEntry, rerollGuard, erodeMag, wardIndex, consumeEnchAt, echoEnch,
  rollLockWarp, rerollOnRollWarp, forcedKeepWarp,
} from '../kernel.js';

// warp constructors (the raw ritual warps the cores read via ritual.js — id-blind, closed kinds)
const lockDice   = count  => ({ kind:'lockDice',     params:{ count } });
const feverWarp  = (symbol, count) => ({ kind:'rerollOnRoll', params:{ symbol, count } });
const soakedWarp = symbol => ({ kind:'forcedKeep',    params:{ symbol } });

let pass = 0, fail = 0;
const check = (n, c) => { if (c) pass++; else { fail++; console.error('  FAIL:', n); } };

// a counting rng stub — records how many times it was drawn, returns a scripted sequence.
function seqRng(seq){ let i = 0; const fn = () => { fn.calls++; return seq[i++ % seq.length]; }; fn.calls = 0; return fn; }

// ---- throwFaceIdx: the die re-throw primitive -------------------------------------
{
  const die = { faces: [ { symbol:'body', mag:1 }, { symbol:'mind', mag:2 }, { symbol:'fang' } ] };
  // no peek → ONE rng draw, floor(rng·faces)
  const r1 = seqRng([0.0]);  const t1 = throwFaceIdx(die, r1, null);
  check('throw no-peek draws once',   r1.calls === 1);
  check('throw no-peek fi=0',         t1.fi === 0 && t1.symbol === 'body' && t1.consumedPeek === false);
  const r2 = seqRng([0.5]);  const t2 = throwFaceIdx(die, r2, null);
  check('throw no-peek fi=floor(.5·3)=1', t2.fi === 1 && t2.symbol === 'mind' && t2.mag === 2);
  // peek → ZERO rng draws, lands the peeked index, consumedPeek true
  const r3 = seqRng([0.99]); const t3 = throwFaceIdx(die, r3, 2);
  check('throw peek draws ZERO rng',  r3.calls === 0);
  check('throw peek lands index 2',   t3.fi === 2 && t3.symbol === 'fang' && t3.consumedPeek === true);
  // peek index 0 (falsy-but-valid) still counts as a peek (no rng), mag defaults to 1
  const r4 = seqRng([0.0]); const t4 = throwFaceIdx(die, r4, 0);
  check('throw peek idx 0 no rng',    r4.calls === 0 && t4.fi === 0 && t4.consumedPeek === true);
  check('throw mag defaults to 1',    throwFaceIdx(die, seqRng([0.9]), 2).mag === 1);
}

// ---- lockEntry -------------------------------------------------------------------
{
  const loose = { di:0, symbol:'body', kept:false, locked:false };
  const r = lockEntry(loose);
  check('lock loose → changed+locked', r.changed === true && r.entry.locked === true && r.entry !== loose);
  check('lock does not mutate input',  loose.locked === false);
  check('lock already-locked → no-op', lockEntry({ di:1, locked:true }).changed === false);
}

// ---- rerollGuard -----------------------------------------------------------------
{
  check('reroll guard loose → true',   rerollGuard({ kept:false, locked:false }) === true);
  check('reroll guard kept → false',   rerollGuard({ kept:true,  locked:false }) === false);
  check('reroll guard locked → false', rerollGuard({ kept:false, locked:true  }) === false);
}

// ---- erodeMag: forced erode, floors at 1 -----------------------------------------
{
  check('erode mag2 -1 → 1 changed',   (r => r.changed && r.mag === 1)(erodeMag({ symbol:'body', mag:2 }, 1)));
  check('erode floors at 1 (pips>mag)', (r => r.changed && r.mag === 1)(erodeMag({ symbol:'body', mag:2 }, 5)));
  check('erode mag3 -1 → 2',           (r => r.changed && r.mag === 2)(erodeMag({ symbol:'body', mag:3 }, 1)));
  check('erode mag1 → no-op',          erodeMag({ symbol:'body', mag:1 }, 1).changed === false);
  check('erode fang → no-op',          erodeMag({ symbol:'fang', mag:2 }, 1).changed === false);
  check('erode blank → no-op',         erodeMag({ symbol:'blank', mag:2 }, 1).changed === false);
  check('erode missing face → no-op',  erodeMag(null, 1).changed === false);
  check('erode default pips=1',        erodeMag({ symbol:'mind', mag:2 }).mag === 1);
}

// ---- ward: find + consume exactly once / absent ----------------------------------
{
  const face = { ench: [ { effect:'reroll' }, { effect:'ward', name:'Ward A' }, { effect:'ward', name:'Ward B' } ] };
  const wi = wardIndex(face);
  check('ward found at index 1',       wi === 1);
  const after = consumeEnchAt(face.ench, wi);
  check('consume removes exactly one', after.length === 2 && after[0].effect === 'reroll' && after[1].name === 'Ward B');
  check('consume does not mutate input', face.ench.length === 3);
  const wi2 = wardIndex({ ench: after });
  check('second ward now at index 1',  wi2 === 1);   // Ward B remains
  check('ward absent → -1',            wardIndex({ ench: [ { effect:'reroll' } ] }) === -1);
  check('ward on empty face → -1',     wardIndex({}) === -1 && wardIndex(null) === -1);
}

// ---- echo predicate: positive / negative -----------------------------------------
{
  const echoFace = { ench: [ { trigger:'on_reroll', effect:'reroll', forced:false, name:'Echo' } ] };
  check('echo positive',               echoEnch(echoFace)?.name === 'Echo');
  check('echo forced → null',          echoEnch({ ench:[ { trigger:'on_reroll', effect:'reroll', forced:true } ] }) === null);
  check('echo wrong trigger → null',   echoEnch({ ench:[ { trigger:'on_roll', effect:'reroll', forced:false } ] }) === null);
  check('echo wrong effect → null',    echoEnch({ ench:[ { trigger:'on_reroll', effect:'lock', forced:false } ] }) === null);
  check('echo no ench → null',         echoEnch({}) === null && echoEnch(null) === null);
}

// ---- rollLockWarp: lockDice candidate selection + draw order (composes ritual.js) ---
{
  const tray = [
    { di:0, symbol:'body',  kept:false, locked:false },
    { di:1, symbol:'blank', kept:false, locked:false },   // blank — never a candidate
    { di:2, symbol:'mind',  kept:true,  locked:false },   // kept — never a candidate
    { di:3, symbol:'will',  kept:false, locked:false },
    { di:4, symbol:'grip',  kept:false, locked:false },
  ];   // candidates (loose, non-blank): di 0, 3, 4
  // scripted rng: draw1 floor(0.0·3)=0 → cands[0]=di0; draw2 floor(0.9·2)=1 → cands[1]=di4
  const rng = seqRng([0.0, 0.9]);
  const picks = rollLockWarp(tray, [ lockDice(2) ], rng);
  check('rollLock draws once per lock', rng.calls === 2);
  check('rollLock exact draw order',    JSON.stringify(picks) === JSON.stringify([0, 4]));
  check('rollLock picks are candidates', picks.every(di => [0,3,4].includes(di)));
  check('rollLock no lockDice warp → [] no rng', (r => rollLockWarp(tray, [], r).length === 0 && r.calls === 0)(seqRng([0.5])));
  check('rollLock lockDice count 0 → [] no rng', (r => rollLockWarp(tray, [ lockDice(0) ], r).length === 0 && r.calls === 0)(seqRng([0.5])));
  // count exceeds candidates → picks capped at candidate count (all 3), 3 draws
  const rng2 = seqRng([0.0, 0.0, 0.0]);
  check('rollLock caps at candidate count', rollLockWarp(tray, [ lockDice(9) ], rng2).length === 3);
  // ritual.js stacks lockDice warps (1+2=3): proves the constraint is READ, not re-derived
  check('rollLock stacks warps via ritual', rollLockWarp(tray, [ lockDice(1), lockDice(2) ], seqRng([0.0,0.0,0.0])).length === 3);
  // determinism: same seed sequence → same picks
  check('rollLock deterministic',       JSON.stringify(rollLockWarp(tray, [ lockDice(2) ], seqRng([0.0,0.9]))) === JSON.stringify([0,4]));
}

// ---- rerollOnRollWarp: count + symbol + cross-symbol interleave ------------------
{
  // single symbol, count 1 → only the FIRST matching loose face rerolls
  const tray1 = [
    { di:0, symbol:'body', kept:false, locked:false },
    { di:1, symbol:'body', kept:false, locked:false },
    { di:2, symbol:'body', kept:true,  locked:false },   // kept — skipped
  ];
  const calls1 = [];
  const throw1 = di => { calls1.push(di); return { symbol:'mind', mag:1, fi:0 }; };
  const r1 = rerollOnRollWarp(tray1, [ feverWarp('body', 1) ], throw1);
  check('rerollOnRoll count 1 → 1 throw', calls1.length === 1 && calls1[0] === 0);
  check('rerollOnRoll rerolls first only', r1.tray[0].symbol === 'mind' && r1.tray[1].symbol === 'body');
  check('rerollOnRoll skips kept',         r1.tray[2].symbol === 'body' && r1.tray[2].kept === true);
  check('rerollOnRoll applied log',        r1.applied.length === 1 && r1.applied[0].di === 0 && r1.applied[0].symbol === 'body');
  check('rerollOnRoll does not mutate input', tray1[0].symbol === 'body');
  // CROSS-SYMBOL interleave: a die rerolled INTO a later symbol can be re-hit by it (warp order kept)
  const tray2 = [ { di:0, symbol:'body', kept:false, locked:false } ];
  let n = 0;
  const throw2 = () => (++n === 1 ? { symbol:'gold', mag:1, fi:1 } : { symbol:'mind', mag:1, fi:2 });
  const r2 = rerollOnRollWarp(tray2, [ feverWarp('body', 1), feverWarp('gold', 1) ], throw2);
  check('rerollOnRoll cross-symbol re-hit', n === 2 && r2.tray[0].symbol === 'mind' && r2.applied.length === 2);
  check('rerollOnRoll cross-symbol order',  r2.applied[0].symbol === 'body' && r2.applied[1].symbol === 'gold');
  // no matching symbol → no throws, tray unchanged
  const r3 = rerollOnRollWarp(tray1, [ feverWarp('will', 2) ], () => { throw new Error('should not throw'); });
  check('rerollOnRoll no match → no-op',    r3.applied.length === 0 && r3.tray[0].symbol === 'body');
  // no rerollOnRoll warp at all → no throws
  const r4 = rerollOnRollWarp(tray1, [], () => { throw new Error('should not throw'); });
  check('rerollOnRoll no warp → no-op',     r4.applied.length === 0);
}

// ---- forcedKeepWarp: symbol lock-in, flags, skips --------------------------------
{
  const tray = [
    { di:0, symbol:'mind',  kept:false, locked:false },
    { di:1, symbol:'body',  kept:false, locked:false },   // not forced
    { di:2, symbol:'mind',  kept:false, locked:true  },   // locked — skipped
    { di:3, symbol:'blank', kept:false, locked:false },   // blank — skipped
    { di:4, symbol:'mind',  kept:true,  locked:false },   // already kept — skipped
  ];
  const r = forcedKeepWarp(tray, [ soakedWarp('mind') ], 1);
  check('forcedKeep locks forced symbol', r.tray[0].kept === true && r.tray[0].forced === true && r.tray[0].keptWin === 1);
  check('forcedKeep skips non-forced',    r.tray[1].kept === false);
  check('forcedKeep skips locked',        r.tray[2].kept === false && r.tray[2].locked === true);
  check('forcedKeep skips blank',         r.tray[3].kept === false);
  check('forcedKeep leaves kept as-is',   r.tray[4].kept === true && r.tray[4].forced === undefined);
  check('forcedKeep applied log (di0 only)', r.applied.length === 1 && r.applied[0].di === 0);
  check('forcedKeep does not mutate input', tray[0].kept === false);
  check('forcedKeep no forcedKeep warp → no-op', forcedKeepWarp(tray, [], 0).applied.length === 0);
}

console.log(`\nkernel: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
