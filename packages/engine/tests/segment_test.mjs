// =============================================================================
// HEADLESS TEST — SpellSpun core (recipe band + resolve + blooms + coil + score).
// Run: node _segment_test.mjs   (from the Server/ directory)
// No DOM. Builds the canonical six-d3 hand inline so it needs no BoneDie runcore.
// =============================================================================
import { makeRng } from '../engine.js';
import { generateSegment, generateKnot, multiCompletionRate, resetShapeMemory } from '../generator.js';
import {
  newThread, resolveSegment, commitSegment, applyCurse,
  checkBlooms, recordBloom, drawPerks, resolveKnot, tallyScore, stopPreview, countFangs, detectCombos,
} from '../spellspun.js';
import { COLOUR_IDS } from '../../content/symbols.js';

// --- the canonical starting hand (six d3, the leans from runcore.js) -----------
const HAND_TEMPLATES = {
  ox:    ['body','body','mind'],
  beast: ['body','spirit','fang'],
  seer:  ['mind','spirit','mana'],
  augur: ['mind','mind','spirit'],
  pelt:  ['charm','charm','body'],
  maw:   ['fang','mind','charm'],
};
function mkHand(){
  const mk = syms => ({ faces: syms.map(s => ({ symbol:s, mag:1, state:'live' })) });
  return { dice: Object.values(HAND_TEMPLATES).map(mk) };
}
const F = (symbol, mag=1) => ({ symbol, mag, state:'live' });

// --- tiny test harness ----------------------------------------------------------
let pass = 0, fail = 0; const fails = [];
function ok(cond, msg){ if (cond){ pass++; } else { fail++; fails.push(msg); console.log('  ✗ ' + msg); } }
function head(t){ console.log('\n' + t); }

const hand = mkHand();

// =============================================================================
// 1. SEGMENT GENERATION — distinct colours, band, rarity
// =============================================================================
head('1. Segment generation (200 segments)');
resetShapeMemory();
const N = 200;
const band = { floor: [], true: [], bloom: [] };
let allDistinct = true, multiSum = 0, repeats = 0, minReach = 1;
let prevPerm = null;
for (let i = 0; i < N; i++){
  const seg = generateSegment(hand, {}, { rng: makeRng(1000 + i), segIndex: i % 6 });
  const cols = seg.rungs.map(r => r.colour);
  if (new Set(cols).size !== 3) allDistinct = false;
  seg.rungs.forEach(r => { if (r._p < minReach) minReach = r._p; });
  const perm = cols.join(',');
  if (prevPerm && perm === prevPerm) repeats++;
  prevPerm = perm;
  seg.rungs.forEach(r => band[r.tier].push(r._p));
  multiSum += multiCompletionRate(hand, seg.rungs, 400);
}
const avg = a => a.reduce((x,y)=>x+y,0)/a.length;
const fmt = x => x.toFixed(3);
console.log(`   realized reach  floor ${fmt(avg(band.floor))}  true ${fmt(avg(band.true))}  bloom ${fmt(avg(band.bloom))}`);
console.log(`   multi-completion (avg)  ${fmt(multiSum/N)}`);
console.log(`   consecutive identical colour-perms  ${repeats}/${N-1}`);
console.log(`   weakest rung reachability  ${fmt(minReach)}`);
ok(allDistinct, 'every segment carries three distinct colours');
ok(minReach >= 0.03, 'no rung is essentially impossible (weakest >= 3% reach)');
ok(avg(band.floor) > avg(band.true) && avg(band.true) > avg(band.bloom), 'band is ordered floor > true > bloom on average');
ok(avg(band.floor) >= 0.28 && avg(band.floor) <= 0.72, 'floor band in a sane range');
ok(avg(band.bloom) >= 0.05 && avg(band.bloom) <= 0.32, 'bloom band in a sane range');
ok(multiSum/N <= 0.10, 'multi-completion stays rare (<=10% upper bound)');
ok(repeats < N * 0.34, 'colour permutations vary (anti-repeat works)');

// =============================================================================
// 2. RESOLVE — highest VALUE wins
// =============================================================================
head('2. Resolve to highest value');
const rungs = [
  { tier:'floor', colour:'body',   value:1, req:{ body:2 } },
  { tier:'true',  colour:'mind',   value:3, req:{ mind:2, charm:1 } },
  { tier:'bloom', colour:'spirit', value:6, req:{ spirit:3 } },
];
// satisfies floor (body:2) AND bloom (spirit:3) -> must resolve to bloom (value 6)
let r = resolveSegment([F('body'),F('body'),F('spirit'),F('spirit'),F('spirit')], rungs);
ok(r.tier === 'bloom' && r.value === 6, 'resolves to the highest-value satisfied rung (bloom over floor)');
// satisfies only floor
r = resolveSegment([F('body'),F('body')], rungs);
ok(r.tier === 'floor' && r.value === 1, 'resolves to floor when only floor is met');
// satisfies nothing -> snap
r = resolveSegment([F('charm'),F('mana')], rungs);
ok(r.hit < 0, 'nothing satisfied -> snap (hit < 0)');
// a depth-2 body face counts as 2 body
r = resolveSegment([F('body',2)], rungs);
ok(r.tier === 'floor', 'a depth-2 face counts its pips toward a recipe');

// =============================================================================
// 3. FANG as the wild joker — a load-bearing fang corrupts AND forces a curse
// =============================================================================
head('3. Fang joker — load-bearing → forced curse');
// true needs {mind:2, charm:1}; we have mind,mind and a fang (fills the charm slot)
let rf = resolveSegment([F('mind'),F('mind'),F('fang')], rungs);
ok(rf.tier === 'true', 'a kept fang auto-fills the missing ingredient slot');
ok(rf.fangLoadBearing === true, 'a load-bearing fang is flagged (corrupts the thread + forces a curse)');
// the same hand WITHOUT the fang would only reach... nothing here (no charm) -> proves load-bearing
let rNoFang = resolveSegment([F('mind'),F('mind')], rungs);
ok(rNoFang.hit < 0, 'without the fang the rung is not met (confirms it was load-bearing)');
// a fang that ISN'T needed is not load-bearing → no curse
let rIdle = resolveSegment([F('body'),F('body'),F('fang')], rungs);
ok(rIdle.tier === 'floor' && rIdle.fangLoadBearing === false, 'an unneeded fang does not corrupt / does not force a curse');
ok(countFangs([F('fang'),F('body'),F('fang')]) === 2, 'countFangs counts kept fangs');

// =============================================================================
// 4. BLOOMS over the resolved-colour history
// =============================================================================
head('4. Blooms');
function threadOf(seq){ // seq: [{colour,tier}]
  const th = newThread();
  for (const s of seq) commitSegment(th, { hit:0, tier:s.tier||'true', colour:s.colour, value:3, colourPips:1, ingredients:{charm:0,mana:0}, fangLoadBearing:!!s.corrupt });
  return th;
}
let th = threadOf([{colour:'body'},{colour:'mind'},{colour:'spirit'}]);
ok(checkBlooms(th).some(b=>b.kind==='tricolor'), 'three distinct colours -> tricolor bloom');
th = threadOf([{colour:'body',tier:'true'},{colour:'mind',tier:'bloom'},{colour:'spirit',tier:'true'}]);
ok(checkBlooms(th).some(b=>b.kind==='hatTrick'), 'three distinct True+/Bloom -> hat-trick');
th = threadOf([{colour:'body'},{colour:'body'},{colour:'body'}]);
ok(checkBlooms(th).some(b=>b.kind==='threeOfAKind'), 'three of one colour -> three-of-a-kind');
// a corrupt segment in the window breaks the bloom
th = threadOf([{colour:'body'},{colour:'mind'},{colour:'spirit',corrupt:true}]);
ok(checkBlooms(th).length === 0, 'a fang-corrupt segment breaks the bloom');
// a frayed colour cannot complete a bloom
th = threadOf([{colour:'body'},{colour:'mind'},{colour:'spirit'}]);
th.frayed.add('mind');
ok(checkBlooms(th).length === 0, 'a frayed colour cannot complete a bloom');

// =============================================================================
// 5. STOP preview verdicts
// =============================================================================
head('5. Stop-is-the-choice preview');
const tEmpty = newThread();
ok(stopPreview([F('charm')], rungs, tEmpty).verdict === 'NONE', 'nothing lit -> NONE (would snap)');
const tBody = threadOf([{colour:'body'}]);                       // chain colour = body
ok(stopPreview([F('body'),F('body')], rungs, tBody).verdict === 'EXTEND', 'resolving the chain colour -> EXTEND');
ok(stopPreview([F('spirit'),F('spirit'),F('spirit')], rungs, tBody).verdict === 'BREAK', 'resolving an off-colour rung -> BREAK');
ok(stopPreview([F('mind'),F('mind'),F('fang')], rungs, tBody).verdict === 'CORRUPT', 'a load-bearing fang -> CORRUPT');

// =============================================================================
// 6. PERKS — clean vs frayed vs forced
// =============================================================================
head('6. Perks');
const prng = makeRng(42);
let cleanDraw = drawPerks('clean', prng);
ok(cleanDraw.length === 3 && cleanDraw.every(p=>p.kind==='blessing'), 'clean finish -> three blessings');
let frayedDraw = drawPerks('frayed', prng);
ok(frayedDraw.length === 2 && frayedDraw.every(p=>p.kind==='blessing'), 'frayed (Floor) finish -> 2 blessings, NO curse');
let forcedDraw = drawPerks('forced', prng, 3);
ok(forcedDraw.length === 1 && forcedDraw[0].kind === 'curse', 'a forced (fang) curse draws ONLY the curse — no decoy blessings');

// =============================================================================
// 7. KNOT
// =============================================================================
head('7. The knot');
const knot = generateKnot(hand);
ok(knot.length === 3 && new Set(knot.map(k=>k.colour)).size === 3, 'knot offers one rung per colour');
console.log(`   knot reach  ${knot.map(k=>k.colour+' '+fmt(k._p)).join('  ')}`);
ok(knot.every(k => k._p >= 0.25 && k._p <= 0.80), 'knot rungs sit near ~50% reach');
// tight knot: a met rung whose colour matches a live bloom is preferred
const kRes = resolveKnot([F('body'),F('body'),F('body')], knot, ['body']);
ok(kRes.hit && kRes.colour === 'body' && kRes.tight, 'knot matching a live bloom -> tight knot');

// =============================================================================
// 8. SCORE TALLY
// =============================================================================
head('8. Score tally');
const run = newThread();
commitSegment(run, { hit:0, tier:'floor', colour:'body',   value:1, colourPips:2, ingredients:{charm:1,mana:0} });
commitSegment(run, { hit:1, tier:'true',  colour:'mind',   value:3, colourPips:2, ingredients:{charm:1,mana:0} });
commitSegment(run, { hit:2, tier:'bloom', colour:'spirit', value:6, colourPips:3, ingredients:{charm:0,mana:1} });
const scored = tallyScore(run, { knot:{ hit:true, tight:true } });
console.log(`   score ${scored.score}  ::  ` + scored.lines.map(l=>`${l.label} ${l.pts>=0?'+':''}${l.pts}`).join(' | '));
ok(scored.score > 0, 'a healthy thread scores above zero');
ok(scored.lines.some(l=>l.label.startsWith('Trinity')), 'a 3-distinct-colour run earns the Trinity bonus');
// curse drain bites
const cursed = newThread();
commitSegment(cursed, { hit:1, tier:'true', colour:'body', value:3, colourPips:1, ingredients:{charm:0,mana:0} });
commitSegment(cursed, { hit:1, tier:'true', colour:'mind', value:3, colourPips:1, ingredients:{charm:0,mana:0} });
commitSegment(cursed, { hit:1, tier:'true', colour:'spirit', value:3, colourPips:1, ingredients:{charm:0,mana:0} });
applyCurse(cursed, 'mind');   // frays mind, cursed segment = the middle one (index 1)
const cScore = tallyScore(cursed);
ok(cScore.lines.some(l=>l.label==='Curse drain' && l.pts < 0), 'a curse drains its neighbours');

// #8 cursed jackpot: 5 cursed beads running INTO a tied knot pays the +40; short streaks / missed knots / non-trailing runs do not.
const cj = newThread();
for (let i=0;i<5;i++){ commitSegment(cj, { hit:1, tier:'floor', colour:'body', value:1, colourPips:1, ingredients:{charm:0,mana:0} }); applyCurse(cj, null); }
ok(tallyScore(cj, { knot:{ hit:true } }).lines.some(l=>l.label==='Cursed jackpot' && l.pts===40), '5 trailing cursed beads + a tied knot pays the +40 cursed jackpot');
ok(!tallyScore(cj, { knot:{ hit:false } }).lines.some(l=>l.label==='Cursed jackpot'), 'no jackpot without a tied knot');
const cj4 = newThread();
for (let i=0;i<4;i++){ commitSegment(cj4, { hit:1, tier:'floor', colour:'body', value:1, colourPips:1, ingredients:{charm:0,mana:0} }); applyCurse(cj4, null); }
ok(!tallyScore(cj4, { knot:{ hit:true } }).lines.some(l=>l.label==='Cursed jackpot'), 'a 4-cursed streak is below the jackpot threshold');
const cjGap = newThread();
for (let i=0;i<5;i++){ commitSegment(cjGap, { hit:1, tier:'floor', colour:'body', value:1, colourPips:1, ingredients:{charm:0,mana:0} }); applyCurse(cjGap, null); }
commitSegment(cjGap, { hit:1, tier:'true', colour:'mind', value:3, colourPips:1, ingredients:{charm:0,mana:0} });   // a clean bead after the streak breaks the trailing run
ok(!tallyScore(cjGap, { knot:{ hit:true } }).lines.some(l=>l.label==='Cursed jackpot'), 'the cursed run must run INTO the knot (a clean final bead voids it)');

// RESONANCE KILL: a bloom whose colour is later frayed scores zero
const rk = newThread();
commitSegment(rk, { tier:'true', colour:'body', value:3, colourPips:1, ingredients:{charm:0,mana:0} });
recordBloom(rk, { kind:'threeOfAKind', colour:'body' });
const before = tallyScore(rk).score;
rk.frayed.add('body');
const after = tallyScore(rk).score;
ok(before - after === 5, 'resonance kill: fraying a bloom\'s colour zeroes it (loses the +5)');
ok(tallyScore(rk).lines.every(l=>l.label!=='Blooms'), 'a frayed bloom is omitted from the tally');

// non-overlapping Trinity: four distinct-in-a-row colours score ONE trinity window, not two
const tt = newThread();
['body','mind','spirit','body'].forEach(c=>commitSegment(tt,{tier:'true',colour:c,value:3,colourPips:1,ingredients:{charm:0,mana:0}}));
const triLines = tallyScore(tt).lines.filter(l=>l.label.startsWith('Trinity'));
ok(triLines.length<=1 && (triLines[0]?.pts||0) <= 5, 'Trinity scores once per non-overlapping span (no double-count)');

// =============================================================================
// 9. MIXED BEADS — a multi-completion counts for ALL its colours (⑨/⑩)
// =============================================================================
head('9. Mixed beads (multi-colour)');
const mkBead = (th, colour, metColours, tier='true') =>
  commitSegment(th, { hit:0, tier, colour, value:3, colourPips:1, ingredients:{charm:0,mana:0}, metColours, metCount: metColours.length });

// commitSegment stores the colour set, dominant first
let mb = mkBead(newThread(), 'body', ['body','mind']);
ok(mb.colours.length===2 && mb.colours[0]==='body', 'a mixed bead stores its colours (dominant first)');
// a single-completion outcome still gets colours=[colour]
let sb = commitSegment(newThread(), { tier:'true', colour:'spirit', value:3, colourPips:1, ingredients:{charm:0,mana:0} });
ok(sb.colours.length===1 && sb.colours[0]==='spirit', 'a single bead defaults to colours=[colour] (back-compat)');

// ofAKind: a {body,mind} bead bridges into the mind run -> three-of-a-kind
let r9 = newThread();
mkBead(r9,'body',['body']); mkBead(r9,'body',['body','mind']); mkBead(r9,'mind',['mind']); mkBead(r9,'mind',['mind']);
ok(detectCombos(r9).some(c=>c.id==='ofAKind' && c.n>=3), 'a mixed bead extends a colour run to three-of-a-kind');

// straight: a window whose DOMINANTS aren\'t distinct (body,mind,body) still forms a Trinity via the mix
let st = newThread();
mkBead(st,'body',['body']); mkBead(st,'mind',['mind']); mkBead(st,'body',['body','spirit']);   // window 1 — SDR rescues it
mkBead(st,'body',['body']); mkBead(st,'mind',['mind']); mkBead(st,'spirit',['spirit']);          // window 2 — plain trinity
ok(detectCombos(st).some(c=>c.id==='straight' && c.n>=2), 'mixed beads enable a Trinity straight via the SDR pick');

// checkBlooms: a mixed bead supplies the third distinct colour for a tricolor
let bl = newThread();
mkBead(bl,'body',['body']); mkBead(bl,'mind',['mind']); mkBead(bl,'body',['body','spirit']);
ok(checkBlooms(bl).some(b=>b.kind==='tricolor'), 'a mixed bead supplies the third colour for a tricolor bloom');

// scoring: the mixed-bead window earns the Trinity bonus the single-colour version cannot
let sMix = newThread();    mkBead(sMix,'body',['body']);    mkBead(sMix,'mind',['mind']);    mkBead(sMix,'body',['body','spirit']);
let sSingle = newThread(); mkBead(sSingle,'body',['body']); mkBead(sSingle,'mind',['mind']); mkBead(sSingle,'body',['body']);
ok(tallyScore(sMix).score > tallyScore(sSingle).score, 'mixed beads score higher than the single-colour equivalent (the intended buff)');
// and a single-colour thread scores IDENTICALLY to before (no regression from the new code paths)
const reg = newThread();
['body','mind','spirit'].forEach(c=>mkBead(reg,c,[c]));
ok(tallyScore(reg).lines.some(l=>l.label.startsWith('Trinity')), 'a plain 3-distinct run still earns Trinity (no regression)');

// =============================================================================
console.log(`\n${'='.repeat(60)}`);
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (fail){ console.log('FAILURES:\n' + fails.map(f=>'  - '+f).join('\n')); process.exit(1); }
else console.log('All SpellSpun core checks passed.');
