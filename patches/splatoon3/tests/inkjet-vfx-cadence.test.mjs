import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inkjetVfxAdmission, inkjetVfxRoom } from '../runtime/inkjet-vfx-budget.mjs';
import { inkjetVfxTicks } from '../runtime/inkjet-vfx-clock.mjs';

// Executes the two actual source recipe methods with deterministic presentation
// randomness and counted emissions. This is not a renderer/GPU or retail test.
const source = fs.readFileSync(new URL('../runtime/special-vfx.mjs', import.meta.url), 'utf8');
const sections = [...source.matchAll(/  inkjet: \{\n([\s\S]*?)\n  \},/g)].map(m => m[1]);
assert.equal(sections.length, 2);
class V {
  set(x,y,z) { Object.assign(this,{x,y,z}); return this; }
  copy(p) { return this.set(p.x,p.y,p.z); }
  setY(y) { this.y=y; return this; }
  lerp(p,k) { this.x+=(p.x-this.x)*k; this.y+=(p.y-this.y)*k; this.z+=(p.z-this.z)*k; return this; }
}
function measure(hz, seconds=2, stall=false, cap=Infinity, initial=0) {
  let randomCalls=0;
  const random=()=>{randomCalls++;return .2;}, rnd=(a=1,b=0)=>b+random()*(a-b);
  const recipes=sections.map(code=>new Function('inkjetVfxTicks','vfxRandom','rnd','groundBelow','clamp','SPARK','PUFF','DISC','TAU','inkjetVfxAdmission','inkjetVfxRoom',
    'return ({'+code+'}).frame;')(inkjetVfxTicks,random,rnd,()=>0,(x,a,b)=>Math.max(a,Math.min(b,x)),{GLOW:0},{CHUNK:0,MIST:1},{SPLAT:0},Math.PI*2,inkjetVfxAdmission,inkjetVfxRoom));
  const counts={spark:0,puff:0,drop:0,disc:0}, lives={spark:[],puff:[],drop:[],disc:[]};
  const d={kit:{sparks:{n:initial,cap},puffs:{n:initial,cap}},v:Array.from({length:8},()=>new V().set(0,0,0)),time:0,up:new V().set(0,1,0),forward:(a,v)=>v.set(0,0,1),
    setBeam(){},pushRibbon(){},hdr:c=>c};
  for(const name of Object.keys(counts))d[name]=(...args)=>{counts[name]++;if(name!=='disc')d.kit[name==='spark'?'sparks':'puffs'].n++;lives[name].push(args[name==='spark'||name==='puff'?5:name==='drop'?4:1]);};
  const a={pos:new V().set(0,2,0),form:'kid',intent:{}}, t={d:{jets:[{},{}],cones:[{},{}]},color:[1,0,0]};
  const r={d:{ink:{}},color:[1,0,0]},p={pos:new V().set(0,2,4)};
  a.alive=true;a.specialActive={id:'inkjet'};p.owner=a;d.G={actors:[a]};d.rounds=new Map();
  const steps=stall?1:Math.round(hz*seconds),dt=stall?seconds:1/hz;
  for(let i=0;i<steps;i++){d.time+=dt;recipes[0].call(d,r,p,dt);recipes[1].call(d,a,t,dt);}
  for (const values of Object.values(lives)) values.sort((a,b)=>a-b);
  return {counts,lives,randomCalls};
}
test('Inkjet source recipes retain 60/120 Hz density while capping 30 Hz to its previous particle budget',()=>{
  const baseline=measure(60);
  assert.deepEqual(baseline.counts,{spark:240,puff:720,drop:600,disc:15});
  assert.deepEqual(measure(120),baseline);
  assert.deepEqual(measure(30).counts,{spark:120,puff:360,drop:300,disc:15});
  assert.deepEqual([...new Set(baseline.lives.spark)],[.05]);
  assert.deepEqual([...new Set(baseline.lives.drop)].sort(),[.25,.45,.6]);
});
test('Inkjet stall catch-up advances at most two time ticks but emits at most one density tick with no backlog',()=>{
  const r={};assert.equal(inkjetVfxTicks(r,5),2);assert.equal(inkjetVfxTicks(r,1/60),1);
  const burst=measure(60,5,true);
  assert.deepEqual(burst.counts,{spark:2,puff:6,drop:5,disc:0});
});
test('Inkjet clock preserves 60 Hz, handles jitter and resets submerged carry without RNG',()=>{
  for(const hz of [30,60,120]){const r={};let n=0;for(let i=0;i<hz*10;i++)n+=inkjetVfxTicks(r,1/hz);assert.equal(n,600);}
  const r={};assert.equal(inkjetVfxTicks(r,1/120),0);
  assert.equal(inkjetVfxTicks(r,2,false),0);assert.equal(r.inkjetVfxCarry,0);
  assert.equal(inkjetVfxTicks(r,1/120),0);assert.equal(inkjetVfxTicks(r,1/120),1);
  for(const dt of [0,-1,NaN,Infinity])assert.equal(inkjetVfxTicks(r,dt),0);
  const jitter={};let n=0;for(let i=0;i<60;i++){n+=inkjetVfxTicks(jitter,1/240);n+=inkjetVfxTicks(jitter,1/80);}assert.equal(n,60);
});

test('Inkjet skips full pools and never exceeds a final free slot',()=>{
  for(const hz of [30,60,120]){
    const full=measure(hz,2,false,182,182);
    assert.deepEqual(full.counts,{spark:0,puff:0,drop:0,disc:15});
    const last=measure(hz,2,false,182,181);
    assert.equal(last.counts.spark,1);assert.equal(last.counts.puff+last.counts.drop,1);
  }
});
