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

test('#713 raw height anchors select/interpolate horizontal and vertical break/free depth scales',async()=>{
  const f=await batchFixture(),{horizontal,vertical}=rollerUnits(f.profile);
  // Pinned 11.3.0 extraction: raw height anchors are 1.5 and 10.
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

test('#713 height, phase and incidence inputs compose without replacing #611/#674',async()=>{
  const f=await batchFixture(),V=f.THREE.Vector3,{horizontal,vertical}=rollerUnits(f.profile);
  const n=new V(0,1,0);
  const h={fidelityRollerUnit:horizontal,fidelityPhase:2,vel:velocity(V,5)};
  approx(rollerImpactDepthScale(h,n,1.0),2.4); // low arc retains the angle-selected max
  approx(rollerImpactDepthScale(h,n,10),1.2);  // high arc reaches the height-selected min
  h.vel=velocity(V,50);
  approx(rollerImpactDepthScale(h,n,1.0),1.2); // steep incidence still selects the min
  h.fidelityPhase=0;h.vel=velocity(V,5);
  approx(rollerImpactDepthScale(h,n,10),2.4);  // straight phase does not use break/free height
  approx(rollerImpactStraightDepthScale(h,n),2.4);
  h.fidelityPhase=1;h.vel=velocity(V,50);
  approx(rollerImpactDepthScale(h,n),1.2);     // #611/#674 remain usable without a height
  const v={fidelityRollerUnit:vertical,fidelityPhase:2,vel:velocity(V,5)};
  approx(rollerImpactDepthScale(v,n,1.0),1.76);
  approx(rollerImpactDepthScale(v,n,10),1.32);
});

test('#713 production impact changes landing stretch only for low/high height inputs',async()=>{
  const f=await batchFixture(),V=f.THREE.Vector3;
  const sample=async height=>{
    const a=f.make('roller');a.isLocal=true;a.grounded=true;a.weaponRunner.s3FlickVertical=true;
    f.G.camera={position:new V()};
    f.G.projectiles.fireFlick(a,a.weapon);f.paint.length=0;
    const p=f.G.projectiles.list[0];
    p.fidelityPhase=2;p.vel.copy(velocity(V,5));p.fidelityImpactHeight=height;
    const before={size:p.size,pos:p.pos.clone(),vel:p.vel.clone(),damage:p.damage,
      collision:JSON.stringify([p.fidelityPlayerCollision,p.fidelityFieldCollision])};
    const hit={point:p.start.clone().add(new V(8,0,0)),normal:new V(0,1,0)};
    assert.equal(rollerImpactHeight(p,hit,1),height);
    f.G.projectiles._impact(p,hit);
    return {stretch:f.paint[0].opts.stretchAmt,before,p};
  };
  const low=await sample(1.0),high=await sample(10.0);
  approx(low.stretch,.76);approx(high.stretch,.32);
  assert.notEqual(low.stretch,high.stretch);
  for(const s of [low,high]){
    assert.equal(s.p.size,s.before.size);
    assert.deepEqual(s.p.pos.toArray(),s.before.pos.toArray());
    assert.deepEqual(s.p.vel.toArray(),s.before.vel.toArray());
    assert.equal(s.p.damage,s.before.damage);
    assert.equal(JSON.stringify([s.p.fidelityPlayerCollision,s.p.fidelityFieldCollision]),s.before.collision);
  }
});

test('#713 production impact reads the retained flight apex above the contact plane',async()=>{
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

test('#713 live projectile step retains its apex before a later break/free impact',async()=>{
  const f=await batchFixture(),V=f.THREE.Vector3;
  const a=f.make('roller');a.isLocal=true;a.grounded=true;a.weaponRunner.s3FlickVertical=true;
  f.G.camera={position:new V()};
  f.G.projectiles.fireFlick(a,a.weapon);
  const p=f.G.projectiles.list[0];
  p.pos.y=100;p.prev.copy(p.pos);p.start.copy(p.pos);p.fidelityMaxY=100;
  p.vel.set(0,60,0);p.age=0;p.life=5;p.straight=1;p.grav=0;p.drag=0;
  assert.equal(f.G.projectiles._step(p,.1),false);
  approx(p.fidelityMaxY,106);
  p.vel.y=-120;
  assert.equal(f.G.projectiles._step(p,.1),false);
  approx(p.fidelityMaxY,106);
  const hit={point:new V(p.pos.x,0,p.pos.z),normal:new V(0,1,0)};
  approx(rollerImpactHeight(p,hit,1),106);
});

test('#713 retained flight apex selects a stable break/free band at 30/60/120 Hz',async()=>{
  const f=await batchFixture(),V=f.THREE.Vector3,{vertical}=rollerUnits(f.profile);
  const sample=hz=>{
    const p={pos:new V(0,0,0),prev:new V(),vel:new V(0,Math.sqrt(2*.04*4),0),age:0,life:5,
      straight:0,grav:.04,drag:0,fidelityMove:null,fidelityPhase:0};
    const dt=1/hz;
    for(let t=0;t<6;t+=dt)f.advanceFidelityProjectile(p,dt);
    return rollerImpactHeightDepthScale({fidelityRollerUnit:vertical},p.fidelityMaxY);
  };
  const [a30,a60,a120]=[sample(30),sample(60),sample(120)];
  for(const value of [a30,a60,a120]){assert.ok(Number.isFinite(value));assert.ok(value>1.32&&value<1.76);}
  approx(a60,a30,.02);approx(a120,a30,.02);
});
