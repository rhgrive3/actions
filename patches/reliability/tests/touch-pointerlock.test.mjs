// Executes real gameplay-adapted Player, Input, MobileInput, Actor and weapons.
// DOM display surfaces and collisions are fixtures; input delivery is production code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { installClock, runSimulation, STEP } from '../../splatoon3/runtime/clock.mjs';
import { adaptInput } from '../input-adapter.mjs';
import {adaptTouchEdges} from '../touch-edge-adapter.mjs';
import {adaptReliability} from '../adapter.mjs';
import {adaptTouchLayout} from '../../touch-layout/adapter.mjs';
import {adaptQualitySource} from '../../local-quality/adapter.mjs';
import {adoptCanvasTouch as sourceAdopt,continueCanvasTouch as sourceContinue} from '../../local-quality/first-touch-adapter.mjs';
import {adaptTouchPointerLock} from '../touch-pointerlock-adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const RAW = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const SITE=process.env.INKWAVE_POINTER_LOCK_SITE;
const UPSTREAM=SITE||RAW;
const {adoptCanvasTouch,continueCanvasTouch}=SITE?await import(path.join(SITE,'patches/local-quality/first-touch-adapter.mjs')):{adoptCanvasTouch:sourceAdopt,continueCanvasTouch:sourceContinue};
const IDS = ['jump', 'squid', 'fire', 'sub', 'special'];
const read = rel => fs.readFileSync(path.join(RAW, rel), 'utf8');
const classList = () => ({ add() {}, remove() {}, toggle() {} });

async function boot({exit='async'}={}) {
 const f=await fixture(),listeners=new Map(),docListeners=new Map(),modules=new Map();let exits=0,requests=0,unlocks=0;
 const add=(map,name,fn)=>{if(!map.has(name))map.set(name,[]);map.get(name).push(fn);};
 const doc={hidden:false,documentElement:{classList:classList()},addEventListener:(n,fn)=>add(docListeners,n,fn),querySelector:()=>null,pointerLockElement:null};
 const fireDoc=()=>{for(const fn of docListeners.get('pointerlockchange')||[])fn();};
 const canvas={ownerDocument:doc,closest:()=>null,requestPointerLock(){requests++;}};
 doc.exitPointerLock=()=>{exits++;if(exit==='throw')throw Error('fixture exit unavailable');if(exit==='sync'){doc.pointerLockElement=null;fireDoc();}};
 const context=vm.createContext({console,performance,AbortController,setTimeout,clearTimeout,
  screen:{width:1000,height:700,orientation:{angle:0}},innerWidth:1000,innerHeight:700,
  localStorage:{getItem:()=>null},navigator:{userAgent:'hybrid pointer fixture',maxTouchPoints:0,getGamepads:()=>[]},
  window:{addEventListener:(n,fn)=>add(listeners,n,fn)},document:doc});
 function synthetic(file,values){return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context,identifier:file});}
 function load(file){if(modules.has(file))return modules.get(file);const rel=path.relative(UPSTREAM,file);let mod;
  if(['src/core/ctx.js','src/config.js','src/game/physics.js'].includes(rel))mod=synthetic(file,f);
  else if(file==='three')mod=synthetic(file,f.THREE);
  else {const raw=fs.readFileSync(file,'utf8');const code=!SITE&&file.startsWith(UPSTREAM+path.sep)?adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,raw)))):raw;mod=new vm.SourceTextModule(code,{context,identifier:file});}
  modules.set(file,mod);return mod;}
 const entry=new vm.SourceTextModule("export {Input} from './src/core/input.js';",{context,identifier:path.join(UPSTREAM,'pointer-lock-fixture.js')});
 await entry.link((spec,from)=>{if(spec==='three')return load('three');let file=path.resolve(path.dirname(from.identifier),spec);if(!SITE&&file.startsWith(path.join(UPSTREAM,'patches')+path.sep))file=path.join(ROOT,path.relative(UPSTREAM,file));return load(file);});await entry.evaluate();
 Object.assign(f.G,{mode:'match',match:{state:'playing',paused:false,attract:false},game:{menus:{current:null}}});
 const input=new entry.namespace.Input(canvas),mobile=input.mobile;
 Object.assign(mobile,{active:true,visible:true,root:{classList:classList(),querySelectorAll:()=>[],setPointerCapture(){}},els:Object.fromEntries([...IDS,'map'].map(id=>[id,{classList:classList()}])),_abort:new AbortController(),_stickHome:{x:100,y:500,d:120},_stickR:60});mobile._drawStick=()=>{};
 input.onUnlock=()=>{unlocks++;};input.lastDevice='kbm';doc.pointerLockElement=canvas;fireDoc();
 const event=(name,e)=>{for(const fn of listeners.get(name)||[])fn(e);};
 const touch=(kind,id=1)=>{mobile._hitButton=()=>kind==='fire'?'fire':null;const e={pointerType:'touch',pointerId:id,target:canvas,clientX:kind==='stick'?100:700,clientY:kind==='stick'?500:250,type:'pointerdown',preventDefault(){},stopPropagation(){}};event('pointerdown',e);const once=adoptCanvasTouch(mobile,e);assert.equal(once,true);assert.equal(adoptCanvasTouch(mobile,e),false);return e;};
 return {G:f.G,input,mobile,doc,canvas,event,touch,exits:()=>exits,requests:()=>requests,unlocks:()=>unlocks,
  release(e){continueCanvasTouch(mobile,{...e,type:'pointerup'},true);},
  mouse(){event('pointerdown',{pointerType:'mouse',target:canvas});},move(){event('mousemove',{movementX:1,movementY:2});},
  unlocked(){doc.pointerLockElement=null;fireDoc();},locked(){doc.pointerLockElement=canvas;fireDoc();},listenerCount:()=>[...listeners.values(),...docListeners.values()].reduce((n,a)=>n+a.length,0)};
}
for(const kind of ['fire','stick','look'])for(const exit of ['sync','async'])test(`#662 ${kind} touch survives ${exit} mouse unlock and delayed motion`,async()=>{
 const h=await boot({exit}),e=h.touch(kind),owned=()=>h.mobile._ptr.has(e.pointerId)||h.mobile._stick.id===e.pointerId;
 assert.equal(h.exits(),1);assert.equal(h.input.lastDevice,'touch');assert.equal(h.input.locked,false);assert.equal(owned(),true);
 h.move();h.mouse();assert.equal(h.input.lastDevice,'touch');assert.equal(owned(),true);assert.equal(h.requests(),0);assert.equal(h.input.mouse.dx,0);
 if(exit==='async')h.unlocked();assert.equal(h.unlocks(),0,'programmatic touch unlock never invokes pause');
 h.release(e);assert.equal(owned(),false);h.mouse();assert.equal(h.input.lastDevice,'kbm');assert.equal(h.requests(),1);h.locked();h.move();assert.equal(h.input.mouse.dx,1);
 h.unlocked();assert.equal(h.unlocks(),1,'a later genuine mouse Escape still invokes pause');
});
test('#662 repeated touch/mouse round trips retain one router and no stale holds',async()=>{
 const h=await boot(),count=h.listenerCount();for(let i=0;i<20;i++){const e=h.touch('fire',i+1);assert.equal(h.mobile.down('fire'),true);h.move();assert.equal(h.mobile.down('fire'),true);h.unlocked();h.release(e);assert.equal(h.mobile.down('fire'),false);h.mouse();h.locked();h.move();}
 assert.equal(h.exits(),20);assert.equal(h.requests(),20);assert.equal(h.unlocks(),0);assert.equal(h.listenerCount(),count);assert.equal(h.mobile._ptr.size,0);
});
test('#662 stale lock acquisition while touch owns input is retired without pausing',async()=>{
 const h=await boot(),e=h.touch('look');h.unlocked();h.locked();assert.equal(h.input.locked,false);assert.equal(h.exits(),2);h.move();assert.equal(h.input.lastDevice,'touch');h.unlocked();h.release(e);assert.equal(h.unlocks(),0);
});
test('#662 mouse press before async unlock cannot resurrect the old lock or lose the later retry',async()=>{
 const h=await boot(),e=h.touch('fire');h.release(e);h.mouse();assert.equal(h.requests(),0);h.move();assert.equal(h.input.mouse.dx,0);h.unlocked();assert.equal(h.unlocks(),0);h.mouse();assert.equal(h.requests(),1);h.locked();assert.equal(h.input.locked,true);
});
test('#662 exit failure still protects live touch and permits explicit mouse reuse',async()=>{
 const h=await boot({exit:'throw'}),e=h.touch('fire');h.move();assert.equal(h.mobile.down('fire'),true);h.release(e);h.mouse();assert.equal(h.input.lastDevice,'kbm');assert.equal(h.input.locked,true);h.move();assert.equal(h.input.mouse.dx,1);
});
test('#662 adapter fails closed on duplicate and missing input connections',()=>{
 const rel='src/core/input.js',raw=read(rel),prior=adaptInput(rel,raw);assert.throws(()=>adaptTouchPointerLock(rel,''),/conflict/);assert.throws(()=>adaptTouchPointerLock(rel,adaptTouchPointerLock(rel,prior)),/conflict/);assert.equal(adaptTouchPointerLock('other','unchanged'),'unchanged');
});

test('#662 returning mouse does not lock in menus, paused play, finish or attract',async()=>{
 for(const state of ['menu','paused','finish','attract','submenu']){const h=await boot(),e=h.touch('look');h.unlocked();h.release(e);if(state==='menu')h.G.mode='menu';else if(state==='paused')h.G.match.paused=true;else if(state==='finish')h.G.match.state='finish';else if(state==='attract')h.G.match.attract=true;else h.G.game.menus.current='settings';h.mouse();assert.equal(h.requests(),0,state);assert.equal(h.input.lastDevice,'kbm');}
});
test('#662 queued acquire and touch-exit notifications may both observe unlocked state without pausing',async()=>{
 const h=await boot();h.input.locked=false; // Browser acquired the canvas; its notification has not run yet.
 const e=h.touch('fire');h.doc.pointerLockElement=null;h.unlocked();h.unlocked();
 assert.equal(h.unlocks(),0);assert.equal(h.mobile.down('fire'),true);assert.equal(h.input.lastDevice,'touch');
 h.release(e);h.mouse();h.locked();h.unlocked();assert.equal(h.unlocks(),1,'a later observed mouse lock still reports one genuine Escape');
});
