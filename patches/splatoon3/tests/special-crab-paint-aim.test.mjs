import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';
import {crabShooterSplashPlan, crabShooterDamage} from '../runtime/crab-tank-projectile.mjs';
const extraExports=`export {crabTankShotGeometry} from './patches/splatoon3/runtime/crab-tank-aim.mjs';`;
async function setup({terrain=false}={}){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports});
  const world=terrain?makePaintWorld(f):null;
  if(!terrain)f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  const a=f.make();a.pos.set(0,0,0);a.vel.set(0,0,0);a._resolve=()=>{};
  a.weapon={...a.weapon,special:'crabTank',specialCost:100};a.special=100;
  a.aimDir.set(0,0,1);a.aimPoint.set(0,1,100);a.aimYaw=0;a.aimPitch=0;
  f.G.actors=[a];f.setRandom(()=>.37);a._startSpecial();
  return {f,a,world};
}
function advance(a,seconds,hz=60){for(let i=0;i<Math.round(seconds*hz);i++)a._updateSpecial(1/hz);}

test('Crab source identity and applied paint/collision values agree with the archived PvP table',async()=>{
  const raw=fs.readFileSync(new URL('../../../reports/inkwave-crab-source-audit-2026-10-17/WeaponSpChariot.game__GameParameterTable.json',import.meta.url));
  assert.equal(createHash('sha256').update(raw).digest('hex'),'6cd8048512e030276bf7bc889490838a4346f1108505dbb70eb6e424dbcdf252');
  const source=JSON.parse(raw).GameParameters,{f,a}=await setup();advance(a,20/60);
  for(const mode of ['shooter','cannon']){
    a.intent.fire=mode==='shooter';a.intent.sub=mode==='cannon';a._s3AllSpecialState.nextShot=a._s3AllSpecialState.nextCannon=0;
    a._updateSpecial(1/60);const p=f.G.projectiles.list.at(-1);
    const c=mode==='shooter'?source.ShooterCollisionParam:source.CannonParam.CollisionParam;
    assert.equal(p.fidelityFieldCollision.initRadius,c.InitRadiusForField);assert.equal(p.fidelityFieldCollision.endRadius,c.EndRadiusForField);
    assert.equal(p.fidelityPlayerCollision.initRadius,c.InitRadiusForPlayer);assert.equal(p.fidelityPlayerCollision.endRadius,c.EndRadiusForPlayer);
    if(mode==='shooter'){
      assert.equal(p.radius,source.ShooterPaintParam.WidthHalfNear);
      assert.equal(p.s3CrabFlightPaint.spec.width,source.ShooterSplashPaintParam.WidthHalf);
    }else{
      assert.equal(p.s3CrabFlightPaint.spec.count,source.CannonParam.SplashParam.SpawnParam.SpawnNum);
      assert.equal(p.s3CrabFlightPaint.spec.spacing,source.CannonParam.SplashParam.SpawnParam.SpawnBetweenLength);
      assert.equal(p.s3CrabFlightPaint.spec.width,source.CannonParam.SplashParam.DrawSizeCollisionPaintParam.PaintWidthHalf);
    }
  }
  assert.equal(source.CannonParam.MoveParam.SpawnSpeed,undefined,'a missing PvP default is not certified by this fixture');
});

test('Crab shooter fractional splash count and eight-way phase are independent of render frames',()=>{
  const plans=Array.from({length:8},(_,i)=>crabShooterSplashPlan(i));
  assert.deepEqual(plans.map(p=>p.count),[2,3,2,3,2,3,2,3]);
  assert.deepEqual(plans.map(p=>p.first),[9.75,8.5,7.25,6,4.75,3.5,2.25,1]);
  assert.equal(plans.filter(p=>p.feet).length,1);
  assert.throws(()=>crabShooterSplashPlan(-1));
  assert.equal(crabShooterDamage(9/60),32);assert.equal(crabShooterDamage(17/60),24);assert.equal(crabShooterDamage(25/60),16);
});

test('Actual Crab emissions use the same muzzle and four-axis aim as their gun rig',async()=>{
  const {f,a}=await setup();advance(a,20/60);
  for(const [yaw,pitch] of [[-.7,0],[.7,0],[0,.6],[0,-.6]])for(const mode of ['shooter','cannon']){
    a.aimDir.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
    a.aimPoint.copy(a.pos).addScaledVector(a.aimDir,100);a.aimPoint.y+=1;
    const state=a._s3AllSpecialState;state.nextShot=0;state.nextCannon=0;
    a.intent.fire=mode==='shooter';a.intent.sub=mode==='cannon';
    a._updateSpecial(1/60);const p=f.G.projectiles.list.at(-1);
    assert.equal(p.s3AllSpecialMode,mode);
    const pos=new f.THREE.Vector3(),dir=pos.clone();f.crabTankShotGeometry(a,mode,pos,dir);
    assert.ok(p.start.distanceTo(pos)<1e-10);
    assert.ok(p.vel.clone().normalize().distanceTo(dir)<1e-10,'no added upward cannon arc');
    assert.ok(mode==='cannon'||p.vel.length()>200);
  }
});

test('Crab source-frame startup, repeat, finish lock and ball exit are stable at 20/30/60/120Hz',async()=>{
  const rows=[];
  for(const hz of [20,30,60,120]){
    const {f,a}=await setup();const shots=[];
    f.on('all:special',e=>{if(e.actor===a&&e.action==='shot')shots.push(Math.round(a.specialActive.t*60));});
    a.intent.fire=true;advance(a,2,hz);rows.push(shots);
    a.intent.squid=true;advance(a,.1,hz);a.intent.squid=false;a.intent.sub=true;
    const before=f.G.projectiles.list.length;advance(a,.3,hz);
    assert.equal(f.G.projectiles.list.length,before,'both modes locked for20F after ball');
    advance(a,.1,hz);assert.ok(f.G.projectiles.list.length>before);
    a.intent.sub=false;a._s3AllSpecialState.t=8-25/60;a.specialActive.t=a._s3AllSpecialState.t;
    const last=f.G.projectiles.list.length;advance(a,.3,hz);
    assert.equal(f.G.projectiles.list.length,last,'no shooter in final25F');
  }
  for(const row of rows.slice(1))assert.deepEqual(row,rows[0]);assert.equal(rows[0][0],20);
});

test('Crab detached floor ink lands after the head and clears on match teardown',async()=>{
  const {f,a}=await setup({terrain:true});a.aimPoint.set(0,1,100);a.intent.fire=true;advance(a,20/60);a.intent.fire=false;
  const p=f.G.projectiles.list.at(-1);assert.ok(p);
  for(let i=0;i<4;i++)f.G.projectiles.update(1/60);
  assert.ok(f.G.projectiles._s3SplashDrops?.length>0,'distance-scheduled droplets exist in the actual queue');
  const before=f.G.paint.counts[0];f.G.projectiles.list.length=0;a.specialActive=null;
  for(let i=0;i<120;i++){f.G.projectiles.update(1/60);f.G.paint.advanceSimulation(1/60);}
  assert.ok(f.G.paint.counts[0]>before,'detached ink reaches real floor after head removal');
  assert.equal(a.special,0,'special paint never refills its own gauge');
  f.G.projectiles.clear();assert.equal(f.G.projectiles._s3SplashDrops.length,0);
  f.G.projectiles.pool.push(p);const reused=f.G.projectiles._new();assert.equal(reused.s3CrabFlightPaint,undefined);
});

test('Crab wall ink uses separate sourced shock/fall/ground states on actual terrain',async()=>{
  const {f,a}=await setup();makePaintWorld(f,{wall:true});f.G.actors=[a];
  a.pos.set(0,0,0);a.aimPoint.set(0,1,100);a.intent.fire=true;advance(a,20/60);a.intent.fire=false;
  const seen=[],native=f.G.paint.splat;
  f.G.paint.splat=function(pos,r,team,opts){seen.push({r,face:opts.face,mode:opts.claimMode});return native.call(this,pos,r,team,opts);};
  for(let i=0;i<120;i++){f.G.projectiles.update(1/60);f.G.paint.advanceSimulation(1/60);}
  assert.ok(seen.some(p=>p.r===1.3&&p.face===1),'wall shock uses source radius1.3');
  assert.ok(seen.some(p=>p.r===.65&&p.face===1),'wall fall uses source radius.65');
  assert.ok(seen.every(p=>p.mode==='no-special'),'delayed wall and floor ink do not charge special');
});

test('Crab newborn splash age and trajectory agree across coarse and high-frequency host updates',async()=>{
  const paths=[];
  for(const hz of [30,60,120]){
    const {f,a}=await setup({terrain:true});a.pos.y=8;a.aimPoint.set(0,9,100);
    a.intent.fire=true;advance(a,20/60);a.intent.fire=false;
    for(let i=0;i<hz*.3;i++)f.G.projectiles.update(1/hz);
    paths.push(Array.from(f.G.projectiles._s3SplashDrops,d=>[d.frames,...d.pos.toArray(),...d.vel.toArray()]));
  }
  assert.equal(paths[0].length,2);
  for(const drops of paths.slice(1))for(let i=0;i<drops.length;i++)for(let j=0;j<drops[i].length;j++)
    assert.ok(Math.abs(drops[i][j]-paths[0][i][j])<1e-8,`drop ${i} component ${j} uses the same source age`);
});

test('Crab direct damage decays at the actual swept contact time at 30/60/120Hz',async()=>{
  const values=[];
  for(const hz of [30,60,120]){
    const {f,a}=await setup();a.intent.fire=true;advance(a,20/60);a.intent.fire=false;
    const p=f.G.projectiles.list.at(-1),victim=f.make();victim.team=1;victim.pos.set(0,.3,1.5);
    f.G.actors=[victim];p.pos.set(0,1,0);p.prev.copy(p.pos);p.start.copy(p.pos);p.vel.set(0,0,60);p.age=16/60;
    const hits=[];f.G.projectiles.applyHit=(_owner,target,amount)=>hits.push({target,amount});
    for(let i=0;i<4&&!hits.length;i++)f.G.projectiles._step(p,1/hz);
    assert.equal(hits.length,1);assert.equal(hits[0].target,victim);
    const contact=p.fidelityPrevAge+(p.age-p.fidelityPrevAge)*p.fidelityImpactT;
    assert.ok(Math.abs(hits[0].amount-crabShooterDamage(contact))<1e-9);
    values.push(hits[0].amount);
  }
  for(const value of values.slice(1))assert.ok(Math.abs(value-values[0])<1e-9);
});

test('Crab rolling paints its entire grounded path without waiting for contact damage',async()=>{
  for(const hz of [20,30,60,120]){
    const {f,a}=await setup({terrain:true});const calls=[],native=f.G.paint.splat;
    f.G.paint.splat=function(pos,r,team,opts){calls.push({x:pos.x,z:pos.z,r,opts});return native.call(this,pos,r,team,opts);};
    a._integrate=function(dt){this.pos.addScaledVector(this.vel,dt);};a.intent.squid=true;a.intent.move.set(0,0,1);
    advance(a,1,hz);
    assert.ok(calls.length>30,`${hz}Hz ground ink decoupled from .45s damage`);
    assert.ok(calls.every(c=>c.opts.claimMode==='no-special'&&c.opts.face===0));
    const centres=calls.map(c=>c.z).sort((x,y)=>x-y);
    for(let i=1;i<centres.length;i++)assert.ok(centres[i]-centres[i-1]<=.45+1e-8);
    assert.ok(f.G.paint.counts[0]>0);
    const count=calls.length;a.grounded=false;a._integrate=function(dt){this.pos.addScaledVector(this.vel,dt);};
    advance(a,.2,hz);assert.equal(calls.length,count,'airborne ball does not project ink through the floor');
  }
});
