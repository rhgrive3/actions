import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {ownerClockRelayPayload,ownerClockRelayProbe} from '../lib/inkwave-owner-clock-browser.mjs';
import {createLocalRelay} from '../lib/inkwave-local-relay-fixture.mjs';

test('clock probe reads legacy and relay-stamped frames without trusting payload timestamp fields',()=>{
  const data={k:'t',ts:2,forwardedAt:900000};
  assert.deepEqual(ownerClockRelayPayload('m|peer|'+JSON.stringify(data)),{from:'peer',data,forwardedAt:null});
  assert.deepEqual(ownerClockRelayPayload('m|peer|@12345|'+JSON.stringify(data)),{from:'peer',data,forwardedAt:12345});
  for(const text of ['m|peer|@-1|{}','m|peer|@1.1|{}','m|peer|@9007199254740992|{}','m|peer|@12','m|peer|@12|bad','x|peer|{}'])assert.equal(ownerClockRelayPayload(text),null);
});

class Socket extends EventEmitter{
  constructor(){super();this.readyState=1;this.sent=[];}
  send(text){this.sent.push(text);}
  close(){if(this.readyState!==1)return;this.readyState=3;this.emit('close');}
  get welcome(){return this.sent.map(t=>{try{return JSON.parse(t);}catch{return null;}}).find(x=>x?.t==='welcome');}
}
test('real production relay stamped ticks are held and released byte-for-byte in both directions',async()=>{
  const relay=new EventEmitter(),probe=ownerClockRelayProbe(relay),connect=createLocalRelay(),sockets=[];
  try{
    for(const [name,create] of [['Host',true],['Peer',false]]){
      const ws=new Socket(),req={url:'/room/BCEFG?v=2&compat=owner-clock-probe&relayClock=1&name='+name+(create?'&create=1':''),method:'GET',headers:{upgrade:'websocket'}};
      sockets.push(ws);relay.emit('connection',ws,req);assert.equal((await connect(ws,req)).accepted,true);
      assert.equal(ws.welcome.relayClock,1);
    }
    const counts=sockets.map(s=>s.sent.length);probe.arm('stamped-backlog');
    for(const ts of [1,2])for(const ws of sockets)ws.emit('message','b|'+JSON.stringify({k:'t',ts,u:ts*60,a:[]}));
    const gate=probe.describe();assert.equal(gate.peers.length,2);assert.ok(gate.peers.every(p=>p.firstTs===1&&p.lastTs===2&&p.ticks===2));
    sockets.forEach((s,i)=>assert.equal(s.sent.length,counts[i],'no queued tick delivered early'));
    assert.equal(probe.wire.filter(r=>r.kind==='t').length,4);assert.ok(probe.wire.every(r=>Number.isSafeInteger(r.forwardedAt)));
    probe.releaseFirst();probe.releaseLatest();
    sockets.forEach((s,i)=>{
      const frames=s.sent.slice(counts[i]);assert.equal(frames.length,2);
      assert.deepEqual(frames.map(t=>ownerClockRelayPayload(t).data.ts),[1,2]);
      const side=gate.peers.find(p=>p.destination===(i===0?'Host':'Peer'));
      const hash=t=>createHash('sha256').update(t).digest('hex');
      assert.equal(hash(frames[0]),side.firstSha256);assert.equal(hash(frames[1]),side.lastSha256);
    });
  }finally{for(const s of sockets)s.close();}
});
