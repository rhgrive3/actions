// #187: Android fused-attitude drift is not a physical turn when a fresh
// instantaneous rotationRate observation independently reports stillness.
// Exercise the composed, permission/lifecycle-owned Gyro through real event
// callbacks. These are synthetic sensors, not a physical-device calibration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { viabilityFixture } from './gyro-viability-fixture.mjs';

const DELTA = 1e-8;
async function setup(ua = 'Mozilla/5.0 (Linux; Android 16) Chrome/132') {
  const h = await viabilityFixture();
  h.env.navigator.userAgent = ua;
  assert.equal(await h.m.setGyro(true), true, 'enabled through actual mobile permission owner');
  assert.equal(h.m.gyro.enabled, true);
  return h;
}
async function drive(h, hz, seconds, {rate, attitudeRate, from = 0, motion = true} = {}) {
  let beta = from, pitch = 0, yaw = 0;
  // Each pair is an independent browser observation at one physical timestamp,
  // with the rate observed just before the attitude. No test-only sample hook.
  for (let n = 0; n <= Math.round(seconds * hz); n++) {
    await h.advance(1000/hz);
    const time = h.env.performance.now(), t = n / hz;
    const r = rate ? rate(t) : 0, a = attitudeRate ? attitudeRate(t) : r;
    if (n) beta += a / hz;
    if (motion) h.fire('devicemotion', {
      timeStamp: time, rotationRate: {alpha:0,beta:r,gamma:0}
    });
    h.fire('deviceorientation', {
      timeStamp: time + 0.05, alpha:0,beta,gamma:0
    });
    const step = h.m.gyro.consume({});
    pitch += step.pitch; yaw += step.yaw;
  }
  return { pitch, yaw, beta };
}

test('#187 Android drift + independently zero rotation rate causes no accumulated camera look at 30/60/90/120Hz', async t => {
  for (const hz of [30,60,90,120]) {
    const h = await setup();
    t.after(h.close);
    const d = await drive(h,hz,6,{
      rate:()=>0,attitudeRate:()=>1,from:8
    });
    assert.ok(d.beta > 13, 'attitude actually drifts by six degrees');
    assert.equal(h.m.gyro._src,'ori','Android source selection remains unchanged');
    assert.ok(Math.abs(d.yaw) < DELTA && Math.abs(d.pitch) < DELTA,
      hz+'Hz: stationary raw sensor vetoes reference-only drift, '+JSON.stringify(d));
    assert.equal(h.m.gyro._qualityGyro.stationaryMotion,true);
  }
});

test('#187 real Android rotation still produces consistent direction and magnitude across event cadences', async t => {
  const turns=[];
  for (const hz of [30,60,90,120]) {
    const h=await setup();t.after(h.close);
    const d=await drive(h,hz,1,{rate:()=>35,attitudeRate:()=>35,from:8});
    assert.ok(d.pitch > .3,'real positive tilt remains responsive at '+hz+'Hz');
    assert.ok(Math.abs(d.yaw) < .02,'pitch turn does not invent yaw');
    turns.push(d.pitch);
    const reverse=await drive(h,hz,.5,{rate:()=>-35,attitudeRate:()=>-35,from:43});
    assert.ok(reverse.pitch < -.1,'reverse physical turn keeps its sign');
    assert.equal(h.m.gyro._src,'ori');
  }
  assert.ok(Math.max(...turns)-Math.min(...turns)<.08,
    'fixed physical rotation remains rate-invariant: '+turns);
});

test('#187 missing raw sensor or iOS retains the existing attitude fallback', async t => {
  const noRaw=await setup();t.after(noRaw.close);
  const x=await drive(noRaw,60,2,{attitudeRate:()=>3,from:8,motion:false});
  assert.ok(x.pitch > .01,'without independent rate evidence Android may still use attitude');
  const ios=await setup('iPhone Safari');t.after(ios.close);
  const y=await drive(ios,60,2,{rate:()=>0,attitudeRate:()=>3,from:8});
  assert.ok(y.pitch > .01,'Android-only guard leaves iOS orientation fallback unchanged');
});

test('#187 after a paused/reoriented baseline, zero-rate attitude reset never creates a camera jump', async t => {
  const h=await setup();t.after(h.close);
  await drive(h,60,.3,{rate:()=>35,attitudeRate:()=>35,from:8});
  h.m.gyro.consume({});
  h.m.gyro.resync();
  const resync=h.m.gyro.resync;
  let unexpectedResyncs=0;
  h.m.gyro.resync=function(...args) {
    unexpectedResyncs++;
    return resync.apply(this,args);
  };
  await h.advance(17);
  const now=h.env.performance.now();
  h.fire('devicemotion',{timeStamp:now,rotationRate:{alpha:0,beta:0,gamma:0}});
  h.fire('deviceorientation',{timeStamp:now+.05,alpha:120,beta:-20,gamma:45});
  const baseline=h.m.gyro.consume({});
  assert.ok(Math.abs(baseline.yaw)<DELTA && Math.abs(baseline.pitch)<DELTA,
    'first post-resync observation cannot create a camera jump: '+JSON.stringify(baseline));
  const first=await drive(h,60,0,{rate:()=>0,attitudeRate:()=>1,from:-20+1/60});
  assert.ok(Math.abs(first.yaw)<DELTA && Math.abs(first.pitch)<DELTA,
    'first continuation cannot create a camera jump: '+JSON.stringify(first));
  assert.equal(unexpectedResyncs,0,'monotonic boundary must not trigger another resync');
  const after=await drive(h,60,2,{rate:()=>0,attitudeRate:()=>1,from:first.beta});
  assert.ok(Math.abs(after.yaw)<DELTA && Math.abs(after.pitch)<DELTA,
    'post-recenter drift cannot create rotation: '+JSON.stringify(after));
  assert.equal(unexpectedResyncs,0,'continuous drift must not trigger another resync');
});
