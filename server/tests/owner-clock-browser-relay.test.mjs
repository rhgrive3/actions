import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {ownerClockRelayProbe} from '../../scripts/lib/inkwave-owner-clock-browser.mjs';

class Socket extends EventEmitter{
  constructor(){super();this.readyState=1;this.frames=[];}
  send(text){this.frames.push(text);}
}
const tick=(from,ts)=>'m|'+from+'|'+JSON.stringify({k:'t',oc:1,ocm:'epoch',ts,u:120,e:[[ts,'tr',1,'spawn',{},120,1]]});
test('owner clock browser relay preserves proof controls and native wire bytes while isolating the delayed-first fault',()=>{
  const server=new EventEmitter(),probe=ownerClockRelayProbe(server),host=new Socket(),guest=new Socket();
  server.emit('connection',host,{url:'/?name=Host'});server.emit('connection',guest,{url:'/?name=Guest'});
  const request='m|B|'+JSON.stringify({k:'ocq',v:1,m:'epoch',n:'a'.repeat(32)});
  const reply='m|A|'+JSON.stringify({k:'oca',v:1,m:'epoch',n:'a'.repeat(32),ts:50});
  probe.arm('cold');host.send(request);guest.send(reply);
  assert.deepEqual(host.frames,[request]);assert.deepEqual(guest.frames,[reply]);
  for(const ts of [50,51,52,57]){host.send(tick('B',ts));guest.send(tick('A',ts+20));}
  assert.equal(host.frames.length,1);assert.equal(guest.frames.length,1);
  const held=probe.releaseFirst();
  assert(held.peers.every(p=>p.discardedIntermediate===2&&p.ticks===4));
  assert.equal(host.frames[1],tick('B',50));assert.equal(guest.frames[1],tick('A',70));
  // A control may arrive after the first delayed tick, before latest release.
  host.send(request);assert.equal(host.frames[2],request);
  probe.releaseLatest();
  assert.equal(host.frames[3],tick('B',57));assert.equal(guest.frames[2],tick('A',77));
  host.send(tick('B',58));assert.equal(host.frames.at(-1),tick('B',58));
  probe.arm('rematch');host.send(tick('B',80));guest.send(tick('A',100));
  probe.releaseFirst();probe.releaseLatest();
  assert.equal(host.frames.filter(frame=>frame===tick('B',80)).length,1,'single queued packet is never duplicated');
  assert.equal(probe.wire.filter(row=>row.kind==='ocq').length,2);
  assert.equal(probe.wire.filter(row=>row.kind==='oca').length,1);
  assert.equal(probe.gates.length,2);
});
