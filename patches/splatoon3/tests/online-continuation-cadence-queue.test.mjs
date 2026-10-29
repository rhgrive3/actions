import test from 'node:test';import assert from 'node:assert/strict';
import {actualModule} from '../../network-replication/tests/added-actual-module.mjs';
async function setup(hz=60){
 let now=0;const mod=await actualModule('patches/splatoon3/runtime/disconnect-fidelity.mjs',{globals:{performance:{now:()=>now}}}),sent=[];
 const match={mode:'turf',state:'results',actors:[{owner:'a'},{owner:'b'}]},G={match};
 const nm={myId:'a',cfg:{id:'m'},match,s:{hostId:'b',_members:new Map([['a',1],['b',1]])},_matchStateAPI:{G},_sendNow:d=>{sent.push({at:now,d:structuredClone(d)});return true;}};G.netm=nm;
 return {api:mod.api,nm,G,sent,set:t=>now=t,advance:n=>{for(let i=1;i<=n;i++){now+=1000/hz;mod.api.tickOnlineContinuation(nm);}}};
}
for(const hz of [30,60,120])test(`continuation keeps first send immediate and bounded repeats for 60 seconds at ${hz}Hz`,async()=>{
 const f=await setup(hz);assert.equal(f.api.chooseOnlineContinuation(f.nm,'keep'),true);assert.equal(f.sent.length,1);assert.equal(f.sent[0].at,0);
 f.advance(60*hz);assert.ok(f.sent.length>=59&&f.sent.length<=61,f.sent.length);for(let i=1;i<f.sent.length;i++){assert.ok(f.sent[i].at-f.sent[i-1].at>=1000-1e-8);assert.deepEqual(f.sent[i].d,f.sent[0].d);}
});
test('failed sends retry at bounded cadence; choice change and host migration send immediately without changing q on retry',async()=>{
 const f=await setup();let attempts=0;f.nm._sendNow=d=>{f.sent.push({at:0,d:structuredClone(d)});return ++attempts>=3;};
 f.api.chooseOnlineContinuation(f.nm,'keep');f.set(249);f.api.tickOnlineContinuation(f.nm);assert.equal(attempts,1);
 f.set(250);f.api.tickOnlineContinuation(f.nm);assert.equal(attempts,2);f.set(500);f.api.tickOnlineContinuation(f.nm);assert.equal(attempts,3);
 f.set(501);f.api.tickOnlineContinuation(f.nm);assert.equal(attempts,3);f.nm.s.hostId='c';f.api.tickOnlineContinuation(f.nm);assert.equal(attempts,4);
 f.api.chooseOnlineContinuation(f.nm,'change');assert.equal(attempts,5);assert.deepEqual(f.sent.map(x=>x.d.q),[1,1,1,1,2]);
});
test('synchronous transport reentry cannot duplicate the same choice or delay a new nested choice',async()=>{
 const f=await setup();let nested=false;f.nm._sendNow=d=>{f.sent.push(structuredClone(d));f.api.tickOnlineContinuation(f.nm);if(!nested){nested=true;f.api.chooseOnlineContinuation(f.nm,'change');}return true;};
 f.api.chooseOnlineContinuation(f.nm,'keep');assert.deepEqual(f.sent.map(d=>d.q),[1,2]);assert.equal(f.nm._resultChoices.local.choice,'change');assert.equal(f.nm._resultChoices.rows.get('a').choice,'change');
});
test('departed current netmatch, non-results and replacement match never resend old choices',async()=>{
 const f=await setup();f.api.chooseOnlineContinuation(f.nm,'keep');f.set(2000);f.G.netm=null;f.api.tickOnlineContinuation(f.nm);assert.equal(f.sent.length,1);
 f.G.netm=f.nm;f.nm.match.state='playing';f.api.tickOnlineContinuation(f.nm);assert.equal(f.sent.length,1);
 const next={...f.nm.match,state:'results'};f.G.match=f.nm.match=next;f.api.tickOnlineContinuation(f.nm);assert.equal(f.sent.length,1);assert.equal(f.nm._resultChoices.rows.size,0);
 f.api.chooseOnlineContinuation(f.nm,'change');assert.equal(f.sent.length,2);assert.equal(f.sent[1].d.q,1);
 f.nm.cfg.id='next';f.set(5000);f.api.tickOnlineContinuation(f.nm);assert.equal(f.sent.length,2);assert.equal(f.nm._resultChoices.rows.size,0);
});
