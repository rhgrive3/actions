import test from 'node:test';
import assert from 'node:assert/strict';
import { viabilityFixture } from './gyro-viability-fixture.mjs';

// #187: "effectively zero" rotationRate (spec deg/s) must stop an Android
// attitude-reference drift from becoming camera motion. The threshold is the
// engineering STILL_DEG (0.35 deg/s) in gyro.mjs, not a published constant.
async function setup() {
  const f = await viabilityFixture();
  f.env.navigator.userAgent = 'Linux; Android 14';
  await f.m.setGyro(true);
  return f;
}
const motion = (f, time, rate) => f.m.gyro._motion({ timeStamp: time, rotationRate: rate });
const orientation = (f, time, alpha) => f.m.gyro._orientation({ timeStamp: time, alpha, beta: 0, gamma: 90 });
const consume = f => ({ ...f.m.gyro.consume({}) });

// Attitude heading drifts 1 deg/s while the rate stays within the still band.
function drift(f, hz, rate, seconds = 10) {
  orientation(f, 1000, 0);
  let yaw = 0, pitch = 0;
  for (let i = 1; i <= hz * seconds; i++) {
    const time = 1000 + i * 1000 / hz;
    motion(f, time, rate);
    orientation(f, time, i / hz);
    const d = consume(f);
    yaw += d.yaw;
    pitch += d.pitch;
  }
  return { yaw, pitch };
}

for (const hz of [30, 60, 90, 120]) for (const n of [1e-4, 0.01, 0.35]) {
  test(`#187 Android ${hz}Hz drift with rate magnitude ${n} deg/s does not accumulate aim`, async t => {
    const f = await setup(); t.after(f.close);
    const { yaw, pitch } = drift(f, hz, { alpha: n, beta: 0, gamma: 0 });
    assert.ok(Math.hypot(yaw, pitch) < 1e-9, `stationary look drift ${yaw}, ${pitch} radians`);
    assert.equal(f.m.gyro._src, 'ori');
  });
}

test('#187 a rate just above STILL_DEG keeps the attitude correction native', async t => {
  const f = await setup(); t.after(f.close);
  const { yaw, pitch } = drift(f, 60, { alpha: 0.36, beta: 0, gamma: 0 });
  assert.ok(Math.hypot(yaw, pitch) > 0.1, `expected native drift, got ${yaw}, ${pitch}`);
});

test('#187 a deliberate turn at the same rate as the attitude change integrates the same at 30/60/90/120Hz', async t => {
  const totals = [];
  for (const hz of [30, 60, 90, 120]) {
    const f = await setup(); t.after(f.close);
    orientation(f, 1000, 0);
    let yaw = 0;
    for (let i = 1; i <= hz * 2; i++) {
      const time = 1000 + i * 1000 / hz;
      motion(f, time, { alpha: 10, beta: 0, gamma: 0 });
      orientation(f, time, 10 * i / hz);
      yaw += consume(f).yaw;
    }
    totals.push(yaw);
  }
  assert.ok(totals[0] > 0.1, `turn was suppressed: ${totals[0]}`);
  for (const v of totals) assert.ok(Math.abs(v - totals[0]) <= Math.abs(totals[0]) * 0.02, `frame-rate dependent: ${totals}`);
});
