import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {types} from 'node:util';

// Evaluate the actual test's small snapshot function, without constructing VM game graphs.
const source=fs.readFileSync(new URL('../../patches/splatoon3/tests/catalog-paint-timing-boundaries.test.mjs',import.meta.url),'utf8');
const body=source.match(/function snapshot\(x\)\{[\s\S]*?\n\}/)?.[0];
assert(body,'snapshot function must remain inspectable');
const snapshot=vm.runInNewContext('('+body+')',{assert,types,Uint8Array,dropsSnapshot:system=>system.queue});
function originalSnapshot(x){
 const queue=x.f.G.projectiles.queue;
 assert.deepEqual(x.drawnDrops,queue,'the visible stream observes the caught-up positions before draw');
 return {queue,landed:x.stamps.length,grid:Array.from(x.paint.grid),turf:x.a.stats.turf};
}
function input(grid){const queue=[[1,2,.3,.37,4,5,6,7]];return {f:{G:{projectiles:{queue}}},drawnDrops:structuredClone(queue),stamps:[{},{}],paint:{grid},a:{stats:{turf:.125}}};}
const values=row=>({queue:row.queue,landed:row.landed,grid:Array.from(row.grid),turf:row.turf});

test('all cells at all90 cadence snapshots exactly match the original Array representation',()=>{
 const snapshots=[];
 for(const hz of [30,60,120])for(let tick=0;tick<30;tick++){
  const grid=new Uint8Array(134400);for(let i=0;i<grid.length;i++)grid[i]=(i+tick+hz)%256;
  const x=input(grid),before=originalSnapshot(x),after=snapshot(x);
  assert.deepEqual(values(after),before);assert.equal(after.grid.byteLength,134400);
  snapshots.push(after);
 }
 assert.equal(snapshots.length,90);
 assert.equal(snapshots.reduce((sum,row)=>sum+row.grid.byteLength,0),12096000);
});

test('cross-VM byte grids normalize to host storage and never alias live paint',()=>{
 const foreign=vm.runInNewContext('new Uint8Array([0,1,2,255])');
 assert.notEqual(Object.getPrototypeOf(foreign),Uint8Array.prototype);
 const x=input(foreign),first=snapshot(x),second=snapshot(input(new Uint8Array(foreign)));
 assert.equal(Object.getPrototypeOf(first.grid),Uint8Array.prototype);assert.deepEqual(first,second);
 foreign.fill(9);assert.deepEqual(Array.from(first.grid),[0,1,2,255]);
 first.grid[0]=7;assert.equal(foreign[0],9);assert.equal(second.grid[0],0);
});

test('every tested single-cell corruption, including final cell, fails both representations',()=>{
 const pristine=new Uint8Array(134400);pristine[17]=1;pristine[18]=2;
 for(const index of [0,17,18,65535,134399]){
  const changed=pristine.slice();changed[index]=(changed[index]+1)%256;
  const a=input(pristine),b=input(changed);
  assert.throws(()=>assert.deepEqual(originalSnapshot(a),originalSnapshot(b)));
  assert.throws(()=>assert.deepEqual(snapshot(a),snapshot(b)));
 }
});

test('queue, landing count, turf and before-draw assertions remain exact',()=>{
 for(const field of ['queue','landed','turf']){
  const a=input(new Uint8Array([0,1,2])),b=input(new Uint8Array([0,1,2]));
  if(field==='queue'){b.f.G.projectiles.queue[0][0]++;b.drawnDrops=structuredClone(b.f.G.projectiles.queue);}
  if(field==='landed')b.stamps.push({});
  if(field==='turf')b.a.stats.turf+=.0625;
  assert.throws(()=>assert.deepEqual(originalSnapshot(a),originalSnapshot(b)));
  assert.throws(()=>assert.deepEqual(snapshot(a),snapshot(b)));
 }
 const x=input(new Uint8Array(4));x.drawnDrops=[];
 for(const fn of [originalSnapshot,snapshot])assert.throws(()=>fn(x),/visible stream/);
});

test('non-byte grids fail closed instead of silently coercing ownership values',()=>{
 for(const grid of [[0,256],new Uint16Array([0,256]),new Float64Array([NaN,-1]),new Int8Array([-1,1])]){
  assert.throws(()=>snapshot(input(grid)),/ownership snapshots require a Uint8Array/);
 }
});


test('subarray offsets, grid length and cell order are not lost',()=>{
 const backing=new Uint8Array([99,0,1,2,255,88]);
 const x=input(backing.subarray(1,5));
 assert.deepEqual(values(snapshot(x)),originalSnapshot(x));
 assert.equal(snapshot(x).grid.length,4);
 for(const grid of [new Uint8Array([0,1,2]),new Uint8Array([0,1,2,255,0]),new Uint8Array([1,0,2,255])]){
  assert.throws(()=>assert.deepEqual(originalSnapshot(x),originalSnapshot(input(grid))));
  assert.throws(()=>assert.deepEqual(snapshot(x),snapshot(input(grid))));
 }
});
