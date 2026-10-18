import test from 'node:test';
import assert from 'node:assert/strict';
import {canopyEntry,brellaPelletSpeed,withProjectileHitGeometry,validProjectileHitGeometry}from'../runtime/brella-physics.mjs';
const V=(x,y,z)=>({x,y,z});

test('centered circular cloth boundary sampled every 0.1, including symmetric below/above and rear entry',()=>{
 const c={pos:V(0,0,0),dir:V(0,0,1),radius:.7};
 for(let ix=-11;ix<=11;ix++)for(let iy=-11;iy<=11;iy++){
  const x=ix/10,y=iy/10,inside=x*x+y*y<=.49+1e-10;
  assert.equal(canopyEntry(V(x,y,2),V(x,y,-2),c)!==null,inside,`${x},${y}`);
  assert.equal(canopyEntry(V(x,y,-2),V(x,y,2),c)!==null,inside,`rear ${x},${y}`);
 }
 assert.equal(canopyEntry(V(.8,0,2),V(.8,0,-2),c,.11)!==null,true);
});

test('cloth rotates with the actual shield direction, rather than always testing a vertical capsule',()=>{
 const c={pos:V(0,0,0),dir:V(0,1,0),radius:.7};
 assert.notEqual(canopyEntry(V(.6,2,0),V(.6,-2,0),c),null);
 assert.equal(canopyEntry(V(.8,2,0),V(.8,-2,0),c),null);
 assert.equal(canopyEntry(V(0,.2,2),V(0,.2,-2),c),null);
});

test('explicit signed speed envelope preserves zero centre and omitted sparse random default',()=>{
 const g={MoveParam:{SpawnSpeed:2.4},InitVelRandom:.35};
 assert.equal(brellaPelletSpeed(g,0,()=>0),2.05);assert.equal(brellaPelletSpeed(g,0,()=>1),2.75);
 const fail=()=>{throw Error('fixed source group must not draw RNG');};
 assert.equal(brellaPelletSpeed({InitVelRandom:0},3,fail),3);assert.equal(brellaPelletSpeed({},3,fail),3);
});

test('synchronous geometry scope cleans up through nested routing and throws',()=>{
 const system={},a=V(0,1,2),b=V(3,4,5);
 withProjectileHitGeometry(system,a,b,.1,()=>{
  const outer=system.s3HitGeometry;assert.equal(validProjectileHitGeometry(outer),true);
  assert.throws(()=>withProjectileHitGeometry(system,b,a,.2,()=>{throw Error('sink');}),/sink/);
  assert.equal(system.s3HitGeometry,outer);
 });assert.equal(system.s3HitGeometry,undefined);
});
