import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {Worker as NodeWorker} from 'node:worker_threads';
import {TEX,texture,hasTexture,publishTexturePCM,renderTexturePCM} from '../runtime/audio/grain-texture.mjs';
import {mulberry32} from '../runtime/audio/reverb-impulse.mjs';import {prewarmGrainTextures,cancelGrainPrewarm,installGrainPrewarmCleanup} from '../runtime/audio/grain-prewarm.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';import {parse} from '../../loading-cache/vendor/acorn.mjs';
const raw=fs.readFileSync(new URL('../../../inkwave-public/src/audio/audio.js',import.meta.url),'utf8'),a=raw.indexOf('const TEX = {'),b=raw.indexOf('/* ------------------------------------------------------------------------------------------------------------\n * Engine',a);
const baseline=new Function('mulberry32',raw.slice(a,b).replace('export function','function')+';return texture;')(mulberry32);
function ctx(rate){let allocations=0;return{sampleRate:rate,state:'suspended',get allocations(){return allocations;},createBuffer(ch,length,sr){allocations++;const pcm=new Float32Array(length);return{length,sampleRate:sr,getChannelData:()=>pcm};}};}
const tick=()=>new Promise(r=>setTimeout(r,5));
function fake(context=ctx(48000),extra={}){
 const worker={postMessage(m){this.request=m;},terminate(){this.terminated=(this.terminated||0)+1;}},engine={ctx:context},f={engine,worker,failures:0};
 f.start=()=>prewarmGrainTextures(engine,()=>f.failures++,{workerFactory:()=>worker,delay:0,...extra});
 f.reply=(kind,more={})=>worker.onmessage({data:{sampleRate:context.sampleRate,generation:worker.request.generation,kind,pcm:renderTexturePCM(context.sampleRate,kind),...more}});return f;
}
for(const rate of [44100,48000,96000])test('all five grain textures retain exact PRNG/Float32/sample order at '+rate+'Hz',()=>{
 const old=ctx(rate),direct=ctx(rate),warm=ctx(rate);
 for(const kind of Object.keys(TEX)){
  const expected=baseline(old,kind).getChannelData(0),pcm=renderTexturePCM(rate,kind);
  assert.deepEqual(pcm,expected,kind+' worker kernel');assert.deepEqual(texture(direct,kind).getChannelData(0),expected,kind+' sync fallback');
  assert.equal(publishTexturePCM(warm,kind,pcm),true);assert.deepEqual(texture(warm,kind).getChannelData(0),expected,kind+' transferred buffer');
  assert.equal(texture(direct,kind),texture(direct,kind),'context cache identity');
 }
 assert.equal(direct.allocations,5);assert.equal(warm.allocations,5);
});
test('urgent first sound remains synchronous and owns cache identity when Worker finishes later',async()=>{
 const f=fake();assert.equal(f.start(),true);await tick();const urgent=texture(f.engine.ctx,'bubbles');assert.equal(f.engine.ctx.allocations,1);
 f.reply('bubbles');assert.equal(texture(f.engine.ctx,'bubbles'),urgent);assert.equal(f.engine.ctx.allocations,1);
 for(const kind of Object.keys(TEX).slice(1))f.reply(kind);
 assert.equal(f.worker.terminated,1);assert.equal(f.engine.ctx.allocations,5);assert.equal(f.engine._grainPrewarm.worker,null);cancelGrainPrewarm(f.engine);
});
test('admission excludes already-warm textures and repeated calls share one context job',async()=>{
 const f=fake();texture(f.engine.ctx,'rain');assert.equal(f.start(),true);assert.equal(f.start(),true);await tick();assert.equal(f.worker.request.kinds.includes('rain'),false);
 for(const kind of f.worker.request.kinds)f.reply(kind);assert.equal(f.engine.ctx.allocations,5);cancelGrainPrewarm(f.engine);
});
test('disposed/replaced/closed contexts and wrong-generation responses cannot populate current cache',async()=>{
 for(const action of ['dispose','replace','close','stale']){
  const f=fake(),old=f.engine.ctx;f.start();await tick();
  if(action==='dispose')cancelGrainPrewarm(f.engine);if(action==='replace')f.engine.ctx=ctx(44100);if(action==='close')old.state='closed';
  f.reply('bubbles',action==='stale'?{generation:999}:{});
  assert.equal(hasTexture(old,'bubbles'),false,action);assert.equal(f.engine.ctx.allocations,0,action);cancelGrainPrewarm(f.engine);
 }
});
test('unsupported/CSP/Worker/malformed/timeout paths fall back without blocking first sound',async()=>{
 const unsupported={ctx:ctx(44100)};assert.equal(prewarmGrainTextures(unsupported,()=>{}),false);
 const csp=fake();csp.start=()=>prewarmGrainTextures(csp.engine,()=>csp.failures++,{workerFactory(){throw Error('CSP');},delay:0});csp.start();await tick();assert.equal(csp.failures,1);assert.equal(csp.engine._grainWorkerFailed,true);assert.ok(texture(csp.engine.ctx,'sizzle'));
 const error=fake();error.start();await tick();error.worker.onerror(Error('worker'));assert.equal(error.failures,1);
 const bad=fake();bad.start();await tick();bad.reply('bubbles',{pcm:new Float32Array(1)});assert.equal(bad.failures,1);assert.equal(hasTexture(bad.engine.ctx,'bubbles'),false);
 const timeout=fake(ctx(48000),{timeout:5});timeout.start();await new Promise(r=>setTimeout(r,20));assert.equal(timeout.failures,1);assert.ok(texture(timeout.engine.ctx,'rain'));
 for(const f of [csp,error,bad,timeout])cancelGrainPrewarm(f.engine);
});
test('true dedicated Worker transfers five exact PCM buffers for actual44.1k context',async()=>{
 let done;const complete=new Promise(r=>done=r),file=new URL('../runtime/audio/grain-worker.mjs',import.meta.url).href;
 const worker=new NodeWorker("const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:(d,t)=>parentPort.postMessage(d,t)};import("+JSON.stringify(file)+").then(()=>parentPort.on('message',d=>self.onmessage({data:d})));",{eval:true});
 const engine={ctx:ctx(44100)};let responses=0;
 prewarmGrainTextures(engine,()=>{throw Error('unexpected failure');},{delay:0,workerFactory:()=>({postMessage:m=>worker.postMessage(m),terminate:()=>worker.terminate(),set onmessage(fn){worker.on('message',data=>{fn({data});if(++responses===5)done();});},set onerror(fn){worker.on('error',fn);}})});
 try{await complete;for(const kind of Object.keys(TEX))assert.deepEqual(texture(engine.ctx,kind).getChannelData(0),baseline(ctx(44100),kind).getChannelData(0));assert.equal(engine.ctx.allocations,5);assert.equal(engine._grainPrewarm.worker,null);}finally{cancelGrainPrewarm(engine);await worker.terminate();}
});
test('production warm bridge retains original60/40ms fallback and disposal cancels pending job',()=>{
 const source=adaptBuildSource('src/audio/audio.js',raw),cls=parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.find(n=>n.type==='ExportNamedDeclaration'&&n.declaration?.id?.name==='AudioEngine').declaration,method=cls.body.body.find(n=>n.key.name==='_warm'),delays=[];
 const warm=new Function('prewarmGrainTextures','TEX','texture','setTimeout','return ({'+source.slice(method.start,method.end)+'})._warm;')(()=>false,TEX,()=>{},(fn,delay)=>delays.push({fn,delay}));const engine={ctx:ctx(48000)};warm.call(engine);assert.equal(delays[0].delay,60);delays[0].fn();assert.equal(delays[1].delay,40);
 class Engine{disposeWeaponAudio(){return 7;}}installGrainPrewarmCleanup(Engine);const e=new Engine();e.ctx=ctx(48000);let terminated=0;e._grainPrewarm={worker:{terminate(){terminated++;}}};assert.equal(e.disposeWeaponAudio(),7);assert.equal(e._grainPrewarm,null);assert.equal(terminated,1);
 const build=fs.readFileSync(new URL('../../../scripts/build-inkwave.mjs',import.meta.url),'utf8');assert.ok(build.includes("visit('patches/splatoon3/runtime/audio/grain-worker.mjs');"));
});
