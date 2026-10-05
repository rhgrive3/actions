#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
export const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
export function verifyCompletion({profilePath=path.join(ROOT,'patches/splatoon3/profile.json'),rawDir=path.join(ROOT,'reference-data/weapons')}={}){
 const profile=JSON.parse(fs.readFileSync(profilePath));
 const reference=JSON.parse(fs.readFileSync(path.join(ROOT,'patches/splatoon3/reference/weapons-fidelity-reference.json')));
 const completion=profile.weaponsFidelityCompletion,raw=new Map(),hashes={};
 assert.equal(completion.sourceCommit,'7280ff9cde8bb1c5dcef46c700c326471584d2e6');
 assert.equal(completion.referenceHz,60);assert.equal(completion.worldUnitsPerSourceUnit,1,'retained local scale; not SI');
 let numericLeaves=0,bindings=0;
 const count=v=>{if(typeof v==='number')numericLeaves++;else if(v&&typeof v==='object')Object.values(v).forEach(count);};
 const check=(a,b,label)=>{assert.deepEqual(a,b,label);bindings++;};
 for(const source of reference.sources.filter(s=>s.expectedFileSha256)){
  const bytes=fs.readFileSync(path.join(rawDir,path.basename(new URL(source.url).pathname)));
  check(sha256(bytes),source.expectedFileSha256,'whole-file hash '+source.id);
  const data=JSON.parse(bytes);raw.set(source.id,data);hashes[source.id]=sha256(bytes);
  assert.deepEqual(completion.weapons[source.id],data.GameParameters,'verbatim completion source mirror '+source.id);count(data.GameParameters);
 }
 for(const field of reference.explicitFields){let v=raw.get(field.sourceId);for(const part of field.pointer.split('/').slice(1))v=v?.[part.replace(/~1/g,'/').replace(/~0/g,'~')];assert.deepEqual(v,field.value,field.sourceId+field.pointer);}
 for(const id of ['shooter','dualies','blaster','splatling','charger'])check(profile.weapons[id].fieldCollisionRadius,raw.get(id).GameParameters.CollisionParam.InitRadiusForField,id+' field radius');
 for(const id of ['shooter','dualies','splatling']){
  const d=raw.get(id).GameParameters.DamageParam,w=profile.weapons[id];
  check(w.damage,d.ValueMax/10,id+' max damage');check(w.damageMin,d.ValueMin/10,id+' min damage');
  check(w.damageReduceStart,d.ReduceStartFrame/60,id+' damage start');check(w.damageReduceEnd,d.ReduceEndFrame/60,id+' damage end');
 }
 const r=raw.get('roller').GameParameters,w=profile.weapons.roller;
 const bands=d=>['Max','High','Low','Min'].map(k=>[d['Damage'+k+'Distance'],d['Damage'+k+'Value']/10]);
 check(w.flickDamageBands,bands(r.WideSwingUnitGroupParam.DamageParam.Inside),'roller inside envelope');
 check(w.verticalDamageBands,bands(r.VerticalSwingUnitGroupParam.DamageParam.Inside),'roller vertical envelope');
 check(w.ballistics.horizontalOutsideDamageBands,bands(r.WideSwingUnitGroupParam.DamageParam.Outside),'roller outside four-band owner');
 // Latest main owns the extra horizontal near unit separately: native 12 + source unit1 count1.
 check(w.flickDrops,r.WideSwingUnitGroupParam.Unit[0].BulletNum,'roller main native count');
 check(w.nearFlickUnit.count,r.WideSwingUnitGroupParam.Unit[1].BulletNum??1,'roller latest-main near unit count');
 check(w.verticalDrops,r.VerticalSwingUnitGroupParam.Unit.reduce((s,u)=>s+(u.BulletNum??1),0),'roller vertical count');
 const sl=raw.get('slosher').GameParameters;
 check(profile.weapons.slosher.drops,sl.UnitGroupParam.Unit.reduce((s,u)=>s+(u.BulletNum??1),0),'Slosher explicit 4+5 count');
 assert.ok(sl.UnitGroupParam.Unit.every(u=>u.SplashSlosherHitParam.length===0));
 check(profile.weapons.slosher.splashDamage,0,'no unsupported synthetic radial damage');
 check(profile.weapons.splatling.ballistics.firstChargeSpeed,raw.get('splatling').GameParameters.MoveParam.SpawnSpeedFirstLastAndSecond*60,'Splatling endpoint');
 const c=raw.get('charger').GameParameters;
 for(const [k,value] of Object.entries({damageMin:c.DamageParam.ValueMinCharge/10,damagePartialMax:c.DamageParam.ValueMaxCharge/10,damageMax:c.DamageParam.ValueFullCharge/10,rangeMin:c.MoveParam.DistanceMinCharge,rangeMax:c.MoveParam.DistanceFullCharge}))check(profile.weapons.charger[k],value,'Charger '+k);
 for(const name of ['distanceScale','radiusGrowth','chargerSpeed','splatlingSpeed','splatlingRandom','rollerOmittedCount','rollerSpawnAnchor','rollerHorizontalRandom','slosherAim','slosherOffsets','paint'])assert.ok(completion.models[name]?.length>20,'required uncertainty label '+name);
 return {status:'passed',files:raw.size,sha256:hashes,priorExplicitFields:reference.explicitFields.length,mirroredNumericLeaves:numericLeaves,checkedBindingsIncludingHashes:bindings,mirrorIsNotProofOfRuntimeUse:true,analystDefaultsVerified:false,engineParityCertified:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const rawDir=process.argv[2]?path.resolve(process.argv[2]):path.join(ROOT,'reference-data/weapons');
 console.log(JSON.stringify(verifyCompletion({rawDir}),null,2));
}
