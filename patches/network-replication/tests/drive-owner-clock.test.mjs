import test from 'node:test';
import assert from 'node:assert/strict';
import { beginOwnerClock, handleOwnerClockMessage, validOwnerClockTick, ownerClockStatus } from '../owner-clock.mjs';

function harness() {
  let at=100, receipt=null;
  const sent=[],accepted=[];
  const nm={myId:'local',cfg:{id:'room'},match:{},peers:new Map(),s:{ownerClockVersion:1,
    _members:new Map([['local',{}],['peer',{}]]),tr:{_relayClock:true,
      relayReceipt:from=>from==='peer'?receipt:null,sendTo(to,data){sent.push({to,data});return true;}}}};
  nm.onMessage=(from,d)=>{
    if(handleOwnerClockMessage(nm,from,d,at)||d.k!=='t')return;
    let previous=nm.peers.get(from);
    if(!validOwnerClockTick(nm,from,d,at,previous))return;
    if(!previous){previous={};nm.peers.set(from,previous);}
    previous.lastTs=d.ts;previous.lastReceiveAt=at;accepted.push(d.ts);
  };
  const dispatch=(d,stamp)=>{const old=receipt;receipt=stamp;try{nm.onMessage('peer',d);}finally{receipt=old;}};
  return {nm,accepted,sent,set:t=>{at=t;},begin:()=>beginOwnerClock(nm,at),
    tick:(ts,stamp,extra={})=>dispatch({k:'t',oc:1,ocm:'room',ts,...extra},stamp),
    reply:(ts,stamp)=>dispatch({...sent.filter(x=>x.data.k==='ocq').at(-1).data,k:'oca',ts},stamp),
    status:()=>ownerClockStatus(nm,'peer')};
}

for(const origin of [1000,1005,200000,30000000,31536000])for(const queued of [false,true])
test(`authenticated relay bounds ${queued?'queued':'post-ACK'} ticks despite claimed origin ${origin}`,()=>{
  const h=harness();h.begin();
  if(queued)h.tick(1000,1700000000000);
  h.set(100.01);h.reply(origin,1700000000010);
  if(!queued)h.tick(1000,1700000000020);
  assert.deepEqual(h.accepted,[1000]);
  const before=h.status();
  h.set(100.03);h.tick(200000,1700000000030,{relayAt:9999999999999});
  assert.deepEqual(h.accepted,[1000],'sender JSON and a true nonce do not mint forward-clock credit');
  h.set(100.1);h.tick(1000.1,1700000000100);
  assert.deepEqual(h.accepted,[1000,1000.1],'a rejected future leap does not poison the replay watermark');
  assert.deepEqual(h.status().origin,before.origin);assert.deepEqual(h.status().relayAnchor,before.relayAnchor);
});

test('each staged wire keeps its original receipt across ACK replay and a legitimate startup drain',()=>{
  const h=harness();h.begin();
  h.tick(1000,1700000000000);h.tick(1020,1700000020000);
  assert.equal(h.status().pendingPackets,2);
  h.reply(1020,1700000020001);
  assert.deepEqual(h.accepted,[1000,1020],'replay must not stamp both old wires with the ACK time');
  assert.deepEqual(h.status().relayAnchor,{timestamp:1000,receipt:1700000000});
  h.set(150);h.tick(1070,1700000070000);
  assert.deepEqual(h.accepted,[1000,1020,1070]);
  for(let i=1;i<=50;i++){h.set(150+i*.05);h.tick(1070+i*4,1700000070000+i*50);}
  assert.ok(h.nm.peers.get('peer').lastTs<=1077.5,'fixed relay origin cannot accumulate grace per packet');
});

test('negotiated transports reject missing stamps and cannot downgrade an established relay origin',()=>{
  const h=harness();h.begin();h.tick(1000,null);assert.equal(h.status().pendingPackets,0);
  h.reply(1000,1700000000000);h.tick(1000,1700000000001);
  h.nm.s.tr._relayClock=false;h.tick(1001,null);assert.deepEqual(h.accepted,[1000]);
  h.tick(1001,1700000001001);assert.deepEqual(h.accepted,[1000,1001]);
});
