import test from 'node:test';
import assert from 'node:assert/strict';
import {batchFixture} from './batch03-fixture.mjs';
import {rollerImpactRadius} from '../runtime/roller-impact-paint.mjs';

function approx(actual,expected,eps=1e-10){assert.ok(Math.abs(actual-expected)<=eps,`${actual} != ${expected}`);}

test('#411 sourced near/transition/far impact widths stay distinct by Roller unit',async()=>{
  const f=await batchFixture(),V=f.THREE.Vector3,roller=f.profile.weaponsFidelityCompletion.weapons.roller;
  const sample=(unit,distance)=>rollerImpactRadius({fidelityRollerUnit:unit,start:new V()},new V(distance,0,0),1);
  const h0=roller.WideSwingUnitGroupParam.Unit[0],v0=roller.VerticalSwingUnitGroupParam.Unit[0],v1=roller.VerticalSwingUnitGroupParam.Unit[1];
  approx(sample(h0,1.1),1.89);approx(sample(h0,12),1.6275);approx(sample(h0,(1.1+12)/2),(1.89+1.6275)/2);
  approx(sample(v0,1.1),2.454);approx(sample(v0,16),3.068);approx(sample(v0,(1.1+16)/2),(2.454+3.068)/2);
  approx(sample(v1,1.1),1.841);approx(sample(v1,16),2.045);approx(sample(v1,(1.1+16)/2),(1.841+2.045)/2);
});

test('#411 production impact uses unit/distance radius without changing projectile collision radius',async()=>{
  const f=await batchFixture(),a=f.make('roller');a.isLocal=true;a.grounded=true;a.weaponRunner.s3FlickVertical=false;
  f.G.camera={position:new f.THREE.Vector3()};
  f.G.projectiles.fireFlick(a,a.weapon);f.paint.length=0; // Isolate impact from the independently sourced nearest launch paint.

  const p=f.G.projectiles.list[0],collision=p.size,hit={point:p.start.clone().add(new f.THREE.Vector3(12,0,0)),normal:new f.THREE.Vector3(0,1,0)};
  p.vel.set(1,-1,0);
  f.G.projectiles._impact(p,hit);
  assert.equal(f.paint.length,1);approx(f.paint[0].radius,1.6275);assert.equal(p.size,collision);
});
