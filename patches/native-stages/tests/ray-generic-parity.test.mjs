import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { buildSourceBVH } from '../runtime/source-convert.mjs';

const source=fs.readFileSync(new URL('../runtime/triangle-world.mjs',import.meta.url),'utf8');
const start=source.indexOf('   }else{\n   for(let k=0;k<3;k++){');
const end=source.indexOf('\n   }\n   if(miss)continue;',start);
assert.ok(start>=0&&end>start);
// Freeze only the reviewed pre-change generic slab arithmetic. The existing
// exact-down path, triangle intersection, filters, ties and traversal stay real.
const oldLoop=`   }else{
   for(let k=0;k<3;k++){
    const o=k===0?origin.x:k===1?origin.y:origin.z,d=k===0?dir.x:k===1?dir.y:dir.z;
    if(Math.abs(d)<1e-12){if(o<nodes[ni+k]||o>nodes[ni+3+k]){miss=true;break;}continue;}
    const a=(nodes[ni+k]-o)/d,b=(nodes[ni+3+k]-o)/d;low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));if(high<low){miss=true;break;}
   }`;
const baseline=source.slice(0,start)+oldLoop+source.slice(end);
const load=THREE=>new Function('THREE',baseline.replace(/^import .*;$/gm,'').replace('export class','class')+'\nreturn TriangleWorld;')(THREE);
const flat=h=>!h||h===true?h:{triangle:h.triangle,distance:h.distance,point:[h.point.x,h.point.y,h.point.z],normal:[h.normal.x,h.normal.y,h.normal.z],u:h.u,v:h.v,flags:h.flags,object:h.object};
async function setup(){
 // The production build bundles TriangleWorld inside engine.mjs. Obtain its
 // actual constructor through a real minimal NativeLevel in both lanes;
 // never load source text as the emitted candidate implementation.
 const f=await fixture({productionComposition:true,extraExports:"export {NativeLevel} from './patches/native-stages/runtime/engine.mjs';"});
 const specimen=new f.NativeLevel({...data(),mask:new Uint8Array(),manifest:{id:'ray-parity',bounds:{minX:-20,maxX:20,minZ:-20,maxZ:20},spawnPads:[[0,0,-10],[0,0,10]],spawnBarrier:1,objects:[],faces:[]}});
 f.TriangleWorld=specimen.triangleWorld.constructor;return f;
}
function data(){
 let state=0x937382;const rnd=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/2**32);
 const p=[];for(let i=0;i<80;i++){const x=(rnd()-.5)*24,y=(rnd()-.5)*14,z=(rnd()-.5)*24;p.push(x,y,z,x+rnd()*5,y+rnd()*2,z,x,y-rnd(),z+rnd()*5);}
 p.push(-4,0,-4,4,0,-4,4,0,4,-4,0,-4,4,0,-4,4,0,4,-4,2,-4,4,2,4,4,2,-4,0,0,0,0,0,0,0,0,0);
 const triangles=new Float32Array(p),n=p.length/9,normals=new Float32Array(n*3),flags=new Uint32Array(n),objectIds=new Uint32Array(n);
 for(let i=0;i<n;i++){normals[i*3+1]=i%3===0?-1:1;flags[i]=i%5===0?5:3;objectIds[i]=i%11;}
 return {triangles,normals,flags,objectIds,...buildSourceBVH(triangles)};
}
function compare(a,b,argsA,argsB=argsA){
 const run=(w,args)=>{try{return {value:flat(w.ray(...args)),q:w.queryCount,t:w.triangleTests};}catch(e){return {error:e.name,message:e.message,q:w.queryCount,t:w.triangleTests};}};
 assert.deepEqual(run(b,argsB),run(a,argsA));
}
test('actual generic ray preserves exact hits, filters, ties, any-hit and traversal counters',async()=>{
 const f=await setup(),A=load(f.THREE),a=new A(data()),b=new f.TriangleWorld(data()),V=(...x)=>new f.THREE.Vector3(...x);
 const dirs=[[0,1,0],[0,-1,0],[-0,-1,-0],[0,-.9999999999999999,0],[1e-13,-1,0],[1e-12,-1,0],[-1e-12,-1,0],[1e-12-2e-28,-1,0],[1e-12+2e-28,-1,0],[0,0,0],[.3,-.4,.5],[-.3,.4,-.5],[Number.MIN_VALUE,-1,0],[1,1,1],[-1,-1,-1]];
 const values=[-4-Number.EPSILON*4,-4,-4+Number.EPSILON*4,-0,0,4-Number.EPSILON*4,4,4+Number.EPSILON*4];
 let count=0;for(const d of dirs)for(const x of values)for(const y of [-4,0,2,4,20])for(const far of [-1,-0,0,.00001,2,20,Infinity,NaN])for(const anyHit of [false,true]){
  compare(a,b,[V(x,y,x),V(...d),far,{anyHit,minHitY:[-Infinity,0,3,NaN][count%4],ignoreGrates:count%2===0,minNormalY:[-2,.62,.68,1.1][count%4]}]);count++;
 }
 let s=0x5abcdef;const rand=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/2**32;};
 for(let i=0;i<12000;i++)compare(a,b,[V((rand()-.5)*40,(rand()-.5)*30,(rand()-.5)*40),V(rand()-.5,rand()-.5,rand()-.5),rand()*80,{anyHit:i%3===0,minHitY:(rand()-.5)*10}]);
 for(const x of [NaN,Infinity,-Infinity])compare(a,b,[V(x,3,0),V(.3,-1,.2),20,{}]);
 console.log(JSON.stringify({lane:process.env.INKWAVE_BUILT_SITE?'actual-emitted':'source',queries:count+12003,triangleTests:b.triangleTests}));
});

test('generic ray keeps malformed bounds, getter/coercion order and exception semantics',async()=>{
 const f=await setup(),A=load(f.THREE),V=(...x)=>new f.THREE.Vector3(...x);
 const runCase=(kind,value)=>{
  const make=C=>{const trace=[],input=data();
   // One leaf avoids invalid topology; values affect slab arithmetic alone.
   const raw=[-4,-4,-4,4,4,4,-1,1];if(kind==='bound')raw[0]=value;
   input.nodes=new Proxy(raw,{get(t,k){if(/^\d+$/.test(String(k)))trace.push('node:'+k);return t[k];}});
   const w=new C(input),o=V(0,3,0),d=V(.3,-1,.2);let far=20;
   const scalar=(label,v)=>({valueOf(){trace.push('coerce:'+label);return v;}});
   if(kind==='far')far=typeof value==='function'?value(trace):value;
   if(kind==='direction')d.x=scalar('dx',value);
   if(kind==='getters')for(const [label,obj] of [['o',o],['d',d]])for(const key of ['x','y','z']){let n=0;const initial=obj[key];Object.defineProperty(obj,key,{get(){trace.push(label+'.'+key+':'+n);return n++<2?initial:initial+(key==='x'?.125:0);}});}
   return {w,args:[o,d,far,{anyHit:false}],trace};};
  const a=make(A),b=make(f.TriangleWorld);compare(a.w,b.w,a.args,b.args);assert.deepEqual(b.trace,a.trace);
 };
 for(const v of [NaN,Infinity,-Infinity,-0,0,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,-Number.MAX_VALUE])runCase('bound',v);
 for(const v of [NaN,Infinity,-Infinity,-0,0,'2',null,undefined,2n,Symbol('far'),trace=>({valueOf(){trace.push('coerce:far');return 20;}})])runCase('far',v);
 for(const v of [0,-0,1e-12,-1e-12,1e-13,NaN,Infinity,2n,Symbol('d')])runCase('direction',v);
 runCase('getters');
});
