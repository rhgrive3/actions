import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {createAudioRequestTrace,installAudioAbortTrace} from './audio-request-trace.mjs';
const request=(name='Wp_BombRobot_Explosion_00.mp3')=>({url:()=>`http://localhost/version/runtime/audio/s3-real/${name}`,failure:()=>({errorText:'net::ERR_ABORTED'})});
test('live eight-second abort is unresolved, not cleanup',()=>{let t=0;const x=createAudioRequestTrace({now:()=>t}),r=request();x.setPhase('capture');x.started(r);t=8001;x.failed(r);const f=x.data.requests[0].failed;assert.equal(f.elapsedMs,8001);assert.equal(f.boundaryRelation,'live-active-unattributed');assert.match(f.classification,/unresolved/);assert.equal(f.failure.errorText,'net::ERR_ABORTED');});
test('navigation and close retain raw failures without benign exemption',()=>{let t=0;const x=createAudioRequestTrace({now:()=>t}),a=request(),b=request();x.started(a);const nav=x.beginNavigation();t=5;x.failed(a);x.endNavigation(nav);x.started(b);x.beginClose();t=6;x.failed(b);x.endClose();assert.deepEqual(x.data.requests.map(r=>r.failed.boundaryRelation),['navigation-boundary-overlap','close-boundary-overlap']);for(const r of x.data.requests){assert.equal(r.failed.failure.errorText,'net::ERR_ABORTED');assert.match(r.failed.classification,/not a benign-error exemption/);}});
test('same URL keeps request identities and successful finish distinct',()=>{let t=1;const x=createAudioRequestTrace({now:()=>t}),a=request(),b=request();x.started(a);x.started(b);x.headers({request:()=>a,status:()=>200});t=3;x.finished(a);x.failed(b);assert.equal(x.data.requests.length,2);assert.notEqual(x.data.requests[0].id,x.data.requests[1].id);assert.equal(x.data.requests[0].finished.elapsedMs,2);assert.equal(x.data.requests[0].failed,null);assert.equal(x.data.requests[1].finished,null);});
test('overflow and non-audio cannot silently appear clean',()=>{const x=createAudioRequestTrace({limit:1,now:()=>0}),a=request(),b=request();assert.equal(x.started(request('not-audio.js')),false);x.started(a);x.started(b);x.failed(b);assert.ok(x.data.droppedRequests>0);assert.ok(x.data.untrackedEvents>0);assert.equal(x.data.requests.length,1);});
test('abort observer preserves native fetch promise/receiver/args/throw and records deadline',()=>{
 let calls=0,receiver,args,listener;const promise={},ctx={},signal={aborted:false,reason:null,addEventListener:(event,fn)=>{assert.equal(event,'abort');listener=fn;}};
 const env={performance:{now:()=>10},fetch:function(...a){calls++;receiver=this;args=a;return promise;}};
 runInNewContext(`(${installAudioAbortTrace.toString()})()`,env);
 const url='/runtime/audio/s3-real/Wp_BombRobot_Explosion_00.mp3',options={signal};
 assert.equal(env.fetch.call(ctx,url,options),promise);assert.equal(receiver,ctx);assert.equal(args[0],url);assert.equal(args[1],options);assert.equal(calls,1);
 signal.reason=new Error('Recorded audio load timed out');listener();assert.equal(env.__blastAudioAbortTrace.events[1].reason.message,'Recorded audio load timed out');
 const n=env.__blastAudioAbortTrace.events.length;env.fetch('/not.js');assert.equal(env.__blastAudioAbortTrace.events.length,n);
 const error=new Error('native'),bad={performance:{now:()=>0},fetch(){throw error;}};runInNewContext(`(${installAudioAbortTrace.toString()})()`,bad);assert.throws(()=>bad.fetch(url),e=>e===error);
});
