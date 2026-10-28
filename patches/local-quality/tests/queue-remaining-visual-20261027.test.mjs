import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
const rel='src/fx/fxHooks.js',s=adaptBuildSource(rel,fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8'));
const start=s.indexOf('  _projectiles(P, dt) {'),end=s.indexOf('    // slosh wave heads',start);
const context=vm.createContext({PLAYER:{waterY:-100},bucketSheetProjectile:()=>false,bucketSheetHead:()=>false,Math,Set});
const run=vm.runInContext('(function(P, dt){'+s.slice(start,end).split('{').slice(1).join('{')+'})',context);
test('trail budget preserves ordinary order and fairly serves stable overloaded rosters',()=>{
for(const n of [0,1,48,49,100]){
 const trace=[],state={fx:{shotTrail(p){trace.push(p.x);}},seen:{'weapon:fire':true},heads:new Map(),G:{},_near:()=>true};
 const list=Array.from({length:n},(_,i)=>({pos:{x:i,y:0,z:0},vel:{x:60,y:0,z:0},owner:{color:1},age:1,_fxAge:1,_fxD:0,_fxY:0,type:'shooter'}));
 const covered=new Set();
 for(let frame=0;frame<Math.max(1,Math.ceil(n/48));frame++){trace.length=0;run.call(state,{list},1/60);assert.equal(trace.length,Math.min(n,48));trace.forEach(i=>covered.add(i));if(n<=48)assert.deepEqual(trace,Array.from({length:n},(_,i)=>i));}
 assert.equal(covered.size,n,'fair coverage '+n);
}
});
const dropRel='src/fx/fx.js',drops=adaptBuildSource(dropRel,fs.readFileSync(new URL('../../../inkwave-public/'+dropRel,import.meta.url),'utf8'));
const dropStart=drops.indexOf('  _updateDrops(dt) {'),dropEnd=drops.indexOf('    // --- write instance attributes ---',dropStart);
function vector(){return {set(x,y,z){this.x=x;this.y=y;this.z=z;return this;},copy(o){return this.set(o.x,o.y,o.z);}};}
const dropContext=vm.createContext({Math,Uint8Array,shouldDeferCosmeticDrop:()=>false,F_NOCOL:8,_from:vector(),_to:vector(),_hitP:vector(),_hitN:vector()});
const updateDrops=vm.runInContext('(function(dt){'+drops.slice(dropStart,dropEnd).split('{').slice(1).join('{')+'})',dropContext);
const killStart=drops.indexOf('  _killDrop(i) {'),killEnd=drops.indexOf('  // Ripple',killStart);
const killDrop=vm.runInContext('(function(i){'+drops.slice(killStart,killEnd).split('{').slice(1).join('{').replace(/}\s*$/,'')+'})',dropContext);
function dropFixture(n,budget){
 const trace=[],o={dN:n,dCap:n,dP:new Float32Array(n*3),dV:new Float32Array(n*3),dC:new Float32Array(n*3),dK:new Float32Array(n*3),dA:new Float32Array(n*8),gravity:0,waterY:-100,maxChecks:budget,_checks:0,dGeo:{},_killDrop:killDrop,_landDrop(){}};
 for(let i=0;i<n;i++){o.dP[i*3]=o.dK[i*3]=i;o.dA[i*8+2]=100;}
 o.collider=(from,to)=>{trace.push(to.x);return null;};return {o,trace};
}
test('droplet collision budget rotates stable overloaded pools and keeps swept origins until checked',()=>{
 for(const n of [1,10,49,100]){
  const {o,trace}=dropFixture(n,10),seen=new Set();o.dV.fill(0);for(let i=0;i<n;i++)o.dV[i*3+1]=1;
  for(let frame=0;frame<Math.ceil(n/10);frame++){trace.length=0;o._checks=0;updateDrops.call(o,1/60);assert.equal(trace.length,Math.min(n,10));trace.forEach(i=>seen.add(i));}
  assert.equal(seen.size,n);assert(o.dK[1]>0);
 }
});
test('droplet selection follows swap compaction without double processing or exceeding cap',()=>{
 const {o,trace}=dropFixture(12,5);o._dropCheckCursor=8;o.dA[8*8+2]=0;
 o.collider=(from,to)=>{trace.push(to.x);return {point:to,normal:{x:0,y:1,z:0}};};
 updateDrops.call(o,1/60);assert(trace.length<=5);assert.equal(new Set(trace).size,trace.length);assert.equal(o.dN,12-1-trace.length);
});
test('hidden intro skips only stateless HP/marker DOM work and resumes on first visible frame',()=>{
 const rel='src/ui/hud.js',source=adaptBuildSource(rel,fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8'));
 const begin=source.indexOf('  update(dt, f) {'),end=source.indexOf('  /** Issue #580',begin);
 const G={match:{state:'intro'}};
 const fn=vm.runInNewContext('(function(dt,f){'+source.slice(begin,end).split('{').slice(1).join('{').replace(/}\s*$/,'')+'})',{G,flushTeamWipeHud(){},tr:x=>x,toHex:()=>'',colorVars(){}});
 const calls=[],o={_t:0,_visible:false,_L:{ca:'',cb:'',spect:false},_local:()=>null,el:{classList:{toggle(){}}},boss:{on:false,update(){calls.push('boss');}}};
 for(const name of ['Timer','Squads','Crosshair','Tank','Special','Turf','Hp','Map','Markers','DamageDirs','Downs','Prompt','Fps'])o['_upd'+name]=()=>calls.push(name);
 fn.call(o,.1,{});assert.equal(o._t,.1);assert(!calls.includes('Hp'));assert(!calls.includes('Markers'));for(const name of ['Map','Tank','Special','DamageDirs','Downs','Prompt','boss'])assert(calls.includes(name));
 calls.length=0;o._visible=true;fn.call(o,.1,{});assert(calls.includes('Hp'));assert(calls.includes('Markers'));
});
test('toast eviction cancels both delay and exit timers without detached mutations',()=>{
 const rel='src/ui/menus.js',source=adaptBuildSource(rel,fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8'));
 const begin=source.indexOf('    const timers = this._toastTimers'),end=source.indexOf('    return t;',begin);
 const pending=new Map();let id=0;
 const fn=vm.runInNewContext('(function(t,max,ms){'+source.slice(begin,end)+'})',{Map,setTimeout:f=>{pending.set(++id,f);return id;},clearTimeout:id=>pending.delete(id)});
 const children=[],o={_toasts:{get childElementCount(){return children.length;},get firstElementChild(){return children[0];}}};
 function add(){const t={isConnected:true,exits:0,classList:{add(){t.exits++;}},remove(){t.isConnected=false;const i=children.indexOf(t);if(i>=0)children.splice(i,1);}};children.push(t);fn.call(o,t,2,3400);return t;}
 function fire(timer){const fn=pending.get(timer);pending.delete(timer);fn();}
 const a=add(),b=add();assert.equal(pending.size,2);const timerA=o._toastTimers.get(a);const c=add();assert(!a.isConnected);assert(!pending.has(timerA));assert.equal(pending.size,2);
 fire(o._toastTimers.get(b));assert.equal(b.exits,1);const exit=o._toastTimers.get(b);add();assert(!b.isConnected);assert(!pending.has(exit));assert.equal(pending.size,2);assert.equal(a.exits,0);assert(c.isConnected);
});
