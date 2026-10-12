import test from 'node:test';
import assert from 'node:assert/strict';
import { installIssue264PaintOwnership as oldInstall } from './fixtures/paint-piece-ownership-baseline.mjs';
import { installIssue264PaintOwnership as install } from '../runtime/paint-ownership.mjs';
const contract={kind:{speck:7},shapes:[],reach:[],dripReach:4};
function make(fn){class Paint{ splat(){} flush(){} _emitGrowth(){} }fn(Paint,contract);const p=new Paint();p.grid=new Uint8Array(16);return p;}
test('local IDs and order precedence retain exact records without unused local map entries',()=>{
 const a=make(oldInstall),b=make(install);
 for(let i=0;i<10000;i++){assert.equal(b._paintOrderId(),a._paintOrderId());if(i%7===0){const o={clock:i,peer:'a',seq:i+1};assert.equal(b._paintOrderId(o),a._paintOrderId(o));assert.equal(b._paintOrderId(o),a._paintOrderId(o));}}
 assert.deepEqual(b._paintOrderRecords,a._paintOrderRecords);
 assert.equal(a._paintOrderIds.size-b._paintOrderIds.size,10000);
 assert.equal([...b._paintOrderIds.keys()].some(k=>k.startsWith('local:')),false);
 for(let i=1;i<b._paintOrderRecords.length;i+=97)for(let j=1;j<b._paintOrderRecords.length;j+=113)assert.equal(b._paintOrderComesAfter(i,j),a._paintOrderComesAfter(i,j));
});
test('invalid network metadata remains a fresh local order and clear restarts both stores',()=>{
 const p=make(install);
 for(const order of[null,{}, {clock:1,peer:'a',seq:0},{clock:-1,peer:'a',seq:1},{clock:1,peer:'',seq:1}]){const a=p._paintOrderId(order),b=p._paintOrderId(order);assert.notEqual(a,b);}
 assert.equal(p._paintOrderIds.size,0);
 const o={clock:'9007199254740993',peer:'a',seq:1,epoch:'match',tie:'x'};
 const id=p._paintOrderId(o);assert.equal(p._paintOrderId(o),id);assert.equal(p._paintOrderIds.size,1);
 p._clearPaintOwnership();assert.equal(p._paintOrderIds.size,0);assert.deepEqual(p._paintOrderRecords,[null]);assert.equal(p._paintOrderId(),1);
});
test('actual composed PaintSystem preserves network deduplication around local stamps',async()=>{
 const {fixture}=await import('./source-fixture.mjs');const f=await fixture({productionComposition:true});const p=Object.create(f.PaintSystem.prototype);p.grid=new Uint8Array(16);
 const network={clock:7,peer:'real',seq:3};const first=p._paintOrderId(network);
 for(let i=0;i<500;i++)p._paintOrderId();assert.equal(p._paintOrderId(network),first);assert.equal(p._paintOrderIds.size,1);assert.equal(p._paintOrderRecords.length,502);
 p._clearPaintOwnership();assert.equal(p._paintOrderIds.size,0);assert.equal(p._paintOrderRecords.length,1);
});
