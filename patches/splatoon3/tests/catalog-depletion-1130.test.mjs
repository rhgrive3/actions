import test from 'node:test';
import assert from 'node:assert/strict';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';
import {catalogDepletionPayment,catalogDepletedUnitCount,
  catalogDepletedUnitSpeed,catalogDepletedDescriptor} from '../runtime/catalog-depletion.mjs';
import {catalogFlickSourceDamage} from '../runtime/catalog-flick-damage.mjs';
import {fixture} from './source-fixture.mjs';
const record=name=>{
  const r=MAIN_WEAPON_CATALOG.records.find(x=>x.names?.en===name);
  assert.ok(r,name+' 11.3.0 source row');return r;
};
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-8,label+': '+a+' vs '+b);

test('source payment: full, partially funded depleted and truly empty attacks',()=>{
  assert.deepEqual(catalogDepletionPayment(100,8),{depleted:false,cost:8});
  assert.deepEqual(catalogDepletionPayment(1,8,.5),{depleted:true,cost:1});
  assert.deepEqual(catalogDepletionPayment(3,8,.5),{depleted:true,cost:3});
  assert.equal(catalogDepletionPayment(0,8),null);
  assert.equal(catalogDepletionPayment(-1,8),null);
});
test('all 7 additional Roller/Brush source reductions affect projectile count, speed and hit radius',()=>{
  for(const name of ['Carbon Roller','Dynamo Roller','Flingza Roller','Big Swig Roller',
    'Inkbrush','Octobrush','Painbrush']){
    const r=record(name),brush=r.family==='brush';
    const group=brush?r.parameters.SwingUnitGroupParam:r.parameters.WideSwingUnitGroupParam;
    assert.ok(group.Unit.some(u=>u.DepletionBulletNum!==undefined),name+' source reduced pellet count');
    let full=0,low=0;
    for(const u of group.Unit){
      const n=catalogDepletedUnitCount(u),d=catalogDepletedUnitCount(u,true);
      full+=n;low+=d;assert.ok(d<=n,name+' never adds depleted pellets');
      if(n>0&&u.DepletionSpeedRate!=null)
        near(catalogDepletedUnitSpeed(u,0,true)/catalogDepletedUnitSpeed(u,0),u.DepletionSpeedRate,
          name+' source reduced speed');
      const base={key:brush?'brush':'horizontal',unit:0,index:0,
        b:{PaintParam:u.UnitParam?.PaintParam},c:u.UnitParam?.CollisionParam,radius:1};
      const desc=catalogDepletedDescriptor(base,u,true);
      const col=u.UnitParam?.CollisionParam,rate=col?.DepletionRate??1;
      if(Number.isFinite(col?.EndRadiusForPlayer))
        near(desc.c.EndRadiusForPlayer,col.EndRadiusForPlayer*rate,name+' reduced player collider');
      if(Number.isFinite(col?.EndRadiusForField))
        near(desc.c.EndRadiusForField,col.EndRadiusForField*rate,name+' reduced terrain collider');
      const width=u.UnitParam?.PaintParam?.WidthHalfNear;
      if(Number.isFinite(width))near(desc.b.PaintParam.WidthHalfNear,
        width*(u.UnitParam?.PaintParam?.DepletionDepthWidthRate??1),name+' reduced paint width');
      assert.equal(desc.depleted,true);
    }
    assert.ok(low<full,name+' exhausted attack has fewer globs');
  }
});
test('depleted source damage uses the selected inner/outer damage multiplier',()=>{
  const r=record('Dynamo Roller'),d=r.parameters.WideSwingUnitGroupParam.DamageParam,u=r.parameters.WideSwingUnitGroupParam.Unit[0];
  const start={x:0,y:0,z:0},inside={x:0,y:0,z:2},outside={x:2,y:0,z:0};
  const fullIn=catalogFlickSourceDamage(d,u,'horizontal',0,inside,start,0);
  const lowIn=catalogFlickSourceDamage(d,u,'horizontal',0,inside,start,0,true);
  near(lowIn,fullIn*(d.Inside.DepletionDamageRate??1),'Dynamo inner depletion');
  const fullOut=catalogFlickSourceDamage(d,u,'horizontal',0,outside,start,0);
  const lowOut=catalogFlickSourceDamage(d,u,'horizontal',0,outside,start,0,true);
  near(lowOut,fullOut*(d.Outside.DepletionDamageRate??1),'Dynamo outer depletion');
});
test('real catalog low-ink Roller/Brush shot retains reduced source unit identities and speed',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  const G=f.G;f.setRandom(()=>.5);
  G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  G.physics.raycast=(_a,_b,_d,h)=>{h.hit=false;return h;};
  function fire(name,vertical,ink){
    G.projectiles.clear();G.actors.length=0;
    const r=record(name),a=f.make(r.id);
    const vmRecord=a.weapon.catalogRecord;
    assert.equal(vmRecord.id,r.id,name+' native VM owns the selected source row');
    a.ink=ink;a.form='kid';a.grounded=!vertical;a.s3JumpAirborne=vertical;
    a.vel.set(0,0,0);a.aimYaw=0;a.aimPitch=0;a.aimDir.set(0,0,1);
    a.aimPoint.set(0,1.05,80);
    a.weaponRunner.update(1/60,{fire:true,firePressed:true,sub:false});
    for(let i=0;i<85;i++)a.weaponRunner.update(1/60,{fire:false,firePressed:false,sub:false});
    return {r,a,rounds:G.projectiles.list.filter(p=>p.catalog?.r===vmRecord)};
  }
  for(const [name,vertical] of [
    ['Carbon Roller',false],['Dynamo Roller',true],['Flingza Roller',true],
    ['Big Swig Roller',false],['Inkbrush',false],['Octobrush',false],['Painbrush',false]]){
    const normal=fire(name,vertical,100);
    const selected=normal.r.parameters[vertical?'VerticalSwingUnitGroupParam':
      normal.r.family==='brush'?'SwingUnitGroupParam':'WideSwingUnitGroupParam'].Unit;
    const expected=selected.reduce((n,u)=>n+catalogDepletedUnitCount(u,true),0);
    const before=normal.rounds.find(p=>p.catalog?.descriptor?.unit===0);
    const fullSpeed=before?.vel.length();
    const low=fire(name,vertical,1);
    assert.equal(low.rounds.length,expected,name+' low-ink reduced source count');
    assert.ok(low.rounds.every(p=>p.inkMeta.s3CatalogDepleted===true&&
      p.catalog.descriptor.depleted===true),name+' local and wire mark depleted attack');
    assert.ok(low.a.ink>=0&&low.a.ink<1,name+' never invents an ink payment');
    const after=low.rounds.find(p=>p.catalog?.descriptor?.unit===0);
    if(after&&before){
      const u=selected[0];
      near(after.vel.length()/fullSpeed,u.DepletionSpeedRate??1,name+' real reduced speed');
    }
    const zero=fire(name,vertical,0);
    assert.equal(zero.rounds.length,0,name+' no attack with truly empty ink');
  }
});
