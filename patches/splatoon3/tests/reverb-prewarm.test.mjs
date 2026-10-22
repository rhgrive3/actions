import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {Worker as NodeWorker} from 'node:worker_threads';
import {buildImpulse,renderReverbPair,REVERB_RECIPES,mulberry32} from '../runtime/audio/reverb-impulse.mjs';
import {ReverbPrewarm,installReverbPrewarmCleanup} from '../runtime/audio/reverb-prewarm.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
const raw=fs.readFileSync(new URL('../../../inkwave-public/src/audio/music.js',import.meta.url),'utf8'),a=raw.indexOf('export function makeImpulse('),b=raw.indexOf('\n// tanh drive curve',a);
const baseline=new Function('mulberry32',raw.slice(a,b).replace('export function','function')+';return makeImpulse;')(mulberry32);
function ctx(rate){return{sampleRate:rate,createBuffer(channels,length,sr){const data=Array.from({length:channels},()=>new Float32Array(length));return {sampleRate:sr,length,data,getChannelData:i=>data[i]};}};}
for(const rate of [44100,48000,96000])test('canonical shared/Worker PCM is bit-exact against original stereo impulse '+rate+'Hz',()=>{
 for(const r of [...REVERB_RECIPES,{seconds:.2,decay:4,opt:{seed:77,bright:.2,dark:.07,pre:.03,taps:[[.017,.42],[.044,.11]]}}]){
  const expected=baseline(ctx(rate),r.seconds,r.decay,r.opt),actual=buildImpulse(ctx(rate),r.seconds,r.decay,r.opt);assert.deepEqual(actual.data,expected.data);
 }
 const pair=renderReverbPair(rate);for(let i=0;i<2;i++){const r=REVERB_RECIPES[i];assert.deepEqual(pair[i],baseline(ctx(rate),r.seconds,r.decay,r.opt).data);}
});
function fake(){const worker={postMessage(m){this.request=m;},terminate(){this.terminated=(this.terminated||0)+1;}};const warm=new ReverbPrewarm({workerFactory:()=>worker});return{worker,warm,ready(rate=48000,generation=worker.request.generation){worker.onmessage({data:{sampleRate:rate,generation,pair:renderReverbPair(rate)}});}};}
test('ready exact-rate pair transfers once into independent AudioBuffers and releases Worker/cache',()=>{
 const f=fake();f.ready();assert.equal(f.worker.terminated,1);const pair=f.warm.take(ctx(48000));assert.equal(pair.length,2);assert.equal(f.warm.pair,null);assert.equal(f.warm.worker,null);assert.equal(f.warm.take(ctx(48000)),null);assert.deepEqual(pair.map(b=>b.data),renderReverbPair(48000));
});
test('early gesture, wrong actual rate, stale generation, Worker/CSP failure never delay synchronous fallback',()=>{
 const early=fake(),callback=early.worker.onmessage;assert.equal(early.warm.take(ctx(48000)),null);callback({data:{...early.worker.request,pair:renderReverbPair(48000)}});assert.equal(early.warm.pair,null);
 const wrong=fake();wrong.ready();assert.equal(wrong.warm.take(ctx(44100)),null);assert.equal(wrong.warm.pair,null);
 const stale=fake();stale.ready(48000,99);assert.equal(stale.warm.pair,null);stale.warm.dispose();
 const failed=new ReverbPrewarm({workerFactory(){throw Error('CSP');}});assert.equal(failed.take(ctx(48000)),null);
 const error=fake();error.worker.onerror(Error('failed'));assert.equal(error.warm.take(ctx(48000)),null);
});
test('idle prewarm cache expires and discards stale Worker response',async()=>{
 const worker={postMessage(m){this.request=m;},terminate(){this.dead=true;}};const warm=new ReverbPrewarm({workerFactory:()=>worker,ttl:5});await new Promise(r=>setTimeout(r,15));assert.equal(worker.dead,true);worker.onmessage({data:{...worker.request,pair:renderReverbPair(48000)}});assert.equal(warm.pair,null);
});
test('actual dedicated Worker transfers both independent stereo recipes to controller',async()=>{
 let done;const received=new Promise(r=>done=r),file=new URL('../runtime/audio/reverb-worker.mjs',import.meta.url).href;
 const worker=new NodeWorker("const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:(d,t)=>parentPort.postMessage(d,t)};parentPort.on('message',d=>self.onmessage({data:d}));import("+JSON.stringify(file)+");",{eval:true});
 const warm=new ReverbPrewarm({workerFactory:()=>({postMessage:m=>worker.postMessage(m),terminate:()=>worker.terminate(),set onmessage(fn){worker.on('message',data=>{fn({data});done();});},set onerror(fn){worker.on('error',fn);}})});
 try{await received;assert.deepEqual(warm.take(ctx(48000)).map(b=>b.data),renderReverbPair(48000));}finally{warm.dispose();await worker.terminate();}
});
test('production AudioEngine init consumes only ready exact-rate IR and sends separate music buffer without waiting',()=>{
 const source=adaptBuildSource('src/audio/audio.js',fs.readFileSync(new URL('../../../inkwave-public/src/audio/audio.js',import.meta.url),'utf8'));
 const cls=parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.find(n=>n.type==='ExportNamedDeclaration'&&n.declaration?.id?.name==='AudioEngine').declaration;
 const method=cls.body.body.find(n=>n.key.name==='init');let generated=0;
 const init=new Function('taper','makeImpulse','connectOutputSafety','return ({'+source.slice(method.start,method.end)+'}).init;')(x=>x,(...args)=>{generated++;return buildImpulse(...args);},()=>({}));
 for(const ready of [false,true])for(const rate of [44100,48000]){
  const f=fake();if(ready)f.ready();const context=ctx(rate),param=()=>({value:0});const node=()=>({gain:param(),frequency:param(),Q:param(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),connect(){}});
  Object.assign(context,{createGain:node,createBiquadFilter:node,createDynamicsCompressor:node,createConvolver:node,destination:{}});let musicOptions;
  const engine={opts:{context},vol:{master:1,music:1,sfx:1},_reverbPrewarm:f.warm,music:{_init(_c,_bus,opt){musicOptions=opt;}},_installUnlock(){},_warm(){},resume(){}};const before=generated;init.call(engine);
  assert.equal(generated-before,ready&&rate===48000?0:1);assert.deepEqual(engine.conv.buffer.data,baseline(ctx(rate),1.5,3.4,{pre:.012,seed:3}).data);
  if(ready&&rate===48000)assert.deepEqual(musicOptions.impulse.data,baseline(ctx(rate),2.2,2.4,{seed:5,bright:.7,dark:.08}).data);else assert.equal(musicOptions.impulse,undefined);
  assert.equal(engine._reverbPrewarm,null);
 }
});

test('music-disabled startup allocates only SFX AudioBuffer; engine disposal cancels pending ownership',()=>{
 const f=fake();f.ready();let allocations=0;const context=ctx(48000),create=context.createBuffer;context.createBuffer=(...args)=>{allocations++;return create(...args);};
 assert.equal(f.warm.take(context,false).length,1);assert.equal(allocations,1);
 class Engine{disposeWeaponAudio(){return 17;}}installReverbPrewarmCleanup(Engine);const e=new Engine(),g=fake();e._reverbPrewarm=g.warm;
 assert.equal(e.disposeWeaponAudio(),17);assert.equal(e._reverbPrewarm,null);assert.equal(g.warm.worker,null);assert.ok(g.worker.terminated);
});

test('dedicated reverb Worker and shared PCM module are included in offline graph without eager hints',()=>{
 const build=fs.readFileSync(new URL('../../../scripts/build-inkwave.mjs',import.meta.url),'utf8');
 assert.ok(build.includes("visit('patches/splatoon3/runtime/audio/reverb-worker.mjs');"));
 const deferred=build.slice(build.indexOf('const deferredIntegrationPreloads = new Set(['));
 for(const file of ['reverb-impulse.mjs','reverb-prewarm.mjs','reverb-worker.mjs'])assert.ok(deferred.includes("'patches/splatoon3/runtime/audio/"+file+"'"));
});
