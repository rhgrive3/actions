import test from 'node:test';
import assert from 'node:assert/strict';
import {batchFixture} from './batch03-fixture.mjs';
import {FixedClock} from '../runtime/clock.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function setup(grounded=true,pitch=0){const f=await batchFixture(),a=f.make('slosher');a.grounded=grounded;a.aimDir.set(0,Math.sin(pitch),Math.cos(pitch));f.G.projectiles.fireSlosh(a,a.weapon);return {...f,a,ps:f.G.projectiles.list};}
test('#959 active 4+5 Slosher units keep 2F straight and use .12/.05 on frame 3, on ground and in air',async()=>{
 for(const grounded of [true,false]){const f=await setup(grounded);assert.equal(f.ps.length,9);
 for(const p of f.ps){const launch=p.vel.clone(),group=p.s3DamageGroup,delay=p.delay,collision=p.fidelityPlayerCollision;
  for(let i=0;i<2;i++){f.advanceFidelityProjectile(p,1/60);assert.equal(p.fidelityPhase,0);close(p.vel.z,launch.z);}
  f.advanceFidelityProjectile(p,1/60);assert.equal(p.fidelityPhase,2);close(p.vel.x,launch.x*.88);close(p.vel.z,launch.z*.88);close(p.vel.y,launch.y*.88-3);
  assert.equal(p.s3DamageGroup,group);assert.equal(p.delay,delay);assert.equal(p.fidelityPlayerCollision,collision);
 }}
});
test('#959 exact Unit 1 and Unit 2 launch-speed fixtures and upward/downward aim use component thresholds',async()=>{
 for(const speed of [1.7609,1.1])for(const pitch of [-.7,0,.7]){const f=await setup(true,pitch),p=f.ps[0];p.vel.set(0,Math.sin(pitch)*speed*60+Math.cos(pitch)*speed*6,Math.cos(pitch)*speed*60);const v=p.vel.clone();for(let i=0;i<3;i++)f.advanceFidelityProjectile(p,1/60);assert.equal(p.fidelityPhase,2);close(p.vel.z,v.z*.88);close(p.vel.y,v.y*.88-3);}
 const f=await setup(),p=f.ps[0];p.age=p.straight;p.fidelityPhase=1;p.fidelityMove={...p.fidelityMove,endSpeed:null,freeVelocityXZ:60,freeVelocityY:60,freeFrame:0};
 for(const v of [[61,0,0],[0,61,0]]){p.fidelityPhase=1;p.vel.set(...v);f.advanceFidelityProjectile(p,1/60);assert.equal(p.fidelityPhase,1,'both tests must pass; frame field cannot force free');}
 p.vel.set(59,-61,0);f.advanceFidelityProjectile(p,1/60);assert.equal(p.fidelityPhase,2,'downward Y passes the signed lower-speed threshold');
});
test('#959 fixed-authority 30/60/120Hz endpoints match',async()=>{
 const results=[];for(const hz of [30,60,120]){const f=await setup(),p=f.ps[0],clock=new FixedClock();for(let frame=0;frame<hz;frame++)clock.advance(1/hz,dt=>f.advanceFidelityProjectile(p,dt));results.push([p.age,p.pos.x,p.pos.y,p.pos.z,p.fidelityPhase]);}assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);
});
test('#959 legacy family transition still integrates one brake step then checks Y',async()=>{
 const f=await setup(),p=f.ps[0];p.age=p.straight;p.fidelityPhase=0;p.fidelityMove={hz:60,endSpeed:null,brakeDrag:.1,freeDrag:.12,brakeGravity:144,freeGravity:180,freeVelocityY:600};p.vel.set(0,0,60);
 f.advanceFidelityProjectile(p,1/60);close(p.vel.z,54);close(p.vel.y,-2.4);assert.equal(p.fidelityPhase,2);
});
