import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

const EXTRA="export {crabTankAttackTargetVelocity,crabShooterRepeatFrames} from './patches/splatoon3/runtime/all-specials.mjs';";
async function setup(){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:EXTRA});
 f.G.physics.segment=(_from,_to,hit)=>{hit.hit=false;return hit;};
 const actor=f.make();actor.weapon={...actor.weapon,special:'crabTank',specialCost:100};
 actor.special=100;actor.alive=true;actor.remote=false;actor._resolve=()=>{};
 f.G.actors=[actor];
 const events=[];f.on('all:special',e=>{if(e.id==='crabTank')events.push(e);});
 actor._startSpecial();
 return {f,actor,events};
}
test('Chariot 11.3.0 preserves exact X/Z 5:1 speed ratio in camera-local axes',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:EXTRA});
 const velocity=f.crabTankAttackTargetVelocity;
 const right=velocity({x:1,z:0},0);assert.equal(right.x,4.5);assert.equal(right.z,0);
 const front=velocity({x:0,z:1},0);assert.equal(front.x,0);assert.equal(front.z,.9);
 const side=velocity({x:0,z:1},Math.PI/2);
 const forward=velocity({x:1,z:0},Math.PI/2);
 assert.ok(Math.abs(side.x)<1e-12 && Math.abs(side.z-4.5)<1e-12);
 assert.ok(Math.abs(forward.x-.9)<1e-12 && Math.abs(forward.z)<1e-12);
 const bad=velocity({x:Infinity,z:1},0);assert.equal(bad.x,0);assert.equal(bad.z,0);
});
test('Chariot shooter spin-up stays within 12F..4F and reaches 4F after 90F',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:EXTRA});
 const frames=f.crabShooterRepeatFrames;
 assert.equal(frames(0),12);
 assert.equal(frames(.5),9);
 assert.equal(frames(1.5),4);
 assert.equal(frames(100),4);
 assert.equal(frames(-1),12);
});
test('Chariot 75F cannon interval is enforced across separate R presses',async()=>{
 const {actor,events}=await setup();
 for(let i=0;i<20;i++)actor._updateSpecial(1/60);
 actor.intent.sub=true;actor._updateSpecial(1/60);actor.intent.sub=false;actor._updateSpecial(1/60);
 assert.equal(events.filter(e=>e.action==='cannon').length,1);
 for(let i=0;i<32;i++)actor._updateSpecial(1/60);
 actor.intent.sub=true;actor._updateSpecial(1/60);
 assert.equal(events.filter(e=>e.action==='cannon').length,1,'not available after only 32F');
 actor.intent.sub=false;for(let i=0;i<43;i++)actor._updateSpecial(1/60);
 actor.intent.sub=true;actor._updateSpecial(1/60);
 assert.equal(events.filter(e=>e.action==='cannon').length,2,'75F interval permits the next cannon');
});
test('Chariot shooter cadence decreases over its native 90F spin-up instead of fixed 6F',async()=>{
 const {actor,events}=await setup();actor.intent.fire=true;
 for(let i=0;i<150;i++)actor._updateSpecial(1/60);
 const shots=events.filter(e=>e.action==='shot');
 assert.ok(shots.length>15 && shots.length<33,`shot count ${shots.length}`);
 // Derive event times using an independent test pass with explicit frame clock.
 const {actor:b,events:timeline}=await setup();b.intent.fire=true;const frames=[];
 for(let i=1;i<=150;i++){const n=timeline.filter(e=>e.action==='shot').length;b._updateSpecial(1/60);if(timeline.filter(e=>e.action==='shot').length>n)frames.push(i);}
 assert.equal(frames[0],20);assert.equal(frames[1]-frames[0],12);
 assert.equal(frames.at(-1)-frames.at(-2),4);
});
