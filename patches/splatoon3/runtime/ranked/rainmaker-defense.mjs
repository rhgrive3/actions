import { ALL_SUB_SPECS, applySubObjectHit } from '../all-subs.mjs';
import { bigBubblerDomes, bigBubblerRemoteDomes, kitBarrierCandidate } from '../kit-big-bubbler.mjs';

export function rainmakerDomeBlast(api, at, from, owner, team, radius, nearRadius, nearDamage, farDamage, walls) {
  if (!owner || owner.remote) return;
  const plans = new Map();
  for (const dome of [...bigBubblerDomes(), ...bigBubblerRemoteDomes()]) {
    if (dome.dead || dome.team === team) continue;
    const centers = [dome.pos.clone()];
    if (dome.ignited) { const field = dome.pos.clone(); field.y += dome.emitterY; centers.push(field); }
    for (const end of centers) {
      const probe = { owner, team, prev: from, pos: end, damage: 0, size: 0, ghost: false, s3BubblerRow: 'Gachihoko_BombCore' };
      const contact = kitBarrierCandidate(probe, from, end);
      if (!contact || api.G.physics?.los && !api.G.physics.los(from, contact.point)
          || rainmakerWallsBlockBlast(from, contact.point, walls)) continue;
      const distance = contact.point.distanceTo(at);
      if (distance > radius) continue;
      const key = contact.domeId + ':' + contact.serial, old = plans.get(key);
      if (!old || distance < old.distance) plans.set(key, { probe, distance, id: contact.domeId, serial: contact.serial });
    }
  }
  // The native query reuses a record. Re-query and settle immediately, once per
  // dome activation, preserving native raw units, barrier ratio and proposals.
  for (const plan of plans.values()) {
    plan.probe.damage = plan.distance <= nearRadius ? nearDamage : farDamage;
    const contact = kitBarrierCandidate(plan.probe, plan.probe.prev, plan.probe.pos);
    if (contact?.domeId === plan.id && contact.serial === plan.serial) contact.onHit();
  }
}

// S3mix Splash Wall's damage-rate table: Rainmaker direct x1, blast x2.
// The existing native wall rectangle supplies geometry. The shot's actor /
// paint authority remains the ranked host; only its owning client proposes
// native object HP, including the guest's visual-only projectile replay.
export function rainmakerWallBlast(api, at, owner, team, radius, nearRadius, nearDamage, farDamage, impactWall = null) {
  const { G, THREE } = api, walls = [], wallHits = [];
  const objects = new Set(G.projectiles?._s3SubObjects || []);
  if (impactWall?.subId === 'splashWall') objects.add(impactWall);
  const width = ALL_SUB_SPECS.splashWall.wallWidth, height = ALL_SUB_SPECS.splashWall.wallHeight;
  for (const object of objects) {
    if (object.subId !== 'splashWall' || object.team === team || object.phase !== 'deployed'
      || (object.dead && object !== impactWall)) continue;
    const yaw = object.yaw || 0, rx = Math.cos(yaw), rz = -Math.sin(yaw), nx = Math.sin(yaw), nz = Math.cos(yaw);
    const side = Math.max(-width / 2, Math.min(width / 2, (at.x - object.pos.x) * rx + (at.z - object.pos.z) * rz));
    const point = new THREE.Vector3(object.pos.x + rx * side,
      Math.max(object.pos.y, Math.min(object.pos.y + height, at.y)), object.pos.z + rz * side);
    const distance = point.distanceTo(at);
    if (distance > radius || (G.physics?.los && !G.physics.los(at.clone().add(new THREE.Vector3(0, .05, 0)), point))) continue;
    // Snapshot before HP can remove the wall: the same blast remains blocked
    // even when its direct contact or explosion destroys that shield.
    walls.push({ pos: object.pos.clone(), rx, rz, nx, nz, width, height });
    if (!object.dead) wallHits.push({ object, point, distance });
  }
  if (owner && owner.remote !== true) {
    const source = { owner, team, pos: at, wid: 'rainmaker', type: 'rainmaker-blast', ghost: false };
    const damageAt = distance => distance <= nearRadius ? nearDamage : farDamage;
    // Share native device geometry, source rates and ownership with ordinary
    // blasts, including native Sprinkler and deployed special devices.
    if (G.projectiles?.s3DamageSubObjects) {
      G.projectiles.s3DamageSubObjects(source, at, radius, damageAt, 'Gachihoko_BombCore');
    } else for (const { object, point, distance } of wallHits) {
      applySubObjectHit(api, G.projectiles, object, source, point, damageAt(distance), 'Gachihoko_BombCore');
    }
    G.projectiles?.s3DamageSpecialObjects?.(source, at, radius, damageAt, 'Gachihoko_BombCore');
  }
  return walls;
}

export function rainmakerWallsBlockBlast(start, end, walls) {
  const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
  return walls.some(wall => {
    const den = dx * wall.nx + dz * wall.nz;
    if (Math.abs(den) < 1e-9) return false;
    const t = ((wall.pos.x - start.x) * wall.nx + (wall.pos.z - start.z) * wall.nz) / den;
    if (t < 0 || t > 1) return false;
    const x = start.x + dx * t, y = start.y + dy * t, z = start.z + dz * t;
    return Math.abs((x - wall.pos.x) * wall.rx + (z - wall.pos.z) * wall.rz) <= wall.width / 2
      && y >= wall.pos.y && y <= wall.pos.y + wall.height;
  });
}
