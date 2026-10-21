import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomDurableObject} from '../src/index.js';

const max=64*1024;
const oracle=s=>Math.min(max+1,new TextEncoder().encode(s).length);
function samples(){
 const values=['','ping','日本語','😀','a\ud800b','\udc00','\ud800\ud800\udc00','a'.repeat(max),'日'.repeat(max/3|0)+'a','😀'.repeat(max/4),'😀'.repeat(max/4)+'x','日'.repeat(30000)];
 for(let i=0;i<65536;i++)values.push(String.fromCharCode(i));
 let seed=123;
 for(let i=0;i<400;i++){let v='';for(let j=0;j<23;j++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;v+=String.fromCharCode(seed&65535);}values.push(v);}
 return values;
}
test('UTF-8 quota is exact for every single code unit, surrogate pairs, fuzz and 64KiB boundaries',()=>{
 const r=new RoomDurableObject({},{}),inputs=samples();
 for(const s of inputs)assert.equal(r._frameBytes(s),oracle(s));
 const buffer=r._utf8Scratch;assert.equal(buffer.byteLength,max);
 for(let i=0;i<500;i++){assert.equal(r._frameBytes('日本語😀'),13);assert.equal(r._utf8Scratch,buffer);}
});
test('no encode-sized allocation per packet; oversized UTF-16 is rejected before scratch allocation',()=>{
 const r=new RoomDurableObject({},{});assert.equal(r._utf8Scratch,undefined);
 assert.equal(r._frameBytes('a'.repeat(max+1)),max+1);assert.equal(r._utf8Scratch,undefined);
 const old=TextEncoder.prototype.encode;
 try {TextEncoder.prototype.encode=()=>{throw Error('full allocation forbidden');};for(let i=0;i<500;i++)assert.equal(r._frameBytes('abc😀'),7);}finally{TextEncoder.prototype.encode=old;}
});
test('fallback without encodeInto preserves all UTF-8 byte boundaries and has no scratch allocation',()=>{
 const inputs=samples(),expected=inputs.map(oracle),old=TextEncoder.prototype.encodeInto;
 const r=new RoomDurableObject({},{});
 try{TextEncoder.prototype.encodeInto=undefined;for(let i=0;i<inputs.length;i++)assert.equal(r._frameBytes(inputs[i]),expected[i]);}
 finally{TextEncoder.prototype.encodeInto=old;}
 assert.equal(r._utf8Scratch,undefined);
});
class WorkerSocket {
 constructor(){this.readyState=1;this.sent=[];this.bufferedAmount=0;this.attachment=null;}
 send(s){if(this.readyState!==1)throw Error('not open');this.sent.push(s);}
 close(code){this.code=code;this.readyState=2;} // real close event is asynchronous
 serializeAttachment(v){this.attachment=structuredClone(v);}
 deserializeAttachment(){return structuredClone(this.attachment);}
 get id(){return JSON.parse(this.sent.find(x=>x.startsWith('{"t":"welcome"'))).id;}
}
function room(){const sockets=[];const state={acceptWebSocket(s){sockets.push(s);},getWebSockets(){return sockets;}};const r=new RoomDurableObject(state,{});r.compat='iw-gameplay-20261020-r3';const h=new WorkerSocket(),g=new WorkerSocket();r.handleSession(h,'H',true);r.handleSession(g,'G',true);return{r,h,g,state};}
for(const directed of [false,true])test(`${directed?'directed':'broadcast'} closing host is removed before delayed close callback and never resurrected`,async()=>{
 const {r,h,g,state}=room(),id=h.id;h.bufferedAmount=1024*1024;
 await r.webSocketMessage(g,directed?`s|${id}|{"k":"s"}`:'b|{"k":"s"}');
 assert.equal(h.readyState,2);assert.equal(h.code,1013);assert.equal(r.members.has(id),false);
 assert.equal(r.hostId,g.id);assert.deepEqual(h.attachment,{closed:true});
 const count=g.sent.filter(x=>x.startsWith('{"t":"leave"')).length;assert.equal(count,1);
 await r.webSocketClose(h,1000,'later',true);
 assert.equal(g.sent.filter(x=>x.startsWith('{"t":"leave"')).length,count);
 const restored=new RoomDurableObject(state,{});assert.equal(restored.members.size,1);assert.equal(restored.hostId,g.id);
});
test('closed socket send failure is retired; an open throwing socket is not falsely reported disconnected',async()=>{
 const {r,h,g}=room();h.readyState=3;await r.webSocketMessage(g,'b|{"k":"s"}');assert.equal(r.members.has(h.id),false);
 const b=room();b.h.send=()=>{throw Error('transient');};await b.r.webSocketMessage(b.g,'b|{"k":"s"}');assert.equal(b.r.members.has(b.h.id),true);
});
test('multibyte exact-limit packet admits and one-byte overflow closes without forwarding',async()=>{
 const {r,h,g}=room();const before='b|{"k":"s","v":"',after='"}';const pad=max-before.length-after.length;
 const s=before+'日'.repeat(Math.floor(pad/3))+'a'.repeat(pad%3)+after;
 assert.equal(new TextEncoder().encode(s).length,max);await r.webSocketMessage(g,s);assert.equal(g.readyState,1);assert.ok(h.sent.some(x=>x.startsWith(`m|${g.id}|`)));
 const count=h.sent.filter(x=>x.startsWith('m|')).length;
 await r.webSocketMessage(g,s+' ');assert.equal(g.code,1009);assert.equal(h.sent.filter(x=>x.startsWith('m|')).length,count);
});
