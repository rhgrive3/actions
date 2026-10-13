import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { buildSourceBVH } from '../runtime/source-convert.mjs';

const source=fs.readFileSync(new URL('../runtime/triangle-world.mjs',import.meta.url),'utf8');
// Frozen pre-specialization slab loop. Keep the original division order and
// triangle intersection, rather than using a second approximate ray library.
const oldLoop=`   for(let k=0;k<3;k++){
    const o=k===0?origin.x:k===1?origin.y:origin.z,d=k===0?dir.x:k===1?dir.y:dir.z;
    if(Math.abs(d)<1e-12){if(o<nodes[ni+k]||o>nodes[ni+3+k]){miss=true;break;}continue;}
    const a=(nodes[ni+k]-o)/d,b=(nodes[ni+3+k]-o)/d;low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));if(high<low){miss=true;break;}
   }`;
const specialized=/   if\(verticalDown\)\{[\s\S]*?\n   \}else\{\n[\s\S]*?\n   \}\n   \}/;
assert.equal((source.match(specialized)||[]).length,1);
const baseline=source.replace('  const verticalDown=dir.x===0&&dir.z===0&&dir.y===-1;\n','').replace(specialized,oldLoop);
const load=(src,THREE)=>new Function('THREE',src.replace(/^import .*;$/gm,'').replace('export class','class')+'\nreturn TriangleWorld;')(THREE);
const flat=h=>h?{...h,point:h.point.toArray(),normal:h.normal.toArray()}:null;
function data(){
 let state=0x63853;const rnd=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
 const points=[];for(let i=0;i<160;i++){const x=(rnd()-.5)*24,y=(rnd()-.5)*14,z=(rnd()-.5)*24;points.push(x,y,z,x+rnd()*5,y+rnd()*2,z,x,y-rnd(),z+rnd()*5);}
 // Exact coplanar ties, floor, ceiling, grate, degenerate, inside-root probes.
 points.push(-4,0,-4,4,0,-4,4,0,4, -4,0,-4,4,0,-4,4,0,4,
 -4,2,-4,4,2,4,4,2,-4, 0,0,0,0,0,0,0,0,0);
 const triangles=new Float32Array(points),n=points.length/9,normals=new Float32Array(n*3),flags=new Uint32Array(n),objectIds=new Uint32Array(n);
 for(let i=0;i<n;i++){normals[i*3+1]=i%3===0?-1:1;flags[i]=i%5===0?5:3;objectIds[i]=i%11;}
 return {triangles,normals,flags,objectIds,...buildSourceBVH(triangles)};
}
test('downward BVH specialization preserves exact hits, signed zero, ties, and traversal counters',async()=>{
 const f=await fixture(),A=load(baseline,f.THREE),B=load(source,f.THREE),input=data(),a=new A(input),b=new B(input);
 let queries=0;const compare=(o,d,far,opts)=>{assert.deepEqual(flat(b.ray(o,d,far,opts)),flat(a.ray(o,d,far,opts)));assert.equal(b.queryCount,a.queryCount);assert.equal(b.triangleTests,a.triangleTests);queries++;};
 const V=(x,y,z)=>new f.THREE.Vector3(x,y,z);
 const values=[-4-Number.EPSILON*4,-4,-4+Number.EPSILON*4,0,-0,4-Number.EPSILON*4,4,4+Number.EPSILON*4];
 for(const x of values)for(const z of values)for(const y of [-4,0,.00001,2,4,20])for(const far of [-1,-0,0,.00001,2,20,Infinity,NaN])for(const sx of [0,-0])for(const sz of [0,-0]){
  compare(V(x,y,z),V(sx,-1,sz),far,{ignoreGrates:(queries%2)===0,minNormalY:[-2,.62,.68,1.1][queries%4]});
 }
 // Node slab boundaries, arbitrary direction fallbacks, near-parallel inputs,
 // up-rays, invalid origins and independent reconstruction using fresh data.
 for(let i=0;i<input.nodes.length;i+=8)for(const k of [0,3])compare(V(input.nodes[i+k],input.nodes[i+4]+1,input.nodes[i+2+k]),V(-0,-1,0),50,{});
 for(const d of [V(0,1,0),V(0,-.9999999999999999,0),V(1e-13,-1,0),V(1e-12,-1,0),V(0,0,0),V(.3,-.4,.5)])for(const x of values)compare(V(x,3,0),d,20,{});
 for(const x of [NaN,Infinity,-Infinity])compare(V(x,3,0),V(0,-1,0),20,{});
 const rebuilt=new B(data());assert.deepEqual(flat(rebuilt.ray(V(0,3,0),V(0,-1,0),20)),flat(a.ray(V(0,3,0),V(0,-1,0),20)));
 assert.ok(queries>12000);console.log(JSON.stringify({queries,triangleTests:b.triangleTests}));
});
