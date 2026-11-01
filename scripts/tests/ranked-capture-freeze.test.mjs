import test from 'node:test';
import assert from 'node:assert/strict';
import {withFrozenRankedCapture} from '../lib/ranked-capture-freeze.mjs';
function page(frozen=false) {
 const calls=[],G={match:{ranked:{},attract:false},netm:{}};
 G.game={frozen,debug:{freeze(){calls.push('freeze');G.game.frozen=true;},unfreeze(){calls.push('unfreeze');G.game.frozen=false;}}};
 const p={G,calls,disposed:0,async evaluateHandle(fn){const old=globalThis.RG;globalThis.RG=G;let value;try{value=fn();}finally{globalThis.RG=old;}return {async evaluate(fn){const old=globalThis.RG;globalThis.RG=G;try{return fn(value);}finally{globalThis.RG=old;}},async dispose(){p.disposed++;}};}};
 return p;
}
test('both peer clocks freeze before capture and exact prior states return',async()=>{
 const a=page(true),b=page(false),marker={};
 assert.equal(await withFrozenRankedCapture([a,b],async()=>{assert(a.G.game.frozen&&b.G.game.frozen);return marker;}),marker);
 assert.equal(a.G.game.frozen,true);assert.equal(b.G.game.frozen,false);assert.equal(a.disposed,1);assert.equal(b.disposed,1);
 assert.deepEqual(a.calls,['freeze','freeze']);assert.deepEqual(b.calls,['freeze','unfreeze']);
});
test('every falsy capture exception survives cleanup',async()=>{
 for(const value of [null,undefined,false,0,'']) {const a=page(),b=page(true);let caught=false;
 try{await withFrozenRankedCapture([a,b],()=>{throw value;});}catch(e){caught=true;assert.equal(e,value);}assert(caught);assert.equal(a.G.game.frozen,false);assert.equal(b.G.game.frozen,true);assert.equal(a.disposed,1);assert.equal(b.disposed,1);}
});
test('replacement match is not changed and capture cannot pass',async()=>{
 const a=page(),b=page();await assert.rejects(withFrozenRankedCapture([a,b],()=>{b.G.match={ranked:{},attract:false};}),/ownership changed/);assert.equal(a.G.game.frozen,false);assert.equal(b.disposed,1);assert.equal(a.disposed,1);
});
test('failed second freeze still restores first peer and disposes both handles',async()=>{
 const a=page(),b=page();b.G.game.debug.freeze=()=>{throw null;};let caught=false;
 try{await withFrozenRankedCapture([a,b],()=>assert.fail('capture ran'));}catch(e){caught=true;assert.equal(e,null);}assert(caught);assert.equal(a.G.game.frozen,false);assert.equal(a.disposed,1);assert.equal(b.disposed,1);
});
test('first failure is retained while all peer cleanup is attempted',async()=>{
 const a=page(),b=page();b.G.game.debug.unfreeze=()=>{throw new Error('cleanup');};let caught=false;
 try{await withFrozenRankedCapture([a,b],()=>{throw 0;});}catch(e){caught=true;assert.equal(e,0);}assert(caught);assert.equal(a.G.game.frozen,false);assert.equal(a.disposed,1);assert.equal(b.disposed,1);
});
test('normal capture fails if restoration fails',async()=>{
 const a=page();a.G.game.debug.unfreeze=()=>{throw new Error('restore');};await assert.rejects(withFrozenRankedCapture([a],()=>true),/restore/);assert.equal(a.disposed,1);
});
test('nonranked match is rejected before capture',async()=>{const a=page();delete a.G.match.ranked;await assert.rejects(withFrozenRankedCapture([a],()=>assert.fail('capture ran')),/current ranked match/);});
