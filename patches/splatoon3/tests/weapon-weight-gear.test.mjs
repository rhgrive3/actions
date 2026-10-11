import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './source-fixture.mjs';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';
import {WEAPON_WEIGHTS} from '../runtime/weapon-weight-data.mjs';
import {WEIGHT_SPEED_CURVES, resolveWeaponGearCurve} from '../runtime/weapon-weight.mjs';
import {gearCurve,emptyLoadout} from '../runtime/gear.mjs';
const close=(a,b,msg)=>assert.ok(Math.abs(a-b)<1e-8,`${msg}: ${a} != ${b}`);
async function setup(){const f=await fixture({fullRuntime:true,productionComposition:true,extraExports:"export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);return f;}
function loadout(ability,ap){const l=emptyLoadout();let left=ap;for(const p of l)if(left>=10){p.main=ability;left-=10;}for(const p of l)for(let i=0;i<3;i++)if(left>=3){p.subs[i]=ability;left-=3;}assert.equal(left,0);return l;}
test('all 65 source weight rows retain explicit versus default identity',()=>{
 const ref=JSON.parse(fs.readFileSync(new URL('../reference/weapon-weight-1130.json',import.meta.url)));assert.equal(ref.records.length,65);
 for(const r of MAIN_WEAPON_CATALOG.records){const w=ref.records.find(x=>x.id===r.id);assert.equal(w.sourceSha256,r.sourceSha256);assert.equal(WEAPON_WEIGHTS[r.id].speed,w.speed);}
 assert.equal(WEAPON_WEIGHTS['s3-shooter-first'].speed,'Fast');assert.equal(WEAPON_WEIGHTS['s3-stringer-explosion'].speed,'Slow');
});
test('source missing and negative gear overrides inherit defaults, never negative costs',()=>{
 assert.deepEqual(resolveWeaponGearCurve({Overwrite_ConsumeRt_Main_Mid:.7,Overwrite_ConsumeRt_Main_High:.5},'Overwrite_ConsumeRt_Main_',[1,.775,.55]),[1,.7,.5]);
 assert.deepEqual(resolveWeaponGearCurve({Overwrite_ConsumeRt_Main_Low:-1,Overwrite_ConsumeRt_Main_Mid:-1,Overwrite_ConsumeRt_Main_High:-1},'Overwrite_ConsumeRt_Main_',[1,.775,.55]),[1,.775,.55]);
});
test('65 actual Actors use their full weight curves for 0/3/10/30/57 AP and weapon switching',async()=>{
 const f=await setup();
 for(const r of MAIN_WEAPON_CATALOG.records)for(const ap of [0,3,10,30,57]){
  const a=f.make(r.id);a.grounded=true;a.s3.loadout=loadout('runSpeed',ap);a.s3RefreshGear();
  const c=WEIGHT_SPEED_CURVES[WEAPON_WEIGHTS[r.id].speed];
  close(a.weaponRunner.moveSpeed(),gearCurve(ap,...c.run)*60,r.id+' run AP'+ap);
  a.s3.loadout=loadout('swimSpeed',ap);a.s3RefreshGear();close(a.s3.modifiers.swimSpeed*f.PLAYER.swimSpeed,gearCurve(ap,...c.swim)*60,r.id+' swim AP'+ap);
  a.setWeapon('shooter');a.setWeapon(r.id);close(a.s3.modifiers.swimSpeed*f.PLAYER.swimSpeed,gearCurve(ap,...c.swim)*60,r.id+' switch');
 }
});
test('Heavy Edit and partial main-ink overrides consume positive source costs at every AP',async()=>{
 const f=await setup();for(const id of ['s3-spinner-hypershort','s3-shooter-expert','s3-shelter-wide'])for(const ap of [0,3,10,30,57]){
  const a=f.make(id);a.s3.loadout=loadout('inkSaverMain',ap);a.s3RefreshGear();const curve=id==='s3-spinner-hypershort'?[1,.775,.55]:[1,.7,.5];
  close(a.s3.modifiers.inkSaverMain,gearCurve(ap,...curve),id+' ink');assert.ok(a.weapon.inkPerShot>=0,id);
 }
});
test('actual weighted horizontal velocity is radial and frame-rate independent at 30/60/120 Hz',async()=>{
 const f=await setup();
 for(const id of ['s3-shooter-short','shooter','s3-charger-long'])for(const hz of [30,60,120])for(const form of ['kid','squid'])for(const direction of [[1,0],[0,1],[Math.SQRT1_2,Math.SQRT1_2]]){
  const a=f.make(id);a.form=form;a.grounded=true;a.submerged=form==='squid';a.intent.move.set(direction[0],0,direction[1]);a.vel.set(0,0,0);
  for(let i=0;i<hz*2;i++)a._horizontal(1/hz,form==='squid',false);
  const c=WEIGHT_SPEED_CURVES[WEAPON_WEIGHTS[id].speed][form==='kid'?'run':'swim'][0]*60;
  close(Math.hypot(a.vel.x,a.vel.z),c,id+' '+hz+' '+form);
 }
});
test('Flow refresh retains weight and AP saturation instead of overwriting with Normal curves',async()=>{
 const f=await setup();for(const id of ['s3-shooter-first','s3-spinner-hyper']){
  const a=f.make(id);a.grounded=true;a.s3.loadout=loadout('runSpeed',30);a.s3.flow.active=true;a.s3RefreshGear();
  close(a.weaponRunner.moveSpeed(),.144*60,id+' capped Flow run');
  a.s3.flow.active=false;f.emit('actor:flow',{actor:a});close(a.weaponRunner.moveSpeed(),gearCurve(30,...WEIGHT_SPEED_CURVES[WEAPON_WEIGHTS[id].speed].run)*60,id+' expired Flow');
 }
});
test('weight speed curves match pinned original misc parameters when source fixture is present', {skip:!process.env.INKWAVE_WEIGHT_PARAMS},()=>{
 const bytes=fs.readFileSync(process.env.INKWAVE_WEIGHT_PARAMS),p=JSON.parse(bytes);
 for(const [weight,curves]of Object.entries(WEIGHT_SPEED_CURVES))for(const [kind,stem]of [['run','MoveVel_Human'],['swim','MoveVel_Stealth']]){
  assert.deepEqual(curves[kind],p[stem+(weight==='Mid'?'':'_'+weight)].slice().reverse());
 }
});
