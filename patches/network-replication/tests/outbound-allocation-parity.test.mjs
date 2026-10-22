import test from 'node:test';
import assert from 'node:assert/strict';
import {sendOutboundTick,OUTBOUND_RECEIPT,outboundQueueStatus} from '../outbound-prefix.mjs';

function fixture(count,accept=()=>true){
 const n={out:Array.from({length:count},(_,id)=>({id})),match:{}};
 const wires=[];n.s={match:n,tr:{broadcast(w){wires.push(JSON.stringify(w));return accept(w,n);},close(){}},_closed(){}};
 return {n,wires};
}
const pack=(_n,msg)=>({...msg});
for(const count of [0,1,255,256,257,512])test(`accepted FIFO prefix preserves tail references for ${count} rows`,()=>{
 const {n,wires}=fixture(count),queue=n.out,original=[...queue];
 assert.equal(sendOutboundTick(n,{k:'tick'},pack),true);
 assert.equal(n.out,queue);
 assert.deepEqual(n.out,original.slice(Math.min(count,256)));
 n.out.forEach((row,i)=>assert.equal(row,original[i+Math.min(count,256)]));
 const wire=JSON.parse(wires[0]);
 assert.equal(Object.hasOwn(wire,'e'),count>0);
 if(count)assert.deepEqual(wire.e,original.slice(0,256));
 assert.equal(outboundQueueStatus(n).rows,n.out.length);
});
test('idle successful packet never calls array slice or splice',()=>{
 const {n}=fixture(0);
 n.out.slice=()=>{throw Error('idle prefix allocation');};
 n.out.splice=()=>{throw Error('discarded allocation');};
 assert.equal(sendOutboundTick(n,{k:'tick'},pack),true);
});
test('successful send keeps reentrant additions behind unsent rows',()=>{
 const extra={id:'new'};const {n}=fixture(300,(_w,n)=>{n.out.push(extra);return true;});
 const original=[...n.out],queue=n.out;
 n.out.splice=()=>{throw Error('discarded splice allocation');};
 assert.equal(sendOutboundTick(n,{},pack),true);
 assert.equal(n.out,queue);assert.equal(n.out.length,45);
 assert.equal(n.out[0],original[256]);assert.equal(n.out.at(-1),extra);
});
test('idle send preserves an event appended by the synchronous transport',()=>{
 const row={id:1};const {n}=fixture(0,(_w,n)=>{n.out.push(row);return true;});
 assert.equal(sendOutboundTick(n,{},pack),true);assert.equal(n.out[0],row);
});
test('backpressure or thrown send never consumes an event',()=>{
 for(const accept of [()=>false,()=>{throw Error('send failed');}]){
  const {n}=fixture(257,accept),original=[...n.out];
  assert.equal(sendOutboundTick(n,{},pack),false);assert.deepEqual(n.out,original);
  assert.equal(outboundQueueStatus(n).window,128);
 }
});
test('session replacement does not consume the captured prefix',()=>{
 const {n}=fixture(2,(_w,n)=>{n.s={match:n,tr:{broadcast:()=>true}};return true;}),original=[...n.out];
 assert.equal(sendOutboundTick(n,{},pack),false);assert.deepEqual(n.out,original);
});
test('prefix mutation still terminates with the original failure reason',()=>{
 const {n}=fixture(2,(_w,n)=>{n.out[0]={id:100};return true;});
 assert.equal(sendOutboundTick(n,{},pack),false);
 assert.equal(outboundQueueStatus(n).reason,'Outbound queue changed during send');
 assert.equal(n.out.length,0);
});
test('oversized one-row and empty snapshot refusals preserve fail-closed behavior',()=>{
 for(const count of [0,1]){
  const {n}=fixture(count,w=>{w[OUTBOUND_RECEIPT].reason='frame-too-large';return false;});
  assert.equal(sendOutboundTick(n,{},pack),false);assert.equal(outboundQueueStatus(n).failed,true);
 }
});
