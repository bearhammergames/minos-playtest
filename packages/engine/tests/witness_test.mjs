// =============================================================================
// WITNESS TEST  (Modifier Stack §5b — the registry grammar + the pure scorer)
// -----------------------------------------------------------------------------
// Covers: validateWitness (closed vocab + L7 mult rule + M-2 priced-payload rule),
// the 16 starter set, rarity derivation lint (declared === derived, §10),
// generateWitness (seeded/valid-by-construction), and scoreWitnesses (id-blind
// event×filter×payload). A behaviour-neutral schema gate — NOT in KNOWN_FAIL.
// =============================================================================
import {
  WITNESSES, WITNESS_EVENTS, WITNESS_FILTER_KINDS, WITNESS_PAYLOAD_KINDS,
  WITNESS_SCALINGS, WITNESS_SLOTS, validateWitness, validateAll, lintAllRarity,
  witnessFeatures, generateWitness,
} from '../../content/witnesses.js';
import { deriveRarity } from '../../content/registry_fields.js';
import { scoreWitnesses } from '../witness.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  FAIL:', name); } };
const valid   = w => validateWitness(w).ok;
const invalid = w => !validateWitness(w).ok;

// ---- vocab census + the authored set ----
check('11 events',   WITNESS_EVENTS.length === 11);
check('13 filters',  WITNESS_FILTER_KINDS.length === 13);   // +rolls_left/fang/purity (Slice 2)
check('9 payloads',  WITNESS_PAYLOAD_KINDS.length === 9);
check('4 scalings',  WITNESS_SCALINGS.length === 4);
check('5 slots',     WITNESS_SLOTS.length === 5);
check('20 starter witnesses', Object.keys(WITNESSES).length === 20);   // 16 − long_thread + 6 new (Slice 2) − clean_wrist (Slice 3, → spotless_one jackpot)
check('long_thread CUT', !WITNESSES.long_thread);
check('clean_wrist CONVERTED (→ spotless_one jackpot)', !WITNESSES.clean_wrist);
check('validateAll() ok (all valid)', validateAll().ok);

// ---- §10 rarity: declared === derived for every witness (lint) ----
check('lintAllRarity() ok (declared === derived)', lintAllRarity().ok);
for (const w of Object.values(WITNESSES)) {
  check(`rarity derives for ${w.id}`, deriveRarity(witnessFeatures(w)) === w.rarity);
}

// ---- out-of-vocabulary + structural rejections ----
const base = { id:'x', event:'on_resolve', filter:{kind:'none'}, payload:{kind:'flat', n:1}, scaling:'static', axis:'worth', rarity:'common' };
check('valid base', valid(base));
check('bad event rejected',   invalid({ ...base, event:'on_wound' }));
check('bad payload rejected',  invalid({ ...base, payload:{kind:'smite', n:1} }));
check('bad scaling rejected',  invalid({ ...base, scaling:'exploding' }));
check('bad axis rejected',     invalid({ ...base, axis:'chaos' }));
check('bad rarity rejected',   invalid({ ...base, rarity:'legendary' }));
check('flat needs n',          invalid({ ...base, payload:{kind:'flat'} }));
check('per needs unit+n',      invalid({ ...base, payload:{kind:'per', per:'nope', n:1} }));
check('spin filter needs eq/max', invalid({ ...base, filter:{kind:'spin'} }));
check('chain filter needs dir',   invalid({ ...base, filter:{kind:'chain'} }));

// ---- Law L7: ×mult is mythic-only, never per-resolve ----
check('mult on non-mythic rejected', invalid({ ...base, event:'on_snap', payload:{kind:'mult', x:2}, rarity:'rare' }));
check('mult on per-resolve rejected', invalid({ ...base, event:'on_resolve', payload:{kind:'mult', x:2}, rarity:'mythic' }));
check('mult on on_snap + mythic ok',  valid({ ...base, event:'on_snap', payload:{kind:'mult', x:2}, rarity:'mythic', conditioned:false }));

// ---- M-2: a reach/tempo payload must acknowledge its price (priced:true or rider) ----
check('unpriced reach rejected', invalid({ ...base, axis:'reach', rarity:'uncommon', payload:{kind:'reach', n:1} }));
check('priced reach ok',         valid({ ...base, axis:'reach', rarity:'uncommon', payload:{kind:'reach', n:1}, priced:true }));
check('drawWidth needs no price', valid({ ...base, rarity:'common', payload:{kind:'drawWidth', n:1} }));

// ---- generateWitness: seeded, valid-by-construction, filterable ----
let seed = 12345;
const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
for (let i = 0; i < 40; i++) check(`generateWitness #${i} valid`, valid(generateWitness(rng)));
check('generateWitness axis filter', ['worth'].includes(generateWitness(rng, { axis:'worth' }).axis));

// ---- scoreWitnesses: id-blind event × filter × payload ----
const loadout = Object.values(WITNESSES);
// patient_needle fires on_stop_early → +4
check('patient_needle → +4', scoreWitnesses([WITNESSES.patient_needle], 'on_stop_early', {}).delta === 4);
// gamblers_vein: spin==3 → +6, spin==2 → 0
check('gamblers_vein spin3 → +6', scoreWitnesses([WITNESSES.gamblers_vein], 'on_resolve', { spin:3 }).delta === 6);
check('gamblers_vein spin2 → 0',  scoreWitnesses([WITNESSES.gamblers_vein], 'on_resolve', { spin:2 }).delta === 0);
// thousand_cuts: +1 per distinct symbol
check('thousand_cuts 3 symbols → +3', scoreWitnesses([WITNESSES.thousand_cuts], 'on_resolve', { distinctSymbols:3 }).delta === 3);
// miser_eye: tier floor only
check('miser_eye floor → +3',  scoreWitnesses([WITNESSES.miser_eye], 'on_resolve', { tier:'floor' }).delta === 3);
check('miser_eye bloom → 0',   scoreWitnesses([WITNESSES.miser_eye], 'on_resolve', { tier:'bloom' }).delta === 0);
// event mismatch fires nothing
check('event mismatch → 0', scoreWitnesses([WITNESSES.patient_needle], 'on_resolve', {}).delta === 0);
// reach/drawWidth payloads score 0 but surface as effects
const bloomRes = scoreWitnesses([WITNESSES.bloomkeeper], 'on_bloom', {});
check('bloomkeeper reach → delta 0', bloomRes.delta === 0);
check('bloomkeeper reach → effect', bloomRes.effects.length === 1 && bloomRes.effects[0].kind === 'reach');
const twinRes = scoreWitnesses([WITNESSES.twin_needle], 'on_resolve', { metCount:2 });
check('twin_needle rungs>=2 → drawWidth effect', twinRes.effects.length === 1 && twinRes.effects[0].kind === 'drawWidth');
check('twin_needle rungs<2 → nothing', scoreWitnesses([WITNESSES.twin_needle], 'on_resolve', { metCount:1 }).fired === 0);

// ---- §4.3 the four new filter kinds — each a firing case + a non-firing case ----
// the_edge: rolls_left eq 0 (rode the wire)
check('the_edge 0 spins → +5',      scoreWitnesses([WITNESSES.the_edge], 'on_resolve', { rollsLeft:0 }).delta === 5);
check('the_edge spins left → 0',    scoreWitnesses([WITNESSES.the_edge], 'on_resolve', { rollsLeft:2 }).delta === 0);
check('the_edge absent ctx → 0',    scoreWitnesses([WITNESSES.the_edge], 'on_resolve', {}).delta === 0);
// fang_dancer: a kept fang that was NOT load-bearing
check('fang_dancer free fang → +4', scoreWitnesses([WITNESSES.fang_dancer], 'on_resolve', { fangsKept:1, fangLoadBearing:false }).delta === 4);
check('fang_dancer load-bearing → 0', scoreWitnesses([WITNESSES.fang_dancer], 'on_resolve', { fangsKept:1, fangLoadBearing:true }).delta === 0);
check('fang_dancer no fang → 0',    scoreWitnesses([WITNESSES.fang_dancer], 'on_resolve', { fangsKept:0 }).delta === 0);
// loyalist family: colour eq (growing → base ×1 on first fire)
check('bodybound body → +2',        scoreWitnesses([WITNESSES.bodybound], 'on_resolve', { colour:'body' }).delta === 2);
check('bodybound mind → 0',         scoreWitnesses([WITNESSES.bodybound], 'on_resolve', { colour:'mind' }).delta === 0);
check('spiritbound spirit → +2',    scoreWitnesses([WITNESSES.spiritbound], 'on_resolve', { colour:'spirit' }).delta === 2);
// the_purist: pure keep (growing → base ×1 on first fire)
check('the_purist pure → +3',       scoreWitnesses([WITNESSES.the_purist], 'on_resolve', { keptPure:true }).delta === 3);
check('the_purist impure → 0',      scoreWitnesses([WITNESSES.the_purist], 'on_resolve', { keptPure:false }).delta === 0);
// growing scaling advances via caller-maintained growStacks (bodybound: 2nd fire → base ×2)
check('bodybound grows with stacks', scoreWitnesses([WITNESSES.bodybound], 'on_resolve', { colour:'body', growStacks:{ bodybound:1 } }).delta === 4);
// per-witness hits breakdown (loud firing + per-id tallies, §4.2)
const hitRes = scoreWitnesses([WITNESSES.gamblers_vein, WITNESSES.the_edge], 'on_resolve', { spin:3, rollsLeft:0 });
check('hits breakdown per witness', hitRes.hits.length === 2 && hitRes.hits.find(h => h.id === 'gamblers_vein').delta === 6 && hitRes.hits.find(h => h.id === 'the_edge').delta === 5);
// a full loadout on on_resolve never throws and returns a number
check('full loadout scores a number', typeof scoreWitnesses(loadout, 'on_resolve', { colour:'body', tier:'true', spin:1, distinctSymbols:2 }).delta === 'number');
// id-blindness: two witnesses with identical grammar, different id, score identically
const a = { ...base, id:'alpha', payload:{kind:'flat', n:7} };
const b = { ...base, id:'beta',  payload:{kind:'flat', n:7} };
check('id-blind scorer', scoreWitnesses([a], 'on_resolve', {}).delta === scoreWitnesses([b], 'on_resolve', {}).delta);

console.log(`\nwitness: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
