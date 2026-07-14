// =============================================================================
// SPELLSPUN — the game's own pure rules. No DOM, RNG injected. Imports only the
// recipe core (engine.js) and the symbol flags. Holds the thread, blooms, perks,
// the fang-aware resolve (a load-bearing fang forces a curse), the knot, and the
// score tally — everything SpellSpun-specific rather than generic recipe math.
// =============================================================================
import { tally, meetsRung, resolveLadder } from './engine.js';
import { sym } from '../content/symbols.js';

// ---- Thread (the run's memory) -------------------------------------------------
// outcomes[i] = { tier, colour, value, colourPips, ingredients:{charm,mana},
//                 corrupt, frayed, cursedHere }
export function newThread(){
  return { colours: [], outcomes: [], blooms: [], frayed: new Set(), corrupt: false, length: 0 };
}

// ---- Fang promotion ------------------------------------------------------------
const isFang = f => f && sym(f.symbol).isWild;
export function countFangs(faces){ return faces.filter(isFang).length; }
function promoteFangs(faces){ return faces.map(f => isFang(f) ? { ...f, symbol:'__wild__', mag:1 } : f); }

// ---- Resolve a segment (fang-aware) --------------------------------------------
// Promote kept fangs to wilds, resolve to the highest-VALUE met rung, and report
// whether a fang was LOAD-BEARING (the met tier is higher than it would be without
// the fangs) — which corrupts the thread and breaks the live bloom.
export function resolveSegment(keptFaces, rungs){
  const withWild = promoteFangs(keptFaces);
  const woWild   = keptFaces.filter(f => !isFang(f));
  const r1 = resolveLadder(withWild, rungs);
  const r0 = resolveLadder(woWild, rungs);
  const fangsKept = countFangs(keptFaces);
  const fangLoadBearing = fangsKept > 0 && r1.value > r0.value;
  // How many of the (distinct-colour) rungs are met — drives the multi-rung and
  // all-three-fibre bonuses. Wilds promoted, so a fang-assisted finish still counts.
  const { stats, counts } = tally(withWild);
  const metRungs = rungs.filter(r => meetsRung(stats, withWild, r, counts).met);
  return {
    hit: r1.hit, tier: r1.tier, colour: r1.colour, value: r1.value, perRung: r1.perRung,
    fangsKept, fangLoadBearing,
    metCount: r1.hit >= 0 ? metRungs.length : 0,
    metTiers: metRungs.map(r => r.tier),
    metColours: r1.hit >= 0 ? Array.from(new Set([r1.colour, ...metRungs.map(r => r.colour)])) : [],   // ⑨ all met colours, dominant(winner) FIRST — a "mixed bead" when length>1
    colourPips: r1.hit >= 0 ? colourPipsFor(withWild, r1.colour) : 0,
    ingredients: r1.hit >= 0 ? ingredientsIn(keptFaces) : { charm:0, mana:0 },
  };
}
function colourPipsFor(faces, colour){
  return faces.reduce((a,f)=> a + (f && f.symbol === colour ? (f.mag||1) : 0), 0) || 1;
}
function ingredientsIn(faces){
  let charm=0, mana=0;
  for (const f of faces){ if (!f) continue; if (f.symbol==='charm') charm += (f.mag||1); if (f.symbol==='mana') mana += (f.mag||1); }
  return { charm, mana };
}

// ⑩ multi-colour helpers — a bead counts for EVERY colour in `colours` (a mixed bead
// extends/forms combos, blooms and the Concentration/Trinity bonuses for all of them).
// Backward-compatible: a single-completion outcome has colours=[colour], so these
// reduce exactly to the old single-colour behaviour (the engine test stays green).
const colsOf = o => (o && o.colours && o.colours.length) ? o.colours : (o ? [o.colour] : []);
// can 3 beads form a Trinity — pick one DISTINCT colour per bead (system of distinct
// representatives over the 3 small colour-sets); `frayed` (optional Set) excludes frayed picks.
function sdr3(sets, frayed){
  const ok = c => !frayed || !frayed.has(c);
  for (const a of sets[0]) if (ok(a))
    for (const b of sets[1]) if (ok(b) && b!==a)
      for (const c of sets[2]) if (ok(c) && c!==a && c!==b) return [a,b,c];
  return null;
}

// ---- Commit a resolved segment to the thread -----------------------------------
// A fang-corrupt finish corrupts the thread; checkBlooms (called next) sees the
// corrupt flag in its window and refuses the bloom. Push order: outcome, colour.
export function commitSegment(thread, res, opts = {}){
  const corrupt = !!res.fangLoadBearing;
  const outcome = {
    tier: res.tier, colour: res.colour, value: res.value, colourPips: res.colourPips,
    ingredients: res.ingredients, corrupt, frayed: thread.frayed.has(res.colour), cursedHere: false,
    metCount: res.metCount || 1, miracle: res.tier === 'bloom', stitched: !!opts.stitched,
    colours: (res.metColours && res.metColours.length) ? res.metColours.slice() : [res.colour],   // ⑨/⑩ the colours this bead counts for (dominant first); [colour] for single-completion + old fixtures
  };
  if (corrupt) thread.corrupt = true;
  thread.outcomes.push(outcome);
  thread.colours.push(res.colour);
  thread.length += 1;
  return outcome;
}

// A curse taken on the perk frays a colour and drains the just-resolved segment's
// neighbours. The frayed colour can no longer complete a bloom.
export function applyCurse(thread, curseColour){
  if (curseColour) thread.frayed.add(curseColour);
  const last = thread.outcomes[thread.outcomes.length - 1];
  if (last){ last.cursedHere = true; if (curseColour && last.colour === curseColour) last.frayed = true; }
}

// ---- Blooms (over the resolved-colour history) ---------------------------------
// Score-bearing bloom values, centralized here (the rules module), not in the UI.
// tricolor's reward is a LIVE reroll (handled by the play loop), so it scores 0.
export const BLOOM_VALUE = { tricolor: 0, threeOfAKind: 5, hatTrick: 8 };

// Tunable bonus economy. Kept here so the pure rules + the headless balance sim
// score IDENTICALLY to the live game (the auto-balancer / dev panel can turn these).
export const SCORE = {
  multiRung:  4,    // per EXTRA rung completed in one segment (metCount - 1)
  allThree:  20,    // jackpot for weaving all three fibres in one segment
  miracle:    5,    // per clean bloom-tier (miracle) segment woven
  knotDouble: 6,    // the final knot meets two colours
  knotTriple:14,    // the final knot meets all three
  cursedRunLen: 5,  // #8 consecutive cursed beads (trailing into the knot) the trick-taking jackpot needs
  cursedJackpot:40, // #8 the payoff for a fully-cursed line capped by a tied "cursed knot" (overcomes the drain)
};

// Record a detected bloom on the thread so it can be scored at the END — which is
// what makes "resonance kill" possible: if any of a bloom's colours is later frayed,
// tallyScore zeroes it. Returns the recorded entry. (The live reroll for tricolor is
// applied by the caller; this only books the bloom for end-scoring.)
export function recordBloom(thread, bloom){
  const colours = bloom.colours || (bloom.colour ? [bloom.colour] : []);
  const entry = { kind: bloom.kind, colours };
  thread.blooms.push(entry);
  return entry;
}

export function checkBlooms(thread){
  const out = [];
  const last3 = thread.outcomes.slice(-3);
  if (last3.length < 3) return out;
  if (last3.some(o => o.corrupt)) return out;              // a fang in the window breaks blooms
  const tiers = last3.map(o => o.tier);
  const sets = last3.map(colsOf);                          // ⑩ each bead's colour-set (mixed beads carry >1)
  // tricolor — pick 3 DISTINCT non-frayed colours, one per bead (a mixed bead can supply either)
  const triCols = sdr3(sets, thread.frayed);
  if (triCols){
    out.push({ kind:'tricolor', colours: triCols });
    if (tiers.every(t => t === 'true' || t === 'bloom')) out.push({ kind:'hatTrick', colours: triCols });
  }
  // threeOfAKind — one non-frayed colour present in ALL three beads
  const common = Array.from(new Set(sets.flat())).find(c => !thread.frayed.has(c) && sets.every(s => s.includes(c)));
  if (common) out.push({ kind:'threeOfAKind', colour: common });
  return out;
}

// ---- The stop-is-the-choice preview --------------------------------------------
// What happens if you STOP right now — the single most important read in the game.
export function stopPreview(keptFaces, rungs, thread){
  const res = resolveSegment(keptFaces, rungs);
  if (res.hit < 0) return { verdict:'NONE' };
  if (res.fangLoadBearing) return { verdict:'CORRUPT', colour:res.colour, tier:res.tier };
  const chain = thread.colours[thread.colours.length - 1] || null;
  const extendsChain = !!chain && chain === res.colour && !thread.frayed.has(res.colour);
  return { verdict: extendsChain ? 'EXTEND' : 'BREAK', colour:res.colour, tier:res.tier, chain };
}

// ---- Deepen cap ----------------------------------------------------------------
// The Deepen blessing raises a face's mag (pips). Capped here so one face can't snowball
// (base mag 1 → ONE Deepen → mag 2). Shared by the live game (play.js deepenFace) and the
// headless sim (spellspun_sim.mjs applyDeepen) so the cap can't drift. Fangs/blanks never deepen.
export const DEEPEN_MAX = 2;
export const deepenable = f => !!f && f.symbol !== 'fang' && f.symbol !== 'blank' && (f.mag||1) < DEEPEN_MAX;

// ---- Perks (draw 1 of 3) -------------------------------------------------------
export const BLESSINGS = [
  { id:'deepen',  kind:'blessing', label:'Deepen',  desc:'Choose a rune face | it counts DOUBLE for good — enough to fill a deep strand.' },
  { id:'reweave', kind:'blessing', label:'Reweave', desc:'+1 spin on the next segment.' },
  { id:'glimmer', kind:'blessing', label:'Glimmer', desc:'+3 to your final score.' },
  { id:'steady',  kind:'blessing', label:'Steady',  desc:'The next Loose weave comes a little easier.' },
];
// Each curse carries a ritual `warp` (kind + params) — the id-blind form the engine
// dispatches through packages/engine/ritual.js. `ctx` is the legacy shape (kept so old
// readers don't break); the live enforcement now reads `warp` via ritual.js (C0 migration).
export const CURSES = [
  { id:'roll_lock', kind:'curse', label:'Roll-lock', desc:'One die locks at the start of each spin.', ctx:{ lockDice:1 }, warp:{ kind:'lockDice', params:{ count:1 } } },
  { id:'grasping',  kind:'curse', label:'Grasping',  desc:'Keep at most 2 dice per spin.',           ctx:{ keepCap:2 },  warp:{ kind:'keepCap', params:{ count:2 } } },
];
// finish: 'clean' (n blessings) | 'frayed' (a Floor-tier finish — a LESSER reward: (n-1) blessings,
// NO curse) | 'forced' (a fang COMPLETED the woven branch — the curse is MANDATORY, so the draw is
// ONLY the curse). Curses now come ONLY from a load-bearing fang; the Floor just gives one fewer reward.
// n = how many cards to draw (default 3; a Stitch-in-Time save draws 4 — never 'forced').
export function drawPerks(finish, rng, n = 3){
  if (finish === 'forced') return sample(CURSES, 1, rng);        // mandatory → the curse alone
  if (finish === 'frayed') return sample(BLESSINGS, n - 1, rng); // Floor: 2 blessings (n-1), no curse
  return sample(BLESSINGS, n, rng);                              // clean → n (3)
}
function sample(arr, n, rng){ const a = shuffle(arr.slice(), rng); return a.slice(0, Math.min(n, a.length)); }
function shuffle(a, rng){ for (let i=a.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

// ---- The knot ------------------------------------------------------------------
// Resolve the free final cast; prefer a met rung whose colour matches a still-live
// bloom (the tight knot), else any met rung.
export function resolveKnot(keptFaces, knotRungs, liveBloomColours = []){
  const withWild = promoteFangs(keptFaces);
  const { stats, counts } = tally(withWild);
  const met = knotRungs.filter(r => meetsRung(stats, withWild, r, counts).met);
  if (!met.length) return { hit:false, colour:null, tight:false, metCount:0, colours:[] };
  const tightMatch = met.find(r => liveBloomColours.includes(r.colour));
  const won = tightMatch || met[0];
  return { hit:true, colour:won.colour, tight:!!tightMatch, metCount:met.length, colours: met.map(r=>r.colour) };
}

// ---- Combos / discovery patterns (scored + badged at the tally) ----------------
// Lightweight "achievements" detected over the finished thread: each awards flat
// score + a glyph for the tally's weave-patterns strip. Data-driven so glyphs and
// points are a one-line tweak. Glyphs are broadly-rendered Unicode (geometric /
// dingbat) to avoid tofu in the Cinzel / Cormorant / Noto-Runic font stack — swap
// to true alchemical glyphs once a font carrying that block is bundled.
export const COMBOS = {
  ofAKind:  [ { n:3, glyph:'❍', label:'Three of a Kind',  pts:6  },
              { n:4, glyph:'❖', label:'Four of a Kind',   pts:14 },
              { n:5, glyph:'✺', label:'Five of a Kind',   pts:30 } ],
  straight: [ { n:2, glyph:'✶', label:'Double Trinity',   pts:10 },
              { n:3, glyph:'✷', label:'Triple Trinity',   pts:24 },
              { n:4, glyph:'✸', label:'Quad Trinity',     pts:48 } ],
  deep:     [ { n:3, glyph:'✦', label:'Deep Weave ×3',    pts:18 } ],
  double:   [ { n:3, glyph:'⊛', label:'Double Weave ×3',  pts:16 } ],
  stitch:   [ { n:1, glyph:'✜', label:'A Stitch in Time', pts:8  },
              { n:3, glyph:'✚', label:'Stitch ×3',        pts:30 } ],
  cursed:   [ { n:3, glyph:'☓', label:'Cursed ×3',        pts:0  },
              { n:4, glyph:'☓', label:'Cursed ×4',        pts:0  },
              { n:5, glyph:'☠', label:'Cursed ×5',        pts:0  } ],
};
// highest tier in `tiers` whose threshold n is reached by `value`
function topTier(tiers, value){ let best=null; for (const t of tiers){ if (value >= t.n) best = t; } return best; }
export function detectCombos(thread, extra = {}){
  const o = thread.outcomes || [];
  const got = [];
  const push = (id, t) => { if (t) got.push({ id, ...t }); };
  // longest consecutive run of beads that share a colour -> N-of-a-kind. A mixed bead
  // belongs to EACH of its colours' runs, so it can extend two different colour streaks.
  let maxRun = 0;
  for (const C of new Set(o.flatMap(colsOf))){
    let run = 0;
    for (const seg of o){ if (!seg.corrupt && colsOf(seg).includes(C)){ run++; if (run>maxRun) maxRun=run; } else run = 0; }   // a corrupt bead breaks the run (can't bridge an N-of-a-kind), like straight/deep
  }
  push('ofAKind', topTier(COMBOS.ofAKind, maxRun));
  // back-to-back distinct-colour triples -> straights (Trinity chained). A window forms a
  // Trinity if 3 distinct colours can be chosen one-per-bead (mixed beads qualify more often).
  let straights = 0;
  for (let i=0;i+2<o.length;){ const w=o.slice(i,i+3); if (w.every(s=>!s.corrupt) && sdr3(w.map(colsOf), null)){ straights++; i+=3; } else i++; }
  push('straight', topTier(COMBOS.straight, straights));
  // clean bloom-tier ("deep") weaves
  push('deep',   topTier(COMBOS.deep,   o.filter(s=>s.tier==='bloom' && !s.corrupt).length));
  // multi-rung ("double") weaves
  push('double', topTier(COMBOS.double, o.filter(s=>!s.corrupt && (s.metCount||1)>=2).length));
  // stitch-in-time saves
  const stitches = (extra.stitches != null) ? extra.stitches : o.filter(s=>s.stitched).length;
  push('stitch', topTier(COMBOS.stitch, stitches));
  // cursed segments (a dark discovery — already drained, so badge only)
  push('cursed', topTier(COMBOS.cursed, o.filter(s=>s.cursedHere).length));
  return got;
}

// ---- Score tally ---------------------------------------------------------------
export function tallyScore(thread, opts = {}){
  const o = thread.outcomes;
  const per = o.map(seg => ({ ...seg, base: (seg.value||0) * (seg.colourPips||1) }));
  const lines = []; let score = 0;

  const rungPts = per.reduce((a,s)=>a + s.base, 0);
  score += rungPts; lines.push({ label:`Strands woven (${per.length})`, pts: rungPts });

  score += thread.length; lines.push({ label:'Length', pts: thread.length });

  const ing = o.reduce((a,s)=> a + (s.ingredients?.charm||0) + (s.ingredients?.mana||0)*2, 0);
  if (ing){ score += ing; lines.push({ label:'Ingredients woven', pts: ing }); }

  // Concentration: +2 per segment inside a maximal clean, non-frayed run of beads that share a
  // colour (length>=2). ⑩ per-colour: a mixed bead counts toward EACH of its colours' runs.
  let conc = 0;
  for (const C of new Set(per.flatMap(colsOf))){
    if (thread.frayed.has(C)) continue;
    for (let i=0;i<per.length;){
      if (!(colsOf(per[i]).includes(C) && !per[i].corrupt)){ i++; continue; }
      let j=i; while (j+1<per.length && colsOf(per[j+1]).includes(C) && !per[j+1].corrupt) j++;
      const len = j-i+1; if (len>=2) conc += 2*len;
      i = j+1;
    }
  }
  if (conc){ score += conc; lines.push({ label:'Colour streak', pts: conc }); }

  // Trinity: NON-overlapping windows of three consecutive beads from which 3 DISTINCT, clean,
  // non-frayed colours can be chosen (one per bead) each add half their base (the ×1.5). ⑩ mixed
  // beads qualify via the SDR pick. Non-overlapping so a long distinct run never double-counts.
  let tri = 0;
  for (let i=0;i+2<per.length;){
    const w = per.slice(i, i+3);
    if (w.every(s=>!s.corrupt) && sdr3(w.map(colsOf), thread.frayed)){
      tri += Math.round(w.reduce((a,s)=>a+s.base,0) * 0.5); i += 3;
    } else i++;
  }
  if (tri){ score += tri; lines.push({ label:'Three colours (×1.5)', pts: tri }); }

  // Blooms — scored at the END so RESONANCE KILL applies: a bloom whose colour was later
  // frayed scores ZERO (spec: "a frayed colour scores its blooms at zero").
  let bloomPts = 0;
  for (const bl of (thread.blooms || [])){
    if (bl.colours.some(c => thread.frayed.has(c))) continue;   // resonance kill
    bloomPts += BLOOM_VALUE[bl.kind] || 0;
  }
  if (bloomPts){ score += bloomPts; lines.push({ label:'Chains', pts: bloomPts }); }

  // Multi-rung: weaving more than one fibre in a segment, and the all-three jackpot.
  let multi = 0, allThree = 0;
  per.forEach(s => { if (s.corrupt) return; const m = s.metCount || 1; if (m >= 2) multi += SCORE.multiRung * (m - 1); if (m >= 3) allThree += SCORE.allThree; });   // a corrupt (fang-broken) bead banks its base only, no multi-rung bonus (matches Trinity/Concentration/Miracles)
  if (multi){ score += multi; lines.push({ label:'Mixed weaves', pts: multi }); }
  if (allThree){ score += allThree; lines.push({ label:'Trifecta', pts: allThree }); }

  // Miracles: a clean bloom-tier weave is the hard, rich finish — worth chasing.
  const miracle = per.filter(s => s.tier === 'bloom' && !s.corrupt && !thread.frayed.has(s.colour)).length * SCORE.miracle;
  if (miracle){ score += miracle; lines.push({ label:'Miracles', pts: miracle }); }

  if (opts.scoreBonus){ score += opts.scoreBonus; lines.push({ label:'Blessings', pts: opts.scoreBonus }); }
  if (opts.depthBonus){ score += opts.depthBonus; lines.push({ label:'Depth woven', pts: opts.depthBonus }); }   // #16 escalating depth reward (gated → no change when absent)
  if (opts.jackpotBonus){ score += opts.jackpotBonus; lines.push({ label:'Patron jackpot', pts: opts.jackpotBonus }); }   // §6 v2 jackpot CONTRACTS — a disclosed score line (zero/absent ⇒ no line, byte-identical)

  // Witnesses (Modifier Stack §5b) — passive worth accumulated on the thread during the run.
  // The caller (agent_cli) fires scoreWitnesses at event sites, gated on balance.on('witnesses'),
  // into thread.witnessScore. Zero-when-absent, so a run with no witnesses is byte-identical.
  if (thread.witnessScore){ score += thread.witnessScore; lines.push({ label:'Witnesses', pts: thread.witnessScore }); }

  // The knot
  if (opts.knot){
    const flat = opts.knot.flat ?? (opts.knot.hit ? 4 : 0);
    if (flat){ score += flat; lines.push({ label:'The knot', pts: flat }); }
    if (opts.knot.tight){ const tb = opts.knot.tightBonus ?? 4; score += tb; lines.push({ label:'Tight knot', pts: tb }); }
    const mc = opts.knot.metCount || 0;
    if (mc >= 3){ const tk = SCORE.knotDouble + SCORE.knotTriple; score += tk; lines.push({ label:'Triple knot', pts: tk }); }   // ONE line for a triple (+20) — not stacked Double+Triple
    else if (mc >= 2){ score += SCORE.knotDouble; lines.push({ label:'Double knot', pts: SCORE.knotDouble }); }
  }

  // Curse drain: each cursed segment subtracts its two neighbours' base.
  let drain = 0;
  per.forEach((seg,i)=>{ if (seg.cursedHere) drain += (per[i-1]?.base||0) + (per[i+1]?.base||0); });
  if (drain){ score -= drain; lines.push({ label:'Curse drain', pts: -drain }); }

  // #8 Trick-taking — a deliberately CURSED line: the final run of beads all cursed (>= cursedRunLen)
  // capped by a tied knot ("a cursed knot at the end") pays a jackpot big enough to overcome the drain.
  // Trailing run only (it must run INTO the knot); read from cursedHere + opts.knot, so the headless sim
  // (which never frays) reaches it identically.
  let trailingCursed = 0;
  for (let i = o.length - 1; i >= 0 && o[i] && o[i].cursedHere; i--) trailingCursed++;
  if (opts.knot && opts.knot.hit && trailingCursed >= (SCORE.cursedRunLen || 5)){
    score += SCORE.cursedJackpot; lines.push({ label:'Cursed jackpot', pts: SCORE.cursedJackpot });
  }

  // Weave patterns (discovery combos) — flat bonuses + glyph badges for the tally.
  const combos = detectCombos(thread, { stitches: opts.stitches });
  const comboPts = combos.reduce((a,c)=> a + (c.pts||0), 0);
  if (comboPts){ score += comboPts; lines.push({ label:'Weave patterns', pts: comboPts }); }

  // perNode: per-woven-segment score detail (#9 D1) — purely ADDITIVE (score/lines/combos unchanged).
  // The tally count-up ignites each bead by its `base`; sum(perNode.base) === the "Strands woven" line.
  const perNode = per.map(s => ({ colour: s.colour, base: s.base, tier: s.tier, corrupt: !!s.corrupt, frayed: thread.frayed.has(s.colour), metCount: s.metCount || 1 }));
  return { score: Math.max(0, Math.round(score)), lines, combos, perNode };
}
