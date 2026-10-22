import test from 'node:test';
import assert from 'node:assert/strict';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';
import {catalogFieldUnitCanDamage,catalogFlickSourceDamage,
  catalogFlickDamageTimeRate,catalogRollerDamageTable} from '../runtime/catalog-flick-damage.mjs';
const source=(name)=>{
  const r=MAIN_WEAPON_CATALOG.records.find(x=>x.names?.en===name);
  assert.ok(r,name+' source record');return r;
};
const near=(x,y,label)=>assert.ok(Math.abs(x-y)<1e-7,label+': '+x+' versus '+y);
const position=(x=0,y=0,z=0)=>({x,y,z});

test('Flingza side 12 paint-only droplets and Dynamo zero-rate side unit have no hit authority',()=>{
  const v=source('Flingza Roller').parameters.VerticalSwingUnitGroupParam.Unit;
  assert.equal(v[3].BulletNum,6);
  assert.equal(v[4].BulletNum,6);
  assert.equal(v[3].SpawnRotateYDegree,18);
  assert.equal(v[4].SpawnRotateYDegree,-18);
  for(const u of v){
    if(u.PaintOnly)assert.equal(catalogFieldUnitCanDamage(u),false,
      'paint-only field still exists but never damages players/props');
    else assert.equal(catalogFieldUnitCanDamage(u),true);
  }
  const d=source('Dynamo Roller').parameters.WideSwingUnitGroupParam.Unit;
  assert.equal(d[1].UnitDamageRate,0);
  assert.equal(catalogFieldUnitCanDamage(d[1]),false,
    'explicit source zero unit damage rate is not a full-strength direct hit');
  assert.equal(catalogFieldUnitCanDamage(d[0]),true);
});

test('four Roller horizontal inside/outside damage profiles follow hit sector from individual launch origin',()=>{
  for(const name of ['Carbon Roller','Dynamo Roller','Flingza Roller','Big Swig Roller']){
    const group=source(name).parameters.WideSwingUnitGroupParam,unit=group.Unit[0],damage=group.DamageParam;
    const nearCentre=position(0,0,2);
    const sideways=position(2,0,0);
    assert.equal(catalogRollerDamageTable(damage,'horizontal',nearCentre,position(),0),damage.Inside);
    assert.equal(catalogRollerDamageTable(damage,'horizontal',sideways,position(),0),damage.Outside,
      name+' lateral hit must select Outside');
    // The same world-space point becomes a central contact if the source
    // projectile was emitted facing 90 degrees (not if one reads just fan yaw).
    assert.equal(catalogRollerDamageTable(damage,'horizontal',sideways,position(),Math.PI/2),damage.Inside);
    assert.equal(catalogRollerDamageTable(damage,'vertical',sideways,position(),0),damage.Inside);
    const inner=catalogFlickSourceDamage(damage,unit,'horizontal',0,nearCentre,position(),0);
    const outer=catalogFlickSourceDamage(damage,unit,'horizontal',0,sideways,position(),0);
    assert.ok(inner>0&&outer>0,name+' source damage is finite and nonzero');
    if(name==='Dynamo Roller')assert.ok(inner>outer,'180 inner vs lower outside curve');
  }
});

test('seven added Roller/Brush sources lose late-flight damage only in their own reject window',()=>{
  for(const name of ['Carbon Roller','Dynamo Roller','Flingza Roller','Big Swig Roller',
    'Inkbrush','Octobrush','Painbrush']){
    const r=source(name),group=r.family==='roller'
      ?r.parameters.VerticalSwingUnitGroupParam:r.parameters.SwingUnitGroupParam;
    const damage=group.DamageParam;
    assert.equal(damage.DamageRejectRate,.5,name+' source 50% endpoint');
    const start=damage.DamageRejectStartFrame,end=damage.DamageRejectEndFrame;
    near(catalogFlickDamageTimeRate(damage,start-.01),1,name+' before reject');
    near(catalogFlickDamageTimeRate(damage,(start+end)/2),.75,name+' midpoint');
    near(catalogFlickDamageTimeRate(damage,end),.5,name+' reject completion');
    const bullet=group.Unit.find(u=>catalogFieldUnitCanDamage(u));assert.ok(bullet);
    const first=catalogFlickSourceDamage(damage,bullet,'vertical',start,position(0,0,1),position(),null);
    const last=catalogFlickSourceDamage(damage,bullet,'vertical',end,position(0,0,1),position(),null);
    near(last,first*.5,name+' damage unit obeys age multiplier');
  }
});
