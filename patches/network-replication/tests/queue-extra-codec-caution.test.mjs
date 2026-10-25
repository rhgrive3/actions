import test from 'node:test';
import assert from 'node:assert/strict';
import {PaintPacketNegotiation,decodePaintEvents} from '../../splatoon3/runtime/paint-packet-codec.mjs';

test('single paint does not prove codec attempt is redundant for a nested row serializer',()=>{
 const n=new PaintPacketNegotiation(()=> 'a'.repeat(32));n.sync('epoch','a',['a','b']);
 const peer=n.members.get('b');peer.received=true;peer.peerNonce=peer.ackNonce='b'.repeat(32);
 const paint=[1,'s',0,0,0,1,0,.2,0,0,0,0,0,1,['inkwave-paint-order-v1','epoch',1,0],1,1];
 const event=[1,'ev','small'];
 Object.defineProperty(event,'toJSON',{value:()=>[1,'ev','x'.repeat(60000)]});
 const tick={k:'t',ts:1,e:[paint,event]},out=n.packTick(tick);
 assert.ok(out.pe,'current encoder strips row-only properties and can prefer the dictionary even with one paint');
 assert.notEqual(JSON.stringify(out),JSON.stringify(tick),'unconditional one-paint return would change existing wire');
 assert.deepEqual(decodePaintEvents(out.pe),[paint,[1,'ev','small']]);
});
