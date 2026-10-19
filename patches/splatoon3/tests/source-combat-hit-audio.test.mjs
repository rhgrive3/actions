import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sourceChargerHitCue } from '../runtime/audio/combat-hit-classifier.mjs';
import { COMBAT_AUDIO } from '../runtime/audio/combat-recipes.mjs';
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

const cue=event=>sourceChargerHitCue(event.weaponId,event.hitMeta?.chargerDirect===true?event.hitMeta.charge:null);

test('admitted charged direct contact uses critical source even without killing',()=>{
 for(const [id,actor] of [
  ['charger',null],['s3-charger-quick','WeaponChargerQuick'],
  ['s3-charger-long','WeaponChargerLong'],['s3-charger-longscope','WeaponChargerLongScope'],
  ['s3-charger-keeper','WeaponChargerKeeper']
 ]){
  assert.equal(cue(e(id,1,false,true,actor)),'combat:critical',id);
  assert.equal(cue(e(id,1,true,true,actor)),'combat:critical',id+' lethal');
  assert.equal(cue(e(id,.65,true,true,actor)),'combat:damage',id+' lethal partial is NOT critical');
  assert.equal(cue(e(id,1,true,false,actor)),'combat:damage',id+' no direct collision');
 }
});

test('Bamboo and R-PEN and non-Chargers never borrow classic Charger critical hit',()=>{
 assert.equal(cue(e('s3-charger-light',1,true,true,'WeaponChargerLight')),'combat:damage');
 assert.equal(cue(e('s3-charger-pencil',1,true,true,'WeaponChargerPencil')),'combat:damage');
 assert.equal(cue(e('s3-charger-light-01',1,true,true)),'combat:damage','Bamboo variant excluded');
 assert.equal(cue(e('s3-charger-pencil-01',1,true,true)),'combat:damage','R-PEN variant excluded');
 assert.equal(cue({attacker:charger(),weaponId:'sub:bomb',
   hitMeta:{chargerDirect:true,charge:1}}),null,'a bomb cannot inherit the held Charger critical cue');
 assert.equal(cue({weaponId:'shooter',attacker:{weapon:{kind:'shooter'}},
   hitMeta:{chargerDirect:true,charge:1},killed:true}),null,'non-Charger cannot borrow direct-hit source');
 assert.equal(cue({weaponId:'charger',attacker:charger(),
   hitMeta:null,killed:true}),'combat:damage','kill is not a guessed charger critical event');
});

test('source combat cue IDs are accepted only in the verified recording library',()=>{
 const rights='Operator-provided local recording; rights to distribute must be checked';
 const clips=['critical','damage','splat'].map((kind,i)=>({
   id:'combat:'+kind,event:'fire',file:'s3-real/fixture-'+kind+'.mp3',variant:0
 }));
 const entries=validateAuthorizedManifest({schema:1,usageRights:rights,clips});
 assert.equal(entries.length,3);
 for(const kind of ['critical','damage','splat']){
   const r=COMBAT_AUDIO['combat:'+kind];
   assert.equal(r.family,'combat');assert.deepEqual(r.events,['fire']);
   assert.match(r.reference,/source-verified/,'recording is routed by the existing source-only library');
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
   f.G.projectiles.applyHit(attacker,victim,35,'charger');
 }finally{attacker._sourceChargerAudioHit=old;}
 assert.equal(heard.length,1);
 assert.equal(heard[0].hitMeta?.chargerDirect,true);
 assert.equal(heard[0].hitMeta?.charge,1);
 assert.equal(victim.hp,65,'source hint cannot change real damage');
 assert.equal(cue(heard[0]),'combat:critical');
 const health=victim.hp;
 f.G.projectiles.applyHit(attacker,victim,5,'charger');
 assert.equal(victim.hp,health-5);
 assert.equal(heard.length,2,'accepted hits are verified by emitted events, not return conventions');
 assert.equal(heard.at(-1)?.hitMeta,null,'a later independent hit must not inherit stale charge');
 unsub();
});

test('real runtime carries source charge metadata, built game prefers source sound when resident',()=>{
 const raw=fs.readFileSync(new URL('../../../inkwave-public/src/game/weapons.js',import.meta.url),'utf8');
 const weapon=adaptBuildSource('src/game/weapons.js',raw);
 const catalog=fs.readFileSync(new URL('../runtime/main-weapon-catalog.mjs',import.meta.url),'utf8');
 const nativeThrough=fs.readFileSync(new URL('../runtime/weapons.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(raw,/a\._sourceChargerAudioHit=\{chargerDirect:true,charge\}/,
   'locked original weapons.js is not altered merely to install audio');
 assert.match(weapon,/a\._sourceChargerAudioHit=\{chargerDirect:true,charge\}/);
 assert.match(weapon,/emit\('hit', \{ attacker, victim, damage: dmg, killed, weaponId, hitMeta:attacker\?\._sourceChargerAudioHit\?\?null \}\)/);
 assert.match(catalog,/if\(s\.r\.family==='charger'\)owner\._sourceChargerAudioHit=\{chargerDirect:true,charge:d\.charge\}/);
 assert.match(nativeThrough,/a\._sourceChargerAudioHit = \{ chargerDirect: true, charge \}/,'full-charge through victims retain sound metadata');
 assert.match(nativeThrough,/finally \{ a\._sourceChargerAudioHit = previous; \}/,'through-hit sound scope cannot leak');
 const src=fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8');
 const built=adaptBuildSource('src/main.js',src);
 assert.match(built,/import \{ sourceChargerHitCue \}/);
 assert.match(built,/on\('hit', \(\{ attacker, victim, damage, killed, weaponId, hitMeta \}\)/);
 assert.match(built,/sourceChargerHitCue\(weaponId,hitMeta\?\.chargerDirect===true\?hitMeta\.charge:null\)/);
 assert.match(built,/G\.audio\?\.playWeapon\?\.\('combat:splat','fire'/);
 assert.ok(built.includes("const recordedCue=(chargerCue==='combat:critical'||directBlaster)?'combat:critical':damage>=40?'combat:ink_focus_strong':'combat:ink_focus_normal'"),
   'normal hits and Blaster direct hits must share recorded real-only cues');
 assert.doesNotMatch(built,/G\.audio\?\.play\('splat_enemy', \{ volume: 0\.9 \}\)/,
   'no synthesized kill-confirm at non-Charger splats');
});
