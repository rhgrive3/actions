import test from 'node:test';
import assert from 'node:assert/strict';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { catalogVisualSpec, catalogVisualRadius, updateCatalogVisual,
  catalogReboundSeparation, catalogBubbleCanBounce, catalogBubbleRadiusScale } from '../runtime/projectile-presentation.mjs';
import { INK_LOOK, fidelityInkLook, fidelityInkTail } from '../runtime/weapons-fidelity.mjs';
import { fixture } from './source-fixture.mjs';

const record = name => {
  const r=MAIN_WEAPON_CATALOG.records.find(x=>x.sourceActor===name);
  assert.ok(r,'missing pinned 11.3.0 record '+name);
  return r;
};
const visualFor=(r,unit,unitOrder,index=0)=>catalogVisualSpec(r,{b:unit,unit:unitOrder,c:unit.CollisionParam||r.parameters.CollisionParam},index);

test('Tri-Slosher uses its three sourced visual sheets rather than 0.1 generic heads',()=>{
  const r=record('WeaponSlosherDiffusion'),units=r.parameters.UnitGroupParam.Unit;
  assert.equal(units.length,4);
  const center=visualFor(r,units[0],0,0),side=visualFor(r,units[2],2,0);
  assert.equal(center.style,'sheet');assert.equal(center.draw.InitRadius,1.4);
  assert.equal(catalogVisualRadius(center,0),1.4);
  assert.equal(catalogVisualRadius(side,0),1);
  assert.equal(catalogVisualRadius(visualFor(r,units[0],0,1),0),0,'sourced later fragments have zero draw radius');
  assert.equal(fidelityInkLook({type:'shot',catalogVisual:center}),INK_LOOK.slosh,'not a Shooter rod');
  const p={catalogVisual:center,age:5/60,vel:{length:()=>70}};
  updateCatalogVisual(p);
  assert.ok(p.tail0>1 && p.vis===1.4);
  assert.ok(fidelityInkTail({...p,type:'shot'},1,p.vis*INK_LOOK.slosh[4],INK_LOOK.slosh)>1);
});

test('Bloblobber bubbles grow over five frames and shrink 25% each rebound',()=>{
  const r=record('WeaponSlosherBathtub'),unit=r.parameters.UnitGroupParam.Unit[0];
  const v=visualFor(r,unit,0,0);
  assert.equal(v.style,'bubble');
  assert.equal(catalogVisualRadius(v,0),.16);
  assert.equal(catalogVisualRadius(v,5/60),.8);
  const p={type:'shot',age:5/60,vel:{length:()=>30},catalog:{bounces:1},catalogVisual:v};
  updateCatalogVisual(p);
  assert.ok(Math.abs(p.vis-.6)<1e-9);
  assert.equal(fidelityInkLook(p),INK_LOOK.bubble);
  assert.equal(fidelityInkTail(p,3,p.vis,INK_LOOK.bubble),1);
  assert.equal(catalogBubbleRadiusScale(2),.5625);
  assert.equal(catalogBubbleCanBounce(0,1),true);
  assert.equal(catalogBubbleCanBounce(1,1),true);
  assert.equal(catalogBubbleCanBounce(2,1),false,'third floor hit ends the bubble');
  assert.equal(catalogBubbleCanBounce(28,0),true,'no arbitrary wall rebound cap');
  assert.ok(catalogReboundSeparation(unit.CollisionParam.EndRadiusForField*.75)>.56);
});

test('long-range Shooter keeps a compact, non-collision-sized visual rod',()=>{
  for(const name of ['WeaponShooterLong','WeaponShooterExpert']){
    const r=record(name),v=catalogVisualSpec(r,{b:r.parameters,c:r.parameters.CollisionParam});
    assert.equal(v.style,'rod');
    assert.ok(v.baseRadius>=.045&&v.baseRadius<=.08);
    assert.ok(v.baseRadius<r.parameters.CollisionParam.EndRadiusForPlayer);
    assert.equal(fidelityInkLook({type:'shot',catalogVisual:v}),INK_LOOK.shot);
  }
});

test('all pinned Charger full-charge ranges are retained by the actual catalog flight',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    extraExports:"export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs'; export { MAIN_WEAPON_CATALOG } from './patches/splatoon3/runtime/main-weapon-catalog-data.mjs';"});
  f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  for(const name of ['WeaponChargerLong','WeaponChargerNormalScope','WeaponChargerQuick']){
    const r=record(name),raw=r.parameters.MoveParam;
    assert.ok(raw.DistanceFullCharge>raw.DistanceMinCharge);
    f.G.projectiles.clear();f.G.actors.length=0;
    const a=f.make(r.id);a.form='kid';a.ink=100;a.intent.fire=true;
    const fullFrames=Number.isFinite(r.parameters.WeaponParam.ChargeFrameFullCharge)
      ?r.parameters.WeaponParam.ChargeFrameFullCharge:60; // sparse scoped Charger inherits runtime's 60F model
    f.tick(a,fullFrames+1);
    a.intent.fire=false;
    let p=null;
    for(let i=0;i<65&&!p;i++){
      f.tick(a,1);
      p=f.G.projectiles.list.find(x=>x.wid===r.id);
    }
    assert.ok(p,name+' emitted a real charged round');
    assert.equal(p.catalog.range,raw.DistanceFullCharge,name+' exact full range');
    assert.equal(p.catalog.descriptor.range,raw.DistanceFullCharge,name+' descriptor');
    assert.ok(Math.abs(p.life*p.catalog.descriptor.speed-raw.DistanceFullCharge)<1e-6,name+' flight lifetime');
    // Trace the same main-owned fixed-tick flight in empty space, without
    // involving turf rasterization or the HUD's range indicator.
    const savedLevel=f.G.physics.level;
    f.G.physics.level=null;
    p.ghost=true; // motion only: prevent existing Charger floor-paint writes in empty-world test
    p.pos.set(0,20,0);p.prev.copy(p.pos);p.start.copy(p.pos);p.vel.set(0,0,p.catalog.descriptor.speed);
    p.age=0;p.catalog.travel=0;p.catalog.carry=0;
    let done=false;
    for(let i=0;i<100&&!done;i++)done=f.G.projectiles._step(p,1/60);
    assert.equal(done,true,name+' projectile terminates');
    assert.ok(Math.abs(p.catalog.travel-raw.DistanceFullCharge)<1e-6,name+' exact end-stop');
    assert.ok(Math.abs(p.pos.z-raw.DistanceFullCharge)<1e-6,name+' position stays at sourced limit');
    f.G.physics.level=savedLevel;
  }
});
