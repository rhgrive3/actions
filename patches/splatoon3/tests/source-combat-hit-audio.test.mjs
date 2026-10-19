import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifySourceCombatHit, playResidentCombatRecording } from '../runtime/audio/source-hit-rules.mjs';
import { KIT_AUDIO } from '../runtime/audio/kit-recipes.mjs';
import { validateAuthorizedManifest } from '../runtime/audio/authorized-samples.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const charger=(id='charger',sourceActor=null)=>({
 weapon:{id,kind:'charger',catalogRecord:sourceActor?
   {family:'charger',sourceActor}:undefined}
});
const e=(id,charge,killed=false,direct=true,sourceActor)=>({
 attacker:charger(id,sourceActor),weaponId:id,killed,
 hitMeta:{chargerDirect:direct,charge}
});

test('admitted charged direct contact uses critical source even without killing',()=>{
 for(const [id,actor] of [
  ['charger',null],['s3-charger-quick','WeaponChargerQuick'],
  ['s3-charger-long','WeaponChargerLong'],['s3-charger-longscope','WeaponChargerLongScope'],
  ['s3-charger-keeper','WeaponChargerKeeper']
 ]){
  assert.equal(classifySourceCombatHit(e(id,1,false,true,actor)),'critical',id);
  assert.equal(classifySourceCombatHit(e(id,1,true,true,actor)),'critical',id+' lethal');
  assert.equal(classifySourceCombatHit(e(id,.65,true,true,actor)),'damage',id+' lethal partial is NOT critical');
  assert.equal(classifySourceCombatHit(e(id,1,true,false,actor)),'damage',id+' no direct collision');
 }
});

test('Bamboo and R-PEN and non-Chargers never borrow classic Charger critical hit',()=>{
 assert.equal(classifySourceCombatHit(e('s3-charger-light',1,true,true,'WeaponChargerLight')),'damage');
 assert.equal(classifySourceCombatHit(e('s3-charger-pencil',1,true,true,'WeaponChargerPencil')),'damage');
 assert.equal(classifySourceCombatHit({weaponId:'shooter',attacker:{weapon:{kind:'shooter'}},
   hitMeta:{chargerDirect:true,charge:1},killed:true}),'damage');
 assert.equal(classifySourceCombatHit({weaponId:'charger',attacker:charger(),
   hitMeta:null,killed:true}),'damage','kill is not a guessed charger critical event');
});

test('authorized source samples are the ONLY accepted combat cue input',()=>{
 const rights='Operator-provided local recording; rights to distribute must be checked';
 const clips=['critical','damage','splat'].map((kind,i)=>({
   id:'combat:'+kind,event:'fire',file:'s3-real/fixture-'+kind+'.mp3',variant:0
 }));
 const entries=validateAuthorizedManifest({schema:1,usageRights:rights,clips});
 assert.equal(entries.length,3);
 const played=[],bank={authorized:{byEvent:new Map()}};
 const audio={weaponBank:()=>bank,playWeapon:(id,event,opts)=>{
   played.push({id,event,opts});return {event,id};
 }};
 const actor={isLocal:true};
 assert.equal(playResidentCombatRecording(audio,'critical',actor,.8),false,
   'missing source must NEVER fabricate a Nintendo sound');
 assert.deepEqual(played,[]);
 bank.authorized.byEvent.set('combat:critical:fire',[{file:'s3-real/fixture-critical.mp3'}]);
 assert.equal(playResidentCombatRecording(audio,'critical',actor,.8),true);
 assert.deepEqual(played.map(x=>x.id),['combat:critical']);
 assert.equal(played[0].opts.actor,actor);
 assert.equal(playResidentCombatRecording(audio,'splat',actor,.9),false,
   'death and critical hit are separate unverified recordings');
 assert.equal(playResidentCombatRecording(audio,'unknown',actor,.8),false);
 for(const kind of ['critical','damage','splat']){
   const r=KIT_AUDIO['combat:'+kind];
   assert.equal(r.family,'combat');assert.deepEqual(r.events,['fire']);
   assert.equal(r.reference,'operator-recorded-only');
 }
});

test('real composed network/damage wrappers preserve ONLY an actor-scoped sound hint',async()=>{
 const {fixture}=await import('./source-fixture.mjs');
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 const attacker=f.make('charger'),victim=f.make('shooter');
 attacker.team=0;attacker.isLocal=false;victim.team=1;victim.isLocal=false;
 victim.invuln=0;victim.hp=100;
 const heard=[];
 const unsub=f.on('hit',event=>heard.push(event));
 const old=attacker._sourceChargerAudioHit;
 attacker._sourceChargerAudioHit={chargerDirect:true,charge:1};
 try{
   assert.equal(f.G.projectiles.applyHit(attacker,victim,35,'charger'),'accepted');
 }finally{attacker._sourceChargerAudioHit=old;}
 assert.equal(heard.length,1);
 assert.equal(heard[0].hitMeta?.chargerDirect,true);
 assert.equal(heard[0].hitMeta?.charge,1);
 assert.equal(victim.hp,65,'source hint cannot change real damage');
 assert.equal(classifySourceCombatHit(heard[0]),'critical');
 const health=victim.hp;
 assert.equal(f.G.projectiles.applyHit(attacker,victim,5,'charger'),'accepted');
 assert.equal(victim.hp,health-5);
 assert.equal(heard.at(-1)?.hitMeta,null,'a later independent hit must not inherit stale charge');
 unsub();
});

test('real runtime carries source charge metadata, built game prefers source sound when resident',()=>{
 const raw=fs.readFileSync(new URL('../../../inkwave-public/src/game/weapons.js',import.meta.url),'utf8');
 const catalog=fs.readFileSync(new URL('../runtime/main-weapon-catalog.mjs',import.meta.url),'utf8');
 assert.match(raw,/a\._sourceChargerAudioHit=\{chargerDirect:true,charge\}/);
 assert.match(raw,/emit\('hit', \{ attacker, victim, damage: dmg, killed, weaponId, hitMeta:attacker\?\._sourceChargerAudioHit\?\?null \}\)/);
 assert.match(catalog,/if\(s\.r\.family==='charger'\)owner\._sourceChargerAudioHit=\{chargerDirect:true,charge:d\.charge\}/);
 const src=fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8');
 const built=adaptBuildSource('src/main.js',src);
 assert.match(built,/import \{ classifySourceCombatHit, playResidentCombatRecording \}/);
 assert.match(built,/on\('hit', \(\{ attacker, victim, damage, killed, weaponId, hitMeta \}\)/);
 assert.match(built,/playResidentCombatRecording\(G\.audio,classifySourceCombatHit\(\{attacker,weaponId,hitMeta\}\),attacker,0\.6\)/);
 assert.match(built,/playResidentCombatRecording\(G\.audio,'splat',attacker,0\.9\)/);
});
