import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
const { NetMatch } = await fixture();

const sent=[];
const attacker={nid:7,owner:'shooter',remote:false};
const victim={nid:4,owner:'host',alive:true,remote:true};
const message={k:'hit',v:4,a:7,d:36,w:'shooter',seq:2};
const mock={
  myId:'shooter', byNid:new Map([[4,victim],[7,attacker]]),
  s:{tr:{sendTo:(to,packet)=>sent.push([to,packet])}},
  hitPending:new Map([[2,{message,oldOwner:'departed'}]]),
  _hit:()=>{throw Error('host should own new victim');},
};
NetMatch.prototype._hitNack.call(mock,{seq:2,to:'departed'});
assert.equal(sent.length,1);
assert.equal(sent[0][0],'host');
assert.strictEqual(sent[0][1],message);
assert.equal(mock.hitPending.size,0);
// Redelivery is idempotent; unrelated/stale ACK does nothing.
NetMatch.prototype._hitNack.call(mock,{seq:2,to:'departed'});
assert.equal(sent.length,1);
mock.hitPending.set(3,{message:{...message,seq:3},oldOwner:'departed'});
NetMatch.prototype._hitNack.call(mock,{seq:3,to:'different'});
assert.equal(sent.length,1);
console.log('Handoff hit negative-ACK retry tests passed');
