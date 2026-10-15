import test from'node:test';import assert from'node:assert/strict';import{validateSharedPlans,validateLaneScope,TARGETS}from'./shared-preflight.mjs';
const p={head:'fbdcacb690ec5c9abd10e14d6b623a6f4206aab0',tree:'fd4f25b5277550c81b8108caa7460a2f217946c5',registrySHA256:'d9b7ed3cb89a7ac28839631bf2fe85b5924bd3769438854abf57d6edc499b4fa'};
test('same exact three-lane runtime accepted',()=>assert.equal(validateSharedPlans([p,p,p]),true));
test('missing lane and every foreign binding reject',()=>{assert.throws(()=>validateSharedPlans([p,p]));for(const key of Object.keys(p))for(let i=0;i<3;i++){const a=Array.from({length:3},()=>({...p}));a[i][key]='0'.repeat(p[key].length);assert.throws(()=>validateSharedPlans(a));}});

test('published evidence scope is exactly the nine assigned candidates',()=>{for(const[id,rows]of Object.entries(TARGETS)){const frames=rows.flatMap(rowId=>Array.from({length:8},()=>({rowId})));assert.equal(validateLaneScope(id,frames),true);}});
test('foreign evidence, a missing row, or an unexpected frame count rejects',()=>{for(const[id,rows]of Object.entries(TARGETS)){const frames=rows.flatMap(rowId=>Array.from({length:8},()=>({rowId})));assert.throws(()=>validateLaneScope(id,frames.slice(1)));frames[0].rowId='Shooter_Long_02';assert.throws(()=>validateLaneScope(id,frames));}});
