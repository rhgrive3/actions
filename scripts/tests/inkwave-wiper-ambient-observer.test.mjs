import test from 'node:test';import assert from 'node:assert/strict';
import {createWiperAmbientObserver} from '../lib/inkwave-wiper-ambient-observer.mjs';
test('cached alias retains the same sequence and identity across state resets',()=>{
 let state=17,calls=0;const observer=createWiperAmbientObserver(()=>({state,calls}),()=>({sprayT:.3}));
 const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;calls++;observer.onRandom();return state/2**32;};
 const cached=random,first=Array.from({length:100},cached);state=17;calls=0;observer.setPhase('capture');
 assert.equal(cached,random);assert.deepEqual(Array.from({length:100},cached),first);assert.equal(calls,100);assert.deepEqual(observer.report().errors,[]);
});
test('native this, argument identities, return value, and timer changes are preserved',()=>{
 let calls=0;const owner={sprayT:3,_ambient(arg){assert.equal(this,owner);assert.equal(arg,token);this.sprayT-=arg.dt;calls++;return token;}};
 const token={dt:.1},original=owner._ambient,o=createWiperAmbientObserver(()=>({calls}),()=>({sprayT:owner.sprayT}));
 o.wrap(owner,'_ambient');assert.equal(owner._ambient(token),token);assert.equal(calls,1);assert.equal(owner.sprayT,2.9);
 const e=o.report().events;assert.equal(e[0].world.sprayT,3);assert.equal(e[1].world.sprayT,2.9);o.restore();assert.equal(owner._ambient,original);
});
test('throw identity and nested ambient/seaSpray scope survive observation',()=>{
 const failure=new Error('native'),owner={seaSpray(){o.onRandom();throw failure;},_ambient(){return this.seaSpray();}};
 const o=createWiperAmbientObserver(()=>({calls:1}),()=>({sprayT:0}));o.wrap(owner,'_ambient');o.wrap(owner,'seaSpray');
 assert.throws(()=>owner._ambient(),e=>e===failure);assert.equal(o.report().samples[0].scope,'seaSpray');
 assert.deepEqual(o.report().events.map(x=>x.label),['before:_ambient','before:seaSpray','after:seaSpray','after:_ambient']);
 o.onRandom();assert.equal(o.report().samples.at(-1).scope,'outside');o.restore();
});
test('early UUID-like calls cannot exhaust a later native ambient bucket',()=>{
 const o=createWiperAmbientObserver(()=>({calls:0}),()=>null);for(let i=0;i<20000;i++)o.onRandom();o.setPhase('native:4');
 const owner={_ambient(){o.onRandom();}};o.wrap(owner,'_ambient');owner._ambient();
 const r=o.report();assert.equal(r.samples.length,9);assert.equal(r.samples.at(-1).phase,'native:4');assert.equal(r.samples.at(-1).scope,'_ambient');assert.equal(r.sampleOverflow,0);o.restore();
});
test('observation error does not replace native behavior but stays visible',()=>{
 const o=createWiperAmbientObserver(()=>{throw Error('probe');},()=>null),owner={_ambient(){return 12;}};o.wrap(owner,'_ambient');assert.equal(owner._ambient(),12);assert.ok(o.report().errors.includes('probe'));o.restore();
});
test('bounded storage reports overflow and restore rejects changed owner',()=>{
 const o=createWiperAmbientObserver(()=>({calls:0}),()=>null);for(let i=0;i<600;i++)o.mark('x');assert.equal(o.report().events.length,512);assert.equal(o.report().eventOverflow,88);
 const owner={_ambient(){}};o.wrap(owner,'_ambient');owner._ambient=()=>{};assert.throws(()=>o.restore(),/ownership changed/);
});
test('inherited method restoration leaves no new own property',()=>{
 const proto={_ambient(){return this.value;}},owner=Object.create(proto);owner.value=7;
 const o=createWiperAmbientObserver(()=>({calls:0}),()=>null);o.wrap(owner,'_ambient');assert.equal(owner._ambient(),7);assert.ok(Object.hasOwn(owner,'_ambient'));o.restore();assert.equal(Object.hasOwn(owner,'_ambient'),false);assert.equal(owner._ambient,proto._ambient);
});
test('own method descriptor is restored byte-for-byte',()=>{
 const owner={};Object.defineProperty(owner,'_ambient',{value(){return 9;},enumerable:false,writable:true,configurable:true});const before=Object.getOwnPropertyDescriptor(owner,'_ambient');
 const o=createWiperAmbientObserver(()=>({calls:0}),()=>null);o.wrap(owner,'_ambient');assert.equal(owner._ambient(),9);o.restore();assert.deepEqual(Object.getOwnPropertyDescriptor(owner,'_ambient'),before);
});
test('observed RNG exactly matches an independent unobserved generator through resets',()=>{
 let a=19,b=19,ca=0,cb=0;const o=createWiperAmbientObserver(()=>({state:a,calls:ca}),()=>null);
 const observed=()=>{a=(Math.imul(a,1664525)+1013904223)>>>0;ca++;o.onRandom();return a/2**32;};
 const plain=()=>{b=(Math.imul(b,1664525)+1013904223)>>>0;cb++;return b/2**32;};
 for(const phase of ['warm','native:4']){o.setPhase(phase);a=b=19;ca=cb=0;for(let i=0;i<1000;i++)assert.equal(observed(),plain());assert.deepEqual([a,ca],[b,cb]);}
 assert.deepEqual(o.report().errors,[]);
});
