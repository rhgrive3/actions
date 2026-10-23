import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

const DT=1/60;
test('Stringer tilt follows the actual Actor through body-owned special and Super Jump updates',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  for(const id of Object.keys(f.WEAPONS).filter(id=>f.WEAPONS[id].behaviorKind==='stringer')){
    const a=f.make(id);a.form='kid';a.kidT=10;
    a.weaponRunner.update(DT,{fire:false});
    const s=a.weaponRunner.catalogState,shot=a.weapon.catalogRecord.parameters.spl__WeaponStringerParam.ShotParam;
    // Keep real Actor dispatch and the installed Runner; isolate body motion so
    // only the catalogue clock is under test, not special/jump trajectories.
    for(const body of ['special','superjump']){
      s.bowTilt=0;a.grounded=false;
      if(body==='special'){a.specialActive={id:'trizooka'};a._updateSpecial=()=>{};}
      else {a.superJumpState={phase:'charge'};a._updateSuperJump=()=>{};}
      for(let i=1;i<=10;i++){
        f.tick(a);assert.equal(s.bowTilt,Math.min(90,i*shot.BowJumpTiltSpeedForward),id+' '+body+' airborne '+i);
      }
      a.grounded=true;f.tick(a);
      assert.equal(s.bowTilt,90+shot.BowJumpTiltSpeedReverse,id+' '+body+' landing');
      a.specialActive=null;a.superJumpState=null;
    }
    // The ordinary Actor -> Runner route must advance once, including after
    // an unarmed action. Rendering cadence is covered by FixedClock below.
    s.bowTilt=0;a.grounded=false;f.tick(a);assert.equal(s.bowTilt,shot.BowJumpTiltSpeedForward);
    assert.equal(f.G.projectiles.list.length,0);assert.equal(a.ink,100);
  }
});

test('Stringer unarmed tilt has one 60Hz owner at 30/60/120Hz and excludes remote/dead actors',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  for(const hz of [30,60,120]){
    const a=f.make('s3-stringer-normal');a.form='kid';a.grounded=false;
    a.weaponRunner.update(DT,{fire:false});a.weaponRunner.catalogState.bowTilt=0;
    a.specialActive={id:'trizooka'};a._updateSpecial=()=>{};
    const clock=new f.FixedClock();let ticks=0;
    for(let i=0;i<hz/10;i++)clock.advance(1/hz,dt=>{f.G.time+=dt;a.update(dt);ticks++;});
    assert.equal(ticks,6);assert.equal(a.weaponRunner.catalogState.bowTilt,54);
    a.remote=true;f.tick(a);assert.equal(a.weaponRunner.catalogState.bowTilt,54);
    a.remote=false;a.alive=false;f.tick(a);assert.equal(a.weaponRunner.catalogState.bowTilt,54);
  }
});

test('native Super Jump admission, flight and landing retain the Stringer fan clock at every render cadence',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  f.G.level=new f.Level({bounds:{minX:-50,maxX:50,minZ:-50,maxZ:50},spawnPads:[[-40,0,0],[40,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-50,-.5,-50],max:[50,0,50]}]});
  f.G.physics=new f.Physics(f.G.level);
  for(const id of ['s3-stringer-normal','s3-stringer-short','s3-stringer-explosion'])for(const hz of [30,60,120]){
    const a=f.make(id);a.form='kid';a.kidT=10;a.pos.set(0,0,0);
    a.superJump(new f.THREE.Vector3(0,0,10));assert.equal(a.superJumpState?.phase,'charge');
    const clock=new f.FixedClock(),shot=a.weapon.catalogRecord.parameters.spl__WeaponStringerParam.ShotParam;
    let expected=0,air=0,landed=false;
    for(let i=0;i<hz*8&&!landed;i++)clock.advance(1/hz,dt=>{
      if(landed)return;
      f.G.time+=dt;a.update(dt);
      expected=Math.max(0,Math.min(90,expected+(a.grounded?shot.BowJumpTiltSpeedReverse:shot.BowJumpTiltSpeedForward)));
      assert.equal(a.weaponRunner.catalogState.bowTilt,expected,id+' '+hz+'Hz');
      if(!a.grounded)air++;landed=!a.superJumpState;
    });
    assert.ok(air>10);assert.ok(landed,'bounded native flight lands');
    assert.equal(f.G.projectiles.list.length,0,'unarmed flight never emits an arrow');
  }
});
