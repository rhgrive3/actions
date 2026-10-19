import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { withBlasterSplashHit, blasterHitCueKind, blasterHitCuePitch, BLASTER_HIT_PITCH } from '../runtime/audio/blaster-hit.mjs';
import { specialActionAudioEvent, specialActivationAudioEvent } from '../runtime/audio/kit-runtime.mjs';
import { installWeaponAudioRuntime } from '../runtime/audio/runtime.mjs';
import { installWeaponAudioEngine } from '../runtime/audio/engine.mjs';
import { ALTERNATE_WEAPON_KITS } from '../runtime/alternate-weapon-kits-data.mjs';
import { withChargedHitAudio, isFullyChargedAudioHit } from '../runtime/audio/charge-hit-cue.mjs';

const manifest=JSON.parse(fs.readFileSync(new URL('../runtime/audio/real-s3-installed.json',import.meta.url),'utf8'));
const clip=(id,event)=>manifest.clips.some(c=>c.id===id&&c.event===event);

test('2022 critical/damage/dead-splash MP3s have strict byte provenance and distinct combat events',()=>{
 const expected=[
  ['combat:critical','HitEf_CriticalHit_00.mp3','5366114895aca376f4780aa1123d90a7c4542bcad24a464afc374f47f28169cd'],
  ['combat:damage','HitEf_Damage_00.mp3','c4b6ac316315ee76f06392821db008334daf6f162e106347f164196ac64a85db'],
  ['combat:splat','Pl_DeadSplash_00.mp3','333f4c0f699adedb573b4bdf2b811bfa0c39b77330a69ced5f31c4a915d8ce1f']
 ];
 for(const [id,filename,sha] of expected){
   const c=manifest.clips.filter(c=>c.id===id&&c.event==='fire');
   assert.equal(c.length,1,'one verified source only: '+id);
   assert.equal(c[0].sourceName,filename);
   assert.equal(c[0].sha256,sha);
   assert.equal(crypto.createHash('sha256').update(
     fs.readFileSync(new URL('../runtime/audio/s3-real/'+filename,import.meta.url))
   ).digest('hex'),sha,'source bytes cannot silently change '+id);
 }
});

test('scoped critical-hit metadata preserves original damage-group argument and restores on errors',()=>{
 const victim={},before=()=>isFullyChargedAudioHit(victim);
 assert.equal(before(),false);
 const marker={damageGroup:1234};
 const call=(group)=>{assert.equal(group,marker,'network/damage group is not repurposed');return before();};
 assert.equal(withChargedHitAudio(victim,true,()=>call(marker)),true,'full source charge visible only while admitted');
 assert.equal(before(),false,'metadata is cleared immediately after hit');
 assert.equal(withChargedHitAudio(victim,false,()=>call(marker)),false,'ordinary hit never inherits previous charge');
 assert.equal(withChargedHitAudio(victim,true,()=>
   withChargedHitAudio(victim,false,()=>before())),false,'nested hit scope restores owner');
 assert.equal(before(),false);
 assert.throws(()=>withChargedHitAudio(victim,true,()=>{throw Error('rollback');}),/rollback/);
 assert.equal(before(),false,'failure restores audio scope');
});

test('production recorded hit/splat MP3 cues replace generic synth across all main families',()=>{
 const src=fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8');
 const native=fs.readFileSync(new URL('../../../inkwave-public/src/game/weapons.js',import.meta.url),'utf8');
 const built=adaptBuildSource('src/main.js',src);
 const weapon=adaptBuildSource('src/game/weapons.js',native);
 for(const cue of ['combat:critical','combat:ink_focus_strong','combat:ink_focus_normal','combat:splat'])
   assert.match(built,new RegExp(cue),'recorded source event for '+cue);
 assert.match(built,/fullCharge===true\?'combat:critical'/,'recorded CriticalHit requires the real full-charge flag, not a guessed damage threshold');
 assert.match(built,/damage>=40\?'combat:ink_focus_strong'/,'noncritical large ink hits are sourced');
 assert.match(built,/G\.audio\?\.playWeapon\?\.\('combat:splat','fire'/,'all local kills play recorded DeadSplash');
 assert.doesNotMatch(built,/else G\.audio\?\.play\('hit_marker'/,'no local synth fallback after sample selection');
 assert.doesNotMatch(built,/else G\.audio\?\.play\('splat_enemy'/,'no synth kill fallback');
 assert.match(weapon,/void 0;/,'native duplicate authored body hit is suppressed');
 assert.match(weapon,/withChargedHitAudio\(victim\.e,charge>=0\.999,\(\)=>this\.applyHit\(a, victim\.e, dmg, 'charger'\)\)/,
   'legacy Charger directly carries true full-charge metadata');
 assert.match(weapon,/fullCharge:isFullyChargedAudioHit\(victim\)/,
   'hit event carries exact boolean without changing damage/HP');
 const cat=fs.readFileSync(new URL('../runtime/main-weapon-catalog.mjs',import.meta.url),'utf8');
 const compiledCat=adaptBuildSource('patches/splatoon3/runtime/main-weapon-catalog.mjs',cat);
 assert.match(compiledCat,/withChargedHitAudio\(target,s\.r\.family==='charger'/,
   'catalogue Charger passes true charge state on the actual contact');
 assert.doesNotMatch(weapon,/G\.audio\.play\('ink_hit_body'/,'no second synthesized body-hit layer');
 for(const cue of ['combat:critical','combat:ink_focus_normal','combat:ink_focus_strong','combat:splat'])
   assert.ok(clip(cue,'fire'),'the source MP3 is present for '+cue);
});

test('alternate kit fire, impact, charge loop and sub/special prefetch keep base audio only',()=>{
 const listeners=new Map(),shots=[],loops=[],prepares=[],loads=[];
 const on=(name,fn)=>{const list=listeners.get(name)||[];list.push(fn);listeners.set(name,list);return ()=>{};};
 const emit=(name,e)=>{for(const fn of listeners.get(name)||[])fn(e);};
 class Projectiles { _push(p){return p;} _blastBurst(p){return p;} throwBomb(){} }
 class Actor {setWeapon(){} _startSpecial(){} _updateSpecial(){}}
 class WeaponRunner {reset(){} update(){return 'updated';}}
 const G={audio:{
   ctx:{state:'running'},play(){return null;},
   playWeapon(id,event){shots.push([id,event]);return {playing:true};},
   loopWeapon(id,event){loops.push([id,event]);return {playing:true,set(){},stop(){this.playing=false;}};},
   prepareWeapon(id){prepares.push(id);},
   _realS3Loader:{ensure(id,event){loads.push([id,event]);return Promise.resolve({loaded:0});}},
 },time:0};
 installWeaponAudioRuntime({G,on,Actor,WeaponRunner,Projectiles});
 const mkActor=id=>{const kit=ALTERNATE_WEAPON_KITS.find(k=>k.id===id);
   assert.ok(kit,id);
   return {alive:true,isLocal:true,remote:false,form:'kid',weapon:{id:kit.id,variantOf:kit.baseId,
     sub:kit.sub,special:kit.special,catalogRecord:{family:'splatling'}},
     pos:{x:0,y:0,z:0},vel:{x:0,z:0},grounded:true};
 };
 const shooter=mkActor('shooter-01');
 emit('weapon:fire',{actor:shooter,weapon:shooter.weapon.id,muzzle:shooter.pos});
 assert.deepEqual(shots.at(-1),['shooter','fire'],'collab projectile keeps its variant ID but audio resolves to base');
 emit('weapon:impact',{actor:shooter,weapon:shooter.weapon.id,pos:shooter.pos});
 assert.deepEqual(shots.at(-1),['shooter','impact']);
 const spinner=mkActor('s3-spinner-quick-01'),runner=new WeaponRunner();
 spinner.weaponRunner=runner;runner.a=spinner;runner.catalogState={pending:false};
 runner.charging=true;runner.charge=.5;
 assert.equal(runner.update(1/60,{}),'updated');
 assert.ok(prepares.includes('s3-spinner-quick'),'local collab preloads recorded Spinner base');
 assert.ok(loops.some(x=>x[0]==='s3-spinner-quick'&&x[1]==='charge'),
   'native Spinner colllab charge loop uses base Motor recording');
 assert.ok(loads.some(x=>x[0]==='sub:'+spinner.weapon.sub),'collab keeps its own sub');
 assert.ok(loads.some(x=>x[0]==='special:'+spinner.weapon.special),'collab keeps its own special');
 emit('weapon:fire',{actor:spinner,weapon:spinner.weapon.id,muzzle:spinner.pos});
 assert.deepEqual(shots.at(-1),['s3-spinner-quick','fire']);
 runner.charging=false;runner.streaming=true;runner.burstFrac=.5;
 runner.update(1/60,{});
 assert.ok(loops.some(x=>x[0]==='s3-spinner-quick'&&x[1]==='spin'),
   'collab stream uses the base MotorFire recording');
});

test('Blaster direct and indirect body-hit cues remain different without altering damage data',()=>{
  const a={weapon:{id:'blaster',kind:'blaster'}};
  const other={weapon:{id:'shooter',kind:'shooter'}};
  assert.equal(blasterHitCueKind(a,'blaster'),'direct');
  assert.equal(blasterHitCuePitch(a,'blaster'),BLASTER_HIT_PITCH.direct);
  assert.equal(blasterHitCuePitch(other,'shooter'),1);
  assert.equal(blasterHitCuePitch(a,'storm'),1,'special is never misclassified');
  assert.equal(blasterHitCuePitch(a,'blaster-01'),BLASTER_HIT_PITCH.direct,
    'alternate native Blaster retains its direct-hit sound');
  assert.equal(blasterHitCuePitch(a,'blaster-02'),BLASTER_HIT_PITCH.direct);
  assert.equal(blasterHitCuePitch(a,'s3-blaster-light-01'),BLASTER_HIT_PITCH.direct,
    'catalog Blaster Deco resolves to its source main');
  withBlasterSplashHit(a,()=>{
    assert.equal(blasterHitCuePitch(a,'blaster-01'),BLASTER_HIT_PITCH.indirect);
    assert.equal(blasterHitCuePitch(a,'s3-blaster-light-01'),BLASTER_HIT_PITCH.indirect);
  });
  assert.equal(blasterHitCuePitch(a,'sub:bomb'),1,'kit audio is never a direct-hit cue');

  assert.equal(blasterHitCuePitch(a,'s3-blaster-light'),BLASTER_HIT_PITCH.direct);
  const sample={damage:57,killed:false,weaponId:'blaster'};
  withBlasterSplashHit(a,()=>{
    assert.equal(blasterHitCueKind(a,sample.weaponId),'indirect');
    assert.equal(blasterHitCuePitch(a,sample.weaponId),BLASTER_HIT_PITCH.indirect);
    withBlasterSplashHit(a,()=>assert.equal(blasterHitCueKind(a,'blaster'),'indirect'));
    assert.equal(blasterHitCueKind(other,'shooter'),null,'other actor is isolated');
    assert.deepEqual(sample,{damage:57,killed:false,weaponId:'blaster'},'contact metadata is audio-only');
  });
  assert.equal(blasterHitCueKind(a,'blaster'),'direct');
  assert.throws(()=>withBlasterSplashHit(a,()=>{throw Error('contact rejected');}),/contact rejected/);
  assert.equal(blasterHitCueKind(a,'blaster'),'direct','exception restores scope');
  const catalog={weapon:{id:'s3-blaster-lightshort',kind:'catalog',catalogRecord:{family:'blaster'}}};
  withBlasterSplashHit(catalog,()=>assert.equal(blasterHitCueKind(catalog,'s3-blaster-lightshort'),'indirect'));
  assert.equal(blasterHitCueKind(catalog,'s3-blaster-lightshort'),'direct');
});

test('actual final native burst wrapper scopes only splash damage, never ghosts',()=>{
  const listeners=new Map(),heard=[];
  const on=(name,fn)=>{const a=listeners.get(name)||[];a.push(fn);listeners.set(name,a);return ()=>{};};
  const emit=(name,data)=>{for(const fn of listeners.get(name)||[])fn(data);};
  class Projectiles {
    throwBomb(){return null;}
    _push(p){return p;}
    _blastBurst(p){emit('hit',{attacker:p.owner,weaponId:p.wid});return 'burst handled';}
  }
  class WeaponRunner {reset(){}update(){}}
  class Actor {setWeapon(){} _startSpecial(){} _updateSpecial(){}}
  const G={audio:{ctx:{state:'running'},play:()=>null,prepareWeapon(){},playWeapon(){},_realS3Loader:null},time:0};
  const api={G,on,Actor,WeaponRunner,Projectiles};
  on('hit',e=>heard.push(blasterHitCuePitch(e.attacker,e.weaponId)));
  installWeaponAudioRuntime(api);
  const a={weapon:{id:'blaster',kind:'blaster'}},b={weapon:{id:'blaster',kind:'blaster'}};
  const P=new Projectiles();
  emit('hit',{attacker:a,weaponId:'blaster'});
  assert.equal(P._blastBurst({owner:a,wid:'blaster',type:'blast',ghost:false}), 'burst handled');
  P._blastBurst({owner:b,wid:'blaster',type:'blast',ghost:true});
  emit('hit',{attacker:a,weaponId:'blaster'});
  assert.deepEqual(heard,[BLASTER_HIT_PITCH.direct,BLASTER_HIT_PITCH.indirect,BLASTER_HIT_PITCH.direct,BLASTER_HIT_PITCH.direct]);
});

test('real AudioEngine prototype owns the hit-cue even when Game assigns G.audio after patch install',()=>{
  class Engine { _def(){return null;} }
  installWeaponAudioEngine(Engine);
  const G={audio:null};
  G.audio=new Engine();
  const blaster={weapon:{kind:'blaster',id:'blaster'}};
  assert.equal(G.audio.blasterHitCuePitch(blaster,'blaster'),BLASTER_HIT_PITCH.direct);
  withBlasterSplashHit(blaster,()=>{
    assert.equal(G.audio.blasterHitCuePitch(blaster,'blaster'),BLASTER_HIT_PITCH.indirect);
  });
  assert.equal(G.audio.blasterHitCuePitch(blaster,'blaster'),BLASTER_HIT_PITCH.direct);
});

test('production HUD retains visual kill marker and recorded body-hit confirmation',()=>{
 const src=fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8');
 const built=adaptBuildSource('src/main.js',src);
 assert.match(built,/this\.hud\?\.hitMarker\(killed \? 'kill' : 'hit'\)/);
 assert.match(built,/on\('hit', \(\{ attacker, victim, damage, killed, weaponId, fullCharge \}\)/);
 assert.equal((built.match(/combat:critical/g)||[]).length,1);
 assert.equal((built.match(/combat:splat/g)||[]).length,1);
 for(const cue of ['splatted_self','ally_splatted','hurt'])
   assert.ok(src.includes("'"+cue+"'"),'retained unrelated feedback '+cue);
});
test('catalogue Blaster radius hits carry a scoped audio flag and explosion weapon identity',()=>{
  const src=fs.readFileSync(new URL('../runtime/main-weapon-catalog.mjs',import.meta.url),'utf8');
  assert.match(src,/withBlasterSplashHit\(p\.owner,\(\)=>system\.applyHit/);
  assert.match(src,/emit\('weapon:impact',\{actor:p\.owner,weapon:p\.wid,/);
  assert.ok(clip('blaster','explosion'),'original middle Blaster explosion MP3 available');
  assert.ok(clip('s3-blaster-short','explosion'),'short Blaster explosion MP3 available');
});

test('special phase owners select real installed MP3 events, not nonexistent dodge/ready variants',()=>{
  for(const [id,action,event] of [
    ['zipcaster','zip','fire'],
    ['ultraStamp','swing','fire'],
    ['ultraStamp','jumpSwing','impact'],
    ['tripleInkstrike','marker','fire'],
    ['crabTank','cannon','fire_alt'],
    ['waveBreaker','pulse','impact'],
    ['killerWail','laser','fire'],
    ['reefslider','impact','explosion'],
    ['tentaMissiles','target','ready'],
    ['killerWail','target','ready'],
  ]){
    assert.equal(specialActionAudioEvent(id,action),event,id+':'+action);
    assert.ok(clip('special:'+id,event),'installed real MP3: '+id+'/'+event);
  }
  for(const [id,event] of [['slam','charge'],['storm','fire'],['ultraStamp','ready'],
    ['inkjet','open'],['zipcaster','open']]){
    assert.equal(specialActivationAudioEvent(id),event);
    assert.ok(clip('special:'+id,event),'installed activation MP3: '+id+'/'+event);
  }
  assert.equal(specialActionAudioEvent('inkVac','unknown-action'),null);
  assert.equal(specialActionAudioEvent('zipcaster','activate'),'open');
});
