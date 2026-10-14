import test from 'node:test';
import assert from 'node:assert/strict';
import { horizontalRollerPose, verticalRollerPose, ROLLER_POSE } from '../runtime/roller.mjs';
import { dualiesTurnFraction, DUALIES_MOTION_CALIBRATION } from '../runtime/dualies-motion.mjs';

// Pose keys are host grip-space calibrations. Only the authoritative Runner
// interval/windup/release clocks come from game-state. This suite deliberately
// checks geometric continuity, not invented Nintendo joint measurements.
const near = (a, b, tol, label) => assert.ok(Math.abs(a - b) <= tol,
  label + ': ' + a + ' differs from ' + b);
function derivative(f, t, eps = 1e-5) {
  return (f(t + eps) - f(t - eps)) / (2 * eps);
}
function checkSwing(fn, windup, interval, name) {
  const snap = t => fn(t, windup, interval);
  const duration = interval;
  let previous = snap(0);
  assert.equal(previous.weight, 0, name + ': rest weight');
  for (let i = 1; i <= 720; i++) {
    const t = duration * i / 720, next = snap(t);
    for (const channel of ['anchor', 'rotation']) for (let k = 0; k < 3; k++) {
      assert.ok(Number.isFinite(next[channel][k]), name + ': finite ' + channel);
      assert.ok(Math.abs(next[channel][k] - previous[channel][k]) < .2,
        name + ': no one-frame discontinuity at ' + t);
    }
    previous = next;
  }
  const end = snap(duration);
  for (let i = 0; i < 3; i++) {
    near(end.anchor[i], ROLLER_POSE.READY_ANCHOR[i], 1e-7, name + ': settle anchor');
    near(end.rotation[i], ROLLER_POSE.READY_ROTATION[i], 1e-7, name + ': settle rotation');
  }
  // A Hermite key does not arbitrarily stop/restart in the middle of the
  // backswing. Its outgoing and incoming derivatives must be identical.
  const follow = windup + Math.min(.12, (interval - windup) * .55);
  for (const t of [windup * .65, windup, follow]) {
    for (const channel of ['anchor', 'rotation']) for (let i = 0; i < 3; i++) {
      const f = x => snap(x)[channel][i], e = 2e-5;
      const left = (f(t) - f(t - e)) / e;
      const right = (f(t + e) - f(t)) / e;
      near(left, right, .06, name + ': C1 at ' + t + '/' + channel + i);
    }
  }
}
test('roller uses a continuous grip spline through horizontal and vertical native release clocks', () => {
  for (const [windup, interval, label] of [
    [21 / 60, 35 / 60, 'normal-horizontal'],
    [31 / 60, 42 / 60, 'normal-vertical'],
    [55 / 60, 85 / 60, 'long-windup-example'],
  ]) {
    checkSwing(horizontalRollerPose, windup, interval, label + '-horizontal');
    checkSwing(verticalRollerPose, windup, interval, label + '-vertical');
  }
});
test('dualies dodge roll has continuous, monotonic angular velocity and no spin jump at recovery', () => {
  const c = DUALIES_MOTION_CALIBRATION, f = dualiesTurnFraction;
  near(f(0), 0, 1e-12, 'start');
  near(f(c.turnStart), 0, 1e-12, 'tuck');
  near(f(c.turnCruise), c.turnAtCruise, 1e-12, 'cruise');
  near(f(c.turnEnd), 1, 1e-12, 'landing');
  near(f(1), 1, 1e-12, 'complete');
  let previous = 0;
  for (let i = 1; i <= 1000; i++) {
    const v = f(i / 1000);
    assert.ok(Number.isFinite(v) && v >= previous - 1e-10);
    previous = v;
  }
  const e = 1e-5, at = c.turnCruise;
  near((f(at) - f(at - e)) / e, (f(at + e) - f(at)) / e, .002, 'continuous cruise speed');
  assert.ok(derivative(f, at) > 0.01, 'the body keeps turning through its mid-roll pose');
  assert.ok(f(c.turnEnd - .001) > .999, 'rotation finishes before the planted shot');
});
