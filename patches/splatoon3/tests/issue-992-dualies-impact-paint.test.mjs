import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from '../../../scripts/weapons-fixture.mjs';
import { fixture as fullFixture } from './source-fixture.mjs';
import { dualiesImpactPaintSource } from '../runtime/weapons-fidelity.mjs';

const profile=JSON.parse(fs.readFileSync(new URL('../profile.json',import.meta.url),'utf8'));
const raw=profile.weaponsFidelityCompletion.weapons.dualies;
const near=(actual,expected,message='')=>assert.ok(Math.abs(actual-expected)<1e-9,`${message}: ${actual} != ${expected}`);
const point=(x,y,z)=>({x,y,z,distanceTo(other){return Math.hypot(x-other.x,y-other.y,z-other.z);}});
function sample(distance,angle,phase=0,scale=1) {
  const radians=angle*Math.PI/180;
  const p={type:'shot',s3Weapon:{kind:'dualies'},start:point(0,0,0),
    vel:point(Math.cos(radians),-Math.sin(radians),0),fidelityPhase:phase};
  const hit={point:point(distance*scale,0,0),normal:point(0,1,0)};
  return {p,hit,result:dualiesImpactPaintSource(p,hit,raw,scale)};
}

test('#992 source distances interpolate near/middle/far width using one explicit world scale',()=>{
  near(sample(0,10).result.radius,1.71);
  near(sample(1.1,10).result.radius,1.71);
  near(sample(10.55,10).result.radius,(1.71+1.66)/2);
  near(sample(20,10).result.radius,1.66);
  near(sample(50,10).result.radius,1.66);
  near(sample(10.55,10,0,.3).result.radius,(1.71+1.66)/2*.3);
  const {p,hit}=sample(2,10);
  const threeAnchors={PaintParam:{...raw.PaintParam,DistanceNear:1,DistanceMiddle:3,DistanceFar:7,WidthHalfNear:1,WidthHalfMiddle:2,WidthHalfFar:3}};
  near(dualiesImpactPaintSource(p,hit,threeAnchors).radius,1.5);
});

test('#992 straight impact angle uses 10/35 degree source envelope independently of width',()=>{
  for(const [angle,depth] of [[0,2.24],[10,2.24],[22.5,1.775],[35,1.31],[90,1.31]]) {
    near(sample(10.55,angle).result.radius,1.685);
    near(sample(10.55,angle).result.depthScale,depth,`angle ${angle}`);
  }
  // The original parameter research does not identify the break/free height
  // selector. Radius can be corrected without inventing its missing formula.
  assert.equal(sample(10.55,22.5,1).result.depthScale,null);
  assert.equal(sample(10.55,22.5,2).result.depthScale,null);
});

test('#992 unrelated, ghost, wall, malformed and special projectiles stay outside the floor contract',()=>{
  for(const change of [p=>p.ghost=true,p=>p.s3SpecialWeapon=true,p=>p.type='drop',p=>p.s3Weapon.kind='shooter']) {
    const {p,hit}=sample(10,10);change(p);assert.equal(dualiesImpactPaintSource(p,hit,raw),null);
  }
  const {p,hit}=sample(10,10);
  hit.normal=point(0,0,1);assert.equal(dualiesImpactPaintSource(p,hit,raw),null);
  hit.normal=point(0,1,0);assert.equal(dualiesImpactPaintSource(p,hit,raw,NaN),null);
  assert.equal(dualiesImpactPaintSource(p,hit,{PaintParam:{...raw.PaintParam,DistanceFar:1}}),null);
});

async function impactCase({distance=10.55,angle=22.5,phase=0,ghost=false,throws=false}={}) {
  const f=await fixture({fidelity:true}),a=f.make('dualies');
  f.projectiles.fireDualies(a,a.weapon,0,0);
  const p=f.projectiles.list[0],radians=angle*Math.PI/180;
  p.start.set(0,0,0);p.pos.set(distance,0,0);p.vel.set(Math.cos(radians),-Math.sin(radians),0);
  p.fidelityPhase=phase;p.ghost=ghost;
  const hit={point:p.pos.clone(),normal:new f.THREE.Vector3(0,1,0),face:0};
  f.paints.length=0;
  if(throws)f.G.paint.splat=()=>{throw new Error('paint sink');};
  const before=f.G.paint.splat,draws=f.draws();
  if(throws)assert.throws(()=>f.projectiles._impact(p,hit),/paint sink/);
  else f.projectiles._impact(p,hit);
  assert.equal(f.G.paint.splat,before,'temporary first-splat interception restores the real paint sink');
  return {f,a,p,draws:f.draws()-draws};
}

test('#992 actual Dualies impact sends source width/angle to CPU paint and credits its returned area',async()=>{
  const {f,a}=await impactCase();
  assert.equal(f.paints.length,1);
  near(f.paints[0].radius,1.685);
  near(f.paints[0].stretchAmt,.775);
  assert.deepEqual(Array.from(f.paints[0].stretch),[1,0,0]);
  assert.ok(f.paints[0].area>0);
  near(a.turf,f.paints[0].area);
  const repeated=await impactCase();
  assert.deepEqual(JSON.parse(JSON.stringify(repeated.f.paints)),JSON.parse(JSON.stringify(f.paints)),'same seed gives identical authoritative mask and score');
});

test('#992 break/free width still improves while unknown depth keeps its existing presentation',async()=>{
  const {f}=await impactCase({distance:20,phase:2});
  near(f.paints[0].radius,1.66);near(f.paints[0].stretchAmt,.7);
});

test('#992 actual ghost paint remains suppressed and sink restoration survives an exception',async()=>{
  const {f,a}=await impactCase({ghost:true});assert.equal(f.paints.length,0);assert.equal(a.turf,undefined);
  await impactCase({throws:true});
});

test('#992 live Dualies wall collision retains the separate sourced wall-drop owner',async()=>{
  const f=await fixture({fidelity:true,floor:false}),a=f.make('dualies',{y:3});
  f.wall(6,{height:20});
  a.aimDir.set(0,0,1);a.aimPoint.set(0,4.05,100);
  f.projectiles.fireDualies(a,a.weapon,0,0);
  const p=f.projectiles.list[0];
  let impacts=0;const impact=f.projectiles._impact;
  f.projectiles._impact=function(...args){impacts++;return impact.apply(this,args);};
  for(let frame=0;frame<30 && !p.fidelityWallDrop;frame++)f.projectiles.update(1/60);
  assert.ok(p.fidelityWallDrop,'wall contact must enter wall-drop state');
  assert.equal(impacts,0,'normal floor contract does not intercept wall-drop paint');
  assert.ok(f.paints.some(row=>row.radius===raw.WallDropCollisionPaintParam.PaintRadiusShock));
});

test('#992 30/60/120 Hz render schedules agree on live fixed-60Hz Dualies floor paint',async()=>{
  const outcomes=[];
  for(const rate of [30,60,120]) {
    const f=await fixture({fidelity:true}),a=f.make('dualies');
    a.aimDir.set(0,-.5,Math.sqrt(.75));a.aimPoint.copy(a.pos).addScaledVector(a.aimDir,100);
    f.projectiles.fireDualies(a,a.weapon,0,0);
    let carry=0;
    for(let frame=0;frame<rate;frame++) {
      carry+=1/rate;
      while(carry>=1/60-1e-10){f.G.time+=1/60;f.projectiles.update(1/60);carry-=1/60;}
    }
    assert.ok(f.paints.length>0,'live collision must reach a paintable floor');
    outcomes.push(JSON.parse(JSON.stringify({paints:f.paints,turf:a.turf}))); 
  }
  assert.deepEqual(outcomes[1],outcomes[0]);assert.deepEqual(outcomes[2],outcomes[0]);
});

test('#992 the complete production installer preserves the same terminal paint owner',async()=>{
  const f=await fullFixture({productionComposition:true,realProjectiles:true,fullRuntime:true});
  const a=f.make('dualies'),ps=f.G.projectiles,V=f.THREE.Vector3;
  f.G.camera={position:new V()};
  a.nid=42;a.owner='local';a.pos.set(0,1,0);a.aimPoint.set(0,1,10);a.aimDir.set(0,0,1);
  const paint=[];f.G.paint.splat=(center,radius,team,opts={})=>{paint.push({radius,depth:opts.stretchAmt});return 1;};
  ps.fireDualies(a,a.weapon,0,0);
  const p=ps.list[0];p.start.set(0,0,0);p.vel.set(Math.cos(Math.PI/8),-Math.sin(Math.PI/8),0);
  p.fidelityPhase=0;paint.length=0;
  ps._impact(p,{point:new V(10.55,0,0),normal:new V(0,1,0)});
  assert.equal(paint.length,1);near(paint[0].radius,1.685);near(paint[0].depth,.775);
});
