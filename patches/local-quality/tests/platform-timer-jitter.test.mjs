import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PlatformFrameDriver,MAX_PLATFORM_GAP} from '../platform-lifecycle.mjs';
const oldSource=fs.readFileSync(new URL('./fixtures/platform-driver-before-806a0f28.mjs.txt',import.meta.url),'utf8');
const Before=new Function('MAX_PLATFORM_GAP',oldSource+';return PlatformFrameDriver;')(MAX_PLATFORM_GAP);
function simulate(Driver,{hz=60,jitter=()=>2,work=3,seconds=60,cap=60}={}){
 let now=-.001,id=0,timerCount=0,peakQueued=0;const events=new Map(),times=[],deltas=[];const interval=1000/hz;
 const env={document:{hidden:false},performance:{now:()=>now},Date:{now:()=>now},requestAnimationFrame(fn){const key=++id,at=(Math.floor((now+1e-7)/interval)+1)*interval;events.set(key,{at,fn:()=>fn(at)});peakQueued=Math.max(peakQueued,events.size);return key;},cancelAnimationFrame:key=>events.delete(key),setTimeout(fn,wait){const key=++id;events.set(key,{at:now+Math.max(0,wait)+jitter(timerCount++),fn});peakQueued=Math.max(peakQueued,events.size);return key;},clearTimeout:key=>events.delete(key)};
 const owner={env,active:true,focused:true,subscribe(){return()=>{};}},driver=new Driver(owner,dt=>{times.push(now);deltas.push(dt);now+=work;},()=>{},()=>cap);driver.start();
 for(let steps=0;events.size;steps++){assert(steps<100000);let first;for(const [key,row]of events)if(!first||row.at<first[1].at)first=[key,row];if(first[1].at>=seconds*1000-1e-7)break;events.delete(first[0]);now=Math.max(now,first[1].at);first[1].fn();}
 const gaps=times.slice(1).map((time,i)=>time-times[i]),snapshot=driver.snapshot();driver.dispose();assert.equal(events.size,0);assert.equal(peakQueued,1);
 return {frames:times.length,maxGap:Math.max(...gaps),elapsed:deltas.reduce((a,b)=>a+b,0),last:times.at(-1),snapshot};
}
test('actual driver recovers from 60 Hz / 2 ms timer lateness while retaining one owned wake and absolute time',()=>{
 const a=simulate(Before),b=simulate(PlatformFrameDriver);assert.equal(a.frames,1800);assert(b.frames>=3598&&b.frames<=3600);assert(Math.abs(b.elapsed-b.last/1000)<1e-7);assert.equal(b.snapshot.pendingRAF+b.snapshot.pendingTimer,1);
});
test('constant and sparse jitter on 30/60/90/120/144 Hz never recreate the fixed-four-ms 90 Hz regression',()=>{
 const results=[];for(const hz of [30,60,90,120,144])for(const delay of [0,.5,1,2,3,4])for(const sparse of [false,true])for(const work of [3,10,15]){
  const options={hz,work,jitter:n=>sparse?(n%10===0?delay:0):delay},a=simulate(Before,options),b=simulate(PlatformFrameDriver,options);
  assert(b.frames>=a.frames-2,`${hz} Hz ${delay} ms ${sparse?'sparse':'constant'} work ${work}: ${a.frames} -> ${b.frames}`);assert(b.frames<=Math.min(hz,60)*60+1,'no burst above cap');assert(Math.abs(b.elapsed-b.last/1000)<1e-7,'no lost or duplicated elapsed time');
  if(hz===60&&work===3)assert(b.frames>=3598);if(hz===90&&delay===4&&work===3)assert(b.frames>=3598);
  results.push({hz,delay,sparse,work,before:a.frames,after:b.frames,beforeMaxGap:a.maxGap,afterMaxGap:b.maxGap});
 }
 if(process.env.PACING_REPORT)fs.writeFileSync(process.env.PACING_REPORT,JSON.stringify({conditions:'Discrete native-class RAF/timeout event harness, not device performance',results},null,2));
});
test('display mode does not add timers or cap native RAF',()=>{const r=simulate(PlatformFrameDriver,{hz:120,cap:0,jitter:()=>4});assert.equal(r.frames,7200);assert.equal(r.snapshot.timerSchedules,0);});
