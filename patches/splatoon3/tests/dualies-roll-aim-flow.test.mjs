import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';

// Splat Dualies fire -> dodge roll -> turret -> walk-out, with the camera
// turning through the turret. 11.3.0 WeaponManeuverNormal: SideStep MoveFrame
// 12, Unrelax* 32F, LapOver_RepeatFrame 4 / LapOver_DegSwerve 0 (turret),
// RepeatFrame 5 / Stand_DegSwerve 2 (normal). S3 Dualies data: 4F startup,
// 4F before the first post-roll shot. Logic-only measurement on the production
// composition with the real Projectiles; not a Switch comparison.
async function run(hz){
  const f=await fixture({productionComposition:true,fullRuntime:true,realProjectiles:true,adaptRuntime:(rel,source)=>adaptBuildSource(rel,source)});
  const level=new f.Level({bounds:{minX:-30,maxX:30,minZ:-30,maxZ:30},spawnPads:[[-20,0,0],[20,0,0]],spawnBarrier:0,half:[],
    single:[{kind:'box',min:[-30,-1,-30],max:[30,0,30]}]});
  f.G.level=level;f.G.physics=new f.Physics(level);f.G.paint.sample=()=>1;
  const a=f.make('dualies');delete a._integrate;
  a.form='kid';a.pos.set(0,0,0);a.vel.set(0,0,0);a.grounded=true;a.ground.hit=true;a.ground.face=0;a.coyote=0;
  const clock=new f.FixedClock(),frames=[],seen=new Set(),F=1/60;let t=0,display=0;
  // Input is sampled once per display frame, as in production; the gameplay
  // clock then runs its fixed 60 Hz ticks. Fire from 0; roll right at 20F;
  // camera turns 0->45 deg over 24-60F; push forward during the 32F lock
  // (44-56F, UnrelaxFrameMove), then walk forward from 90F to release the turret.
  const yawAt=time=>time<24*F?0:time<60*F?(time-24*F)/(36*F)*Math.PI/4:Math.PI/4;
  for(let i=0;i<Math.round(hz*130/60);i++){
    const roll=display>=20*F-1e-9&&display<22*F-1e-9,walk=display>=44*F-1e-9&&display<56*F-1e-9||display>=90*F-1e-9&&display<110*F-1e-9;
    a.intent.fire=true;a.intent.jump=roll;a.intent.move.set(roll?1:0,0,walk?1:0);
    const ay=yawAt(display);a.aimYaw=ay;a.aimDir.set(Math.sin(ay),0,Math.cos(ay));
    clock.advance(1/hz,dt=>{
      a.aimPoint.set(a.pos.x+20*Math.sin(ay),1,a.pos.z+20*Math.cos(ay));
      f.G.time+=dt;a.update(dt);t+=dt;
      const r=a.weaponRunner,shots=[];
      for(const q of f.G.projectiles.list)if(q.owner===a&&!seen.has(q)){seen.add(q);
        const to=a.aimPoint.clone().sub(q.pos);to.y=0;const v=q.vel.clone();v.y=0;
        shots.push({miss:Math.acos(Math.min(1,v.normalize().dot(to.normalize())))*180/Math.PI});}
      frames.push({t,roll:!!r.dodge,turret:!!r.s3Turret,spread:r.spread,x:a.pos.x,z:a.pos.z,shots});
    });
    display+=1/hz;
  }
  return frames;
}

test('Dualies roll -> turret -> normal aim keeps the 11.3.0 timing and tracks a turning camera at 30/60/120 Hz',async()=>{
  for(const hz of [30,60,120]){
    const fr=await run(hz),F=1/60,step=Math.max(F,1/hz),tol=step+F+1e-6;
    const rollEnd=fr.find((x,i)=>i>0&&fr[i-1].roll&&!x.roll)?.t;assert.ok(rollEnd,`${hz} Hz roll happened`);
    // 4F startup + 12F roll from the 20F press (rounded up to this frame grid).
    assert.ok(Math.abs(rollEnd-36*F)<=tol,`${hz} Hz roll ends at ${rollEnd*60}F`);
    const turret=fr.filter(x=>x.turret),turretShots=turret.flatMap(x=>x.shots.map(s=>({...s,t:x.t})));
    assert.ok(Math.abs(turret[0].t-rollEnd)<=F+1e-6,`${hz} Hz turret starts with the roll end`);
    assert.ok(Math.abs(turretShots[0].t-rollEnd-4*F)<=F+1e-6,`${hz} Hz first post-roll shot after 4F (${(turretShots[0].t-rollEnd)*60}F)`);
    for(let i=1;i<turretShots.length;i++)
      assert.ok(Math.abs(turretShots[i].t-turretShots[i-1].t-4*F)<=1e-6,`${hz} Hz turret cadence LapOver_RepeatFrame 4`);
    for(const s of turretShots)assert.ok(s.miss<3,`${hz} Hz turret shot heads to the current reticle point (${s.miss.toFixed(2)} deg off)`);
    assert.ok(turret.filter(x=>x.shots.length).every(x=>x.spread===0),'every turret shot uses LapOver_DegSwerve 0');
    // The 32F lock holds the body in place and keeps the turret through the
    // stick push at 44-56F.
    const held=fr.filter(x=>x.t>rollEnd+4*F+tol&&x.t<90*F);
    assert.ok(held.every(x=>x.turret&&Math.abs(x.x-held[0].x)<1e-9&&Math.abs(x.z)<1e-9),`${hz} Hz turret holds position until the walk input`);
    // Walking after the lock releases the turret on the same frame grid, and
    // the normal 5F cadence and Stand_DegSwerve 2 return.
    const out=fr.find(x=>x.t>=90*F-1e-9&&!x.turret);
    assert.ok(out&&out.t-90*F<=tol,`${hz} Hz walk releases the turret`);
    const normal=fr.filter(x=>x.t>out.t+F).flatMap(x=>x.shots.map(()=>x.t));
    assert.ok(normal.length>=3,'normal fire resumes');
    for(let i=1;i<normal.length;i++)
      assert.ok(Math.abs(normal[i]-normal[i-1]-5*F)<=1e-6,`${hz} Hz normal cadence RepeatFrame 5 (${((normal[i]-normal[i-1])*60).toFixed(2)}F)`);
    assert.ok(fr.filter(x=>x.t>out.t+2*step).every(x=>x.spread===2),'Stand_DegSwerve 2 after the turret');
    assert.ok(fr.at(-1).z>1,'the walk moves the player after the turret');
  }
});
