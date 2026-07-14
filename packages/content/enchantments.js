// =============================================================================
// ENCHANTMENT REGISTRY  (Face Enchantments / Staged Encounters — v1 substrate)
// -----------------------------------------------------------------------------
// THE LAW (Face Enchantments spec L0): the engine NEVER branches on an
// enchantment's id. It reads ONLY the grammar fields below. Adding an
// enchantment edits ONLY this file. This mirrors the registry/symbols.js
// contract ("the engine reads ONLY flags, never a name/id").
//
// An enchantment is a composition over CLOSED vocabularies (spec §1):
//   Enchantment = Trigger [+ optional Condition] × Scope × Effect × Polarity
//                 (+ forced, cost, params, lifetime)
//
// The vocabularies (§2) are closed. Closing them is the feature, not a limit:
// the win is hundreds of enchantments from ~20 words. If a content piece needs
// a NEW word here, it is a relic wearing a face's clothes — keep it a relic.
//
// STATUS: substrate only. ENCHANTMENTS is intentionally empty — the engine ships
// content-free (Implementation Plan Phase 1) and nothing imports this file yet,
// so adding it is behavior-neutral. The shape below is the authoring surface.
// =============================================================================

import { on } from '../engine/balance.js';   // §7 gate-first read for the erode-bane pool (debt.erode)

// ---- The data shape (the object an author writes) ---------------------------
//   {
//     id:        'string',     // identity/telemetry only; the engine never branches on it
//     trigger:   'on_roll',    // §2.1 — the verb-moment it fires
//     condition: null,         // §2.2 — optional gate: { kind, symbol?, n?, state? }
//     scope:     'self',       // §2.3 — who the effect targets
//     effect:    'convert',    // §2.4 — the verb it bends (ONE effect per enchantment)
//     polarity:  'boon',       // §2.5 — 'boon' (player) | 'bane' (cursed)
//     forced:    false,        // true = fires automatically; false = player may decline / choose
//     lifetime:  'permanent',  // permanent | encounter | stage  (default 'permanent')
//     cost:      {},           // e.g. { fang: 1 } — L3: a fang cost STILL banks the pact (engine enforces)
//     params:    {},           // effect-specific, e.g. { to:'need' } | { pips: 1 }
//   }

// ---- §2.1 Triggers — the verb-moment the enchantment fires -------------------
export const ENCH_TRIGGERS = Object.freeze([
  'on_roll',     // this face comes up on a throw              (verb: roll)
  'on_keep',     // the player banks this face this throw       (verb: keep)
  'on_deselect', // the player sends this KEPT face back        (verb: keep — SpellSpun-added)
  'on_reroll',   // this face is sent back / survives unkept     (verb: reroll)
  'on_resolve',  // this face is counted toward the rite         (verb: resolve)
  'on_wound',    // the toll wounds/takes this face — keystone   (verb: toll — Savage Light only)
]);

// ---- §2.2 Condition kinds — optional gate on the trigger ("Combo") -----------
export const ENCH_CONDITION_KINDS = Object.freeze(['adjacency', 'total', 'state']);
// the board-states a 'state' condition can test:
export const ENCH_STATES = Object.freeze(['locked', 'wounded', 'pact_charged']);

// ---- §2.3 Scope — who the effect targets ------------------------------------
export const ENCH_SCOPES = Object.freeze([
  'self',      // this face only
  'adjacent',  // the die(s) at ±1 in the locked row
  'random',    // a random OTHER die (engine-picked — variance in activation, not effect; L1-safe)
  'row',       // every die in the row  (rare; big; use sparingly)
  'chosen',    // the player picks the target  (ONLY valid when forced:false)
]);

// ---- §2.4 Effects — the verb it bends (one per enchantment) ------------------
export const ENCH_EFFECTS = Object.freeze([
  'reroll',   // throw the target again              (verb: reroll)
  'lock',     // freeze target (no reroll/release)   (verb: keep)     inverse: release
  'release',  // un-keep / unlock target             (verb: keep)     inverse: lock
  'convert',  // change target's symbol              (verb: route)    params: { to }  ('need' = the short stat)
  'deepen',   // +pips to target's mag this rite     (verb: resolve)  params: { pips }  inverse: erode
  'erode',    // −pips from target's mag             (verb: resolve)  params: { pips }  inverse: deepen
  'render',   // target becomes fuel / gold / pact   (verb: economy)  params: { to }
  'ward',     // target takes less from the toll     (verb: toll)     inverse: expose
  'expose',   // target takes more from the toll     (verb: toll)     inverse: ward
]);

// ---- §2.5 Polarity ----------------------------------------------------------
export const ENCH_POLARITIES = Object.freeze(['boon', 'bane']);

// ---- Lifetimes (NET-NEW — Staged spec §8; no prior concept in the codebase) --
//   permanent : lives on the face for good (face-mods, the Grudge)
//   encounter : cleared at the encounter boundary (afflictions, encounter cracks)
//   stage     : cleared at the stage boundary — the shortest-lived (the stage-curse)
// NOTE: 'stage' has no expiry SITE until the staged-encounter loop exists
// (Implementation Plan Phase 4); until then it is authorable but un-expirable.
export const ENCH_LIFETIMES = Object.freeze(['permanent', 'encounter', 'stage']);

// ---- §4 Bane severity BANDS (Modifier Stack §4/§9b — the rider substrate) --------
// The one dial riders, staged curses and wish intensity all draw from. An OPTIONAL
// field on a bane; the engine reads the FIELD, never the id (L1). Station rule
// (§9b): mild rides commons, harsh rides above-station rares, cruel NEVER rides a
// card (curses / late-stage wishes only). See balance.js NUMBERS.baneBands / riderStation.
export const BANE_BANDS = Object.freeze(['mild', 'harsh', 'cruel']);

// ---- The authored set (DATA — pure grammar compositions; the engine NEVER branches
// on these ids, L0). PHASE 7: the transformer relics that fit the frame, expressed as
// face-enchantments (FaceEnchantments §6 migration; §9 worked examples). They are
// reliable relics no longer — a fished face helps only on throws where it shows (§6.2).
// Authoring these is behavior-neutral until the engine wires their moments + an
// acquisition path puts them on faces (a later slice); the golden path reads face.ench,
// never this registry. Each composes Trigger × [Condition] × Scope × Effect × Polarity.
export const ENCHANTMENTS = Object.freeze({
  // The Open Hand  (= the Open Palm relic, §9). When you bank this face, you MAY release
  // a chosen kept face back to the pool — the undo verb, now fished. chosen ⇒ forced:false.
  open_hand:      { id:'open_hand',      trigger:'on_keep',    condition:null, scope:'chosen', effect:'release', polarity:'boon', forced:false, lifetime:'permanent', cost:{}, params:{} },
  // Renderer's Mark  (= the Tallow-Render relic, §9). When counted toward the rite, this
  // face renders ITSELF to fuel instead — surplus into mana, self-scoped (no chooser).
  renderers_mark: { id:'renderers_mark', trigger:'on_resolve', condition:null, scope:'self',   effect:'render',  polarity:'boon', forced:false, lifetime:'permanent', cost:{}, params:{ to:'fuel' } },
  // Bone Carver  (= the Carver relic). At resolution, convert a chosen off-symbol kept
  // face into the symbol the recipe is short on (reuses shortestNeed). chosen ⇒ forced:false.
  bone_carver:    { id:'bone_carver',    trigger:'on_resolve', condition:null, scope:'chosen', effect:'convert', polarity:'boon', forced:false, lifetime:'permanent', cost:{}, params:{ to:'need' } },
  // The Whetstone  (= the Whetstone relic). At resolution, grind a chosen kept face +1 pip
  // (deepen). The finishing stone for concentration rungs, now fished. chosen ⇒ forced:false.
  the_whetstone:  { id:'the_whetstone',  trigger:'on_resolve', condition:null, scope:'chosen', effect:'deepen',  polarity:'boon', forced:false, lifetime:'permanent', cost:{}, params:{ pips:1 } },

  // ── THE REROLL FAMILY (NEW content — the agency/risk set the test players asked for;
  // ids/labels are PLACEHOLDER, the designer renames freely). ONE effect (reroll) across
  // three scopes, all on the on_keep moment. `forced:false` is load-bearing: banking the
  // carrying face only OFFERS the reroll — an explicit player/policy action INVOKES it, so
  // keeping never auto-rerolls (the mulligan needs its own click). reroll re-throws a whole
  // die. Wired via runcore.fireOnKeep (Phase-7 reroll slice; `jostle`/adjacent wired first).
  //   jostle      — bank this → re-throw a seating-row NEIGHBOR die (placement synergy; full parity)
  //   second_wind — bank this → re-throw its OWN die (the mulligan; opt-in)
  //   loaded_die  — bank this → re-throw a CHOSEN die (max agency; play-only, sim parity gap)
  jostle:       { id:'jostle',       trigger:'on_keep', condition:null, scope:'adjacent', effect:'reroll', polarity:'boon', forced:false, lifetime:'permanent', cost:{}, params:{} },
  second_wind:  { id:'second_wind',  trigger:'on_keep', condition:null, scope:'self',     effect:'reroll', polarity:'boon', forced:false, lifetime:'permanent', cost:{}, params:{} },
  loaded_die:   { id:'loaded_die',   trigger:'on_keep', condition:null, scope:'chosen',   effect:'reroll', polarity:'boon', forced:false, lifetime:'permanent', cost:{}, params:{} },
});

export function enchantment(id) { return ENCHANTMENTS[id] || null; }

// ---- validateEnchantment — enforces L0 (closed vocabulary) -------------------
// Returns { ok:true } or { ok:false, errors:[...] }. It checks ONLY the grammar:
// membership in the closed sets plus the structural rules the engine relies on.
// It deliberately does NOT judge params depth or balance — that is the
// grief-clause authoring filter (spec §8), a separate human/checklist gate that
// an in-vocab enchantment can still fail.
export function validateEnchantment(e) {
  const errors = [];
  if (!e || typeof e !== 'object') return { ok: false, errors: ['enchantment must be an object'] };

  if (typeof e.id !== 'string' || !e.id) errors.push('id must be a non-empty string');

  if (!ENCH_TRIGGERS.includes(e.trigger))     errors.push(`trigger '${e.trigger}' not in vocabulary`);
  if (!ENCH_SCOPES.includes(e.scope))         errors.push(`scope '${e.scope}' not in vocabulary`);
  if (!ENCH_EFFECTS.includes(e.effect))       errors.push(`effect '${e.effect}' not in vocabulary`);
  if (!ENCH_POLARITIES.includes(e.polarity))  errors.push(`polarity '${e.polarity}' not in vocabulary`);
  if (typeof e.forced !== 'boolean')          errors.push('forced must be a boolean');

  // lifetime defaults to 'permanent' (face-mods omit it); reject any other absent/bad value
  const lifetime = e.lifetime == null ? 'permanent' : e.lifetime;
  if (!ENCH_LIFETIMES.includes(lifetime))     errors.push(`lifetime '${e.lifetime}' not in vocabulary`);

  // band is OPTIONAL (banes only); when present it must be in the closed set (§4).
  if (e.band != null && !BANE_BANDS.includes(e.band)) errors.push(`band '${e.band}' not in vocabulary`);

  // condition: null OR { kind, ... } drawn from the closed set (§2.2)
  if (e.condition != null) {
    const c = e.condition;
    if (typeof c !== 'object') {
      errors.push('condition must be null or an object');
    } else if (!ENCH_CONDITION_KINDS.includes(c.kind)) {
      errors.push(`condition.kind '${c && c.kind}' not in vocabulary`);
    } else if (c.kind === 'adjacency') {
      if (typeof c.symbol !== 'string' || !c.symbol) errors.push('adjacency condition needs a symbol');
    } else if (c.kind === 'total') {
      if (typeof c.symbol !== 'string' || !c.symbol) errors.push('total condition needs a symbol');
      if (typeof c.n !== 'number' || c.n <= 0)       errors.push('total condition needs n > 0');
    } else if (c.kind === 'state') {
      if (!ENCH_STATES.includes(c.state)) errors.push(`state condition '${c && c.state}' not in vocabulary`);
    }
  }

  // §2.3 cross-field rule: 'chosen' is the agency knob — only when the player has a choice.
  if (e.scope === 'chosen' && e.forced === true) {
    errors.push("scope 'chosen' requires forced:false (the player must own the choice)");
  }

  // structural sanity on the open-ended fields (params depth is content's job, not L0's)
  if (e.cost != null && typeof e.cost !== 'object')     errors.push('cost must be an object');
  if (e.params != null && typeof e.params !== 'object') errors.push('params must be an object');

  return errors.length ? { ok: false, errors } : { ok: true };
}

// Validate every authored entry (called by the unit test / a content-lint step).
// Returns { ok, problems:[{id,errors}] }. No-op while ENCHANTMENTS is empty.
export function validateAll() {
  const problems = [];
  for (const [id, e] of Object.entries(ENCHANTMENTS)) {
    const r = validateEnchantment(e);
    if (!r.ok) problems.push({ id, errors: r.errors });
  }
  return { ok: problems.length === 0, problems };
}

// =============================================================================
// SpellSpun — the ROLL-BASED face enchantment set (replaces the Tier-1 substrate).
// Two CURATED pools over the closed grammar above: six BOONS (the player's
// blessings) and ten BANES (curses). Every entry is a pure composition of
// Trigger × Scope × Effect × Polarity (+ forced + params.count); the engine still
// reads ONLY the grammar (Law L0) — the curated `name` is display metadata, like
// the old scope→name maps. Theme: everything is a "spin".
//
//   BOONS — the on_keep ones fire AUTOMATICALLY (forced:true); the on_roll ones
//           raise an opt-in SPIN-SIGIL the player taps to fire (forced:false ⇒
//           offered, see play.js offerReroll/#14).
//   BANES — always forced (auto). reroll = "spun against you"; lock = "frozen".
//           params.count = how many random drums (the "…×2" curses); scope 'row'
//           = every other drum (the whirlwind).
// Pure: no DOM, rng injected.
// =============================================================================
export const SS_TRIGGERS = Object.freeze(['on_roll', 'on_keep']);
export const SS_SCOPES   = Object.freeze(['self', 'adjacent', 'random', 'row', 'chosen']);

// Fallback glyph for any ad-hoc grammar composition (the pools below carry curated
// per-family glyphs). These two are broadly-rendered (no bundled font needed).
export function glyphForEnch(e){ return e.effect === 'lock' ? '⊗' : '↻'; }

// ---- The six BOONS (faces the player WANTS) ---------------------------------
//   on_keep → AUTO (forced). on_roll → an opt-in spin-sigil (forced:false).
//   glyph = a distinct arcane sigil (bundled 16-glyph subset of Noto Sans Symbols 2;
//   see fonts/fonts.css + the unicode-range). Boons = radiant stars + the sun.
const BOON_POOL = [
  { name:'Free Spin',           trigger:'on_keep', scope:'random',   effect:'reroll', forced:true,  params:{},        weight:5, glyph:'✦' }, // four-point star
  { name:'Sister Spin',         trigger:'on_keep', scope:'adjacent', effect:'reroll', forced:true,  params:{},        weight:5, glyph:'✶' }, // six-point star (paired)
  // The on_roll boons raise a tappable ACTION sigil — they use true ALCHEMICAL glyphs (U+1F7xx) for a
  // distinct identity. These are NOT in the bundled subset (no free alchemical font was obtainable), so
  // they fall through ENCH_FONT to the OS symbol font (Segoe UI Symbol / Apple Symbols) — accepted tofu
  // risk on bare Linux. Swap to bundled glyphs if an alchemical font is ever added.
  { name:'Flanking Spin',       trigger:'on_roll', scope:'adjacent', effect:'reroll', forced:false, params:{},        weight:4, glyph:'🝓' }, // neighbours
  { name:'Wild Spin',           trigger:'on_roll', scope:'random',   effect:'reroll', forced:false, params:{},        weight:4, glyph:'🜛' }, // random
  { name:'Respin',              trigger:'on_roll', scope:'self',     effect:'reroll', forced:false, params:{},        weight:4, glyph:'↻' }, // self (clockwise arrow — reads "spin again"; OS-rendered)
  { name:'Spinwright’s Choice', trigger:'on_roll', scope:'chosen',   effect:'reroll', forced:false, params:{},        weight:1, glyph:'🜤' }, // choice (prestige; rare)
];
// ---- The ten BANES (curses — all forced/auto) -------------------------------
//   glyph = the heavier line-sigils: the eight I-Ching trigrams + two asterisks (bundled subset, see fonts.css).
// `band` (§4) tags each bane's severity for the rider/curse/wish dial. Mapped by
// SHAPE (count/lock/adjacency), never id: mild = single soft reroll; harsh = a twin,
// a lock, or a single seize; cruel = adjacent/row locks & twin-locks. Whirlwind is
// authored `cruel` despite its row-reroll grammar (a documented §4 exception — a
// whole-row reroll is as disruptive as a lock).
const BANE_POOL = [
  { name:'Slipspin',          trigger:'on_keep', scope:'random',   effect:'reroll', forced:true, params:{count:1}, band:'mild',  weight:5, glyph:'☴' }, // wind
  { name:'Twin Slipspin',     trigger:'on_keep', scope:'random',   effect:'reroll', forced:true, params:{count:2}, band:'harsh', weight:3, glyph:'☵' }, // water
  { name:'Spinlock',          trigger:'on_keep', scope:'random',   effect:'lock',   forced:true, params:{count:1}, band:'harsh', weight:4, glyph:'☶' }, // mountain (still/locked)
  { name:'Binding Spin',      trigger:'on_keep', scope:'adjacent', effect:'lock',   forced:true, params:{},        band:'cruel', weight:3, glyph:'☷' }, // earth
  { name:'Errant Spin',       trigger:'on_roll', scope:'random',   effect:'reroll', forced:true, params:{count:1}, band:'mild',  weight:5, glyph:'☳' }, // thunder
  { name:'Twin Errant Spin',  trigger:'on_roll', scope:'random',   effect:'reroll', forced:true, params:{count:2}, band:'harsh', weight:3, glyph:'☲' }, // fire
  { name:'Whirlwind Spin',    trigger:'on_roll', scope:'row',      effect:'reroll', forced:true, params:{},        band:'cruel', weight:2, glyph:'☱' }, // marsh (every drum) — §4 exception
  { name:'Seized Spin',       trigger:'on_roll', scope:'random',   effect:'lock',   forced:true, params:{count:1}, band:'harsh', weight:4, glyph:'☰' }, // heaven (seized)
  { name:'Twin Seized Spin',  trigger:'on_roll', scope:'random',   effect:'lock',   forced:true, params:{count:2}, band:'cruel', weight:3, glyph:'✳' }, // eight-spoke asterisk
  { name:'Gravespin',         trigger:'on_roll', scope:'adjacent', effect:'lock',   forced:true, params:{},        band:'cruel', weight:1, glyph:'❉' }, // balloon asterisk (the worst + rare)
];

// ---- §7 ERODE BANES (the debt price verb as a bane; ModifierList v2 §2.3 / slice 4) ----------
// erode −1 pip on a random drum, floored at mag 1 ⇒ only a DEEPENED (mag-2) face feels it — elegant
// containment for the deepen economy (the richer your deck, the more this bites). Entered into the
// generateBane pool ONLY when on('debt.erode') (gate-first, below) — flag off ⇒ pool byte-identical.
// `dulling_spin` rides cards (harsh); `twin_dulling_spin` is cruel (NEVER rides — the station rule
// bandForBoon never returns cruel, so it is structurally excluded from card riders). Glyphs reuse the
// bundled trigram subset (mountain / earth — the "wearing down" shapes).
const ERODE_BANES = [
  { name:'Dulling Spin',      trigger:'on_keep', scope:'random', effect:'erode', forced:true, params:{count:1, pips:1}, band:'harsh', weight:3, glyph:'☶' }, // mountain
  { name:'Twin Dulling Spin', trigger:'on_keep', scope:'random', effect:'erode', forced:true, params:{count:2, pips:1}, band:'cruel', weight:2, glyph:'☷' }, // earth
];

let _enchSeq = 0;
function _weightedPick(pool, rng){
  const total = pool.reduce((s,e)=>s+(e.weight||1), 0);
  let r = rng() * total;
  for (const e of pool){ r -= (e.weight||1); if (r < 0) return e; }
  return pool[pool.length-1];
}

// Compose ONE valid enchantment from the curated pools. API unchanged: the perk
// draw calls generateEnchantment(rng,{polarity}); rarity lives in the pool weights.
export function generateEnchantment(rng, opts = {}) {
  const polarity = opts.polarity === 'bane' ? 'bane' : 'boon';
  const spec = _weightedPick(polarity === 'bane' ? BANE_POOL : BOON_POOL, rng);
  const e = {
    trigger: spec.trigger, condition:null, scope: spec.scope, effect: spec.effect,
    polarity, forced: spec.forced, lifetime:'permanent', cost:{},
    params: { ...(spec.params || {}) },
  };
  e.id = `${e.polarity}_${e.effect}_${e.scope}_${e.trigger}${e.params.count ? ('_x'+e.params.count) : ''}_${++_enchSeq}`;
  e.name = spec.name; e.glyph = spec.glyph || glyphForEnch(e); e.desc = describeEnch(e);   // per-family alchemy glyph (fallback to the generic ↻/⊗)
  return e;   // validateEnchantment(e).ok === true by construction
}

// generateBane(rng, {band}) — the rider/curse draw (Modifier Stack §4/§9b). Draws a
// bane from BANE_POOL, optionally filtered to a severity `band` (mild/harsh/cruel),
// weighted + seeded (rng injected). Kept SEPARATE from generateEnchantment (not an
// overload) so the rider path is explicit. Carries the `band` through to the result.
export function generateBane(rng, opts = {}) {
  // §7 gate-first (rng-second): the erode banes join the pool ONLY when on('debt.erode'). Reading the
  // flag draws no rng, so flag-off ⇒ pool === BANE_POOL === byte-identical to before this slice.
  let pool = on('debt.erode') ? BANE_POOL.concat(ERODE_BANES) : BANE_POOL;
  if (opts.band) { const f = pool.filter(b => b.band === opts.band); if (f.length) pool = f; }
  const spec = _weightedPick(pool, rng);
  const e = {
    trigger: spec.trigger, condition:null, scope: spec.scope, effect: spec.effect,
    polarity:'bane', forced:true, lifetime:'permanent', cost:{},
    params: { ...(spec.params || {}) }, band: spec.band,
  };
  e.id = `bane_${e.effect}_${e.scope}_${e.trigger}${e.params.count ? ('_x'+e.params.count) : ''}_${++_enchSeq}`;
  e.name = spec.name; e.glyph = spec.glyph || glyphForEnch(e); e.desc = describeEnch(e);
  return e;   // validateEnchantment(e).ok === true by construction
}

// Grammar-derived name (display fallback; the pools carry the curated names). Kept
// so nameEnch(e) still resolves for any ad-hoc grammar composition.
export function nameEnch(e){
  const twin = ((e.params && e.params.count) || 1) > 1 ? 'Twin ' : '';
  if (e.polarity === 'bane') return twin + (e.effect === 'lock' ? 'Seized Spin' : 'Errant Spin');
  return e.effect === 'lock' ? 'Spinlock' : 'Wild Spin';
}

// The target phrase, built FROM the grammar (count + scope) — never per-id (Law L0).
function _targetPhrase(e){
  if (e.scope === 'self')     return 'this drum';
  if (e.scope === 'adjacent') return 'its neighbouring drums';
  if (e.scope === 'row')      return 'all the other drums';
  if (e.scope === 'chosen')   return 'any drum you choose';
  return ((e.params && e.params.count) || 1) >= 2 ? 'two random drums' : 'a random drum';   // random
}
export function describeEnch(e){
  const tgt   = _targetPhrase(e);
  const count = (e.params && e.params.count) || 1;
  const pips  = (e.params && e.params.pips) || 1;
  const many  = e.scope === 'adjacent' || e.scope === 'row' || count > 1;   // verb agreement
  // Transformer boons (PERMANENT face-mag changes) — fire when the rung resolves. They
  // postdate the reroll/lock family, so they're described here (imperative, scope-agnostic)
  // rather than falling through to the reroll wording. Still grammar-driven (Law L0).
  const grains = pips > 1 ? `${pips} pips` : 'one pip';
  if (e.effect === 'deepen')  return `When this rung resolves, grind ${tgt} ${grains} deeper | permanent.`;
  if (e.effect === 'erode' && e.polarity === 'bane')
                              return `When you keep this face, ${tgt} ${e.scope === 'adjacent' || e.scope === 'row' || count > 1 ? 'lose' : 'loses'} ${grains} | worn down (floor 1 pip).`;
  if (e.effect === 'erode')   return `When this rung resolves, wear ${tgt} down ${grains}.`;
  if (e.effect === 'convert') return `When this rung resolves, recast the symbol on ${tgt} into the colour you need | permanent.`;
  // slice-4 verbs — described BEFORE the on_roll-boon (spin-sigil) fall-through so expose reads as a peek.
  if (e.effect === 'ward')    return `This drum is warded | the next bane that would strike it is refused (the ward is spent).`;
  if (e.effect === 'release') return `When you keep this face, you MAY release a kept drum back to the pool | the undo verb (once per segment).`;
  if (e.effect === 'expose')  return `When this face is spun, a peek-sigil rises | tap it to PEEK ${tgt}'s next throw before you decide.`;
  if (e.trigger === 'on_reroll' && e.effect === 'reroll' && e.polarity === 'boon')
                              return `When a bane rerolls ${tgt}, an echo-sigil rises | tap for one free re-throw.`;
  const when  = e.trigger === 'on_keep' ? 'When you keep this face' : 'When this face is spun';
  if (e.trigger === 'on_roll' && e.polarity === 'boon')
    return `${when}, a spin-sigil rises | tap it to respin ${tgt}.`;
  if (e.effect === 'lock')
    return `${when}, ${tgt} ${many ? 'lock' : 'locks'} | frozen for the rest of this segment.`;
  if (e.polarity === 'bane')
    return `${when}, ${tgt} ${many ? 'are' : 'is'} spun against you.`;
  return `${when}, ${tgt} ${many ? 'respin' : 'respins'} for free.`;   // boon on_keep auto-reroll
}

// Resolve a scope to target die indices. n = die count; di = the die carrying it.
// count = how many to hit for the 'random' scope (the "…×2" curses; default 1).
// 'chosen' returns null — the caller asks the player to pick. rng used for 'random'.
export function targetsForScope(scope, di, n, rng, count = 1){
  if (scope === 'self')     return [di];
  if (scope === 'adjacent') return [di-1, di+1].filter(i => i >= 0 && i < n);
  if (scope === 'row')      return Array.from({length:n}, (_,i)=>i).filter(i => i !== di);
  if (scope === 'random'){
    const o = []; for (let i=0;i<n;i++) if (i !== di) o.push(i);
    const out = [];
    for (let k=0; k < count && o.length; k++) out.push(o.splice(Math.floor(rng()*o.length), 1)[0]);
    return out;
  }
  if (scope === 'chosen')   return null;
  return [];
}
