import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { WEAPON_AUDIO,fireArticulation } from '../runtime/audio/weapon-recipes.mjs';
import { KIT_AUDIO,SUB_AUDIO_IDS,SPECIAL_AUDIO_IDS } from '../runtime/audio/kit-recipes.mjs';
import { COMBAT_AUDIO } from '../runtime/audio/combat-recipes.mjs';
import { specialActivationAudioEvent } from '../runtime/audio/kit-runtime.mjs';
import { renderSound,pcmMetrics } from '../runtime/audio/render.mjs';
import { WeaponSoundBank,audioEmitterKey,selectVictim } from '../runtime/audio/bank.mjs';
import { fixture } from './source-fixture.mjs';
const digest=x=>createHash('sha256').update(Buffer.from(x.buffer,x.byteOffset,x.byteLength)).digest('hex');
const context={sampleRate:48000,createBuffer(_channels,len,sr){const pcm=new Float32Array(len);return {duration:len/sr,length:len,getChannelData(){return pcm;}};}};
test('65 independent main recipes, all 14 subs and 19 specials are addressable',()=>{
 assert.equal(Object.keys(WEAPON_AUDIO).length,65);assert.equal(SUB_AUDIO_IDS.length,14);assert.equal(SPECIAL_AUDIO_IDS.length,19);
 assert.equal(new Set(Object.values(WEAPON_AUDIO).map(r=>r.coefficients.join(','))).size,65);
 for(const r of Object.values(WEAPON_AUDIO))assert.equal(r.reference.retailComparison,'unverified-no-isolated-reference');
});
test('every authored event and all three variants are finite, bounded and non-silent',()=>{
 const fires=new Set();let total=0;
 // The three combat feedback IDs accept verified MP3 only; they have no
 // authored waveform, so synthetic-sound metrics cannot apply to them.
 const authoredKit=Object.values(KIT_AUDIO);
 for(const r of [...Object.values(WEAPON_AUDIO),...authoredKit])for(const event of r.events){const variants=new Set();
  for(let variant=0;variant<3;variant++){const pcm=renderSound(r,event,variant),m=pcmMetrics(pcm,48000);total++;
   assert.ok(m.peak>.01&&m.peak<=.761,`${r.id}/${event} peak ${m.peak}`);assert.ok(Math.abs(m.dc)<.045,`${r.id}/${event} DC ${m.dc}`);
   assert.ok(m.duration>=.08&&m.duration<=1.1);variants.add(digest(pcm));if(event==='fire'&&variant===0&&WEAPON_AUDIO[r.id])fires.add(digest(pcm));
  }assert.equal(variants.size,3,`${r.id}/${event} round robin must change excitation`);
 }assert.equal(fires.size,65);console.log('rendered PCM variants',total);
});
test('recorded-only combat feedback cannot be mistaken for synthesized audio',()=>{
 const ids=['combat:critical','combat:damage','combat:splat','combat:ink_focus_normal','combat:ink_focus_strong','combat:splat_squid'];
 const recordedOnly=Object.values(COMBAT_AUDIO);
 assert.deepEqual(recordedOnly.map(r=>r.id).sort(),ids.slice().sort(),'all source-only cues remain explicitly enumerated');
 const bank=new WeaponSoundBank(context);
 for(const r of recordedOnly){
   assert.equal(r.family,'combat','only combat source events are source recorded');
   assert.equal(Object.hasOwn(r,'coefficients'),false,'recorded cue must not contain authored DSP parameters');
   assert.deepEqual(r.events,['fire']);
   assert.equal(bank.resolve('main:'+r.id+':fire'),null,'unavailable recording may not expose a synthetic definition');
   assert.throws(()=>bank.get(r.id,'fire'),/Recorded-only cue cannot generate PCM/);
   bank.warm(r.id);
   assert.equal(bank.jobs.length,0,'warming a source-only event may not create PCM jobs');
 }
 assert.equal(bank.cache.size,0);
 bank.dispose();
});
test('rendering is deterministic and independent of cache order',()=>{const r=WEAPON_AUDIO.shooter;assert.equal(digest(renderSound(r)),digest(renderSound(r)));assert.notEqual(digest(renderSound(r,'fire',0)),digest(renderSound(r,'fire',1)));assert.throws(()=>renderSound(r,'unknown'));assert.throws(()=>renderSound(r,'fire',0,4));});
test('LRU cache obeys byte budget, returns cached AudioBuffers and bounds warm jobs',()=>{
 const b=new WeaponSoundBank(context,{maxBytes:1024*1024});const first=b.get('shooter','fire');assert.equal(first,b.get('shooter','fire'));
 for(const r of Object.values(WEAPON_AUDIO))for(const e of r.events)b.get(r.id,e);
 assert.ok(b.bytes<=1024*1024);assert.ok(b.evicted>0);for(const id of Object.keys(WEAPON_AUDIO))b.warm(id);assert.ok(b.jobs.length<=256);b.dispose();assert.equal(b.bytes,0);assert.equal(b.jobs.length,0);
});
test('same-position actors never share dedup keys; priorities protect important voices',()=>{
 const a={},b={};assert.notEqual(audioEmitterKey({actor:a}),audioEmitterKey({actor:b}));assert.equal(audioEmitterKey({actor:a}),audioEmitterKey({actor:a}));
 const vs=[{priority:99,t:0,v:{dead:false}},{priority:35,t:1,v:{dead:false}}];assert.equal(selectVictim(vs,64),vs[1]);assert.equal(selectVictim(vs,20),null);
});
test('fire articulations use charge, side, vertical swing and firing mode',()=>{
 assert.equal(fireArticulation(WEAPON_AUDIO.charger,{charge:1}),'fire_full');assert.equal(fireArticulation(WEAPON_AUDIO.dualies,{hand:1}),'fire_left');
 assert.equal(fireArticulation(WEAPON_AUDIO.roller,{vertical:true}),'fire_vertical');assert.equal(fireArticulation(WEAPON_AUDIO.shooter,{mode:'variable'}),'fire_alt');
});
async function setup(){const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:`
 export {NetMatch} from './inkwave-public/src/net/netmatch.js';
 export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';
 export {installWeaponAudioRuntime} from './patches/splatoon3/runtime/audio/runtime.mjs';`});
 f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);const calls=[],rises=[],prewarms=[];f.G.audio={ctx:{},prepareWeapon(){},prewarmChargerChargeRise(d){prewarms.push(d);},play(name,o){calls.push({legacy:true,name,o});},playWeapon(id,event,o){calls.push({id,event,o});},playChargerChargeRise(options){const h={playing:true,options,stops:0,stop(){this.playing=false;this.stops++;}};rises.push(h);return h;},loopWeapon(id,event,o){calls.push({loop:true,id,event,o});return{playing:true,set(){},stop(){this.playing=false;}};},loop(){return{playing:true,set(){},stop(){this.playing=false;}};},duck(){}};
 f.installWeaponAudioRuntime(f.installedRuntime);f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};return {...f,calls,rises,prewarms};}
test('all 65 actual Actor admission paths emit one weapon sound for each fire event, with no legacy shot',async()=>{
 const f=await setup();let fireCount=0;f.on('weapon:fire',()=>fireCount++);
 for(const r of Object.values(WEAPON_AUDIO)){
  f.G.projectiles.clear();f.G.actors.length=0;f.calls.length=0;fireCount=0;
  const a=f.make(r.id);a.form='kid';a.isLocal=true;a.ink=100;a.intent.fire=true;
  f.tick(a,150);a.intent.fire=false;f.tick(a,40);
  const sounds=f.calls.filter(c=>c.id===r.id&&c.event?.startsWith('fire'));
  assert.ok(sounds.length>0,r.id+' no audible admitted fire');assert.equal(sounds.length,fireCount,r.id+' double/missing fire');
  assert.equal(f.calls.filter(c=>c.legacy&&/^shoot_/.test(c.name)).length,0,r.id+' still shared old shot');
 }
});
test('65 remote fire events route to exact weapon IDs and spatial positions',async()=>{
 const f=await setup();for(const r of Object.values(WEAPON_AUDIO)){
  const a=f.make(r.id);a.remote=true;a.isLocal=false;a.pos.set(4,1,-3);const before=f.calls.length;
  f.emit('weapon:fire',{actor:a,weapon:r.id,muzzle:a.pos,charge:.25,hand:0});const c=f.calls.at(-1);
  assert.equal(f.calls.length,before+1);assert.equal(c.id,r.id);assert.equal(c.o.pos.x,4);assert.equal(c.o.actor,a);
 }
});
test('Charger onset occurs once on initial hold and again only after real stored-charge emergence',async()=>{
 const f=await setup(),id='s3-charger-long',a=f.make(id);
 a.form='kid';a.isLocal=true;a.intent.fire=true;f.tick(a,160);
 const onsets=()=>f.calls.filter(c=>c.id===id&&c.event==='charge');
 assert.equal(onsets().length,0,'E-liter no longer plays its Heavy HoldNoise during charge');
 assert.ok(f.prewarms.includes(id),'E-liter prewarms the shared Splat Charger phrase');
 assert.equal(f.rises.length,1,'E-liter shares the recorded Splat Charger rise');
 assert.equal(f.rises[0].options.weaponId,id);
 assert.equal(f.rises[0].options.chargeTime,a.weapon.chargeTime);
 assert.equal(f.calls.filter(c=>c.id===id&&c.event==='ready').length,1);
 assert.equal(a.weaponRunner._mainAudioState.loops.charge,undefined);
 // The actual S3 charger owner stores this structure while diving after
 // full charge. The transition is a form event, not another new charge.
 a.weaponRunner.s3Stored={charge:1,resurfaced:false,remaining:1,fireDelay:0.1,laserDelay:0};
 a.form='squid';a.submerged=true;
 f.emit('actor:form',{actor:a,form:'squid'});
 // Run an actual weapon tick underwater. This calls stop() and clears the
 // audio presentation state, without expiring the gameplay-owned keep.
 a.weaponRunner.update(1/60,{fire:false});
 assert.ok(a.weaponRunner.s3Stored?.charge>0,'real underwater frame preserves charge keep');
 a.form='kid';a.submerged=false;
 f.emit('actor:form',{actor:a,form:'kid'});
 assert.equal(onsets().length,1,'squid-frame stop may not erase real emergence click');
 f.emit('actor:form',{actor:a,form:'kid'});
 assert.equal(onsets().length,1,'duplicate form events cannot repeat a click');
 // A fresh dive whose stored charge was lost must not play the keep cue.
 f.emit('actor:form',{actor:a,form:'squid'});
 a.weaponRunner.s3Stored=null;
 f.emit('actor:form',{actor:a,form:'kid'});
 assert.equal(onsets().length,1,'expired/cancelled charge keep is silent on resurfacing');
 // A scoped model is not eligible for S3 charge-keep audio even if an
 // invalid saved charge is injected. Keep the catalog weapon immutable.
 const scoped=f.make('s3-charger-normalscope');
 scoped.form='kid';scoped.isLocal=true;
 scoped.weaponRunner.s3Stored={charge:1,resurfaced:false};
 f.emit('actor:form',{actor:scoped,form:'squid'});
 f.emit('actor:form',{actor:scoped,form:'kid'});
 assert.equal(f.calls.filter(c=>c.id==='s3-charger-normalscope'&&c.event==='charge').length,0,
   'scoped model must never play a fabricated charge-keep emergence click');

 // Goo Tuber may retain a legal partial shot. Do not add a full-only
 // sound restriction on top of the gameplay-owned stored-charge record.
 const goo=f.make('s3-charger-keeper');goo.form='kid';goo.isLocal=true;
 goo.weaponRunner.s3Stored={charge:.5,resurfaced:false};
 f.emit('actor:form',{actor:goo,form:'squid'});
 f.emit('actor:form',{actor:goo,form:'kid'});
 assert.equal(f.calls.filter(c=>c.id==='s3-charger-keeper'&&c.event==='charge').length,1,
   'stored partial charge on Goo Tuber triggers one emergence cue');
 a.setWeapon('shooter');f.emit('actor:form',{actor:a,form:'kid'});
 assert.equal(onsets().length,1,'weapon switching clears Charger stored-charge click routing');
 assert.equal(f.rises.length,1,'switching never repeats the initial rising phrase');
});

test('all 14 actual sub admissions produce the corresponding sub sound',async()=>{
 const f=await setup();for(const id of SUB_AUDIO_IDS){
  f.G.projectiles.clear();f.G.actors.length=0;f.calls.length=0;const a=f.make('shooter');a.isLocal=true;a.form='kid';a.weapon={...a.weapon,sub:id};a.ink=100;
  f.G.projectiles.throwBomb(a);
  assert.ok(f.calls.some(c=>c.id==='sub:'+id&&['fire','open'].includes(c.event)),id+' admission must play its sound');
 }
});
test('all 19 actual special activations produce one distinct activation sound',async()=>{
 const f=await setup();for(const id of SPECIAL_AUDIO_IDS){
  f.G.projectiles.clear();f.G.actors.length=0;f.calls.length=0;const a=f.make('shooter');a.isLocal=true;a.form='kid';a.weapon={...a.weapon,special:id,specialCost:100};a.special=100;a.intent.fire=false;a.intent.sub=false;a.intent.jump=false;
  a._prevIntent||={};Object.assign(a._prevIntent,{fire:false,sub:false,jump:false,squid:false,booyah:false});a._startSpecial();
  assert.ok(a.stats.specials>0,id+' activation accepted');
  const event=specialActivationAudioEvent(id);
  assert.ok(KIT_AUDIO['special:'+id]?.events.includes(event),id+' source activation event is catalogued');
  assert.equal(f.calls.filter(c=>c.id==='special:'+id&&c.event===event).length,1,id+' exactly one correct activation');
  assert.equal(f.calls.filter(c=>c.id==='special:'+id).length,1,id+' no unrelated extra activation');
 }
});
test('loop seam is no greater than ordinary high-frequency sample changes',()=>{
 for(const r of Object.values(WEAPON_AUDIO))for(const event of r.events.filter(e=>['charge','spin','roll'].includes(e))){
  const x=renderSound(r,event),diff=[];for(let i=1;i<x.length;i++)diff.push(Math.abs(x[i]-x[i-1]));diff.sort((a,b)=>a-b);
  const seam=Math.abs(x[0]-x.at(-1));assert.ok(seam<=Math.max(.01,diff[Math.floor(diff.length*.99)]),`${r.id}/${event} seam ${seam}`);
 }
});
test('off-thread warm-up stores returned PCM and terminates on disposal',async()=>{
 let worker;
 const b=new WeaponSoundBank(context,{workerFactory:()=>worker={terminated:false,postMessage(data){setTimeout(()=>{if(!this.terminated)this.onmessage({data:{key:data.key,pcm:renderSound(WEAPON_AUDIO[data.id],data.event,data.variant,data.sampleRate)}});},0);},terminate(){this.terminated=true;}}});
 b.warm('shooter');const started=performance.now();while(b.pending.size){if(performance.now()-started>10000)throw new Error('worker warm timeout');await new Promise(r=>setTimeout(r,10));}
 assert.equal(b.generatedOffThread,9);const misses=b.misses;b.get('shooter','fire',2);assert.equal(b.misses,misses);b.dispose();assert.equal(worker.terminated,true);
});
test('65 packed network fire records replay once through the real NetMatch decoder',async()=>{
 const f=await setup(),nm=Object.create(f.NetMatch.prototype);nm.byNid=new Map();
 for(const [i,r] of Object.values(WEAPON_AUDIO).entries()){
  f.calls.length=0;const a=f.make(r.id);a.remote=true;a.nid=i+1;a.isLocal=false;a.pos.set(4,1,-3);nm.byNid.set(a.nid,a);
  nm._playEvent('weapon:fire',{actor:{n:a.nid},weapon:r.id,muzzle:[4,1,-3],dir:[0,0,1],charge:.25,len:5,hand:0},null);
  const rows=f.calls.filter(c=>c.id===r.id&&c.event?.startsWith('fire'));
  assert.equal(rows.length,1,r.id+' replicated shot duplicated/missing');assert.equal(rows[0].o.pos.x,4);
 }
});
test('native bomb explosion retains the birth sub id after a weapon switch',async()=>{
 const f=await setup(),a=f.make();a.isLocal=true;a.weapon={...a.weapon,sub:'suction'};f.G.projectiles.throwBomb(a);
 const b=f.G.projectiles.bombs.at(-1);a.weapon={...a.weapon,sub:'bomb'};f.calls.length=0;f.G.projectiles._explodeBomb(b);
 assert.ok(f.calls.some(c=>c.id==='sub:suction'&&c.event==='explosion'));assert.ok(!f.calls.some(c=>c.id==='sub:bomb'&&c.event==='explosion'));
});

test('composed fidelity impacts retain owner and weapon after contact-vector optimization',async()=>{
 const {readFile}=await import('node:fs/promises');const {adaptBuildSource}=await import('../../../scripts/inkwave-source-composition.mjs');
 const raw=await readFile(new URL('../runtime/weapons-fidelity.mjs',import.meta.url),'utf8');
 const source=adaptBuildSource('patches/splatoon3/runtime/weapons-fidelity.mjs',raw);
 const emissions=[...source.matchAll(/emit\('weapon:impact',\s*\{([^}]+)\}/g)];assert.equal(emissions.length,2);
 for(const [,body] of emissions){assert.match(body,/actor:p\.owner/);assert.match(body,/weapon:p\.wid/);assert.match(body,/pos:\s*hit\.point/);}
});

test('native Charger re-arms emergence onset across two retained-charge dives',async()=>{
 const f=await setup(),id='charger',a=f.make(id),r=a.weaponRunner;
 assert.equal(a.weapon.catalogRecord,undefined,'exercise native, not catalog, stop routing');
 // fixture normally suppresses _finishFrame; retain real event dispatch after weapon update.
 a._finishFrame=()=>a._events(a.anim);
 a.form='kid';a.isLocal=true;a.intent.fire=true;f.tick(a,160);
 const onsets=()=>f.rises.length+f.calls.filter(c=>c.id===id&&c.event==='charge').length;
 assert.equal(onsets(),1,'continuous initial hold has one onset');
 assert.equal(f.rises.length,1,'first charge uses the complete recorded phrase');
 assert.ok(r.charging&&r.charge>=1,'actual native gameplay reaches full charge');
 for(let cycle=1;cycle<=2;cycle++){
  a.intent.squid=true;f.tick(a);
  assert.equal(a.form,'squid','actual Actor enters squid');
  assert.ok(r.s3Stored?.charge>0,'actual native squid update retains charge');
  assert.equal(f.rises[0].playing,false,'diving stops the original recorded phrase');
  a.intent.squid=false;f.tick(a);
  assert.equal(a.form,'kid','actual Actor emits emergence after weapon update');
  assert.equal(onsets(),1+cycle,`emergence ${cycle} plays one cue`);
  f.emit('actor:form',{actor:a,form:'kid'});
  assert.equal(onsets(),1+cycle,'same-kid duplicate form event stays silent');
  assert.ok(r.s3Stored?.fireDelay>0,'redive before actual stored-shot readiness');
 }
 assert.equal(f.rises.length,1,'stored-charge emergence adds only a click, never another full phrase');
 a.setWeapon('shooter');f.emit('actor:form',{actor:a,form:'kid'});
 assert.equal(onsets(),3,'weapon switch cannot replay the Charger cue');
 assert.equal(r._mainAudioState,null,'weapon reset discards the old latch state');
});
