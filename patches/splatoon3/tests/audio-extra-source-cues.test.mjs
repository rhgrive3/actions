import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { EXTRA_SOURCE_FILES, SOURCE_EXTRA_AUDIO, sourceCueId } from '../runtime/audio/source-cue-registry.mjs';
import { EXTRA_SOURCE_EVENT_ROUTES, sourceEventRoute, EXTRA_SPECIAL_ACTION_SOURCE, sourceSpecialActionRoute } from '../runtime/audio/extra-source-routes.mjs';
import { KIT_AUDIO } from '../runtime/audio/kit-recipes.mjs';
import { specialActionAudioEvent } from '../runtime/audio/kit-runtime.mjs';
import { WeaponSoundBank } from '../runtime/audio/bank.mjs';
import { validateAuthorizedManifest } from '../runtime/audio/authorized-samples.mjs';
import { installWeaponAudioEngine } from '../runtime/audio/engine.mjs';

const dir = new URL('../runtime/audio/s3-real/', import.meta.url);
const installed = JSON.parse(fs.readFileSync(new URL('../runtime/audio/real-s3-installed.json', import.meta.url),'utf8'));
const original = JSON.parse(fs.readFileSync(new URL('../runtime/audio/real-s3-samples.json', import.meta.url),'utf8'));
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
  assert.equal(Object.keys(EXTRA_SOURCE_EVENT_ROUTES).length,11);
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
  loader.status='ready';loader.declaredEvents=new Set(['source:Wp_BombFly_00:fire']);
  const source={id:'source:Wp_BombFly_00',event:'fire',variant:0,buffer:{},bytes:4};
  bank.authorized.byEvent.set('source:Wp_BombFly_00:fire',[source]);
  const actor={isLocal:true};
  const routed=audio.playWeapon('sub:bomb','fire',{actor});
  assert.equal(routed?.weaponId,'source:Wp_BombFly_00');
  assert.equal(audio.calls.at(-1).name,'main:source:Wp_BombFly_00:fire');
  const native={id:'sub:bomb',event:'fire',variant:0,buffer:{},bytes:4};
  bank.authorized.byEvent.set('sub:bomb:fire',[native]);
  const nativeResult=audio.playWeapon('sub:bomb','fire',{actor});
  assert.equal(nativeResult?.weaponId,'sub:bomb','source replacement must never override a native decoded event');
  assert.equal(audio.calls.at(-1).name,'main:sub:bomb:fire');
  audio.disposeWeaponAudio();
});

test('production runtime prefetches routed kit sounds and retains original audio-admission gate',()=>{
  const engine=fs.readFileSync(new URL('../runtime/audio/engine.mjs',import.meta.url),'utf8');
  const runtime=fs.readFileSync(new URL('../runtime/audio/runtime.mjs',import.meta.url),'utf8');
  assert.match(engine,/sourceEventRoute\(id,event\)/);
  assert.match(engine,/loader\?\.declares\(id,event\)===false/);
  assert.match(runtime,/loader\.ensure\(extra,'fire'\)/);
  assert.match(runtime,/sourceEventRoute\(kit,event\)/);
  assert.match(runtime,/EXTRA_SPECIAL_ACTION_SOURCE/);
  const kitRuntime=fs.readFileSync(new URL('../runtime/audio/kit-runtime.mjs',import.meta.url),'utf8');
  assert.match(kitRuntime,/this.specialActive\?\.phase==='ready'/,'Booyah full-hold loop cannot start at activation');
});
