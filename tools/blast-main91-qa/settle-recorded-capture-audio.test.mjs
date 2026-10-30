import test from 'node:test';
import assert from 'node:assert/strict';
import {settleRecordedCaptureAudio} from './settle-recorded-capture-audio.mjs';
function fixture(){
 const owner={},ctx={state:'running'},req={id:'sub:autobomb',event:'explosion'},kit={owner,requests:[req]},weapon={id:'blaster',sub:'autobomb',special:'bubbler'};
 const loader={totalErrorCount:0,errors:[],status:'ready',pendingJobs:[],draining:false,inFlight:new Map(),bank:{authorized:{pending:0}},stats(){return {status:this.status,pendingKinds:this.inFlight.size};},declares:()=>true,isEventResident:()=>true};
 const audio={ctx,_realS3Loader:loader,requireRecordedMainShot:async()=>({ready:true,id:'blaster'})};
 const actor={weapon,weaponRunner:{_mainAudioState:{kitPrefetch:kit}}},game={frozen:true,_skipRender:true,match:{local:actor}};
 const env={__G:{audio},__inkwave:game,performance:{now:()=>100}};
 const run=new Function('globalThis','return ('+settleRecordedCaptureAudio.toString()+');')(env);
 return {owner,ctx,kit,weapon,loader,audio,actor,game,env,run};
}
test('joins existing work then checks native main and selected kit residents',async()=>{
 const f=fixture();let mainCalls=0,settled=false;f.audio.requireRecordedMainShot=async id=>{mainCalls++;assert.equal(id,'blaster');return {ready:true};};
 f.loader.inFlight.set('sub:autobomb:explosion',Promise.resolve().then(()=>{settled=true;f.loader.inFlight.clear();return {loaded:1,errors:[]};}));
 const r=await f.run();assert.equal(r.status,'ready');assert.equal(mainCalls,1);assert.equal(settled,true);assert.equal(r.after.inFlightKeys.length,0);assert.equal(r.before.inFlightKeys.length,1);assert.equal(r.after.kitRequests[0].resident,true);
});
test('resolved error result is failure, not successful settlement',async()=>{
 const f=fixture();const bad=Promise.resolve({loaded:0,rejected:1,errors:[{error:'native failure'}]});f.loader.inFlight.set('bad',bad);
 const r=await f.run();assert.equal(r.status,'failed');assert.match(r.error,/did not succeed/);assert.deepEqual(r.waits[0].results[0].value.errors,[{error:'native failure'}]);
});
test('preexisting and new loader errors retained without retries or clearing',async()=>{
 const before=fixture();before.loader.errors.push('old native error');before.loader.totalErrorCount=1;let called=0;before.audio.requireRecordedMainShot=async()=>{called++;return {ready:true};};
 const a=await before.run();assert.equal(a.status,'failed');assert.equal(called,0);assert.deepEqual(a.after.errors,['old native error']);
 const after=fixture();after.audio.requireRecordedMainShot=async()=>{after.loader.errors.push('Recorded audio load timed out');after.loader.totalErrorCount++;return {ready:true};};
 const b=await after.run();assert.equal(b.status,'failed');assert.deepEqual(b.after.errors,['Recorded audio load timed out']);
});
test('owner/context changes, missing resident and unknown declaration fail closed',async()=>{
 const mutations=[
 f=>{f.audio.requireRecordedMainShot=async()=>{f.kit.owner={};return {ready:true};};},
 f=>{f.audio.requireRecordedMainShot=async()=>{f.audio.ctx={state:'running'};return {ready:true};};},
 f=>{f.loader.isEventResident=()=>false;},
 f=>{f.loader.declares=()=>null;},
 f=>{f.loader.bank.authorized.pending=1;},
 f=>{f.game._skipRender=false;},
 f=>{f.ctx.state='closed';}
 ];
 for(const mutate of mutations){const f=fixture();mutate(f);assert.equal((await f.run()).status,'failed');}
});
test('explicitly unrecorded optional kit events do not fabricate residence',async()=>{
 const f=fixture();f.loader.declares=()=>false;f.loader.isEventResident=()=>false;
 const r=await f.run();assert.equal(r.status,'ready');assert.equal(r.after.kitRequests[0].declared,false);assert.equal(r.after.kitRequests[0].resident,false);
});
test('watchdog fails without cancelling or retrying product work',async()=>{
 const f=fixture();let calls=0;f.audio.requireRecordedMainShot=()=>{calls++;return new Promise(()=>{});};
 const r=await f.run({timeoutMs:10});assert.equal(r.status,'failed');assert.match(r.error,/watchdog expired/);assert.equal(calls,1);assert.deepEqual(f.loader.errors,[]);
});
