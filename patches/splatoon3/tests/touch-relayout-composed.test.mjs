import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { adaptTouchRelayout } from '../../local-quality/touch-relayout-adapter.mjs';
import { createTouchRelayout } from '../../local-quality/touch-relayout.mjs';
const raw=fs.readFileSync(new URL('../../../inkwave-public/src/core/mobile.js',import.meta.url),'utf8');
const composed=adaptBuildSource('src/core/mobile.js',raw);
function fixture() {
  assert.equal((composed.match(/import \{ createTouchRelayout \}/g)||[]).length,1);
  assert.equal((composed.match(/const relayout = createTouchRelayout\(this, window\);/g)||[]).length,1);
  assert.equal((composed.match(/window\.addEventListener\('resize', relayout/g)||[]).length,1);
  assert.equal(composed.includes('let lastViewportKey'),false,'raw owner removed, not stacked with helper');
  const env={innerWidth:800,innerHeight:600,visualViewport:{width:800,height:600,scale:1},orientation:0,screen:{orientation:{angle:0}},requestAnimationFrame(fn){frames.set(++sequence,fn);return sequence;},cancelAnimationFrame(id){frames.delete(id);}};
  const frames=new Map();let sequence=0;
  const mobile={_abort:new AbortController(),_stick:{active:true,id:7,x:120,y:100,ox:100,oy:100},_stickR:50,editing:true,_edit:{pts:new Map([[9,{}]])},layout:{fire:{x:.8}},resets:0,resyncs:0,layouts:0,gyro:{resync(){mobile.resyncs++;}},resetPointers(){this.resets++;this._edit=null;this._stick.active=false;},_layoutAll(){this.layouts++;this._stickR=40;},_stickUpdate(){}};
  const statement=composed.match(/const relayout = createTouchRelayout\(this, window\);/)[0];
  const layout=new Function('createTouchRelayout','window',statement+'return relayout;').call(mobile,createTouchRelayout,env);
  return {env,mobile,frames,layout,drain(){const queue=[...frames.values()];frames.clear();queue.forEach(fn=>fn());}};
}
test('production-composed duplicate resize preserves edit pointer, draft and pending geometry work',()=>{
 const f=fixture(),edit=f.mobile._edit,draft=f.mobile.layout;
 for(let i=0;i<5;i++)f.layout({type:'resize'});
 assert.equal(f.mobile._edit,edit);assert.equal(f.frames.size,0);assert.equal(f.mobile.resets,0);
 f.env.innerHeight--;f.layout({type:'resize'});assert.equal(f.mobile.resets,1);assert.equal(f.mobile.resyncs,0);
 const newEdit={pts:new Map([[10,{}]])};f.mobile._edit=newEdit;f.layout({type:'resize'});
 assert.equal(f.mobile._edit,newEdit);assert.equal(f.frames.size,1);f.drain();assert.equal(f.mobile.layouts,1);assert.equal(f.mobile.layout,draft);
});
test('production-composed viewport components invalidate editor geometry independently',()=>{
 for(const key of ['innerWidth','innerHeight','width','height','scale']){const f=fixture();if(key.startsWith('inner'))f.env[key]++;else f.env.visualViewport[key]++;f.layout({type:'resize'});assert.equal(f.mobile.resets,1,key);assert.equal(f.mobile.resyncs,0,key);}
 const f=fixture();delete f.env.visualViewport;f.layout({type:'resize'});assert.equal(f.mobile.resets,0);f.env.innerWidth++;f.layout({type:'resize'});assert.equal(f.mobile.resets,1);
});
test('production-composed gameplay holds survive keyboard change, but equal-size physical rotation cancels',()=>{
 const f=fixture();f.mobile.editing=false;f.env.innerHeight=300;f.layout({type:'resize'});assert.equal(f.mobile._stick.active,true);assert.equal(f.mobile.resets,0);f.drain();
 f.env.orientation=90;f.layout({type:'resize'});assert.equal(f.mobile.resets,1);assert.equal(f.mobile.resyncs,1);assert.equal(f.mobile._stick.active,false);
 f.mobile.editing=false;f.layout({type:'orientationchange'});f.layout({type:'change'});assert.equal(f.mobile.resyncs,1);
});
test('production-composed unknown rotation and abort remain synchronous and fail closed',()=>{
 const f=fixture();delete f.env.orientation;f.env.screen={};f.layout({type:'orientationchange'});assert.equal(f.mobile.resets,1);assert.equal(f.mobile.resyncs,1);
 f.mobile._abort.abort();assert.equal(f.frames.size,0);f.layout({type:'resize'});f.drain();assert.equal(f.mobile.layouts,0);
});
test('strict production relayout anchor rejects drift, duplication, old layout and already-composed source',()=>{
 assert.throws(()=>adaptTouchRelayout('src/core/mobile.js',composed),/touch relayout conflict/);
 assert.throws(()=>adaptTouchRelayout('src/core/mobile.js',raw.replace("event?.type === 'resize'",'true')),/touch relayout conflict/);
 assert.throws(()=>adaptTouchRelayout('src/core/mobile.js',raw+raw),/touch relayout conflict/);
 assert.throws(()=>adaptTouchRelayout('src/core/mobile.js',raw.replace('const relayout = (event) =>','const relayout = () =>')),/touch relayout conflict/);
});

const IDS = ['stick', 'fire', 'squid', 'jump', 'sub', 'special', 'map', 'gyro', 'pause'];

// Full actual MobileInput, including its actual installed event handlers. Platform objects
// are deterministic fixtures, not evidence of native browser capture or an iPad device.
async function mobileFixture() {
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
    addEventListener(type, fn, options = {}) { const all = this.listeners.get(type) || []; all.push(fn); this.listeners.set(type, all); options.signal?.addEventListener('abort',()=>this.removeEventListener(type,fn),{once:true}); }
    removeEventListener(type,fn) { this.listeners.set(type,(this.listeners.get(type)||[]).filter(f=>f!==fn)); }
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
  const modules = new Map();
  const filename = fileURLToPath(new URL('../../../inkwave-public/src/core/mobile.js',import.meta.url));
  const mobile = new vm.SourceTextModule(composed,{context,identifier:filename});
  function load(spec,from) {
    if (from.identifier===filename && deps[spec]) return deps[spec];
    let file=path.resolve(path.dirname(from.identifier),spec);
    const published=fileURLToPath(new URL('../../../inkwave-public/patches/',import.meta.url));
    if(file.startsWith(published))file=fileURLToPath(new URL('../../../patches/',import.meta.url))+file.slice(published.length);
    if(!modules.has(file))modules.set(file,new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file}));
    return modules.get(file);
  }
  await mobile.link(load);await mobile.evaluate();
  Object.defineProperties(window,{innerWidth:{get:()=>context.innerWidth},innerHeight:{get:()=>context.innerHeight}});
  window.screen=context.screen;window.orientation=0;
  window.visualViewport={width:1000,height:600,scale:1};
  window.requestAnimationFrame=context.requestAnimationFrame;
  window.cancelAnimationFrame=id=>{frames[id-1]=()=>{};};
  context.cancelAnimationFrame=window.cancelAnimationFrame;
  const owner = { lastDevice: 'touch',enabled:true };
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
    up: (id, type = 'pointerup', x, y) => input.root.dispatch(type, event(id, x, y)),
    button(id, pointer = 1) { const b = input._box(id); route('pointerdown', pointer, b.x, b.y); return b; },
    resetState() { input.resetPointers(); },
    resize() { window.dispatch('resize'); for (const fn of frames.splice(0)) fn(); },
  };
}

test('actual composed MobileInput installed events retain duplicate editor gesture and cancel real geometry changes',async()=>{
 const f=await mobileFixture(),m=f.input;m.editing=true;
 f.button('fire',31);assert.equal(m._edit.pts.size,1);const edit=m._edit,point=edit.pts.get(31),draft=m.layout;
 f.window.dispatch('resize');assert.equal(m._edit,edit);assert.equal(m._edit.pts.get(31),point);assert.equal(m.layout,draft);assert.equal(f.frames.length,0);
 f.window.visualViewport.width--;f.window.dispatch('resize');assert.equal(m._edit,null);assert.equal(m.layout,draft);assert.equal(m.gyro.resyncs,0);
 f.button('fire',32);const next=m._edit;f.window.dispatch('resize');assert.equal(m._edit,next);assert.equal(m._edit.pts.size,1);
 for(const fn of f.frames.splice(0))fn();assert.equal(m._edit,next);
});
test('actual composed MobileInput retains gameplay fire/look/stick on keyboard resize and cancels same-size physical rotation',async()=>{
 const f=await mobileFixture(),m=f.input;f.button('fire',1);f.down(2,950,200);f.down(3,100,300);f.move(3,120,310);
 assert.equal(m.buttons.fire,true);assert.equal(m._ptr.get(2).kind,'look');assert.equal(m._stick.id,3);
 const look=m._ptr.get(2),stick=m._stick;f.context.innerHeight=400;f.window.dispatch('resize');
 assert.equal(m.buttons.fire,true);assert.equal(m._ptr.get(2),look);assert.equal(m._stick,stick);assert.equal(m._stick.id,3);assert.equal(m.gyro.resyncs,0);
 for(const fn of f.frames.splice(0))fn();assert.equal(m.buttons.fire,true);assert.equal(m._ptr.get(2),look);assert.equal(m._stick.id,3);
 f.window.orientation=90;f.window.dispatch('resize');assert.equal(m.buttons.fire,false);assert.equal(m._ptr.size,0);assert.equal(m._stick.id,-1);assert.equal(m.gyro.resyncs,1);
 f.window.dispatch('orientationchange');f.context.screen.orientation.dispatch('change');assert.equal(m.gyro.resyncs,1);
 m.destroy();f.window.dispatch('resize');for(const fn of f.frames.splice(0))fn();assert.equal(m._ptr.size,0);
});
