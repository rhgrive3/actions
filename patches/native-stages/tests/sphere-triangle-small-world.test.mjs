import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';

// Access the production engine, including its bundled/minified solver when
// INKWAVE_BUILT_SITE is set. Do not import the build-only kernel into a build.
const f=await fixture({extraExports:"export {NativeLevel} from './patches/native-stages/runtime/engine.mjs';"});
const vector=a=>new f.THREE.Vector3(...a);
const from=[-1.1029163644181494e-7,-5.6571220169459524e-8,0];
const delta=[1.0537703949066705e-7,0,0];
const radius=6.614618108166186e-8,change=-4.199653551258003e-8;
function world(points){
 const min=[0,1,2].map(k=>Math.min(...points.map(p=>p[k])));
 const max=[0,1,2].map(k=>Math.max(...points.map(p=>p[k])));
 return new f.NativeLevel({
  manifest:{id:'small-coefficient-world',bounds:{minX:-2,maxX:2,minZ:-2,maxZ:2},
   spawnPads:[[-1,0,0],[1,0,0]],spawnBarrier:0,objects:[],faces:[]},
  triangles:new Float32Array(points.flat()),normals:new Float32Array([0,0,1]),
  flags:new Uint32Array([3]),objectIds:new Uint32Array([0]),
  nodes:new Float32Array([...min,...max,-1,1]),order:new Uint32Array([0]),
  triangleFace:new Int32Array([-1]),mask:new Uint8Array(),
 }).triangleWorld;
}
function sweep(points){const a=vector(from),b=a.clone().add(vector(delta));return world(points).sweepSphere(a,b,radius,{endRadius:radius+change});}
for(const [name,points] of [
 ['forward',[[0,0,0],[0,1,0],[1,0,0]]],
 ['reverse',[[0,0,0],[1,0,0],[0,1,0]]],
])test('production tiny shrinking sphere misses ordinary vertex: '+name,()=>{
 const r=radius+1e-10,A=delta[0]**2-change**2;
 const B=2*(from[0]*delta[0]-r*change),C=from[0]**2+from[1]**2-r*r;
 assert.ok(A>0&&A<1e-14);
 assert.ok(B*B-4*A*C<0,'independent vertex-distance equation has no real entry');
 assert.equal(sweep(points),null);
});
test('production tiny shrinking sphere enters an ordinary edge at the independent root',()=>{
 const expected=(-from[0]-(radius+1e-10))/(delta[0]+change);
 const hit=sweep([[0,-1,0],[0,1,0],[1,0,0]]);
 assert.ok(hit);assert.equal(hit.triangle,0);assert.equal(hit.flags,3);assert.equal(hit.object,0);
 assert.ok(Math.abs(hit.time-expected)<2e-12,`${hit.time} != ${expected}`);
 assert.ok(Math.abs(hit.point.x)<1e-12);
});
