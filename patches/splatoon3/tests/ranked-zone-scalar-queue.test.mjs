import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {RankedWorld} from '../runtime/ranked/world.mjs';
const old=new Function('finite','zoneAreaTotals','return ({'+fs.readFileSync(new URL('./fixtures/zone-coverage-before-scalars-031426fc.mjs.txt',import.meta.url),'utf8')+'}).zoneCoverage;')(Number.isFinite,new WeakMap());
test('real zoneCoverage scalars preserve exact ratios, read order, caches and exceptional cell areas',()=>{
 for(let n=0;n<1000;n++){
  function run(fn){let sequence=0;const reads=[];const cells=Array.from({length:n%31},(_,cell)=>({cell,get area(){reads.push(cell);const value=[0,-0,.25,1,-1,1e300,NaN,Infinity][(cell+n)%8];return n%5?value:value+(sequence++);}}));
   const paint={version:n%3?0:undefined,grid:Array.from({length:31},(_,i)=>(i+n)%4)};
   const w={stage:{zones:[{},{}]},paint,_zoneCells:[cells,cells.slice().reverse()]};
   const first=fn.call(w),again=fn.call(w);paint.version=1;paint.grid=paint.grid.map(x=>x%3+1);const changed=fn.call(w);
   return{first,again,changed,reads,same:first===again,frozen:Object.isFrozen(changed)};}
  assert.deepEqual(run(RankedWorld.prototype.zoneCoverage),run(old));
 }
});
