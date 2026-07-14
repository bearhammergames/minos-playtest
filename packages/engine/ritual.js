// =============================================================================
// RITUAL DISPATCH  (Modifier Stack §6 / L3 — the interpreter curses.js was schema for)
// -----------------------------------------------------------------------------
// PURE + id-BLIND (Law L1). A "warp" bends a verb of the ritual (keep / spin / roll).
// This is the interpreter the dormant content/curses.js was always DATA for but never
// had — it reads ONLY the closed-vocab `kind`, never an id. Both the live curses
// (roll_lock / grasping) AND patron wishes are warps: same dispatch, one home. That
// deletes the id-branching duplication + the L1 violation the live curses carried.
//
//   A warp = { kind, params, polarity?, source? }.
//   The surface collects the active warps (curses + the patron's wish) and asks this
//   module what constraints they impose at each fork; it never branches on a warp id.
//
// STATUS: pure. Consumed by agent_cli (the curses migrate onto it; wishes add to it).
// resolver.js is the FACE-enchantment engine; this is the RITUAL-warp engine — siblings.
//
// §6 v2 — the CONSTRAINT species dispatches through the warp fns below (keep/spin/roll).
// TWISTS (change the resolve PHYSICS for one patron) and JACKPOTS (a visible contract paid
// on its own tally line) are their OWN closed vocabularies, interpreted at the bottom of
// this file — still id-BLIND (dispatch on twist.kind / jackpot.kind, never a wish id).
// =============================================================================
import { STAT_IDS } from '../content/symbols.js';   // §6 twist: the kept-pool transform reads the stat-face flag (colours+ingredients), never a symbol id

// The closed ritual-warp vocabulary (§6 species map onto these). MVP-enforced kinds are
// keepCap / lockDice / rollLimit; forcedKeep / rerollOnRoll / lockFirstKeeps are authored
// here (the dispatch returns them) but their surface enforcement lands with later waves.
export const RITUAL_KINDS = Object.freeze([
  'keepCap',        // keep at most N dice per spin            (bends keep)   — the Grasping / grasping
  'lockDice',       // N loose dice lock at the start of a spin (bends spin)  — Roll-lock
  'rollLimit',      // fewer rolls this segment                (bends roll)   — the Hasty One
  'forcedKeep',     // rolled faces of `symbol` lock into kept  (bends keep)   — the Soaked Scholar
  'rerollOnRoll',   // first N faces of `symbol` reroll once     (bends spin)   — the Fevered
  'lockFirstKeeps', // the first N kept stat faces lock          (bends keep)   — the Famished
]);

export function validateWarp(w){
  const errors = [];
  if (!w || typeof w !== 'object') return { ok: false, errors: ['warp must be an object'] };
  if (!RITUAL_KINDS.includes(w.kind)) errors.push(`kind '${w && w.kind}' not in vocabulary`);
  if (w.params != null && typeof w.params !== 'object') errors.push('params must be an object');
  if ((w.kind === 'forcedKeep' || w.kind === 'rerollOnRoll') && !(w.params && w.params.symbol))
    errors.push(`${w.kind} needs params.symbol`);
  return errors.length ? { ok: false, errors } : { ok: true };
}

// keepConstraints(warps) → what the KEEP fork must obey this spin.
//   cap:       max keeps per spin (0 = uncapped) — the STRICTEST if several apply
//   forced:    symbols whose rolled faces auto-lock into the kept row (forcedKeep)
//   lockFirst: the first N kept stat faces lock, unrerollable (lockFirstKeeps)
export function keepConstraints(warps){
  let cap = 0, lockFirst = 0;
  const forced = [];
  for (const w of (warps || [])){
    if (w.kind === 'keepCap'){ const c = w.params?.count ?? 2; cap = cap ? Math.min(cap, c) : c; }
    else if (w.kind === 'forcedKeep' && w.params?.symbol) forced.push(w.params.symbol);
    else if (w.kind === 'lockFirstKeeps') lockFirst = Math.max(lockFirst, w.params?.count ?? 2);
  }
  return { cap, forced, lockFirst };
}

// spinConstraints(warps) → what the SPIN fork must obey.
//   lockCount: how many loose dice lock at the start of each spin (from lockDice)
//   rerolls:   [{symbol,count}] — the first `count` `symbol` faces reroll once (rerollOnRoll)
export function spinConstraints(warps){
  let lockCount = 0;
  const rerolls = [];
  for (const w of (warps || [])){
    if (w.kind === 'lockDice') lockCount += (w.params?.count ?? 1);
    else if (w.kind === 'rerollOnRoll' && w.params?.symbol) rerolls.push({ symbol: w.params.symbol, count: w.params?.count ?? 1 });
  }
  return { lockCount, rerolls };
}

// rollBudget(warps) → { maxRolls } — the ROLL fork: total rolls this segment is capped to
// the STRICTEST rollLimit (null = uncapped; the base 3 + tempo applies).
export function rollBudget(warps){
  let maxRolls = null;
  for (const w of (warps || [])){
    if (w.kind === 'rollLimit'){ const r = w.params?.rolls ?? 2; maxRolls = maxRolls == null ? r : Math.min(maxRolls, r); }
  }
  return { maxRolls };
}

// A compact view for state/telemetry (so a surface can expose the live constraints
// without the caller re-deriving them). Never used for enforcement — that reads the
// three functions above at each fork.
export function warpView(warps){
  const k = keepConstraints(warps), s = spinConstraints(warps), r = rollBudget(warps);
  return { keepCap: k.cap, lockDice: s.lockCount, rollLimit: r.maxRolls,
    forcedKeep: k.forced, rerollOnRoll: s.rerolls, lockFirstKeeps: k.lockFirst };
}

// =============================================================================
// §6 v2 — TWISTS  (a patron that changes the resolve PHYSICS; closed-vocab twist.kind).
// -----------------------------------------------------------------------------
// PURE + id-BLIND. Only 'mirror' transforms the resolve READ (the kept pool); 'veil' and
// 'freeReroll' are INFORMATIONAL / ACTION twists the surface handles (a masked rung / an
// ambient free reroll) and carry no pool transform here — twistKeptPool returns the pool
// UNCHANGED for them (byte-neutral). The mirror transform NEVER mutates the caller's tray/
// hand: it copies the pool at read time (the "transform a copy at read" contract).
export const TWIST_KINDS = Object.freeze(['mirror', 'veil', 'freeReroll', 'rungs']);

// mirrorKeptPool(pool) — The Mirrored One. Among the kept STAT faces (STAT_IDS = colours +
// ingredients; wilds/fangs and blanks are exempt) the TALLEST counts DOUBLE mag and the
// LOWEST counts ZERO. Ties break by TRAY ORDER (earliest index). One stat face ⇒ it just
// doubles. "Counts zero" is implemented by DROPPING the lowest face (a mag-0 face is unsafe:
// the `(mag||1)` idiom throughout the tally would read 0 as 1) — a dropped face contributes
// to no recipe/pip/purity read, which is exactly "counts for nothing at all". Returns a NEW
// array; the input is never mutated.
export function mirrorKeptPool(pool){
  const p = Array.isArray(pool) ? pool : [];
  const idx = [];
  for (let i = 0; i < p.length; i++){ const f = p[i]; if (f && STAT_IDS.includes(f.symbol)) idx.push(i); }
  const out = p.map(f => ({ ...f }));
  if (!idx.length) return out;                                        // no stat face to mirror
  let hi = idx[0];
  for (const i of idx) if ((p[i].mag || 1) > (p[hi].mag || 1)) hi = i;   // tallest: max mag, earliest on tie
  out[hi].mag = (out[hi].mag || 1) * 2;                               // …counts double
  if (idx.length === 1) return out;                                  // a single stat face just doubles
  let lo = -1;
  for (const i of idx){ if (i === hi) continue; if (lo < 0 || (p[i].mag || 1) < (p[lo].mag || 1)) lo = i; }   // lowest among the rest
  return out.filter((_, i) => i !== lo);                             // …counts zero (dropped)
}

// twistKeptPool(twist, pool) — the pool-transforming dispatch. Returns the pool AS-IS (same
// reference, byte-neutral) unless a pool-transforming twist ('mirror') is active. Callers
// treat the result as read-only, so returning the input directly when no transform applies
// is safe and keeps a twist-free run byte-identical.
export function twistKeptPool(twist, pool){
  if (twist && twist.kind === 'mirror') return mirrorKeptPool(pool);
  return pool;
}

// §G4 twist kind 'rungs' — a boss RUNG-CONDITION (a rungSpec the generator composes with). Unlike
// mirror it carries NO resolve-pool transform (twistKeptPool returns the pool AS-IS above, exactly
// like veil/freeReroll) — it bends GENERATION, not resolve physics. twistRungSpec(twist) is the
// id-BLIND accessor the session/generator consume: it returns the twist's rungSpec
// { count?, forbid?, require?, extra?, source:'twist' } for a 'rungs' twist, else null. Pure; reads
// ONLY twist.kind/params (never a wish id), so a boss's condition is dispatched the same closed-vocab way.
export function twistRungSpec(twist){
  if (!twist || twist.kind !== 'rungs') return null;
  const p = twist.params || {};
  const spec = { source: 'twist' };
  if (p.count != null) spec.count = p.count;
  if (Array.isArray(p.forbid))  spec.forbid  = p.forbid.slice();
  if (Array.isArray(p.require)) spec.require = p.require.slice();
  if (Array.isArray(p.extra))   spec.extra   = p.extra.slice();
  return spec;
}

// =============================================================================
// §6 v2 — JACKPOTS  (a visible CONTRACT paid on its own tally line; closed-vocab jackpot.kind).
// -----------------------------------------------------------------------------
// PURE + id-BLIND. Evaluated at patronComplete over the patron's window of outcomes (and, for
// chainAlive, the live trailing colour chain). Returns { met, progress, target } — met drives
// the +n score line; progress/target drive the LIVE contract-progress display. NEVER a hidden
// multiplier: the payout (jackpot.n) is a disclosed additive line the caller adds to the tally.
export const JACKPOT_KINDS = Object.freeze(['spotless', 'chainAlive', 'fangCourt']);

// liveChainLen(colours, frayed) — the trailing same-colour run of the whole thread, DEAD if the
// trailing colour is frayed (a frayed colour cannot hold a chain). Mirrors the chain read the
// witness ctx + stopPreview use, so "chain alive" means the same thing everywhere.
export function liveChainLen(colours, frayed){
  const c = colours || [];
  if (!c.length) return 0;
  const last = c[c.length - 1];
  if (frayed && frayed.has && frayed.has(last)) return 0;
  let len = 0;
  for (let i = c.length - 1; i >= 0 && c[i] === last; i--) len++;
  return len;
}

// evalJackpot(jackpot, ctx) — ctx = { window:[outcomes woven this patronage], colours, frayed, patronLen }.
//   spotless   — met when ZERO corrupt/cursed beads were woven this patronage (progress = the
//                count of bad beads, target 0; met ⇔ progress <= target — the inverse contract).
//   chainAlive — "never break the chain while she watches" (§post-G3 Fix 3): met iff EVERY segment of
//                her patronage extended ONE unbroken, un-corrupt colour chain — her whole window is a
//                monochrome, alive run of length >= patronLen. Arriving with a long chain does NOT
//                pre-satisfy (only HER beads count), and a single break / corrupt / fray during her
//                watch fails it. patronLen-INDEPENDENT (target = her patronage length): always
//                achievable (weave one colour for her whole patronage), never automatic.
//   fangCourt  — met when >= params.n corrupt beads (default 3) were woven this patronage.
export function evalJackpot(jackpot, ctx){
  const win = (ctx && ctx.window) || [];
  if (!jackpot) return { met: false, progress: 0, target: 0, kind: null };
  if (jackpot.kind === 'spotless'){
    const bad = win.filter(o => o && (o.corrupt || o.cursedHere)).length;
    return { met: bad === 0, progress: bad, target: 0, kind: 'spotless' };
  }
  if (jackpot.kind === 'fangCourt'){
    const corrupt = win.filter(o => o && o.corrupt).length;
    const target = (jackpot.params && jackpot.params.n) || 3;
    return { met: corrupt >= target, progress: corrupt, target, kind: 'fangCourt' };
  }
  if (jackpot.kind === 'chainAlive'){
    // target = her patronage length (patronLen). progress = the LEADING run of ONE un-corrupt colour
    // from the start of her window (segments chained so far). met iff the WHOLE window is that unbroken
    // run (>= target) AND its colour is still alive (not frayed). No dependency on the pre-patron chain.
    const target = (ctx && ctx.patronLen) || win.length || (jackpot.params && jackpot.params.len) || 3;
    const c = win.length ? win[0].colour : null;
    let chained = 0;
    for (const o of win){ if (o && o.colour === c && !o.corrupt) chained++; else break; }
    const alive = c != null && !(ctx && ctx.frayed && ctx.frayed.has && ctx.frayed.has(c));
    const met = alive && chained === win.length && chained >= target;
    return { met, progress: chained, target, kind: 'chainAlive' };
  }
  return { met: false, progress: 0, target: 0, kind: jackpot.kind };
}
