import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptMobile } from '../mobile-adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SOURCE_ROOT = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const source = () => fs.readFileSync(path.join(SOURCE_ROOT, 'src/core/mobile.js'), 'utf8');
const IDS = ['stick', 'fire', 'squid', 'jump', 'sub', 'special', 'map', 'gyro', 'pause'];

// Full actual MobileInput, including its actual installed event handlers. Platform objects
// are deterministic fixtures, not evidence of native browser capture or an iPad device.
async function fixture({ raw = false, layout = false } = {}) {
  const dimensions = { innerWidth: 1000, innerHeight: 600 };
  const timers = new Map(), frames = [];
  let serial = 0;
  class Classes {
    constructor() { this.values = new Set(); }
    add(...names) { names.forEach(name => this.values.add(name)); }
    remove(...names) { names.forEach(name => this.values.delete(name)); }
    contains(name) { return this.values.has(name); }
    toggle(name, value = !this.contains(name)) { value ? this.add(name) : this.remove(name); return value; }
  }
  class Node {
    constructor(tag = 'div') {
      this.tag = tag; this.style = { setProperty() {} }; this.classList = new Classes();
      this.dataset = {}; this.children = []; this.nodes = new Map(); this.listeners = new Map();
      this.offsetParent = {}; this.isConnected = true; this.captures = new Set();
    }
    addEventListener(type, fn) { const all = this.listeners.get(type) || []; all.push(fn); this.listeners.set(type, all); }
    dispatch(type, event = {}) { event.type = type; for (const fn of this.listeners.get(type) || []) fn(event); }
    appendChild(node) { this.children.push(node); return node; }
    setAttribute() {}
    focus() { document.activeElement = this; }
    getClientRects() { return [this.getBoundingClientRect()]; }
    getBoundingClientRect() { return { left: 0, right: dimensions.innerWidth, top: 0, bottom: dimensions.innerHeight, width: dimensions.innerWidth, height: dimensions.innerHeight }; }
    closest() { return null; }
    setPointerCapture(id) { this.captures.add(id); }
    releasePointerCapture(id) { this.captures.delete(id); }
    querySelector(selector) {
      if (!this.nodes.has(selector)) this.nodes.set(selector, new Node());
      return this.nodes.get(selector);
    }
    querySelectorAll(selector) {
      if (selector === '[data-c]') {
        return IDS.map(id => {
          const node = this.querySelector(`[data-c="${id}"]`); node.dataset.c = id; return node;
        });
      }
      if (selector === '[data-e]') return ['reset', 'cancel', 'save', 'one'].map(id => {
        const node = this.querySelector(`[data-e="${id}"]`); node.dataset.e = id; return node;
      });
      if (selector === '[data-axis]') return ['x', 'y'].map(axis => {
        const node = this.querySelector(`[data-axis="${axis}"]`); node.dataset.axis = axis; return node;
      });
      if (selector === 'option') return this.querySelector('select').children;
      if (selector === '.iwm-b.is-down') return [...this.nodes.values()].filter(node => node.classList.contains('is-down'));
      if (selector === '.is-sel') return [...this.nodes.values()].filter(node => node.classList.contains('is-sel'));
      return [];
    }
    remove() { this.isConnected = false; }
  }
  const document = new Node('document'), window = new Node('window');
  document.documentElement = new Node('html'); document.documentElement.lang = 'en';
  document.body = new Node('body'); document.createElement = tag => new Node(tag);
  document.querySelector = () => null; document.hidden = false;
  const storage = new Map();
  class Gyro {
    constructor() { this.discards = 0; this.resyncs = 0; this.enabled = false; this.supported = true; this.needsPermission = false; }
    configure() {} start() { this.enabled = true; } stop() { this.enabled = false; }
    discard() { this.discards++; this.dYaw = this.dPitch = 0; } resync() { this.resyncs++; }
  }
  const context = vm.createContext({
    console, document, window, ...dimensions, screen: { orientation: new Node() },
    AbortController, structuredClone, navigator: { vibrate() {} },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    setTimeout: (fn, ms) => { const id = ++serial; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id), requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
    Gyro,
  });
  const module = text => new vm.SourceTextModule(text, { context });
  const deps = {
    './gyro.js': module('export const Gyro=globalThis.Gyro; export const touchSensMul=()=>1;'),
    './device.js': module('export const touchPrimary=true,touchCapable=true;'),
    '../i18n.js': module('export const t=value=>value;'),
    '../ui/ui-icons.js': module("export const WEAPON_ICONS={shooter:''},SUB_ICONS={bomb:''},SQUID='',specialIcon=()=>'';"),
  };
  let code = source();
  if (layout) code = adaptTouchLayout('src/core/mobile.js', code);
  if (!raw) code = adaptMobile('src/core/mobile.js', code);
  const mobile = module(code); await mobile.link(spec => deps[spec]); await mobile.evaluate();
  const owner = { lastDevice: 'touch' };
  const input = new mobile.namespace.MobileInput(new Node('canvas'), owner); input.setVisible(true);
  const event = (id, x, y, extra = {}) => ({
    pointerId: id, clientX: x, clientY: y, pointerType: 'touch', cancelable: true,
    preventDefault() {}, stopPropagation() {}, target: input.root, ...extra,
  });
  const route = (type, id, x = 0, y = 0, extra) => input.root.dispatch(type, event(id, x, y, extra));
  return {
    input, owner, context, document, window, storage, timers, frames, controls: mobile.namespace.CONTROLS,
    down: (id, x, y, extra) => route('pointerdown', id, x, y, extra),
    move: (id, x, y) => route('pointermove', id, x, y),
    up: (id, type = 'pointerup') => route(type, id),
    button(id, pointer = 1) { const b = input._box(id); route('pointerdown', pointer, b.x, b.y); return b; },
    resetState() { input.resetPointers(); },
    resize() { window.dispatch('resize'); for (const fn of frames.splice(0)) fn(); },
  };
}
function clearState(input, { map = false } = {}) {
  assert.equal(input.moveX, 0); assert.equal(input.moveY, 0);
  assert.equal(input.lookDX, 0); assert.equal(input.lookDY, 0);
  assert.equal(input.gyro.dYaw, 0); assert.equal(input.gyro.dPitch, 0);
  assert.equal(input._ptr.size, 0); assert.equal(input._stick.id, -1);
  assert.equal(input.pressed.size, 0); assert.equal(input.jumpTarget, -1);
  assert.equal(input.down('fire'), false); assert.equal(input.down('jump'), false);
  assert.equal(input.mapOpen, map); assert.equal(input.down('map'), map);
}
function seed(f) {
  f.button('fire'); f.button('jump', 2);
  f.input.lookDX = 2; f.input.lookDY = 3; f.input.jumpTarget = 2;
  f.input.gyro.dYaw = 1; f.input.gyro.dPitch = 2;
}

test('mobile overlay requires unique anchors, permits either layout order, and ignores other files', () => {
  assert.notEqual(adaptMobile('src/core/mobile.js', source()), source());
  assert.throws(() => adaptMobile('src/core/mobile.js', ''), /anchor mismatch/);
  assert.throws(() => adaptMobile('src/core/mobile.js', source() + source()), /anchor mismatch/);
  assert.throws(() => adaptMobile('src/core/mobile.js', adaptMobile('src/core/mobile.js', source())), /anchor mismatch/);
  assert.equal(adaptMobile('src/core/input.js', 'unchanged'), 'unchanged');
  const first = adaptMobile('src/core/mobile.js', adaptTouchLayout('src/core/mobile.js', source()));
  const second = adaptTouchLayout('src/core/mobile.js', adaptMobile('src/core/mobile.js', source()));
  assert.equal(first, second);
});

test('raw negative controls reproduce left-gap aim, pending reset edges, stale target and cancellation edge', async () => {
  const f = await fixture({ raw: true });
  f.down(1, 450, 250); f.move(1, 600, 250);
  assert.ok(f.input.lookDX > 0); // confirmed pre-fix undesired aim
  f.input.reset(); seed(f); f.input.reset();
  assert.equal(f.input.wasPressed('fire'), true); assert.equal(f.input.wasPressed('jump'), true); assert.equal(f.input.jumpTarget, 2);
  f.button('fire'); f.up(1, 'pointercancel');
  assert.equal(f.input.down('fire'), false); assert.equal(f.input.wasPressed('fire'), true);
});

for (const layout of [false, true]) {
  for (const start of [420, 450, 499]) {
    test(`left-gap drag at ${start} never acquires aim after crossing right (layout=${layout})`, async () => {
      const f = await fixture({ layout }); f.down(1, start, 250); f.move(1, 700, 300); f.move(1, 800, 350);
      assert.equal(f.input.lookDX, 0); assert.equal(f.input.lookDY, 0); assert.equal(f.input._ptr.has(1), false);
      f.up(1);
    });
  }
  test(`right-start look owns its entire drag across center (layout=${layout})`, async () => {
    const f = await fixture({ layout }); f.down(1, 600, 250); f.move(1, 550, 280);
    const before = f.input.lookDX; f.move(1, 450, 310); f.move(1, 350, 340);
    assert.ok(f.input.lookDX < before); assert.ok(f.input.lookDY > 0); assert.equal(f.input._ptr.get(1).kind, 'look');
    f.up(1); assert.equal(f.input._ptr.size, 0);
  });
  test(`left stick and second left finger stay movement-only (layout=${layout})`, async () => {
    const f = await fixture({ layout }); f.down(1, 100, 400); f.move(1, 160, 350);
    assert.ok(f.input.moveX > 0); const mx = f.input.moveX, my = f.input.moveY;
    f.down(2, 150, 420); f.move(2, 700, 450);
    assert.equal(f.input.lookDX, 0); assert.equal(f.input.lookDY, 0);
    assert.equal(f.input.moveX, mx); assert.equal(f.input.moveY, my);
    f.move(1, 600, 400); assert.equal(f.input.lookDX, 0); // crossing does not convert a stick gesture
    f.up(1); assert.equal(f.input.moveX, 0);
  });
  test(`fixed-stick left upper area never aims; right area does (layout=${layout})`, async () => {
    const f = await fixture({ layout }); f.input.applySettings({ stickMode: 'fixed' });
    f.down(1, 150, 100); f.move(1, 700, 150); assert.equal(f.input.lookDX, 0); assert.equal(f.input._stick.id, -1);
    f.down(2, 700, 180); f.move(2, 750, 200); assert.ok(f.input.lookDX > 0);
  });
  test(`FIRE default retains hold and aim through capture outside button and across center (layout=${layout})`, async () => {
    const f = await fixture({ layout }); assert.equal(f.controls.fire.aim, true); assert.equal(f.input.s.fireAim, true);
    const b = f.button('fire'); assert.ok(f.input.root.captures.has(1)); assert.equal(f.input.down('fire'), true);
    f.move(1, b.x - 80, b.y - 20); assert.ok(f.input.lookDX < 0); assert.equal(f.input.down('fire'), true);
    const before = f.input.lookDX; f.move(1, 450, 250); assert.ok(f.input.lookDX < before); assert.equal(f.input.down('fire'), true);
    f.up(1); assert.equal(f.input.down('fire'), false); assert.equal(f.input.wasPressed('fire'), true);
    f.input.endFrame(); assert.equal(f.input.wasPressed('fire'), false);
  });
  test(`simultaneous move, FIRE and ordinary look keep independent ownership (layout=${layout})`, async () => {
    const f = await fixture({ layout }); f.down(1, 100, 400); f.move(1, 150, 400);
    const b = f.button('fire', 2); f.move(2, b.x - 25, b.y); f.down(3, 650, 200); f.move(3, 690, 220);
    assert.ok(f.input.moveX > 0); assert.equal(f.input.down('fire'), true); assert.notEqual(f.input.lookDX, 0);
    assert.equal(f.input._stick.id, 1); assert.equal(f.input._ptr.get(2).id, 'fire'); assert.equal(f.input._ptr.get(3).kind, 'look');
    f.up(2, 'pointercancel'); assert.equal(f.input.down('fire'), false); assert.equal(f.input.wasPressed('fire'), false);
    assert.equal(f.input._stick.id, 1); assert.equal(f.input._ptr.get(3).kind, 'look');
  });
  test(`fireAim=false disables button aim and preserves hold plus ordinary look (layout=${layout})`, async () => {
    const f = await fixture({ layout }); f.input.applySettings({ fireAim: false }); const b = f.button('fire');
    f.move(1, b.x - 100, b.y - 80); assert.equal(f.input.lookDX, 0); assert.equal(f.input.lookDY, 0); assert.equal(f.input.down('fire'), true);
    f.down(2, 650, 200); f.move(2, 700, 220); assert.ok(f.input.lookDX > 0);
  });
  test(`relocated/resized FIRE, SQUID and SUB retain deliberate button aim in left half (layout=${layout})`, async () => {
    const f = await fixture({ layout });
    for (const id of ['fire', 'squid', 'sub']) {
      f.input.layout[id] = { ax: 'l', ay: 't', dx: 0.55, dy: 0.55, s: 1.3 }; f.input._layoutAll();
      const b = f.button(id); assert.ok(b.x < 500); assert.equal(f.input.down(id), true);
      f.move(1, b.x + 50, b.y + 15); assert.ok(f.input.lookDX > 0); assert.equal(f.input.down(id), true);
      f.up(1); f.input.endFrame(); delete f.input.layout[id]; f.input._layoutAll();
    }
  });
  test(`editor drag moves/resizes controls without gameplay fire or look (layout=${layout})`, async () => {
    const f = await fixture({ layout }); f.input.openEditor();
    const b = f.button('fire'); f.move(1, b.x - 60, b.y - 20);
    assert.equal(f.input.down('fire'), false); assert.equal(f.input.pressed.size, 0); assert.equal(f.input.lookDX, 0);
    const changed = JSON.stringify(f.input.layout.fire); assert.ok(changed);
    f.down(2, b.x - 80, b.y - 20); f.move(2, b.x - 120, b.y - 20); f.up(2, 'pointercancel'); f.up(1);
    assert.equal(f.input.down('fire'), false); assert.equal(f.input.lookDX, 0);
    f.input._closeEditor(true); assert.ok(f.storage.has('inkwave.touchLayout'));
    assert.equal(f.input.editing, false); assert.equal(f.input._ptr.size, 0);
  });
}

test('right-half boundary is determined at down and mouse remains excluded from gameplay', async () => {
  const f = await fixture(); f.down(1, 500, 200); f.move(1, 480, 210); assert.ok(f.input.lookDX < 0);
  f.input.endFrame(); f.down(2, 700, 200, { pointerType: 'mouse' }); f.move(2, 750, 250);
  assert.equal(f.input.lookDX, 0); assert.equal(f.input._ptr.has(2), false);
});

for (const type of ['pointercancel', 'lostpointercapture']) {
  test(`${type} discards a pending hold edge without ghost firing`, async () => {
    const f = await fixture(); f.button('fire'); assert.equal(f.input.wasPressed('fire'), true);
    f.up(1, type); assert.equal(f.input.wasPressed('fire'), false); assert.equal(f.input.down('fire'), false);
    f.up(1); assert.equal(f.input.wasPressed('fire'), false);
  });
  test(`${type} preserves a separate released quick tap and same-button held finger`, async () => {
    const f = await fixture(); f.button('fire', 1); f.up(1); // valid quick tap
    f.button('fire', 1); f.up(1, type); // reuse pointer ID; must not discard the earlier legitimate edge
    assert.equal(f.input.wasPressed('fire'), true); assert.equal(f.input.down('fire'), false);
    f.input.endFrame(); f.button('fire', 1); f.button('fire', 2); f.up(1, type);
    assert.equal(f.input.down('fire'), true); assert.equal(f.input.wasPressed('fire'), true);
    f.up(2, type); assert.equal(f.input.down('fire'), false); assert.equal(f.input.wasPressed('fire'), false);
  });
}

test('pointerup quick tap survives lostcapture and next render opportunity until endFrame', async () => {
  const f = await fixture(); f.button('fire'); f.up(1); f.up(1, 'lostpointercapture');
  await Promise.resolve(); assert.equal(f.input.wasPressed('fire'), true); assert.equal(f.input.down('fire'), false);
  f.input.endFrame(); assert.equal(f.input.wasPressed('fire'), false); assert.equal(f.input._pendingEdges.size, 0);
});

test('hold survives edge consumption; later cancellation cannot erase a new legitimate tap', async () => {
  const f = await fixture(); f.button('fire'); f.input.endFrame(); assert.equal(f.input.down('fire'), true);
  f.button('fire', 2); f.up(2); f.up(1, 'pointercancel'); assert.equal(f.input.wasPressed('fire'), true);
  assert.equal(f.input.down('fire'), false);
});

for (const action of ['resetPointers', 'reset', 'blur', 'hidden', 'device', 'resize', 'hide']) {
  test(`${action} cancels all touch edges, old target, look deltas and held pointers`, async () => {
    const f = await fixture({ layout: true }); seed(f);
    if (action === 'resetPointers') f.input.resetPointers();
    if (action === 'reset') f.input.reset();
    if (action === 'blur') f.window.dispatch('blur');
    if (action === 'hidden') { f.document.hidden = true; f.document.dispatch('visibilitychange'); }
    if (action === 'device') { f.owner.lastDevice = 'keyboard'; f.input.onDeviceChange(); }
    if (action === 'resize') f.resize();
    if (action === 'hide') f.input.setVisible(false);
    clearState(f.input);
    f.move(1, 200, 100); assert.equal(f.input.lookDX, 0); assert.equal(f.input.pressed.size, 0);
  });
}

test('resetPointers/resize/device-hide preserve the map toggle while discarding stale targets', async () => {
  const f = await fixture({ layout: true }); f.input.setMap(true);
  for (const action of [() => f.input.resetPointers(), () => f.resize(), () => { f.owner.lastDevice = 'keyboard'; f.input.onDeviceChange(); }]) {
    f.input.jumpTarget = 1; f.input.pressed.add('fire'); f.input.lookDX = 5; action(); clearState(f.input, { map: true });
  }
  f.input.reset(); clearState(f.input); // full reset retains its existing close-map contract
});

test('opening map cancels gameplay gestures but redundant map-open does not erase a legitimate target', async () => {
  const f = await fixture({ layout: true }); seed(f); f.input.setMap(true); clearState(f.input, { map: true });
  f.button('fire', 3); f.move(3, 300, 300); assert.equal(f.input.down('fire'), false); assert.equal(f.input.lookDX, 0);
  f.input.jumpTarget = 2; f.input.setMap(true); f.input.endFrame();
  assert.equal(f.input.jumpTarget, 2); assert.equal(f.input.mapOpen, true);
  assert.equal(f.input.consumeJumpTarget(), 2); assert.equal(f.input.mapOpen, false);
  assert.equal(f.input.consumeJumpTarget(), -1); assert.equal(f.input.jumpTarget, -1);
});

test('map toggle edge, pause and gyro buttons keep their explicit action priority', async () => {
  const f = await fixture({ layout: true });
  f.button('fire'); f.button('map', 2); assert.equal(f.input.mapOpen, true); assert.equal(f.input.wasPressed('map'), true); assert.equal(f.input.wasPressed('fire'), false);
  f.input.endFrame(); f.button('map', 3); assert.equal(f.input.mapOpen, false); assert.equal(f.input.wasPressed('map'), true);
  let paused = 0; f.input.onPause = () => paused++; f.button('pause', 4); assert.equal(paused, 1); assert.equal(f.input.wasPressed('pause'), true);
  f.button('gyro', 5); await Promise.resolve(); assert.equal(f.input.gyro.enabled, true); assert.equal(f.input.lookDX, 0);
});

test('touch layout positions, scales and settings remain numerically identical', async () => {
  const raw = await fixture({ raw: true, layout: true }), patched = await fixture({ layout: true });
  for (const id of IDS) {
    assert.deepEqual({ ...patched.input._box(id) }, { ...raw.input._box(id) });
    assert.deepEqual({ ...patched.controls[id] }, { ...raw.controls[id] });
  }
  const settings = { touchSens: 2, touchScale: 1.3, touchOpacity: .6, stickMode: 'fixed', fireAim: false, rumble: 0 };
  raw.input.applySettings(settings); patched.input.applySettings(settings);
  for (const id of IDS) assert.deepEqual({ ...patched.input._box(id) }, { ...raw.input._box(id) });
  assert.equal(patched.input.s.fireAim, false); assert.equal(patched.input.s.touchSens, 2);
});

test('relocated floating joystick retains right-half priority and never changes into look', async () => {
  const f = await fixture({ layout: true });
  f.input.layout.stick = { ax: 'r', ay: 't', dx: .8, dy: .5, s: 1.25 }; f.input._layoutAll();
  const b = f.input._box('stick'); assert.ok(b.x > 500);
  f.down(1, b.x, b.y); f.move(1, b.x - 50, b.y + 10);
  assert.equal(f.input._stick.id, 1); assert.ok(f.input.moveX < 0); assert.equal(f.input.lookDX, 0);
  f.move(1, 400, b.y); assert.equal(f.input.lookDX, 0); assert.equal(f.input._stick.id, 1);
  f.up(1); assert.equal(f.input.moveX, 0);
});

test('right swipe, FIRE drag and stick output keep the existing numerical response', async () => {
  const raw = await fixture({ raw: true, layout: true }), patched = await fixture({ layout: true });
  for (const f of [raw, patched]) {
    f.input.applySettings({ touchSens: 3, touchScale: 1.2 });
    f.down(1, 620, 220); f.move(1, 680, 240); f.up(1);
    const b = f.button('fire', 2); f.move(2, b.x - 40, b.y + 25); f.up(2);
    f.down(3, 120, 400); f.move(3, 155, 420);
  }
  for (const key of ['moveX', 'moveY', 'lookDX', 'lookDY']) assert.equal(patched.input[key], raw.input[key], key);
});

// ---- #936: a platform cancel is reported separately from a finger-up
for (const id of ['fire', 'sub']) for (const type of ['pointercancel', 'lostpointercapture']) {
  test(`#936 held ${id} + ${type} is reported cancelled once; ordinary pointerup and trailing lostpointercapture are not`, async () => {
    const f = await fixture({ layout: true });
    f.button(id, 1); f.input.endFrame(); assert.equal(f.input.down(id), true);
    f.up(1, type); f.up(1, type);
    assert.equal(f.input.down(id), false); assert.equal(f.input.wasCancelled(id), true);
    f.input.endFrame(); assert.equal(f.input.wasCancelled(id), false, 'consumed with the tick');
    f.button(id, 2); f.input.endFrame(); f.up(2); f.up(2, 'lostpointercapture');
    assert.equal(f.input.down(id), false); assert.equal(f.input.wasCancelled(id), false);
  });
}

test('#936 cancelling one of two fingers on a button keeps the hold; a new press supersedes an earlier cancel', async () => {
  const f = await fixture({ layout: true });
  f.button('fire', 1); f.button('fire', 2); f.up(1, 'pointercancel');
  assert.equal(f.input.down('fire'), true); assert.equal(f.input.wasCancelled('fire'), false);
  f.up(2, 'pointercancel'); assert.equal(f.input.wasCancelled('fire'), true);
  f.button('fire', 3); assert.equal(f.input.wasCancelled('fire'), false);
});

test('#936 resets that drop a hold (blur, hide, opening the map) report it cancelled; a tap-only reset does not', async () => {
  for (const action of [f => f.window.dispatch('blur'), f => f.input.setVisible(false), f => f.input.setMap(true), f => f.input.resetPointers()]) {
    const f = await fixture({ layout: true }); f.button('fire', 1); f.button('sub', 2); f.input.endFrame();
    action(f); assert.equal(f.input.wasCancelled('fire'), true); assert.equal(f.input.wasCancelled('sub'), true);
  }
  const f = await fixture({ layout: true }); f.input.resetPointers(); assert.equal(f.input.wasCancelled('fire'), false);
});
