import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {decodeSaberSwingVisual} from '../runtime/saber-presentation.mjs';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';
const C={ANC:0,ANCR:3,CHEST:6,SPINE:9,IKL:12};
async function setup(){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,includeCharacter:true,
  extraExports:"export * as REG from './patches/splatoon3/runtime/weapon-models/registry.mjs';"});
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};f.G.scene=new f.THREE.Scene();f.G.settings={};return f;
}
function tick(a,fire,n=1){for(let i=0;i<n;i++)a.weaponRunner.update(1/60,{fire,firePressed:fire&&i===0});}
function record(f,p,time){let packet;f.NetMatch.prototype.recProj.call({_rec:row=>{packet=[time,...row,0,1];return packet;},cfg:{id:'saber-wire'}},p);return packet;}
function expectedYaw(visual){
 const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
 const u=(visual.ageOffset+1/60)/(visual.duration+.12),ee=smooth((u-.12)/.4);
 const k=Math.min(1,u*8)*(1-smooth((u-.6)/.4));return (-.9+1.8*ee)*(visual.ordinal%2===0?1:-1)*k;
}
function pose(f,a){
 const ch={weapon:{def:{modelId:a.weapon.variantOf||a.weapon.id}},_runner:()=>a.weaponRunner,kidForm:true,P:new Float64Array(16)};
 const family=f.REG.weaponFamilyPose(a.weapon.id);assert.equal(typeof family,'function');family(ch,1/60,{},C);
 return {ch,family};
}

test('recorder→ghost→production registry reconstructs stepped Dental37F/55F and ordinary23F/32F without remote gameplay',async()=>{
 const f=await setup();
 for(const stepped of [false,true]){
  const a=f.make('s3-saber-heavy');a.form='kid';a.nid=stepped?2:1;a.aimDir.set(0,0,1);a.intent.move.set(0,0,stepped?1:0);
  tick(a,true,20);tick(a,false,38);
  const p=f.G.projectiles.list.filter(p=>p.owner===a&&p.catalog).at(-1);assert.ok(p);
  const packet=record(f,p,stepped?2:1);assert.equal(packet[27].s3Catalog.length,5);
  assert.deepEqual([...packet[27].s3SaberSwing],[1,stepped?1:0,0]);
  const remote=new f.Actor({team:1,weapon:'s3-saber-heavy',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
  remote.character.actor=remote;remote.character.onEvent=null;remote.remote=true;remote.form='kid';remote.grounded=true;remote.ground.hit=true;f.G.actors.push(remote);
  f.G.projectiles.ghostProjectile(remote,packet);
  const state=remote.weaponRunner.catalogState,visual=state.saberSwing;
  assert.equal(visual.stepped,stepped);assert.equal(visual.ageOffset,(stepped?37:23)/60);assert.equal(visual.duration,(stepped?55:32)/60);
  remote._finishFrame(1/60);assert.ok([...remote.character.P].every(Number.isFinite));
  // Use the bundled registry's public entry, not an unbundled family-file
  // debug snapshot. Reapplying at dt0 exposes the already advanced real pose.
  const channel=f.CHARACTER_CHANNELS.ANCR+1,before=remote.character.P[channel];
  f.REG.weaponFamilyPose(remote.weapon.id)(remote.character,0,remote.anim,f.CHARACTER_CHANNELS);
  assert.ok(Math.abs((remote.character.P[channel]-before)-expectedYaw(visual))<1e-6,'real Character already advanced the registered family clock by one frame');
  const {ch}=pose(f,remote);assert.ok(Math.abs(ch.P[C.ANCR+1]-expectedYaw(visual))<1e-8);assert.ok([...ch.P].every(Number.isFinite));
  assert.equal(state.melee,null);assert.equal(state.pending,null);assert.equal(state.lunge,null);assert.equal(state.chargeF,0);assert.equal(remote.ink,100);
 }
});

test('explicit side survives a lost preceding shot, while malformed/legacy/reordered metadata cannot reset a newer visual swing',async()=>{
 const f=await setup(),a=f.make('s3-saber-normal');a.form='kid';a.nid=3;a.aimDir.set(0,0,1);
 tick(a,true);tick(a,false,40);tick(a,true);tick(a,false,12);
 const p=f.G.projectiles.list.filter(p=>p.owner===a&&p.catalog).at(-1),packet=record(f,p,2);
 assert.deepEqual([...packet[27].s3SaberSwing],[1,0,1]);
 const remote=f.make('s3-saber-normal');remote.remote=true;remote.form='kid';f.G.projectiles.ghostProjectile(remote,packet);
 const state=remote.weaponRunner.catalogState;assert.equal(state.saberSwing.ordinal,1,'receiver did not need to see preceding left slash');
 const {ch}=pose(f,remote);assert.ok(Math.abs(ch.P[C.ANCR+1]-expectedYaw(state.saberSwing))<1e-8,'explicit right side drives the registered pose');
 for(const wire of [null,[],[1,0],[1,0,1,2],[2,0,1],[1,2,1],[1,0,-1],[1,0,.5],[1,1,1],{version:1}]){
  const malformed=[...packet];malformed[0]=3;malformed[27]={...packet[27],s3SaberSwing:wire};
  f.G.projectiles.ghostProjectile(remote,malformed);assert.equal(state.saberSwing.serial,1,JSON.stringify(wire));
 }
 const older=[...packet];older[0]=1;older[27]={...packet[27],s3SaberSwing:[1,0,0]};
 f.G.projectiles.ghostProjectile(remote,older);f.G.projectiles.ghostProjectile(remote,packet);assert.equal(state.saberSwing.serial,1);
 const legacy=[...packet];legacy[0]=4;legacy[27]={...packet[27]};delete legacy[27].s3SaberSwing;
 f.G.projectiles.ghostProjectile(remote,legacy);assert.equal(state.saberSwing.serial,2);assert.equal(state.saberSwing.legacy,true);assert.equal(state.saberSwing.stepped,false);
 assert.equal(state.saberSwing.ageOffset,9/60);assert.equal(state.melee,null);
});

test('wire timing derives exclusively from the pinned source and refuses incompatible main/mode/charge combinations',()=>{
 const r=MAIN_WEAPON_CATALOG.records.find(r=>r.id==='s3-saber-heavy');
 assert.equal(decodeSaberSwingVisual(r,'saber-vertical',.5,[1,1,0]),null);
 assert.equal(decodeSaberSwingVisual(r,'saber-horizontal',1,[1,0,0]),null);
 assert.equal(decodeSaberSwingVisual(r,'normal',1,[1,1,0]),null);
 assert.equal(decodeSaberSwingVisual({...r,family:'brella'},'saber-vertical',1,[1,1,0]),null);
 assert.equal(decodeSaberSwingVisual(r,'saber-vertical',1,[1,1,0]).ageOffset,37/60);
});
