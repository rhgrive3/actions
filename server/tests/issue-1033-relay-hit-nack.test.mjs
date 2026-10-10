import assert from 'node:assert/strict';
import { RoomDurableObject } from '../src/index.js';
class FakeSocket {
  constructor(){this.sent=[];this.listeners=new Map();}
  send(x){this.sent.push(x);}
  addEventListener(k,f){this.listeners.set(k,f);}
  emit(k,data){this.listeners.get(k)?.({data});}
  id(){return JSON.parse(this.sent.find(x=>x.startsWith('{"t":"welcome"'))).id;}
}
const room=new RoomDurableObject({},{});
const host=new FakeSocket(),shooter=new FakeSocket(),victim=new FakeSocket();
room.handleSession(host,'host');
room.handleSession(shooter,'shooter');
room.handleSession(victim,'victim');
const target=victim.id(),origin=shooter.id();
const hit={k:'hit',seq:16,v:4,a:7,d:36,w:'shooter'};
shooter.emit('message',`s|${target}|${JSON.stringify(hit)}`);
assert.ok(victim.sent.includes(`m|${origin}|${JSON.stringify(hit)}`),'live victim receives once');
assert.equal(shooter.sent.some(x=>x.startsWith('m|__relay__|')),false);
victim.emit('close');
const afterLeave=shooter.sent.length;
shooter.emit('message',`s|${target}|${JSON.stringify(hit)}`);
assert.equal(shooter.sent.length,afterLeave+1);
assert.deepEqual(JSON.parse(shooter.sent.at(-1).slice('m|__relay__|'.length)),
  {k:'hit_nack',seq:16,to:target});
const afterNack=shooter.sent.length;
shooter.emit('message',`s|${target}|${JSON.stringify({k:'t',seq:18})}`);
assert.equal(shooter.sent.length,afterNack,'unrelated dead-owner messages are not retried');
console.log('Live/removed owner hit delivery and relay negative-ACK pass');
