import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthorizedSamplePack, validateAuthorizedManifest } from '../runtime/audio/authorized-samples.mjs';
import { WeaponSoundBank } from '../runtime/audio/bank.mjs';
const RIGHTS='Self-created recording, with permission for this deployment';
const manifest=clips=>({schema:1,usageRights:RIGHTS,targetVersion:'11.3.0',clips});
const clip=(id='shooter',event='fire',file='fire.wav',more={})=>({id,event,file,...more});
const mkctx=(len=4000)=>{
  let decodes=0;
  const ctx={sampleRate:48000,
    createBuffer(channels,length,sr){const data=Array.from({length:channels},()=>new Float32Array(length));return{length,duration:length/sr,numberOfChannels:channels,sampleRate:sr,getChannelData:i=>data[i]};},
    async decodeAudioData(){decodes++;const b=ctx.createBuffer(2,len,48000);return b;}};
  return {ctx,decodeCount:()=>decodes};
};
const net=()=>({ok:true,headers:{get:()=>null},arrayBuffer:async()=>new ArrayBuffer(128)});
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{resolve,promise};};
test('atomic swap: a loading sample library never silences an already installed sound',async()=>{
  const {ctx}=mkctx();let pending;
  const pack=new AuthorizedSamplePack(ctx,{fetcher:async url=>url.includes('slow')?await (pending??=defer()).promise:net()});
  await pack.load(manifest([clip()]),{baseURL:'.'});
  const before=pack.pick('shooter','fire',0);
  const installing=pack.load(manifest([clip('shooter','fire','slow.wav')]),{baseURL:'./custom'});
  await Promise.resolve();await Promise.resolve();
  assert.equal(pack.pick('shooter','fire',0),before);
  pending.resolve(net());
  const r=await installing;
  assert.equal(r.loaded,1);assert.equal(r.cancelled,false);
  assert.equal(pack.pick('shooter','fire',0)?.file,'slow.wav');
  assert.notEqual(pack.pick('shooter','fire',0),before);
});
test('last request wins when two imports finish out of order',async()=>{
  const {ctx}=mkctx();const slower=defer();
  const pack=new AuthorizedSamplePack(ctx,{fetcher:async url=>url.includes('slow')?await slower.promise:net()});
  const a=pack.load(manifest([clip('shooter','fire','slow.wav')]),{baseURL:'.'});
  await Promise.resolve();
  const b=await pack.load(manifest([clip('shooter','fire','new.wav')]),{baseURL:'.'});
  assert.equal(b.loaded,1);assert.equal(pack.pick('shooter','fire')?.file,'new.wav');
  slower.resolve(net());
  const stale=await a;
  assert.equal(stale.cancelled,true);assert.equal(pack.pick('shooter','fire')?.file,'new.wav');
});
test('clear invalidates pending downloads, no late sample can resurrect an old pack',async()=>{
  const {ctx}=mkctx();const slower=defer();
  const pack=new AuthorizedSamplePack(ctx,{fetcher:async()=>await slower.promise});
  const a=pack.load(manifest([clip()]),{baseURL:'.'});
  pack.clear();slower.resolve(net());
  assert.equal((await a).cancelled,true);assert.equal(pack.stats().clips,0);
});
test('replacement credits old cache cost before budget check, duplicate file decodes once',async()=>{
  const {ctx,decodeCount}=mkctx(4096);let downloads=0;
  const pack=new AuthorizedSamplePack(ctx,{maxBytes:33000,fetcher:async()=>{downloads++;return net();}});
  await pack.load(manifest([clip()]),{baseURL:'.'});
  const replacement=await pack.load(manifest([clip('shooter','fire','new.wav')]),{baseURL:'.',replace:false});
  assert.equal(replacement.loaded,1);assert.equal(replacement.rejected,0);
  assert.equal(pack.stats().bytes,4096*2*4);
  const full=await pack.load(manifest([
    clip('shooter','fire','shared.wav',{variant:0}),clip('shooter','fire','shared.wav',{variant:1})]),{baseURL:'.'});
  assert.equal(full.loaded,2);assert.equal(full.rejected,0); // Two variants share one PCM, now both fit within 33 KiB.
  assert.equal(downloads,3);assert.equal(decodeCount(),3); // Shared file decoded only once.
  assert.equal(pack.pick('shooter','fire',0)?.variant,0);
  assert.equal(pack.pick('shooter','fire',1)?.variant,1);
  assert.equal(pack.stats().bytes,4096*2*4,'alias variants consume one decoded buffer');
});
test('loop samples with a discontinuity are repaired per channel; opt-out preserves original',async()=>{
  const {ctx}=mkctx(4800);
  ctx.decodeAudioData=async()=>{
    const b=ctx.createBuffer(2,4800,48000);
    for(let c=0;c<2;c++){const x=b.getChannelData(c);x.fill(.12);x[0]=.95;x[x.length-1]=-.8;}
    return b;
  };
  const pack=new AuthorizedSamplePack(ctx,{fetcher:async()=>net()});
  let result=await pack.load(manifest([clip('roller','roll','loop.wav')]),{baseURL:'.'});
  assert.equal(result.repairedLoops,1);
  let row=pack.pick('roller','roll');for(let c=0;c<2;c++){
    const x=row.buffer.getChannelData(c);assert.ok(Math.abs(x[0]-x.at(-1))<.000001);
  }
  result=await pack.load(manifest([clip('roller','roll','loop.wav',{seamlessLoop:false})]),{baseURL:'.'});
  assert.equal(result.repairedLoops,0);
  row=pack.pick('roller','roll');assert.ok(Math.abs(row.buffer.getChannelData(0)[0]-row.buffer.getChannelData(0).at(-1))>1);
});
test('relative-only imports reject traversal, remote URLs, malformed loop and untrusted records',()=>{
  const c=clip();
  for(const spec of [
    {...c,file:'../escape.wav'}, {...c,file:'evil//asset.wav'}, {...c,file:'tmp/./x.wav'},
    {...c,file:'https://example.com/clip.wav'}, {...c,file:'good.wav?download'},
    {...c,loopStart:0.2}, {...c,loopStart:0.1,loopEnd:0.2,seamlessLoop:'yes'},
    {...c,sha256:'broken'}, {...c,variant:NaN}
  ])assert.throws(()=>validateAuthorizedManifest(manifest([spec])));
  const {ctx}=mkctx();const pack=new AuthorizedSamplePack(ctx,{fetcher:async()=>net()});
  for(const baseURL of ['https://www.bad.example','//www.bad.example','../up','./ok?token=x','/absolute','file:foo'])
    assert.rejects(()=>pack.load(manifest([c]),{baseURL}),/local path/);
});
test('fatal import errors never drop existing content during async decode',async()=>{
  const {ctx}=mkctx();let good=true;ctx.decodeAudioData=async()=>{
    if(!good)throw new Error('decode failed');return ctx.createBuffer(1,2000,48000);
  };
  const pack=new AuthorizedSamplePack(ctx,{fetcher:async()=>net()});
  await pack.load(manifest([clip()]));const prev=pack.pick('shooter','fire');
  good=false;
  const result=await pack.load(manifest([clip('shooter','fire','oops.wav')]),{replace:false});
  assert.equal(result.rejected,1);assert.equal(pack.pick('shooter','fire'),prev);
});
test('sound bank prioritizes authorized sample with no unnecessary synthetic cold render',async()=>{
  const {ctx}=mkctx();let count=0;ctx.createBufferSource=()=>({playbackRate:{value:1,setTargetAtTime(){}},connect(){},start(){count++}});ctx.createGain=()=>({gain:{value:1},connect(){}});
  const bank=new WeaponSoundBank(ctx);bank.authorized.fetcher=async()=>net();
  await bank.authorized.load(manifest([clip()]));
  const def=bank.resolve('main:shooter:fire');const v={ctx,out:{},t:1,nodes:[],srcs:[],end:0,endless:false};
  def.build(v,1);
  assert.equal(count,1);assert.equal(bank.misses,0);bank.dispose();
});
test('weapon switch moves local firing samples before stale background warm jobs',()=>{
  const {ctx}=mkctx();
  const bank=new WeaponSoundBank(ctx);
  // Deliberately disable immediate pumping; we are inspecting the bounded admission queue.
  bank._pump=()=>{};
  for(const id of ['shooter','blaster','roller','charger','dualies','splatling'])bank.warm(id,{focus:false});
  assert.ok(bank.jobs.length>20);
  bank.warm('s3-roller-heavy',{focus:true});
  assert.equal(bank.jobs[0][0],'s3-roller-heavy');
  assert.equal(bank.jobs[0][1],'fire');
  assert.equal(bank.jobs[1][2],1);
  assert.ok(bank.pending.size<=256);
  bank.dispose();
});
test('pending cache bounded after all 65 preloads, newest local weapon remains warmable',async()=>{
  const {ctx}=mkctx();const {WEAPON_AUDIO}=await import('../runtime/audio/weapon-recipes.mjs');
  const bank=new WeaponSoundBank(ctx);bank._pump=()=>{};
  for(const id of Object.keys(WEAPON_AUDIO))bank.warm(id,{focus:false});
  assert.equal(bank.pending.size,256);
  bank.warm('s3-saber-heavy',{focus:true});
  assert.ok(bank.jobs.some(job=>job[0]==='s3-saber-heavy'&&job[1]==='fire'));
  assert.ok(bank.pending.size<=256);
  bank.dispose();
});
