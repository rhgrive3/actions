import { test } from 'node:test';
import assert from 'node:assert/strict';
import {fixture as ballisticFixture} from './weapon-edgecases-fixture.mjs';
import {fidelityPlayerCollisionRadius as radius} from '../runtime/weapons-fidelity.mjs';
import { FixedClock } from '../runtime/clock.mjs';
const near = (a, b) => assert.ok(Math.abs(a-b) < 1e-10, `${a} != ${b}`);
async function setup(kind = 'splatling') {
 const f=await ballisticFixture(),a=f.make(kind),ps=new f.Projectiles(new f.THREE.Scene());f.setRandom(()=>.5);f.G.actors=[];f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};a.aimDir.set(0,0,1);return {...f,a,ps};
}
function fire(f){if(f.a.weapon.kind==='shooter')f.ps.fireShooter(f.a,f.a.weapon,0);else f.ps.fireSplatling(f.a,f.a.weapon,0);return f.ps.list.at(-1);}
test('#403 canonical main collision endpoints preserve Heavy/Shooter ratio and immutable flight ownership',async()=>{
 const f=await setup(),spin=fire(f);f.a.setWeapon('shooter');const shot=fire(f);
 near(radius(spin),.225);near(radius(shot),.285);near(radius(spin)/radius(shot),.225/.285);
 // New main owns raw-to-world mapping. Old .15 calibration and presentation size cannot override it.
 spin.size=99;shot.size=.00001;near(radius(spin),.225);near(radius(shot),.285);f.a.setWeapon('blaster');near(radius(spin),.225);assert.equal(spin.s3PlayerRadius,undefined);f.ps.clear();
});
test('#403 canonical continuous capsule has a Shooter-hit/Heavy-miss grazing band',async()=>{
 for(const kind of ['shooter','splatling']){
  const f=await setup(kind),p=fire(f),enemy=f.make();enemy.team=1;enemy.invuln=0;enemy.pos.set(f.PLAYER.radius+(.225+.285)/2,0,0);f.G.actors=[enemy];
  p.pos.set(0,1.05,-1);p.start.copy(p.pos);p.vel.set(0,0,120);p.straight=1;p.trailEvery=0;const hits=[];f.ps.applyHit=(_a,target)=>hits.push(target);
  f.ps._step(p,1/60);assert.equal(hits.length,kind==='shooter'?1:0);if(hits.length)assert.equal(hits[0],enemy);f.ps.clear();
 }
});
test('#403 capsule owner preserves world-before-player obstruction for both weapons',async()=>{
 for(const kind of ['shooter','splatling']){
  const f=await setup(kind),p=fire(f),enemy=f.make();enemy.team=1;enemy.pos.set(0,0,0);f.G.actors=[enemy];p.prev.set(0,1.05,-2);p.pos.set(0,1.05,2);
  const V=f.THREE.Vector3,wall={id:0,solid:true,center:new V(0,1,-.5),half:new V(10,2,.02),axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]};
  f.G.physics=new f.Physics({blocks:[wall],faces:[],queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;out.push(0);return out;}});
  assert.equal(f.fidelityProjectileTargets(f.ps,p).length,0);f.ps.clear();
 }
});
test('#403 charge cannot change the collider; pool reset clears canonical collision records',async()=>{
 const f=await setup(),p=fire(f);for(const charge of [0,.2,2/3,1]){f.a.weaponRunner.charge=charge;near(radius(fire(f)),.225);}f.a.setWeapon('shooter');near(radius(p),.225);
 f.ps.list.splice(f.ps.list.indexOf(p),1);f.ps.pool.push(p);const reused=f.ps._new();assert.equal(reused,p);assert.equal(reused.fidelityPlayerCollision,null);reused.size=.77;near(radius(reused),.77);f.ps.clear();
});
test('#403 raw field radius is separate and ghost collider never grants damage or paint authority',async()=>{
 const f=await setup(),p=fire(f);near(p.fidelityFieldCollision.initRadius,.2);near(p.radius,f.a.weapon.impactRadius);near(p.trailRadius,f.a.weapon.trailRadius);
 f.ps.list.length=0;f.ps.pool.push(p);const event=[0,'p',0,'shot','splatling',0,1,0,0,0,10,0,1,.2,1,.15,28,.8,0,0,.1,.8,1,0,0,0,0];f.ps.ghostProjectile(f.a,event);const ghost=f.ps.list[0];assert.ok(ghost.ghost);near(radius(ghost),.225);
 let hits=0,paint=0;f.ps.applyHit=()=>hits++;f.G.paint.splat=()=>paint++;f.applyFidelityProjectileHit(f.ps,ghost,f.make(),28,ghost.pos);assert.equal(hits,0);assert.equal(paint,0);f.ps.clear();
});
test('#470: every active charge sample uses 3.72 independent of percent; stream remains 4.2', async () => {
  const f=await ballisticFixture(),a=f.make('splatling'),r=a.weaponRunner;
  for(const frame of [1,12,24,48,60,72]){r.charging=true;r.charge=frame/72;near(r.moveSpeed(),3.72);}
  r.charging=false;r.streaming=true;r.firingT=.35;near(r.moveSpeed(),4.2);
  r.lockT=.1;r.charging=true;near(r.moveSpeed(),0);
});
test('#470: gear/Flow multiply charge target once and never restore the progress ramp', async () => {
  const f=await ballisticFixture(),a=f.make('splatling'),r=a.weaponRunner;
  a.s3.loadout=Array.from({length:3},()=>({main:'runSpeed',subs:['runSpeed','runSpeed','runSpeed']}));a.setWeapon('splatling');
  r.charging=true;r.charge=.01;const boosted=r.moveSpeed();assert.ok(boosted>3.72);
  r.charge=1;near(r.moveSpeed(),boosted);a.s3.flow.active=true;near(r.moveSpeed(),boosted*f.profile.flow.runMultiplier);
});
test('#470: actual 48/72 charge, prepaid ink and 4f stream cadence stay unchanged', async () => {
  const f=await ballisticFixture(),a=f.make('splatling'),r=a.weaponRunner; const targets=[];
  for(let frame=1;frame<=73;frame++){r.update(1/60,{fire:true});if(r.charging)targets.push(r.moveSpeed());if(frame===48)near(r.charge,2/3);}
  near(r.charge,1);assert.ok(targets.every(s=>Math.abs(s-3.72)<1e-10));
  r.update(1/60,{fire:false});near(a.ink,77.5);const releaseInk=a.ink;const shotFrames=[];let count=f.shots.length;
  for(let i=0;i<100;i++){r.update(1/60,{fire:false});if(f.shots.length>count){shotFrames.push(i);count=f.shots.length;}}
  for(let i=1;i<shotFrames.length;i++)assert.equal(shotFrames[i]-shotFrames[i-1],4);near(a.ink,releaseInk);
});
test('#470: 30/60/120 render schedules produce identical fixed-clock charge/stream targets', async () => {
  const traces=[];
  for(const hz of [30,60,120]){const f=await ballisticFixture(),a=f.make('splatling'),r=a.weaponRunner,clock=new FixedClock(),trace=[];
    for(let render=0;render<hz*2;render++)clock.advance(1/hz,dt=>{r.update(dt,{fire:clock.ticks<73});trace.push([r.charging,r.streaming,r.charge,r.moveSpeed(),f.shots.length,a.ink]);});
    traces.push(trace);
  }
  assert.deepEqual(traces[1],traces[0]);assert.deepEqual(traces[2],traces[0]);
});
