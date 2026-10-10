import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

// Real NetMatch and full six-adapter composition. The injected event payload
// is deliberately malformed; an unmodified owner is not expected to send it.
async function receiver() {
  const f = await fixture({ network: true });
  const nm = f.makeNetMatch(f.makeSession('host','host'));
  f.bind(nm,[]);
  const played=[];
  nm._play=(id,e)=>played.push([id,e[0],e[2]]);
  return {f,nm,played,peer:()=>nm._peer('p2')};
}
const event=(when,seq)=>[when,'ev','test:valid',{},100,seq];
const packet=(ts,events,seq=100)=>({
  k:'t',ts,u:seq,r:2,a:[],e:events
});

test('#1200 one far-future event cannot poison a later due playback prefix',async()=>{
  const {nm,played,peer}=await receiver();
  nm.onMessage('p2',packet(1000,[event(1e12,1),event(999.95,2),event(999.96,3)]));
  const p=peer();
  assert.equal(p.events.length,2,'future timestamp rejected before FIFO admission');
  p.tr=1000;p.sim=100;
  nm._playEvents();
  assert.deepEqual(played.map(e=>e[1]),[999.95,999.96]);
  assert.equal(p.events.length,0);
});

test('#1200 legal owner event jitter is admitted in order, old/malformed event times are not',async()=>{
  const {nm,played,peer}=await receiver();
  nm.onMessage('p2',packet(1000,[
    event(999.9,1),event(1000.05,2),event(1000.5,3),
    event(996.5,4),event(Infinity,5),event(NaN,6)
  ]));
  const p=peer();
  assert.equal(p.events.length,2);
  p.tr=1000;p.sim=100;nm._playEvents();
  assert.deepEqual(played.map(x=>x[1]),[999.9]);
  p.tr=1000.1;nm._playEvents();
  assert.deepEqual(played.map(x=>x[1]),[999.9,1000.05]);
  nm.onMessage('p2',packet(1000.1,[event(1000.02,7),event(1000.04,8)],101));
  p.tr=1000.2;p.sim=101;nm._playEvents();
  assert.deepEqual(played.map(x=>x[1]),[999.9,1000.05,1000.02,1000.04]);
});

test('#1200 burst and stalled presentation clocks cannot retain an unbounded event backlog',async()=>{
  const {nm,peer}=await receiver();
  for(let tick=0;tick<7;tick++){
    const ts=1000+tick*.05;
    const events=Array.from({length:4500},(_,n)=>event(ts-.01,(tick*4500)+n+1));
    nm.onMessage('p2',packet(ts,events,100+tick));
    assert.ok(peer().events.length<=16384,'per-peer queue always bounded');
  }
  assert.equal(peer().events.length,16384);
  assert.ok(peer().events.at(-1)[0]>=1000.29,'most recent legal events survive');
  nm.onLeave('p2',false);
  assert.equal(nm.peers.has('p2'),false,'owner departure clears the queued event epoch');
});

test('#1200 bad shape does not crash tick routing or consume following packets',async()=>{
  const {nm,peer}=await receiver();
  nm.onMessage('p2',{k:'t',ts:1000,u:100,r:2,a:[],e:{not:'iterable'}});
  nm.onMessage('p2',packet(1000.05,[event(1000.01,7)],101));
  assert.equal(peer().events.length,1);
});
