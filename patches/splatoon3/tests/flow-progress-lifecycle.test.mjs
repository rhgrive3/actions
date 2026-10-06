import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { createFlow, advanceFlow, awardFlow, penalizeFlowDeath } from '../runtime/flow.mjs';
import { FixedClock } from '../runtime/clock.mjs';
import fs from 'node:fs';
const cfg=JSON.parse(fs.readFileSync(new URL('../profile.json',import.meta.url))).flow;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const score=fp=>fp*cfg.threshold/cfg.progress.referenceThreshold;
const fp=s=>s.score*cfg.progress.referenceThreshold/cfg.threshold;
const inactive=points=>({...createFlow(),score:score(points)});
async function world(){
 const f=await fixture();f.G.level.spawnPads=[new f.THREE.Vector3(),new f.THREE.Vector3(0,0,20)];
 f.G.physics.groundProbe=(_x,_y,_z,_r,_d,_foot,h)=>{h.hit=false;return h;};f.G.match.canRespawn=()=>false;
 const a=f.make(),enemy=f.make();enemy.team=1;return {...f,a,enemy};
}
test('#468: slow decay, exact boundary split, fast decay and zero clamp use the fp domain',()=>{
 const s=inactive(50);advanceFlow(s,4,cfg);near(fp(s),49.2);advanceFlow(s,2,cfg);near(fp(s),45.7);near(s.idleTime,6);
 advanceFlow(s,100,cfg);near(s.score,0);assert.ok(s.idleTime>=106);
});
test('#468: only positive gains reset idle time; zero/negative/unknown/nonfinite awards do not',()=>{
 const s=inactive(50);advanceFlow(s,6,cfg);
 for(const [action,value]of [['damage',0],['turf',-3],['unknown',100],['damage',NaN]]){awardFlow(s,action,value,cfg);near(s.idleTime,6);}
 awardFlow(s,'damage',10,cfg);near(s.idleTime,6,'current damage weight is zero');awardFlow(s,'turf',10,cfg);near(s.idleTime,0);const before=s.score;advanceFlow(s,1,cfg);near(before-s.score,score(.2));
});
test('#468: widely separated splats cannot bank stale progress into a third activation',()=>{
 const s=createFlow();awardFlow(s,'splat',1,cfg);advanceFlow(s,6,cfg);awardFlow(s,'splat',1,cfg);advanceFlow(s,20,cfg);
 assert.equal(awardFlow(s,'splat',1,cfg),false);assert.equal(s.active,false);
});
test('#468: active duration/extension remain independent and paused/nonfinite time cannot change progress',()=>{
 const s={...inactive(50),active:true,remaining:20};advanceFlow(s,6,cfg);near(s.remaining,14);near(fp(s),50);near(s.idleTime,0);
 awardFlow(s,'assist',1,cfg);near(s.remaining,14+cfg.extension);
 const before={...s};for(const dt of [0,-1,NaN,Infinity])advanceFlow(s,dt,cfg);assert.deepEqual(s,before);
});
test('#471: penalties normalize across existing synthetic and direct100-fp representations',()=>{
 for(const threshold of [cfg.threshold,100])for(const [cause,expected]of [['weapon',45],['shooter',45],['water',40],['fall',40]]){
  const c={...cfg,threshold},s={...createFlow(),score:threshold*.5};penalizeFlowDeath(s,cause,c);near(s.score*100/threshold,expected);
 }
 for(const cause of ['weapon','water','fall']){const s=inactive(2);penalizeFlowDeath(s,cause,cfg);near(s.score,0);assert.equal(s.active,false);}
});
test('#471: actual death and nested respawn/reset retain cause-specific progress exactly once',async()=>{
 for(const [cause,expected]of [['weapon',45],['water',40],['fall',40]]){
  const f=await world(),a=f.a;a.s3.flow=inactive(50);a.s3.flow.idleTime=4;
  a.splat(cause==='weapon'?f.enemy:null,cause);near(fp(a.s3.flow),expected);a.splat(f.enemy,cause);near(fp(a.s3.flow),expected);
  a.respawn();near(fp(a.s3.flow),expected);near(a.s3.flow.idleTime,4);assert.ok(a.alive);assert.equal(a.s3.flow.active,false);
 }
});
test('#306: actual active death, dead-clock and respawn retain one state and the movement effect',async()=>{
 const f=await world(),a=f.a;a.s3.flow={...createFlow(),active:true,remaining:20};const activeSpeed=a.weaponRunner.moveSpeed(),state=a.s3.flow;
 a.splat(f.enemy,'weapon');assert.equal(a.s3.flow,state);assert.ok(state.active);near(state.remaining,20);
 f.tick(a,120);near(state.remaining,18);assert.ok(state.active);a.respawn();assert.equal(a.s3.flow,state);a.grounded=true;near(a.weaponRunner.moveSpeed(),activeSpeed);
});
test('#306: expiration while dead never resurrects Flow on respawn',async()=>{
 const f=await world(),a=f.a;a.s3.flow={...createFlow(),active:true,remaining:.5};a.splat(f.enemy,'weapon');f.tick(a,60);
 assert.equal(a.s3.flow.active,false);near(a.s3.flow.remaining,0);a.respawn();assert.equal(a.s3.flow.active,false);
});
test('#306/#471: direct new-battle reset and spawnAt clear progress, while respawn event sees restored state',async()=>{
 const f=await world(),a=f.a;const observed=[];f.on('respawn',({actor})=>{if(actor===a)observed.push(fp(actor.s3.flow));});
 a.s3.flow=inactive(50);a.splat(f.enemy,'weapon');a.respawn();assert.deepEqual(observed,[45]);
 a.reset();near(a.s3.flow.score,0);assert.equal(a.s3.flow.active,false);
 a.s3.flow={...inactive(50),active:true,remaining:20};a.spawnAt(new f.THREE.Vector3(),0);near(a.s3.flow.score,0);near(a.s3.flow.remaining,0);assert.equal(a.s3.flow.active,false);
});
test('#471: actual assist-credit cleanup stays independent from preserved victim progression',async()=>{
 const f=await world(),victim=f.enemy,helper=f.make(),killer=f.a;victim.invuln=0;victim.s3.flow=inactive(50);
 victim.damage(1,helper,'shooter');victim.splat(killer,'weapon');const after=helper.s3.flow.score;
 victim.respawn();victim.splat(killer,'weapon');near(helper.s3.flow.score,after);near(fp(victim.s3.flow),40);
});
test('#468/#306: 30/60/120Hz share identical inactive and dead-active authoritative tick traces',async()=>{
 const traces=[];
 for(const hz of [30,60,120]){const f=await world(),a=f.a,clock=new FixedClock(),trace=[];a.s3.flow=inactive(50);
  for(let r=0;r<hz*8;r++)clock.advance(1/hz,()=>{if(clock.ticks===360){a.s3.flow.active=true;a.s3.flow.remaining=20;a.splat(f.enemy,'weapon');}f.tick(a);trace.push([a.s3.flow.score,a.s3.flow.remaining,a.s3.flow.active,a.s3.flow.idleTime]);});
  traces.push(trace);
 }
 assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});
test('#471/#882: death penalty is followed by normal inactive decay, without dead awards',async()=>{
 const f=await world(),a=f.a;a.s3.flow=inactive(50);a.splat(f.enemy,'weapon');f.tick(a,60);near(fp(a.s3.flow),45-cfg.progress.decayPerSecond);
 f.emit('turf',{actor:a,area:100});near(fp(a.s3.flow),45-cfg.progress.decayPerSecond);
});
