// =============================================================================
// FEATURE FLAGS  (Implementation Plan Phase 0)
// -----------------------------------------------------------------------------
// Everything in the Face-Enchantments / Staged-Encounters effort ships behind a
// flag, OFF by default, so `main` (play + sim) keeps working at every commit.
//
// Contract:
//   - All flags default to false. Turning one ON must be the ONLY thing that
//     changes behavior for that system.
//   - PLAYER-FACING flags (enchantments, afflictions, stages) stay OFF until
//     that system's telegraph UI ships in the same phase (full-information law,
//     Staged L2 / Ench L2). Sim-side flags may come ON earlier for study runs.
//   - Nothing imports this yet (Phase 0 is content/behaviour-neutral). Later
//     phases import { FLAGS } and gate on it at their seams.
// =============================================================================

export const FLAGS = {
  seating:      false, // Phase 0.5 — stable die identity + fixed adjacency row
  enchantments: true, // NATIVE (on 2026-07-05) — the face-enchantment resolver (banes/riders fire). flip false to isolate
  afflictions:  false, // Phase 3   — affliction-agent + clock at encounter scope
  stages:       false, // Phase 4   — Stabilize / Serve / Seal composed encounter
  faceDebuffs:  false, // item D    — face-debuff class (age-ramp + temporary rite binds). PLAY-only.
};

// Read helper (so callers can `import { flag } from './flags.js'` without
// reaching into the object — keeps the toggle surface explicit).
export function flag(name) { return !!FLAGS[name]; }
