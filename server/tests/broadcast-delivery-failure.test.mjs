import { webcrypto as _wc } from 'node:crypto';
if (!globalThis.crypto) {
  globalThis.crypto = {
    getRandomValues: _wc.getRandomValues.bind(_wc),
    randomUUID: _wc.randomUUID.bind(_wc),
    subtle: _wc.subtle,
  };
}
import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomDurableObject } from '../src/index.js';

// Native WebSocket close is asynchronous and has no nonstandard `closed` flag.
class Socket {
  constructor() { this.sent = []; this.closes = []; this.listeners = new Map(); this.bufferedAmount = 0; }
  accept() {}
  send(data) { this.sent.push(data); }
  close(code, reason) { this.closes.push({ code, reason }); }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  serializeAttachment(data) { this.attachment = structuredClone(data); }
  deserializeAttachment() { return this.attachment; }
  get id() { return JSON.parse(this.sent.find(data => data.startsWith('{"t":"welcome"'))).id; }
}

for (const failure of ['throw', 'backlog', 'close-throws']) {
  test(`broadcast removes a ${failure} recipient before asynchronous close notification`, async () => {
    const sockets = [];
    const state = { acceptWebSocket(ws) { sockets.push(ws); }, getWebSockets() { return sockets; } };
    const room = new RoomDurableObject(state, {});
    const host = new Socket(), sender = new Socket(), survivor = new Socket();
    for (const [socket, name] of [[host, 'host'], [sender, 'sender'], [survivor, 'survivor']]) room.handleSession(socket, name, true);
    const hostId = host.id;
    if (failure === 'backlog') host.bufferedAmount = 1024 * 1024;
    else host.send = () => { throw new Error('unavailable'); };
    if (failure === 'close-throws') host.close = () => { throw new Error('already closed'); };
    await room.webSocketMessage(sender, 'b|{"k":"s","t":1}');
    assert.equal(room.members.has(hostId), false, 'failed socket must not retain membership');
    assert.equal(room.hostId, sender.id, 'ownership migrates without waiting for close');
    assert.equal(host.attachment.closed, true, 'hibernation cannot restore the dead member');
    const leaves = () => survivor.sent.filter(data => data.startsWith('{"t":"leave"')).map(JSON.parse);
    assert.deepEqual(leaves(), [{ t: 'leave', id: hostId, host: sender.id }]);
    assert.ok(survivor.sent.includes(`m|${sender.id}|{"k":"s","t":1}`));
    if (failure !== 'close-throws') assert.ok(host.closes.some(close => close.code === 1013));
    await room.webSocketClose(host, 1006, '', false);
    assert.equal(leaves().length, 1, 'late close is idempotent');
    const restored = new RoomDurableObject(state, {});
    assert.deepEqual([...restored.members.keys()], [sender.id, survivor.id]);
    assert.equal(restored.hostId, sender.id);
  });
}

for (const failure of ['throw', 'backlog', 'close-throws']) test(`failed ${failure} pong retires host before asynchronous close`, async()=>{
 const sockets=[],state={acceptWebSocket(ws){sockets.push(ws);},getWebSockets(){return sockets;}};
 const room=new RoomDurableObject(state,{}),host=new Socket(),guest=new Socket();
 room.handleSession(host,'host',true);room.handleSession(guest,'guest',true);const id=host.id;
 if(failure==='backlog')host.bufferedAmount=1024*1024;
 else host.send=()=>{throw Error('offline');};
 if(failure==='close-throws')host.close=()=>{throw Error('offline');};
 await room.webSocketMessage(host,'ping');
 assert.equal(room.members.has(id),false);assert.equal(room.hostId,guest.id);assert.equal(host.attachment.closed,true);
 await room.webSocketClose(host,1006,'',false);
 assert.equal(guest.sent.filter(x=>x.startsWith('{"t":"leave"')).length,1);
 const restored=new RoomDurableObject(state,{});assert.equal(restored.members.has(id),false);
});

test('rejected upgrades consume the room join budget before socket allocation and do not double charge successful joins',async()=>{
 const savedPair=globalThis.WebSocketPair,savedResponse=globalThis.Response;
 let pairs=0;
 globalThis.WebSocketPair=class{constructor(){pairs++;this[0]=new Socket();this[1]=new Socket();}};
 globalThis.Response=class{constructor(body,init={}){this.body=body;Object.assign(this,init);}};
 try{
  const room=new RoomDurableObject({},{});room.compat='test-compat-123';
  const host=new Socket();room.handleSession(host,'host');room.locked=true;
  const request=new Request('https://relay.example/room/BBBBB?v=2&compat=test-compat-123',{headers:{Upgrade:'websocket'}});
  room.joinBudgetAt=Date.now();room.joinsLeft=2;
  assert.equal((await room.fetch(request)).status,101);
  assert.equal((await room.fetch(request)).status,101);
  assert.equal((await room.fetch(request)).status,429);assert.equal(pairs,2);
  room.locked=false;room.joinsLeft=1;room.joinBudgetAt=Date.now();
  assert.equal((await room.fetch(request)).status,101);assert.equal(room.members.size,2);
  assert.ok(room.joinsLeft<.1,'one allocation consumes exactly one token');
 }finally{if(savedPair===undefined)delete globalThis.WebSocketPair;else globalThis.WebSocketPair=savedPair;globalThis.Response=savedResponse;}
});


test('same socket re-admission preserves spent byte/frame budget without conflating independent connections',()=>{
 const room=new RoomDurableObject({},{}),ws=new Socket();room.handleSession(ws,'one');
 const first=room._memberBySocket(ws);first.framesLeft=2;first.bytesLeft=12;
 room.handleSession(ws,'again');assert.equal(room.members.size,1);assert.equal(room._memberBySocket(ws),first);
 room._cleanupMember(first.id,ws);room.handleSession(ws,'rejoin');
 const next=room._memberBySocket(ws);assert.notEqual(next.id,first.id);assert.equal(next.framesLeft,2);assert.equal(next.bytesLeft,12);assert.equal(next.budgetAt,first.budgetAt);
 const other=new Socket();room.handleSession(other,'one');assert.ok(room._memberBySocket(other).bytesLeft>12);
});

for(const mode of ['bytes','frames']) test(`room ${mode} envelope preserves all eight lawful bursts but survives socket churn and hibernation`,t=>{
 let now=10000;t.mock.method(Date,'now',()=>now);
 const sockets=[],state={acceptWebSocket(ws){sockets.push(ws);},getWebSockets(){return sockets;}};
 const room=new RoomDurableObject(state,{});
 for(let i=0;i<8;i++)room.handleSession(new Socket(),`p${i}`,true);
 const prefix='b|{"k":"s","pad":"',suffix='"}';
 const data=mode==='bytes'?prefix+'x'.repeat(65536-prefix.length-suffix.length)+suffix:'ping';
 const count=mode==='bytes'?8:160;
 for(const ws of sockets)for(let i=0;i<count;i++)room._handleMessage(ws.id,ws,data);
 assert.equal(room.members.size,8,'all existing permitted sockets retain their complete burst');
 assert.equal(mode==='bytes'?room.roomBytesLeft:room.roomFramesLeft,0);
 const old=sockets[7];room._cleanupMember(old.id,old);
 const fresh=new Socket();room.handleSession(fresh,'rejoined',true);
 assert.equal(room.members.size,8);room._handleMessage(fresh.id,fresh,data);
 assert.equal(room.members.has(fresh.id),false,'fresh socket cannot replenish the room envelope');
 const restored=new RoomDurableObject(state,{});
 assert.equal(mode==='bytes'?restored.roomBytesLeft:restored.roomFramesLeft,0,'latest host attachment retains guest spending');
 now+=1000;
 const after=new Socket();restored.handleSession(after,'after refill',true);
 restored._handleMessage(after.id,after,data);
 assert.equal(restored.members.has(after.id),true,'the unchanged rate replenishes the shared envelope');
 assert.ok((mode==='bytes'?restored.roomBytesLeft:restored.roomFramesLeft)>0);
});
