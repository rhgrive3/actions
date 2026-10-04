// Focused native-path regression for INKWAVE issue #434.
//
// Loads the *real* `src/core/input.js` (the actual Input class and its real constructor wiring)
// twice: once raw as the negative main control, once through the issue-434 build adapter. Only the
// platform modules the fix does not touch (`core/ctx.js`, `core/mobile.js`, `core/device.js`) and
// the DOM globals are fixtures; the input lifecycle logic under test is the real source.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptIssue434 } from '../issue-434-adapter.mjs';
import { adaptInput } from '../input-adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const INPUT_FILE = path.join(UPSTREAM, 'src/core/input.js');
const rawInput = fs.readFileSync(INPUT_FILE, 'utf8');
const adaptedInput = adaptIssue434('src/core/input.js', rawInput);

const MOCKS = {
  'mock:ctx': 'export const G = { settings: null };',
  'mock:mobile': 'export class MobileInput { constructor() {} onDeviceChange() {} }',
  'mock:device': 'export const touchPrimary = false;',
};

function emitter() {
  const listeners = new Map();
  return {
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); },
    dispatch(name, event) { for (const fn of listeners.get(name) || []) fn(event); },
    listenerCount(name) { return (listeners.get(name) || []).length; },
  };
}

// Build the real Input class from `sourceText` inside a fresh vm realm with DOM fixtures.
async function buildInput(sourceText) {
  const win = emitter();
  const doc = emitter();
  doc.visibilityState = 'visible';
  doc.pointerLockElement = null;
  doc.exitPointerLock = () => {};
  doc.createElement = () => ({});
  const context = vm.createContext({
    console, Math, performance: { now: () => 0 },
    navigator: { getGamepads: () => [] }, window: win, document: doc,
  });
  const reals = new Map();
  const mocks = new Map();
  const realModule = (file) => {
    if (!reals.has(file)) {
      const source = file === INPUT_FILE ? sourceText : fs.readFileSync(file, 'utf8');
      reals.set(file, new vm.SourceTextModule(source, { context, identifier: file }));
    }
    return reals.get(file);
  };
  const mockModule = (key) => {
    if (!mocks.has(key)) mocks.set(key, new vm.SourceTextModule(MOCKS[key], { context }));
    return mocks.get(key);
  };
  const entry = new vm.SourceTextModule("export { Input } from './src/core/input.js';", {
    context, identifier: path.join(UPSTREAM, 'issue-434-fixture.mjs'),
  });
  await entry.link((spec, from) => {
    if (spec === './ctx.js') return mockModule('mock:ctx');
    if (spec === './mobile.js') return mockModule('mock:mobile');
    if (spec === './device.js') return mockModule('mock:device');
    const base = from && from.identifier ? path.dirname(from.identifier) : UPSTREAM;
    return realModule(path.resolve(base, spec));
  });
  await entry.evaluate();
  const canvas = { requestPointerLock: () => null };
  const input = new entry.namespace.Input(canvas);
  return { input, win, doc };
}

// A synthetic DOM event: the real handlers may call preventDefault (locked game keys).
const keyEvent = (code) => ({ code, repeat: false, preventDefault() {} });

// Put the input into the "held gameplay key + held mouse button" state a background app switch leaves behind.
function holdGameplayInput(input, win) {
  input.locked = true;                            // mouse buttons only latch while pointer-locked
  win.dispatch('keydown', keyEvent('KeyW'));
  win.dispatch('mousedown', { button: 0, preventDefault() {} });
  input.padPressed.add(0);
  input.pressed.add('Space');                     // pending key edge from the same frame
}

test('negative main control: raw input keeps held keys stuck across visibilitychange -> hidden', async () => {
  const { input, win, doc } = await buildInput(rawInput);
  holdGameplayInput(input, win);
  doc.visibilityState = 'hidden';
  doc.dispatch('visibilitychange', {});
  assert.equal(input.keys.has('KeyW'), true, 'raw source never clears the held key on backgrounding');
  assert.equal(input.mouse.left, true, 'raw source keeps the held mouse button');
  assert.equal(input.down('KeyW'), true, 'PlayerController.down() would re-apply the stale key on resume');
});

test('adapted input clears held/pending input on visibilitychange -> hidden', async () => {
  const { input, win, doc } = await buildInput(adaptedInput);
  holdGameplayInput(input, win);
  doc.visibilityState = 'hidden';
  doc.dispatch('visibilitychange', {});
  assert.equal(input.keys.size, 0, 'held keys cleared');
  assert.equal(input.pressed.size, 0, 'pending key edges cleared');
  assert.equal(input.mouse.left, false, 'held mouse buttons cleared');
  assert.equal(input.mouse.right, false);
  assert.equal(input.mouse.leftPressed, false, 'pending mouse edges cleared');
  assert.equal(input.mouse.rightPressed, false);
  assert.equal(input.mouse.dx, 0, 'accumulated look deltas cleared');
  assert.equal(input.mouse.dy, 0);
  assert.equal(input.padPressed.size, 0, 'pending pad edges cleared');
  assert.equal(input.down('KeyW'), false, 'no stale action survives into the resumed frame');
});

test('adapted input only resets when the document becomes hidden', async () => {
  const { input, win, doc } = await buildInput(adaptedInput);
  holdGameplayInput(input, win);
  doc.visibilityState = 'visible';
  doc.dispatch('visibilitychange', {});
  assert.equal(input.keys.has('KeyW'), true, 'a visible visibilitychange must not drop input');
  assert.equal(input.mouse.left, true);
  // Still clears once genuinely hidden.
  doc.visibilityState = 'hidden';
  doc.dispatch('visibilitychange', {});
  assert.equal(input.keys.size, 0);
});

test('adapted input keeps normal keyup and blur behavior (no regression)', async () => {
  const { input, win, doc } = await buildInput(adaptedInput);
  holdGameplayInput(input, win);
  win.dispatch('keyup', { code: 'KeyW' });
  assert.equal(input.keys.has('KeyW'), false, 'keyup still releases the key');
  win.dispatch('keydown', keyEvent('Space'));
  assert.equal(input.keys.has('Space'), true);
  win.dispatch('blur', {});
  assert.equal(input.keys.size, 0, 'blur reset remains intact');
  win.dispatch('keydown', keyEvent('KeyA'));
  win.dispatch('keyup', { code: 'KeyA' });
  assert.equal(input.keys.has('KeyA'), false);
  void doc;
});

test('adapter is input-scoped, fails closed, and composes with the blur adapter in either order', () => {
  assert.equal(adaptIssue434('src/main.js', 'unchanged'), 'unchanged');
  assert.equal(adaptIssue434('src/core/device.js', ''), '');
  assert.throws(() => adaptIssue434('src/core/input.js', 'const x = 1;'), /Issue-434 input anchor mismatch/);

  const visFirst = adaptIssue434('src/core/input.js', rawInput);
  assert.notEqual(visFirst, rawInput);
  assert.match(visFirst, /document\.addEventListener\('visibilitychange'/);

  const blurThenVis = adaptInput('src/core/input.js', visFirst);
  const visThenBlur = adaptIssue434('src/core/input.js', adaptInput('src/core/input.js', rawInput));
  for (const [name, code] of [['adaptInput->434', blurThenVis], ['434->adaptInput', visThenBlur]]) {
    assert.match(code, /visibilitychange/, `${name}: visibility reset present`);
    assert.match(code, /Focus left mid-frame/, `${name}: existing blur reset present`);
    assert.equal(code.indexOf("document.addEventListener('visibilitychange'"), code.lastIndexOf("document.addEventListener('visibilitychange'") , `${name}: exactly one visibility reset`);
  }
});
