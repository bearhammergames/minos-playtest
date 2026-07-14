// =============================================================================
// PHYSICS KERNEL  (Generator v2 §1.2 — the single-source guard, slice G1)
// -----------------------------------------------------------------------------
// PURE + id-BLIND. The forced-effect PHYSICS the game runs on, lifted out of
// session.mjs so it has exactly ONE implementation with TWO consumers:
//
//   • consumer #1 — session.mjs (LIVE PLAY): thin G-adapters call these over the
//     real hand/tray; the session keeps every G-coupled concern (events text,
//     pendingSigils/offers, the G.peeked peek STORE, witness tallies, chain state).
//   • consumer #2 — the G2 TRIAL SIMULATOR (next slice): the generator's probes will
//     drive these SAME functions over plain trial data so the probe suffers banes/
//     warps/wards/peeks EXACTLY as the player does — never a re-implemented rule
//     (that would re-create the sim-parity burden the July sim-retirement escaped).
//
// The whole point of G1 is a ZERO-behavior-change refactor: every function draws
// from the passed `rng` in EXACTLY the order the inlined session code did, so a
// fixed-seed run is byte-identical before and after. See docs/Minos_Generator_v2.md
// §1.2 (the shared-kernel rule) and §6 (the G1 row).
//
// CONTRACT SHAPE. Grammar fields in, effects out. Nothing here touches process/DOM,
// reads no module state, and mutates no input it wasn't handed as a working copy —
// it imports ONLY ritual.js (the pure warp-constraint reads it COMPOSES, never
// duplicates), nothing stateful (never session.mjs, spellspun.js's live objects, or
// balance's mutables). The closed effect vocabulary is reroll / lock / erode (the
// forced-bane trio) plus the three warp cores (lockDice / rerollOnRoll / forcedKeep);
// ward + echo are the two standing/offer PREDICATES the banes route through.
// =============================================================================
import { spinConstraints, keepConstraints } from './ritual.js';   // the PURE warp-constraint reads — composed by the warp cores below, NEVER re-derived here

// -----------------------------------------------------------------------------
// THE DIE RE-THROW PRIMITIVE
// -----------------------------------------------------------------------------

// throwFaceIdx(die, rng, peekedIdx?) — the single place a die is thrown again. If a
// peek was pre-drawn for this die (an Augur expose already spent the rng at tap time),
// pass its face index as `peekedIdx`: the throw LANDS that face and consumes NO fresh
// rng (returns consumedPeek:true). Otherwise it draws EXACTLY one rng() — floor(rng()·
// faces). Grammar fields out: { fi, symbol, mag, consumedPeek }.
//   Dual consumers: session's throwFace(di) adapter reads/deletes G.peeked[di] around
//   this call (it owns the peek STORE); the G2 probe passes no peek (a trial never
//   peeks) and just draws. A run with no peek queued draws IDENTICALLY to the inlined
//   original — the byte-neutral contract.
export function throwFaceIdx(die, rng, peekedIdx = null){
  let fi, consumedPeek = false;
  if (peekedIdx != null){ fi = peekedIdx; consumedPeek = true; }   // land the pre-drawn peek (no rng)
  else fi = Math.floor(rng() * die.faces.length);
  const f = die.faces[fi];
  return { fi, symbol: f.symbol, mag: f.mag || 1, consumedPeek };
}

// -----------------------------------------------------------------------------
// THE FORCED FACE-EFFECT TRIO  (the closed vocab: reroll / lock / erode)
// -----------------------------------------------------------------------------
// These own the GUARD + MUTATION MATH of the three forced face effects, over a plain
// tray entry / hand face. Each returns { changed, ... } and mutates nothing: the caller
// (session or probe) applies the result and owns the side-glue (enchFired tally, event
// text, echo). `reroll` is throwFaceIdx (above) — the branch below is only its guard.

// lockEntry(entry) — the forced 'lock' effect. An already-locked entry is a no-op
// (changed:false); else the seized (locked) entry. No rng. The tray-warp `lockDice`
// (rollLockWarp) locks by a different, rng'd selection path — this is the ENCH lock
// (a rune seizes a specific die).
export function lockEntry(entry){
  if (entry.locked) return { changed: false, entry };
  return { changed: true, entry: { ...entry, locked: true } };
}

// rerollGuard(entry) — the 'reroll' effect's precondition: a kept OR locked die is never
// re-thrown (a boon/bane reroll must not undo a bank or fight a lock). True ⇒ the caller
// may throwFaceIdx and replace the entry's symbol/mag/fi; false ⇒ no-op, no rng. Kept a
// separate predicate (not fused with throwFaceIdx) because session owns the peek STORE
// and must decide to draw before consulting it — the guard draws nothing.
export function rerollGuard(entry){
  return !(entry.kept || entry.locked);
}

// erodeMag(face, pips=1) — the forced 'erode' effect's magnitude math (a bane grinds a
// deepened face down). Returns { changed, mag } and mutates nothing. A fang/blank/missing
// face or a face already at mag<=1 has nothing to erode (changed:false); else the new mag,
// FLOORED at 1. Self-contained (re-states the fang/blank guard the session's shared
// deepen/erode branch also applies) so the G2 probe can call it standalone. No rng.
export function erodeMag(face, pips = 1){
  if (!face || face.symbol === 'fang' || face.symbol === 'blank') return { changed: false, mag: face ? (face.mag || 1) : 0 };
  const mag = face.mag || 1;
  if (mag <= 1) return { changed: false, mag };                 // nothing left to erode
  return { changed: true, mag: Math.max(1, mag - pips) };        // floor at 1
}

// -----------------------------------------------------------------------------
// WARD INTERCEPTION  (the standing bane-refuser, presence-checked)
// -----------------------------------------------------------------------------

// wardIndex(face) — the ward PREDICATE + locator: the index of the first `ward` ench on
// this face, or -1. A forced bane (reroll/lock/erode) striking a warded face is refused by
// consuming ONE ward instance (consumeEnchAt below). No rng. Dual consumers: session's
// tryWard reads this then rebuilds face.ench, raises the event, bumps enchFired; the probe
// prices a ward as ≈one bane-firing annulled (Generator v2 §1.1 standing-state count).
export function wardIndex(face){
  return (face && face.ench ? face.ench : []).findIndex(en => en.effect === 'ward');
}

// consumeEnchAt(ench, idx) — return a NEW ench array with the entry at `idx` removed (the
// one-instance consume: ward refuses exactly ONE bane, then it is spent). Input untouched.
export function consumeEnchAt(ench, idx){
  return ench.slice(0, idx).concat(ench.slice(idx + 1));
}

// -----------------------------------------------------------------------------
// ECHO  (the on_reroll offer predicate)
// -----------------------------------------------------------------------------

// echoEnch(face) — the echo PREDICATE: the first offerable on_reroll reroll ench this face
// carries (trigger 'on_reroll', effect 'reroll', not forced), or null. A FORCED bane reroll
// of such a face answers back with a free self-scope reroll offer. No rng. Session's maybeEcho
// consults this, then owns the once-per-spin-window cap (echoUsed) + the offer raise + event;
// the probe uses it to know a bane reroll of an echo face effectively costs the player less.
export function echoEnch(face){
  return (face && face.ench ? face.ench : []).find(en => en.trigger === 'on_reroll' && en.effect === 'reroll' && !en.forced) || null;
}

// -----------------------------------------------------------------------------
// THE SPIN-STEP WARP CORES  (ritual.js constraints → candidate selection over the tray)
// -----------------------------------------------------------------------------
// Each COMPOSES ritual.js's pure constraint reads (spinConstraints / keepConstraints — imported
// above, called here, never re-derived) and does the candidate selection + shape of the warp
// over plain tray data. Pass the ACTIVE warps (the caller assembles them: session's activeWarps()
// = curses + the boss wish; a G2 trial its own). The session keeps the rest of the G-glue (the
// event strings, assigning G.tray, the spin-count gate). One place owns the warp→constraint map.

// rollLockWarp(tray, warps, rng) — the `lockDice` warp (Roll-lock): at spin start, spinConstraints
// (warps).lockCount LOOSE non-blank dice lock at random. Draws rng EXACTLY as the inlined loop —
// one draw per lock, splicing from a shrinking candidate list — and returns the die ids to lock,
// in pick order (the caller maps di→tray index and sets locked:true; deferring that mutation past
// the draws is byte-identical, since locking sets only `locked` and perturbs no later draw).
// lockCount 0 ⇒ [] (no rng). The CALLER owns the `spinsTaken >= 1` gate (a warp does nothing before
// the first spin) and MUST NOT call this at spin 0 — that gate is spin-count state the kernel lacks.
export function rollLockWarp(tray, warps, rng){
  const { lockCount } = spinConstraints(warps);
  if (!lockCount) return [];
  const cands = tray.filter(t => !t.kept && !t.locked && t.symbol !== 'blank');
  const picks = [];
  let remaining = lockCount;
  while (remaining > 0 && cands.length){
    const idx = Math.floor(rng() * cands.length);
    const victim = cands.splice(idx, 1)[0];
    picks.push(victim.di);
    remaining--;
  }
  return picks;
}

// rerollOnRollWarp(tray, warps, throwFn) — the `rerollOnRoll` warp (the Fevered): for each
// spinConstraints(warps).rerolls entry { symbol, count }, the first `count` LOOSE faces of `symbol`
// (scanning the tray in order) reroll once. Symbols process IN ORDER, and each sees the tray as
// mutated by the prior symbols (a die rerolled into a later symbol CAN be re-hit) — faithful to the
// inlined nested loop. `throwFn(di) → { symbol, mag, fi }` owns the rng draw + peek (session's
// throwFace); the kernel itself draws no rng. Returns { tray (a new array), applied:[{ di, symbol,
// nf }] } — applied in draw order, for the caller's events. Empty rerolls ⇒ a tray copy unchanged
// and applied [] (no throwFn calls) — observably identical to the inlined early-return.
export function rerollOnRollWarp(tray, warps, throwFn){
  const { rerolls } = spinConstraints(warps);
  const out = tray.slice();
  const applied = [];
  for (const { symbol, count } of rerolls){
    let remaining = count;
    for (let i = 0; i < out.length && remaining > 0; i++){
      const t = out[i];
      if (t.kept || t.locked || t.symbol !== symbol) continue;
      const nf = throwFn(t.di);
      out[i] = { ...t, symbol: nf.symbol, mag: nf.mag, fi: nf.fi };
      applied.push({ di: t.di, symbol, nf });
      remaining--;
    }
  }
  return { tray: out, applied };
}

// forcedKeepWarp(tray, warps, keptWin) — the `forcedKeep` warp (the Soaked Scholar): rolled faces
// whose symbol is in keepConstraints(warps).forced auto-lock into the kept row (kept:true,
// forced:true, keptWin = the passed window index — session passes G.spinsTaken-1). Skips kept/
// locked/blank and non-forced symbols. Draws NO rng. `forced:true` marks these as the ritual's
// demand, not the player's chosen keep, so they don't consume the manual keepCap budget downstream.
// Returns { tray (a new array), applied:[{ di, symbol }] } in tray order (for the caller's events).
export function forcedKeepWarp(tray, warps, keptWin){
  const { forced } = keepConstraints(warps);
  const applied = [];
  const out = tray.map(t => {
    if (t.kept || t.locked || t.symbol === 'blank' || !forced.includes(t.symbol)) return t;
    applied.push({ di: t.di, symbol: t.symbol });
    return { ...t, kept: true, keptWin, forced: true };
  });
  return { tray: out, applied };
}
