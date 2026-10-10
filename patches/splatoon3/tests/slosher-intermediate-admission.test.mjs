import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Vector3} from '../../../inkwave-public/vendor/three/build/three.module.js';
import {installSlosherIntermediatePaint} from '../runtime/slosher-intermediate-paint.mjs';
const profile=JSON.parse(fs.readFileSync(new URL('../profile.json',import.meta.url)));
const unit=profile.weaponsFidelityCompletion.weapons.slosher.UnitGroupParam.Unit[2];
function rig({ground=true,remote=false,ghost=false,terminal=null}={}) {
 const stamps=[], probes=[];
 class Hit { constructor(){this.point=new Vector3();this.normal=new Vector3(0,1,0);this.hit=false;} }
 class Projectiles {
  _new(){ const p=this.recycled||{}; p.pos=new Vector3(0,2,0);p.prev=p.pos.clone();return p; }
  _step(p){p.prev.copy(p.pos);p.pos.x+=terminal===null?.7:1.4;if(terminal!==null)this.s3PaintSlosherSegment?.(p,p.prev,new Vector3(terminal,2,0));return terminal!==null;}
 }
 const G={physics:{raycast(p,d,n,h){probes.push(p.clone());h.hit=typeof ground==='function'?ground():ground;h.point.set(p.x,0,p.z);return h;}},paint:{splat(p,r,t,o){stamps.push({p:p.clone(),r,t,o});return 1;}}};
 installSlosherIntermediatePaint({Projectiles,G,THREE:{Vector3},Hit},profile);
 const system=new Projectiles();
 const fill=p=>Object.assign(p,{type:'slosh',fidelitySloshUnit:unit,fidelitySloshIndex:3,seed:.5,vel:new Vector3(1,0,0),owner:{remote,addTurf(){}},ghost,team:0,trailEvery:1});
 const p=fill(system._new());
 return {system,p,fill,stamps,probes};
}
test('Slosher source depth scale 2 is a 2x foreground stretch, not 3x',()=>{
 const r=rig();r.system._step(r.p);r.system._step(r.p);
 assert.equal(r.stamps.length,1);assert.equal(r.stamps[0].r,.7);assert.equal(r.stamps[0].o.stretchAmt,1);
});
test('Slosher source one-shot slot is consumed when its fixed probe misses',()=>{
 let grounded=false;const r=rig({ground:()=>grounded});r.system._step(r.p);r.system._step(r.p);grounded=true;r.system._step(r.p);
 assert.equal(r.probes.length,1);assert.equal(r.stamps.length,0);
});
test('Slosher pool reuse resets scheduling even if the next glob has the same seed',()=>{
 const r=rig();r.system._step(r.p);r.system._step(r.p);assert.equal(r.stamps.length,1);
 r.system.recycled=r.p;const p=r.fill(r.system._new());r.system._step(p);r.system._step(p);
 assert.equal(r.stamps.length,2);
});
test('Slosher intermediate paint rejects remote owners and ghosts',()=>{
 for(const flags of [{remote:true},{ghost:true}]){const r=rig(flags);r.system._step(r.p);r.system._step(r.p);assert.equal(r.stamps.length,0);}
});
test('Slosher terminating segments admit a source slot only before their clipped stop',()=>{
 for(const [terminal,count] of [[1.3,1],[1.1,0]]){const r=rig({terminal});r.system._step(r.p);assert.equal(r.stamps.length,count);if(count)assert.ok(Math.abs(r.stamps[0].p.x-1.2)<1e-9);}
});

import {fixture} from '../../../scripts/weapons-fixture.mjs';
async function live(stop=null) {
 const f=await fixture({fidelity:true});installSlosherIntermediatePaint(f,f.profile);
 const a=f.make('slosher');f.projectiles.fireSlosh(a,a.weapon);
 const p=f.projectiles.list.find(p=>p.fidelitySloshUnit.BulletNum===5&&p.fidelitySloshIndex===3);
 p._s3SloshBirthPending=false;p.delay=0;p.seed=.5;p.pos.set(0,1.05,.3);p.prev.copy(p.pos);p.start.copy(p.pos);p.vel.set(0,0,84);p.straight=1;
 if(stop!==null)f.wall(stop,{height:5});
 return {f,p};
}
test('native composed Slosher solver paints before terminal wall, never after it',async()=>{
 for(const [wall,count] of [[1.7,1],[1.5,0]]){
  const {f,p}=await live(wall);const dead=f.projectiles._step(p,1/60);
  assert.ok(p.pos.z<wall, "live projectile was clipped before the wall");const samples=f.paints.filter(p=>Math.abs(p.radius-.7)<1e-9);
  assert.equal(samples.length,count);if(count){assert.ok(Math.abs(samples[0].center[2]-1.5)<1e-9);assert.equal(samples[0].stretchAmt,1);}
 }
});
test('native Slosher source slot trace is stable at 30, 60 and 120 Hz rendering',async()=>{
 const traces=[];
 for(const hz of [30,60,120]){
  const f=await fixture({fidelity:true});installSlosherIntermediatePaint(f,f.profile);
  const a=f.make('slosher');f.projectiles.fireSlosh(a,a.weapon);const clock=new f.FixedClock();
  for(let i=0;i<hz;i++)clock.advance(1/hz,dt=>f.projectiles.update(dt));
  traces.push(JSON.parse(JSON.stringify(f.paints.filter(p=>Math.abs(p.radius-.7)<1e-9).map(p=>[p.center,p.radius,p.stretchAmt]))));
 }
 assert.equal(traces[0].length,1);assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});

test('native actor-terminal segment retains the scheduled splash before capsule contact',async()=>{
 for(const [z,count] of [[2,1],[1.8,0]]) {
  const {f,p}=await live();const enemy=f.make('shooter',{team:1,z});f.G.actors=[p.owner,enemy];
  assert.equal(f.projectiles._step(p,1/60),true);
  assert.equal(f.paints.filter(p=>Math.abs(p.radius-.7)<1e-9).length,count);
 }
});
