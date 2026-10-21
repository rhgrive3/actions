import test from 'node:test';
import assert from 'node:assert/strict';
import {installNetworkPlacementObservation} from '../lib/inkwave-network-placement-observation.mjs';
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
