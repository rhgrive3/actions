import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SOURCE_ROOT = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const BUILT=process.env.INKWAVE_PORTRAIT_SITE;
const source = (raw=false) => fs.readFileSync(path.join(raw?SOURCE_ROOT:(BUILT||SOURCE_ROOT), 'src/core/mobile.js'), 'utf8');
const IDS = ['stick', 'fire', 'squid', 'jump', 'sub', 'special', 'map', 'gyro', 'pause'];

// Full actual MobileInput, including its actual installed event handlers. Platform objects
// are deterministic fixtures, not evidence of native browser capture or an iPad device.
export async function fixture({ raw = false, layout = false } = {}) {
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
  const module = (text,identifier=path.join(BUILT||SOURCE_ROOT,'src/core/mobile.js')) => new vm.SourceTextModule(text, { context,identifier });
  const deps = {
    './gyro.js': module('export const Gyro=globalThis.Gyro; export const touchSensMul=()=>1;'),
    './device.js': module('export const touchPrimary=true,touchCapable=true;'),
    '../i18n.js': module('export const t=value=>value;'),
    '../ui/ui-icons.js': module("export const WEAPON_ICONS={shooter:''},SUB_ICONS={bomb:''},SQUID='',specialIcon=()=>'';"),
  };
  let code = source(raw);
  if (!raw&&!BUILT) code=adaptQualitySource('src/core/mobile.js',adaptReliability('src/core/mobile.js',adaptTouchLayout('src/core/mobile.js',adaptSource('src/core/mobile.js',code))));
  const mods=new Map();
  const mobile=module(code);await mobile.link((spec,from)=>{if(deps[spec])return deps[spec];let f=path.resolve(path.dirname(from.identifier),spec);if(!BUILT)f=f.replace('/inkwave-public/patches/','/patches/');if(!mods.has(f))mods.set(f,module(fs.readFileSync(f,'utf8'),f));return mods.get(f);});await mobile.evaluate();
  const owner = { lastDevice: 'touch' };
  const input = new mobile.namespace.MobileInput(new Node('canvas'), owner); input.setVisible(true);document.documentElement.classList.add('iw-touch');
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
