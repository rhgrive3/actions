import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const built=process.env.INKWAVE_BUILT_SITE;
if(Object.hasOwn(process.env,'INKWAVE_BUILT_SITE')){
 assert.ok(built?.trim(),'INKWAVE_BUILT_SITE must name an emitted site, not fall back to source');
 const identity=JSON.parse(fs.readFileSync(path.join(built,'inkwave-build.json'),'utf8'));
 assert.match(identity.contentHash,/^[a-f0-9]{64}$/,'emitted site needs its build identity');
}
const audioRoot=built?pathToFileURL(path.resolve(built,'patches/splatoon3/runtime/audio')+path.sep):new URL('../runtime/audio/',import.meta.url);
const audioModule=name=>import(new URL(name,audioRoot));
const { EXTRA_SOURCE_FILES, SOURCE_EXTRA_AUDIO, sourceCueId }=await audioModule('source-cue-registry.mjs');
const { EXTRA_SOURCE_EVENT_ROUTES, sourceEventRoute, EXTRA_SPECIAL_ACTION_SOURCE, sourceSpecialActionRoute }=await audioModule('extra-source-routes.mjs');
const { KIT_AUDIO }=await audioModule('kit-recipes.mjs');
const { specialActionAudioEvent }=await audioModule('kit-runtime.mjs');
const { WeaponSoundBank }=await audioModule('bank.mjs');
const { validateAuthorizedManifest }=await audioModule('authorized-samples.mjs');
const { installWeaponAudioEngine }=await audioModule('engine.mjs');
const { installWeaponAudioRuntime }=await audioModule('runtime.mjs');

const dir = new URL('s3-real/',audioRoot);
const installed = JSON.parse(fs.readFileSync(new URL('real-s3-installed.json',audioRoot),'utf8'));
const original = JSON.parse(fs.readFileSync(new URL('real-s3-samples.json',audioRoot),'utf8'));
const gitBlobSha = bytes => crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');

test('every shipped 2022 MP3 is registered exactly, without guessing its game event',()=>{
  const files=fs.readdirSync(dir).filter(x=>x.endsWith('.mp3')).sort();
  const listed=[...new Set(installed.clips.map(c=>c.file.replace(/^s3-real\//,'')))].sort();
  assert.deepEqual(listed,files,'no orphan MP3 and no phantom asset');
  assert.equal(files.length,388);
  assert.equal(installed.clips.length,420);
  assert.equal(original.clips.length,274,'the original research manifest is still the original snapshot');
  assert.equal(installed.installedFiles,files.length);
  assert.equal(installed.plannedFiles,files.length);
  assert.equal(validateAuthorizedManifest(installed).length,420);
  assert.equal(EXTRA_SOURCE_FILES.length,145);
  assert.equal(Object.keys(SOURCE_EXTRA_AUDIO).length,145);
  const seen=new Set();
  for(const file of EXTRA_SOURCE_FILES){
    assert.ok(!seen.has(file),'duplicate original file '+file);seen.add(file);
    assert.match(file,/^[A-Za-z0-9_.+()-]+\.mp3$/);
    const id=sourceCueId(file),recipe=SOURCE_EXTRA_AUDIO[id];
    assert.equal(recipe?.sourceName,file);
    assert.deepEqual(recipe.events,['fire']);
    const matches=installed.clips.filter(c=>c.id===id&&c.event==='fire');
    assert.equal(matches.length,1,id+' has one source event');
    const clip=matches[0];
    assert.equal(clip.file,'s3-real/'+file);
    assert.equal(clip.sourceName,file);
    assert.match(clip.gitBlobSha,/^[0-9a-f]{40}$/);
    const bytes=fs.readFileSync(new URL(file,dir));
    assert.equal(gitBlobSha(bytes),clip.gitBlobSha,id+' immutable Git blob');
    assert.match(clip.sourceKind,/unverified/,'do not claim retail routing');
    assert.match(clip.verification,/no claimed retail/);
  }
  for(const c of original.clips)assert.ok(installed.clips.some(x=>x.id===c.id&&x.event===c.event&&x.variant===c.variant&&x.file===c.file),
    c.id+'/'+c.event+' original sound route remains unchanged');
});

test('source-only clips never synthesize or masquerade as game-specific MP3s',()=>{
  const bank=new WeaponSoundBank({sampleRate:48000},{realOnly:true,audibleShotFallback:true});
  for(const file of EXTRA_SOURCE_FILES){
    const id=sourceCueId(file);
    assert.equal(bank.has(id,'fire'),true);
    assert.equal(bank.name(id,'fire'),`main:${id}:fire`);
    assert.equal(bank.resolve(`main:${id}:fire`),null,'undecoded MP3 must stay silent');
    assert.throws(()=>bank.get(id,'fire'),/Recorded-only cue cannot generate PCM/);
  }
  assert.equal(bank.cache.size,0);
  bank.dispose();
});

test('only explicit kit routes can consume a named supplemental sound',()=>{
  assert.equal(Object.keys(EXTRA_SOURCE_EVENT_ROUTES).length,3);
  for(const [key,target] of Object.entries(EXTRA_SOURCE_EVENT_ROUTES)){
    const sep=key.lastIndexOf(':'),id=key.slice(0,sep),event=key.slice(sep+1);
    assert.ok(KIT_AUDIO[id]?.events.includes(event),key+' is an actual kit event');
    assert.ok(SOURCE_EXTRA_AUDIO[target],key+' references a registered source MP3');
    assert.ok(installed.clips.some(c=>c.id===target&&c.event==='fire'),key+' source file exists in manifest');
    assert.equal(sourceEventRoute(id,event),target);
  }
  assert.equal(Object.keys(EXTRA_SPECIAL_ACTION_SOURCE).length,10);
  for(const [key,target] of Object.entries(EXTRA_SPECIAL_ACTION_SOURCE)){
    const sep=key.indexOf(':'),id=key.slice(0,sep),action=key.slice(sep+1);
    assert.ok(SOURCE_EXTRA_AUDIO[target],key+' supplementary source exists');
    assert.ok(installed.clips.some(c=>c.id===target&&c.event==='fire'));
    assert.equal(sourceSpecialActionRoute(id,action),target);
  }
  const fullHold=installed.clips.find(c=>c.id==='special:booyahBomb'&&c.event==='spin');
  assert.equal(fullHold?.sourceName,'Sp_NiceBall_HoldFull_00.mp3');
  assert.equal(specialActionAudioEvent('booyahBomb','cheer'),null,'a cheer is NOT a full-charge ready cue');
  assert.equal(sourceEventRoute('special:krakenRoyale','open'),null,'no 2022 Kraken original can be inferred');
  assert.equal(sourceEventRoute('sub:inkMine','fire'),null,'ground mine must not borrow flying-bomb clip');
  assert.equal(sourceEventRoute('special:tentaMissiles','open'),'source:Sp_MultiMissile_Attach_00','explicit activation cue remains routed to its registered attachment recording');
  assert.equal(sourceEventRoute('sub:bomb','fire'),null,'long flying-bomb loop must not play as a throw one-shot');
  assert.equal(sourceEventRoute('sub:pointSensor','fire'),null,'marker flight sample must not play after landing');
});

test('real-only audio engine redirects absent kit events, but prefers a native resident recording',()=>{
  class Mixer {
    constructor(){this.ctx={state:'running',sampleRate:48000};this.byName=new Map();this.calls=[];}
    _def(){return null;}
    play(name,options){const def=this._def(name);if(def){this.calls.push({name,options});return def;}return null;}
    stats(){return {};}
    init(){}
    stopAll(){}
  }
  installWeaponAudioEngine(Mixer);
  const audio=new Mixer(),bank=audio.weaponBank(),loader=audio._realS3Loader;
  loader.status='ready';loader.declaredEvents=new Set(['source:Sp_MultiMissile_Attach_00:fire']);
  const source={id:'source:Sp_MultiMissile_Attach_00',event:'fire',variant:0,buffer:{},bytes:4};
  bank.authorized.byEvent.set('source:Sp_MultiMissile_Attach_00:fire',[source]);
  const actor={isLocal:true};
  const routed=audio.playWeapon('special:tentaMissiles','open',{actor});
  assert.equal(routed?.weaponId,'source:Sp_MultiMissile_Attach_00');
  assert.equal(audio.calls.at(-1).name,'main:source:Sp_MultiMissile_Attach_00:fire');
  loader.declaredEvents.add('special:tentaMissiles:open');
  const calls=audio.calls.length;
  assert.equal(audio.playWeapon('special:tentaMissiles','open',{actor}),null,'a declared but cold native recording must not be replaced');
  assert.equal(audio.calls.length,calls);
  const native={id:'special:tentaMissiles',event:'open',variant:0,buffer:{},bytes:4};
  bank.authorized.byEvent.set('special:tentaMissiles:open',[native]);
  const nativeResult=audio.playWeapon('special:tentaMissiles','open',{actor});
  assert.equal(nativeResult?.weaponId,'special:tentaMissiles','source replacement must never override a native decoded event');
  assert.equal(audio.calls.at(-1).name,'main:special:tentaMissiles:open');
  audio.disposeWeaponAudio();
});

test('production runtime prefetches routed kit sounds and retains original audio-admission gate',()=>{
  // Preserve the source composition anchors; emitted semantics below do not
  // depend on identifier spelling or minifier output.
  if(!built){
  const engine=fs.readFileSync(new URL('../runtime/audio/engine.mjs',import.meta.url),'utf8');
  const runtime=fs.readFileSync(new URL('../runtime/audio/runtime.mjs',import.meta.url),'utf8');
  assert.match(engine,/sourceEventRoute\(id,event\)/);
  assert.match(engine,/loader\?\.declares\(id,event\)===false/);
  assert.match(runtime,/loader\.ensure\(extra,'fire'\)/);
  assert.match(runtime,/sourceEventRoute\(kit,event\)/);
  assert.match(runtime,/EXTRA_SPECIAL_ACTION_SOURCE/);
  const kitRuntime=fs.readFileSync(new URL('../runtime/audio/kit-runtime.mjs',import.meta.url),'utf8');
  assert.match(kitRuntime,/this.specialActive\?\.phase==='ready'/,'Booyah full-hold loop cannot start at activation');
  }
  class Actor {setWeapon(){} _startSpecial(){} _updateSpecial(){}}
  class WeaponRunner {constructor(a){this.a=a;} reset(){} update(){return 'native-update';}}
  class Projectiles {throwBomb(){} _push(){} _blastBurst(){}}
  const ensured=[],loops=[],listeners=new Map();
  const G={time:0,audio:{ctx:{state:'running'},play(){},prepareWeapon(){},
    _realS3Loader:{declares(id,event){return id==='special:booyahBomb'&&event==='spin';},ensure(id,event){ensured.push([id,event]);return Promise.resolve();}},
    loopWeapon(id,event){const h={id,event,playing:true,stops:0,set(){},stop(){this.playing=false;this.stops++;}};loops.push(h);return h;}}};
  const on=(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);return ()=>listeners.get(name).delete(fn);};
  const runtime=installWeaponAudioRuntime({G,Actor,WeaponRunner,Projectiles,on});
  try{
    const specials=new Set([...Object.keys(EXTRA_SOURCE_EVENT_ROUTES).map(k=>k.split(':')[1]),...Object.keys(EXTRA_SPECIAL_ACTION_SOURCE).map(k=>k.split(':')[0])]);
    for(const special of specials){
      const a={isLocal:true,weapon:{id:'shooter',sub:'bomb',special},pos:{x:0,y:0,z:0}},runner=new WeaponRunner(a);
      assert.equal(runner.update(1/60,{}),'native-update');
      const before=ensured.length;runner.update(1/60,{});assert.equal(ensured.length,before,'selected kit prefetch is not repeated every frame');
    }
    for(const cue of new Set([...Object.values(EXTRA_SOURCE_EVENT_ROUTES),...Object.values(EXTRA_SPECIAL_ACTION_SOURCE)]))
      assert.ok(ensured.some(([id,event])=>id===cue&&event==='fire'),'actual runtime prefetches '+cue);
    const a=new Actor();Object.assign(a,{alive:true,isLocal:true,pos:{x:0,y:0,z:0},specialActive:{id:'booyahBomb',phase:'charge'}});G.local=a;
    a._updateSpecial(1/60);assert.equal(loops.length,0,'full-hold cue cannot start during charging');
    a.specialActive.phase='ready';a._updateSpecial(1/60);a._updateSpecial(1/60);
    assert.equal(loops.length,1);assert.equal(loops[0].id,'special:booyahBomb');assert.equal(loops[0].event,'spin');
    a.specialActive.phase='charge';a._updateSpecial(1/60);assert.equal(loops[0].stops,1);
  }finally{runtime.dispose();}
  assert.ok([...listeners.values()].every(set=>set.size===0));
});
