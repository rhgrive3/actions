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
    const vmRecord=a.weapon.catalogRecord;
    assert.equal(vmRecord.id,r.id,name+' native VM owns the selected source row');
    f.G.projectiles.clear();f.G.actors.length=0;
    a.form='kid';a.ink=100;a.grounded=!vertical;a.s3JumpAirborne=vertical;
    a.aimPitch=-Math.PI/4;a.aimYaw=0;
    a.aimDir.set(0,-Math.SQRT1_2,Math.SQRT1_2);
    a.aimPoint.set(0,1.05,80); // deliberately not aligned with the camera
    a.weaponRunner.update(1/60,{fire:true,firePressed:true});
    for(let tick=0;tick<75;tick++)
      a.weaponRunner.update(1/60,{fire:false,firePressed:false,sub:false});
    const rounds=f.G.projectiles.list.filter(p=>p.catalog?.r===vmRecord);
    assert.ok(rounds.length>0,name+' emitted source round');
    const p=rounds[0],actualPitch=Math.atan2(p.vel.y,Math.hypot(p.vel.x,p.vel.z));
    const unit=r.parameters[vertical?'VerticalSwingUnitGroupParam':'SwingUnitGroupParam'].Unit[0];
    const basePitch=vertical?catalogRollerSourcePitch(unit,0,true):0;
    const admittedPitch=-Math.PI/4+basePitch*DEG;
    // Brush's pinned -0.02 vertical speed term applies after aiming. Its
    // source tilt is retained; the test must not silently require zero lift.
    const sourceLift=unit.AddSpawnSpeedYRateByXZ??unit.AddSpawnSpeedYRateBySpeed??0;
    const expectedPitch=Math.atan2(Math.sin(admittedPitch)+sourceLift,Math.cos(admittedPitch));
    near(actualPitch,expectedPitch,name+' real camera-pitch launch with source vertical speed');
    assert.ok(actualPitch<-.35,name+' must not be flattened onto horizontal reticle');
  }
});

// #1812: retain Actor input admission and the production fixed clock. As in
// source-fixture, movement integration and Character pose are stubbed: these
// are launcher/OBB regression checks, not rendered-muzzle or Switch acceptance.
const rollerBrushModes=[
  ...['Carbon Roller','Dynamo Roller','Flingza Roller','Big Swig Roller']
    .flatMap(name=>['horizontal','vertical'].map(key=>({name,key}))),
  ...['Inkbrush','Octobrush','Painbrush'].map(name=>({name,key:'brush'}))
];
function sourceGroup(r,key){
  return r.parameters[key==='vertical'?'VerticalSwingUnitGroupParam':
    key==='horizontal'?'WideSwingUnitGroupParam':'SwingUnitGroupParam'];
}
function admittedFlickTrace(f,{name,key,pitch,reticle='stale',hz=60,wall=false}){
  const {G,THREE}=f,r=source(name),system=G.projectiles;
  system.clear();G.actors.length=0;G.time=0;
  G.level={blocks:[],faces:[],groundHeight:()=>0,
    queryBlocks(_a,_b,_c,_d,out){out.length=0;this.blocks.forEach((_v,i)=>out.push(i));return out;}};
  if(wall)G.level.blocks.push({id:0,solid:true,grate:false,
    center:new THREE.Vector3(0,1,.25),half:new THREE.Vector3(5,5,.01),
    axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],
    faces:[-1,-1,-1,-1,-1,-1]});
  G.physics=new f.Physics(G.level);
  const a=f.make(r.id),clock=new f.FixedClock();
  a.form='kid';a.kidT=1;a.ink=100;a.grounded=key!=='vertical';
  if(key==='vertical')a.character.trigger('jump'); // accepted jump owner selects vertical
  a.ground.hit=a.grounded;a.aimYaw=wall?0:.37;a.yaw=a.aimYaw;a.aimPitch=pitch*DEG;
  const aim=new THREE.Vector3(Math.sin(a.aimYaw)*Math.cos(a.aimPitch),Math.sin(a.aimPitch),
    Math.cos(a.aimYaw)*Math.cos(a.aimPitch));
  a.aimPoint.set(0,reticle==='stale'?1.05:-.4,reticle==='stale'?80:4);
  f.setRandom(()=>.5); // midpoint source speed; no speed-swerve or cube jitter
  const rows=[];let ticks=0,presses=0,observed=0;
  try{
    for(let frame=0;frame<hz*2;frame++)clock.advance(1/hz,step=>{
      const fire=presses===0||(key==='brush'&&presses===1&&observed>0&&a.weaponRunner.cooldown<=1e-9);
      if(fire)presses++;
      a.intent.fire=fire;G.time+=step;a.update(step);ticks++;
      const born=system.list.slice(observed);observed=system.list.length;
      for(const p of born){
        assert.equal(p.owner,a,'real Actor/WeaponRunner owns emitted projectile');
        assert.equal(p.catalog.descriptor.key,key,'admitted ground/jump attack mode');
        assert.equal(p.delay,0,'this matrix measures true birth, not delayed launch plans');
        rows.push({tick:ticks,swing:presses,unit:p.catalog.descriptor.unit,index:p.catalog.index,
          start:Array.from(p.start.toArray()),velocity:Array.from(p.vel.toArray()),
          packet:Array.from(p.inkMeta.s3Catalog)});
      }
    });
    assert.equal(ticks,120,'30/60/120 render schedules each execute 120 fixed ticks');
    assert.equal(presses,key==='brush'?2:1,'both Brush swing hands use real repress admission');
    const count=sourceGroup(r,key).Unit.reduce((n,u)=>n+(u.BulletNum??1),0);
    assert.equal(rows.length,count*presses,name+' complete sourced volleys');
    return {rows,aim};
  }finally{a.weaponRunner.reset();system.clear();G.actors.length=0;f.restoreRandom();}
}
function assertSourceFlickVelocity(r,key,pitch,rows,yaw){
  for(const row of rows){
    const u=sourceGroup(r,key).Unit[row.unit],count=u.BulletNum??1;
    const fan=count===1?0:(row.index/(count-1)-.5)*(u.SpawnWideDegree??0)*(key==='horizontal'?2:1);
    const hand=key==='brush'?(row.swing===1?u.SpawnRotateYDegreeLeftToRight:u.SpawnRotateYDegreeRightToLeft)??0:0;
    const heading=yaw+((u.BaseRotateYDegree??0)+(key==='vertical'?(u.SpawnRotateYDegree??0):0)+fan+hand)*DEG;
    const elevation=(pitch+(u.SpawnRotateXDegree??u.SpawnRotateXDegreeBase??0)+
      (key==='vertical'?(u.AfterOffsetSpawnRotateXDegree??0)*row.index:0))*DEG;
    const speed=((u.SpawnSpeedBase??1)+(u.AfterOffsetSpawnSpeed??0)*row.index)*60;
    const lift=u.AddSpawnSpeedYRateByXZ??u.AddSpawnSpeedYRateBySpeed??0;
    const expected=[Math.sin(heading)*Math.cos(elevation)*speed,
      (Math.sin(elevation)+lift)*speed,Math.cos(heading)*Math.cos(elevation)*speed];
    expected.forEach((v,i)=>near(row.velocity[i],v,
      `${r.names.en} ${key} ${pitch}deg swing${row.swing} unit${row.unit}/${row.index} camera velocity[${i}]`));
    assert.deepEqual(row.packet,[1,key,row.unit,0,row.index],'network tuple retains exact source identity');
  }
}

test('#1812 all seven added Roller/Brush Actors preserve source pitch/yaw and both Brush hands at 30/60/120 render Hz',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  let conditions=0;
  for(const mode of rollerBrushModes)for(const pitch of [-70,-45,0,40,70]){
    let baseline=null;
    for(const reticle of ['stale','close-ground'])for(const hz of [30,60,120]){
      const {rows}=admittedFlickTrace(f,{...mode,pitch,reticle,hz});
      assertSourceFlickVelocity(source(mode.name),mode.key,pitch,rows,.37);
      if(baseline)assert.deepEqual(rows,baseline,mode.name+' reticle/render cadence cannot change admitted births');
      else baseline=rows;
      conditions++;
    }
  }
  assert.equal(conditions,330,'11 admitted attack modes, five pitches, two reticles, three render schedules');
});

test('#1812 real near-wall OBB clamps every Roller/Brush birth without flattening camera velocity',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  for(const mode of rollerBrushModes)for(const pitch of [-45,40]){
    const {rows}=admittedFlickTrace(f,{...mode,pitch,wall:true});
    assertSourceFlickVelocity(source(mode.name),mode.key,pitch,rows,0);
    for(const row of rows){
      assert.ok(row.start.every(Number.isFinite),'cover fallback stays finite');
      // constrainMuzzle's margin is along the oblique anchor ray, so its Z
      // projection is smaller than 0.02 for side/height-offset source units.
      assert.ok(row.start[2]<.24-1e-9,mode.name+' remains outside the actor-facing OBB surface: '+row.start);
    }
  }
});

test('#1812 Actor matrix detects the original Roller/Brush reticle-convergence regression',async()=>{
  const anchor="if((key==='slosh'||key==='horizontal'||key==='vertical'||key==='brush')&&";
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    adaptRuntime:(rel,code)=>{
      if(rel!=='patches/splatoon3/runtime/main-weapon-catalog.mjs')return code;
      assert.equal(code.split(anchor).length,2,'one production camera-direction guard');
      return code.replace(anchor,"if(key==='slosh'&&");
    }});
  for(const mode of [{name:'Carbon Roller',key:'horizontal'},{name:'Octobrush',key:'brush'}]){
    const {rows}=admittedFlickTrace(f,{...mode,pitch:-45});
    assert.throws(()=>assertSourceFlickVelocity(source(mode.name),mode.key,-45,rows,.37),
      /camera velocity/,'unmodified matrix must reject the previous convergence owner');
  }
});
