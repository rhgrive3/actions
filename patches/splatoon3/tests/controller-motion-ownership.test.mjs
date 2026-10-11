import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, pad, STEP } from '../../reliability/tests/pause-fixture.mjs';
import { installControllerMotion, createSwitchHIDReader } from '../runtime/controller-motion.mjs';
import { resetPlatformInput } from '../../local-quality/platform-input.mjs';

async function world(mapping = 'standard') {
  const h = await boot();
  installControllerMotion({ Input: h.input.constructor, PlayerController: h.controller.constructor, G: h.G });
  const p = pad()[0]; p.index = 0; p.mapping = mapping;
  h.setPads([p]); h.input.pollPad(); h.input.lastDevice = 'pad'; h.input.endFrame();
  h.G.settings.gyro = true;
  let reads = 0;
  h.input.setControllerMotionReader(() => { reads++; return { yawRate: 1, pitchRate: .5 }; });
  return { ...h, p, reads: () => reads };
}
function button(h, index, pressed = true) {
  h.p.buttons[index] = { pressed, value: pressed ? 1 : 0 };
  h.input.pollPad(); h.input.lastDevice = 'pad';
}
const near = (a, b) => assert(Math.abs(a - b) < 1e-10, `${a} != ${b}`);

test('#71 standard X opening edge suppresses HID aim before native map admission', async () => {
  const h = await world(); button(h, 3); h.controller.update(STEP);
  assert.equal(h.controller.padMapOpen, true);
  assert.equal(h.reads(), 0); near(h.rig.yaw, 0); near(h.rig.pitch, 0);
  assert.equal(h.input.padPressed.has(3), false, 'native controller alone consumes X');
});

test('#71 a latched standard map owns aim even before the camera transition advances', async () => {
  const h = await world(); h.controller.setTurfMap(true); h.rig.mapK = 0;
  h.controller.update(STEP);
  assert.equal(h.reads(), 0); near(h.rig.yaw, 0); near(h.rig.pitch, 0);
});

test('#71 standard View does not invent a map hold, while nonstandard View still does', async () => {
  for (const mapping of ['standard', '']) {
    const h = await world(mapping); button(h, 8); h.controller.update(STEP);
    assert.equal(h.reads(), mapping === 'standard' ? 1 : 0);
    near(h.rig.yaw, mapping === 'standard' ? 1.8 * STEP : 0);
  }
});

test('#71 native map closing edge resumes aim only after the visible map transition ends', async () => {
  for (const mapK of [0, 1]) {
    const h = await world(); h.controller.setTurfMap(true); h.rig.mapK = mapK;
    button(h, 3); h.controller.update(STEP);
    assert.equal(h.controller.padMapOpen, false);
    assert.equal(h.reads(), mapK === 0 ? 1 : 0);
  }
});

test('#71 inactive touch map state cannot block an active controller gyro', async () => {
  const h = await world();
  h.input.mobile = { active: false, root: null, mapOpen: true };
  h.controller.update(STEP);
  assert.equal(h.reads(), 1); near(h.rig.yaw, 1.8 * STEP);
});

test('#71 Motion Controls OFF disables HID aim and retains right-stick pitch', async () => {
  const h = await world(); h.G.settings.gyro = false;
  h.p.axes[3] = .7; h.input.pollPad(); h.input.lastDevice = 'pad';
  h.controller.update(STEP);
  assert.equal(h.reads(), 0); near(h.rig.yaw, 0);
  assert.notEqual(h.rig.pitch, 0, 'native right-stick pitch remains usable');
});

function packet() {
  const bytes = new Uint8Array(48), view = new DataView(bytes.buffer);
  view.setInt16(18, 100, true); view.setInt16(22, -100, true); return view;
}
for (const boundary of ['disabled', 'keyboard', 'gyro-off', 'map']) {
  test(`#71 ${boundary} discards a still-fresh pre-boundary HID sample`, async () => {
    const h = await world(), reader = createSwitchHIDReader({ maxAgeMs: 60000 });
    reader.feedReport(packet(), 0x30); h.input.setControllerMotionReader(reader);
    if (boundary === 'disabled') h.controller.enabled = false;
    if (boundary === 'keyboard') h.input.lastDevice = 'kbm';
    if (boundary === 'gyro-off') h.G.settings.gyro = false;
    if (boundary === 'map') h.rig.mapK = 1;
    h.controller.update(STEP);
    assert.equal(reader(h.p, STEP), null, 'boundary invalidates the rate without waiting for age expiry');
    h.controller.enabled = true; h.input.lastDevice = 'pad'; h.G.settings.gyro = true; h.rig.mapK = 0;
    const yaw = h.rig.yaw; h.controller.update(STEP); near(h.rig.yaw, yaw);
    reader.feedReport(packet(), 0x30); h.controller.update(STEP);
    assert(h.rig.yaw > yaw, 'a fresh packet restores motion without reconnecting the device');
  });
}

test('#71 map open/close and offline-menu cancellation discard even without a blocked simulation tick', async () => {
  const h = await world(), reader = createSwitchHIDReader({ maxAgeMs: 60000 });
  h.input.setControllerMotionReader(reader);
  reader.feedReport(packet(), 0x30);
  h.controller.setTurfMap(true); h.controller.setTurfMap(false);
  assert.equal(reader(h.p, STEP), null);
  reader.feedReport(packet(), 0x30); h.controller.cancelForMenuTakeover();
  assert.equal(reader(h.p, STEP), null);
  h.controller.update(STEP); near(h.rig.yaw, 0);
});

test('#71 platform reset clears controller rates before simulation or pad polling resumes', async () => {
  const h = await world(), reader = createSwitchHIDReader({ maxAgeMs: 60000 });
  h.input.setControllerMotionReader(reader); reader.feedReport(packet(), 0x30);
  resetPlatformInput(h.input, h.controller);
  assert.equal(reader(h.p, STEP), null);
  assert.equal(h.input.pad, null);
  reader.feedReport(packet(), 0x30);
  assert(reader(h.p, STEP), 'discard retains the connection and accepts a fresh report');
});

test('#71 map and setting ownership produces identical camera traces at 30/60/120Hz', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const h = await world(), clock = new h.FixedClock(), rows = [];
    const reader = createSwitchHIDReader({ maxAgeMs: 60000 }); h.input.setControllerMotionReader(reader);
    for (let frame = 0; frame < hz; frame++) clock.advance(1 / hz, dt => {
      const tick = rows.length;
      if (tick === 4 || tick === 8) h.input.padPressed.add(3);
      h.G.settings.gyro = !(tick >= 12 && tick < 16);
      h.input.lastDevice = tick >= 20 && tick < 24 ? 'kbm' : 'pad';
      h.controller.enabled = !(tick >= 30 && tick < 35);
      reader.feedReport(packet(), 0x30);
      h.G.time += dt; h.controller.update(dt);
      rows.push([h.rig.yaw, h.rig.pitch, h.controller.mapHeld]);
    });
    assert.equal(rows.length, 60);
    assert.deepEqual(rows[4], [rows[3][0], rows[3][1], true]);
    traces.push(rows);
  }
  assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]);
});
