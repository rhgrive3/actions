import test from 'node:test';
import assert from 'node:assert/strict';
import { pair } from './hidden-host-harness.mjs';

test('hidden-host bridge uses real Transport boolean acceptance for broadcast and directed delivery', async () => {
 const p=await pair();try {
  const tr=p.host.s.tr,before=p.guest.socket.sent.length;
  assert.ok(tr instanceof p.host.f.Transport);
  assert.equal(tr.broadcast,p.host.f.Transport.prototype.broadcast);
  assert.equal(tr.sendTo,p.host.f.Transport.prototype.sendTo);
  assert.equal(tr.broadcast({k:'transport-probe'}),true);
  assert.equal(tr.sendTo(p.guest.s.myId,{k:'transport-probe'}),true);
  assert.equal(p.guest.socket.sent.length-before,2);
 } finally { p.close(); }
});

test('hidden-host bridge retains real backpressure, UTF-8 size and socket-throw rejection', async () => {
 const p=await pair();try {
  const tr=p.host.s.tr,ws=tr.ws,before=p.guest.socket.sent.length;
  ws.bufferedAmount=512*1024+1;
  assert.equal(tr.broadcast({k:'transport-probe'}),false);
  assert.equal(tr.sendTo(p.guest.s.myId,{k:'transport-probe'}),false);
  ws.bufferedAmount=0;
  const oversized={k:'transport-probe',payload:'界'.repeat(23000)};
  assert.equal(tr.broadcast(oversized),false);
  assert.equal(tr.sendTo(p.guest.s.myId,oversized),false);
  assert.equal(p.guest.socket.sent.length,before);
  const send=ws.send;
  try {
   ws.send=()=>{throw new Error('controlled socket send failure');};
   assert.throws(()=>tr.broadcast({k:'transport-probe'}),/controlled socket send failure/);
   assert.throws(()=>tr.sendTo(p.guest.s.myId,{k:'transport-probe'}),/controlled socket send failure/);
  } finally { ws.send=send; }
  assert.equal(p.guest.socket.sent.length,before);
  assert.equal(tr.broadcast({k:'transport-probe'}),true);
  assert.equal(p.guest.socket.sent.length,before+1);
 } finally { p.close(); }
});

test('closed hidden-host socket is refused before delivery by the real Transport', async () => {
 const p=await pair();try {
  const tr=p.host.s.tr;
  p.host.socket.close();
  const before=p.guest.socket.sent.length;
  assert.equal(tr.open,false);
  assert.equal(tr.broadcast({k:'transport-probe'}),false);
  assert.equal(tr.sendTo(p.guest.s.myId,{k:'transport-probe'}),false);
  assert.equal(p.guest.socket.sent.length,before);
 } finally { p.close(); }
});

test('hidden-host relay links real appearance admission and rejects malformed styles without weakening Transport acceptance', async()=>{
 // Appearance ('me') is host-directed control: the relay delivers it only to
 // the host, so the guest is the sender here and the host is the recipient.
 const p=await pair();try{
  const tr=p.guest.s.tr,host=p.host.s.myId,before=p.host.socket.sent.length;
  for(const style of [{hair:'1'},[],{constructor:{}},{hat:{}}]){
   assert.equal(tr.broadcast({k:'me',style}),true,'Transport accepted frame, relay owns semantic rejection');
   assert.equal(tr.sendTo(host,{k:'me',style}),true);
   assert.equal(p.host.socket.sent.length,before,'malformed appearance never reaches peer');
  }
  assert.equal(p.guest.socket.live,true);assert.equal(p.relay.members.size,2);
  const style={hair:1,skin:-2,hat:1000};
  assert.equal(tr.broadcast({k:'me',style}),true);
  assert.equal(tr.sendTo(host,{k:'me',style}),true);
  assert.equal(p.host.socket.sent.length,before+2,'finite styles still pass both relay routes');
  for(const message of p.host.socket.sent.slice(before)){
   const payload=JSON.parse(message.slice(message.indexOf('|',2)+1));
   assert.deepEqual(payload,{k:'me',style});
  }
  const guestBefore=p.guest.socket.sent.length;assert.equal(p.host.s.tr.broadcast({k:'me',style}),true);
  assert.equal(p.guest.socket.sent.length,guestBefore,'host appearance is not relayed as host-directed control');
 }finally{p.close();}
});
