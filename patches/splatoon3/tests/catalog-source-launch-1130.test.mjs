import test from 'node:test';
import assert from 'node:assert/strict';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';
import {fixture} from './source-fixture.mjs';
import {catalogRollerSourcePitch,catalogBrushSourceYaw,catalogUnitYawBase,
  catalogSlosherYawScatter,catalogSlosherHasSweptAim,catalogBrushNearestDue} from '../runtime/catalog-source-launch.mjs';
import {slosherNearestPaintSpec} from '../runtime/slosher-nearest-paint.mjs';
const source=name=>{
  const r=MAIN_WEAPON_CATALOG.records.find(x=>x.names?.en===name);
  assert.ok(r,name+' 11.3.0 record');return r;
};
const near=(a,b,msg)=>assert.ok(Math.abs(a-b)<1e-8,msg+': '+a+' versus '+b);
const DEG=Math.PI/180;

test('four added Rollers retain per-pellet up/down pitch offsets and Flingza side +/-18 yaw',()=>{
  for(const name of ['Carbon Roller','Dynamo Roller','Flingza Roller','Big Swig Roller']){
    const unit=source(name).parameters.VerticalSwingUnitGroupParam.Unit;
    assert.ok(unit.length>=3);
    near(catalogRollerSourcePitch(unit[0],0,true),unit[0].SpawnRotateXDegreeBase||0,name+' first pitch');
    const withStep=unit.find(u=>u.BulletNum>=2&&u.AfterOffsetSpawnRotateXDegree!=null);
    assert.ok(withStep,name+' contains sourced offset step');
    near(catalogRollerSourcePitch(withStep,1,true),
      (withStep.SpawnRotateXDegreeBase||0)+withStep.AfterOffsetSpawnRotateXDegree,
      name+' subsequent pitch does not collapse to first pellet');
  }
  const v=source('Flingza Roller').parameters.VerticalSwingUnitGroupParam.Unit;
  assert.equal(v[3].PaintOnly,true);assert.equal(v[4].PaintOnly,true);
  near(catalogUnitYawBase(v[3],'vertical',0,false),18,'paint-only right fan source');
  near(catalogUnitYawBase(v[4],'vertical',0,false),-18,'paint-only left fan source');
});

test('Pablo/Octobrush/Painbrush left and right strokes use separate pinned source yaw',()=>{
  for(const name of ['Inkbrush','Octobrush','Painbrush']){
    const units=source(name).parameters.SwingUnitGroupParam.Unit;
    assert.ok(units.length>0,name);
    let different=0;
    for(const u of units){
      const left=catalogBrushSourceYaw(u,true),right=catalogBrushSourceYaw(u,false);
      near(left,u.SpawnRotateYDegreeLeftToRight??0,name+' L-R source');
      near(right,u.SpawnRotateYDegreeRightToLeft??0,name+' R-L source');
      if(left!==right)different++;
    }
    assert.ok(different>0,name+' alternate attack directions must differ');
  }
});

test('Tri-Slosher/Dread Wringer use bias, exemption and pitch-sweep source without inventing random draws',()=>{
  for(const [name,amplitude,bias,maximum] of [
    ['Tri-Slosher',3,.5,1.5],['Dread Wringer',4.5,.65,4.5]]){
    const r=source(name),u=r.parameters.UnitGroupParam.Unit[0],param=r.parameters.WeaponParam;
    near(u.RandomRotateYDegree,amplitude,name+' spread');
    near(u.RandomRotateYBias,bias,name+' bias');
    near(param.FrameOffsetMaxDegree,maximum,name+' maximum sweep');
    assert.ok(catalogSlosherHasSweptAim(param,r.sourceActor),name+' source-backed moving-aim fan');
    let draws=0;const random=()=>{draws++;return .75;};
    assert.equal(catalogSlosherYawScatter(u,0,random),0,'source exempt first unit');
    assert.equal(draws,0,'exempt pellet must not consume RNG');
    near(catalogSlosherYawScatter(u,1,random),amplitude*Math.pow(.5,1+bias),
      name+' native Slosher bias-equivalent scatter');
    assert.equal(draws,1);
  }
});

test('source paint-only nearest for all five added Sloshers including sparse Machine',()=>{
  for(const [name,width,depth] of [
    ['Tri-Slosher',1.296,2],['Sloshing Machine',1,2],
    ['Bloblobber',2.2,1.2],['Explosher',1.56,1.4],['Dread Wringer',2,1.2]]){
    const result=slosherNearestPaintSpec(source(name).parameters);
    near(result.width,width,name+' true near-ground paint radius');
    near(result.depthScale,depth,name+' true near-ground paint elongation');
  }
});

test('Brush source-specific 6/4 flick nearest slot and cycle reset',()=>{
  for(const [name,loop,order] of [
    ['Inkbrush',6,2],['Octobrush',6,2],['Painbrush',4,2]]){
    const g=source(name).parameters.SwingUnitGroupParam;
    assert.equal(g.SplashNearestParam.LoopNum,loop);
    assert.equal(g.SplashNearestParam.OrderNum,order);
    for(let serial=1;serial<=loop*2;serial++)
      assert.equal(catalogBrushNearestDue(g,serial),(serial-1)%loop===order-1,
        name+' source nearest cycle '+serial);
  }
});

test('real catalog Roller and Brush shots follow down-45 camera pitch despite horizontal aimPoint',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  f.G.physics.segment=(_from,_to,h)=>{h.hit=false;return h;};
  f.G.physics.raycast=(_from,_dir,_dist,h)=>{h.hit=false;return h;};
  for(const [name,vertical] of [['Carbon Roller',true],['Dynamo Roller',true],
    ['Flingza Roller',true],['Big Swig Roller',true],['Inkbrush',false],['Painbrush',false]]){
    const r=source(name),a=f.make(r.id);
    f.G.projectiles.clear();f.G.actors.length=0;
    a.form='kid';a.ink=100;a.grounded=!vertical;a.s3JumpAirborne=vertical;
    a.aimPitch=-Math.PI/4;a.aimYaw=0;
    a.aimDir.set(0,-Math.SQRT1_2,Math.SQRT1_2);
    a.aimPoint.set(0,1.05,80); // deliberately not aligned with the camera
    a.weaponRunner.update(1/60,{fire:true,firePressed:true});
    for(let tick=0;tick<75;tick++)
      a.weaponRunner.update(1/60,{fire:false,firePressed:false,sub:false});
    const rounds=f.G.projectiles.list.filter(p=>p.catalog?.r===r);
    assert.ok(rounds.length>0,name+' emitted source round');
    const p=rounds[0],actualPitch=Math.atan2(p.vel.y,Math.hypot(p.vel.x,p.vel.z));
    const unit=r.parameters[vertical?'VerticalSwingUnitGroupParam':'SwingUnitGroupParam'].Unit[0];
    const basePitch=vertical?catalogRollerSourcePitch(unit,0,true):0;
    near(actualPitch,-Math.PI/4+basePitch*DEG,name+' real camera-pitch launch');
    assert.ok(actualPitch<-.35,name+' must not be flattened onto horizontal reticle');
  }
});
