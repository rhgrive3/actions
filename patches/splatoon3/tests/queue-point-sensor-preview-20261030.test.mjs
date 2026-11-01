import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

test('Point Sensor preview shares native launch, 60 Hz flight, body/world first contact and timeout',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  const a=f.make('support'),enemy=f.make();enemy.team=1;
  f.G.match.state='playing';a.aimYaw=.2;a.aimPitch=.12;a.vel.set(2,.4,-1);a.alive=true;
  for(const mode of ['terrain','body','timeout'])for(const ap of [0,57]){
    f.G.projectiles.clear();f.G.time=0;a.pos.set(0,0,0);a.s3.abilityPoints={...a.s3.abilityPoints,subPower:ap};
    enemy.pos.set(100,0,100);
    f.G.physics.segment=(from,to,hit)=>{hit.hit=mode==='terrain'&&from.z<12&&to.z>=12;
      if(hit.hit){const t=(12-from.z)/(to.z-from.z);hit.point.copy(from).lerp(to,t);hit.normal.set(0,0,-1);hit.dist=from.distanceTo(hit.point);}return hit;};
    if(mode==='body'){
      // Put a real enemy capsule across the unobstructed flight at both AP
      // extremes; the old fixed target sat below the rising Sensor trajectory.
      const free=f.G.projectiles.s3PredictSubTrajectory(a),point=free.points.find(p=>p.z>=10);
      assert.ok(point);enemy.pos.copy(point);enemy.pos.y-=f.PLAYER.height*.5;
    }
    const before=f.G.projectiles._s3SupportSensors?.length||0,pose=a.pos.clone(),velocity=a.vel.clone();
    f.G.projectiles.updateArc(a,true);
    assert.equal(f.G.projectiles._s3SupportSensors?.length||0,before);
    assert.deepEqual(a.pos.toArray(),pose.toArray());assert.deepEqual(a.vel.toArray(),velocity.toArray());
    assert.equal(f.G.projectiles.arcRing.visible,true,mode);
    const prediction=f.G.projectiles._s3ThrowPrediction,predicted=prediction.endpoint.clone();
    if(mode==='timeout'){assert.equal(prediction.firstImpact,null);assert.equal(prediction.outcome,'airburst');}
    else assert.equal(prediction.firstImpact?.kind,mode==='body'?'actor':'world',mode+' exercises its intended contact');
    const normal=prediction.normal?.lengthSq()>1e-12?prediction.normal.clone().normalize():new f.THREE.Vector3(0,1,0);
    assert.ok(f.G.projectiles.arcRing.position.distanceTo(predicted.clone().addScaledVector(normal,.015))<1e-10,'marker retains its surface offset from the actual endpoint');
    const sensor=f.G.projectiles.throwBomb(a);
    for(let i=0;i<120&&sensor.activeAt===null;i++){f.G.time+=1/60;f.G.projectiles.update(1/60);}
    assert.notEqual(sensor.activeAt,null);assert.ok(sensor.pos.distanceTo(predicted)<1e-10,`${mode} AP${ap}: ${sensor.pos.toArray()} / ${predicted.toArray()}`);
    assert.equal(Object.values(prediction).includes(a),false,'shared prediction does not retain its actor');
    assert.equal(Object.values(prediction).includes(f.G.physics),false,'shared prediction does not retain the physics world');
    assert.ok(f.G.projectiles._s3ThrowPointPool.every(point=>point.isVector3),'reused point storage contains only vectors');
  }
  f.G.projectiles.clear();assert.equal(f.G.projectiles._s3ThrowPrediction,null);assert.equal(f.G.projectiles._s3ThrowPointPool,null);
});
