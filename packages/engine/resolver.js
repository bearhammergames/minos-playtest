// =============================================================================
// ENCHANTMENT RESOLVER  (Face Enchantments spec §5 — the engineering core)
// -----------------------------------------------------------------------------
// PURE + surface-agnostic. Given a frozen SNAPSHOT of one turn-moment, it
// collects the enchantments that fire, evaluates their conditions, resolves their
// scope to targets, and returns an ORDERED list of effect-actions for the calling
// surface to apply. It NEVER mutates anything and NEVER branches on an
// enchantment id (L0 — it reads only the closed grammar fields).
//
// WHY a pure "return actions" core (not apply-in-place): it lets the same engine
// drive both surfaces (play = tray + live faces; sim = serveKept + live faces)
// via thin adapters, and it makes loop-safety STRUCTURAL — collection happens
// once against the frozen snapshot, so no effect can re-trigger within the moment
// (spec §5.3). The fixed phase order (spec §5.2) is encoded as the action sort.
//
// THE SNAPSHOT CONTRACT (the adapter builds this; see Implementation Plan Phase 1):
//   {
//     moment: 'on_roll'|'on_keep'|'on_reroll'|'on_resolve'|'on_wound',
//     units: [                       // EVERY relevant shown face this moment (firing sources AND targets)
//       { di, fi, seatId,            // canonical face address (di:fi) + stable seat identity
//         ench,                      // the face's enchantment list (read LIVE from hand.dice[di].faces[fi].ench)
//         shownSymbol, mag, state,   // the face's current shown symbol / magnitude / state
//         locked, wounded, kept,     // transient flags conditions may read
//       }, ...
//     ],
//     unitBySeat:    { [seatId]: unit },          // for adjacent/row targeting + adjacency condition
//     neighborsBySeat:{ [seatId]: [seatId,...] }, // from runcore.neighborsOf (Phase 0.5)
//     totals:        { [symbol]: count },         // for the `total` condition (kept row / hand)
//     states:        { pact_charged: bool },      // board states for the `state` condition
//     chosen:        unit | null,                 // for `chosen` scope (player/policy supplies; null = no-op)
//   }
//
// RETURNS: { actions: [ {effect, params, polarity, forced, lifetime, source, target} ], firedCount }
//   ordered by the phase stack; `source`/`target` are {di,fi,seatId}. The surface
//   applies each action through its own representation, defensively (a target may
//   have been rerolled/removed by an earlier-phase action).
//
// ⚠ FROZEN — NOT the live firing path (slice 4, 2026-07-08). The CANONICAL enchantment
// firing path is packages/agent/session.mjs (`fireEnch` + `applyEnchEffect` + the sigil/
// transform/release/ward/expose/echo seams) — it drives the real engine over the JSON
// protocol and is what agents + the web client exercise. This pure resolver is the ORIGINAL
// spec core, kept for a future adopt-or-cut decision (ModifierList v2 §6 attic — "two diverged
// scope resolvers is a standing trap"). Do NOT wire new behaviour onto it or refactor session
// onto it here; keep it in loose parity (e.g. the `random` scope below) until that verdict lands.
// =============================================================================

// Phase stack (spec §5.2): lower rank applies first. Conflicts (e.g. reroll vs
// lock on the same face) resolve by this order, not by a special case.
//   1 release/unlock · 2 reroll · 3 convert · 4 lock · 5 deepen/erode/render · 6 ward/expose
const EFFECT_PHASE = Object.freeze({
  release: 1, reroll: 2, convert: 3, lock: 4,
  deepen: 5, erode: 5, render: 5, ward: 6, expose: 6,
});

// ---- condition gate (spec §2.2). Evaluated ONCE against the frozen snapshot. ----
function conditionHolds(cond, unit, snap) {
  if (!cond) return true;
  switch (cond.kind) {
    case 'adjacency': {              // a neighbor (±1 in the row) shows cond.symbol
      const neigh = snap.neighborsBySeat[unit.seatId] || [];
      return neigh.some(sid => {
        const n = snap.unitBySeat[sid];
        return n && n.shownSymbol === cond.symbol;
      });
    }
    case 'total':                    // the kept row / hand holds >= n of cond.symbol
      return (snap.totals[cond.symbol] || 0) >= cond.n;
    case 'state':                    // a board/self state holds
      if (cond.state === 'pact_charged') return !!(snap.states && snap.states.pact_charged);
      if (cond.state === 'wounded')      return !!unit.wounded;
      if (cond.state === 'locked')       return !!unit.locked;
      return false;
    default:
      return false;                  // out-of-vocab conditions never hold (validateEnchantment guards authoring)
  }
}

// ---- scope -> target units (spec §2.3) ----
function resolveTargets(ench, unit, snap) {
  switch (ench.scope) {
    case 'self':     return [unit];
    case 'adjacent': return (snap.neighborsBySeat[unit.seatId] || [])
                            .map(sid => snap.unitBySeat[sid]).filter(Boolean);
    case 'row':      return snap.units.slice();
    case 'random':   // parity with targetsForScope's 'random'. The frozen resolver has no rng in its
                     // snapshot, so it returns the CANDIDATE other units; the seeded PICK happens in the
                     // canonical session path (session.mjs sigilRandomTargets / targetsForScope).
                     return snap.units.filter(u => u.seatId !== unit.seatId);
    case 'chosen':   return snap.chosen ? [snap.chosen] : [];   // surface supplies; absent => no-op
    default:         return [];
  }
}

// ---- the resolver: frozen snapshot -> ordered effect-actions ----
export function resolveEnchantments(snap) {
  const actions = [];
  const fired = new Set();           // PER-MOMENT fire-once, keyed by the SOURCE ench (di:fi:idx)
  if (!snap || !Array.isArray(snap.units)) return { actions, firedCount: 0 };

  for (const unit of snap.units) {
    const list = unit.ench || [];
    for (let ei = 0; ei < list.length; ei++) {
      const e = list[ei];
      if (!e || e.trigger !== snap.moment) continue;           // trigger must match this moment
      const key = `${unit.di}:${unit.fi}:${ei}`;
      if (fired.has(key)) continue;                            // already fired this moment
      if (!conditionHolds(e.condition, unit, snap)) continue;  // condition gate (frozen snapshot)
      const targets = resolveTargets(e, unit, snap);
      if (!targets.length) continue;                           // nothing to act on (e.g. chosen with no choice)
      fired.add(key);                                          // fire-once: this ench fires (1+ target actions) at most once
      const phase = EFFECT_PHASE[e.effect] ?? 99;
      for (const t of targets) {
        actions.push({
          effect: e.effect,
          params: e.params || {},
          polarity: e.polarity,
          forced: !!e.forced,
          lifetime: e.lifetime || 'permanent',
          source: { di: unit.di, fi: unit.fi, seatId: unit.seatId, enchIdx: ei },
          target: { di: t.di, fi: t.fi, seatId: t.seatId },
          _phase: phase,
        });
      }
    }
  }
  // Fixed phase order (spec §5.2). Stable: collection order is preserved within a phase.
  actions.sort((a, b) => a._phase - b._phase);
  return { actions, firedCount: fired.size };
}

// ---- lifetime expiry (boundary sweep). Removes ench of the given lifetime scope
// from every face. Permanent ench is never swept. Called at the encounter boundary
// (and the stage boundary once Phase 4 stages exist). No-op while no content adds
// non-permanent ench. ----
export function expireEnchantments(hand, scope) {
  if (!hand || !Array.isArray(hand.dice)) return 0;
  let removed = 0;
  for (const d of hand.dice) {
    for (const f of (d.faces || [])) {
      if (f.ench && f.ench.length) {
        const before = f.ench.length;
        f.ench = f.ench.filter(e => (e.lifetime || 'permanent') !== scope);
        removed += before - f.ench.length;
      }
    }
  }
  return removed;
}

// Exposed for tests / adapters that want the canonical ordering.
export const EFFECT_PHASE_RANK = EFFECT_PHASE;
