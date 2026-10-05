#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './weapons-fixture.mjs';
import { CASES, reset, launch, measure } from './measure-weapons-fidelity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = process.argv.indexOf('--site');
const site = path.resolve(at >= 0 ? process.argv[at + 1] : path.join(root, '_site'));
const near = (a,b,t=1e-7) => assert.ok(Math.abs(a-b) <= t, `${a} != ${b} ±${t}`);

const data = await measure({ site, fidelity: true, detail: false });
const golden = {
  shooter:[12.6,12.2,13.125,1],
  'dualies-normal':[12.3,11.5,12.625,1],
  'dualies-post':[12.3,11.5,12.625,1],
  blaster:[13.5,10.8,11.875,1],
  'splatling-partial':[14.1,13.5,14.875,1],
  'splatling-first':[19.4,18.6,20.125,1],
  'splatling-full':[19.4,18.6,20.125,1],
  'charger-0':[9.8,9.8,13.375,0],
  'charger-0.25':[13.5,13.5,16.375,0],
  'charger-0.5':[17.3,17.3,20.125,0],
  'charger-0.75':[21.0,21.0,23.625,0],
  'charger-1':[24.8,24.8,26.625,0],
  'roller-horizontal':[11.2,6.1,13.375,13],
  'roller-vertical':[16.4,6.8,15.875,5],
  slosher:[13.9,13.9,15.375,9],
};
for (const [key,[hit,full,paint,count]] of Object.entries(golden)) {
  const c = data.cases[key];
  near(c.practicalHitRange,hit); near(c.fullDamageRange,full);
  near(c.paint.bounds.maxZ,paint,.001); assert.equal(c.projectileCount,count,key);
}
assert.equal(data.runner.blaster.shots,4);
for (const interval of data.runner.blaster.intervals) near(interval,50/60,1e-7);
assert.equal(data.runner['splatling-full'].shots,40);
near(data.runner['splatling-full'].inkSpent,22.5);
near(data.runner['charger-1'].inkSpent,18);

// Existing packet format must carry enough information for the remote trajectory;
// do not add a new packet field just for vertical/horizontal roller mode.
for (const key of ['shooter','roller-horizontal','roller-vertical']) {
  const c = CASES.find(x => x.key === key);
  const f = await fixture({ site, fidelity:true, floor:false, network:true });
  const a = reset(f,c); a.nid=42; const packets=[];
  const network={mute:0,_rec:e=>packets.push([0,...e]),recProj:f.NetMatch.prototype.recProj,recSplat(){},shouldApplyHit:f.NetMatch.prototype.shouldApplyHit};
  f.G.netm=network; launch(f,a,c); const locals=[...f.projectiles.list];
  assert.equal(packets.length,locals.length,key);
  assert.equal(packets.every(p=>p.length===27),true,key+' packet shape');
  const ghost=f.make(c.id,{name:'remote'}); ghost.remote=true; f.projectiles.list.length=0;
  packets.forEach(e=>f.projectiles.ghostProjectile(ghost,e)); const ghosts=[...f.projectiles.list];
  assert.equal(ghosts.length,locals.length,key);
  for(let i=0;i<locals.length;i++){
    const p=locals[i],q=ghosts[i];
    assert.equal(q.fidelityMode,p.fidelityMode,key);
    if (key.startsWith('roller-')) {
      near(q.fidelityPlayerCollision.initRadius,p.fidelityPlayerCollision.initRadius,1e-9);
      near(q.fidelityPlayerCollision.endRadius,p.fidelityPlayerCollision.endRadius,1e-9);
      near(q.fidelityPlayerCollision.changeTime,p.fidelityPlayerCollision.changeTime,1e-9);
    }
    near(q.straight,p.straight,.00051); near(q.life,p.life,.00051);
    for(let step=0;step<20;step++){
      f.advanceFidelityProjectile(p,1/60); f.advanceFidelityProjectile(q,1/60);
      assert.ok(p.pos.distanceTo(q.pos)<.012,`${key} remote drift ${p.pos.distanceTo(q.pos)}`);
    }
    assert.equal(q.damage,0,key+' ghost damage');
  }
}
console.log(JSON.stringify({status:'passed',contentHash:data.artifactIdentity.contentHash,cases:Object.keys(golden).length,networkModes:3,completion:'finite-charger-continuous-collision'}));
