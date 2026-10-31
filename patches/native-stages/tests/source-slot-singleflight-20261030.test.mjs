import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../runtime/source-cache.mjs',import.meta.url),'utf8');
function fixture(){let time=0,calls=0;const waits=[];const slots=new Function('Date','openSlots',source.slice(source.indexOf('let activeSlot=null'),source.indexOf('async function openSlots'))+'return slots;')({now:()=>time},id=>{calls++;return new Promise((resolve,reject)=>waits.push({id,resolve,reject}));});return {slots,waits,setTime:t=>time=t,calls:()=>calls};}
test('pending slot validation remains single-flight across TTL and successful validation starts a fresh TTL',async()=>{
 const f=fixture(),a=f.slots('same');f.setTime(6000);const b=f.slots('same');assert.equal(f.calls(),1);const cache={};f.waits[0].resolve(cache);assert.equal(await a,cache);assert.equal(await b,cache);f.setTime(10999);assert.equal(await f.slots('same'),cache);assert.equal(f.calls(),1);f.setTime(11001);const next=f.slots('same');assert.equal(f.calls(),2);f.waits[1].resolve(cache);await next;
});
test('failed validation is retried and a stale earlier stage cannot replace the current stage slot',async()=>{
 const f=fixture(),a=f.slots('a');f.waits[0].reject(Error('failed'));await assert.rejects(a,/failed/);const retry=f.slots('a');assert.equal(f.calls(),2);const b=f.slots('b'),bc={b:true};f.waits[2].resolve(bc);await b;f.waits[1].resolve({a:true});await retry;assert.equal(await f.slots('b'),bc);assert.equal(f.calls(),3);
});
