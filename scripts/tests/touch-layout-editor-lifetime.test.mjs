import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptBuildSource } from '../inkwave-source-composition.mjs';

const raw = fs.readFileSync(new URL('../../inkwave-public/src/core/mobile.js', import.meta.url), 'utf8');
const composed = adaptBuildSource('src/core/mobile.js', raw);
const method = name => { const a = composed.indexOf('\n  '+name+'('); assert(a >= 0, name); const b = composed.indexOf('\n  }', a); return composed.slice(a, b+4); };
const a = composed.indexOf('function installTouchLayout('), b = composed.indexOf('\ninstallTouchLayout(MobileInput, CONTROLS);', a);
assert(a >= 0 && b > a);
const c = composed.indexOf('export const CONTROLS = '), d = composed.indexOf('\n};', c);
const controlsSource = composed.slice(c, d+3).replace('export const ', 'const ');

function fixture() {
  class Element extends EventTarget {
    constructor() { super(); this.children=[];this.value='';this.dataset={};this.textContent='';this.attrs={};this.style={setProperty(){}};this.isConnected=true; const s=new Set(); this.classList={add:x=>s.add(x),remove:x=>s.delete(x),contains:x=>s.has(x)}; }
    addEventListener(type,handler,options={}){(this.listeners ||= new Map());if(options.signal?.aborted)return;const list=this.listeners.get(type)||[];list.push(handler);this.listeners.set(type,list);options.signal?.addEventListener('abort',()=>this.listeners.set(type,(this.listeners.get(type)||[]).filter(h=>h!==handler)),{once:true});}
    dispatchEvent(event){for(const handler of this.listeners?.get(event.type)||[])handler(event);return !event.defaultPrevented;}
    appendChild(el){this.children.push(el);}
    setAttribute(k,v){this.attrs[k]=v;}
    getClientRects(){return [{}];}
    focus(){document.activeElement=this;}
    set innerHTML(value){this.html=value;}
  }
  const editor=new Element(), select=new Element(), size=new Element(), x=new Element(), y=new Element(), details=new Element(), summary=new Element();x.dataset.axis='x';y.dataset.axis='y';
  const actions=Object.fromEntries(['save','cancel','reset','one'].map(k=>{const el=new Element();el.dataset.e=k;return [k,el];}));
  const nodes={'.iwm-edit':editor,select,'.iwm-edit__size':size,'[data-axis="x"]':x,'[data-axis="y"]':y,'.iwm-layout-position':details,'.iwm-layout-position summary':summary};
  for(const cls of ['iwm-edit__pct','iwm-edit__title','iwm-edit__hint','iwm-layout-select-label','iwm-layout-size-label','iwm-layout-note','iwm-layout-error'])nodes['.'+cls]=new Element();
  for(const[k,el]of Object.entries(actions))nodes[`[data-e="${k}"]`]=el;
  const root=new Element(), document={documentElement:{lang:'ja'},activeElement:new Element(),querySelector:()=>null,createElement:()=>new Element()}, window=new Element();
  const query = q => nodes[q] || null;
  editor.querySelector=root.querySelector=query;
  editor.querySelectorAll=q=>q==='[data-e]'?Object.values(actions):q==='[data-axis]'?[x,y]:q==='option'?select.children:[];
  let controls;
  root.querySelectorAll=q=>q==='.is-sel'?Object.values(controls||{}).filter(e=>e.classList.contains('is-sel')):q.includes('button, select')?[...Object.values(actions),select,size,x,y]:[];
  const store=new Map();let failSave=false;
  const localStorage={setItem(k,v){if(failSave)throw Error('quota');store.set(k,v);},getItem:k=>store.get(k)||null};
  const ctx={document,window,innerWidth:844,innerHeight:390,structuredClone,localStorage,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),layoutUnit:()=>390,getComputedStyle:()=>({getPropertyValue:()=>''}),AbortController};
  const Mobile=vm.runInNewContext(`${controlsSource}\nclass MobileInput { _install(){} _layoutAll(){} _layoutOne(){} _syncVisible(){} _drawStick(){} resetPointers(){} reset(){} ${['_cfg','_box','_editAction','_editScale'].map(method).join('\n')} }\n${composed.slice(a,b)}\ninstallTouchLayout(MobileInput, CONTROLS); MobileInput;`,ctx);
  const m=new Mobile();controls=Object.fromEntries(['stick','fire','squid','jump','sub','special','map','cameraReset','gyro','pause'].map(id=>{const e=new Element();e.querySelector=()=>e.children[0];return[id,e];}));
  Object.assign(m,{root,els:controls,_abort:new AbortController(),layout:{fire:{ax:'r',ay:'b',dx:.2,dy:.3,s:1.1}},_safeBox:{l:0,r:0,t:0,b:0},_H:390,_stick:{},s:{touchScale:1},pressed:new Set(),editing:false,owner:{},_hitButton:()=>null});
  m._install();
  return{m,root,editor,actions,select,size,x,y,details,store,document,window,set failSave(v){failSave=v;},event(el,type){el.dispatchEvent(new Event(type,{cancelable:true}));}};
}
const snapshot=m=>JSON.stringify(m.layout);

test('Save persists one draft, restores focus and callback once; late cancel cannot undo',()=>{const f=fixture();const focus=f.document.activeElement;let callbacks=0;f.m.openEditor(saved=>{assert.equal(saved,true);callbacks++;});f.m._layoutPosition('fire',300,200);const draft=snapshot(f.m);f.event(f.actions.save,'click');assert.equal(f.m.editing,false);assert.equal(f.store.get('inkwave.touchLayout'),draft);assert.equal(f.document.activeElement,focus);f.event(f.actions.cancel,'click');assert.equal(snapshot(f.m),draft);assert.equal(callbacks,1);});
test('Cancel restores backup; save/storage failure keeps draft and Escape cancels',()=>{const f=fixture();const original=snapshot(f.m);let result;f.m.openEditor(saved=>result=saved);f.m._layoutPosition('jump',400,100);f.failSave=true;f.event(f.actions.save,'click');assert.equal(f.m.editing,true);assert(f.root.querySelector('.iwm-layout-error').textContent);const e=new Event('keydown',{cancelable:true});Object.assign(e,{key:'Escape'});f.window.dispatchEvent(e);assert.equal(f.m.editing,false);assert.equal(result,false);assert.equal(snapshot(f.m),original);assert.equal(f.store.size,0);});
test('closing drops active drag/pinch and later moves do not mutate the saved draft',()=>{const f=fixture();f.m.openEditor();f.m._edit={pts:new Map([[1,{x:50,y:50}]]),drag:{id:'fire',pointer:1,ox:0,oy:0}};f.m._closeEditor(true);const saved=snapshot(f.m);f.m._editMove({pointerId:1,clientX:600,clientY:300});assert.equal(f.m._edit,null);assert.equal(snapshot(f.m),saved);});
test('closed reset button cannot mutate layout after Save or Cancel',()=>{for(const save of[true,false]){const f=fixture();f.m.openEditor();f.m._closeEditor(save);const before=snapshot(f.m);f.event(f.actions.reset,'click');assert.equal(snapshot(f.m),before);assert.equal(f.m._sel,null);}});
test('closed coordinate event is inert and never resolves a null control',()=>{const f=fixture();f.m.openEditor();f.m._closeEditor(false);const before=snapshot(f.m);f.x.value='75';assert.doesNotThrow(()=>f.event(f.x,'input'));assert.equal(snapshot(f.m),before);});
test('delayed select/size/XY events after close cannot modify layout or selection',()=>{const f=fixture();f.m.openEditor();f.m._closeEditor(true);const before=snapshot(f.m);f.select.value='jump';f.event(f.select,'change');f.size.value='170';f.event(f.size,'input');f.x.value='100';f.event(f.x,'input');f.y.value='100';f.event(f.y,'input');assert.equal(snapshot(f.m),before);assert.equal(f.m._sel,null);});
test('expanded precise XY edits remain draft-only and reopen collapses details',()=>{const f=fixture();const original=snapshot(f.m);f.m.openEditor();assert.equal(f.details.open,false);f.details.open=true;f.select.value='jump';f.event(f.select,'change');f.x.value='100';f.event(f.x,'input');f.y.value='0';f.event(f.y,'input');assert(f.m.layout.jump);assert.equal(f.store.size,0);assert(f.actions.save&&f.actions.cancel&&f.actions.reset);f.event(f.actions.cancel,'click');assert.equal(snapshot(f.m),original);f.m.openEditor();assert.equal(f.details.open,false);f.event(f.actions.one,'click');assert.equal(f.m.layout.fire,undefined);f.event(f.actions.cancel,'click');assert.equal(snapshot(f.m),original);});
test('abort retires editor native events without writing a draft',()=>{const f=fixture();f.m.openEditor();const original=snapshot(f.m);f.m._abort.abort();f.select.value='jump';f.event(f.select,'change');f.x.value='100';f.event(f.x,'input');f.event(f.actions.reset,'click');assert.equal(snapshot(f.m),original);assert.equal(f.store.size,0);});
