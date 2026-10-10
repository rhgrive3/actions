import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, pad, STEP } from './pause-fixture.mjs';
import { installInputPlatform } from '../../local-quality/platform-input.mjs';
const device = (index, buttons = [], mapping = 'standard', id = 'pad' + index) => Object.assign(pad(buttons)[0], { index, id, mapping });

for (const mapping of ['standard', '']) test(`direct ${mapping || 'raw'} handoff blocks held actions until a fresh press`, async () => {
  for (const button of [0, 3, 5, 6, 7, 11]) {
    const h = await boot(), a = device(0, [], mapping), b = device(1, [button], mapping);
    h.setPads([a, b]); h.input.pollPad(); h.input.endFrame();
    h.setPads([null, b]); h.input.pollPad(); h.controller.update(STEP);
    assert.equal(h.input.padPressed.size, 0);
    assert.equal(h.input.padMenuPressed.size, 0);
    assert.equal(h.input.padButton(button), false); assert.equal(h.input.padValue(button), 0);
    for (const action of ['jump', 'fire', 'squid', 'sub', 'special']) assert.equal(h.actor.intent[action], false, action);
    h.input.pollPad(); assert.equal(h.input.padButton(button), false);
    b.buttons[button] = { pressed: false, value: 0 }; h.input.pollPad();
    b.buttons[button] = { pressed: true, value: 1 }; h.input.pollPad();
    assert.deepEqual([...h.input.padPressed], [button]);
    h.input.pollPad(); assert.equal(h.input.padPressed.size, 0);
  }
});

test('trigger takeover uses the existing value > .3 admission, not pressed', async () => {
  const h = await boot(), a = device(0), b = device(1);
  b.buttons[7] = { pressed: false, value: .4 };
  h.setPads([a, b]); h.input.pollPad(); h.setPads([null, b]); h.input.pollPad();
  assert.equal(h.input.padValue(7), 0); assert.equal(h.input.padPressed.size, 0);
  b.buttons[7].value = .3; h.input.pollPad(); b.buttons[7].value = .4; h.input.pollPad();
  assert.equal(h.input.padValue(7), .4); assert.equal(h.input.padPressed.has(7), true);
});

test('new pad drops previous menu block and filters, then gates only consumed sticks', async () => {
  const h = await boot(), a = device(0), b = device(1);
  h.setPads([a, b]); h.input.pollPad(); h.controller.update(STEP);
  h.input.padMenuBlocked.add(5); h.controller.padLook.x = .8; h.controller.padLook.y = .5; h.controller.edgeT = .4;
  b.axes = [.8, 0, .9, .5, -1]; h.setPads([null, b]); h.input.pollPad(); h.controller.enabled = false; h.controller.update(STEP);
  assert.equal(h.input.padMenuBlocked.size, 0);
  assert.equal(h.controller.padLook.x, 0); assert.equal(h.controller.padLook.y, 0); assert.equal(h.controller.edgeT, 0);
  h.controller.enabled = true; h.controller.update(STEP); assert.equal(h.rig.yaw, 0); assert.equal(h.actor.intent.move.length(), 0);
  b.axes = [0, 0, 0, 0, -1]; h.input.pollPad(); b.axes = [.8, 0, .9, .5, -1]; h.input.pollPad(); h.controller.update(STEP);
  assert.notEqual(h.rig.yaw, 0); assert.ok(h.actor.intent.move.length() > 0);
});

test('index reuse with disconnect notification and id/mapping changes are explicit boundaries', async () => {
  for (const change of ['event', 'id', 'mapping']) {
    const h = await boot(), a = device(0), b = device(0, [0]);
    h.setPads([a]); h.input.pollPad();
    if (change === 'event') h.event('gamepaddisconnected', { gamepad: a });
    if (change === 'id') b.id = 'replacement';
    if (change === 'mapping') b.mapping = '';
    h.setPads([b]); h.input.pollPad(); assert.equal(h.input.padButton(0), false); assert.equal(h.input.padPressed.size, 0);
  }
});

test('same-device snapshots keep normal edges while no-pad reconnect rebases held controls', async () => {
  const h = await boot(); h.setPads([device(0)]); h.input.pollPad();
  h.setPads([device(0, [0])]); h.input.pollPad(); assert.equal(h.input.padPressed.has(0), true);
  h.setPads([]); h.input.pollPad();
  const reconnected = device(0, [0]); h.setPads([reconnected]); h.input.pollPad();
  assert.equal(h.input.padPressed.has(0), false);
  assert.equal(h.input.padButton(0), false);
  reconnected.buttons[0] = { pressed: false, value: 0 }; h.input.pollPad();
  reconnected.buttons[0] = { pressed: true, value: 1 }; h.input.pollPad();
  assert.equal(h.input.padPressed.has(0), true);
});

test('simultaneous lifecycle rebase cannot turn a blocked analog hold into an edge', async () => {
  const h = await boot(), a = device(0), b = device(1);
  installInputPlatform(h.input.constructor);
  b.buttons[7] = { pressed: false, value: .4 };
  h.setPads([a]); h.input.pollPad();
  h.input._platformPadRebase = true; h.setPads([b]); h.input.pollPad();
  for (let i = 0; i < 5; i++) {
    h.input.pollPad(); assert.equal(h.input.padPressed.size, 0); assert.equal(h.input.padMenuPressed.size, 0); assert.equal(h.input.padValue(7), 0);
  }
  b.buttons[7].value = 0; h.input.pollPad(); b.buttons[7].value = .4; h.input.pollPad();
  assert.equal(h.input.padPressed.has(7), true);
});

test('blocked takeover stick cannot claim touch ownership without fresh input', async () => {
  const h = await boot(), a = device(0), b = device(1);
  h.setPads([a]); h.input.pollPad(); h.input.lastDevice = 'touch';
  b.axes = [0, 0, .9, 0]; h.setPads([b]); h.input.pollPad();
  assert.equal(h.input.lastDevice, 'touch');
  b.axes[2] = 0; h.input.pollPad(); b.axes[2] = .9; h.input.pollPad();
  assert.equal(h.input.lastDevice, 'pad');
});

test('render-pending pad edges belong to the old controller and cannot survive handoff', async () => {
  const h = await boot(), a = device(0), b = device(1);
  h.setPads([a]); h.frame(1 / 120);
  a.buttons[11] = { pressed: true, value: 1 }; h.input.pollPad();
  assert.equal(h.input.padPressed.has(11), true);
  h.actor.special = h.actor.specialCost(); h.setPads([b]); h.frame(1 / 120);
  assert.equal(h.actor.intent.special, false); assert.equal(h.actor.specialReady(), true);
});

for (const hz of [30, 60, 120]) test(`${hz}Hz takeover cannot spend a ready special; fresh B input still can`, async () => {
  const h = await boot(), a = device(0), b = device(1, [3, 11]);
  h.actor.special = h.actor.specialCost();
  h.setPads([a]); h.input.pollPad(); h.setPads([b]);
  for (let i = 0; i < hz / 2; i++) { h.input.pollPad(); h.frame(1 / hz); }
  assert.equal(h.actor.specialReady(), true); assert.equal(h.actor.specialActive, null);
  b.buttons[3] = b.buttons[11] = { pressed: false, value: 0 }; h.input.pollPad(); h.frame(1 / 30);
  b.buttons[11] = { pressed: true, value: 1 }; h.input.pollPad(); h.frame(STEP);
  assert.notEqual(h.actor.specialActive, null); assert.equal(h.actor.specialReady(), false);
});
