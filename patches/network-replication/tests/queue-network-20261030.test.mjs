import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './robustness-fixture.mjs';
const f=await fixture({productionComposition:true,transformSource:(rel,source)=>rel==='src/net/netmatch.js'
 ? source.replace('import { validActorSnapshotRow,','import { validActorSnapshotRow as queueOriginalValidator,')+`
 let queueValidationCount=0;
 function validActorSnapshotRow(...args){queueValidationCount++;return queueOriginalValidator(...args);}
 export const queueValidationCalls=()=>queueValidationCount;
 export {unpackTrig,BOMB_BUDGET_WAIT};
 `:source});

test('production tick rejects foreign actor rows before full scalar/sidecar validation',()=>{
 const nm=f.makeNetMatch(f.makeSession('me','me'));
 const actor=f.makeActor({nid:1,owner:'foreign',remote:true,roller:false});f.bind(nm,[actor]);
 const before=f.queueValidationCalls();
 nm.onMessage('p2',{k:'t',ts:1000,a:[f.packActor(actor),null,[],[999]],e:[]});
 assert.equal(f.queueValidationCalls(),before);assert.equal(actor.net.buf.length,0);
 actor.owner='p2';f.clock.advance(.05);
 nm.onMessage('p2',{k:'t',ts:1000.05,a:[f.packActor(actor)],l:{1:0},e:[]});
 assert.equal(f.queueValidationCalls(),before+1);assert.equal(actor.net.buf.length,1);nm.dispose();
});

test('trigger payloads keep dynamic amplitude and hand coercion with shared callables',()=>{
 const a=f.unpackTrig({amp:.25,hand:1}),b=f.unpackTrig({amp:.5}),c=f.unpackTrig({hand:0}),d=f.unpackTrig({hand:1});
 assert.equal(+a,.25);a.amp=.75;assert.equal(+a,.75);assert.equal(a.valueOf,b.valueOf);
 assert.equal(+c,1);assert.equal(c.valueOf,d.valueOf);assert.equal(a.valueOf.call({amp:3}),3);
 assert.equal(f.unpackTrig(2),2);assert.equal(f.unpackTrig(null),undefined);assert.equal(f.unpackTrig(false),undefined);
});

test('stalled bomb due prefix is reused, invalidates on timeline reversal/recovery sorting, and keeps FIFO expiry',()=>{
 let reads=0;const rows=Array.from({length:20},(_,i)=>{const e=[999+i*.001,'b',i];Object.defineProperty(e,0,{get(){reads++;return 999+i*.001;}});e._netSeq=i+1;return e;});
 const p={events:rows,tr:1000,sim:undefined},nm={peers:new Map([['p2',p]]),_play:()=>f.BOMB_BUDGET_WAIT};
 f.clock.set(1000);f.NetMatch.prototype._playEvents.call(nm);const first=reads;assert.equal(first,20);
 for(let i=0;i<120;i++){p.tr+=.001;f.NetMatch.prototype._playEvents.call(nm);}
 assert.equal(reads,first,'unchanged stalled prefix is not rescanned');assert.equal(p.events.length,20);
 p.tr=999.005;f.NetMatch.prototype._playEvents.call(nm);assert(reads>first,'clock rollback invalidates the due proof');
 const before=reads;f.NetMatch.prototype._queueKitRecoveredEvents.call(nm,'p2',[[999,'p',1]]);
 p.tr=1000;f.NetMatch.prototype._playEvents.call(nm);assert(reads>before,'recovered rows and sort invalidate the prefix');
 f.clock.set(1006.1);f.NetMatch.prototype._playEvents.call(nm);assert.equal(p._lastEventSeq,1);assert.equal(p.events[0][2],1);
});
