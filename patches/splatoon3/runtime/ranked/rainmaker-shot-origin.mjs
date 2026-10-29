import { rainmakerAimQuaternion } from './rainmaker-motion.mjs';

// The shoulder-carried model's immutable muzzle socket. The
// model-identity regression checks this against rainmakerModel.muzzle.
export const RAINMAKER_MUZZLE = Object.freeze([-.30, .124, .749]);
const vector = v => Array.isArray(v) && v.length === 3 && v.every(n => Number.isFinite(n) && Math.abs(n) <= 2000);
export const rainmakerActorLife = a => a.remote ? a.net?.lastLife ?? a.netLife ?? 0 : a.netLife ?? 0;
export const rainmakerActorOwner = a => a.owner == null ? null : String(a.owner);

export function validRainmakerShotOrigin(p, event) {
  return !!p && p.actorId === String(event.actorId) && p.team === event.team
    && (p.owner === null || typeof p.owner === 'string' && p.owner.length <= 256)
    && Number.isSafeInteger(p.life) && p.life >= 0 && vector(p.body) && vector(p.muzzle) && vector(event.pos)
    && p.body.every((n, i) => Math.abs(n - event.pos[i] - (i === 1 ? .7 : 0)) < 1e-7)
    // Safety envelope, not a retail range or a replacement for the live socket.
    && Math.hypot(...p.muzzle.map((n, i) => n - p.body[i])) <= 4;
}

export function rainmakerShotOwnerMatches(p, actor) {
  return p.actorId === String(actor.id ?? actor.nid ?? `${actor.team}:${actor.slot}`)
    && p.team === actor.team && p.life === (actor.life ?? rainmakerActorLife(actor))
    && p.owner === rainmakerActorOwner(actor);
}

// Called only on the authoritative release edge, after Actor's final pose.
// Read the current objective grip, never the previous rendered mesh or the
// underlying ordinary weapon's gameplay muzzle. No extra pose/IK evaluation.
// A remote host translates this bounded rig offset to its admitted body pose;
// followers replay the transmitted snapshot rather than resampling their rig.
export function captureRainmakerShotOrigin(THREE, actor, id, pos, aim) {
  const ch = actor.character;
  if (!actor.alive || !ch?._rainmakerPose || !ch.weapon?.pivot?.getWorldPosition
      || !Number.isFinite(ch._rainmakerPitch) || !vector(pos) || !vector(aim)) return null;
  const dir = new THREE.Vector3(...aim);
  if (dir.lengthSq() < 1e-12) return null;
  dir.normalize();
  const q = new THREE.Quaternion();
  rainmakerAimQuaternion(q, dir, ch._rainmakerPitch, actor.yaw, new THREE.Vector3(), new THREE.Quaternion());
  const grip = ch.weapon.pivot.getWorldPosition(new THREE.Vector3());
  const scale = Number.isFinite(ch.kidScale) ? Math.max(.001, ch.kidScale) : 1;
  const muzzle = new THREE.Vector3(...RAINMAKER_MUZZLE).multiplyScalar(scale).applyQuaternion(q).add(grip);
  muzzle.add(new THREE.Vector3(...pos).sub(actor.pos));
  const shot = { actorId: String(id), owner: rainmakerActorOwner(actor), life: rainmakerActorLife(actor),
    team: actor.team, body: [pos[0], pos[1] + .7, pos[2]], muzzle: muzzle.toArray() };
  return validRainmakerShotOrigin(shot, { actorId: id, team: actor.team, pos }) ? shot : null;
}
