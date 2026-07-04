#!/usr/bin/env node
// =============================================================================
// SPELLSPUN — remote agent transport (pure core, no DOM, no browser)
//
//   node agent_cli.mjs                 interactive: one JSON action per line on
//                                      stdin → one JSON result per line on stdout
//   node agent_cli.mjs --seed 42       same, seeded (reproducible)
//   node agent_cli.mjs --demo [N]      scripted reference agent plays N runs
//                                      through the public protocol (conformance)
//
// Protocol (one JSON object per line):
//   in : {"type":"spin"} | {"type":"keep","i":2} | {"type":"resolve"} | ...
//   out: {"ok":true,"state":{...},"events":[...]} | {"ok":false,"error":"...","state":{...}}
//
// This transport imports ONLY the pure rules (engine / spellspun / generator /
// registry). It is the SpellSpun equivalent of the old agent_play.mjs, but with
// no play.js and no DOM shim — safe to run anywhere Node runs. Game mechanics
// mirror runsim/spellspun_sim.mjs (the Monte-Carlo harness) and play.js.
// See AGENT_PLAY.md for the full protocol contract.
// =============================================================================

import { makeRng, tally, meetsRung } from './engine.js';
import { generateSegment, generateKnot, resetShapeMemory } from './generator.js';
import {
  newThread, resolveSegment, commitSegment, applyCurse,
  checkBlooms, recordBloom, drawPerks, resolveKnot, tallyScore,
  stopPreview, deepenable,
} from './spellspun.js';
import { sym } from './registry/symbols.js';

// =============================================================================
// CONSTANTS — mirror play.js / spellspun_sim.mjs exactly
// =============================================================================
const DIFF_BASE = { floor: 0.55, true: 0.32, bloom: 0.16 };
const DEPTH_BONUS = { from: 3, base: 3, step: 3, on: true };

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

function newTray(){
  return G.hand.dice.map((d, di) => ({ di, symbol:'blank', mag:0, fi:0, kept:false, keptWin:-1, locked:false }));
}

function startSegment(events){
  const diff = { ...DIFF_BASE };
  if (G.steadyNext){ diff.floor += 0.10; G.steadyNext = false; }
  const segRng = makeRng((G.seed * 1000003 + G.segIndex * 7919 + 13) >>> 0);
  const seg = generateSegment(G.hand, diff, { rng: segRng, segIndex: G.segIndex });
  G.rungs = seg.rungs;
  G.rollsLeft = 3 + G.bonusSpins; G.bonusSpins = 0;
  G.spinsTaken = 0;
  G.tray = newTray();
  G.phase = 'segment';
  events.push(`segment ${G.segIndex + 1} — three rungs offered: ` +
    G.rungs.map(r => `${r.tier}(${r.colour}, ~${Math.round((r._p||0)*100)}% reach)`).join(' · '));
}

function newRun(seed){
  seed = (seed === undefined || seed === null) ? (Date.now() & 0x7fffffff) : (seed >>> 0);
  resetShapeMemory();
  G = {
    seed,
    rng: makeRng(seed),
    hand: startingHand(makeRng((seed ^ 0x9e3779b9) >>> 0)),
    thread: newThread(),
    segIndex: 0, phase: 'segment',
    scoreBonus: 0, depthBonus: 0, bonusSpins: 0, steadyNext: false,
    curses: { rollLock: 0, keepCap: 0 },
    liveBloomColours: [], stitchSaves: 0, fangCorruptSegments: 0,
    tray: null, rungs: null, rollsLeft: 0, spinsTaken: 0,
    perkOffer: null, perkForced: false, lastSeg: null,
    knotRungs: null, result: null, over: false,
    events: [],
  };
  const events = [`a patron sits down (seed ${seed}) — spin the Spinner`];
  startSegment(events);
  return events;
}

// ---- spin ----------------------------------------------------------------------
function applyRollLock(events){
  if (!G.curses.rollLock || G.spinsTaken < 1) return;
  const cands = G.tray.filter(t => !t.kept && !t.locked && t.symbol !== 'blank');
  let remaining = G.curses.rollLock;
  while (remaining > 0 && cands.length){
    const idx = Math.floor(G.rng() * cands.length);
    const victim = cands.splice(idx, 1)[0];
    const ri = G.tray.findIndex(t => t.di === victim.di);
    if (ri >= 0){ G.tray[ri] = { ...G.tray[ri], locked: true }; events.push(`Roll-lock: die ${victim.di} (${G.tray[ri].symbol}) locks`); }
    remaining--;
  }
}

function doSpin(events){
  applyRollLock(events);
  G.tray = G.tray.map(t => {
    if (t.kept || t.locked) return t;
    const die = G.hand.dice[t.di];
    const fi = Math.floor(G.rng() * die.faces.length);
    const f = die.faces[fi];
    return { ...t, symbol: f.symbol, mag: f.mag || 1, fi };
  });
  G.rollsLeft--; G.spinsTaken++;
  events.push(`spin ${G.spinsTaken}: ` + G.tray.map(t =>
    `${t.di}:${t.symbol}${(t.mag||1)>1?`(${t.mag})`:''}${t.kept?'*':t.locked?'!':''}`).join(' '));
}

// ---- resolve / commit ------------------------------------------------------------
function commitPath(res, opts, perkN, events){
  if (res.fangLoadBearing){ G.fangCorruptSegments++; events.push('a FANG was load-bearing — the thread corrupts; the coming curse is mandatory'); }
  commitSegment(G.thread, res, opts);
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

  const forced = !!res.fangLoadBearing;
  const finish = forced ? 'forced' : (res.tier === 'floor' ? 'frayed' : 'clean');
  G.segIndex++;
  if (DEPTH_BONUS.on && G.segIndex >= DEPTH_BONUS.from) G.depthBonus += DEPTH_BONUS.base + (G.segIndex - DEPTH_BONUS.from) * DEPTH_BONUS.step;
  G.perkOffer = drawPerks(finish, G.rng, perkN);
  G.perkForced = forced;
  G.lastSegRungs = G.rungs;
  G.phase = 'perk';
  events.push(`the Fates offer: ${G.perkOffer.map(c => `${c.id}(${c.kind})`).join(' | ')}${forced ? ' — the curse is MANDATORY' : ''}`);
}

function doSnapToKnot(events){
  events.push('SNAP — the thread breaks. One free final cast: the KNOT (three rungs, ~50% each)');
  G.knotRungs = generateKnot(G.hand);
  G.phase = 'knot';
  G.tray = newTray();
  G.rollsLeft = 3; G.spinsTaken = 0;
}

function finishRun(knotResult, events){
  G.result = tallyScore(G.thread, {
    scoreBonus: G.scoreBonus, depthBonus: G.depthBonus,
    knot: knotResult, stitches: G.stitchSaves,
  });
  G.knotResult = knotResult;
  G.phase = 'done'; G.over = true;
  events.push(knotResult.hit
    ? `the knot ties ${knotResult.colour}${knotResult.tight ? ' — TIGHT (matches a live bloom)' : ''}`
    : 'the knot slips — untied');
  events.push(`FINAL SCORE ${G.result.score} over ${G.thread.length} segments`);
}

// ---- state / legal ---------------------------------------------------------------
function serializeState(){
  if (!G) return { over:true, error:'no run — send {"type":"new_run"}' };
  const s = {
    over: G.over, phase: G.phase, seed: G.seed, segIndex: G.segIndex,
    rollsLeft: G.rollsLeft, spinsTaken: G.spinsTaken,
    curses: { ...G.curses },
    bonuses: { scoreBonus: G.scoreBonus, depthBonus: G.depthBonus, bonusSpinsBanked: G.bonusSpins, steadyNext: G.steadyNext },
    hand: G.hand.dice.map((d, di) => ({ die: di, name: d.name,
      faces: d.faces.map((f, fi) => ({ face: fi, symbol: f.symbol, mag: f.mag || 1 })) })),
    thread: {
      length: G.thread.length,
      chain: G.thread.colours[G.thread.colours.length - 1] || null,
      colours: G.thread.colours.slice(),
      frayed: [...G.thread.frayed],
      corrupt: G.thread.corrupt,
      liveBloomColours: G.liveBloomColours.slice(),
      bloomsRecorded: G.thread.blooms.map(b => ({ kind: b.kind, colours: b.colours })),
      outcomes: G.thread.outcomes.map(o => ({ tier: o.tier, colour: o.colour, value: o.value,
        colourPips: o.colourPips, corrupt: o.corrupt, cursedHere: o.cursedHere, stitched: !!o.stitched, metCount: o.metCount })),
    },
    stitchSaves: G.stitchSaves,
  };
  const activeRungs = G.phase === 'knot' ? G.knotRungs : G.rungs;
  if ((G.phase === 'segment' || G.phase === 'knot' || G.phase === 'stitch') && activeRungs){
    s.rungs = activeRungs.map(r => ({ tier: r.tier, colour: r.colour, value: r.value || 0,
      req: r.req, ...(r.concentrated ? { concentrated: true } : {}), ...(r.pure ? { pure: r.pure } : {}),
      reach_estimate: r._p }));
    s.tray = G.tray.map(t => ({ i: t.di, symbol: t.symbol, mag: t.mag, kept: t.kept, locked: t.locked }));
    if (G.spinsTaken >= 1){
      const pool = keptPool(G.tray);
      const { stats, counts } = tally(pool.map(f => f.symbol === 'fang' ? { ...f, symbol:'__wild__' } : f));
      s.metNow = activeRungs.filter(r => meetsRung(stats, pool.map(f => f.symbol === 'fang' ? { ...f, symbol:'__wild__' } : f), r, counts).met)
                            .map(r => ({ tier: r.tier, colour: r.colour }));
      if (G.phase === 'segment') s.stopPreview = stopPreview(pool, G.rungs, G.thread);
    }
  }
  if (G.phase === 'perk') s.perkOffer = G.perkOffer.map(c => ({ id: c.id, kind: c.kind, label: c.label, desc: c.desc }));
  if (G.phase === 'done'){ s.score = G.result.score; s.scoreLines = G.result.lines; s.combos = G.result.combos;
    s.knot = { hit: G.knotResult.hit, colour: G.knotResult.colour, tight: G.knotResult.tight, metCount: G.knotResult.metCount }; }
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
      const keptThisWin = G.tray.filter(t => t.kept && t.keptWin === win).length;
      const capOk = !G.curses.keepCap || keptThisWin < G.curses.keepCap;
      if (capOk) for (const t of G.tray)
        if (!t.kept && !t.locked && t.symbol !== 'blank') out.push({ type:'keep', args:{ i: t.di } });
    }
  } else if (G.phase === 'stitch'){
    out.push({ type:'stitch' }, { type:'snap' });
  } else if (G.phase === 'perk'){
    for (const c of G.perkOffer){
      if (c.id === 'deepen'){
        for (let di = 0; di < G.hand.dice.length; di++)
          for (let fi = 0; fi < G.hand.dice[di].faces.length; fi++)
            if (deepenable(G.hand.dice[di].faces[fi])) out.push({ type:'perk', args:{ id:'deepen', die: di, face: fi } });
      } else out.push({ type:'perk', args:{ id: c.id } });
    }
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
      const ev = newRun(a.seed);
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
      if (G.curses.keepCap){
        const win = G.spinsTaken - 1;
        const keptThisWin = G.tray.filter(x => x.kept && x.keptWin === win).length;
        if (keptThisWin >= G.curses.keepCap) return fail(`Grasping: at most ${G.curses.keepCap} keeps per spin`);
      }
      const idx = G.tray.findIndex(x => x.di === a.i);
      G.tray[idx] = { ...t, kept:true, keptWin: G.spinsTaken - 1 };
      events.push(`kept die ${a.i}: ${t.symbol}${(t.mag||1)>1?`(${t.mag})`:''}`);
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
      const res = resolveSegment(keptPool(G.tray), G.rungs);
      if (res.hit >= 0){ commitPath(res, {}, 3, events); return { ok:true, state: serializeState(), events }; }
      const hasLoose = G.tray.some(t => !t.kept && !t.locked);
      if (hasLoose){
        G.phase = 'stitch';
        events.push('no rung met — the thread WOULD snap. A Stitch in Time is offered: reroll the loose dice once ({"type":"stitch"}), or accept the snap ({"type":"snap"})');
        return { ok:true, state: serializeState(), events };
      }
      doSnapToKnot(events);
      return { ok:true, state: serializeState(), events };
    }
    case 'stitch': {
      if (G.phase !== 'stitch') return fail('no stitch offered');
      G.tray = G.tray.map(t => {
        if (t.kept || t.locked) return t;
        const die = G.hand.dice[t.di];
        const fi = Math.floor(G.rng() * die.faces.length);
        const f = die.faces[fi];
        return { ...t, symbol: f.symbol, mag: f.mag || 1, fi };
      });
      events.push('stitch: the loose dice fly one last time — ' + G.tray.map(t => `${t.di}:${t.symbol}`).join(' '));
      // the WHOLE shown tray answers, fangs excluded (a stitch is never fang-completed)
      const savePool = G.tray
        .filter(t => t.symbol !== 'blank' && !sym(t.symbol).isWild)
        .map(t => ({ symbol: t.symbol, mag: t.mag || 1 }));
      const res = resolveSegment(savePool, G.rungs);
      if (res.hit >= 0){ G.stitchSaves++; commitPath(res, { stitched:true }, 4, events); }
      else { events.push('the stitch misses'); doSnapToKnot(events); }
      return { ok:true, state: serializeState(), events };
    }
    case 'snap': {
      if (G.phase !== 'stitch') return fail('no snap to accept');
      doSnapToKnot(events);
      return { ok:true, state: serializeState(), events };
    }
    case 'perk': {
      if (G.phase !== 'perk') return fail('no perk offered');
      const card = G.perkOffer.find(c => c.id === a.id);
      if (!card) return fail(`'${a.id}' is not in the offer: ${G.perkOffer.map(c=>c.id).join('|')}`);
      if (G.perkForced && card.kind !== 'curse') return fail('the curse is mandatory');
      if (card.kind === 'curse'){
        if (card.id === 'grasping')  G.curses.keepCap  = card.ctx?.keepCap  ?? 2;
        if (card.id === 'roll_lock') G.curses.rollLock = card.ctx?.lockDice ?? 1;
        applyCurse(G.thread, null);
        events.push(`CURSE taken: ${card.label} — the segment just woven is cursed (it drains its neighbours)`);
      } else if (card.id === 'deepen'){
        let di = a.die, fi = a.face;
        if (di === undefined || fi === undefined){
          // auto-pick: the deepenable face whose symbol the last rungs demanded most
          let best = null, bestScore = -1;
          const rungs = G.lastSegRungs || [];
          G.hand.dice.forEach((d, ddi) => d.faces.forEach((f, ffi) => {
            if (!deepenable(f)) return;
            const score = rungs.reduce((acc, r) => acc + (r.req[f.symbol] || 0), 0);
            if (score > bestScore){ bestScore = score; best = { di: ddi, fi: ffi }; }
          }));
          if (!best) return fail('no deepenable face remains');
          di = best.di; fi = best.fi;
        }
        const f = G.hand.dice[di]?.faces?.[fi];
        if (!f) return fail(`no face ${di}:${fi}`);
        if (!deepenable(f)) return fail(`face ${di}:${fi} (${f.symbol}) cannot deepen`);
        f.mag = (f.mag || 1) + 1;
        events.push(`Deepen: die ${di} face ${fi} (${f.symbol}) → ${f.mag} pips`);
      } else if (card.id === 'reweave'){ G.bonusSpins += 1; events.push('Reweave: +1 spin next segment'); }
      else if (card.id === 'glimmer'){ G.scoreBonus += 3; events.push('Glimmer: +3 final score'); }
      else if (card.id === 'steady'){ G.steadyNext = true; events.push('Steady: the next floor comes easier'); }
      startSegment(events);
      return { ok:true, state: serializeState(), events };
    }
    default:
      return fail(`unknown action '${a.type}' — send {"type":"legal"} for options`);
  }
}

// =============================================================================
// DEMO — scripted conformance agent through the public protocol only
// =============================================================================
function demoPolicy(state, legal){
  const types = new Set(legal.map(x => x.type));
  if (state.phase === 'perk'){
    const order = ['reweave', 'glimmer', 'steady', 'deepen', 'roll_lock', 'grasping'];
    for (const id of order){
      const c = legal.find(x => x.type === 'perk' && x.args?.id === id);
      if (c) return { type:'perk', ...c.args };
    }
    const any = legal.find(x => x.type === 'perk');
    return any ? { type:'perk', ...any.args } : null;
  }
  if (state.phase === 'stitch') return { type:'stitch' };
  if (state.phase === 'segment' || state.phase === 'knot'){
    // FOCUSED play (the line the generator's reach probes model): pick the most
    // reachable rung and keep ONLY faces that advance its still-unmet requirements.
    if (state.tray && state.spinsTaken >= 1){
      const target = [...state.rungs].sort((a, b) => (b.reach_estimate || 0) - (a.reach_estimate || 0))[0];
      const need = { ...target.req };
      for (const t of state.tray) if (t.kept && need[t.symbol]) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag || 1));
      for (const t of state.tray){
        if (t.kept || t.locked || t.symbol === 'blank') continue;
        if (t.symbol === 'fang') continue;   // the demo plays CLEAN: no fang, no forced curse
        if ((need[t.symbol] || 0) > 0 && legal.some(x => x.type === 'keep' && x.args?.i === t.i))
          return { type:'keep', i: t.i };
      }
    }
    const anyMet = (state.metNow || []).length > 0;
    if (anyMet) return { type:'resolve' };
    if (state.rollsLeft > 0) return { type:'spin' };
    return { type:'resolve' };
  }
  return null;
}

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? (args[i+1] ?? true) : null; };

if (flag('--demo')){
  const n = parseInt(flag('--demo')) || 3;
  let errors = 0;
  for (let run = 0; run < n; run++){
    const seed = 1000 + run * 7919;
    let r = act({ type:'new_run', seed });
    let steps = 0;
    while (!r.state.over && steps++ < 400){
      const legal = legalActions();
      const a = demoPolicy(r.state, legal);
      if (!a){ console.error(`demo stuck at phase ${r.state.phase}`); errors++; break; }
      r = act(a);
      if (!r.ok){ console.error(`ERROR seed ${seed}: ${JSON.stringify(a)} → ${r.error}`); errors++; break; }
    }
    const s = r.state;
    console.log(`seed ${seed}: score ${s.score ?? '?'} over ${s.thread.length} segments, knot ${s.knot?.hit ? (s.knot.tight ? 'TIGHT' : 'tied') : 'slipped'}, stitches ${s.stitchSaves}, ${steps} actions`);
  }
  console.log(errors === 0 ? 'demo: all runs clean' : `demo: ${errors} errors`);
  process.exit(errors === 0 ? 0 : 1);
}

// ---- interactive JSON-lines loop ------------------------------------------------
const seed = flag('--seed');
const ev = newRun(seed != null ? +seed : undefined);
process.stdout.write(JSON.stringify({
  ok: true,
  hello: 'spellspun agent protocol v1 — send {"type":"legal"} for options; see AGENT_PLAY.md',
  state: serializeState(), events: ev,
}) + '\n');

let buf = '';
process.stdin.on('data', chunk => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0){
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (!line) continue;
    let out;
    try { out = act(JSON.parse(line)); }
    catch (e){ out = { ok:false, error: 'bad JSON: ' + e.message }; }
    process.stdout.write(JSON.stringify(out) + '\n');
  }
});
process.stdin.on('end', () => process.exit(0));
