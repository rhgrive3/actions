import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';

const beforeBytes=gunzipSync(fs.readFileSync(new URL('./fixtures/fx-clock-before-20261029.mjs.gz',import.meta.url)));
const provenance=JSON.parse(fs.readFileSync(new URL('./fixtures/fx-clock-before-20261029.mjs.json',import.meta.url)));
assert.equal(crypto.createHash('sha256').update(beforeBytes).digest('hex'),provenance.source_sha256);
const before=beforeBytes.toString();
function random(){let state=1,calls=0;const next=()=>{calls++;state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};next.reset=s=>{state=s;calls=0;};next.calls=()=>calls;return next;}
const exports=`export {FX} from './src/fx/fx.js';
export {touchSwimSurface} from './patches/local-quality/swim-surface.mjs';
export {specialVfxDirector} from './patches/splatoon3/runtime/special-vfx.mjs';`;
async function realm(old){const rng=random();const f=await fixture({fullRuntime:true,productionComposition:!old,
  ...(old?{adaptNative:(rel,source)=>rel==='src/fx/fx.js'?before:adaptBuildSource(rel,source)}:{}),
  vmMathRandom:rng,extraExports:exports});return{...f,rng};}
let pairPromise;
const realms=()=>pairPromise||=(async()=>[await realm(true),await realm(false)])();
const xyz=v=>[v.x,v.y,v.z];
function make(f){const fx=new f.FX(new f.THREE.Scene(),{quality:.25,waterY:-.3});fx.s3SpecialVfxEnabled=false;
  f.G.fx=fx;const camera=new f.THREE.PerspectiveCamera();camera.position.set(1,3,7);camera.updateMatrixWorld();
  return{f,fx,camera,events:[]};}
function fill(s,{count=110,immediate=false,collisions=true}={}){
  const{fx,f,events}=s,{THREE}=f,p=new THREE.Vector3(.2,1,-2),n=new THREE.Vector3(0,1,0),c=new THREE.Color(.8,.2,.1);
  f.rng.reset(0x82919);fx.maxChecks=7;
  fx.onDropletLand=(p,n,c,r)=>events.push(['paint',fx._time,...xyz(p),...xyz(n),c.r,c.g,c.b,r]);
  fx.onSpeck=(p,n,c,r)=>events.push(['speck',fx._time,...xyz(p),...xyz(n),c.r,c.g,c.b,r]);
  fx.onRipple=(p,...rest)=>events.push(['ripple',fx._time,...xyz(p),...rest]);
  if(collisions)fx.setCollider((a,b)=>{
    events.push(['sweep',fx._time,...xyz(a),...xyz(b)]);
    const floor=b.x<0?.4:-.1;
    if(a.y>=floor&&b.y<floor){const k=(a.y-floor)/(a.y-b.y);return{point:new THREE.Vector3(a.x+(b.x-a.x)*k,floor,a.z+(b.z-a.z)*k),normal:n};}
    return null;
  });
  for(let i=0;i<count;i++){
    fx._spawnDrop((i%11-5)*.1,.2+i%6*.2,-2,i%3-1,-.3-i%7*.3,.1,c,.03+i%5*.01,.13+i%17*.07,.2+i%3*.4,1,[1,2,4,8,16][i%5]);
    fx._sprite(i%2?fx.puffs:fx.glows,p.x,p.y,p.z,.3,.5,-.1,c,.1,.5,.1+i%17*.08,.7,1.2,.1,i%3,.03,2,.4,.1);
    fx._ringRaw(p,n,c,.3+i%4*.1,.12+i%11*.05,i%6,.8,1,.2,.1,-.1);
    fx._shell(p,c,.1,.5,.1,.15+i%8*.1,.7,i%2,.1,.08,n);
    fx._beam(p,c,.1,2,.13+i%7*.1);
  }
  for(let i=0;i<96;i++)fx._after(.02+i%7*.04,i%3,p,n,c,.3,.4,1);
  if(immediate){fx.mark(p,n,c,1);fx.pillar(p,c,.3,5,.9);}
}
function state({fx,events,f},{fullGpu=false}={}){
  const result={events,rng:f.rng.calls(),time:fx._time,dt:fx._dt,checks:fx._checks,schedule:fx._sqN,sq:Array.from(fx._sq),
    drops:fx.dN,recycle:fx._recycle,phase:fx._iwCosmeticPhase,checkCursor:fx._dropCheckCursor,
    dropCPU:['dP','dV','dC','dK','dA'].map(k=>Array.from(fx[k])),pools:[]};
  for(const pool of [{geo:fx.dGeo,n:fx.dN},fx.puffs,fx.glows,fx.rings,fx.shells,fx.beams]){
    result.pools.push({n:pool.n,count:pool.geo.instanceCount,cpu:Object.fromEntries(['P','V','C','N','X','A'].filter(k=>pool[k]).map(k=>[k,Array.from(pool[k])])),
      gpu:Object.fromEntries(Object.entries(pool.geo.attributes).filter(([k])=>k.startsWith('a')).map(([k,a])=>[k,Array.from(fullGpu?a.array:a.array.subarray(0,pool.geo.instanceCount*a.itemSize))]))});
  }
  return result;
}
function retire(...scenarios){for(const s of scenarios)s.fx.dispose();}

test('30/60/120 Hz actual composed FX preserves CPU, all GPU arrays, RNG, paints, scheduler and empty/full pools',async()=>{
  const[old,next]=await realms();
  for(const dt of [0,1/120,1/60,1/30,.05])for(const count of [0,110,680]){
    const a=make(old),b=make(next);fill(a,{count,immediate:true});fill(b,{count,immediate:true});
    for(let frame=0;frame<12;frame++){
      a.fx.update(dt,a.camera);b.fx.update(dt,b.camera);
      assert.deepEqual(state(b,{fullGpu:true}),state(a,{fullGpu:true}),`${dt}/${count}/${frame}`);
    }
    retire(a,b);
  }
});

test('5–19 Hz actual FX matches bounded before-physics oracle with one final staging pass',async()=>{
  const[old,next]=await realms();
  for(const dt of [1/5,1/8,1/10,1/15,1/19,.25])for(const count of [0,110,680]){
    const a=make(old),b=make(next);fill(a,{count});fill(b,{count});
    for(let frame=0;frame<10;frame++){
      const steps=Math.ceil(dt/.05);
      for(let i=0;i<steps;i++)a.fx.update(i+1<steps?.05:dt-.05*(steps-1),a.camera);
      a.fx._dt=.05; // Preserve the original public emission-helper cadence.
      const attrs=[b.fx.dGeo,b.fx.puffs.geo,b.fx.glows.geo,b.fx.rings.geo,b.fx.shells.geo,b.fx.beams.geo].flatMap(g=>Object.entries(g.attributes).filter(([k])=>k.startsWith('a')).map(([k,a])=>({k,a,version:a.version})));
      b.fx.update(dt,b.camera);
      assert.deepEqual(state(b),state(a),`${dt}/${count}/${frame}`);
      for(const{k,a,version}of attrs)assert.ok(a.version-version<= (k==='aColA'||k==='aAxis'?2:1),`${k}: one final staging (static range update may also mark dirty)`);
    }
    retire(a,b);
  }
});

test('actual lifetime and schedule follow elapsed foreground time at 5/8/10/15/19 Hz; before reproduces delay',async()=>{
  const[old,next]=await realms();
  for(const fps of [5,8,10,15,19,20,30,60,120]){
    const pair=[make(old),make(next)],finished=[];
    for(const s of pair){const{fx,f}=s,c=new f.THREE.Color(1,0,0),p=new f.THREE.Vector3(),n=new f.THREE.Vector3(0,1,0);
      fx._sprite(fx.puffs,0,0,0,0,0,0,c,.1,.2,.9,1,0,0,0);fx._after(.18,0,p,n,c,1,.5,0);
      let expired=0,scheduled=0;
      for(let frame=1;frame<=Math.ceil(5*fps);frame++){fx.update(1/fps,s.camera);if(!scheduled&&fx._sqN===0)scheduled=frame/fps;if(!fx.puffs.n){expired=frame/fps;break;}}
      finished.push({expired,scheduled,clock:fx._time});
    }
    assert.ok(finished[1].expired>=.9-1e-6&&finished[1].expired<=.9+1/fps+1e-6,`${fps} lifetime`);
    assert.ok(finished[1].scheduled>=.18-1e-6&&finished[1].scheduled<=.18+1/fps+1e-6,`${fps} schedule`);
    if(fps<19)assert.ok(finished[0].expired>finished[1].expired,`${fps} before negative control`);
    else if(fps===19){assert.ok(finished[0].expired>=finished[1].expired);assert.ok(finished[0].clock<finished[1].clock,'19 Hz frame quantization can hide one deadline, but the original clock still loses time');}
    else assert.deepEqual(finished[1],finished[0]);
    retire(...pair);
  }
});

test('immediate marks and pillars survive internal steps for exactly one outer render; step error restores state',async()=>{
  const[,f]=await realms(),s=make(f),{fx}=s;fill(s,{count:0,immediate:true,collisions:false});fx._sqN=0;
  const p=new f.THREE.Vector3(),n=new f.THREE.Vector3(0,1,0),c=new f.THREE.Color(1,0,0);
  fx.update(.2,s.camera);assert.equal(fx.rings.geo.instanceCount,1);assert.equal(fx.beams.geo.instanceCount,1);
  assert.equal(fx.marks.n,0);assert.equal(fx.pillars.n,0);
  fx.update(.2,s.camera);assert.equal(fx.rings.geo.instanceCount,0);assert.equal(fx.beams.geo.instanceCount,0);
  const step=fx._updateFrameStep;let calls=0;fx._updateFrameStep=function(dt,...args){calls++;assert.ok(dt<=.05+Number.EPSILON);return step.call(this,dt,...args);};
  fx.update(100,s.camera);assert.equal(calls,5,'direct long recovery remains bounded');
  fx._spawnDrop(0,1,0,0,-1,0,c,.1,1,1,1,1);const error=new Error('contact callback');fx.collider=()=>{throw error;};
  assert.throws(()=>fx.update(.2,s.camera),e=>e===error);assert.equal(fx._fxDeferUpload,undefined);assert.equal(fx._fxFrameStart,undefined);
  fx.collider=null;fx.mark(p,n,c,1);fx.update(1/60,s.camera);assert.ok(fx.rings.geo.instanceCount>0);
  retire(s);
});

test('installed special director runs once and current-frame swim contact survives a slow outer frame',async()=>{
  const[,f]=await realms(),s=make(f),{fx}=s;
  fx.setCollider(null);const director=f.specialVfxDirector(fx);assert.ok(director);
  const original=director.update,calls=[];director.update=(dt)=>calls.push(dt);fx.s3SpecialVfxEnabled=true;
  fx.update(.2,s.camera);assert.deepEqual(calls,[.05]);director.update=original;fx.s3SpecialVfxEnabled=false;
  const actor={alive:true,form:'squid',grounded:true,submerged:true,pos:new f.THREE.Vector3(),vel:new f.THREE.Vector3(0,0,5),color:new f.THREE.Color(1,0,0),groundN:new f.THREE.Vector3(0,1,0)};
  f.G.actors=[actor];f.G.camera=null;
  f.touchSwimSurface(fx,actor);const slot=fx.swimSurface.slots[0];const version=slot.mesh.geometry.attributes.position.version;
  fx.update(.2);assert.equal(slot.mesh.visible,true);assert.equal(slot.mesh.geometry.attributes.position.version-version,1,'surface geometry stages once');
  fx.update(.2);assert.equal(slot.mesh.visible,false,'no fresh contact expires on the next outer frame');
  f.G.actors=[];retire(s);
});
