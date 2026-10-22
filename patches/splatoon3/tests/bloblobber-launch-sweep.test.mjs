import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { BLOBLOBBER_MAX_SWEEP_STEP, resetBloblobberYawSweep,
  sampleBloblobberWindupYaw, bloblobberSweepOffset } from '../runtime/bloblobber-launch-sweep.mjs';

const close=(x,y,label)=>assert.ok(Math.abs(x-y)<1e-7,`${label}: ${x} != ${y}`);
const signedYaw=v=>Math.atan2(v.x,v.z);
const turn=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));

test('last 60Hz windup yaw sample handles wrap, idle and native 10-degree clamp',()=>{
  const s={};
  close(sampleBloblobberWindupYaw(s,{x:0,z:1}),0,'initial heading has no artificial sweep');
  close(sampleBloblobberWindupYaw(s,{x:Math.sin(.04),z:Math.cos(.04)}),.04,'last-step angle');
  close(bloblobberSweepOffset(s.bloblobberYawStep,5),.2,'first small bubble at source 5F interval');
  close(sampleBloblobberWindupYaw(s,{x:Math.sin(1),z:Math.cos(1)}),BLOBLOBBER_MAX_SWEEP_STEP,'native shared 10-degree limit');
  resetBloblobberYawSweep(s);
  close(sampleBloblobberWindupYaw(s,{x:0,z:-1}),0,'fresh windup ignores previous action');
  close(sampleBloblobberWindupYaw(s,{x:Math.sin(-Math.PI+.04),z:Math.cos(-Math.PI+.04)}),.04,'wrapped heading remains continuous');
});

test('real Bloblobber runner fans four emitted bubbles from aim motion DURING windup',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  const P=f.G.projectiles;
  f.G.physics.segment=(_from,_to,hit)=>{hit.hit=false;return hit;};
  const run=(step)=>{
    P.clear();f.G.actors.length=0;
    const actor=f.make('s3-slosher-bathtub');
    actor.form='kid';actor.ink=100;actor.grounded=true;actor.vel.set(0,0,0);
    actor.aimYaw=0;actor.aimPitch=0;
    for(let tick=0;tick<22&&!P.list.some(p=>p.catalog?.r?.sourceActor==='WeaponSlosherBathtub');tick++){
      const angle=step*tick;
      actor.aimDir.set(Math.sin(angle),0,Math.cos(angle));
      actor.aimPoint.set(100*Math.sin(angle),1.05,100*Math.cos(angle));
      f.G.time+=1/60;
      actor.weaponRunner.update(1/60,{fire:true,firePressed:tick===0,sub:false});
    }
    const balls=P.list.filter(p=>p.catalog?.r?.sourceActor==='WeaponSlosherBathtub');
    assert.equal(balls.length,4,'one source action emits exactly four bubble rounds');
    return {actor,balls,angles:balls.map(b=>signedYaw(b.vel))};
  };
  const idle=run(0);
  for(const angle of idle.angles)close(angle,idle.angles[0],'static aim leaves identical headings');
  const rotating=run(.04);
  const positions=[0,5,10,15];
  for(let i=0;i<4;i++){
    const expected=.04*positions[i];
    close(turn(rotating.angles[i],rotating.angles[0]),expected,
      `source cumulative 5-frame fan offset for bubble ${i+1}`);
  }
  // Post-release turns must not retarget the already admitted birth directions.
  const before=rotating.balls.map(b=>b.vel.clone());
  rotating.actor.aimDir.set(-1,0,0);
  rotating.actor.aimPoint.set(-100,1.05,0);
  for(let tick=0;tick<18;tick++){
    f.G.time+=1/60;
    rotating.actor.weaponRunner.update(1/60,{fire:false,sub:false});
    P.update(1/60);
  }
  for(let i=0;i<4;i++) {
    const p=rotating.balls[i];
    assert.ok(p.catalog?.groundBounces===0,'test contains no impact before birth');
    close(signedYaw(p.vel),signedYaw(before[i]),`post-release camera turn leaves bubble ${i+1} yaw unchanged`);
  }
  const afterIdle=run(0);
  for(const angle of afterIdle.angles)close(angle,afterIdle.angles[0],'new volley has no stale yaw sweep');
});


test('pinned 11.3.0 Bloblobber NearestParam paints once per grounded swing, never a damage collider',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  const G=f.G,marks=[];
  G.physics.segment=(_from,_to,h)=>{h.hit=false;return h;};
  G.physics.raycast=(from,_down,_range,h)=>{
    h.hit=true;h.point.set(from.x,0,from.z);h.normal.set(0,1,0);h.face=-1;return h;
  };
  G.paint.splat=(point,radius,team,options)=>{
    marks.push({x:point.x,y:point.y,z:point.z,radius,team,options});
    return .25;
  };
  const fire=(grounded)=>{
    G.projectiles.clear();G.actors.length=0;marks.length=0;
    const a=f.make('s3-slosher-bathtub');
    a.form='kid';a.ink=100;a.grounded=grounded;
    a.aimYaw=0;a.aimPitch=0;a.aimPoint.set(0,1.05,80);
    a.intent.fire=true;
    for(let n=0;n<25&&!G.projectiles.list.some(p=>p.catalog?.r?.sourceActor==='WeaponSlosherBathtub');n++)
      f.tick(a);
    a.intent.fire=false;
    return {a,projectiles:G.projectiles.list.filter(p=>p.catalog?.r?.sourceActor==='WeaponSlosherBathtub')};
  };
  const grounded=fire(true);
  assert.equal(grounded.projectiles.length,4,'a single swing emits exactly four live bubbles');
  assert.equal(marks.length,1,'separate paint-only NearestParam belongs to the swing, not each bubble');
  const mark=marks[0];
  close(mark.radius,2.2,'source foot paint width');
  close(mark.options.stretchAmt,.2,'source forward paint depth multiplier');
  close(mark.y,.1,'nearest paint is offset from the real floor');
  assert.equal(mark.options.claimOwner,grounded.a,'only the local firing player claims turf');
  assert.equal(mark.options.footprint,'ink-contact','nearest paint uses the native ink footprint');
  const airborne=fire(false);
  assert.equal(airborne.projectiles.length,4,'airborne shot still launches its four bubbles');
  assert.equal(marks.length,0,'airborne projectile launch cannot stamp the ground below the player');
});
