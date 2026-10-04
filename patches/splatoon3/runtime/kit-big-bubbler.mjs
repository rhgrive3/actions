// Big Bubbler (Splat Roller special; internal id SpGreatBarrier) for the
// composed public INKWAVE runtime.
//
// Reference: Splatoon 3 Ver. 11.3.0, splat3 commit
// 7280ff9cde8bb1c5dcef46c700c326471584d2e6. Pinned primary receipts:
//   evidence/actions-freebuff-20261004/kit-primary/
//     WeaponSpGreatBarrier.game__GameParameterTable.json
//       #/GameParameters/spl__BulletSpGreatBarrierMoveParam/BarrierParam
//       #/GameParameters/spl__BulletSpGreatBarrierMoveParam/DroneParam
//       #/GameParameters/spl__BulletSpGreatBarrierMoveParam/BaseParam
//     WeaponInfoSpecial.json  (__RowId "SpGreatBarrier", Id 2, StandAlone false)
//     base-kit-fields.json    (Roller_Normal_00 -> SpGreatBarrier, SpecialPoint 180)
//
// This module owns ONLY the deployed structure, its visual, its expiry and the
// projectile-interception query. It never simulates paint, damage or physics on
// its own: paint goes through G.paint.splat, damage through the native
// Projectiles.applyHit, and interception is answered for the caller. It is not
// a renamed Tidal Slam / Ink Tempest and it grants no invulnerability. Actors
// may walk into the dome and shoot from inside; only enemy rounds are stopped.
//
// Everything in BIG_BUBBLER_CALIBRATION is a DECLARED mapping, not a source.
// The 11.3.0 tables pin raw internal numbers whose engine scale is not publicly
// documented; see reports/public-kit-big-bubbler-20261004.md.

const BUBBLER_ID = 'bubbler';
const INSTALL = Symbol.for('inkwave.s3.kit-big-bubbler.install.v1');

// Pinned raw 11.3.0 values (verbatim from the receipts above).
export const BIG_BUBBLER_RAW = Object.freeze({
  maxHp: 15360,                  // BarrierParam.MaxHP.Low        (0 AP Ink Resistance)
  maxFieldHp: 30720,             // BarrierParam.MaxFieldHP.Low
  maxHpMid: 16896,               // BarrierParam.MaxHP.Mid
  maxHpHigh: 18432,              // BarrierParam.MaxHP.High
  timeDamage: 921,               // BarrierParam.TimeDamage
  timeDamageOnVLift: 1842,       // BarrierParam.TimeDamageOnVLift
  minRadius: 2.255,              // BarrierParam.MinRadius
  maxRadius: 7.5,                // BarrierParam.MaxRadius
  canopyKnockBack: 700,          // BarrierParam.CanopyKnockBack
  damageRatio: 0.64,             // BarrierParam.DamgeRatio (spelling is Nintendo's)
  ascendFrames: 30,              // DroneParam.AscendFrame
  ascendHeight: 8.5,             // DroneParam.AscendHeight
  ignitionFrames: 15,            // DroneParam.IgnitionFrame
  fieldCollisionRadius: 0.4,     // DroneParam.FieldCollisionRadius
  overlapFieldDamage: 5,         // DroneParam.OverlapFieldDamage
  overlapFieldDamageInterval: 5, // DroneParam.OverlapFieldDamageInterval
  paintRadius: 4.5,              // BaseParam.PaintRadius
  radiusCurve: Object.freeze({   // BarrierParam.RadiusRatioCurve
    Data: Object.freeze([0.1940299, 0.0, 0.0, 0.6522388, 0.3726415, -0.02766653,
      0.8723881, 0.75, 1.1808, 1.0, 1.0, 4.740566]),
    MaxX: 1.0, Type: 'Hermit2DSmooth',
  }),
  ascendCurve: Object.freeze({   // DroneParam.AscendCurve
    Data: Object.freeze([0.0, 0.0, 0.0, 0.25, 0.1122642, 0.8181818, 0.5, 0.5,
      2.926098, 0.6830189, 0.8556603, 1.395833, 1.0, 1.0, 0.0]),
    MaxX: 1.0, Type: 'Hermit2DSmooth',
  }),
});

// DECLARED calibration: what is pinned and what is assumed.
export const BIG_BUBBLER_CALIBRATION = Object.freeze({
  status: 'declared calibration; the 11.3.0 raw internal scale for MaxHP/MaxFieldHP/TimeDamage is unconfirmed',
  // Raw dome HP units per one INKWAVE damage unit. DECLARED. It is NOT the
  // weapons' damage factor and is deliberately not HP/10.
  rawPerDamageUnit: 100,
  // TimeDamage cadence. DECLARED per second: a per-frame reading ends a full
  // canopy in 16.7 ticks (0.28 s), which contradicts the observable multi-second
  // dome, so that reading is rejected as an inference. One constant switches it.
  timeDamageIntervalSeconds: 1,
  // Radius growth window. DECLARED mapping onto the pinned drone frames.
  radiusGrowthSeconds: 45 / 60,
  // Landing point ahead of the owner. DECLARED: the tables carry no throw
  // distance or arc, and no throw animation is implemented.
  deployDistance: 3,
  // Paint the interior at ignition using the pinned BaseParam.PaintRadius.
  paintAtIgnition: true,
  // OverlapFieldDamage is left OFF: its unit is unresolved (read through the
  // canopy mapping it is 5/100 = 0.05 INKWAVE damage per tick), so enabling it
  // would assert gameplay that no receipt supports.
  overlapFieldDamage: false,
  // Owner respawn runs Actor.reset(); erasing there would delete the dome right
  // after the owner's own death, which the reference does not do.
  eraseOnOwnerReset: false,
});

let api, tuning, raw, domes = [];
let fallbackActive = true, stepOriginal = null, stepWrapper = null;
let probeRecord = null, bestRecord = null, predictedPoint = null;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Nintendo "Hermit2DSmooth": Data is [value, inSlope, outSlope] per point, x is
// uniform across [0, MaxX], and the curve is C1 through the pinned points.
export function hermite2d(curve, x) {
  const data = curve?.Data;
  if (!Array.isArray(data) || data.length < 6) return 0;
  const n = Math.floor(data.length / 3);
  if (n < 2) return 0;
  const maxX = curve.MaxX || 1;
  const u = clamp(x / maxX, 0, 1) * (n - 1);
  const i = Math.min(n - 2, Math.floor(u)), t = u - i, t2 = t * t, t3 = t2 * t;
  const dx = maxX / (n - 1);
  const y0 = data[i * 3], m0 = data[i * 3 + 2];
  const y1 = data[(i + 1) * 3], m1 = data[(i + 1) * 3 + 1];
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * dx * m0
    + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * dx * m1;
}

export const bigBubblerDomes = () => domes;
export const bigBubblerFallbackActive = () => fallbackActive;

// ---------------------------------------------------------------- structure

function groundHeightAt(x, z, fromY) {
  const physics = api.G.physics;
  if (physics?.groundProbe) {
    const probe = { hit: false, y: fromY };
    physics.groundProbe(x, fromY + 0.5, z, 0.5, 0.5, api.PLAYER?.footRadius ?? 0.24, probe, false);
    if (probe.hit) return probe.y;
  }
  const h = api.G.level?.groundHeight?.(x, z, fromY + 0.6);
  return Number.isFinite(h) ? h : fromY;
}

function buildVisual(dome) {
  const { THREE } = api, scene = api.G.scene;
  if (!scene) return;
  const group = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: dome.color, transparent: true, opacity: 0.28,
      side: THREE.DoubleSide, depthWrite: false }));
  shell.castShadow = false; shell.receiveShadow = false; shell.frustumCulled = false;
  const emitter = new THREE.Mesh(
    new THREE.IcosahedronGeometry(raw.fieldCollisionRadius, 1),
    new THREE.MeshBasicMaterial({ color: dome.color }));
  emitter.frustumCulled = false;
  group.add(shell, emitter);
  group.position.copy(dome.pos);
  group.renderOrder = 4;
  scene.add(group);
  dome.group = group; dome.shell = shell; dome.emitterMesh = emitter;
}

function releaseVisual(dome) {
  if (api.G.scene && dome.group) api.G.scene.remove(dome.group);
  dome.group?.traverse(o => {
    o.geometry?.dispose?.();
    const m = o.material;
    if (Array.isArray(m)) m.forEach(x => x?.dispose?.()); else m?.dispose?.();
  });
  dome.group = dome.shell = dome.emitterMesh = null;
}

function removeDome(dome, reason) {
  const i = domes.indexOf(dome);
  if (i < 0) return false;
  domes.splice(i, 1);
  dome.dead = true;
  releaseVisual(dome);
  api.emit?.('kit:bubbler:collapse', { owner: dome.owner, team: dome.team, pos: dome.pos.clone(), reason });
  return true;
}

function deploy(owner) {
  const { THREE } = api;
  const yaw = owner.aimYaw ?? owner.yaw ?? 0;
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
  const x = owner.pos.x + forward.x * tuning.deployDistance;
  const z = owner.pos.z + forward.z * tuning.deployDistance;
  const pos = new THREE.Vector3(x, groundHeightAt(x, z, owner.pos.y), z);
  const dome = {
    id: `${owner.team}:${owner.slot ?? 0}:${owner.stats?.specials ?? 0}`,
    owner, team: owner.team, pos, t: 0,
    color: new THREE.Color(api.G.teamColors?.[owner.team] ?? 0xffffff),
    hp: raw.maxHp, hpMax: raw.maxHp,
    fieldHp: raw.maxFieldHp, fieldHpMax: raw.maxFieldHp,
    radius: raw.minRadius, emitterY: 0, ignited: false,
    burnAccum: 0, overlapAccum: 0, dead: false,
  };
  buildVisual(dome);
  domes.push(dome);
  syncVisual(dome);
  api.G.fx?.ring?.(pos.clone().setY(pos.y + 0.05), new THREE.Vector3(0, 1, 0), dome.color,
    { radius: raw.maxRadius, life: 0.5 });
  api.emit?.('kit:bubbler:deploy', { owner, team: owner.team, pos: pos.clone() });
  return dome;
}

function radiusAt(t) {
  const ratio = hermite2d(raw.radiusCurve, clamp(t / (tuning.radiusGrowthSeconds || 1), 0, 1));
  return raw.minRadius + (raw.maxRadius - raw.minRadius) * ratio;
}

function syncVisual(dome) {
  if (!dome.shell) return;
  dome.shell.scale.setScalar(Math.max(0.001, dome.radius));
  dome.emitterMesh.position.set(0, dome.emitterY, 0);
}

// ------------------------------------------------------------------ damage

function damageDome(dome, target, amount) {
  if (dome.dead || !(amount > 0)) return 0;
  if (target === 'field') dome.fieldHp = Math.max(0, dome.fieldHp - amount);
  else dome.hp = Math.max(0, dome.hp - amount);
  api.emit?.('kit:bubbler:hit', { owner: dome.owner, target, amount, hp: dome.hp, fieldHp: dome.fieldHp });
  if (dome.hp <= 0 || dome.fieldHp <= 0) removeDome(dome, target === 'field' ? 'emitter-destroyed' : 'canopy-destroyed');
  return amount;
}

// First entry of [from,to] into a sphere, or null. A segment that starts inside
// returns null: rounds fired from within the dome are allowed to leave.
function sphereEntry(cx, cy, cz, r, from, to) {
  const ox = from.x - cx, oy = from.y - cy, oz = from.z - cz;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  if (c <= 0) return null;
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const a = dx * dx + dy * dy + dz * dz;
  if (a < 1e-12) return null;
  const b = 2 * (ox * dx + oy * dy + oz * dz);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t < 0 || t > 1 ? null : t;
}

// Earliest of the canopy shell and the (once ignited, exposed) emitter. Both are
// real targets: the emitter rises above the shell and stays reachable.
function domeEntry(dome, from, to, radius, out) {
  const tShell = sphereEntry(dome.pos.x, dome.pos.y, dome.pos.z, Math.max(0.01, dome.radius + radius), from, to);
  const tField = dome.ignited
    ? sphereEntry(dome.pos.x, dome.pos.y + dome.emitterY, dome.pos.z, raw.fieldCollisionRadius + radius, from, to)
    : null;
  if (tShell === null && tField === null) return null;
  const t = tField === null ? tShell : tShell === null ? tField : Math.min(tShell, tField);
  out.dome = dome; out.distance = t;
  out.point.set(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, from.z + (to.z - from.z) * t);
  out.normal.set(out.point.x - dome.pos.x, out.point.y - dome.pos.y, out.point.z - dome.pos.z).normalize();
  out.target = tField !== null && (tShell === null || tField <= tShell) ? 'field' : 'canopy';
  return out;
}

// Earliest first-entry across every enemy dome. The module answers one round at
// a time; it never walks the native round list.
function probeRounds(from, to, radius, team) {
  if (!domes.length) return null;
  let found = false;
  for (const dome of domes) {
    if (dome.dead || dome.team === team) continue;
    const hit = domeEntry(dome, from, to, radius, probeRecord);
    if (!hit) continue;
    if (!found || hit.distance < bestRecord.distance) {
      bestRecord.dome = hit.dome; bestRecord.distance = hit.distance; bestRecord.target = hit.target;
      bestRecord.point.copy(hit.point); bestRecord.normal.copy(hit.normal);
      found = true;
    }
  }
  return found ? bestRecord : null;
}

function onBarrierHit(p, hit) {
  p.pos.copy(hit.point);                          // consumed at the dome surface
  damageDome(hit.dome, hit.target, (p.damage || 0) * tuning.rawPerDamageUnit);
  api.G.fx?.burst?.(hit.point, hit.normal, hit.dome.color, { count: 6, speed: 3, size: 0.07 });
  api.emit?.('weapon:impact', { pos: hit.point.clone(), normal: hit.normal.clone(),
    team: hit.dome.team, kind: 'shot', radius: hit.dome.radius * 0.5 });
}

// Native chronology hook, called by Projectiles.update's own loop.
export function barrierProjectile(p) {
  if (!p || p.ghost || p.team == null) return false;
  const best = probeRounds(p.prev, p.pos, p.size || 0, p.team);
  if (!best) return false;
  onBarrierHit(p, best);
  return best;
}

// -------------------------------------------------------------------- tick

function tick(dt) {
  if (!domes.length) return;
  for (const dome of [...domes]) {
    if (dome.dead) continue;
    dome.t += dt;
    dome.radius = radiusAt(dome.t);
    const ascend = clamp(dome.t / (raw.ascendFrames / 60), 0, 1);
    dome.emitterY = raw.ascendHeight * hermite2d(raw.ascendCurve, ascend);
    if (!dome.ignited && dome.t + 1e-10 >= raw.ignitionFrames / 60) {
      dome.ignited = true;
      if (tuning.paintAtIgnition) {
        const area = api.G.paint?.splat?.(dome.pos.clone().setY(dome.pos.y + raw.paintRadius * 0.35),
          raw.paintRadius, dome.team, { seed: Math.random() }) || 0;
        dome.owner.addTurfNoSpecial?.(area);
      }
      api.emit?.('kit:bubbler:ignite', { owner: dome.owner, team: dome.team, pos: dome.pos.clone() });
    }
    if (dome.ignited) {
      const interval = tuning.timeDamageIntervalSeconds;
      dome.burnAccum += dt;
      while (dome.burnAccum + 1e-10 >= interval && !dome.dead) {
        dome.burnAccum -= interval;
        damageDome(dome, 'canopy', raw.timeDamage);
      }
      if (tuning.overlapFieldDamage && !dome.dead) {
        const tickSeconds = raw.overlapFieldDamageInterval / 60;
        dome.overlapAccum += dt;
        while (dome.overlapAccum + 1e-10 >= tickSeconds && !dome.dead) {
          dome.overlapAccum -= tickSeconds;
          overlapDamage(dome);
        }
      }
    }
    syncVisual(dome);
  }
}

function overlapDamage(dome) {
  const actors = api.G.actors;
  if (!actors) return;
  const damage = raw.overlapFieldDamage / tuning.rawPerDamageUnit;
  for (const e of actors) {
    if (!e.alive || e.team === dome.team) continue;
    const dx = e.pos.x - dome.pos.x, dy = e.pos.y + 0.5 - dome.pos.y, dz = e.pos.z - dome.pos.z;
    if (dx * dx + dy * dy + dz * dz <= dome.radius * dome.radius) {
      api.G.projectiles?.applyHit?.(dome.owner, e, damage, 'bubbler');
    }
  }
}

// ------------------------------------------------------------------ install

export function installKitBigBubbler(context, profile) {
  if (context[INSTALL]) throw new Error('INKWAVE Big Bubbler already installed');
  if (!context?.Actor || !context?.Projectiles) throw new Error('Big Bubbler needs the composed Actor and Projectiles');
  api = context;
  raw = { ...BIG_BUBBLER_RAW, ...(profile?.kits?.bigBubbler?.raw || {}) };
  tuning = { ...BIG_BUBBLER_CALIBRATION, ...(profile?.kits?.bigBubbler || {}) };
  for (const dome of [...domes]) { domes.splice(domes.indexOf(dome), 1); releaseVisual(dome); }
  domes = [];
  fallbackActive = true;
  probeRecord = { distance: 0, target: 'canopy', point: new api.THREE.Vector3(), normal: new api.THREE.Vector3() };
  bestRecord = { dome: null, distance: 0, target: 'canopy', point: new api.THREE.Vector3(), normal: new api.THREE.Vector3() };
  predictedPoint = new api.THREE.Vector3();

  const { Actor, Projectiles } = api;
  const startSpecial = Actor.prototype._startSpecial;
  Actor.prototype._startSpecial = function (...args) {
    const result = startSpecial.apply(this, args);
    // The native activation has no mapping for this id; deploy here so the
    // gauge cost, the form change and the audio stay the native ones.
    if (!this.specialActive && this.weapon?.special === BUBBLER_ID) deploy(this);
    return result;
  };
  const reset = Actor.prototype.reset;
  Actor.prototype.reset = function (...args) {
    const value = reset.apply(this, args);
    if (tuning.eraseOnOwnerReset) {
      for (const dome of [...domes]) if (dome.owner === this) removeDome(dome, 'owner-reset');
    }
    return value;
  };

  // The native collision hook this module asks the parent to wire, in
  // Projectiles._step immediately after `p.pos.addScaledVector(p.vel, dt);`:
  //     let dead = this.kitBarrier ? this.kitBarrier(p) : false;
  // It returns the first-entry record (distance/point/normal/target) or false.
  Projectiles.prototype.kitBarrier = function (p) { return barrierProjectile(p); };

  stepOriginal = Projectiles.prototype._step;
  stepWrapper = function (p, dt) {
    if (!fallbackActive) return stepOriginal.call(this, p, dt);
    // Stand-in for the same chronology until that call site exists: test the
    // barrier against the single segment native _step is about to integrate, so
    // the dome still wins over the actor and world tests for that step. It does
    // not re-integrate the round and never walks the round list.
    if (domes.length && !p.ghost && p.team != null) {
      const age = p.age + dt;
      const scale = p.drag ? 1 - p.drag * dt * (age > p.straight ? 1 : 0) : 1;
      predictedPoint.set(
        p.pos.x + p.vel.x * scale * dt,
        p.pos.y + (p.vel.y - (age > p.straight ? p.grav * dt : 0)) * scale * dt,
        p.pos.z + p.vel.z * scale * dt);
      const best = probeRounds(p.pos, predictedPoint, p.size || 0, p.team);
      if (best) { onBarrierHit(p, best); return true; }
    }
    return stepOriginal.call(this, p, dt);
  };
  Projectiles.prototype._step = stepWrapper;

  const update = Projectiles.prototype.update;
  Projectiles.prototype.update = function (dt) {
    tick(dt);                                    // domes advance before rounds test them
    return update.call(this, dt);
  };
  const clear = Projectiles.prototype.clear;
  Projectiles.prototype.clear = function (...args) {
    for (const dome of [...domes]) removeDome(dome, 'match-disposal');
    return clear.apply(this, args);
  };
  Object.defineProperty(context, INSTALL, { value: true, enumerable: false });
  return api;
}

// Called by the parent once the native adapter call site exists, so the
// stand-in wrapper stops double-testing rounds.
export function disableBigBubblerFallback() {
  fallbackActive = false;
  if (api?.Projectiles && stepWrapper && api.Projectiles.prototype._step === stepWrapper && stepOriginal) {
    api.Projectiles.prototype._step = stepOriginal;
  }
}

export function bigBubblerSnapshot() {
  return domes.map(d => ({
    id: d.id, team: d.team, t: d.t, pos: d.pos.toArray(), radius: d.radius,
    emitterY: d.emitterY, hp: d.hp, fieldHp: d.fieldHp, ignited: d.ignited,
  }));
}

export function clearBigBubblers(reason = 'external') {
  for (const dome of [...domes]) removeDome(dome, reason);
}

export const BUBBLER_SPECIAL_ID = BUBBLER_ID;