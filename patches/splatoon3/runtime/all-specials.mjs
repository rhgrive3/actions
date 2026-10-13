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
// Replayed `all:special` events present remote actions; object-hit proposals
// may change local-owned device HP after the catalogue owner/life gate.

import { gearCurve } from './gear.mjs';
import { objectGearRate, objectShredderEquipped, withObjectHitGear } from './object-gear.mjs';

const INSTALL = Symbol.for('inkwave.s3.all-specials.install.v1');
const FPS = 60, MAX_STAMP_RADIUS = 3.74;
const q2 = n => Math.round(n * 100) / 100;
const q3 = n => Math.round(n * 1000) / 1000;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const SPECIALS = Object.freeze({
  tentaMissiles: { name: 'Tenta Missiles', source: 'WeaponSpMultiMissile', duration: 10, radius: 4.25, paintRadius: 3, near: 150, far: 30, status: '11.3.0 table: 150/50/30 at 1.1/2.1/4.25, paint radius 3, launch counts 10/5/4 by target bucket; lock input window is calibrated' },
  inkjet: { name: 'Inkjet', source: 'WeaponSpJetpack', duration: [7.5, 8, 8.5], radius: 5, paintRadius: 3.2, near: 50, far: 30, direct: 120, status: '11.3.0 table: 50/30 at 2.55/5, paint 3.2, 450/480/510F; 120 direct is community-reported, flight tuning calibrated' },
  booyahBomb: { name: 'Booyah Bomb', source: 'WeaponSpNiceBall', duration: 600/FPS, radius: 12.6, paintRadius: 13.5, near: 0, far: 0, status: '11.3.0 table: 4700 armor; auto charge .002/.006/.01 per frame, self cheer .077, ally charge .088/.044/.022/.011 per cheerer, gauge credit 6/3/2/1/.5 and max15, blast radius 12.6, paint radius 13.5, paint span 6F. 3.3 damage/frame is community-reported; blast growth and charge inputs calibrated' },
  ultraStamp: { name: 'Ultra Stamp', source: 'WeaponSpUltraStamp', duration: [7.5, 9.5, 11], radius: 8, paintRadius: 5, near: 40, far: 40, status: '11.3.0 table: swing splash 40 at 4; throw 220/60 at 3.6/8, paint 5, 450/570/660F; 100 contact is community-reported and action hitboxes are calibrated' },
  zipcaster: { name: 'Zipcaster', source: 'WeaponSpSuperHook', duration: 9, radius: 6, paintRadius: 1.4, near: 45, far: 35, status: '11.3.0 table: 540F, hook blast 45/35 at 5.25/6, ink capacity/cost and tick drain; hook world reach and tether movement calibrated' },
  killerWail: { name: 'Killer Wail 5.1', source: 'WeaponSpMicroLaser', duration: [236/60, 276/60, 296/60], radius: 27, paintRadius: 0, near: 3.5, far: 3.5, status: '11.3.0 table: 36F charge, 35 raw every 5F, 180/220/240F laser lifetime, 20F after-wait and dual launch; world conversion/lock geometry calibrated' },
  crabTank: { name: 'Crab Tank', source: 'WeaponSpChariot', duration: [8, 9.5, 11], radius: 4.8, paintRadius: 4.5, near: 30, far: 30, direct: 50, status: '11.3.0 table: 50 cannon direct / 30 at 4.8, 32-to-16 shooter over 9–25F, 500 armor and 480/570/660F; steering calibrated' },
  reefslider: { name: 'Reefslider', source: 'WeaponSpSkewer', duration: 158/60, radius: 14.9, paintRadius: 7.51, near: 220, far: 70, status: '11.3.0 table: Skewer 38F pre-move, 54F move, 38F pre-burst, 28F recovery (158F total), 15F cancel lock and .031/.405 acceleration; 220 at9/70 at14.9; paint 7.51 base; collision/world scale calibrated' },
  tripleInkstrike: { name: 'Triple Inkstrike', source: 'WeaponSpTripleTornado', duration: 6, radius: 7.7, paintRadius: 7, near: 37.5, far: 37.5, status: '11.3.0 table: 360F, 7.7 damage radius, 7 paint and 50F spread; 37.5 per 5F from public mechanics, marker flight calibrated' },
  superChump: { name: 'Super Chump', source: 'WeaponSpFirework', duration: 635/FPS, radius: 6, paintRadius: 3.5, near: 70, far: 35, status: '11.3.0 table: 70/35 at 3.6/6, paint 3.5, decoy HP 60, 108F flight, 210F burst and 635F special; count and spread calibrated' },
  krakenRoyale: { name: 'Kraken Royale', source: 'WeaponSpCastle', duration: [8, 9, 10], radius: 2.65, paintRadius: 1.2, near: 60, far: 60, status: '11.3.0 table: 480/540/600F, 35F charge/dash and 60 jump attack; remaining contact/charge values require game comparison' },
  splattercolorScreen: { name: 'Splattercolor Screen', source: 'WeaponSpChimney', duration: 11.333, radius: 15, paintRadius: 0, near: 40, far: 40, status: '11.3.0 table: 60F startup, 560F running, 60F closing; touch 400 raw, mark 120F, saturation 360F; moving-wall scale calibrated' },
  waveBreaker: { name: 'Wave Breaker', source: 'WeaponSpShockSonar', duration: 10.1, radius: [20, 24, 27], paintRadius: 0, near: 45, far: 45, status: '11.3.0 table: 45 damage at 90/240/390F, 480 device HP, 30 contact damage/0.5s, 45F generator mark, radii 20/24/27, wave 160/192/216F; 8s wave marks, world mapping calibrated' },
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
  waveBreaker: { radius: 27, paintRadius: 0, damageMax: 45, damageMin: 45, directDamage: 45, splashBands: [[27, 45]] },
});

const actorStates = new WeakMap();
const runtimes = new WeakMap();
const replaySeen = new WeakMap();
const SEEN_LIMIT = 384;
const SPECIAL_ROUND_FIELDS = Object.freeze(['s3AllSpecial','s3AllSpecialPaintRadius','s3AllSpecialActivation','s3AllSpecialSeed','s3DamageReduce',
  's3TentaTarget','s3TentaAge','s3TentaDescending','s3TentaDirection','s3AllSpecialMode','s3PaintNoSpecial']);

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
    // The caller may use rt.v3 as its output, so the probe cannot share it.
    const from = (rt.groundProbe ||= point.clone()).copy(point); from.y += .25;
    // Preserve an already contacted surface before considering a distant floor.
    // A broad ray from 24 WU above could jump to an unrelated upper storey.
    let result = rt.api.G.physics.raycast(from, rt.down, .5, rt.hit, true);
    if(!result?.hit){from.copy(point);from.y+=24;result=rt.api.G.physics.raycast(from,rt.down,60,rt.hit,true);}
    if (result?.hit && result.point && [result.point.x,result.point.y,result.point.z].every(finite)) return out.copy(result.point).addScaledVector(result.normal || rt.up, .08);
  }
  const g = rt.api.G.level?.groundHeight?.(point.x, point.z, point.y + 12);
  if (finite(g)) out.y = g + .08;
  else if (out.y < .08) out.y = .08;
  return out;
}
function projectileDescriptor(id, ap=0) {
  const spec = descriptions[id];
  if (!spec) return null;
  const power=Number.isFinite(ap)?clamp(ap,0,57):0;
  const scale=id==='inkjet'?gearCurve(power,1,1.15,1.3):1;
  const paint=id==='inkjet'?gearCurve(power,3.2,3.6,4):id==='tentaMissiles'?gearCurve(power,3.15,3.465,3.78):spec.paintRadius??spec.radius;
  const bands = spec.splashBands.map(([r,d]) => [r*scale,d]);
  return {
    id, wid: id, kind: id, name: SPECIALS[id].name,
    type: 'blast', splashRadius: spec.radius*scale, burstRadius: spec.radius*scale,
    ...(['inkjet','tentaMissiles'].includes(id)?{specialPowerAP:power}:{}),
    impactRadius: Math.min(paint, MAX_STAMP_RADIUS),
    paintRadius: Math.min(paint, MAX_STAMP_RADIUS), splashDamageMax: spec.damageMax,
    splashDamageMin: spec.damageMin, damageMax: spec.damageMax, damageMin: spec.damageMin,
    directDamage: spec.directDamage, splashBands: bands, damageBands: bands,
    status: SPECIALS[id].status,
  };
}
function directProjectileDescriptor(id, radius) {
  return { ...projectileDescriptor(id), type: 'shot', splashRadius: 0,
    burstRadius: 0, splashBands: [], impactRadius: radius, paintRadius: radius };
}
function launch(rt, actor, id, origin, direction, opts = {}) {
  const system = rt.api.G.projectiles;
  if (!system?._new || !system?._push || actor.remote) return null;
  const ap=actorStates.get(actor)?.specialPowerAP||0, descriptor = projectileDescriptor(id,ap), p = system._new();
  const dir = direction.clone();
  if (dir.lengthSq() < 1e-9) dir.copy(actor.aimDir);
  dir.normalize();
  const speed = opts.speed || 17;
  Object.assign(p, {
    type: opts.type || 'blast', wid:id, owner: actor, team: actor.team, age: 0,
    life: opts.life || 1.8, straight: opts.straight ?? .16,
    radius: opts.radius ?? descriptor.paintRadius, damage: opts.damage ?? descriptor.directDamage,
    size: opts.size ?? .22, trail: 0, trailEvery: opts.trailEvery || 0,
    trailRadius: .45, grav: opts.grav ?? 20, drag: opts.drag ?? .24,
    seed: seedUnit(opts.seed ?? nextSeed(actorStates.get(actor) || { seed: 1 }), 0),
    vis: .19, tail0: .55, tailK: .9, wob: .04, wobF: 23, nose: .12, sats: 2,
  });
  p.pos.copy(origin); p.prev.copy(origin); p.start.copy(origin);
  p.vel.copy(dir).multiplyScalar(speed);
  if (opts.arc) p.vel.y += opts.arc;
  // Direct rounds still need a special identity so main-weapon wrappers cannot
  // substitute the owner's gravity, collision, flight paint or weapon id.
  p.s3SpecialWeapon = opts.directOnly ? directProjectileDescriptor(id, opts.radius ?? .22) : descriptor;
  p.s3Weapon = opts.weapon || p.s3SpecialWeapon || { id, kind: 'special', special: id };
  p.s3AllSpecial = id;p.s3SpecialPowerAP=ap;
  p.s3PaintNoSpecial = true;
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
function paintDisk(rt, actor, point, radius, seed, maskSeed = seedUnit(seed,0)) {
  if (radius <= MAX_STAMP_RADIUS) return paintStamp(rt, actor, point, radius, seed);
  // Cluster ordinary network-admissible stamps; do not emit one over-limit paint
  // row, which the public replication owner correctly rejects.
  const spacing = 2.82, rowZ = spacing * Math.sqrt(3) / 2;
  // Tile in the nearby contact plane. Keeping every tile at the same world Y
  // leaves large holes on slopes; projecting each tile from above can instead
  // jump between disconnected floors. The short probe avoids both mistakes.
  const normal=rt.up.clone(), from=point.clone();from.y+=.25;
  const contact=rt.api.G.physics?.raycast?.(from,rt.down,.5,rt.hit,true);
  if(contact?.hit&&contact.normal?.y>.4)normal.copy(contact.normal).normalize();
  const tangent=new rt.api.THREE.Vector3(1,0,0).addScaledVector(normal,-normal.x).normalize();
  const bitangent=new rt.api.THREE.Vector3().crossVectors(tangent,normal).normalize();
  // A constant-radius stamp must remain inside the nominal source disk.
  // An outer ring closes lattice scallops without placing stamp centres near R.
  // Reuse one mask seed so the R=3.74 transition cannot union unrelated shapes.
  let area=0;const maxCentre=Math.max(0,radius-MAX_STAMP_RADIUS),centres=[[0,0]];
  for(let row=-Math.ceil(maxCentre/rowZ);row<=Math.ceil(maxCentre/rowZ);row++){
    const z=row*rowZ,shift=row&1?spacing*.5:0;
    for(let col=-Math.ceil(maxCentre/spacing);col<=Math.ceil(maxCentre/spacing);col++){
      const x=col*spacing+shift;if((x||z)&&Math.hypot(x,z)<=maxCentre)centres.push([x,z]);
    }
  }
  if(maxCentre>0){// Doubling retains every previous angle; n-to-n+1 rephasing can remove painted cells.
    const count=6*2**Math.max(0,Math.ceil(Math.log2((2*Math.PI*maxCentre/spacing)/6)));for(let i=0;i<count;i++){const angle=2*Math.PI*i/count;centres.push([Math.cos(angle)*maxCentre,Math.sin(angle)*maxCentre]);}}
  const seen=new Set();
  for(const [x,z]of centres){
    const at=rt.v4.copy(point).addScaledVector(tangent,x).addScaledVector(bitangent,z);at.set(q2(at.x),q2(at.y),q2(at.z));
    const key=at.x+','+at.y+','+at.z;if(seen.has(key))continue;seen.add(key);
    const got=rt.api.G.paint.splat(at,MAX_STAMP_RADIUS,actor.team,{seed:maskSeed,claimOwner:actor,claimMode:'no-special'});
    if(finite(got)&&got>0)area+=got;
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
// 11.3.0 WeaponSpChariotParam MoveSpeedX=.075F, MoveSpeedZ=.015F:
 // attack-mode lateral movement is five times faster than fore/aft movement.
 // World-space input is projected into the tank's camera-facing local axes.
export function crabTankAttackTargetVelocity(move, yaw = 0) {
  if (![move?.x,move?.z,yaw].every(finite)) return {x:0,z:0};
  const length=Math.hypot(move.x,move.z),scale=length>1?1/length:1;
  const mx=move.x*scale,mz=move.z*scale;
  const fx=Math.sin(yaw),fz=Math.cos(yaw),rx=fz,rz=-fx;
  const lateral=mx*rx+mz*rz,fore=mx*fx+mz*fz;
  return {x:(rx*lateral*.075+fx*fore*.015)*FPS,z:(rz*lateral*.075+fz*fore*.015)*FPS};
}
export function crabShooterRepeatFrames(ageSeconds) {
  // Wiki confirms 12F startup cadence reaching 4F; source Term=90F and
  // Bias=.2. The easing curve itself is unverified. Use bounded linear
  // interpolation rather than a constant 6F rate.
  return clamp(Math.round(12-8*clamp(ageSeconds/(90/FPS),0,1)),4,12);
}
function moveActor(rt, actor, dt, state, { speed = null, squid = true, jump = true, flight = false } = {}) {
  const P = rt.api.PLAYER, move = actor.intent?.move;
  const useSquid = squid && !!actor.intent?.squid;
  actor.form = useSquid ? 'squid' : 'kid';
  const enemyInk = actor.grounded && actor.groundTeam === 2;
  if (speed == null) actor._horizontal?.(dt, useSquid, enemyInk);
  else if(speed==='crab'){
    const target=crabTankAttackTargetVelocity(move,actor.aimYaw??actor.yaw??0);
    const gain=1-Math.exp(-8*dt);
    actor.vel.x+=(target.x-actor.vel.x)*gain;
    actor.vel.z+=(target.z-actor.vel.z)*gain;
  } else {
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
      specialPowerAP: object.specialPowerAP || 0, width: object.width || 0, height: object.height || 0, waveFrame: object.maxWaveFrame || 0,
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
    ownerLife: actorLife(object.owner), attackerLife: actorLife(shooter), objectShredder: objectShredderEquipped(shooter),
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
  const length=start.distanceTo(end), point=hit.point;let settled=false;
  return {distance:length*hit.t,point,normal:rt.v11.subVectors(point,object.pos).normalize().clone(),kind:'wave-breaker',onHit:()=>{
    if(p?.ghost||settled||object.dead)return false;settled=true;
    if(object.owner?.remote){objectHitProposal(rt,p,object);return true;}
    object.hp=Math.max(0,object.hp-Math.max(1,Number(p?.damage)||1)*objectGearRate(p.owner,object.id));
    if(object.hp<=0)removeWorld(rt,object,'destroy');else emitObject(rt,object,'hit');return true;
  }};
}
function chumpCandidate(rt, p, start, end, object) {
  if(object.dead||object.kind!=='decoy'||object.owner?.team===p?.team)return null;
  const hit=sphereEntry(rt,start,end,object.pos,.48);if(!hit)return null;
  const length=start.distanceTo(end),point=hit.point;let settled=false;
  return {distance:length*hit.t,point,normal:rt.v11.subVectors(point,object.pos).normalize().clone(),kind:'super-chump',onHit:()=>{
    if(p?.ghost||settled||object.dead)return false;settled=true;
    if(object.owner?.remote){objectHitProposal(rt,p,object);return true;}
    object.hp=Math.max(0,object.hp-Math.max(1,Number(p?.damage)||1)*objectGearRate(p.owner,object.id));
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
    kind,id,owner:actor,team:actor.team,specialPowerAP:state.specialPowerAP||0,activation:state.serial,serial:(state.objectSerial=((state.objectSerial||0)+1)),
    pos:pos.clone(),age:0,dur:extra.dur??spec.duration,maxRadius:extra.maxRadius??spec.radius,
    damage:extra.damage??spec.near,seed:normalizedSeed(extra.seed??nextSeed(state)),dead:false,
    hp:extra.hp||0,maxHp:extra.hp||0,phase:extra.phase||'armed',index:extra.index||0,
    pulse:0,nextPulse:extra.nextPulse||.75,once:new Set(),target:extra.target?.clone?.()||null,
    width:extra.width||8,height:extra.height||4.5,normal:new rt.api.THREE.Vector3(),tangent:new rt.api.THREE.Vector3(),
    direction:extra.direction?.clone?.()||new rt.api.THREE.Vector3(),moveSpeed:extra.moveSpeed||0,
    waves:[],lastMoveEvent:0,previous:new WeakMap(),lastCross:new WeakMap(),remote:!!actor.remote,
    startDelay:extra.startDelay||0,expand:extra.expand||0,
  };
  if(kind==='decoy'){
    const rate=gearCurve(object.specialPowerAP,1,1.1,1.2);
    object.maxRadius=6*rate;object.paintRadius=gearCurve(object.specialPowerAP,3.5,3.8,4.1);
    object.damageBands=descriptions.superChump.splashBands.map(([r,d])=>[r*rate,d]);
  }
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
// 11.3.0 WeaponSpMultiMissileLaunchParam: 10/5/4 rockets per target at 4F intervals.
// A lock-on can include up to five opponents; do not synthesize a target if none
// is in the reticle (unlike the old arbitrary no-target fallback).
export function tentaMissileCount(targetCount) {
  return targetCount === 1 ? 10 : targetCount === 2 ? 5 : targetCount >= 3 && targetCount <= 5 ? 4 : 0;
}
function launchMissiles(rt, actor, state) {
  const targets=selectTargets(rt,actor,5,Infinity);
  if (!targets.length) return false;
  const origin=rt.v0.set(actor.pos.x,actor.pos.y+2.4,actor.pos.z).clone(), plan=[];
  for(const target of targets) {
    const dest=groundAt(rt,target.pos,rt.v2).clone(),count=tentaMissileCount(targets.length);
    for(let i=0;i<count;i++) plan.push({dest,index:i,total:count});
    emitAction(rt,actor,'tentaMissiles',state.serial,'target',origin,dest,nextSeed(state),{index:plan.length-1,count});
  }
  state.phase='volley'; state.volleyOrigin=origin; state.volleyPlan=plan;
  state.volleyIndex=0; state.volleyNext=state.t;
  if (actor.specialActive) actor.specialActive.phase='volley';
  emitAction(rt,actor,'tentaMissiles',state.serial,'launch',origin,null,nextSeed(state),{count:plan.length});
  return true;
}
function tickMissileVolley(rt,actor,state) {
  const plan=state.volleyPlan;
  if (!plan) return;
  // 4 frames per rocket, 40/40/48/64/80 frames for 1..5 locked targets.
  while(state.volleyIndex<plan.length && state.t+1e-8>=state.volleyNext){
    const shot=plan[state.volleyIndex++],origin=state.volleyOrigin;
    const spread=(shot.index-(shot.total-1)/2)*.055;
    const dir=rt.v4.copy(shot.dest).sub(origin);dir.x+=Math.sin(spread);dir.normalize();
    const p=launch(rt,actor,'tentaMissiles',origin,dir,{speed:6,grav:11,drag:.08,life:2.8,arc:3.5,seed:nextSeed(state),size:.24,paintRadius:gearCurve(state.specialPowerAP,3.15,3.465,3.78)});
    if(p){p.s3TentaTarget=shot.dest.clone();p.s3TentaAge=0;p.s3TentaDescending=false;p.s3TentaDirection=dir.clone();}
    state.volleyNext+=4/FPS;
  }
  if(state.volleyIndex>=plan.length && state.t+1e-8>=state.volleyNext)endSpecial(rt,actor,'launched');
}
function launchInkjet(rt,actor,state) {
  const origin=rt.v0.set(actor.pos.x,actor.pos.y+1.05,actor.pos.z).clone(),dir=aimDirection(rt,actor,rt.v1);
  launch(rt,actor,'inkjet',origin,dir,{speed:21,grav:13,drag:.06,life:1.55,arc:.3,seed:nextSeed(state),size:.24,paintRadius:gearCurve(state.specialPowerAP,3.2,3.6,4)});
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
  const scale=state.damageDistanceRate, radius=14.9*scale;
  paintDisk(rt,actor,point,state.paintRadius,seed);
  damageBandRadius(rt,actor,center,descriptions.reefslider.splashBands.map(([r,d])=>[r*scale,d]),radius,'reefslider',null,5);
  fxBurst(rt,actor,point,radius,'impact');
  emitAction(rt,actor,'reefslider',state.serial,'impact',point,null,seed,{radius});
  // WeaponSpSkewer: 28F of post-impact invulnerability and recovery.
  actor.invuln=Math.max(actor.invuln,28/FPS);
  actor.vel.x=0;actor.vel.z=0;
  state.phase='recovery';state.recoveryT=0;
  if(actor.specialActive?.id===state.id)actor.specialActive.phase='recovery';
}
function deployInkstrike(rt,actor,state,index) {
  const target=aimPoint(rt,actor,28,rt.v0).clone();groundAt(rt,target,rt.v1);target.copy(rt.v1);
  const launchAt=rt.v2.set(actor.pos.x,actor.pos.y+1.1,actor.pos.z).clone();
  const marker=deployObject(rt,actor,'tripleInkstrike','marker',launchAt,state,{dur:82/FPS+51/FPS,maxRadius:7.7,damage:37.5,seed:nextSeed(state),index,target,scale:[.36,.36,.36]});
  marker.phase='flight';marker.origin=launchAt.clone();marker.flight=82/FPS;marker.age=0;
  emitAction(rt,actor,'tripleInkstrike',state.serial,'marker',launchAt,target,marker.seed,{index});
}
// WeaponSpFirework (S3 11.3.0): 12 decoys, 108F flight, 210F fuse,
// 635F to choose the target. S3 verification Wiki lists 13F throw startup.
// There is NO source evidence for per-decoy 80F startup or 4F spacing;
// all 12 use one launcher activation until the authored timeline is verified.
export const SUPER_CHUMP_DECOY_COUNT = 12;
export function superChumpReleaseFrame(index) {
  return Number.isInteger(index) && index >= 0 && index < SUPER_CHUMP_DECOY_COUNT ? 13 : null;
}
function throwChumps(rt,actor,state) {
  const target=groundAt(rt,aimPoint(rt,actor,26,rt.v0),rt.v1).clone(), origin=rt.v2.set(actor.pos.x,actor.pos.y+1.2,actor.pos.z).clone();
  const offset=rt.v3.copy(target).sub(actor.pos),distance=offset.length();
  if(distance<18)target.copy(actor.pos).addScaledVector(offset.normalize(),18);
  else if(distance>35)target.copy(actor.pos).addScaledVector(offset.normalize(),35);
  groundAt(rt,target,target);
  const count=SUPER_CHUMP_DECOY_COUNT;
  for(let i=0;i<count;i++) {
    // Spread markers across a wider-than-deep ellipse (measured 3.5:2 ratio).
    // Stage-edge eligibility and exact native RNG layout remain unverified.
    const angle=(i/count)*Math.PI*2+(seedUnit(state.seed,17+i*2)-.5)*.65;
    const radius=Math.sqrt(seedUnit(state.seed,61+i));
    const pos=target.clone();pos.x+=Math.cos(angle)*radius*7.0;pos.z+=Math.sin(angle)*radius*4.0;
    groundAt(rt,pos,pos);
    const releaseFrame=superChumpReleaseFrame(i);
    const obj=deployObject(rt,actor,'superChump','decoy',origin,state,{
      dur:(releaseFrame+108+210)/FPS,startDelay:releaseFrame/FPS,maxRadius:6,
      damage:70,hp:60,seed:nextSeed(state),index:i,target:pos,scale:[.72,.72,.72]});
    obj.phase='queued';if(obj.mesh)obj.mesh.visible=false;obj.flight=108/FPS;obj.origin=origin.clone();
    emitAction(rt,actor,'superChump',state.serial,'balloon',origin,pos,obj.seed,{index:i});
  }
  endSpecial(rt,actor,'deployed');
}
function deployScreen(rt,actor,state) {
  const aim=aimPoint(rt,actor,28,rt.v0).clone(),pos=actor.pos.clone().addScaledVector(rt.v1.copy(aim).sub(actor.pos).setY(0).normalize(),2.5);
  pos.y=Math.max(.08,actor.pos.y);
  const direction=rt.v2.copy(aim).sub(pos).setY(0).normalize();
  const object=deployObject(rt,actor,'splattercolorScreen','screen',pos,state,{dur:680/FPS,maxRadius:15,damage:40,width:15,height:9,yaw:Math.atan2(direction.x,direction.z),direction,moveSpeed:gearCurve(state.specialPowerAP,.04,.053,.06)*FPS,seed:nextSeed(state),scale:[15/8,2,1]});
  object.target=pos.clone().add(object.normal);
  emitAction(rt,actor,'splattercolorScreen',state.serial,'screen',pos,object.target,object.seed,{object:object.serial});
  endSpecial(rt,actor,'deployed');
}
function deployWave(rt,actor,state) {
  const pos=groundAt(rt,aimPoint(rt,actor,16,rt.v0),rt.v1).clone(),ap=state.specialPowerAP;
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
  if(state.t+1e-8<30/FPS)return false;
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
  creditBooyahGauge(rt,cheerer,owner,actorLife(owner),state.serial,callId,i+1);
  if(network&&Number.isInteger(owner.nid)&&Number.isInteger(actorLife(owner))&&!cheerer.remote){
    emitAction(rt,cheerer,'booyahBomb',state.serial,'cheer',cheerer.pos,owner.pos,callId,
      {ownerNid:owner.nid,ownerLife:actorLife(owner),call:i+1});
  }
  rt.api.G.fx?.burst?.(cheerer.pos,rt.up,colorOf(rt,cheerer),{count:4,speed:2,size:.07,paint:false});
  return true;
}
function creditBooyahGauge(rt,cheerer,ownerRef,ownerLife,activation,callId,ordinal=null) {
  if(!cheerer?.isLocal||cheerer.remote||cheerer.specialActive||!Number.isSafeInteger(callId))return false;
  const ownerNid=Number.isSafeInteger(ownerRef)?ownerRef:ownerRef?.nid;
  const target=ownerRef&&typeof ownerRef==='object'?ownerRef:
    rt.api.G.netm?.byNid?.get(ownerNid)||(rt.api.G.actors||[]).find(a=>a.nid===ownerNid);
  const token=typeof target?.s3CatalogueBooyah==='object'?target.s3CatalogueBooyah?.activation:target?.s3CatalogueBooyah;
  if(!target||target.team!==cheerer.team||actorLife(target)!==ownerLife||token!==activation)return false;
  const records=cheerer._s3BooyahGaugeCalls ||= new WeakMap();
  let rows=records.get(target);if(!rows){rows=new Map();records.set(target,rows);}
  const key=`${ownerLife}:${activation}`;
  let calls=rows.get(key);
  if(!calls){calls={seen:new Set(),count:0};rows.set(key,calls);}
  if(calls.seen.has(callId))return false;
  const i=Number.isSafeInteger(ordinal)&&ordinal>0?ordinal-1:calls.count;
  calls.count=Math.max(calls.count,i+1);
  if(i>=5)return false;
  calls.seen.add(callId);
  const points=[6,3,2,1,.5][i]||0;
  if(points<=0)return false;
  const cost=Number(cheerer.specialCost?.()??cheerer.weapon?.specialCost);
  if(!(cost>0)||!finite(cost))return false;
  const before=Number(cheerer.special)||0,after=Math.min(cost,before+points);
  if(after<=before)return false;
  cheerer.special=after;
  if(before<cost&&after>=cost)rt.api.emit?.('special:ready',{actor:cheerer});
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
// 11.3.0 WeaponSpShockSonar.GeneratorParam.MarkingGroundFrameRadiusRatio:
// (4F, 0.19), (10F, 0.40), (18F, 0.615). Interpolate the source keyframes
// separately; one 4F-to-18F ramp leaves players unmarked at frame 10.
export function waveBreakerGroundMarkRatio(frame) {
  if (!finite(frame) || frame < 4) return 0;
  if (frame < 10) return .19 + (.4 - .19) * (frame - 4) / 6;
  if (frame < 18) return .4 + (.615 - .4) * (frame - 10) / 8;
  return .615;
}

// 11.3.0 WeaponSpCastle.BodyParam.CollisionDashRadiusForPlayer = 1.5.
// A dash collision covers the entire travelled segment, not its midpoint.
export function krakenDashSweptContact(from, to, target, radius = 1.5) {
  if (![from?.x, from?.z, to?.x, to?.z, target?.x, target?.z, radius].every(finite) || radius < 0) return false;
  const x = to.x - from.x, z = to.z - from.z, lengthSq = x*x + z*z;
  const t = lengthSq > 1e-12 ? clamp(((target.x-from.x)*x + (target.z-from.z)*z)/lengthSq, 0, 1) : 0;
  const dx = target.x - (from.x+t*x), dz = target.z - (from.z+t*z);
  return dx*dx + dz*dz <= radius*radius;
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
      if(k>=1){
        o.kind='strike';o.phase='active';o.dur=51/FPS;o.activeAt=o.age;
        o.maxRadius=7.7;o.currentRadius=.5;o.nextDamage=o.age+5/FPS;
        o.paintT=0;o.once=new Set();o.mesh?.scale.set(.2,.25,.2);
        if(!o.owner.remote){
          const impact=rt.v0.copy(o.pos);impact.y+=.8;
          damageBandRadius(rt,o.owner,impact,descriptions.tripleInkstrike.splashBands,o.currentRadius,'tripleInkstrike');
        }
        fxBurst(rt,o.owner,o.target,1.6,'deploy');emitObject(rt,o,'active');
      }
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
      const frame=o.age*FPS,markRatio=waveBreakerGroundMarkRatio(frame);
      o.contactTimes ||= new Map();
      for(const victim of rt.api.G.actors||[]){
        if(!victim?.alive||victim.team===o.team)continue;
        const dx=victim.pos.x-o.pos.x,dz=victim.pos.z-o.pos.z,dy=victim.pos.y-o.pos.y,d=Math.hypot(dx,dz);
        if(frame<=45&&d<=o.maxRadius*markRatio&&dy>=-5.2&&dy<=2.8){
          victim.s3 ||= {};victim.s3.revealedUntil ||= {};
          victim.s3.revealedUntil[o.team]=Math.max(victim.s3.revealedUntil[o.team]||0,rt.api.G.time+45/FPS);
        }
        if(d<=1.2&&dy>=-.75&&dy<=2.75){
          const next=o.contactTimes.get(victim)||0;
          if(o.age+1e-8>=next){if(!o.owner.remote)rt.api.G.projectiles.applyHit(o.owner,victim,30,'waveBreaker');o.contactTimes.set(victim,o.age+.5);}
        }else if(o.contactTimes.get(victim)<=o.age)o.contactTimes.delete(victim);
      }
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
          victim.s3.revealedUntil[o.team]=Math.max(victim.s3.revealedUntil[o.team]||0,rt.api.G.time+8);
        }
      }
      if(o.age>=o.dur)removeWorld(rt,o,'expire');
    }else if(o.kind==='decoy'){
      if(o.phase==='queued'&&o.age+1e-8>=o.startDelay){
        o.phase='flight';if(o.mesh)o.mesh.visible=true;
      }
      if(o.phase==='flight'){
        const k=clamp((o.age-(o.startDelay||0))/Math.max(.05,o.flight||1.8),0,1);
        o.pos.copy(o.origin).lerp(o.target,k);o.pos.y+=Math.sin(k*Math.PI)*4;
        o.mesh?.position.copy(o.pos);
        if(k>=1){o.phase='active';o.mesh?.scale.setScalar(1.15);emitObject(rt,o,'active');}
      }
      if(o.age>=o.dur){
        if(!o.owner.remote){paintDisk(rt,o.owner,o.pos,o.paintRadius,o.seed);damageBandRadius(rt,o.owner,o.pos,o.damageBands,o.maxRadius,'superChump');}
        fxBurst(rt,o.owner,o.pos,o.maxRadius,'explode');
        removeWorld(rt,o,'expire');
      }
    }else if(o.kind==='screen'){
      const runStart=1,runEnd=1+560/FPS;
      const movingSeconds=Math.max(0,Math.min(o.age,runEnd)-Math.max(o.age-dt,runStart));
      if(movingSeconds>0)o.pos.addScaledVector(o.direction,o.moveSpeed*movingSeconds);
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
    if(state.phase==='volley'){
      // Source firing locks out movement; preserve inertial slowdown and shot timing.
      dampForSpecial(actor,dt);tickMissileVolley(rt,actor,state);
    } else {
      moveActor(rt,actor,dt,state,{squid:true});
      if(elapsed>=10)endSpecial(rt,actor,'timeout');
      else if(edges.fire||edges.sub){if(launchMissiles(rt,actor,state))tickMissileVolley(rt,actor,state);}
    }
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
    // The real Jetpack uses a held-fire auto launcher at 60F/round. A quick
    // release does not reset cooldown; SPU can extend the 450F base duration.
    const maxShots=Math.max(1,Math.floor(state.duration));
    if(it.fire&&actor.form!=='squid'&&state.inkjetShots<maxShots
      &&elapsed+1e-8>=state.nextInkjetShot){
      launchInkjet(rt,actor,state);
      state.inkjetShots++;
      state.nextInkjetShot=elapsed+60/FPS;
    }
    if(edges.sub)returnToOrigin(rt,actor,state,'return');
    else if(elapsed>=state.duration)returnToOrigin(rt,actor,state,'duration');
    return;
  }
  if(state.id==='booyahBomb'){
    // WeaponSpNiceBall: 30F startup before armor/charge; 600F to throw.
    // A full charge enables manual ZR throw, but does NOT auto-launch.
    actor.form='kid';dampForSpecial(actor,dt,0);
    const ready=elapsed+1e-8>=30/FPS,ap=state.specialPowerAP;
    if(ready){
      state.charge=Math.min(1,state.charge+gearCurve(ap,.002,.006,.01));
      if(edges.booyah&&elapsed+1e-8>=state.nextSelfNiceAt){
        state.charge=Math.min(1,state.charge+.077);
        state.nextSelfNiceAt=elapsed+10/FPS;
      }
    }
    state.cheerHeld ||= new WeakMap();
    for(const ally of rt.api.G.actors||[])if(ally!==actor&&ally.alive&&ally.team===actor.team){
      const pressed=!!ally.intent?.booyah,wasPressed=state.cheerHeld.get(ally)===true;
      state.cheerHeld.set(ally,pressed);
      if(pressed&&!wasPressed&&ready)addBooyahCall(rt,actor,state,ally,{network:ally.isLocal===true});
    }
    state.armor=ready&&state.armorHP>0;
    s.armor=state.armor;s.armorHP=state.armor?state.armorHP:0;
    if(ready&&state.charge>=1&&(edges.fire||edges.sub))throwBooyah(rt,actor,state,state.charge);
    else if(elapsed+1e-8>=600/FPS)throwBooyah(rt,actor,state,state.charge);
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
    state.inkFuel=Math.max(0,state.inkFuel-state.inkDrainPerSecond*dt);
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
    if(state.phase==='ready'&&edges.sub&&state.inkFuel>=state.hookInkCost){state.inkFuel-=state.hookInkCost;const target=aimPoint(rt,actor,35,rt.v0).clone();zipTo(rt,actor,state,target);}
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
    const rolling=!!actor.intent.squid,wasRolling=state.ballMode===true;
    state.armor=true;s.armor=true;s.armorHP=state.armorHP;
    moveActor(rt,actor,dt,state,{speed:rolling?8.5:'crab',squid:false,jump:true});
    if(wasRolling&&!rolling){
      // 11.3.0 Chariot: 20F armament delay on return from ball form.
      state.ballRecoverUntil=elapsed+20/FPS;
      state.shooterStart=undefined;state.firstShot=false;
      state.nextShot=Math.max(state.nextShot, state.ballRecoverUntil);
      state.nextCannon=Math.max(state.nextCannon, state.ballRecoverUntil);
    }
    if(edges.sub&&!rolling&&elapsed>=state.nextCannon
      &&elapsed+1e-8>=(state.ballRecoverUntil||0)){
      const origin=rt.v0.set(actor.pos.x,actor.pos.y+.95,actor.pos.z).clone(),dir=aimDirection(rt,actor,rt.v1);
      launch(rt,actor,'crabTank',origin,dir,{speed:18,grav:18,drag:.12,life:1.7,arc:2.4,damage:50,radius:4.5,size:.28,paintRadius:4.5,seed:nextSeed(state)});
      emitAction(rt,actor,state.id,state.serial,'cannon',origin,rt.v2.copy(origin).addScaledVector(dir,16),nextSeed(state));
      state.nextCannon=elapsed+75/FPS;state.cannonT=elapsed+.22;
      // Shooter spin-up resets when the 75F cannon cycle interrupts it.
      state.shooterStart=undefined;state.firstShot=false;
      state.nextShot=Math.max(state.nextShot,elapsed+32/FPS);
    }
    crabBall(rt,actor,state,rolling);
    if(!rolling&&actor.intent.fire&&elapsed+1e-8>=state.nextShot
      &&elapsed+1e-8>=(state.ballRecoverUntil||0)){
      const origin=rt.v0.set(actor.pos.x,actor.pos.y+.95,actor.pos.z).clone(),dir=aimDirection(rt,actor,rt.v1);
      const p=launch(rt,actor,'crabTank',origin,dir,{type:'shot',directOnly:true,damage:32,radius:.22,size:.13,speed:24,grav:4,drag:.04,life:1.25,seed:nextSeed(state),damageReduce:{max:32,min:16,start:9/60,end:25/60}});
      if(p)p.s3AllSpecialMode='shooter';
      emitAction(rt,actor,state.id,state.serial,'shot',origin,rt.v2.copy(origin).addScaledVector(dir,20),nextSeed(state),{damage:32});
      if(!state.firstShot)state.shooterStart=elapsed;
      state.nextShot=elapsed+crabShooterRepeatFrames(elapsed-state.shooterStart)/FPS;
      state.firstShot=true;
    }
    if(rolling&&elapsed>=state.nextBody){state.nextBody=elapsed+.45;const c=actor.pos.clone();c.y+=.75;damageBandRadius(rt,actor,c,[[1.45,40]],1.45,'crabTank');paintStamp(rt,actor,groundAt(rt,actor.pos,rt.v0),.9,nextSeed(state));}
    if(elapsed>=state.duration-25/60)endSpecial(rt,actor,'duration');return;
  }
  if(state.id==='reefslider'){
    actor.form='kid';
    // WeaponSpSkewer (11.3.0): PreMoveFrame=38, immunity after 25F;
    // MoveFrame=54, MoveAcc=MoveBrk=.031 and MoveSpeed=.405/frame;
    // MoveCancelableFrame=15; PreBurstFrame=38; UnrelaxFrame=28.
    // Keep the heading chosen at activation: the riding path is NOT steerable.
    if(state.phase==='startup'){
      if(elapsed>=25/FPS)actor.invuln=Math.max(actor.invuln,dt+.025);
      if(elapsed>=38/FPS){
        state.phase='dash';s.phase='dash';state.dashT=0;state.travel=0;state.reefSpeedRaw=0;
        actor.character?.trigger?.('special_dash');
      }
    }
    if(state.phase==='dash'){
      state.dashT+=dt;
      actor.invuln=Math.max(actor.invuln,dt+.025);
      if((edges.fire||edges.sub)&&state.dashT>=15/FPS){
        state.phase='brake';s.phase='brake';state.brakeT=0;
      }else{
        const frames=clamp(dt*FPS,0,6);
        state.reefSpeedRaw=Math.min(.405,(state.reefSpeedRaw||0)+.031*frames);
        const speed=state.reefSpeedRaw*FPS;
        actor.vel.x=state.direction.x*speed;actor.vel.z=state.direction.z*speed;
        actor.vel.y=Math.max(-5,actor.vel.y-24*dt);
        const before=actor.pos.clone(),py=actor.pos.y;
        actor.pos.addScaledVector(actor.vel,dt);actor.grounded=false;actor._resolve?.(false,py,false);
        state.travel+=Math.hypot(actor.pos.x-before.x,actor.pos.z-before.z);
        if(actor.contacts?.wall||state.dashT+1e-8>=54/FPS){
          state.phase='brake';s.phase='brake';state.brakeT=0;
        }
      }
    }
    if(state.phase==='brake'){
      actor.invuln=Math.max(actor.invuln,dt+.025);
      state.brakeT+=dt;
      state.reefSpeedRaw=Math.max(0,(state.reefSpeedRaw||0)-.031*clamp(dt*FPS,0,6));
      const speed=state.reefSpeedRaw*FPS;
      const py=actor.pos.y;actor.vel.x=state.direction.x*speed;actor.vel.z=state.direction.z*speed;
      actor.vel.y=Math.max(-5,actor.vel.y-24*dt);
      actor.pos.addScaledVector(actor.vel,dt);actor._resolve?.(false,py,false);
      if(state.brakeT+1e-8>=38/FPS)reefImpact(rt,actor,state,actor.pos.clone());
    }
    if(state.phase==='recovery'){
      state.recoveryT+=dt;
      actor.vel.x=0;actor.vel.z=0;
      if(state.recoveryT+1e-8>=28/FPS)endSpecial(rt,actor,'recovery');
    }
    return;
  }
  if(state.id==='tripleInkstrike'){
    moveActor(rt,actor,dt,state,{squid:false});
    // Activation 20F + first throw 14F. Keep early ZR presses buffered
    // instead of spawning the marker on the very first activation frame.
    if(edges.fire)state.markerQueued=true;
    if(state.markerQueued&&state.shots<3&&elapsed+1e-8>=state.nextMarker){
      state.markerQueued=false;
      deployInkstrike(rt,actor,state,state.shots++);
      state.nextMarker=elapsed+33/FPS;
      if(state.shots>=3)endSpecial(rt,actor,'deployed');
    }else if(elapsed>=state.duration)endSpecial(rt,actor,'timeout');
    return;
  }
  if(state.id==='superChump'){
    moveActor(rt,actor,dt,state,{squid:true});
    if(elapsed>=635/FPS){endSpecial(rt,actor,'timeout');return;}
    // 11.3.0: no decoy spawns unless the player explicitly places the launcher.
    if(edges.fire||edges.sub){throwChumps(rt,actor,state);return;}
    return;
  }
  if(state.id==='krakenRoyale'){
    const dir=aimDirection(rt,actor,rt.v0);state.armor=true;s.armor=true;
    if(state.phase==='dash'){
      state.dashT+=dt;const before=actor.pos.clone(),py=actor.pos.y;
      actor.vel.x=state.direction.x*21;actor.vel.z=state.direction.z*21;actor.vel.y=0;
      actor.pos.addScaledVector(actor.vel,dt);actor._resolve?.(false,py,false);
      state.dashHits||=new Set();
      for(const victim of rt.api.G.actors||[]){
        if(!victim?.alive||victim.team===actor.team||state.dashHits.has(victim))continue;
        if(krakenDashSweptContact(before,actor.pos,victim.pos,1.5)){rt.api.G.projectiles.applyHit(actor,victim,120,'krakenRoyale');state.dashHits.add(victim);}
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
    if(edges.fire||edges.sub)deployWave(rt,actor,state);
    return;
  }
}

function makeState(rt,actor,id) {
  const definition=SPECIALS[id],serial=activationSerial(actor),ap=actor.s3?.abilityPoints?.specialPower||0;
  const duration=Array.isArray(definition.duration)?gearCurve(ap,...definition.duration):definition.duration;
  const state={ id,serial,specialPowerAP:ap,t:0,duration,seed:(Math.random()*0xffffffff)>>>0,
    held:{fire:!!actor._prevIntent?.fire,sub:!!actor._prevIntent?.sub,jump:!!actor._prevIntent?.jump,squid:!!actor._prevIntent?.squid,booyah:!!actor._prevIntent?.booyah},
    phase:'active',origin:actor.pos.clone(),shots:0,beams:0,swings:0,strikes:0,zips:0,nextSwing:.05,nextBeam:.1,
    charge:0,travel:0,objectSerial:0,armor:false,hitIds:new Set(),nextBody:.2,
  };
  if(id==='booyahBomb'){state.charge=0;state.armorHP=470;state.armor=false;state.nextSelfNiceAt=30/FPS;state.cheerCalls=new WeakMap();state.cheerHeld=new WeakMap();actor.s3CatalogueBooyah=serial;if(actor.specialActive){actor.specialActive.armor=false;actor.specialActive.armorHP=0;}}
  if(id==='crabTank'){state.armorHP=500;state.cannon=false;state.nextShot=20/60;state.nextCannon=20/60;state.cannonT=0;state.firstShot=false;}
  if(id==='reefslider'){state.paintRadius=gearCurve(ap,7.51,8.26,9.012);state.damageDistanceRate=gearCurve(ap,1,1.1,1.2);state.phase='startup';state.direction=aimDirection(rt,actor,new rt.api.THREE.Vector3());state.direction.y=0;state.direction.normalize();state.startup=38/60;}
  if(id==='tripleInkstrike'){state.nextMarker=(20+14)/FPS;state.markerQueued=false;}
  if(id==='waveBreaker')state.phase='ready';
  if(id==='zipcaster')state.phase='ready';
  if(id==='krakenRoyale'){state.armorHP=Infinity;state.phase='active';state.direction=new rt.api.THREE.Vector3();}
  if(id==='killerWail')state.phase='charge';
  if(id==='inkjet'){actor.vel.y=Math.max(actor.vel.y,7.4);state.inkjetShots=0;state.nextInkjetShot=0;}
  if(id==='zipcaster'){state.inkFuel=150;state.hookInkCost=gearCurve(ap,4,2.5,1.5);state.inkDrainPerSecond=gearCurve(ap,15,13.05,12);}
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
  api.on?.('all:special',event=>{
    if(event?.action==='cheer'&&event.id==='booyahBomb'&&Number.isSafeInteger(event.ownerNid)&&Number.isSafeInteger(event.ownerLife)
      &&Number.isSafeInteger(event.activation)&&Number.isSafeInteger(event.seed))
      creditBooyahGauge(rt,event.actor,event.ownerNid,event.ownerLife,event.activation,event.seed,event.call);
  });
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
    if((state.id==='booyahBomb'&&state.t+1e-8>=30/FPS||state.id==='crabTank')&&state.armorHP>0){
      const rate=objectGearRate(attacker,state.id);
      const shield=state.armorHP,absorbed=Math.min(shield,amount*rate),left=Math.max(0,amount-absorbed/rate);
      state.armorHP=Math.max(0,shield-absorbed);
      if(this.specialActive)this.specialActive.armorHP=state.armorHP;
      api.emit?.('actor:armorhit',{actor:this,absorbed,broken:state.armorHP<=0,kind:state.id});
      if(left<=0)return false;
      return damage.call(this,left,attacker,source);
    }
    return damage.call(this,amount,attacker,source);
  };
  const P=Projectiles.prototype,update=P.update,clear=P.clear,baseCandidate=P.kitDefenseCandidate,blast=P._blastBurst;
  const fresh=P._new;
  P._new=function(...args){
    const p=fresh.apply(this,args);
    for(const key of SPECIAL_ROUND_FIELDS)delete p[key];
    return p;
  };
  P.update=function(dt){
    rt.system=this;
    // World effects use source frames too: e.g. NiceBall's 3.3 damage is per
    // 60 Hz frame, never per rendered update. Native projectile motion keeps
    // its own integrator; only catalogue devices consume this accumulator.
    if(Number.isFinite(dt)&&dt>0&&(this._s3AllSpecialObjects?.length||0)>0){
      this._s3AllSpecialWorldClock=(this._s3AllSpecialWorldClock||0)+dt;
      while(this._s3AllSpecialWorldClock+1e-10>=1/FPS){
        this._s3AllSpecialWorldClock=Math.max(0,this._s3AllSpecialWorldClock-1/FPS);
        updateWorld(rt,1/FPS);
        if(!this._s3AllSpecialObjects.length){this._s3AllSpecialWorldClock=0;break;}
      }
    }else if(!(this._s3AllSpecialObjects?.length||0))this._s3AllSpecialWorldClock=0;
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
      paintDisk(rt,p.owner,at,p.s3AllSpecialPaintRadius,p.s3AllSpecialSeed||0,p.seed);
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
    this._s3AllSpecialObjects=[];this._s3AllSpecialWorldClock=0;return clear?.apply(this,args);
  };
  for(const [id,definition]of Object.entries(SPECIALS)){
    const current=api.SPECIALS[id]||{id,name:definition.name};
    Object.assign(current,{id,name:definition.name,duration:Array.isArray(definition.duration)?definition.duration[1]:definition.duration,
      radius:definition.radius,mechanicsInstalled:true,reference:`Leanny/splat3 11.3.0 ${definition.source}`,status:definition.status,
      projectileDescriptor:p=>id==='crabTank'&&p?.type==='shot'
        ? directProjectileDescriptor(id,finite(p.radius)?p.radius:.22) : projectileDescriptor(id,p?.s3SpecialPowerAP)});
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
    if(event.attackerLife!==undefined&&actorLife(actor)!==event.attackerLife)return false;
    const rate=withObjectHitGear(actor,event.objectShredder,()=>objectGearRate(actor,object.id));
    object.hp=Math.max(0,object.hp-Math.max(1,Math.min(10000,Number(event.damage)||0))*rate);
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
    const state={serial:event.activation,objectSerial:serial-1,seed:event.seed,specialPowerAP:finite(event.specialPowerAP)?clamp(event.specialPowerAP,0,57):0};
    const extra={dur:finite(event.duration)?event.duration:1,maxRadius:finite(event.radius)?event.radius:(SPECIALS[event.id]?.radius||1),damage:0,hp:finite(event.hp)?event.hp:0,seed:event.seed,index:event.index||0,target,width:finite(event.width)&&event.width>0?event.width:15,height:finite(event.height)&&event.height>0?event.height:9,
      startDelay:finite(event.startDelay)?clamp(event.startDelay,0,4):0};
    if(kind==='screen'){
      const direction=target?target.clone().sub(point).setY(0).normalize():new rt.api.THREE.Vector3(Math.sin(actor.aimYaw||0),0,Math.cos(actor.aimYaw||0));
      extra.direction=direction;extra.moveSpeed=gearCurve(state.specialPowerAP,.04,.053,.06)*FPS;extra.yaw=Math.atan2(direction.x,direction.z);
    }
    if(kind==='booyahBlast'){extra.startDelay=finite(event.startDelay)?event.startDelay:40/FPS;extra.expand=finite(event.expand)?event.expand:40/FPS;extra.damage=3.3;}
    object=deployObject(rt,actor,event.id,kind,point,state,extra);
    if(kind==='marker'){object.phase='flight';object.origin=point.clone();object.flight=82/FPS;}
    if(kind==='decoy'){object.phase=object.startDelay>0?'queued':'flight';object.origin=point.clone();object.flight=108/FPS;if(object.mesh)object.mesh.visible=object.phase!=='queued';}
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
 * rebound to its roster Actor by the accepted sender/life envelope. Most replay
 * is presentation-only; objectHit is an explicit proposal adjudicated only by
 * the device owner. It never grants the sender ownership or changes actor HP.
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
