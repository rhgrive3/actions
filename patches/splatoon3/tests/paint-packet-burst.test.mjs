import test from 'node:test';
import assert from 'node:assert/strict';
import {encodePaintEvents,decodePaintEvents} from '../runtime/paint-packet-codec.mjs';

const row=i=>[i/60,'s',i*.003,-2.5,8,1.56,0,.412,0,0,0,0,0,1,['inkwave-paint-order-v1','match',i,0],i,i];
const clone=value=>JSON.parse(JSON.stringify(value));
test('burst tuple reuse preserves dictionary order across every field and passthrough rows',()=>{
 const events=Array.from({length:128},(_,i)=>row(i));
 const fields=[5,6,8,9,10,11,12,13];
 for(let i=0;i<fields.length;i++){
  const r=events[3+i*8];r[fields[i]]=fields[i]===8?'ink-slosh':r[fields[i]]+.125;
  events[4+i*8]=clone(r);
 }
 events[80][14][1]='日本語🦑';events[81]=clone(events[80]);
 events[88][14][3]=1;events[89]=clone(events[88]);
 events[96][14].push('source-v1');events[97]=clone(events[96]);
 events[104][14].push({source:3});events[105]=clone(events[104]);
 events[110]=[0,'other',{safe:true}];
 const payload=encodePaintEvents(events);assert.ok(payload);
 assert.deepEqual(decodePaintEvents(clone(payload)),events);
 const expected=[],indices=new Map();
 for(let i=0;i<events.length;i++){
  const r=events[i];if(r[1]!=='s'){assert.deepEqual(payload[2][i],[0,r]);continue;}
  const c=[r[5],r[6],r[8],r[9],r[10],r[11],r[12],r[13],r[14][0],r[14][1],r[14][3]];
  if(r[14].length===5)c.push(r[14][4]);
  const key=JSON.stringify(c);if(!indices.has(key)){indices.set(key,expected.length);expected.push(c);}
  assert.equal(payload[2][i][1],indices.get(key));
 }
 assert.deepEqual(payload[1],expected);
});

test('tuple reuse has packet-local lifetime and preserves zero wire normalization',()=>{
 const events=Array.from({length:128},(_,i)=>row(i));
 events[1][9]=-0;
 const first=encodePaintEvents(events);assert.equal(first[1].length,1);
 events[0][5]=4;
 const second=encodePaintEvents(events);assert.equal(second[1].length,2);
 assert.deepEqual(decodePaintEvents(clone(second)),clone(events));
 assert.equal(first[1][0][0],1.56);
});

test('optional paint-order extension length cannot reuse a four-column tuple',()=>{
 const events=Array.from({length:128},(_,i)=>row(i));
 for(let i=0;i<events.length;i++)if(i%3)events[i][14].push(i%3===1?'one':'two');
 const payload=encodePaintEvents(events);assert.equal(payload[1].length,3);
 const out=decodePaintEvents(payload);assert.deepEqual(out,events);
 for(let i=0;i<events.length;i++)assert.notEqual(out[i][14],events[i][14]);
});
