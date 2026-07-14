// ritual_enforcement_test.mjs — the SURFACE enforcement of the ritual warps. The pure
// dispatch (engine/ritual.js) is covered by ritual_test.mjs; this proves agent_cli actually
// ENFORCES forcedKeep / rerollOnRoll at the spin (the gap that was "dispatch present,
// enforcement not"). Drives the real CLI over the protocol via spawnSync (deterministic).
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const CLI = fileURLToPath(new URL('../agent_cli.mjs', import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };

// run a scripted session; return the parsed JSON-lines (hello first, then one per action).
function run(args, actions){
  const r = spawnSync('node', [CLI, ...args], { input: actions.map(a => JSON.stringify(a)).join('\n') + '\n', encoding: 'utf8' });
  return (r.stdout || '').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
}
const SEEDS = [1000, 8919, 24757, 32676, 48514, 64352];

// forcedKeep INVARIANT: under forcedKeep:mana, after any spin NO loose mana remains (every
// rolled mana auto-locks). Non-vacuous: at least one mana is force-kept across the seeds.
{
  let forcedSeen = 0, looseMana = 0;
  for (const seed of SEEDS){
    for (const l of run(['--warp', 'forcedKeep:mana', '--seed', String(seed)], [{ type:'spin' }, { type:'spin' }, { type:'state' }])){
      const tray = l.state && l.state.tray; if (!tray) continue;
      for (const t of tray) if (t.symbol === 'mana'){ if (t.kept){ if (t.forced) forcedSeen++; } else if (!t.locked) looseMana++; }
    }
  }
  ok(looseMana === 0, `forcedKeep: no loose mana survived a spin (violations=${looseMana})`);
  ok(forcedSeen > 0, `forcedKeep: mana was force-kept across seeds (seen=${forcedSeen})`);
}

// forced keeps do NOT consume the manual keepCap budget: under forcedKeep:mana + keepCap:2,
// manual keeps are still offered after a spin that force-kept a mana.
{
  const lines = run(['--warp', 'forcedKeep:mana,keepCap:2', '--seed', '1000'], [{ type:'spin' }, { type:'legal' }]);
  const legal = lines.find(x => x.legal);
  const keeps = legal ? legal.legal.filter(x => x.type === 'keep').length : 0;
  const forcedMana = (lines[1].state.tray || []).some(t => t.symbol === 'mana' && t.forced);
  ok(forcedMana, 'forcedKeep+keepCap: a mana still force-keeps under the cap');
  ok(keeps > 0, `forcedKeep+keepCap: manual keeps still offered (offered=${keeps})`);
}

// rerollOnRoll FIRES: under rerollOnRoll:mind:1, a mind reels and rerolls (across seeds).
{
  let fired = 0;
  for (const seed of SEEDS)
    for (const l of run(['--warp', 'rerollOnRoll:mind:1', '--seed', String(seed)], [{ type:'spin' }]))
      if (l.events) for (const e of l.events) if (/rerollOnRoll/.test(e)) fired++;
  ok(fired > 0, `rerollOnRoll: a mind reeled and rerolled across seeds (fired=${fired})`);
}

// NEUTRALITY: with no forcedKeep/rerollOnRoll warp active, no die is ever `forced`.
{
  let anyForced = 0;
  for (const l of run(['--seed', '1000'], [{ type:'spin' }, { type:'spin' }, { type:'state' }])){
    const tray = l.state && l.state.tray; if (tray) for (const t of tray) if (t.forced) anyForced++;
  }
  ok(anyForced === 0, `neutral: no forced keeps without a warp (saw=${anyForced})`);
}

console.log(`\nritual_enforcement: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
