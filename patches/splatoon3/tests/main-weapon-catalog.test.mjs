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
