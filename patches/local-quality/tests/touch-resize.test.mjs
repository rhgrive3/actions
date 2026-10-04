// Focused logic-only acceptance for the #288 same-orientation resize fix.
// Composition per handoff: explicit raw gameplay/touch/reliability chain for
// focused tests (no composeQuality + explicitAdapt double-apply); the parent
// registers adapters in the quality adapter later and adds a canonical
// compose assertion at integration time. No real browser, device, or iPad is
// exercised here; Chromium/WebKit proof belongs to the batch browser proof.
// Requires: node --experimental-vm-modules --test (vm.SourceTextModule).
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptTouchResize, normalizeAngle, physicalAngle, physicalLandscape, samePhysicalOrientation } from '../touch-resize-adapter.mjs';

assert.ok(vm.SourceTextModule, 'run with node --experimental-vm-modules');

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
// Focused chain: raw gameplay -> touch-layout -> reliability -> resize.
// Local-quality adapter is intentionally NOT composed here (integration
// double-applies); parent wires the canonical chain at integration time.
const compose = (rel, code) => adaptTouchResize(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));

async function fixture({ angle = 0, width = 1000, height = 600, screenW = 1000, screenH = 600, stickMode = null } = {}) {
  const timers = new Map(), frames = new Map(), writes = { raf: 0, cancel: 0 };
  const viewport = { innerWidth: width, innerHeight: height };
  const screenBox = { width: screenW, height: screenH };
  let serial = 0, rafSerial = 0;
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
    addEventListener(type, fn, options = {}) {
      const all = this.listeners.get(type) || []; all.push({ fn, signal: options?.signal || null }); this.listeners.set(type, all);
    }
    dispatch(type, event = {}) {
      event.type = event.type || type;
      for (const entry of this.listeners.get(event.type) || []) if (!entry.signal || !entry.signal.aborted) entry.fn(event);
    }
    appendChild(node) { this.children.push(node); return node; }
    setAttribute() {}
    focus() { document.activeElement = this; }
    getClientRects() { return [this.getBoundingClientRect()]; }
    getBoundingClientRect() {
      const w = viewport.innerWidth, h = viewport.innerHeight;
      return { left: 0, right: w, top: 0, bottom: h, width: w, height: h };
    }
    closest() { return null; }
    setPointerCapture(id) { this.captures.add(id); }
    releasePointerCapture(id) { this.captures.delete(id); }
    querySelector(selector) {
      if (!this.nodes.has(selector)) this.nodes.set(selector, new Node());
      return this.nodes.get(selector);
    }
    querySelectorAll(selector) {
      if (selector === '[data-c]') return ['stick', 'fire', 'squid', 'jump', 'sub', 'special', 'map', 'gyro', 'pause'].map(id => {
        const node = this.querySelector(`[data-c="${id}"]`); node.dataset.c = id; return node;
      });
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
  window.innerWidth = width; window.innerHeight = height;
  document.documentElement = new Node('html'); document.documentElement.lang = 'en';
  document.body = new Node('body'); document.createElement = tag => new Node(tag);
  document.querySelector = () => null; document.hidden = false;
  const orientation = new Node('orientation'); orientation.angle = angle;
  const storage = new Map();
  class Gyro {
    constructor() { this.discards = 0; this.resyncs = 0; this.enabled = false; this.supported = true; this.needsPermission = false; }
    configure() {} start() { this.enabled = true; } stop() { this.enabled = false; }
    discard() { this.discards++; this.dYaw = this.dPitch = 0; } resync() { this.resyncs++; }
  }
  const context = vm.createContext({
    console, document, window,
    screen: { orientation, width: screenBox.width, height: screenBox.height },
    AbortController, AbortSignal, structuredClone, navigator: { vibrate() {} },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    setTimeout: (fn, ms) => { const id = ++serial; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => { writes.raf++; const id = ++rafSerial; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => { writes.cancel++; frames.delete(id); },
    Gyro,
    innerWidth: width, innerHeight: height,
  });
  const setViewport = (w, h) => {
    viewport.innerWidth = w; viewport.innerHeight = h;
    context.innerWidth = w; context.innerHeight = h;
    window.innerWidth = w; window.innerHeight = h;
  };
  const setAngle = deg => { orientation.angle = deg; };
  const setScreenBox = (w, h) => {
    screenBox.width = w; screenBox.height = h;
    context.screen.width = w; context.screen.height = h;
  };
  const code = compose('src/core/mobile.js', read('inkwave-public/src/core/mobile.js'));
  const module = text => new vm.SourceTextModule(text, { context });
  const deps = {
    './gyro.js': module('export const Gyro=globalThis.Gyro; export const touchSensMul=()=>1;'),
    './device.js': module('export const touchPrimary=true,touchCapable=true;'),
    '../i18n.js': module('export const t=value=>value;'),
    '../ui/ui-icons.js': module("export const WEAPON_ICONS={shooter:''},SUB_ICONS={bomb:''},SQUID='',specialIcon=()=>'';"),
  };
  const mobile = module(code); await mobile.link(spec => deps[spec]); await mobile.evaluate();
  const owner = { lastDevice: 'touch' };
  const input = new mobile.namespace.MobileInput(new Node('canvas'), owner); input.setVisible(true);
  if (stickMode) { input.s.stickMode = stickMode; input._layoutAll(); }
  const event = (id, x, y, extra = {}) => ({
    pointerId: id, clientX: x, clientY: y, pointerType: 'touch', cancelable: true,
    preventDefault() {}, stopPropagation() {}, target: input.root, ...extra,
  });
  const route = (type, id, x = 0, y = 0, extra) => input.root.dispatch(type, event(id, x, y, extra));
  return {
    input, owner, context, document, window, orientation, timers, frames, writes,
    controls: mobile.namespace.CONTROLS,
    setViewport, setAngle, setScreenBox,
    emit: type => { if (type === 'orientation') orientation.dispatch('change', {}); else window.dispatch(type); },
    flush: () => { for (const [, fn] of [...frames]) { frames.clear(); fn(); } },
    down: (id, x, y, extra) => route('pointerdown', id, x, y, extra),
    move: (id, x, y) => route('pointermove', id, x, y),
    up: (id, type = 'pointerup') => route(type, id),
    button(id, pointer = 1) { const b = input._box(id); route('pointerdown', pointer, b.x, b.y); return b; },
  };
}
test('pure physical-orientation helpers trust the angle API and never treat viewport aspect as rotation', () => {
  assert.equal(normalizeAngle(-90), 270);
  assert.equal(normalizeAngle(44), 0);
  assert.equal(physicalAngle({ orientation: -90 }, { orientation: { angle: 0 } }), 270);
  assert.equal(physicalAngle({}, { orientation: { angle: 90 } }), 90);
  assert.equal(physicalAngle({}, {}), null);
  assert.equal(physicalAngle({ orientation: Number.NaN }, {}), null);
  assert.equal(physicalLandscape({ width: 1000, height: 600 }), true);
  assert.equal(physicalLandscape({ width: 600, height: 1000 }), false);
  assert.equal(physicalLandscape({ width: 600, height: 600 }), null);
  assert.equal(physicalLandscape({}), null);
  // Same physical angle decides; viewport aspect never overrides it.
  assert.equal(samePhysicalOrientation({ angle: 0, landscape: true }, { angle: 0, landscape: false }), true);
  assert.equal(samePhysicalOrientation({ angle: 0, landscape: true }, { angle: 0, landscape: null }), true);
  // Virtual-keyboard style change with no angle API: unknown stays soft
  // (conservative: do not destroy ownership without a physical signal).
  assert.equal(samePhysicalOrientation({ angle: null, landscape: true }, { angle: null, landscape: true }), true);
  assert.equal(samePhysicalOrientation({ angle: null, landscape: null }, { angle: null, landscape: true }), true);
  // With no angle API at all, only an observed physical aspect flip is a rotation.
  assert.equal(samePhysicalOrientation({ angle: null, landscape: true }, { angle: null, landscape: false }), false);
  assert.equal(samePhysicalOrientation({ angle: 0, landscape: true }, { angle: 90, landscape: true }), false);
});

test('touch-resize transform replaces the root relayout anchor once and composes in focused order', () => {
  const raw = read('inkwave-public/src/core/mobile.js');
  assert.equal(adaptTouchResize('src/core/input.js', raw), raw);
  assert.throws(() => adaptTouchResize('src/core/mobile.js', raw), /compose gameplay/);
  const ordered = compose('src/core/mobile.js', raw);
  assert.match(ordered, /touchResizePhysical/);
  assert.match(ordered, /__touchResizeFrame/);
  assert.match(ordered, /cancelAnimationFrame\(__touchResizeFrame\)/);
  assert.equal(ordered.includes('gyro.resync(); this.resetPointers(); requestAnimationFrame'), false);
  assert.equal(ordered.includes('installTouchResize'), false);
  assert.equal(ordered.includes("addEventListener('resize', observe"), false);
  assert.throws(() => adaptTouchResize('src/core/mobile.js', ordered), /already applied/);
  // Explicit drift error, not a silent pass-through.
  assert.throws(() => adaptTouchResize('src/core/mobile.js', ordered.replace('touchResizePhysical', 'moved')), /drifted|already applied/);
});

test('same-angle resize keeps FIRE, stick, look and pending ownership without a retouch', async () => {
  const f = await fixture();
  const fire = f.button('fire'); f.move(1, fire.x - 30, fire.y + 20);
  f.down(2, 120, 420); f.move(2, 160, 400);
  f.down(3, 700, 200); f.move(3, 740, 220);
  const held = { moveX: f.input.moveX, moveY: f.input.moveY, lookDX: f.input.lookDX, lookDY: f.input.lookDY };
  const baseResyncs = f.input.gyro.resyncs, baseDiscards = f.input.gyro.discards;
  f.input.jumpTarget = 3;
  assert.equal(f.input.down('fire'), true);
  assert.equal(f.input._ptr.get(1).id, 'fire');
  assert.equal(f.input._ptr.get(3).kind, 'look');
  assert.equal(f.input._stick.id, 2);
  assert.notEqual(held.lookDX, 0);
  assert.ok(f.input.moveX > 0.05);
  let layouts = 0; const originalSafe = f.input._safe;
  f.input._safe = function (...args) { layouts++; return originalSafe.apply(this, args); };
  f.writes.raf = 0; f.writes.cancel = 0;
  f.setViewport(998, 560); // browser bar moved: same physical angle, viewport only
  f.emit('resize');
  // No synchronous reset: ownership is intact before the coalesced frame.
  assert.equal(f.input.down('fire'), true);
  assert.equal(f.input.wasPressed('fire'), true);
  assert.equal(f.input._pendingEdges.size, 1);
  assert.equal(f.input.jumpTarget, 3);
  assert.equal(f.input._ptr.get(1).id, 'fire');
  assert.equal(f.input._ptr.get(3).kind, 'look');
  assert.equal(f.input._stick.id, 2);
  assert.equal(f.input.moveX, held.moveX); assert.equal(f.input.moveY, held.moveY);
  assert.equal(f.input.lookDX, held.lookDX); assert.equal(f.input.lookDY, held.lookDY);
  assert.equal(f.input.gyro.resyncs, baseResyncs); assert.equal(f.input.gyro.discards, baseDiscards);
  assert.equal(f.writes.raf, 1); // one coalesced frame; the replacement owns the only frame
  f.flush();
  assert.equal(layouts, 1); // the queued relayout still ran its layout pass
  assert.equal(f.input.down('fire'), true);
  assert.equal(f.input.gyro.resyncs, baseResyncs); assert.equal(f.input.gyro.discards, baseDiscards);
  f.move(3, 800, 240); assert.ok(f.input.lookDX > held.lookDX);
  f.move(2, 220, 360);
  assert.ok(Math.abs(f.input.moveX - held.moveX) > 1e-9 || Math.abs(f.input.moveY - held.moveY) > 1e-9);
  f.up(1); assert.equal(f.input.down('fire'), false);
  f.up(2); assert.equal(f.input._stick.id, -1);
  f.up(3); assert.equal(f.input._ptr.has(3), false);
  f.input.endFrame(); assert.equal(f.input.wasPressed('fire'), false);
});

test('viewport aspect flip without physical rotation is not a rotation (virtual keyboard)', async () => {
  const f = await fixture({ width: 1000, height: 500 });
  assert.equal(f.orientation.angle, 0);
  f.button('fire');
  f.setViewport(500, 1000); // viewport flips; physical screen box and angle do not
  f.emit('resize');
  f.flush();
  assert.equal(f.input.down('fire'), true);
  assert.equal(f.input.gyro.resyncs, 0);
});

test('real physical rotation still resyncs gyro and resets pointers exactly once', async () => {
  const f = await fixture();
  f.button('fire');
  f.down(2, 120, 420); f.move(2, 160, 400);
  f.down(3, 700, 200); f.move(3, 740, 220);
  f.input.jumpTarget = 3;
  f.writes.raf = 0;
  f.setAngle(90);
  f.setScreenBox(600, 1000);
  f.emit('resize'); f.emit('orientation'); f.emit('orientationchange');
  assert.equal(f.writes.raf, 1); // one coalesced frame for the whole rotation burst
  f.flush();
  assert.equal(f.input.gyro.resyncs, 1);
  assert.equal(f.input.down('fire'), false);
  assert.equal(f.input._pendingEdges.size, 0);
  assert.equal(f.input.jumpTarget, -1);
  assert.equal(f.input._stick.id, -1);
  assert.equal(f.input.moveX, 0); assert.equal(f.input.lookDX, 0);
  assert.ok(f.input.gyro.discards >= 1);
  // Retouch works after the rotation reset.
  f.button('fire'); assert.equal(f.input.down('fire'), true);
});

test('destroy cancels the pending relayout frame via cancelAnimationFrame; no dead-instance layout', async () => {
  const f = await fixture();
  f.button('fire');
  assert.equal(f.input.down('fire'), true);
  f.writes.raf = 0; f.writes.cancel = 0;
  f.setViewport(998, 560);
  f.emit('resize');
  assert.equal(f.writes.raf, 1);
  assert.equal(f.frames.size, 1);
  let layouts = 0; const originalLayout = f.input._layoutAll;
  f.input._layoutAll = function (...args) { layouts++; return originalLayout.apply(this, args); };
  f.input.destroy();
  assert.equal(f.writes.cancel, 1);
  assert.equal(f.frames.size, 0);
  f.flush();
  assert.equal(layouts, 0); // the abort-owned cleanup cancelled the frame; no dead-instance layout ran
});

test('fixed stick keeps its deflection across a same-angle relayout; next physical move stays continuous', async () => {
  const f = await fixture({ stickMode: 'fixed' });
  const home = { ...f.input._stickHome };
  f.down(2, home.x + 20, home.y - 10);
  f.move(2, home.x + 40, home.y - 20);
  const held = { moveX: f.input.moveX, moveY: f.input.moveY };
  assert.ok(Math.abs(held.moveX) > 1e-9 || Math.abs(held.moveY) > 1e-9);
  const finger = { x: f.input._stick.x, y: f.input._stick.y };
  const origin = { ox: f.input._stick.ox, oy: f.input._stick.oy };
  f.setViewport(998, 560);
  f.emit('resize'); f.flush();
  assert.equal(f.input._stick.id, 2);
  // No teleport: the stored deflection (hence velocity/direction) is unchanged
  // by the layout pass, even when the drawn home moved.
  assert.ok(Math.abs(f.input.moveX - held.moveX) < 1e-9);
  assert.ok(Math.abs(f.input.moveY - held.moveY) < 1e-9);
  assert.equal(f.input._stick.ox, origin.ox);
  assert.equal(f.input._stick.oy, origin.oy);
  assert.equal(f.input._stick.x, finger.x);
  assert.equal(f.input._stick.y, finger.y);
  // The next native event reports a nearby physical finger coordinate:
  // velocity/direction evolve continuously from the held vector, no jump.
  f.move(2, finger.x + 6, finger.y - 4);
  assert.ok(Math.abs(f.input.moveX - held.moveX) < 0.25, `moveX jumped: ${f.input.moveX} vs ${held.moveX}`);
  assert.ok(Math.abs(f.input.moveY - held.moveY) < 0.25, `moveY jumped: ${f.input.moveY} vs ${held.moveY}`);
  f.up(2); assert.equal(f.input._stick.id, -1);
});
