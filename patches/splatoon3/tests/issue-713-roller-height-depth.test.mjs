import test from 'node:test';
import assert from 'node:assert/strict';
import {batchFixture} from './batch03-fixture.mjs';
import {
  rollerImpactHeight,
  rollerImpactHeightDepthScale,
  rollerBreakFreeHeightUnit,
  rollerImpactDepthScale,
  rollerImpactStraightDepthScale,
} from '../runtime/roller-impact-paint.mjs';

function approx(actual,expected,eps=1e-9){assert.ok(Math.abs(actual-expected)<=eps,`${actual} != ${expected}`);}
function velocity(V,degrees){const r=degrees*Math.PI/180;return new V(Math.cos(r),-Math.sin(r),0);}
function rollerUnits(profile){
  const roller=profile.weaponsFidelityCompletion.weapons.roller;
  return {horizontal:roller.WideSwingUnitGroupParam.Unit[0],vertical:roller.VerticalSwingUnitGroupParam.Unit[0]};
}

test('#713 sourced height anchors interpolate the horizontal and vertical break/free depth scales',async()=>{
  const f=await batchFixture(),{horizontal,vertical}=rollerUnits(f.profile);
  // Pinned 11.3.0: HeightUseDepthScaleMaxBreakFree=1.5, HeightUseDepthScaleMinBreakFree=10.
  const h={fidelityRollerUnit:horizontal,fidelityPhase:2};
  approx(rollerBreakFreeHeightUnit(h,0),0);approx(rollerBreakFreeHeightUnit(h,1.5),0);
  approx(rollerBreakFreeHeightUnit(h,5.75),.5);approx(rollerBreakFreeHeightUnit(h,10),1);
  approx(rollerImpactHeightDepthScale(h,1.5),2.4);
  approx(rollerImpactHeightDepthScale(h,10),1.2);
  approx(rollerImpactHeightDepthScale(h,5.75),1.8);
  const v={fidelityRollerUnit:vertical,fidelityPhase:2};
  approx(rollerBreakFreeHeightUnit(v,5.75),.5);
  approx(rollerImpactHeightDepthScale(v,1.5),1.76);
  approx(rollerImpactHeightDepthScale(v,10),1.32);
  approx(rollerImpactHeightDepthScale(v,5.75),1.54);
});

test('#713 runtime consumes both fields and composes with #611/#674 instead of replacing them',async()=>{
  const f=await batchFixture(),V=f.THREE.Vector3,{horizontal,vertical}=rollerUnits(f.profile);
  const n=new V(0,1,0);
  const h={fidelityRollerUnit:horizontal,fidelityPhase:2};
  h.vel=velocity(V,5);   // #674 tAngle=0 -> max side
  approx(rollerImpactDepthScale(h,n,1.0),2.4);   // low arc keeps the angle-selected max
  approx(rollerImpactDepthScale(h,n,10),1.2);    // high arc caps to the sourced minimum
  h.vel=velocity(V,50);  // #674 tAngle=1 -> min side
  approx(rollerImpactDepthScale(h,n,1.0),1.2);
  // The straight phase has no Height*BreakFree selector: #674 stays intact.
  h.fidelityPhase=0;h.vel=velocity(V,5);
  approx(rollerImpactDepthScale(h,n,10),2.4);
  approx(rollerImpactStraightDepthScale(h,n),2.4);
  // The angle selector alone still drives break/free when no height is supplied (#611).
  h.fidelityPhase=1;h.vel=velocity(V,50);
  approx(rollerImpactDepthScale(h,n),1.2);
  const v={fidelityRollerUnit:vertical,fidelityPhase:2,vel:velocity(V,5)};
  approx(rollerImpactDepthScale(v,n,1.0),1.76);
  approx(rollerImpactDepthScale(v,n,10),1.32);
});

test('#713 production impact selects depth by the reported height without touching trajectory or collision',async()=>{
  const f=await batchFixture(),V=f.THREE.Vector3;
  const sample=async height=>{
    const a=f.make('roller');a.isLocal=true;a.grounded=true;a.weaponRunner.s3FlickVertical=true;
    f.G.camera={position:new V()};
    f.G.projectiles.fireFlick(a,a.weapon);f.paint.length=0;
    const p=f.G.projectiles.list[0];
    p.fidelityPhase=2;p.vel.copy(velocity(V,5));p.fidelityImpactHeight=height;
    const size=p.size,pos=p.pos.clone(),vel=p.vel.clone();
    const hit={point:p.start.clone().add(new V(8,0,0)),normal:new V(0,1,0)};
    assert.equal(rollerImpactHeight(p,hit,1),height);
    f.G.projectiles._impact(p,hit);
    return {stretch:f.paint[0].opts.stretchAmt,size,pos,vel,p,hit};
  };
  const low=await sample(1.0),high=await sample(10.0);
  approx(low.stretch,.76);approx(high.stretch,.32);
  assert.notEqual(low.stretch,high.stretch);
  for(const s of [low,high]){
    assert.equal(s.p.size,s.size);
    assert.deepEqual(s.p.pos.toArray(),s.pos.toArray());
    assert.deepEqual(s.p.vel.toArray(),s.vel.toArray());
  }
});

test('#713 production impact reads the tracked arc apex above the contacted surface',async()=>{
  const f=await batchFixture(),V=f.THREE.Vector3;
  const a=f.make('roller');a.isLocal=true;a.grounded=true;a.weaponRunner.s3FlickVertical=true;
  f.G.camera={position:new V()};
  f.G.projectiles.fireFlick(a,a.weapon);f.paint.length=0;
  const p=f.G.projectiles.list[0],hit={point:p.start.clone().add(new V(8,0,0)),normal:new V(0,1,0)};
  p.fidelityPhase=2;p.vel.copy(velocity(V,5));
  p.fidelityMaxY=p.start.y+0.5;
  approx(rollerImpactHeight(p,hit,1),.5);
  f.G.projectiles._impact(p,hit);
  approx(f.paint[0].opts.stretchAmt,.76);
  f.paint.length=0;
  p.fidelityMaxY=p.start.y+20;
  approx(rollerImpactHeight(p,hit,1),20);
  f.G.projectiles._impact(p,hit);
  approx(f.paint[0].opts.stretchAmt,.32);
});

test('#713 recorded arc apex selects one break/free band at 30/60/120 Hz',async()=>{
  const f=await batchFixture(),V=f.THREE.Vector3,{vertical}=rollerUnits(f.profile);
  const sample=hz=>{
    const p={pos:new V(0,0,0),prev:new V(),vel:new V(0,Math.sqrt(2*.04*4),0),age:0,life:5,
      straight:0,grav:.04,drag:0,fidelityMove:null,fidelityPhase:0};
    const dt=1/hz;let apex=p.pos.y;
    for(let t=0;t<6;t+=dt){f.advanceFidelityProjectile(p,dt);apex=Math.max(apex,p.fidelityMaxY);}
    return rollerImpactHeightDepthScale({fidelityRollerUnit:vertical},apex);
  };
  const [a30,a60,a120]=[sample(30),sample(60),sample(120)];
  for(const value of [a30,a60,a120]){assert.ok(Number.isFinite(value));assert.ok(value>1.32&&value<1.76);}
  approx(a60,a30,.02);approx(a120,a30,.02);
});
