// =============================================================================
// SPELLSPUN — SESSION CORE (the pure game state machine; no process, no DOM, no I/O)
//
// The single source of truth for the game loop, extracted from agent_cli.mjs so BOTH
// the Node CLI (agent_cli.mjs — stdin/stdout + demo) AND the web client (apps/client,
// which imports this directly) drive the SAME rules. That is why a Run Record's actions
// replay byte-for-byte: the client records the act() inputs; the CLI replays them here.
//
//   configure(defaults)   — inject run defaults (witness loadout + debug injections)
//   newRun(seed, opts)     — start a run; returns the opening events
//   act(action)            — apply one protocol action → { ok, state?, events?, legal? }
//   serializeState()       — the full state snapshot (AGENT_PLAY.md)
//   legalActions()         — every action valid right now
//
// Imports ONLY the pure rules (engine / spellspun / generator / registry) — safe in any
// ESM host (Node or browser). See packages/agent/AGENT_PLAY.md for the protocol contract.
// =============================================================================

import { makeRng, tally, meetsRung } from '../engine/engine.js';
import { generateSegment, generateKnot, resetShapeMemory } from '../engine/generator.js';
import {
  newThread, resolveSegment, commitSegment, applyCurse,
  checkBlooms, recordBloom, drawPerks, resolveKnot, tallyScore,
  stopPreview, deepenable, DEEPEN_MAX, CURSES,
} from '../engine/spellspun.js';
import { sym, STAT_IDS, COLOUR_IDS } from '../content/symbols.js';
import { on, num, setBalanceOverrides, setDisabledContent, getBalanceOverrides, getDisabledContent } from '../engine/balance.js';
import { flag as engineFlag } from '../engine/flags.js';   // FLAGS reader (aliased — a local CLI-arg `flag` exists below)
import { scoreWitnesses } from '../engine/witness.js';
import { witness } from '../content/witnesses.js';
import { drawLadder } from '../engine/reward_ladder.js';
import { targetsForScope, validateEnchantment, describeEnch, generateBane } from '../content/enchantments.js';   // scope resolver + grammar humanizer + bane draw (fang lien / ladder riders)
import { keepConstraints, rollBudget, warpView, validateWarp, twistKeptPool, evalJackpot, twistRungSpec } from '../engine/ritual.js';   // ritual-warp dispatch (C0: curses + wishes) + §6 v2 twist/jackpot interpreter + §G4 boss rung-condition accessor — spinConstraints now composed inside kernel.js (§G1)
import { generateWish, wish } from '../content/wishes.js';   // patron wishes (§6, behind on('wishes'))
import {   // §G1 the PURE physics kernel — forced-effect/warp cores, shared with the G2 trial simulator (no re-implemented rule)
  throwFaceIdx, lockEntry, rerollGuard, erodeMag, wardIndex, consumeEnchAt, echoEnch,
  rollLockWarp, rerollOnRollWarp, forcedKeepWarp,
} from '../engine/kernel.js';

// =============================================================================
// CONSTANTS — the single transport source of truth (the Monte-Carlo sim is retired;
// these were formerly mirrored in spellspun_sim.mjs — now agent_cli.mjs is authoritative).
// =============================================================================
const DIFF_BASE = { floor: 0.55, true: 0.32, bloom: 0.16 };
const DEPTH_BONUS = { from: 3, base: 3, step: 3, on: true };
// §6/§8 segments per patron — now BALANCE-OWNED (num('wishes.patronLen',3)); read at every
// consumer so the §C0 override channel makes it per-run tunable. patronLen() is the live read.
function patronLen(){ return num('wishes.patronLen', 3); }
const FANG_BANE_BAND = 'harsh';   // the severity of the face-bane a load-bearing fang etches (tunable)

// Run DEFAULTS — the host injects these (agent_cli parses CLI flags into them; the web
// client passes {} or its own). newRun falls back to a DEFAULTS field when an action omits
// it. This REPLACES the module-top process.argv parsing that used to live here — `process`
// is Node-only, so keeping it out of the session is what makes this module browser-safe.
//   { witnesses:[ids], curses:[ids], wish:id, warps:[warp], enchants:[ench], enchTest:bool, sigil:scope,
//     balance:{dotPathKey:value}, disabledContent:[ids] }  ← §8 trim substrate (dev-panel trim state)
let DEFAULTS = {};
export function configure(defaults){ DEFAULTS = defaults || {}; }

// §8 TRIM SUBSTRATE (ModifierList v2 §8 step-1) — apply the run's balance overrides + disabled
// content into balance.js BEFORE any rng is drawn (called at the very top of newRun), so the
// trim deterministically shapes every seeded draw this run. `opts` (the new_run action) wins over
// DEFAULTS (configure). When a channel is UNSET in both, the ambient state is left untouched — so
// the exported balance.js setters (a test, a dev tool) can drive the trim independently of the
// session. Same seed + same trim + same actions ⇒ identical run. Returns the applied snapshot.
function applyRunConfig(opts){
  const balance = (opts.balance !== undefined) ? opts.balance
                : (DEFAULTS.balance !== undefined) ? DEFAULTS.balance : undefined;
  if (balance !== undefined) setBalanceOverrides(balance);
  const disabled = (opts.disabledContent !== undefined) ? opts.disabledContent
                 : (DEFAULTS.disabledContent !== undefined) ? DEFAULTS.disabledContent : undefined;
  if (disabled !== undefined) setDisabledContent(disabled);
  // snapshot the EFFECTIVE ambient trim (post-apply) so the Run Record echo captures what
  // actually shaped the run — whether it came via session config or the direct setters.
  return { balance: getBalanceOverrides(), disabledContent: getDisabledContent() };
}

// Which balance.js event-family gate each witness Event belongs to (§5b). A witness
// fires only if on('witnesses.events.<family>') — which ANDs in the witnesses master.
const WITNESS_EVENT_FAMILY = {
  on_resolve: 'resolve', on_stop_early: 'resolve', on_push: 'resolve', on_snap: 'resolve',
  on_bloom: 'bloom', on_combo: 'combo', on_stitch: 'stitch',
  on_fang_kept: 'fang', on_curse_taken: 'fang',
  on_segment_start: 'segmentStart', on_patron_complete: 'patronComplete',
};

const HAND_TEMPLATES = {
  ox:    ['body',  'body',   'mind'],
  beast: ['body',  'spirit', 'fang'],
  seer:  ['mind',  'spirit', 'mana'],
  augur: ['mind',  'mind',   'spirit'],
  pelt:  ['charm', 'charm',  'body'],
  maw:   ['fang',  'mind',   'charm'],
};
const DIE_NAMES = ['the Ox', 'the Beast', 'the Seer', 'the Augur', 'the Pelt', 'the Maw'];
const DIE_NAME_POOLS = {
  body:   ['the Ox','the Bull','the Hide'],
  mind:   ['the Seer','the Owl','the Lantern'],
  spirit: ['the Psalm','the Candle','the Vigil'],
  charm:  ['the Pelt','the Purse','the Smile'],
  fang:   ['the Maw','the Grin','the Hunger'],
  mana:   ['the Wick','the Ember','the Breath'],
  mixed:  ['the Stray','the Mongrel','the Patchwork'],
};

// v5G procedural hands — mirror of play.js / spellspun_sim.mjs startingHand.
function startingHand(rng) {
  const hand = {
    dice: Object.values(HAND_TEMPLATES).map((syms, i) => ({
      name: DIE_NAMES[i],
      faces: syms.map(s => ({ symbol: s, mag: 1, state: 'live' })),
    })),
  };
  if (!rng) return hand;
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

// =============================================================================
// GAME STATE MACHINE
// phases: segment → (stitch?) → perk → segment … → knot → done
// =============================================================================
let G = null;

function keptPool(tray){ return tray.filter(t => t.kept).map(t => ({ symbol: t.symbol, mag: t.mag })); }

// §6 v2 (greybox feedback) — THE BOSS SEGMENT is a patron's LAST segment
// (segsThisPatron === patronLen - 1). segsThisPatron is stable WITHIN a segment (it only
// increments at the resolve that ends the segment), so this reads correctly at any point of
// the current segment, including startSegment (before the boss segment's first spin). Gated
// on on('wishes') so a wishes-off run is byte-identical (no boss concept exists).
function bossThisPatron(){ return on('wishes') && G.activeWish != null && G.segsThisPatron === patronLen() - 1; }

// the active ritual warps = the run's curses + (ONLY on the BOSS segment) the current patron's
// CONSTRAINT-wish warp. Curse warps (G.curseWarps) stay ALWAYS-ON — they're not wishes. The
// wish still ROLLS at patron start and is visible from segment 1 (informed consent), but its
// PHYSICS only take hold on the boss segment. Twists/jackpots carry no `warp` (nothing added here).
function activeWarps(){ return (bossThisPatron() && G.activeWish.warp) ? [...G.curseWarps, G.activeWish.warp] : G.curseWarps; }

// §6 v2 — the active patron's TWIST spec, ONLY on the boss segment (else null): mirror bends the
// resolve, veil masks the bloom, freeReroll surfaces the free re-throw — all boss-gated the same
// way as the constraint warp. id-BLIND downstream dispatch reads only the closed-vocab twist.kind.
function activeTwist(){ return (bossThisPatron() && G.activeWish.species === 'twist') ? G.activeWish.twist : null; }
// JACKPOTS stay PATRON-WIDE (a goal over the patronage, not physics) — NOT boss-gated: the window,
// live progress, evaluation at patronComplete, and fangCourt's drain suppression all span the patron.
function activeJackpot(){ return G.activeWish && G.activeWish.species === 'jackpot' ? G.activeWish.jackpot : null; }

// does a kept pool meet a rung RIGHT NOW (fangs promoted to wilds) — the metNow/veil read.
function poolMeetsRung(pool, rung){
  const withWild = pool.map(f => f.symbol === 'fang' ? { ...f, symbol:'__wild__' } : f);
  const { stats, counts } = tally(withWild);
  return meetsRung(stats, withWild, rung, counts).met;
}

// §6 v2 veil PLAN (Fix 1 + Fix 2) — the veiled rung is the BLOOM; its LIFT condition is normally the TRUE
// rung ("earn the True, and the veil lifts"). But the §G4 composer can ship a set with NO True (a 2-rung
// rest that dropped True, a boss forbid, etc.), which would leave the veil unliftable all segment. Fix 2:
// with no True, fall back to the LOWEST-VALUE non-veiled rung as the lift condition; if the bloom is the
// ONLY rung, the veil is VOID (there is nothing to hide behind). Returns { bloom, liftRung, void } and is
// used by BOTH the segment-start event genericizer (Fix 1) and the serialize mask so they always agree.
// Pure; rng-free; reads only the emitted rungs (no id branch).
function veilPlan(rungs){
  const bloom = (rungs || []).find(r => r.tier === 'bloom');
  if (!bloom) return { bloom: null, liftRung: null, void: false };        // no bloom to hide (outside Fix 2's scope)
  const others = (rungs || []).filter(r => r !== bloom);
  if (!others.length) return { bloom, liftRung: null, void: true };       // the veiled rung is the ONLY rung → void
  let lift = others.find(r => r.tier === 'true');                          // the natural lift condition
  if (!lift) lift = others.reduce((lo, r) => ((r.value || 0) < (lo.value || 0) ? r : lo), others[0]);   // Fix 2 fallback: lowest-value non-veiled rung
  return { bloom, liftRung: lift, void: false };
}

function newTray(){
  return G.hand.dice.map((d, di) => ({ di, symbol:'blank', mag:0, fi:0, kept:false, keptWin:-1, locked:false }));
}

// Apply a witness EFFECT that the reach economy can price NOW. Only TEMPO is ready: a
// banked spin is priced by the cost-aware generator (readsTempoPower → the probe fits
// harder rungs to the extra roll, so the tempo doesn't ship free — AP#2/§14). REACH waits
// on the snap-band controller to meter it (still OFF; the generator's reachBonus hook is
// left at 0 by design), DRAW-WIDTH on the ladder-width economy, CLEANSE on Phase E — all
// stay recorded (deferred). Gate-first, no rng ⇒ determinism-safe; returns true if applied.
function applyWitnessEffect(e, events){
  if (e.kind === 'tempo' && on('costAwareGenerator.readsTempoPower')){
    G.bonusSpins += e.n || 1;
    events.push(`witness tempo (${e.source}): +${e.n || 1} spin next segment — priced by the generator`);
    return true;
  }
  // §D2 cleanse (second_skin) now has a LIVE channel — it is a STANDING INTERCEPTOR at the fang lien
  // etch site (tryRefuseLien in commitPath, mirroring the ward interceptor), NOT a here-and-now score
  // effect. Return true so the on_curse_taken firing does not push it onto the deferred pile
  // (witnessEffectsDeferred). The actual charge burn + lien refusal happens at the etch site.
  if (e.kind === 'cleanse') return true;
  return false;   // reach → snap-band · drawWidth → width economy (recorded, deferred)
}

// §D2 SECOND SKIN — the deferred cleanse witness finally gets its channel. A WORN 'consuming' cleanse
// witness with remaining charges DRINKS a load-bearing fang's LIEN: consume ONE charge, REFUSE the
// bane etch (it protects the FACE, not the score — the corrupt stamp / cursedHere / score consequences
// all stay). id-BLIND: dispatch on the cleanse payload + consuming scaling, NEVER the witness id.
// Gate-first (witnesses master + the fang event family) and rng-free ⇒ a run not wearing such a
// witness (or with 0 charges) returns false and is byte-identical to before. Charges seed lazily from
// the payload (3) and surface in s.witnesses so the client can show 3→2→1→0; at 0 the witness stays
// worn but inert. Returns true iff the lien was refused (the caller then skips the etch).
function tryRefuseLien(events){
  if (!on('witnesses') || !on('witnesses.events.fang')) return false;
  for (const w of (G.witnesses || [])){
    if (!w.payload || w.payload.kind !== 'cleanse' || w.scaling !== 'consuming') continue;
    let left = (G.witnessCharges[w.id] != null) ? G.witnessCharges[w.id] : (w.payload.charges || 0);
    if (left <= 0){ G.witnessCharges[w.id] = 0; continue; }   // worn but inert — the lien etches
    left -= 1; G.witnessCharges[w.id] = left;
    events.push(`${w.name || w.id} drinks the ink — the lien is refused (${left} left)`);
    return true;
  }
  return false;
}

// ---- Witnesses (Modifier Stack §5b) — passive worth scoring at event sites -------
// scoreWitnesses draws NO rng, so firing witnesses never perturbs the run's rng stream:
// flag-on only adds to thread.witnessScore (a tally line at the end). Gate-first, always.
function fireWitnesses(event, ctx, events){
  if (!G.witnesses || !G.witnesses.length) return;
  if (!on('witnesses.events.' + WITNESS_EVENT_FAMILY[event])) return;   // ANDs in the witnesses master
  ctx.growStacks = G.witnessStacks;
  const r = scoreWitnesses(G.witnesses, event, ctx);
  if (r.delta) G.thread.witnessScore = (G.thread.witnessScore || 0) + r.delta;
  // §4.2 LOUD firing + per-id tallies: a beat per witness that spoke this moment. Every hit
  // bumps its fire count; a scoring hit accrues per-id worth AND announces itself (matching
  // the event-string voice). Effect witnesses (tempo etc.) keep their own effect events below.
  for (const hit of r.hits){
    G.witnessFires[hit.id] = (G.witnessFires[hit.id] || 0) + 1;
    if (hit.delta){
      G.witnessScoreById[hit.id] = (G.witnessScoreById[hit.id] || 0) + hit.delta;
      const w = witness(hit.id);
      events.push(`witness: ${w ? w.name : hit.id} speaks — +${hit.delta}`);
    }
  }
  for (const id of r.firedIds){                                         // advance 'growing' counters (run-long pets)
    const w = witness(id);
    if (w && w.scaling === 'growing') G.witnessStacks[id] = (G.witnessStacks[id] || 0) + 1;
  }
  // Apply what the reach economy can price now (tempo → banked, priced spins); the rest
  // (reach/draw-width/cleanse) stay recorded until their economies land — see applyWitnessEffect.
  let applied = 0;
  for (const e of r.effects){
    if (applyWitnessEffect(e, events)) applied++;
    else G.witnessEffects.push({ ...e, event });
  }
  if (r.effects.length) events.push(`witnesses(${event}): [${applied} applied, ${r.effects.length - applied} deferred]`);
}

// keptPurity — the §4.3 pure-keep gate (The Purist): every kept STAT face shares ONE colour,
// wilds (fang) and blanks excepted — mirroring the pure-shape exemption logic in meetsRung.
// Ingredient/second-colour keeps break it (they can't "share one colour"). Draws no rng.
function keptPurity(pool){
  const stat = (pool || []).filter(f => f && f.symbol !== 'blank' && f.symbol !== 'fang' && STAT_IDS.includes(f.symbol));
  if (!stat.length) return false;                                       // no kept stat faces → nothing to be pure about
  const symbols = new Set(stat.map(f => f.symbol));
  return symbols.size === 1 && COLOUR_IDS.includes([...symbols][0]);    // exactly one shared symbol, and it's a colour
}

// Witness context for a resolved segment. `pool` = the kept faces that answered the
// recipe ({symbol,mag}); res = the resolve result. Fires after the bead+blooms commit.
function witnessResolveCtx(res, pool){
  const th = G.thread, cols = th.colours, cur = res.colour;
  const prev = cols.length >= 2 ? cols[cols.length - 2] : null;         // the bead before this one (already committed)
  const chainExtends = !!prev && prev === cur && !th.frayed.has(cur);
  let chainLen = 0; for (let i = cols.length - 1; i >= 0 && cols[i] === cur; i--) chainLen++;
  const ing = res.ingredients || { charm: 0, mana: 0 };
  const maxDepth = (pool || []).reduce((m, f) => Math.max(m, f.mag || 1), 0);
  return {
    colour: cur, tier: res.tier, spin: G.spinsTaken, metCount: res.metCount || 1,
    chainExtends, chainBreaks: !!prev && prev !== cur, chainLen,
    ingredients: ing, ingredientCount: (ing.charm || 0) + (ing.mana || 0),
    distinctSymbols: new Set((pool || []).map(f => f.symbol)).size,
    colourPips: res.colourPips || 0, depthPips: maxDepth, maxDepth,
    cursedSegments: th.outcomes.filter(o => o.cursedHere).length,
    liveBlooms: G.liveBloomColours.length, threadLength: th.length,
    // §4.3 v2 ctx fields — the stop-decision + fang-dance + purity poles (all from res/G, no rng):
    rollsLeft: G.rollsLeft, fangsKept: res.fangsKept || 0, fangLoadBearing: !!res.fangLoadBearing,
    keptPure: keptPurity(pool),
  };
}

// §6 roll a patron's wish (seeded). rng only ever drawn on the on('wishes') path.
function rollWish(){ return generateWish(G.rng); }

// §6 patron complete — the wish PAYS OUT (a granted verb coupled to what it made scarce,
// never a score delta; Wish Law/AP#6) and a new patron sits with a fresh wish. Fires
// on_patron_complete (the Clean Wrist witness's moment).
function patronComplete(events){
  if (G.activeWish && G.activeWish.payout){
    const p = G.activeWish.payout;
    if (p.kind === 'bonusSpins'){ G.bonusSpins += p.n || 1; events.push(`${G.activeWish.label} pays out: +${p.n || 1} spin`); }
    // cleanse / drawBias payouts land with their systems (later waves)
  }
  // §6 v2 JACKPOT contract — a disclosed score line (accumulated into G.jackpotBonus, paid at the
  // tally as 'Patron jackpot'), NEVER a hidden multiplier. id-blind: dispatch on jackpot.kind.
  const jk = activeJackpot();
  if (jk){
    const r = evalJackpot(jk, { window: G.thread.outcomes.slice(G.patronStartIndex), colours: G.thread.colours, frayed: G.thread.frayed, patronLen: patronLen() });   // Fix 3 — chainAlive scales its target with patronLen
    if (r.met){ G.jackpotBonus += jk.n || 0; events.push(`${G.activeWish.label} is satisfied — +${jk.n || 0}`); }
    else events.push(`${G.activeWish.label} turns away — the contract goes unmet (${r.progress}/${r.target})`);
  }
  // §6 v2 the Generous One's LIEN — her free rerolls are disclosed debt: one MILD bane per 2 uses
  // settles now (the fang-lien pattern). uses accrue ONLY under the freeReroll twist, so this is a
  // no-op (ZERO rng) for every other patron — gate-first. Reset the counter each patron.
  const liens = Math.floor((G.wishRerollUses || 0) / 2);
  if (liens > 0){
    if (engineFlag('enchantments')){
      for (let k = 0; k < liens; k++){
        const bane = generateBane(G.rng, { band: 'mild' });
        const at = attachBane(bane);   // Fix 4 — avoid stacking an identical lien on one face (double-fire)
        events.push(`the Generous One collects — a mild blemish (${bane.name}) settles on die ${at.di} face ${at.fi}`);
      }
    } else events.push(`the Generous One collects — ${liens} mild blemish${liens > 1 ? 'es' : ''} owed (inert — enchantments off)`);
  }
  G.wishRerollUses = 0;
  fireWitnesses('on_patron_complete', { threadLength: G.thread.length, cursedSegments: G.thread.outcomes.filter(o => o.cursedHere).length }, events);
  G.patronIndex++; G.segsThisPatron = 0;
  G.patronStartIndex = G.thread.length;   // §6 v2 the new patron's contract window starts at the next bead
  G.activeWish = rollWish();
  events.push(`a new patron sits (patron ${G.patronIndex + 1}) — their wish: ${G.activeWish.label} — ${G.activeWish.desc}`);
}

function startSegment(events){
  const diff = { ...DIFF_BASE };
  // §G3 — `diff` (DIFF_BASE + the steadyNext floor nudge) is a LEGACY-path input: the band path
  // (on('generator2.band')) ignores `difficulty` entirely (tension is the designed band, §2.1). So the
  // steadyNext blessing ("the next floor comes easier", ease/steady cards) is INERT under the band — it
  // composes rather than fights (an "easier floor" has no meaning when P(snap) is pinned). It stays live
  // on the band-OFF legacy path. The flag is still consumed here (harmless) so a later band-off toggle sees it reset.
  if (G.steadyNext){ diff.floor += 0.10; G.steadyNext = false; }
  const segRng = makeRng((G.seed * 1000003 + G.segIndex * 7919 + 13) >>> 0);
  // Phase B — feed the tempo the player actually has this segment (the banked bonus spins,
  // about to become rollsLeft below) so the cost-aware generator can price it. Priced only
  // when on('costAwareGenerator.readsTempoPower'); otherwise ignored (flag-off neutral).
  // §G2 — the JOINT probe (on('generator2.jointProbe')) also needs what WILL be active for
  // THIS segment: the raw warps (curses + the boss-segment wish warp via activeWarps()), the
  // active twist, and the segment's OFFERED free-rerolls (the Generous One's per-segment free
  // reroll on the boss segment — the `tempo.rerolls` hardcoded-0 hole, now fed real counts).
  // All rng-FREE reads → flag-off byte-identity (generateSegment's legacy path ignores them
  // and `rerolls:0` is unchanged; the extra fields fall through untouched).
  const segTwist = activeTwist();
  const offeredRerolls = (segTwist && segTwist.kind === 'freeReroll') ? 1 : 0;
  // §G3 — the band's POSITION (patron index/position/len). When wishes are on, it IS the patron beat
  // (seg/len/boss); wishes-off (no patron concept) it derives from segIndex so the band still ramps and
  // bounds run length (a defensive fallback — the band assumes the native patron beat). All rng-free.
  const pl = patronLen();
  const patronInfo = on('wishes')
    ? { index: G.patronIndex, position: G.segsThisPatron, len: pl }
    : { index: Math.floor(G.segIndex / pl), position: G.segIndex % pl, len: pl };
  const seg = generateSegment(G.hand, diff, { rng: segRng, segIndex: G.segIndex,
    tempo: { bonusSpins: G.bonusSpins, rerolls: 0, offeredRerolls },
    warps: activeWarps(), twist: segTwist,
    patron: patronInfo, priorEma: G.powerEma,
    liveChainColour: G.thread.colours[G.thread.colours.length - 1] || null });   // §G4 the intent 2-rung rest never idles the live chain (rng-free ⇒ flag-off neutral)
  G.rungs = seg.rungs;
  // §G2/§G3 telemetry (spec §4) — the hand-power scalar + predicted P(snap), and (band-on) the band
  // target / pricedPower / comfort-window flag, stored G-side so serializeState surfaces s.generator
  // (and thus the Run Record). Present ONLY when the joint probe produced them (flag-on) ⇒ a flag-off
  // run leaves these null and serializes unchanged. G.powerEma persists the asymmetric-lag EMA across
  // segments (band-on only; stays null flag-off).
  if (seg.generator){
    G.generatorPower = seg.generator.power; G.generatorPSnap = seg.generator.pSnapPredicted;
    if (seg.generator.powerEma != null) G.powerEma = seg.generator.powerEma;
    G.generatorBand = (seg.generator.pSnapTarget != null)
      ? { pSnapTarget: seg.generator.pSnapTarget, pricedPower: seg.generator.pricedPower,
          window: !!seg.generator.window, fit: seg.generator.fit }
      : null;
    // §G4 the composer's shape of THIS segment: the rested colour (a 2-rung rest) + the rung count.
    // Present ONLY when the composer emitted them (flag-off ⇒ both null ⇒ serializes byte-identically).
    G.generatorRested = seg.generator.rested || null;
    G.generatorRungCount = seg.generator.rungCount || null;
    G.generatorApexDegraded = !!seg.generator.apexDegraded;   // Fix 3 — a forced/intent apex bent to a reachable shape
  }
  // Fix 5a — the god-window (power outpacing the lagged pricedPower) is otherwise INVISIBLE. When the
  // band is on, push ONE event iff the window state CHANGED since the last segment (no spam): it OPENS
  // ("the world lags behind your hand") on a graft, CLOSES ("the world catches up") when pricedPower
  // catches power. Gated on the band block ⇒ a band-off run adds no event (byte-identical). Draws no rng.
  if (G.generatorBand){
    const win = !!G.generatorBand.window;
    if (win !== G.prevWindow){
      events.push(win
        ? 'the world lags behind your hand — your strength outpaces the weave (a comfort window opens)'
        : 'the world catches up — the weave settles back onto your strength (the window closes)');
      G.prevWindow = win;
    }
  }
  G.rollsLeft = num('tempo.baseSpins', 3) + G.bonusSpins; G.bonusSpins = 0;   // ⚖3.12 spin-cap: base budget is a tunable (default 3 ⇒ byte-identical)
  const { maxRolls } = rollBudget(activeWarps());   // §6 a rollLimit wish (the Hasty One) caps the rolls
  if (maxRolls != null) G.rollsLeft = Math.min(G.rollsLeft, maxRolls);
  G.spinsTaken = 0;
  G.tray = newTray();
  G.phase = 'segment';
  G.wishRerollUsedThisSeg = false;   // §6 v2 generous_one — the free reroll refreshes each segment
  G.veilRevealed = false;            // §6 v2 veiled_one — the bloom re-veils each segment (re-earn the True)
  // §slice-4 per-segment enchantment state resets (all gate-first/rng-free — no effect on a clean run):
  G.peeked = {};                     // a dangling expose peek does not survive the segment boundary
  G.releaseUsed = new Set();         // Open Hand refreshes: once per etched face per SEGMENT
  G.echoUsed = new Set();            // echo cap keys by (di:spinsTaken) — reset so a new segment's windows are fresh
  G.keepSpend = {};                  // the keepCap ledger resets (windows are per-segment)
  // §6 v2 VEIL info-hygiene (Fix 1) — when the Veiled One is active, the segment-start "rungs offered"
  // event must NOT leak the veiled bloom's colour/shape/reach (state.rungs masks it, so the event must too).
  // The veil masks EVERY channel while up: the bloom prints generically ("a veiled demand"). void ⇒ nothing
  // to hide (Fix 2), so it prints normally. Computed via the shared veilPlan so event + state always agree.
  const startVeil = (segTwist && segTwist.kind === 'veil') ? veilPlan(G.rungs) : null;
  const startVeilOn = !!(startVeil && startVeil.bloom && !startVeil.void);
  events.push(`segment ${G.segIndex + 1} — ${G.rungs.length} rungs offered: ` +
    G.rungs.map(r => (startVeilOn && r === startVeil.bloom)
      ? 'bloom (a veiled demand)'
      : `${r.tier}${r.tier === 'apex' ? '★' : ''}(${r.colour}${r.concentrated ? '·conc' : ''}${r.pure ? '·pure' : ''}, ~${Math.round((r._p||0)*100)}% reach)`).join(' · '));
  // §G4 the 2-rung rest — a colour idles this segment (chains/blooms in it stall). Disclosed at start.
  // Present only when the composer rested a colour ⇒ a normal 3-rung segment is byte-identical.
  if (G.generatorRested) events.push(`the ${G.generatorRested} thread rests this segment — one fewer way to survive`);
  // Fix 3 — a forced/intent apex whose preferred shape was unreachable bent to a touchable one. Disclosed so
  // "value 10 but reachable" is legible. Present only when the composer degraded an apex ⇒ else byte-identical.
  if (G.generatorApexDegraded) events.push('the apex demand bends to a shape the hand can reach — her ceiling stands (value 10), now touchable');
  // §6 v2 (greybox) — the wish's play-bending physics take hold ONLY on the BOSS (last) segment.
  // Announce it once per patron at boss-segment start (startSegment runs once per segment, and a
  // patron has exactly one boss segment). Gated on bossThisPatron() ⇒ wishes-off is byte-identical.
  if (bossThisPatron()){
    events.push(`the patron leans in — ${G.activeWish.label} takes hold`);
    // Fix 2 — a Veiled One whose composed set left NOTHING to hide behind (the bloom is the only rung): the
    // veil is VOID, disclosed here (no lift condition exists, so the mask would never lift — it falls instead).
    if (startVeil && startVeil.void) events.push('there is nothing to hide behind — the veil falls');
    // §G4 disclose a boss RUNG-CONDITION ('rungs' twist) — the composer bent the set (needs on('generator2.rungs')).
    const rt = (segTwist && segTwist.kind === 'rungs') ? twistRungSpec(segTwist) : null;
    if (rt && on('generator2.rungs')){
      if (rt.forbid && rt.forbid.length) events.push(`her condition: no ${rt.forbid.join('/')} rung answers — the set narrows`);
      if (rt.count != null) events.push(`her condition: ${rt.count} rungs demanded — the ceiling extends`);
    }
  }
  fireWitnesses('on_segment_start', { threadLength: G.thread.length }, events);
}

function newRun(seed, opts = {}){
  seed = (seed === undefined || seed === null) ? (Date.now() & 0x7fffffff) : (seed >>> 0);
  // §8 trim substrate — apply balance overrides + disabled content BEFORE the first rng() draw
  // (startingHand, below, is the first consumer), so the trim deterministically shapes the run.
  const trimConfig = applyRunConfig(opts);
  resetShapeMemory();
  G = {
    seed,
    config: trimConfig,   // §8 the trim state that shaped this run (echoed in serializeState)
    rng: makeRng(seed),
    hand: startingHand(makeRng((seed ^ 0x9e3779b9) >>> 0)),
    thread: newThread(),
    segIndex: 0, phase: 'segment',
    scoreBonus: 0, depthBonus: 0, bonusSpins: 0, steadyNext: false,
    curseWarps: [], activeWish: null,   // C0: ritual warps (curses now; a patron's wish joins them)
    patronIndex: 0, segsThisPatron: 0, patronStartIndex: 0,   // §6 patron beat + the jackpot-contract window (thread index the current patron began at)
    jackpotBonus: 0,                     // §6 v2 accumulated jackpot payout (its own tally line)
    wishRerollUses: 0, wishRerollUsedThisSeg: false,   // §6 v2 generous_one — the run-of-patron lien counter + the once-per-segment latch
    veilRevealed: false,                 // §6 v2 veiled_one — the per-segment bloom-reveal latch
    liveBloomColours: [], stitchSaves: 0, fangCorruptSegments: 0,
    tray: null, rungs: null, rollsLeft: 0, spinsTaken: 0,
    generatorPower: null, generatorPSnap: null,   // §G2 joint-probe telemetry (power + predicted P(snap)); null ⇒ flag-off (serializes unchanged)
    generatorBand: null, powerEma: null,          // §G3 band telemetry (target/pricedPower/window/fit) + the asymmetric-lag EMA (band-on only)
    generatorRested: null, generatorRungCount: null, generatorApexDegraded: false,   // §G4 the composer's per-segment shape (rested colour + rung count) + Fix 3 apex-degrade flag; null/false flag-off
    perkOffer: null, perkForced: false, lastSeg: null,
    knotRungs: null, result: null, over: false,
    witnesses: [], witnessStacks: {}, witnessEffects: [],
    witnessFires: {}, witnessScoreById: {},   // §4.2 per-witness tallies (fires + accumulated worth), for the rich s.witnesses view
    witnessCharges: {},   // §D2 consuming-witness charge ledger (id → remaining charges) — second_skin's cleanse charges; seeded lazily from payload.charges, wiped on slot-replace

    ladderDraw: null, picksRemaining: 1, pendingRiders: [], enchFired: 0,
    pendingTransforms: [], pendingPerk: null,   // chosen-scope transformer choice (the 'transform' phase)
    pendingSigils: [],   // opt-in on_roll offers (reroll spin-sigils + expose peek-sigils — Law L4's tap)
    peeked: {},          // §slice-4 expose (Augur) — di → pre-drawn next face index (consumed on the next re-throw)
    releaseUsed: new Set(),   // §slice-4 release (Open Hand) — etched-face keys "di:fi" spent this segment (once/seg)
    echoUsed: new Set(),      // §slice-4 echo — "di:spinsTaken" keys (echo fires once per spin-window per die)
    keepSpend: {},            // keepCap ledger — window → manual keeps SPENT (release does NOT refund it)
    chainRun: 0,              // §4.1 chain milestone — consecutive same-colour chain-extends (run-long)
    pairSeq: 0,               // §D3 bargain coupling — monotonic per-etch counter → pairId (RESET per run so replays are byte-exact)
    enchSeq: 0,               // Fix 4 — monotonic per-ench instance id (lazily stamped on a shifted bane; rng-free, not serialized)
    shiftedEnch: new Set(),   // Fix 4 — the _enchSeq ids of banes already SHIFTED this run (the bare-auto prefers un-shifted sources)
    lastShift: null,          // Fix 4 — { fromDi,fromFi,toDi,toFi,seq } of the previous shift (the bare-auto never reverses it)
    prevWindow: false,        // Fix 5a — the god-window state at the last segment start (event fires only on a transition)
    events: [],
  };
  // Witness loadout (Modifier Stack §5b) — only when balance.on('witnesses'); otherwise
  // the loadout is ignored and the run is byte-identical to today (flag-off neutrality).
  if (on('witnesses')){
    const ids = (opts.witnesses && opts.witnesses.length) ? opts.witnesses : (DEFAULTS.witnesses || []);
    G.witnesses = ids.map(id => witness(id)).filter(Boolean);
    G.thread.witnessScore = 0;
  }
  // debug: inject a forced on_roll random-reroll bane on all of die 0's faces so the
  // enchantment resolver is observable (fires every spin). Needs engineFlag('enchantments').
  if (engineFlag('enchantments') && (DEFAULTS.enchTest || opts.enchTest)){
    const testBane = { trigger:'on_roll', condition:null, scope:'random', effect:'reroll',
      polarity:'bane', forced:true, lifetime:'permanent', params:{ count:1 }, band:'mild', name:'Test Errant' };
    G.hand.dice[0].faces.forEach(f => { f.ench = [...(f.ench || []), testBane]; });
  }
  // debug: attach transformer-boon enchantments (--enchant / opts.enchants) to die 0's faces so
  // the transformer resolver is observable without an acquisition path (validated; L0 grammar).
  if (engineFlag('enchantments')){
    for (const en of ((opts.enchants && opts.enchants.length) ? opts.enchants : (DEFAULTS.enchants || []))){
      if (!validateEnchantment(en).ok) continue;
      const e = { ...en, name: en.name || `Test ${en.effect}` };
      G.hand.dice[0].faces.forEach(f => { f.ench = [...(f.ench || []), e]; });
    }
  }
  // debug: etch an on_roll forced:false reroll SIGIL of a given scope onto die 0's faces
  // (--sigil self|adjacent|random|chosen). Exercises the opt-in spin-sigil before the reward
  // cards that grant it are drawn. --enchant can't express forced:false for non-chosen scopes.
  if (engineFlag('enchantments')){
    const sc = opts.sigil || DEFAULTS.sigil;
    if (sc){
      // `--sigil expose` etches the Augur peek-sigil (on_roll self expose); any other value etches an
      // on_roll forced:false REROLL sigil of that scope (the original behaviour). Both are offered taps.
      const e = (sc === 'expose')
        ? { id:'debug_sigil_expose', trigger:'on_roll', condition:null, scope:'self', effect:'expose',
            polarity:'boon', forced:false, lifetime:'permanent', cost:{}, params:{}, name:'Test expose sigil' }
        : { id:`debug_sigil_${sc}`, trigger:'on_roll', condition:null, scope:sc, effect:'reroll',
            polarity:'boon', forced:false, lifetime:'permanent', cost:{}, params:{}, name:`Test ${sc} sigil` };
      if (validateEnchantment(e).ok) G.hand.dice[0].faces.forEach(f => { f.ench = [...(f.ench || []), e]; });
    }
  }
  // debug: apply curse warps up front so the C0 ritual dispatch is observable directly.
  for (const id of ((opts.curses && opts.curses.length) ? opts.curses : (DEFAULTS.curses || []))){
    const c = CURSES.find(x => x.id === id);
    if (c && c.warp) G.curseWarps.push(c.warp);
  }
  // debug: raw ritual-warp injection (--warp / opts.warps) so the warp-enforcement surface
  // is observable without the content that carries it (e.g. rerollOnRoll has no content yet).
  for (const w of ((opts.warps && opts.warps.length) ? opts.warps : (DEFAULTS.warps || []))){
    if (validateWarp(w).ok) G.curseWarps.push(w);
  }
  // §6 the first patron's wish (read before sitting) — gated on on('wishes'); off ⇒ no rng, neutral.
  // --wish <id> / opts.wish forces a specific wish (deterministic testing) over the seeded roll.
  if (on('wishes')){
    const forcedWishId = opts.wish || DEFAULTS.wish;
    const forcedWish = forcedWishId ? wish(forcedWishId) : null;
    G.activeWish = forcedWish ? { ...forcedWish } : rollWish();
  }
  const events = [`a patron sits down (seed ${seed}) — spin the Spinner`];
  if (G.activeWish) events.push(`their wish: ${G.activeWish.label} — ${G.activeWish.desc}`);
  startSegment(events);
  return events;
}

// ---- spin ----------------------------------------------------------------------
// The single die RE-THROW primitive (slice-4). Every place a die is thrown again — spin, stitch,
// rerollOnRoll warp, a bane/sigil reroll, wish_reroll — routes through here so the Augur PEEK
// (expose) is consumed airtight: if a peek was pre-drawn for this die (at expose-tap time, which
// already spent the rng), it LANDS here and is consumed, drawing NO fresh rng; otherwise a normal
// seeded draw. A run with no peek queued draws identically to before, so this is byte-neutral.
function throwFace(di){
  // §G1 thin G-adapter over kernel.throwFaceIdx: this owns the G.peeked STORE (the kernel is
  // peek-blind — it just lands a passed peek index or draws). Byte-identical to the inlined
  // primitive: same rng draw iff no peek, same face lookup.
  const die = G.hand.dice[di];
  const peekedIdx = (G.peeked[di] != null) ? G.peeked[di] : null;
  const r = throwFaceIdx(die, G.rng, peekedIdx);
  if (r.consumedPeek) delete G.peeked[di];
  return { symbol: r.symbol, mag: r.mag, fi: r.fi };
}

function applyRollLock(events){
  if (G.spinsTaken < 1) return;   // a warp does nothing before the first spin (spin-count gate — G-side)
  // §G1 kernel.rollLockWarp reads spinConstraints(activeWarps()) then does the rng'd selection; the
  // G-wrapper owns the activeWarps read, the spinsTaken gate above, the tray mutation + events. Locking
  // sets only `locked` (perturbs no draw), so deferring the mutation past the picks is byte-identical.
  for (const di of rollLockWarp(G.tray, activeWarps(), G.rng)){
    const ri = G.tray.findIndex(t => t.di === di);
    if (ri >= 0){ G.tray[ri] = { ...G.tray[ri], locked: true }; events.push(`Roll-lock: die ${di} (${G.tray[ri].symbol}) locks`); }
  }
}

// rerollOnRoll (the Fevered) — the first `count` loose faces of a symbol reel and reroll
// once at the moment of the spin (bends the SPIN verb). Draws rng ONLY when such a warp is
// active (gate-first), so an absent warp perturbs no seed. No content carries it yet — the
// --warp injector exercises it; it is here so the enforcement surface is complete.
function applyRerollOnRoll(events){
  // §G1 kernel.rerollOnRollWarp reads spinConstraints(activeWarps()).rerolls then applies via the
  // throwFn — which IS this session's throwFace (owns the rng draw + G.peeked). Draws in the same
  // order (per-symbol scan, symbols in order, mutated tray seen across symbols), so the stream is
  // byte-identical; empty rerolls ⇒ no throwFace calls (no rng), tray contents unchanged.
  const { tray, applied } = rerollOnRollWarp(G.tray, activeWarps(), di => throwFace(di));
  G.tray = tray;
  for (const a of applied) events.push(`rerollOnRoll: a ${a.symbol} reels and rerolls (die ${a.di} → ${a.nf.symbol})`);
}

// forcedKeep (the Soaked Scholar) — rolled faces of a demanded symbol auto-lock into the
// kept row (bends the KEEP verb). Draws NO rng (only sets flags), so an absent warp is
// byte-neutral. Marked `forced` so it does NOT consume the manual keepCap budget (below):
// a forced keep is the ritual's demand, not the player's chosen keep.
function applyForcedKeep(events){
  // §G1 kernel.forcedKeepWarp reads keepConstraints(activeWarps()).forced then auto-locks matching
  // faces (no rng); the G-wrapper owns the activeWarps read, the keptWin window (spinsTaken-1) and
  // the events. Tray order preserved; empty forced ⇒ contents unchanged.
  const { tray, applied } = forcedKeepWarp(G.tray, activeWarps(), G.spinsTaken - 1);
  G.tray = tray;
  for (const a of applied) events.push(`forced keep: a ${a.symbol} locks itself into the kept row (die ${a.di})`);
}

function doSpin(events){
  G.pendingSigils = [];   // a fresh spin clears last spin's sigils; on_roll re-raises for new faces
  applyRollLock(events);
  G.tray = G.tray.map(t => {
    if (t.kept || t.locked) return t;
    const nf = throwFace(t.di);
    return { ...t, symbol: nf.symbol, mag: nf.mag, fi: nf.fi };
  });
  G.rollsLeft--; G.spinsTaken++;
  applyRerollOnRoll(events);   // C0: rerollOnRoll ritual warp — feverish faces reel (bends spin)
  applyForcedKeep(events);     // C0: forcedKeep ritual warp — demanded faces lock in (bends keep)
  events.push(`spin ${G.spinsTaken}: ` + G.tray.map(t =>
    `${t.di}:${t.symbol}${(t.mag||1)>1?`(${t.mag})`:''}${t.forced?'+':t.kept?'*':t.locked?'!':''}`).join(' '));
  fireEnch('on_roll', events);   // shown faces' on_roll enchantments fire (banes/riders)
}

// ---- resolve / commit ------------------------------------------------------------
function commitPath(res, opts, perkN, events, pool){
  commitSegment(G.thread, res, opts);
  if (res.fangLoadBearing){
    // A load-bearing fang CORRUPTS: the bead is cursed (its neighbours drain — the debt lien stays),
    // and a forced BANE is etched onto a face (the face-local cost — "at least at the start",
    // cleansable later). The bead's `corrupt` flag (set by commitSegment) still breaks blooms below.
    // NO mandatory curse-card and NO run-long keepCap/lockDice warp anymore (§7 debt: a lien, not a tax).
    G.fangCorruptSegments++;
    // §6 v2 fangCourt (The Fang-Fancier) — WHILE SHE WATCHES a load-bearing fang sets NO cursedHere:
    // the corrupt stamp stays (blooms still break, bonuses still excluded), but no neighbour drains —
    // so a deliberate cursed-line build banks toward her jackpot. id-blind: dispatch on jackpot.kind.
    const jk = activeJackpot();
    const fangCourt = !!(jk && jk.kind === 'fangCourt');
    if (!fangCourt){
      applyCurse(G.thread, null);   // mark THIS bead cursedHere → the neighbour drain (no run-long warp)
      fireWitnesses('on_curse_taken', { cursedSegments: G.thread.outcomes.filter(o => o.cursedHere).length, threadLength: G.thread.length }, events);
    }
    if (engineFlag('enchantments')){
      // §D2 second_skin — a WORN consuming-cleanse witness with charges refuses the lien (protects the
      // FACE, not the score): consume a charge, NO bane etch. Gate-first + rng-free, and it runs BEFORE
      // the generateBane draw so a refused lien draws zero rng (a second_skin-worn run is a different
      // loadout, so its divergence from a non-worn run is by design — the corrupt/score consequences above
      // are already committed). Not worn / 0 charges ⇒ tryRefuseLien is false ⇒ the etch path is unchanged.
      if (tryRefuseLien(events)){
        events.push(`a FANG was load-bearing — the weave corrupts${fangCourt ? ' (the Fang-Fancier stays the drain)' : ''}; but Second Skin holds the face (no lien)`);
      } else {
        const bane = generateBane(G.rng, { band: FANG_BANE_BAND });
        const at = attachBane(bane);   // Fix 4 — avoid stacking an identical lien on one face (double-fire)
        events.push(`a FANG was load-bearing — the weave corrupts${fangCourt ? ' (the Fang-Fancier stays the drain)' : ''}; a ${bane.band} bane (${bane.name}) etches onto die ${at.di} face ${at.fi}`);
      }
    } else events.push(`a FANG was load-bearing — the weave corrupts${fangCourt ? ' (the Fang-Fancier stays the drain)' : ''} (the bane is inert — enchantments off)`);
  }
  events.push(`${opts.stitched ? 'STITCH SAVE — ' : ''}resolved ${res.tier} (${res.colour}) for ${res.value} × ${res.colourPips} pips`);

  const blooms = checkBlooms(G.thread);
  const bc = new Set();
  for (const b of blooms){
    recordBloom(G.thread, b);
    (b.colours || (b.colour ? [b.colour] : [])).forEach(c => bc.add(c));
    if (b.kind === 'tricolor'){ G.bonusSpins += 1; events.push('bloom: TRICOLOR — +1 spin next segment'); }
    else events.push(`bloom: ${b.kind}`);
  }
  G.liveBloomColours = [...bc];

  // Witnesses fire AFTER the bead + blooms commit (so chain/bloom state is current).
  const wctx = witnessResolveCtx(res, pool);
  fireWitnesses('on_resolve', wctx, events);
  // §4.1 [EXPERIMENT] chain milestone — count consecutive same-colour chain-extends run-long; every
  // 3rd banks +1 spin (into G.bonusSpins, so the cost-aware generator re-prices it next segment). A
  // break / corrupt / frayed bead (anything that is NOT a clean extend) resets the streak. Gate-first,
  // draws no rng ⇒ experiment-off (or flag-off) is byte-neutral; wctx carries the chain read already.
  if (on('experiments.chainMilestone')){
    // A CORRUPT bead (a load-bearing fang — commitSegment stamps corrupt = !!res.fangLoadBearing)
    // is NOT a clean extend even when its colour matches the prior bead: corrupt breaks chains
    // everywhere else (N-of-a-kind runs, blooms), so it must reset this streak too — the spec this
    // block already documents ("break / corrupt / frayed … resets"), which the old code missed.
    if (wctx.chainExtends && !wctx.fangLoadBearing){
      G.chainRun++;
      if (G.chainRun % 3 === 0){ G.bonusSpins += 1; events.push('the chain holds — the next segment owes a spin'); }
    } else G.chainRun = 0;
  }
  if (opts.stitched) fireWitnesses('on_stitch', wctx, events);
  else if (G.rollsLeft > 0) fireWitnesses('on_stop_early', wctx, events);   // resolved with spins to spare
  for (let bi = 0; bi < blooms.length; bi++) fireWitnesses('on_bloom', wctx, events);

  // Transformer enchantments fire at on_resolve — AFTER the rung is scored, so a deepen's
  // reach lands on the NEXT segment (the probe re-prices the deeper hand — AP#2 clean).
  // No-op / no rng when no shown face carries an on_resolve transformer (neutral).
  fireEnch('on_resolve', events);

  // Fangs no longer FORCE a curse-only draw — the cost is now the face bane, so a fang segment
  // takes its NORMAL tier reward. (forced/curse-card machinery kept below but dormant in real play.)
  const forced = false;
  const finish = (res.tier === 'floor' ? 'frayed' : 'clean');
  G.segIndex++;
  if (DEPTH_BONUS.on && G.segIndex >= DEPTH_BONUS.from) G.depthBonus += DEPTH_BONUS.base + (G.segIndex - DEPTH_BONUS.from) * DEPTH_BONUS.step;
  // §6 patron beat — a completed segment advances the patron; at patronLen() it completes
  // (wish payout + a fresh wish). Gated on on('wishes'); off ⇒ no advance, no rng, neutral.
  if (on('wishes')){ G.segsThisPatron++; if (G.segsThisPatron >= patronLen()) patronComplete(events); }
  // A chosen-scope transformer (the player picks the face) fired at on_resolve → offer the
  // choice in a 'transform' phase BEFORE the reward draw. Nothing attaches one in normal play
  // (only the --enchant injector), so pendingTransforms is empty ⇒ this is byte-identical.
  if (G.pendingTransforms.length){
    G.pendingPerk = { res, forced, finish, perkN, stitched: !!opts.stitched };
    G.phase = 'transform';
    events.push(`a transformer awaits your choice: ${G.pendingTransforms[0].name} — pick a face ({"type":"transform","di":N}) or skip`);
    return;
  }
  enterPerkPhase(res, forced, finish, perkN, !!opts.stitched, events);
}

// Set up the between-segment reward draw + enter the 'perk' phase. Extracted from commitPath
// so the 'transform' choice phase can defer it (identical call when no transformer is pending).
function enterPerkPhase(res, forced, finish, perkN, stitched, events){
  // Reward Ladder (Modifier Stack §9) — the resolved tier prices the draw. Forced curses stay
  // on the legacy path (the ladder is a reward, never a punishment). Gated on on('rewardLadder').
  if (!forced && on('rewardLadder')){
    // Exclude worn witnesses from the draft slots (never re-offer one you already wear, §4.2).
    const draw = drawLadder({ tier: res.tier, metTiers: res.metTiers, stitched: !!stitched }, G.rng, { wornWitnesses: G.witnesses.map(w => w.id) });
    G.ladderDraw = draw; G.perkOffer = draw.cards; G.picksRemaining = draw.picks;
    events.push(`the Reward Ladder — ${draw.grade} draw${draw.mixed ? ' (mixed)' : ''}: pick ${draw.picks} of ${draw.cards.length}`);
    // legibility: name what was ON THE TABLE (labels + grade/rarity), so a run log shows the whole
    // offer, not just the pick. Draft cards read `draft: <name>`; reach cards `<label> (grade/rarity)`.
    events.push(`the ladder offers: ${draw.cards.map(c => c.kind === 'draft' ? `draft: ${c.label}` : `${c.label} (${c.grade}/${c.rarity})`).join(' · ')}`);
  } else {
    G.ladderDraw = null; G.picksRemaining = 1;
    G.perkOffer = drawPerks(finish, G.rng, perkN);
    events.push(`the Fates offer: ${G.perkOffer.map(c => `${c.id}(${c.kind})`).join(' | ')}${forced ? ' — the curse is MANDATORY' : ''}`);
  }
  G.perkForced = forced;
  G.lastSegRungs = G.rungs;
  G.phase = 'perk';
}

// A tray die is a valid target for a transformer if its SHOWN hand face can take the effect.
function transformCandidate(t, effect){
  if (!t || t.symbol === 'blank' || t.symbol === 'fang') return false;
  const face = G.hand.dice[t.di]?.faces?.[t.fi];
  if (!face) return false;
  if (effect === 'deepen') return deepenable(face);
  if (effect === 'erode')  return (face.mag || 1) > 1;
  if (effect === 'convert') return STAT_IDS.includes(face.symbol);   // recast a stat/ingredient face to a colour
  return true;
}

// §slice-4 convert (Carver's Sigil) — resolve the target COLOUR for a convert of `face`. An explicit
// action `to` (a colour id, ≠ the face's current colour) wins; otherwise the DEFAULT is the colour the
// just-resolved segment's rungs demanded most (the deepenTarget heuristic, over colours), skipping the
// face's own colour so the recast always changes something. Draws no rng. Returns a colour id or null.
function convertTargetColour(face, to){
  if (to && COLOUR_IDS.includes(to) && to !== face.symbol) return to;
  const rungs = G.rungs || [];   // at on_resolve / the transform phase, G.rungs is still the resolved segment's
  const demand = c => rungs.reduce((acc, r) => acc + ((r.req && r.req[c]) || 0), 0);
  const ranked = COLOUR_IDS.filter(c => c !== face.symbol)
    .sort((a, b) => (demand(b) - demand(a)) || (COLOUR_IDS.indexOf(a) - COLOUR_IDS.indexOf(b)));
  return ranked[0] || null;
}

// Resolve a Deepen target — an explicit {die,face} or the auto-pick (the face the
// last rungs demanded most). Shared by the legacy Deepen perk and the ladder pip boon.
function deepenTarget(a){
  let di = a.die, fi = a.face;
  if (di === undefined || fi === undefined){
    let best = null, bestScore = -1;
    const rungs = G.lastSegRungs || [];
    G.hand.dice.forEach((d, ddi) => d.faces.forEach((f, ffi) => {
      if (!deepenable(f)) return;
      const score = rungs.reduce((acc, r) => acc + (r.req[f.symbol] || 0), 0);
      if (score > bestScore){ bestScore = score; best = { di: ddi, fi: ffi }; }
    }));
    if (!best) return null;
    di = best.di; fi = best.fi;
  }
  const f = G.hand.dice[di]?.faces?.[fi];
  if (!f || !deepenable(f)) return null;
  return { di, fi, f };
}

// =============================================================================
// §D1 ⚖3.2 FACE ECONOMY — the four face verbs (pure face-array mutations on a drum) +
// their targeting/auto-pick + the excise index-integrity repair.
// -----------------------------------------------------------------------------
// SELF-PRICING containment: adding a face makes every OTHER face on that drum show less
// often, and the generator's reach probes roll the ACTUAL hand (rollDie reads faces.length
// per die), so any face change auto-reprices difficulty next segment (AP#2/§14 clean). Caps
// (min 2 / max 4) are balance-owned (NUMBERS.faces, read via num()). No rng in any of these.
// =============================================================================
function faceCaps(){ return { min: num('faces.min', 2), max: num('faces.max', 4) }; }

// graftFace(die, colour) — push a plain colour face {symbol, mag:1}. Fizzles (event, no-op) at max.
function graftFace(die, colour, events){
  const { max } = faceCaps();
  if (die.faces.length >= max){ events.push(`the drum is full (${max} faces) — the graft fizzles`); return false; }
  die.faces.push({ symbol: colour, mag: 1, state: 'live' });
  events.push(`a ${colour} face is grafted onto the drum — every other face now shows less often (${die.faces.length} faces)`);
  return true;
}

// copyEtchFace(die, face) — duplicate `face` onto the SAME drum. Deep-clones symbol/mag AND the
// ench array (each clone is an INDEPENDENT instance — a consumed ward on the twin must not consume
// the original's). Fizzles at max faces.
function copyEtchFace(die, face, events){
  const { max } = faceCaps();
  if (die.faces.length >= max){ events.push(`the drum is full (${max} faces) — the twin etch fizzles`); return false; }
  const twin = { symbol: face.symbol, mag: face.mag || 1, state: face.state || 'live' };
  if (face.ench && face.ench.length)
    twin.ench = face.ench.map(e => ({ ...e, ...(e.params ? { params: { ...e.params } } : {}) }));   // independent instances
  die.faces.push(twin);
  events.push(`the ${face.symbol}${(face.mag||1)>1?`(${face.mag})`:''} face is twinned onto its drum${twin.ench?' (its etchings copy — their own instances)':''} (${die.faces.length} faces)`);
  return true;
}

// exciseFace(die, face) — TRUE removal (the drum reshapes; the remaining faces each show more
// often). Fizzles at min faces. Excising an enchanted face DELETES its enchants (allowed — the
// player's choice; the event says so). PURE (no G): returns the removed array index, or -1 on a
// fizzle. The CALLER repairs stored face indices via reindexAfterExcise (a session concern).
function exciseFace(die, face, events){
  const { min } = faceCaps();
  if (die.faces.length <= min){ events.push(`the drum is at its floor (${min} faces) — nothing can be excised`); return -1; }
  const idx = die.faces.indexOf(face);
  if (idx < 0){ events.push('that face is not on the drum — the excise fizzles'); return -1; }
  const hadEnch = !!(face.ench && face.ench.length);
  die.faces.splice(idx, 1);
  events.push(`the ${face.symbol}${(face.mag||1)>1?`(${face.mag})`:''} face is excised — the drum reshapes to ${die.faces.length} faces${hadEnch?' (its etchings die with it — your choice)':''}`);
  return idx;
}

// cursedGraft(die) — push a FANG wild face. Matches the NATIVE fang-face shape exactly: a face is
// just {symbol,mag,state}; the wild-ness (isWild) lives on the SYMBOL (symbols.js), NOT the face —
// so a grafted fang behaves identically to a template fang. NEVER ridered (the fang is the price).
function cursedGraft(die, events){
  const { max } = faceCaps();
  if (die.faces.length >= max){ events.push(`the drum is full (${max} faces) — the fang graft fizzles`); return false; }
  die.faces.push({ symbol: 'fang', mag: 1, state: 'live' });
  events.push(`a FANG face is grafted onto the drum — a wild that fills any slot, but its bite is the price (${die.faces.length} faces)`);
  return true;
}

// fixFaceIndex(fi, removed) — the PURE, deterministic index-repair rule (no rng, no G): a stored
// face index `fi` after array index `removed` was spliced. If fi WAS the removed face → clamp to 0;
// if fi sat ABOVE the removed one → it shifted down one; below → unchanged. Exported for the unit test.
function fixFaceIndex(fi, removed){ return fi === removed ? 0 : (fi > removed ? fi - 1 : fi); }

// reindexAfterExcise(di, removed) — after face index `removed` was spliced from die `di`, repair
// every STORED face index that referenced that die, deterministically (NO rng): the tray's shown
// face (clamp to 0 if it WAS the removed face — updating the shown symbol/mag + an event; else
// decrement if it sat above the removed index), the queued Augur peek (G.peeked — voided, with an
// event), and any pending sigils on that die (dropped — they tapped the now-gone face). Enchants
// live ON the face objects, so they travel/die with their face automatically — nothing there.
function reindexAfterExcise(di, removed, events){
  if (G.tray){
    const ti = G.tray.findIndex(t => t.di === di);
    if (ti >= 0){
      const t = G.tray[ti];
      const nfi = fixFaceIndex(t.fi, removed);
      if (t.fi === removed){
        // the shown face was the excised one → clamp to face 0 (nfi) and re-read its symbol/mag
        const f = G.hand.dice[di].faces[0];
        const shown = (t.symbol === 'blank') ? { symbol: 'blank', mag: 0 } : { symbol: f.symbol, mag: f.mag || 1 };
        G.tray[ti] = { ...t, fi: 0, ...shown };
        if (t.symbol !== 'blank') events.push(`die ${di}'s shown face fell to the reshaped drum — now ${shown.symbol}${(shown.mag||1)>1?`(${shown.mag})`:''}`);
      } else if (nfi !== t.fi){
        G.tray[ti] = { ...t, fi: nfi };   // the array shifted down beneath the shown face
      }
    }
  }
  if (G.peeked && G.peeked[di] != null){                                 // a stale pre-drawn peek is invalid → void it (observable)
    delete G.peeked[di];
    events.push(`the reshaped drum voids die ${di}'s pending peek`);
  }
  if (G.pendingSigils) G.pendingSigils = G.pendingSigils.filter(s => s.di !== di);   // drop sigils tapping the gone face
}

// first drum with room to grow (faces.length < max), else null — the graft/cursed_graft auto-pick.
function firstDrumBelowMax(){
  const { max } = faceCaps();
  for (let di = 0; di < G.hand.dice.length; di++) if (G.hand.dice[di].faces.length < max) return di;
  return null;
}
// the colour the JUST-RESOLVED segment demanded most (G.lastSegRungs), tiebroken by COLOUR_IDS order.
// The graft auto-pick colour (deterministic, no rng).
function mostDemandedColour(){
  const rungs = G.lastSegRungs || G.rungs || [];
  const demand = c => rungs.reduce((acc, r) => acc + ((r.req && r.req[c]) || 0), 0);
  let best = COLOUR_IDS[0], bestN = -1;
  for (const c of COLOUR_IDS){ const n = demand(c); if (n > bestN){ bestN = n; best = c; } }
  return best;
}
// copy target — explicit {die,face} (must be a drum below max) or the AUTO pick: the highest-VALUE
// face on a drum below max — most enchants, then highest mag, then lowest [di,fi]. Deterministic.
function copyTargetPick(a){
  const { max } = faceCaps();
  if (a.die != null && a.face != null){
    const d = G.hand.dice[a.die];
    return (d && d.faces.length < max && d.faces[a.face]) ? { di: a.die, face: d.faces[a.face] } : null;
  }
  let best = null;
  for (let di = 0; di < G.hand.dice.length; di++){
    const d = G.hand.dice[di]; if (d.faces.length >= max) continue;
    for (let fi = 0; fi < d.faces.length; fi++){
      const f = d.faces[fi], ench = (f.ench || []).length, mag = f.mag || 1;
      if (!best || ench > best.ench || (ench === best.ench && mag > best.mag)) best = { di, face: f, ench, mag };   // ties keep lower [di,fi] (ascending scan)
    }
  }
  return best ? { di: best.di, face: best.face } : null;
}
// excise target — explicit {die,face} (must be a drum above min) or the AUTO pick: the lowest-mag
// UNENCHANTED face, lowest index (prefer unenchanted so the auto never destroys etchings). Deterministic.
function exciseTargetPick(a){
  const { min } = faceCaps();
  if (a.die != null && a.face != null){
    const d = G.hand.dice[a.die];
    return (d && d.faces.length > min && d.faces[a.face]) ? { di: a.die, face: d.faces[a.face] } : null;
  }
  let best = null;
  for (let di = 0; di < G.hand.dice.length; di++){
    const d = G.hand.dice[di]; if (d.faces.length <= min) continue;
    for (let fi = 0; fi < d.faces.length; fi++){
      const f = d.faces[fi], ench = (f.ench || []).length ? 1 : 0, mag = f.mag || 1;
      if (!best || ench < best.ench || (ench === best.ench && mag < best.mag)) best = { di, face: f, ench, mag };   // ties keep lower [di,fi]
    }
  }
  return best ? { di: best.di, face: best.face } : null;
}

// =============================================================================
// §D2 DEBT VERBS — shift / scour / absolve (the reach channel's relocate/cleanse cards).
// -----------------------------------------------------------------------------
// "A bane" is DATA-DRIVEN: the first ench on a face whose POLARITY field is 'bane'
// (generateBane stamps polarity:'bane'; wards/sigils are polarity:'boon'). We match the
// FIELD, never an effect name — a ward on a face is a boon and is never touched. None of
// these verbs move or reorder FACES (they move/strip ENCH objects + change mag), so no
// fixFaceIndex/reindex repair is needed (D1 trap #1). PURE + rng-free (deterministic).
// =============================================================================

// §D3 COUPLING GUARD — a debt-verb-eligible bane is FREE-STANDING debt only: a bane whose polarity
// field is 'bane' AND that carries NO coupling marker (pairId). A BARGAIN's bane half is stamped with
// a pairId (shared with its boon half), so it is NOT shiftable/cleansable — stripping it would be free
// reach (the common Shift card would trivially defuse every bargain / AP#2). Free-standing debt (fang
// LIENS + card RIDERS) has no pairId, so it stays fully selectable. Match the FIELDS, never an id (L1).
// A ward (polarity:'boon') is never a bane; a coupled bane (pairId set) is a bane but not free-standing.
function isFreeBane(e){ return !!e && e.polarity === 'bane' && e.pairId == null; }
function faceHasFreeBane(face){ return (face.ench || []).some(isFreeBane); }
// the array index of the first FREE-STANDING bane on a face, or -1 (the D2 debt verbs' single choke point —
// scour/absolve source select + shift's source + firstBaneFace all route through here, so the coupling
// guard is enforced in ONE place). A face carrying ONLY a coupled (bargain) bane returns -1 ⇒ the verb fizzles.
function firstBaneIdx(face){ return (face.ench || []).findIndex(isFreeBane); }
// the first bane-carrying face in [di,fi] order — the scour/absolve bare auto + shift's source auto.
function firstBaneFace(){
  for (let di = 0; di < G.hand.dice.length; di++)
    for (let fi = 0; fi < G.hand.dice[di].faces.length; fi++)
      if (firstBaneIdx(G.hand.dice[di].faces[fi]) >= 0) return { di, fi };
  return null;
}
// resolve the source face for scour/absolve: an explicit {die,face} that CARRIES a bane wins;
// else the first bane-carrying face. Returns {di,fi} or null (⇒ the caller fizzles).
function baneSource(a){
  if (a && a.die != null && a.face != null){
    const f = G.hand.dice[a.die]?.faces?.[a.face];
    return (f && firstBaneIdx(f) >= 0) ? { di: a.die, fi: a.face } : null;
  }
  return firstBaneFace();
}
// shift's bare-auto PARKING SPOTS, RANKED — lowest-mag UNENCHANTED faces first (then lowest-mag
// enchanted), EXCLUDING the source face (reuses the D1 excise auto heuristic, minus the min-faces
// constraint — we ADD an ench, not remove a face). Ties keep lowest [di,fi]. Returns the whole
// ordered list so the anti-thrash guard (Fix 4) can skip a reversing target and take the next.
function parkingFacesRanked(srcDi, srcFi){
  const unench = [], ench = [];
  for (let di = 0; di < G.hand.dice.length; di++)
    for (let fi = 0; fi < G.hand.dice[di].faces.length; fi++){
      if (di === srcDi && fi === srcFi) continue;
      const f = G.hand.dice[di].faces[fi], mag = f.mag || 1;
      ((f.ench || []).length ? ench : unench).push({ di, fi, mag });
    }
  const byMag = (a, b) => (a.mag - b.mag) || (a.di - b.di) || (a.fi - b.fi);   // ascending mag, then [di,fi]
  unench.sort(byMag); ench.sort(byMag);
  return [...unench, ...ench];   // prefer unenchanted parking, else the least-loaded face
}
// Fix 4 — the bare-auto SOURCE bane: prefer the first FREE bane NOT yet shifted this run (a bane with
// no _enchSeq is by definition never-shifted; one whose _enchSeq is in G.shiftedEnch has moved before).
// This alone breaks the thrash whenever a second bane exists (the auto stops re-grabbing the just-moved
// one). Falls back to the first bane face when every worn bane has already been shifted. Draws no rng.
function autoShiftSource(){
  let unshifted = null, any = null;
  for (let di = 0; di < G.hand.dice.length; di++)
    for (let fi = 0; fi < G.hand.dice[di].faces.length; fi++){
      const face = G.hand.dice[di].faces[fi];
      const bi = firstBaneIdx(face);
      if (bi < 0) continue;
      if (!any) any = { di, fi };
      const seq = face.ench[bi]._enchSeq;
      if (!unshifted && (seq == null || !G.shiftedEnch.has(seq))) unshifted = { di, fi };
    }
  return unshifted || any;
}
// Fix 4 — the bare-auto TARGET: the best-ranked parking face that does NOT exactly REVERSE the previous
// shift (moving this same slot's ink straight back where it just came from — the ping-pong). If every
// candidate is a reverse (only one legal target), still act with the best (don't wedge). Draws no rng.
function autoShiftTarget(srcDi, srcFi){
  const ranked = parkingFacesRanked(srcDi, srcFi);
  if (!ranked.length) return null;
  const ls = G.lastShift;
  const reverses = t => ls && srcDi === ls.toDi && srcFi === ls.toFi && t.di === ls.fromDi && t.fi === ls.fromFi;
  for (const t of ranked) if (!reverses(t)) return { di: t.di, fi: t.fi };
  return { di: ranked[0].di, fi: ranked[0].fi };   // only a reversing target exists — act anyway (never wedge)
}

// shift_bane — MOVE the exact bane ench OBJECT from a source face to a target face (identity
// preserved: splice out, push on — the twin's cloned bane never touches the original's). Total debt
// is constant. Explicit {die,face}+{toDie,toFace}; a BARE pick uses the Fix-4 anti-thrash auto (prefer
// an un-shifted source bane; never a target that reverses the previous shift). Returns true on a real
// move, false on a fizzle (no bane / nowhere to sit) so applyLadderBoon can VOID a rider — no goods, no
// price (Fix 2). All tracking (the _enchSeq id, G.shiftedEnch, G.lastShift) is deterministic + rng-free.
function shiftBane(a, events){
  const explicitSrc = a && a.die != null && a.face != null;
  const bare = a && a.die == null && a.face == null;
  let src = null;
  if (explicitSrc){ if (firstBaneIdx(G.hand.dice[a.die]?.faces?.[a.face] || {}) >= 0) src = { di: a.die, fi: a.face }; }
  else if (bare) src = autoShiftSource();
  if (!src){ events.push('Shift: the ink holds no debt to move — the card fizzles'); return false; }
  const srcFace = G.hand.dice[src.di].faces[src.fi];
  const bi = firstBaneIdx(srcFace);
  let tgt = null;
  if (a && a.toDie != null && a.toFace != null){
    const tf = G.hand.dice[a.toDie]?.faces?.[a.toFace];
    if (tf && !(a.toDie === src.di && a.toFace === src.fi)) tgt = { di: a.toDie, fi: a.toFace };   // target ≠ source
  } else tgt = autoShiftTarget(src.di, src.fi);
  if (!tgt){ events.push('Shift: nowhere else to sit the debt — the card fizzles'); return false; }
  const [bane] = srcFace.ench.splice(bi, 1);                                  // the EXACT object (identity kept)
  if (bane._enchSeq == null) bane._enchSeq = ++G.enchSeq;                     // Fix 4 — a stable per-instance id (rng-free; not serialized)
  const tf = G.hand.dice[tgt.di].faces[tgt.fi];
  tf.ench = [...(tf.ench || []), bane];
  G.shiftedEnch.add(bane._enchSeq);                                          // this ink has moved — the auto prefers OTHER banes next
  G.lastShift = { fromDi: src.di, fromFi: src.fi, toDi: tgt.di, toFi: tgt.fi, seq: bane._enchSeq };
  events.push(`Shift: the ${bane.name || 'bane'} moves from die ${src.di} face ${src.fi} to die ${tgt.di} face ${tgt.fi} — the ink stays, you chose where`);
  return true;
}
// scour — STRIP the first bane from a chosen face AND erode that face 1 pip (floor 1; a mag-1 face
// scours FREE — accepted). Explicit {die,face}, else the first bane-carrying face.
function scourBane(a, events){
  const src = baneSource(a);
  if (!src){ events.push('Scour: the ink holds no debt to lift — the card fizzles'); return false; }
  const face = G.hand.dice[src.di].faces[src.fi];
  const [bane] = face.ench.splice(firstBaneIdx(face), 1);
  const before = face.mag || 1;
  face.mag = Math.max(1, before - 1);                                          // erode 1 pip, floored at 1 (reuse the erode voice)
  const cost = face.mag < before ? `the face erodes to ${face.mag} pip${face.mag > 1 ? 's' : ''}` : 'the face was already bare (no pip lost)';
  events.push(`Scour: die ${src.di} face ${src.fi} — the ${bane.name || 'bane'} is scraped off; ${cost}`);
  return true;
}
// absolve — PURE strip of the first bane from a chosen face (no erode cost).
function absolveBane(a, events){
  const src = baneSource(a);
  if (!src){ events.push('Absolve: the ink holds no debt to lift — the card fizzles'); return false; }
  const face = G.hand.dice[src.di].faces[src.fi];
  const [bane] = face.ench.splice(firstBaneIdx(face), 1);
  events.push(`Absolve: die ${src.di} face ${src.fi} — the ${bane.name || 'bane'} is lifted clean (no cost to the face)`);
  return true;
}

// Apply a Reward-Ladder card's boon (Modifier Stack §9) — reuses the live perk verbs
// (score/ease/spin/pip). A blemished card's rider is a bane owed to a face; it is
// RECORDED (pendingRiders) but INERT until the face-enchantment resolver is live (the
// disclosed-price front door without teeth yet, like the witness reach effects).
function applyLadderBoon(card, a, events){
  // §4.2 DRAFT card (the worth slot) — ink a witness into a portrait slot. Slots free ⇒
  // append; slots full ⇒ REPLACE: `a.slot` (0-based worn index) picks the victim, else the
  // OLDEST worn witness (index 0) is auto-replaced so a simple driver never wedges.
  if (card.kind === 'draft'){
    const w = witness(card.witnessId);
    if (!w){ events.push(`${card.label}: the witness fades — nothing inks`); return; }
    // §4.2 defense-in-depth — never ink a witness already worn (ANY slot). Covers a pool-exhausted
    // duplicate draft AND the over-ink path (re-inking slot A while the same mark sits in slot B).
    // A no-op FIZZLE, not a silent stack (an inked duplicate stacked to Thousand Cuts ×4 — seed 20260709).
    if (G.witnesses.some(x => x.id === w.id)){ events.push(`${card.label}: the mark is already worn — the ink fades`); return; }
    const cap = num('witnesses.portraitSlots', 5);
    if (G.witnesses.length < cap){
      G.witnesses.push(w);
      events.push(`${card.label}: ${w.name} is inked (worn ${G.witnesses.length}/${cap})`);
    } else {
      let slot = (a && a.slot != null) ? a.slot : 0;                    // omitted ⇒ auto-replace the oldest (index 0)
      if (!(slot >= 0 && slot < G.witnesses.length)) slot = 0;
      const victim = G.witnesses[slot];
      G.witnesses[slot] = w;
      if (victim){                                                       // wipe the replaced witness's run-state so a later re-ink starts fresh
        delete G.witnessStacks[victim.id];                               // its growing counter (the required clear)
        delete G.witnessFires[victim.id]; delete G.witnessScoreById[victim.id];   // its per-id display tallies
        delete G.witnessCharges[victim.id];                              // §D2 its consuming charges (a re-ink starts at full)
      }
      events.push(`${card.label}: ${w.name} is inked over ${victim ? victim.name : 'an old mark'}`);
    }
    return;
  }
  const b = card.boon || {};
  // Fix 2 — track whether the boon actually delivered. A boon that FIZZLED (a face verb at a cap/floor,
  // a debt verb with no bane to act on, a deepen with no deepenable face) produced NO goods, so its
  // disclosed rider must be VOIDED, not attached — "no goods, no price" (the rider block at the end
  // reads this). A boon that succeeds leaves fizzled false ⇒ the rider attaches EXACTLY as before
  // (byte-identical rng for every non-fizzle draw). neverRider boons (cursed_graft/shift/bargains)
  // carry no card.rider, so their fizzle state is moot but tracked for one uniform gate.
  let fizzled = false;
  if (b.effect === 'score'){ G.scoreBonus += b.mag || 0; events.push(`${card.label}: +${b.mag} final score`); }
  else if (b.effect === 'ease'){ G.steadyNext = true; events.push(`${card.label}: the next floor comes easier`); }
  else if (b.effect === 'spin'){ G.bonusSpins += b.mag || 1; events.push(`${card.label}: +${b.mag} spin next segment`); }
  else if (b.effect === 'pip'){
    const t = deepenTarget(a);
    if (t){ t.f.mag = (t.f.mag || 1) + 1; events.push(`${card.label}: die ${t.di} face ${t.fi} (${t.f.symbol}) → ${t.f.mag} pips`); }
    else { events.push(`${card.label}: no face to deepen — the boon fizzles`); fizzled = true; }
  }
  else if (b.effect === 'enchant' && b.ench){
    // Acquire a persistent TRANSFORMER enchantment (the "fished face", §6) — the resolver fires
    // it on_resolve, so a deepen's reach is priced next segment by the probe. Reach cards ride a
    // bane (below) — the up-front blemished price — so both AP#2 channels hold. Gate-first (rng
    // only inside engineFlag('enchantments'), the same seam as the rider).
    const spec = { id: `ladder_${b.id}`, condition: null, cost: {}, lifetime: 'permanent',
      polarity: 'boon', name: card.label, forced: (b.ench.scope || 'self') !== 'chosen', ...b.ench };
    if (engineFlag('enchantments') && validateEnchantment(spec).ok){
      // §Change-3 targeted etch (deepen-style): an explicit {die,face} etches THAT face (no rng).
      // A bare pick keeps EXACTLY today's random etch (attachEnch's two rng draws) so simple
      // drivers never wedge and old records replay byte-for-byte.
      const at = (a && a.die != null && a.face != null && attachEnchAt(spec, a.die, a.face)) || attachEnch(spec);
      events.push(`${card.label}: etches ${spec.effect} onto die ${at.di} face ${at.fi}`);
    } else events.push(`${card.label}: the etching is inert (enchantments off)`);
  }
  // §D1 ⚖3.2 FACE-ECONOMY verbs (graft / copy / excise / cursed_graft) — pure face-array mutations.
  // Fix 2 — a cap/floor fizzle (or no target) sets fizzled so the rider voids ("no goods, no price").
  else if (b.effect === 'graft'){
    let di = (a && a.die != null) ? a.die : firstDrumBelowMax();          // bare ⇒ first drum below max
    let colour = (a && COLOUR_IDS.includes(a.to)) ? a.to : mostDemandedColour();   // bare ⇒ most-demanded colour
    if (di == null || !G.hand.dice[di]){ events.push(`${card.label}: every drum is full — the graft fizzles`); fizzled = true; }
    else fizzled = !graftFace(G.hand.dice[di], colour, events);
  }
  else if (b.effect === 'copy'){
    const t = copyTargetPick(a);                                          // bare ⇒ the highest-value face on a drum below max
    if (!t){ events.push(`${card.label}: no face can be twinned (every drum full) — it fizzles`); fizzled = true; }
    else fizzled = !copyEtchFace(G.hand.dice[t.di], t.face, events);
  }
  else if (b.effect === 'excise'){
    const t = exciseTargetPick(a);                                        // bare ⇒ the lowest-mag unenchanted face
    if (!t){ events.push(`${card.label}: no face can be excised (every drum at floor) — it fizzles`); fizzled = true; }
    else { const removed = exciseFace(G.hand.dice[t.di], t.face, events); if (removed >= 0) reindexAfterExcise(t.di, removed, events); else fizzled = true; }
  }
  else if (b.effect === 'cursed_graft'){
    let di = (a && a.die != null) ? a.die : firstDrumBelowMax();          // bare ⇒ first drum below max
    if (di == null || !G.hand.dice[di]){ events.push(`${card.label}: every drum is full — the fang graft fizzles`); fizzled = true; }
    else fizzled = !cursedGraft(G.hand.dice[di], events);   // (neverRider — no rider rides either way)
  }
  // §D2 DEBT VERBS (shift / scour / absolve) — each fizzles hand-blind when no bane is worn (the
  // composer never checks the hand — deepen fizzles the same way; precedent). Fix 2 — a fizzle voids the
  // rider: Scour/Absolve RIDE, so a no-bane fizzle used to bill the price without lifting anything; now
  // it stays clean ("no goods, no price"). Shift is neverRider (no rider either way — its return only
  // feeds the uniform gate). A Scour that ACTUALLY strips still rides (its disclosed reach price, AP#2).
  else if (b.effect === 'shift')   fizzled = !shiftBane(a, events);
  else if (b.effect === 'scour')   fizzled = !scourBane(a, events);
  else if (b.effect === 'absolve') fizzled = !absolveBane(a, events);
  // §D3 BARGAIN — etch TWO coupled enchants (a boon half + a bane half) on the SAME chosen face, sharing a
  // unique pairId (the coupling marker the D2 debt verbs skip — see isFreeBane). Targeted etch like the enchant
  // cards: an explicit {die,face} etches THAT face; a BARE pick draws ONE random face (attachEnch) and BOTH
  // halves land there (the pair is never split across faces). The bane half is neverRidered (the card is
  // neverRider) — the coupled bane IS the disclosed price. Gate-first (rng only inside engineFlag('enchantments')).
  else if (b.effect === 'bargain' && b.boonEnch && b.baneEnch){
    const pairId = `pair_${++G.pairSeq}`;   // unique per etch instance (G.pairSeq resets per run ⇒ replay-exact)
    const mkSpec = (sub, pol) => ({ id: `ladder_${b.id}_${pol}`, condition: null, cost: {}, lifetime: 'permanent',
      name: card.label, polarity: pol, pairId, ...sub });   // `...sub` last: trigger/scope/effect/forced/params are authoritative
    const boonSpec = mkSpec(b.boonEnch, 'boon');
    const baneSpec = mkSpec(b.baneEnch, 'bane');
    if (engineFlag('enchantments') && validateEnchantment(boonSpec).ok && validateEnchantment(baneSpec).ok){
      // etch BOTH halves on the SAME face: explicit {die,face} (no rng) or a single bare random face for the pair.
      let at = (a && a.die != null && a.face != null) ? attachEnchAt(boonSpec, a.die, a.face) : null;
      if (!at) at = attachEnch(boonSpec);   // bare (or a bad explicit target) ⇒ the random etch (one draw, both halves)
      attachEnchAt(baneSpec, at.di, at.fi);  // the bane joins the SAME face — coupled to the boon (shared pairId)
      events.push(`${card.label}: etches a devil's bargain onto die ${at.di} face ${at.fi} — boon ${boonSpec.effect} + coupled bane ${baneSpec.effect} (${pairId})`);
    } else events.push(`${card.label}: the bargain is inert (enchantments off)`);
  }
  // cursed_graft is composed neverRider (reachCard) ⇒ card.rider is absent ⇒ this never fires for it.
  // Fix 2 — VOID the rider when the boon fizzled: no goods, no price (the blemish fades with the failed
  // ink). This skips attachBane / the pendingRiders push entirely, so a fizzled draw draws NO rider rng.
  // A boon that DELIVERED (fizzled false) attaches its rider EXACTLY as before (byte-identical stream).
  if (card.rider){
    if (fizzled){ events.push(`…and the ${card.rider.band} blemish fades with the failed ink — no goods, no price`); }
    else if (engineFlag('enchantments')){ const at = attachBane(card.rider); events.push(`…a ${card.rider.band} blemish settles on die ${at.di} face ${at.fi}`); }   // avoid stacking an identical rider on one face (double-fire)
    else { G.pendingRiders.push(card.rider); events.push(`…and a ${card.rider.band} blemish is owed (disclosed price; inert — enchantments off)`); }
  }
}

// ---- Enchantment resolver (Modifier Stack L1 / face enchantments) — the TEETH for the
// ladder riders + the reroll/lock enchantment family AND the deepen/erode transformers. Fires
// shown-face enchantments at a moment via targetsForScope (which resolves the `random` scope
// resolver.js lacks). COLLECTS against the frozen tray first (fire-once per shown ench this
// moment — no cascade), then applies (rerolls before the rest, per resolver.js EFFECT_PHASE).
// Gated on engineFlag('enchantments'); off ⇒ no-op, no rng (neutral). Wired: reroll/lock (tray
// warps) + deepen/erode (PERMANENT hand-face mag ±, fired at on_resolve so a deepen's reach
// lands on the NEXT segment — priced by the probe, AP#2/§14 clean). convert/release/render and
// the explicit `chosen`-target agency are the follow-on.
// The effects fireEnch DISPATCHES at a moment (auto-fire or defer). Slice-4: `convert` joins as a
// chosen-scope on_resolve transformer (rides pendingTransforms → the 'transform' phase). `ward` is
// NOT here (a standing interceptor, presence-checked in applyEnchEffect); `release` is NOT here (an
// ambient on_keep offer, see releaseOffers); `expose` is offered before this set (a peek-sigil).
const TRANSFORMER_EFFECTS = new Set(['reroll', 'lock', 'deepen', 'erode', 'convert']);
const REROLL_MAX_HOP = 1;   // a tapped reroll may raise ONE more sigil (jam REROLL_MAX_HOP); bounded here

// ---- The opt-in SPIN-SIGIL (Law L4's one sanctioned "input beside stop") -----------------------
// The loose (re-throwable) dice a sigil can hit — never a kept/locked/blank die (a boon reroll must
// not undo a bank). self→the source die; adjacent→its neighbours; random→any OTHER loose die;
// chosen→any loose die (the player picks). Draws NO rng (the candidate set, for legal/display).
function looseTargets(sg){
  const set = new Set(G.tray.filter(t => !t.kept && !t.locked && t.symbol !== 'blank').map(t => t.di));
  if (sg.scope === 'self')     return set.has(sg.di) ? [sg.di] : [];
  if (sg.scope === 'adjacent') return [sg.di - 1, sg.di + 1].filter(i => set.has(i));
  if (sg.scope === 'chosen')   return [...set];
  return [...set].filter(i => i !== sg.di);   // random: any OTHER loose die
}
// 'random' resolves its target(s) AT TAP TIME (draws G.rng) from the loose pool.
function sigilRandomTargets(sg){
  const pool = looseTargets(sg);
  const count = Math.min((sg.params && sg.params.count) || 1, pool.length);
  const out = [];
  for (let k = 0; k < count && pool.length; k++) out.push(pool.splice(Math.floor(G.rng() * pool.length), 1)[0]);
  return out;
}
// Offer a sigil for the face on die `di` (keyed by di — one sigil per drum, jam parity). `effect`
// is the tap kind: 'reroll' (a free re-throw) or 'expose' (a PEEK, slice-4). The {type:'sigil'} tap
// dispatches on it (session act).
function offerSigil(di, e, depth, effect = 'reroll'){
  G.pendingSigils = G.pendingSigils.filter(s => s.di !== di);
  G.pendingSigils.push({ di, effect, name: e.name || (effect === 'expose' ? 'Peek-sigil' : 'Spin-sigil'),
    glyph: e.glyph, scope: e.scope, params: e.params || {}, desc: e.desc || describeEnch(e), depth });
}

// §slice-4 Open Hand (release) — the AMBIENT un-keep offers. For each SHOWN face carrying an
// unconsumed on_keep release ench, while at least one OTHER die (than the etched face's) is kept,
// offer to release (un-keep) one of those kept dice. Once per etched face per segment (releaseUsed).
// Draws no rng (a legal/display read). Returns [{ di, fi, key, name, desc, targets:[keptDi,…] }].
function looseReleaseOffers(){
  if (!engineFlag('enchantments')) return [];
  const kept = G.tray.filter(t => t.kept).map(t => t.di);
  if (!kept.length) return [];
  const out = [];
  for (const t of G.tray){
    if (t.symbol === 'blank') continue;
    const face = G.hand.dice[t.di].faces[t.fi];
    for (const e of (face.ench || [])){
      if (e.trigger !== 'on_keep' || e.effect !== 'release' || e.forced) continue;
      const key = `${t.di}:${t.fi}`;
      if (G.releaseUsed.has(key)) continue;
      const targets = kept.filter(di => di !== t.di);   // "at least one OTHER die is kept"
      if (!targets.length) continue;
      out.push({ di: t.di, fi: t.fi, key, name: e.name || 'Open Hand', desc: e.desc || describeEnch(e), targets });
      break;   // one release offer per drum (the first unconsumed etched face on it)
    }
  }
  return out;
}

function fireEnch(moment, events, sourceDi = null, depth = 0){
  if (!engineFlag('enchantments')) return;
  const n = G.tray.length;
  const actions = [];
  for (const t of G.tray){
    if (sourceDi != null && t.di !== sourceDi) continue;   // on_keep / cascade: only the named face
    const face = G.hand.dice[t.di].faces[t.fi];
    for (const e of (face.ench || [])){
      if (e.trigger !== moment) continue;
      // OPT-IN OFFERS (Law L4's sanctioned taps) — never auto-fire; the player taps {type:'sigil'}:
      //   reroll (forced:false) → a free re-throw sigil (bounded to REROLL_MAX_HOP so a tapped reroll's
      //     cascade can't chain forever); expose (forced:false) → a PEEK sigil (slice-4, Augur's Sigil).
      if (e.effect === 'reroll' && !e.forced){
        if (depth <= REROLL_MAX_HOP) offerSigil(t.di, e, depth, 'reroll');
        continue;
      }
      if (e.effect === 'expose' && !e.forced){
        offerSigil(t.di, e, depth, 'expose');
        continue;
      }
      // `ward` (standing interceptor, presence-checked in applyEnchEffect) and `release` (ambient,
      // see looseReleaseOffers) never fire at a moment; `render` is unwired. Skip everything else.
      if (!TRANSFORMER_EFFECTS.has(e.effect)) continue;   // reroll/lock + deepen/erode/convert
      const targets = targetsForScope(e.scope, t.di, n, G.rng, (e.params && e.params.count) || 1);
      if (!targets){   // chosen scope (a non-reroll transformer) → null (no rng drawn)
        // a chosen reach transformer at on_resolve defers to the 'transform' choice phase.
        if (moment === 'on_resolve' && !e.forced && (e.effect === 'deepen' || e.effect === 'erode' || e.effect === 'convert'))
          G.pendingTransforms.push({ name: e.name || e.effect, effect: e.effect, params: e.params || {}, polarity: e.polarity, desc: e.desc || describeEnch(e) });
        continue;
      }
      for (const tdi of targets) actions.push({ e, tdi });
    }
  }
  actions.sort((x, y) => (x.e.effect === 'reroll' ? 0 : 1) - (y.e.effect === 'reroll' ? 0 : 1));
  for (const { e, tdi } of actions) applyEnchEffect(e, tdi, events);
}

// §slice-4 WARD (Warding Sigil) — a STANDING INTERCEPTOR, presence-checked (never moment-fired).
// If die `tdi`'s currently-SHOWN face carries an unconsumed ward ench, the next FORCED bane effect
// (reroll/lock/erode) striking it is REFUSED: consume ONE ward instance (remove it from the face),
// skip the effect. Draws no rng. Returns true if the effect was refused (the caller must then bail).
function tryWard(tdi, baneName, events){
  const t = G.tray.find(x => x.di === tdi);
  if (!t) return false;
  const face = G.hand.dice[tdi].faces[t.fi];
  // §G1 the find + one-instance consume is kernel.wardIndex/consumeEnchAt (pure); the G-glue is the
  // tray lookup, the enchFired tally, the event, and rebuilding face.ench in place.
  const wi = wardIndex(face);
  if (wi < 0) return false;
  face.ench = consumeEnchAt(face.ench, wi);   // consume THIS ward instance
  G.enchFired++;
  events.push(`the ward holds — ${baneName || 'a bane'} is refused (die ${tdi})`);
  return true;
}

// §slice-4 ECHO (Echo Sigil) — if `oldTray`'s (pre-reroll) SHOWN face carried an on_reroll
// forced:false reroll ench, a FORCED bane reroll of that die raises a FREE self-scope reroll sigil,
// capped once per spin-window per die (echoUsed key "di:spinsTaken"). Draws no rng. Fires from bane
// rerolls only — player-invoked rerolls (sigil taps) pass no polarity, so `forcedBane` is false there.
function maybeEcho(oldTray, tdi, events){
  const face = G.hand.dice[tdi].faces[oldTray.fi];
  // §G1 the "does this face carry an offerable on_reroll ench" detection is kernel.echoEnch (pure);
  // the G-glue is the once-per-spin-window cap (echoUsed), the offer raise and the event.
  const echo = echoEnch(face);
  if (!echo) return;
  const key = `${tdi}:${G.spinsTaken}`;
  if (G.echoUsed.has(key)) return;
  G.echoUsed.add(key);
  offerSigil(tdi, { ...echo, scope: 'self', name: echo.name || 'Echo' }, 0, 'reroll');
  events.push(`${echo.name || 'the Echo'} answers — a free re-throw of die ${tdi} rises`);
}

function applyEnchEffect(e, tdi, events){
  const ti = G.tray.findIndex(t => t.di === tdi);
  if (ti < 0) return;
  const t = G.tray[ti];
  // §slice-4 WARD — a forced bane effect (reroll/lock/erode) on a warded die is refused HERE, the
  // single choke point where forced bane effects apply (airtight for on_roll AND on_keep banes).
  const forcedBane = e.forced === true && e.polarity === 'bane'
    && (e.effect === 'reroll' || e.effect === 'lock' || e.effect === 'erode');
  if (forcedBane && tryWard(tdi, e.name, events)) return;
  if (e.effect === 'lock'){
    const lr = lockEntry(t);   // §G1 kernel: lock physics (already-locked ⇒ no-op)
    if (!lr.changed) return;
    G.tray[ti] = lr.entry; G.enchFired++;
    events.push(`${e.name || 'a rune'} seizes die ${tdi} (locked)`);
  } else if (e.effect === 'reroll'){
    if (!rerollGuard(t)) return;   // §G1 kernel: reroll precondition (kept/locked ⇒ no-op, no rng)
    const nf = throwFace(tdi);   // routed through the re-throw primitive (consumes an Augur peek if queued)
    G.tray[ti] = { ...t, symbol: nf.symbol, mag: nf.mag, fi: nf.fi }; G.enchFired++;
    events.push(`${e.name || 'a rune'} respins die ${tdi} → ${nf.symbol}`);
    if (forcedBane) maybeEcho(t, tdi, events);   // §slice-4 a bane reroll of an echo-etched face answers back
  } else if (e.effect === 'convert'){
    // §slice-4 convert (Carver's Sigil) — PERMANENT symbol recast of the target's SHOWN hand face to
    // a colour (a hand-face mutation like deepen: reach lands NEXT segment, repriced by the probe).
    // No rng. `e.params.to` (an explicit colour) wins; else the deterministic default colour.
    const face = G.hand.dice[t.di]?.faces?.[t.fi];
    if (!face || !STAT_IDS.includes(face.symbol)) return;
    const to = convertTargetColour(face, e.params && e.params.to);
    if (!to || to === face.symbol) return;
    const from = face.symbol;
    face.symbol = to; G.enchFired++;
    events.push(`${e.name || 'a rune'} recasts die ${t.di}'s ${from} → ${to} (permanent, next segment)`);
  } else if (e.effect === 'deepen' || e.effect === 'erode'){
    // PERMANENT mag change on the target die's SHOWN hand face (no rng). Fired at on_resolve
    // AFTER the rung is scored, so a deepen's reach lands on the NEXT segment — the probe
    // re-prices the deeper hand (AP#2/§14 clean). deepen caps at DEEPEN_MAX; erode floors at 1.
    const face = G.hand.dice[t.di]?.faces?.[t.fi];
    if (!face || face.symbol === 'fang' || face.symbol === 'blank') return;
    const pips = (e.params && e.params.pips) || 1;
    if (e.effect === 'deepen'){
      if (!deepenable(face)) return;                                   // symbol ok & mag < DEEPEN_MAX
      face.mag = Math.min(DEEPEN_MAX, (face.mag || 1) + pips); G.enchFired++;
      events.push(`${e.name || 'a rune'} grinds die ${t.di}'s ${face.symbol} deeper → ${face.mag} pips (next segment)`);
    } else {
      const er = erodeMag(face, pips);   // §G1 kernel: erode magnitude (floors at 1; mag<=1 ⇒ nothing to erode)
      if (!er.changed) return;
      face.mag = er.mag; G.enchFired++;
      events.push(`${e.name || 'a rune'} erodes die ${t.di}'s ${face.symbol} → ${face.mag} pips`);
    }
  }
}

// attach an enchantment (a ladder rider) to a random face — the "which face is fate"
// disclosure (§9b). Draws rng only in the flag-gated caller path.
function attachEnch(ench){
  const di = Math.floor(G.rng() * G.hand.dice.length);
  const faces = G.hand.dice[di].faces;
  const fi = Math.floor(G.rng() * faces.length);
  faces[fi].ench = [...(faces[fi].ench || []), ench];
  return { di, fi };
}
// Fix 4 — attach a BANE (fang lien / card rider / generous-One lien) avoiding IDENTICAL STACKING. Two
// same-NAME banes on ONE face double-fire (a single spirit show fired TWO Seized-Spin locks — seed 20260712).
// Match by NAME (the SHAPE — the per-instance id changes via _enchSeq, the name "Seized Spin" is stable).
// rng-DRAW-COUNT STABLE where possible: draw the SAME two rng (di, then fi) as attachEnch; if that face has
// NO same-name bane, land there (byte-identical to attachEnch — a clean run's stream is untouched). ONLY a
// would-STACK placement pays one extra rng to pick among the eligible (no-same-name) faces; the fallback to
// the full face set fires only when EVERY face already carries this bane. The stream change bites exactly
// the runs that would have stacked — which is the point.
function attachBane(bane){
  const di = Math.floor(G.rng() * G.hand.dice.length);
  const faces = G.hand.dice[di].faces;
  const fi = Math.floor(G.rng() * faces.length);
  const key = bane.name || bane.id;
  const carries = f => (f.ench || []).some(e => e.polarity === 'bane' && (e.name || e.id) === key);
  if (!carries(faces[fi])){                                   // clean placement — identical to attachEnch (no extra rng)
    faces[fi].ench = [...(faces[fi].ench || []), bane];
    return { di, fi };
  }
  // would stack: gather faces that do NOT already carry this bane; draw one uniformly (one extra rng).
  const eligible = [];
  for (let d = 0; d < G.hand.dice.length; d++)
    for (let f = 0; f < G.hand.dice[d].faces.length; f++)
      if (!carries(G.hand.dice[d].faces[f])) eligible.push({ di: d, fi: f });
  if (!eligible.length){                                      // every face already carries it → the stack is unavoidable
    faces[fi].ench = [...(faces[fi].ench || []), bane];
    return { di, fi };
  }
  const p = eligible[Math.floor(G.rng() * eligible.length)];
  const tf = G.hand.dice[p.di].faces[p.fi];
  tf.ench = [...(tf.ench || []), bane];
  return { di: p.di, fi: p.fi };
}
// §Change-3 targeted etch — attach an enchantment to a SPECIFIC face (deepen-style targeting).
// Draws NO rng (the target is chosen, not fated). Returns { di, fi } or null on a bad target.
// Used by the ladder ENCHANT boon when the pick names {die,face}; a bare pick still uses
// attachEnch (the random etch) so old records replay and simple drivers never wedge.
function attachEnchAt(ench, di, fi){
  const dObj = G.hand.dice[di];
  if (!dObj || !dObj.faces || fi < 0 || fi >= dObj.faces.length) return null;
  dObj.faces[fi].ench = [...(dObj.faces[fi].ench || []), ench];
  return { di, fi };
}

// SNAP now ENDS the run (no default knot — audit 2.3: the consolation "reads as punishment"; the
// knot becomes a future SNAP RELIC). The stitch (the pre-snap "one more bet", audit 1.5) still
// precedes this. All three snap paths (resolve-no-loose / stitch-miss / the snap action) call this.
function doSnapEnd(events){
  events.push('SNAP — the thread breaks and the run ends. (No knot; a snap relic may one day grant a last cast.)');
  fireWitnesses('on_snap', { threadLength: G.thread.length, cursedSegments: G.thread.outcomes.filter(o => o.cursedHere).length }, events);
  finishRun(null, events);
}

// DORMANT (kept for the future snap relic): route a snap into the free final KNOT cast instead of
// ending the run. Nothing calls this in real play now; the knot phase (legal/serialize/act) remains.
function doSnapToKnot(events){
  events.push('SNAP — the thread breaks. One free final cast: the KNOT (three rungs, ~50% each)');
  fireWitnesses('on_snap', { threadLength: G.thread.length, cursedSegments: G.thread.outcomes.filter(o => o.cursedHere).length }, events);
  G.knotRungs = generateKnot(G.hand);
  G.phase = 'knot';
  G.tray = newTray();
  G.rollsLeft = 3; G.spinsTaken = 0;
}

function finishRun(knotResult, events){
  G.result = tallyScore(G.thread, {
    scoreBonus: G.scoreBonus, depthBonus: G.depthBonus, jackpotBonus: G.jackpotBonus,   // §6 v2 jackpot contracts → 'Patron jackpot' line (0 ⇒ no line)
    knot: knotResult || null, stitches: G.stitchSaves,   // a snap-ended run has no knot (tallyScore skips it)
  });
  G.knotResult = knotResult || null;
  G.phase = 'done'; G.over = true;
  if (knotResult) events.push(knotResult.hit
    ? `the knot ties ${knotResult.colour}${knotResult.tight ? ' — TIGHT (matches a live bloom)' : ''}`
    : 'the knot slips — untied');
  events.push(`FINAL SCORE ${G.result.score} over ${G.thread.length} segments`);
}

// §D3 a bargain half as a disclosed summary for perkOffer — the effect/scope/trigger/forced grammar
// plus the humanized desc (same describeEnch the hand + rider use). `pol` supplies the polarity so the
// humanizer reads the boon/bane voice correctly. Pure; draws no rng; used only by serializeState.
function bargainHalf(sub, pol){
  const e = { ...sub, polarity: pol };
  return { effect: sub.effect, scope: sub.scope, trigger: sub.trigger, forced: !!sub.forced, desc: describeEnch(e) };
}

// ---- state / legal ---------------------------------------------------------------
function serializeState(){
  if (!G) return { over:true, error:'no run — send {"type":"new_run"}' };
  const s = {
    over: G.over, phase: G.phase, seed: G.seed, segIndex: G.segIndex,
    rollsLeft: G.rollsLeft, spinsTaken: G.spinsTaken,
    curses: warpView(activeWarps()),   // { keepCap, lockDice, rollLimit, forcedKeep, rerollOnRoll, lockFirstKeeps }
    bonuses: { scoreBonus: G.scoreBonus, depthBonus: G.depthBonus, bonusSpinsBanked: G.bonusSpins, steadyNext: G.steadyNext },
    hand: G.hand.dice.map((d, di) => ({ die: di, name: d.name,
      faces: d.faces.map((f, fi) => ({ face: fi, symbol: f.symbol, mag: f.mag || 1,
        // ench is now STRUCTURED (not name-only) so a client can tell an optional player-
        // targeted action (chosen/on_resolve transformer) from a forced auto-firing one, and
        // show what each does — `desc` is the engine's own grammar humanizer (single source).
        ...(f.ench && f.ench.length ? { ench: f.ench.map(e => ({
          name: e.name || e.effect, effect: e.effect, scope: e.scope, trigger: e.trigger,
          polarity: e.polarity, forced: !!e.forced,
          ...(e.params && Object.keys(e.params).length ? { params: e.params } : {}),
          // §D3 pairId — the bargain coupling marker (a client renders the two coupled runes together; a
          // reader can tell a coupled bane [not debt-verb-strippable] from free-standing debt). Present ONLY
          // on a coupled ench, so a hand with no bargains serializes byte-identically to before this line.
          ...(e.pairId ? { pairId: e.pairId } : {}),
          desc: e.desc || describeEnch(e),
        })) } : {}) })) })),
    thread: {
      length: G.thread.length,
      chain: G.thread.colours[G.thread.colours.length - 1] || null,
      colours: G.thread.colours.slice(),
      frayed: [...G.thread.frayed],
      corrupt: G.thread.corrupt,
      liveBloomColours: G.liveBloomColours.slice(),
      bloomsRecorded: G.thread.blooms.map(b => ({ kind: b.kind, colours: b.colours })),
      outcomes: G.thread.outcomes.map(o => ({ tier: o.tier, colour: o.colour, value: o.value,
        colourPips: o.colourPips, corrupt: o.corrupt, cursedHere: o.cursedHere, stitched: !!o.stitched, metCount: o.metCount,
        // additive: the mixed bead (ALL met colours, dominant first — engine outcome.colours) and the
        // per-bead frayed-at-commit flag. Present only when meaningful, so a single-colour, unfrayed
        // history serializes byte-identically to before these lines (the pairId culture above).
        ...(o.colours && o.colours.length > 1 ? { colours: o.colours.slice() } : {}),
        ...(o.frayed ? { frayed: true } : {}) })),
    },
    stitchSaves: G.stitchSaves,
  };
  // Fix 5 — REACH-ESTIMATE HONESTY CAVEAT. The rung reach_estimates roll the actual hand SHAPE (so §D1
  // face reshapes reprice) but IGNORE active wish warps and forced-bane (lien/rider) firings — so a warped
  // boss rung prices identically to its unwarped twin, and a 77% floor can die to a lien-locked die. FULL
  // warp/enchant-aware probing is out of scope (recorded as a follow-up in AGENT_PLAY's caveat note); this
  // is the honest FLAG: mark the estimates as UNADJUSTED whenever any warp is active (incl. boss-segment
  // wish warps, via activeWarps()) OR any hand face carries a forced bane. Present ONLY then, so a clean
  // hand serializes byte-identically to before this line (neutrality). warps = active warp count; banedFaces
  // = hand faces carrying a forced bane. No probe changes — the client renders "~" + a tooltip when present.
  //   §G2 (spec §5) — estimate honesty: with the JOINT probe on, the reach_estimates ARE priced with
  //   the active warps/twist/forced-banes (kernel-aware), so the caveat retires ON THAT PATH — the
  //   estimates no longer lie. It STAYS for the flag-off (legacy shape-only) path. The client keys off
  //   s.reachCaveat presence only, so suppressing it here is all that's needed (no client change).
  if (!(on('generator2') && on('generator2.jointProbe'))){
    const warps = activeWarps().length;
    let banedFaces = 0;
    for (const d of G.hand.dice) for (const f of d.faces)
      if ((f.ench || []).some(e => e.polarity === 'bane' && e.forced)) banedFaces++;
    if (warps || banedFaces) s.reachCaveat = { warps, banedFaces };
  }
  // §G2/§G3 telemetry (spec §4) — { power, pSnapPredicted } per segment, into Run Records. Additive:
  // present ONLY when the joint probe is on AND has produced a reading (a segment has started), so a
  // flag-off run serializes byte-identically to before this block. §G3: when the BAND is on, the block
  // gains { pSnapTarget, pricedPower, window } (window = power_now > pricedPower — the world hasn't
  // caught up to a graft) + the fit marker; these are absent flag-off / band-off (byte-identical).
  if (on('generator2') && on('generator2.jointProbe') && G.generatorPower != null){
    s.generator = { power: G.generatorPower, pSnapPredicted: G.generatorPSnap };
    if (G.generatorBand){
      s.generator.pSnapTarget = G.generatorBand.pSnapTarget;
      s.generator.pricedPower = G.generatorBand.pricedPower;
      s.generator.window = G.generatorBand.window;
      if (G.generatorBand.fit && G.generatorBand.fit !== 'band') s.generator.fit = G.generatorBand.fit;   // surface only a NON-band (no-fit) marker
    }
    // §G4 the composer's dynamic shape — present ONLY when the composer ran (flag-on) AND altered the set,
    // so a flag-off / unrefined segment serializes byte-identically. rungCount lets a client size the panel;
    // rested names the idled colour (a 2-rung rest) so the "the {colour} thread rests" disclosure is legible.
    if (G.generatorRungCount != null) s.generator.rungCount = G.generatorRungCount;
    if (G.generatorRested) s.generator.rested = G.generatorRested;
    if (G.generatorApexDegraded) s.generator.apexDegraded = true;   // Fix 3 — a forced/intent apex bent to a reachable shape
  }
  // Witnesses (Modifier Stack §5b / §4.2) — surface the WORN loadout richly: each entry is
  // { id, label, slot, fires, score } (per-witness accumulated fires + worth) so the client
  // can render the portrait row and an agent can read what each mark is doing. s.witnessScore
  // stays as the run total. SHAPE CHANGE (Slice 2): s.witnesses was an array of id STRINGS;
  // it is now an array of OBJECTS. Only present when a loadout is active.
  if (G.witnesses && G.witnesses.length){
    s.witnesses = G.witnesses.map((w, slot) => {
      const e = { id: w.id, label: w.name, slot, fires: G.witnessFires[w.id] || 0, score: G.witnessScoreById[w.id] || 0 };
      // §D2 a CONSUMING cleanse witness (second_skin) surfaces its remaining charges so the client can
      // show 3→2→1→0. Present ONLY for such a witness ⇒ a run without one is byte-identical to before.
      if (w.payload && w.payload.kind === 'cleanse')
        e.charges = (G.witnessCharges[w.id] != null) ? G.witnessCharges[w.id] : (w.payload.charges || 0);
      return e;
    });
    s.witnessScore = G.thread.witnessScore || 0;
    if (G.witnessEffects.length) s.witnessEffectsDeferred = G.witnessEffects.length;
  }
  // §4.1 chain-milestone progress — surface the consecutive-extend counter so a client/agent can
  // see the march toward the next banked spin. `next` = extends still owed before the bank (the
  // milestone step is the `% 3` in commitPath). Gated on the experiment: OFF ⇒ absent, so a
  // flag-off run's serialized state is byte-identical to before this line.
  if (on('experiments.chainMilestone')) s.chainRun = { run: G.chainRun, next: 3 - (G.chainRun % 3) };
  if (engineFlag('enchantments') && G.enchFired) s.enchFired = G.enchFired;
  // §8 trim substrate — echo the run's trim state so a Run Record captures it and the client
  // (Slice 5's dev panel) can display it. Present ONLY when something is actually trimmed, so a
  // default (untrimmed) run's serialized state is byte-identical to before this slice.
  if (G.config && (Object.keys(G.config.balance).length || G.config.disabledContent.length)){
    s.config = { balance: { ...G.config.balance }, disabledContent: [...G.config.disabledContent] };
  }
  // §6 the patron's wish — read BEFORE you sit (informed consent / legibility).
  if (on('wishes') && G.activeWish){
    const boss = bossThisPatron();
    // §6 v2 (greybox) — `active` = the wish's play-bending physics are in force THIS segment
    // (the boss segment). The wish is visible from segment 1 (informed consent — the player
    // plays toward/around it), but only takes hold on the boss segment. Jackpot CONTRACTS are
    // tracked patron-wide regardless (see s.wish.contract, always present for a jackpot).
    s.wish = { id: G.activeWish.id, label: G.activeWish.label, desc: G.activeWish.desc, species: G.activeWish.species, active: boss };
    // §6 v2 twist kind (mirror/veil/freeReroll) so a client can label the patron's physics-bend.
    if (G.activeWish.species === 'twist' && G.activeWish.twist) s.wish.twist = { kind: G.activeWish.twist.kind };
    // §6 v2 jackpot CONTRACT progress — the live { kind, target, progress, met } the client renders
    // (spotless is the inverse contract: met ⇔ progress <= target). Reuses the pure evalJackpot.
    if (G.activeWish.species === 'jackpot' && G.activeWish.jackpot){
      const jk = G.activeWish.jackpot;
      const r = evalJackpot(jk, { window: G.thread.outcomes.slice(G.patronStartIndex), colours: G.thread.colours, frayed: G.thread.frayed, patronLen: patronLen() });   // Fix 3 — chainAlive scales its target with patronLen
      s.wish.contract = { kind: jk.kind, target: r.target, progress: r.progress, met: r.met };
    }
    // §6 v2 patron progress — `segment`/`length` kept (0-based, back-compat); `seg`/`len`/`boss`
    // added so a client/agent reads the boss beat directly (seg is 1-based for display, boss is
    // whether THIS is the last/boss segment where the physics apply).
    const pl = patronLen();
    s.patron = { index: G.patronIndex, segment: G.segsThisPatron, length: pl,
      seg: G.segsThisPatron + 1, len: pl, boss: bossThisPatron() };
  }
  const activeRungs = G.phase === 'knot' ? G.knotRungs : G.rungs;
  if ((G.phase === 'segment' || G.phase === 'knot' || G.phase === 'stitch') && activeRungs){
    // §6 v2 twist context — twists are SEGMENT-scoped (the knot is post-run, unbent).
    const tw = (G.phase === 'segment') ? activeTwist() : null;
    // §6 v2 VEIL (The Veiled One) — the Bloom rung is masked until the LIFT rung is met by the kept pool,
    // then LATCHED revealed for the rest of the segment (informational only — a blind bloom hit still counts
    // at resolve). The latch is a monotonic memo (keeps are final). The lift rung is normally the TRUE, but
    // Fix 2 falls back to the lowest-value non-veiled rung when the composed set dropped the True; if the
    // bloom is the ONLY rung the veil is VOID (nothing to hide — never masked). veilPlan is shared with the
    // segment-start event so the mask and the disclosure always agree (Fix 1: no channel leaks the bloom).
    const veil = (tw && tw.kind === 'veil') ? veilPlan(activeRungs) : null;
    if (veil && !veil.void && !G.veilRevealed && G.spinsTaken >= 1){
      if (veil.liftRung && poolMeetsRung(keptPool(G.tray), veil.liftRung)) G.veilRevealed = true;
    }
    const veilBloom = !!(veil && veil.bloom && !veil.void && !G.veilRevealed);
    s.rungs = activeRungs.map(r => {
      if (veilBloom && r === veil.bloom) return { tier: 'bloom', veiled: true };   // req/colour/value/reach_estimate hidden
      return { tier: r.tier, colour: r.colour, value: r.value || 0,
        req: r.req, ...(r.concentrated ? { concentrated: true } : {}), ...(r.pure ? { pure: r.pure } : {}),
        reach_estimate: r._p };
    });
    s.tray = G.tray.map(t => ({ i: t.di, fi: t.fi, symbol: t.symbol, mag: t.mag, kept: t.kept, locked: t.locked, ...(t.forced ? { forced: true } : {}) }));
    if (G.spinsTaken >= 1){
      // the resolve READ must reflect the twist (mirror) — the preview never lies about a resolve.
      const pool = twistKeptPool(tw, keptPool(G.tray));
      const withWild = pool.map(f => f.symbol === 'fang' ? { ...f, symbol:'__wild__' } : f);
      const { stats, counts } = tally(withWild);
      s.metNow = activeRungs.filter(r => meetsRung(stats, withWild, r, counts).met)
                            .map(r => ({ tier: r.tier, colour: r.colour }));
      if (G.phase === 'segment') s.stopPreview = stopPreview(pool, G.rungs, G.thread);
      // opt-in spin-sigils raised by this spin's faces (Law L4) — the client renders one per die;
      // `targets` = the loose dice it can re-throw (chosen → the pickable set). Draws no rng. `effect`
      // is the tap KIND: 'reroll' (free re-throw) or 'expose' (a PEEK — slice-4, no re-throw).
      if ((G.phase === 'segment' || G.phase === 'knot') && G.pendingSigils.length)
        s.sigils = G.pendingSigils.map(sg => ({ di: sg.di, effect: sg.effect || 'reroll', name: sg.name, glyph: sg.glyph,
          scope: sg.scope, desc: sg.desc, chosen: sg.scope === 'chosen', targets: looseTargets(sg) }));
      // §slice-4 Open Hand — the ambient un-keep offers (present only while a kept die + the etched
      // face are both live, so a run with no release ench serializes byte-identically). `targets` =
      // the kept dice this etched face may release.
      const rel = looseReleaseOffers();
      if (rel.length) s.releaseOffers = rel.map(o => ({ di: o.di, fi: o.fi, name: o.name, desc: o.desc, targets: o.targets }));
      // §slice-4 Augur peek — the pre-drawn next face of each die with a queued expose peek. The
      // client shows what that drum's next throw will land; consumed on the die's next re-throw.
      const peeks = Object.keys(G.peeked).map(k => +k).filter(di => G.peeked[di] != null)
        .map(di => { const f = G.hand.dice[di].faces[G.peeked[di]]; return { di, face: { symbol: f.symbol, mag: f.mag || 1 } }; });
      if (peeks.length) s.peeks = peeks;
      // §6 v2 generous_one — the once-per-segment FREE reroll (segment phase, loose dice only). Ambient
      // (like a sigil): present only while available, so a non-generous run's state is byte-identical.
      if (tw && tw.kind === 'freeReroll' && !G.wishRerollUsedThisSeg){
        const loose = G.tray.filter(t => !t.kept && !t.locked && t.symbol !== 'blank').map(t => t.di);
        if (loose.length) s.wishReroll = { label: G.activeWish.label, targets: loose };
      }
    }
  }
  if (G.phase === 'perk'){
    s.perkOffer = G.perkOffer.map((c, i) => ({
      card: i, id: c.id, kind: c.kind, label: c.label, desc: c.desc,
      ...(c.boon && c.boon.effect ? { boon: { effect: c.boon.effect } } : {}),   // §Change-3 lets a client tell a face-ETCH (enchant) card from a deepen (pip) card for the pick-a-face label
      // §D3 a BARGAIN discloses BOTH coupled halves structurally (a client renders "boon: X | bane: Y" and
      // the pick-a-face targeting flow, same as an enchant card). The card `desc` also discloses both in
      // prose; this is the structured mirror. Present ONLY on a bargain ⇒ other cards are byte-identical.
      ...(c.boon && c.boon.effect === 'bargain' && c.boon.boonEnch && c.boon.baneEnch
        ? { bargain: { boon: bargainHalf(c.boon.boonEnch, 'boon'), bane: bargainHalf(c.boon.baneEnch, 'bane') } } : {}),
      ...(c.witnessId ? { witnessId: c.witnessId } : {}),   // §4.2 draft cards name the witness they'd ink
      ...(c.grade ? { grade: c.grade, rarity: c.rarity, blemished: !!c.blemished } : {}),
      // rider = the disclosed bane a blemished card owes. Surface WHAT it does (desc/describeEnch,
      // the same humanizer the hand's ench uses) so a picker can weigh the price, not just its band.
      ...(c.rider ? { rider: { band: c.rider.band, name: c.rider.name, desc: c.rider.desc || describeEnch(c.rider) } } : {}),
    }));
    // §4.2 when the portrait slots are full, a draft must REPLACE — surface the worn row so a
    // client/agent can choose the victim slot (legalActions enumerates the {card,slot} variants).
    if (G.ladderDraw){
      s.draw = { grade: G.ladderDraw.grade, baseTier: G.ladderDraw.baseTier, mixed: G.ladderDraw.mixed, picksRemaining: G.picksRemaining };
      const cap = num('witnesses.portraitSlots', 5);
      if (G.perkOffer.some(c => c.kind === 'draft') && G.witnesses.length >= cap)
        s.draw.portraitFull = { cap, worn: G.witnesses.map((w, slot) => ({ slot, id: w.id, label: w.name })) };
    }
  }
  if (G.phase === 'transform' && G.pendingTransforms.length){
    const pt = G.pendingTransforms[0];
    s.transformOffer = { effect: pt.effect, name: pt.name, polarity: pt.polarity, params: pt.params || {}, desc: pt.desc,
      // candidates read the CURRENT hand face (symbol+mag), not the frozen tray — so a deepen applied
      // earlier in this same transform batch shows its new mag, and convert shows the live symbol.
      candidates: G.tray.filter(t => transformCandidate(t, pt.effect)).map(t => {
        const f = G.hand.dice[t.di].faces[t.fi]; return { i: t.di, fi: t.fi, symbol: f.symbol, mag: f.mag || 1 }; }) };
    // §slice-4 convert offers a `to` COLOUR — the client renders {type:'transform',di,to} per colour;
    // an omitted `to` takes the deterministic default (convertTargetColour). `default` names it.
    if (pt.effect === 'convert') s.transformOffer.colours = COLOUR_IDS.slice();
  }
  if (G.phase === 'done'){ s.score = G.result.score; s.scoreLines = G.result.lines; s.combos = G.result.combos;
    if (G.knotResult) s.knot = { hit: G.knotResult.hit, colour: G.knotResult.colour, tight: G.knotResult.tight, metCount: G.knotResult.metCount }; }
  return s;
}

function legalActions(){
  if (!G || G.over) return [{ type:'new_run' }];
  const out = [];
  if (G.phase === 'segment' || G.phase === 'knot'){
    if (G.rollsLeft > 0) out.push({ type:'spin' });
    if (G.spinsTaken >= 1){
      out.push({ type:'resolve' });
      const win = G.spinsTaken - 1;
      const { cap } = keepConstraints(activeWarps());
      // §slice-4 the keepCap ledger: gate on manual keeps SPENT this window (keepSpend), not on the
      // live count — so a release (un-keep) does NOT refund the budget. Byte-identical without release
      // (no un-keep ⇒ spend === live count of manual keeps at keptWin===win).
      const capOk = !cap || (G.keepSpend[win] || 0) < cap;
      if (capOk) for (const t of G.tray)
        if (!t.kept && !t.locked && t.symbol !== 'blank') out.push({ type:'keep', args:{ i: t.di } });
      // AMBIENT UN-KEEP (Bear verdict 2026-07-14) — the free undo of a manual keep. Legal for a KEPT,
      // non-locked, non-FORCED die (a forcedKeep die is the ritual's demand, held; see the act guard).
      // NO keepCap gate: un-keeping frees the DIE, never the keepSpend BUDGET, so a cap curse's bite
      // survives (keep→unkeep→re-keep cannot launder the cap — the act handler leaves keepSpend intact).
      // NO rollsLeft gate either: un-kept dice are EXCLUDED from the resolve pool (keptPool filters
      // t.kept), so dropping a profane keep can flip a `pure`/`exact` rung met even at 0 rolls — a real
      // line, kept legal. This mirrors the ungated Open Hand `release` verb (a distinct action type).
      for (const t of G.tray)
        if (t.kept && !t.locked && !t.forced) out.push({ type:'unkeep', args:{ i: t.di } });
      // opt-in spin-sigils (ambient — coexist with spin/keep/resolve; ignoring = any other move).
      // Both reroll AND expose sigils are self/chosen/etc.-scoped; expose is self ⇒ the non-chosen arm.
      for (const sg of (G.pendingSigils || [])){
        const targets = looseTargets(sg);
        if (!targets.length) continue;                                   // no loose target ⇒ not actionable
        if (sg.scope === 'chosen') for (const tdi of targets) out.push({ type:'sigil', args:{ di: sg.di, target: tdi } });
        else out.push({ type:'sigil', args:{ di: sg.di } });
      }
      // §slice-4 Open Hand release — un-keep a kept die (dedupe targets across etched faces). Draws no rng.
      const relTargets = new Set();
      for (const o of looseReleaseOffers()) for (const tdi of o.targets) relTargets.add(tdi);
      for (const tdi of relTargets) out.push({ type:'release', args:{ target: tdi } });
      // §6 v2 generous_one — the ambient once-per-segment FREE reroll (segment phase, loose dice only).
      if (G.phase === 'segment'){
        const tw = activeTwist();
        if (tw && tw.kind === 'freeReroll' && !G.wishRerollUsedThisSeg)
          for (const t of G.tray)
            if (!t.kept && !t.locked && t.symbol !== 'blank') out.push({ type:'wish_reroll', args:{ di: t.di } });
      }
    }
  } else if (G.phase === 'stitch'){
    out.push({ type:'stitch' }, { type:'snap' });
  } else if (G.phase === 'perk'){
    const slotCap = num('witnesses.portraitSlots', 5);
    const { min: fMin, max: fMax } = faceCaps();
    G.perkOffer.forEach((c, idx) => {
      const isDeepen = c.id === 'deepen' || (c.boon && c.boon.effect === 'pip');
      const isEnchant = !!(c.boon && c.boon.effect === 'enchant' && c.boon.ench);
      const isBargain = !!(c.boon && c.boon.effect === 'bargain' && c.boon.boonEnch && c.boon.baneEnch);   // §D3 targets like an enchant card
      const faceVerb = c.boon && ['graft', 'copy', 'excise', 'cursed_graft'].includes(c.boon.effect) ? c.boon.effect : null;
      const debtVerb = c.boon && ['shift', 'scour', 'absolve'].includes(c.boon.effect) ? c.boon.effect : null;
      if (isDeepen){
        let any = false;
        for (let di = 0; di < G.hand.dice.length; di++)
          for (let fi = 0; fi < G.hand.dice[di].faces.length; fi++)
            if (deepenable(G.hand.dice[di].faces[fi])){ out.push({ type:'perk', args:{ card: idx, id: c.id, die: di, face: fi } }); any = true; }
        if (!any) out.push({ type:'perk', args:{ card: idx, id: c.id } });   // auto-pick no-op, still legal
      } else if (isEnchant && engineFlag('enchantments')){
        // §Change-3 targeted etch — a face-etch card enumerates one pick per LEGAL face (deepen-style),
        // PLUS the bare auto pick (the random etch). Face legality: EVERY face of every die. Hand faces
        // are never 'blank' (blank is a tray-only placeholder), so "every non-blank face" == all faces;
        // fang faces are included to match the random etch's reachable set (attachEnch can land on any
        // die/face), so targeting is a strict choose-where — never more restrictive than today's default.
        for (let di = 0; di < G.hand.dice.length; di++)
          for (let fi = 0; fi < G.hand.dice[di].faces.length; fi++)
            out.push({ type:'perk', args:{ card: idx, id: c.id, die: di, face: fi } });
        out.push({ type:'perk', args:{ card: idx, id: c.id } });   // bare auto pick (random etch — always legal)
      } else if (isBargain && engineFlag('enchantments')){
        // §D3 a bargain etches BOTH coupled halves on one CHOSEN face — targeted exactly like an enchant card:
        // one {card,id,die,face} pick per face (both halves land there) PLUS the bare auto pick (a random face).
        for (let di = 0; di < G.hand.dice.length; di++)
          for (let fi = 0; fi < G.hand.dice[di].faces.length; fi++)
            out.push({ type:'perk', args:{ card: idx, id: c.id, die: di, face: fi } });
        out.push({ type:'perk', args:{ card: idx, id: c.id } });   // bare auto pick (random etch — always legal)
      } else if (faceVerb){
        // §D1 face verbs enumerate their targeting variants (following the enchant-targeting pattern)
        // PLUS the bare auto pick (always legal — the auto resolves deterministically or fizzles cleanly):
        //   graft / cursed_graft — a variant per drum BELOW max (graft also × 3 colours);
        //   copy — a face on a drum below max; excise — a face on a drum ABOVE min.
        for (let di = 0; di < G.hand.dice.length; di++){
          const len = G.hand.dice[di].faces.length;
          if (faceVerb === 'graft' && len < fMax)
            for (const col of COLOUR_IDS) out.push({ type:'perk', args:{ card: idx, id: c.id, die: di, to: col } });
          else if (faceVerb === 'cursed_graft' && len < fMax)
            out.push({ type:'perk', args:{ card: idx, id: c.id, die: di } });
          else if (faceVerb === 'copy' && len < fMax)
            for (let fi = 0; fi < len; fi++) out.push({ type:'perk', args:{ card: idx, id: c.id, die: di, face: fi } });
          else if (faceVerb === 'excise' && len > fMin)
            for (let fi = 0; fi < len; fi++) out.push({ type:'perk', args:{ card: idx, id: c.id, die: di, face: fi } });
        }
        out.push({ type:'perk', args:{ card: idx, id: c.id } });   // bare auto pick (deterministic; fizzles clean if no target)
      } else if (debtVerb){
        // §D2 debt verbs enumerate a variant per BANE-carrying source face (data-driven: polarity:'bane',
        // never an effect name — a ward is a boon, skipped); shift ALSO × every OTHER face (its relocation
        // target). PLUS the bare auto pick (always legal — the auto resolves deterministically or fizzles
        // hand-blind when no bane is worn). With no banes on the hand ⇒ only the bare pick is offered.
        const baneFaces = [];
        for (let di = 0; di < G.hand.dice.length; di++)
          for (let fi = 0; fi < G.hand.dice[di].faces.length; fi++)
            // §D3 coupling guard — only FREE-STANDING banes (no pairId) are debt-verb sources, matching
            // firstBaneIdx/baneSource exactly (a coupled bargain bane enumerates as no source ⇒ never targetable).
            if (faceHasFreeBane(G.hand.dice[di].faces[fi])) baneFaces.push({ di, fi });
        if (debtVerb === 'shift'){
          for (const sfc of baneFaces)
            for (let tdi = 0; tdi < G.hand.dice.length; tdi++)
              for (let tfi = 0; tfi < G.hand.dice[tdi].faces.length; tfi++)
                if (!(tdi === sfc.di && tfi === sfc.fi))
                  out.push({ type:'perk', args:{ card: idx, id: c.id, die: sfc.di, face: sfc.fi, toDie: tdi, toFace: tfi } });
        } else {
          for (const sfc of baneFaces) out.push({ type:'perk', args:{ card: idx, id: c.id, die: sfc.di, face: sfc.fi } });
        }
        out.push({ type:'perk', args:{ card: idx, id: c.id } });   // bare auto pick (fizzles clean when no bane)
      } else if (c.kind === 'draft'){
        // §4.2 draft: bare pick appends (slots free) or auto-replaces the OLDEST (slots full);
        // when full, also enumerate an explicit {slot:j} variant per worn witness (choose the victim).
        out.push({ type:'perk', args:{ card: idx, id: c.id } });
        if (G.witnesses.length >= slotCap)
          for (let j = 0; j < G.witnesses.length; j++) out.push({ type:'perk', args:{ card: idx, id: c.id, slot: j } });
      } else out.push({ type:'perk', args:{ card: idx, id: c.id } });
    });
  } else if (G.phase === 'transform'){
    const pt = G.pendingTransforms[0];
    if (pt) for (const t of G.tray){
      if (!transformCandidate(t, pt.effect)) continue;
      if (pt.effect === 'convert'){
        // §slice-4 convert enumerates {di} (omitted `to` ⇒ deterministic default colour) PLUS
        // {di,to} per colour, skipping the face's current colour (a recast always changes something).
        const cur = G.hand.dice[t.di].faces[t.fi].symbol;
        out.push({ type:'transform', args:{ di: t.di } });
        for (const c of COLOUR_IDS) if (c !== cur) out.push({ type:'transform', args:{ di: t.di, to: c } });
      } else out.push({ type:'transform', args:{ di: t.di } });
    }
    out.push({ type:'transform', args:{ skip: true } });   // forced:false ⇒ declining is always legal
  }
  out.push({ type:'state' }, { type:'legal' }, { type:'new_run' });
  return out;
}

// ---- act -------------------------------------------------------------------------
function act(action){
  const events = [];
  const fail = (error) => ({ ok:false, error, state: serializeState() });
  if (!action || typeof action.type !== 'string') return fail('action must be {"type":...}');
  const a = { ...action, ...(action.args || {}) };   // accept both flat and legalActions() descriptor forms

  switch (a.type) {
    case 'state': return { ok:true, state: serializeState(), events };
    case 'legal': return { ok:true, legal: legalActions(), state: serializeState(), events };
    case 'new_run': {
      const ev = newRun(a.seed, { witnesses: a.witnesses, wish: a.wish, warps: a.warps, enchants: a.enchants, curses: a.curses, enchTest: a.enchTest, sigil: a.sigil,
        balance: a.balance, disabledContent: a.disabledContent });   // §8 trim substrate (dev-panel trim state)
      return { ok:true, state: serializeState(), events: ev };
    }
  }
  if (!G) return fail('no run — send {"type":"new_run"}');
  if (G.over) return fail('run is over — send {"type":"new_run"}');

  switch (a.type) {
    case 'spin': {
      if (G.phase !== 'segment' && G.phase !== 'knot') return fail(`cannot spin during '${G.phase}'`);
      if (G.rollsLeft <= 0) return fail('no spins left — resolve');
      doSpin(events);
      return { ok:true, state: serializeState(), events };
    }
    case 'keep': {
      if (G.phase !== 'segment' && G.phase !== 'knot') return fail(`cannot keep during '${G.phase}'`);
      if (G.spinsTaken < 1) return fail('spin first');
      const t = G.tray.find(t => t.di === a.i);
      if (!t) return fail(`no die ${a.i}`);
      if (t.kept) return fail(`die ${a.i} already kept (keeps are final)`);
      if (t.locked) return fail(`die ${a.i} is locked`);
      if (t.symbol === 'blank') return fail(`die ${a.i} shows blank`);
      const { cap } = keepConstraints(activeWarps());   // C0: was G.curses.keepCap
      const win = G.spinsTaken - 1;
      // §slice-4 keepCap gates on manual keeps SPENT this window (keepSpend), so a later release does
      // NOT refund the budget. Forced keeps (the ritual's demand) never touch keepSpend, as before.
      if (cap && (G.keepSpend[win] || 0) >= cap) return fail(`keep cap: at most ${cap} keeps per spin`);
      const idx = G.tray.findIndex(x => x.di === a.i);
      G.tray[idx] = { ...t, kept:true, keptWin: win };
      G.keepSpend[win] = (G.keepSpend[win] || 0) + 1;   // the spent-keep ledger (release does not refund)
      events.push(`kept die ${a.i}: ${t.symbol}${(t.mag||1)>1?`(${t.mag})`:''}`);
      fireEnch('on_keep', events, a.i);   // the just-kept face's on_keep enchantments fire
      return { ok:true, state: serializeState(), events };
    }
    case 'unkeep': {
      // AMBIENT UN-KEEP (Bear verdict 2026-07-14) — the FREE, unconditional undo of a manual keep: the
      // kept die drops back to the pool (kept=false, keptWin cleared) and rerolls next spin. Draws NO rng
      // (a pure flag flip ⇒ same seed + actions replay byte-for-byte). Sibling to the Open Hand `release`
      // verb but with no etched face and no per-segment budget — any manually-kept die may be let go.
      if (G.phase !== 'segment' && G.phase !== 'knot') return fail(`cannot unkeep during '${G.phase}'`);
      if (G.spinsTaken < 1) return fail('spin first');
      const t = G.tray.find(t => t.di === a.i);
      if (!t) return fail(`no die ${a.i}`);
      if (!t.kept) return fail(`die ${a.i} is not kept`);
      if (t.forced) return fail(`die ${a.i} is a forced keep (the ritual holds it) — cannot unkeep`);
      if (t.locked) return fail(`die ${a.i} is locked — cannot unkeep`);
      const idx = G.tray.findIndex(x => x.di === a.i);
      // keepSpend is NOT decremented: a keepCap curse frees the DIE, never the BUDGET — the cap's bite
      // survives (keep→unkeep→re-keep cannot launder it), exactly as Open Hand release does not refund.
      // on_keep-triggered effects that already fired do NOT un-fire (the events happened); any sigil that
      // rose stays risen per its own rules.
      G.tray[idx] = { ...t, kept: false, keptWin: -1 };
      events.push(`unkept die ${a.i}: ${t.symbol}${(t.mag||1)>1?`(${t.mag})`:''} — released back to the pool (it rerolls next spin)`);
      return { ok:true, state: serializeState(), events };
    }
    case 'resolve': {
      if (G.phase === 'knot'){
        if (G.spinsTaken < 1) return fail('spin first');
        const knotResult = resolveKnot(keptPool(G.tray), G.knotRungs, G.liveBloomColours);
        finishRun(knotResult, events);
        return { ok:true, state: serializeState(), events };
      }
      if (G.phase !== 'segment') return fail(`cannot resolve during '${G.phase}'`);
      if (G.spinsTaken < 1) return fail('spin first');
      // §6 v2 twist: apply the patron's resolve-physics twist (mirror) to a COPY of the kept
      // pool — the read used for resolve + witness ctx. No twist ⇒ the pool as-is (byte-neutral).
      const pool = twistKeptPool(activeTwist(), keptPool(G.tray));
      const res = resolveSegment(pool, G.rungs);
      if (res.hit >= 0){ commitPath(res, {}, 3, events, pool); return { ok:true, state: serializeState(), events }; }
      const hasLoose = G.tray.some(t => !t.kept && !t.locked);
      if (hasLoose){
        G.phase = 'stitch';
        events.push('no rung met — the thread WOULD snap. A Stitch in Time is offered: reroll the loose dice once ({"type":"stitch"}), or accept the snap ({"type":"snap"})');
        return { ok:true, state: serializeState(), events };
      }
      doSnapEnd(events);
      return { ok:true, state: serializeState(), events };
    }
    case 'stitch': {
      if (G.phase !== 'stitch') return fail('no stitch offered');
      G.tray = G.tray.map(t => {
        if (t.kept || t.locked) return t;
        const nf = throwFace(t.di);   // §slice-4 through the re-throw primitive (consumes an Augur peek if queued)
        return { ...t, symbol: nf.symbol, mag: nf.mag, fi: nf.fi };
      });
      events.push('stitch: the loose dice fly one last time — ' + G.tray.map(t => `${t.di}:${t.symbol}`).join(' '));
      // the WHOLE shown tray answers, fangs excluded (a stitch is never fang-completed)
      const savePool = twistKeptPool(activeTwist(), G.tray   // §6 v2 twist: the mirror bends the stitch resolve too
        .filter(t => t.symbol !== 'blank' && !sym(t.symbol).isWild)
        .map(t => ({ symbol: t.symbol, mag: t.mag || 1 })));
      const res = resolveSegment(savePool, G.rungs);
      if (res.hit >= 0){ G.stitchSaves++; commitPath(res, { stitched:true }, 4, events, savePool); }
      else { events.push('the stitch misses'); doSnapEnd(events); }
      return { ok:true, state: serializeState(), events };
    }
    case 'snap': {
      // decline the offered Stitch in Time — the thread breaks straight to the knot.
      // legalActions() has always advertised {type:'snap'} in the stitch phase (and the
      // Run Record contract lists it replayable); this wires the missing act() branch.
      if (G.phase !== 'stitch') return fail('no snap offered');
      doSnapEnd(events);
      return { ok:true, state: serializeState(), events };
    }
    case 'sigil': {
      // INVOKE an opt-in spin-sigil (Law L4). Optional — ignoring it is just doing another move.
      // Free (no rollsLeft cost), loose-only, and it re-throws the target(s) drawing G.rng NOW
      // (a recorded action ⇒ replay byte-for-byte). A tapped reroll then fires the newly-shown
      // face's on_roll ONCE (the faithful 1-hop cascade, bounded by REROLL_MAX_HOP).
      if (G.phase !== 'segment' && G.phase !== 'knot') return fail(`no sigil during '${G.phase}'`);
      const si = (G.pendingSigils || []).findIndex(s => s.di === a.di);
      if (si < 0) return fail(`no sigil on die ${a.di}`);
      const sg = G.pendingSigils[si];
      // §slice-4 EXPOSE (Augur's Sigil) — the tap is a PEEK, not a re-throw: pre-draw this die's next
      // face index from G.rng NOW (a recorded action ⇒ replays byte-exact) and store it. The die's
      // next re-throw from ANY path (spin/sigil/bane/wish_reroll — all via throwFace) lands the
      // peeked face and consumes the peek. No cascade (peeking raises no new sigil).
      if (sg.effect === 'expose'){
        const t = G.tray.find(x => x.di === sg.di);
        if (!t || t.kept || t.locked || t.symbol === 'blank') return fail(`die ${sg.di} is not loose to peek`);
        G.pendingSigils.splice(si, 1);
        const die = G.hand.dice[sg.di];
        const fi = Math.floor(G.rng() * die.faces.length);   // the peek — spends rng at tap time
        G.peeked[sg.di] = fi;
        const pf = die.faces[fi];
        events.push(`${sg.name} peeks — die ${sg.di}'s next throw will be ${pf.symbol}${(pf.mag||1)>1?`(${pf.mag})`:''}`);
        return { ok:true, state: serializeState(), events };
      }
      let targets;
      if (sg.scope === 'chosen'){
        if (a.target == null) return fail('a chosen sigil needs a target die');
        if (!looseTargets(sg).includes(a.target)) return fail(`die ${a.target} is not a loose target`);
        targets = [a.target];
      } else if (sg.scope === 'random'){
        targets = sigilRandomTargets(sg);
      } else {
        targets = looseTargets(sg);   // self / adjacent — deterministic
      }
      G.pendingSigils.splice(si, 1);   // consume the sigil (one-shot)
      for (const tdi of targets) applyEnchEffect({ effect: 'reroll', name: sg.name }, tdi, events);
      for (const tdi of targets) fireEnch('on_roll', events, tdi, sg.depth + 1);   // 1-hop cascade
      return { ok:true, state: serializeState(), events };
    }
    case 'release': {
      // §slice-4 Open Hand — the UNDO verb. Un-keep a kept die (kept=false, keptWin cleared) so it
      // rerolls next spin. Free, draws NO rng. Consumes ONE etched face's per-segment budget
      // (releaseUsed key "di:fi"). It does NOT refund the keepCap window budget (keepSpend untouched).
      if (G.phase !== 'segment' && G.phase !== 'knot') return fail(`no release during '${G.phase}'`);
      const offer = looseReleaseOffers().find(o => o.targets.includes(a.target));
      if (!offer) return fail(`no release offer can free die ${a.target}`);
      const ti = G.tray.findIndex(t => t.di === a.target);
      if (ti < 0) return fail(`no die ${a.target}`);
      G.tray[ti] = { ...G.tray[ti], kept: false, keptWin: -1 };
      G.releaseUsed.add(offer.key);   // once per etched face per segment
      events.push(`${offer.name} opens — die ${a.target} is released back to the pool (it rerolls next spin)`);
      return { ok:true, state: serializeState(), events };
    }
    case 'wish_reroll': {
      // §6 v2 The Generous One — a FREE (no rollsLeft cost), once-per-segment re-throw of ONE loose
      // die. Draws G.rng AT ACTION TIME (a recorded action ⇒ replay byte-for-byte). Segment phase
      // only (not the knot); loose dice only (never undoes a bank). Each use is billed at her
      // patronage's end (the lien in patronComplete). Ambient — declining it is just another move.
      if (G.phase !== 'segment') return fail(`no free reroll during '${G.phase}'`);
      const tw = activeTwist();
      if (!tw || tw.kind !== 'freeReroll') return fail('no free reroll offered');
      if (G.spinsTaken < 1) return fail('spin first');
      if (G.wishRerollUsedThisSeg) return fail('the free reroll is already spent this segment');
      const ti = G.tray.findIndex(t => t.di === a.di);
      if (ti < 0) return fail(`no die ${a.di}`);
      const t = G.tray[ti];
      if (t.kept || t.locked || t.symbol === 'blank') return fail(`die ${a.di} is not a loose die`);
      const nf = throwFace(t.di);   // §slice-4 through the re-throw primitive (consumes an Augur peek if queued)
      G.tray[ti] = { ...t, symbol: nf.symbol, mag: nf.mag, fi: nf.fi };
      G.wishRerollUsedThisSeg = true; G.wishRerollUses++;
      events.push(`${G.activeWish.label} grants a free reroll — die ${a.di} → ${nf.symbol}`);
      fireEnch('on_roll', events, a.di);   // the newly-shown face's on_roll fires (banes/sigils), like a spin
      return { ok:true, state: serializeState(), events };
    }
    case 'transform': {
      if (G.phase !== 'transform') return fail('no transform offered');
      const pt = G.pendingTransforms[0];
      if (!pt) return fail('nothing to transform');
      if (a.skip){ events.push(`declined the ${pt.name}`); }
      else {
        const t = G.tray.find(x => x.di === a.di);
        if (!t) return fail(`no die ${a.di}`);
        if (!transformCandidate(t, pt.effect)) return fail(`die ${a.di} is not a valid ${pt.effect} target`);
        // §slice-4 convert threads an optional action `to` (a colour id) into params; omitted ⇒ the
        // deterministic default colour (convertTargetColour). deepen/erode ignore `to`.
        const params = pt.effect === 'convert' ? { ...(pt.params || {}), to: a.to } : pt.params;
        applyEnchEffect({ effect: pt.effect, params, name: pt.name, polarity: pt.polarity }, a.di, events);   // permanent hand-face change (no rng)
      }
      G.pendingTransforms.shift();
      if (G.pendingTransforms.length) return { ok:true, state: serializeState(), events };   // more choices pending
      const pp = G.pendingPerk; G.pendingPerk = null;   // all resolved → the deferred reward draw
      enterPerkPhase(pp.res, pp.forced, pp.finish, pp.perkN, pp.stitched, events);
      return { ok:true, state: serializeState(), events };
    }
    case 'perk': {
      if (G.phase !== 'perk') return fail('no perk offered');
      // select by index (a.card — needed for mixed draws with duplicate ids) or by id (legacy)
      const idx = (a.card != null) ? a.card : G.perkOffer.findIndex(c => c.id === a.id);
      const card = G.perkOffer[idx];
      if (!card) return fail(`not in the offer: ${G.perkOffer.map((c,i)=>`${i}:${c.id}`).join(' | ')}`);
      if (G.perkForced && card.kind !== 'curse') return fail('the curse is mandatory');

      if (card.kind === 'curse'){
        if (card.warp) G.curseWarps.push(card.warp);   // C0: id-blind ritual dispatch (was if(id==='grasping')…)
        applyCurse(G.thread, null);
        events.push(`CURSE taken: ${card.label} — the segment just woven is cursed (it drains its neighbours)`);
        fireWitnesses('on_curse_taken', { cursedSegments: G.thread.outcomes.filter(o => o.cursedHere).length, threadLength: G.thread.length }, events);
      } else if (G.ladderDraw){
        applyLadderBoon(card, a, events);
      } else if (card.id === 'deepen'){
        const t = deepenTarget(a);
        if (!t) return fail('no deepenable face remains');
        t.f.mag = (t.f.mag || 1) + 1;
        events.push(`Deepen: die ${t.di} face ${t.fi} (${t.f.symbol}) → ${t.f.mag} pips`);
      } else if (card.id === 'reweave'){ G.bonusSpins += 1; events.push('Reweave: +1 spin next segment'); }
      else if (card.id === 'glimmer'){ G.scoreBonus += 3; events.push('Glimmer: +3 final score'); }
      else if (card.id === 'steady'){ G.steadyNext = true; events.push('Steady: the next floor comes easier'); }

      // pick-N (§9d): consume the chosen card; if the draw grants more picks, stay in the
      // perk phase until they're spent (curses + legacy draws are always a single pick).
      G.perkOffer.splice(idx, 1);
      G.picksRemaining = Math.max(0, (G.picksRemaining || 1) - 1);
      if (!G.perkForced && G.picksRemaining > 0 && G.perkOffer.length){
        events.push(`pick ${G.picksRemaining} more of ${G.perkOffer.length}`);
        return { ok:true, state: serializeState(), events };
      }
      startSegment(events);
      return { ok:true, state: serializeState(), events };
    }
    default:
      return fail(`unknown action '${a.type}' — send {"type":"legal"} for options`);
  }
}

// =============================================================================
// EXPORTS — the session API the Node CLI and the web client both drive.
// The §D1 face verbs are ALSO exported — pure face-array mutations, so the face-economy
// test drives them directly (cap fizzles + copy-etch deep-clone independence) without an
// acquisition path. They take a die/face object + an events array; only reindexAfterExcise
// (not exported) touches G, so graft/copy/excise/cursedGraft are G-independent.
// =============================================================================
export { newRun, act, serializeState, legalActions };
export { graftFace, copyEtchFace, exciseFace, cursedGraft, faceCaps, fixFaceIndex };
// §D2 debt verbs + the second_skin lien interceptor + a live-hand accessor — exported (like the D1
// face verbs) so debt_verbs_test drives them directly (object-IDENTITY checks + charge counting)
// without fighting a play policy for banes/load-bearing fangs. They read the live G set by newRun.
export { shiftBane, scourBane, absolveBane, firstBaneIdx, tryRefuseLien };
export { attachBane };   // §D-fix4 TEST HOOK — drive the identical-stacking-avoidance placer directly (repeated same-name lien asserts)
export { veilPlan };     // Fix 2 TEST HOOK — the veil lift/void resolver (fallback lift rung + void), unit-tested directly
export function _handRef(){ return G && G.hand; }   // TEST HOOK — the live G.hand (raw ench objects, for identity asserts)
