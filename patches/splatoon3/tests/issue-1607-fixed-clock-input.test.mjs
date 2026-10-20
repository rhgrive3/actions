// Current-behavior diagnosis only: real FixedClock/PlayerController, synthetic tick-scheduled KeyE.
// No DOM/device delivery, Game.runSimulation, Actor.update, Character.update or rendering.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {fixture} from './source-fixture.mjs';
const rows=[];
for(const hz of [20,30,60,120])test(`#1607 actual fixed-clock/controller admission at render ${hz}Hz`,async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:`export {FixedClock} from './patches/splatoon3/runtime/clock.mjs';export {PlayerController} from './inkwave-public/src/game/player.js';`});
 f.G.rig={gameCam:{}};f.G.settings={...f.G.settings,aimAssist:0,aimAssistMouse:false};f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 for(const kind of ['miss','close-floor'])for(const scenario of ['before','at','after','held']){
 const casts=[];let tick=0,down=false;f.G.physics.raycast=(o,d,len,h)=>{casts.push(tick);h.hit=kind==='close-floor';h.dist=2;h.point.copy(o).addScaledVector(d,2);h.normal.set(0,1,0);return h;};
 const a=f.make('shooter');a.weapon={...a.weapon,special:'zipcaster',specialCost:100};a.special=100;a.alive=true;a.remote=false;a._resolve=()=>{};a.aimDir.set(0,0,1);a.aimPoint=new f.THREE.Vector3(0,1,8);f.G.actors=[a];a._startSpecial();const s=a._s3AllSpecialState,origin=a.pos.toArray(),initialInk=a.ink,clock=new f.FixedClock();
 const input={mouse:{dx:0,dy:0,left:false,right:false},pad:null,mobile:null,down:key=>key==='KeyE'&&down,padButton:()=>false,padValue:()=>0,padPressed:new Set(),wasPressed:()=>false};const rig={yaw:0,pitch:0},controller=new f.PlayerController(a,rig,input),observations=[];let frames=0,zeroTickFrames=0,maxTicksPerFrame=0;
 const press=scenario==='before'?45:scenario==='at'?46:47;
 while(tick<51){const count=clock.advance(1/hz,step=>{tick++;assert.equal(step,1/60);down=tick===1||(scenario==='held'?(tick>=45&&tick<=47)||tick===49:tick===press);controller.update(step);assert.equal(a.intent.sub,down);a._updateSpecial(step);if(tick>=44&&tick<=49)observations.push({tick,down,phase:s.phase,failed:s.failedHooks,nextHookAt:s.nextHookAt,t:s.t});});frames++;if(!count)zeroTickFrames++;maxTicksPerFrame=Math.max(maxTicksPerFrame,count);}
 const expected=scenario==='before'?[1]:scenario==='held'?[1,49]:[1,press];assert.deepEqual(casts,expected);assert.deepEqual(a.pos.toArray(),origin);assert.equal(a.ink,initialInk);assert.equal(s.phase,'ready');assert(Math.abs(s.inkFuel-(150-(s.inkDrainPerSecond??13.05)*tick/60))<1e-7);if(hz===120)assert(zeroTickFrames>0);if(hz===20)assert.equal(maxTicksPerFrame,3);rows.push({renderHz:hz,kind,scenario,casts,frames,ticks:tick,zeroTickFrames,maxTicksPerFrame,observations});
 }
 f.G.projectiles.clear();f.G.actors=[];
});
process.on('exit',()=>{const report=JSON.stringify({scope:'Synthetic tick-scheduled input through real PlayerController and FixedClock; not DOM, physical device, full Game simulation or retail fidelity',rows},null,2);if(process.env.INKWAVE_1607_REPORT)fs.writeFileSync(process.env.INKWAVE_1607_REPORT,report);else console.log(report);});
