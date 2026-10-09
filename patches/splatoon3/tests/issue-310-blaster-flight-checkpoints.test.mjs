import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../../scripts/weapons-fixture.mjs';
const near=(x,y,tolerance=1e-9)=>assert.ok(Math.abs(x-y)<tolerance,`${x} != ${y}`);
async function setup(){
 const f=await fixture({fidelity:true,floor:false}),a=f.make('blaster',{y:2});
 a.vel.set(0,0,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,3.05,1000);
 f.projectiles._aimFrom=(_a,_from,out)=>out.set(0,0,1);
 return {f,a};
}

test('#310 actual Blaster keeps 9 straight frames, then brakes and bursts at13F',async()=>{
 const {f,a}=await setup();f.projectiles.fireBlaster(a,a.weapon,0);
 const p=f.projectiles.list[0],start=p.pos.clone();near(p.vel.length()/60,.945);
 near(p.fidelityMove.endSpeed/60,.9131);near(p.fidelityMove.freeGravity/3600,.016);
 const bursts=[],native=f.projectiles._blastBurst;
 f.projectiles._blastBurst=function(...args){bursts.push({age:args[0].age,pos:args[1].clone()});return native.apply(this,args);};
 for(let frame=1;frame<=9;frame++){
  f.projectiles.update(1/60);assert.equal(p.fidelityPhase,0);near(p.vel.z/60,.945);
 }
 near(p.pos.z-start.z,8.505);assert.equal(bursts.length,0);
 f.projectiles.update(1/60);assert.equal(p.fidelityPhase,1);near(p.vel.z/60,.9131*.64);
 for(let frame=11;frame<=12;frame++)f.projectiles.update(1/60);
 assert.equal(bursts.length,0);f.projectiles.update(1/60);
 assert.equal(bursts.length,1);near(bursts[0].age,13/60);
 near(bursts[0].pos.z-start.z,9*.945+.9131*(.64+.64**2+.64**3+.64**4),1e-8);
 const tail={...p,prev:p.prev.clone(),pos:p.pos.clone(),vel:p.vel.clone(),life:1};
 assert.equal(tail.fidelityPhase,2);const vy=tail.vel.y;
 f.advanceFidelityProjectile(tail,1/60);near(tail.vel.y,vy*.98-.016*60);
 f.projectiles.clear();
});

test('#310 earlier terrain/player contact bursts without waiting for13F',async()=>{
 for(const target of ['wall','player']){
  const {f,a}=await setup();
  if(target==='wall')f.wall(2,{height:6});
  else f.G.actors=[f.make('shooter',{team:1,y:2,z:2,name:'target'})];
  const bursts=[],native=f.projectiles._blastBurst;
  f.projectiles._blastBurst=function(...args){bursts.push(args[0].age);return native.apply(this,args);};
  f.projectiles.fireBlaster(a,a.weapon,0);
  for(let n=0;n<13&&!bursts.length;n++)f.projectiles.update(1/60);
  assert.equal(bursts.length,1,target);assert.ok(bursts[0]<13/60,target);
  f.projectiles.clear();
 }
});
