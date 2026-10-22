import test from 'node:test';import assert from 'node:assert/strict';
import {installIssue264PaintOwnership as oldInstall} from './fixtures/paint-piece-ownership-baseline.mjs';
import {installIssue264PaintOwnership as install} from '../runtime/paint-ownership.mjs';
const contract={kind:{speck:7},shapes:[],reach:[],dripReach:4};
function make(fn){class Paint{splat(){}flush(){} _emitGrowth(){}}fn(Paint,contract);const p=new Paint();p.grid=new Uint8Array(32);return p;}
function metadata(p){return p._paintOrderRecords.map(r=>typeof r==='number'?{local:true,seq:r,legacy:false}:r);}
test('100000 local attempts retain exact stable IDs and old comparisons using numeric metadata, including delayed old handles',()=>{
 const a=make(oldInstall),b=make(install);const receipts=[];let word=7;
 for(let i=0;i<100000;i++){
  const order=i%101===0?{clock:i,peer:'remote-'+i%3,seq:i+1,epoch:'match',tie:String(i%5),legacy:i%2===0}:null;
  const id=b._paintOrderId(order);assert.equal(id,a._paintOrderId(order));if(order)receipts.push([order,id]);
  if(i%4096===0)for(let j=0;j<=i;j+=173){assert.equal(b._paintOrderComesAfter(id,j),a._paintOrderComesAfter(id,j));assert.equal(b._paintOrderComesAfter(j,id),a._paintOrderComesAfter(j,id));}
 }
 assert.equal(b._paintOrderRecords.length,100001);assert.deepEqual(metadata(b),a._paintOrderRecords);
 assert.equal(b._paintOrderRecords.filter(r=>typeof r==='number').length,100000-receipts.length);
 for(const [order,id] of receipts){assert.equal(b._paintOrderId(order),id);assert.equal(a._paintOrderId(order),id);}
 for(let i=0;i<20000;i++){word=(Math.imul(word,1664525)+1013904223)>>>0;const next=word%100010;word=(Math.imul(word,1664525)+1013904223)>>>0;const previous=word%100010;assert.equal(b._paintOrderComesAfter(next,previous),a._paintOrderComesAfter(next,previous));}
 for(const p of [a,b]){p._paintClaimCell(0,1,3);p._paintClaimCell(1,2,99999);}
 for(const id of [1,3,57,99999,100000,100001])for(let cell=0;cell<2;cell++)assert.equal(b._paintClaimCell(cell,2,id),a._paintClaimCell(cell,2,id));
 assert.deepEqual(b._paintOwnershipOrder,a._paintOwnershipOrder);assert.equal(b._paintOrderRecords.length,100001,'historical IDs are never expired or renumbered');
});
test('wrapping local sequence, invalid orders, legacy/network/large clocks retain baseline precedence',()=>{
 const a=make(oldInstall),b=make(install);a._paintOrderId();b._paintOrderId();a._paintOwnershipSequence=b._paintOwnershipSequence=0xfffffffd;
 const orders=[null,null,null,{clock:1,seq:1,peer:'legacy',legacy:true},{clock:0,seq:1,peer:'current'},null,{clock:'9007199254740993',seq:2,peer:'large'},{clock:-1,seq:0,peer:''},null];
 for(const order of orders)assert.equal(b._paintOrderId(order),a._paintOrderId(order));assert.deepEqual(metadata(b),a._paintOrderRecords);
 for(let next=0;next<12;next++)for(let previous=0;previous<12;previous++)assert.equal(b._paintOrderComesAfter(next,previous),a._paintOrderComesAfter(next,previous));
 b._clearPaintOwnership();a._clearPaintOwnership();assert.deepEqual(b._paintOrderRecords,a._paintOrderRecords);assert.equal(b._paintOrderId(),a._paintOrderId());
});
test('erasing or reusing an apparently unreferenced returned ID corrupts the existing comparator contract',()=>{
 const p=make(install),first=p._paintOrderId(),second=p._paintOrderId();assert.equal(p._paintOrderComesAfter(first,second),false);const saved=p._paintOrderRecords[second];
 // No grid cell refers to second. Its still-valid numeric handle remains usable.
 p._paintOrderRecords[second]=null;assert.equal(p._paintOrderComesAfter(first,second),true,'tombstone changes the delayed comparison');p._paintOrderRecords[second]=saved;
 p._paintOrderRecords[first]=p._paintOrderRecords[p._paintOrderId()];assert.equal(p._paintOrderComesAfter(first,second),true,'reused ID grants stale caller newer authority');
});
