import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceStepPresentation,walkPresentationSpeed} from '../walk-presentation.mjs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';

test('step presentation decays without a rebound and is invariant at 30/60/120Hz',()=>{
 const end=[];
 for(const hz of [30,60,120]){
  const a={smoothY:-.24,smoothYV:0},positions=[];
  for(let i=0;i<hz/2;i++){advanceStepPresentation(a,1/hz);positions.push(a.smoothY);}
  assert(positions.every((y,i)=>y<0&&(i===0||y>=positions[i-1])),'no alternating up/down correction');
  end.push(a);
 }
 assert(Math.abs(end[0].smoothY-end[2].smoothY)<1e-12);assert(Math.abs(end[0].smoothYV-end[1].smoothYV)<1e-12);
});

test('walking display speed smooths sample noise, pauses, and has an idle endpoint',()=>{
 for(const hz of [30,60,120]){
  const c={};walkPresentationSpeed(c,1.5,1/hz,true);const raw=[],filtered=[];
  for(let i=0;i<hz;i++){const v=1.5+(i%2?.06:-.06);raw.push(v);filtered.push(walkPresentationSpeed(c,v,1/hz));}
  const range=v=>Math.max(...v)-Math.min(...v);
  assert(range(filtered.slice(hz/2))<range(raw)*.45);
  const before=c.walkSpeedFiltered;assert.equal(walkPresentationSpeed(c,0,0),before,'pause preserves cadence input');
  for(let i=0;i<hz;i++)walkPresentationSpeed(c,0,1/hz);
  assert.equal(c.walkSpeedFiltered,0);assert.equal(walkPresentationSpeed(c,6,1/hz,true),6,'teleport/action lane resets immediately');
 }
});

test('composed Actor keeps physical walking and collision while visual step correction is monotone',async()=>{
 const f=await sourceLoadedActorFixture({random:()=>.4});
 try{
  const a=await f.make();a._face=()=>{};a.pos.set(0,0,0);a.vel.set(0,0,1.5);a.smoothY=-.24;
  const physical=a.pos.clone(),velocity=a.vel.clone();let previous=-.24;
  for(let i=0;i<18;i++){
   f.G.time+=1/30;a._finishFrame(1/30);
   assert(a.smoothY>=previous&&a.smoothY<=0);previous=a.smoothY;
   assert.equal(a.pos.distanceTo(physical),0);assert.equal(a.vel.distanceTo(velocity),0);
  }
  const m=a.character.sourceMotion;assert.equal(m.status,'ready');assert(m.active);
  for(let i=0;i<120;i++){
   const travel=1.5+(i%2?.06:-.06);a.pos.z+=travel/60;f.G.time+=1/60;a._finishFrame(1/60);
   if(i>60)assert(Math.abs(m.speed-1.5)<.02,'actual sourced walk consumes smoothed speed');
   assert(Math.abs(m.motionVZ-travel)<1e-10,'foot contacts keep actual travelled velocity');
   assert(a.character.boneList.every(b=>[...b.position.toArray(),...b.quaternion.toArray()].every(Number.isFinite)));
  }
 }finally{f.reset();}
});

test('real input walking keeps identical gameplay through micro-input, acceleration, turns, firing, stop and a curb',async()=>{
 const baseline=rel=>rel==='patches/local-quality/walk-presentation.mjs';
 const old=`export function walkPresentationSpeed(c,s){return s;} export function advanceStepPresentation(a,dt){const w=24,acc=-w*w*a.smoothY-2*w*a.smoothYV;a.smoothYV+=acc*dt;a.smoothY+=a.smoothYV*dt;}`;
 const pair=await Promise.all([sourceLoadedActorFixture({random:()=>.4,moduleTransform:(rel,code)=>baseline(rel)?old:code}),sourceLoadedActorFixture({random:()=>.4})]);
 const {FixedClock}=await import('../../splatoon3/runtime/clock.mjs');
 try{
  for(const hz of [30,60,120]){
   const actors=await Promise.all(pair.map(f=>f.make()));
   pair.forEach(f=>{f.G.level=new f.Level({bounds:{minX:-20,maxX:20,minZ:-20,maxZ:20},spawnPads:[[-10,0,0],[10,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-20,-.5,-20],max:[20,0,20]},{kind:'box',min:[-4,0,1.2],max:[4,.12,2]}]});f.G.physics=new f.Physics(f.G.level);});
   const clock=new FixedClock();let tick=0;
   for(let frame=0;frame<hz*4;frame++)clock.advance(1/hz,dt=>{
    const stage=Math.floor(tick/30),move=stage===0?[0,.04]:stage===2?[1,0]:stage===3?[-1,0]:stage>=5?[0,0]:[0,1];
    pair.forEach((f,i)=>{const a=actors[i];a.intent.move.set(move[0],0,move[1]);a.intent.fire=stage===4;f.tick(a,dt);});
    const state=a=>({pos:a.pos.toArray(),vel:a.vel.toArray(),yaw:a.yaw,grounded:a.grounded,face:a.ground.face,ink:a.ink,hp:a.hp,cooldown:a.weaponRunner.cooldown});
    assert.deepEqual(structuredClone(state(actors[1])),structuredClone(state(actors[0])),`${hz}Hz gameplay tick ${tick}`);tick++;
   });
   assert.equal(tick,240);pair.forEach(f=>f.reset());
  }
 }finally{pair.forEach(f=>f.reset());}
});
