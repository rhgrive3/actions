import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './controls-fixture.mjs';

function pad(index, actuator, { id = 'controller-' + index, held = [] } = {}) {
  return { index, id, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: held.includes(i), value: held.includes(i) ? 1 : 0 })),
    vibrationActuator: actuator };
}

async function rig() {
  let now = 1000;
  const f = await fixture({ production: true, clock: { now: () => now } });
  const input = new f.Input({}), calls = [];
  f.G.settings = { ...f.DEFAULT_SETTINGS, rumble: 1 };
  const actuator = name => ({ playEffect(effect, options) { calls.push({ name, effect, ...options }); return Promise.resolve('complete'); } });
  const poll = pads => { f.setPads(pads); input.pollPad(); };
  return { ...f, input, calls, actuator, poll, advance: ms => now += ms };
}

const strong = input => input.rumble(.8, .6, 260);
const weak = input => input.rumble(.05, .3, 60);

test('direct controller replacement gets its own feedback priority envelope', async () => {
  const h = await rig(), a = pad(0, h.actuator('a')), b = pad(1, h.actuator('b'));
  h.poll([a, b]); h.input.lastDevice = 'pad'; strong(h.input);
  h.advance(1); h.poll([null, b]); weak(h.input);
  assert.deepEqual(h.calls.map(c => c.name), ['a', 'b'], 'old controller feedback must not mute the replacement');
  assert.equal(h.calls[1].duration, 60);
  assert.equal(h.calls[1].strongMagnitude, .05);
  assert.equal(h.calls[1].weakMagnitude, .3);
  assert.equal(h.input._padEpoch, 1, 'normal handoff epoch is unchanged');
  assert.equal(h.input.padPressed.size, 0, 'neutral replacement invents no gameplay edge');
});

test('disconnect and reconnect reset feedback even when the controller reuses its index and id', async () => {
  const h = await rig(), a = pad(0, h.actuator('first-session'));
  h.poll([a]); h.input.lastDevice = 'pad'; strong(h.input);
  h.advance(1); h.poll([]);
  assert.equal(h.input.pad, null);
  const reconnected = pad(0, h.actuator('reconnected'));
  h.poll([reconnected]); weak(h.input);
  assert.deepEqual(h.calls.map(c => c.name), ['first-session', 'reconnected']);
});

test('same-controller snapshots retain strong-pulse priority, timing and active-device/settings gates', async () => {
  const h = await rig(), actuator = h.actuator('same');
  h.poll([pad(0, actuator)]); h.input.lastDevice = 'pad'; strong(h.input);
  h.advance(1); h.poll([pad(0, actuator)]); weak(h.input);
  assert.equal(h.calls.length, 1, 'fresh browser snapshots of the same controller do not reset the envelope');
  h.advance(259); weak(h.input);
  assert.equal(h.calls.length, 2, 'weaker feedback resumes at the existing pulse deadline');
  strong(h.input);
  assert.equal(h.calls.length, 3, 'strong feedback still preempts a weaker same-controller pulse');
  h.input.lastDevice = 'kbm'; h.advance(300); weak(h.input);
  assert.equal(h.calls.length, 3, 'keyboard ownership requests no gamepad feedback');
  h.input.lastDevice = 'pad'; h.G.settings.rumble = 0; weak(h.input);
  assert.equal(h.calls.length, 3, 'disabled vibration remains disabled');
});

test('switching from a Joy-Con pair to a controller retains the existing selected-actuator policy', async () => {
  const h = await rig(), leftActuator = h.actuator('left'), rightActuator = h.actuator('right');
  const joycon = (index, product, actuator) => ({ ...pad(index, actuator),
    id: `Joy-Con (Vendor: 057e Product: ${product})`, axes: [0, 0] });
  const left = joycon(0, '2006', leftActuator), right = joycon(1, '2007', rightActuator);
  h.poll([left, right]);
  assert.equal(h.input.pad._inkwaveJoyconPair, true);
  assert.equal(h.input.pad.vibrationActuator, leftActuator, 'the existing pair still chooses the left actuator first');
  h.input.lastDevice = 'pad'; strong(h.input);
  h.advance(1);
  const replacement = pad(2, h.actuator('replacement'));
  h.poll([null, null, replacement]); weak(h.input);
  assert.deepEqual(h.calls.map(c => c.name), ['left', 'replacement']);
});
