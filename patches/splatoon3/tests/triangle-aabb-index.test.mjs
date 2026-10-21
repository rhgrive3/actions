import test from 'node:test';
import assert from 'node:assert/strict';
import {createTriangleAabbIndex} from './triangle-aabb-index.mjs';
const box = (x,y,z,xx=x,yy=y,zz=z) => ({min:{x,y,z},max:{x:xx,y:yy,z:zz}});
const intersects = (a,b) => !(a.max.x<b.min.x || a.min.x>b.max.x || a.max.y<b.min.y || a.min.y>b.max.y || a.max.z<b.min.z || a.min.z>b.max.z);
function check(boxes, queries) { const query=createTriangleAabbIndex(boxes);for(const b of queries)assert.deepEqual(query(b),boxes.flatMap((a,i)=>intersects(a,b)?[i]:[])); }
test('inclusive boundary, negative coordinates and point/line degeneracy preserve exact ordered candidates',()=>{
 const a=[box(0,0,0,1,1,0),box(1,0,0,2,1,0),box(-2,-2,-2,-1,-1,-2),box(-2,-2,-2),box(3,3,3),box(0,0,0,2,0,0),box(1+1e-10,0,0,2,1,0)];
 check([...a,...a,...a],a);assert.deepEqual(createTriangleAabbIndex(a)(a[0]),[0,1,5]);
});
test('deterministic dispersed boxes, duplicate centers and reordered faces preserve all-pair results',()=>{
 let seed=139;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 const boxes=Array.from({length:201},()=>{const x=random()*20-10,y=random()*20-10,z=random()*20-10;return box(x,y,z,x+random(),y+random(),z+random());});boxes.push(...boxes.slice(0,17));
 check(boxes,boxes);check(boxes.slice().reverse(),boxes);check(boxes,[box(-100,-100,-100,100,100,100),box(200,200,200)]);
});
test('empty index and invalid geometry are explicit',()=>{assert.deepEqual(createTriangleAabbIndex([])(box(0,0,0)),[]);assert.throws(()=>createTriangleAabbIndex([box(NaN,0,0)]),/Invalid/);assert.throws(()=>createTriangleAabbIndex([box(1,0,0,0,0,0)]),/Invalid/);});
