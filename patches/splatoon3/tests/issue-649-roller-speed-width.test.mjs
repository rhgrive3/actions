import test from 'node:test';
import assert from 'node:assert/strict';
import {batchFixture,cpuFloor} from './batch03-fixture.mjs';
import {rollingMovementSpeed} from '../runtime/movement-physics.mjs';
import {FixedClock} from '../runtime/clock.mjs';

async function rollAt(speed, startFrame, {sideTarget=false, ink=100}={}) {
  const f=await batchFixture(),a=f.make('roller'),r=a.weaponRunner;
  const splat=f.G.paint.splat;
  // Feed one fixed seed to the real compositor so its CPU footprint is reproducible.
  f.G.paint.splat=(point,radius,team,opts={})=>splat(point,radius,team,{...opts,seed:.5});
  a.isLocal=true;a.alive=true;a.grounded=true;a.ink=ink;a.yaw=0;
  a.intent.move.set(0,0,1);a.vel.set(0,0,speed);
  r.rolling=true;r.rollT=startFrame/60;
  r.lastRollPos=a.pos.clone().add(new f.THREE.Vector3(0,0,-1));
  const hits=[];
  if(sideTarget){
    const target={team:1,alive:true,pos:a.pos.clone().add(new f.THREE.Vector3(2.4,0,.5))};
    f.G.actors=[target];
    const applyHit=f.G.projectiles.applyHit;
    f.G.projectiles.applyHit=(...args)=>{hits.push(args);return 'accepted';};
    f.restoreHit=()=>{f.G.projectiles.applyHit=applyHit;};
  }
  try { r._roller(1/60,{fire:true},a.weapon); }
  finally { f.restoreHit?.(); }
  const floor=cpuFloor(f,20,.025);
  f.paint.forEach(e=>floor.splat(e.point,e.radius,e.team,e.opts));
  return {f,a,r,hits,width:floor.extent('x').width};
}

test('#649 rolling side paint widens by ground speed from low roll to the sourced dash maximum',async()=>{
  const profile=await batchFixture();
  const movementOwner={a:{weapon:profile.WEAPONS.roller}};
  const beforeDashSpeed=rollingMovementSpeed({...movementOwner,rollT:89/60});
  const dashSpeed=rollingMovementSpeed({...movementOwner,rollT:90/60});
  const low=await rollAt(1,0);
  const normal=await rollAt(beforeDashSpeed,30);
  const beforeDash=await rollAt(beforeDashSpeed,88);
  const dash=await rollAt(dashSpeed,89,{sideTarget:true});
  const saturated=await rollAt(dashSpeed*1.5,90);
  const completion=dash.f.profile.weaponsFidelityCompletion;
  const source=completion.weapons.roller.BodyParam.PaintParam;

  assert.equal(completion.referenceHz,60);
  assert.equal(completion.worldUnitsPerSourceUnit,1);
  assert.equal(source.SpeedMax,.132);
  assert.equal(source.WidthHalfMax,2.8);
  assert.ok(Math.abs(dash.a.weapon.rollBaseSpeed-6.48)<1e-12);
  assert.ok(Math.abs(dash.a.weapon.rollSpeed-7.92)<1e-12);
  assert.equal(dash.a.weapon.rollDashTime,1.5);
  assert.ok(Math.abs(beforeDash.r.rollT-89/60)<1e-12,'89F remains normal roll');
  assert.ok(Math.abs(dash.r.rollT-90/60)<1e-12,'dash begins at 90F');

  for(const sample of [low,normal,beforeDash,dash]){
    assert.equal(sample.f.paint.length,5,'three native drum bands plus two floor side splashes');
    assert.ok(sample.f.paint.slice(0,3).every(e=>e.opts.kind==='roll'&&e.radius===.62));
    assert.ok(sample.f.paint.slice(3).every(e=>e.opts.kind==='rollFloor'));
  }
  assert.ok(low.width<normal.width,`low=${low.width}, normal=${normal.width}`);
  assert.ok(Math.abs(normal.width-beforeDash.width)<.04,`normal=${normal.width}, 89F=${beforeDash.width}`);
  assert.ok(normal.width<dash.width,`normal=${normal.width}, dash=${dash.width}`);
  const nativeHalf=dash.a.weapon.rollWidth*.33+Math.sqrt(.62**2-.35**2)*(.62+.1+.03+.018);
  const maxSpeed=source.SpeedMax*completion.referenceHz*completion.worldUnitsPerSourceUnit;
  for(const [sample,speed] of [[low,1],[normal,beforeDashSpeed],[beforeDash,beforeDashSpeed],[dash,dashSpeed]]){
    const ratio=Math.max(0,Math.min(1,speed/maxSpeed));
    const expectedHalf=nativeHalf+(source.WidthHalfMax*completion.worldUnitsPerSourceUnit-nativeHalf)*ratio;
    assert.ok(Math.abs(sample.width-2*expectedHalf)<.1,
      `speed=${speed}: measured=${sample.width}, linear proxy=${2*expectedHalf}`);
  }
  assert.ok(Math.abs(saturated.width-dash.width)<1e-9,'speed above SpeedMax remains clamped to #189 maximum');

  assert.equal(dash.hits.length,0,'floor side splash width does not expand Roller contact damage');
  assert.equal(dash.a.weapon.rollWidth,1.9,'native damage width is unchanged');
  assert.ok(Math.abs(100-dash.a.ink-dash.a.weapon.rollInkPerMeter)<1e-10,
    'the side splashes do not change native per-meter ink consumption');
});

test('#649 stopped and low-ink rolls keep the native body-only footprint; ink level does not scale width',async()=>{
  const stopped=await rollAt(0,60);
  assert.equal(stopped.f.paint.length,3,'a stopped drum emits only the three native body bands: hs=0 clamps the side bands away');
  assert.ok(stopped.f.paint.every(e=>e.opts.kind==='roll'&&e.radius===.62));
  const dry=await rollAt(6.48,30,{ink:.4});
  assert.equal(dry.f.paint.length,0,'ink at or below the 0.5 roll gate stops rolling before any paint emission');
  const lowInk=await rollAt(6.48,30,{ink:.6});
  const full=await rollAt(6.48,30);
  assert.equal(lowInk.f.paint.length,5,'ink just above the gate still rolls with both side bands');
  assert.ok(Math.abs(lowInk.width-full.width)<1e-9,
    'ink level does not scale the speed-derived width: only ground speed does');
  assert.ok(stopped.width<=lowInk.width+1e-9,'stopped footprint never exceeds the rolling one');
});

async function composedRoll(renderHz) {
  const f=await batchFixture(),a=f.make('roller'),r=a.weaponRunner,clock=new FixedClock();
  a.isLocal=true;a.yaw=0;a.alive=true;a.grounded=true;a.ink=100;
  a.character.update=()=>{};delete a._finishFrame;a.intent.move.set(0,0,1);
  r.update(1/60,{fire:true,firePressed:true});
  for(let i=0;i<42;i++)r.update(1/60,{fire:true});
  a.vel.set(0,0,0);
  const splats=[],speeds=[];
  f.G.paint.splat=(point,radius,_team,opts)=>{
    splats.push({tick:clock.ticks,x:point.x,y:point.y,z:point.z,radius,kind:opts.kind,seed:.5,
      stretch:opts.stretch?{x:opts.stretch.x,y:opts.stretch.y,z:opts.stretch.z}:undefined});
    return 1;
  };
  for(let i=0;i<150/60*renderHz;i++)clock.advance(1/renderHz,dt=>{
    a.ink=100;a._horizontal(dt,false,false);a.pos.x+=a.vel.x*dt;a.pos.z+=a.vel.z*dt;
    r.update(dt,{fire:true});speeds.push(Math.hypot(a.vel.x,a.vel.z));
  });
  return {f,clock,splats,speeds};
}

function footprintOf(f,splats,firstTick,lastTick) {
  const floor=cpuFloor(f,60,.05);
  for(const s of splats)if(s.tick>=firstTick&&s.tick<lastTick)
    floor.splat({x:s.x,y:s.y,z:s.z},s.radius,0,{seed:s.seed,kind:s.kind,stretch:s.stretch});
  return floor.extent('x').width;
}

test('#649 real composed paint and speed trace match at 30/60/120 Hz render schedules',async()=>{
  const runs={};
  for(const hz of [30,60,120])runs[hz]=await composedRoll(hz);
  for(const hz of [30,60,120]){
    assert.equal(runs[hz].clock.ticks,150,`${hz} Hz render schedule advances 150 fixed gameplay ticks`);
    assert.equal(runs[hz].speeds.length,150);
    assert.deepEqual(runs[hz].speeds,runs[60].speeds,`${hz} Hz speed trace`);
    assert.deepEqual(runs[hz].splats,runs[60].splats,`${hz} Hz emitted paint`);
  }
  const {f,splats,speeds}=runs[60];
  assert.ok(splats.some(s=>s.kind==='roll')&&splats.some(s=>s.kind==='rollFloor'));
  const early=footprintOf(f,splats,0,10),dash=footprintOf(f,splats,145,150);
  assert.ok(early<dash,`early roll width ${early} < settled dash width ${dash}`);
  assert.ok(Math.abs(dash-5.6)<.06,`dash reaches the #189 max width: ${dash}`);
  assert.ok(Math.abs(speeds[149]-f.WEAPONS.roller.rollSpeed)<1e-9,'settled at sourced dash speed');
});
