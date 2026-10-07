import test from 'node:test';
import assert from 'node:assert/strict';
import {batchFixture} from './batch03-fixture.mjs';
import {rollerImpactAngleDegrees,rollerImpactStraightDepthScale} from '../runtime/roller-impact-paint.mjs';
function approx(actual,expected,eps=1e-9){assert.ok(Math.abs(actual-expected)<=eps,`${actual} != ${expected}`);}
function velocity(V,degrees){const r=degrees*Math.PI/180;return new V(Math.cos(r),-Math.sin(r),0);}

test('#674 10deg..50deg incidence interpolates the vertical straight DepthScale envelope',async()=>{
  const f=await batchFixture(),V=f.THREE.Vector3,unit=f.profile.weaponsFidelityCompletion.weapons.roller.VerticalSwingUnitGroupParam.Unit[0];
  const p={fidelityRollerUnit:unit};const n=new V(0,1,0);
  for(const [angle,expected] of [[10,1.76],[30,1.43],[50,1.1]]){p.vel=velocity(V,angle);approx(rollerImpactAngleDegrees(p.vel,n),angle);approx(rollerImpactStraightDepthScale(p,n),expected);}
});

test('#674 omitted S3 schema defaults are explicit for horizontal shallow/steep impacts',async()=>{
  const f=await batchFixture(),V=f.THREE.Vector3,unit=f.profile.weaponsFidelityCompletion.weapons.roller.WideSwingUnitGroupParam.Unit[0];
  const p={fidelityRollerUnit:unit};const n=new V(0,1,0);
  p.vel=velocity(V,10);approx(rollerImpactStraightDepthScale(p,n),2.4);
  p.vel=velocity(V,50);approx(rollerImpactStraightDepthScale(p,n),1.4);
});

test('#674 production impact forwards sourced depth as paint stretch without touching trajectory',async()=>{
  const f=await batchFixture(),a=f.make('roller');a.isLocal=true;a.grounded=true;a.weaponRunner.s3FlickVertical=true;f.G.camera={position:new f.THREE.Vector3()};
  f.G.projectiles.fireFlick(a,a.weapon);const p=f.G.projectiles.list[0],before=p.pos.clone(),hit={point:p.start.clone().add(new f.THREE.Vector3(8,0,0)),normal:new f.THREE.Vector3(0,1,0)};
  p.vel.copy(velocity(f.THREE.Vector3,30));f.G.projectiles._impact(p,hit);
  assert.equal(f.paint.length,1);approx(f.paint[0].opts.stretchAmt,.43);assert.deepEqual(p.pos.toArray(),before.toArray());
});
