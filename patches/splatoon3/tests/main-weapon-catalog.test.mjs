import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { registerMainWeaponCatalog } from '../runtime/main-weapon-catalog.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';

test('registration applies Japanese and English even after the early i18n boot',()=>{
  for(const LANG of ['ja','en']){
    const legacy=MAIN_WEAPON_CATALOG.records.filter(r=>r.legacy);
    const WEAPONS=Object.fromEntries(legacy.map(r=>[r.id,{id:r.id,kind:r.modelKind,class:r.family}]));
    registerMainWeaponCatalog({LANG,WEAPONS,WEAPON_ORDER:legacy.map(r=>r.id)});
    for(const record of MAIN_WEAPON_CATALOG.records)assert.equal(WEAPONS[record.id].name,record.names[LANG]);
  }
});

async function setup() {
  const f = await fixture({ fullRuntime:true, productionComposition:true, realProjectiles:true,
    extraExports:"export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs'; export { MAIN_WEAPON_CATALOG } from './patches/splatoon3/runtime/main-weapon-catalog-data.mjs';" });
  f.installMainWeaponCatalogRuntime(f.installedRuntime, f.profile);
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  return f;
}

test('all 58 additions admit finite native main shots through Actor input', async () => {
  const f = await setup();
  assert.equal(f.WEAPON_ORDER.length,65);
  for (const r of f.MAIN_WEAPON_CATALOG.records.filter(r=>!r.legacy)) {
    f.G.projectiles.clear(); f.G.actors.length=0;
    const a=f.make(r.id);a.form='kid';a.ink=100;a.intent.fire=true;
    f.tick(a,130);a.intent.fire=false;f.tick(a,35);
    assert.ok(f.G.projectiles.list.length>0,r.names.en+' emits');
    assert.ok(Number.isFinite(a.ink)&&a.ink>=0&&a.ink<=100,r.id+' ink');
    for(const p of f.G.projectiles.list) {
      assert.equal(p.wid,r.id);
      for(const [key,value] of Object.entries({damage:p.damage,life:p.life,x:p.pos.x,y:p.pos.y,z:p.pos.z,vx:p.vel.x,vy:p.vel.y,vz:p.vel.z}))
        assert.ok(Number.isFinite(value),r.id+' '+key+'='+value);
      assert.ok(p.catalog,r.id+' catalog projectile');
      for(let i=0;i<15;i++)if(f.G.projectiles._step(p,1/60))break;
      assert.ok([p.pos.x,p.pos.y,p.pos.z,p.vel.x,p.vel.y,p.vel.z].every(Number.isFinite),r.id+' finite flight');
    }
  }
});

test('a tap commits exactly three sourced L-3 burst rounds and charges each round',async()=>{
  const f=await setup(),r=f.MAIN_WEAPON_CATALOG.records.find(r=>r.sourceActor==='WeaponShooterTripleQuick');
  const a=f.make(r.id);a.form='kid';a.intent.fire=true;f.tick(a);
  a.intent.fire=false;f.tick(a,12);
  assert.equal(f.G.projectiles.list.length,3);
  assert.ok(Math.abs(a.ink-(100-r.parameters.WeaponParam.InkConsume*100*3))<1e-6);
});

test('a one-frame charger tap completes the 8F minimum instead of disappearing',async()=>{
  const f=await setup(),r=f.MAIN_WEAPON_CATALOG.records.find(r=>r.sourceActor==='WeaponChargerQuick');
  const a=f.make(r.id);a.form='kid';a.intent.fire=true;f.tick(a);a.intent.fire=false;f.tick(a,10);
  assert.equal(f.G.projectiles.list.length,1);assert.equal(f.G.projectiles.list[0].damage,40);
  assert.ok(Math.abs(a.ink-(100-r.parameters.WeaponParam.InkConsumeMinCharge*100))<1e-6);
});

test('five R-PEN rounds share one full-charge payment and retain 68 direct damage',async()=>{
  const f=await setup(),r=f.MAIN_WEAPON_CATALOG.records.find(r=>r.sourceActor==='WeaponChargerPencil');
  const a=f.make(r.id);a.form='kid';a.intent.fire=true;f.tick(a,72);
  a.intent.fire=false;f.tick(a);
  const ink=a.ink;
  for(let i=0;i<4;i++){f.tick(a,15);const before=a.ink;a.intent.fire=true;f.tick(a);assert.ok(a.ink+1e-6>=before);a.intent.fire=false;f.tick(a);}
  assert.equal(f.G.projectiles.list.length,5);
  assert.ok(f.G.projectiles.list.every(p=>p.damage===68));
  assert.ok(a.ink+1e-6>=ink,'retained rounds consume no second charge');
});

test('charged Stamper slash uses its independent 3F contact before its 6F bullet',async()=>{
  const f=await setup(),r=f.MAIN_WEAPON_CATALOG.records.find(r=>r.sourceActor==='WeaponSaberNormal');
  const a=f.make(r.id);a.form='kid';a.intent.fire=true;f.tick(a,20);
  const hits=[];f.G.projectiles.applyHit=(_a,_b,d)=>hits.push(d);
  const enemy=f.make('shooter');enemy.team=1;enemy.pos.set(0,0,.7);
  a.intent.fire=false;f.tick(a);f.tick(a,3);
  assert.ok(hits.includes(140));assert.equal(f.G.projectiles.list.length,0);
  f.tick(a,3);assert.equal(f.G.projectiles.list.length,1);assert.equal(f.G.projectiles.list[0].damage,70);
});

test('additional dualies replace jump with sourced roll distance and ink cost',async()=>{
  const f=await setup(),r=f.MAIN_WEAPON_CATALOG.records.find(r=>r.sourceActor==='WeaponManeuverDual');
  const a=f.make(r.id);a.form='kid';a.intent.fire=true;a.intent.move.set(1,0,0);
  const cost=r.parameters.SideStepParam.InkConsume*100;
  assert.equal(a.weaponRunner.tryDodge(a.intent.move),true);
  const roll=a.weaponRunner.catalogState.roll;
  assert.ok(Math.abs(roll.speed*roll.remaining-r.parameters.SideStepParam.MoveDist)<1e-9);
  assert.ok(Math.abs(a.ink-(100-cost))<1e-9);
  assert.equal(a.weaponRunner.tryDodge(a.intent.move),false,'no overlapping roll');
});

test('catalog projectile trajectory is independent of 30/60/120Hz update subdivision',async()=>{
  const f=await setup(),r=f.MAIN_WEAPON_CATALOG.records.find(r=>r.sourceActor==='WeaponShooterLong');
  const a=f.make(r.id);a.form='kid';a.intent.fire=true;f.tick(a);
  const source=f.G.projectiles.list[0];assert.ok(source);
  const results=[];
  for(const hz of [30,60,120]) {
    const p=f.G.projectiles._new();
    Object.assign(p,source,{pos:source.pos.clone(),prev:source.prev.clone(),vel:source.vel.clone(),start:source.start.clone(),
      catalog:{...source.catalog,seen:new Set(),hit:new f.Hit()}});
    for(let i=0;i<hz/5;i++)f.G.projectiles._step(p,1/hz);
    results.push([p.pos.x,p.pos.y,p.pos.z,p.vel.x,p.vel.y,p.vel.z]);
  }
  for(const values of results.slice(1))for(let i=0;i<values.length;i++)assert.ok(Math.abs(values[i]-results[0][i])<1e-9);
});

test('sub preparation interrupts prepaid windup without late main emission', async()=>{
  const f=await setup(),r=f.MAIN_WEAPON_CATALOG.records.find(r=>r.sourceActor==='WeaponShelterWide');
  const a=f.make(r.id);a.form='kid';a.intent.fire=true;f.tick(a);
  assert.ok(a.weaponRunner.catalogState.pending);
  a.intent.fire=false;a.intent.sub=true;f.tick(a);
  a.intent.sub=false;f.tick(a,60);
  assert.equal(f.G.projectiles.list.filter(p=>p.catalog).length,0);
});

test('Undercover canopy remains open during continuous shooting and blocks main shots',async()=>{
  const f=await setup(),r=f.MAIN_WEAPON_CATALOG.records.find(r=>r.sourceActor==='WeaponShelterCompact');
  const a=f.make(r.id);a.form='kid';a.intent.fire=true;f.tick(a,65);
  const c=a.weaponRunner.catalogState.canopy;
  assert.ok(c.open);assert.equal(c.launched,false);assert.equal(c.hp,200);
  const p=f.G.projectiles._new();p.team=1;p.damage=30;p.owner={remote:false};p.prev.copy(c.pos).add(new f.THREE.Vector3(0,0,3));p.pos.copy(c.pos).sub(new f.THREE.Vector3(0,0,3));
  const guard=f.G.projectiles.kitDefenseCandidate(p);assert.ok(guard);guard.onHit(p);assert.equal(c.hp,170);
});

test('catalog ghost metadata restores flight without damage or paint authority',async()=>{
  const f=await setup(),r=f.MAIN_WEAPON_CATALOG.records.find(r=>r.sourceActor==='WeaponShooterLong');
  const a=f.make(r.id);a.form='kid';a.intent.fire=true;f.tick(a);
  const p=f.G.projectiles.list[0];a.nid=1;
  let e;f.NetMatch.prototype.recProj.call({_rec:row=>{e=[0,...row,0,1];return e;},cfg:{id:'catalog-test'}},p);
  assert.ok(e,'native recorder produced a packet');
  const remote=f.make(r.id);remote.remote=true;f.G.projectiles.ghostProjectile(remote,e);
  const g=f.G.projectiles.list.at(-1);assert.ok(g.ghost&&g.catalog);
  let hits=0,paint=0;f.G.projectiles.applyHit=()=>hits++;f.G.paint.splat=()=>{paint++;return 1;};
  const enemy=f.make('shooter');enemy.team=1;enemy.pos.copy(g.pos).addScaledVector(g.vel.clone().normalize(),2);
  for(let i=0;i<60;i++)if(f.G.projectiles._step(g,1/60))break;
  assert.equal(hits,0);assert.equal(paint,0);assert.equal(g.damage,0);
});

test('S-BLAST airborne mode uses separate source speed, burst radius and ghost descriptor',async()=>{
  const f=await setup(),r=f.MAIN_WEAPON_CATALOG.records.find(r=>r.sourceActor==='WeaponBlasterPrecision');
  const a=f.make(r.id);a.form='kid';a.grounded=false;
  a.weaponRunner.update(1/60,{fire:true,firePressed:true,sub:false});
  for(let i=0;i<12;i++)a.weaponRunner.update(1/60,{fire:true,firePressed:false,sub:false});
  const p=f.G.projectiles.list[0];assert.ok(p);
  assert.equal(p.catalog.descriptor.key,'blaster-jump');
  assert.equal(p.catalog.descriptor.speed,r.parameters.MoveJumpParam.SpawnSpeed*60);
  assert.deepEqual(p.catalog.descriptor.b.BlastParam,r.parameters.BlastJumpParam);
  assert.equal(p.catalog.descriptor.b.BlasterBurstParam.SplashDropPaintRadius,3.7);
});

test('Wiki full-charge magazines include the initial round and Ballpoint uses timed mode cadence',async()=>{
  const f=await setup();
  for(const [actor,frames,count] of [['WeaponSpinnerQuick',27,22],['WeaponSpinnerHyper',150,66],
    ['WeaponSpinnerSerein',76,31],['WeaponSpinnerHyperShort',120,61],['WeaponSpinnerDownpour',100,45]]){
    f.G.projectiles.clear();const r=f.MAIN_WEAPON_CATALOG.records.find(r=>r.sourceActor===actor);
    const a=f.make(r.id);a.form='kid';a.intent.fire=true;f.tick(a,frames);
    a.intent.fire=false;f.tick(a,300);
    assert.equal(f.G.projectiles.list.filter(p=>p.wid===r.id).length,count,r.names.ja);
  }
});

test('Ballpoint includes two transition shots at 30F/35F and reaches long mode at 40F',async()=>{
  const f=await setup(),a=f.make('s3-spinner-downpour');a.form='kid';a.intent.fire=true;f.tick(a,100);
  a.intent.fire=false;f.tick(a,45);
  const shots=f.G.projectiles.list;
  assert.equal(shots[9].damage,28);assert.equal(shots[10].damage,28);
  assert.ok(Math.abs(shots[11].damage-29)<1e-8);assert.ok(Math.abs(shots[12].damage-30)<1e-8);
  assert.ok(shots[11].catalog.descriptor.speed>shots[10].catalog.descriptor.speed);
  assert.ok(shots[11].catalog.descriptor.speed<shots[12].catalog.descriptor.speed);
});

test('Blaster repeat cadence includes its windup rather than adding it again',async()=>{
  const f=await setup(),r=f.MAIN_WEAPON_CATALOG.records.find(r=>r.sourceActor==='WeaponBlasterLight');
  const a=f.make(r.id);a.form='kid';a.intent.fire=true;
  const births=[];const push=f.G.projectiles._push;f.G.projectiles._push=function(p){births.push(f.G.time);return push.call(this,p);};
  f.tick(a,110);assert.ok(births.length>=3);
  assert.ok(Math.abs((births[1]-births[0])*60-r.parameters.WeaponParam.RepeatFrame)<1e-7);
});

test('Hydra first-circle ink follows 33 prepaid rounds and its own main-saver curve',async()=>{
  const f=await setup(),r=f.MAIN_WEAPON_CATALOG.records.find(r=>r.sourceActor==='WeaponSpinnerHyper');
  for(const geared of [false,true]){
    const a=f.make(r.id);a.form='kid';
    if(geared){a.s3.loadout=Array.from({length:3},()=>({main:'inkSaverMain',subs:Array(3).fill('inkSaverMain')}));a.s3RefreshGear();}
    a.intent.fire=true;f.tick(a,120);assert.ok(Math.abs(a.ink-(geared?91.25:82.5))<1e-6);
  }
});

test('Nautilus recharge and squid keep retain prepaid remaining gauge',async()=>{
  const f=await setup(),r=f.MAIN_WEAPON_CATALOG.records.find(r=>r.sourceActor==='WeaponSpinnerSerein');
  const a=f.make(r.id);a.form='kid';a.intent.fire=true;f.tick(a,76);a.intent.fire=false;f.tick(a,20);
  const before=a.ink;a.intent.fire=true;f.tick(a);
  assert.ok(a.weaponRunner.catalogState.chargeF>40,'remaining gauge survives recharge');
  assert.ok(before-a.ink<1,'only the newly added gauge is paid');
  a.form='squid';a.intent.fire=false;a.weaponRunner.update(1/60,{fire:false,firePressed:false});
  assert.ok(a.weaponRunner.catalogState.stored.frames>40);
});

test('nearest foot paint follows Jr. accepted-shot slots 3 and 7',async()=>{
  const f=await setup(),a=f.make('s3-shooter-first');a.form='kid';
  const splats=[];f.G.paint.splat=(at,radius)=>{splats.push({at:at.clone(),radius});return 0;};
  f.G.physics.raycast=(at,down,d,h)=>{h.hit=true;h.point.copy(at).setY(0);return h;};
  a.intent.fire=true;f.tick(a,31);
  assert.equal(f.G.projectiles.list.length,7);assert.equal(splats.length,2);
  assert.ok(splats.every(p=>Math.abs(p.radius-2.0769)<1e-9));
  assert.ok(Math.abs(a.ink-(100-7*.43/1.1))<1e-6,'110-unit tank retains normalized gauge');
});

test('Jr. normalized tank refill lasts 198F submerged and sub cost shares its capacity',async()=>{
  const f=await setup(),a=f.make('s3-shooter-first');a.form='squid';a.submerged=true;a.ink=0;a.lastFire=10;
  assert.ok(Math.abs(a.s3.modifiers.inkSaverSub-1/1.1)<1e-9);
  for(let i=0;i<197;i++)f.updateResources(a,1/60);
  assert.ok(a.ink<100);f.updateResources(a,1/60);assert.ok(Math.abs(a.ink-100)<1e-6);
});

test('Undercover splat and assist repair the canopy, closed dry holding does not heal',async()=>{
  const f=await setup(),r=f.MAIN_WEAPON_CATALOG.records.find(r=>r.sourceActor==='WeaponShelterCompact');
  const a=f.make(r.id);a.form='kid';a.intent.fire=true;f.tick(a,35);const c=a.weaponRunner.catalogState.canopy;c.hp=50;
  a.intent.fire=false;f.tick(a,5);assert.equal(c.hp,50);
  f.emit('actor:assist',{actor:a});assert.equal(c.hp,200);
  c.hp=50;f.emit('splatted',{attacker:a,victim:{team:1,stats:{},s3:{},pos:a.pos.clone()}});assert.equal(c.hp,200);
});

test('rapid brush strokes retain the Wiki first interval and sustained 7/11/14F cadence',async()=>{
  const f=await setup();
  for(const [actor,period] of [['WeaponBrushMini',7],['WeaponBrushNormal',11],['WeaponBrushHeavy',14]]){
    const r=f.MAIN_WEAPON_CATALOG.records.find(r=>r.sourceActor===actor);
    const a=f.make(r.id);a.form='kid';
    const born=[],trigger=a.character.trigger;
    a.character.trigger=function(name){if(name==='shoot')born.push(frame);return trigger.call(this,name);};
    let frame=0;
    for(;frame<130;frame++)a.weaponRunner.update(1/60,{fire:true,firePressed:true,sub:false});
    assert.ok(born.length>=4,r.names.en);
    assert.equal(born[1]-born[0],period-1,r.names.en+' first interval');
    for(let i=2;i<born.length;i++)assert.equal(born[i]-born[i-1],period,r.names.en+' sustained interval');
  }
});


test('added horizontal Rollers preserve full sourced fan width and the same sampled-speed scatter',async()=>{
  const f=await setup();
  f.G.projectiles._aimFrom=(_actor,_muzzle,out)=>out.set(0,0,1);
  const records=f.MAIN_WEAPON_CATALOG.records.filter(r=>!r.legacy&&r.family==='roller');
  assert.equal(records.length,4);
  try {
    for(const record of records)for(const random of [0,.5,1]){
      f.G.projectiles.clear();f.G.actors.length=0;f.setRandom(()=>random);
      const actor=f.make(record.id);actor.form='kid';actor.intent.fire=true;
      f.tick(actor,130);actor.intent.fire=false;
      const units=record.parameters.WideSwingUnitGroupParam.Unit;
      let offset=0;
      for(const unit of units){
        const count=unit.BulletNum??1,wide=unit.SpawnWideDegree??0;
        const noise=(unit.SpawnSpeedRandom??0)>0?random*2-1:0;
        for(let index=0;index<count;index++){
          const shot=f.G.projectiles.list[offset+index];assert.ok(shot,record.names.en);
          const expected=(unit.BaseRotateYDegree??0)+wide*((count>1?index/(count-1)*2-1:0)+noise*(unit.SwerveRateBySpeed??0));
          const actual=Math.atan2(shot.vel.x,shot.vel.z)*180/Math.PI;
          assert.ok(Math.abs(actual-expected)<1e-7,`${record.names.en} RNG ${random}, glob ${offset+index}: ${actual} / ${expected}`);
        }
        offset+=count;
      }
    }
  } finally {f.restoreRandom();}
});

test('live catalogue projectile delivers its exact attack row at the actor armor boundary',async()=>{
  const f=await setup(),r=f.MAIN_WEAPON_CATALOG.records.find(r=>r.sourceActor==='WeaponChargerLong');
  const a=f.make(r.id);a.form='kid';a.intent.fire=true;f.tick(a,120);a.intent.fire=false;f.tick(a);
  const p=f.G.projectiles.list[0];assert.ok(p);assert.equal(p.catalog.descriptor.charge,1);
  const enemy=f.make('shooter');enemy.team=1;enemy.pos.copy(p.pos).addScaledVector(p.vel.clone().normalize(),2);enemy.pos.y=0;
  const causes=[];f.G.projectiles.applyHit=(owner,victim)=>{if(victim===enemy)causes.push(owner._s3AllSpecialDamageCause);};
  for(let i=0;i<20;i++)if(f.G.projectiles._step(p,1/60))break;
  assert.deepEqual(causes,['ChargerFull_Long']);assert.equal(a._s3AllSpecialDamageCause,undefined);
});
