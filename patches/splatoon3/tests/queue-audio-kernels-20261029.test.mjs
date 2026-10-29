import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {renderGuidedSample} from '../runtime/audio/source-guided-render.mjs';
import {buildImpulse} from '../runtime/audio/reverb-impulse.mjs';
import {WeaponSoundBank} from '../runtime/audio/bank.mjs';
import {WEAPON_AUDIO} from '../runtime/audio/weapon-recipes.mjs';
import {sourceMeasurementFor} from '../runtime/audio/reference-profiles.mjs';
import {installOriginalAudioScore} from '../runtime/audio/music-score.mjs';
const root=new URL('../../../',import.meta.url);
const fixtureText=fs.readFileSync(new URL('fixtures/queue-audio-kernels-031426fc.json',import.meta.url),'utf8');
assert.equal(createHash('sha256').update(fixtureText).digest('hex'),'f265a26e3c1e20aba7ae432a8965e9c3194f6a0dfa9a4af46484fb50e7437759');
const fixture=JSON.parse(fixtureText);
for(const [name,source] of Object.entries(fixture.files))assert.equal(createHash('sha256').update(source).digest('hex'),fixture.sha256[name]);
const prior=rel=>fixture.files['patches/splatoon3/runtime/audio/'+rel];
async function load(code,rel){
 const url=new URL('patches/splatoon3/runtime/audio/'+rel,root);
 const text=code.replace(/\bfrom\s+(['"])(\.[^'"]+)\1/g,(_all,q,p)=>'from '+q+new URL(p,url).href+q);
 return import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'));
}
const oldGuide=(await load(prior('source-guided-render.mjs'),'source-guided-render.mjs')).renderGuidedSample;
const oldImpulse=(await load(prior('reverb-impulse.mjs'),'reverb-impulse.mjs')).buildImpulse;
const OldBank=(await load(prior('bank.mjs'),'bank.mjs')).WeaponSoundBank;
const bytes=x=>Buffer.from(x.buffer,x.byteOffset,x.byteLength);
function context(sampleRate=48000){return {sampleRate,createBuffer(channels,length,sr){const data=Array.from({length:channels},()=>new Float32Array(length));return {length,duration:length/sr,getChannelData:i=>data[i]};}};}

test('guided band sqrt hoist preserves full PCM for real measured families, events, rates and variants',()=>{
 const cases=new Map();
 for(const r of Object.values(WEAPON_AUDIO))for(const event of r.events){
  const key=r.family+':'+event;if(!cases.has(key)&&sourceMeasurementFor(r,event,0))cases.set(key,[r,event]);
 }
 assert(cases.size>=10,'actual measured source profiles are exercised');
 let samples=0;
 for(const rate of [8000,44100,48000,96000,192000])for(const [r,event] of cases.values())for(const variant of [0,1,2]){
  const before=oldGuide(r,event,variant,rate),after=renderGuidedSample(r,event,variant,rate);
  if(before===null){assert.equal(after,null);continue;}
  assert(bytes(before).equals(bytes(after)),r.id+'/'+event+'/'+variant+'/'+rate);samples+=before.length;
 }
 assert(samples>1000000);
});

test('all loop seam events retain exact PCM with measured-shape fixtures at supported boundary rates',async()=>{
 const data={ms:600,seq:[[-20,-24,-28,-32,-35,-40,-45],[-18,-20,-25,-30,-34,-39,-46],[-26,-29,-32,-35,-40,-44,-48],[-30,-32,-36,-39,-44,-48,-50]],env:Array.from({length:24},(_,i)=>-7-i*.4)};
 const replace=code=>code.replace("import { sourceMeasurementFor } from './reference-profiles.mjs';",'const sourceMeasurementFor=()=>('+JSON.stringify(data)+');');
 const current=fs.readFileSync(new URL('patches/splatoon3/runtime/audio/source-guided-render.mjs',root),'utf8');
 const before=(await load(replace(prior('source-guided-render.mjs')),'source-guided-render.mjs')).renderGuidedSample;
 const after=(await load(replace(current),'source-guided-render.mjs')).renderGuidedSample;
 for(const rate of [8000,44100,48000,96000,192000])for(const event of ['roll','charge','spin'])for(const variant of [0,1,2]){
  const a=before({id:'fixture'},event,variant,rate),b=after({id:'fixture'},event,variant,rate);
  assert(bytes(a).equals(bytes(b)),event+'/'+variant+'/'+rate);assert.equal(b.at(-1),b[0]);
 }
});

test('reverb ramp and immutable default taps preserve every stereo sample including custom getter semantics',()=>{
 for(const sr of [0,1,8000,44100,48000,96000,192000])for(const opt of [{},{pre:.012,seed:3},{seed:5,bright:.7,dark:.08},{pre:0,taps:[]},{pre:.1,taps:[[.001,.22],[.01,-.1]]}]){
  for(const [seconds,decay] of [[.0001,0],[.1,3.2],[1.5,3.4]]){
   const a=oldImpulse(context(sr),seconds,decay,opt),b=buildImpulse(context(sr),seconds,decay,opt);
   for(let ch=0;ch<2;ch++)assert(bytes(a.getChannelData(ch)).equals(bytes(b.getChannelData(ch))),sr+'/'+seconds+'/'+ch);
  }
 }
 let oldCalls=0,newCalls=0;
 const a=oldImpulse(context(),.1,3.2,{get taps(){return ++oldCalls===1?[[.01,.25]]:[[.02,.5]];}});
 const b=buildImpulse(context(),.1,3.2,{get taps(){return ++newCalls===1?[[.01,.25]]:[[.02,.5]];}});
 assert.equal(oldCalls,2);assert.equal(newCalls,2);for(let ch=0;ch<2;ch++)assert(bytes(a.getChannelData(ch)).equals(bytes(b.getChannelData(ch))));
});

test('procedural MRU skip preserves LRU ordering, eviction, PCM and interleaved worker stores',()=>{
 class CountMap extends Map{sets=0;deletes=0;set(...a){this.sets++;return super.set(...a);}delete(...a){this.deletes++;return super.delete(...a);}}
 const a=new OldBank(context(),{maxBytes:1024*1024}),b=new WeaponSoundBank(context(),{maxBytes:1024*1024});a.cache=new CountMap();b.cache=new CountMap();
 const pcm=new Float32Array(80000);for(let i=0;i<pcm.length;i++)pcm[i]=Math.sin(i*.3)*.2;
 const store=key=>{const x=a._store(key,pcm),y=b._store(key,pcm);assert(bytes(x.getChannelData(0)).equals(bytes(y.getChannelData(0))));};
 const same=()=>{assert.deepEqual([...b.cache.keys()],[...a.cache.keys()]);for(const field of ['bytes','hits','misses','evicted'])assert.equal(b[field],a[field],field);};
 store('shooter:fire:0');
 for(let i=0;i<2000;i++){const xa=a.get('shooter','fire',0),xb=b.get('shooter','fire',0);assert.equal(xa,a.cache.get('shooter:fire:0').buffer);assert.equal(xb,b.cache.get('shooter:fire:0').buffer);}same();assert.equal(b.cache.sets,1);assert.equal(b.cache.deletes,0);
 for(let i=0;i<120;i++){
  const key='shooter:fire:'+(i%3);store(key);same();
  for(const variant of [i%3,(i+1)%3,i%3]){const k='shooter:fire:'+variant;if(!a.cache.has(k))store(k);a.get('shooter','fire',variant);b.get('shooter','fire',variant);same();}
  store('roller:fire:'+(i%3));same();
 }
 assert(b.cache.sets<a.cache.sets);assert(b.cache.deletes<a.cache.deletes);
 const oversized=new Float32Array(1024*1024);a._store('large',oversized);b._store('large',oversized);same();assert.equal(b.cache.size,0);assert.equal(b._proceduralMruKey,null);
 store('shooter:fire:0');a.get('shooter','fire',0);b.get('shooter','fire',0);same();a.dispose();b.dispose();same();assert.equal(b._proceduralMruKey,null);
});

async function scoreModule(code){
 const ast=parse(code,{ecmaVersion:'latest',sourceType:'module'}),edits=[];
 for(const entry of ast.body){const n=entry.type==='ExportNamedDeclaration'?entry.declaration:entry;
  if(n?.type==='ClassDeclaration'&&n.id.name==='V')edits.push([n.start,n.end,'class V { constructor(){} finish(){} }']);
  if(n?.type==='FunctionDeclaration'&&n.id.name==='guitar')edits.push([n.body.start,n.body.end,'{ globalThis.calls.push({fs,values:[...fs],T,gate,vel,o}); }']);
 }
 for(const [a,b,text] of edits.sort((a,b)=>b[0]-a[0]))code=code.slice(0,a)+text+code.slice(b);
 const calls=[],ctx=vm.createContext({calls,URL,console,performance,setTimeout,clearTimeout,setInterval,clearInterval});
 const mod=new vm.SourceTextModule(code+'\nexport {Player};',{context:ctx,initializeImportMeta:meta=>{meta.url=new URL('inkwave-public/src/audio/music.js',root).href;}});
 const names=['installOriginalAudioScore','buildImpulse','installMusicPlatform','installMusicIdle','StreamedTrack'];
 const dep=new vm.SyntheticModule(names,function(){for(const name of names)this.setExport(name,name==='installOriginalAudioScore'?installOriginalAudioScore:name==='buildImpulse'?buildImpulse:()=>{});},{context:ctx});
 await mod.link(()=>dep);await mod.evaluate();return {ns:mod.namespace,calls};
}
test('all compiled songs retain their events and guitar scheduling while repeated notes share frequency arrays',async()=>{
 const current=adaptBuildSource('src/audio/music.js',fs.readFileSync(new URL('inkwave-public/src/audio/music.js',root),'utf8'));
 const a=await scoreModule(fixture.files['composed/src/audio/music.js']),b=await scoreModule(current);
 let notes=0;
 for(const id of Object.keys(a.ns.SONGS)){
  const x=a.ns.getSong(id),y=b.ns.getSong(id);
  const strip=value=>JSON.parse(JSON.stringify(value,(key,v)=>key==='hz'?undefined:v));assert.deepEqual(strip(y),strip(x),id);
  if(x.inst.chords!=='guitar')continue;
  const gather=v=>{const found=[];function walk(n){if(!n||typeof n!=='object')return;if(n.i==='chords')found.push(n);else for(const z of Object.values(n))walk(z);}walk(v);return found;};
  const oldEvents=gather(x),newEvents=gather(y);assert.equal(oldEvents.length,newEvents.length);
  const player=(ns,song)=>Object.assign(Object.create(ns.Player.prototype),{song,stepDur:.125,ctx:{},groups:{},eng:{intensity:1},rng:()=>.5,weight:()=>1});
  const p=player(a.ns,x),q=player(b.ns,y);
  for(let i=0;i<oldEvents.length;i++){
   p.fire(oldEvents[i],2);q.fire(newEvents[i],2);q.fire(newEvents[i],2);
   const before=a.calls.at(-1),after=b.calls.at(-1);assert.deepEqual(JSON.parse(JSON.stringify(after)),JSON.parse(JSON.stringify(before)));
   assert.equal(b.calls.at(-2).fs,after.fs,'one immutable per-event frequency array');notes++;
  }
 }
 assert(notes>100,'all authored guitar songs were compiled and scheduled');
});
