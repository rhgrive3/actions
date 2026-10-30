import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptPauseModalLifetime } from '../pause-modal-lifetime-adapter.mjs';
const root = path.resolve(process.env.INKWAVE_SOURCE_ROOT || fileURLToPath(new URL('../../../', import.meta.url)));
const { installMenuQuality } = await import(pathToFileURL(path.join(root, 'patches/local-quality/menu.mjs')));
const { adaptBuildSource } = await import(pathToFileURL(path.join(root, 'scripts/inkwave-source-composition.mjs')));
const raw = fs.readFileSync(path.join(root, 'inkwave-public/src/ui/menus.js'), 'utf8');
const production = adaptBuildSource('src/ui/menus.js', raw);
const section = (s,a,b) => { const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i,a);return s.slice(i,j); };
// Negative control restores only the unchanged captured native modal methods,
// keeping the actual production binding and installed input-capture guards.
const modalStart = '  _openModal({', modalEnd = '\n  // ================================================================ building blocks';
const composed = production.replace(section(production, modalStart, modalEnd), section(raw, modalStart, modalEnd));
const candidate = production.includes('const confirmationOwner = this._scr') ? production : adaptPauseModalLifetime('src/ui/menus.js', production);
class Element {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.listeners={};this.dataset={};this.inert=false;this.opacity=1;this.style={getPropertyValue:()=>'',setProperty(){}};const set=new Set();this.classList={add:(...xs)=>xs.forEach(x=>set.add(x)),remove:(...xs)=>xs.forEach(x=>set.delete(x)),contains:x=>set.has(x),toggle:(x,on)=>((on??!set.has(x))?set.add(x):set.delete(x))};}
  get parentNode(){return this.parentElement;}
  get isConnected(){let n=this;while(n.parentElement)n=n.parentElement;return n.tagName==='DOCUMENT';}
  append(...xs){for(const x of xs.flat(Infinity).filter(x=>x!=null)){if(typeof x==='object'){x.remove();x.parentElement=this;}this.children.push(x);}}
  appendChild(x){this.append(x);return x;}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);this.parentElement=null;}
  contains(x){for(;x;x=x.parentElement)if(x===this)return true;return false;}
  closest(s){for(let n=this;n;n=n.parentElement){if(s==='[data-nav]'&&n.dataset.nav)return n;if(s.startsWith('.')&&n.classList.contains(s.slice(1)))return n;}return null;}
  querySelectorAll(s){const all=[];const visit=n=>{for(const c of n.children){if(typeof c!=='object')continue;if(s==='[data-nav]'&&c.dataset.nav)all.push(c);else if(s.startsWith('.')&&c.classList.contains(s.slice(1)))all.push(c);visit(c);}};visit(this);return all;}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
  addEventListener(type,fn,o){(this.listeners[type]||=[]).push({fn,capture:o===true||!!o?.capture});}
  getBoundingClientRect(){return{left:0,top:0,right:100,bottom:50,width:100,height:50};}
}
const h=(tag,attrs,...children)=>{const el=new Element(tag);for(const[k,v]of Object.entries(attrs||{})){if(k==='class')el.classList.add(...v.split(/\s+/).filter(Boolean));else if(k==='style')Object.assign(el.style,v);else el[k]=v;}el.append(children);return el;};
function dispatch(target,type){const path=[];for(let n=target;n;n=n.parentElement)path.unshift(n);let stopped=false;const e={type,target,pointerType:'touch',stopImmediatePropagation(){stopped=true;},preventDefault(){}};for(const n of path)for(const l of n.listeners[type]||[])if((l.capture||n===target)&&!stopped)l.fn(e);return !stopped;}
function physicalTap(target){for(let n=target;n;n=n.parentElement)if(n.inert)return false;dispatch(target,'pointerdown');return dispatch(target,'click');}
function fixture({fixed=false,online=false,results=false}={}){
  const source=fixed?candidate:composed;
  const methods=[section(source,'  _bind(el, opts = {}) {','\n  /** Pointer'),section(source,'  _openModal({','\n  // ================================================================ building blocks'),section(source,'  _btn({','\n  _panel('),section(source,'  _back() {','\n  _titleGo('),section(source,'  _resume() {','\n  /** Live match')].join('\n');
  const timers=[];const document=new Element('document');document.hidden=false;
  const env={document,performance:{now:()=>1000},getComputedStyle:n=>({opacity:String(n.opacity),borderTopLeftRadius:'4px'}),setTimeout:(fn,delay)=>{const t={fn,delay};timers.push(t);return t;},clearTimeout(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},addEventListener(){},console};
  const Menus=vm.runInNewContext('class Menus {'+methods+'\n_swap(){}\n_updateCursor(){}\n}; Menus',{...env,h,splatSVG:()=>'',safeCall:f=>f()});
  installMenuQuality(Menus,env);
  const m=new Menus(),ui=new Element(),root=new Element(),returnFocus=h('button',{class:'quit'});document.append(ui);ui.append(root);root.append(returnFocus);
  const calls=[];Object.assign(m,{el:ui,cursorEl:new Element(),_cur:{on:false},current:'pause',_scr:{el:root,name:'pause'},_focus:returnFocus,_swapToken:1,_shownAt:0,_binds:new WeakMap(),_input:'touch',_lastMove:0,_stack:['pause'],_sfx(){},_fx(){},_press(){},api:{quitMatch:()=>calls.push('quit'),resumeMatch:()=>calls.push('resume')},show:(name)=>{calls.push('show:'+name);m.current=name;},_setFocus(el){this._focus=el;},_go(name){calls.push('go:'+name);}});
  if(results){m.current='results';m._scr.name='results';m._stack=['results'];}
  else m._scr.onBack=()=>m._resume();
  m._swap(); // installs the ACTUAL production menuQuality capture guard.
  const prefix=section(source,'  _scr_pause() {','\n    const tilts =');
  const items=vm.runInNewContext('({'+prefix+'\nreturn items;}})',{G:online?{net:{state:'match'}}:{},GLYPHS:new Proxy({},{get:()=>''}),safeCall:f=>f()})._scr_pause.call(m);
  let home=null;
  if(results){const block=section(source,'    const home = online\n',"\n\n    const el = h('div', { class: 'iw-screen iw-results");home=vm.runInNewContext('function resultHome(){'+block+'\nreturn home;} resultHome',{online,GLYPHS:new Proxy({},{get:()=>''}),safeCall:f=>f()}).call(m);root.append(home);m.api.toMainMenu=()=>calls.push('home');}
  const open=()=>{if(results)physicalTap(home);else items.find(x=>x.id==='quit').accept();const modal=m._modal;return{modal,buttons:modal.querySelectorAll('[data-nav]')};};
  return{m,calls,timers,open,physicalTap,dispatch,returnFocus,home};
}

test('negative control: current046 Cancel permits late old QUIT on the same pause screen',()=>{
  const f=fixture(),{modal,buttons}=f.open();
  physicalTap(buttons[0]);assert.equal(f.m._modal,null);assert(modal.isConnected);assert(modal.classList.contains('is-leaving'));
  dispatch(buttons[1],'click');assert.deepEqual(f.calls,['quit','show:main']);
});

test('candidate retires Cancelled confirmation immediately; queued click/callback cannot quit',()=>{
  const f=fixture({fixed:true}),{modal,buttons}=f.open(),oldAccept=f.m._binds.get(buttons[1]).accept;
  physicalTap(buttons[0]);assert.equal(f.m._modal,null);assert.equal(modal.inert,true);assert.equal(f.m._binds.has(buttons[1]),false);assert(modal.isConnected,'existing fade preserved');
  assert.equal(physicalTap(buttons[1]),false);dispatch(buttons[1],'click');oldAccept('mouse');assert.deepEqual(f.calls,[]);assert.equal(f.m.current,'pause');assert.equal(f.m._focus,f.returnFocus);
});

test('candidate QUIT executes once through repeated queued clicks; online/offline both retain route',()=>{
  for(const online of[false,true]){const f=fixture({fixed:true,online}),{buttons}=f.open(),old=f.m._binds.get(buttons[1]).accept;physicalTap(buttons[1]);dispatch(buttons[1],'click');old('mouse');assert.deepEqual(f.calls,['quit','show:main']);}
});

test('Escape closes only the confirmation; next Back resumes; reopening owns only new actions',()=>{
  const f=fixture({fixed:true}),first=f.open(),old=f.m._binds.get(first.buttons[1]).accept;f.m._back();assert.equal(f.m.current,'pause');assert.deepEqual(f.calls,[]);const second=f.open();old('mouse');assert.equal(f.m._modal,second.modal);assert.deepEqual(f.calls,[]);physicalTap(second.buttons[0]);f.m._back();assert.deepEqual(f.calls,['resume','show:null']);
});

test('screen generation and owning screen fence direct stale modal callbacks',()=>{
  for(const kind of['generation','screen','logical']){const f=fixture({fixed:true}),{buttons}=f.open(),accept=f.m._binds.get(buttons[1]).accept;if(kind==='generation')f.m._swapToken++;else if(kind==='screen')f.m._scr={name:'pause',el:new Element()};else f.m.current='main';accept('mouse');assert.deepEqual(f.calls,[],kind);}
});

test('adapter touches only unique native confirmation anchors and fails closed on drift/repeat',()=>{
  assert.equal(adaptPauseModalLifetime('styles/ui.css',composed),composed);assert.throws(()=>adaptPauseModalLifetime('src/ui/menus.js',''),/expected one/);const next=adaptPauseModalLifetime('src/ui/menus.js',composed);assert.throws(()=>adaptPauseModalLifetime('src/ui/menus.js',next),/repeated/);assert(!next.includes('confirmationOwner?.el || this._modal) return;\n    this.show'));
});

test('online results LEAVE confirmation shares Cancel/late-click retirement; offline HOME still commits once',()=>{
  const before=fixture({online:true,results:true}),old=before.open();physicalTap(old.buttons[0]);dispatch(old.buttons[1],'click');assert.deepEqual(before.calls,['quit'],'existing result-confirmation defect reproduced');
  const f=fixture({fixed:true,online:true,results:true}),{buttons}=f.open(),accept=f.m._binds.get(buttons[1]).accept;f.m._back();assert.equal(f.m.current,'results');dispatch(buttons[1],'click');accept('mouse');assert.deepEqual(f.calls,[]);
  const local=fixture({fixed:true,results:true});physicalTap(local.home);dispatch(local.home,'click');assert.deepEqual(local.calls,['home','show:main']);
});

test('old fade cleanup removes only its modal and cannot close the freshly reopened confirmation',()=>{
  const f=fixture({fixed:true}),first=f.open();physicalTap(first.buttons[0]);const timer=f.timers.find(t=>t.delay===240);const next=f.open();timer.fn();assert.equal(first.modal.isConnected,false);assert.equal(f.m._modal,next.modal);assert.equal(next.modal.isConnected,true);assert.equal(f.m._focus,next.buttons[0]);
});

test('retirement change is restricted to standard confirmation, not unrelated custom drawers',()=>{
  const f=fixture({fixed:true}),drawer=h('div',{class:'iw-ldr'}),button=f.m._btn({id:'existing-custom-item',label:'Existing',accept(){}});drawer.append(button);f.m._scr.el.append(drawer);f.m._modal=drawer;f.m._closeModal();assert.equal(drawer.inert,false);assert.equal(f.m._binds.has(button),true);assert(drawer.classList.contains('is-leaving'));
});
