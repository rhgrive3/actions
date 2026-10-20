import test from 'node:test';
import assert from 'node:assert/strict';
const now=Date.now;
const { RoomDurableObject, advanceMillis } = await import('./hidden-host-harness.mjs');
assert.equal(Date.now,now,'loading the relay fixture must preserve the process clock');

class Socket {
  constructor(){this.sent=[];this.handlers=new Map();this.closed=null;}
  send(data){this.sent.push(data);}
  addEventListener(name,fn){this.handlers.set(name,fn);}
  receive(data){if(!this.closed)this.handlers.get('message')?.({data});}
  close(code,reason){if(this.closed)return;this.closed={code,reason};this.handlers.get('close')?.();}
}
function pair(){
  const relay=new RoomDurableObject({},{}),host=new Socket(),guest=new Socket();
  relay.handleSession(host,'host');relay.handleSession(guest,'guest');
  const guestId=JSON.parse(guest.sent.find(data=>data.startsWith('{')&&JSON.parse(data).t==='welcome')).id;
  return {relay,host,guest,guestId,forwarded:()=>host.sent.filter(data=>data.startsWith('m|')).length};
}
const state='b|{"k":"s"}';

test('#878 relay and client fixture clocks allow real 20 Hz traffic for 120 seconds',()=>{
  const h=pair();
  const start=h.relay.members.get(h.guestId).budgetAt;assert(Number.isFinite(start));
  for(let i=0;i<2400;i++){advanceMillis(50);h.guest.receive(state);}
  assert.equal(h.guest.closed,null);assert.equal(h.forwarded(),2400);
  assert.equal(h.relay.members.get(h.guestId).budgetAt,start+120000);
  assert.equal(Date.now,now,'server fixture does not patch the process clock');
});
test('#878 shared clock still rejects the 161st same-instant frame',()=>{
  const h=pair();for(let i=0;i<160;i++)h.guest.receive(state);
  assert.equal(h.guest.closed,null);assert.equal(h.forwarded(),160);
  h.guest.receive(state);
  assert.deepEqual(h.guest.closed,{code:1008,reason:'Relay traffic limit'});
  assert.equal(h.forwarded(),160);assert(!h.relay.members.has(h.guestId));
});
test('#878 one elapsed second refills exactly 80 frame permits',()=>{
  const h=pair();for(let i=0;i<160;i++)h.guest.receive(state);
  advanceMillis(1000);for(let i=0;i<80;i++)h.guest.receive(state);
  assert.equal(h.guest.closed,null);assert.equal(h.forwarded(),240);
  h.guest.receive(state);assert.equal(h.guest.closed?.code,1008);assert.equal(h.forwarded(),240);
});
test('#878 shared clock retains byte and maximum-frame rejection',()=>{
  const h=pair(),payload='b|'+JSON.stringify({k:'s',data:'x'.repeat(32*1024)});
  const size=new TextEncoder().encode(payload).length,accepted=Math.floor(512*1024/size);
  for(let i=0;i<accepted;i++)h.guest.receive(payload);
  assert.equal(h.guest.closed,null);assert.equal(h.forwarded(),accepted);
  h.guest.receive(payload);assert.equal(h.guest.closed?.code,1008);assert.equal(h.forwarded(),accepted);
  const large=pair();large.guest.receive('b|'+JSON.stringify({k:'s',data:'x'.repeat(64*1024)}));
  assert.deepEqual(large.guest.closed,{code:1009,reason:'Message too large'});assert.equal(large.forwarded(),0);
});
