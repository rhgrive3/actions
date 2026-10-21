import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inkjetVfxTicks } from '../runtime/inkjet-vfx-clock.mjs';
// Source recipe + actual Float32 SpritePool simulation. No WebGL timing claim.
const source=fs.readFileSync(new URL('../runtime/special-vfx.mjs',import.meta.url),'utf8');
const kit=fs.readFileSync(new URL('../runtime/special-vfx-kit.mjs',import.meta.url),'utf8');
const sections=[...source.matchAll(/  inkjet: \{\n([\s\S]*?)\n  \},/g)].map(m=>m[1]);
assert.equal(sections.length,2);
const spriteClass=kit.slice(kit.indexOf('class SpritePool {'),kit.indexOf('// ---------------------------------------------------------------------------------------------------------------\n// Ribbon trails'));

class V { set(x,y,z){Object.assign(this,{x,y,z});return this;} copy(p){return this.set(p.x,p.y,p.z);}setY(y){this.y=y;return this;}lerp(p,k){this.x+=(p.x-this.x)*k;this.y+=(p.y-this.y)*k;this.z+=(p.z-this.z)*k;return this;} }
function runLoad(hz, actorCount, cap, seconds=2) {
 const random=()=>.2,rnd=(a=1,b=0)=>b+random()*(a-b);
 const Pool=new Function('vfxRandom','TAU',spriteClass+';return SpritePool;')(random,Math.PI*2);
 let evictions=0;
 const pool=(capacity)=>{const p=Object.create(Pool.prototype);Object.assign(p,{cap:capacity,n:0,S:23,p:new Float32Array(capacity*23),mesh:{geometry:{}},additive:false});
  for(const key of ['aPos','aDir','aCol','aPar'])p[key]={array:new Float32Array((capacity+1)*4),clearUpdateRanges(){},addUpdateRange(){}};
  p._evict=()=>{evictions++;throw Error('Inkjet caused eviction');};return p;};
 const d={kit:{sparks:pool(900),puffs:pool(cap)},v:Array.from({length:8},()=>new V().set(0,0,0)),time:0,up:new V().set(0,1,0),forward:(a,v)=>v.set(0,0,1),setBeam(){},pushRibbon(){},hdr:c=>c,disc(){}};
 let current=0;const admissions=Array(actorCount).fill(0);
 d.spark=(kind,p,vx,vy,vz,life,s0,s1,col,a,o)=>d.kit.sparks.spawn(p.x,p.y,p.z,vx,vy,vz,life,s0,s1,...col,a,kind,o);
 d.puff=(kind,p,vx,vy,vz,life,s0,s1,col,a,o)=>{admissions[current]++;return d.kit.puffs.spawn(p.x,p.y,p.z,vx,vy,vz,life,s0,s1,...col,a,kind,o);};
 d.drop=(p,vx,vy,vz,life,size,col,o={})=>d.puff(0,p,vx,vy,vz,life,size,size*.45,col,1,o);
 const recipes=sections.map(code=>new Function('inkjetVfxTicks','vfxRandom','rnd','groundBelow','clamp','SPARK','PUFF','DISC','TAU','return ({'+code+'}).frame;')(inkjetVfxTicks,random,rnd,()=>0,(x,a,b)=>Math.max(a,Math.min(b,x)),{GLOW:0},{CHUNK:0,MIST:1},{SPLAT:0},Math.PI*2));
 const actors=Array.from({length:actorCount},()=>({a:{pos:new V().set(0,2,0),form:'kid',intent:{}},t:{d:{jets:[{},{}],cones:[{},{}]},color:[1,0,0]},r:{d:{ink:{}},color:[1,0,0]},p:{pos:new V().set(0,2,4)}}));
 let peakPuffs=0,peakSparks=0;
 const frame=(dt)=>{d.time+=dt;for(current=0;current<actors.length;current++){const {a,t,r,p}=actors[current];recipes[0].call(d,r,p,dt);recipes[1].call(d,a,t,dt);}};
 for(let k=0;k<hz*seconds;k++){frame(1/hz);d.kit.sparks.update(1/hz);d.kit.puffs.update(1/hz);peakPuffs=Math.max(peakPuffs,d.kit.puffs.n);peakSparks=Math.max(peakSparks,d.kit.sparks.n);}
 const existing=d.kit.puffs.n, existingSparks=d.kit.sparks.n;d.kit.puffs.cap=0;d.kit.sparks.cap=0;const before=admissions.reduce((a,b)=>a+b,0);frame(1/60);
 if(d.kit.puffs.n!==existing||d.kit.sparks.n!==existingSparks||admissions.reduce((a,b)=>a+b,0)!==before)throw Error('quality reduction changed live particles or admitted new ones');
 return {hz,actorCount,cap,peakPuffs,peakSparks,evictions,admissions,qualityDropPreserved:existing};
}

for(const cap of [182,520])for(const hz of [30,60,120])for(const n of [1,2,4])test('Inkjet actual pool bounds '+hz+'Hz actors='+n+' cap='+cap,()=>{
 const r=runLoad(hz,n,cap);assert.equal(r.evictions,0);assert.ok(r.peakPuffs<=cap);assert.ok(r.qualityDropPreserved>0);
});
test('saturated shared pool order bias remains explicit rather than being called fair',()=>{
 const r=runLoad(30,4,182);assert.ok(r.admissions[0]>r.admissions[3]*2,'documents unresolved first-actor bias');
});
