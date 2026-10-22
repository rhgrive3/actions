import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './fixture.mjs';
import {buildSourceBVH} from '../runtime/source-convert.mjs';
import {sphereTriangleEntry} from '../runtime/sphere-triangle-entry.mjs';
const f=await nativeFixture(),{THREE}=f;
const load=source=>new Function('THREE','sphereTriangleEntry',source.replace(/^import .*;$/gm,'').replace(/^export /gm,'')+'\nreturn TriangleWorld;')(THREE,sphereTriangleEntry);
const Before=load(fs.readFileSync(new URL('./fixtures/triangle-world-c0938a3.mjs.txt',import.meta.url),'utf8'));
const After=load(fs.readFileSync(new URL('../runtime/triangle-world.mjs',import.meta.url),'utf8'));
let seed=491;const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const triangles=new Float32Array(120*9),normals=new Float32Array(120*3),flags=new Uint32Array(120),objectIds=new Uint32Array(120);
for(let i=0;i<120;i++){
 const at=i*9;for(let k=0;k<9;k++)triangles[at+k]=(rnd()-.5)*10;
 if(i%13===0)for(let k=3;k<9;k++)triangles[at+k]=triangles[at+k%3];
 const a=new THREE.Vector3().fromArray(triangles,at),b=new THREE.Vector3().fromArray(triangles,at+3),c=new THREE.Vector3().fromArray(triangles,at+6),n=new THREE.Triangle(a,b,c).getNormal(new THREE.Vector3());n.toArray(normals,i*3);flags[i]=i%7===0?7:3;objectIds[i]=i%11;
}
const data={triangles,normals,flags,objectIds,...buildSourceBVH(triangles)},a=new Before(data),b=new After(data);
const flat=hit=>hit&&{...hit,point:hit.point.toArray(),normal:hit.normal.toArray()};
test('point-triangle specialization retains exact frozen distance and both contact endpoints',()=>{
 for(let i=0;i<10000;i++){
  const p=new THREE.Vector3((rnd()-.5)*13,(rnd()-.5)*13,(rnd()-.5)*13),id=i%120;
  assert.equal(b._capsuleDistance(p,p,b.triangle(id)),a._capsuleDistance(p,p,a.triangle(id)));
  assert.deepEqual(b._bestp.toArray(),a._bestp.toArray());assert.deepEqual(b._bests.toArray(),a._bests.toArray());
 }
});
test('sphere final-hit allocation and invariant hoist preserve all frozen swept results',()=>{
 let hits=0;
 for(let i=0;i<1500;i++){
  const from=new THREE.Vector3((rnd()-.5)*12,(rnd()-.5)*12,(rnd()-.5)*12),to=i%17?new THREE.Vector3((rnd()-.5)*12,(rnd()-.5)*12,(rnd()-.5)*12):from.clone(),r=rnd()*.4,options={ignoreGrates:i%3===0,endRadius:i%5?r:rnd()*.6};
  const before=a.sweepSphere(from,to,r,options),after=b.sweepSphere(from,to,r,options);assert.deepEqual(flat(after),flat(before));if(after){hits++;const saved=flat(after);b.sweepSphere(new THREE.Vector3(10,10,10),new THREE.Vector3(12,11,12),.1);assert.deepEqual(flat(after),saved,'public hit owns independent vectors');}
 }
 assert(hits>100);
});
test('per-triangle broadphase removes only separated leaf candidates before exact sweep',()=>{
 const tris=[];for(let i=0;i<12;i++){const x=i*10;tris.push(x,0,0,x+1,0,0,x,0,1);}
 const triangles=new Float32Array(tris),data={triangles,normals:Float32Array.from({length:36},(_,i)=>i%3===1?1:0),flags:new Uint32Array(12).fill(3),objectIds:new Uint32Array(12),...buildSourceBVH(triangles)},a=new Before(data),b=new After(data),from=new THREE.Vector3(.2,1,.2),to=new THREE.Vector3(.2,-1,.2);
 assert.deepEqual(flat(b.sweepSphere(from,to,.1)),flat(a.sweepSphere(from,to,.1)));
 assert.equal(a.triangleTests,12);assert.equal(b.triangleTests,1);assert.equal(b.triangleOverlapsBounds(11,NaN,0,0,1,1,1),true);
});
