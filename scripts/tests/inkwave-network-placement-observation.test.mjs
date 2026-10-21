import test from 'node:test';
import assert from 'node:assert/strict';
import {installNetworkPlacementObservation,createNetworkFrameObservation} from '../lib/inkwave-network-placement-observation.mjs';
const clean=()=>{delete globalThis.__G;delete globalThis.__ceilingPlacementObservation;};
test('observations read frozen native state without changing sample or acceptance',()=>{
 const sample=Object.freeze({t:1,life:2,tp:3,f:1,x:.91,y:6.7,z:-38.58});
 const net=Object.freeze({ready:true,has:true,cur:sample,buf:Object.freeze([])});
 const a=Object.freeze({nid:0,owner:'owner',remote:true,isLocal:false,netLife:3,pos:Object.freeze({x:12.5,y:0,z:2}),net});
 const peer=Object.freeze({tr:1,lastTs:1,init:true});
 globalThis.__G=Object.freeze({time:10,netm:Object.freeze({myId:'guest',peers:new Map([['owner',peer]])}),match:Object.freeze({actors:Object.freeze([a])})});
 try{installNetworkPlacementObservation();__ceilingPlacementObservation.record('placed');const r=__ceilingPlacementObservation.report();
  assert.equal(r.rows[0].actors[0].ownerIsSelf,false);assert.equal(r.rows[0].actors[0].net.bufferCount,0);
  assert.deepEqual(r.rows[0].actors[0].net.cur.pos,[.91,6.7,-38.58]);assert.equal(a.net.cur,sample);assert.equal(a.net.ready,true);assert.equal(a.netLife,3);
 }finally{clean();}
});
test('rows and actors are bounded and nonfinite values become null',()=>{
 globalThis.__G={time:NaN,netm:{},match:{actors:[{pos:{x:NaN,y:Infinity,z:-Infinity}},{},{}]}};
 try{installNetworkPlacementObservation();for(let i=0;i<100;i++)__ceilingPlacementObservation.record('before-net',0);const r=__ceilingPlacementObservation.report();
  assert.equal(r.rows.length,48);assert.equal(r.truncated,true);assert.equal(r.rows[0].actors.length,2);assert.equal(r.rows[0].gameTime,null);assert.deepEqual(r.rows[0].actors[0].pos,[null,null,null]);assert.doesNotThrow(()=>JSON.stringify(r));
 }finally{clean();}
});
test('unknown labels and out-of-range settle steps fail',()=>{
 try{installNetworkPlacementObservation();for(const [s,i]of [['wrong',0],['before-net',13],['after-net',NaN]])assert.throws(()=>__ceilingPlacementObservation.record(s,i));assert.equal(__ceilingPlacementObservation.report().rows.length,0);}finally{clean();}
});

test('dispatch observer preserves native receiver, arguments, return and thrown object',()=>{
 const expected={answer:42},failure={native:'throw'},payload={k:'t',ts:10,u:600,a:[[0]],l:{0:2}};let calls=0;
 const nm={peers:new Map(),_tick(from,d,extra){assert.equal(this,nm);assert.equal(d,payload);assert.equal(extra,9);calls++;if(from==='throw')throw failure;return expected;},onMessage(...args){return this._tick(...args);}};
 const originals=[nm.onMessage,nm._tick];globalThis.__G={netm:nm,match:{actors:[{remote:true,owner:'owner'}]}};
 try{installNetworkPlacementObservation();const o=__ceilingPlacementObservation;o.observeDispatch();o.observeDispatch();assert.equal(nm.onMessage('owner',payload,9),expected);assert.throws(()=>nm.onMessage('throw',payload,9),e=>e===failure);assert.equal(calls,2);
  const r=o.report();assert.equal(r.dispatch.length,8);assert.equal(r.dispatch.filter(x=>x.threw).length,2);assert.equal(r.observationErrors,0);assert.equal(r.dispatch[0].fromKnownOwner,true);assert.equal(r.dispatch[4].fromKnownOwner,false);
  o.restore();assert.equal(nm.onMessage,originals[0]);assert.equal(nm._tick,originals[1]);
 }finally{clean();}
});
test('dispatch metadata truncates without suppressing native calls and missing method is atomic',()=>{
 let calls=0;const nm={peers:new Map(),onMessage(){calls++;return 7;},_tick(){}};globalThis.__G={netm:nm};
 try{installNetworkPlacementObservation();const o=__ceilingPlacementObservation;o.observeDispatch();for(let i=0;i<100;i++)assert.equal(nm.onMessage('x',{k:'t',ts:NaN}),7);assert.equal(calls,100);assert.equal(o.report().dispatch.length,96);assert.equal(o.report().dispatchTruncated,true);assert.equal(o.report().dispatch[0].ts,null);o.restore();
  const original=nm.onMessage;delete nm._tick;installNetworkPlacementObservation();assert.throws(()=>__ceilingPlacementObservation.observeDispatch(),/Missing/);assert.equal(nm.onMessage,original);
 }finally{clean();}
});
test('metadata failures do not replace native exceptions',()=>{
 const failure=new Error('native'),nm={peers:{get(){throw Error('observation only');}},onMessage(){throw failure;},_tick(){}};globalThis.__G={netm:nm};
 try{installNetworkPlacementObservation();const o=__ceilingPlacementObservation;o.observeDispatch();assert.throws(()=>nm.onMessage('x',{k:'t'}),e=>e===failure);assert.equal(o.report().observationErrors,2);o.restore();}finally{clean();}
});

test('socket observations keep bounded sanitized metadata, not wire payload or owner identifiers',()=>{
 const o=createNetworkFrameObservation(),frame='m|private-owner|'+JSON.stringify({k:'t',ts:3,u:4,a:[[0,12,3,4],[1],[2]],l:{0:2,1:3},private:'do not preserve'});
 o.record('relay-forward',frame,0);o.record('browser-receive',Buffer.from(frame),1);o.record('browser-receive','m|id|bad-json',1);
 for(let i=0;i<200;i++)o.record('browser-receive',frame,1);const r=o.report();assert.equal(r.rows.length,128);assert.equal(r.truncated,true);assert.equal(r.invalidFrames,1);assert.equal(r.rows[0].actors.length,2);assert.equal(r.rows[0].actors[0].life,2);assert(!JSON.stringify(r).includes('private'));
});
