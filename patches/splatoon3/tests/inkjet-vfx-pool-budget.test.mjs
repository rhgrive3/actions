import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inkjetVfxAdmission, inkjetVfxRoom } from '../runtime/inkjet-vfx-budget.mjs';
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
 const recipes=sections.map(code=>new Function('inkjetVfxTicks','vfxRandom','rnd','groundBelow','clamp','SPARK','PUFF','DISC','TAU','inkjetVfxAdmission','inkjetVfxRoom','return ({'+code+'}).frame;')(inkjetVfxTicks,random,rnd,()=>0,(x,a,b)=>Math.max(a,Math.min(b,x)),{GLOW:0},{CHUNK:0,MIST:1},{SPLAT:0},Math.PI*2,inkjetVfxAdmission,inkjetVfxRoom));
 const actors=Array.from({length:actorCount},()=>({a:{pos:new V().set(0,2,0),form:'kid',intent:{}},t:{d:{jets:[{},{}],cones:[{},{}]},color:[1,0,0]},r:{d:{ink:{}},color:[1,0,0]},p:{pos:new V().set(0,2,4)}}));
 for(const x of actors){x.a.alive=true;x.a.specialActive={id:'inkjet'};x.p.owner=x.a;}
 d.G={actors:actors.map(x=>x.a)};d.rounds=new Map(actors.map(x=>[x.p,{wid:'inkjet',p:x.p}]));
 let peakPuffs=0,peakSparks=0;
 const frame=(dt)=>{d.time+=dt;for(current=0;current<actors.length;current++){const {a,t}=actors[current];recipes[1].call(d,a,t,dt);}for(current=0;current<actors.length;current++){const {r,p}=actors[current];recipes[0].call(d,r,p,dt);}};
 for(let k=0;k<hz*seconds;k++){frame(1/hz);d.kit.sparks.update(1/hz);d.kit.puffs.update(1/hz);peakPuffs=Math.max(peakPuffs,d.kit.puffs.n);peakSparks=Math.max(peakSparks,d.kit.sparks.n);}
 const existing=d.kit.puffs.n, existingSparks=d.kit.sparks.n;d.kit.puffs.cap=0;d.kit.sparks.cap=0;const before=admissions.reduce((a,b)=>a+b,0);frame(1/60);
 if(d.kit.puffs.n!==existing||d.kit.sparks.n!==existingSparks||admissions.reduce((a,b)=>a+b,0)!==before)throw Error('quality reduction changed live particles or admitted new ones');
 return {hz,actorCount,cap,peakPuffs,peakSparks,evictions,admissions,qualityDropPreserved:existing};
}

for(const cap of [182,520])for(const hz of [30,60,120])for(const n of [1,2,4])test('Inkjet fair actual pool bounds '+hz+'Hz actors='+n+' cap='+cap,()=>{
 const r=runLoad(hz,n,cap);
 assert.equal(r.evictions,0);assert.ok(r.peakPuffs<=cap);assert.ok(r.qualityDropPreserved>0);
 assert.ok(Math.max(...r.admissions)/Math.min(...r.admissions)<1.05,'uniform demand stays within5% across actor order');
});
test('Inkjet admission reuses records, shares only free capacity, and excludes ineligible actors',()=>{
 const actors=Array.from({length:4},()=>({alive:true,specialActive:{id:'inkjet'},form:'kid',intent:{}}));
 const d={time:1,G:{actors},rounds:new Map(),kit:{puffs:{cap:182,n:177},sparks:{cap:900,n:895}}};
 const records=actors.map(a=>inkjetVfxAdmission(d,a));
 assert.equal(records.reduce((n,r)=>n+r.puffs,0),5);
 assert.ok(Math.max(...records.map(r=>r.puffs))-Math.min(...records.map(r=>r.puffs))<=1);
 assert.deepEqual(d.G.actors,actors);
 d.kit.puffs.cap=100;assert.equal(inkjetVfxRoom(records[0],d.kit.puffs,'puffs'),false);
 assert.equal(d.kit.puffs.n,177,'quality reduction retains every live particle');
 actors[0].form='squid';actors[1].superJumpState={};actors[2].alive=false;
 d.time+=1/60;assert.equal(inkjetVfxAdmission(d,actors[0]),null);assert.equal(inkjetVfxAdmission(d,actors[1]),null);
 assert.equal(inkjetVfxAdmission(d,actors[3]),records[3],'record allocated only once');
 d.rounds.set({}, {wid:'inkjet',p:{owner:actors[2]}});d.time+=1/60;
 assert.equal(inkjetVfxAdmission(d,actors[2]),records[2],'existing flight remains eligible after owner death');
});
