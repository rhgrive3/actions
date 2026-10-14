import test from 'node:test';
import assert from 'node:assert/strict';
import {viabilityFixture} from './gyro-viability-fixture.mjs';

// Real composed Gyro/MobileInput and real GyroPermission promises; sensor delivery
// and browser permission completion are controlled, not physical-device evidence.
async function pendingMotion(t) {
  const f = await viabilityFixture({permission:'deferred'});
  t.after(f.close);
  let settleMotion;
  f.env.DeviceMotionEvent.requestPermission = () => new Promise(resolve => { settleMotion = resolve; });
  const enabled = f.m.setGyro(true);
  f.answers.shift()('granted');
  assert.equal(await enabled, true);
  assert.equal(f.m.gyro.platformStatus.motionPermission, 'prompt');
  return {...f, settle: async value => { settleMotion(value); await new Promise(setImmediate); }};
}
const orientation = (g,time,alpha) => g._orientation({timeStamp:time,alpha,beta:0,gamma:90});
const stationary = (g,time) => g._motion({timeStamp:time,rotationRate:{alpha:0,beta:0,gamma:0}});
const magnitude = g => Math.hypot(...Object.values(g.consume({})));

for (const hz of [30,60,90,120]) test(`#187 ${hz}Hz delayed motion denial invalidates earlier stationary evidence`, async t => {
  const f = await pendingMotion(t), g=f.m.gyro, dt=1000/hz;
  orientation(g,1000,0);
  stationary(g,1000+dt);
  orientation(g,1000+dt,0.1);
  assert.equal(magnitude(g),0,'fresh zero-rate evidence initially suppresses reference drift');
  await f.settle('denied');
  assert.equal(g.platformStatus.motionPermission,'denied','actual permission promise has completed');
  orientation(g,1000+dt*2,1);
  assert.ok(magnitude(g)>0,'orientation-only aiming must resume immediately after optional motion is denied');
  assert.equal(g._qualityGyro.stationaryMotion,false);
  assert.equal(g._qualityGyro.motionTime,-Infinity);
  assert.equal(g.enabled,true,'orientation permission remains valid');
  assert.equal(g._src,'ori');
  stationary(g,1000+dt*3);
  orientation(g,1000+dt*3,2);
  assert.ok(magnitude(g)>0,'later queued denied motion cannot recreate stationary evidence');
});

test('#187 a successful delayed motion grant keeps valid stationary drift suppression', async t => {
  const f=await pendingMotion(t),g=f.m.gyro;
  orientation(g,1000,0);stationary(g,1017);orientation(g,1017,.1);
  await f.settle('granted');orientation(g,1034,1);
  assert.equal(g.platformStatus.motionPermission,'granted');
  assert.equal(magnitude(g),0);
  assert.equal(g._qualityGyro.stationaryMotion,true);
});

test('#187 invalidating denied evidence preserves already queued real aim', async t => {
  const f=await pendingMotion(t),g=f.m.gyro;
  orientation(g,1000,0);orientation(g,1017,1);
  const queued=[g.dYaw,g.dPitch];assert.ok(Math.hypot(...queued)>0);
  stationary(g,1018);await f.settle('denied');
  orientation(g,1034,1);
  assert.ok(Math.abs(g.dYaw)>=Math.abs(queued[0]));
  assert.ok(Number.isFinite(g.dYaw+g.dPitch));
  assert.equal(g._qualityGyro.stationaryMotion,false);
});

test('#187 no prior motion sample leaves orientation-only aiming unchanged after denial', async t => {
  const f=await pendingMotion(t),g=f.m.gyro;
  orientation(g,1000,0);await f.settle('denied');orientation(g,1017,1);
  assert.ok(magnitude(g)>0);assert.equal(g.enabled,true);
});

test('#187 a superseded permission result cannot invalidate current stationary evidence', async t => {
  const f=await pendingMotion(t),g=f.m.gyro;
  orientation(g,1000,0);stationary(g,1017);orientation(g,1017,.1);
  g._platformGyroAccess.cancelRequest(false);
  await f.settle('denied');
  assert.equal(g.platformStatus.motionPermission,'prompt','stale denial callback is rejected by the existing generation owner');
  orientation(g,1034,1);assert.equal(magnitude(g),0);
  assert.equal(g._qualityGyro.stationaryMotion,true);
});
