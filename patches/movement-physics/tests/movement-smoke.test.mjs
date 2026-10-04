import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  MOVEMENT_EPSILON,
  dodgeIntervalDistance,
  rollingMovementActive,
  rollingMovementSpeed,
  stepGroundVelocity,
} from '../../splatoon3/runtime/movement-physics.mjs';
import { adaptMovementPhysics } from '../../splatoon3/movement-physics-adapter.mjs';
import { FixedClock } from '../../splatoon3/runtime/clock.mjs';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const replaceOnce = (code, before, after, label) => {
  const i = code.indexOf(before);
  assert.ok(i >= 0, label);
  assert.equal(code.indexOf(before, i + before.length), -1, label);
  return code.slice(0, i) + after + code.slice(i + before.length);
};
const read = rel => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');

test('dodge curve integrates exactly to configured distance under irregular partitions', () => {
  for (const D of [.1, 2.8, 4, 10]) for (const duration of [.12, .2, .31]) {
    let x = 0, t = 0, i = 0;
    const parts = [.001, .037, .019, .08];
    while (t < duration) {
      const dt = parts[i++ % parts.length];
      x += dodgeIntervalDistance(D, duration, t, dt);
      t += dt;
    }
    close(x, D);
  }
});

test('roller movement is active only for grounded kid rolling outside flick/recovery/sub/special', () => {
  const runner = { rolling: true, flick: -1, flickRecover: 0, aimingSub: false, rollT: 0,
    a: null };
  const actor = { weaponRunner: runner, weapon: { kind: 'roller', rollBaseSpeed: 6.48, rollSpeed: 7.92, rollDashTime: 1.5 },
    form: 'kid', grounded: true, specialActive: null, superJumpState: null };
  runner.a = actor;
  assert.equal(rollingMovementActive(actor), true);
  close(rollingMovementSpeed(runner), 6.48);
  runner.rollT = actor.weapon.rollDashTime - MOVEMENT_EPSILON * .5;
  close(rollingMovementSpeed(runner), 7.92);
  for (const [obj, key, value] of [
    [runner, 'flick', .1], [runner, 'flickRecover', .1], [runner, 'aimingSub', true],
    [actor, 'grounded', false], [actor, 'form', 'squid'], [actor, 'specialActive', {}], [actor, 'superJumpState', {}],
  ]) {
    const old = obj[key]; obj[key] = value;
    assert.equal(rollingMovementActive(actor), false, key);
    obj[key] = old;
  }
});

test('build-only adapter changes only its explicit actor/weapons anchors', () => {
  const actor = read('src/game/actor.js');
  const weapons = read('src/game/weapons.js');
  const actorAfter = adaptMovementPhysics('src/game/actor.js', actor, replaceOnce);
  const weaponsAfter = adaptMovementPhysics('src/game/weapons.js', weapons, replaceOnce);
  assert.match(actorAfter, /integrateMovement\(this, dt, isSquid, jumped, PLAYER\.radius\)/);
  assert.match(actorAfter, /if \(mh > 1\) side\.multiplyScalar\(1 \/ mh\)/);
  assert.match(actorAfter, /rollingMovementActive\(this\)/);
  assert.match(actorAfter, /stepGroundVelocity\(this\.vel, mv\.x, mv\.z, vt, accel, dt\)/);
  assert.match(weaponsAfter, /rollingMovementSpeed\(this\)/);
  assert.match(weaponsAfter, /MOVEMENT_EPSILON/);
  assert.match(weaponsAfter, /writeDodgeVelocity\(this, vel, dt\)/);
  for (const rel of ['src/game/player.js','src/core/input.js','src/core/gyro.js','src/net/netmatch.js','src/game/character.js']) {
    assert.equal(adaptMovementPhysics(rel, 'UNCHANGED', replaceOnce), 'UNCHANGED');
  }
});


test('S3 grounded acceleration conversion and vector response match measured 60 Hz timing', () => {
  const profile=JSON.parse(fs.readFileSync(new URL('../../splatoon3/profile.json',import.meta.url),'utf8'));
  close(profile.player.s3GroundAccel, .01*60*60);
  close(profile.player.s3AttackGroundAccel, .02*60*60);

  const framesTo=(startX,startZ,mx,mz,target,accel)=>{
    const vel={x:startX,z:startZ};let frames=0;
    while(frames<120){
      stepGroundVelocity(vel,mx,mz,target,accel,1/60);frames++;
      const mag=Math.hypot(mx,mz),wantX=mag?mx/mag*target*Math.min(1,mag):0,wantZ=mag?mz/mag*target*Math.min(1,mag):0;
      if(Math.hypot(vel.x-wantX,vel.z-wantZ)<1e-9)return {frames,vel};
    }
    throw new Error('ground response did not converge');
  };
  assert.equal(framesTo(0,0,0,1,profile.player.runSpeed,36).frames,10);
  assert.equal(framesTo(0,0,0,1,profile.player.swimSpeed,36).frames,20);
  assert.equal(framesTo(0,profile.player.runSpeed,0,0,profile.player.runSpeed,36).frames,10);
  assert.equal(framesTo(0,profile.player.swimSpeed,0,0,profile.player.swimSpeed,36).frames,20);
  assert.equal(framesTo(0,profile.player.runSpeed,0,-1,profile.player.runSpeed,36).frames,20);

  const turn={x:0,z:profile.player.runSpeed};
  stepGroundVelocity(turn,1,0,profile.player.runSpeed,36,1/60);
  assert(turn.x>0 && turn.x<.5,'90 degree turn gains only a small lateral component on frame 1');
  assert(turn.z>5,'90 degree turn preserves most prior forward inertia on frame 1');
});

test('retained top speeds preserve S3 dimensionless ratios independent of world-scale interpretation',()=>{
  const p=JSON.parse(fs.readFileSync(new URL('../../splatoon3/profile.json',import.meta.url),'utf8'));
  close(p.player.swimSpeed/p.player.runSpeed,2);
  close(p.weapons.roller.rollBaseSpeed/p.player.runSpeed,1.125);
  close(p.weapons.roller.rollSpeed/p.player.runSpeed,1.375);
  close(p.player.enemyInkSpeed/p.player.runSpeed,.25);
  close(p.weapons.roller.rollDashTime,1.5);
});


test('direct ground integrator is partition-invariant at 30/60/120 Hz', () => {
  const profile=JSON.parse(fs.readFileSync(new URL('../../splatoon3/profile.json',import.meta.url),'utf8'));
  const segments=[
    { seconds: 0.1, x:0, z:1, speed:profile.player.runSpeed, accel:profile.player.s3GroundAccel },
    { seconds: 0.2, x:1, z:0, speed:profile.player.runSpeed, accel:profile.player.s3GroundAccel },
    { seconds: 0.2, x:-1, z:0, speed:profile.player.runSpeed, accel:profile.player.s3GroundAccel },
    { seconds: 0.1, x:0, z:0, speed:profile.player.runSpeed, accel:profile.player.s3GroundAccel },
    { seconds: 0.2, x:0, z:1, speed:profile.player.swimSpeed, accel:profile.player.s3GroundAccel },
  ];
  const run=hz=>{
    const vel={x:0,z:0}, checkpoints=[];
    for(const s of segments){
      const steps=Math.round(s.seconds*hz);
      close(steps/hz,s.seconds,1e-12);
      for(let i=0;i<steps;i++) stepGroundVelocity(vel,s.x,s.z,s.speed,s.accel,1/hz);
      checkpoints.push([vel.x,vel.z]);
    }
    return checkpoints;
  };
  const reference=run(120);
  for(const hz of [30,60]) {
    const got=run(hz);
    got.forEach((v,i)=>{ close(v[0],reference[i][0],1e-9); close(v[1],reference[i][1],1e-9); });
  }
});

test('30/60/120 Hz render schedules produce the same 60 Hz authoritative movement ticks', () => {
  const profile=JSON.parse(fs.readFileSync(new URL('../../splatoon3/profile.json',import.meta.url),'utf8'));
  const run=renderHz=>{
    const clock=new FixedClock(), vel={x:0,z:0}, trace=[];
    for(let frame=0;frame<renderHz*2;frame++) clock.advance(1/renderHz,()=>{
      const tick=clock.ticks;
      const phase=tick<30 ? [0,1] : tick<60 ? [1,0] : tick<90 ? [0,-1] : [0,0];
      stepGroundVelocity(vel,phase[0],phase[1],profile.player.runSpeed,profile.player.s3GroundAccel,1/60);
      trace.push([vel.x,vel.z]);
    });
    return {ticks:clock.ticks,vel,trace};
  };
  const reference=run(120);
  assert.equal(reference.ticks,120);
  for(const hz of [30,60]) {
    const got=run(hz);
    assert.equal(got.ticks,reference.ticks);
    assert.equal(got.trace.length,reference.trace.length);
    got.trace.forEach((v,i)=>{ close(v[0],reference.trace[i][0],1e-9); close(v[1],reference.trace[i][1],1e-9); });
  }
});
