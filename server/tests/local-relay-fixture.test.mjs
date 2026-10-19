import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createLocalRelay} from '../../scripts/lib/inkwave-local-relay-fixture.mjs';
const compat='iw-gameplay-20261019-r2';
class Socket extends EventEmitter {
 constructor(){super();this.sent=[];this.readyState=1;this.bufferedAmount=0;}
 send(text){this.sent.push(text);}
 close(code,reason){if(this.readyState!==1)return;this.readyState=3;this.closed={code,reason};this.emit('close');}
 get welcome(){return this.sent.map(x=>{try{return JSON.parse(x);}catch{return null;}}).find(x=>x?.t==='welcome');}
}
const req=(code='BCEFG',token=compat,create=false,v=2)=>({url:`/room/${code}?v=${v}&compat=${token}&name=Local${create?'&create=1':''}`,method:'GET',headers:{upgrade:'websocket'}});
test('Node shim restores all globals synchronously and uses real fetch admission across simultaneous joins',async()=>{
 const rooms=new Map(),connect=createLocalRelay({rooms}),Response=globalThis.Response,Pair=globalThis.WebSocketPair;
 const host=new Socket(),hp=connect(host,req('BCEFG',compat,true));assert.equal(globalThis.Response,Response);assert.equal(globalThis.WebSocketPair,Pair);
 const peer=new Socket(),pp=connect(peer,req());assert.equal(globalThis.Response,Response);assert.equal(globalThis.WebSocketPair,Pair);
 assert.deepEqual(await hp,{status:101,accepted:true});assert.deepEqual(await pp,{status:101,accepted:true});assert.equal(rooms.size,1);assert.equal(rooms.get('BCEFG').members.size,2);
 assert.equal(host.welcome.proto,2);assert.equal(peer.welcome.compat,compat);
 const wrong=new Socket();assert.equal((await connect(wrong,req('BCEFG','iw-gameplay-other000'))).status,409);assert.equal(wrong.welcome,undefined);assert.equal(rooms.get('BCEFG').members.size,2);
 const old=new Socket();assert.equal((await connect(old,req('BCEFG',compat,false,1))).status,426);assert.equal(old.welcome,undefined);
 const invalid=new Socket();assert.equal((await connect(invalid,req('WRONG',compat,true))).status,400);assert.equal(rooms.size,1);
 host.emit('message','b|'+JSON.stringify({k:'start',proto:2,compat}));assert(peer.sent.some(x=>x.startsWith('m|'+host.welcome.id+'|')));
 host.close(1000,'leave');assert.equal(rooms.get('BCEFG').hostId,peer.welcome.id);assert.equal(rooms.get('BCEFG').compat,compat);
 const next=new Socket();assert.equal((await connect(next,req())).accepted,true);peer.close();next.close();assert.equal(rooms.get('BCEFG').members.size,0);assert.equal(rooms.get('BCEFG').compat,null);
 assert.equal(globalThis.Response,Response);assert.equal(globalThis.WebSocketPair,Pair);
});
test('production lock/full/not-found and oversize close still operate through the shim',async()=>{
 const rooms=new Map(),connect=createLocalRelay({rooms}),missing=new Socket();assert.equal((await connect(missing,req())).accepted,false);assert.equal(missing.welcome,undefined);assert.match(JSON.parse(missing.sent[0]).e,/Room not found/);
 const h=new Socket();await connect(h,req('BCEFG',compat,true));h.emit('message',JSON.stringify({t:'lock',v:true}));const locked=new Socket();assert.equal((await connect(locked,req())).accepted,false);assert.match(JSON.parse(locked.sent[0]).e,/Match in progress/);
 h.emit('message',JSON.stringify({t:'lock',v:false}));const guests=[];for(let i=0;i<7;i++){const g=new Socket();guests.push(g);assert.equal((await connect(g,req())).accepted,true);}
 const full=new Socket();assert.equal((await connect(full,req())).accepted,false);assert.match(JSON.parse(full.sent[0]).e,/Room is full/);
 const before=h.sent.filter(x=>x.startsWith('m|')).length;guests[0].emit('message','b|'+JSON.stringify({k:'state',data:'x'.repeat(70*1024)}));assert.equal(guests[0].closed.code,1009);assert.equal(h.sent.filter(x=>x.startsWith('m|')).length,before);assert.equal(rooms.get('BCEFG').members.size,7);
 h.close();for(const g of guests)g.close();
});
test('delayed welcome and dropped connecting socket retain cleanup without a global leak',async()=>{
 const rooms=new Map(),connect=createLocalRelay({rooms}),h=new Socket(),held=[];
 assert.equal((await connect(h,req('BCEFG',compat,true),{send:(text,deliver)=>held.push(()=>deliver(text))})).accepted,true);assert.equal(h.sent.length,0);held.shift()();assert(h.welcome);
 const gone=new Socket(),p=connect(gone,req());gone.close();assert.equal((await p).accepted,false);assert.equal(rooms.get('BCEFG').members.size,1);h.close();assert.equal(rooms.get('BCEFG').members.size,0);
});

test('explicit source Worker is used and thrown fetch restores platform globals',async()=>{
 const before={Response:globalThis.Response,WebSocketPair:globalThis.WebSocketPair};let calls=0;
 const connect=createLocalRelay({worker:{default:{fetch(){calls++;throw new Error('Injected source failure');}}}}),socket=new Socket();
 const promise=connect(socket,req());assert.equal(globalThis.Response,before.Response);assert.equal(globalThis.WebSocketPair,before.WebSocketPair);await assert.rejects(promise,/Injected source failure/);assert.equal(calls,1);socket.close();
});
