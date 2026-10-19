// Run: node --test tests/issue-queue/camera-collision-probe.test.mjs
// Regression against the real Physics.cameraProbe + raycast methods, with a small Vector3 stand-in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

class Vec {
  constructor(x=0,y=0,z=0) { this.set(x,y,z); }
  set(x,y,z) { this.x=x;this.y=y;this.z=z;return this; }
  copy(v) { return this.set(v.x,v.y,v.z); }
  clone() { return new Vec(this.x,this.y,this.z); }
  sub(v) { this.x-=v.x;this.y-=v.y;this.z-=v.z;return this; }
  dot(v) { return this.x*v.x+this.y*v.y+this.z*v.z; }
  crossVectors(a,b) { return this.set(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x); }
  length() { return Math.hypot(this.x,this.y,this.z); }
  multiplyScalar(s) { this.x*=s;this.y*=s;this.z*=s;return this; }
  normalize() { return this.multiplyScalar(1/this.length()); }
  addScaledVector(v,k) { this.x+=v.x*k;this.y+=v.y*k;this.z+=v.z*k;return this; }
}
globalThis.__physicsQueueThree={Vector3:Vec};
const raw=readFileSync(new URL('../../inkwave-public/src/game/physics.js',import.meta.url),'utf8');
assert.ok(raw.includes("import * as THREE from 'three';"));
const loaded=raw.replace("import * as THREE from 'three';",'const THREE=globalThis.__physicsQueueThree;');
const { Physics }=await import('data:text/javascript;base64,'+Buffer.from(loaded).toString('base64'));

function block(id,lo,hi) {
  return {id,solid:true,grate:false,
    center:new Vec((lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2),
    half:new Vec((hi[0]-lo[0])/2,(hi[1]-lo[1])/2,(hi[2]-lo[2])/2),
    axes:[new Vec(1,0,0),new Vec(0,1,0),new Vec(0,0,1)],
    faces:Array.from({length:6},(_,j)=>id*6+j)};
}
function scene(faceOffset=0) {
  return new Physics({
    blocks:[
      block(0,[.25,0,-4.2],[.45,2,-4]),
      block(1,[-.7,2.3,-.85],[.7,3.4,-.65])
    ],
    faces:Array.from({length:12},(_,j)=>({
      origin:new Vec(faceOffset+j*.01,faceOffset*.5,faceOffset*-.25),
      u:new Vec(1,0,0),v:new Vec(0,1,0)
    })),
    queryBlocks() { return [0,1]; }
  });
}
function close(actual,expected,msg) { assert.ok(Math.abs(actual-expected)<1e-8, msg+': '+actual+' vs '+expected); }
function run(faceOffset=0) {
  const physics=scene(faceOffset), observed=[];
  const raycast=physics.raycast.bind(physics);
  physics.raycast=(origin,...rest)=>{observed.push(origin.clone());return raycast(origin,...rest);};
  const result={};
  physics.cameraProbe(new Vec(0,1.5,0),new Vec(0,0,-1),4.5,.62,result,.3);
  return {result,observed};
}

test('15 camera rays retain fixed origins after side-wall hits and never strike the unrelated overhang',()=>{
  const {result,observed}=run();
  assert.equal(observed.length,15);
  const expected=[[0,0]];
  for(let i=0;i<6;i++) expected.push([Math.cos(i*Math.PI/3)*.5,Math.sin(i*Math.PI/3)*.5]);
  for(let i=0;i<8;i++) expected.push([Math.cos(i*Math.PI/4+.39),Math.sin(i*Math.PI/4+.39)]);
  for(let i=0;i<expected.length;i++) {
    close(observed[i].x,expected[i][0]*.62,'ray '+i+' x');
    close(observed[i].y,1.5+expected[i][1]*.62,'ray '+i+' y');
    close(observed[i].z,0,'ray '+i+' z');
  }
  close(observed[7].x,.573443617103,'ray 7 x');
  close(observed[7].y,1.735716817442,'ray 7 y');
  close(result.hard,4.5,'hard');
  close(result.soft,3.9,'soft');
  assert.equal(result.floor,false);
});
test('ray face-local UV origin has no effect on probe cylinder or collision limits',()=>{
  const a=run(0), b=run(999);
  assert.deepEqual(a.result,b.result);
  for(let i=0;i<a.observed.length;i++) assert.deepEqual(a.observed[i],b.observed[i]);
});
