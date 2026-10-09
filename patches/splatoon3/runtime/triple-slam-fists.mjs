// Splatoon 3 Ver. 11.3.0 Triple Splashdown: two independently owned fists
// travel 6.54 source units, 30 degrees either side of activation yaw. They
// start moving for 15F before the player's landing, so their explosion follows
// the native landing by 15 fixed simulation ticks. Relative timing/geometry
// is source-backed; texture/mesh, stage scaling and recovery are not Switch
// footage calibration.
const INSTALL = Symbol.for('inkwave.s3.triple-slam-fists');
const DEG = Math.PI / 180;
export const FIST_TRAVEL = 15 / 60;
export const FIST_SOURCE_DISTANCE = 6.54;
export const FIST_SOURCE_ANGLE = 30 * DEG;
export const FIST_NEAR_RADIUS = 6.4;
export const FIST_FAR_RADIUS = 9.6;

const finite = x => typeof x === 'number' && Number.isFinite(x);
export function tripleSlamFistCenters(origin, yaw, scale = 1) {
  if (!origin || ![origin.x, origin.y, origin.z, yaw, scale].every(finite) || scale <= 0)
    return [];
  const distance = FIST_SOURCE_DISTANCE * scale;
  return [-FIST_SOURCE_ANGLE, FIST_SOURCE_ANGLE].map(offset => {
    const angle = yaw + offset;
    return { x: origin.x + Math.sin(angle) * distance,
      y: origin.y, z: origin.z + Math.cos(angle) * distance };
  });
}

export function tripleSlamFistDamage(distance, scale = 1) {
  if (!finite(distance) || distance < 0 || !finite(scale) || scale <= 0) return 0;
  const near = FIST_NEAR_RADIUS * scale, far = FIST_FAR_RADIUS * scale;
  if (distance > far) return 0;
  if (distance <= near) return 220;
  return 220 + (60 - 220) * ((distance - near) / (far - near));
}

function blast(actor, record, G, THREE, emit) {
  if (!G?.projectiles?.applyHit || actor.remote || !record?.centers?.length) return;
  const v = new THREE.Vector3(), from = new THREE.Vector3();
  for (const center of record.centers) {
    const top = Number.isFinite(G.level?.groundHeight?.(center.x, center.z, center.y + 8))
      ? G.level.groundHeight(center.x, center.z, center.y + 8) : center.y;
    const pos = v.set(center.x, top + .12, center.z);
    const source = from.set(record.origin.x, record.origin.y + .6, record.origin.z);
    // A tall wall blocks fist travel. Don't synthesize a remote-through-wall
    // damage or paint footprint; exact wall-following path awaits stage capture.
    if (G.physics?.los && !G.physics.los(source, pos)) continue;
    if (G.paint?.splat) {
      const area = G.paint.splat(pos, 10 * record.scale, actor.team,
        { seed: Math.random(), claimOwner: actor, kind: 'splashdown' });
      if (Number.isFinite(area) && area > 0) actor.addTurfNoSpecial?.(area);
    }
    for (const victim of G.actors || []) {
      if (!victim.alive || victim.team === actor.team || victim === actor) continue;
      const dist = Math.hypot(victim.pos.x - pos.x, victim.pos.y + .8 - pos.y, victim.pos.z - pos.z);
      const damage = tripleSlamFistDamage(dist, record.scale);
      if (!(damage > 0)) continue;
      const target = new THREE.Vector3(victim.pos.x, victim.pos.y + .8, victim.pos.z);
      if (G.physics?.los && !G.physics.los(pos, target)) continue;
      // Separate calls are deliberate: two genuine fist explosions can both
      // damage a victim, independently of the player's already-applied blast.
      G.projectiles.applyHit(actor, victim, damage, 'slam');
    }
    G.fx?.explosion?.(pos, actor.color, FIST_FAR_RADIUS * record.scale);
    // Reuse the existing authenticated special:slam owner event. Remote
    // clients get two fist bursts at the same presentation clock without
    // replaying local physics, paint or damage on non-owner actors.
    emit?.('special:slam', { actor, pos: new THREE.Vector3(pos.x, pos.y, pos.z), radius: FIST_FAR_RADIUS * record.scale, fist: true });
  }
}

export function tickTripleSlamFists(actor, dt, G, THREE, emit) {
  const state = actor?._s3TripleSlamFists;
  if (!state || actor.remote || !finite(dt) || !(dt > 0)) return false;
  state.elapsed += dt;
  if (state.remaining == null && actor.alive) return false;
  // If the user was splatted before landing, the already-launched fists
  // continue on the fixed owner's timeline; don't invent a player impact.
  if (state.remaining == null) {
    if (state.elapsed < 85 / 60) return false;
    state.remaining = 0;
  } else state.remaining = Math.max(0, state.remaining - dt);
  if (state.remaining > 1e-10) return false;
  actor._s3TripleSlamFists = null;
  blast(actor, state, G, THREE, emit);
  return true;
}

export function installTripleSlamFists({ Actor, G, THREE, emit }, profile) {
  if (!Actor || !G || !THREE || Actor.prototype[INSTALL]) return;
  Object.defineProperty(Actor.prototype, INSTALL, { value: true });
  const scale = profile?.weaponsFidelityCompletion?.worldUnitsPerSourceUnit;
  const worldScale = finite(scale) && scale > 0 ? scale : 1;
  const start = Actor.prototype._startSpecial, impact = Actor.prototype._slamImpact,
    update = Actor.prototype.update, reset = Actor.prototype.reset;

  Actor.prototype._startSpecial = function (...args) {
    const admitted = this.alive && !this.remote && !this.superJumpState && this.weapon?.special === 'slam';
    const origin = admitted ? { x: this.pos.x, y: this.pos.y, z: this.pos.z } : null;
    const yaw = this.yaw;
    const result = start.apply(this, args);
    if (admitted && this.specialActive?.id === 'slam')
      this._s3TripleSlamFists = { origin, centers: tripleSlamFistCenters(origin, yaw, worldScale),
        elapsed: 0, remaining: null, scale: worldScale };
    return result;
  };
  Actor.prototype._slamImpact = function (...args) {
    const state = this._s3TripleSlamFists;
    const result = impact.apply(this, args);
    if (state && !this.remote && this._s3TripleSlamFists === state && state.remaining == null)
      state.remaining = FIST_TRAVEL;
    return result;
  };
  // Tick before native update so a fist scheduled during this very frame's
  // player impact receives a full 15F delay, never an accidental 14F.
  Actor.prototype.update = function (dt, ...args) {
    tickTripleSlamFists(this, dt, G, THREE, emit);
    return update.call(this, dt, ...args);
  };
  if (typeof reset === 'function') Actor.prototype.reset = function (...args) {
    this._s3TripleSlamFists = null;
    return reset.apply(this, args);
  };
}
