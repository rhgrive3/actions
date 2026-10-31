import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

const near=(actual,expected,label,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${label}: ${actual} vs ${expected}`);

test('reviewed sub guides and support flight agree with actual composed releases',async t=>{
  const f=await fixture({fullRuntime:true,realProjectiles:true,productionComposition:true,includeCharacter:true});
  const {G,THREE}=f,p=G.projectiles,a=f.make('support');
  G.camera=new THREE.PerspectiveCamera();G.scene=new THREE.Scene();
  G.match={state:'playing',playing:()=>true,canRespawn:()=>false,updateController(){},update(){}};
  const game={match:G.match,input:{padPressed:new Set(),pollPad(){},endFrame(){}},_padMenus(){},rig:{},s3Clock:new f.FixedClock()};
  let contacts=[],capture=false,tracked=null,wallZ=Infinity;
  const rayEnd=new THREE.Vector3();
  function segment(from,to,hit){
    let fraction=Infinity,wall=false;
    if(from.y>=0&&to.y<=0&&from.y!==to.y)fraction=from.y/(from.y-to.y);
    if(from.z<=wallZ&&to.z>=wallZ&&from.z!==to.z){const w=(wallZ-from.z)/(to.z-from.z);if(w<fraction){fraction=w;wall=true;}}
    hit.hit=Number.isFinite(fraction);
    if(hit.hit){hit.point.lerpVectors(from,to,fraction);hit.normal.set(0,wall?0:1,wall?-1:0);hit.dist=from.distanceTo(hit.point);hit.block=hit.face=0;hit.u=hit.v=0;
      // Observe the thrown body's sweep, not its earlier falling paint drops
      // or a ground-support ray that can also touch the same floor.
      if(capture&&to===tracked?.pos)contacts.push({point:hit.point.clone(),normal:hit.normal.clone()});
    }
    return hit;
  }
  G.physics={los:()=>true,segment,raycast(from,dir,range,hit){rayEnd.copy(from).addScaledVector(dir,range);return segment(from,rayEnd,hit);}};
  function reset(id,{ap=0,pitch=-.15,velocity=[0,0,0],wall=Infinity}={}){
    capture=false;tracked=null;p.clear();game.s3Clock.reset();G.time=0;G.actors=[a];wallZ=wall;contacts=[];
    a.weapon={...f.WEAPONS.support,sub:id};a.weaponRunner.reset();
    a.pos.set(0,0,0);a.vel.set(...velocity);a.aimYaw=0;a.aimPitch=pitch;a.aimDir.set(0,Math.sin(pitch),Math.cos(pitch));
    a.form='kid';a.grounded=true;a.alive=true;a.remote=false;a.isLocal=true;a.ink=100;
    a.specialActive=null;a.superJumpState=null;
    a.s3.abilityPoints={...a.s3.abilityPoints,subPower:ap};
    a.s3.modifiers={...a.s3.modifiers,subPower:ap===57?1.5:1,inkSaverSub:1};
    a.intent.fire=a.intent.sub=a.intent.squid=a.intent.jump=a.intent.special=false;
    p.updateArc(a,false);
  }
  // Exercise the installed production caller. Projectiles.update accepts a
  // simulation interval; passing a render interval directly bypasses its clock.
  const advance=hz=>f.runSimulation(game,1/hz);

  const records=()=>[...p.bombs,...p._s3SubObjects,...p._s3SupportSensors];
  const markerPoint=prediction=>prediction.endpoint.clone().addScaledVector(
    prediction.normal?.lengthSq()>1e-12?prediction.normal.clone().normalize():new THREE.Vector3(0,1,0),.015);

  await t.test('all 14 subs: first contact and final outcome agree with actual releases at 30/60/120 Hz',()=>{
    const thrown=['bomb','suction','curling','burst','autobomb','fizzy','torpedo','toxicMist','angleShooter','splashWall','sprinkler','pointSensor'];
    const conditions=[{}, {ap:57,pitch:.4,velocity:[3,1,4],wall:20}, {pitch:-.6,velocity:[-2,0,5],wall:8}];
    for(const hz of [30,60,120])for(const condition of conditions)for(const id of thrown){
      reset(id,condition);
      // A direct release uses its current admitted charge; the public held UI
      // additionally anticipates input startup. Verify each public contract.
      const prediction=p.s3PredictSubTrajectory(a,{maxTime:12});p.updateArc(a,true);
      const shown=p._s3ThrowPrediction;
      assert.equal(p.arcLine.visible,true,id);assert.equal(shown.kind,id);
      assert.ok(['explosion','deploy','contact','airburst','range-end','no-contact'].includes(shown.outcome),id+' known outcome '+shown.outcome);
      if(shown.outcome==='range-end'||!shown.complete)assert.equal(p.arcRing.visible,false,id+' unresolved endpoint has no explosion marker');
      else {assert.equal(p.arcRing.visible,true,id);near(p.arcRing.position.distanceTo(markerPoint(shown)),0,id+' final endpoint marker');}
      const before=new Set(records()),returned=p.throwBomb(a),object=returned||records().find(o=>!before.has(o));
      assert.ok(object,id+' actual release');tracked=object;capture=true;
      for(let i=0;i<hz*3&&!contacts.length;i++)advance(hz);
      capture=false;assert.ok(contacts.length,`${id} must actually contact ${hz}Hz ${JSON.stringify(condition)}`);
      assert.ok(prediction.firstImpact,id+' retains its first-contact receipt');
      near(prediction.firstImpact.point.distanceTo(contacts[0].point),0,`${id} first contact ${hz}Hz ${JSON.stringify(condition)}`);
      for(let i=0;i<hz*12&&G.time+1e-9<prediction.time;i++)advance(hz);
      near(object.pos.distanceTo(prediction.endpoint),0,`${id} final outcome ${hz}Hz ${JSON.stringify(condition)}`);
    }
    for(const id of ['inkMine','beakon']){
      reset(id);p.updateArc(a,true);assert.equal(p.arcLine.visible,false,id);assert.equal(p.arcRing.visible,true,id+' exact placement');
      near(p.arcRing.position.distanceTo(markerPoint(p._s3ThrowPrediction)),0,id+' placement marker');
      const object=p.throwBomb(a);assert.equal(object.phase,'deployed');near(object.pos.distanceTo(a.pos),0,id+' placed at feet');
    }
  });

  await t.test('weapon switches replace cached thrown guides with the selected placement or rolling prediction',()=>{
    for(const id of ['inkMine','beakon','curling']){
      reset('sprinkler');p.updateArc(a,true);assert.equal(p.arcLine.visible,true);
      a.weapon={...a.weapon,sub:id};a.weaponRunner.reset();
      for(let i=0;i<24;i++){
        G.time+=1/120;p.updateArc(a,true);assert.equal(p._s3ThrowPrediction.kind,id);
        assert.equal(p.arcLine.visible,id==='curling',id);assert.equal(p.arcRing.visible,true,id);
        near(p.arcRing.position.distanceTo(markerPoint(p._s3ThrowPrediction)),0,id+' current endpoint');
      }
      a.weapon={...a.weapon,sub:'sprinkler'};a.weaponRunner.reset();p.updateArc(a,true);assert.equal(p.arcLine.visible,true);
    }
  });

  await t.test('Sensor and Cooler retain their previous 60 Hz flight and exact contact clocks at every render rate',()=>{
    for(const hz of [30,60,120]){
      reset('pointSensor',{pitch:0});p.updateArc(a,true);const sensor=p.throwBomb(a);
      for(let i=0;i<hz*3&&sensor.activeAt===null;i++)advance(hz);
      near(sensor.pos.z,105.30073170731691,'Sensor preserves 60Hz range '+hz);
      near(sensor.activeAt,77/60,'Sensor contact clock '+hz);
      near(sensor.expires-sensor.activeAt,2.5,'Sensor area lifetime');
      near(sensor.pos.distanceTo(p._s3ThrowPrediction.endpoint),0,'Sensor predicted contact '+hz);
      near(p.arcRing.position.distanceTo(markerPoint(p._s3ThrowPrediction)),0,'Sensor marker offset '+hz);
      reset('pointSensor',{pitch:0});
      a.specialActive={id:'tacticooler',t:13/60,phase:'throw'};a._updateSpecial(1/60);
      for(let i=0;i<hz*2&&!p._s3SupportCoolers.length;i++)advance(hz);
      const stand=p._s3SupportCoolers[0];assert.ok(stand);
      near(stand.pos.z,9.689954520692705,'Cooler preserves 60Hz range '+hz);
      near(stand.expires-15,25/60,'Cooler deployment clock '+hz);
      near(a.s3TacticoolerGauge.until-10,25/60,'Cooler gauge starts at actual deployment '+hz);
    }
    reset('pointSensor');let sensor=p.throwBomb(a);advance(120);near(sensor.age,0,'half-frame waits');
    reset('pointSensor');sensor=p.throwBomb(a);advance(120);near(sensor.age,0,'new match resets the outer clock');advance(120);near(sensor.age,1/60,'next complete frame advances');
  });

  await t.test('first capsule entry wins before an intervening wall for Sensor, Burst and Angle Shooter',()=>{
    const enemy=f.make('shooter');enemy.team=1;enemy.remote=false;enemy.invuln=0;
    for(const id of ['pointSensor','burst','angleShooter'])for(const wall of [1.2,.4]){
      reset(id,{pitch:0,wall});enemy.pos.set(0,0,1.3);enemy.hp=100;enemy.alive=true;G.actors=[a,enemy];
      const object=p.throwBomb(a);object.pos.set(0,1,0);object.vel.set(0,0,120);advance(60);
      const radius=id==='pointSensor'?.2:id==='burst'?.22:.25;
      near(object.pos.z,wall===1.2?1.3-f.PLAYER.radius-radius:wall-.03,id+' first entry vs wall '+wall);
      if(id==='burst'&&wall===1.2)assert.equal(object.phase,'burstWait','direct hit precedes delayed burst');
      if(id==='angleShooter'&&wall===1.2)assert.equal(object.phase,'line','player contact ends flight');
    }
  });

  await t.test('guided Torpedo stops its forecast at acquisition without authoring a lock, paint, damage or a birth',()=>{
    reset('torpedo',{pitch:0});const enemy=f.make('shooter');enemy.team=1;enemy.pos.set(5,0,10);G.actors=[a,enemy];
    const ink=a.ink,hp=enemy.hp,serial=a.s3AllSubSeq,objects=p._s3SubObjects.length;
    let paint=0,damage=0;const oldPaint=G.paint.splat,oldHit=p.applyHit;
    G.paint.splat=()=>{paint++;return 0;};p.applyHit=()=>{damage++;};
    try{p.updateArc(a,true);}finally{G.paint.splat=oldPaint;p.applyHit=oldHit;}
    assert.equal(p.arcLine.visible,true);assert.equal(p.arcRing.visible,false,'no invented ballistic landing after target acquisition');
    assert.equal(a.ink,ink);assert.equal(enemy.hp,hp);assert.equal(a.s3AllSubSeq,serial);assert.equal(p._s3SubObjects.length,objects);assert.equal(paint,0);assert.equal(damage,0);
    const end=p.arcGeo.drawRange.count-1,attribute=p.arcGeo.attributes.position,forecast=new THREE.Vector3(attribute.getX(end),attribute.getY(end),attribute.getZ(end));
    const object=p.throwBomb(a);for(let i=0;i<10&&object.phase==='flight';i++)advance(60);
    assert.equal(object.phase,'torpedoRotate');near(forecast.distanceTo(object.pos),0,'guide ends where actual lock begins',1e-5);
  });

  await t.test('preview cost agrees with actual paid release, including gear and cached presentation',()=>{
    for(const [id,multiplier] of [['pointSensor',1],['burst',.7],['autobomb',.7],['suction',.7]]){
      reset(id);a.s3.modifiers.inkSaverSub=multiplier;
      const cost=(f.SUB[id].inkCost??f.SUB[id].inkCostFallback)*multiplier;
      for(const ink of [cost-1e-5,cost,cost+1e-5]){
        a.ink=ink;p.updateArc(a,true);G.time+=1/120;p.updateArc(a,true);
        const expected=(ink<cost?new THREE.Color(.6,.6,.6):a.color.clone()).multiplyScalar(1.4);
        near(p.arcLine.material.color.distanceTo?.(expected)??Math.hypot(p.arcLine.material.color.r-expected.r,p.arcLine.material.color.g-expected.g,p.arcLine.material.color.b-expected.b),0,id+' cost color '+ink);
      }
      a.ink=100;a.lastFire=0;
      const input={fire:false,fireReleased:false,sub:true,subReleased:false};
      for(let i=0;i<12;i++)a.weaponRunner.update(1/60,input);
      a.weaponRunner.update(1/60,{...input,sub:false,subReleased:true});
      for(let i=0;i<4;i++)a.weaponRunner.update(1/60,{...input,sub:false});
      near(100-a.ink,cost,id+' native paid release');
      assert.ok(p.bombs.length+p._s3SubObjects.length+p._s3SupportSensors.length>0,id+' actual object emitted');
    }
  });
  await t.test('held moving forecasts retain a 30 Hz budget and invalidate gear, hide and teleport changes',()=>{
    const rows=[],ids=['bomb','suction','burst','autobomb','fizzy','torpedo','toxicMist','angleShooter','splashWall','sprinkler','pointSensor'];
    const original=G.physics.segment,forecast=p.s3PredictThrowTrajectory;
    for(const hz of [60,120])for(const id of ids){
      reset(id);let queries=0,forecasts=0;G.physics.segment=(...args)=>{queries++;return original(...args);};
      p.s3PredictThrowTrajectory=function(...args){forecasts++;return forecast.apply(this,args);};
      const before=p.arcGeo.attributes.position.version;
      try{for(let i=0;i<hz;i++){a.pos.x+=1.5/hz;a.aimYaw+=1.2/hz;advance(hz);p.updateArc(a,true);}}
      finally{G.physics.segment=original;p.s3PredictThrowTrajectory=forecast;}
      const recomputations=p.arcGeo.attributes.position.version-before;
      assert.ok(recomputations<=31,`${id} ${hz}Hz: ${recomputations} full guide recomputations`);
      assert.equal(forecasts,recomputations,id+' performs one forecast per geometry refresh');
      // Final explosion/settlement can follow several contacts. The public UI
      // caps flight at 12 s; a native tick queries sweep and ground support.
      assert.ok(queries>0&&queries<=2*12*60*forecasts,`${id} ${hz}Hz: ${queries} terrain queries`);
      rows.push({id,hz,recomputations,forecasts,queries});
    }
    reset('pointSensor',{pitch:0});p.updateArc(a,true);const before=p.arcRing.position.clone();
    a.s3.abilityPoints={...a.s3.abilityPoints,subPower:57};p.updateArc(a,true);
    assert.ok(p.arcRing.position.z>before.z,'AP change invalidates within one render interval');
    const version=p.arcGeo.attributes.position.version;p.updateArc(a,false);p.updateArc(a,true);
    assert.equal(p.arcGeo.attributes.position.version,version+1,'show after hide rebuilds');
    const point=p.arcRing.position.clone();a.pos.x+=10;p.updateArc(a,true);near(p.arcRing.position.x-point.x,10,'teleport invalidates immediately');
    t.diagnostic('SUB_PREVIEW_QUERY_BUDGET '+JSON.stringify(rows));
  });
  p.clear();
});
