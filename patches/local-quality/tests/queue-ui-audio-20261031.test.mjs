import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptQueueUiAudio20261031} from '../queue-ui-audio-20261031-adapter.mjs';
import {AuthorizedSamplePack} from '../../splatoon3/runtime/audio/authorized-samples.mjs';
import {installWeaponAudioEngine} from '../../splatoon3/runtime/audio/engine.mjs';
import {installAudioLoopDedupe} from '../platform-audio.mjs';
import {installFiniteAudioInputs} from '../../splatoon3/runtime/audio/output-safety.mjs';

const manifest=clips=>({schema:1,usageRights:'Deterministic original synthetic fixtures',clips});
const body=()=>new Uint8Array([1,2,3,4]).buffer;
const hash=createHash('sha256').update(new Uint8Array(body())).digest('hex');
const clip=(file,variant=0,extra={})=>({id:'shooter',event:'fire',file,variant,sha256:hash,...extra});
function pcm(length=256,channels=1){
  const data=Array.from({length:channels},()=>new Float32Array(length));
  return {length,numberOfChannels:channels,sampleRate:8000,duration:length/8000,getChannelData:c=>data[c]};
}
function packFixture({maxBytes=4096,failures=[],decoded=()=>pcm()}={}){
  const fetched=[],buffers=[];
  const ctx={state:'running',sampleRate:8000,async decodeAudioData(){const b=decoded();buffers.push(b);return b;},
    createBuffer(){assert.fail('these fixtures do not require seam repair');}};
  const pack=new AuthorizedSamplePack(ctx,{maxBytes,fetcher:async url=>{
    fetched.push(url);return failures.some(x=>url.endsWith(x))?{ok:false,status:404}:
      {ok:true,headers:{get:()=>null},arrayBuffer:async()=>body()};
  }});
  return {pack,ctx,fetched,buffers};
}
test('parallel compatible different filenames share verified PCM and keep every logical row',async()=>{
  for(const concurrency of [1,2,3,4]){
    const f=packFixture(),clips=Array.from({length:4},(_,i)=>clip(`voice-${i}.mp3`,i,{gain:.5+i*.1}));
    const result=await f.pack.load(manifest(clips),{concurrency});
    assert.equal(result.loaded,4);assert.equal(result.rejected,0);
    assert.equal(f.fetched.length,1);assert.equal(f.buffers.length,1);
    assert.equal(new Set([...f.pack.loaded.values()].map(r=>r.buffer)).size,1);
    assert.equal(result.bytes,1024);assert.deepEqual([...f.pack.loaded.values()].sort((a,b)=>a.variant-b.variant).map(r=>r.gain),clips.map(c=>c.gain));
    assert.equal(f.pack.pending,0);assert.equal(f.pack._loadScopes.size,0);
  }
});
test('two failed same-hash source paths cannot suppress a third valid parallel source',async()=>{
  const f=packFixture({failures:['bad-a.mp3','bad-b.mp3']});
  const result=await f.pack.load(manifest([clip('bad-a.mp3'),clip('bad-b.mp3',1),clip('good.mp3',2)]),{concurrency:3});
  assert.equal(result.loaded,1);assert.equal(result.rejected,2);
  assert.equal(f.fetched.length,3);assert.equal(f.buffers.length,1);
  assert.equal(f.pack.pick('shooter','fire').file,'good.mp3');assert.equal(f.pack.pending,0);
});
test('different loop metadata and unsigned files remain independent; mismatch never decodes',async()=>{
  const f=packFixture();
  const result=await f.pack.load(manifest([clip('a.mp3'),clip('b.mp3',1,{seamlessLoop:false}),
    clip('c.mp3',2,{sha256:undefined}),clip('bad.mp3',3,{sha256:'f'.repeat(64)})]),{concurrency:4});
  assert.equal(result.loaded,3);assert.equal(result.rejected,1);
  assert.equal(f.fetched.length,4);assert.equal(f.buffers.length,3);assert.match(result.errors[0].error,/Checksum/);
});
test('over-budget PCM is rejected before channel scans, while admissible poison remains rejected',async()=>{
  let scans=0;
  const f=packFixture({maxBytes:1024,decoded:()=>({...pcm(257),getChannelData(){scans++;throw Error('must not scan');}})});
  const rejected=await f.pack.load(manifest([clip('big.mp3')]));
  assert.equal(rejected.loaded,0);assert.match(rejected.errors[0].error,/budget/);assert.equal(scans,0);
  const at=packFixture({maxBytes:1024});assert.equal((await at.pack.load(manifest([clip('at.mp3')]))).loaded,1);
  const poison=packFixture({maxBytes:1024,decoded:()=>{const b=pcm();b.getChannelData(0)[255]=NaN;return b;}});
  assert.equal((await poison.pack.load(manifest([clip('poison.mp3')]))).loaded,0);
});
test('direct main playback checks source residency on every admission, including after eviction',()=>{
  class Engine { _def(){} play(name,options){this.calls.push({name,options});return {name};} }
  installWeaponAudioEngine(Engine);
  const e=new Engine(),loads=[];e.calls=[];
  const bank={authorized:{byEvent:new Map()},audibleShotFallback:true,has:()=>true};
  e.weaponBank=()=>bank;e._realS3Loader={declares:()=>true,ensure:(id,event)=>loads.push([id,event])};
  assert.equal(e.play('main:shooter:fire',{actor:{isLocal:true}}),null);assert.equal(e.calls.length,0);assert.equal(loads.length,1);
  bank.authorized.byEvent.set('shooter:fire',[{}]);assert.ok(e.play('main:shooter:fire'));assert.equal(e.calls.length,1);
  bank.authorized.byEvent.clear();assert.equal(e.play('main:shooter:fire'),null);assert.equal(e.calls.length,1);
  e._realS3Loader.declares=()=>false;
  assert.ok(e.play('main:s3-spinner-hyper:fire',{actor:{isLocal:true}}));
  assert.equal(e.play('main:s3-spinner-hyper:fire',{actor:{isLocal:false}}),null);
  assert.equal(e.play('main:shooter:fire',{actor:{isLocal:true}}),null);
  assert.ok(e.play('ui_confirm'));
});
function loopRig(name,initial=1){
  const raw=fs.readFileSync(new URL('../../../inkwave-public/src/audio/audio.js',import.meta.url),'utf8');
  const code=adaptQueueUiAudio20261031('src/audio/audio.js',adaptBuildSource('src/audio/audio.js',raw,{queueUiAudio20261031:false}));
  const cls=parse(code,{ecmaVersion:'latest',sourceType:'module'}).body.find(n=>n.type==='ExportNamedDeclaration'&&n.declaration?.id?.name==='AudioEngine').declaration;
  const methods=cls.body.body.filter(n=>['loop','_requestSfxLoop','_activateSfxReq','_loopLive'].includes(n.key.name));
  const C=vm.runInNewContext(`(class {${methods.map(n=>code.slice(n.start,n.end)).join('\n')}})`,{console,MAX_LOOPS:24,NOOP_HANDLE:{playing:false,set(){},stop(){}}});
  const e=new C(),rates=[];e.ctx={currentTime:0};e.loops=new Set();e._sfxReq=new Set();e.counts={dropped:0};e._sfxSilent=()=>false;
  e._def=()=>({gain:.5,progressControlled:name.startsWith('spinnerClip:'),loop:(_v,p)=>{rates.push(p);return {pitch:q=>rates.push(q)};}});
  const param={setValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(){}};
  e._voice=()=>({v:{dead:false,kill(){},dispose(){},finish(){}},out:{gain:param},fade:{gain:param}});
  e._setPos=()=>{};installAudioLoopDedupe(C);installFiniteAudioInputs(C);
  return {rates,handle:e.loop(name,{pitch:initial})};
}
test('composed mixer and both outer wrappers preserve zero Spinner targets and ordinary clamps',()=>{
  for(const hz of [30,60,120]){
    const f=loopRig('spinnerClip:splatling');f.handle.set({pitch:0});
    for(let i=0;i<hz*10;i++)f.handle.set({pitch:0});f.handle.set({pitch:.3});
    assert.deepEqual(f.rates,[1,0,.3]);
    const zero=loopRig('spinnerClip:splatling',0);zero.handle.set({pitch:0});assert.deepEqual(zero.rates,[0]);
    const normal=loopRig('swim');normal.handle.set({pitch:0});assert.deepEqual(normal.rates,[1,.05]);
  }
});

import {handleOwnerClockMessage,closeOwnerClock} from '../../network-replication/owner-clock.mjs';
import {playProgressCharge} from '../../splatoon3/runtime/audio/progress-charge-playback.mjs';
import {spinnerPreload,spinnerCached,spinnerReleaseCache,spinnerCacheStats} from '../../splatoon3/runtime/audio/spinner-charge-clips.mjs';
import {spinnerChargeAudioLoop} from '../../splatoon3/runtime/audio/spinner-charge-control.mjs';
import {installGyroQuality} from '../gyro.mjs';
import {prewarmGrainTextures,cancelGrainPrewarm,installGrainPrewarmCleanup} from '../../splatoon3/runtime/audio/grain-prewarm.mjs';
import {ReverbPrewarm} from '../../splatoon3/runtime/audio/reverb-prewarm.mjs';
import {renderReverbPair} from '../../splatoon3/runtime/audio/reverb-impulse.mjs';

function composed(rel){return adaptBuildSource(rel,fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8'));}
function methods(code,names,globals={}){
  const ast=parse(code,{ecmaVersion:'latest',sourceType:'module'}),classes=ast.body.map(n=>n.declaration||n).filter(n=>n.type==='ClassDeclaration');
  const c=classes.find(n=>names.every(k=>n.body.body.some(m=>m.key.name===k)));assert.ok(c,'actual composed class owns requested methods');
  return vm.runInNewContext(`(class {${c.body.body.filter(n=>names.includes(n.key.name)).map(n=>code.slice(n.start,n.end)).join('\n')}})`,globals);
}
test('OCA rejected and throwing sends preserve retry admission; accepted replies alone start cooldown',()=>{
  const sent=[];let accepted=false,throws=false;
  const nm={myId:'me',cfg:{id:'round'},match:{},peers:new Map(),s:{ownerClockVersion:1,_members:new Map([['peer','peer']]),tr:{sendTo(to,p){sent.push([to,p]);if(throws)throw Error('socket');return accepted;}}}};
  const q={k:'ocq',v:1,m:'round',n:'a'.repeat(32)};
  handleOwnerClockMessage(nm,'peer',q,1);assert.equal(sent.length,1);
  throws=true;handleOwnerClockMessage(nm,'peer',q,1.05);assert.equal(sent.length,2);
  throws=false;accepted=true;handleOwnerClockMessage(nm,'peer',q,1.1);assert.equal(sent.length,3);
  handleOwnerClockMessage(nm,'peer',q,1.2);assert.equal(sent.length,3);
  handleOwnerClockMessage(nm,'peer',q,1.36);assert.equal(sent.length,4);
  handleOwnerClockMessage(nm,'peer',{...q,m:'old-round'},2);assert.equal(sent.length,4);
  closeOwnerClock(nm);handleOwnerClockMessage(nm,'peer',q,3);assert.equal(sent.length,4);
});
test('actual heartbeat preserves accepted oldest RTT origin, interval, backpressure and timeout',()=>{
  let at=3000,tick,period,closed=0;const wire=[];
  const C=methods(composed('src/net/transport.js'),['_startPing','_stopPing','_raw'],{performance:{now:()=>at},setInterval(fn,ms){tick=fn;period=ms;return 1;},clearInterval(){},utf8ByteLength:s=>Buffer.byteLength(s)});
  const tr=new C();tr.ws={readyState:1,bufferedAmount:600000,send:s=>wire.push(s)};tr.bytesOut=0;tr._pingSent=0;tr._disconnect=()=>{tr.ws=null;};tr.onClose=()=>closed++;
  tr._startPing();assert.equal(tr._pingSent,0);assert.equal(period,2000);assert.equal(tr._heartbeatDeadline,23000);
  at=5000;tr.ws.bufferedAmount=0;tick();assert.equal(tr._pingSent,5000);
  at=7000;tick();assert.equal(tr._pingSent,5000);assert.deepEqual(wire,['ping','ping']);
  tr._pingSent=0;tr.ws.bufferedAmount=600000;at=9000;tick();assert.equal(tr._pingSent,0);
  for(at=11000;at<=23000;at+=2000)tick();assert.equal(closed,1);assert.equal(tr.ws,null);
});
function audioParam(value=0){return {value,calls:[],cancelScheduledValues(t){this.calls.push(['cancel',t]);},setValueAtTime(v,t){this.value=v;this.calls.push(['set',v,t]);},linearRampToValueAtTime(v,t){this.value=v;this.calls.push(['ramp',v,t]);}};}
test('recorded Charger stalls enqueue zero additional settled gain/rate targets at 30/60/120Hz',()=>{
  for(const hz of [30,60,120]){
    const sources=[],gains=[],ctx={state:'running',sampleRate:8000,currentTime:0,
      createBufferSource(){const s={playbackRate:audioParam(1),connect(){},disconnect(){},start(){},stop(){}};sources.push(s);return s;},
      createGain(){const g={gain:audioParam(),connect(){},disconnect(){}};gains.push(g);return g;}};
    const h=playProgressCharge({ctx,sfxIn:{}},pcm(16000),{length:1.215,progress:.5,chargeTime:1});
    ctx.currentTime=1/hz;h.set({progress:.5});const rates=sources[0].playbackRate.calls.length,levels=gains[0].gain.calls.length;
    for(let i=2;i<=hz*10;i++){ctx.currentTime=i/hz;h.set({progress:.5});}
    assert.equal(sources[0].playbackRate.value,0);assert.equal(sources[0].playbackRate.calls.length,rates);assert.equal(gains[0].gain.calls.length,levels);
    ctx.currentTime+=1/hz;h.set({progress:.5+1/hz});assert.ok(Math.abs(sources[0].playbackRate.value-1)<1e-12);assert.equal(gains[0].gain.value,.55);
    ctx.currentTime+=1/hz;h.set({progress:.5+2/hz,volume:.2});assert.equal(gains[0].gain.value,.2);h.stop();assert.equal(h.playing,false);
  }
});
test('gyro fast-path retains one owned copy visible to calibration and refreshes changed post-sample values',()=>{
  let copies=0,calibrated;
  class Gyro{
    constructor(){Object.assign(this,{enabled:true,_src:'ori',_hasQ:false,_tQ:0,_q:[0,0,0,1],_sm:{y:0,p:0},dYaw:0,dPitch:0,_platformSensorStart:0,_platformGyroAccess:{sample(){},motionPermission:'granted'}});this._q.slice=function(){copies++;return Array.prototype.slice.call(this);};}
    start(){}stop(){}resync(){}discard(){}_sample(){}
    _calibrate(){calibrated=this._qualityGyro.boundary?.q.slice();this.hook?.();}
    _orientation(e){this._q[0]=e.alpha;if(this._hasQ){this._sample(0,0,0,.016);this._calibrate();}this._tQ=e.timeStamp;this._hasQ=true;}
  }
  installGyroQuality(Gyro,()=>0,()=>false,{document:{hidden:false},performance:{now:()=>1000}});
  const g=new Gyro(),event=(time,alpha)=>({timeStamp:time,alpha,beta:0,gamma:0});g._orientation(event(1000,0));copies=0;
  g._orientation(event(1016,.1));assert.equal(copies,1);assert.equal(calibrated[0],.1);assert.notEqual(g._qualityGyro.boundary.q,g._q);assert.equal(g._qualityGyro.eventSlots[0].boundary,null);
  copies=0;g.hook=()=>g._q[0]=-.2;g._orientation(event(1032,.2));assert.equal(copies,2);assert.equal(calibrated[0],.2);assert.equal(g._qualityGyro.boundary.q[0],-.2);
});
test('high-rate Spinner keeps a valid recording with a hard context-sized LRU budget',async()=>{
  const ctx={state:'running',sampleRate:192000,currentTime:0};let next;
  const make=n=>{const data=[new Float32Array(n),new Float32Array(n)];return {sampleRate:192000,length:n,numberOfChannels:2,duration:n/192000,getChannelData:c=>data[c]};};
  ctx.decodeAudioData=async()=>next;const e={ctx};next=make(409600);
  await spinnerPreload(e,'splatling',{fetcher:async()=>({ok:true,arrayBuffer:async()=>body()})});assert.equal(spinnerCached(e,'splatling'),next);
  next=make(510000);await spinnerPreload(e,'s3-spinner-hypershort',{fetcher:async()=>({ok:true,arrayBuffer:async()=>body()})});
  assert.equal(spinnerCached(e,'splatling'),null);assert.equal(spinnerCached(e,'s3-spinner-hypershort'),next);assert.ok(spinnerCacheStats(e).bytes<=spinnerCacheStats(e).limit);
  let reads=0;next={sampleRate:192000,length:600000,numberOfChannels:2,duration:600000/192000,getChannelData(){reads++;throw Error('no scan');}};
  await assert.rejects(spinnerPreload(e,'s3-spinner-quick',{fetcher:async()=>({ok:true,arrayBuffer:async()=>body()})}),/oversized/);assert.equal(reads,0);spinnerReleaseCache(e);
});
test('grain prewarm remains idle under mute, resumes once, and cancels a newly muted pending generation',async()=>{
  let warm=0,worker=0;
  class E{constructor(){this.ctx={state:'running',sampleRate:8000};this.muted=true;} _sfxSilent(){return this.muted;} setVolumes(v){this.muted=v.muted;} _warm(){warm++;} disposeWeaponAudio(){}}
  installGrainPrewarmCleanup(E);const e=new E();
  assert.equal(prewarmGrainTextures(e,null,{workerFactory(){worker++;},delay:0}),true);assert.equal(worker,0);assert.equal(e._grainWarmDeferred,true);
  e.setVolumes({muted:false});e.setVolumes({muted:false});assert.equal(warm,1);
  assert.equal(prewarmGrainTextures(e,null,{workerFactory(){worker++;return {postMessage(){},terminate(){}};},delay:20}),true);
  e.setVolumes({muted:true});await new Promise(r=>setTimeout(r,25));assert.equal(worker,0);assert.equal(e._grainPrewarm,null);
  e.disposeWeaponAudio();e.setVolumes({muted:false});assert.equal(warm,1);cancelGrainPrewarm(e);
});
test('music-disabled known-rate reverb only renders and publishes the identical SFX recipe',()=>{
  for(const rate of [44100,48000,96000]){
    const full=renderReverbPair(rate),sfx=renderReverbPair(rate,false);assert.equal(sfx.length,1);assert.deepEqual(sfx[0],full[0]);
    const worker={postMessage(m){this.job=m;},terminate(){}},warm=new ReverbPrewarm({sampleRate:rate,includeMusic:false,workerFactory:()=>worker});
    assert.equal(worker.job.sampleRate,rate);assert.equal(worker.job.includeMusic,false);worker.onmessage({data:{...worker.job,pair:sfx}});
    const pair=warm.take({sampleRate:rate,createBuffer(ch,n){const a=Array.from({length:ch},()=>new Float32Array(n));return {getChannelData:c=>a[c]};}},false);
    assert.equal(pair.length,1);assert.deepEqual(pair[0].getChannelData(0),full[0][0]);warm.dispose();
  }
});
test('rejected frame-clock sharing has a concrete 0.5-second resync counterexample in actual peer advance',()=>{
  const code=composed('src/net/netmatch.js'),a=methods(code,['_advance'],{now:()=>10.601}),b=methods(code,['_advance'],{now:()=>10.599});
  const state=()=>({init:true,want:.1,delay:.1,off:0,tr:10,lastTs:11,rate:1}),old=state(),candidate=state();
  a.prototype._advance(old,1/60);b.prototype._advance(candidate,1/60);
  assert.equal(old.tr,10.601-.1);assert.ok(candidate.tr<10.1);assert.notEqual(old.tr,candidate.tr);
});
test('rejected muted Spinner deferral changes the first admitted source from premix to native Motor',async t=>{
  t.mock.method(globalThis,'fetch',()=>new Promise(()=>{}));
  const make=()=>{const e={ctx:{state:'running',sampleRate:8000,currentTime:0,decodeAudioData:async()=>pcm(24000)},voices:[],loop(name){this.voices.push(name);return {playing:true,set(){},stop(){}};}};return e;};
  const ready=make(),cold=make(),opts={actor:{isLocal:true,weapon:{chargeTime:1},weaponRunner:{charge:0,s3ChargeAudioProgress:0}}};
  await spinnerPreload(ready,'splatling',{fetcher:async()=>({ok:true,arrayBuffer:async()=>body()})});
  const native=e=>()=>{e.voices.push('native:Motor');return {playing:true,set(){},stop(){}};};
  const a=spinnerChargeAudioLoop(ready,'splatling',opts,native(ready)),b=spinnerChargeAudioLoop(cold,'splatling',opts,native(cold));
  assert.deepEqual(ready.voices,['spinnerClip:splatling']);assert.deepEqual(cold.voices,['native:Motor']);a.stop();b.stop();spinnerReleaseCache(ready);spinnerReleaseCache(cold);
});
test('rejected muted BGM priming removal loses delayed playback under a gesture-only media policy',async()=>{
  const code=fs.readFileSync(new URL('../../../inkwave-public/src/audio/streamedTrack.js',import.meta.url),'utf8');
  const Stream=vm.runInNewContext(code.replace('export class StreamedTrack','class StreamedTrack')+'\nStreamedTrack',{setTimeout,clearTimeout});
  let gesture=true,failures=0;const element=()=>({allowed:false,addEventListener(){},removeEventListener(){},play(){if(gesture||this.allowed){this.allowed=true;return Promise.resolve();}return Promise.reject(Error('NotAllowedError'));},pause(){},removeAttribute(){},load(){}});
  const node=()=>({gain:audioParam(),connect(){},disconnect(){}}),engine={ctx:{createGain:node,createMediaElementSource:node},mix:{},now:()=>0};
  const primed=new Stream(engine,'battle',{bpm:100},element(),()=>failures++);primed.prime();gesture=false;primed.fadeIn(0,.01);await Promise.resolve();assert.equal(failures,0);
  const deferred=new Stream(engine,'battle',{bpm:100},element(),()=>failures++);deferred.fadeIn(0,.01);await Promise.resolve();assert.equal(failures,1);primed.dispose();deferred.dispose();
});
