// Focused reliability tests for the input lifecycle overlay.
// They boot the ACTUAL public module (src/core/input.js) in a node VM with an event + gamepad
// fixture, once unmodified (upstream control) and once through adaptInput(). Each defect assertion
// is paired so the upstream module must still FAIL it while the overlay PASSES it.
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

// The module's real imports, stubbed only where the browser would provide them.
const DEPS = {
  './ctx.js': 'export const G = { settings: {} };',
  './device.js': 'export const touchPrimary = false;',
  './mobile.js': 'export class MobileInput { constructor() {} }',
};

// A real VM instance of the input module: captured window listeners and a mutable gamepad list,
// matching how the browser feeds the class.
async function boot(source) {
  const listeners = new Map();
  let pads = [];
  const sandbox = vm.createContext({
    console,
    performance,
    window: {
      addEventListener: (name, fn) => {
        const list = listeners.get(name) || [];
        list.push(fn);
        listeners.set(name, list);
      },
    },
    document: { addEventListener() {}, pointerLockElement: null },
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
    fire: (name, ...args) => { for (const fn of listeners.get(name) || []) fn(...args); },
    setPads: (next) => { pads = next; },
  };
}

// Standard-mapping pad whose given button indices are held.
const pad = (held = []) => ({
  connected: true,
  mapping: 'standard',
  buttons: Array.from({ length: 4 }, (_, i) => ({ pressed: held.includes(i), value: held.includes(i) ? 1 : 0 })),
  axes: [0, 0, 0, 0],
});

// --- scenarios (return the observed values, not assertions, so old and new can be compared) ---

async function blurState(source) {
  const h = await boot(source);
  h.input.locked = true;
  h.fire('keydown', { code: 'Space', repeat: false, preventDefault() {} });
  h.fire('mousedown', { button: 0 });
  h.fire('mousemove', { movementX: 20, movementY: 7 });
  h.fire('blur');
  return {
    keyHeld: h.input.down('Space'),
    jumpPending: h.input.wasPressed('Space'),
    fireHeld: h.input.mouse.left,
    firePending: h.input.mouse.leftPressed,
    lookX: h.input.mouse.dx,
    lookY: h.input.mouse.dy,
  };
}

async function padAcrossBlur(source) {
  const h = await boot(source);
  h.setPads([pad([0])]);
  h.input.pollPad();
  const edgeBeforeBlur = h.input.padPressed.has(0);
  h.fire('blur');
  const edgeAfterBlur = h.input.padPressed.has(0);
  h.input.pollPad(); // the same button is still physically held
  const retriggered = h.input.padPressed.has(0);
  return { edgeBeforeBlur, edgeAfterBlur, retriggered };
}

async function reconnect(source) {
  const h = await boot(source);
  h.setPads([pad([0])]);
  h.input.pollPad();
  h.setPads([]);
  h.input.pollPad(); // pad unplugged
  h.setPads([pad([0])]);
  h.input.pollPad(); // reconnected with the button already pressed
  return h.input.padPressed.has(0);
}


// --- defect tests: upstream fails, overlay passes ---

test('blur clears keyboard/mouse held, pending edges and look deltas', async () => {
  const expected = { keyHeld: false, jumpPending: false, fireHeld: false, firePending: false, lookX: 0, lookY: 0 };
  const before = await blurState(ORIGINAL);
  const after = await blurState(ADAPTED);
  assert.notDeepEqual(before, expected, 'unpatched upstream must still leave blur edges behind');
  assert.deepEqual(after, expected, 'overlay must clear every blur edge');
});

test('blur drops the pad edge set but keeps held-button history (no retrigger)', async () => {
  const before = await padAcrossBlur(ORIGINAL);
  const after = await padAcrossBlur(ADAPTED);
  assert.equal(before.edgeBeforeBlur, true);
  assert.equal(before.edgeAfterBlur, true, 'unpatched upstream keeps the stale pad edge after blur');
  assert.equal(after.edgeBeforeBlur, true);
  assert.equal(after.edgeAfterBlur, false, 'overlay must clear padPressed on blur');
  assert.equal(after.retriggered, false, 'a button held across the blur must not re-fire');
});

test('a reconnected gamepad regains its first button press edge', async () => {
  assert.equal(await reconnect(ORIGINAL), false, 'unpatched upstream loses the first press after reconnect');
  assert.equal(await reconnect(ADAPTED), true, 'overlay must expose the first press of the reconnected pad');
});

// --- regression guards: both upstream and overlay must pass ---

test('rapid key/mouse edges survive until the normal endFrame tick', async () => {
  for (const [label, source] of [['upstream', ORIGINAL], ['overlay', ADAPTED]]) {
    const h = await boot(source);
    h.input.locked = true;
    h.fire('keydown', { code: 'KeyZ', repeat: false, preventDefault() {} });
    h.fire('mousedown', { button: 0 });
    h.fire('mousemove', { movementX: 5, movementY: -3 });
    assert.equal(h.input.wasPressed('KeyZ'), true, label);
    assert.equal(h.input.mouse.leftPressed, true, label);
    assert.equal(h.input.mouse.dx, 5, label);
    assert.equal(h.input.mouse.dy, -3, label);
    h.input.endFrame();
    assert.equal(h.input.wasPressed('KeyZ'), false, label);
    assert.equal(h.input.mouse.leftPressed, false, label);
    assert.equal(h.input.mouse.dx, 0, label);
    assert.equal(h.input.mouse.dy, 0, label);
  }
});

test('a held pad button only fires one edge while it stays held', async () => {
  for (const [label, source] of [['upstream', ORIGINAL], ['overlay', ADAPTED]]) {
    const h = await boot(source);
    h.setPads([pad([0])]);
    h.input.pollPad();
    assert.equal(h.input.padPressed.has(0), true, label);
    h.input.pollPad();
    assert.equal(h.input.padPressed.has(0), false, label);
  }
});

test('polling without any connected gamepad stays safe', async () => {
  for (const [label, source] of [['upstream', ORIGINAL], ['overlay', ADAPTED]]) {
    const h = await boot(source);
    h.setPads([]);
    assert.doesNotThrow(() => h.input.pollPad(), label);
    assert.equal(h.input.pad, null, label);
    assert.equal(h.input.padPressed.size, 0, label);
    assert.equal(h.input.padButton(0), false, label);
    assert.equal(h.input.padAxis(0), 0, label);
  }
});

// --- overlay contract ---

test('adaptInput is fail-closed and leaves unrelated modules untouched', () => {
  const other = 'export const x = 1;\n';
  assert.equal(adaptInput('src/core/renderer.js', other), other);
  assert.equal(adaptInput('src/main.js', other), other);
  assert.throws(() => adaptInput(INPUT_REL, ''), /conflict/);
  const once = adaptInput(INPUT_REL, ORIGINAL);
  assert.notEqual(once, ORIGINAL);
  assert.throws(() => adaptInput(INPUT_REL, once), /conflict/);
});
