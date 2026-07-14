// =============================================================================
// AFFLICTION REGISTRY  (Staged Encounters spec §2)
// -----------------------------------------------------------------------------
// An affliction is the encounter's AGENT — a bespoke encounter-level clock that
// threatens the loved hand. THE PILGRIM IS NEVER THE ENEMY (Staged L0); her
// affliction is. You fight *for* her, against the thing hurting her.
//
// It is NOT a face enchantment: its two behaviors — a Heat clock and a break —
// are not among the resolver's 9 effects, so the affliction is its own small
// state machine that REUSES the existing crack primitive (`wounded=true`). The
// face-enchantment resolver (resolver.js) is a separate system.
//
// Gated behind FLAGS.afflictions (OFF by default): assignAffliction (generator.js)
// assigns nothing while OFF, so the game + sim are byte-identical with it off.
//
//   clock {name,start,climbPerThrow,breakAt} : Heat starts at `start`, climbs
//        `climbPerThrow` each throw; at Heat >= breakAt the affliction BREAKS.
//   cool {channel,perPip,fallback} : routing a `channel` face to COOL drops Heat
//        by perPip*pips. `fallback` is the cold-dice fuel lever (Staged §7.1).
//        The cool-channel is paired OFF the rite's serve-stat (§2.1) so Stabilize
//        and Serve don't fight over the same faces — assignAffliction enforces it.
//   break {target,effect,scope} : at breakAt, CRACK (wounded=true, never blank —
//        §2.2) the hottest live serve face; scope 'encounter' (the crack heals on
//        success / sets on miss at the boundary — Phase 6; Phase 3 just applies it).
//   handoff {smoldering,raging} : Phase 5 (Staged §3.3) — the Stabilize->Serve seam
//        is permeable (serve faces banked in Stabilize carry into Serve). Stabilize's
//        FINAL Heat grades into a handoff STATE, each applying ONE closed effect to
//        Serve so greed carries a tail (gradeHandoff below):
//          cooled     (Heat 0)   — Serve opens clean; the clock is dormant.
//          smoldering (1..maxHeat)— the hottest carried face is marked HOT: the clock
//                                   revives in Serve and ticks toward cracking exactly
//                                   the face you were greedy for.
//          raging     (> maxHeat) — the clock stays live AND the partial floor lifts
//                                   `floorLift` rung(s) (generator.liftPartialFloor).
// =============================================================================

export const AFFLICTIONS = {
  fever: {
    id: 'fever', name: 'Fever',
    clock: { name: 'Heat', start: 1, climbPerThrow: 1, breakAt: 4 },
    cool:  { channel: 'body', perPip: 1, fallback: 'mana' },
    break: { target: 'hottest_serve_face', effect: 'crack', scope: 'encounter' },
    // Phase 5 — the permeable seam's handoff grammar (Staged §3.3). cooled (Heat 0)
    // is the implicit clean default; smoldering covers 1..maxHeat; raging is hotter.
    handoff: { smoldering: { maxHeat: 2 }, raging: { floorLift: 1 } },
    // {breakAt}/{channel} are filled by the telegraph builder from clock/cool.
    telegraph: 'Her Fever climbs each throw. At Heat {breakAt} it breaks and cracks your hottest face. Cool with {channel}.',
  },
};

export function affliction(id) { return AFFLICTIONS[id] || null; }

// PHASE 5 — grade Stabilize's FINAL Heat into a handoff state (Staged §3.3). PURE
// and shared so BOTH surfaces (play advanceStage / sim runloop) grade identically —
// a one-surface grade would be exactly the drift Phase 0 reconciled. Returns a small
// descriptor the seam applies:
//   markHot  — mark the hottest carried serve face HOT (the clock revives in Serve,
//              the permeability tail that lands the cost on the greedy face — §3.2).
//   floorLift— how many rungs the partial floor lifts (raging only; §3.3).
// A live Serve clock is implied by `markHot` (a hot carried face in play re-ticks it).
export function gradeHandoff(aff, finalHeat) {
  const heat = Math.max(0, finalHeat || 0);
  const h = (aff && aff.handoff) || {};
  if (heat <= 0) return { grade: 'cooled', markHot: false, floorLift: 0 };
  if (heat <= (h.smoldering ? (h.smoldering.maxHeat ?? 2) : 2))
    return { grade: 'smoldering', markHot: true, floorLift: 0 };
  return { grade: 'raging', markHot: true, floorLift: (h.raging ? (h.raging.floorLift ?? 1) : 1) };
}

// The generator's gated assignment pool (age-gated; never youth — Staged L3).
export const AFFLICTION_IDS = ['fever'];

// Validate an affliction definition (authoring guard; mirrors validateEnchantment).
export function validateAffliction(a) {
  const errs = [];
  if (!a || typeof a !== 'object') return { ok: false, errors: ['affliction must be an object'] };
  if (typeof a.id !== 'string' || !a.id) errs.push('id must be a non-empty string');
  if (!a.clock || typeof a.clock.breakAt !== 'number' || a.clock.breakAt <= 0) errs.push('clock.breakAt must be > 0');
  if (!a.clock || typeof a.clock.climbPerThrow !== 'number') errs.push('clock.climbPerThrow must be a number');
  if (!a.clock || typeof a.clock.start !== 'number') errs.push('clock.start must be a number');
  if (!a.cool || typeof a.cool.channel !== 'string' || !a.cool.channel) errs.push('cool.channel must be a symbol id');
  if (!a.break || a.break.effect !== 'crack') errs.push("break.effect must be 'crack' (an affliction never blanks — Staged §2.2)");
  if (!a.break || a.break.scope !== 'encounter') errs.push("break.scope must be 'encounter' (temporary — permanent death is the toll's job)");
  // Phase 5 — the handoff grammar is optional, but if present its bands are closed.
  if (a.handoff) {
    const sm = a.handoff.smoldering, rg = a.handoff.raging;
    if (sm && typeof sm.maxHeat !== 'number') errs.push('handoff.smoldering.maxHeat must be a number');
    if (rg && (typeof rg.floorLift !== 'number' || rg.floorLift < 0)) errs.push('handoff.raging.floorLift must be a number >= 0');
  }
  return errs.length ? { ok: false, errors: errs } : { ok: true };
}
