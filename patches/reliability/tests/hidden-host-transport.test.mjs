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
