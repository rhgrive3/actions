import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {adaptPaintHotpath} from '../paint-hotpath-adapter.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
const raw=fs.readFileSync(new URL('../../../inkwave-public/src/world/paint.js',import.meta.url),'utf8');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2);return s.replace(a,b);};
const body=raw.match(/export function blobWobble\(ang, seed\) \{([\s\S]*?)\n\}/)[1];
const original=new Function('ang','seed',body);
function generated(capped=false,cutoff=1){
 let code=raw.replace('> 0.97) continue;',`> ${cutoff}) continue;`);
 if(capped)code=code.replace('r * blobWobble(Math.atan2(py, px), seed)','r * Math.min(1, blobWobble(Math.atan2(py, px), seed))');
 code=adaptPaintHotpath('src/world/paint.js',code,once);
 const helper=code.match(/function paintBodyContains\(d, r, ang, seed, cutoff\) \{[\s\S]*?\n\}/)[0];
 return {code,helper,fn:new Function(`${helper};return paintBodyContains;`)()};
}
const buf=new ArrayBuffer(8),dv=new DataView(buf);
function adjacent(x,up){if(!Number.isFinite(x))return x;if(x===0)return up?Number.MIN_VALUE:-Number.MIN_VALUE;dv.setFloat64(0,x);let b=dv.getBigUint64(0);b+=(x>0)===up?1n:-1n;dv.setBigUint64(0,b);return dv.getFloat64(0);}
let seedState=0x17ac;const random=()=>((seedState=(Math.imul(seedState,1664525)+1013904223)>>>0)/4294967296);
for(const capped of [false,true])for(const cutoff of [.97,1])test(`bounded predicate exactly retains ${capped?'future-capped':'main-native'} cutoff ${cutoff}`,()=>{
 const {fn}=generated(capped,cutoff),bound=x=>capped?Math.min(1,x):x;
 const check=(d,r,a,s)=>assert.equal(fn(d,r,a,s,cutoff),!(d/(r*bound(original(a,s)))>cutoff),JSON.stringify({d,r,a,s}));
 for(let i=0;i<35000;i++){
  const s=i%11===0?(random()-.5)*1e100:random()*5-2,a=(random()-.5)*Math.PI*2,r=10**(random()*16-8),w=bound(original(a,s)),edge=r*w*cutoff;
  for(const d of [edge,adjacent(edge,false),adjacent(edge,true),edge*(1-2e-12),edge*(1+2e-12),random()*r*1.6])check(d,r,a,s);
 }
 // Scalar nonfinite/degenerate contract: NaN comparisons remain false just
 // like the old scorer; the enclosing _cpuSplat still owns radius rejection.
 for(const r of [0,-0,Number.MIN_VALUE,1e-300,.020000000000000004,1,1e300,Number.MAX_VALUE,Infinity,NaN])
 for(const d of [0,-0,Number.MIN_VALUE,1e-300,1,1e300,Infinity,NaN])
 for(const s of [0,-0,-1,1e300,Infinity,NaN])check(d,r,0,s);
});
test('uncertain boundary cells execute both original spikes; ordinary cells skip work',()=>{
 const {helper}=generated(),calls={cos:0,pow:0};const math=Object.create(Math);math.cos=x=>(calls.cos++,Math.cos(x));math.pow=(a,b)=>(calls.pow++,Math.pow(a,b));
 const fn=vm.runInNewContext(`${helper};paintBodyContains`,{Math:math});
 const a=.24,s=.125,r=1,d=r*original(a,s);fn(d,r,a,s,1);assert.equal(calls.cos,2);assert.equal(calls.pow,2);
 calls.cos=calls.pow=0;fn(.7,1,0,0,1);assert.equal(calls.pow,0);
 calls.cos=calls.pow=0;fn(1.6,1,0,0,1);assert.equal(calls.pow,0);
});
test('changed wobble formula or double adaptation fails closed; GPU text stays exact',()=>{
 assert.throws(()=>adaptPaintHotpath('src/world/paint.js',raw.replace('0.12 * Math.sin','0.13 * Math.sin'),once));
 const {code}=generated();assert.throws(()=>adaptPaintHotpath('src/world/paint.js',code,once));
 const shader=s=>s.match(/const PAINT_FS = \/\* glsl \*\/`([\s\S]*?)`;/)[1];assert.equal(shader(code),shader(raw));
});
function baseline(rel,source){
 const code=adaptBuildSource(rel,source);
 if(rel==='patches/splatoon3/runtime/paint-ownership.mjs')return code.replace('if (!nativeAncillaryCanClaim(g.R, dn, face.atlas.ppm))','if (nativeMasks && !nativeAncillaryCanClaim(g.R, dn, face.atlas.ppm))').replace('if (mask) {\n        mask.pieces','if (nativeMasks && mask) {\n        mask.pieces');
 return rel==='src/world/paint.js'?once(code,'!paintBodyContains(d, r, Math.atan2(py, px), seed, 1)','d / (r * blobWobble(Math.atan2(py, px), seed)) > 1'):code;
}
async function world(before,corner=false){
 let rng=0x2174;const f=await fixture({fullRuntime:true,realProjectiles:true,adaptNative:before?baseline:adaptBuildSource,adaptRuntime:before?baseline:adaptBuildSource,vmMathRandom:()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296)});
 const {G,THREE,PaintSystem}=f,V=(...a)=>new THREE.Vector3(...a);
 const face={origin:V(-4,0,-4),u:V(1,0,0),v:V(0,0,1),n:V(0,1,0),su:8,sv:8,wall:false,turf:true,paintable:true};
 const block={id:0,solid:true,grate:false,center:V(0,-1,0),half:V(4,1,4),axes:[V(1,0,0),V(0,1,0),V(0,0,1)],faces:[0,-1,-1,-1,-1,-1],aabbMin:V(-4,-2,-4),aabbMax:V(4,0,4)};
 const level=corner?new f.Level({bounds:{minX:-4,maxX:4,minZ:-4,maxZ:4},spawnPads:[[0,0,-3],[0,0,3]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-4,-2,-4],max:[4,0,4]},{kind:'box',min:[-4,0,1],max:[4,4,1.3]}]}):{faces:[face],blocks:[block],pointInside:()=>false,queryBlocks(_a,_b,_c,_d,out=[]){out.length=0;out.push(0);return out;}};
 G.level=level;G.physics=new f.Physics(level);G.camera={position:V(0,3,-4)};
 class CPU extends PaintSystem {_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};this.submitted=[];} _pushQuad(...args){this.submitted.push(args.slice(1));} _drawQuads(){this.quads=0;this.dryMesh.visible=false;}}
 const paint=G.paint=new CPU(null,level,{atlasSize:512,maxDensity:8,cell:.25});
 for(let i=0;i<paint.dead.length;i++)if(i%7===0)paint.dead[i]=1;
 const owner=f.make('shooter');return {f,paint,face,owner,V,rng:()=>rng};
}
for(const hz of [30,60,120])test(`full composed ownership, dead cells and ordered GPU commands stay exact at ${hz}Hz`,async()=>{
 const pair=await Promise.all([world(true),world(false)]),kinds=['shot','line','blast','bomb','trail','drop','roll','speck'];
 const snapshot=w=>({grid:Array.from(w.paint.grid),orders:Array.from(w.paint._paintOwnershipOrder||[]),counts:Array.from(w.paint.counts),version:w.paint.version,records:JSON.parse(JSON.stringify(w.paint._paintOrderRecords)),area:w.area,stats:JSON.parse(JSON.stringify(w.owner.stats)),special:w.owner.special,rng:w.rng(),submitted:w.paint.submitted});
 for(let i=0;i<32;i++){
  for(const w of pair){const {paint,owner,V,face}=w;owner.team=i%2;face.turf=i%9!==0;const opts={seed:(i*.371)%1,kind:kinds[i%8],claimOwner:owner,stretch:V(Math.sin(i),0,Math.cos(i)),stretchAmt:(i%4)*.7,instant:i%3===0};if(i%5===0)opts.__netOrder={clock:50-i,peer:'peer-a',seq:i+1,epoch:'match-a'};
   w.area=paint.splat(V(Math.sin(i)*2,.01,Math.cos(i)*2),.021+(i%5)*.41,owner.team,opts);
   paint.advanceSimulation(1/hz);
  }
  assert.deepEqual(snapshot(pair[1]),snapshot(pair[0]),`after stamp ${i}`);
 }
 for(let i=0;i<hz;i++)for(const w of pair)w.paint.advanceSimulation(1/hz);
 assert.deepEqual(snapshot(pair[1]),snapshot(pair[0]));
});

for(const hz of [30,60,120])test(`real Level floor/wall crossing preserves delayed claims and command arguments at ${hz}Hz`,async()=>{
 const pair=await Promise.all([world(true,true),world(false,true)]);
 const snap=w=>({grid:Array.from(w.paint.grid),orders:Array.from(w.paint._paintOwnershipOrder||[]),counts:Array.from(w.paint.counts),version:w.paint.version,records:JSON.parse(JSON.stringify(w.paint._paintOrderRecords)),area:w.area,stats:JSON.parse(JSON.stringify(w.owner.stats)),special:w.owner.special,rng:w.rng(),commands:w.paint.submitted});
 let crossed=false;
 for(let i=0;i<24;i++){
  for(const w of pair){const {paint,owner,V}=w;owner.team=i%2;
   w.area=paint.splat(V(Math.sin(i)*1.5,.08,.87),.41+(i%5)*.3,owner.team,{seed:(i*.371)%1,kind:['shot','bomb','line','drop'][i%4],claimOwner:owner,stretch:V(Math.sin(i),.3,Math.cos(i)),stretchAmt:(i%4)*.4});
   crossed ||= paint.growing.some(g=>g.entries.some((v,k)=>k%7===0&&v.wall)&&g.entries.some((v,k)=>k%7===0&&v.turf));
   paint.advanceSimulation(1/hz);
  }
  assert.deepEqual(snap(pair[1]),snap(pair[0]),`crossing stamp ${i}`);
 }
 assert.equal(crossed,true,'one real splat must address both floor and wall entries');
 for(let i=0;i<hz*2;i++)for(const w of pair)w.paint.advanceSimulation(1/hz);
 assert.deepEqual(snap(pair[1]),snap(pair[0]));
});
