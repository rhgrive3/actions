import test from 'node:test';
import assert from 'node:assert/strict';
import { INK_PROFILES as P, INK_MODEL, splashPlan, launchSpeed, advanceInkFrame, damageAt, referenceReach, paintShape, splashShape, correctInkAim, seededUnit } from '../../inkwave-public/src/game/inkFlight.js';
const near = (a,b,e=1e-9) => assert.ok(Math.abs(a-b)<e, `${a} != ${b}`);
function projectile(profile=P.shooter) { return { pos:{x:0,y:0,z:0}, vel:{x:0,y:0,z:launchSpeed(profile)},inkFrame:0,inkPhase:0}; }

test('pinned numerical facts are separate by weapon', () => {
  assert.deepEqual(Object.values(P).map(p=>[p.motion.speed,p.motion.straightFrames,p.motion.endSpeed]), [[2.266,4,1.493],[2.37,3,2.3425],[1.05,8,1.5105]]);
  assert.deepEqual(Object.values(P).map(p=>[p.splash.count,p.splash.splits,p.splash.spacing]), [[1.5,8,9.2],[1,7,14],[1,8,20]]);
  assert.deepEqual(Object.values(P).map(p=>p.collision.field),[.2,.2,.2]);
  assert.deepEqual(Object.values(P).map(p=>p.splash.radius),[1.472,1.55825,1.493]);
  assert.ok(Object.isFrozen(P.shooter.motion));
});
test('4F straight; cap, 36% resistance then gravity on frame 5', () => {
  const p=projectile(); for(let i=0;i<4;i++) advanceInkFrame(p,P.shooter);
  near(p.pos.z,9.064); near(p.pos.y,0); near(p.vel.z,135.96);
  advanceInkFrame(p,P.shooter); near(p.vel.z,1.493*.64*60); near(p.vel.y,-.07*60);
  near(p.pos.z,9.064+1.493*.64); near(p.pos.y,-.07); assert.equal(p.inkPhase,1);
});
test('braking is Y-threshold based, with independent free drag/gravity', () => {
  const p=projectile(); while(p.inkPhase!==2) advanceInkFrame(p,P.shooter);
  assert.equal(p.inkFrame,8); assert.ok(p.vel.y<-.15*60);
  const {x,y,z}=p.vel; advanceInkFrame(p,P.shooter);
  near(p.vel.x,x*.98); near(p.vel.y,y*.98-.016*60); near(p.vel.z,z*.98);
});
test('damage falloff has its own clock, independent from flight state', () => {
  near(damageAt(P.shooter,7/60),36); near(damageAt(P.shooter,8/60),36);
  near(damageAt(P.shooter,24/60),27); near(damageAt(P.shooter,40/60),18);
  near(damageAt(P.dualies,11/60),22.5); near(damageAt(P.splatling,15/60),22.5);
});
test('fractional budget is 1,2 with force-nearest on rounds 4/8', () => {
  const plans=Array.from({length:16},(_,i)=>splashPlan(P.shooter,i));
  assert.deepEqual(plans.map(p=>p.count),[1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2]);
  assert.deepEqual(plans.map((p,i)=>p.feet?i+1:null).filter(Boolean),[4,8,12,16]);
  assert.equal(plans[3].first,1.2); assert.equal(plans[7].first,1.2);
  for (let i=0;i<8;i++) assert.deepEqual(plans[i],plans[i+8]);
});
test('model explicitly identifies unresolved exact pattern ordering',()=>{
  assert.match(INK_MODEL.patternModel,/uniform/);
  assert.throws(()=>splashPlan(P.shooter,-1), RangeError);
  assert.throws(()=>splashPlan(P.shooter,NaN), RangeError);
});
test('nominal Heavy Splatling speed follows its first charge, not Shooter speed',()=>{
  near(launchSpeed(P.splatling,0),63); near(launchSpeed(P.splatling,.4),94.5);
  near(launchSpeed(P.splatling,.8),126); near(launchSpeed(P.splatling,1.2),126);
  assert.ok(referenceReach(P.splatling,.8)>referenceReach(P.splatling,.1));
});
test('seeded drop jitter is deterministic and bounded',()=>{
  for(let i=0;i<1000;i++) {const n=seededUnit(.33,i);assert.ok(n>=0&&n<1);assert.equal(n,seededUnit(.33,i));}
  assert.notEqual(seededUnit(.33,1),seededUnit(.34,1));
});
test('paint changes continuously with distance, angle and drop height',()=>{
  near(paintShape(P.shooter,1.1,10,0,0).radius,1.93);
  near(paintShape(P.shooter,20,35,0,0).radius,1.71);
  near(paintShape(P.shooter,10,10,0,0).stretch,1.24);
  near(paintShape(P.shooter,10,35,0,0).stretch,.31);
  near(paintShape(P.shooter,10,90,2,10).stretch,.12);
  near(splashShape(P.shooter,true,0).radius,2.0608);
  near(splashShape(P.splatling,false,10).stretch,.6);
});
test('aim correction and guide use the actual fixed-frame flight',()=>{
  const from={x:0,y:1.05,z:0}, target={x:0,y:1.05,z:10.5},dir={x:0,y:0,z:1};
  assert.equal(correctInkAim(P.shooter,from,dir,target,135.96,referenceReach(P.shooter)),true);
  const p=projectile();Object.assign(p.vel,{x:dir.x*135.96,y:dir.y*135.96,z:dir.z*135.96});
  let y;for(let i=0;i<30;i++){const old={...p.pos};advanceInkFrame(p,P.shooter);if(p.pos.z>=10.5){y=old.y+(p.pos.y-old.y)*(10.5-old.z)/(p.pos.z-old.z);break;}}
  near(y,0,.025);
  assert.equal(correctInkAim(P.shooter,from,{x:0,y:0,z:1},{x:0,y:1,z:50},135.96,referenceReach(P.shooter)),false);
});
