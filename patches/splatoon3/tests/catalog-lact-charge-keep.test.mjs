import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const extraExports="export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';export {MAIN_WEAPON_CATALOG} from './patches/splatoon3/runtime/main-weapon-catalog-data.mjs';";
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports});f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);f.G.settings={};f.setRandom(()=>.37);
const records=f.MAIN_WEAPON_CATALOG.records,find=actor=>records.find(r=>r.sourceActor===actor);
const lact=find('WeaponStringerShort'),close=(a,b,label='')=>assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`),results=[];
function boot(record,hz){
 f.G.projectiles.clear();f.G.actors=[];f.G.time=0;const a=f.make(record.id);a.kidT=10;a.form='kid';a.ink=100;a.aimDir.set(0,0,1);a.aimPoint.set(0,1,100);a.weaponRunner.cooldown=0;
 const r=a.weaponRunner,clock=new f.FixedClock(),x={a,r,clock,n:0,debit:0,credit:0,writes:[],hz};let ink=a.ink;
 Object.defineProperty(a,'ink',{configurable:true,get(){return ink;},set(v){const delta=v-ink;if(delta!==0)x.writes.push({tick:x.n,delta});x.debit+=Math.max(0,-delta);x.credit+=Math.max(0,delta);ink=v;}});
 x.drive=fn=>{let done=false;for(let render=0;render<hz*20&&!done;render++)clock.advance(1/hz,dt=>{if(done)return;x.n++;const input=fn('before',x);Object.assign(a.intent,input);f.G.time+=dt;a.update(dt);close(a.ink,100-x.debit+x.credit,'every ink write accounted');done=!!fn('after',x);});assert.ok(done,'bounded scenario completes');};return x;
}
for(const hz of [30,60,120])for(const holdFrames of [30,74,75])test(`LACT full charge -> squid ${holdFrames}F -> return/release at ${hz}Hz`,()=>{
 const kp=lact.parameters.spl__WeaponStringerParam.ChargeKeepParam;assert.equal(kp.KeepChargeFullFrame,75);assert.equal(Object.hasOwn(lact.parameters.spl__WeaponStringerParam,'IsEnableChargeKeep'),false);
 const x=boot(lact,hz),{a,r}=x;let phase='charge',paid=0,frames=0,held=0,returnTicks=0,afterRelease=0,restoreCharge=null,releaseTick=null,expired=holdFrames>=kp.KeepChargeFullFrame;
 x.drive((when)=>{
  if(when==='before')return phase==='charge'||phase==='return'?{fire:true,squid:false}:phase==='hold'?{fire:false,squid:true}:{fire:false,squid:false};
  const s=r.catalogState,shots=f.G.projectiles.list;
  if(phase==='charge'){
   assert.equal(shots.length,0);if(r.charge===1){paid=s.paid;frames=s.chargeF;close(x.debit,paid);close(paid,100*lact.parameters.spl__WeaponStringerParam.ChargeParam.InkConsumeFullCharge,'pinned full-charge cost');assert.ok(paid>0);phase='hold';}
  }else if(phase==='hold'){
   held++;assert.equal(a.form,'squid','native Actor admits actual squid form');assert.equal(s.chargeF,0);assert.equal(s.paid,0);assert.equal(r.charging,false);assert.equal(shots.length,0);close(x.debit,paid,'holding adds no debit');
   if(held<kp.KeepChargeFullFrame){assert.ok(s.stored,'prepaid full charge is stored');close(s.stored.frames,frames);close(s.stored.paid,paid);close(s.stored.remaining,(kp.KeepChargeFullFrame-held)/60,'existing keep clock');}
   else assert.equal(s.stored,null,'75th reference tick expires stored charge');
   if(held===holdFrames)phase='return';
  }else if(phase==='return'){
   returnTicks++;assert.equal(a.form,'kid');assert.equal(shots.length,0,'return/charge never releases an arrow');
   if(!expired)close(x.debit,paid,'restoring paid charge never debits twice');
   if(r.charge===1){restoreCharge=r.charge;assert.equal(s.stored,null);close(s.paid,paid);close(s.chargeF,frames);close(x.debit,paid*(expired?2:1),expired?'expired full shot must be paid again':'reuse original payment');phase='release';}
   assert.ok(returnTicks<Math.ceil(a.weapon.chargeTime*60)+60,'return completes within existing emergence/charge limits');
  }else if(phase==='release'){
   releaseTick=x.n;assert.equal(shots.length,lact.parameters.spl__WeaponStringerParam.ShotParam.ArrowNum);assert.ok(shots.every(p=>p.wid===lact.id&&Math.abs(p.catalog.descriptor.charge-1)<1e-9),'one fully funded native volley');assert.equal(s.stored,null);assert.equal(s.paid,0);assert.equal(s.chargeF,0);assert.equal(r.charge,0);assert.equal(r.charging,false);phase='after';
  }else if(phase==='after'){
   afterRelease++;assert.equal(shots.length,lact.parameters.spl__WeaponStringerParam.ShotParam.ArrowNum,'no duplicate/delayed volley');close(x.debit,paid*(expired?2:1));assert.equal(s.stored,null);if(afterRelease===20)return true;
  }
  return false;
 });
 results.push({hz,holdFrames,expired,paid,chargeFrames:frames,debit:x.debit,credit:x.credit,finalInk:a.ink,releaseTick,shots:f.G.projectiles.list.length,returnTicks,restoreCharge,writes:x.writes});
});
for(const hz of [30,60,120])for(const [actor,flag,expected]of [
 ['WeaponStringerShort',false,false],['WeaponStringerShort',true,true],['WeaponStringerNormal',false,false],['WeaponStringerExplosion',false,false],['WeaponStringerNormal','omitted',false],['WeaponStringerExplosion','omitted',false]
])test(`explicit/omitted capability control ${actor}/${flag} at ${hz}Hz`,()=>{
 const rec=find(actor),p=rec.parameters.spl__WeaponStringerParam,had=Object.hasOwn(p,'IsEnableChargeKeep'),old=p.IsEnableChargeKeep;
 try{
  if(flag==='omitted')delete p.IsEnableChargeKeep;else p.IsEnableChargeKeep=flag;
  const x=boot(rec,hz);let phase='charge',paid;
  x.drive((when)=>{if(when==='before')return phase==='charge'?{fire:true,squid:false}:{fire:false,squid:true};const s=x.r.catalogState;if(phase==='charge'&&x.r.charge===1){paid=s.paid;phase='hold';return false;}if(phase==='hold'&&x.a.form==='squid'){assert.equal(!!s.stored,expected);close(x.debit,paid);assert.equal(f.G.projectiles.list.length,0);return true;}return false;});
 }finally{if(had)p.IsEnableChargeKeep=old;else delete p.IsEnableChargeKeep;}
});
for(const hz of [30,60,120])for(const actor of ['WeaponChargerLong','WeaponSpinnerSerein'])test(`non-Stringer charge keep remains enabled: ${actor} at ${hz}Hz`,()=>{
 const rec=find(actor);assert.ok(rec?.parameters.WeaponKeepChargeParam);const x=boot(rec,hz);let phase='charge',paid;
 x.drive((when)=>{if(when==='before')return phase==='charge'?{fire:true,squid:false}:{fire:false,squid:true};const s=x.r.catalogState;if(phase==='charge'&&x.r.charge===1){paid=s.paid;phase='hold';return false;}if(phase==='hold'&&x.a.form==='squid'){assert.ok(s.stored);close(s.stored.paid,paid);close(x.debit,paid);assert.equal(f.G.projectiles.list.length,0);return true;}return false;});
});

for(const hz of [30,60,120])test(`LACT partial charge is not promoted into stored full charge at ${hz}Hz`,()=>{
 const x=boot(lact,hz);let phase='charge',paid;
 x.drive((when)=>{if(when==='before')return phase==='charge'?{fire:true,squid:false}:{fire:false,squid:true};const s=x.r.catalogState;if(phase==='charge'&&x.r.charge>=.5){assert.ok(x.r.charge<1);paid=s.paid;phase='hold';return false;}if(phase==='hold'&&x.a.form==='squid'){assert.equal(s.stored,null);close(x.debit,paid);assert.equal(f.G.projectiles.list.length,0);return true;}return false;});
});
// Empty ink still permits charge animation. Observe naturally timed admission,
// including the Actor's initial recovery credit, instead of fabricating payment.
for(const hz of [30,60,120])test(`LACT underfunded charge/keep cannot create unpaid arrows at ${hz}Hz`,()=>{
 const x=boot(lact,hz);x.a.ink=0;const initialDebit=x.debit;
 const p=lact.parameters.spl__WeaponStringerParam.ChargeParam;
 // Two seconds is a test observation window, not a replacement game parameter.
 let phase='charge',chargeTicks=0,returnTicks=0,release=0;
 x.drive((when)=>{
  if(when==='before')return phase==='charge'||phase==='return'?{fire:true,squid:false}:phase==='hold'?{fire:false,squid:true}:{fire:false,squid:false};
  const s=x.r.catalogState;
  assert.equal(f.G.projectiles.list.length,0,'no underfunded emission in any phase');
  close(x.debit-initialDebit,x.credit-x.a.ink,'only recovered ink may fund this cycle');
  if(phase==='charge'&&++chargeTicks===120){
   assert.ok(s.paid<100*p.InkConsumeMinCharge,'available payment remains below the pinned minimum');
   phase='hold';return false;
  }
  if(phase==='hold'){assert.equal(x.a.form,'squid');phase='return';return false;}
  if(phase==='return'){
   returnTicks++;assert.equal(x.a.form,'kid');
   if(x.r.charging){assert.ok(s.paid<100*p.InkConsumeMinCharge);phase='release';}
   assert.ok(returnTicks<60,'native emergence admits charging within one second');return false;
  }
  if(phase==='release'&&++release===20){assert.equal(s.stored,null);assert.equal(s.paid,0);return true;}
  return false;
 });
});
// Current main installs LACT Deco. Its presence is a required regression guard,
// and it must inherit the base record and its keep capability.
const lactDecoId='s3-stringer-short-01';
test('actual LACT Deco inherits full-charge keep and one funded release',()=>{
 assert.ok(f.WEAPONS[lactDecoId],'current main must install the actual LACT Deco');
 const x=boot({id:lactDecoId},60);assert.equal(x.a.weapon.catalogRecord,lact);assert.equal(x.a.weapon.sourceMainActor,'WeaponStringerShort');
 let phase='charge',paid=0,held=0,after=0;
 x.drive((when)=>{
  if(when==='before')return phase==='charge'||phase==='return'?{fire:true,squid:false}:phase==='hold'?{fire:false,squid:true}:{fire:false,squid:false};
  const s=x.r.catalogState,shots=f.G.projectiles.list;
  if(phase==='charge'&&x.r.charge===1){paid=s.paid;phase='hold';return false;}
  if(phase==='hold'){assert.equal(x.a.form,'squid');assert.ok(s.stored);close(s.stored.paid,paid);close(x.debit,paid);assert.equal(shots.length,0);if(++held===30)phase='return';return false;}
  if(phase==='return'&&x.r.charge===1){close(s.paid,paid);close(x.debit,paid);assert.equal(shots.length,0);phase='release';return false;}
  if(phase==='release'){
   assert.equal(shots.length,3);assert.ok(shots.every(p=>p.owner===x.a&&Math.abs(p.catalog.descriptor.charge-1)<1e-9));
   close(x.debit,paid);assert.equal(s.paid,0);assert.equal(s.stored,null);if(++after===20)return true;
  }
  return false;
 });
});
