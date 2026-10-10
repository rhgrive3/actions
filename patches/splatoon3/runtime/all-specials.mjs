// Additional Splatoon 3 special actions for the public INKWAVE runtime.
//
// Reference: Leanny/splat3 11.3.0 tables at 7280ff9cde8bb1c5dcef46c700c326471584d2e6,
// under data/parameter/1130/weapon/WeaponSp{MultiMissile,Jetpack,NiceBall,
// UltraStamp,SuperHook,MicroLaser,Chariot,TripleTornado,Firework,EnergyStand,
// ShockSonar,Pogo,Skewer}.game__GameParameterTable.json. The extracted tables
// establish each action family and several lifetimes, ranges and damage entries;
// the world-unit conversion and incomplete attack curves are explicitly marked
// calibration below. This is playable implementation coverage, not a claim of
// full Nintendo-frame parity. The caller provides the real Actor and Projectiles.
//
// Authority boundaries: ordinary damaging rounds are pushed to the native
// Projectiles list; direct/radius hits use Projectiles.applyHit; all ground ink
// goes through G.paint.splat with owner claims. Special-owned devices tick at the
// Projectiles fixed 60 Hz update and survive owner death where they were deployed.
// Replayed `all:special` events only create FX or update remote presentation.

import { gearCurve } from './gear.mjs';

const INSTALL = Symbol.for('inkwave.s3.all-specials.install.v1');
const FPS = 60, MAX_STAMP_RADIUS = 3.74;
const q2 = n => Math.round(n * 100) / 100;
const q3 = n => Math.round(n * 1000) / 1000;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const SPECIALS = Object.freeze({
  tentaMissiles: { name: 'Tenta Missiles', source: 'WeaponSpMultiMissile', duration: 1.5, radius: 4.25, paintRadius: 3, near: 150, far: 30, status: '11.3.0 table: 150/50/30 at 1.1/2.1/4.25, paint radius 3, launch counts 10/5/4 by target bucket; lock input window is calibrated' },
  inkjet: { name: 'Inkjet', source: 'WeaponSpJetpack', duration: [7.5, 8, 8.5], radius: 5, paintRadius: 3.2, near: 50, far: 30, direct: 120, status: '11.3.0 table: 50/30 at 2.55/5, paint 3.2, 450/480/510F; 120 direct is community-reported, flight tuning calibrated' },
  booyahBomb: { name: 'Booyah Bomb', source: 'WeaponSpNiceBall', duration: 2.4, radius: 12.6, paintRadius: 13.5, near: 0, far: 0, status: '11.3.0 table: 4700 armor; auto charge .002/.006/.01 per frame, self cheer .077, blast radius 12.6, paint radius 13.5, paint span 6F. 3.3 damage/frame is community-reported; blast growth and charge inputs calibrated' },
  ultraStamp: { name: 'Ultra Stamp', source: 'WeaponSpUltraStamp', duration: [7.5, 9.5, 11], radius: 8, paintRadius: 5, near: 40, far: 40, status: '11.3.0 table: swing splash 40 at 4; throw 220/60 at 3.6/8, paint 5, 450/570/660F; 100 contact is community-reported and action hitboxes are calibrated' },
  zipcaster: { name: 'Zipcaster', source: 'WeaponSpSuperHook', duration: 9, radius: 6, paintRadius: 1.4, near: 45, far: 35, status: '11.3.0 table: 540F, hook blast 45/35 at 5.25/6, ink capacity/cost and tick drain; hook world reach and tether movement calibrated' },
  killerWail: { name: 'Killer Wail 5.1', source: 'WeaponSpMicroLaser', duration: [236/60, 276/60, 296/60], radius: 27, paintRadius: 0, near: 3.5, far: 3.5, status: '11.3.0 table: 36F charge, 35 raw every 5F, 180/220/240F laser lifetime, 20F after-wait and dual launch; world conversion/lock geometry calibrated' },
  crabTank: { name: 'Crab Tank', source: 'WeaponSpChariot', duration: [8, 9.5, 11], radius: 4.8, paintRadius: 4.5, near: 30, far: 30, direct: 50, status: '11.3.0 table: 50 cannon direct / 30 at 4.8, 32-to-16 shooter over 9–25F, 500 armor and 480/570/660F; steering calibrated' },
  reefslider: { name: 'Reefslider', source: 'WeaponSpSkewer', duration: 1.533, radius: 14.9, paintRadius: 7.51, near: 220, far: 70, status: '11.3.0 table: Skewer 38F pre-move +54F movement, 220 at9/70 at14.9; 7.51 base paint value from table spec-up row; collision/world scale calibrated' },
  tripleInkstrike: { name: 'Triple Inkstrike', source: 'WeaponSpTripleTornado', duration: 6, radius: 7.7, paintRadius: 7, near: 37.5, far: 37.5, status: '11.3.0 table: 360F, 7.7 damage radius, 7 paint and 50F spread; 37.5 per 5F from public mechanics, marker flight calibrated' },
  superChump: { name: 'Super Chump', source: 'WeaponSpFirework', duration: 10.583, radius: 6, paintRadius: 3.5, near: 70, far: 35, status: '11.3.0 table: 70/35 at 3.6/6, paint 3.5, decoy HP 60, 108F flight, 210F burst and 635F special; count and spread calibrated' },
  krakenRoyale: { name: 'Kraken Royale', source: 'WeaponSpCastle', duration: [8, 9, 10], radius: 2.65, paintRadius: 1.2, near: 60, far: 60, status: '11.3.0 table: 480/540/600F, 35F charge/dash and 60 jump attack; remaining contact/charge values require game comparison' },
  splattercolorScreen: { name: 'Splattercolor Screen', source: 'WeaponSpChimney', duration: 11.333, radius: 15, paintRadius: 0, near: 40, far: 40, status: '11.3.0 table: 60F startup, 560F running, 60F closing; touch 400 raw, mark 120F, saturation 360F; moving-wall scale calibrated' },
  waveBreaker: { name: 'Wave Breaker', source: 'WeaponSpShockSonar', duration: 10.1, radius: [20, 24, 27], paintRadius: 1.15, near: 45, far: 45, status: '11.3.0 table: 45 damage at 90/240/390F, 480 device HP, radii 20/24/27, wave 160/192/216F; wave visibility and painting calibrated' },
});
const IDS = new Set(Object.keys(SPECIALS));
const descriptions = Object.freeze({
  tentaMissiles: { radius: 4.25, paintRadius: 3, damageMax: 150, damageMin: 30, directDamage: 150, splashBands: [[1.1, 150], [2.1, 50], [4.25, 30]] },
  inkjet: { radius: 5, paintRadius: 3.2, damageMax: 50, damageMin: 30, directDamage: 120, splashBands: [[2.55, 50], [5, 30]] },
  // The table omits NiceBall's damage. The community mechanics reference
  // reports 3.3 damage/frame; runtime keeps the distinct damage tick explicit.
  booyahBomb: { radius: 12.6, paintRadius: 13.5, damageMax: 0, damageMin: 0, directDamage: 0, splashBands: [[12.6, 0]] },
  ultraStamp: { radius: 8, paintRadius: 5, damageMax: 220, damageMin: 60, directDamage: 220, splashBands: [[3.6, 220], [8, 60]] },
  zipcaster: { radius: 6, paintRadius: 1.4, damageMax: 45, damageMin: 35, directDamage: 45, splashBands: [[5.25, 45], [6, 35]] },
  killerWail: { radius: 27, paintRadius: 0, damageMax: 3.5, damageMin: 3.5, directDamage: 3.5, splashBands: [[27, 3.5]] },
  crabTank: { radius: 4.8, paintRadius: 4.5, damageMax: 30, damageMin: 30, directDamage: 50, splashBands: [[4.8, 30]] },
  reefslider: { radius: 14.9, paintRadius: 13, damageMax: 220, damageMin: 70, directDamage: 220, splashBands: [[9, 220], [14.9, 70]] },
  tripleInkstrike: { radius: 7.7, paintRadius: 7, damageMax: 37.5, damageMin: 37.5, directDamage: 37.5, splashBands: [[7.7, 37.5]] },
  superChump: { radius: 6, paintRadius: 3.5, damageMax: 70, damageMin: 35, directDamage: 70, splashBands: [[3.6, 70], [6, 35]] },
  krakenRoyale: { radius: 2.65, paintRadius: 1.2, damageMax: 60, damageMin: 60, directDamage: 60, splashBands: [[2.65, 60]] },
  splattercolorScreen: { radius: 15, paintRadius: 0, damageMax: 40, damageMin: 40, directDamage: 40, splashBands: [[15, 40]] },
  waveBreaker: { radius: 27, paintRadius: 1.15, damageMax: 45, damageMin: 45, directDamage: 45, splashBands: [[27, 45]] },
});

const actorStates = new WeakMap();
const runtimes = new WeakMap();
const replaySeen = new WeakMap();
const SEEN_LIMIT = 384;

function vecArray(v) {
  return v && [v.x, v.y, v.z].every(finite) ? [q2(v.x), q2(v.y), q2(v.z)] : null;
}
function normalizedSeed(seed) { return Number.isSafeInteger(seed) && seed >= 0 ? seed >>> 0 : 0; }
function actorLife(actor) { return Math.max(Number(actor?.netLife)||0,Number(actor?.net?.lastLife)||0); }
function seedUnit(seed, salt = 0) {
  let x = (normalizedSeed(seed) ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; x = Math.imul(x, 0x846ca68b); x ^= x >>> 16;
  return q3((x >>> 0) / 0xffffffff);
}
function nextSeed(state) {
  state.seed = (Math.imul(state.seed >>> 0, 1664525) + 1013904223) >>> 0;
  return state.seed;
}
function activationSerial(actor) {
  actor._s3AllSpecialActivation = ((actor._s3AllSpecialActivation || 0) + 1) % 1000000000;
  if (!actor._s3AllSpecialActivation) actor._s3AllSpecialActivation = 1;
  return actor._s3AllSpecialActivation;
}
function emitAction(rt, actor, id, serial, action, pos, target = null, seed = 0, extra = {}) {
  const at = vecArray(pos), to = target ? vecArray(target) : null;
  if (!at) return null;
  const e = { actor, id, activation: serial, action, pos: at, seed: normalizedSeed(seed) };
  if (to) e.target = to;
  for (const [key, value] of Object.entries(extra)) {
    if (finite(value) || typeof value === 'string' && value.length <= 32 || typeof value === 'boolean') e[key] = value;
  }
  rt.api.emit?.('all:special', e);
  return e;
}
function upDirection(THREE) { return new THREE.Vector3(0, 1, 0); }
function inputEdges(actor, state) {
  const it = actor.intent || {};
  const fire = !!it.fire, sub = !!it.sub, jump = !!it.jump, squid = !!it.squid, booyah=!!it.booyah;
  const e = { fire: fire && !state.held.fire, fireUp: !fire && state.held.fire,
    sub: sub && !state.held.sub, subUp: !sub && state.held.sub, jump: jump && !state.held.jump, squid: squid && !state.held.squid,
    booyah:booyah&&!state.held.booyah };
  state.held = { fire, sub, jump, squid, booyah };
  return e;
}
function aimDirection(rt, actor, out) {
  out.copy(actor.aimPoint || actor.pos).sub(actor.pos);
  if (out.lengthSq() < 4 || out.dot(actor.aimDir) < 0) out.copy(actor.aimDir);
  if (out.lengthSq() < 1e-9) out.set(Math.sin(actor.aimYaw || 0), 0, Math.cos(actor.aimYaw || 0));
  return out.normalize();
}
function aimPoint(rt, actor, range = 22, out = rt.v0) {
  const dir = aimDirection(rt, actor, rt.v1);
  const origin = out.set(actor.pos.x, actor.pos.y + 1.05, actor.pos.z);
  let distance = range;
  const target = actor.aimPoint;
  if (target && [target.x,target.y,target.z].every(finite)) {
    const aimDistance = origin.distanceTo(target);
    if (aimDistance >= 2) distance = Math.min(range, aimDistance);
  }
  const hit = rt.hit;
  if (rt.api.G.physics?.raycast) {
    const ray = rt.api.G.physics.raycast(origin, dir, distance, hit, true);
    if (ray?.hit && ray.point && [ray.point.x,ray.point.y,ray.point.z].every(finite)) return out.copy(ray.point);
  }
  return out.addScaledVector(dir, distance);
}
function groundAt(rt, point, out = rt.v2) {
  out.copy(point);
  if (rt.api.G.physics?.raycast) {
    const from = rt.v3.copy(point); from.y += 24;
    const result = rt.api.G.physics.raycast(from, rt.down, 60, rt.hit, true);
    if (result?.hit && result.point && [result.point.x,result.point.y,result.point.z].every(finite)) return out.copy(result.point).addScaledVector(result.normal || rt.up, .08);
  }
  const g = rt.api.G.level?.groundHeight?.(point.x, point.z, point.y + 12);
  if (finite(g)) out.y = g + .08;
  else if (out.y < .08) out.y = .08;
  return out;
}
function projectileDescriptor(id) {
  const spec = descriptions[id];
  if (!spec) return null;
  const bands = spec.splashBands.map(([r,d]) => [r,d]);
  return {
    id, wid: id, kind: id, name: SPECIALS[id].name,
    type: 'blast', splashRadius: spec.radius, burstRadius: spec.radius,
    impactRadius: Math.min(spec.paintRadius ?? spec.radius, MAX_STAMP_RADIUS),
    paintRadius: Math.min(spec.paintRadius ?? spec.radius, MAX_STAMP_RADIUS), splashDamageMax: spec.damageMax,
    splashDamageMin: spec.damageMin, damageMax: spec.damageMax, damageMin: spec.damageMin,
    directDamage: spec.directDamage, splashBands: bands, damageBands: bands,
    status: SPECIALS[id].status,
  };
}
function launch(rt, actor, id, origin, direction, opts = {}) {
  const system = rt.api.G.projectiles;
  if (!system?._new || !system?._push || actor.remote) return null;
  const descriptor = projectileDescriptor(id), p = system._new();
  const dir = direction.clone();
  if (dir.lengthSq() < 1e-9) dir.copy(actor.aimDir);
  dir.normalize();
  const speed = opts.speed || 17;
  Object.assign(p, {
    type: opts.type || 'blast', owner: actor, team: actor.team, age: 0,
    life: opts.life || 1.8, straight: opts.straight ?? .16,
    radius: opts.radius ?? descriptor.paintRadius, damage: opts.damage ?? descriptor.directDamage,
    size: opts.size ?? .22, trail: 0, trailEvery: opts.trailEvery || 0,
    trailRadius: .45, grav: opts.grav ?? 20, drag: opts.drag ?? .24,
    seed: seedUnit(opts.seed ?? nextSeed(actorStates.get(actor) || { seed: 1 }), 1),
    vis: .19, tail0: .55, tailK: .9, wob: .04, wobF: 23, nose: .12, sats: 2,
  });
  p.pos.copy(origin); p.prev.copy(origin); p.start.copy(origin);
  p.vel.copy(dir).multiplyScalar(speed);
  if (opts.arc) p.vel.y += opts.arc;
  p.s3SpecialWeapon = opts.directOnly ? null : descriptor;
  p.s3Weapon = opts.weapon || p.s3SpecialWeapon || { id, kind: 'special', special: id };
  p.s3AllSpecial = id;
  p.s3AllSpecialPaintRadius = opts.paintRadius ?? descriptions[id].paintRadius ?? 0;
  p.s3AllSpecialActivation = actorStates.get(actor)?.serial || 0;
  p.s3AllSpecialSeed = normalizedSeed(opts.seed || 0);
  if (opts.damageReduce) p.s3DamageReduce = { ...opts.damageReduce };
  system._push(p);
  return p;
}
function paintStamp(rt, actor, point, radius, seed) {
  if (actor.remote || !rt.api.G.paint?.splat || !(radius > 0)) return 0;
  const at = rt.v4.copy(point), top = groundAt(rt, point, rt.v5);
  at.copy(top);
  const qRadius = Math.min(MAX_STAMP_RADIUS, radius), n = seedUnit(seed, 0);
  const area = rt.api.G.paint.splat(at, qRadius, actor.team, {
    seed: n, claimOwner: actor, claimMode: 'no-special',
  });
  if (finite(area) && area > 0) actor.addTurfNoSpecial?.(area);
  return finite(area) ? area : 0;
}
function paintDisk(rt, actor, point, radius, seed) {
  if (radius <= MAX_STAMP_RADIUS) return paintStamp(rt, actor, point, radius, seed);
  // Cluster ordinary network-admissible stamps; do not emit one over-limit paint
  // row, which the public replication owner correctly rejects.
  const spacing = 2.82, rowZ = spacing * Math.sqrt(3) / 2, inset = .2;
  let area = 0, index = 0;
  for (let row = -Math.ceil(radius / rowZ); row <= Math.ceil(radius / rowZ); row++) {
    const z = row * rowZ, shift = row & 1 ? spacing * .5 : 0;
    for (let col = -Math.ceil(radius / spacing); col <= Math.ceil(radius / spacing); col++) {
      const x = col * spacing + shift;
      if (Math.hypot(x,z) > radius - inset) continue;
      const at = rt.v4.set(q2(point.x+x), q2(point.y), q2(point.z+z));
      const s = seedUnit(seed, index++);
      const got = rt.api.G.paint.splat(at, MAX_STAMP_RADIUS, actor.team,
        { seed: s, claimOwner: actor, claimMode: 'no-special' });
      if (finite(got) && got > 0) area += got;
    }
  }
  if (area > 0) actor.addTurfNoSpecial?.(area);
  return area;
}
function damageRadius(rt, actor, id, center, near, far, radius, source = id, once = null) {
  const G = rt.api.G, applied = [];
  if (actor.remote || !G.projectiles?.applyHit) return applied;
  for (const victim of G.actors || []) {
    if (!victim?.alive || victim.team === actor.team || victim === actor || once?.has(victim)) continue;
    const dx = victim.pos.x - center.x, dy = victim.pos.y + .75 - center.y, dz = victim.pos.z - center.z;
    const d = Math.hypot(dx,dy,dz);
    if (d > radius) continue;
    if (G.physics?.los && !G.physics.los(center, rt.v6.set(victim.pos.x, victim.pos.y+.75, victim.pos.z))) continue;
    const t = clamp(d / Math.max(radius, 1e-6), 0, 1);
    const damage = d <= radius * .45 ? near : near + (far - near) * t;
    if (damage > 0) {
      G.projectiles.applyHit(actor, victim, damage, source);
      once?.add(victim); applied.push(victim);
    }
  }
  return applied;
}
function damageBandRadius(rt, actor, center, bands, radius, source, once = null, height = 2.8) {
  const G = rt.api.G, applied = [];
  if (actor.remote || !G.projectiles?.applyHit) return applied;
  for (const victim of G.actors || []) {
    if (!victim?.alive || victim.team === actor.team || victim === actor || once?.has(victim)) continue;
    const point = rt.v6.set(victim.pos.x, victim.pos.y + .75, victim.pos.z);
    const d = point.distanceTo(center);
    if (d > radius || Math.abs(point.y - center.y) > height) continue;
    if (G.physics?.los && !G.physics.los(center, point)) continue;
    let amount = bands.at(-1)?.[1] ?? 0;
    if (d <= bands[0][0]) amount = bands[0][1];
    else for (let i = 1; i < bands.length; i++) if (d <= bands[i][0]) {
      const [r0, d0] = bands[i - 1], [r1, d1] = bands[i];
      amount = r1 === r0 ? d1 : d0 + (d1 - d0) * ((d - r0) / (r1 - r0));
      break;
    }
    if (amount > 0) { G.projectiles.applyHit(actor, victim, amount, source); once?.add(victim); applied.push(victim); }
  }
  return applied;
}
function moveActor(rt, actor, dt, state, { speed = null, squid = true, jump = true, flight = false } = {}) {
  const P = rt.api.PLAYER, move = actor.intent?.move;
  const useSquid = squid && !!actor.intent?.squid;
  actor.form = useSquid ? 'squid' : 'kid';
  const enemyInk = actor.grounded && actor.groundTeam === 2;
  if (speed == null) actor._horizontal?.(dt, useSquid, enemyInk);
  else {
    const cap = speed * (move ? Math.min(1, Math.hypot(move.x,move.z)) : 0);
    const yaw = Math.atan2(move?.x || 0, move?.z || 0);
    if (cap > .01) { actor.vel.x += (Math.sin(yaw)*cap-actor.vel.x) * (1-Math.exp(-8*dt)); actor.vel.z += (Math.cos(yaw)*cap-actor.vel.z) * (1-Math.exp(-8*dt)); }
    else { actor.vel.x *= Math.exp(-5*dt); actor.vel.z *= Math.exp(-5*dt); }
  }
  let jumped = false;
  if (jump && actor.intent?.jump && actor.grounded && !state._jumpHeld) {
    actor.vel.y = useSquid ? P.swimJumpVel : P.jumpVel; actor.grounded = false;
    actor.character?.trigger?.('jump'); jumped = true;
    rt.api.emit?.('actor:jump', { actor, surface: actor.groundTeam, swim: useSquid });
  }
  if (flight) {
    const py = actor.pos.y;
    actor.pos.addScaledVector(actor.vel, dt);
    actor.grounded = false;
    actor._resolve?.(false, py, false);
  } else actor._integrate?.(dt, useSquid, jumped);
  state._jumpHeld = !!actor.intent?.jump;
}
function dampForSpecial(actor, dt, gravity = 25) {
  actor.vel.x *= Math.exp(-6*dt); actor.vel.z *= Math.exp(-6*dt);
  const py = actor.pos.y;
  if (!actor.grounded) actor.vel.y = Math.max(-36, actor.vel.y - gravity * dt);
  else actor.vel.y = 0;
  actor.pos.addScaledVector(actor.vel,dt);
  actor._resolve?.(false,py,actor.grounded);
}
function colorOf(rt, owner) { return owner?.color || rt.api.G.teamColors?.[owner?.team] || 0xffffff; }
function fxBurst(rt, owner, point, radius, action = 'hit') {
  const G = rt.api.G, col = colorOf(rt, owner);
  if (action === 'impact' || action === 'explode') G.fx?.explosion?.(point, col, radius);
  G.fx?.ring?.(point, rt.up, col, { radius, life: .55 });
  G.fx?.burst?.(point, rt.up, col, { count: action === 'impact' ? 16 : 8, speed: 4, size: .09, paint: false });
}
function addWorld(rt, data) {
  const system = rt.system;
  (system._s3AllSpecialObjects ||= []).push(data);
  return data;
}
function disposeMesh(rt, object) {
  const mesh = object?.mesh;
  if (!mesh) return;
  rt.api.G.scene?.remove?.(mesh);
  mesh.traverse?.(node => {
    node.geometry?.dispose?.();
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    mats.forEach(mat => mat?.dispose?.());
  });
  object.mesh = null;
}
function worldMesh(rt, owner, kind, center, scale = [1,1,1]) {
  const { THREE, G } = rt.api;
  if (!G.scene?.add || !THREE?.Mesh) return null;
  let geometry, material;
  if (kind === 'screen') {
    geometry = new THREE.PlaneGeometry(8, 4.5);
    material = new THREE.MeshBasicMaterial({ color: colorOf(rt,owner), transparent:true, opacity:.34, side:THREE.DoubleSide, depthWrite:false });
  } else if (kind === 'wave') {
    geometry = new THREE.CylinderGeometry(.38,.38,1.15,10);
    material = new THREE.MeshStandardMaterial({ color:colorOf(rt,owner), emissive:colorOf(rt,owner), emissiveIntensity:.22, roughness:.42 });
  } else {
    geometry = new THREE.SphereGeometry(kind === 'decoy' ? .42 : .7, 10, 8);
    material = new THREE.MeshStandardMaterial({ color:colorOf(rt,owner), emissive:colorOf(rt,owner), emissiveIntensity:.22, roughness:.55,
      transparent:kind === 'strike'||kind === 'crabBall', opacity:kind === 'strike'?.42:kind === 'crabBall'?.72:1 });
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(center); mesh.scale.set(...scale);
  if (kind === 'screen') mesh.position.y += 2.2;
  G.scene.add(mesh);
  return mesh;
}
function emitObject(rt, object, action) {
  if (object.owner?.remote) return null;
  object.eventSerial=(object.eventSerial||0)+1;
  const target = object.kind === 'screen' ? object.pos.clone().add(object.normal) : object.target || null;
  return emitAction(rt, object.owner, object.id, object.activation, action,
    object.pos, target, object.seed, { object: object.serial || 0, index: object.index || 0,
      hp: object.hp || 0, radius: q2(object.maxRadius || 0), duration: q3(object.dur || 0), kind: object.kind,
      width: object.width || 0, height: object.height || 0, waveFrame: object.maxWaveFrame || 0,
      startDelay: object.startDelay || 0, expand: object.expand || 0,
      pulse: object.pulse || 0, tick: object.eventSerial });
}
function removeWorld(rt, object, reason = 'expire') {
  const objects = rt.system._s3AllSpecialObjects || [], at = objects.indexOf(object);
  if (at < 0) return false;
  objects.splice(at,1); disposeMesh(rt,object); object.dead = true;
  if (!object.owner?.remote) emitObject(rt,object,reason);
  return true;
}
function objectHitProposal(rt, p, object) {
  const shooter = p?.owner;
  if (!shooter || shooter.remote || p.ghost) return null;
  const event = {
    actor: shooter, id: object.id, activation: object.activation, action:'objectHit',
    pos: vecArray(object.pos), target: vecArray(p.pos), seed: normalizedSeed(object.seed),
    object: object.serial || 0, index: object.index || 0,
    ownerNid: Number.isInteger(object.owner?.nid) ? object.owner.nid : -1,
    ownerLife: actorLife(object.owner),
    damage: Math.max(0, Math.min(10000, Number(p.damage) || 0)),
    tick: (object.proposalSerial=((object.proposalSerial||0)+1)),
  };
  if (event.pos && event.target) rt.api.emit?.('all:special', event);
  return event;
}
function sphereEntry(rt, start, end, center, radius) {
  const d = rt.v7.subVectors(end,start), m = rt.v8.subVectors(start,center), a=d.lengthSq();
  if (!(a>1e-12)) return null;
  const b=m.dot(d), c=m.lengthSq()-radius*radius;
  if (c<=0) return { t:0, point:start.clone() };
  const disc=b*b-a*c; if(disc<0)return null;
  const t=(-b-Math.sqrt(disc))/a; if(t<0||t>1)return null;
  return {t,point:start.clone().addScaledVector(d,t)};
}
function breakerCandidate(rt, p, start, end, object) {
  if(object.dead||object.kind!=='wave'||object.owner?.team===p?.team)return null;
  const hit=sphereEntry(rt,start,end,object.pos,.72);if(!hit)return null;
  const length=start.distanceTo(end), point=hit.point;
  return {distance:length*hit.t,point,normal:rt.v11.subVectors(point,object.pos).normalize().clone(),kind:'wave-breaker',onHit:()=>{
    if(p?.ghost)return false;
    if(object.owner?.remote){objectHitProposal(rt,p,object);return true;}
    object.hp=Math.max(0,object.hp-Math.max(1,Number(p?.damage)||1));
    if(object.hp<=0)removeWorld(rt,object,'destroy');else emitObject(rt,object,'hit');return true;
  }};
}
function chumpCandidate(rt, p, start, end, object) {
  if(object.dead||object.kind!=='decoy'||object.owner?.team===p?.team)return null;
  const hit=sphereEntry(rt,start,end,object.pos,.48);if(!hit)return null;
  const length=start.distanceTo(end),point=hit.point;
  return {distance:length*hit.t,point,normal:rt.v11.subVectors(point,object.pos).normalize().clone(),kind:'super-chump',onHit:()=>{
    if(p?.ghost)return false;
    if(object.owner?.remote){objectHitProposal(rt,p,object);return true;}
    object.hp=Math.max(0,object.hp-Math.max(1,Number(p?.damage)||1));
    if(object.hp<=0)removeWorld(rt,object,'destroy');else emitObject(rt,object,'hit');return true;
  }};
}
function candidate(rt, p, start, end) {
  rt.system ||= rt.api.G.projectiles || null;
  if(!rt.system)return null;
  let best=null;
  for(const object of rt.system._s3AllSpecialObjects||[]) {
    const c=breakerCandidate(rt,p,start,end,object)||chumpCandidate(rt,p,start,end,object);
    if(c&&(!best||c.distance<best.distance))best=c;
  }
  for(const owner of rt.api.G.actors||[]) {
    const state=actorStates.get(owner);
    if(!state||state.id!=='ultraStamp'||state.phase==='throw'||!owner?.alive||owner.team===p?.team)continue;
    if(state.expiresAt&&rt.api.G.time>state.expiresAt){actorStates.delete(owner);continue;}
    const d=stampGuardCandidate(rt,p,start,end,owner,state);
    if(d&&(!best||d.distance<best.distance))best=d;
  }
  return best;
}
function stampGuardCandidate(rt,p,start,end,owner,state) {
  if(!start||!end||p?.ghost)return null;
  const direction=aimDirection(rt,owner,rt.v0);direction.y=0;
  if(direction.lengthSq()<1e-8)return null;
  direction.normalize();
  const center=rt.v1.copy(owner.pos).addScaledVector(direction,1.15);center.y+=.78;
  const from=rt.v2.copy(start).sub(center),to=rt.v3.copy(end).sub(center);
  const d0=from.dot(direction),d1=to.dot(direction);
  if(d0<0||d1>0||d0-d1<1e-8)return null;
  const t=clamp(d0/(d0-d1),0,1),point=rt.v4.copy(start).lerp(end,t);
  const tangent=rt.v5.set(direction.z,0,-direction.x),offset=point.clone().sub(center);
  if(Math.abs(offset.dot(tangent))>1.35||Math.abs(offset.y)>.95)return null;
  const length=start.distanceTo(end),at=point.clone();
  return {distance:length*t,point:at,normal:direction.clone(),kind:'ultra-stamp-guard',onHit:()=>{
    if(p?.ghost)return false;
    if(!owner.remote)emitAction(rt,owner,'ultraStamp',state.serial,'block',at,null,nextSeed(state),{damage:Math.max(0,Number(p?.damage)||0)});
    rt.api.G.fx?.burst?.(at,direction,colorOf(rt,owner),{count:6,speed:2,size:.07,paint:false});
    return true;
  }};
}
function hitBeam(rt, actor, state, origin, direction, length, damage) {
  const system=rt.system;
  const defense=system.kitBeamDefense?.(actor,origin,direction,length,damage);
  const end=rt.v12.copy(origin).addScaledVector(direction,defense?Math.min(length,defense.distance):length);
  if(defense&&typeof defense.onHit==='function')defense.onHit();
  const touched=new Set();
  for(const victim of rt.api.G.actors||[]) {
    if(!victim.alive||victim.team===actor.team||touched.has(victim))continue;
    const base=rt.v13.set(victim.pos.x,victim.pos.y+.7,victim.pos.z);
    // closest point on the finite beam segment; a cylinder radius of 0.85 is
    // a world-scale calibration of the sourced continuous laser capsule.
    const d=rt.v14.subVectors(end,origin), dd=d.lengthSq();
    const t=dd>1e-9?clamp(base.clone().sub(origin).dot(d)/dd,0,1):0;
    const near=rt.v15.copy(origin).addScaledVector(d,t);
    if(base.distanceTo(near)>.85)continue;
    rt.api.G.projectiles.applyHit(actor,victim,damage,'killerWail');touched.add(victim);
  }
  rt.api.G.fx?.ring?.(origin, direction, colorOf(rt,actor), {radius:Math.min(4,length),life:.22});
  return end;
}
function fireWailTick(rt, actor, state) {
  const targets=selectTargets(rt,actor,2,10),fallback=aimDirection(rt,actor,rt.v0);
  for(let i=0;i<2;i++){
    const side=i===0?-.65:.65,origin=rt.v1.set(actor.pos.x+side,actor.pos.y+1.7,actor.pos.z-.6).clone();
    const target=targets[i];let dir;
    if(target){dir=rt.v2.copy(target.pos).add(rt.v3.set(0,.75,0)).sub(origin).normalize();}
    else {dir=rt.v2.copy(fallback);dir.x+=side*.025;dir.normalize();}
    const end=hitBeam(rt,actor,state,origin,dir,27,3.5);
    emitAction(rt,actor,'killerWail',state.serial,'laser',origin,end,nextSeed(state),{index:i,tick:state.wailTick||0});
  }
  state.wailTick=(state.wailTick||0)+1;
}
function deployObject(rt, actor, id, kind, pos, state, extra={}) {
  const spec=SPECIALS[id], object={
    kind,id,owner:actor,team:actor.team,activation:state.serial,serial:(state.objectSerial=((state.objectSerial||0)+1)),
    pos:pos.clone(),age:0,dur:extra.dur??spec.duration,maxRadius:extra.maxRadius??spec.radius,
    damage:extra.damage??spec.near,seed:normalizedSeed(extra.seed??nextSeed(state)),dead:false,
    hp:extra.hp||0,maxHp:extra.hp||0,phase:extra.phase||'armed',index:extra.index||0,
    pulse:0,nextPulse:extra.nextPulse||.75,once:new Set(),target:extra.target?.clone?.()||null,
    width:extra.width||8,height:extra.height||4.5,normal:new rt.api.THREE.Vector3(),tangent:new rt.api.THREE.Vector3(),
    direction:extra.direction?.clone?.()||new rt.api.THREE.Vector3(),moveSpeed:extra.moveSpeed||0,
    waves:[],lastMoveEvent:0,previous:new WeakMap(),lastCross:new WeakMap(),remote:!!actor.remote,
    startDelay:extra.startDelay||0,expand:extra.expand||0,
  };
  if(kind==='screen'){
    const yaw=finite(extra.yaw)?extra.yaw:actor.aimYaw||actor.yaw||0;
    object.normal.set(Math.sin(yaw),0,Math.cos(yaw));object.tangent.set(Math.cos(yaw),0,-Math.sin(yaw));
  }
  object.mesh=worldMesh(rt,actor,kind,pos,extra.scale||[1,1,1]);
  addWorld(rt,object);emitObject(rt,object,'deploy');
  return object;
}
function doAreaImpact(rt, actor, id, state, center, seed=nextSeed(state), radius=null, damage=null, paint=true) {
  const spec=SPECIALS[id], d=descriptions[id], r=radius||d.radius;
  const c=groundAt(rt,center,rt.v0).clone();
  if(paint)paintDisk(rt,actor,c,Math.min(r, id==='booyahBomb'?3.7:r),seed);
  damageRadius(rt,actor,id,c,damage??d.damageMax,d.damageMin,r,id);
  fxBurst(rt,actor,c,r,'impact');
  emitAction(rt,actor,id,state.serial,'impact',c,null,seed,{radius:r,damage:damage??d.damageMax});
}
function selectTargets(rt, actor, max=4, range=32) {
  const dir=aimDirection(rt,actor,rt.v0), out=[];
  for(const target of rt.api.G.actors||[]) {
    if(!target.alive||target.team===actor.team||target===actor)continue;
    const offset=rt.v1.copy(target.pos).sub(actor.pos);const d=offset.length();
    if(d>range||d<.1)continue;
    const dot=offset.normalize().dot(dir);if(dot<.25)continue;
    out.push({actor:target,d,dot});
  }
  out.sort((a,b)=>b.dot-a.dot||a.d-b.d);
  return out.slice(0,max).map(x=>x.actor);
}
function launchMissiles(rt, actor, state) {
  const targets=selectTargets(rt,actor,3,35), origin=rt.v0.set(actor.pos.x,actor.pos.y+2.4,actor.pos.z).clone();
  if(!targets.length)targets.push(null);
  const counts=targets.length===1?[10]:targets.length===2?[5,5]:targets.map(()=>4);
  let index=0;
  for(const target of targets) {
    const dest=target?groundAt(rt,target.pos,rt.v2).clone():groundAt(rt,aimPoint(rt,actor,28,rt.v2),rt.v3).clone();
    const count=counts[targets.indexOf(target)]||4;
    for(let i=0;i<count&&index<12;i++,index++) {
      const spread=(i-(count-1)/2)*.055;
      const dir=rt.v4.copy(dest).sub(origin);dir.x+=Math.sin(spread);dir.normalize();
      const p=launch(rt,actor,'tentaMissiles',origin,dir,{speed:6,grav:11,drag:.08,life:2.8,arc:3.5,seed:nextSeed(state),size:.24,paintRadius:3});
      if(p){p.s3TentaTarget=dest.clone();p.s3TentaAge=0;p.s3TentaDescending=false;p.s3TentaDirection=dir.clone();}
    }
    emitAction(rt,actor,'tentaMissiles',state.serial,'target',origin,dest,nextSeed(state),{index:index-1,count});
  }
  emitAction(rt,actor,'tentaMissiles',state.serial,'launch',origin,null,nextSeed(state),{count:index});
  endSpecial(rt,actor,'launched');
}
function launchInkjet(rt,actor,state) {
  const origin=rt.v0.set(actor.pos.x,actor.pos.y+1.05,actor.pos.z).clone(),dir=aimDirection(rt,actor,rt.v1);
  launch(rt,actor,'inkjet',origin,dir,{speed:21,grav:13,drag:.06,life:1.55,arc:.3,seed:nextSeed(state),size:.24,paintRadius:3.2});
  emitAction(rt,actor,'inkjet',state.serial,'shot',origin,rt.v2.copy(origin).addScaledVector(dir,20),nextSeed(state));
}
function throwBooyah(rt,actor,state,charge) {
  const origin=rt.v0.set(actor.pos.x,actor.pos.y+1.2,actor.pos.z).clone(),dir=aimDirection(rt,actor,rt.v1);
  launch(rt,actor,'booyahBomb',origin,dir,{speed:13+charge*4,grav:19,drag:.16,life:2.1,arc:4.2,
    radius:3.7,damage:0,paintRadius:13.5,seed:nextSeed(state),size:.48});
  emitAction(rt,actor,'booyahBomb',state.serial,'throw',origin,rt.v2.copy(origin).addScaledVector(dir,12),nextSeed(state),{charge:q3(charge)});
  endSpecial(rt,actor,'thrown');
}
function throwStamp(rt,actor,state) {
  const origin=rt.v0.set(actor.pos.x,actor.pos.y+1.1,actor.pos.z).clone(),dir=aimDirection(rt,actor,rt.v1);
  launch(rt,actor,'ultraStamp',origin,dir,{speed:22,grav:17,drag:.13,life:1.8,arc:1.5,seed:nextSeed(state),size:.4,damage:220,paintRadius:5});
  emitAction(rt,actor,'ultraStamp',state.serial,'throw',origin,rt.v2.copy(origin).addScaledVector(dir,18),nextSeed(state));
  endSpecial(rt,actor,'thrown');
}
function zipTo(rt,actor,state,target) {
  state.zipStart=actor.pos.clone();state.zipTarget=target.clone();state.phase='zip';state.zipT=0;
  actor.character?.trigger?.('special_zip');
  emitAction(rt,actor,'zipcaster',state.serial,'zip',actor.pos,target,nextSeed(state));
}
function crabBomb(rt,actor,state) {
  const origin=rt.v0.set(actor.pos.x,actor.pos.y+1.0,actor.pos.z).clone(),dir=aimDirection(rt,actor,rt.v1);
  launch(rt,actor,'crabTank',origin,dir,{speed:14,grav:23,drag:.18,life:1.4,arc:2.5,seed:nextSeed(state),size:.2,damage:50,paintRadius:4.5});
  emitAction(rt,actor,'crabTank',state.serial,'cannon',origin,rt.v2.copy(origin).addScaledVector(dir,10),nextSeed(state));
}
function reefImpact(rt,actor,state,center) {
  if(state.impacted)return;state.impacted=true;
  const seed=nextSeed(state),point=groundAt(rt,center,rt.v1).clone();
  paintDisk(rt,actor,point,SPECIALS.reefslider.paintRadius,seed);
  damageBandRadius(rt,actor,center,descriptions.reefslider.splashBands,14.9,'reefslider',null,5);
  fxBurst(rt,actor,point,14.9,'impact');
  emitAction(rt,actor,'reefslider',state.serial,'impact',point,null,seed,{radius:14.9});
  actor.invuln=Math.max(actor.invuln,.35);endSpecial(rt,actor,'impact');
}
function deployInkstrike(rt,actor,state,index) {
  const target=aimPoint(rt,actor,28,rt.v0).clone();groundAt(rt,target,rt.v1);target.copy(rt.v1);
  const launchAt=rt.v2.set(actor.pos.x,actor.pos.y+1.1,actor.pos.z).clone();
  const marker=deployObject(rt,actor,'tripleInkstrike','marker',launchAt,state,{dur:1.1,maxRadius:7.7,damage:37.5,seed:nextSeed(state),index,target,scale:[.36,.36,.36]});
  marker.phase='flight';marker.origin=launchAt.clone();marker.flight=1.1;marker.age=0;
  emitAction(rt,actor,'tripleInkstrike',state.serial,'marker',launchAt,target,marker.seed,{index});
}
function throwChumps(rt,actor,state) {
  const target=groundAt(rt,aimPoint(rt,actor,26,rt.v0),rt.v1).clone(), origin=rt.v2.set(actor.pos.x,actor.pos.y+1.2,actor.pos.z).clone();
  const offset=rt.v3.copy(target).sub(actor.pos),distance=offset.length();
  if(distance<18)target.copy(actor.pos).addScaledVector(offset.normalize(),18);
  else if(distance>35)target.copy(actor.pos).addScaledVector(offset.normalize(),35);
  groundAt(rt,target,target);
  const count=8;
  for(let i=0;i<count;i++) {
    const angle=(i/count)*Math.PI*2+seedUnit(state.seed,17)*Math.PI*2, radius=6.5;
    const pos=target.clone();pos.x+=Math.cos(angle)*radius;pos.z+=Math.sin(angle)*radius;
  const obj=deployObject(rt,actor,'superChump','decoy',origin,state,{dur:(108+210)/FPS,maxRadius:6,damage:70,hp:60,seed:nextSeed(state),index:i,target:pos,scale:[.72,.72,.72]});
    obj.phase='flight';obj.armAt=1.8;obj.flight=1.8;obj.origin=origin.clone();
    emitAction(rt,actor,'superChump',state.serial,'balloon',origin,pos,obj.seed,{index:i});
  }
  endSpecial(rt,actor,'deployed');
}
function deployScreen(rt,actor,state) {
  const aim=aimPoint(rt,actor,28,rt.v0).clone(),pos=actor.pos.clone().addScaledVector(rt.v1.copy(aim).sub(actor.pos).setY(0).normalize(),2.5);
  pos.y=Math.max(.08,actor.pos.y);
  const direction=rt.v2.copy(aim).sub(pos).setY(0).normalize();
  const object=deployObject(rt,actor,'splattercolorScreen','screen',pos,state,{dur:680/FPS,maxRadius:15,damage:40,width:15,height:9,yaw:Math.atan2(direction.x,direction.z),direction,moveSpeed:3.18,seed:nextSeed(state),scale:[15/8,2,1]});
  object.target=pos.clone().add(object.normal);
  emitAction(rt,actor,'splattercolorScreen',state.serial,'screen',pos,object.target,object.seed,{object:object.serial});
  endSpecial(rt,actor,'deployed');
}
function deployWave(rt,actor,state) {
  const pos=groundAt(rt,aimPoint(rt,actor,16,rt.v0),rt.v1).clone(),ap=actor.s3?.abilityPoints?.specialPower||0;
  const maxRadius=gearCurve(ap,20,24,27),maxFrame=gearCurve(ap,160,192,216)/FPS;
  const object=deployObject(rt,actor,'waveBreaker','wave',pos,state,{dur:6.5+maxFrame,maxRadius,damage:45,hp:480,seed:nextSeed(state),nextPulse:1.5});
  object.hp=480;object.maxHp=480;object.pulse=0;object.maxWaveFrame=maxFrame;object.pulseFrames=[90/FPS,240/FPS,390/FPS];object.waves=[];
  object.direction=rt.v2.copy(pos).sub(actor.pos).setY(0).normalize();
  emitAction(rt,actor,'waveBreaker',state.serial,'device',pos,null,object.seed,{object:object.serial});
  endSpecial(rt,actor,'deployed');
}
function endSpecial(rt,actor,reason='duration') {
  const state=actorStates.get(actor);
  if(!state)return;
  const pos=actor.pos.clone();
  emitAction(rt,actor,state.id,state.serial,'end',pos,null,nextSeed(state),{reason});
  if(state.ballMesh){disposeMesh(rt,{mesh:state.ballMesh});state.ballMesh=null;}
  if(actor.specialActive?.id===state.id)actor.specialActive=null;
  if(actor._s3AllSpecialState===state)actor._s3AllSpecialState=null;
  actorStates.delete(actor);
  actor.form='kid';
  return state;
}
function returnToOrigin(rt,actor,state,reason='duration') {
  if(!state||!actor?.alive)return endSpecial(rt,actor,reason);
  const target=state.origin.clone();
  emitAction(rt,actor,state.id,state.serial,'return',actor.pos,target,nextSeed(state));
  endSpecial(rt,actor,reason);
  // Use the public Actor super-jump path so the return shares its charge,
  // flight, landing and network events with ordinary teammate jumps.
  if(actor.superJump?.(target))return true;
  // A match transition can reject a new jump just as the special clock ends.
  // Preserve the native flight/landing implementation for that final frame.
  const from=actor.pos.clone(),distance=from.distanceTo(target);
  actor.superJumpState={phase:'flight',t:0,target,from,to:target.clone(),marker:0,dur:1.15+Math.min(.6,distance/80)};
  actor.form='squid';actor._setClimb?.(false);actor.weaponRunner?.reset?.();
  actor.invuln=Math.max(actor.invuln||0,actor.superJumpState.dur+.2);
  return true;
}
function crabBall(rt,actor,state,active) {
  const G=rt.api.G;
  state.ballMode=!!active;
  if(actor.specialActive){actor.specialActive.pose=active?'ball':state.cannonT>state.t?'cannon':'shooter';actor.specialActive.cannon=state.cannonT>state.t;}
  if(!active){if(state.ballMesh){disposeMesh(rt,{mesh:state.ballMesh});state.ballMesh=null;}return;}
  if(!state.ballMesh&&G.scene?.add){
    state.ballMesh=worldMesh(rt,actor,'crabBall',actor.pos,[1.28,1.05,1.28]);
    if(state.ballMesh)state.ballMesh.renderOrder=2;
  }
  if(state.ballMesh){state.ballMesh.position.copy(actor.pos);state.ballMesh.position.y+=.78;
    state.ballMesh.rotation.y=actor.yaw||0;state.ballMesh.rotation.z=Math.sin(state.t*11)*.04;}
}
function stampSwing(rt,actor,state,jump=false) {
  const dir=aimDirection(rt,actor,rt.v0),center=rt.v1.copy(actor.pos).addScaledVector(dir,jump?1.5:1.25);
  center.y+=jump?1.45:.65;
  const direct=new Set();
  for(const victim of rt.api.G.actors||[]){
    if(!victim?.alive||victim.team===actor.team||victim===actor)continue;
    const dx=victim.pos.x-center.x,dy=victim.pos.y+.7-center.y,dz=victim.pos.z-center.z;
    if(Math.hypot(dx,dz)<=1.05&&Math.abs(dy)<=(jump?2.3:1.8)){
      rt.api.G.projectiles.applyHit(actor,victim,100,'ultraStamp');direct.add(victim);
    }
  }
  damageBandRadius(rt,actor,center,[[4,40]],4,'ultraStamp',direct,jump?3.5:3);
  paintStamp(rt,actor,groundAt(rt,center,rt.v2),.55,nextSeed(state));
  fxBurst(rt,actor,center,4,'hit');
  emitAction(rt,actor,'ultraStamp',state.serial,jump?'jumpSwing':'swing',actor.pos,center,nextSeed(state),{index:state.swings++});
}
function addBooyahCall(rt,owner,state,cheerer,{network=false,callId=null}={}) {
  // Every rising-edge call is a contribution. A player may call again during
  // the same activation; the five-call source cap bounds the total charge.
  if(!Number.isSafeInteger(callId)){
    cheerer._s3BooyahCheerCounter=((cheerer._s3BooyahCheerCounter||0)+1)>>>0;
    if(!cheerer._s3BooyahCheerCounter)cheerer._s3BooyahCheerCounter=1;
    callId=cheerer._s3BooyahCheerCounter;
  }
  state.cheerCalls ||= new WeakMap();
  let calls=state.cheerCalls.get(cheerer);
  if(!calls){calls={seen:new Set(),count:0};state.cheerCalls.set(cheerer,calls);}
  if(calls.seen.has(callId))return false;
  calls.seen.add(callId);
  const i=calls.count,steps=[.088,.044,.022,.011,.011];
  calls.count=i+1;
  if(i<steps.length)state.charge=Math.min(1,state.charge+steps[i]);
  if(network&&Number.isInteger(owner.nid)&&Number.isInteger(actorLife(owner))&&!cheerer.remote){
    emitAction(rt,cheerer,'booyahBomb',state.serial,'cheer',cheerer.pos,owner.pos,callId,
      {ownerNid:owner.nid,ownerLife:actorLife(owner)});
  }
  rt.api.G.fx?.burst?.(cheerer.pos,rt.up,colorOf(rt,cheerer),{count:4,speed:2,size:.07,paint:false});
  return true;
}
function crabRearCoreHit(victim,attacker) {
  const source=attacker?.pos;if(!source)return false;
  const dx=source.x-victim.pos.x,dz=source.z-victim.pos.z,len=Math.hypot(dx,dz);
  if(len<1e-6)return false;
  const yaw=Number(victim.yaw)||0,forwardX=Math.sin(yaw),forwardZ=Math.cos(yaw);
  return (dx*forwardX+dz*forwardZ)/len<-.5;
}
function stampLine(rt,actor,from,to,width,seed) {
  const d=rt.v7.subVectors(to,from),len=d.length(),steps=Math.max(1,Math.ceil(len/2.5));let index=0;
  for(let i=0;i<=steps;i++){
    const p=rt.v8.copy(from).lerp(to,i/steps);
    paintStamp(rt,actor,p,Math.min(MAX_STAMP_RADIUS,width),seedUnit(seed,index++));
  }
}
function updateWorld(rt,dt) {
  const list=rt.system._s3AllSpecialObjects;if(!Array.isArray(list)||!(dt>0))return;
  for(let i=list.length-1;i>=0;i--){
    const o=list[i];if(!o||o.dead){list.splice(i,1);continue;}
    o.age+=dt;
    if(o.kind==='marker'){
      const k=clamp(o.age/Math.max(.05,o.flight||1.1),0,1);
      o.pos.copy(o.origin).lerp(o.target,k);o.pos.y+=Math.sin(k*Math.PI)*4;
      o.mesh?.position.copy(o.pos);
      if(k>=1){o.kind='strike';o.phase='active';o.dur=3.1;o.activeAt=o.age;o.maxRadius=7.7;o.currentRadius=.5;o.nextDamage=o.age;
        o.paintT=0;o.once=new Set();o.mesh?.scale.set(.2,.25,.2);fxBurst(rt,o.owner,o.target,1.6,'deploy');emitObject(rt,o,'active');}
    }else if(o.kind==='strike'){
      const elapsed=o.age-(o.activeAt||0),spread=50/FPS;
      o.currentRadius=.5+(o.maxRadius-.5)*clamp(elapsed/spread,0,1);
      if(o.mesh){o.mesh.position.copy(o.pos);o.mesh.scale.set(o.currentRadius,.28,o.currentRadius);}
      const center=rt.v0.copy(o.pos);center.y+=.8;
      if(o.phase==='active'&&elapsed>=0){
        o.nextDamage=Number.isFinite(o.nextDamage)?o.nextDamage:o.age;
        if(o.age+1e-8>=o.nextDamage){
          o.nextDamage+=5/FPS;
          if(!o.owner.remote)damageBandRadius(rt,o.owner,center,descriptions.tripleInkstrike.splashBands,o.currentRadius,'tripleInkstrike');
          rt.api.G.fx?.rain?.(center,o.currentRadius,colorOf(rt,o.owner),dt,{cloud:false});
          o.paintT-=dt;
          if(!o.owner.remote&&o.paintT<=0){o.paintT=.1;const n=20;
            for(let j=0;j<n;j++){const a=j/n*Math.PI*2,p=rt.v1.set(o.pos.x+Math.cos(a)*o.currentRadius,o.pos.y+.08,o.pos.z+Math.sin(a)*o.currentRadius);
              paintStamp(rt,o.owner,p,.78,seedUnit(o.seed,(o.pulse||0)*32+j));}o.pulse=(o.pulse||0)+1;}
          if(!o.owner.remote&&(o.pulse||0)%4===0)emitObject(rt,o,'pulse');
        }
      }
      if(elapsed>=o.dur)removeWorld(rt,o,'expire');
    }else if(o.kind==='booyahBlast'){
      const elapsed=o.age-o.startDelay,started=elapsed>=0;
      const radius=started?o.maxRadius*clamp(elapsed/Math.max(1/FPS,o.expand),0,1):0,center=rt.v0.copy(o.pos);center.y+=.2;
      if(started&&!o.owner.remote){
        if(!o.painted){paintDisk(rt,o.owner,o.pos,13.5,o.seed);o.painted=true;}
        damageRadius(rt,o.owner,'booyahBomb',center,3.3,3.3,Math.max(.1,radius),'booyahBomb');
      }
      if(started)rt.api.G.fx?.ring?.(center,rt.up,colorOf(rt,o.owner),{radius,life:.1});
      if(elapsed>=o.expand)removeWorld(rt,o,'expire');
    }else if(o.kind==='wave'){
      if(o.mesh)o.mesh.material.emissiveIntensity=.18+.4*Math.sin(o.age*9);
      while(o.pulse<3&&o.age+1e-8>=o.pulseFrames[o.pulse]){
        const start=o.pulseFrames[o.pulse];o.waves.push({started:start,radius:o.maxRadius,last:0,seen:new Set(),pulse:o.pulse});
        o.pulse++;if(!o.owner.remote)emitObject(rt,o,'pulse');
      }
      for(const wave of o.waves){
        const age=Math.max(0,o.age-wave.started),r=wave.radius*clamp(age/o.maxWaveFrame,0,1),prev=wave.last;wave.last=r;
        if(r<=0)continue;
        for(const victim of rt.api.G.actors||[]){
          if(!victim?.alive||victim.team===o.team||wave.seen.has(victim))continue;
          const dx=victim.pos.x-o.pos.x,dz=victim.pos.z-o.pos.z,d=Math.hypot(dx,dz),dy=victim.pos.y+.75-o.pos.y;
          if(d<prev-.75||d>r+.75||dy< -5.2||dy>2.8)continue;
          wave.seen.add(victim);
          if(!o.owner.remote)rt.api.G.projectiles.applyHit(o.owner,victim,45,'waveBreaker');
          victim.s3 ||= {};victim.s3.revealedUntil ||= {};
          victim.s3.revealedUntil[o.team]=Math.max(victim.s3.revealedUntil[o.team]||0,rt.api.G.time+45/FPS);
        }
        o.paintT=(o.paintT||0)-dt;
        if(!o.owner.remote&&o.paintT<=0){o.paintT=.1;const n=24;for(let j=0;j<n;j++){
          const a=j/n*Math.PI*2,p=rt.v1.set(o.pos.x+Math.cos(a)*r,o.pos.y+.08,o.pos.z+Math.sin(a)*r);
          if(rt.api.G.physics?.raycast){const g=rt.api.G.physics.raycast(rt.v2.copy(p).add(rt.up),rt.down,4,rt.hit,true);if(g?.hit)paintStamp(rt,o.owner,g.point,.85,seedUnit(o.seed,wave.pulse*64+j+Math.floor(o.age*10)));}
        }}
      }
      if(o.age>=o.dur)removeWorld(rt,o,'expire');
    }else if(o.kind==='decoy'){
      if(o.phase==='flight'){
        const k=clamp(o.age/Math.max(.05,o.flight||1.8),0,1);
        o.pos.copy(o.origin).lerp(o.target,k);o.pos.y+=Math.sin(k*Math.PI)*4;
        o.mesh?.position.copy(o.pos);
        if(k>=1){o.phase='active';o.mesh?.scale.setScalar(1.15);emitObject(rt,o,'active');}
      }
      if(o.age>=o.dur){
        if(!o.owner.remote){paintDisk(rt,o.owner,o.pos,3.5,o.seed);damageBandRadius(rt,o.owner,o.pos,descriptions.superChump.splashBands,6,'superChump');fxBurst(rt,o.owner,o.pos,6,'explode');}
        else fxBurst(rt,o.owner,o.pos,6,'explode');
        removeWorld(rt,o,'expire');
      }
    }else if(o.kind==='screen'){
      const runStart=1,runEnd=1+560/FPS;
      if(o.age>=runStart&&o.age<=runEnd)o.pos.addScaledVector(o.direction,o.moveSpeed*dt);
      o.mesh?.position.copy(o.pos).setY(o.pos.y+o.height/2);
      if(o.mesh){o.mesh.material.opacity=.27+.06*Math.sin(o.age*7);o.mesh.rotation.y=Math.atan2(o.normal.x,o.normal.z);}
      for(const victim of rt.api.G.actors||[]){
        if(!victim?.alive||victim.team===o.team)continue;
        const previous=o.previous.get(victim);
        if(previous){
          const fromSide=rt.v1.subVectors(previous.pos,previous.screen).dot(o.normal),toSide=rt.v2.copy(victim.pos).sub(o.pos).dot(o.normal);
          if(o.age>=runStart&&o.age<=runEnd&&fromSide*toSide<=0&&Math.abs(fromSide-toSide)>1e-6){
            const t=clamp(fromSide/(fromSide-toSide),0,1),player=rt.v3.copy(previous.pos).lerp(victim.pos,t),sheet=rt.v4.copy(previous.screen).lerp(o.pos,t);
            const x=player.clone().sub(sheet),across=Math.abs(x.dot(o.tangent));
            if(across<=o.width/2&&player.y+1>=sheet.y&&player.y+1<=sheet.y+o.height){
              const last=o.lastCross.get(victim)||-Infinity;
              if(rt.api.G.time-last>=.45){
                o.lastCross.set(victim,rt.api.G.time);
                if(victim.isLocal){victim.s3 ||= {};victim.s3.splattercolorUntil=Math.max(victim.s3.splattercolorUntil||0,rt.api.G.time+360/FPS);
                  victim.s3.splattercolorMarkUntil=Math.max(victim.s3.splattercolorMarkUntil||0,rt.api.G.time+120/FPS);}
                if(!o.owner.remote)rt.api.G.projectiles.applyHit(o.owner,victim,40,'splattercolorScreen');
                if(!o.owner.remote){o.crossCount=(o.crossCount||0)+1;emitAction(rt,o.owner,o.id,o.activation,'cross',sheet,player,o.seed,{object:o.serial,index:o.index,tick:o.crossCount});}
              }
            }
          }
        }
        o.previous.set(victim,{pos:victim.pos.clone(),screen:o.pos.clone()});
      }
      if(!o.owner.remote&&o.age-o.lastMoveEvent>=.25){o.lastMoveEvent=o.age;o.moveCount=(o.moveCount||0)+1;emitObject(rt,o,'move');}
      if(o.age>=o.dur)removeWorld(rt,o,'expire');
    }
  }
}
function targetWaveOrigin(rt,actor) {
  const origin=rt.v0.set(actor.pos.x,actor.pos.y+1.7,actor.pos.z),dir=aimDirection(rt,actor,rt.v1),length=27;
  const defense=rt.system.kitBeamDefense?.(actor,origin,dir,length,42);
  let end=rt.v2.copy(origin).addScaledVector(dir,defense?Math.min(length,defense.distance):length);
  if(defense?.onHit)defense.onHit();
  for(const victim of rt.api.G.actors||[]) {
    if(!victim.alive||victim.team===actor.team)continue;
    const pos=rt.v3.set(victim.pos.x,victim.pos.y+.7,victim.pos.z),d=rt.v4.subVectors(end,origin),dd=d.lengthSq();
    const t=dd>1e-9?clamp(pos.clone().sub(origin).dot(d)/dd,0,1):0;
    const near=rt.v5.copy(origin).addScaledVector(d,t);
    if(pos.distanceTo(near)<1.2)rt.api.G.projectiles.applyHit(actor,victim,3.5,'killerWail');
  }
  rt.api.G.fx?.ring?.(origin,dir,colorOf(rt,actor),{radius:length,life:.35});
  emitAction(rt,actor,'killerWail',actorStates.get(actor).serial,'laser',origin,end,nextSeed(actorStates.get(actor)));
}

function activeStep(rt,actor,dt) {
  const state=actorStates.get(actor),s=actor.specialActive;
  if(!state||!s||state.id!==s.id)return;
  if(!(dt>0))return;
  if(!actor.alive||actor.remote){endSpecial(rt,actor,'interrupted');return;}
  const edges=inputEdges(actor,state);
  state.t+=dt;s.t=state.t;
  const spec=SPECIALS[state.id],elapsed=state.t;
  if(state.id==='tentaMissiles'){
    moveActor(rt,actor,dt,state,{squid:true});
    if(edges.fire||edges.sub)launchMissiles(rt,actor,state);
    else if(elapsed>=1.5)launchMissiles(rt,actor,state);
    return;
  }
  if(state.id==='inkjet'){
    const it=actor.intent;
    if(it.jump)actor.vel.y=Math.min(8.5,actor.vel.y+28*dt);
    else if(it.squid)actor.vel.y=Math.max(-12,actor.vel.y-38*dt);
    else actor.vel.y=Math.max(-2.5,actor.vel.y-12*dt);
    const move=it.move||rt.zero;
    actor.vel.x+=(move.x*5.2-actor.vel.x)*(1-Math.exp(-4*dt));
    actor.vel.z+=(move.z*5.2-actor.vel.z)*(1-Math.exp(-4*dt));
    actor.form=it.squid?'squid':'kid';actor.grounded=false;
    { const py=actor.pos.y;actor.pos.addScaledVector(actor.vel,dt);actor._resolve?.(false,py,false); }
    if(edges.fire)launchInkjet(rt,actor,state);
    if(edges.sub)returnToOrigin(rt,actor,state,'return');
    else if(elapsed>=state.duration)returnToOrigin(rt,actor,state,'duration');
    return;
  }
  if(state.id==='booyahBomb'){
    moveActor(rt,actor,dt,state,{squid:true});
    const ap=actor.s3?.abilityPoints?.specialPower||0;
    state.charge=Math.min(1,state.charge+gearCurve(ap,.002,.006,.01));
    if(edges.fire||edges.booyah)state.charge=Math.min(1,state.charge+.077);
    state.cheerHeld ||= new WeakMap();
    for(const ally of rt.api.G.actors||[])if(ally!==actor&&ally.alive&&ally.team===actor.team){
      const pressed=!!ally.intent?.booyah,wasPressed=state.cheerHeld.get(ally)===true;
      state.cheerHeld.set(ally,pressed);
      if(pressed&&!wasPressed)addBooyahCall(rt,actor,state,ally,{network:ally.isLocal===true});
    }
    state.armor=true;state.armorHP=Math.max(0,state.armorHP);
    if(edges.sub)throwBooyah(rt,actor,state,state.charge);
    else if(state.charge>=1||elapsed>=5.5)throwBooyah(rt,actor,state,state.charge);
    return;
  }
  if(state.id==='ultraStamp'){
    moveActor(rt,actor,dt,state,{speed:actor.intent.fire?2.6:8.4,squid:false,jump:false});
    if(edges.jump&&actor.intent.fire&&actor.grounded){actor.vel.y=rt.api.PLAYER.jumpVel||7.8;actor.grounded=false;actor.character?.trigger?.('jump');stampSwing(rt,actor,state,true);state.nextSwing=elapsed+5/60;}
    else if(actor.intent.fire&&elapsed>=state.nextSwing){state.nextSwing=elapsed+5/60;stampSwing(rt,actor,state,false);}
    if(edges.sub)throwStamp(rt,actor,state);
    else if(elapsed>=state.duration)endSpecial(rt,actor,'duration');
    return;
  }
  if(state.id==='zipcaster'){
    if(state.phase==='zip'){
      state.zipT+=dt;const delta=rt.v0.copy(state.zipTarget).sub(actor.pos),distance=delta.length();
      if(distance<.7||state.zipT>1.35){actor.pos.copy(state.zipTarget);actor.vel.set(0,0,0);state.phase='ready';state.zips++;
        const victimHits=damageBandRadius(rt,actor,state.zipTarget,descriptions.zipcaster.splashBands,6,'zipcaster');
        paintStamp(rt,actor,groundAt(rt,state.zipTarget,rt.v1),1.4,nextSeed(state));
        fxBurst(rt,actor,state.zipTarget,5.25,'hit');
        emitAction(rt,actor,'zipcaster',state.serial,'hookImpact',state.zipTarget,null,nextSeed(state),{targets:victimHits.length,index:state.zips});}
      else {delta.multiplyScalar(Math.min(1,19*dt/distance));actor.pos.add(delta);actor.vel.copy(delta).multiplyScalar(1/dt);actor.grounded=false;}
    }else moveActor(rt,actor,dt,state,{speed:actor.intent.squid?6:4.2,squid:true,jump:true});
    state.inkFuel=Math.max(0,state.inkFuel-13.05*dt);
    // Zipcaster has its own 1.5x special ink tank. Let the equipped native
    // WeaponRunner spend from that tank while preserving the player's normal
    // ink reserve for after the special ends.
    const normalInk=actor.ink;
    actor.ink=state.inkFuel;
    try{
      actor.weaponRunner?.update?.(dt,{fire:!!actor.intent.fire&&actor.form!=='squid',firePressed:edges.fire,
        sub:false,subReleased:false});
    }finally{
      state.inkFuel=clamp(Number(actor.ink)||0,0,150);
      actor.ink=normalInk;
    }
    if(state.phase==='ready'&&edges.sub&&state.inkFuel>=2.5){state.inkFuel-=2.5;const target=aimPoint(rt,actor,35,rt.v0).clone();zipTo(rt,actor,state,target);}
    if(state.inkFuel<=0||elapsed>=state.duration)returnToOrigin(rt,actor,state,state.inkFuel<=0?'ink':'duration');
    return;
  }
  if(state.id==='killerWail'){
    moveActor(rt,actor,dt,state,{squid:true});
    // Wail remains a simultaneous special layer: the ordinary runner stays
    // live and owns main shots, ink and weapon cadence during laser ticks.
    actor.weaponRunner?.update?.(dt,{fire:!!actor.intent.fire,firePressed:edges.fire,
      sub:!!actor.intent.sub&&actor.form!=='squid',subReleased:edges.subUp&&actor.form!=='squid'});
    if(state.phase==='charge'&&elapsed>=36/60){state.phase='laser';state.nextBeam=elapsed;}
    if(state.phase==='laser'&&elapsed+1e-8>=state.nextBeam){fireWailTick(rt,actor,state);state.nextBeam+=5/60;}
    if(elapsed>=state.duration)endSpecial(rt,actor,'duration');
    return;
  }
  if(state.id==='crabTank'){
    const rolling=!!actor.intent.squid;
    state.armor=true;s.armor=true;s.armorHP=state.armorHP;
    moveActor(rt,actor,dt,state,{speed:rolling?8.5:4.2,squid:false,jump:true});
    if(edges.sub&&!rolling&&elapsed>=state.nextCannon){
      const origin=rt.v0.set(actor.pos.x,actor.pos.y+.95,actor.pos.z).clone(),dir=aimDirection(rt,actor,rt.v1);
      launch(rt,actor,'crabTank',origin,dir,{speed:18,grav:18,drag:.12,life:1.7,arc:2.4,damage:50,radius:4.5,size:.28,paintRadius:4.5,seed:nextSeed(state)});
      emitAction(rt,actor,state.id,state.serial,'cannon',origin,rt.v2.copy(origin).addScaledVector(dir,16),nextSeed(state));
      state.nextCannon=elapsed+32/60;state.cannonT=elapsed+.22;
    }
    crabBall(rt,actor,state,rolling);
    if(!rolling&&actor.intent.fire&&elapsed>=state.nextShot){
      const origin=rt.v0.set(actor.pos.x,actor.pos.y+.95,actor.pos.z).clone(),dir=aimDirection(rt,actor,rt.v1);
      const p=launch(rt,actor,'crabTank',origin,dir,{type:'shot',directOnly:true,damage:32,radius:.22,size:.13,speed:24,grav:4,drag:.04,life:1.25,seed:nextSeed(state),damageReduce:{max:32,min:16,start:9/60,end:25/60}});
      if(p)p.s3AllSpecialMode='shooter';
      emitAction(rt,actor,state.id,state.serial,'shot',origin,rt.v2.copy(origin).addScaledVector(dir,20),nextSeed(state),{damage:32});
      state.nextShot=elapsed+(state.firstShot?6/60:12/60);state.firstShot=true;
    }
    if(rolling&&elapsed>=state.nextBody){state.nextBody=elapsed+.45;const c=actor.pos.clone();damageBandRadius(rt,actor,c,[[1.15,40]],1.15,'crabTank');paintStamp(rt,actor,groundAt(rt,actor.pos,rt.v0),.9,nextSeed(state));}
    if(elapsed>=state.duration-25/60)endSpecial(rt,actor,'duration');return;
  }
  if(state.id==='reefslider'){
    actor.form='kid';
    if(state.phase==='startup'&&elapsed>=38/60){state.phase='dash';state.dashT=0;state.travel=0;actor.character?.trigger?.('special_dash');}
    if(state.phase==='dash'){
      state.dashT+=dt;
      if(edges.fire||edges.sub){reefImpact(rt,actor,state,actor.pos.clone());return;}
      const steer=actor.intent.move||rt.zero;
      if(Math.hypot(steer.x,steer.z)>.1){const move=rt.v0.set(steer.x,0,steer.z).normalize();state.direction.lerp(move,.035).normalize();}
      actor.vel.x=state.direction.x*24.3;actor.vel.z=state.direction.z*24.3;actor.vel.y=Math.max(-5,actor.vel.y-24*dt);
      const before=actor.pos.clone(),py=actor.pos.y;actor.pos.addScaledVector(actor.vel,dt);actor.grounded=false;actor._resolve?.(false,py,false);
      state.travel+=before.distanceTo(actor.pos);
      if(actor.contacts?.wall||state.dashT>=54/60||state.travel>=28){reefImpact(rt,actor,state,actor.pos.clone());return;}
      actor.invuln=Math.max(actor.invuln,.18);
    }
    return;
  }
  if(state.id==='tripleInkstrike'){
    moveActor(rt,actor,dt,state,{squid:true});
    if(edges.fire&&state.shots<3&&elapsed>=state.nextMarker){deployInkstrike(rt,actor,state,state.shots++);state.nextMarker=elapsed+50/60;if(state.shots>=3)endSpecial(rt,actor,'deployed');}
    else if(elapsed>=state.duration)endSpecial(rt,actor,'deployed');return;
  }
  if(state.id==='superChump'){
    moveActor(rt,actor,dt,state,{squid:true});
    if(edges.fire||edges.sub){throwChumps(rt,actor,state);return;}
    if(elapsed>=108/60)throwChumps(rt,actor,state);return;
  }
  if(state.id==='krakenRoyale'){
    const dir=aimDirection(rt,actor,rt.v0);state.armor=true;s.armor=true;
    if(state.phase==='dash'){
      state.dashT+=dt;const before=actor.pos.clone(),py=actor.pos.y;
      actor.vel.x=state.direction.x*21;actor.vel.z=state.direction.z*21;actor.vel.y=0;
      actor.pos.addScaledVector(actor.vel,dt);actor._resolve?.(false,py,false);
      const swept=rt.v1.copy(before).lerp(actor.pos,.5);state.dashHits||=new Set();
      for(const victim of rt.api.G.actors||[]){
        if(!victim?.alive||victim.team===actor.team||state.dashHits.has(victim))continue;
        if(Math.hypot(victim.pos.x-swept.x,victim.pos.z-swept.z)<=1.5){rt.api.G.projectiles.applyHit(actor,victim,120,'krakenRoyale');state.dashHits.add(victim);}
      }
      stampLine(rt,actor,before,actor.pos,1.2,nextSeed(state));
      if(state.dashT>=35/60){state.phase='active';state.dashT=0;}
    }else moveActor(rt,actor,dt,state,{speed:actor.intent.jump?10:5.5,squid:false,jump:false});
    if(edges.jump){
      const center=rt.v0.copy(actor.pos);center.y+=.65;
      damageBandRadius(rt,actor,center,[[2.65,60]],2.65,'krakenRoyale',null,3);
      paintStamp(rt,actor,groundAt(rt,actor.pos,rt.v1),1.2,nextSeed(state));fxBurst(rt,actor,center,2.65,'hit');
      emitAction(rt,actor,state.id,state.serial,'jump',center,null,nextSeed(state),{damage:60,index:state.strikes++});
    }
    if(edges.fire&&state.phase!=='dash'){
      state.phase='charge';state.chargeT=0;state.direction.copy(dir).setY(0).normalize();state.dashHits=new Set();
      actor.character?.trigger?.('special_charge');
    }else if(state.phase==='charge'){
      state.chargeT+=dt;
      if(state.chargeT>=35/60){state.phase='dash';state.dashT=0;actor.character?.trigger?.('special_dash');}
    }
    if(elapsed>=state.duration)endSpecial(rt,actor,'duration');return;
  }
  if(state.id==='splattercolorScreen'){
    moveActor(rt,actor,dt,state,{squid:true});
    if(edges.fire||edges.sub||elapsed>=.2){deployScreen(rt,actor,state);return;}return;
  }
  if(state.id==='waveBreaker'){
    moveActor(rt,actor,dt,state,{squid:true});
    if(edges.fire||edges.sub||elapsed>=.5)deployWave(rt,actor,state);
    return;
  }
}

function makeState(rt,actor,id) {
  const definition=SPECIALS[id],serial=activationSerial(actor),ap=actor.s3?.abilityPoints?.specialPower||0;
  const duration=Array.isArray(definition.duration)?gearCurve(ap,...definition.duration):definition.duration;
  const state={ id,serial,t:0,duration,seed:(Math.random()*0xffffffff)>>>0,
    held:{fire:!!actor._prevIntent?.fire,sub:!!actor._prevIntent?.sub,jump:!!actor._prevIntent?.jump,squid:!!actor._prevIntent?.squid,booyah:!!actor._prevIntent?.booyah},
    phase:'active',origin:actor.pos.clone(),shots:0,beams:0,swings:0,strikes:0,zips:0,nextSwing:.05,nextBeam:.1,
    charge:0,travel:0,objectSerial:0,armor:false,hitIds:new Set(),nextBody:.2,
  };
  if(id==='booyahBomb'){state.charge=0;state.armorHP=470;state.cheerCalls=new WeakMap();state.cheerHeld=new WeakMap();actor.s3CatalogueBooyah=serial;}
  if(id==='crabTank'){state.armorHP=500;state.cannon=false;state.nextShot=20/60;state.nextCannon=20/60;state.cannonT=0;state.firstShot=false;}
  if(id==='reefslider'){state.phase='startup';state.direction=aimDirection(rt,actor,new rt.api.THREE.Vector3());state.direction.y=0;state.direction.normalize();state.startup=38/60;}
  if(id==='tripleInkstrike')state.nextMarker=0;
  if(id==='waveBreaker')state.phase='ready';
  if(id==='zipcaster')state.phase='ready';
  if(id==='krakenRoyale'){state.armorHP=Infinity;state.phase='active';state.direction=new rt.api.THREE.Vector3();}
  if(id==='killerWail')state.phase='charge';
  if(id==='inkjet')actor.vel.y=Math.max(actor.vel.y,7.4);
  if(id==='zipcaster')state.inkFuel=150;
  actorStates.set(actor,state);actor._s3AllSpecialState=state;
  actor.specialActive={id,t:0,phase:state.phase,armor:false,armorHP:state.armorHP,activation:serial};
  emitAction(rt,actor,id,serial,'activate',actor.pos,null,state.seed,{duration:q3(duration)});
  return state;
}

function installRuntime(api) {
  const {Actor,Projectiles,THREE}=api||{};
  if(!Actor?.prototype||!Projectiles?.prototype||!THREE?.Vector3)throw new Error('all-specials requires actual Actor, Projectiles and THREE.Vector3');
  if(Object.hasOwn(Actor.prototype,INSTALL))return runtimes.get(Projectiles)||null;
  const rt={api,Actor,Projectiles,system:api.G.projectiles||null,
    v0:new THREE.Vector3(),v1:new THREE.Vector3(),v2:new THREE.Vector3(),v3:new THREE.Vector3(),v4:new THREE.Vector3(),v5:new THREE.Vector3(),
    v6:new THREE.Vector3(),v7:new THREE.Vector3(),v8:new THREE.Vector3(),v9:new THREE.Vector3(),v10:new THREE.Vector3(),v11:new THREE.Vector3(),
    v12:new THREE.Vector3(),v13:new THREE.Vector3(),v14:new THREE.Vector3(),v15:new THREE.Vector3(),
    zero:new THREE.Vector3(),up:new THREE.Vector3(0,1,0),down:new THREE.Vector3(0,-1,0),hit:api.Hit ? new api.Hit() : null};
  if(!rt.hit)rt.hit={hit:false,point:new THREE.Vector3(),normal:new THREE.Vector3(),dist:0};
  runtimes.set(Projectiles,rt);
  const proto=Actor.prototype,start=proto._startSpecial,step=proto._updateSpecial,reset=proto.reset,splat=proto.splat,damage=proto.damage;
  Object.defineProperty(proto,INSTALL,{value:true});
  proto._startSpecial=function(...args){
    const id=this.weapon?.special;
    if(!IDS.has(id))return start.apply(this,args);
    if(!this.alive||this.remote||this.specialActive||this.superJumpState||this.specialReady?.()===false)return undefined;
    const before=this.stats?.specials||0;
    const result=start.apply(this,args);
    if(this.alive&&this.stats?.specials===before+1&&this.special===0){
      const state=makeState(rt,this,id);rt.system=api.G.projectiles||rt.system;
      if(id==='tentaMissiles'&&this.intent?.fire&&state.held.fire===false)state.held.fire=true;
      if(id==='tripleInkstrike'&&this.intent?.fire&&state.held.fire===false)state.held.fire=true;
      if(id==='splattercolorScreen'&&this.intent?.fire){deployScreen(rt,this,state);}
    }
    return result;
  };
  proto._updateSpecial=function(dt,...args){
    const id=this.specialActive?.id;
    if(!IDS.has(id))return step.call(this,dt,...args);
    rt.system=api.G.projectiles||rt.system;
    if(this.remote){this.specialActive=null;return undefined;}
    activeStep(rt,this,dt);
    return undefined;
  };
  proto.reset=function(...args){
    const state=actorStates.get(this);if(state)endSpecial(rt,this,'reset');
    this._s3AllSpecialState=null;return reset.apply(this,args);
  };
  proto.splat=function(...args){
    const state=actorStates.get(this);if(state)endSpecial(rt,this,'splat');
    return splat.apply(this,args);
  };
  proto.damage=function(amount,attacker,source){
    const state=actorStates.get(this);
    if(!state||!(amount>0)||source==='ink')return damage.call(this,amount,attacker,source);
    if(state.id==='krakenRoyale'&&state.t>=1&&state.t<state.duration-1)return false;
    if(state.id==='crabTank'&&crabRearCoreHit(this,attacker)){
      const armor=this.specialActive?.armor;
      if(this.specialActive)this.specialActive.armor=false;
      api.emit?.('actor:armorhit',{actor:this,absorbed:0,broken:false,core:true,kind:'crabTank'});
      try{return damage.call(this,amount,attacker,source);}finally{if(this.specialActive)this.specialActive.armor=armor;}
    }
    if((state.id==='booyahBomb'||state.id==='crabTank')&&state.armorHP>0){
      const shield=state.armorHP,absorbed=Math.min(shield,amount),left=Math.max(0,amount-absorbed);
      state.armorHP=Math.max(0,shield-absorbed);
      if(this.specialActive)this.specialActive.armorHP=state.armorHP;
      api.emit?.('actor:armorhit',{actor:this,absorbed,broken:state.armorHP<=0,kind:state.id});
      if(left<=0)return false;
      return damage.call(this,left,attacker,source);
    }
    return damage.call(this,amount,attacker,source);
  };
  const P=Projectiles.prototype,update=P.update,clear=P.clear,baseCandidate=P.kitDefenseCandidate,blast=P._blastBurst;
  P.update=function(dt){
    rt.system=this;updateWorld(rt,dt);
    for(const p of this.list||[]){
      if(p?.s3TentaTarget&&p.s3AllSpecial==='tentaMissiles'){
        p.s3TentaAge=(p.s3TentaAge||0)+dt;
        if(p.s3TentaAge<.7){const d=p.s3TentaDirection||rt.up;p.vel.x=d.x*4;p.vel.z=d.z*4;p.vel.y=14;p.grav=12;p.drag=.03;}
        else {p.s3TentaDescending=true;p.grav=0;p.drag=0;const diff=rt.v11.subVectors(p.s3TentaTarget,p.pos),distance=diff.length(),flight=clamp(distance/25,.12,.55);p.vel.copy(diff).multiplyScalar(1/flight);}
      }
      const profile=p?.s3DamageReduce;if(!profile)continue;
      const t=Number(p.age)||0,k=clamp((t-profile.start)/Math.max(1e-6,profile.end-profile.start),0,1);
      p.damage=profile.max+(profile.min-profile.max)*k;
    }
    return update.call(this,dt);
  };
  if(typeof baseCandidate==='function')P.kitDefenseCandidate=function(p,...args){
    rt.system=this;
    const base=baseCandidate.call(this,p,...args),from=args[0]||p?.prev,to=args[1]||p?.pos;
    const extra=from&&to?candidate(rt,p,from,to):null;
    return extra&&(!base||extra.distance<base.distance)?extra:base;
  };
  if(typeof blast==='function')P._blastBurst=function(p,at,...args){
    rt.system=this;
    const result=blast.call(this,p,at,...args);
    if(!p?.ghost&&!p?.owner?.remote&&p?.s3AllSpecial&&finite(p.s3AllSpecialPaintRadius)&&p.s3AllSpecialPaintRadius>MAX_STAMP_RADIUS)
      paintDisk(rt,p.owner,at,p.s3AllSpecialPaintRadius,p.s3AllSpecialSeed||0);
    if(!p?.ghost&&!p?.owner?.remote&&p?.s3AllSpecial==='booyahBomb'){
      const seed=normalizedSeed(p.s3AllSpecialSeed||0),state=actorStates.get(p.owner)||{serial:p.s3AllSpecialActivation||1,seed,objectSerial:0};
      const pos=groundAt(rt,at,rt.v0).clone();
      deployObject(rt,p.owner,'booyahBomb','booyahBlast',pos,state,{dur:80/FPS,startDelay:40/FPS,expand:40/FPS,maxRadius:12.6,damage:3.3,seed,target:pos});
    }
    return result;
  };
  P.clear=function(...args){
    rt.system=this;
    for(const object of [...(this._s3AllSpecialObjects||[])])removeWorld(rt,object,'expire');
    this._s3AllSpecialObjects=[];return clear?.apply(this,args);
  };
  for(const [id,definition]of Object.entries(SPECIALS)){
    const current=api.SPECIALS[id]||{id,name:definition.name};
    Object.assign(current,{id,name:definition.name,duration:Array.isArray(definition.duration)?definition.duration[1]:definition.duration,
      radius:definition.radius,mechanicsInstalled:true,reference:`Leanny/splat3 11.3.0 ${definition.source}`,status:definition.status,
      projectileDescriptor:p=>projectileDescriptor(id)});
    api.SPECIALS[id]=current;
  }
  api.allSpecialObjectCandidate=(p,startPoint,endPoint)=>candidate(rt,p,startPoint||p?.prev,endPoint||p?.pos);
  api.allSpecialObjectHit=(p,object)=>objectHitProposal(rt,p,object);
  return rt;
}

/** Installs the additional actor special state machines and world-device hooks. */
export function installAllSpecials(api) { installRuntime(api); return api; }

function replayLedger(actor) {
  let rows=replaySeen.get(actor);if(!rows){rows=new Set();replaySeen.set(actor,rows);}return rows;
}
function replayFx(rt,actor,event) {
  const pos=event.pos;if(!Array.isArray(pos)||pos.length!==3||!pos.every(finite))return false;
  const point=new rt.api.THREE.Vector3(...pos),id=event.id,action=event.action,radius=finite(event.radius)?clamp(event.radius,.1,30):SPECIALS[id]?.radius||1.6;
  if(action==='impact'||action==='explode'||action==='destroy')fxBurst(rt,actor,point,radius,action==='destroy'?'impact':'explode');
  else if(action==='pulse'||action==='laser'||action==='swing'||action==='strike')rt.api.G.fx?.ring?.(point,rt.up,colorOf(rt,actor),{radius,life:.5});
  else if(action==='activate'||action==='deploy'||action==='device'||action==='screen'||action==='balloon'||action==='marker'||action==='zip'||action==='throw'){
    rt.api.G.fx?.burst?.(point,rt.up,colorOf(rt,actor),{count:10,speed:3,size:.08,paint:false});
    if(event.target&&Array.isArray(event.target)&&event.target.length===3&&event.target.every(finite))
      rt.api.G.fx?.ring?.(new rt.api.THREE.Vector3(...event.target),rt.up,colorOf(rt,actor),{radius:1.5,life:.65});
  }
  return true;
}
function replayObjectEvent(rt,actor,event) {
  rt.system ||= rt.api.G.projectiles || null;
  if(!rt.system)return false;
  if(event.action==='objectHit'){
    const owner=rt.api.G.netm?.byNid?.get(event.ownerNid)||(rt.api.G.actors||[]).find(a=>a.nid===event.ownerNid);
    if(!owner||owner.remote||owner.nid!==event.ownerNid||actorLife(owner)!==event.ownerLife||!actor.remote||actor.team===owner.team)return false;
    const object=(rt.system._s3AllSpecialObjects||[]).find(o=>o.owner===owner&&o.activation===event.activation&&o.serial===event.object&&o.id===event.id);
    if(!object||object.kind==='screen'||object.hp<=0)return false;
    object.hp=Math.max(0,object.hp-Math.max(1,Math.min(10000,Number(event.damage)||0)));
    if(object.hp<=0)removeWorld(rt,object,'destroy');else emitObject(rt,object,'hit');
    return true;
  }
  const serial=Number.isSafeInteger(event.object)&&event.object>0?event.object:0;
  if(!serial)return false;
  const objects=rt.system._s3AllSpecialObjects||(rt.system._s3AllSpecialObjects=[]);
  let object=objects.find(o=>o.owner===actor&&o.activation===event.activation&&o.serial===serial&&o.id===event.id);
  const point=new rt.api.THREE.Vector3(...event.pos);
  const target=Array.isArray(event.target)?new rt.api.THREE.Vector3(...event.target):null;
  if(['deploy','device','screen','balloon','marker'].includes(event.action)&&!object){
    const kind=typeof event.kind==='string'?event.kind:(event.id==='splattercolorScreen'?'screen':event.id==='waveBreaker'?'wave':event.id==='superChump'?'decoy':event.id==='tripleInkstrike'?'marker':'');
    if(!kind)return false;
    const state={serial:event.activation,objectSerial:serial-1,seed:event.seed};
    const extra={dur:finite(event.duration)?event.duration:1,maxRadius:finite(event.radius)?event.radius:(SPECIALS[event.id]?.radius||1),damage:0,hp:finite(event.hp)?event.hp:0,seed:event.seed,index:event.index||0,target,width:finite(event.width)&&event.width>0?event.width:15,height:finite(event.height)&&event.height>0?event.height:9};
    if(kind==='screen'){
      const direction=target?target.clone().sub(point).setY(0).normalize():new rt.api.THREE.Vector3(Math.sin(actor.aimYaw||0),0,Math.cos(actor.aimYaw||0));
      extra.direction=direction;extra.moveSpeed=3.18;extra.yaw=Math.atan2(direction.x,direction.z);
    }
    if(kind==='booyahBlast'){extra.startDelay=finite(event.startDelay)?event.startDelay:40/FPS;extra.expand=finite(event.expand)?event.expand:40/FPS;extra.damage=3.3;}
    object=deployObject(rt,actor,event.id,kind,point,state,extra);
    if(kind==='marker'){object.phase='flight';object.origin=point.clone();object.flight=finite(event.duration)?event.duration:1.1;}
    if(kind==='decoy'){object.phase='flight';object.origin=point.clone();object.flight=108/FPS;}
    if(kind==='wave'){
      object.hp=finite(event.hp)?event.hp:480;object.maxHp=object.hp;object.pulse=0;object.maxWaveFrame=finite(event.waveFrame)&&event.waveFrame>0?event.waveFrame:160/FPS;
      object.pulseFrames=[90/FPS,240/FPS,390/FPS];object.waves=[];
    }
    if(kind==='screen')object.target=target;
  }
  if(!object)return false;
  if(event.action==='move'){
    object.pos.copy(point);if(object.mesh){object.mesh.position.copy(point);if(object.kind==='screen')object.mesh.position.y+=object.height/2;}
    if(object.kind==='screen'&&target){const normal=target.clone().sub(point).setY(0).normalize();object.normal.copy(normal);object.direction.copy(normal);object.tangent.set(normal.z,0,-normal.x);object.target=target;}
  }else if(event.action==='active'){
    if(object.kind==='marker'){object.kind='strike';object.phase='active';object.activeAt=object.age;object.dur=3.1;object.maxRadius=7.7;object.currentRadius=.5;object.nextDamage=object.age;object.once=new Set();}
    if(object.kind==='decoy')object.phase='active';
  }else if(event.action==='hit')object.hp=finite(event.hp)?event.hp:object.hp;
  else if(event.action==='destroy'||event.action==='expire')removeWorld(rt,object,event.action);
  return true;
}
/**
 * Replays one validated parent-forwarded event. The event.actor must already be
 * rebound to its roster Actor. Replay is cosmetic and never changes turf, HP,
 * device HP, object authority, or the native projectile list.
 */
export function replaySpecial(api,event) {
  const rt=runtimes.get(api?.Projectiles);const actor=event?.actor;
  if(!rt||!actor||actor.remote!==true||!IDS.has(event.id)||!Number.isSafeInteger(event.activation)||event.activation<1||event.activation>=1e9
    ||typeof event.action!=='string'||event.action.length>24||!Number.isSafeInteger(event.seed)||event.seed<0||event.seed>0xffffffff
    ||!Array.isArray(event.pos)||event.pos.length!==3||!event.pos.every(finite))return false;
  if(event.target!==undefined&&(!Array.isArray(event.target)||event.target.length!==3||!event.target.every(finite)))return false;
  if(event.tick!==undefined&&(!Number.isSafeInteger(event.tick)||event.tick<0||event.tick>1e9))return false;
  let cheerOwner=null,cheerState=null;
  if(event.action==='cheer'){
    if(event.id!=='booyahBomb'||!Number.isSafeInteger(event.ownerNid)||!Number.isSafeInteger(event.ownerLife)||event.ownerLife<0)return false;
    cheerOwner=api.G.netm?.byNid?.get(event.ownerNid)||(api.G.actors||[]).find(a=>a.nid===event.ownerNid);
    if(!cheerOwner||cheerOwner.remote||cheerOwner.team!==actor.team||actorLife(cheerOwner)!==event.ownerLife||cheerOwner.s3CatalogueBooyah!==event.activation)return false;
    cheerState=actorStates.get(cheerOwner);
    if(!cheerState||cheerState.id!=='booyahBomb'||cheerState.serial!==event.activation)return false;
  }
  const key=`${event.id}:${event.activation}:${event.action}:${event.object||0}:${event.index||0}:${event.seed}:${event.tick||0}`;
  const ledger=replayLedger(actor);if(ledger.has(key))return false;
  ledger.add(key);if(ledger.size>SEEN_LIMIT)ledger.delete(ledger.values().next().value);
  if(event.action==='cheer'){
    return addBooyahCall(rt,cheerOwner,cheerState,actor,{callId:event.seed});
  }
  if(actor.remote&&event.id==='ultraStamp'){
    const state=actorStates.get(actor);
    if(event.action==='activate')actorStates.set(actor,{id:'ultraStamp',serial:event.activation,seed:event.seed,phase:'active',expiresAt:api.G.time+(finite(event.duration)?event.duration:7.5)});
    else if(state?.id==='ultraStamp'&&state.serial===event.activation){
      if(event.action==='throw'||event.action==='end')actorStates.delete(actor);
    }
  }
  const objectAccepted=replayObjectEvent(rt,actor,event);
  if(event.action==='objectHit')return objectAccepted;
  return replayFx(rt,actor,event);
}

export const ALL_SPECIALS = SPECIALS;
export const ALL_SPECIALS_STATUS = Object.freeze({
  reference: 'Leanny/splat3 11.3.0 source tables, pinned ref 7280ff9cde8bb1c5dcef46c700c326471584d2e6',
  implementation: 'live fixed-step controls, native Projectiles, Projectiles.applyHit, owner-claimed paint and bounded deployable lifecycles',
  calibration: 'world-unit mapping, collision widths, projectile flight/targeting, movement, attack animation and hitboxes require live INKWAVE/Splatoon 3 comparison; public-only damage entries are identified per special, while listed source frame/value rows are pinned',
  limitations: 'remote actor poses follow ordinary network snapshots; special events are presentation-only; destructible remote-device hits are proposals for parent authority, not client-owned HP',
});
