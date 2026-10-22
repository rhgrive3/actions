// QA-only placement checks. Install the same functions in Node tests and browsers.
export function installCombatPlacementQA() {
  const fail = message => { throw Error('Combat placement: ' + message); };
  const finite = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
  const safe = (p, level) => finite(p) && level.spawnPads.every(s =>
    Math.hypot(p[0] - s.x, p[2] - s.z) >= level.spawnBarrier + 1);
  const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  const validate = (points, requested, level) => {
    if (points.length !== 2 || !points.every(p => safe(p, level))) fail('inside spawn barrier or nonfinite position');
    const separation = distance(points[0], points[1]);
    if (Math.abs(separation - 2) > .05) fail('settled separation is not 2m');
    if (requested && points.some((p, i) => distance(p, requested[i]) > .05)) fail('native settle moved selected placement');
    return separation;
  };
  // Read-only readiness: never clear spawn ownership or reset sampled state.
  const spawnReady = () => {
    const G = globalThis.__G, actors = G?.match?.actors;
    return G?.match?.state === 'playing' && actors?.length === 2 && actors.every(a =>
      a.alive && a.grounded && a.form === 'kid' && !a.s3?.squidSpawn &&
      (!a.remote || a.net?.ready === true));
  };
  const placementReady = ({attacker,victim,requested}) => {
    if (!spawnReady()) return false;
    const G = globalThis.__G, actors = [attacker,victim].map(id => G.netm.byNid.get(id));
    return actors.every((a,i) => a && finite(requested?.[i]) &&
      distance([a.pos.x,a.pos.y,a.pos.z],requested[i]) <= .05);
  };
  const inspect = ({attacker, victim, requested}) => {
    const G = globalThis.__G, ids = [attacker, victim];
    const actors = ids.map(id => G.netm.byNid.get(id));
    if (actors.some(a => !a?.alive || !a.grounded || a.form !== 'kid')) fail('Actors must be alive grounded kids');
    const points = actors.map(a => [a.pos.x, a.pos.y, a.pos.z]);
    return {points, separation: validate(points, requested, G.level),
      barrierClearance: points.map(p => Math.min(...G.level.spawnPads.map(s =>
        Math.hypot(p[0] - s.x, p[2] - s.z) - G.level.spawnBarrier)))};
  };
  const select = () => {
    const G = globalThis.__G, V = G.camera.position.constructor, b = G.level.bounds;
    if (![b.minX,b.maxX,b.minZ,b.maxZ,G.level.spawnBarrier].every(Number.isFinite)) fail('missing level bounds');
    const cx = (b.minX+b.maxX)/2, cz = (b.minZ+b.maxZ)/2;
    for (const fx of [.25,-.25,0,.15,-.15]) for (const fz of [0,.15,-.15,.25,-.25]) {
      const x = cx+fx*(b.maxX-b.minX), z = cz+fz*(b.maxZ-b.minZ);
      for (const [dx,dz] of [[0,2],[2,0],[0,-2],[-2,0]]) {
        const points = [];
        for (const [px,pz] of [[x,z],[x+dx,z+dz]]) {
          const h = {normal:new V(),block:-1,face:-1};
          G.physics.groundProbe(px,64,pz,0,128,.38,h,false);
          if (!h.hit || !h.center || h.grate || h.normal.y < .98 || !Number.isFinite(h.y)) break;
          points.push([px,h.y,pz]);
        }
        if (points.length !== 2 || !points.every(p => safe(p,G.level)) || Math.abs(points[0][1]-points[1][1]) > .02) continue;
        // Check body-height space as well as the line used to aim. Native
        // Actors still settle through the unchanged collision controller.
        const clear = [.5,1.05,1.5].every(y => G.physics.los(
          new V(...points[0]).add(new V(0,y,0)), new V(...points[1]).add(new V(0,y,0))));
        if (clear) { validate(points,null,G.level); return points; }
      }
    }
    fail('no neutral playable pair with a clear stage path');
  };
  const aim = ({attacker,victim,requested}) => {
    const G = globalThis.__G, checked = inspect({attacker,victim,requested});
    const a = G.netm.byNid.get(attacker), v = G.netm.byNid.get(victim), V = G.camera.position.constructor;
    const target = new V(v.pos.x,v.pos.y+(v.smoothY||0)+1.05,v.pos.z);
    a.aimPoint.copy(target);
    a.aimDir.copy(target).sub(new V(a.pos.x,a.pos.y+1.05,a.pos.z)).normalize();
    a.aimYaw = Math.atan2(a.aimDir.x,a.aimDir.z);
    a.aimPitch = Math.asin(Math.max(-1,Math.min(1,a.aimDir.y)));
    const muzzle = G.projectiles._muzzle(a,new V());
    a.aimDir.copy(target).sub(muzzle).normalize();
    a.aimYaw = Math.atan2(a.aimDir.x,a.aimDir.z);
    a.aimPitch = Math.asin(Math.max(-1,Math.min(1,a.aimDir.y)));
    if (!finite(muzzle.toArray()) || !finite(target.toArray()) || !finite(a.aimDir.toArray())) fail('nonfinite settled aim');
    if (!G.physics.los(muzzle,target)) fail('settled muzzle path blocked by stage');
    return {...checked,muzzle:muzzle.toArray(),target:target.toArray(),aim:a.aimDir.toArray()};
  };
  const compareShot = (preShot, position, velocity) => {
    if (!preShot || !finite(preShot.muzzle) || !finite(preShot.aim) || !finite(position) || !finite(velocity)) fail('nonfinite shot comparison');
    const offset = position.map((v,i) => v-preShot.muzzle[i]);
    const speed = Math.hypot(...velocity), aimLength = Math.hypot(...preShot.aim);
    if (!(speed>0 && aimLength>0)) fail('zero shot comparison direction');
    return {originOffset:offset,originDistance:Math.hypot(...offset),
      velocityAngle:Math.acos(Math.max(-1,Math.min(1,velocity.reduce((v,x,i)=>v+x*preShot.aim[i],0)/(speed*aimLength))))};
  };
  globalThis.__ceilingPlacement = {select,inspect,aim,compareShot,spawnReady,placementReady};
}


// Continue the existing native component lifecycle, not a private send/receive
// shortcut. A same-tick hit can precede the next 20Hz owner tick carrying its
// real projectile birth. The caller retains its original overall step budget.
export async function advanceUntilNativeShotProof({step,hasProof,remainingSteps}) {
  if (!Number.isSafeInteger(remainingSteps) || remainingSteps<0 || remainingSteps>60) throw Error('Invalid native proof step budget');
  let steps=0,ready=await hasProof();
  while (!ready && steps<remainingSteps) {
    await step();steps++;ready=await hasProof();
  }
  return {steps,ready};
}

// The relay and interpolation use performance.now(), not just G.time. The
// caller advances unchanged native components on a paced 60Hz clock and waits
// for both real peers, rather than seeding remote buffers or spoofing readiness.
export async function advanceUntilNativePlacement({step,hasPlacement,maxSteps=180}) {
  if (!Number.isSafeInteger(maxSteps) || maxSteps<1 || maxSteps>180) throw Error('Invalid native placement step budget');
  let steps=0,ready=await hasPlacement();
  while (!ready && steps<maxSteps) {
    await step();steps++;ready=await hasPlacement();
  }
  return {steps,ready};
}
