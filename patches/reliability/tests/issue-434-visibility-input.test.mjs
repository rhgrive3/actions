// #434 regression: visibilitychange hidden and pagehide neutralize hardware-keyboard,
// mouse, and gamepad edges.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptInput } from '../input-adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const INPUT_REL = 'src/core/input.js';
const ORIGINAL = fs.readFileSync(path.join(UPSTREAM, INPUT_REL), 'utf8');
const ADAPTED = adaptInput(INPUT_REL, ORIGINAL);

const DEPS = {
  './ctx.js': 'export const G = { settings: {} };',
  './device.js': 'export const touchPrimary = false;',
  './mobile.js': 'export class MobileInput { constructor() {} }',
};

async function boot(source) {
  const windowListeners = new Map();
  const docListeners = new Map();
  let pads = [];
  const doc = {
    hidden: false,
    addEventListener: (name, fn) => {
      const list = docListeners.get(name) || [];
      list.push(fn);
      docListeners.set(name, list);
    },
    pointerLockElement: null,
  };
  const win = {
    addEventListener: (name, fn) => {
      const list = windowListeners.get(name) || [];
      list.push(fn);
      windowListeners.set(name, list);
    },
  };
  const sandbox = vm.createContext({
    console,
    performance,
    window: win,
    document: doc,
    navigator: { getGamepads: () => pads },
  });
  const module = new vm.SourceTextModule(source, { context: sandbox });
  await module.link((spec) => {
    if (!(spec in DEPS)) throw new Error(`unexpected input dependency: ${spec}`);
    return new vm.SourceTextModule(DEPS[spec], { context: sandbox });
  });
  await module.evaluate();
  const input = new module.namespace.Input({});
  return {
    input,
    doc,
    fireWindow: (name, ...args) => { for (const fn of windowListeners.get(name) || []) fn(...args); },
    fireDoc: (name, ...args) => { for (const fn of docListeners.get(name) || []) fn(...args); },
    setPads: (next) => { pads = next; },
  };
}

const pad = (held = []) => ({
  connected: true,
  mapping: 'standard',
  buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: held.includes(i), value: held.includes(i) ? 1 : 0 })),
  axes: [0, 0, 0, 0],
});

test('#434 visibilitychange hidden clears held keys, pending edges, mouse buttons, and look deltas', async () => {
  // Negative control: upstream fails
  {
    const { input, doc, fireWindow, fireDoc } = await boot(ORIGINAL);
    fireWindow('keydown', { code: 'KeyW', preventDefault() {} });
    assert.equal(input.down('KeyW'), true);
    doc.hidden = true;
    fireDoc('visibilitychange');
    // Upstream did not listen to visibilitychange; KeyW remains held!
    assert.equal(input.down('KeyW'), true, 'upstream retains held key on hidden');
  }

  // Adapted: passes
  {
    const { input, doc, fireWindow, fireDoc } = await boot(ADAPTED);
    input.locked = true;
    fireWindow('keydown', { code: 'KeyW', preventDefault() {} });
    fireWindow('mousedown', { button: 0 });
    fireWindow('mousemove', { movementX: 12, movementY: -8 });

    assert.equal(input.down('KeyW'), true);
    assert.equal(input.pressed.has('KeyW'), true);
    assert.equal(input.mouse.left, true);
    assert.equal(input.mouse.leftPressed, true);
    assert.equal(input.mouse.dx, 12);
    assert.equal(input.mouse.dy, -8);

    doc.hidden = true;
    fireDoc('visibilitychange');

    assert.equal(input.down('KeyW'), false, 'held keys cleared on hidden');
    assert.equal(input.pressed.has('KeyW'), false, 'pending keys cleared on hidden');
    assert.equal(input.mouse.left, false, 'mouse left cleared on hidden');
    assert.equal(input.mouse.leftPressed, false, 'mouse leftPressed cleared on hidden');
    assert.equal(input.mouse.dx, 0, 'mouse dx cleared on hidden');
    assert.equal(input.mouse.dy, 0, 'mouse dy cleared on hidden');
  }
});

test('#434 gamepad held across visibilitychange hidden does not retrigger edge on resume', async () => {
  const { input, doc, fireDoc, setPads } = await boot(ADAPTED);
  setPads([pad([0])]);
  input.pollPad();
  assert.equal(input.padPressed.has(0), true, 'first frame registers press');

  doc.hidden = true;
  fireDoc('visibilitychange');
  assert.equal(input.padPressed.has(0), false, 'padPressed cleared on hidden');

  // Resume polling with button still held:
  doc.hidden = false;
  fireDoc('visibilitychange');
  input.pollPad();
  assert.equal(input.padPressed.has(0), false, 'held button across hidden does not retrigger press edge');
});

test('#434 pagehide event also neutralizes held input', async () => {
  const { input, fireWindow } = await boot(ADAPTED);
  fireWindow('keydown', { code: 'KeyA', preventDefault() {} });
  assert.equal(input.down('KeyA'), true);
  fireWindow('pagehide');
  assert.equal(input.down('KeyA'), false, 'held key cleared on pagehide');
});
