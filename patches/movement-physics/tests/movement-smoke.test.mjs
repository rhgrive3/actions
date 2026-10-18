import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  MOVEMENT_EPSILON,
  dodgeIntervalDistance,
  groundAcceleration,
  rollingMovementActive,
  rollingMovementSpeed,
  shedFormExitOverspeed,
  stepGroundVelocity,
} from '../../splatoon3/runtime/movement-physics.mjs';
import { adaptMovementPhysics } from '../../splatoon3/movement-physics-adapter.mjs';
import { FixedClock } from '../../splatoon3/runtime/clock.mjs';
import { reverseShotRelease } from '../../splatoon3/runtime/shooter-movement.mjs';
import { toxicMistScale } from '../../splatoon3/runtime/toxic-mist.mjs';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const replaceOnce = (code, before, after, label) => {
  const i = code.indexOf(before);
  assert.ok(i >= 0, label);
  assert.equal(code.indexOf(before, i + before.length), -1, label);
  return code.slice(0, i) + after + code.slice(i + before.length);
};
const read = rel => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');

// Execute the adapter's real methods without a browser/VM-module loader. Only
// their scalar context is supplied here; movement and admission use real helpers.
const adaptedMethod = (code, name, scope) => {
  const start = code.indexOf(`\n  ${name}(`), lineEnd = code.indexOf('\n', start + 1);
  const end = code[lineEnd - 1] === '}' ? lineEnd : code.indexOf('\n  }\n', start) + 4;
  assert.ok(start >= 0 && end > start, `missing adapted ${name} method`);
  return new Function(...Object.keys(scope), `return (class {${code.slice(start, end)}}).prototype.${name};`)(...Object.values(scope));
};
const nativePlayer = read('src/config.js').match(/export const PLAYER = (\{[\s\S]*?\n\});/);
assert.ok(nativePlayer, 'native player constants');
const PLAYER = { ...new Function(`return (${nativePlayer[1]});`)(),
  ...JSON.parse(fs.readFileSync(new URL('../../splatoon3/profile.json', import.meta.url), 'utf8')).player };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const adaptedRoller = (active = rollingMovementActive, speed = rollingMovementSpeed) => {
  const scope = { PLAYER, clamp, lerp, smoothstep, angleDiff, TAU: Math.PI * 2,
    rollingMovementActive: active, rollingMovementSpeed: speed, groundAcceleration,
    shedFormExitOverspeed, stepGroundVelocity, toxicMistScale, reverseShotRelease,
    _ZERO_MOVE: { x: 0, z: 0 } };
  const actorCode = adaptMovementPhysics('src/game/actor.js', read('src/game/actor.js'), replaceOnce);
  const runnerCode = adaptMovementPhysics('src/game/weapons.js', read('src/game/weapons.js'), replaceOnce);
  const a = { weapon: { kind: 'roller', rollBaseSpeed: 6.48, rollSpeed: 7.92, rollDashTime: 1.5,
    rollDashTurnBreakSpeed: 6.48, moveSpeedFiring: 3, flickWindup: .2 },
    form: 'kid', grounded: true, hardLand: 0, kidT: 1, fireFacing: 0,
    specialActive: null, superJumpState: null, intent: { move: { x: 1, z: 0 }, fire: false, sub: false },
    vel: { x: 0, z: 0 }, anim: {}, aimYaw: 0, yaw: 0, yawVel: 0, _faceTarget: null };
  a.weaponRunner = { a, rolling: true, flick: -1, flickRecover: 0, aimingSub: false, rollT: 0,
    lockT: 0, slosh: -1, firingT: 0, charging: false, streaming: false,
    moveSpeed: adaptedMethod(runnerCode, 'moveSpeed', scope),
    firingPose: adaptedMethod(runnerCode, 'firingPose', scope) };
  a._horizontal = adaptedMethod(actorCode, '_horizontal', scope);
  a._face = adaptedMethod(actorCode, '_face', scope);
  return a;
};

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

test('roller movement is active only for admitted grounded kid rolling outside flick/sub/special', () => {
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
    [runner, 'flick', .1], [runner, 'aimingSub', true],
    [actor, 'grounded', false], [actor, 'form', 'squid'], [actor, 'specialActive', {}], [actor, 'superJumpState', {}],
  ]) {
    const old = obj[key]; obj[key] = value;
    assert.equal(rollingMovementActive(actor), false, key);
    obj[key] = old;
  }
  runner.flickRecover = .1;
  assert.equal(rollingMovementActive(actor), true, 'admitted roll supersedes fading visual flick recovery');
});

test('build-only adapter changes only its explicit actor/weapons anchors', () => {
  const actor = read('src/game/actor.js');
  const weapons = read('src/game/weapons.js');
  const actorAfter = adaptMovementPhysics('src/game/actor.js', actor, replaceOnce);
  const weaponsAfter = adaptMovementPhysics('src/game/weapons.js', weapons, replaceOnce);
  assert.match(actorAfter, /integrateMovement\(this, dt, isSquid, jumped, PLAYER\.radius\)/);
  assert.match(actorAfter, /if \(mh > 1\) side\.multiplyScalar\(1 \/ mh\)/);
  // Actor delegates speed; #1584 deliberately gives held roller/brush facing
  // its own aim-yaw gate instead of reusing the grounded roll-speed gate.
  assert.match(actorAfter, /else vt = this\.weaponRunner\.moveSpeed\(\)/);
  assert.match(weaponsAfter, /if \(rollingMovementActive\(this\.a\)\) return rollingMovementSpeed\(this\)/);
  assert.match(actorAfter, /stepGroundVelocity\(this\.vel, mv\.x, mv\.z, vt, accel, dt\)/);
  assert.match(weaponsAfter, /rollingMovementSpeed\(this\)/);
  assert.match(weaponsAfter, /MOVEMENT_EPSILON/);
  assert.match(weaponsAfter, /writeDodgeVelocity\(this, vel, dt\)/);
  for (const rel of ['src/game/player.js','src/core/input.js','src/core/gyro.js','src/net/netmatch.js','src/game/character.js']) {
    assert.equal(adaptMovementPhysics(rel, 'UNCHANGED', replaceOnce), 'UNCHANGED');
  }
});

test('adapted Actor consumes Runner roll speed and preserves every admission gate', () => {
  const verify = (active, speed) => {
    const a = adaptedRoller(active, speed), r = a.weaponRunner;
    close(r.moveSpeed(), 6.48);
    for (let i = 0; i < 60; i++) a._horizontal(1 / 60, false, false);
    close(a.vel.x, 6.48); close(a.vel.z, 0);
    r.rollT = 1.5; close(r.moveSpeed(), 7.92);
    for (let i = 0; i < 60; i++) a._horizontal(1 / 60, false, false);
    close(a.vel.x, 7.92);
    a.intent.move.x = -1; close(r.moveSpeed(), 6.48);
    a.intent.move.x = 1; r.rollT = 0;
    for (const [obj, key, value, expected] of [
      [r, 'rolling', false, PLAYER.runSpeed], [r, 'aimingSub', true, PLAYER.runSpeed],
      [r, 'flick', .1, 2.175], [r, 'lockT', .1, 0],
      [a, 'grounded', false, PLAYER.runSpeed], [a, 'form', 'squid', PLAYER.runSpeed],
      [a, 'specialActive', {}, PLAYER.runSpeed], [a, 'superJumpState', {}, PLAYER.runSpeed],
      [a.weapon, 'kind', 'shooter', PLAYER.runSpeed],
    ]) {
      const old = obj[key]; obj[key] = value;
      close(r.moveSpeed(), expected);
      obj[key] = old;
    }
    r.flickRecover = .1; close(r.moveSpeed(), 6.48);
  };
  verify(rollingMovementActive, rollingMovementSpeed);
  assert.throws(() => verify(() => false, rollingMovementSpeed), assert.AssertionError,
    'removing the Runner admission call must lose the sourced rolling speed');
  assert.throws(() => verify(() => true, rollingMovementSpeed), assert.AssertionError,
    'unconditional rolling speed must fail the cancellation/form gates');
  assert.throws(() => verify(rollingMovementActive, r => r.a.weapon.rollSpeed), assert.AssertionError,
    'bypassing the normal/dash speed profile must fail');
});

test('adapted held-roll facing is independent of speed admission and preserves ordinary/special facing', () => {
  const heading = (configure, target) => {
    const a = adaptedRoller();
    a.vel.x = 6.48; a.intent.fire = true;
    configure(a, a.weaponRunner);
    for (let i = 0; i < 60; i++) a._face(1 / 60, a.form === 'squid');
    close(Math.sin(a.yaw), Math.sin(target), 2e-4);
    close(Math.cos(a.yaw), Math.cos(target), 2e-4);
  };
  heading(() => {}, 0); // native roll strafes without turning away from aim
  for (const kind of ['roller', 'brush']) {
    heading((a, r) => { r.rolling = false; a.weapon.kind = 'catalog'; a.weapon.behaviorKind = kind; }, 0);
    heading((a, r) => { r.rolling = false; a.weapon.kind = 'catalog'; a.weapon.behaviorKind = kind; a.form = 'squid'; }, Math.PI / 2);
  }
  heading((a) => { a.specialActive = {}; }, Math.PI / 2);
  heading((a) => { a.superJumpState = {}; }, Math.PI / 2);
  heading((a, r) => { a.weapon.kind = 'shooter'; r.rolling = false; }, Math.PI / 2);
  heading((a, r) => { a.weapon.kind = 'shooter'; r.rolling = false; r.firingT = 1; }, 0);
  heading((a, r) => { r.rolling = false; a.intent.sub = true; }, 0);
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
