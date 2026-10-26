import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const source = process.env.INKWAVE_INPUT_POLL_SOURCE
  ? fs.readFileSync(process.env.INKWAVE_INPUT_POLL_SOURCE, 'utf8')
  : adaptBuildSource('src/core/input.js', fs.readFileSync(path.join(ROOT, 'inkwave-public/src/core/input.js'), 'utf8'));
const button = value => ({ value, pressed: value > 0.3, touched: value > 0 });
const joycon = (side, index, suffix = '') => ({ index, connected: true, mapping: 'standard',
  id: `Joy-Con (${side}) (STANDARD GAMEPAD Vendor: 057e Product: ${side === 'L' ? '2006' : '2007'})${suffix}`,
  axes: [0, 0], buttons: Array.from({ length: 17 }, () => button(0)), timestamp: 0 });

async function boot() {
  let pads = [];
  const listeners = new Map();
  const listen = (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); };
  const unlisten = (type, fn) => listeners.get(type)?.delete(fn);
  const context = vm.createContext({ console, performance,
    addEventListener: listen, removeEventListener: unlisten,
    window: { addEventListener: listen, removeEventListener: unlisten },
    screen: { orientation: { addEventListener: listen, removeEventListener: unlisten } },
    document: { addEventListener: listen, removeEventListener: unlisten, hidden: false, hasFocus: () => true, pointerLockElement: null },
    navigator: { getGamepads: () => pads, maxTouchPoints: 0, userAgent: 'input lifetime fixture' },
  });
  const cache = new Map();
  const stubs = { './ctx.js': 'export const G={settings:{}};', './device.js': 'export const touchPrimary=false;',
    './mobile.js': 'export class MobileInput { endFrame() {} }' };
  function link(spec, from) {
    const id = spec in stubs ? spec : spec.startsWith('../../patches/')
      ? path.join(ROOT, 'patches', spec.slice('../../patches/'.length))
      : path.resolve(path.dirname(from.identifier), spec);
    if (!cache.has(id)) cache.set(id, new vm.SourceTextModule(stubs[id] ?? fs.readFileSync(id, 'utf8'), { context, identifier: id }));
    return cache.get(id);
  }
  const module = new vm.SourceTextModule(source, { context, identifier: path.join(ROOT, 'inkwave-public/src/core/input.js') });
  await module.link(link); await module.evaluate();
  const input = new module.namespace.Input({});
  return { input, setPads(value) { pads = value; }, event(type, event) { for (const fn of listeners.get(type) || []) fn(event); } };
}

test('one live Joy-Con pair reuses all 22 button records while copying fresh snapshots', async () => {
  const h = await boot(); const left = joycon('L', 2), right = joycon('R', 7);
  h.setPads([left, right]); h.input.pollPad();
  const pair = h.input.pad, axes = pair.axes, buttons = [...pair.buttons];
  const records = new Set(buttons), pairs = new Set([pair]);
  for (let i = 1; i <= 2000; i++) {
    // Browser snapshots may be new objects each poll. No source object may be
    // mutated or retained as the pair's writable storage.
    const l = { ...left, axes: [i % 2 ? 0.6 : -0.6, -0.8], buttons: left.buttons.map(() => button(i % 3 ? 1 : 0)), timestamp: i };
    const r = { ...right, axes: [0.3, i % 2 ? 0.7 : -0.7], buttons: right.buttons.map(() => button(i % 2 ? 0.8 : 0)), timestamp: i + 0.5 };
    const original = JSON.stringify([l, r]);
    h.setPads(i % 2 ? [r, l] : [l, r]); h.input.pollPad();
    pairs.add(h.input.pad); for (const value of h.input.pad.buttons) records.add(value);
    assert.deepEqual([...h.input.pad.axes], [0.8, l.axes[0], r.axes[1], -0.3]);
    assert.equal(h.input.pad.timestamp, i + 0.5);
    assert.equal(h.input.pad.buttons[6].value, l.buttons[6].value);
    assert.equal(h.input.pad.buttons[7].value, r.buttons[7].value);
    assert.equal(JSON.stringify([l, r]), original, 'native snapshot must remain read-only');
    h.input.endFrame();
  }
  console.log('input allocation census', JSON.stringify({ polls: 2001, synthesizedPairs: pairs.size, buttonRecords: records.size }));
  assert.equal(pairs.size, 1, 'no new synthesized controller per poll');
  assert.equal(records.size, 22, 'no new synthesized button objects per poll');
  assert.equal(h.input.pad.axes, axes);
  h.input.dispose(); assert.equal(h.input.pad, null);
});

test('pair replacement and disconnect retain input cancellation and neutral rearming', async () => {
  const h = await boot(), left = joycon('L', 2), right = joycon('R', 7);
  h.setPads([left, right]); h.input.pollPad(); const first = h.input.pad;
  right.buttons[7] = button(1); h.input.pollPad();
  assert.equal(h.input.padValue(7), 1); assert.ok(h.input.padPressed.has(7));
  const replacement = joycon('R', 7, 'replacement'); replacement.buttons[7] = button(1);
  const oldEpoch = h.input._padEpoch;
  h.setPads([left, replacement]); h.input.pollPad();
  assert.notEqual(h.input.pad, first); assert.ok(h.input._padEpoch > oldEpoch);
  assert.equal(h.input.padValue(7), 0); assert.equal(h.input.padPressed.size, 0);
  replacement.buttons[7] = button(0); h.input.pollPad();
  replacement.buttons[7] = button(1); h.input.pollPad(); assert.equal(h.input.padValue(7), 1);
  const second = h.input.pad;
  h.setPads([]); h.input.pollPad(); assert.equal(h.input.pad, null);
  h.setPads([left, replacement]); h.input.pollPad();
  assert.notEqual(h.input.pad, second); assert.equal(h.input.padValue(7), 0);
  h.input.dispose();
});

test('button release, missing data, actuator changes and independent Input owners remain fresh', async () => {
  const a = await boot(), b = await boot(), left = joycon('L', 2), right = joycon('R', 7);
  left.buttons[0] = button(1); right.buttons[2] = button(0.9);
  a.setPads([left, right]); b.setPads([left, right]); a.input.pollPad(); b.input.pollPad();
  assert.notEqual(a.input.pad, b.input.pad); assert.notEqual(a.input.pad.buttons[0], b.input.pad.buttons[0]);
  const actuator = { playEffect() {} }; right.vibrationActuator = actuator;
  left.buttons[0] = undefined; right.buttons[2] = { pressed: true, touched: false, value: NaN };
  left.axes[0] = NaN; right.axes[1] = Infinity;
  a.input.pollPad();
  assert.deepEqual({ ...a.input.pad.buttons[14] }, { pressed: false, touched: false, value: 0 });
  assert.deepEqual({ ...a.input.pad.buttons[0] }, { pressed: true, touched: false, value: 1 });
  assert.equal(a.input.pad.axes[1], 0); assert.equal(a.input.pad.axes[2], 0);
  assert.equal(a.input.pad.vibrationActuator, actuator); assert.equal(b.input.pad.buttons[14].pressed, true);
  a.input.dispose(); b.input.dispose();
});

test('navigation zone history reuses one buffer across idle, input changes and disconnect', async () => {
  const h = await boot(); h.input.pollPad(); const history = h.input._navigationAxisZones;
  const histories = new Set([history]);
  for (let i = 0; i < 2000; i++) { h.input.pollPad(); histories.add(h.input._navigationAxisZones); }
  const pad = { ...joycon('R', 1), id: 'standard pad', axes: [0.3, -0.3, 0.300001, -0.300001] };
  h.setPads([pad]); h.input.pollPad(); histories.add(h.input._navigationAxisZones);
  assert.deepEqual([...h.input._navigationAxisZones], [0, 0, 1, -1]);
  pad.axes = [-1, 1, 0, 0]; h.input.pollPad(); histories.add(h.input._navigationAxisZones);
  assert.deepEqual([...h.input._navigationAxisZones], [-1, 1, 0, 0]);
  h.setPads([]); h.input.pollPad(); histories.add(h.input._navigationAxisZones);
  assert.deepEqual([...h.input._navigationAxisZones], [0, 0, 0, 0]);
  console.log('navigation allocation census', JSON.stringify({ polls: 2004, historyBuffers: histories.size }));
  assert.equal(histories.size, 1, 'touch/keyboard idle must not allocate one navigation array per frame');
  h.input.dispose();
});
