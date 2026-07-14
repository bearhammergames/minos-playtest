// Unit test for the enchantment vocabulary + validateEnchantment (L0).
// Run: node registry/_enchantments_test.mjs   (exit 0 = pass)
import {
  validateEnchantment, validateAll, ENCHANTMENTS,
  ENCH_TRIGGERS, ENCH_CONDITION_KINDS, ENCH_STATES,
  ENCH_SCOPES, ENCH_EFFECTS, ENCH_POLARITIES, ENCH_LIFETIMES,
} from '../enchantments.js';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; } else { fail++; console.error('  FAIL:', name); } }
const valid = (e) => validateEnchantment(e).ok;
const invalid = (e) => !validateEnchantment(e).ok;

// ---- closed-set sizes (vocabulary census, spec §10.5) ----
check('5 triggers',    ENCH_TRIGGERS.length === 5);
check('3 conditions',  ENCH_CONDITION_KINDS.length === 3);
check('4 scopes',      ENCH_SCOPES.length === 4);
check('9 effects',     ENCH_EFFECTS.length === 9);
check('2 polarities',  ENCH_POLARITIES.length === 2);
check('3 lifetimes',   ENCH_LIFETIMES.length === 3);
check('3 states',      ENCH_STATES.length === 3);

// ---- the spec §9 worked examples must all validate ----
const WORKED = [
  { id:'ashward_tooth',  trigger:'on_roll',    condition:{kind:'adjacency', symbol:'fang'}, scope:'self',     effect:'convert', polarity:'boon', forced:false, params:{to:'need'} },
  { id:'the_last_gift',  trigger:'on_wound',   condition:null,                              scope:'adjacent', effect:'deepen',  polarity:'boon', forced:true,  params:{pips:1} },
  { id:'creeping_rot',   trigger:'on_wound',   condition:null,                              scope:'adjacent', effect:'erode',   polarity:'bane', forced:true,  params:{pips:1} },
  { id:'gluttons_bite',  trigger:'on_keep',    condition:{kind:'total', symbol:'body', n:3},scope:'self',     effect:'lock',    polarity:'bane', forced:true },
  { id:'restless_bone',  trigger:'on_roll',    condition:null,                              scope:'adjacent', effect:'reroll',  polarity:'bane', forced:true },
  { id:'the_open_hand',  trigger:'on_keep',    condition:null,                              scope:'chosen',   effect:'release', polarity:'boon', forced:false },
  { id:'renderers_mark', trigger:'on_resolve', condition:null,                              scope:'self',     effect:'render',  polarity:'boon', forced:false, params:{to:'fuel'} },
  { id:'the_grudge',     trigger:'on_roll',    condition:null,                              scope:'self',     effect:'render',  polarity:'bane', forced:true,  params:{to:'pact'} },
  { id:'carrion_vow',    trigger:'on_wound',   condition:{kind:'state', state:'pact_charged'}, scope:'self',  effect:'ward',    polarity:'boon', forced:true },
  { id:'hollow_mirror',  trigger:'on_resolve', condition:null,                              scope:'self',     effect:'erode',   polarity:'bane', forced:true,  params:{pips:1} },
];
WORKED.forEach(e => check(`spec §9 valid: ${e.id}`, valid(e)));

// a stage-lifetime stage-curse (Staged spec §3.3) must validate
check('stage lifetime valid', valid({ id:'smoldering_mark', trigger:'on_keep', condition:null, scope:'self', effect:'expose', polarity:'bane', forced:true, lifetime:'stage' }));

// ---- out-of-vocabulary entries must be rejected (L0) ----
const base = { id:'x', trigger:'on_roll', condition:null, scope:'self', effect:'convert', polarity:'boon', forced:false, params:{to:'need'} };
check('bad trigger rejected',   invalid({ ...base, trigger:'on_settle' }));
check('bad scope rejected',     invalid({ ...base, scope:'everything' }));
check('bad effect rejected',    invalid({ ...base, effect:'smite' }));
check('bad polarity rejected',  invalid({ ...base, polarity:'neutral' }));
check('bad lifetime rejected',  invalid({ ...base, lifetime:'forever' }));
check('non-bool forced rejected', invalid({ ...base, forced:'yes' }));
check('missing id rejected',    invalid({ ...base, id:'' }));

// ---- condition structural rules ----
check('bad condition kind rejected', invalid({ ...base, condition:{ kind:'mood' } }));
check('adjacency needs symbol',      invalid({ ...base, condition:{ kind:'adjacency' } }));
check('total needs symbol+n',        invalid({ ...base, condition:{ kind:'total', symbol:'body' } }));
check('total n>0',                   invalid({ ...base, condition:{ kind:'total', symbol:'body', n:0 } }));
check('bad state rejected',          invalid({ ...base, condition:{ kind:'state', state:'haunted' } }));
check('good state accepted',         valid({   ...base, condition:{ kind:'state', state:'wounded' } }));

// ---- §2.3 cross-field rule: chosen requires forced:false ----
check('chosen+forced:true rejected', invalid({ ...base, scope:'chosen', forced:true }));
check('chosen+forced:false ok',      valid({   ...base, scope:'chosen', forced:false }));

// ---- PHASE 7: the migrated transformer relics, authored as composed grammar rows ----
check('validateAll() ok (authored registry)', validateAll().ok);
const MIGRATED = ['open_hand','renderers_mark','bone_carver','the_whetstone'];
MIGRATED.forEach(id => check(`migrated relic authored + valid: ${id}`, !!ENCHANTMENTS[id] && valid(ENCHANTMENTS[id])));
check('open_hand = on_keep/chosen/release (forced:false)',
  ENCHANTMENTS.open_hand.trigger==='on_keep' && ENCHANTMENTS.open_hand.scope==='chosen' && ENCHANTMENTS.open_hand.effect==='release' && ENCHANTMENTS.open_hand.forced===false);
check('renderers_mark = on_resolve/self/render→fuel',
  ENCHANTMENTS.renderers_mark.trigger==='on_resolve' && ENCHANTMENTS.renderers_mark.scope==='self' && ENCHANTMENTS.renderers_mark.effect==='render' && ENCHANTMENTS.renderers_mark.params.to==='fuel');
check('bone_carver = on_resolve/chosen/convert→need',
  ENCHANTMENTS.bone_carver.trigger==='on_resolve' && ENCHANTMENTS.bone_carver.scope==='chosen' && ENCHANTMENTS.bone_carver.effect==='convert' && ENCHANTMENTS.bone_carver.params.to==='need');
check('the_whetstone = on_resolve/chosen/deepen(pips:1)',
  ENCHANTMENTS.the_whetstone.trigger==='on_resolve' && ENCHANTMENTS.the_whetstone.scope==='chosen' && ENCHANTMENTS.the_whetstone.effect==='deepen' && ENCHANTMENTS.the_whetstone.params.pips===1);

console.log(`\nenchantments validate: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
