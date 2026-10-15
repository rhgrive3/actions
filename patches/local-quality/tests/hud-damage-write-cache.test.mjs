import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
const root=process.env.HUD_REPOSITORY_ROOT?pathToFileURL(process.env.HUD_REPOSITORY_ROOT+'/'):new URL('../../../',import.meta.url);
const {adaptBuildSource}=await import(new URL('scripts/inkwave-source-composition.mjs',root));
const raw=fs.readFileSync(new URL('inkwave-public/src/ui/hud.js',root),'utf8');
const composed=adaptBuildSource('src/ui/hud.js',raw);
const before='      d.el.style.transform = `rotate(${ang.toFixed(3)}rad)`;\n      d.el.style.opacity = o.toFixed(2);';
const after='      const transform = `rotate(${ang.toFixed(3)}rad)`, opacity = o.toFixed(2);\n      if (d._transform !== transform) { d._transform = transform; d.el.style.transform = transform; }\n      if (d._opacity !== opacity) { d._opacity = opacity; d.el.style.opacity = opacity; }';
// Baseline differs only by restoring the exact pre-cache assignments.
const source=composed.includes(after)?composed.replace(after,before):composed;
const patched=composed;
test('production composition wires the HUD cache exactly once',()=>{assert.equal(composed.split(after).length,2);assert.equal(composed.includes(before),false);});
function fixture(candidate,count=1){const code=candidate?patched:source,start=code.indexOf('  _addDamageDir('),end=code.indexOf('  _allyDown(',start);assert(start>=0&&end>start);const G={camera:null};const C=vm.runInNewContext('(class {'+code.slice(start,end)+'})',{G});const h=new C(),writes=[],events=[];h._dd=[];h._restart=(el,cls)=>events.push(cls);for(let i=0;i<count;i++){const values={},style={};for(const key of ['transform','opacity'])Object.defineProperty(style,key,{get:()=>values[key],set:v=>{writes.push([i,key,v]);values[key]=v;}});const a={pos:{x:i+1,z:8},alive:true};h._dd.push({a,el:{style,remove(){events.push('remove'+i);}},t:0,px:a.pos.x,pz:a.pos.z});}return {G,h,writes,events,snapshot:()=>h._dd.map(d=>({t:d.t,px:d.px,pz:d.pz,transform:d.el.style.transform,opacity:d.el.style.opacity}))};}
function pair(count=1){return [fixture(false,count),fixture(true,count)];}
function step(pair,dt){for(const f of pair)f.h._updDamageDirs(dt);assert.deepEqual(pair[1].snapshot(),pair[0].snapshot());assert.deepEqual(pair[1].events,pair[0].events);}
test('stationary six-arc second keeps identical output, avoids708of720 style writes',()=>{const p=pair(6);for(let i=0;i<60;i++)step(p,1/60);assert.equal(p[0].writes.length,720);assert.equal(p[1].writes.length,12);});
test('fade and expiry preserve every rendered string and removal event',()=>{const p=pair();for(let i=0;i<110;i++)step(p,1/60);assert.equal(p[1].h._dd.length,0);assert.equal(p[1].events.length,1);assert(p[1].writes.length<p[0].writes.length);});
test('attacker motion, death and camera turns retain identical per-tick output',()=>{const p=pair();for(let i=0;i<90;i++){for(const f of p){const d=f.h._dd[0];d.a.pos.x=Math.sin(i/9)*8;d.a.alive=i<40;const t=i/40;f.G.camera={position:{x:i/100,z:1},matrixWorld:{elements:[Math.cos(t),0,-Math.sin(t),0,0,1,0,0,Math.sin(t),0,Math.cos(t),0,0,0,0,1]}};}step(p,1/60);}});
test('real repeated-hit update resets age and restarts animation; clear removes every arc',()=>{const p=pair();for(let i=0;i<80;i++)step(p,1/60);for(const f of p)f.h._addDamageDir(f.h._dd[0].a);step(p,1/60);assert.equal(p[1].h._dd[0].el.style.opacity,'1.00');assert.deepEqual(p[1].events,['is-hit']);for(const f of p)f.h._clearDamageDirs();assert.deepEqual(p[1].events,p[0].events);assert.equal(p[1].h._dd.length,0);});
