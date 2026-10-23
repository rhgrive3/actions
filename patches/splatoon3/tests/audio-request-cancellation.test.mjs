import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthorizedSamplePack} from '../runtime/audio/authorized-samples.mjs';
import {RealS3SampleLoader} from '../runtime/audio/real-s3-loader.mjs';
import {audioLoadScope} from '../runtime/audio/load-deadline.mjs';
const flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const pcm=()=>({duration:.008,sampleRate:8000,length:64,numberOfChannels:1,getChannelData:()=>new Float32Array(64)});
const clip=(variant=0,extra={})=>({id:'shooter',event:'fire',file:'sample.mp3',variant,...extra});
const manifest=clips=>({schema:1,usageRights:'Synthetic fixture bytes',clips});
const response=()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});
function bank(fetcher,decode=async()=>pcm()){
  const ctx={state:'running',sampleRate:8000,decodeAudioData:decode};
  return {ctx,disposed:false,authorized:new AuthorizedSamplePack(ctx,{fetcher})};
}
test('elapsed deadline refuses dispatch and renewal even when timer tasks have not run',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const scope=audioLoadScope(2);const end=performance.now()+8;while(performance.now()<end){}let admitted=0;
  assert.throws(()=>scope.run(()=>{admitted++;}),/timed out/);assert.equal(admitted,0);assert.equal(scope.signal.aborted,true);assert.throws(()=>scope.renew(),/timed out/);
});
for(const boundary of ['fetch','body','decode'])test(`expired ${boundary} aborts its signal and admits no late buffer work`,async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const gate=deferred(),counts={fetch:0,body:0,decode:0};let signal;
  const b=bank(async(_url,options)=>{signal=options.signal;counts.fetch++;if(boundary==='fetch')await gate.promise;return {ok:true,arrayBuffer:async()=>{counts.body++;if(boundary==='body')await gate.promise;return new ArrayBuffer(8);}};},async()=>{counts.decode++;if(boundary==='decode')await gate.promise;return pcm();});
  const load=b.authorized.load(manifest([clip()]));await flush();
  assert.equal(signal.aborted,false);t.mock.timers.tick(8000);await flush();
  const result=await load;assert.equal(result.loaded,0);assert.equal(result.rejected,1);assert.match(result.errors[0].error,/timed out/);assert.equal(signal.aborted,true);
  const before={...counts};gate.resolve();await flush();assert.deepEqual(counts,before);assert.equal(b.authorized.loaded.size,0);assert.equal(b.authorized.bytes,0);assert.equal(b.authorized.pending,0);
});
test('a timed out checksum cannot subsequently start the decoder',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const gate=deferred();let decodes=0;
  t.mock.method(globalThis.crypto.subtle,'digest',()=>gate.promise);
  const b=bank(async()=>response(),async()=>{decodes++;return pcm();});
  const job=b.authorized.load(manifest([clip(0,{sha256:'0'.repeat(64)})]));await flush();
  t.mock.timers.tick(8000);await flush();assert.equal((await job).loaded,0);gate.resolve(new ArrayBuffer(32));await flush();assert.equal(decodes,0);
});
for(const cancellation of ['clear','new-generation'])test(`${cancellation} cancels a shared-file request without harming its replacement`,async()=>{
  const gate=deferred();let signal,requests=0,bodies=0;
  const b=bank(async(_url,o)=>{requests++;signal=o.signal;await gate.promise;return {ok:true,arrayBuffer:async()=>{bodies++;return new ArrayBuffer(8);}};});
  const old=b.authorized.load(manifest([clip(0),clip(1)]),{concurrency:2});await flush();const retiredSignal=signal;assert.equal(requests,1);
  if(cancellation==='clear')b.authorized.clear();
  b.authorized.fetcher=async()=>response();const fresh=await b.authorized.load(manifest([clip(2)]));
  assert.equal(fresh.loaded,1);assert.equal(retiredSignal.aborted,true);assert.equal((await old).cancelled,true);
  gate.resolve();await flush();assert.equal(bodies,0);assert.equal(b.authorized.loaded.size,1);assert.equal(b.authorized.pick('shooter','fire').variant,2);assert.equal(b.authorized._loadScopes.size,0);
});
for(const cancellation of ['clear','new-generation'])test(`reentrant abort during ${cancellation} preserves the synchronously requested latest generation`,async()=>{
  const oldResponse=deferred(),signals=[];let newest,fetches=0,decodes=0;
  const b=bank(async(_url,o)=>{
    signals.push(o.signal);
    if(++fetches===1){o.signal.addEventListener('abort',()=>{newest=b.authorized.load(manifest([clip(3)]));},{once:true});return oldResponse.promise;}
    return response();
  },async()=>{decodes++;return pcm();});
  const old=b.authorized.load(manifest([clip(1)]));await flush();
  const middle=cancellation==='clear'?b.authorized.clear():b.authorized.load(manifest([clip(2)]));
  assert.ok(newest);const result=await newest;assert.equal(result.loaded,1);assert.equal(signals[1].aborted,false);assert.equal((await old).cancelled,true);
  if(middle)assert.equal((await middle).cancelled,true);
  oldResponse.resolve(response());await flush();assert.equal(decodes,1);assert.equal(b.authorized.pick('shooter','fire').variant,3);assert.equal(b.authorized._loadScopes.size,0);
});
test('manifest timeout aborts ignored fetch and prevents late JSON while preserving bounded retry',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const gate=deferred();let signal,json=0;
  const b=bank(async()=>response()),loader=new RealS3SampleLoader(b,{fetcher:async(_url,o)=>{signal=o.signal;await gate.promise;return {ok:true,json:async()=>{json++;return manifest([]);}};}});
  const job=loader.ensure('shooter','fire');await flush();t.mock.timers.tick(8000);await flush();
  assert.equal((await job).unavailable,true);assert.equal(signal.aborted,true);assert.equal(loader.errors.length,1);gate.resolve();await flush();assert.equal(json,0);assert.equal(loader.status,'unavailable');
  loader.fetcher=async()=>({ok:true,json:async()=>manifest([])});loader.manifestRetryAt=0;assert.equal((await loader.ensure('shooter','fire')).missing,true);assert.equal(loader.status,'ready');
});
test('manifest body retains a separate deadline and disposal aborts its fetch controller',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const headers=deferred(),body=deferred();let signal;
  const b=bank(async()=>response()),loader=new RealS3SampleLoader(b,{fetcher:async(_url,o)=>{signal=o.signal;await headers.promise;return {ok:true,json:()=>body.promise};}});
  const job=loader.getManifest();await flush();t.mock.timers.tick(7900);headers.resolve();await flush();t.mock.timers.tick(7900);await flush();assert.equal(signal.aborted,false);
  b.disposed=true;b.authorized.clear();await flush();assert.equal(await job,null);assert.equal(signal.aborted,true);body.resolve(manifest([]));await flush();assert.notEqual(loader.status,'ready');assert.equal(loader.errors.length,0);
});
