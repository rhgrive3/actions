import test from 'node:test';
import assert from 'node:assert/strict';
import { RankedWorld } from '../runtime/ranked/world.mjs';
test('zone coverage reuses only matching paint revisions, grids and zone indices',()=>{
 const world=Object.assign(Object.create(RankedWorld.prototype),{stage:{zones:[{}]},paint:{grid:new Uint8Array([1,2,0]),version:0},_zoneCells:[[{cell:0,area:2},{cell:1,area:1},{cell:2,area:1}]]});
 const first=world.zoneCoverage();assert.deepEqual(first,[[.5,.25]]);assert.equal(world.zoneCoverage(),first);
 assert.ok(Object.isFrozen(first)&&Object.isFrozen(first[0]));
 world.paint.grid[2]=2;world.paint.version++;const painted=world.zoneCoverage();assert.deepEqual(painted,[[.5,.5]]);assert.notEqual(painted,first);assert.deepEqual(first,[[.5,.25]],'previous snapshots stay immutable');
 world.paint.grid=new Uint8Array([0,0,0]);assert.deepEqual(world.zoneCoverage(),[[0,0]],'same-number revision with replaced grid invalidates');
 world._zoneCells=[[{cell:0,area:1}]];world.paint.grid[0]=1;assert.deepEqual(world.zoneCoverage(),[[1,0]],'rebuilt cell index invalidates');
 delete world.paint.version;const before=world.zoneCoverage();world.paint.grid[0]=2;assert.deepEqual(world.zoneCoverage(),[[0,1]]);assert.deepEqual(before,[[1,0]],'unversioned/custom paint always rescans');
});
