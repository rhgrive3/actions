import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const EXTRA="export {krakenDashSweptContact,crabTankAttackTargetVelocity} from './patches/splatoon3/runtime/all-specials.mjs';";
async function runtime(){return fixture({fullRuntime:true,realProjectiles:true,productionComposition:true,extraExports:EXTRA});}
test('11.3.0 Crab Tank lateral motion is exactly five times forward movement in its heading frame',async()=>{
  const f=await runtime(),v=f.crabTankAttackTargetVelocity;
  const side=v({x:1,z:0},0),forward=v({x:0,z:1},0);
  assert.ok(Math.abs(side.x-4.5)<1e-12&&Math.abs(side.z)<1e-12);
  assert.ok(Math.abs(forward.x)<1e-12&&Math.abs(forward.z-.9)<1e-12);
  const turn=v({x:0,z:1},Math.PI/2);assert.ok(Math.abs(turn.x)<1e-12&&Math.abs(turn.z-4.5)<1e-12);
  const invalid=v({x:Infinity,z:1},0);assert.equal(invalid.x,0);assert.equal(invalid.z,0);
});
test('11.3.0 Kraken Royale charge dash collides with either 1.5-radius swept endpoint',async()=>{
  const f=await runtime(),touch=f.krakenDashSweptContact,from={x:0,z:0},to={x:0,z:.35};
  assert.equal(touch(from,to,{x:1.49,z:0}),true);
  assert.equal(touch(from,to,{x:1.49,z:.35}),true);
  assert.equal(touch(from,to,{x:1.51,z:0}),false);
  assert.equal(touch(from,from,{x:0,z:0}),true);
  assert.equal(touch(from,to,{x:Infinity,z:0}),false);
});
test('11.3.0 Crab Tank cannon cannot refire before 75F despite shooter re-arming at 32F',async()=>{
  const f=await runtime();f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  const actor=f.make();actor.weapon={...actor.weapon,special:'crabTank',specialCost:100};
  actor.special=100;actor._resolve=()=>{};f.G.actors=[actor];
  const events=[];f.on('all:special',e=>{if(e.id==='crabTank'&&e.action==='cannon')events.push(e);});
  actor._startSpecial();
  for(let i=0;i<20;i++)actor._updateSpecial(1/60);
  actor.intent.sub=true;actor._updateSpecial(1/60);assert.equal(events.length,1);
  for(let i=0;i<72;i++)actor._updateSpecial(1/60);assert.equal(events.length,1);
  for(let i=0;i<3;i++)actor._updateSpecial(1/60);assert.equal(events.length,2);
});
