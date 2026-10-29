import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../runtime/kit-support.mjs',import.meta.url),'utf8'),current=source.slice(source.indexOf('const SUPPORT_EMPTY_ROSTER'),source.indexOf('export function installSupportGameplay')),before=fs.readFileSync(new URL('./fixtures/support-step-before-empty-031426fc.mjs.txt',import.meta.url),'utf8');
test('actual empty support roster path preserves repeated field reads and retires drink effects without sensors or stands',()=>{
 for(const hz of [30,60,120])for(const empty of [undefined,null,false,0]){
  function run(code){const log=[],G={time:10,actors:[{remote:false,id:1},{remote:true,id:2}]},p={};for(const key of ['_s3SupportSensors','_s3SupportCoolerThrows','_s3SupportCoolers'])Object.defineProperty(p,key,{get(){log.push(key);return empty;}});
   const step=new Function('aliveInMatch','retireDrink',code+';return stepSupport;')(()=>true,(a,t)=>log.push(['retire',a.id,t]));
   for(let i=0;i<hz;i++)step(p,G,null,1/hz,null,null);return log;}
  assert.deepEqual(run(current),run(before));
 }
});
