// driver_ext.mjs — playtest EXTENSION driver for the deck-wave focus session.
// Same contract as packages/agent/driver.mjs (speaks ONLY the public JSON-lines
// protocol; deterministic replay from seed; pauses where the playbook has no
// decision yet) PLUS:
//   * PERK PHASE PAUSES: playbook "perks": [ {"args":{...}, "note":"..."} ] consumed
//     in encounter order; missing entry => pause printing the FULL offer + hand,
//     so face-economy / debt / bargain targeting is a deliberate, annotated pick.
//   * TRANSFORM PHASE: playbook "transforms": [ {"args":{...},"note":""} ] same pattern.
//   * per-segment directive flags: "tapSigils": true (tap raised sigils while pushing on),
//     "useWishReroll": true (spend the Generous One's free re-throw on a dead loose die).
// Stock limits kept on purpose (they are the known driver limits): directives are
// pre-spin and immutable; the driver auto-takes the Stitch on a would-be snap.
import { spawn } from 'child_process';
import { readFileSync } from 'fs';

const CLI = 'C:/BearHammerGames/scavengers Dark Harvest/SavageLight - Minos/packages/agent/agent_cli.mjs';
const pb = JSON.parse(readFileSync(process.argv[2] || 'playbook.json', 'utf8'));
const p = spawn('node', [CLI, '--seed', String(pb.seed)]);
let buf = ''; const q = [];
p.stdout.on('data', d => { buf += d; let nl;
  while ((nl = buf.indexOf('\n')) >= 0){ const l = buf.slice(0,nl); buf = buf.slice(nl+1); if (l.trim()) q.shift()?.(JSON.parse(l)); } });
const send = a => new Promise(res => { q.push(res); p.stdin.write(JSON.stringify(a) + '\n'); });
const log = [];
const first = await new Promise(res => q.push(res));
let st = first.state; log.push(...first.events);
let perkCursor = 0, transformCursor = 0;

const enchStr = e => `${e.polarity === 'bane' ? 'BANE' : 'boon'}:${e.effect}/${e.scope}@${e.trigger}${e.forced ? '!' : '?'}${e.pairId ? ` pair:${e.pairId}` : ''}`;
const handStr = () => (st.hand || []).map(d =>
  `d${d.die}[` + d.faces.map(f => `${f.face}:${f.symbol}${(f.mag||1) > 1 ? `(${f.mag})` : ''}${f.ench ? '{' + f.ench.map(enchStr).join(';') + '}' : ''}`).join(' ') + ']'
).join('\n        ');

function pause(reason){
  console.log('=== PAUSE:', reason, '===');
  console.log('LOG so far:'); log.forEach(e => console.log('  ', e));
  console.log('THREAD:', JSON.stringify({ length: st.thread.length, chain: st.thread.chain,
    colours: st.thread.colours, frayed: st.thread.frayed, corrupt: st.thread.corrupt,
    liveBloomColours: st.thread.liveBloomColours, curses: st.curses,
    bonuses: st.bonuses, stitchSaves: st.stitchSaves }));
  if (st.wish) console.log('WISH:', JSON.stringify(st.wish), 'PATRON:', JSON.stringify(st.patron));
  if (st.witnesses && st.witnesses.length) console.log('WITNESSES:', JSON.stringify(st.witnesses));
  if (st.rungs) console.log('RUNGS:', JSON.stringify(st.rungs, null, 1));
  if (st.hand) console.log('HAND:  ', handStr());
  if (st.phase === 'perk'){
    console.log('DRAW:', JSON.stringify(st.draw || null));
    console.log('PERK OFFER:', JSON.stringify(st.perkOffer, null, 1));
  }
  if (st.phase === 'transform') console.log('TRANSFORM OFFER:', JSON.stringify(st.transformOffer, null, 1));
  if (st.over){ console.log('SCORE:', st.score); console.log('LINES:', JSON.stringify(st.scoreLines));
    console.log('COMBOS:', JSON.stringify(st.combos)); console.log('KNOT:', JSON.stringify(st.knot)); }
  p.stdin.end(); process.exit(0);
}

async function playSpinPhase(directive){
  const rungs = st.rungs;
  let target;
  const pick = rs => rs.filter(r => r.req).sort((a,b)=>(b.reach_estimate||0)-(a.reach_estimate||0))[0];
  if (directive.target === 'tight')
    target = rungs.find(r => r.req && (st.thread.liveBloomColours||[]).includes(r.colour)) || pick(rungs);
  else if (['floor','true','bloom'].includes(directive.target))
    target = rungs.find(r => r.tier === directive.target && r.req) || pick(rungs);
  else if (directive.target === 'chain')
    target = rungs.find(r => r.req && r.colour === st.thread.chain) || rungs.find(r => r.tier === 'floor');
  else target = pick(rungs);

  let taps = 0;
  while (true){
    if (st.phase === 'stitch'){ const r = await send({ type:'stitch' }); log.push(...r.events); st = r.state; return; }
    if (st.phase !== 'segment' && st.phase !== 'knot') return;
    if (st.spinsTaken === 0){ const r = await send({ type:'spin' }); log.push(...r.events); st = r.state; continue; }
    const need = { ...target.req };
    for (const t of st.tray) if (t.kept && need[t.symbol]) need[t.symbol] = Math.max(0, need[t.symbol] - (t.mag||1));
    let kept1 = false;
    const lr = await send({ type:'legal' });
    for (const t of st.tray){
      if (t.kept || t.locked || t.symbol === 'blank') continue;
      if (t.symbol === 'fang'){
        const totalNeed = Object.values(need).reduce((a,v)=>a+Math.max(0,v),0);
        if (directive.keepFangs === 'lastResort'){
          if (!(st.rollsLeft === 0 && totalNeed > 0)) continue;   // corrupt-vs-dead insurance only
        } else if (!directive.keepFangs) continue;
      }
      else if ((need[t.symbol] || 0) <= 0) continue;
      if (lr.legal.some(x => x.type==='keep' && x.args?.i === t.i)){
        const r = await send({ type:'keep', i: t.i }); log.push(...r.events); st = r.state; kept1 = true; break;
      }
    }
    if (kept1) continue;
    const met = st.metNow || [];
    const targetMet = met.some(m => m.tier === target.tier && m.colour === target.colour);
    const anyMet = met.length > 0;
    const stop = directive.stopWhen === 'target' ? targetMet
               : directive.stopWhen === 'any'    ? anyMet
               : /* push */ (st.rollsLeft <= 0 || targetMet);
    if (!stop){
      // tap an opt-in sigil while pushing on (free; the boon half of a bargain lives here)
      if (directive.tapSigils && (st.sigils||[]).length && taps < 8){
        const sg = st.sigils[0];
        let act = { type:'sigil', di: sg.di };
        if (sg.chosen){
          const deadLoose = st.tray.filter(t => !t.kept && !t.locked && (sg.targets||[]).includes(t.i) && (need[t.symbol]||0) <= 0);
          const tgt = (deadLoose[0] || st.tray.find(t => (sg.targets||[]).includes(t.i)));
          if (!tgt) { taps = 8; continue; }
          act.target = tgt.i;
        }
        const r = await send(act); log.push(...r.events); st = r.state; taps++; continue;
      }
      if (directive.useWishReroll && st.wishReroll){
        const dead = st.tray.find(t => !t.kept && !t.locked && t.symbol !== 'blank' && (need[t.symbol]||0) <= 0 && (st.wishReroll.targets||[]).includes(t.i));
        if (dead){ const r = await send({ type:'wish_reroll', di: dead.i }); log.push(...r.events); st = r.state; continue; }
      }
      if (st.rollsLeft > 0){ const r = await send({ type:'spin' }); log.push(...r.events); st = r.state; continue; }
    }
    const r = await send({ type:'resolve' }); log.push(...r.events); st = r.state;
    if (st.phase === 'stitch'){ const r2 = await send({ type:'stitch' }); log.push(...r2.events); st = r2.state; }
    return;
  }
}

let guard = 0;
while (!st.over && guard++ < 3000){
  if (st.phase === 'perk'){
    const entry = (pb.perks || [])[perkCursor];
    if (!entry) pause(`perk pick #${perkCursor + 1} needs a decision (picksRemaining ${st.draw ? st.draw.picksRemaining : 1})`);
    perkCursor++;
    const r = await send({ type:'perk', ...entry.args }); log.push(...r.events);
    if (!r.ok){ console.log('PERK PICK FAILED:', r.error); pause('illegal perk pick — fix the playbook entry'); }
    st = r.state; continue;
  }
  if (st.phase === 'transform'){
    const entry = (pb.transforms || [])[transformCursor];
    if (!entry) pause(`transform #${transformCursor + 1} needs a decision`);
    transformCursor++;
    const r = await send({ type:'transform', ...entry.args }); log.push(...r.events);
    if (!r.ok){ console.log('TRANSFORM FAILED:', r.error); pause('illegal transform — fix the playbook entry'); }
    st = r.state; continue;
  }
  if (st.phase === 'segment'){
    const d = (pb.segments || [])[st.segIndex];
    if (!d) pause(`segment ${st.segIndex + 1} needs a directive`);
    await playSpinPhase(d); continue;
  }
  if (st.phase === 'knot'){
    if (!pb.knot) pause('the KNOT needs a directive');
    await playSpinPhase(pb.knot); continue;
  }
  if (st.phase === 'stitch'){ const r = await send({ type:'stitch' }); log.push(...r.events); st = r.state; continue; }
  break;
}
pause(st.over ? 'RUN COMPLETE' : 'guard tripped');
