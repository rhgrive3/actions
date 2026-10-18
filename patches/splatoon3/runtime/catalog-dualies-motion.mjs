// Added Dualies motion only. Distances/frame counts are sourced where present.
// The default braking curve is the existing INKWAVE Splat Dualies calibration,
// not recovered Nintendo executable code. An explicit Kd is interpreted as
// geometric per-frame retention, normalized to the source MoveDist.
const EPS=1e-9,HZ=60;
const clamp=x=>Math.max(0,Math.min(1,x));

export function catalogDualiesTurret(state) {
  return !!state&&!state.roll&&(state.turret>EPS||state.turretHeld===true);
}

export function isDualiesWeapon(actor) {
  return actor?.weapon?.kind==='dualies'||actor?.weapon?.catalogRecord?.family==='dualies';
}

export function dualiesNetworkAction(actor) {
  const runner=actor?.weaponRunner;
  return actor?.weapon?.catalogRecord?.family==='dualies'?runner?.catalogState?.roll:runner?.dodge;
}

export function dualiesNetworkDirection(actor) {
  return actor?.weapon?.catalogRecord?.family==='dualies'?dualiesNetworkAction(actor)?.direction:actor?.weaponRunner?._dodgeDir;
}

export function dualiesNetworkLockDuration(actor,action=dualiesNetworkAction(actor)) {
  return actor?.weapon?.catalogRecord?.family==='dualies'?action?.recovery:actor?.weapon?.lockTime;
}

export function dualiesNetworkLock(actor) {
  return actor?.weapon?.catalogRecord?.family==='dualies'?(actor.weaponRunner?.catalogState?.turret||0):(actor?.weaponRunner?.lockT||0);
}

export function catalogDualiesIntervalDistance(motion,dt,offset=0) {
  if(!motion||!(dt>0)||!(motion.dur>0)||!(motion.distance>=0))return 0;
  const start=clamp((motion.t+offset)/motion.dur),end=clamp((motion.t+offset+dt)/motion.dur);
  const kd=motion.kd;
  if(kd>0&&kd<1){
    const log=Math.log(kd)*motion.dur*HZ;
    // expm1 preserves precision for near-one retention and short substeps.
    return motion.distance*Math.exp(log*start)*Math.expm1(log*(end-start))/Math.expm1(log);
  }
  return motion.distance*1.5*(end-start)*(1-(end*end+end*start+start*start)/3);
}

export function catalogDualiesPeakSpeed(motion) {
  if(!(motion?.dur>0))return 0;
  const kd=motion.kd;
  if(kd>0&&kd<1){const log=Math.log(kd)*motion.dur*HZ;return motion.distance/motion.dur*log/Math.expm1(log);}
  return 1.5*motion.distance/motion.dur;
}

export function catalogDualiesMotion(actor) {
  if(actor?.weapon?.catalogRecord?.family!=='dualies'||actor.remote||actor.alive===false||actor.form!=='kid'||actor.climbing||actor.specialActive||actor.superJumpState)return null;
  const s=actor.weaponRunner?.catalogState;
  return s?.roll||s?.slip||null;
}

export function writeCatalogDualiesVelocity(actor,dt,offset=0) {
  const motion=catalogDualiesMotion(actor);
  if(!motion||!(dt>0))return false;
  const speed=catalogDualiesIntervalDistance(motion,dt,offset)/dt;
  actor.vel.x=motion.direction.x*speed;actor.vel.z=motion.direction.z*speed;
  return true;
}

// Uses the real native slope/step/body collision solver in bounded slices.
// Collision-clipped distance is discarded; it is never replayed past a wall.
// The weapon's fixed simulation tick remains the sole motion-clock owner.
export function integrateCatalogDualies(actor,dt,isSquid,jumped,radius) {
  const motion=catalogDualiesMotion(actor);
  if(!motion||!(dt>0))return false;
  const active=Math.min(dt,Math.max(0,motion.dur-motion.t));
  const count=Math.max(1,Math.ceil(catalogDualiesPeakSpeed(motion)*active/Math.max(.02,radius*.5)));
  const slice=dt/count;
  for(let i=0;i<count;i++){
    writeCatalogDualiesVelocity(actor,slice,i*slice);
    actor._integrateMovementStep(slice,isSquid,jumped&&i===0);
  }
  return true;
}
