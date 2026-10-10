import test from 'node:test';
import assert from 'node:assert/strict';
import {batchFixture,cpuFloor} from './batch03-fixture.mjs';
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

test('#713 wall-like faces carry no height law and break/free depth falls back to incidence',async()=>{
  const f=await batchFixture(),V=f.THREE.Vector3,{horizontal}=rollerUnits(f.profile);
  const p={fidelityRollerUnit:horizontal,fidelityPhase:2,pos:new V(0,5,0),prev:new V(0,4,0),
    start:new V(0,3,0),fidelityMaxY:9};
  const floor={point:new V(0,0,0),normal:new V(0,1,0)};
  const wall={point:new V(0,2,0),normal:new V(0,0,1)};
  approx(rollerImpactHeight(p,floor,1),9); // retained apex above the contact plane (public Y-diff)
  assert.equal(rollerImpactHeight(p,wall,1),null); // public source paints walls without a height law
  p.fidelityImpactHeight=4; // explicit fixture input is gated on wall-like faces too
  approx(rollerImpactHeight(p,floor,1),4);
  assert.equal(rollerImpactHeight(p,wall,1),null);
  // With no height input the #713 selector stays inert: 5deg incidence against a
  // vertical wall keeps the sourced break/free maximum, exactly as before #713.
  p.vel=velocity(V,5);
  approx(rollerImpactDepthScale(p,wall.normal,rollerImpactHeight(p,wall,1)),2.4);
});

test('#713 low/high drop footprints stay separated on the CPU mask and paint contract at 30/60/120 Hz',async()=>{
  const f=await batchFixture(),V=f.THREE.Vector3,{horizontal}=rollerUnits(f.profile);
  const cpu=cpuFloor(f,30,.05),rates={};
  for(const hz of [30,60,120]){
    rates[hz]={};
    for(const [label,target] of [['low',1],['high',14]]){
      f.G.projectiles.clear();f.paint.length=0;
      const a=f.make('roller');a.isLocal=true;a.grounded=true;a.weaponRunner.s3FlickVertical=false;
      f.G.camera={position:new V()};
      f.G.projectiles.fireFlick(a,a.weapon);
      const p=f.G.projectiles.list[0];
      assert.equal(p.type,'drop');
      // Pin the same sourced unit for every flick so the contract compares like for like.
      p.fidelityRollerUnit=horizontal;
      // Contact plane at the launch reference height so the selector height is
      // exactly the retained apex minus hit.point.y (public source Y-diff input).
      // The contact point is pinned too: cell quantization of the CPU mask must
      // depend only on the contract, not on the per-flick spawn position.
      p.pos.x=0;p.pos.z=0;p.prev.x=0;p.prev.z=0;p.start.x=0;p.start.z=0;
      p.pos.y=0;p.prev.y=0;p.start.y=0;p.fidelityMaxY=0;
      p.fidelityMove=null;p.fidelityPhase=2;p.straight=0;p.drag=0;p.grav=4;p.age=0;p.life=6;
      p.vel.set(0,Math.sqrt(2*p.grav*target),0);
      let guard=0;
      while(p.vel.y>0&&guard++<5000)f.advanceFidelityProjectile(p,1/hz);
      const apex=p.fidelityMaxY;
      if(label==='low')assert.ok(apex>0.5&&apex<1.5,`low apex ${apex}@${hz}Hz`);
      else assert.ok(apex>=10&&apex<20,`high apex ${apex}@${hz}Hz`);
      // Fixed incidence/seed/age isolate the #713 height selector from the
      // separate #498 age-width law and the native radius RNG.
      p.vel.copy(velocity(V,5));p.seed=0.42;p.age=0;
      f.paint.length=0;
      const hit={point:new V(8,0,0),normal:new V(0,1,0)};
      approx(rollerImpactHeight(p,hit,1),apex);
      f.G.projectiles._impact(p,hit);
      assert.equal(f.paint.length,1);
      const e=f.paint[0];
      // GPU-side contract: radius/stretch/stretchAmt/seed as the paint shader consumes them.
      const contract=[e.radius,e.opts.stretchAmt,e.opts.seed,e.opts.stretch.x,e.opts.stretch.y,e.opts.stretch.z];
      // CPU-side footprint: the same splat through the fixed-clock CPU mask.
      cpu.p.grid.fill(0);cpu.p.counts[0]=0;cpu.p.counts[1]=0;
      cpu.splat(e.point,e.radius,e.team,e.opts);
      const width=cpu.extent('x').width;
      assert.ok(width>1,`${label} footprint ${width}@${hz}Hz`);
      rates[hz][label]={contract,width,stretch:e.opts.stretchAmt};
    }
  }
  for(const hz of [30,60,120]){
    const low=rates[hz].low,high=rates[hz].high;
    approx(low.stretch,1.4);  // horizontal break/free maximum (DepthScaleMaxBreakFree 2.4)
    approx(high.stretch,.2);  // horizontal break/free minimum (DepthScaleMaxBreakFree 1.2)
    assert.notEqual(low.stretch,high.stretch);
    assert.ok(low.width-high.width>1,`low ${low.width} vs high ${high.width}@${hz}Hz`);
  }
  // Rate invariance: 60/120 Hz produce the identical CPU mask width and paint contract of 30 Hz.
  for(const drop of ['low','high'])
    for(const hz of [60,120])
      assert.deepEqual(rates[hz][drop],rates[30][drop],`${drop}@${hz}Hz matches 30Hz`);
});

test('#713 non-roller impact paint stays native and the roller selectors stay inert',async()=>{
  const f=await batchFixture(),V=f.THREE.Vector3;
  const a=f.make('shooter');a.isLocal=true;a.grounded=true;f.G.camera={position:new V()};
  f.G.projectiles.fireShooter(a,a.weapon,0);
  const p=f.G.projectiles.list[0];
  assert.equal(p.type,'shot');
  assert.equal(p.fidelityRollerUnit??null,null);
  f.paint.length=0;
  const hit={point:p.start.clone().add(new V(8,0,0)),normal:new V(0,1,0)};
  f.G.projectiles._impact(p,hit);
  assert.equal(f.paint.length,1);
  // #79 replaces the floor shot's native stretch and jittered radius with the sourced Shooter footprint:
  // grazing impact takes the straight Max envelope (DepthScaleMax 2.24, stretch = depth - 1) and the
  // radius interpolates WidthMiddle 1.93 -> WidthFar 1.71 from DistanceMiddle 1.1 to the weapon range.
  approx(f.paint[0].opts.stretchAmt,2.24-1);
  approx(f.paint[0].radius,1.93+(1.71-1.93)*(8-1.1)/(a.weapon.range-1.1),1e-9);
  // Wall contact keeps the native path (#79), so the native constant and random radius band still apply.
  f.paint.length=0;
  f.G.projectiles._impact(p,{point:hit.point,normal:new V(-1,0,0)});
  assert.equal(f.paint.length,1);
  approx(f.paint[0].opts.stretchAmt,.7); // native _impact constant: #713 never rewrites it
  assert.ok(f.paint[0].radius>=0.85*p.radius&&f.paint[0].radius<=1.15*p.radius,
    'native random radius band, not the roller replacement radius');
  // Roller selectors are inert without a Roller unit record.
  assert.equal(rollerBreakFreeHeightUnit(p,5),null);
  assert.equal(rollerImpactHeightDepthScale(p,5),null);
  assert.equal(rollerImpactDepthScale(p,hit.normal,5),null);
});
