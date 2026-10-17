// Execute the final build composition with real Input/MobileInput/Gyro/Player.
// Sensor deltas and pointer events are synthetic; this is not device validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../reliability/tests/controls-fixture.mjs';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
async function setup() {
  const f = await fixture({ production: true }), input = new f.Input({});
  const actor = f.make('shooter'), rig = { yaw: 0, pitch: 0 };
  const controller = new f.PlayerController(actor, rig, input), mobile = input.mobile;
  controller.computeAim = () => {};
  f.G.settings = { ...f.DEFAULT_SETTINGS, aimAssist: 0 };
  f.G.rig = rig; f.G.actors = [actor];
  Object.assign(mobile, { active: true, visible: true, _H: 768,
    root: { classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } }, querySelectorAll: () => [] } });
  input.lastDevice = 'touch';
  mobile.gyro.enabled = true; mobile.s.gyro = true; mobile.s.touchSens = 0;
  function pointer(id, x = 700, y = 300) { mobile._ptr.set(id, { kind: 'look', x, y }); }
  function move(id, x, y) {
    mobile._move({ pointerId: id, clientX: x, clientY: y, preventDefault() {}, stopPropagation() {} });
  }
  function motion(yaw, pitch) { mobile.gyro.dYaw += yaw; mobile.gyro.dPitch += pitch; }
  function tick(dt = 1 / 60) { controller.update(dt); input.endFrame(); }
  return { ...f, input, actor, rig, controller, mobile, pointer, move, motion, tick };
}

for (const hz of [30, 60, 120, 144]) test(`production ${hz}Hz touch and gyro add both axes immediately and consume once`, async () => {
  const h = await setup(); h.pointer(1);
  // Repeated opposite thumb directions exercise relative, rather than absolute,
  // camera control. The sensor keeps contributing while the thumb is held.
  let yaw = 0, pitch = 0;
  for (let i = 0; i < hz; i++) {
    const direction = i % 2 ? -1 : 1;
    h.move(1, 700 + (i % 2 ? 0 : 8), 300 + (i % 2 ? 0 : 5));
    const dx = h.mobile.lookDX, dy = h.mobile.lookDY;
    assert.equal(Math.sign(dx), direction); assert.equal(Math.sign(dy), direction);
    h.motion(.02 / hz, .03 / hz);
    yaw += .02 / hz - dx; pitch += .03 / hz - dy;
    h.tick(1 / hz); close(h.rig.yaw, yaw); close(h.rig.pitch, pitch);
    assert.equal(h.mobile.gyro.dYaw, 0); assert.equal(h.mobile.gyro.dPitch, 0);
    h.tick(1 / hz); close(h.rig.yaw, yaw); close(h.rig.pitch, pitch);
  }
  close(h.rig.yaw, .02); close(h.rig.pitch, .03);
  h.mobile._up({ pointerId: 1 }); h.motion(.04, -.05); h.tick(1 / hz);
  close(h.rig.yaw, .06); close(h.rig.pitch, -.02);
});

test('production right-stick inversion settings do not invert simultaneous touch or gyro', async () => {
  const h = await setup();
  for (const invertX of [false, true]) for (const invertY of [false, true]) {
    Object.assign(h.G.settings, { invertX, padInvertX: invertX, invertY });
    h.rig.yaw = h.rig.pitch = 0; h.pointer(1); h.move(1, 708, 305);
    const dx = h.mobile.lookDX, dy = h.mobile.lookDY;
    h.motion(.12, .08); h.tick();
    close(h.rig.yaw, .12 - dx); close(h.rig.pitch, .08 - dy);
  }
});

test('production gyro toggles preserve the first fresh thumb delta on each axis', async () => {
  const h = await setup(); h.pointer(1);
  let yaw = 0, pitch = 0;
  for (const enabled of [true, false, true, false, true]) {
    h.mobile.gyro.enabled = enabled; h.mobile._gyroBtn();
    const p = h.mobile._ptr.get(1); h.move(1, p.x + 8, p.y + 5);
    yaw -= h.mobile.lookDX; pitch -= h.mobile.lookDY;
    if (enabled) { h.motion(.02, .01); yaw += .02; pitch += .01; }
    h.tick(); close(h.rig.yaw, yaw); close(h.rig.pitch, pitch);
  }
});

test('production camera reset drops simultaneous queued look and admits fresh deltas immediately', async () => {
  const h = await setup(); h.pointer(1); h.move(1, 708, 305); h.motion(.2, .1);
  h.actor.yaw = 1.2; h.controller.resetCamera();
  h.tick(); close(h.rig.yaw, 1.2); close(h.rig.pitch, 0);
  h.move(1, 716, 310); const dx = h.mobile.lookDX, dy = h.mobile.lookDY;
  h.motion(.02, .01); h.tick();
  close(h.rig.yaw, 1.22 - dx); close(h.rig.pitch, .01 - dy);
});

test('production owner handoff drops queued touch and gyro, retaining first fresh touch samples', async () => {
  const h = await setup(); h.pointer(1); h.move(1, 708, 305); h.motion(.2, .1);
  h.input.lastDevice = 'kbm';
  assert.equal(h.mobile.lookDX, 0); assert.equal(h.mobile.lookDY, 0);
  // Late reports from a non-owning touch source cannot move the native camera.
  h.mobile.lookDX = .3; h.mobile.lookDY = .2; h.motion(.2, .1); h.tick();
  close(h.rig.yaw, 0); close(h.rig.pitch, 0);
  h.input.lastDevice = 'touch'; h.pointer(2); h.move(2, 708, 305);
  const dx = h.mobile.lookDX, dy = h.mobile.lookDY;
  h.motion(.02, .01); h.tick();
  close(h.rig.yaw, .02 - dx); close(h.rig.pitch, .01 - dy);
});

test('production disabled controller drops both inputs without replay after resume', async () => {
  const h = await setup(); h.pointer(1); h.move(1, 708, 305); h.motion(.2, .1);
  h.controller.enabled = false; h.controller.update(1 / 60);
  assert.equal(h.mobile.lookDX, 0); assert.equal(h.mobile.lookDY, 0);
  h.controller.enabled = true; h.tick(); close(h.rig.yaw, 0); close(h.rig.pitch, 0);
  h.move(1, 716, 310); const dx = h.mobile.lookDX, dy = h.mobile.lookDY;
  h.motion(.02, .01); h.tick();
  close(h.rig.yaw, .02 - dx); close(h.rig.pitch, .01 - dy);
});
