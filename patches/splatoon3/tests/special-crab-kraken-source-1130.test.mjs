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

test('Kraken Royale 3D swept dash does not damage opponents on different floors',async()=>{
  const f=await runtime(),touch=f.krakenDashSweptContact;
  const start={x:0,y:0,z:0},end={x:0,y:0,z:1};
  assert.equal(touch(start,end,{x:0,y:4,z:.5}),false,'an upper-floor opponent must not be hit');
  assert.equal(touch(start,end,{x:0,y:-4,z:.5}),false,'a lower-floor opponent must not be hit');
  assert.equal(touch(start,end,{x:0,y:1.49,z:.5}),true,'inside the 1.5-unit vertical radius');
  assert.equal(touch(start,end,{x:0,y:1.51,z:.5}),false,'outside the vertical radius');
  assert.equal(touch({x:0,y:0,z:0},{x:0,y:2,z:1},{x:0,y:1,z:.5}),true,
    'the nearest point is on the 3D dash segment');
  assert.equal(touch(start,end,{x:0,z:.5}),false,'reject malformed mixed-dimensional positions');
});
test('Kraken Royale actual dash cannot hit a target far above the owner',async()=>{
  const f=await runtime();f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  const owner=f.make(),upper=f.make();
  owner.weapon={...owner.weapon,special:'krakenRoyale',specialCost:100};
  owner.special=100;owner.alive=true;owner._resolve=()=>{};
  owner.aimDir.set(0,0,1);owner.aimPoint.set(0,1,25);
  upper.team=1;upper.pos.set(0,7,1);upper.alive=true;
  f.G.actors=[owner,upper];
  const hits=[],orig=f.G.projectiles.applyHit;
  f.G.projectiles.applyHit=(a,b,d,k)=>{hits.push({a,b,d,k});return false;};
  try{
    owner._startSpecial();
    for(let i=0;i<60;i++)owner._updateSpecial(1/60);
    owner.intent.fire=true;owner._updateSpecial(1/60);
    for(let i=0;i<35;i++)owner._updateSpecial(1/60);
    owner.intent.fire=false;owner._updateSpecial(1/60);
    for(let i=0;i<20;i++)owner._updateSpecial(1/60);
    assert.equal(hits.some(h=>h.b===upper&&h.k==='krakenRoyale'),false);
  }finally{f.G.projectiles.applyHit=orig;}
});

test('Kraken Royale uses source 2.75 forward offset and 1.5 player radius',async()=>{
 const f=await runtime();f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 const owner=f.make(),front=f.make(),behind=f.make(),upper=f.make();
 owner.weapon={...owner.weapon,special:'krakenRoyale',specialCost:100};
 owner.special=100;owner._resolve=()=>{};owner.alive=true;
 owner.aimDir.set(0,0,1);owner.aimPoint.set(0,1,25);
 for(const v of [front,behind,upper]){v.team=1;v.alive=true;}
 front.pos.set(0,0,2.75);behind.pos.set(0,0,-2.75);upper.pos.set(0,5,2.75);
 f.G.actors=[owner,front,behind,upper];
 const hits=[],old=f.G.projectiles.applyHit;
 f.G.projectiles.applyHit=(a,v,d,k)=>{hits.push({a,v,d,k});return false;};
 try{
  owner._startSpecial();
  for(let i=0;i<60;i++)owner._updateSpecial(1/60);
  owner.intent.fire=true;owner._updateSpecial(1/60);
  for(let i=0;i<35;i++)owner._updateSpecial(1/60);
  owner.intent.fire=false;owner._updateSpecial(1/60);
  owner._updateSpecial(1/60);
  assert.ok(hits.some(h=>h.v===front&&h.k==='krakenRoyale'),
    'source forward offset extends beyond the actor body');
  assert.equal(hits.some(h=>h.v===behind&&h.k==='krakenRoyale'),false);
  assert.equal(hits.some(h=>h.v===upper&&h.k==='krakenRoyale'),false,
    'the 3D sweep must not hit through elevated floors');
 }finally{f.G.projectiles.applyHit=old;}
});
