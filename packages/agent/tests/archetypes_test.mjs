// archetypes_test.mjs — PURE unit test of the archetype policy (archetypes.mjs). No
// engine, no spawn: it feeds crafted protocol-shaped states to the decision functions
// and asserts the build identities behave. Determinism is the point — same state ⇒ same
// move — so these are exact assertions. (Discovered by scripts/run_tests.mjs.)
import {
  ARCHETYPES, KNOT_KNOBS, needFor, totalNeed,
  chooseTarget, chooseKeep, decideStop, choosePerk,
} from '../archetypes.mjs';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log(`FAIL ${msg}`); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

// --- shared rung fixtures (tier/colour/value/req/reach_estimate, as serialized) -------
const R = {
  floor: { tier: 'floor', colour: 'spirit', value: 1, req: { spirit: 2, mind: 1 }, reach_estimate: 0.61 },
  true:  { tier: 'true',  colour: 'body',   value: 3, req: { body: 3, mind: 1 },   reach_estimate: 0.48 },
  bloom: { tier: 'bloom', colour: 'mind',   value: 6, req: { mind: 3, body: 1, mana: 1 }, reach_estimate: 0.23 },
};
const rungs3 = [R.floor, R.true, R.bloom];
const die = (i, symbol, { mag = 1, kept = false, locked = false } = {}) => ({ i, symbol, mag, kept, locked });
const blanks = (from, to) => Array.from({ length: to - from }, (_, k) => die(from + k, 'blank'));

// ===== needFor / totalNeed ===========================================================
eq(needFor(R.true, []), { body: 3, mind: 1 }, 'needFor: nothing kept = full req');
{
  const tray = [die(0, 'body', { kept: true }), die(1, 'body', { kept: true })];
  eq(needFor(R.true, tray), { body: 1, mind: 1 }, 'needFor: two kept body reduce body need');
}
{
  const tray = [die(0, 'fang', { kept: true }), die(1, 'body', { kept: true })];
  // fang fills the largest hole (body 3→2 after the kept body → 3? order: body kept first? map order) —
  eq(totalNeed(needFor(R.true, tray)), 2, 'needFor: kept body + kept fang leave 2 pips of need');
}

// ===== chooseTarget: identity + pivot + salvage ======================================
{
  const st = { rungs: rungs3, tray: blanks(0, 6), rollsLeft: 3, thread: { chain: null, liveBloomColours: [] } };
  eq(chooseTarget(st, ARCHETYPES.miser).tier, 'floor', 'Miser targets the Floor rung');
  eq(chooseTarget(st, ARCHETYPES.zealot).tier, 'bloom', 'Zealot targets the Bloom rung');
}
{
  // Monk chases the CHAIN colour's rung (body chain → the True(body) rung)
  const st = { rungs: rungs3, tray: blanks(0, 6), rollsLeft: 3, thread: { chain: 'body', liveBloomColours: [] } };
  eq(chooseTarget(st, ARCHETYPES.monk).colour, 'body', 'Monk targets the chain-colour rung');
}
{
  // Weaver rotates OFF the chain (chain body → prefers a non-body rung)
  const st = { rungs: rungs3, tray: blanks(0, 6), rollsLeft: 3, thread: { chain: 'body', liveBloomColours: [] } };
  ok(chooseTarget(st, ARCHETYPES.weaver).colour !== 'body', 'Weaver rotates off the chain colour');
}
{
  // PIVOT: reach mode + a mind flood (3 mind + 1 body kept) makes Bloom the CLOSEST rung
  // (rem 1) — it pivots to Bloom though Bloom has the LOWEST reach_estimate. This is the
  // exact move the inaugural report's fixed pre-spin directive could not make.
  const tray = [die(0, 'mind', { kept: true }), die(1, 'mind', { kept: true }), die(2, 'mind', { kept: true }), die(3, 'body', { kept: true }), die(4, 'blank'), die(5, 'blank')];
  const st = { rungs: rungs3, tray, rollsLeft: 2, thread: { chain: null, liveBloomColours: [] } };
  eq(chooseTarget(st, ARCHETYPES.tempoist).tier, 'bloom', 'reach mode PIVOTS to the closest rung (Bloom) on a mind flood');
}
{
  // SALVAGE: Zealot wants Bloom, but with 1 spin left and only Floor reachable (kept
  // 2 spirit → Floor rem 1), it salvages to Floor rather than a guaranteed snap.
  const tray = [die(0, 'spirit', { kept: true }), die(1, 'spirit', { kept: true }), die(2, 'blank'), die(3, 'blank'), die(4, 'blank'), die(5, 'blank')];
  const st = { rungs: rungs3, tray, rollsLeft: 1, thread: { chain: null, liveBloomColours: [] } };
  eq(chooseTarget(st, ARCHETYPES.zealot).tier, 'floor', 'Zealot salvages to a reachable rung when Bloom is out of reach');
}
{
  // Knot: prefer a rung matching a live bloom colour (the TIGHT bonus)
  const knotR = [{ tier: 'knot', colour: 'body', value: 0, req: { body: 3 }, reach_estimate: 0.5 },
                 { tier: 'knot', colour: 'mind', value: 0, req: { mind: 3 }, reach_estimate: 0.5 }];
  const st = { rungs: knotR, tray: blanks(0, 6), rollsLeft: 3, thread: { chain: null, liveBloomColours: ['mind'] } };
  eq(chooseTarget(st, KNOT_KNOBS).colour, 'mind', 'Knot targets the live-bloom colour (tight)');
}

// ===== chooseKeep: fang policy + multi ===============================================
{
  const tray = [die(0, 'fang'), die(1, 'body'), ...blanks(2, 6)];
  const base = { rungs: [R.true], tray, rollsLeft: 2 };
  eq(chooseKeep(base, R.true, ARCHETYPES.monk, [0, 1]), 1, 'refuse: skips the fang, keeps the needed body');
  eq(chooseKeep(base, R.true, ARCHETYPES.debtor, [0, 1]), 0, 'early (Debtor): banks the fang to fill the hole');
  eq(chooseKeep(base, R.true, ARCHETYPES.zealot, [0, 1]), 1, 'lastResort: refuses the fang while spins remain');
  eq(chooseKeep({ ...base, rollsLeft: 0 }, R.true, ARCHETYPES.zealot, [0, 1]), 0, 'lastResort: takes the fang on the last spin (corrupt-vs-dead)');
}
{
  // multi (Glutton): keeps a die that helps ANY rung; skips one that helps none
  const rungs = [{ tier: 'floor', colour: 'spirit', value: 1, req: { spirit: 2 }, reach_estimate: 0.6 },
                 { tier: 'true',  colour: 'body',   value: 3, req: { body: 2 },   reach_estimate: 0.4 }];
  const tray = [die(0, 'charm'), die(1, 'body'), ...blanks(2, 6)];
  const st = { rungs, tray, rollsLeft: 2 };
  const target = chooseTarget(st, ARCHETYPES.glutton);
  eq(chooseKeep(st, target, ARCHETYPES.glutton, [0, 1]), 1, 'multi: keeps the body (helps a rung), skips the charm (helps none)');
}

// ===== decideStop: the stop-is-the-choice divergence =================================
{
  const met = c => ({ metNow: c, rollsLeft: 2 });
  eq(decideStop(met([{ tier: 'floor', colour: 'spirit' }]), R.floor, ARCHETYPES.miser), true, 'early: banks the instant anything lights');
  eq(decideStop(met([]), R.floor, ARCHETYPES.miser), false, 'early: nothing lit yet → spin on');
  eq(decideStop(met([{ tier: 'true', colour: 'body' }]), R.true, ARCHETYPES.tempoist), true, 'target: resolves when the target lights');
  eq(decideStop(met([{ tier: 'floor', colour: 'spirit' }]), R.true, ARCHETYPES.tempoist), false, 'target: an off-target light does not stop it');
  eq(decideStop(met([{ tier: 'true', colour: 'body' }]), R.bloom, ARCHETYPES.zealot), false, 'push (Zealot): keeps pushing until the Bloom lights');
  eq(decideStop(met([{ tier: 'bloom', colour: 'mind' }]), R.bloom, ARCHETYPES.zealot), true, 'push (Zealot): stops when the Bloom finally lights');
  eq(decideStop({ metNow: [{ tier: 'floor', colour: 'spirit' }], rollsLeft: 0 }, R.bloom, ARCHETYPES.zealot), true, 'push: the last spin always resolves');
  eq(decideStop(met([{ tier: 'floor', colour: 'spirit' }]), R.floor, ARCHETYPES.glutton), false, 'multi (Glutton): one rung is not enough');
  eq(decideStop(met([{ tier: 'floor', colour: 'spirit' }, { tier: 'true', colour: 'body' }]), R.floor, ARCHETYPES.glutton), true, 'multi (Glutton): stops on the double completion');
}

// ===== choosePerk: draft by identity =================================================
{
  const curseOnly = { perkOffer: [{ card: 0, id: 'grasping', kind: 'curse' }] };
  eq(choosePerk(curseOnly, ARCHETYPES.debtor).card, 0, 'forced curse: takes the only card');
}
{
  const offer = { perkOffer: [
    { card: 0, id: 'glimmer', kind: 'blessing', rarity: 'common',  blemished: false },
    { card: 1, id: 'deepen',  kind: 'blessing', rarity: 'rare',    blemished: true, rider: { band: 'harsh', name: 'x' } },
  ] };
  eq(choosePerk(offer, ARCHETYPES.monk).card, 1, 'Monk drafts Deepen (reach/depth) over Glimmer');
  eq(choosePerk(offer, ARCHETYPES.miser).card, 0, 'Miser drafts the clean worth card, shuns the blemish');
  eq(choosePerk(offer, ARCHETYPES.debtor).card, 1, 'Debtor drafts the blemished rider card (embraces the debt)');
}

console.log(`\narchetypes_test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
