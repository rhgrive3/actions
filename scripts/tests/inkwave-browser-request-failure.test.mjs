import test from 'node:test';import assert from 'node:assert/strict';
import {verifiedAudioCancellation,partitionRequestFailures} from '../lib/inkwave-browser-request-failure.mjs';
test('only fully hash-verified audio client cancellations are separated from failures',()=>{
 const prefix='http://127.0.0.1:8000/_versions/'+'a'.repeat(64)+'/',event={url:prefix+'assets/audio/Jet_Arrow.mp3',error:'net::ERR_ABORTED'};
 assert.equal(verifiedAudioCancellation(event,true),true);
 assert.equal(verifiedAudioCancellation(event,false),false,'a cancelled incomplete download is still a failure');
 for(const error of ['net::ERR_CONNECTION_CLOSED','net::ERR_FAILED','net::ERR_TIMED_OUT'])assert.equal(verifiedAudioCancellation({...event,error},true),false);
 for(const url of [prefix+'src/main.js',prefix+'assets/models/a.glb',prefix+'assets/audio/nested/a.mp3','http://local/assets/audio/Jet_Arrow.mp3'])assert.equal(verifiedAudioCancellation({...event,url},true),false);
});
test('late verification belongs to the exact request, not another request for the same URL',async()=>{
 const event={url:'http://local/_versions/'+'a'.repeat(64)+'/assets/audio/Jet_Arrow.mp3',error:'net::ERR_ABORTED'};
 const completed={},incomplete={},verified=new WeakSet(),observed=[{request:completed,event},{request:incomplete,event:{...event}}];
 assert.equal(partitionRequestFailures(observed,verified).failures.length,2);
 await Promise.resolve().then(()=>verified.add(completed));
 const result=partitionRequestFailures(observed,verified);
 assert.deepEqual(result.audioCancellations,[event]);
 assert.deepEqual(result.failures,[observed[1].event],'a hash for the same URL never verifies a different cancelled request');
});
