// =============================================================================
// WISH v2 TEST  (ModifierList v2 §3 slice 3 — twists + jackpots, end-to-end)
// -----------------------------------------------------------------------------
// Drives the REAL session core (session.mjs) through the protocol, plus a handful
// of PURE assertions on the ritual.js interpreter. Covers:
//   • mirror (The Mirrored One) — the pure kept-pool transform, AND that a real
//     resolve reflects it while stopPreview AGREES (the preview never lies);
//   • veil (The Veiled One) — the bloom rung is masked until True is met, then LATCHES;
//   • freeReroll (The Generous One) — the free, once-per-segment, loose-only reroll,
//     deterministic replay, and the per-2-uses mild-bane lien at patronComplete;
//   • jackpots — evalJackpot hit AND miss for all three kinds; a full spotless patron
//     pays the 'Patron jackpot' tally line (present ONLY when nonzero);
//   • fangCourt (The Fang-Fancier) — a load-bearing fang sets NO cursedHere while she
//     watches (drain suppressed), vs the normal drain under a non-jackpot patron.
// Not a KNOWN_FAIL — a design gate.
// =============================================================================
import { newRun, act, serializeState, legalActions } from '../session.mjs';
import { mirrorKeptPool, twistKeptPool, evalJackpot, liveChainLen } from '../../engine/ritual.js';
import { BALANCE, clearBalanceOverrides } from '../../engine/balance.js';
BALANCE.wishes.enabled  = true;
BALANCE.wishes.twists   = true;
BALANCE.wishes.jackpots = true;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };
const state = () => serializeState();
const STAT = new Set(['body', 'mind', 'spirit', 'charm', 'mana']);
// §Change-2 the wish PHYSICS now apply only on the BOSS (last) segment. patronLen=1 makes
// segment 0 the boss segment, so the single-segment physics probes below see the twist live
// from spin 1 (and it doubles as coverage that the §C0 'wishes.patronLen' override works).
const BOSS1 = { 'wishes.patronLen': 1 };
// the set of dice whose keep is LEGAL right now (respects keepCap — a rejected keep would
// otherwise loop a driver forever under a Grasping-Widow patron).
const keepableNow = () => new Set(legalActions().filter(x => x.type === 'keep').map(x => x.args.i));

// =============================================================================
// PURE — the ritual.js twist/jackpot interpreter
// =============================================================================
{
  // mirror: tallest counts DOUBLE, lowest counts ZERO (dropped), tie-break by tray order
  const a = mirrorKeptPool([{ symbol:'body', mag:1 }, { symbol:'mind', mag:3 }]);
  ok(a.length === 1 && a[0].symbol === 'mind' && a[0].mag === 6, 'mirror: tallest doubles, lowest drops');
  const b = mirrorKeptPool([{ symbol:'body', mag:2 }]);
  ok(b.length === 1 && b[0].mag === 4, 'mirror: a single stat face just doubles');
  const c = mirrorKeptPool([{ symbol:'body', mag:1 }, { symbol:'mind', mag:1 }, { symbol:'spirit', mag:1 }]);
  ok(c.length === 2 && c.find(f => f.symbol==='body')?.mag === 2 && c.some(f => f.symbol==='spirit') && !c.some(f => f.symbol==='mind'),
    'mirror: all-equal ties break by tray order (idx0 doubles, idx1 drops)');
  const raw = [{ symbol:'fang', mag:1 }, { symbol:'body', mag:2 }];
  const d = mirrorKeptPool(raw);
  ok(raw[1].mag === 2, 'mirror: never mutates the input pool');
  ok(d.find(f => f.symbol==='body')?.mag === 4 && d.some(f => f.symbol==='fang'), 'mirror: fangs/blanks exempt (only stat faces bend)');
  const e = mirrorKeptPool([{ symbol:'fang', mag:1 }]);
  ok(e.length === 1 && e[0].symbol === 'fang', 'mirror: no stat face → unchanged copy');

  // twistKeptPool neutrality: no pool-transforming twist ⇒ the SAME reference (byte-neutral)
  const p = [{ symbol:'body', mag:1 }];
  ok(twistKeptPool(null, p) === p, 'twistKeptPool: null twist → same pool ref');
  ok(twistKeptPool({ kind:'veil' }, p) === p, 'twistKeptPool: veil does not transform the pool');
  ok(twistKeptPool({ kind:'freeReroll' }, p) === p, 'twistKeptPool: freeReroll does not transform the pool');
  ok(twistKeptPool({ kind:'mirror' }, p) !== p, 'twistKeptPool: mirror returns a new (transformed) pool');
}
{
  // spotless — met ⇔ zero corrupt/cursed beads this patronage
  ok(evalJackpot({ kind:'spotless' }, { window:[{}, {}] }).met, 'spotless: a clean window → met');
  ok(!evalJackpot({ kind:'spotless' }, { window:[{ corrupt:true }, {}] }).met, 'spotless: a corrupt bead → miss');
  ok(!evalJackpot({ kind:'spotless' }, { window:[{ cursedHere:true }] }).met, 'spotless: a cursed bead → miss');
  // fangCourt — met ⇔ >= n corrupt beads
  ok(evalJackpot({ kind:'fangCourt', params:{ n:3 } }, { window:[{ corrupt:true }, { corrupt:true }, { corrupt:true }] }).met, 'fangCourt: 3 corrupt → met');
  ok(!evalJackpot({ kind:'fangCourt', params:{ n:3 } }, { window:[{ corrupt:true }, { corrupt:true }] }).met, 'fangCourt: 2 corrupt → miss');
  // chainAlive (§post-G3 Fix 3) — "never break the chain while she watches": WINDOW-based + patronLen-
  // scaled. Met iff EVERY segment of her window is ONE un-corrupt colour AND the run length >= patronLen.
  const O = (colour, corrupt = false) => ({ colour, corrupt });
  {
    // chain-THROUGH-ALL-segments met (3 body beads, patronLen 3) — progress surfaces 3/3
    const r = evalJackpot({ kind:'chainAlive' }, { window:[O('body'),O('body'),O('body')], frayed:new Set(), patronLen:3 });
    ok(r.met && r.progress === 3 && r.target === 3, 'chainAlive: her whole patronage in one colour → met (progress 3/3)');
    // BROKEN-mid-patronage → miss (a colour break inside her window)
    ok(!evalJackpot({ kind:'chainAlive' }, { window:[O('body'),O('mind'),O('body')], frayed:new Set(), patronLen:3 }).met, 'chainAlive: a colour break mid-patronage → miss');
    // ARRIVING with a long chain does NOT pre-satisfy: only HER window counts (her segments broke)
    ok(!evalJackpot({ kind:'chainAlive' }, { window:[O('body'),O('body'),O('mind')], colours:['body','body','body','body','body','mind'], frayed:new Set(), patronLen:3 }).met, 'chainAlive: arriving chain without her segments chaining → miss');
    // a CORRUPT bead mid-window breaks the chain → miss
    ok(!evalJackpot({ kind:'chainAlive' }, { window:[O('body'),O('body',true),O('body')], frayed:new Set(), patronLen:3 }).met, 'chainAlive: a corrupt bead breaks the chain → miss');
    // patronLen-INDEPENDENT: a len-2 patron needs 2 chained; a len-5 patron needs 5 (target scales)
    ok(evalJackpot({ kind:'chainAlive' }, { window:[O('spirit'),O('spirit')], frayed:new Set(), patronLen:2 }).met, 'chainAlive: patronLen 2 → 2 chained is enough');
    ok(!evalJackpot({ kind:'chainAlive' }, { window:[O('spirit'),O('spirit')], frayed:new Set(), patronLen:5 }).met, 'chainAlive: patronLen 5 → 2 chained is NOT enough (target scales)');
    // frayed colour → dead → miss (defensive; frayed is dormant in live play)
    ok(!evalJackpot({ kind:'chainAlive' }, { window:[O('body'),O('body'),O('body')], frayed:new Set(['body']), patronLen:3 }).met, 'chainAlive: a frayed colour is dead → miss');
    // LIVE progress mid-patronage surfaces (2 chained toward target 3, not yet met)
    const mid = evalJackpot({ kind:'chainAlive' }, { window:[O('mind'),O('mind')], frayed:new Set(), patronLen:3 });
    ok(mid.progress === 2 && mid.target === 3 && !mid.met, 'chainAlive: mid-patronage progress surfaces (2/3, not met)');
  }
  ok(liveChainLen(['a','b','b'], new Set()) === 2 && liveChainLen([], null) === 0, 'liveChainLen: trailing run / empty');
}

// =============================================================================
// SESSION — MIRROR: a real resolve reflects the transform, and stopPreview AGREES
// -----------------------------------------------------------------------------
// mirrored_one vs veiled_one at the SAME seed + SAME actions draw the IDENTICAL rng
// stream (neither consumes rng, neither imposes a warp), so the trays are identical up
// to the resolve; only the mirror bends the resolve READ. We keep up to 3 loose stat
// dice, then: (a) assert stopPreview.{tier,colour} == the woven bead's, (b) collect the
// resolve signature to prove the mirror DIVERGES from the un-mirrored control somewhere.
// =============================================================================
function mirrorProbe(seed, wishId){
  newRun(seed, { wish: wishId, balance: BOSS1 });   // §Change-2 patronLen=1 ⇒ segment 0 is the boss (physics live)
  act({ type:'spin' });
  let st = state();
  let kept = 0;
  for (const t of st.tray){ if (kept >= 3) break; if (!t.kept && !t.locked && STAT.has(t.symbol)){ act({ type:'keep', i: t.i }); kept++; } }
  st = state();
  const preview = st.stopPreview || { verdict:'NONE' };
  const before = st.thread.length;
  const r = act({ type:'resolve' });
  const woven = r.state.thread.length > before;
  const bead = woven ? r.state.thread.outcomes[r.state.thread.outcomes.length - 1] : null;
  const sig = bead ? `${bead.tier}/${bead.colour}/${bead.corrupt?'C':'-'}` : 'NOBEAD';
  return { kept, preview, bead, sig };
}
{
  let agreeChecks = 0, agreeFails = 0, diverged = 0, mirrorTwoPlus = 0;
  for (let seed = 1; seed <= 60; seed++){
    const m = mirrorProbe(seed, 'mirrored_one');
    const v = mirrorProbe(seed, 'veiled_one');    // control: a twist that does NOT bend the pool
    if (m.kept >= 2) mirrorTwoPlus++;
    // agreement: a mirror resolve that wove a bead must match its own stopPreview colour+tier
    if (m.bead && (m.preview.verdict === 'EXTEND' || m.preview.verdict === 'BREAK' || m.preview.verdict === 'CORRUPT')){
      agreeChecks++;
      if (!(m.preview.colour === m.bead.colour && m.preview.tier === m.bead.tier)) agreeFails++;
    }
    if (m.sig !== v.sig) diverged++;
  }
  ok(mirrorTwoPlus > 0, `mirror: reached a >=2-stat kept pool on some seed (${mirrorTwoPlus})`);
  ok(agreeChecks > 0 && agreeFails === 0, `mirror: stopPreview AGREES with the woven bead (checked=${agreeChecks}, mismatches=${agreeFails})`);
  ok(diverged > 0, `mirror: the transform DIVERGES from the un-mirrored control on some seed (${diverged})`);
}

// =============================================================================
// SESSION — VEIL: the bloom rung is masked until True is met, then LATCHES revealed
// =============================================================================
{
  let foundReveal = false, veiledAtStartAlways = true, latchHeld = false;
  for (let seed = 1; seed <= 80 && !foundReveal; seed++){
    newRun(seed, { wish: 'veiled_one', balance: BOSS1 });   // §Change-2 patronLen=1 ⇒ segment 0 is the boss (veil masks)
    let st = state();
    const bloom0 = (st.rungs || []).find(r => r.tier === 'bloom');
    if (!(bloom0 && bloom0.veiled === true && bloom0.req === undefined && bloom0.reach_estimate === undefined)) veiledAtStartAlways = false;
    let guard = 0;
    while (!st.over && st.phase === 'segment' && guard++ < 30){
      if ((st.metNow || []).some(m => m.tier === 'true')){
        const bloomNow = (st.rungs || []).find(r => r.tier === 'bloom');
        if (bloomNow && !bloomNow.veiled && bloomNow.req !== undefined){
          foundReveal = true;
          // LATCH: a fresh read (no action) still shows revealed
          const again = (state().rungs || []).find(r => r.tier === 'bloom');
          latchHeld = !!(again && !again.veiled);
        }
        break;
      }
      let a;
      if ((st.spinsTaken || 0) === 0) a = { type:'spin' };
      else {
        const tr = (st.rungs || []).find(r => r.tier === 'true');
        const need = { ...(tr ? tr.req : {}) };
        for (const t of st.tray) if (t.kept && need[t.symbol]) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag || 1));
        const kd = (st.tray || []).find(t => !t.kept && !t.locked && t.symbol !== 'blank' && t.symbol !== 'fang' && (need[t.symbol] || 0) > 0);
        if (kd) a = { type:'keep', i: kd.i };
        else if ((st.rollsLeft || 0) > 0) a = { type:'spin' };
        else break;
      }
      st = act(a).state;
    }
  }
  ok(veiledAtStartAlways, 'veil: the bloom rung is masked (veiled, no req/reach) before True is met');
  ok(foundReveal, 'veil: meeting the True rung REVEALS the bloom rung (req/colour return)');
  ok(latchHeld, 'veil: the reveal LATCHES (a later read stays revealed)');
}

// =============================================================================
// SESSION — FREE REROLL: free, once-per-segment, loose-only; deterministic replay
// =============================================================================
{
  newRun(51, { wish: 'generous_one', balance: BOSS1 });   // §Change-2 patronLen=1 ⇒ segment 0 is the boss (free reroll offered)
  act({ type:'spin' });
  let st = state();
  ok(st.wishReroll && Array.isArray(st.wishReroll.targets) && st.wishReroll.targets.length > 0, 'freeReroll: state surfaces the free reroll + its loose targets');
  const legal = legalActions();
  ok(legal.some(x => x.type === 'wish_reroll'), 'freeReroll: legalActions offers wish_reroll');

  // keep a die, then prove the reroll is LOOSE-ONLY (a kept die is refused, no use spent)
  const keepDie = st.tray.find(t => !t.kept && !t.locked && t.symbol !== 'blank');
  act({ type:'keep', i: keepDie.i });
  const badKept = act({ type:'wish_reroll', di: keepDie.i });
  ok(badKept.ok === false, 'freeReroll: a kept die is not a loose target (refused)');
  ok(state().wishReroll != null, 'freeReroll: a refused attempt does NOT spend the once-per-segment use');

  // reroll a loose die: FREE (rollsLeft unchanged), and the use is now spent
  st = state();
  const loose = st.tray.find(t => !t.kept && !t.locked && t.symbol !== 'blank');
  const rollsBefore = st.rollsLeft;
  const good = act({ type:'wish_reroll', di: loose.i });
  ok(good.ok === true, 'freeReroll: a loose die re-throws successfully');
  ok(good.state.rollsLeft === rollsBefore, 'freeReroll: it is FREE (rollsLeft unchanged)');
  ok(good.state.wishReroll == null, 'freeReroll: the use is spent — no longer offered this segment');
  const badTwice = act({ type:'wish_reroll', di: loose.i });
  ok(badTwice.ok === false, 'freeReroll: once-per-segment (a second attempt is refused)');

  // determinism: a fixed seed + fixed actions (including a wish_reroll) replays byte-for-byte
  const scripted = [{ type:'spin' }, { type:'wish_reroll', di:0 }, { type:'spin' }, { type:'state' }];
  const runOnce = () => { newRun(20260708, { wish:'generous_one', balance: BOSS1 }); return scripted.map(a => JSON.stringify(act(a))); };
  ok(JSON.stringify(runOnce()) === JSON.stringify(runOnce()), 'freeReroll: a fixed seed + actions (with a wish_reroll) replays byte-identically');
}

// =============================================================================
// SESSION — PATRON CADENCE (Change 1): patronLen is BALANCE-OWNED (NUMBERS.wishes.patronLen,
// default 3) and §C0-tunable ('wishes.patronLen'). A patron completes — payout/jackpot eval fire —
// after EXACTLY patronLen resolved segments (the patron started at thread index 0, so thread.length
// at completion == patronLen). Proves the default (3) AND that the override channel drives it.
// =============================================================================
function segAtFirstNewPatron(seed, balance){
  const r0 = act({ type: 'new_run', seed, wish: 'spotless_one', balance });   // jackpot: eval at patronComplete
  let st = r0.state, guard = 0, completeLen = null;
  while (!st.over && guard++ < 300){
    let r;
    if (st.phase === 'perk') r = act({ type: 'perk', card: 0 });
    else if (st.phase === 'transform') r = act({ type: 'transform', skip: true });
    else if (st.phase === 'stitch') r = act({ type: 'stitch' });
    else if (st.phase === 'segment' || st.phase === 'knot'){
      if ((st.spinsTaken || 0) === 0) r = act({ type: 'spin' });
      else {
        const target = [...st.rungs].filter(x => x.req).sort((a, b) => (b.reach_estimate || 0) - (a.reach_estimate || 0))[0];
        const need = { ...(target ? target.req : {}) };
        for (const t of st.tray) if (t.kept && need[t.symbol]) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag || 1));
        const keepable = keepableNow();
        const kd = (st.tray || []).find(t => keepable.has(t.i) && t.symbol !== 'fang' && (need[t.symbol] || 0) > 0);
        if (kd) r = act({ type: 'keep', i: kd.i });
        else if ((st.metNow || []).length > 0 || (st.rollsLeft || 0) <= 0) r = act({ type: 'resolve' });
        else r = act({ type: 'spin' });
      }
    } else break;
    if ((r.events || []).some(e => /a new patron sits/.test(e))){ completeLen = r.state.thread.length; break; }
    st = r.state;
  }
  return completeLen;
}
{
  clearBalanceOverrides();
  let at3 = null;
  for (let seed = 1; seed <= 120 && at3 == null; seed++) at3 = segAtFirstNewPatron(seed, {});
  ok(at3 === 3, `patron cadence: default patronLen=3 → first patron completes after 3 segments (saw ${at3})`);
  let at2 = null;
  for (let seed = 1; seed <= 120 && at2 == null; seed++) at2 = segAtFirstNewPatron(seed, { 'wishes.patronLen': 2 });
  ok(at2 === 2, `patron cadence: §C0 'wishes.patronLen'=2 → first patron completes after 2 segments (saw ${at2})`);
  clearBalanceOverrides();
}

// =============================================================================
// SESSION — BOSS GATING (greybox feedback): the wish's play-bending PHYSICS apply ONLY on the
// BOSS (last) segment (segsThisPatron === patronLen-1). At the default patronLen=3, patron 0's
// segments are 0,1 (INERT) and 2 (BOSS). The wish is VISIBLE from segment 1 (s.wish present) but
// takes hold only on the boss segment; s.wish.active + s.patron.boss track it; the boss-announce
// event fires exactly once per patron. Jackpots stay patron-wide (tested separately, unchanged).
// =============================================================================
function bossProbe(seed, wishId){
  const segs = {};            // patron-0 segment index → observation (captured at that seg's first spin)
  let announces = 0, reached = -1;
  const collect = r => { (r.events || []).forEach(e => { if (/takes hold/.test(e)) announces++; }); return r.state; };
  let st = collect(act({ type: 'new_run', seed, wish: wishId }));
  let guard = 0;
  while (!st.over && guard++ < 300 && st.patron && st.patron.index === 0){
    if (st.phase === 'segment'){
      if ((st.spinsTaken || 0) === 0){ st = collect(act({ type: 'spin' })); continue; }
      const seg = st.patron.segment;
      if (segs[seg] === undefined){
        segs[seg] = {
          boss: !!st.patron.boss, active: !!(st.wish && st.wish.active),
          keepCap: (st.curses && st.curses.keepCap) || 0,
          wishReroll: !!st.wishReroll,
          bloomVeiled: (st.rungs || []).some(x => x.tier === 'bloom' && x.veiled === true),
        };
        reached = Math.max(reached, seg);
      }
      const target = [...st.rungs].filter(x => x.req).sort((a, b) => (b.reach_estimate || 0) - (a.reach_estimate || 0))[0];
      const need = { ...(target ? target.req : {}) };
      for (const t of st.tray) if (t.kept && need[t.symbol]) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag || 1));
      const keepable = keepableNow();
      const kd = (st.tray || []).find(t => keepable.has(t.i) && t.symbol !== 'fang' && (need[t.symbol] || 0) > 0);
      if (kd) st = collect(act({ type: 'keep', i: kd.i }));
      else if ((st.metNow || []).length > 0 || (st.rollsLeft || 0) <= 0) st = collect(act({ type: 'resolve' }));
      else st = collect(act({ type: 'spin' }));
    }
    else if (st.phase === 'perk') st = collect(act({ type: 'perk', card: 0 }));
    else if (st.phase === 'transform') st = collect(act({ type: 'transform', skip: true }));
    else if (st.phase === 'stitch') st = collect(act({ type: 'stitch' }));
    else break;
  }
  return { segs, announces, reached };
}
{
  clearBalanceOverrides();   // default patronLen = 3 (boss is patron-0 segment index 2)
  // grasping_widow (keepCap 2) — INERT on segments 0,1; ENFORCED on the boss segment 2.
  let widow = null;
  for (let seed = 1; seed <= 200 && !widow; seed++){ const p = bossProbe(seed, 'grasping_widow'); if (p.reached >= 2) widow = p; }
  ok(widow, 'boss-gating: reached patron 0 boss segment (seg 3) under grasping_widow');
  if (widow){
    ok(widow.segs[0].keepCap === 0 && widow.segs[1].keepCap === 0, 'constraint: keepCap INERT on segments 1–2 (no cap in s.curses)');
    ok(widow.segs[2].keepCap === 2 && widow.segs[2].boss, 'constraint: keepCap ENFORCED (2) on the boss segment 3');
    ok(!widow.segs[0].active && !widow.segs[1].active && widow.segs[2].active, 's.wish.active flips off→off→ON at the boss segment');
    ok(widow.announces === 1, 'boss announce (“takes hold”) fires exactly once per patron');
  }
  // veiled_one — the bloom is UNVEILED on segments 0,1; masked only on the boss segment 2.
  let veil = null;
  for (let seed = 1; seed <= 200 && !veil; seed++){ const p = bossProbe(seed, 'veiled_one'); if (p.reached >= 2) veil = p; }
  ok(veil, 'boss-gating: reached patron 0 boss segment under veiled_one');
  if (veil){
    ok(!veil.segs[0].bloomVeiled && !veil.segs[1].bloomVeiled, 'twist(veil): the bloom is NOT masked on segments 1–2');
    ok(veil.segs[2].bloomVeiled && veil.segs[2].boss, 'twist(veil): the bloom is masked ONLY on the boss segment 3');
  }
  // generous_one — the free reroll is offered ONLY on the boss segment 2.
  let gen = null;
  for (let seed = 1; seed <= 200 && !gen; seed++){ const p = bossProbe(seed, 'generous_one'); if (p.reached >= 2) gen = p; }
  ok(gen, 'boss-gating: reached patron 0 boss segment under generous_one');
  if (gen){
    ok(!gen.segs[0].wishReroll && !gen.segs[1].wishReroll, 'twist(freeReroll): wish_reroll NOT offered on segments 1–2');
    ok(gen.segs[2].wishReroll && gen.segs[2].boss, 'twist(freeReroll): wish_reroll offered ONLY on the boss segment 3');
  }
  clearBalanceOverrides();
}

// =============================================================================
// SESSION — THE GENEROUS LIEN under boss-gating (greybox feedback): the free reroll is now
// BOSS-segment-only (once per segment, ONE boss segment per patron), so a patron affords at
// most ONE use ⇒ floor(uses/2) === 0 ⇒ the per-2-uses mild-bane lien effectively NEVER bills
// at patronLen >= 2. Assert the NEW reality (<=1 use, no lien) — the lien-INERT interaction is
// FLAGGED to the designer. (enchantments is native-on, so a lien WOULD attach if it ever fired.)
// =============================================================================
function driveGenerous(seed){
  const evs = [];
  newRun(seed, { wish:'generous_one' });
  let st = state(), guard = 0, uses = 0, completed = false;
  while (!st.over && guard++ < 500){
    let r;
    if (st.phase === 'perk') r = act({ type:'perk', card:0 });
    else if (st.phase === 'transform') r = act({ type:'transform', skip:true });
    else if (st.phase === 'stitch') r = act({ type:'stitch' });
    else if (st.phase === 'segment' || st.phase === 'knot'){
      if ((st.spinsTaken || 0) === 0) r = act({ type:'spin' });
      else if (st.phase === 'segment' && st.wishReroll && st.wishReroll.targets.length){
        r = act({ type:'wish_reroll', di: st.wishReroll.targets[0] }); if (r.ok) uses++;
      } else {
        const target = [...st.rungs].filter(x => x.req).sort((a, b) => (b.reach_estimate || 0) - (a.reach_estimate || 0))[0];
        const need = { ...(target ? target.req : {}) };
        for (const t of st.tray) if (t.kept && need[t.symbol]) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag || 1));
        const keepable = keepableNow();
        const kd = (st.tray || []).find(t => keepable.has(t.i) && t.symbol !== 'fang' && (need[t.symbol] || 0) > 0);
        if (kd) r = act({ type:'keep', i: kd.i });
        else if ((st.metNow || []).length > 0 || (st.rollsLeft || 0) <= 0) r = act({ type:'resolve' });
        else r = act({ type:'spin' });
      }
    } else break;
    if (r && r.events) evs.push(...r.events);
    st = r.state;
    if (evs.some(e => /a new patron sits/.test(e))){ completed = true; break; }
  }
  return { evs, uses, completed };
}
{
  clearBalanceOverrides();   // default patronLen (3) — real 3-segment patrons; the free reroll is boss-only
  let tested = false;
  for (let seed = 1; seed <= 80 && !tested; seed++){
    const g = driveGenerous(seed);
    if (!g.completed) continue;
    tested = true;
    ok(g.uses <= 1, `generous lien: a 3-segment patron affords at most ONE boss-only free reroll (uses=${g.uses}) [seed ${seed}]`);
    ok(!g.evs.some(e => /the Generous One collects/.test(e)),
      'generous lien: <=1 use/patron ⇒ NO mild-bane lien bills (floor(uses/2)=0 — FLAGGED: the per-2-uses lien is inert at patronLen>=2)');
  }
  ok(tested, 'generous lien: a generous patron completed (boss-only free reroll)');
}

// =============================================================================
// SESSION — JACKPOT PAYOUT: a full SPOTLESS patron pays the 'Patron jackpot' line
// (present ONLY when nonzero). A clean policy never keeps a fang ⇒ no corrupt/cursed
// bead ⇒ spotless MET. We force spotless_one and trim twists/jackpots off for later
// patrons (so the line is exactly patron-1's +25), then read the final tally.
// =============================================================================
function playClean(seed, opts){
  newRun(seed, opts);
  let st = state(), guard = 0;
  while (!st.over && guard++ < 600){
    let r;
    if (st.phase === 'perk') r = act({ type:'perk', card:0 });
    else if (st.phase === 'transform') r = act({ type:'transform', skip:true });
    else if (st.phase === 'stitch') r = act({ type:'stitch' });
    else if (st.phase === 'segment' || st.phase === 'knot'){
      if ((st.spinsTaken || 0) === 0) r = act({ type:'spin' });
      else {
        const target = [...st.rungs].filter(x => x.req).sort((a, b) => (b.reach_estimate || 0) - (a.reach_estimate || 0))[0];
        const need = { ...(target ? target.req : {}) };
        for (const t of st.tray) if (t.kept && need[t.symbol]) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag || 1));
        const keepable = keepableNow();
        const kd = (st.tray || []).find(t => keepable.has(t.i) && t.symbol !== 'fang' && (need[t.symbol] || 0) > 0);
        if (kd) r = act({ type:'keep', i: kd.i });
        else if ((st.metNow || []).length > 0 || (st.rollsLeft || 0) <= 0) r = act({ type:'resolve' });
        else r = act({ type:'spin' });
      }
    } else break;
    st = r.state;
  }
  return st;
}
{
  // find a seed whose clean run reaches >= 5 segments (so patron 1 — spotless — completes)
  const trim = { 'wishes.twists': false, 'wishes.jackpots': false };
  let done = false;
  for (let seed = 1; seed <= 120 && !done; seed++){
    const st = playClean(seed, { wish:'spotless_one', balance: trim });
    const line = (st.scoreLines || []).find(l => l.label === 'Patron jackpot');
    if (st.thread.length >= 5){
      done = true;
      ok(!!line && line.pts === 25, `jackpot payout: a clean spotless patron pays the 'Patron jackpot' line (+25) [seed ${seed}, len ${st.thread.length}, pts ${line ? line.pts : 'none'}]`);
      // contract progress surfaced live (spotless: progress<=target ⇒ met)
      const midClean = playCleanToState(seed, { wish:'spotless_one', balance: trim });
      ok(midClean && midClean.wish && midClean.wish.contract && midClean.wish.contract.kind === 'spotless',
        'jackpot: state.wish.contract surfaces the live contract {kind,target,progress,met}');
    }
  }
  ok(done, 'jackpot payout: reached a >=5-segment clean run for patron 1');

  // 'Patron jackpot' line present ONLY when nonzero: a wishes-OFF run never emits it
  clearBalanceOverrides();
  const noWish = playClean(7, { balance: { 'wishes.enabled': false } });
  ok(!(noWish.scoreLines || []).some(l => l.label === 'Patron jackpot'), "jackpot: no 'Patron jackpot' line when no jackpot pays (wishes off)");
  clearBalanceOverrides();
}
// play a clean run only until a jackpot contract is visible in state (patron mid-way), return that state
function playCleanToState(seed, opts){
  newRun(seed, opts);
  let st = state(), guard = 0;
  while (!st.over && guard++ < 200){
    if (st.wish && st.wish.contract) return st;
    let r;
    if (st.phase === 'perk') r = act({ type:'perk', card:0 });
    else if (st.phase === 'transform') r = act({ type:'transform', skip:true });
    else if (st.phase === 'stitch') r = act({ type:'stitch' });
    else if (st.phase === 'segment' || st.phase === 'knot'){
      if ((st.spinsTaken || 0) === 0) r = act({ type:'spin' });
      else {
        const target = [...st.rungs].filter(x => x.req).sort((a, b) => (b.reach_estimate || 0) - (a.reach_estimate || 0))[0];
        const need = { ...(target ? target.req : {}) };
        for (const t of st.tray) if (t.kept && need[t.symbol]) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag || 1));
        const keepable = keepableNow();
        const kd = (st.tray || []).find(t => keepable.has(t.i) && t.symbol !== 'fang' && (need[t.symbol] || 0) > 0);
        if (kd) r = act({ type:'keep', i: kd.i });
        else if ((st.metNow || []).length > 0 || (st.rollsLeft || 0) <= 0) r = act({ type:'resolve' });
        else r = act({ type:'spin' });
      }
    } else break;
    st = r.state;
  }
  return st;
}

// =============================================================================
// SESSION — FANGCOURT: a load-bearing fang sets NO cursedHere while she watches; a
// non-jackpot patron (veiled_one) at the SAME seed+actions drains normally (the "only").
// The two runs are lockstep (fangCourt draws no rng, changes no tray/metNow), so a
// "keep-everything (incl. fangs)" driver produces the same beads — only cursedHere differs.
// =============================================================================
function keepFangs(seed, wishId){
  newRun(seed, { wish: wishId });
  let st = state(), guard = 0;
  while (!st.over && guard++ < 400){
    let r;
    if (st.phase === 'perk') r = act({ type:'perk', card:0 });
    else if (st.phase === 'transform') r = act({ type:'transform', skip:true });
    else if (st.phase === 'stitch') r = act({ type:'stitch' });
    else if (st.phase === 'segment' || st.phase === 'knot'){
      if ((st.spinsTaken || 0) === 0) r = act({ type:'spin' });
      else {
        const keepable = keepableNow();
        const kd = (st.tray || []).find(t => keepable.has(t.i));   // keep EVERYTHING legal, fangs included
        if (kd) r = act({ type:'keep', i: kd.i });
        else if ((st.metNow || []).length > 0 || (st.rollsLeft || 0) <= 0) r = act({ type:'resolve' });
        else r = act({ type:'spin' });
      }
    } else break;
    st = r.state;
  }
  return st.thread.outcomes;
}
{
  let tested = false;
  for (let seed = 1; seed <= 120 && !tested; seed++){
    const court = keepFangs(seed, 'fang_fancier');
    const idx = court.findIndex(o => o.corrupt);
    if (idx < 0) continue;                                            // need a load-bearing fang bead
    const control = keepFangs(seed, 'veiled_one');                    // same seed+actions, non-jackpot patron
    if (!control[idx] || !control[idx].corrupt) continue;            // runs must be lockstep at that bead
    tested = true;
    ok(court[idx].corrupt && court[idx].cursedHere === false, `fangCourt: a load-bearing fang corrupts but sets NO cursedHere (drain suppressed) [seed ${seed}]`);
    ok(control[idx].corrupt && control[idx].cursedHere === true, 'fangCourt: the SAME bead under a non-jackpot patron drains normally (suppression is patron-scoped)');
  }
  ok(tested, 'fangCourt: found a load-bearing fang bead to test the drain suppression');
}

// =============================================================================
// SESSION — DETERMINISM: the wishes MASTER off makes the twist/jackpot sub-flags inert
// (the whole species scaffolding is gated behind on('wishes')), so a master-off run is
// byte-identical whether the sub-flags are on or off.
// =============================================================================
{
  clearBalanceOverrides();   // no override ⇒ no state.config echo, so the run stream is pure gameplay
  const play = () => {
    const states = [];
    let r = act({ type:'new_run', seed:4242 });
    let st = r.state, g = 0;
    states.push(JSON.stringify(st));
    while (!st.over && g++ < 300){
      let a;
      if (st.phase === 'perk') a = { type:'perk', card:0 };
      else if (st.phase === 'transform') a = { type:'transform', skip:true };
      else if (st.phase === 'stitch') a = { type:'stitch' };
      else if (st.phase === 'segment' || st.phase === 'knot'){
        if ((st.spinsTaken || 0) === 0) a = { type:'spin' };
        else {
          const keepable = keepableNow();
          const kd = (st.tray || []).find(t => keepable.has(t.i) && t.symbol !== 'fang');
          if (kd) a = { type:'keep', i: kd.i };
          else if ((st.metNow || []).length > 0 || (st.rollsLeft || 0) <= 0) a = { type:'resolve' };
          else a = { type:'spin' };
        }
      } else break;
      r = act(a); st = r.state; states.push(JSON.stringify(st));
    }
    return states.join('\n');
  };
  const savT = BALANCE.wishes.twists, savJ = BALANCE.wishes.jackpots, savE = BALANCE.wishes.enabled;
  BALANCE.wishes.enabled = false; BALANCE.wishes.twists = true;  BALANCE.wishes.jackpots = true;   // master OFF, subs ON
  const off1 = play();
  BALANCE.wishes.twists = false; BALANCE.wishes.jackpots = false;                                    // master OFF, subs OFF
  const off2 = play();
  BALANCE.wishes.enabled = savE; BALANCE.wishes.twists = savT; BALANCE.wishes.jackpots = savJ;
  ok(off1 === off2, 'determinism: wishes master OFF ⇒ twist/jackpot sub-flags are inert (byte-identical run)');
}

console.log(`\nwish_v2: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
