import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {installAudioSpatialDsp} from '../runtime/audio/spatial-dsp.mjs';
import {installAudioLoopDedupe,installAudioPlatform} from '../../local-quality/platform-audio.mjs';
import {audioEmitterKey,selectVictim,WeaponSoundBank} from '../runtime/audio/bank.mjs';
import {compactInstalledAudioManifest} from '../../../scripts/lib/inkwave-audio-manifest.mjs';
import {installWeaponAudioRuntime} from '../runtime/audio/runtime.mjs';

const raw=fs.readFileSync(new URL('../../../inkwave-public/src/audio/audio.js',import.meta.url),'utf8');
const code=adaptBuildSource('src/audio/audio.js',raw),ast=parse(code,{ecmaVersion:'latest',sourceType:'module'});
const cls=ast.body.find(n=>n.type==='ExportNamedDeclaration'&&n.declaration?.id?.name==='AudioEngine').declaration;
const names=new Set(['_dist','_panner','_setPos','_sendScale','_voice','setListener','play','loop','_activateSfxReq','_requestSfxLoop','_loopLive','_sfxSilent','_steal']);
const methods=cls.body.body.filter(n=>names.has(n.key.name)).map(n=>code.slice(n.start,n.end)).join('\n');
const cutoff=d=>d<10?22000:Math.max(900,22000*Math.pow(.5,(d-10)/13));
const finite=p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
function fixture({legacy=false}={}){
  const events=[];
  const param=(label)=>({value:0,setTargetAtTime(...a){events.push([label,...a]);this.value=a[0];},setValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){}});
  const node=(kind)=>({connect(){},disconnect(){},gain:param(kind+':gain')});
  class Voice{constructor(ctx,out,t){this.ctx=ctx;this.out=out;this.t=t;this.nodes=[];this.srcs=[];this.end=t;this.dead=false;}
    dispose(){this.dead=true;this.ondispose?.();}finish(){}kill(){this.dispose();}}
  const C=vm.runInNewContext('(class{'+methods+'})',{V:Voice,distCut:cutoff,validPos:finite,audioEmitterKey,selectVictim,taper:v=>Math.pow(Math.min(1,Math.max(0,+v||0)),1.5),MAX_VOICES:48,RESOLVE_WEAPON_OCCLUSION:Symbol.for('inkwave.weapon-audio.resolve-occlusion'),MAX_LOOPS:24,NOOP_HANDLE:{playing:false,set(){},stop(){}},console});
  // The native listener method is replaced by an imported helper in composition.
  C.prototype.setListener=function(pos){if(finite(pos)){this.L.x=pos.x;this.L.y=pos.y;this.L.z=pos.z;}};
  installAudioSpatialDsp(C,cutoff);installAudioLoopDedupe(C);
  const e=new C();e.L={x:0,y:0,z:0};e.rng=()=>.5;e._sfxReq=new Set();e.vol={master:1,sfx:1};e.voices=[];e.loops=new Set();e.last=new Map();e.byName=new Map();e.counts={played:0,dropped:0,stolen:0};
  e.ctx={state:'running',currentTime:0,createGain:()=>node('gain'),createBiquadFilter(){return{...node('filter'),frequency:param('cutoff'),Q:{value:0}};},createPanner(){return legacy?{...node('panner'),setPosition(...a){events.push(['pos',...a]);}}:{...node('panner'),positionX:param('x'),positionY:param('y'),positionZ:param('z')};}};
  e.sfxIn=node('sfx');e.revSend=node('reverb');e._def=()=>({gain:1,reverb:.08,ref:3,minGap:.1,build(){},loop(){return{};}});
  return{e,events};
}

for(const legacy of [false,true])test('listener-only movement refreshes stationary voice DSP; stationary position automation stays quiet '+legacy,()=>{
  const{e,events}=fixture({legacy});const pos={x:32,y:0,z:0};const h=e.loop('loop',{pos});
  events.length=0;
  e.setListener({x:30,y:0,z:0});
  assert.equal(events.find(x=>x[0]==='cutoff')[1],22000);
  assert.equal(events.find(x=>x[0]==='gain:gain')[1],.08);
  assert.equal(events.some(x=>['x','y','z','pos'].includes(x[0])),false);
  events.length=0;e.setListener({x:30,y:0,z:0});h.set({pos});assert.equal(events.length,0);
  h.stop();events.length=0;e.setListener({x:0,y:0,z:0});assert.equal(events.length,0,'retired loops release their spatial registry entry');
});
test('moving sources use current-distance reverb, retain copied positions and honor occlusion cutoff',()=>{
  const{e,events}=fixture();const p={x:32,y:0,z:0};const v=e.play('sound',{pos:p,occlusion:.78});
  p.x=0;events.length=0;e._setPos(v,p,0);
  assert.equal(v.rev,.08);assert.equal(v.lp.frequency.value,22000*Math.pow(.055,.78));
  const n=events.length;e._setPos(v,p,0);assert.equal(events.length,n);
  p.x=60;e._setPos(v,p,0);assert.equal(v.rev,.33);assert.equal(v.send.gain.value,.33*e._sendScale(60));
  const t=e.play('zero',{pos:{x:0,y:0,z:0},emitter:'other'});t.v.dispose();assert.equal(e.voices.includes(t),false);
  v.v.dispose();assert.equal(e.byName.size,0,'per-emitter completed voice lists are removed');
});
test('priority rejection and failed builds do not consume the next audible emitter min-gap',()=>{
  const{e}=fixture();e.voices=Array.from({length:48},()=>({priority:100,v:{dead:false}}));
  const options={actor:{},priority:1};assert.equal(e.play('sound',options),null);assert.equal(e.last.size,0);
  e.voices=[];assert.ok(e.play('sound',options));assert.equal(e.last.size,1);
  assert.equal(e.play('sound',options),null,'successful play still collapses same-emitter events');
  e.ctx.currentTime=1;e._def=()=>({gain:1,build(){throw Error('fixture build failure');}});
  const failing={actor:{},priority:1};const before=e.last.size;assert.equal(e.play('broken',failing),null);assert.equal(e.last.size,before);
});
test('four recorded brush variants are reachable; three-variant and explicit selection remain stable',()=>{
  const picked=[];const ctx={state:'running',sampleRate:48000,createBufferSource(){return{connect(){},start(){picked.push(this.buffer.variant);},playbackRate:{value:1,setTargetAtTime(){}}};}};
  const bank=new WeaponSoundBank(ctx,{realOnly:true});
  const list=n=>Array.from({length:n},(_,variant)=>({id:'s3-brush-mini',event:'fire',variant,gain:1,buffer:{variant,duration:.1}}));
  bank.authorized.byEvent.set('s3-brush-mini:fire',list(4));const d=bank.resolve('main:s3-brush-mini:fire');
  const voice=()=>({ctx,out:{},t:0,nodes:[],srcs:[],end:0});
  for(let i=0;i<8;i++)d.build(voice(),1);assert.deepEqual(picked,[0,1,2,3,0,1,2,3]);
  picked.length=0;bank.authorized.byEvent.set('s3-brush-mini:fire',list(3));bank.roundRobin.clear();
  for(let i=0;i<6;i++)d.build(voice(),1);assert.deepEqual(picked,[0,1,2,0,1,2]);
  bank.authorized.byEvent.set('s3-brush-mini:fire',list(4));d.build(voice(),1,{variant:3});assert.equal(picked.at(-1),3);bank.dispose();
});
test('compact runtime manifest preserves every playback field and full provenance source remains available',()=>{
  const source=JSON.parse(fs.readFileSync(new URL('../runtime/audio/real-s3-installed.json',import.meta.url)));
  const generated=JSON.parse(compactInstalledAudioManifest(JSON.stringify(source)));
  assert.equal(generated.clips.length,420);
  assert.ok(JSON.stringify(generated).length<JSON.stringify(source).length*.4);
  assert.ok(source.clips.some(c=>c.sourceURL));assert.match(generated.provenance.sourceManifestSha256,/^[0-9a-f]{64}$/);
});

function target(){const listeners=new Map();return{addEventListener(n,f){if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(f);},removeEventListener(n,f){listeners.get(n)?.delete(f);},send(n){for(const f of [...(listeners.get(n)||[])])f({isTrusted:true,type:n});}};}
test('hidden lifecycle supersedes never-settling resume and stale completion cannot clear a newer owner',async()=>{
  const document=Object.assign(target(),{hidden:false,hasFocus:()=>true}),env=Object.assign(target(),{document,navigator:{},screen:{orientation:target()}});
  class Engine{constructor(ctx){this.ctx=ctx;}}
  installAudioPlatform(Engine,env);
  let resolveOld;let resumes=0,suspends=0;
  const ctx=Object.assign(target(),{state:'suspended',resume(){resumes++;if(resumes===1)return new Promise(r=>resolveOld=r);this.state='running';return Promise.resolve();},suspend(){suspends++;this.state='suspended';return Promise.resolve();}});
  const e=new Engine(ctx);e.resume();env.send('touchend');assert.equal(ctx.state,'running');
  document.hidden=true;document.send('visibilitychange');assert.equal(suspends,1);assert.equal(ctx.state,'suspended');
  await Promise.resolve();ctx.state='running';resolveOld();await Promise.resolve();await Promise.resolve();
  assert.equal(ctx.state,'suspended','late resume settlement is immediately reconciled to hidden state');
  document.hidden=false;document.send('visibilitychange');await Promise.resolve();assert.equal(ctx.state,'running');e.disposePlatform();
});

test('weapon obstruction cache refreshes either moving endpoint and idle roller updates do not read velocity',()=>{
  const events=new Map(),occlusions=[];let probes=0,velReads=0,clear=true;
  class Actor{setWeapon(){} _startSpecial(){} _updateSpecial(){}}
  class WeaponRunner{reset(){} update(){}}
  class Projectiles{throwBomb(){} _push(){} _blastBurst(){}}
  const resolve=Symbol.for('inkwave.weapon-audio.resolve-occlusion');
  const G={time:1,camera:{position:{x:0,y:0,z:0}},physics:{los(){probes++;return clear;}},audio:{ctx:{state:'running'},play(){},playWeapon(_id,_event,o){o[resolve]?.(o);occlusions.push(o.occlusion);},loopWeapon(){return{playing:true,set(){},stop(){this.playing=false;}};}}};
  installWeaponAudioRuntime({G,Actor,WeaponRunner,Projectiles,on(name,fn){events.set(name,fn);return()=>{};}});
  const a={alive:true,isLocal:false,pos:{x:2,y:0,z:0},weapon:{id:'shooter'}};
  const shot=()=>events.get('weapon:fire')({actor:a,muzzle:a.pos});shot();shot();assert.equal(probes,1);
  clear=false;G.camera.position.x=1;shot();assert.equal(probes,2);assert.equal(occlusions.at(-1),.78);
  clear=true;a.pos.x=3;shot();assert.equal(probes,3);assert.equal(occlusions.at(-1),0);
  G.time=1.11;shot();assert.equal(probes,4,'stationary source still observes the original refresh interval');
  const runner=new WeaponRunner();runner.a={alive:true,isLocal:true,form:'kid',grounded:true,pos:a.pos,weapon:{id:'s3-roller-heavy',catalogRecord:{}},get vel(){velReads++;return{x:3,z:4};}};runner.catalogState={};
  runner.update(1/60,{});assert.equal(velReads,0);
  runner.rolling=true;runner.s3RollerSuspendedHold=true;runner.update(1/60,{});assert.equal(velReads,0);
  runner.s3RollerSuspendedHold=false;runner.update(1/60,{});assert.ok(velReads>0);
});

test('one-shot LOS resolver runs only after mute, quiet volume, min-gap and voice-priority admission',()=>{
 const{e}=fixture(),resolve=Symbol.for('inkwave.weapon-audio.resolve-occlusion');let calls=0;
 const options={actor:{},pos:{x:2,y:1,z:3},priority:1,[resolve](arg){calls++;arg.occlusion=.78;}};
 e.vol.sfx=0;assert.equal(e.play('sound',options),null);assert.equal(calls,0);
 e.vol.sfx=1;assert.equal(e.play('sound',{...options,volume:0}),null);assert.equal(calls,0);
 e.voices=Array.from({length:48},()=>({priority:100,v:{dead:false}}));assert.equal(e.play('sound',options),null);assert.equal(calls,0);
 e.voices=[];const voice=e.play('sound',options);assert(voice);assert.equal(calls,1);assert.equal(voice.lp.frequency.value,22000*Math.pow(.055,.78));
 assert.equal(e.play('sound',options),null);assert.equal(calls,1);
 e.ctx.currentTime=.2;assert(e.play('sound',options));assert.equal(calls,2);
});
