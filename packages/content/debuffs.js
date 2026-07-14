// =============================================================================
// FACE-DEBUFF REGISTRY  (item D, 2026-06-19)
// -----------------------------------------------------------------------------
// A new CLASS of FACE DEBUFFS — banes that ride a die's FACE (face.debuffs[]),
// orthogonal to face.state. Two sources, two lifetimes:
//   • AGE-RAMP (lifetime 'permanent'): a face scars as the keeper declines. Never
//     youth. Healed by night tending (like a wound). Persists on the heirloom.
//   • PILGRIM-RITE (lifetime 'encounter'): a pilgrim's rite BINDS a die for the
//     encounter only — cleared at the dusk seam. Makes encounters dynamic.
//
// Gated behind FLAGS.faceDebuffs (OFF by default). The assigners check the flag
// FIRST, before any rng() draw, so OFF consumes ZERO randomness. This is a
// PLAY-surface system (like the Phase-7 reroll family): the sim's generatePilgrim
// never calls these assigners, so the bench / golden digest is unaffected.
//
// Each debuff = { kind, lifetime:'permanent'|'encounter', source:'age'|'rite' }.
// The keep/roll/resolve hooks (play.js) READ face.debuffs; this file only owns the
// vocabulary, the pure helpers, and the gated assignment.
// =============================================================================
import { FLAGS } from '../engine/flags.js';
import { STAT_IDS } from './symbols.js';

export const FACE_DEBUFFS = {
  lock_on_roll: { id:'lock_on_roll', label:'Bound',   glyph:'⛓',
                  blurb:'When this face is rolled it binds where it lands — no re-throw. Only the Open Palm frees it.' },
  muted:        { id:'muted',        label:'Muted',   glyph:'⊘',
                  blurb:'This face does not count toward the rite — its pips are ignored at the reckoning.' },
  brittle:      { id:'brittle',      label:'Brittle', glyph:'⩜',
                  blurb:'Keeping this face cracks it — use it and it wounds toward the dark.' },
  veiled:       { id:'veiled',       label:'Veiled',  glyph:'❔',
                  blurb:'This face is hidden until you keep it — you commit to it blind.' },
};
export function debuffMeta(kind){ return FACE_DEBUFFS[kind] || null; }

// Designer-tunable assignment pools per source.
const AGE_POOL  = ['lock_on_roll', 'brittle', 'muted'];          // permanent decline
const RITE_POOL = ['lock_on_roll', 'muted', 'veiled'];           // encounter twists

// Age-frequency (mirrors AFFLICTION_FREQ; never youth). Per-encounter chance a face scars.
const AGE_DEBUFF_FREQ  = { youth: 0, middle: 0.18, old: 0.30, longDark: 0.30 };
// Per-encounter chance a pilgrim's rite binds a die for the encounter.
const RITE_DEBUFF_FREQ = { youth: 0, middle: 0.20, old: 0.25, longDark: 0.25 };

// ── pure helpers (no rng, no flag) ──────────────────────────────────────────
export function debuffsOf(face){ return (face && Array.isArray(face.debuffs)) ? face.debuffs : []; }
export function hasDebuff(face, kind){ return debuffsOf(face).some(d => d.kind === kind); }
export function faceHasPermanentDebuff(face){ return debuffsOf(face).some(d => d.lifetime === 'permanent'); }
export function addDebuff(face, kind, lifetime, source){
  if (!face) return;
  face.debuffs = face.debuffs || [];
  if (face.debuffs.some(d => d.kind === kind)) return;   // never stack the same kind
  face.debuffs.push({ kind, lifetime, source });
}
export function clearEncounterDebuffs(hand){
  if (!hand || !hand.dice) return;
  for (const d of hand.dice) for (const f of d.faces){
    if (f.debuffs && f.debuffs.length) f.debuffs = f.debuffs.filter(x => x.lifetime !== 'encounter');
  }
}
// Night tending removes ONE permanent debuff from a face. Returns the removed entry or null.
export function healOneDebuff(face){
  if (!face || !face.debuffs) return null;
  const i = face.debuffs.findIndex(d => d.lifetime === 'permanent');
  if (i < 0) return null;
  return face.debuffs.splice(i, 1)[0];
}

// ── SOURCES (gated; FLAGS-first so OFF draws ZERO rng) ───────────────────────
// AGE-RAMP — a permanent scar accrues to ONE live face as the keeper declines. Never youth.
export function assignAgeDebuff(hand, phaseName, rng){
  if (!FLAGS.faceDebuffs) return null;
  if (rng() >= (AGE_DEBUFF_FREQ[phaseName] ?? 0)) return null;
  const cands = [];
  hand.dice.forEach((d, di) => d.faces.forEach((f, fi) => {
    if (f.state === 'live' && !faceHasPermanentDebuff(f)) cands.push({ di, fi, f });
  }));
  if (!cands.length) return null;
  const pick = cands[Math.floor(rng() * cands.length)];
  const kind = AGE_POOL[Math.floor(rng() * AGE_POOL.length)];
  addDebuff(pick.f, kind, 'permanent', 'age');
  return { di: pick.di, fi: pick.fi, kind };
}
// PILGRIM-RITE — a TEMPORARY bind on a whole DIE (every live face) for THIS encounter,
// so the twist reliably bites. Cleared at the dusk seam. Records pilgrim.riteDebuff for the clause.
export function assignRiteDebuff(pilgrim, hand, phaseName, rng){
  if (!FLAGS.faceDebuffs) return null;
  if (rng() >= (RITE_DEBUFF_FREQ[phaseName] ?? 0)) return null;
  const liveDice = hand.dice.map((d, di) => ({ d, di })).filter(x => x.d.faces.some(f => f.state === 'live'));
  if (!liveDice.length) return null;
  const pick = liveDice[Math.floor(rng() * liveDice.length)];
  const kind = RITE_POOL[Math.floor(rng() * RITE_POOL.length)];
  pick.d.faces.forEach(f => { if (f.state === 'live') addDebuff(f, kind, 'encounter', 'rite'); });
  pilgrim.riteDebuff = { kind, di: pick.di, dieName: pick.d._name || 'a die' };
  return pilgrim.riteDebuff;
}
