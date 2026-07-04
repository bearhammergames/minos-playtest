// =============================================================================
// SPELLSPUN — Headless Monte-Carlo Self-Play Simulation
// =============================================================================
// Run:
//   node runsim/spellspun_sim.mjs --runs 2000 --policy all --seed 1
//   node runsim/spellspun_sim.mjs --runs 200  --policy greedy-broad --seed 42 --csv out.csv
//
// Flags:
//   --runs    N         per-policy run count (default 500)
//   --policy  <name>    one of: all | greedy-broad | focus-colour | safe-stop-early |
//                               bloom-pusher | random | perk-aware
//   --seed    N         base RNG seed; each run draws from a pre-gen segment pool
//                       seeded at this value. Same seed+policy → same output. (default 1)
//   --csv     <path>    write per-run CSV rows (optional)
//   --json    <path>    write per-run JSON array (optional)
//
// PERFORMANCE NOTE
// generateSegment internally runs 500-trial band-fit probes per tier per segment.
// For the same starting hand the probes are always identical, so we PRE-GENERATE a
// large pool of segments (once, before running any policy) and replay them during
// simulation. This yields ~100× speedup over calling generateSegment per-run.
// The knot is also pre-generated once (it never changes for this fixed hand).
// =============================================================================

import { writeFile } from 'fs/promises';
import path from 'path';

import { makeRng, tally, meetsRung } from '../engine.js';
import { generateSegment, generateKnot, resetShapeMemory } from '../generator.js';
import {
  newThread, resolveSegment, commitSegment, applyCurse,
  checkBlooms, recordBloom, drawPerks, resolveKnot, tallyScore,
  DEEPEN_MAX, deepenable,
} from '../spellspun.js';
import { sym } from '../registry/symbols.js';

// =============================================================================
// CONSTANTS — mirror play.js exactly
// =============================================================================

const DIFF_BASE = { floor: 0.55, true: 0.32, bloom: 0.16 };

// The canonical six-d3 hand (HAND_TEMPLATES from play.js lines ~42-56).
const HAND_TEMPLATES = {
  ox:    ['body',  'body',   'mind'],
  beast: ['body',  'spirit', 'fang'],
  seer:  ['mind',  'spirit', 'mana'],
  augur: ['mind',  'mind',   'spirit'],
  pelt:  ['charm', 'charm',  'body'],
  maw:   ['fang',  'mind',   'charm'],
};
const DIE_NAMES = ['the Ox', 'the Beast', 'the Seer', 'the Augur', 'the Pelt', 'the Maw'];
const DEPTH_BONUS = { from: 3, base: 3, step: 3, on: true };   // #16 mirror of play.js — escalating depth reward (keep verbatim-equivalent)

// #11 v5G procedural hands — MIRROR of play.js startingHand (keep verbatim-equivalent). No rng →
// canonical (the pre-gen pool + default sweeps use the canonical hand); pass an rng for a seeded run.
const DIE_NAME_POOLS = {
  body:   ['the Ox','the Bull','the Hide'],
  mind:   ['the Seer','the Owl','the Lantern'],
  spirit: ['the Psalm','the Candle','the Vigil'],
  charm:  ['the Pelt','the Purse','the Smile'],
  fang:   ['the Maw','the Grin','the Hunger'],
  mana:   ['the Wick','the Ember','the Breath'],
  mixed:  ['the Stray','the Mongrel','the Patchwork'],
};
function startingHand(rng) {
  const hand = {
    dice: Object.values(HAND_TEMPLATES).map((syms, i) => ({
      name: DIE_NAMES[i],
      faces: syms.map(s => ({ symbol: s, mag: 1, state: 'live' })),
    })),
  };
  if (!rng) return hand;                                       // canonical (no seed) — back-compat
  const leanOf = d => { const c={}; d.faces.forEach(f=>c[f.symbol]=(c[f.symbol]||0)+1); return Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0]; };
  const swaps = 2 + Math.floor(rng()*2);
  for (let s=0; s<swaps; s++){
    const a = Math.floor(rng()*hand.dice.length); let b = Math.floor(rng()*hand.dice.length); if (b===a) b=(b+1)%hand.dice.length;
    const da=hand.dice[a], db=hand.dice[b];
    const ok = (d,fi) => { const f=d.faces[fi]; if (f.symbol==='fang') return false; const lean=leanOf(d); return !(f.symbol===lean && d.faces.filter(x=>x.symbol===lean).length<=1); };
    const ai = Math.floor(rng()*da.faces.length), bi = Math.floor(rng()*db.faces.length);
    if (!ok(da,ai) || !ok(db,bi)) continue;
    const t = da.faces[ai].symbol; da.faces[ai].symbol = db.faces[bi].symbol; db.faces[bi].symbol = t;
  }
  const used = new Set();
  hand.dice.forEach(d=>{
    const c={}; d.faces.forEach(f=>c[f.symbol]=(c[f.symbol]||0)+1);
    const top = Object.entries(c).sort((x,y)=>y[1]-x[1]);
    const key = (top[0][1]>1) ? top[0][0] : top[Math.floor(rng()*top.length)][0];
    const pool = (DIE_NAME_POOLS[key]||DIE_NAME_POOLS.mixed).filter(n=>!used.has(n));
    const name = pool.length ? pool[Math.floor(rng()*pool.length)] : DIE_NAME_POOLS.mixed[Math.floor(rng()*DIE_NAME_POOLS.mixed.length)];
    used.add(name); d.name = name;
  });
  return hand;
}

// Deep-clone a hand (so Deepen perk doesn't corrupt the shared template).
function cloneHand(hand) {
  return {
    dice: hand.dice.map(d => ({
      ...d,
      faces: d.faces.map(f => ({ ...f })),
    })),
  };
}

// =============================================================================
// SEGMENT POOL — pre-generate segments once for all runs
// =============================================================================
// We generate POOL_SIZE segments per segIndex slot (0..MAX_SEG_SLOT-1).
// Runs draw from slots round-robin by (runSeed % POOL_SIZE).
// The pool seed is independent of the run seed so the two sources of variance
// (segment difficulty/layout vs dice rolls) are orthogonal.

const POOL_SIZE     = 300;   // segments per slot
const MAX_SEG_SLOT  = 20;    // more than enough for any realistic run
const KNOT_POOL_SIZE = 200;  // knot rung sets

let _segPool = null;    // [slotIndex][poolIndex] = segment
let _knotPool = null;   // [poolIndex] = knotRungs

function buildSegmentPool(poolSeed) {
  process.stdout.write('  Pre-generating segment pool');
  const baseHand = startingHand();
  const pool = [];
  for (let si = 0; si < MAX_SEG_SLOT; si++) {
    pool[si] = [];
    const diff = { ...DIFF_BASE };
    for (let pi = 0; pi < POOL_SIZE; pi++) {
      resetShapeMemory();
      const rng = makeRng((poolSeed * 1000003 + si * 7919 + pi * 31337) >>> 0);
      // Apply steady occasionally to sample that difficulty too (every 5th segment)
      const d = pi % 5 === 0 ? { ...diff, floor: diff.floor + 0.10 } : diff;
      pool[si][pi] = generateSegment(baseHand, d, { rng, segIndex: si });
    }
    if ((si + 1) % 5 === 0) process.stdout.write('.');
  }
  process.stdout.write(` (${MAX_SEG_SLOT} slots × ${POOL_SIZE} segs)\n`);

  process.stdout.write('  Pre-generating knot pool');
  const knotPool = [];
  for (let pi = 0; pi < KNOT_POOL_SIZE; pi++) {
    resetShapeMemory();
    knotPool[pi] = generateKnot(baseHand);
    if ((pi + 1) % 50 === 0) process.stdout.write('.');
  }
  process.stdout.write(` (${KNOT_POOL_SIZE} knots)\n\n`);

  return { pool, knotPool };
}

function getSegment(segIndex, runSeed) {
  const slot = Math.min(segIndex, MAX_SEG_SLOT - 1);
  return _segPool[slot][(runSeed * 2654435761 + segIndex * 999983) % POOL_SIZE | 0];
}

function getKnot(runSeed) {
  return _knotPool[(runSeed * 3141592653 + 7) % KNOT_POOL_SIZE | 0];
}

// =============================================================================
// HELPERS
// =============================================================================

// Return a new face pool from currently-kept tray slots.
function keptPool(tray) {
  return tray.filter(t => t.kept).map(t => ({ symbol: t.symbol, mag: t.mag }));
}

// Count pips of a symbol in a face pool (respecting mag).
function pipCount(pool, symbol) {
  return pool.reduce((a, f) => a + (f.symbol === symbol ? (f.mag || 1) : 0), 0);
}

// Does keeping face `f` advance any unmet rung requirement beyond what `kept` already covers?
// Uses pip sums, not face counts, to honour mag correctly.
function advancesAnyRung(f, kept, rungs) {
  if (!f || f.symbol === 'blank') return false;
  const s = sym(f.symbol);
  if (s.isWild) return true;          // fang is always worth keeping (wild joker)
  if (!s.satisfiesRecipe) return false;

  // Check if adding this face lights a new rung or advances toward one
  const testPool = [...kept, { symbol: f.symbol, mag: f.mag || 1 }];
  const { stats: st0, counts: co0 } = tally(kept);
  const { stats: st1, counts: co1 } = tally(testPool);

  for (const rung of rungs) {
    const wasMet = meetsRung(st0, kept, rung, co0).met;
    if (wasMet) continue; // already satisfied — no need to chase it further
    const isMet = meetsRung(st1, testPool, rung, co1).met;
    if (isMet) return true;
    // Partial progress: still short but moving closer
    if (rung.req[f.symbol]) {
      const need = rung.req[f.symbol];
      const have = pipCount(kept, f.symbol);
      if (have < need) return true; // still short on this symbol for this rung
    }
  }
  return false;
}

// Which rungs does a pool currently satisfy?
function metRungs(pool, rungs) {
  const { stats, counts } = tally(pool);
  return rungs.filter(r => meetsRung(stats, pool, r, counts).met);
}

// The chain colour = the most recently resolved segment's colour.
function chainColour(thread) {
  return thread.colours[thread.colours.length - 1] || null;
}

// Deepen: add +1 mag to the best face on die `di` (one that appears most in rung reqs).
function applyDeepen(hand, di, rungs, rng) {
  if (di < 0) return;
  const die = hand.dice[di];
  const cands = die.faces.filter(f => f.state === 'live' && deepenable(f));   // #7 cap at DEEPEN_MAX, never fang/blank (parity with play.js deepenFace)
  if (!cands.length) return;
  // Score each candidate by how often its symbol appears in rung requirements
  let best = cands[0], bestScore = -1;
  for (const f of cands) {
    const score = (rungs || []).reduce((a, r) => a + (r.req[f.symbol] || 0), 0);
    if (score > bestScore) { bestScore = score; best = f; }
  }
  best.mag = (best.mag || 1) + 1;
}

// bloom colours helper
function bloomColoursOf(blooms) {
  const out = new Set();
  for (const b of blooms) {
    if (b.colour) out.add(b.colour);
    (b.colours || []).forEach(c => out.add(c));
  }
  return [...out];
}

// =============================================================================
// POLICY TABLE
// =============================================================================
// Each policy has:
//   keepPolicy(tray, rungs, thread, curses, spinsTaken, rng)
//     → array of die indices (0..5) to mark KEPT after this roll
//   stopPolicy(tray, rungs, thread, rollsLeft, spinsTaken, rng)
//     → true = stop now (resolve), false = spin again
//   perkPolicy(cards, thread, hand, rng)
//     → card object from `cards` to take
//
// tray item: { di, symbol, mag, kept, keptWin, locked }
// =============================================================================

// ---- greedy-broad ----
// Keep every die that advances any rung. Stop the moment ≥1 rung lights.
// Perk preference: Reweave first (more spins = more options), then Glimmer for
// reliable points, then Deepen as a long-term investment.
const policyGreedyBroad = {
  name: 'greedy-broad',
  keepPolicy(tray, rungs, _thread, _curses, _spinsTaken, _rng) {
    const pool = keptPool(tray);          // already-kept pool at entry
    const pending = [];                   // face objects we're adding this pass
    const toKeep = [];
    for (const t of tray) {
      if (t.kept || t.locked || t.symbol === 'blank') continue;
      const f = { symbol: t.symbol, mag: t.mag || 1 };
      if (advancesAnyRung(f, [...pool, ...pending], rungs)) {
        toKeep.push(t.di);
        pending.push(f);
      }
    }
    return toKeep;
  },
  stopPolicy(tray, rungs, _thread, rollsLeft, _spinsTaken, _rng) {
    if (rollsLeft <= 0) return true;
    return metRungs(keptPool(tray), rungs).length >= 1;
  },
  perkPolicy(cards, _thread, _hand, _rng) {
    // Reweave → more spins; Glimmer → flat points; Deepen → die investment; curses last
    const order = ['reweave', 'glimmer', 'steady', 'deepen', 'roll_lock', 'grasping'];
    for (const id of order) { const c = cards.find(c => c.id === id); if (c) return c; }
    return cards[0];
  },
};

// ---- focus-colour ----
// Protect the chain colour. Keep only toward the chain-colour rung and stop
// the moment it lights. If no chain yet, use greedy-broad.
const policyFocusColour = {
  name: 'focus-colour',
  keepPolicy(tray, rungs, thread, curses, spinsTaken, rng) {
    const chain = chainColour(thread);
    if (!chain) return policyGreedyBroad.keepPolicy(tray, rungs, thread, curses, spinsTaken, rng);
    const targetRung = rungs.find(r => r.colour === chain);
    if (!targetRung) return policyGreedyBroad.keepPolicy(tray, rungs, thread, curses, spinsTaken, rng);

    const need = { ...targetRung.req };
    const already = keptPool(tray);
    // Subtract what's already covered
    for (const sym of Object.keys(need)) {
      need[sym] = Math.max(0, need[sym] - pipCount(already, sym));
    }
    const toKeep = [];
    for (const t of tray) {
      if (t.kept || t.locked || t.symbol === 'blank') continue;
      const s = sym(t.symbol);
      if (s.isWild) { toKeep.push(t.di); continue; }
      if (need[t.symbol] && need[t.symbol] > 0) {
        need[t.symbol] -= (t.mag || 1);
        toKeep.push(t.di);
      }
    }
    return toKeep;
  },
  stopPolicy(tray, rungs, thread, rollsLeft, spinsTaken, rng) {
    if (rollsLeft <= 0) return true;
    const chain = chainColour(thread);
    if (!chain) return policyGreedyBroad.stopPolicy(tray, rungs, thread, rollsLeft, spinsTaken, rng);
    const targetRung = rungs.find(r => r.colour === chain);
    if (!targetRung) return metRungs(keptPool(tray), rungs).length >= 1;
    const { stats, counts } = tally(keptPool(tray));
    return meetsRung(stats, keptPool(tray), targetRung, counts).met;
  },
  perkPolicy(cards, _thread, _hand, _rng) {
    // Focus on reweave (more spins to chain) then deepen
    const order = ['reweave', 'deepen', 'steady', 'glimmer', 'roll_lock', 'grasping'];
    for (const id of order) { const c = cards.find(c => c.id === id); if (c) return c; }
    return cards[0];
  },
};

// ---- safe-stop-early ----
// Keep only toward the floor rung (cheapest). Stop the moment ANY rung lights.
const policySafeStopEarly = {
  name: 'safe-stop-early',
  keepPolicy(tray, rungs, _thread, _curses, _spinsTaken, _rng) {
    const floorRung = rungs.find(r => r.tier === 'floor') || rungs[0];
    const need = { ...floorRung.req };
    const already = keptPool(tray);
    for (const sym of Object.keys(need)) {
      need[sym] = Math.max(0, need[sym] - pipCount(already, sym));
    }
    const toKeep = [];
    for (const t of tray) {
      if (t.kept || t.locked || t.symbol === 'blank') continue;
      const s = sym(t.symbol);
      if (s.isWild) { toKeep.push(t.di); continue; }
      if (need[t.symbol] && need[t.symbol] > 0) {
        need[t.symbol] -= (t.mag || 1);
        toKeep.push(t.di);
      }
    }
    return toKeep;
  },
  stopPolicy(tray, rungs, _thread, rollsLeft, _spinsTaken, _rng) {
    if (rollsLeft <= 0) return true;
    return metRungs(keptPool(tray), rungs).length >= 1;
  },
  perkPolicy(cards, _thread, _hand, _rng) {
    // Conservative: steady makes next floor easier; glimmer is reliable points
    const order = ['steady', 'glimmer', 'deepen', 'reweave', 'roll_lock', 'grasping'];
    for (const id of order) { const c = cards.find(c => c.id === id); if (c) return c; }
    return cards[0];
  },
};

// ---- bloom-pusher ----
// Always push for the highest-value rung. Never stop early — use all spins.
const policyBloomPusher = {
  name: 'bloom-pusher',
  keepPolicy(tray, rungs, _thread, _curses, _spinsTaken, _rng) {
    const sorted = [...rungs].sort((a, b) => (b.value || 0) - (a.value || 0));
    const pool = keptPool(tray);
    const toKeep = [];
    for (const t of tray) {
      if (t.kept || t.locked || t.symbol === 'blank') continue;
      const s = sym(t.symbol);
      let keep = false;
      if (s.isWild) {
        keep = true;
      } else if (s.satisfiesRecipe) {
        for (const rung of sorted) {
          if (!rung.req[t.symbol]) continue;
          const have = pipCount([...pool, ...toKeep.map(di => {
            const tt = tray.find(x => x.di === di);
            return tt ? { symbol: tt.symbol, mag: tt.mag || 1 } : null;
          }).filter(Boolean)], t.symbol);
          if (have < rung.req[t.symbol]) { keep = true; break; }
        }
      }
      if (keep) toKeep.push(t.di);
    }
    return toKeep;
  },
  stopPolicy(_tray, _rungs, _thread, rollsLeft, _spinsTaken, _rng) {
    // Never stop early
    return rollsLeft <= 0;
  },
  perkPolicy(cards, _thread, _hand, _rng) {
    const order = ['deepen', 'reweave', 'glimmer', 'steady', 'roll_lock', 'grasping'];
    for (const id of order) { const c = cards.find(c => c.id === id); if (c) return c; }
    return cards[0];
  },
};

// ---- random ----
// Random keep/stop. Each die 50% kept; 40% chance to stop each round.
const policyRandom = {
  name: 'random',
  keepPolicy(tray, _rungs, _thread, _curses, _spinsTaken, rng) {
    return tray
      .filter(t => !t.kept && !t.locked && t.symbol !== 'blank' && rng() < 0.5)
      .map(t => t.di);
  },
  stopPolicy(_tray, _rungs, _thread, rollsLeft, _spinsTaken, rng) {
    if (rollsLeft <= 0) return true;
    return rng() < 0.4;
  },
  perkPolicy(cards, _thread, _hand, rng) {
    return cards[Math.floor(rng() * cards.length)];
  },
};

// ---- perk-aware ----
// greedy-broad keep/stop but prioritises Deepen first, then Reweave, to grow dice.
const policyPerkAware = {
  name: 'perk-aware',
  keepPolicy: (...args) => policyGreedyBroad.keepPolicy(...args),
  stopPolicy: (...args) => policyGreedyBroad.stopPolicy(...args),
  perkPolicy(cards, _thread, _hand, _rng) {
    const order = ['deepen', 'reweave', 'steady', 'glimmer', 'roll_lock', 'grasping'];
    for (const id of order) { const c = cards.find(c => c.id === id); if (c) return c; }
    return cards[0];
  },
};

// Policy registry — add new policies here
const POLICIES = {
  'greedy-broad':    policyGreedyBroad,
  'focus-colour':    policyFocusColour,
  'safe-stop-early': policySafeStopEarly,
  'bloom-pusher':    policyBloomPusher,
  'random':          policyRandom,
  'perk-aware':      policyPerkAware,
};

// =============================================================================
// SINGLE RUN SIMULATION
// =============================================================================
// Returns a metrics object for one complete run against a given policy.
// `runSeed` is used for dice rolls (not for segment generation — segments come
// from the pre-generated pool, making runs fast and deterministic by seed).

function runOnce(policy, runSeed) {
  const rng = makeRng(runSeed);

  // Mutable per-run state
  const hand = cloneHand(startingHand()); // clone so Deepen can modify faces
  const thread = newThread();
  let segIndex = 0;
  let scoreBonus = 0;
  let depthBonus = 0;   // #16 escalating depth reward (mirror of G.depthBonus)
  let bonusSpins = 0;
  let steadyNext = false;
  let handDirty = false;   // #6 set once a Deepen mutates the hand → segments/knot regen against the live hand (parity with play.js startSegment)
  const curses = { rollLock: 0, keepCap: 0 };
  let liveBloomColours = [];

  // Per-run metrics
  let stitchSaves = 0;
  let fangCorruptSegments = 0;
  let snapAtSegment = -1;
  const bloomCounts = { tricolor: 0, threeOfAKind: 0, hatTrick: 0 };
  const perksTaken = [];

  // ---- Roll all loose dice ---------------------------------------------------
  // Mirrors play.js doSpin: for each loose die, Math.floor(rng()*faces.length).
  function rollLoose(tray) {
    return tray.map(t => {
      if (t.kept || t.locked) return t;
      const die = hand.dice[t.di];
      const fi = Math.floor(rng() * die.faces.length);
      const f = die.faces[fi];
      return { ...t, symbol: f.symbol, mag: f.mag || 1, fi };
    });
  }

  // ---- Roll-lock: from 2nd spin on, one loose die locks (play.js doSpin) ----
  function applyRollLock(tray, spinsTaken) {
    if (!curses.rollLock || spinsTaken < 1) return tray;
    const result = tray.slice();
    const cands = result.filter(t => !t.kept && !t.locked && t.symbol !== 'blank');
    let remaining = curses.rollLock;
    while (remaining > 0 && cands.length) {
      const idx = Math.floor(rng() * cands.length);
      const victim = cands.splice(idx, 1)[0];
      const ri = result.findIndex(t => t.di === victim.di);
      if (ri >= 0) result[ri] = { ...result[ri], locked: true };
      remaining--;
    }
    return result;
  }

  // ---- Apply perk effect to run state ---------------------------------------
  function applyPerk(perk, seg) {
    perksTaken.push(perk.id);
    if (perk.kind === 'curse') {
      if (perk.id === 'grasping')  curses.keepCap  = perk.ctx?.keepCap   ?? 2;
      if (perk.id === 'roll_lock') curses.rollLock = perk.ctx?.lockDice  ?? 1;
      applyCurse(thread, null);  // mark last segment cursedHere
      return;
    }
    switch (perk.id) {
      case 'deepen': { const ddi = pickBestDieForDeepen(hand, seg); if (ddi >= 0){ applyDeepen(hand, ddi, seg?.rungs, rng); handDirty = true; } break; }   // #6 a deepen mutates the hand → regen recipes against it
      case 'reweave': bonusSpins += 1; break;
      case 'glimmer': scoreBonus += 3; break;
      case 'steady':  steadyNext = true; break;
    }
  }

  // Pick the die index best suited for Deepen: one whose faces appear in rung reqs.
  function pickBestDieForDeepen(hand, seg) {
    const rungs = seg?.rungs || [];
    let bestDi = -1, bestScore = -1;
    for (let di = 0; di < hand.dice.length; di++) {
      const die = hand.dice[di];
      if (!die.faces.some(f => f.state === 'live' && deepenable(f))) continue;   // #7 skip fully-capped dice (per-FACE cap, not per-die)
      let score = 0;
      for (const f of die.faces) {
        if (!deepenable(f)) continue;
        score += rungs.reduce((a, r) => a + (r.req[f.symbol] || 0), 0);
      }
      if (score > bestScore) { bestScore = score; bestDi = di; }
    }
    return bestDi;   // -1 = every face capped (applyDeepen no-ops)
  }

  // ---- Main run loop: segment by segment until snap -------------------------
  let running = true;

  while (running) {
    // Fetch segment: from the frozen pool normally, but once the hand is deepened, REGENERATE against
    // the live hand so recipes account for the new pips (parity with play.js startSegment; #6). steadyNext
    // is consumed here too (the pool fakes steady for the non-dirty path — a pre-existing divergence).
    let seg;
    if (handDirty) {
      resetShapeMemory();
      const segRng = makeRng((runSeed * 1000003 + segIndex * 7919 + 13) >>> 0);
      const diff = { ...DIFF_BASE };
      if (steadyNext) { diff.floor += 0.10; steadyNext = false; }
      seg = generateSegment(hand, diff, { rng: segRng, segIndex });
    } else {
      seg = getSegment(segIndex, runSeed);
    }
    const rollsAvail = 3 + bonusSpins;
    bonusSpins = 0;

    // Initial tray
    let tray = hand.dice.map((d, di) => ({
      di, symbol: 'blank', mag: 0, fi: 0,
      kept: false, keptWin: -1, locked: false,
    }));

    let rollsLeft = rollsAvail;
    let spinsTaken = 0;
    let resolved = false;
    let snapHere = false;

    // ---- Spin loop ----------------------------------------------------------
    while (!resolved) {
      // Roll-lock from 2nd spin onwards
      if (spinsTaken >= 1) tray = applyRollLock(tray, spinsTaken);

      // Roll all loose dice
      tray = rollLoose(tray);
      rollsLeft--;
      spinsTaken++;

      // Policy keep decision
      let toKeep = policy.keepPolicy(tray, seg.rungs, thread, curses, spinsTaken, rng);

      // Apply Grasping keepCap: limit NEW keeps this spin
      if (curses.keepCap) {
        const alreadyKeptThisSpin = tray.filter(t => t.kept && t.keptWin === spinsTaken - 1).length;
        const capRemaining = Math.max(0, curses.keepCap - alreadyKeptThisSpin);
        toKeep = toKeep.slice(0, capRemaining);
      }

      // Mark dice kept
      for (const di of toKeep) {
        const idx = tray.findIndex(t => t.di === di);
        if (idx >= 0) tray[idx] = { ...tray[idx], kept: true, keptWin: spinsTaken - 1 };
      }

      // Policy stop decision
      const stopNow = policy.stopPolicy(tray, seg.rungs, thread, rollsLeft, spinsTaken, rng);
      if (!stopNow && rollsLeft > 0) continue;

      // ---- doStop equivalent -----------------------------------------------
      const pool = keptPool(tray);
      const res = resolveSegment(pool, seg.rungs);

      if (res.hit < 0) {
        // Would snap — try Stitch in Time (play.js stitchInTime):
        // if any loose (unkept, unlocked) drums remain, re-roll them once
        // and auto-resolve the WHOLE hand's faces.
        const hasLoose = tray.some(t => !t.kept && !t.locked);
        if (hasLoose) {
          const stitchTray = tray.map(t => {
            if (t.kept || t.locked) return t;
            const die = hand.dice[t.di];
            const fi = Math.floor(rng() * die.faces.length);
            const f = die.faces[fi];
            return { ...t, symbol: f.symbol, mag: f.mag || 1, fi };
          });
          const savePool = stitchTray
            .filter(t => t.symbol !== 'blank' && !sym(t.symbol).isWild)   // #12: fangs don't SAVE the stitch (so a stitch is never fang-completed → never forces a curse)
            .map(t => ({ symbol: t.symbol, mag: t.mag || 1 }));
          const stitchRes = resolveSegment(savePool, seg.rungs);

          if (stitchRes.hit >= 0) {
            // Stitch save: continue the thread
            stitchSaves++;
            if (stitchRes.fangLoadBearing) fangCorruptSegments++;
            commitSegment(thread, stitchRes, { stitched: true });

            const blooms = checkBlooms(thread);
            liveBloomColours = bloomColoursOf(blooms);
            for (const b of blooms) {
              recordBloom(thread, b);
              bloomCounts[b.kind] = (bloomCounts[b.kind] || 0) + 1;
              if (b.kind === 'tricolor') bonusSpins += 1;
            }
            const forced = !!stitchRes.fangLoadBearing;   // fang-completion forces a curse (coil retired); a stitch excludes fangs → always false here
            const finish = forced ? 'forced' : (stitchRes.tier === 'floor' ? 'frayed' : 'clean');
            segIndex++;
            if (DEPTH_BONUS.on && segIndex >= DEPTH_BONUS.from) depthBonus += DEPTH_BONUS.base + (segIndex - DEPTH_BONUS.from)*DEPTH_BONUS.step;   // #16
            const cards = drawPerks(finish, rng, 4); // stitch → 4 cards
            const chosen = forced ? (cards.find(c => c.kind === 'curse') || cards[0]) : policy.perkPolicy(cards, thread, hand, rng);   // forced = the fang-curse is mandatory
            applyPerk(chosen, seg);
            resolved = true;
          } else {
            // Stitch also missed → snap
            snapAtSegment = segIndex;
            snapHere = true;
            resolved = true;
          }
        } else {
          // No loose dice → can't stitch, snap immediately
          snapAtSegment = segIndex;
          snapHere = true;
          resolved = true;
        }
      } else {
        // Hit! Commit, check blooms, draw perk. A load-bearing fang forces the curse.
        if (res.fangLoadBearing) fangCorruptSegments++;

        commitSegment(thread, res);

        const blooms = checkBlooms(thread);
        liveBloomColours = bloomColoursOf(blooms);
        for (const b of blooms) {
          recordBloom(thread, b);
          bloomCounts[b.kind] = (bloomCounts[b.kind] || 0) + 1;
          if (b.kind === 'tricolor') bonusSpins += 1;
        }

        const forced = !!res.fangLoadBearing;   // fang-completion forces a curse (coil retired)
        const finish = forced ? 'forced' : (res.tier === 'floor' ? 'frayed' : 'clean');
        segIndex++;
        if (DEPTH_BONUS.on && segIndex >= DEPTH_BONUS.from) depthBonus += DEPTH_BONUS.base + (segIndex - DEPTH_BONUS.from)*DEPTH_BONUS.step;   // #16
        const cards = drawPerks(finish, rng, 3);
        const chosen = forced ? (cards.find(c => c.kind === 'curse') || cards[0]) : policy.perkPolicy(cards, thread, hand, rng);   // forced = the fang-curse is mandatory
        applyPerk(chosen, seg);
        resolved = true;
      }
    }

    if (snapHere) running = false;
  }

  // ---- Knot: free final cast ------------------------------------------------
  // Regenerate the knot against the deepened hand when dirty (parity with play.js snap → generateKnot(G.hand)).
  const knotRungs = handDirty ? generateKnot(hand) : getKnot(runSeed);

  let knotTray = hand.dice.map((d, di) => ({
    di, symbol: 'blank', mag: 0, fi: 0, kept: false, keptWin: -1, locked: false,
  }));
  let knotRollsLeft = 3;
  let knotSpinsTaken = 0;
  let knotDone = false;

  while (!knotDone) {
    if (knotSpinsTaken >= 1) knotTray = applyRollLock(knotTray, knotSpinsTaken);
    knotTray = rollLoose(knotTray);
    knotRollsLeft--;
    knotSpinsTaken++;

    let toKeep = policy.keepPolicy(knotTray, knotRungs, thread, curses, knotSpinsTaken, rng);
    if (curses.keepCap) toKeep = toKeep.slice(0, curses.keepCap);
    for (const di of toKeep) {
      const idx = knotTray.findIndex(t => t.di === di);
      if (idx >= 0) knotTray[idx] = { ...knotTray[idx], kept: true, keptWin: knotSpinsTaken - 1 };
    }

    const stopNow = policy.stopPolicy(knotTray, knotRungs, thread, knotRollsLeft, knotSpinsTaken, rng);
    if (stopNow || knotRollsLeft <= 0) knotDone = true;
  }

  const knotPool = keptPool(knotTray);
  const knotResult = resolveKnot(knotPool, knotRungs, liveBloomColours);

  // ---- Score ----------------------------------------------------------------
  const scored = tallyScore(thread, {
    scoreBonus,
    depthBonus,
    knot: knotResult,
    stitches: stitchSaves,
  });

  // Per-colour win counts
  const colourWins = { body: 0, mind: 0, spirit: 0 };
  for (const o of thread.outcomes) {
    if (o.colour && colourWins[o.colour] !== undefined) colourWins[o.colour]++;
  }

  return {
    score:              scored.score,
    segmentsSurvived:   thread.length,
    snapAtSegment:      snapAtSegment >= 0 ? snapAtSegment : thread.length,
    knotHit:            knotResult.hit ? 1 : 0,
    knotTight:          knotResult.tight ? 1 : 0,
    knotMetCount:       knotResult.metCount || 0,
    bloomTricolor:      bloomCounts.tricolor,
    bloomThreeOfAKind:  bloomCounts.threeOfAKind,
    bloomHatTrick:      bloomCounts.hatTrick,
    fangCorruptSegments,
    stitchSaves,
    colourWinBody:      colourWins.body,
    colourWinMind:      colourWins.mind,
    colourWinSpirit:    colourWins.spirit,
    combosFired:        scored.combos.map(c => c.label),
    perksTaken,
  };
}

// =============================================================================
// STATISTICS
// =============================================================================

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function median(sorted) {
  const n = sorted.length;
  if (!n) return 0;
  return n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

function percentile(sorted, p) {
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * p))) | 0];
}

function summarize(rows, policyName) {
  const n = rows.length;
  if (!n) return null;

  const scores = rows.map(r => r.score).sort((a, b) => a - b);
  const segs   = rows.map(r => r.segmentsSurvived).sort((a, b) => a - b);
  const snaps  = rows.map(r => r.snapAtSegment);

  const snapDist = {};
  snaps.forEach(s => snapDist[s] = (snapDist[s] || 0) + 1);

  const knotWins   = rows.filter(r => r.knotHit).length;
  const knotTights = rows.filter(r => r.knotTight).length;
  const stitchArr  = rows.map(r => r.stitchSaves);

  const bloomRates = {
    tricolor:     mean(rows.map(r => r.bloomTricolor)),
    threeOfAKind: mean(rows.map(r => r.bloomThreeOfAKind)),
    hatTrick:     mean(rows.map(r => r.bloomHatTrick)),
  };

  const totalSegs = rows.reduce((a, r) => a + r.segmentsSurvived, 0);
  const colourShare = {
    body:   totalSegs ? rows.reduce((a, r) => a + r.colourWinBody, 0)   / totalSegs : 0,
    mind:   totalSegs ? rows.reduce((a, r) => a + r.colourWinMind, 0)   / totalSegs : 0,
    spirit: totalSegs ? rows.reduce((a, r) => a + r.colourWinSpirit, 0) / totalSegs : 0,
  };

  const comboFreq = {};
  rows.forEach(r => (r.combosFired || []).forEach(c => comboFreq[c] = (comboFreq[c] || 0) + 1));
  const topCombos = Object.entries(comboFreq)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([k, v]) => `${k}(${v})`);

  const medSeg = median(segs);
  const segFlag = medSeg < 5 ? ' *** SHORT (target 5-7)' : medSeg > 7 ? ' *** LONG (target 5-7)' : '';

  // Snap distribution: top 6 most common snap points
  const snapTop = Object.entries(snapDist)
    .sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([seg, cnt]) => `seg${seg}:${cnt}`).join('  ');

  return {
    policy: policyName, n,
    scoreMean:   mean(scores).toFixed(1),
    scoreMedian: median(scores),
    scoreP10:    percentile(scores, 0.10),
    scoreP90:    percentile(scores, 0.90),
    segsMean:    mean(segs).toFixed(2),
    segsMedian:  medSeg,
    snapTop, snapDist,
    knotWinRate:   (knotWins   / n).toFixed(3),
    knotTightRate: (knotTights / n).toFixed(3),
    bloomRateTricolor:     bloomRates.tricolor.toFixed(3),
    bloomRateThreeOfAKind: bloomRates.threeOfAKind.toFixed(3),
    bloomRateHatTrick:     bloomRates.hatTrick.toFixed(3),
    stitchSaveMean: mean(stitchArr).toFixed(3),
    colourShareBody:   colourShare.body.toFixed(3),
    colourShareMind:   colourShare.mind.toFixed(3),
    colourShareSpirit: colourShare.spirit.toFixed(3),
    topCombos, segFlag,
  };
}

// =============================================================================
// CLI
// =============================================================================

function parseArgs(argv) {
  const out = { runs: 500, policy: 'all', seed: 1, csv: null, json: null };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--runs':   out.runs   = parseInt(argv[i + 1], 10); break;
      case '--policy': out.policy = argv[i + 1]; break;
      case '--seed':   out.seed   = parseInt(argv[i + 1], 10); break;
      case '--csv':    out.csv    = argv[i + 1]; break;
      case '--json':   out.json   = argv[i + 1]; break;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { runs, seed, csv: csvPath, json: jsonPath } = args;

  const policyNames = args.policy === 'all'
    ? Object.keys(POLICIES)
    : args.policy.split(',').map(s => s.trim());

  for (const name of policyNames) {
    if (!POLICIES[name]) {
      console.error(`Unknown policy: "${name}"\nValid: ${Object.keys(POLICIES).join(', ')}`);
      process.exit(1);
    }
  }

  console.log(`\nSpellSpun Monte-Carlo Sim`);
  console.log(`  ${runs} runs × ${policyNames.length} policies  |  base seed ${seed}`);
  console.log(`  policies: ${policyNames.join(', ')}\n`);

  // Pre-generate segments and knots once — the expensive part.
  const poolBefore = Date.now();
  const { pool, knotPool } = buildSegmentPool(seed);
  _segPool  = pool;
  _knotPool = knotPool;
  console.log(`  Pool built in ${((Date.now() - poolBefore) / 1000).toFixed(1)}s\n`);

  const allRows = [];
  const summaries = [];

  for (const name of policyNames) {
    const policy = POLICIES[name];
    const rows = [];
    const t0 = Date.now();

    process.stdout.write(`  Running ${name.padEnd(18)}`);
    for (let i = 0; i < runs; i++) {
      const runSeed = (seed + i) >>> 0;
      try {
        const result = runOnce(policy, runSeed);
        rows.push({ policy: name, seed: runSeed, ...result });
      } catch (err) {
        console.error(`\n  [WARN] policy=${name} seed=${runSeed}: ${err.message}`);
      }
      if ((i + 1) % 200 === 0) process.stdout.write('.');
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    process.stdout.write(` ${rows.length}/${runs} runs (${elapsed}s)\n`);

    allRows.push(...rows);
    const s = summarize(rows, name);
    summaries.push(s);
  }

  // ---- Summary table --------------------------------------------------------
  const W = 102;
  const bar = '='.repeat(W);
  const dsh = '-'.repeat(W);
  console.log(`\n${bar}`);
  console.log('SUMMARY TABLE');
  console.log(bar);
  console.log(
    'Policy'.padEnd(18),
    'N'.padStart(5),
    'Score med'.padStart(10),
    'Score mn'.padStart(9),
    'p10'.padStart(6),
    'p90'.padStart(6),
    'Segs med'.padStart(9),
    'KnotWin'.padStart(8),
    'Stitch/run'.padStart(11),
    'SegFlag',
  );
  console.log(dsh);
  for (const s of summaries) {
    if (!s) continue;
    console.log(
      s.policy.padEnd(18),
      String(s.n).padStart(5),
      String(s.scoreMedian).padStart(10),
      String(s.scoreMean).padStart(9),
      String(s.scoreP10).padStart(6),
      String(s.scoreP90).padStart(6),
      String(s.segsMedian).padStart(9),
      `${(parseFloat(s.knotWinRate)*100).toFixed(1)}%`.padStart(8),
      s.stitchSaveMean.padStart(11),
      s.segFlag,
    );
  }

  // ---- Detailed per-policy --------------------------------------------------
  console.log(`\n${bar}`);
  console.log('DETAILED PER-POLICY');
  console.log(bar);
  for (const s of summaries) {
    if (!s) continue;
    console.log(`
Policy : ${s.policy}
Runs   : ${s.n}
Score  : median=${s.scoreMedian}  mean=${s.scoreMean}  p10=${s.scoreP10}  p90=${s.scoreP90}
Segs   : median=${s.segsMedian}  mean=${s.segsMean}${s.segFlag}
Snap   : ${s.snapTop}
Knot   : win=${(parseFloat(s.knotWinRate)*100).toFixed(1)}%  tight=${(parseFloat(s.knotTightRate)*100).toFixed(1)}%
Blooms : tricolor=${s.bloomRateTricolor}/run  threeOfAKind=${s.bloomRateThreeOfAKind}/run  hatTrick=${s.bloomRateHatTrick}/run
Stitch : saves/run=${s.stitchSaveMean}
Colours: body=${(parseFloat(s.colourShareBody)*100).toFixed(1)}%  mind=${(parseFloat(s.colourShareMind)*100).toFixed(1)}%  spirit=${(parseFloat(s.colourShareSpirit)*100).toFixed(1)}%
Combos : ${s.topCombos.join('  ')}`);
  }

  // ---- One-line per policy (the requested format) ---------------------------
  console.log(`\n${bar}`);
  console.log('ONE-LINE SUMMARY  (median score | median segs | knot win% | stitch-save/run)');
  console.log(bar);
  for (const s of summaries) {
    if (!s) continue;
    console.log(
      `${s.policy.padEnd(18)}  ` +
      `medScore=${String(s.scoreMedian).padStart(5)}  ` +
      `medSegs=${String(s.segsMedian).padStart(4)}${s.segFlag.padEnd(24)}  ` +
      `knotWin=${`${(parseFloat(s.knotWinRate)*100).toFixed(1)}%`.padStart(6)}  ` +
      `stitchSave/run=${s.stitchSaveMean}`
    );
  }
  console.log('');

  // ---- CSV ------------------------------------------------------------------
  if (csvPath) {
    const headers = [
      'policy','seed','score','segmentsSurvived','snapAtSegment',
      'knotHit','knotTight','knotMetCount',
      'bloomTricolor','bloomThreeOfAKind','bloomHatTrick',
      'fangCorruptSegments','stitchSaves',
      'colourWinBody','colourWinMind','colourWinSpirit',
      'combosFired','perksTaken',
    ];
    const csv = [
      headers.join(','),
      ...allRows.map(r => [
        r.policy, r.seed, r.score, r.segmentsSurvived, r.snapAtSegment,
        r.knotHit, r.knotTight, r.knotMetCount,
        r.bloomTricolor, r.bloomThreeOfAKind, r.bloomHatTrick,
        r.fangCorruptSegments, r.stitchSaves,
        r.colourWinBody, r.colourWinMind, r.colourWinSpirit,
        `"${(r.combosFired||[]).join('|')}"`,
        `"${(r.perksTaken||[]).join('|')}"`,
      ].join(',')),
    ].join('\n');
    await writeFile(path.resolve(csvPath), csv, 'utf8');
    console.log(`CSV  → ${path.resolve(csvPath)}`);
  }

  // ---- JSON -----------------------------------------------------------------
  if (jsonPath) {
    await writeFile(path.resolve(jsonPath), JSON.stringify(allRows, null, 2), 'utf8');
    console.log(`JSON → ${path.resolve(jsonPath)}`);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
