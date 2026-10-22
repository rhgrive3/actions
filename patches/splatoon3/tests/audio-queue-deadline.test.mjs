import test from 'node:test';
import assert from 'node:assert/strict';
import { RealS3SampleLoader } from '../runtime/audio/real-s3-loader.mjs';
import { audioLoadDeadline } from '../runtime/audio/load-deadline.mjs';
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function bank(){return {disposed:false,ctx:{state:'running'},authorized:{loaded:new Map(),maxBytes:1024,key:(id,event,variant)=>`${id}:${event}:${variant}`}};}
test('stalled recorded manifest has a deadline, releases its queue, and does not accept a late fetch',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let finish;
 const loader=new RealS3SampleLoader(bank(),{fetcher:()=>new Promise(resolve=>{finish=resolve;})});
 const job=loader.ensure('shooter','fire');await flush();assert.equal(loader.inFlight.size,1);
 t.mock.timers.tick(8000);await flush();assert.equal((await job).unavailable,true);assert.equal(loader.inFlight.size,0);assert.equal(loader.status,'unavailable');
 finish({ok:true,json:async()=>({schema:1,usageRights:'operator provided recording',clips:[]})});await flush();assert.equal(loader.status,'unavailable');
 loader.fetcher=async()=>({ok:true,json:async()=>({schema:1,usageRights:'operator provided recording',clips:[]})});loader.manifestRetryAt=0;
 const retry=await loader.ensure('shooter','fire');assert.equal(retry.missing,true);assert.equal(loader.status,'ready');
});
test('selected recording is promoted ahead of queued remote loads without interrupting an active transaction',async()=>{
 const loader=new RealS3SampleLoader(bank(),{fetcher:async()=>null}),order=[];let release;
 const active=loader._schedule(async()=>{order.push('active');await new Promise(resolve=>{release=resolve;});},'active',false);await flush();
 const remote=loader._schedule(async()=>{order.push('remote');},'remote',false);
 const selected=loader._schedule(async()=>{order.push('selected');},'selected',true);
 release();await Promise.all([active,remote,selected]);assert.deepEqual(order,['active','selected','remote']);assert.equal(loader.draining,false);
});
test('recorded loader keeps only the newest bounded diagnostics',()=>{
 const loader=new RealS3SampleLoader(bank(),{fetcher:async()=>null});for(let i=0;i<100;i++)loader._error('failure '+i);
 assert.equal(loader.totalErrorCount,100);assert.equal(loader.errors.length,64);assert.equal(loader.errors[0],'failure 36');assert.equal(loader.errors.at(-1),'failure 99');
});
test('deadline clears its timer on success and rejects a stalled decoder without changing a later result',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});assert.equal(await audioLoadDeadline(Promise.resolve(7)),7);
 let finish;const operation=new Promise(resolve=>{finish=resolve;}),pending=audioLoadDeadline(operation,20);const rejection=assert.rejects(pending,/timed out/);
 t.mock.timers.tick(20);await rejection;finish(9);await flush();
});
