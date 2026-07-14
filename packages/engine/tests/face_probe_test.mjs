// =============================================================================
// FACE PROBE TEST (§D1 ⚖3.2 — faces-as-progression, the engine audit)
// -----------------------------------------------------------------------------
// The generator's reach probes (pReach / pReachHuman / multiCompletionRate) and the
// segment/knot fitters must be CORRECT on variable face counts (drums may range 2..4
// faces, not a hardcoded 3). This is the containment story: because the probes roll the
// ACTUAL hand (rollDie reads faces.length per die), any face change auto-reprices reach.
//   • a grafted colour face RAISES pReach for that colour's rung (same seeds);
//   • an excise-to-d2 raises the surviving faces' effective frequency (a seeded census);
//   • no NaN/undefined from any probe on 2- and 4-face dice;
//   • generateSegment + generateKnot survive a mixed-face hand (3 distinct colours, finite).
// Pure unit test of the generator (no session, no rng leakage).
// =============================================================================
import { makeRng, rollDie } from '../engine.js';
import { pReach, pReachHuman, multiCompletionRate, generateSegment, generateKnot } from '../generator.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };
const F = (symbol, mag = 1) => ({ symbol, mag, state: 'live' });
const clone = h => ({ dice: h.dice.map(d => ({ name: d.name, faces: d.faces.map(f => ({ ...f })) })) });

// a 6-die hand with spirit PRESENT but scarce (two dice show 1/3 spirit).
const base = { dice: [
  { name: 'a', faces: [F('body'), F('body'), F('mind')] },
  { name: 'b', faces: [F('spirit'), F('mind'), F('mind')] },
  { name: 'c', faces: [F('mind'), F('body'), F('charm')] },
  { name: 'd', faces: [F('spirit'), F('body'), F('mind')] },
  { name: 'e', faces: [F('charm'), F('body'), F('mind')] },
  { name: 'f', faces: [F('mana'), F('mind'), F('body')] },
] };
const grafted = clone(base);
grafted.dice[0].faces.push(F('spirit'));   // graft a 4th spirit face onto die 0 (now a d4)

// ---- probe increase: a grafted colour face RAISES pReach for that colour's rung (same seeds) ----
const spiritRung = { tier: 'true', colour: 'spirit', req: { spirit: 2 }, value: 3 };
const pBase = pReach(base, spiritRung), pGraft = pReach(grafted, spiritRung);
ok(Number.isFinite(pBase) && Number.isFinite(pGraft), 'pReach is finite on 3- and 4-face hands');
ok(pGraft > pBase, `graft raises pReach for the grafted colour's rung (base ${pBase.toFixed(3)} → grafted ${pGraft.toFixed(3)})`);

// ---- excise census: after a face is removed, the surviving faces show MORE often ----
const d3 = { name: 'x', faces: [F('body'), F('mind'), F('spirit')] };
const d2 = { name: 'x', faces: [F('body'), F('mind')] };   // spirit excised
const census = (die, n) => { const rng = makeRng(4242); const c = {}; for (let i = 0; i < n; i++){ const f = rollDie(die, rng); c[f.symbol] = (c[f.symbol] || 0) + 1; } return c; };
const N = 60000, c3 = census(d3, N), c2 = census(d2, N);
ok((c2.body / N) > (c3.body / N), `excise-to-d2 raises a surviving face's frequency (body ${(c3.body / N).toFixed(3)} → ${(c2.body / N).toFixed(3)})`);
ok(!c2.spirit, 'the excised symbol never rolls on the reshaped drum');
ok(Math.abs(c3.body / N - 1 / 3) < 0.02 && Math.abs(c2.body / N - 1 / 2) < 0.02, 'roll frequency tracks 1/faces.length (d3 ≈ 1/3, d2 ≈ 1/2)');

// ---- no NaN/undefined on 2- and 4-face dice from ANY probe ----
const mixed = clone(base);
mixed.dice[1].faces = [F('body'), F('mind')];                          // a 2-face die
mixed.dice[0].faces = [F('body'), F('body'), F('mind'), F('spirit')];  // a 4-face die
let allFinite = true;
for (const rung of [spiritRung, { tier: 'floor', colour: 'body', req: { body: 2 }, value: 1 },
                    { tier: 'bloom', colour: 'body', req: { body: 3 }, concentrated: true, value: 6 }]){
  const a = pReach(mixed, rung), b = pReachHuman(mixed, rung), cc = multiCompletionRate(mixed, [rung, spiritRung]);
  if (![a, b, cc].every(x => Number.isFinite(x) && x >= 0 && x <= 1)) allFinite = false;
}
ok(allFinite, 'pReach / pReachHuman / multiCompletionRate stay finite in [0,1] on 2- and 4-face dice');

// ---- the whole generateSegment + generateKnot pipeline survives a mixed-face hand ----
let genOk = true;
try {
  const seg = generateSegment(mixed, { floor: 0.55, true: 0.32, bloom: 0.16 }, { seedTag: 7, segIndex: 2 });
  genOk = seg.rungs.length === 3 && new Set(seg.rungs.map(r => r.colour)).size === 3 && seg.rungs.every(r => Number.isFinite(r._p));
  const knot = generateKnot(mixed);
  genOk = genOk && knot.length === 3 && knot.every(r => Number.isFinite(r._p));
} catch (e) { genOk = false; console.error('  (generateSegment threw:', e.message, ')'); }
ok(genOk, 'generateSegment + generateKnot run clean on a mixed-face hand (3 distinct colours, finite reach)');

console.log(`\nface probe: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
