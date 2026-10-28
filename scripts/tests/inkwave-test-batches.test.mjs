import test from 'node:test';
import assert from 'node:assert/strict';
import {batchSelectedTestFiles,selectTestShard} from '../lib/inkwave-test-shards.mjs';
test('198-file unstable shard partitions without omission or reordering',()=>{
 const original=Array.from({length:1580},(_,i)=>'test-'+i);
 const selected=selectTestShard(original,2,8),chunks=batchSelectedTestFiles(selected,1);
 assert.equal(selected.length,198);assert.equal(chunks.length,198);
 assert.deepEqual(chunks.flat(),selected);
 assert(chunks.every(x=>x.length===1));
 assert.equal(new Set(chunks.flat()).size,selected.length);
});
test('batch boundaries never mutate caller files and reject invalid counts',()=>{
 const files=['a','b','c','d','e'];
 assert.deepEqual(batchSelectedTestFiles(files,2),[['a','b'],['c','d'],['e']]);
 assert.deepEqual(files,['a','b','c','d','e']);
 assert.deepEqual(batchSelectedTestFiles([],24),[]);
 for(const n of [0,-1,1.5,Infinity,NaN,null])assert.throws(()=>batchSelectedTestFiles(files,n));
 assert.throws(()=>batchSelectedTestFiles(null));
});