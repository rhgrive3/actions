import test from 'node:test';
import assert from 'node:assert/strict';
import {batchFixture} from './batch03-fixture.mjs';
import {rollerImpactDepthScale} from '../runtime/roller-impact-paint.mjs';
function approx(actual,expected,eps=1e-9){assert.ok(Math.abs(actual-expected)<=eps,`${actual} != ${expected}`);}
function velocity(V,degrees){const r=degrees*Math.PI/180;return new V(Math.cos(r),-Math.sin(r),0);}

test('#611 vertical steep impact selects 1.10 straight vs 1.32 brake/free minimum',async()=>{
  const f=await batchFixture(),V=f.THREE.Vector3,unit=f.profile.weaponsFidelityCompletion.weapons.roller.VerticalSwingUnitGroupParam.Unit[0],n=new V(0,1,0);
  const p={fidelityRollerUnit:unit,vel:velocity(V,50),fidelityPhase:0};approx(rollerImpactDepthScale(p,n),1.10);
  p.fidelityPhase=1;approx(rollerImpactDepthScale(p,n),1.32);p.fidelityPhase=2;approx(rollerImpactDepthScale(p,n),1.32);
  p.vel=velocity(V,10);p.fidelityPhase=0;approx(rollerImpactDepthScale(p,n),1.76);p.fidelityPhase=2;approx(rollerImpactDepthScale(p,n),1.76);
});

test('#611 horizontal break/free uses sourced 1.20 minimum instead of straight schema default',async()=>{
  const f=await batchFixture(),V=f.THREE.Vector3,unit=f.profile.weaponsFidelityCompletion.weapons.roller.WideSwingUnitGroupParam.Unit[0],n=new V(0,1,0);
  const p={fidelityRollerUnit:unit,vel:velocity(V,50),fidelityPhase:0};approx(rollerImpactDepthScale(p,n),1.4);
  p.fidelityPhase=1;approx(rollerImpactDepthScale(p,n),1.2);
});

test('#611 production impact changes only paint stretch across the existing fidelity phase',async()=>{
  const sample=async phase=>{const f=await batchFixture(),a=f.make('roller');a.isLocal=true;a.grounded=true;a.weaponRunner.s3FlickVertical=true;f.G.camera={position:new f.THREE.Vector3()};f.G.projectiles.fireFlick(a,a.weapon);f.paint.length=0; // Isolate impact from the independently sourced nearest launch paint.
const p=f.G.projectiles.list[0];p.fidelityPhase=phase;p.vel.copy(velocity(f.THREE.Vector3,50));const hit={point:p.start.clone().add(new f.THREE.Vector3(8,0,0)),normal:new f.THREE.Vector3(0,1,0)};f.G.projectiles._impact(p,hit);return f.paint[0].opts.stretchAmt;};
  approx(await sample(0),.10);approx(await sample(1),.32);
});
