import { ALL_SUB_SPECS, applySubObjectHit } from '../all-subs.mjs';

// S3mix Splash Wall's damage-rate table: Rainmaker direct x1, blast x2.
// The existing native wall rectangle supplies geometry. The shot's actor /
// paint authority remains the ranked host; only its owning client proposes
// native object HP, including the guest's visual-only projectile replay.
export function rainmakerWallBlast(api, at, owner, team, radius, nearRadius, nearDamage, farDamage, impactWall = null) {
  const { G, THREE } = api, walls = [];
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
    if (owner && owner.remote !== true && !object.dead) {
      const damage = distance <= nearRadius ? nearDamage : farDamage;
      applySubObjectHit(api, G.projectiles, object,
        { owner, team, pos: at, wid: 'rainmaker', type: 'rainmaker-blast', ghost: false }, point, damage, 'Gachihoko_BombCore');
    }
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
