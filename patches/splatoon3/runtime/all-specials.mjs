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
import { disposeInkVac } from './kit-ink-vac.mjs';
import { endTrizooka } from './kit-trizooka.mjs';
import { beginZipcasterArmor, arriveZipcasterArmor, updateZipcasterArmor, clearZipcasterArmor } from './zipcaster-armor.mjs';
import { objectDamageScale, objectDamageRow, withObjectDamageCause } from './sub-resistance.mjs';
import { objectShredderEquipped, withObjectHitGear } from './object-gear.mjs';
import { specialGaugeLocked, startSpecialGauge, endSpecialGauge, SPECIAL_GAUGE_FRAMES } from './tacticooler-gauge.mjs';

const INSTALL = Symbol.for('inkwave.s3.all-specials.install.v1');
const FPS = 60, MAX_STAMP_RADIUS = 3.74;
// Nintendo 2.0.0: Zipcaster main-weapon ink consumption is 67% of normal.
// Keep affordability and debit in the native runner on the same reduced costs,
// after its equipped Ink Saver (Main) modifiers have already been applied.
// https://support.nintendo.com/jp/switch/software_support/av5ja/200.html
const ZIPCASTER_MAIN_INK_RATE = .67;
// S3 verification Wiki, Splattercolor Screen (11.2.0 table): 40 contact HP,
// one hit per 60F. WallDepth=.25 is from the pinned 11.3.0 Chimney table.
// https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/スミナガシート#spec
const SCREEN_CONTACT_INTERVAL = 60 / FPS, SCREEN_HALF_DEPTH = .25 / 2;
const q2 = n => Math.round(n * 100) / 100;
const q3 = n => Math.round(n * 1000) / 1000;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const finite3 = p => p && finite(p.x) && finite(p.y) && finite(p.z);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const SPECIALS = Object.freeze({
  tentaMissiles: { name: 'Tenta Missiles', source: 'WeaponSpMultiMissile', duration: 10, radius: 4.25, paintRadius: 3.15, near: 150, far: 30, status: '11.3.0 table: 150/50/30 at 1.1/2.1/4.25; paint radius 3.15/3.465/3.78; source launch counts 10/5/4 by target bucket and 4F missile interval; up to5-target selection and 600F aim window from gameplay reference, reticle geometry calibrated' },
  inkjet: { name: 'Inkjet', source: 'WeaponSpJetpack', duration: [7.5, 8, 8.5], radius: 5, paintRadius: 3.2, near: 50, far: 30, direct: 120, status: '11.3.0 table: 50/30 at 2.55/5, paint radius 3.2/3.6/4 and damage radii ×1/1.15/1.3 by Special Power Up; 450/480/510F; 120 direct is community-reported, flight tuning calibrated' },
  booyahBomb: { name: 'Booyah Bomb', source: 'WeaponSpNiceBall', duration: 10, radius: 12.6, paintRadius: 13.5, near: 0, far: 0, status: '11.3.0 table: 4700 armor; auto charge .002/.006/.01 per frame, self cheer .077, ally charge .088/.044/.022/.011 per cheerer, gauge credit 6/3/2/1/.5 and max15, blast radius 12.6, paint radius 13.5, paint span 6F. 3.3 damage/frame is community-reported; blast growth and charge inputs calibrated' },
  ultraStamp: { name: 'Ultra Stamp', source: 'WeaponSpUltraStamp', duration: [7.5, 9.5, 11], radius: 8, paintRadius: 5, near: 40, far: 40, status: '11.3.0 table: swing splash 40 at 4; throw 220/60 at 3.6/8, paint 5, 450/570/660F; 100 contact is community-reported and action hitboxes are calibrated' },
  zipcaster: { name: 'Zipcaster', source: 'WeaponSpSuperHook', duration: 9, radius: 6, paintRadius: 1.4, near: 45, far: 35, status: '11.3.0 table: 540F, 1.5× ink capacity, hook/per-second ink costs vary with Special Power Up; hook blast 45/35 at 5.25/6; direct hit and hook flight mapping still need game comparison' },
  killerWail: { name: 'Killer Wail 5.1', source: 'WeaponSpMicroLaser', duration: [308/60, 348/60, 368/60], radius: 27, paintRadius: 0, near: 3.5, far: 3.5, status: '11.3.0 table: 36F charge, 35 raw every 5F, 180/220/240F laser lifetime, 20F after-wait and dual launch; world conversion/lock geometry calibrated' },
  crabTank: { name: 'Crab Tank', source: 'WeaponSpChariot', duration: [8, 9.5, 11], radius: 4.8, paintRadius: 4.5, near: 30, far: 30, direct: 50, status: '11.3.0 table: 20F shooter/cannon start, shooter repeat 12F→4F over90F (bias.2; interpolation calibrated), cannon lock32F, 500 armor, 480/570/660F; 25F finish lock and steering need retail comparison' },
  reefslider: { name: 'Reefslider', source: 'WeaponSpSkewer', duration: 158/FPS, radius: 14.9, paintRadius: 7.51, near: 220, far: 70, status: '11.3.0 table: 38F grounded startup, invulnerability from25F, movement54F/cancel after15F, recovery28F and player collision radius.8; blast/contact220/70, SPU damage×1/1.1/1.2 and paint7.51/8.26/9.012; trajectory calibrated' },
  tripleInkstrike: { name: 'Triple Inkstrike', source: 'WeaponSpTripleTornado', duration: 6, radius: 7.7, paintRadius: 7, near: 37.5, far: 37.5, status: '11.3.0 table: 360F, 7.7 damage radius, 7 paint and 50F spread; 37.5 per 5F from public mechanics, marker flight calibrated' },
  superChump: { name: 'Super Chump', source: 'WeaponSpFirework', duration: 10.583, radius: 6, paintRadius: 3.5, near: 70, far: 35, status: '11.3.0 table: 70/35 at 3.6/6, paint radius 3.5/3.8/4.1 and damage radii ×1/1.1/1.2 by Special Power Up; decoy HP 60, 108F flight, 210F burst and 635F special; count/spread calibrated' },
  krakenRoyale: { name: 'Kraken Royale', source: 'WeaponSpCastle', duration: [8, 9, 10], radius: 2.65, paintRadius: 1.2, near: 60, far: 60, status: '11.3.0 table: charge cancellable through34F, charge35F, dash35F, jump60, and 480/540/600F; charge-release direction/hitbox calibration remains' },
  splattercolorScreen: { name: 'Splattercolor Screen', source: 'WeaponSpChimney', duration: 11.333, radius: 15, paintRadius: 0, near: 40, far: 40, status: '11.3.0 table: 60F startup, 560F running, 60F closing; touch 400 raw, mark 120F, saturation 360F; moving-wall scale calibrated' },
  waveBreaker: { name: 'Wave Breaker', source: 'WeaponSpShockSonar', duration: 6.5, radius: [20, 24, 27], paintRadius: 0, near: 45, far: 45, status: '11.3.0 table: pulses at 90/240/390F; wiki device lifetime ~6.5s, each wave ~2.67s, 8s tracking; 480 device HP, 30 contact damage/0.5s, 45F generator mark and 160/192/216F wave travel; ground mapping calibrated' },
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
const booyahAfterArmor = new WeakMap();
const runtimes = new WeakMap();
const replaySeen = new WeakMap();
const SEEN_LIMIT = 384;
const SPECIAL_ROUND_FIELDS = Object.freeze(['s3AllSpecial','s3AllSpecialPaintRadius','s3AllSpecialActivation','s3AllSpecialSeed','s3DamageReduce',
  's3TentaTarget','s3TentaTargetActor','s3TentaTargetLife','s3TentaAge','s3TentaDescending','s3TentaDirection','s3TentaLaunchedAt','s3AllSpecialMode','s3PaintNoSpecial',
  's3SpecialPowerAP','s3AllSpecialCrossPaintRadius','s3AllSpecialCrossPaintLength','s3AllSpecialSplashAroundRadius','s3AllSpecialSplashAroundCount',
  's3AllSpecialSplashAroundOffsetY','s3AllSpecialSplashAroundVelocityMin','s3AllSpecialSplashAroundVelocityMax','s3AllSpecialSplashAroundPitchMin',
  's3AllSpecialSplashAroundPitchMax','s3AllSpecialTrailPaintWidth','s3AllSpecialTrailPaintDepthScale','s3AllSpecialTrailPaintSpanFrames',
  's3AllSpecialFlight','s3AllSpecialFlightCarry']);

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
  const h = state.held || (state.held = { fire: false, sub: false, jump: false, squid: false, booyah: false });
  const e = state.edges || (state.edges = { fire: false, fireUp: false, sub: false, subUp: false, jump: false, squid: false, booyah: false });
  e.fire = fire && !h.fire; e.fireUp = !fire && h.fire;
  e.sub = sub && !h.sub; e.subUp = !sub && h.sub;
  e.jump = jump && !h.jump; e.squid = squid && !h.squid;
  e.booyah = booyah && !h.booyah;
  h.fire = fire; h.sub = sub; h.jump = jump; h.squid = squid; h.booyah = booyah;
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
function specialDescription(id, ap = 0) {
  const source = descriptions[id];
  if (!source) return null;
  let radius = source.radius, paintRadius = source.paintRadius;
  let scale = 1;
  if (id === 'tentaMissiles') paintRadius = gearCurve(ap, 3.15, 3.465, 3.78);
  if (id === 'inkjet') {
    paintRadius = gearCurve(ap, 3.2, 3.6, 4.0);
    scale = gearCurve(ap, 1, 1.15, 1.3);
  }
  if (id === 'reefslider') {
    paintRadius = gearCurve(ap, 7.51, 8.26, 9.012);
    scale = gearCurve(ap, 1, 1.1, 1.2);
  }
  if (id === 'superChump') {
    paintRadius = gearCurve(ap, 3.5, 3.8, 4.1);
    scale = gearCurve(ap, 1, 1.1, 1.2);
  }
  if (scale !== 1) radius *= scale;
  const splashBands = source.splashBands.map(([r, damage]) => [q3(r * scale), damage]);
  return { ...source, radius, paintRadius, splashBands };
}
function specialPaintParams(id,ap=0) {
  const desc=specialDescription(id,ap);
  const result={radius:desc?.paintRadius||0,crossRadius:0,crossLength:0,splashAroundRadius:0,splashAroundCount:0,
    splashAroundOffsetY:0,splashAroundVelocityMin:0,splashAroundVelocityMax:0,splashAroundPitchMin:0,splashAroundPitchMax:0,
    trailWidth:0,trailDepthScale:1,trailSpanFrames:1};
  if(id==='tentaMissiles'){result.crossRadius=gearCurve(ap,2,2,2);result.crossLength=gearCurve(ap,3,3,3);}
  if(id==='inkjet'){
    result.splashAroundRadius=gearCurve(ap,.63,.665,.7);result.splashAroundCount=10;result.splashAroundOffsetY=.3;
    result.splashAroundVelocityMin=gearCurve(ap,.49,.505,.52);result.splashAroundVelocityMax=gearCurve(ap,.33,.34,.35);
    result.splashAroundPitchMin=5;result.splashAroundPitchMax=30;
  }
  if(id==='superChump'){
    result.crossRadius=gearCurve(ap,2.5,2.75,3);result.crossLength=gearCurve(ap,2.5,2.75,3);
    result.splashAroundRadius=1.116;result.splashAroundCount=1;result.splashAroundVelocityMin=.64;result.splashAroundVelocityMax=.64;
    result.splashAroundPitchMax=45;
  }
  if(id==='reefslider'){
    result.splashAroundRadius=gearCurve(ap,1,1.1,1.2);result.splashAroundCount=15;result.splashAroundOffsetY=.3;
    result.splashAroundVelocityMin=gearCurve(ap,.6,.65,.7);result.splashAroundVelocityMax=gearCurve(ap,.7,.75,.8);
    result.splashAroundPitchMax=30;
  }
  if(id==='zipcaster'){
    result.crossRadius=1.4;result.crossLength=1.4;result.trailWidth=1;result.trailDepthScale=1.5;result.trailSpanFrames=2;
  }
  return result;
}
function sourceFlight(id,mode,type,ap=0) {
  // Pinned 11.3.0 source unit conversions: velocity/F ×60, gravity/F² ×3600,
  // and AirResist as per-frame retention, exponentiated by dt×60 in the stepper.
  if(id==='booyahBomb')return {spawnSpeed:gearCurve(ap,1,1,1)*60,spawnYMin:-.4*60,gravity:.021*3600,
    positionAirResist:.045,source:'WeaponSpNiceBall.MoveParam'};
  if(id==='ultraStamp'&&(mode==='throw'||type==='blast'))return {spawnSpeed:gearCurve(ap,.85,.85,.85)*60,
    spawnY:.17*60,spawnYMin:-.4*60,gravity:.013*3600,positionAirResist:.03,source:'WeaponSpUltraStamp.ThrowMoveParam'};
  if(id==='crabTank'&&(mode==='shooter'||type==='shot'))return {spawnSpeed:3.36*60,straightFrames:7,maxSpeed:2.232*60,
    gravity:.016*3600,source:'WeaponSpChariot.ShooterMoveParam'};
  if(id==='crabTank'&&(mode==='cannon'||type==='blast'))return {straightFrames:8,brakeFrames:1,
    brakeGravity:.04*3600,brakeAirResist:.1,gravity:.05*3600,airResist:.12,source:'WeaponSpChariot.CannonParam.MoveParam'};
  return null;
}
function stepSourceFlight(system,p,dt,step) {
  const source=p?.s3AllSpecialFlight;
  if(!source||!(dt>0)||!finite(dt))return step.call(system,p,dt);
  let carry=(p.s3AllSpecialFlightCarry||0)+dt,frames=Math.floor(carry*FPS+1e-8);
  p.s3AllSpecialFlightCarry=carry-frames/FPS;
  if(!frames)return false;
  for(let i=0;i<frames;i++){
    const frame=Math.round((p.age||0)*FPS),straight=source.straightFrames||0;
    if(source.maxSpeed&&frame===straight){const speed=p.vel.length();if(speed>source.maxSpeed)p.vel.multiplyScalar(source.maxSpeed/speed);}
    let gravity=source.gravity||0,resistance=source.airResist||0,positionResistance=source.positionAirResist||0;
    if(source.brakeFrames){
      if(frame<straight){gravity=0;resistance=0;}
      else if(frame<straight+source.brakeFrames){gravity=source.brakeGravity;resistance=source.brakeAirResist;}
    }else if(frame<straight){gravity=0;resistance=0;positionResistance=0;}
    if(gravity)p.vel.y-=gravity/FPS;
    if(resistance)p.vel.multiplyScalar(Math.pow(1-resistance,1));
    if(positionResistance){const retain=Math.pow(1-positionResistance,1);p.vel.x*=retain;p.vel.z*=retain;}
    // The source force is integrated once per source frame above. Disable the
    // native generic force pass for this substep so host render Hz cannot alter
    // the trajectory or apply the same force a second time.
    const grav=p.grav,drag=p.drag,straightTime=p.straight;
    p.grav=0;p.drag=0;p.straight=0;
    let done;
    try{done=step.call(system,p,1/FPS);}finally{p.grav=grav;p.drag=drag;p.straight=straightTime;}
    if(done)return done;
  }
  return false;
}
function projectileDescriptor(id, ap=0) {
  const power=Number.isFinite(ap)?clamp(ap,0,57):0;
  const spec=specialDescription(id,power);
  if (!spec) return null;
  const paint=spec.paintRadius??spec.radius;
  const bands=spec.splashBands.map(([r,d])=>[r,d]);
  return {
    id, wid:id, kind:id, name:SPECIALS[id].name,
    type:'blast', splashRadius:spec.radius, burstRadius:spec.radius,
    ...(['inkjet','tentaMissiles'].includes(id)?{specialPowerAP:power}:{}),
    impactRadius:Math.min(paint,MAX_STAMP_RADIUS),
    paintRadius:Math.min(paint,MAX_STAMP_RADIUS),splashDamageMax:spec.damageMax,
    splashDamageMin:spec.damageMin,damageMax:spec.damageMax,damageMin:spec.damageMin,
    directDamage:spec.directDamage,splashBands:bands,damageBands:bands,status:SPECIALS[id].status,
  };
}
function directProjectileDescriptor(id, radius) {
  return { ...projectileDescriptor(id), type: 'shot', splashRadius: 0,
    burstRadius: 0, splashBands: [], impactRadius: radius, paintRadius: radius };
}
function launch(rt, actor, id, origin, direction, opts = {}) {
  const system = rt.api.G.projectiles;
  if (!system?._new || !system?._push || actor.remote) return null;
  const ap=actorStates.get(actor)?.specialPowerAP||0, descriptor=projectileDescriptor(id,ap), p=system._new();
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
  if(opts.sourceMode)p.s3AllSpecialMode=opts.sourceMode;
  p.pos.copy(origin); p.prev.copy(origin); p.start.copy(origin);
  p.vel.copy(dir).multiplyScalar(speed);
  if (opts.arc) p.vel.y += opts.arc;
  const flight=sourceFlight(id,opts.sourceMode,p.type,ap);
  if(flight){
    p.s3AllSpecialFlight=flight;p.s3AllSpecialFlightCarry=0;
    p.straight=flight.straightFrames!==undefined?flight.straightFrames/FPS:0;
    if(flight.spawnSpeed){p.vel.copy(dir).multiplyScalar(flight.spawnSpeed);if(flight.spawnY)p.vel.y+=flight.spawnY;}
    if(flight.spawnYMin!==undefined)p.vel.y=Math.max(flight.spawnYMin,p.vel.y);
  }
  // Direct rounds still need a special identity so main-weapon wrappers cannot
  // substitute the owner's gravity, collision, flight paint or weapon id.
  p.s3SpecialWeapon = opts.directOnly ? directProjectileDescriptor(id, opts.radius ?? .22) : descriptor;
  p.s3Weapon = opts.weapon || p.s3SpecialWeapon || { id, kind: 'special', special: id };
  p.s3AllSpecial = id;p.s3SpecialPowerAP=ap;
  p.s3PaintNoSpecial = true;
  const paint = specialPaintParams(id, ap);
  p.s3AllSpecialPaintRadius = opts.paintRadius ?? paint.radius ?? 0;
  p.s3AllSpecialCrossPaintRadius = paint.crossRadius;
  p.s3AllSpecialCrossPaintLength = paint.crossLength;
  p.s3AllSpecialSplashAroundRadius = paint.splashAroundRadius;
  p.s3AllSpecialSplashAroundCount = paint.splashAroundCount;
  p.s3AllSpecialSplashAroundOffsetY = paint.splashAroundOffsetY;
  p.s3AllSpecialSplashAroundVelocityMin=paint.splashAroundVelocityMin;
  p.s3AllSpecialSplashAroundVelocityMax=paint.splashAroundVelocityMax;
  p.s3AllSpecialSplashAroundPitchMin=paint.splashAroundPitchMin;
  p.s3AllSpecialSplashAroundPitchMax=paint.splashAroundPitchMax;
  p.s3AllSpecialTrailPaintWidth = paint.trailWidth;
  p.s3AllSpecialTrailPaintDepthScale = paint.trailDepthScale;
  p.s3AllSpecialTrailPaintSpanFrames = paint.trailSpanFrames;
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
function paintDiskLayout(rt, point, radius) {
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
  const seen=new Set(),tiles=[];
  for(const [x,z]of centres){
    const at=rt.v4.copy(point).addScaledVector(tangent,x).addScaledVector(bitangent,z);at.set(q2(at.x),q2(at.y),q2(at.z));
    const key=at.x+','+at.y+','+at.z;if(seen.has(key))continue;seen.add(key);tiles.push({x,z,key});
  }
  return {tangent,bitangent,tiles};
}
function paintDiskTile(rt,actor,point,layout,tile,maskSeed){
  const at=rt.v4.copy(point).addScaledVector(layout.tangent,tile.x).addScaledVector(layout.bitangent,tile.z);
  at.set(q2(at.x),q2(at.y),q2(at.z));
  const got=rt.api.G.paint.splat(at,MAX_STAMP_RADIUS,actor.team,{seed:maskSeed,claimOwner:actor,claimMode:'no-special'});
  return finite(got)?got:0;
}
function paintDisk(rt, actor, point, radius, seed, maskSeed = seedUnit(seed,0), alreadyPainted = null) {
  if (radius <= MAX_STAMP_RADIUS) return paintStamp(rt, actor, point, radius, seed);
  // Cluster ordinary network-admissible stamps; do not emit one over-limit paint
  // row, which the public replication owner correctly rejects.
  const layout=paintDiskLayout(rt,point,radius);let area=0;
  for(const tile of layout.tiles){if(alreadyPainted?.has(tile.key))continue;area+=paintDiskTile(rt,actor,point,layout,tile,maskSeed);}
  if (area > 0) actor.addTurfNoSpecial?.(area);
  return area;
}
function paintBooyahGrowth(rt,object,paintFrame,paintRadius,seed){
  const growthRadius=paintRadius*paintFrame/6;
  if(paintFrame===1){const area=paintStamp(rt,object.owner,object.pos,growthRadius,seed);object.paintFrame=paintFrame;object.paintedRadius=growthRadius;return area;}
  object.paintDiskTiles||=new Set();
  const layout=paintDiskLayout(rt,object.pos,paintRadius),maskSeed=seedUnit(seed,0),limit=growthRadius-MAX_STAMP_RADIUS;
  let area=0;
  for(const tile of layout.tiles){
    if(object.paintDiskTiles.has(tile.key)||Math.hypot(tile.x,tile.z)>limit+1e-8)continue;
    area+=paintDiskTile(rt,object.owner,object.pos,layout,tile,maskSeed);object.paintDiskTiles.add(tile.key);
  }
  if(area>0)object.owner.addTurfNoSpecial?.(area);
  object.paintFrame=paintFrame;object.paintedRadius=growthRadius;
  if(paintFrame===6)paintDisk(rt,object.owner,object.pos,paintRadius,seed,maskSeed,object.paintDiskTiles);
  return area;
}
function paintCross(rt,actor,point,radius,checkLength,seed) {
  if(!(radius>0)||!(checkLength>0))return 0;
  const directions=[[1,0],[-1,0],[0,1],[0,-1]];let painted=0;
  for(let i=0;i<directions.length;i++){
    const [x,z]=directions[i],at=rt.v6.copy(point);at.x+=x*checkLength;at.z+=z*checkLength;
    painted+=paintStamp(rt,actor,at,radius,seedUnit(seed,i));
  }
  return painted;
}
function paintSplashAround(rt,actor,point,params,seed) {
  const {splashAroundRadius:radius,splashAroundCount:count,splashAroundOffsetY:offsetY=0}=params||{};
  if(!(radius>0)||!(count>0))return 0;let painted=0;
  // Source velocity is per frame. Splash landing time and exact launch geometry
  // are not in the pinned table, so the four-frame range projection remains a
  // calibrated placement while source speed, pitch, count, and paint radius are
  // consumed independently.
  for(let i=0;i<count;i++){
    const angle=seedUnit(seed,i)*Math.PI*2,speedMin=params.splashAroundVelocityMin||0,
      speedMax=params.splashAroundVelocityMax||speedMin,
      speed=speedMin+(speedMax-speedMin)*seedUnit(seed,i+count),
      pitchMin=params.splashAroundPitchMin||0,pitchMax=params.splashAroundPitchMax||0,
      pitch=(pitchMin+(pitchMax-pitchMin)*seedUnit(seed,i+count*2))*Math.PI/180,
      reach=speed*4*Math.cos(pitch);
    const at=rt.v6.set(point.x+Math.cos(angle)*reach,point.y+offsetY,point.z+Math.sin(angle)*reach);
    painted+=paintStamp(rt,actor,at,radius,seedUnit(seed,i+count*3));
  }
  return painted;
}
function paintSpecialChannels(rt,actor,point,params,seed) {
  if(!params)return 0;
  return paintCross(rt,actor,point,params.crossRadius,params.crossLength,seed)+
    paintSplashAround(rt,actor,point,params,seed);
}
function specialObjectDamage(rt,attack,object,amount,cause=null,at=object.pos) {
  if(!object||object.dead||!(object.hp>0)||object.owner?.team===attack?.team||!(amount>0)||attack?.remote)return false;
  const damage=amount*objectDamageScale(attack,object.id,cause);
  if(!(damage>0))return false;
  if(object.owner?.remote){
    const shooter=attack?.owner&&typeof attack.owner==='object'?attack.owner:attack;
    if(!shooter||shooter.remote)return false;
    const event={actor:shooter,id:object.id,activation:object.activation,action:'objectHit',pos:vecArray(object.pos),target:vecArray(at),seed:normalizedSeed(object.seed),object:object.serial||0,index:object.index||0,
      ownerNid:Number.isInteger(object.owner?.nid)?object.owner.nid:-1,ownerLife:actorLife(object.owner),attackerLife:actorLife(shooter),objectShredder:objectShredderEquipped(shooter),cause:objectDamageRow(attack,cause),damage:Math.max(0,Math.min(10000,amount)),tick:(object.proposalSerial=((object.proposalSerial||0)+1))};
    if(event.pos&&event.target)rt.api.emit?.('all:special',event);
    return !!event.pos&&!!event.target;
  }
  object.hp=Math.max(0,object.hp-damage);
  if(object.hp<=0)removeWorld(rt,object,'destroy');else emitObject(rt,object,'hit');
  return true;
}
function specialObjectRadius(rt,attack,center,radius,damageAt,cause=null,includeSubs=true) {
  for(const object of rt.system?._s3AllSpecialObjects||[]){
    if(object.dead||!(object.hp>0)||object.owner?.team===attack?.team)continue;
    const d=object.pos.distanceTo(center);if(d>radius)continue;
    if(rt.api.G.physics?.los&&!rt.api.G.physics.los(center,object.pos))continue;
    const amount=damageAt(d,object);if(amount>0)specialObjectDamage(rt,attack,object,amount,cause,center);
  }
  if(includeSubs)rt.system?.s3DamageSubObjects?.(attack,center,radius,damageAt,cause);
}
function damageRadius(rt, actor, id, center, near, far, radius, source = id, once = null, objectCause = source) {
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
  specialObjectRadius(rt,actor,center,radius,d=>d<=radius*.45?near:near+(far-near)*clamp(d/Math.max(radius,1e-6),0,1),objectCause);
  return applied;
}
function damageBandRadius(rt, actor, center, bands, radius, source, once = null, height = 2.8, objectCause = source) {
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
  specialObjectRadius(rt,actor,center,radius,d=>{
    if(!bands.length||d>radius)return 0;
    if(d<=bands[0][0])return bands[0][1];
    for(let i=1;i<bands.length;i++)if(d<=bands[i][0]){
      const [r0,d0]=bands[i-1],[r1,d1]=bands[i];return r1===r0?d1:d0+(d1-d0)*((d-r0)/(r1-r0));
    }
    return bands.at(-1)?.[1]||0;
  },objectCause);
  return applied;
}
// 11.3.0 WeaponSpCastle.BodyParam.CollisionDashRadiusForPlayer = 1.5.
// Test against the whole travel segment, not just the centre of one frame.
export function krakenDashSweptContact(from,to,target,radius=1.5){
  if(![from?.x,from?.z,to?.x,to?.z,target?.x,target?.z,radius].every(finite)||radius<0)return false;
  // Test-only planar positions are supported when all three omit y. Actual
  // Actor positions include y; a horizontal-only sweep incorrectly hits an
  // opponent on an upper platform through the floor.
  const missing=[from.y,to.y,target.y].filter(y=>y===undefined).length;
  if(missing!==0&&missing!==3)return false;
  if(missing===0&&![from.y,to.y,target.y].every(finite))return false;
  const dy=missing===3?0:to.y-from.y,dx=to.x-from.x,dz=to.z-from.z;
  const lengthSq=dx*dx+dy*dy+dz*dz;
  const proj=(target.x-from.x)*dx+(target.z-from.z)*dz+
    (missing===3?0:(target.y-from.y)*dy);
  const t=lengthSq>1e-12?clamp(proj/lengthSq,0,1):0;
  const x=target.x-(from.x+t*dx),z=target.z-(from.z+t*dz);
  const y=missing===3?0:target.y-(from.y+t*dy);
  return x*x+y*y+z*z<=radius*radius;
}
// 11.3.0 WeaponSpChariotParam: lateral X=.075/F, forward Z=.015/F.
// Preserve the native mode's 60Hz unit bridge, with a camera-relative turn.
export function crabTankAttackTargetVelocity(move,yaw=0){
  if(![move?.x,move?.z,yaw].every(finite))return {x:0,z:0};
  const length=Math.hypot(move.x,move.z),norm=length>1?1/length:1,mx=move.x*norm,mz=move.z*norm;
  const fx=Math.sin(yaw),fz=Math.cos(yaw),rx=fz,rz=-fx;
  const lateral=mx*rx+mz*rz,forward=mx*fx+mz*fz;
  return {x:(rx*lateral*.075+fx*forward*.015)*FPS,z:(rz*lateral*.075+fz*forward*.015)*FPS};
}
function moveActor(rt, actor, dt, state, { speed = null, squid = true, jump = true, flight = false } = {}) {
  const P = rt.api.PLAYER, move = actor.intent?.move;
  const useSquid = squid && !!actor.intent?.squid;
  actor.form = useSquid ? 'squid' : 'kid';
  const enemyInk = actor.grounded && actor.groundTeam === 2;
  if (speed == null) actor._horizontal?.(dt, useSquid, enemyInk);
  else if(speed==='crab'){
    const target=crabTankAttackTargetVelocity(move,actor.aimYaw??actor.yaw??0);
    const alpha=1-Math.exp(-8*dt);
    actor.vel.x+=(target.x-actor.vel.x)*alpha;
    actor.vel.z+=(target.z-actor.vel.z)*alpha;
  }else {
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
// Geometry + material of one deployable's world mesh. Shared with the program
// keepers in special-motion.mjs, so their warmed programs match exactly.
export function worldMeshParts(THREE, kind, color) {
  let geometry, material;
  if (kind === 'screen') {
    geometry = new THREE.PlaneGeometry(8, 4.5);
    material = new THREE.MeshBasicMaterial({ color, transparent:true, opacity:.34, side:THREE.DoubleSide, depthWrite:false });
  } else if (kind === 'wave') {
    geometry = new THREE.CylinderGeometry(.38,.38,1.15,10);
    material = new THREE.MeshStandardMaterial({ color, emissive:color, emissiveIntensity:.22, roughness:.42 });
  } else if (kind === 'waveFront') {
    geometry = new THREE.RingGeometry(.96,1,48);
    material = new THREE.MeshBasicMaterial({ color, transparent:true, opacity:.7, side:THREE.DoubleSide, depthWrite:false });
  } else {
    geometry = new THREE.SphereGeometry(kind === 'decoy' ? .42 : .7, 10, 8);
    material = new THREE.MeshStandardMaterial({ color, emissive:color, emissiveIntensity:.22, roughness:.55,
      transparent:kind === 'strike'||kind === 'crabBall', opacity:kind === 'strike'?.42:kind === 'crabBall'?.72:1 });
  }
  return { geometry, material };
}
// one of each distinct worldMeshParts material variant (other kinds share the sphere branch)
export const WORLD_MESH_KINDS = Object.freeze(['screen', 'wave', 'waveFront', 'decoy', 'strike', 'crabBall']);
function worldMesh(rt, owner, kind, center, scale = [1,1,1]) {
  const { THREE, G } = rt.api;
  if (!G.scene?.add || !THREE?.Mesh) return null;
  const { geometry, material } = worldMeshParts(THREE, kind, colorOf(rt,owner));
  const mesh = new THREE.Mesh(geometry, material);
  if (kind === 'waveFront') mesh.rotation.x = -Math.PI / 2;
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
  if(object.kind==='wave'||object.kind==='screen')endSpecialGauge(object.owner,object.id,object);
  if (!object.owner?.remote) emitObject(rt,object,reason);
  return true;
}
function paintRing(rt, actor, point, radius, seed) {
  if (!(radius > 0)) return 0;
  const stamp = Math.min(MAX_STAMP_RADIUS, 1.3);
  const count = Math.max(8, Math.ceil(2 * Math.PI * radius / (stamp * 1.65)));
  let painted = 0;
  for (let i = 0; i < count; i++) {
    const angle = i / count * Math.PI * 2;
    const at = rt.v4.set(point.x + Math.cos(angle) * radius, point.y, point.z + Math.sin(angle) * radius);
    painted += paintStamp(rt, actor, at, stamp, seedUnit(seed, i));
  }
  return painted;
}
function projectileObjectCause(p) {
  const id=p?.s3AllSpecial||p?.s3SpecialWeapon?.id||p?.wid;
  if(id==='inkjet')return p.s3AllSpecialMode==='blast'?'Jetpack_BombCore':'Jetpack_Bullet';
  if(id==='tentaMissiles')return p.s3AllSpecialMode==='blast'?'MultiMissile_BombCore':'MultiMissile_Bullet';
  if(id==='inkVac')return p.s3AllSpecialMode==='blast'?'BlowerExhale_BombCore':'BlowerExhale';
  if(id==='ultraStamp')return p.s3AllSpecialMode==='blast'?'UltraStamp_Throw_BombCore':'UltraStamp_Throw';
  if(id==='crabTank')return p.s3AllSpecialMode==='blast'?'Chariot_Cannon':'Default';
  return id||null;
}
function objectHitProposal(rt, p, object, cause=projectileObjectCause(p)) {
  const shooter = p?.owner;
  if (!shooter || shooter.remote || p.ghost) return null;
  const event = {
    actor: shooter, id: object.id, activation: object.activation, action:'objectHit',
    pos: vecArray(object.pos), target: vecArray(p.pos), seed: normalizedSeed(object.seed),
    object: object.serial || 0, index: object.index || 0,
    ownerNid: Number.isInteger(object.owner?.nid) ? object.owner.nid : -1,
    ownerLife: actorLife(object.owner), attackerLife: actorLife(shooter), objectShredder: objectShredderEquipped(shooter),
    damage: Math.max(0, Math.min(10000, Number(p.damage) || 0)),cause,
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
    return specialObjectDamage(rt,p,object,Number(p?.damage)||0,projectileObjectCause(p),hit.point);
  }};
}
function chumpCandidate(rt, p, start, end, object) {
  if(object.dead||object.kind!=='decoy'||object.owner?.team===p?.team)return null;
  const hit=sphereEntry(rt,start,end,object.pos,.48);if(!hit)return null;
  const length=start.distanceTo(end),point=hit.point;let settled=false;
  return {distance:length*hit.t,point,normal:rt.v11.subVectors(point,object.pos).normalize().clone(),kind:'super-chump',onHit:()=>{
    if(p?.ghost||settled||object.dead)return false;settled=true;
    return specialObjectDamage(rt,p,object,Number(p?.damage)||0,projectileObjectCause(p),hit.point);
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
  // Killer Wail is a piercing laser. Generic projectile arbitration would
  // truncate it at walls and apply an untagged projectile hit before the
  // source-aware MicroLaser object pass below.
  const end=rt.v12.copy(origin).addScaledVector(direction,length);
  const touched=new Set();
  for(const victim of rt.api.G.actors||[]) {
    if(!victim.alive||victim.team===actor.team||touched.has(victim))continue;
    const base=rt.v13.set(victim.pos.x,victim.pos.y+.7,victim.pos.z);
    // closest point on the finite beam segment; a cylinder radius of 0.85 is
    // a world-scale calibration of the sourced continuous laser capsule.
    const d=rt.v14.subVectors(end,origin), dd=d.lengthSq();
    const t=dd>1e-9?clamp(rt.v10.subVectors(base,origin).dot(d)/dd,0,1):0;
    const near=rt.v15.copy(origin).addScaledVector(d,t);
    if(base.distanceTo(near)>.85)continue;
    rt.api.G.projectiles.applyHit(actor,victim,damage,'killerWail');touched.add(victim);
  }
  if(!actor.remote&&system){
    for(const object of system._s3AllSpecialObjects||[]){
      if(object.dead||!(object.hp>0)||object.owner?.team===actor.team)continue;
      if(beamTouchesObject(rt,origin,end,object))specialObjectDamage(rt,actor,object,damage,'MicroLaser',object.pos);
    }
    const span=origin.distanceTo(end),mid=rt.v15.copy(origin).lerp(end,.5),bound=span*.5+3;
    system.s3DamageSubObjects?.(actor,mid,bound,(d,object)=>beamTouchesObject(rt,origin,end,object)?damage:0,'MicroLaser',{pierceLOS:true});
    system.damageBigBubblerFromBeam?.(actor,origin,end,damage,'MicroLaser');
  }
  rt.api.G.fx?.ring?.(origin, direction, colorOf(rt,actor), {radius:Math.min(4,length),life:.22});
  return end;
}
function beamTouchesObject(rt,from,to,object) {
  const pos=object?.pos;if(!pos)return false;
  if(object.subId==='splashWall'){
    const yaw=object.yaw||0,tx=Math.cos(yaw),tz=-Math.sin(yaw),nx=Math.sin(yaw),nz=Math.cos(yaw);
    const span=from.distanceTo(to),steps=Math.max(1,Math.ceil(span/.35));
    for(let i=0;i<=steps;i++){
      const p=rt.v14.copy(from).lerp(to,i/steps),dx=p.x-pos.x,dz=p.z-pos.z;
      if(Math.abs(dx*tx+dz*tz)<=((object.spec?.wallWidth||2)/2+.2)&&p.y>=pos.y-.25&&p.y<=pos.y+(object.spec?.wallHeight||3)+.25&&Math.abs(dx*nx+dz*nz)<=.45)return true;
    }
    return false;
  }
  const radius=object.collisionRadius||(object.kind==='decoy'?.48:.72);
  return segmentDistance(rt,pos,from,to)<=radius;
}
function screenObjectContact(rt,screen,from,to,object) {
  if(!object?.pos)return null;
  const y=object.pos.y+(object.subId==='splashWall'?(object.spec?.wallHeight||3)/2:.45);
  const center=rt.v13.set(object.pos.x,y,object.pos.z),fromSide=rt.v14.subVectors(center,from).dot(screen.normal),toSide=rt.v15.subVectors(center,to).dot(screen.normal);
  const radius=object.subId==='splashWall'?.65:(object.collisionRadius||.72);
  if((fromSide>radius&&toSide>radius)||(fromSide< -radius&&toSide< -radius))return null;
  const denom=fromSide-toSide,t=Math.abs(denom)>1e-8?clamp(fromSide/denom,0,1):(Math.abs(fromSide)<Math.abs(toSide)?0:1);
  const sheet=rt.v12.copy(from).lerp(to,t),dx=center.x-sheet.x,dz=center.z-sheet.z;
  if(Math.abs(dx*screen.tangent.x+dz*screen.tangent.z)>screen.width/2+radius||center.y<sheet.y-radius||center.y>sheet.y+screen.height+radius)return null;
  return sheet.clone();
}
function screenDamageObjects(rt,screen,from,to) {
  if(screen.owner.remote)return;
  const now=screen.age,last=screen.lastObjectCross||=new WeakMap();
  const canHit=object=>{
    const point=screenObjectContact(rt,screen,from,to,object);if(!point)return null;
    if(now-(last.get(object)??-Infinity)+1e-8<SCREEN_CONTACT_INTERVAL)return null;
    last.set(object,now);return point;
  };
  for(const object of rt.system?._s3AllSpecialObjects||[]){
    if(object===screen||object.owner?.team===screen.team||object.dead||!(object.hp>0))continue;
    const point=canHit(object);if(point)specialObjectDamage(rt,screen.owner,object,40,'Chimney',point);
  }
  const center=rt.v12.copy(from).lerp(to,.5),radius=screen.width/2+3;
  rt.system?.s3DamageSubObjects?.(screen.owner,center,radius,(_distance,object)=>canHit(object)?40:0,'Chimney',{pierceLOS:true});
}
function screenPlayerContact(rt,screen,previous,victim) {
  // Swept native collider contact against this runtime's rectangular sheet.
  // The retail sheet's curved silhouette/vertical profile remains calibrated.
  const before=previous?.pos||victim.pos,oldSheet=previous?.screen||screen.pos;
  const fromSide=rt.v1.subVectors(before,oldSheet).dot(screen.normal);
  const toSide=rt.v2.copy(victim.pos).sub(screen.pos).dot(screen.normal);
  const delta=fromSide-toSide;
  const t=Math.abs(delta)>1e-8?clamp(fromSide/delta,0,1):0;
  const radius=Math.max(0,Number(rt.api.PLAYER?.radius)||0);
  if(Math.abs(fromSide+(toSide-fromSide)*t)>radius+SCREEN_HALF_DEPTH)return null;
  const player=rt.v3.copy(before).lerp(victim.pos,t),sheet=rt.v4.copy(oldSheet).lerp(screen.pos,t);
  const across=Math.abs(rt.v5.copy(player).sub(sheet).dot(screen.tangent));
  const height=Math.max(radius*2,Number(rt.api.PLAYER?.height)||0);
  if(across>screen.width/2+radius||player.y+height<sheet.y||player.y>sheet.y+screen.height)return null;
  return {sheet,player};
}
function lockWailPair(rt,actor,state,index) {
  const target=selectTargets(rt,actor,1,Infinity)[0]||null,direction=aimDirection(rt,actor,rt.v0).clone();
  const origins=[-.65,.65].map(side=>new rt.api.THREE.Vector3(actor.pos.x+side,actor.pos.y+1.7,actor.pos.z-.6));
  state.beamPairs.push({index,target,direction,origins,start:state.nextLock,until:state.nextLock+gearCurve(state.specialPowerAP,180,220,240)/FPS,nextTick:state.nextLock,tick:0,trace:[]});
  emitAction(rt,actor,'killerWail',state.serial,'target',actor.pos,target?.pos||actor.pos.clone().add(direction),nextSeed(state),{index});
}
function fireWailTick(rt, actor, state, pair) {
  for(let i=0;i<2;i++){
    const origin=pair.origins[i],target=pair.target;
    // A delayed trace keeps the laser dodgeable; .2 s is calibration, not a recovered follow constant.
    const sample=pair.trace.findLast(p=>p.t<=pair.nextTick-.2)||pair.trace[0];
    const dir=target?.alive&&sample?rt.v2.copy(sample.pos).add(rt.v3.set(0,.75,0)).sub(origin).normalize():rt.v2.copy(pair.direction);
    const end=hitBeam(rt,actor,state,origin,dir,1000,3.5);
    emitAction(rt,actor,'killerWail',state.serial,'laser',origin,end,nextSeed(state),{index:pair.index*2+i,tick:pair.tick});
  }
  pair.tick++;
}
function inkjetExhaustFrame(rt,actor) {
  if(!actor?.alive||actor.remote||actor.intent?.squid||actor.form==='squid'||actor.specialActive?.id!=='inkjet')return;
  const radius=1.2,minY=actor.pos.y-2.4,maxY=actor.pos.y+.2;
  const inside=object=>{
    const pos=object?.pos;if(!pos)return false;
    const dx=pos.x-actor.pos.x,dz=pos.z-actor.pos.z;
    return dx*dx+dz*dz<=radius*radius&&pos.y>=minY&&pos.y<=maxY;
  };
  for(const victim of rt.api.G.actors||[]) {
    if(!victim?.alive||victim===actor||victim.team===actor.team)continue;
    const dx=victim.pos.x-actor.pos.x,dz=victim.pos.z-actor.pos.z,dy=victim.pos.y+.75-actor.pos.y;
    if(dx*dx+dz*dz>radius*radius||dy< -2.4||dy>.2)continue;
    const from=rt.v13.set(actor.pos.x,actor.pos.y-1.1,actor.pos.z),to=rt.v14.set(victim.pos.x,victim.pos.y+.75,victim.pos.z);
    if(rt.api.G.physics?.los&&!rt.api.G.physics.los(from,to))continue;
    withObjectDamageCause(actor,()=>rt.api.G.projectiles.applyHit(actor,victim,.5,'inkjet'),'Jetpack_Jet');
  }
  const center=rt.v12.set(actor.pos.x,actor.pos.y-1.1,actor.pos.z).clone();
  const damageAt=(_distance,object)=>inside(object)?.5:0;
  rt.system?.s3DamageSpecialObjects?.(actor,center,2,damageAt,'Jetpack_Jet');
  rt.system?.s3DamageSubObjects?.(actor,center,2,damageAt,'Jetpack_Jet');
}
function inkjetExhaustAdvance(rt,actor,state,dt) {
  if(!actor.alive||actor.remote||actor.intent?.squid||actor.form==='squid') {state.exhaustFrameRemainder=0;return;}
  state.exhaustFrameRemainder=(state.exhaustFrameRemainder||0)+dt;
  let ticks=0;
  while(state.exhaustFrameRemainder+1e-9>=1/FPS&&ticks++<8){
    state.exhaustFrameRemainder-=1/FPS;inkjetExhaustFrame(rt,actor);
  }
}
function deployObject(rt, actor, id, kind, pos, state, extra={}) {
  const spec=SPECIALS[id], object={
    kind,id,owner:actor,team:actor.team,specialPowerAP:state.specialPowerAP||0,activation:state.serial,serial:(state.objectSerial=((state.objectSerial||0)+1)),
    pos:pos.clone(),age:0,dur:extra.dur??spec.duration,maxRadius:extra.maxRadius??spec.radius,
    // The deploy packet is emitted in this constructor. Snapshot the WaveParam
    // source lifetime before the first packet, not after creating the device.
    maxWaveFrame:finite(extra.maxWaveFrame)&&extra.maxWaveFrame>0?extra.maxWaveFrame:0,
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
    const dot=offset.normalize().dot(dir);if(dot<=0)continue;
    if(actor.specialActive?.id==='tentaMissiles'){
      const ap=actorStates.get(actor)?.specialPowerAP||0,camera=rt.api.G.camera;
      if(camera?.isPerspectiveCamera){const projected=target.pos.clone();projected.y+=.7;projected.project(camera);
        const aspect=camera.aspect||1,limit=gearCurve(ap,140,190,240)/360;
        if(projected.z< -1||Math.hypot(projected.x*aspect,projected.y)>limit)continue;
      }else if(dot<.94)continue;
    }else if(dot<.94)continue;
    out.push({actor:target,d,dot});
  }
  out.sort((a,b)=>b.dot-a.dot||a.d-b.d);
  return out.slice(0,max).map(x=>x.actor);
}
function prepareMissiles(rt, actor, state) {
  const targets=selectTargets(rt,actor,5,Infinity),origin=rt.v0.set(actor.pos.x,actor.pos.y+2.4,actor.pos.z).clone();
  if(!targets.length)return false;
  const counts=targets.length===1?[10]:targets.length===2?[5,5]:targets.map(()=>4),missiles=[];
  for(let group=0;group<targets.length;group++){
    const target=targets[group],dest=target?groundAt(rt,target.pos,rt.v2).clone():groundAt(rt,aimPoint(rt,actor,28,rt.v3),rt.v4).clone();
    const count=counts[group];
    emitAction(rt,actor,'tentaMissiles',state.serial,'target',origin,dest,nextSeed(state),{index:group,count});
    for(let i=0;i<count;i++)missiles.push({target,dest:dest.clone(),index:i,count});  }
  state.pendingMissiles=missiles;state.missileIndex=0;state.missileOrigin=origin;state.nextMissileAt=state.t;state.phase='launching';return true;
}
function launchMissileStep(rt, actor, state) {
  const row=state.pendingMissiles?.[state.missileIndex];
  if(!row)return false;
  if(row.target?.alive)row.dest.copy(groundAt(rt,row.target.pos,rt.v2));
  const origin=state.missileOrigin,spread=(row.index-(row.count-1)/2)*.055;
  const dir=rt.v4.copy(row.dest).sub(origin);dir.x+=Math.sin(spread);dir.normalize();
  const p=launch(rt,actor,'tentaMissiles',origin,dir,{speed:6,grav:11,drag:.08,life:2.8,arc:3.5,seed:nextSeed(state),size:.24});
  if(p){p.s3TentaTarget=row.dest.clone();p.s3TentaTargetActor=row.target;p.s3TentaTargetLife=actorLife(row.target);
    p.s3TentaAge=0;p.s3TentaDescending=false;p.s3TentaDirection=dir.clone();p.s3TentaLaunchedAt=state.t;}
  state.missileIndex++;
  if(state.missileIndex>=state.pendingMissiles.length){
    emitAction(rt,actor,'tentaMissiles',state.serial,'launch',origin,null,nextSeed(state),{count:state.missileIndex});
    endSpecial(rt,actor,'launched');
  }else state.nextMissileAt+=4/FPS;
  return true;
}
function launchInkjet(rt,actor,state) {
  const origin=rt.v0.set(actor.pos.x,actor.pos.y+1.05,actor.pos.z).clone(),dir=aimDirection(rt,actor,rt.v1);
  launch(rt,actor,'inkjet',origin,dir,{speed:21,grav:13,drag:.06,life:1.55,arc:.3,seed:nextSeed(state),size:.24,
    paintRadius:gearCurve(state.specialPowerAP,3.2,3.6,4)});
  emitAction(rt,actor,'inkjet',state.serial,'shot',origin,rt.v2.copy(origin).addScaledVector(dir,20),nextSeed(state));
}
function throwBooyah(rt,actor,state,charge) {
  const origin=rt.v0.set(actor.pos.x,actor.pos.y+1.2,actor.pos.z).clone(),dir=aimDirection(rt,actor,rt.v1);
  launch(rt,actor,'booyahBomb',origin,dir,{speed:13+charge*4,grav:19,drag:.16,life:2.1,arc:4.2,
    radius:3.7,damage:0,paintRadius:13.5,seed:nextSeed(state),size:.48});
  emitAction(rt,actor,'booyahBomb',state.serial,'throw',origin,rt.v2.copy(origin).addScaledVector(dir,12),nextSeed(state),{charge:q3(charge)});
  const armor={id:'booyahBomb',t:state.t,armorHP:state.armorHP,until:(rt.api.G.time||0)+65/FPS};
  endSpecial(rt,actor,'thrown');booyahAfterArmor.set(actor,armor);
}
function throwStamp(rt,actor,state) {
  const origin=rt.v0.set(actor.pos.x,actor.pos.y+1.1,actor.pos.z).clone(),dir=aimDirection(rt,actor,rt.v1);
  launch(rt,actor,'ultraStamp',origin,dir,{speed:22,grav:17,drag:.13,life:1.8,sourceMode:'throw',seed:nextSeed(state),size:.4,damage:220,paintRadius:5});
  emitAction(rt,actor,'ultraStamp',state.serial,'throw',origin,rt.v2.copy(origin).addScaledVector(dir,18),nextSeed(state));
  endSpecial(rt,actor,'thrown');
}
function zipTo(rt,actor,state,target,normal) {
  state.zipStart=actor.pos.clone();state.zipTarget=target.clone();state.phase='hookFlight';state.zipT=0;state.hookFlightT=0;
  // Reuse this runtime's floor/wall classification. The retail slope cutoff
  // is not exposed by the sparse hook extraction; ceilings cannot be held.
  state.zipArrivalWall=!!normal&&Math.abs(normal.y)<=.5;
  // BulletBombMoveParam.SpawnSpeedZSpecUp is the hook's source velocity; the
  // player pull retains its separately calibrated 19 world-unit/s movement.
  state.hookFlightDuration=state.zipStart.distanceTo(state.zipTarget)/(3.36*FPS);
  actor.character?.trigger?.('special_zip');
  emitAction(rt,actor,'zipcaster',state.serial,'zip',actor.pos,target,nextSeed(state));
}
function crabBomb(rt,actor,state) {
  const origin=rt.v0.set(actor.pos.x,actor.pos.y+1.0,actor.pos.z).clone(),dir=aimDirection(rt,actor,rt.v1);
  launch(rt,actor,'crabTank',origin,dir,{speed:14,grav:23,drag:.18,life:1.4,arc:2.5,seed:nextSeed(state),size:.2,damage:50,paintRadius:4.5});
  emitAction(rt,actor,'crabTank',state.serial,'cannon',origin,rt.v2.copy(origin).addScaledVector(dir,10),nextSeed(state));
}
// WeaponSpSkewer 11.3.0 per-frame MoveAcc=MoveBrk=.031; top speed=.405.
// A change of frame rate must not change the distance travelled in source ticks.
export function reefsliderRawSpeed(speed, braking = false, sourceFrames = 1) {
  if(!finite(speed)||!finite(sourceFrames)||sourceFrames<0)return 0;
  return clamp(speed+(braking?-.031:.031)*sourceFrames,0,.405);
}
function reefImpact(rt,actor,state,center) {
  if(state.impacted)return;state.impacted=true;
  const seed=nextSeed(state),ap=state.specialPowerAP||0,point=groundAt(rt,center,rt.v1).clone(),desc=specialDescription('reefslider',ap);
  paintDisk(rt,actor,point,state.paintRadius??desc.paintRadius,seed);
  paintSpecialChannels(rt,actor,point,specialPaintParams('reefslider',ap),seed);
  damageBandRadius(rt,actor,center,desc.splashBands,desc.radius,'reefslider',null,5);
  fxBurst(rt,actor,point,desc.radius,'impact');
  emitAction(rt,actor,'reefslider',state.serial,'impact',point,null,seed,{radius:desc.radius,paintRadius:desc.paintRadius});
  actor.invuln=Math.max(actor.invuln,28/FPS);
  actor.vel.set(0,0,0);state.phase='recovery';state.recoveryT=0;
}
function paintReefRut(rt,actor,state,from,to,dt) {
  const span=3/FPS,elapsed=state.rutPaintCarry||0;
  if(!(dt>0))return;
  for(let at=span-elapsed;at<=dt+1e-8;at+=span){
    const point=from.clone().lerp(to,clamp(at/dt,0,1));
    paintStamp(rt,actor,groundAt(rt,point,rt.v0),1.2,nextSeed(state));
  }
  state.rutPaintCarry=(elapsed+dt)%span;
}
function deployInkstrike(rt,actor,state,index) {
  const target=aimPoint(rt,actor,28,rt.v0).clone();groundAt(rt,target,rt.v1);target.copy(rt.v1);
  const launchAt=rt.v2.set(actor.pos.x,actor.pos.y+1.1,actor.pos.z).clone();
  const marker=deployObject(rt,actor,'tripleInkstrike','marker',launchAt,state,{dur:82/FPS+51/FPS,maxRadius:7.7,damage:37.5,seed:nextSeed(state),index,target,scale:[.36,.36,.36]});
  marker.phase='flight';marker.origin=launchAt.clone();marker.flight=82/FPS;marker.age=0;
  emitAction(rt,actor,'tripleInkstrike',state.serial,'marker',launchAt,target,marker.seed,{index});
}
function throwChumps(rt,actor,state) {
  const target=groundAt(rt,aimPoint(rt,actor,26,rt.v0),rt.v1).clone(), origin=rt.v2.set(actor.pos.x,actor.pos.y+1.2,actor.pos.z).clone();
  const offset=rt.v3.copy(target).sub(actor.pos),distance=offset.length();
  if(distance<18)target.copy(actor.pos).addScaledVector(offset.normalize(),18);
  else if(distance>35)target.copy(actor.pos).addScaledVector(offset.normalize(),35);
  groundAt(rt,target,target);
  const count=12,desc=specialDescription('superChump',state.specialPowerAP||0);
  for(let i=0;i<count;i++) {
    const angle=(i/count)*Math.PI*2+seedUnit(state.seed,17)*Math.PI*2, radius=6.5;
    const pos=target.clone();const direction=rt.v4.copy(target).sub(actor.pos).setY(0).normalize(),side=rt.v5.set(direction.z,0,-direction.x);
    pos.addScaledVector(side,Math.cos(angle)*17.5).addScaledVector(direction,Math.sin(angle)*10);
    const obj=deployObject(rt,actor,'superChump','decoy',origin,state,{dur:(108+210)/FPS,maxRadius:desc.radius,damage:70,hp:60,seed:nextSeed(state),index:i,target:pos,scale:[.72,.72,.72]});
    obj.paintRadius=desc.paintRadius;obj.splashBands=desc.splashBands;
    obj.phase='flight';obj.armAt=1.8;obj.flight=1.8;obj.origin=origin.clone();
    emitAction(rt,actor,'superChump',state.serial,'balloon',origin,pos,obj.seed,{index:i});
  }
  endSpecial(rt,actor,'deployed');
}
// Presentation preview of throwChumps: the same aim, clamp and ellipse, with the seed advanced once per decoy exactly
// as the throw does (nextSeed in each deploy). Read-only: works on a copy of the seed and returns new vectors.
// Presentation read-out of the Tenta Missiles lock: the circle limit (fraction of the half screen height) and the
// opponents prepareMissiles would lock right now, so the HUD draws exactly what launches.
export function tentaMissilesLockPreview(api,actor) {
  const rt=runtimes.get(api?.Projectiles),state=actorStates.get(actor);
  if(!rt||!state||state.id!=='tentaMissiles'||!actor?.alive||actor.remote)return null;
  return {limit:gearCurve(state.specialPowerAP||0,140,190,240)/360,targets:selectTargets(rt,actor,5,Infinity)};
}
export function superChumpLandingPreview(api,actor) {
  const rt=runtimes.get(api?.Projectiles),state=actorStates.get(actor);
  if(!rt||!state||state.id!=='superChump'||!actor?.alive||actor.remote)return null;
  const target=groundAt(rt,aimPoint(rt,actor,26,rt.v0),rt.v1).clone();
  const offset=rt.v3.copy(target).sub(actor.pos),distance=offset.length();
  if(distance<18)target.copy(actor.pos).addScaledVector(offset.normalize(),18);
  else if(distance>35)target.copy(actor.pos).addScaledVector(offset.normalize(),35);
  groundAt(rt,target,target);
  const count=12,positions=[],shadow={seed:state.seed};
  for(let i=0;i<count;i++){
    const angle=(i/count)*Math.PI*2+seedUnit(shadow.seed,17)*Math.PI*2;
    const pos=target.clone(),direction=rt.v4.copy(target).sub(actor.pos).setY(0).normalize(),side=rt.v5.set(direction.z,0,-direction.x);
    pos.addScaledVector(side,Math.cos(angle)*17.5).addScaledVector(direction,Math.sin(angle)*10);
    positions.push(pos);nextSeed(shadow);
  }
  return {target,positions};
}
function deployScreen(rt,actor,state) {
  const aim=aimPoint(rt,actor,28,rt.v0).clone(),pos=actor.pos.clone().addScaledVector(rt.v1.copy(aim).sub(actor.pos).setY(0).normalize(),2.5);
  pos.y=Math.max(.08,actor.pos.y);
  const direction=rt.v2.copy(aim).sub(pos).setY(0).normalize();
  const object=deployObject(rt,actor,'splattercolorScreen','screen',pos,state,{dur:680/FPS,maxRadius:15,damage:40,width:15,height:9,yaw:Math.atan2(direction.x,direction.z),direction,moveSpeed:gearCurve(state.specialPowerAP,.04,.053,.06)*FPS,seed:nextSeed(state),scale:[15/8,2,1]});
  object.target=pos.clone().add(object.normal);
  startSpecialGauge(actor,rt.api.G,'splattercolorScreen',SPECIAL_GAUGE_FRAMES.splattercolorScreen,object);
  emitAction(rt,actor,'splattercolorScreen',state.serial,'screen',pos,object.target,object.seed,{object:object.serial});
  endSpecial(rt,actor,'deployed');
}
function deployWave(rt,actor,state) {
  const pos=groundAt(rt,aimPoint(rt,actor,16,rt.v0),rt.v1).clone(),ap=state.specialPowerAP;
  const maxRadius=gearCurve(ap,20,24,27),maxFrame=gearCurve(ap,160,192,216)/FPS;
  const object=deployObject(rt,actor,'waveBreaker','wave',pos,state,{dur:390/FPS,maxRadius,maxWaveFrame:maxFrame,damage:45,hp:480,seed:nextSeed(state),nextPulse:1.5});
  object.hp=480;object.maxHp=480;object.pulse=0;object.maxWaveFrame=maxFrame;object.pulseFrames=[90/FPS,240/FPS,390/FPS];object.waves=[];
  object.markingUntil=rt.api.G.time+45/FPS;
  startSpecialGauge(actor,rt.api.G,'waveBreaker',SPECIAL_GAUGE_FRAMES.waveBreaker,object);
  object.direction=rt.v2.copy(pos).sub(actor.pos).setY(0).normalize();
  emitAction(rt,actor,'waveBreaker',state.serial,'device',pos,null,object.seed,{object:object.serial});
  endSpecial(rt,actor,'deployed');
}
function spawnWaveFront(rt,device,pulse) {
  // An authoritative deploy packet can arrive before the remote device's
  // simulated 90/240/390F pulse. Reuse that exact wave identity rather than
  // drawing a duplicate ring with the same owner/activation/object serial.
  const serial=(device.objectSerial||device.serial)+1;
  if(device.owner.remote){
    const existing=(rt.system?._s3AllSpecialObjects||[]).find(o=>!o.dead&&o.owner===device.owner&&o.id==='waveBreaker'&&o.kind==='waveFront'&&o.activation===device.activation&&o.serial===serial);
    if(existing){device.objectSerial=serial;return existing;}
  }
  const state={serial:device.activation,objectSerial:device.objectSerial||device.serial,seed:device.seed};
  const wave=deployObject(rt,device.owner,'waveBreaker','waveFront',device.pos,state,{dur:device.maxWaveFrame,
    maxRadius:device.maxRadius,maxWaveFrame:device.maxWaveFrame,damage:45,seed:device.seed,index:pulse,scale:[1,1,1]});
  device.objectSerial=state.objectSerial;wave.maxWaveFrame=device.maxWaveFrame;wave.last=0;wave.seen=new Set();wave.pulse=pulse;
  return wave;
}
function updateWaveFront(rt,o) {
  const radius=o.maxRadius*clamp(o.age/Math.max(1/FPS,o.maxWaveFrame),0,1),previous=o.last||0;
  o.last=radius;
  if(o.mesh){o.mesh.position.copy(o.pos);o.mesh.position.y+=.06;o.mesh.scale.set(radius,radius,1);}
  if(radius>0){
    for(const victim of rt.api.G.actors||[]){
      if(!victim?.alive||victim.team===o.team||o.seen.has(victim))continue;
      const dx=victim.pos.x-o.pos.x,dz=victim.pos.z-o.pos.z,d=Math.hypot(dx,dz),dy=victim.pos.y+.75-o.pos.y;
      if(d<previous-.75||d>radius+.75||dy< -5.2||dy>2.8)continue;
      o.seen.add(victim);
      if(!o.owner.remote)rt.api.G.projectiles.applyHit(o.owner,victim,45,'waveBreaker');
      victim.s3 ||= {};victim.s3.revealedUntil ||= {};
      victim.s3.revealedUntil[o.team]=Math.max(victim.s3.revealedUntil[o.team]||0,rt.api.G.time+8);
    }
    o.objectSeen ||= new Set();
    for(const object of rt.system?._s3AllSpecialObjects||[]){
      if(object.dead||!(object.hp>0)||object.owner?.team===o.team||o.objectSeen.has(object))continue;
      const dx=object.pos.x-o.pos.x,dz=object.pos.z-o.pos.z,d=Math.hypot(dx,dz),r=object.collisionRadius||.72;
      if(d+r<previous||d-r>radius)continue;
      if(rt.api.G.physics?.los&&!rt.api.G.physics.los(o.pos,object.pos))continue;
      o.objectSeen.add(object);
      specialObjectDamage(rt,o.owner,object,45,'ShockSonar_Wave',o.pos);
    }
    rt.system?.s3DamageSubObjects?.(o.owner,o.pos,radius,(d,object)=>{
      if(!object||o.objectSeen.has(object))return 0;
      const r=object.collisionRadius||.72;
      if(d+r<previous||d-r>radius)return 0;
      o.objectSeen.add(object);return 45;
    },'ShockSonar_Wave');
  }
  if(o.age>=o.dur)removeWorld(rt,o,'expire');
}
function endSpecial(rt,actor,reason='duration') {
  const state=actorStates.get(actor);
  if(!state)return;
  if(state.id==='zipcaster')clearZipcasterArmor(actor);
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
  damageBandRadius(rt,actor,center,[[4,40]],4,'ultraStamp',direct,jump?3.5:3,'UltraStamp_Swing');
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
  // A cheer still helps the Booyah owner, but cannot recharge the sender
  // during a placed Tacticooler's lock. Consume its identity before rejecting
  // the credit so a delayed duplicate cannot become charge after unlock.
  if(specialGaugeLocked(cheerer))return false;
  const points=[6,3,2,1,.5][i]||0;
  if(points<=0)return false;
  const cost=Number(cheerer.specialCost?.()??cheerer.weapon?.specialCost);
  if(!(cost>0)||!finite(cost))return false;
  const charge=Number(cheerer.s3?.modifiers?.specialCharge)||1;
  const before=Number(cheerer.special)||0,after=Math.min(cost,before+points/charge);
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
function segmentDistance(rt,point,from,to) {
  const d=rt.v9.subVectors(to,from),len=d.lengthSq();
  if(len<1e-9)return point.distanceTo(from);
  const t=clamp(rt.v10.subVectors(point,from).dot(d)/len,0,1);
  return point.distanceTo(rt.v11.copy(from).addScaledVector(d,t));
}
function zipContactHits(rt,actor,state,from,to) {
  state.zipHits ||= new Set();
  for(const victim of rt.api.G.actors||[]){
    if(!victim?.alive||victim.team===actor.team||state.zipHits.has(victim))continue;
    const point=rt.v12.set(victim.pos.x,victim.pos.y+.75,victim.pos.z);
    if(segmentDistance(rt,point,from,to)>1.2)continue;
    state.zipHits.add(victim);rt.api.G.projectiles.applyHit(actor,victim,60,'zipcaster');
  }
}
function stampLine(rt,actor,from,to,width,seed,depthScale=1) {
  const d=rt.v7.subVectors(to,from),len=d.length(),steps=Math.max(1,Math.ceil(len/2.5));let index=0;
  for(let i=0;i<=steps;i++){
    const p=rt.v8.copy(from).lerp(to,i/steps);
    paintStamp(rt,actor,p,Math.min(MAX_STAMP_RADIUS,width*depthScale),seedUnit(seed,index++));
  }
}
function updateWorld(rt,dt) {
  const list=rt.system._s3AllSpecialObjects;if(!Array.isArray(list)||!(dt>0))return;
  for(let i=list.length-1;i>=0;i--){
    const o=list[i];if(!o||o.dead){list.splice(i,1);continue;}
    o.age+=dt;
    if(o.kind==='marker'){
      const k=clamp(o.age/Math.max(.05,o.flight||82/FPS),0,1);
      o.pos.copy(o.origin).lerp(o.target,k);o.pos.y+=Math.sin(k*Math.PI)*4;
      o.mesh?.position.copy(o.pos);
      if(k>=1){
        // 82F from marker throw to the first damage frame, then 51F of tornado
        // with damage every five source frames (0,5,...50: eleven ticks).
        o.kind='strike';o.phase='active';o.dur=51/FPS;o.activeAt=o.age;
        o.maxRadius=7.7;o.currentRadius=.5;o.nextDamage=o.age+5/FPS;
        o.paintT=0;o.once=new Set();o.mesh?.scale.set(.2,.25,.2);
        if(!o.owner.remote){
          const hitCenter=rt.v0.copy(o.pos);hitCenter.y+=.8;
          damageBandRadius(rt,o.owner,hitCenter,descriptions.tripleInkstrike.splashBands,o.currentRadius,'tripleInkstrike');
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
      if(elapsed+1e-8>=o.dur)removeWorld(rt,o,'expire');
    }else if(o.kind==='booyahBlast'){
      // DamageRadiusStart/End and PaintSpanFrame are 60 Hz source frames.
      // Accumulate those frames here so the per-frame 3.3 damage is invariant
      // to whether the render/update loop supplies 30, 60, or 120 Hz deltas.
      o.frameRemainder=(o.frameRemainder||0)+dt;
      o.frameCount ||= 0;
      while(o.frameRemainder+1e-9>=1/FPS&&o.frameCount<80){
        o.frameRemainder-=1/FPS;o.frameCount++;
        if(o.frameCount>40&&!o.owner.remote){
          const growth=clamp((o.frameCount-40)/40,0,1);
          const radius=o.maxRadius*growth,center=rt.v0.copy(o.pos);center.y+=.2;
          damageRadius(rt,o.owner,'booyahBomb',center,3.3,3.3,Math.max(.1,radius),'booyahBomb');
          if(o.frameCount<=46){
            const paintFrame=o.frameCount-40,paintRadius=(o.paintRadius||13.5)*paintFrame/6;
            paintBooyahGrowth(rt,o,paintFrame,o.paintRadius||13.5,o.seed);
          }
        }
      }
      const started=o.frameCount>=40,radius=started?o.maxRadius*clamp((o.frameCount-40)/40,0,1):0;
      const center=rt.v0.copy(o.pos);center.y+=.2;
      if(started)rt.api.G.fx?.ring?.(center,rt.up,colorOf(rt,o.owner),{radius,life:.1});
      if(o.frameCount>=80)removeWorld(rt,o,'expire');
    }else if(o.kind==='wave'){
      if(o.mesh)o.mesh.material.emissiveIntensity=.18+.4*Math.sin(o.age*9);
      const frame=o.age*FPS,markRatio=frame<4?0:frame<10?.19+.21*(frame-4)/6:frame<18?.4+.215*(frame-10)/8:.615;
      o.contactTimes ||= new Map();
      for(const victim of rt.api.G.actors||[]){
        if(!victim?.alive||victim.team===o.team)continue;
        const dx=victim.pos.x-o.pos.x,dz=victim.pos.z-o.pos.z,dy=victim.pos.y-o.pos.y,d=Math.hypot(dx,dz);
        if(frame<=57&&rt.api.G.time<=o.markingUntil&&d<=o.maxRadius*markRatio&&dy>=-5.2&&dy<=2.8){
          victim.s3 ||= {};victim.s3.revealedUntil ||= {};
          victim.s3.revealedUntil[o.team]=Math.max(victim.s3.revealedUntil[o.team]||0,o.markingUntil);
        }
        if(d<=1.2&&dy>=-.75&&dy<=2.75){
          const next=o.contactTimes.get(victim)||0;
          if(o.age+1e-8>=next){if(!o.owner.remote)rt.api.G.projectiles.applyHit(o.owner,victim,30,'waveBreaker');o.contactTimes.set(victim,o.age+.5);}
        }else if(o.contactTimes.get(victim)<=o.age)o.contactTimes.delete(victim);
      }
      while(o.pulse<3&&o.age+1e-8>=o.pulseFrames[o.pulse]){
        const pulse=o.pulse,start=o.pulseFrames[pulse];o.pulse++;
        if(!o.owner.remote)emitObject(rt,o,'pulse');
        const front=spawnWaveFront(rt,o,pulse);front.age=Math.max(0,o.age-start);updateWaveFront(rt,front);
      }
      if(o.age>=o.dur)removeWorld(rt,o,'expire');
    }else if(o.kind==='waveFront'){
      updateWaveFront(rt,o);
      // Each emitted wave has its own source MaxFrame and must retire after
      // its last hit frame, even if the device or another wave still exists.
      if(o.age+1e-8>=o.dur)removeWorld(rt,o,'expire');
    }else if(o.kind==='decoy'){
      if(o.phase==='flight'){
        const k=clamp(o.age/Math.max(.05,o.flight||1.8),0,1);
        o.pos.copy(o.origin).lerp(o.target,k);o.pos.y+=Math.sin(k*Math.PI)*4;
        o.mesh?.position.copy(o.pos);
        if(k>=1){o.phase='active';o.mesh?.scale.setScalar(1.15);emitObject(rt,o,'active');}
      }
      if(o.age>=o.dur){
        const ap=o.specialPowerAP||0,radius=o.maxRadius||descriptions.superChump.radius;
        if(!o.owner.remote){paintDisk(rt,o.owner,o.pos,o.paintRadius,o.seed);paintSpecialChannels(rt,o.owner,o.pos,specialPaintParams('superChump',ap),o.seed);
          damageBandRadius(rt,o.owner,o.pos,o.damageBands||specialDescription('superChump',ap).splashBands,radius,'superChump');}
        fxBurst(rt,o.owner,o.pos,radius,'explode');
        removeWorld(rt,o,'expire');
      }
    }else if(o.kind==='screen'){
      const runStart=1,runEnd=1+560/FPS;
      const oldScreenPos=o.lastObjectScreenPos?.clone()||o.pos.clone();
      const movingSeconds=Math.max(0,Math.min(o.age,runEnd)-Math.max(o.age-dt,runStart));
      if(movingSeconds>0)o.pos.addScaledVector(o.direction,o.moveSpeed*movingSeconds);
      o.mesh?.position.copy(o.pos).setY(o.pos.y+o.height/2);
      if(o.mesh){o.mesh.material.opacity=.27+.06*Math.sin(o.age*7);o.mesh.rotation.y=Math.atan2(o.normal.x,o.normal.z);}
      for(const victim of rt.api.G.actors||[]){
        if(!victim?.alive||victim.team===o.team)continue;
        const previous=o.previous.get(victim);
        if(o.age+1e-8>=runStart&&o.age<=runEnd){
          const contact=screenPlayerContact(rt,o,previous,victim);
          if(contact){
            const last=o.lastCross.get(victim)??-Infinity;
            // Use the source-frame object clock; G.time is shared by all
            // fixed substeps of a coarse render update.
            if(o.age-last+1e-8>=SCREEN_CONTACT_INTERVAL){
              const {sheet,player}=contact;o.lastCross.set(victim,o.age);
              if(victim.isLocal){victim.s3 ||= {};victim.s3.splattercolorUntil=Math.max(victim.s3.splattercolorUntil||0,rt.api.G.time+360/FPS);
                victim.s3.splattercolorMarkUntil=Math.max(victim.s3.splattercolorMarkUntil||0,rt.api.G.time+120/FPS);}
              if(!o.owner.remote)rt.api.G.projectiles.applyHit(o.owner,victim,40,'splattercolorScreen');
              if(!o.owner.remote){o.crossCount=(o.crossCount||0)+1;emitAction(rt,o.owner,o.id,o.activation,'cross',sheet,player,o.seed,{object:o.serial,index:o.index,tick:o.crossCount});}
            }
          }
        }
        o.previous.set(victim,{pos:victim.pos.clone(),screen:o.pos.clone()});
      }
      screenDamageObjects(rt,o,oldScreenPos,o.pos);o.lastObjectScreenPos=o.pos.clone();
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
    const t=dd>1e-9?clamp(rt.v6.subVectors(pos,origin).dot(d)/dd,0,1):0;
    const near=rt.v5.copy(origin).addScaledVector(d,t);
    if(pos.distanceTo(near)<1.2)rt.api.G.projectiles.applyHit(actor,victim,3.5,'killerWail');
  }
  rt.api.G.fx?.ring?.(origin,dir,colorOf(rt,actor),{radius:length,life:.35});
  emitAction(rt,actor,'killerWail',actorStates.get(actor).serial,'laser',origin,end,nextSeed(actorStates.get(actor)));
}

function queueSubThrow(state,frames,thrower,arg=null) {
  if(state.throwAt!==undefined)return;
  state.throwAt=state.t+frames/FPS;state.thrower=thrower;state.throwArg=arg;
}
function runSpecialMain(actor,dt,input) {
  const special=actor.specialActive;actor.specialActive=null;
  try { actor.weaponRunner?.update?.(dt,input); }
  finally { if(actor.alive&&!actor.specialActive)actor.specialActive=special; }
}

function activeStep(rt,actor,dt) {
  const state=actorStates.get(actor),s=actor.specialActive;
  if(!state||!s||state.id!==s.id)return;
  if(!(dt>0))return;
  if(!actor.alive||actor.remote){endSpecial(rt,actor,'interrupted');return;}
  const edges=inputEdges(actor,state);
  state.t+=dt;s.t=state.t;
  const spec=SPECIALS[state.id],elapsed=state.t;
  if(state.throwAt!==undefined){
    if(elapsed+1e-8>=state.throwAt){const thrower=state.thrower,arg=state.throwArg;delete state.throwAt;delete state.thrower;thrower(rt,actor,state,arg);}
    return;
  }
  if(state.id==='tentaMissiles'){
    if(state.phase==='launching')dampForSpecial(actor,dt);else moveActor(rt,actor,dt,state,{squid:true});
    if(state.phase==='launching'){
      while(state.missileIndex<state.pendingMissiles.length&&elapsed+1e-8>=state.nextMissileAt)
        launchMissileStep(rt,actor,state);
    }else if(elapsed+1e-8>=state.duration)endSpecial(rt,actor,'duration');
    else if(edges.fire&&prepareMissiles(rt,actor,state))launchMissileStep(rt,actor,state);
    return;
  }
  if(state.id==='inkjet'){
    const it=actor.intent;
    if(it.squid)moveActor(rt,actor,dt,state,{squid:true});
    else {
      // Wiki hover height ~one lobby line; exact retail servo remains calibrated.
      const probe=rt.v3.copy(actor.pos);probe.y+=20;
      const hit=rt.api.G.physics?.raycast?.(probe,rt.down,80,rt.hit,true);
      const floor=hit?.hit&&hit.normal?.y>.4?hit.point.y:rt.api.G.level?.groundHeight?.(actor.pos.x,actor.pos.z);
      if(edges.jump)state.boostUntil=elapsed+.75;
      if(Number.isFinite(floor)){const boost=elapsed<(state.boostUntil||0)?2.5:0;
        actor.vel.y=clamp((floor+5+boost-actor.pos.y)*6,-12,12);
      }else actor.vel.y=Math.max(-12,actor.vel.y-24*dt);
      const move=it.move||rt.zero;
      actor.vel.x+=(move.x*5.2-actor.vel.x)*(1-Math.exp(-4*dt));
      actor.vel.z+=(move.z*5.2-actor.vel.z)*(1-Math.exp(-4*dt));
      actor.form='kid';actor.grounded=false;
      const py=actor.pos.y;actor.pos.addScaledVector(actor.vel,dt);actor._resolve?.(false,py,false);
    }
    if(it.fire&&!it.squid&&elapsed+1e-8>=(state.nextShot||0)){launchInkjet(rt,actor,state);state.nextShot=elapsed+1;}
    if(elapsed+1e-8>=state.duration)returnToOrigin(rt,actor,state,'duration');
    else inkjetExhaustAdvance(rt,actor,state,dt);
    return;
  }
  if(state.id==='booyahBomb'){
    // The user hovers at the activation point; only aim and Nice are live.
    actor.form='kid';actor.vel.set(0,0,0);actor.pos.x=state.origin.x;actor.pos.z=state.origin.z;
    actor.pos.y=state.origin.y+3.75*Math.min(1,elapsed/.5);actor.grounded=false;
    if(elapsed+1e-8>=.5){
      const ap=state.specialPowerAP,chargeDt=Math.max(0,elapsed-Math.max(.5,elapsed-dt));
      state.charge=Math.min(1,state.charge+gearCurve(ap,.002,.006,.01)*chargeDt*FPS);
      if(edges.booyah&&elapsed+1e-8>=(state.nextCheer||0)){state.charge=Math.min(1,state.charge+.077);state.nextCheer=elapsed+10/FPS;}
      state.cheerHeld ||= new WeakMap();
      for(const ally of rt.api.G.actors||[])if(ally!==actor&&ally.alive&&ally.team===actor.team){
        const pressed=!!ally.intent?.booyah,wasPressed=state.cheerHeld.get(ally)===true;
        state.cheerHeld.set(ally,pressed);
        if(pressed&&!wasPressed)addBooyahCall(rt,actor,state,ally,{network:ally.isLocal===true});
      }
      state.armor=true;s.armor=false;s.armorHP=state.armorHP;
    }
    state.phase=state.charge>=1?'ready':'charge';s.phase=state.phase;
    if(elapsed+1e-8>=state.duration)throwBooyah(rt,actor,state,1);
    else if(state.charge>=1&&edges.subUp)queueSubThrow(state,13,throwBooyah,1);
    return;
  }
  if(state.id==='ultraStamp'){
    // 11.1.0 published frame timings retained in 11.3.0:
    // activation 17F, first grounded swing windup 30F, first->second 20F,
    // continuous intervals 13F; airborne jump swing startup 8F and
    // a 40F delay before further grounded stomps. No 5F damage spam.
    const throwing=!!actor.intent.sub;
    const jumpStarted=edges.jump&&actor.intent.fire&&actor.grounded&&!throwing;
    moveActor(rt,actor,dt,state,{speed:actor.intent.fire&&!throwing?2.6:null,squid:!actor.intent.fire&&!throwing,jump:true});
    if(throwing){
      state.stampHolding=false;state.stampCount=0;
      state.jumpStampAt=null;
    } else if(actor.intent.fire){
      if(!state.stampHolding){
        state.stampHolding=true;state.stampCount=0;
        state.nextSwing=Math.max(47/FPS,elapsed+30/FPS);
      }
      if(jumpStarted){
        state.jumpStampAt=elapsed+8/FPS;
        state.nextSwing=Math.max(state.nextSwing,elapsed+48/FPS);
      }
      if(state.jumpStampAt!==null&&elapsed+1e-8>=state.jumpStampAt){
        stampSwing(rt,actor,state,true);
        state.jumpStampAt=null;state.nextSwing=elapsed+40/FPS;
      }else if(state.jumpStampAt===null&&elapsed+1e-8>=state.nextSwing&&actor.form!=='squid'){
        stampSwing(rt,actor,state,false);
        state.stampCount++;
        state.nextSwing=elapsed+(state.stampCount===1?20:13)/FPS;
      }
    }else{
      state.stampHolding=false;state.stampCount=0;state.jumpStampAt=null;
    }
    state.phase=throwing?'aimThrow':'active';s.phase=state.phase;
    if(edges.subUp)queueSubThrow(state,42,throwStamp);
    else if(elapsed+1e-8>=state.duration)endSpecial(rt,actor,'duration');
    return;
  }
  if(state.id==='zipcaster'){
    let zipDt=dt;const priorForm=actor.form;
    if(state.phase==='hookFlight'){
      const remain=Math.max(0,(state.hookFlightDuration||0)-(state.hookFlightT||0));
      if(zipDt+1e-8<remain){state.hookFlightT+=zipDt;actor.vel.set(0,0,0);zipDt=0;}
      else {state.hookFlightT=state.hookFlightDuration||0;zipDt=Math.max(0,zipDt-remain);state.phase='zip';state.zipStart=actor.pos.clone();state.zipT=0;
        beginZipcasterArmor(actor,state);}
    }
    if(state.phase==='zip'&&zipDt>0){
      state.zipT+=zipDt;const from=actor.pos.clone(),delta=rt.v0.copy(state.zipTarget).sub(actor.pos),distance=delta.length();
      if(distance<.7||state.zipT>1.35){actor.pos.copy(state.zipTarget);actor.vel.set(0,0,0);state.phase='hookWait';state.hookWait=0;
        arriveZipcasterArmor(actor,state.zipArrivalWall);}
      else {delta.multiplyScalar(Math.min(1,19*zipDt/distance));actor.pos.add(delta);actor.vel.copy(delta).multiplyScalar(1/zipDt);actor.grounded=false;}
      zipContactHits(rt,actor,state,from,actor.pos);
      state.zipPaintT=(state.zipPaintT||0)+zipDt;
      const trailPaint=specialPaintParams('zipcaster',state.abilityPoints||0),trailSpan=trailPaint.trailSpanFrames/FPS;
      if(state.zipPaintT+1e-8>=trailSpan){state.zipPaintT-=trailSpan;stampLine(rt,actor,from,actor.pos,trailPaint.trailWidth,nextSeed(state),trailPaint.trailDepthScale);}
    }else if(state.phase==='hookWait'){
      state.hookWait+=dt;actor.vel.set(0,0,0);
      if(state.hookWait+1e-8>=12/FPS){state.phase='ready';state.zips++;
        const victimHits=damageBandRadius(rt,actor,state.zipTarget,descriptions.zipcaster.splashBands,6,'zipcaster');
        const impactSeed=nextSeed(state),point=groundAt(rt,state.zipTarget,rt.v1);
        paintStamp(rt,actor,point,1.4,impactSeed);paintSpecialChannels(rt,actor,point,specialPaintParams('zipcaster',state.abilityPoints||0),impactSeed);
        fxBurst(rt,actor,state.zipTarget,5.25,'hit');
        emitAction(rt,actor,'zipcaster',state.serial,'hookImpact',state.zipTarget,null,nextSeed(state),{targets:victimHits.length,index:state.zips});}
    }else if(state.phase==='ready')moveActor(rt,actor,dt,state,{speed:actor.intent.squid?6:4.2,squid:true,jump:true});
    updateZipcasterArmor(actor,{squid:priorForm!=='squid'&&actor.form==='squid'});
    state.inkFuel=Math.max(0,state.inkFuel-(state.inkDrainPerSecond??((state.inkPerSecond??.1305)*100))*dt);
    // Zipcaster has its own 1.5x special ink tank. Let the equipped native
    // WeaponRunner spend from that tank while preserving the player's normal
    // ink reserve for after the special ends. Express that reserve in native
    // main-cost units for the duration of this call: both low-ink admission
    // and debit then receive the same 67% benefit, including gear-adjusted
    // costs and progressive charge spending. Do not mutate shared/equipped
    // weapon definitions or bypass a runner's affordability check with a refund.
    const normalInk=actor.ink;
    actor.ink=state.inkFuel/ZIPCASTER_MAIN_INK_RATE;
    try{
      // WeaponSpSuperHook: ordinary shooting is allowed between hook uses,
      // never during hook flight, player pull, or 12F post-hook wait. Preserve
      // the native weapon's cadence and the single Zipcaster ink reserve.
      const canFire=state.phase==='ready'&&actor.form!=='squid';
      runSpecialMain(actor,dt,{fire:canFire&&!!actor.intent.fire,
        firePressed:canFire&&edges.fire,sub:false,subReleased:false});
    }finally{
      state.inkFuel=clamp((Number(actor.ink)||0)*ZIPCASTER_MAIN_INK_RATE,0,150);
      actor.ink=normalInk;
    }
    const hookInk=state.hookInkCost??(state.hookInk??.025)*100;
    if(state.phase==='ready'&&edges.sub&&elapsed+1e-8>=(state.nextHookAt||0)&&state.inkFuel>=hookInk){
      const origin=rt.v0.set(actor.pos.x,actor.pos.y+1.05,actor.pos.z),direction=aimDirection(rt,actor,rt.v1);
      const contact=rt.api.G.physics?.raycast?.(origin,direction,35,rt.hit,true);
      // WeaponSpSuperHook MinLengthHook_Floor=3 / MinLengthHook_Wall=0.
      // Close floor hits fail like an empty hook; close walls remain usable.
      const closeFloor=contact?.hit&&finite3(contact.point)&&contact.normal?.y>.5&&origin.distanceTo(contact.point)<3;
      // A reticle coordinate is not a surface. Missed hooks neither spend
      // hook ink nor pull the player into empty space (Wiki: 45F miss wait).
      if(!contact?.hit||!finite3(contact.point)||origin.distanceTo(contact.point)>35+1e-6||closeFloor){
        state.nextHookAt=elapsed+45/FPS;state.failedHooks=(state.failedHooks||0)+1;
      }else {
        const target=contact.point.clone();state.inkFuel-=hookInk;
        state.zipHits=new Set();state.zipPaintT=0;zipTo(rt,actor,state,target,contact.normal);
      }
    }
    if(state.inkFuel<=0||elapsed+1e-8>=state.duration)returnToOrigin(rt,actor,state,state.inkFuel<=0?'ink':'duration');
    return;
  }
  if(state.id==='killerWail'){
    // WeaponSpMicroLaser.PlayerParam: NoShot / NoBomb / NoSquid = 40F after
    // firing. Keep ordinary movement, but do not enable the three prohibited
    // actions before their earliest source-backed recovery point.
    const controlsUnlocked=elapsed+1e-8>=40/FPS;
    moveActor(rt,actor,dt,state,{squid:controlsUnlocked});
    // Wail remains a simultaneous special layer. Once eligible, the native
    // weapon runner keeps owning main/sub cadence and ammunition.
    runSpecialMain(actor,dt,{fire:controlsUnlocked&&!!actor.intent.fire,
      firePressed:controlsUnlocked&&edges.fire,
      sub:controlsUnlocked&&!!actor.intent.sub&&actor.form!=='squid',
      subReleased:controlsUnlocked&&edges.subUp&&actor.form!=='squid'});
    while(state.beams<3&&elapsed+1e-8>=state.nextLock){lockWailPair(rt,actor,state,state.beams++);state.nextLock+=36/FPS;state.phase='laser';}
    for(const pair of state.beamPairs){if(pair.target?.alive){pair.trace.push({t:elapsed,pos:pair.target.pos.clone()});while(pair.trace.length>20)pair.trace.shift();}}
    for(const pair of state.beamPairs)while(pair.nextTick< pair.until-1e-8&&elapsed+1e-8>=pair.nextTick){fireWailTick(rt,actor,state,pair);pair.nextTick+=5/FPS;}
    if(elapsed+1e-8>=state.duration)endSpecial(rt,actor,'duration');
    return;
  }
  if(state.id==='crabTank'){
    const rolling=!!actor.intent.squid;
    state.armor=true;s.armor=false;s.armorHP=state.armorHP;
    if(state.phase==='finish'){
      crabBall(rt,actor,state,false);moveActor(rt,actor,dt,state,{speed:0,squid:false,jump:false});
      if(elapsed>=state.finishUntil)endSpecial(rt,actor,'duration');return;
    }
    if(state.wasRolling&&!rolling){state.nextShot=Math.max(state.nextShot,elapsed+20/60);state.fireStart=null;}
    if(rolling){state.fireStart=null;}
    state.wasRolling=rolling;
    moveActor(rt,actor,dt,state,{speed:rolling?8.5:'crab',squid:false,jump:true});
    if(actor.intent.sub&&!rolling&&elapsed+1e-8<state.duration-25/60&&elapsed+1e-8>=state.nextCannon){
      const origin=rt.v0.set(actor.pos.x,actor.pos.y+.95,actor.pos.z).clone(),dir=aimDirection(rt,actor,rt.v1);
      launch(rt,actor,'crabTank',origin,dir,{speed:18,grav:18,drag:.12,life:1.7,arc:2.4,damage:50,radius:4.5,size:.28,paintRadius:4.5,sourceMode:'cannon',seed:nextSeed(state)});
      emitAction(rt,actor,state.id,state.serial,'cannon',origin,rt.v2.copy(origin).addScaledVector(dir,16),nextSeed(state));
      state.nextCannon=elapsed+75/FPS;state.nextShot=Math.max(state.nextShot,elapsed+32/FPS);state.fireStart=null;state.cannonT=elapsed+32/60;
    }
    crabBall(rt,actor,state,rolling);
    if(!rolling&&actor.intent.fire){
      if(state.fireStart===null)state.fireStart=elapsed;
    }else state.fireStart=null;
    if(!rolling&&actor.intent.fire&&elapsed>=state.nextShot){
      const origin=rt.v0.set(actor.pos.x,actor.pos.y+.95,actor.pos.z).clone(),dir=aimDirection(rt,actor,rt.v1);
      const p=launch(rt,actor,'crabTank',origin,dir,{type:'shot',directOnly:true,damage:32,radius:.22,size:.13,speed:24,grav:4,drag:.04,life:1.25,sourceMode:'shooter',seed:nextSeed(state),damageReduce:{max:32,min:16,start:9/60,end:25/60}});
      emitAction(rt,actor,state.id,state.serial,'shot',origin,rt.v2.copy(origin).addScaledVector(dir,20),nextSeed(state),{damage:32});
      const progress=clamp((elapsed-state.fireStart)/(90/60),0,1),interval=12-8*Math.pow(progress,.2);
      state.nextShot=elapsed+interval/60;
    }
    if(rolling&&elapsed>=state.nextBody){state.nextBody=elapsed+.45;const c=actor.pos.clone();c.y+=.75;withObjectDamageCause(actor,()=>damageBandRadius(rt,actor,c,[[1.45,40]],1.45,'crabTank',null,2.8,'Chariot_Body'),'Chariot_Body');paintStamp(rt,actor,groundAt(rt,actor.pos,rt.v0),.9,nextSeed(state));}
    if(elapsed+1e-8>=state.duration){state.phase='finish';state.finishUntil=state.duration+25/60;crabBall(rt,actor,state,false);moveActor(rt,actor,dt,state,{speed:0,squid:false,jump:false});}return;
  }
  if(state.id==='reefslider'){
    if(state.phase==='recovery'){
      state.recoveryT+=dt;actor.vel.set(0,0,0);
      if(state.recoveryT+1e-8>=28/FPS)endSpecial(rt,actor,'impact');
      return;
    }
    actor.form='kid';
    if(state.phase==='startup'){
      moveActor(rt,actor,dt,state,{squid:false,jump:true});
      if(actor.grounded){state.startupT+=dt;const aim=aimDirection(rt,actor,rt.v0);aim.y=0;if(aim.lengthSq()>.01)state.direction.copy(aim.normalize());
        if(state.startupT+1e-8>=25/FPS)actor.invuln=Math.max(actor.invuln,1/FPS);
        if(state.startupT+1e-8>=38/FPS){
          state.phase='dash';s.phase='dash';state.dashT=0;state.travel=0;state.reefSpeedRaw=0;
          actor.character?.trigger?.('special_dash');
        }}
      return;
    }
    if(state.phase==='dash'||state.phase==='brake'){
      const braking=state.phase==='brake';
      if(braking)state.brakeT+=dt;else state.dashT+=dt;
      // MoveCancelableFrame=15 forbids instant explosions. Cancel, wall contact
      // or 54F maximum dash all enter PreBurstFrame=38 braking/arming phase.
      if(!braking&&state.dashT+1e-8>=15/FPS&&edges.fire){
        state.phase='brake';s.phase='brake';state.brakeT=0;
      }
      const isBrake=state.phase==='brake';
      const frames=clamp(dt*FPS,0,6);
      state.reefSpeedRaw=reefsliderRawSpeed(state.reefSpeedRaw||0,isBrake,frames);
      const speed=state.reefSpeedRaw*FPS;
      actor.vel.x=state.direction.x*speed;actor.vel.z=state.direction.z*speed;
      actor.vel.y=Math.max(-5,actor.vel.y-24*dt);
      const from=actor.pos.clone(),py=actor.pos.y;
      if(actor.contacts?.wall){state.reefSpeedRaw=0;actor.vel.x=actor.vel.z=0;}
      actor.pos.addScaledVector(actor.vel,dt);actor.grounded=false;
      actor._resolve?.(false,py,false);
      paintReefRut(rt,actor,state,from,actor.pos,dt);
      if(!isBrake){
        for(const victim of rt.api.G.actors||[]){
          if(!victim?.alive||victim.team===actor.team||state.footHits.has(victim))continue;
          // WeaponSpSkewer BulletParam.CollisionRadiusForPlayer=.8 and
          // WeaponParam.OffsetLocal_DetectPlayer={X:0,Y:.8,Z:1}.
          // Sweep the rider's actual forward/upward detector, not the foot
          // position with an inflated horizontal radius (which hits upper floors).
          const point=rt.v12.set(victim.pos.x,victim.pos.y+.75,victim.pos.z);
          const detectFrom=rt.v13.copy(from).addScaledVector(state.direction,1);
          const detectTo=rt.v14.copy(actor.pos).addScaledVector(state.direction,1);
          detectFrom.y+=.8;detectTo.y+=.8;
          if(segmentDistance(rt,point,detectFrom,detectTo)<=.8){
            state.footHits.add(victim);rt.api.G.projectiles.applyHit(actor,victim,220,'reefslider');
          }
        }
      }
      // The 11.3.0 dash acceleration is horizontal: gravity must not inflate travel.
      // MoveFrame=54 is the powered slide only. The 38F preburst still
      // moves the actor, but is not extra dash distance.
      if(!isBrake)state.travel+=Math.hypot(actor.pos.x-from.x,actor.pos.z-from.z);
      actor.invuln=Math.max(actor.invuln,dt+.025);
      // Complete the 54th source movement step before starting the 38F fuse.
      if(!isBrake&&(actor.contacts?.wall||state.dashT+1e-8>=54/FPS)){
        state.phase='brake';s.phase='brake';state.brakeT=0;
      } else if(isBrake&&state.brakeT+1e-8>=38/FPS){
        reefImpact(rt,actor,state,actor.pos.clone());
      }
    }
    return;
  }
  if(state.id==='tripleInkstrike'){
    moveActor(rt,actor,dt,state,{squid:false});
    if(edges.subUp&&state.shots<3)state.markerQueued=true;
    // 20F activation +14F throw. The 19F post-throw recovery and next 14F
    // throw yield a 33F spacing; this keeps the actual sub-release input path.
    if(state.markerQueued&&state.shots<3&&elapsed+14/FPS<=state.duration+1e-8
       &&elapsed+1e-8>=state.nextMarkerStart){
      state.markerQueued=false;
      queueSubThrow(state,14,(r,a,st,index)=>{
        deployInkstrike(r,a,st,index);
        st.shots++;
        st.nextMarkerStart=st.t+19/FPS;
        if(st.shots>=3)endSpecial(r,a,'deployed');
      },state.shots);
    } else if(elapsed+1e-8>=state.duration)endSpecial(rt,actor,'timeout');
    return;
  }
  if(state.id==='superChump'){
    moveActor(rt,actor,dt,state,{squid:false});
    if(edges.fire){throwChumps(rt,actor,state);return;}
    if(elapsed+1e-8>=state.duration)endSpecial(rt,actor,'duration');return;
  }
  if(state.id==='krakenRoyale'){
    const dir=aimDirection(rt,actor,rt.v0);
    if(elapsed+1e-8<1){dampForSpecial(actor,dt);state.phase='startup';s.phase=state.phase;return;}
    if(elapsed+1e-8>=state.duration){state.phase='finish';state.armor=false;s.armor=false;s.phase=state.phase;dampForSpecial(actor,dt);if(elapsed+1e-8>=state.duration+1)endSpecial(rt,actor,'duration');return;}
    if(state.phase==='startup')state.phase='active';
    state.armor=true;s.armor=true;
    if(state.phase==='dash'){
      state.dashT+=dt;const before=actor.pos.clone(),py=actor.pos.y;
      actor.vel.x=state.direction.x*21;actor.vel.z=state.direction.z*21;actor.vel.y=0;
      actor.pos.addScaledVector(actor.vel,dt);actor._resolve?.(false,py,false);
      state.dashHits||=new Set();
      // 11.3.0 WeaponSpCastle BodyParam: CollisionDashFrontOffset=2.75,
      // CollisionDashRadiusForPlayer=1.5. Offset BOTH ends of the true
      // 3D travelled segment; never enlarge radius at the actor's feet.
      const hitFrom=rt.v13.copy(before).addScaledVector(state.direction,2.75);
      const hitTo=rt.v14.copy(actor.pos).addScaledVector(state.direction,2.75);
      for(const victim of rt.api.G.actors||[]){
        if(!victim?.alive||victim.team===actor.team||state.dashHits.has(victim))continue;
        if(!krakenDashSweptContact(hitFrom,hitTo,victim.pos,1.5))continue;
        // The attack capsule projects 2.75 ahead of the resolved body. A
        // solid wall can block the body while the capsule reaches past it.
        // Require native LOS from the corresponding unshifted body point.
        const sweep=rt.v2.copy(hitTo).sub(hitFrom),lengthSq=sweep.lengthSq();
        const t=lengthSq>1e-12?clamp(rt.v3.copy(victim.pos).sub(hitFrom).dot(sweep)/lengthSq,0,1):0;
        const from=rt.v3.copy(before).lerp(actor.pos,t),to=rt.v4.copy(victim.pos);
        from.y+=.05;to.y+=.05; // Avoid a floor-coplanar ray.
        if(rt.api.G.physics?.los&&!rt.api.G.physics.los(from,to))continue;
        rt.api.G.projectiles.applyHit(actor,victim,120,'krakenRoyale');
        state.dashHits.add(victim);
      }
      stampLine(rt,actor,before,actor.pos,1.2,nextSeed(state));
      if(state.dashT>=35/60){state.phase='active';state.dashT=0;}
    }else {const jumped=edges.jump&&actor.grounded;moveActor(rt,actor,dt,state,{speed:state.phase==='charge'?1.9:5.5,squid:false,jump:true});state.jumpAttack=jumped;}
    if(state.jumpAttack){state.jumpAttack=false;
      const center=rt.v0.copy(actor.pos);center.y+=.65;
      damageBandRadius(rt,actor,center,[[2.65,60]],2.65,'krakenRoyale',null,3);
      paintStamp(rt,actor,groundAt(rt,actor.pos,rt.v1),1.2,nextSeed(state));fxBurst(rt,actor,center,2.65,'hit');
      emitAction(rt,actor,state.id,state.serial,'jump',center,null,nextSeed(state),{damage:60,index:state.strikes++});
    }
    if(edges.fire&&state.phase!=='dash'){
      state.phase='charge';state.chargeT=0;state.direction.copy(dir).setY(0).normalize();state.dashHits=new Set();
      actor.character?.trigger?.('special_charge');
    }else if(state.phase==='charge'){
      if(actor.intent.fire){state.chargeT+=dt;state.direction.copy(dir).setY(0).normalize();}
      if(edges.fireUp){
        if(state.chargeT+1e-8>=35/60){state.phase='dash';state.dashT=0;actor.character?.trigger?.('special_dash');}
        else {state.phase='active';state.chargeT=0;}
      }
    }
    if(elapsed+1e-8>=state.duration)endSpecial(rt,actor,'duration');return;
  }
  if(state.id==='splattercolorScreen'){
    moveActor(rt,actor,dt,state,{squid:true});
    if(edges.subUp){queueSubThrow(state,13,deployScreen);return;}return;
  }
  if(state.id==='waveBreaker'){
    moveActor(rt,actor,dt,state,{squid:true});
    if(edges.subUp)queueSubThrow(state,actor.weapon.sub==='inkMine'?16:5,deployWave);
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
  if(id==='booyahBomb'){state.charge=0;state.armorHP=470;state.cheerCalls=new WeakMap();state.cheerHeld=new WeakMap();actor.s3CatalogueBooyah=serial;}
  if(id==='ultraStamp'){state.stampHolding=false;state.stampCount=0;state.jumpStampAt=null;state.nextSwing=47/FPS;}
  if(id==='crabTank'){state.armorHP=500;state.cannon=false;state.nextShot=20/60;state.nextCannon=20/60;state.cannonT=0;state.fireStart=null;state.wasRolling=false;}
  if(id==='reefslider'){state.paintRadius=gearCurve(ap,7.51,8.26,9.012);state.damageDistanceRate=gearCurve(ap,1,1.1,1.2);state.phase='startup';state.direction=aimDirection(rt,actor,new rt.api.THREE.Vector3());state.direction.y=0;state.direction.normalize();state.startupT=0;state.footHits=new Set();}
  if(id==='tripleInkstrike'){state.nextMarkerStart=20/FPS;state.markerQueued=false;}
  if(id==='waveBreaker')state.phase='ready';
  if(id==='zipcaster')state.phase='ready';
  if(id==='krakenRoyale'){state.armorHP=Infinity;state.phase='startup';state.direction=new rt.api.THREE.Vector3();}
  if(id==='killerWail'){state.phase='charge';state.beamPairs=[];state.nextLock=36/FPS;}
  if(id==='inkjet'){actor.vel.y=Math.max(actor.vel.y,7.4);state.nextShot=1;}
  if(id==='zipcaster'){state.inkFuel=150;state.abilityPoints=ap;
    state.hookInkCost=gearCurve(ap,4,2.5,1.5);state.inkDrainPerSecond=gearCurve(ap,15,13.05,12);
    state.hookInk=gearCurve(ap,.04,.025,.015);state.inkPerSecond=gearCurve(ap,.15,.1305,.12);}

  actorStates.set(actor,state);actor._s3AllSpecialState=state;
  actor.specialActive={id,t:0,phase:state.phase,armor:false,armorHP:state.armorHP,activation:serial};
  if(id==='tentaMissiles'||id==='superChump')startSpecialGauge(actor,rt.api.G,id,SPECIAL_GAUGE_FRAMES[id]);
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
  // Only native completed attacks/jumps retire wall protection. Input held
  // through hook flight / hookWait may still be denied by the action runner.
  api.on?.('weapon:fire',event=>updateZipcasterArmor(event?.actor,{fire:true}));
  api.on?.('actor:jump',event=>updateZipcasterArmor(event?.actor,{jump:true}));
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
      // Held main input at activation cannot stand in for a special throw.
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
    booyahAfterArmor.delete(this);this._s3AllSpecialState=null;return reset.apply(this,args);
  };
  proto.splat=function(...args){
    const state=actorStates.get(this);if(state)endSpecial(rt,this,'splat');
    booyahAfterArmor.delete(this);return splat.apply(this,args);
  };
  proto.damage=function(amount,attacker,source){
    const tail=booyahAfterArmor.get(this);
    if(tail&&(api.G.time||0)>=tail.until)booyahAfterArmor.delete(this);
    const state=actorStates.get(this)||((api.G.time||0)<tail?.until?tail:null);
    if(!state||!(amount>0)||source==='ink')return damage.call(this,amount,attacker,source);
    if(state.id==='krakenRoyale'&&state.t>=1&&state.t<state.duration)return false;
    if(state.id==='crabTank'&&crabRearCoreHit(this,attacker)){
      const armor=this.specialActive?.armor;
      if(this.specialActive)this.specialActive.armor=false;
      api.emit?.('actor:armorhit',{actor:this,absorbed:0,broken:false,core:true,kind:'crabTank'});
      try{return damage.call(this,amount,attacker,source);}finally{if(this.specialActive)this.specialActive.armor=armor;}
    }
    if((state.id==='booyahBomb'&&state.t+1e-8>=.5||state.id==='crabTank')&&state.armorHP>0){
      const shield=state.armorHP,cause=attacker?._s3AllSpecialDamageCause||source,scale=objectDamageScale(attacker,state.id,cause),scaled=amount*scale;
      const absorbed=Math.min(shield,scaled),left=scale>0?Math.max(0,amount-absorbed/scale):0;
      state.armorHP=Math.max(0,shield-absorbed);
      if(this.specialActive)this.specialActive.armorHP=state.armorHP;
      api.emit?.('actor:armorhit',{actor:this,absorbed,broken:state.armorHP<=0,kind:state.id});
      if(scale<=0)return false;
      if(left<=0)return false;
      return damage.call(this,left,attacker,source);
    }
    return damage.call(this,amount,attacker,source);
  };
  const P=Projectiles.prototype,update=P.update,clear=P.clear,baseCandidate=P.kitDefenseCandidate,blast=P._blastBurst,newProjectile=P._new,projectileStep=P._step;
  // Projectiles are pooled, so every field owned by this module expires on reuse.
  P._new=function(...args){
    const p=newProjectile.apply(this,args);
    for(const key of SPECIAL_ROUND_FIELDS)delete p[key];
    return p;
  };
  if(typeof projectileStep==='function')P._step=function(p,...args){
    const cause=p?.s3AllSpecial?projectileObjectCause(p):null;
    const advance=()=>p?.s3AllSpecialFlight
      ?stepSourceFlight(this,p,args[0],projectileStep)
      :projectileStep.call(this,p,...args);
    return cause&&!p?.ghost&&!p?.owner?.remote?withObjectDamageCause(p,advance,cause):advance();
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
        // The S3 mechanics reference describes tracking before the overhead
        // descent/landing marker. A launch-time coordinate alone makes every
        // missile miss a moving target even during that tracking phase.
        // Keep the existing calibrated .7s transition; its retail timing and
        // the missing long-range horizontal phase remain unverified.
        const target=p.s3TentaTargetActor;
        if(!p.s3TentaDescending&&target?.alive&&finite3(target.pos)&&actorLife(target)===p.s3TentaTargetLife)
          p.s3TentaTarget.copy(groundAt(rt,target.pos,rt.v2));
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
    const owner=p?.owner,previousCause=owner?._s3AllSpecialDamageCause;
    const cause=projectileObjectCause({...p,s3AllSpecialMode:'blast'});
    if(owner&&!p?.ghost&&!owner.remote)owner._s3AllSpecialDamageCause=cause;
    let result;
    try{result=blast.call(this,p,at,...args);}finally{
      if(owner){if(previousCause===undefined)delete owner._s3AllSpecialDamageCause;else owner._s3AllSpecialDamageCause=previousCause;}
    }
    const weapon=p?.s3SpecialWeapon||p?.s3Weapon||api.WEAPONS?.[p?.wid]||api.WEAPONS?.blaster;
    const bands=weapon?.splashBands||weapon?.damageBands;
    if(!p?.ghost&&!p?.owner?.remote&&bands?.length&&p.s3AllSpecial!=='booyahBomb'){
      const radius=weapon.splashRadius||weapon.burstRadius||bands.at(-1)?.[0]||0;
      specialObjectRadius(rt,p,at,radius,d=>{
        if(d<=bands[0][0])return bands[0][1];
        for(let i=1;i<bands.length;i++)if(d<=bands[i][0]){const [r0,d0]=bands[i-1],[r1,d1]=bands[i];return r1===r0?d1:d0+(d1-d0)*((d-r0)/(r1-r0));}
        return bands.at(-1)?.[1]||0;
      },cause);
    }
    if(!p?.ghost&&!p?.owner?.remote&&p?.s3AllSpecial&&p.s3AllSpecial!=='booyahBomb'&&finite(p.s3AllSpecialPaintRadius)&&p.s3AllSpecialPaintRadius>MAX_STAMP_RADIUS)
      paintDisk(rt,p.owner,at,p.s3AllSpecialPaintRadius,p.s3AllSpecialSeed||0,p.seed);
    if(!p?.ghost&&!p?.owner?.remote&&p?.s3AllSpecial&&p.s3AllSpecial!=='booyahBomb')
      paintSpecialChannels(rt,p.owner,at,{crossRadius:p.s3AllSpecialCrossPaintRadius,crossLength:p.s3AllSpecialCrossPaintLength,
        splashAroundRadius:p.s3AllSpecialSplashAroundRadius,splashAroundCount:p.s3AllSpecialSplashAroundCount,
        splashAroundOffsetY:p.s3AllSpecialSplashAroundOffsetY,splashAroundVelocityMin:p.s3AllSpecialSplashAroundVelocityMin,
        splashAroundVelocityMax:p.s3AllSpecialSplashAroundVelocityMax,splashAroundPitchMin:p.s3AllSpecialSplashAroundPitchMin,
        splashAroundPitchMax:p.s3AllSpecialSplashAroundPitchMax},p.s3AllSpecialSeed||0);
    if(!p?.ghost&&!p?.owner?.remote&&p?.s3AllSpecial==='booyahBomb'){
      const seed=normalizedSeed(p.s3AllSpecialSeed||0),state=actorStates.get(p.owner)||{serial:p.s3AllSpecialActivation||1,seed,objectSerial:0};
      const pos=groundAt(rt,at,rt.v0).clone();
      deployObject(rt,p.owner,'booyahBomb','booyahBlast',pos,state,{dur:80/FPS,startDelay:40/FPS,expand:40/FPS,maxRadius:12.6,paintRadius:13.5,damage:3.3,seed,target:pos});
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
  api.superChumpLandingPreview=superChumpLandingPreview;
  api.tentaMissilesLockPreview=tentaMissilesLockPreview;
  P.s3DamageSpecialObjects=function(attack,center,radius,damageAtDistance,cause=null){
    if(!attack||!center||!(radius>=0)||typeof damageAtDistance!=='function')return false;
    rt.system=this;specialObjectRadius(rt,attack,center,radius,damageAtDistance,cause,false);return true;
  };
  return rt;
}

/** Installs the additional actor special state machines and world-device hooks. */
export function installAllSpecials(api) { installRuntime(api); return api; }
// Cancel actor control when picking up an objective; deployed objects survive.
export function interruptSpecialForObjective(api, actor) {
  if (!actor) return;
  disposeInkVac(actor);
  endTrizooka(actor, 'objective-pickup');
  const rt = runtimes.get(api?.Projectiles);
  if (rt && actorStates.has(actor)) endSpecial(rt, actor, 'objective-pickup');
  if (actor) { actor.specialActive = null; actor.special = 0; }
}

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
    const rate=withObjectHitGear(actor,event.objectShredder,()=>objectDamageScale(actor,object.id,event.cause||'Default'));
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
    const extra={dur:finite(event.duration)?event.duration:1,maxRadius:finite(event.radius)?event.radius:(SPECIALS[event.id]?.radius||1),damage:0,hp:finite(event.hp)?event.hp:0,seed:event.seed,index:event.index||0,target,width:finite(event.width)&&event.width>0?event.width:15,height:finite(event.height)&&event.height>0?event.height:9};
    if(kind==='screen'){
      const direction=target?target.clone().sub(point).setY(0).normalize():new rt.api.THREE.Vector3(Math.sin(actor.aimYaw||0),0,Math.cos(actor.aimYaw||0));
      extra.direction=direction;extra.moveSpeed=gearCurve(state.specialPowerAP,.04,.053,.06)*FPS;extra.yaw=Math.atan2(direction.x,direction.z);
    }
    if(kind==='booyahBlast'){extra.startDelay=finite(event.startDelay)?event.startDelay:40/FPS;extra.expand=finite(event.expand)?event.expand:40/FPS;extra.damage=3.3;}
    object=deployObject(rt,actor,event.id,kind,point,state,extra);
    if(kind==='marker'){object.phase='flight';object.origin=point.clone();object.flight=82/FPS;}
    if(kind==='decoy'){object.phase='flight';object.origin=point.clone();object.flight=108/FPS;}
    if(kind==='wave'){
      object.hp=finite(event.hp)?event.hp:480;object.maxHp=object.hp;object.pulse=0;object.maxWaveFrame=finite(event.waveFrame)&&event.waveFrame>0?event.waveFrame:160/FPS;
      object.pulseFrames=[90/FPS,240/FPS,390/FPS];object.waves=[];
      // Source GeneratorParam.MarkingFrame=45. Without this, remotely
      // replayed devices never mark a recipient within the initial ring.
      object.markingUntil=rt.api.G.time+45/FPS;
    }else if(kind==='waveFront'){
      object.maxWaveFrame=finite(event.waveFrame)&&event.waveFrame>0?event.waveFrame:160/FPS;
      object.last=0;object.seen=new Set();object.pulse=event.index||0;
    }
    if(kind==='screen')object.target=target;
  }
  if(!object)return false;
  if(event.action==='move'){
    object.pos.copy(point);if(object.mesh){object.mesh.position.copy(point);if(object.kind==='screen')object.mesh.position.y+=object.height/2;}
    if(object.kind==='screen'&&target){const normal=target.clone().sub(point).setY(0).normalize();object.normal.copy(normal);object.direction.copy(normal);object.tangent.set(normal.z,0,-normal.x);object.target=target;}
  }else if(event.action==='active'){
    if(object.kind==='marker'){object.kind='strike';object.phase='active';object.activeAt=object.age;object.dur=51/FPS;object.maxRadius=7.7;object.currentRadius=.5;object.nextDamage=object.age+5/FPS;object.once=new Set();}
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
