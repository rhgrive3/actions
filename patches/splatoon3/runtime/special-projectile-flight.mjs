import { gearCurve } from './gear.mjs';

// Both authoritative rounds and read-only guides consume this exact source
// frame. Values absent from the 11.3.0 table keep their documented runtime
// calibration; a guide must never silently substitute Splat Bomb ballistics.
export const SPECIAL_PROJECTILE_HZ = 60;
export const INKJET_RANGE=30, INKJET_SPEED=21;
export function specialProjectileOptions(id,mode,charge=1,ap=0){
  if(id==='booyahBomb')return {speed:13+charge*4,grav:19,drag:.16,life:2.1,arc:4.2,
    radius:3.7,damage:0,paintRadius:13.5,size:.48};
  if(id==='ultraStamp')return {speed:22,grav:17,drag:.13,life:1.8,sourceMode:'throw',size:.4,damage:220,paintRadius:5};
  if(id==='inkjet')return {speed:INKJET_SPEED,grav:0,drag:0,straight:INKJET_RANGE/INKJET_SPEED+1,
    life:INKJET_RANGE/INKJET_SPEED,size:.24,paintRadius:gearCurve(ap,3.2,3.6,4)};
  if(id==='crabTank'&&mode==='shooter')return {type:'shot',directOnly:true,damage:32,radius:1.6,size:.2,
    speed:3.36*60,grav:4,drag:.04,life:1.25,sourceMode:'shooter',damageReduce:{max:32,min:16,start:9/60,end:25/60}};
  if(id==='crabTank')return {speed:18,grav:18,drag:.12,life:1.7,damage:50,radius:4.5,size:.28,paintRadius:4.5,sourceMode:'cannon'};
  return null;
}
export function specialProjectileFlight(id, mode, type, ap = 0) {
  if (id === 'booyahBomb') return { spawnSpeed: gearCurve(ap,1,1,1)*60,
    spawnYMin: -.4*60, gravity: .021*3600, positionAirResist: .045,
    source: 'WeaponSpNiceBall.MoveParam' };
  if (id === 'ultraStamp' && (mode === 'throw' || type === 'blast')) return {
    spawnSpeed: gearCurve(ap,.85,.85,.85)*60, spawnY: .17*60,
    spawnYMin: -.4*60, gravity: .013*3600, positionAirResist: .03,
    source: 'WeaponSpUltraStamp.ThrowMoveParam' };
  if (id === 'crabTank' && (mode === 'shooter' || type === 'shot')) return {
    spawnSpeed: 3.36*60, straightFrames: 7, maxSpeed: 2.232*60,
    gravity: .016*3600, source: 'WeaponSpChariot.ShooterMoveParam' };
  if (id === 'crabTank' && (mode === 'cannon' || type === 'blast')) return {
    straightFrames: 8, brakeFrames: 1, brakeGravity: .04*3600,
    brakeAirResist: .1, gravity: .05*3600, airResist: .12,
    source: 'WeaponSpChariot.CannonParam.MoveParam' };
  return null;
}

export function applySpecialProjectileLaunch(p, direction, source) {
  if (!source) return p;
  p.s3AllSpecialFlight = source;
  p.s3AllSpecialFlightCarry = 0;
  p.straight = source.straightFrames !== undefined ? source.straightFrames/60 : 0;
  if (source.spawnSpeed) {
    p.vel.copy(direction).multiplyScalar(source.spawnSpeed);
    if (source.spawnY) p.vel.y += source.spawnY;
  }
  if (source.spawnYMin !== undefined) p.vel.y = Math.max(source.spawnYMin,p.vel.y);
  return p;
}

// Populate a caller-owned round. Native launch supplies its pooled record;
// prediction supplies fresh vectors and never calls _new/_push or advances RNG.
export function configureSpecialProjectile(p,actor,id,origin,direction,opts,ap,descriptor){
  const dir=direction.clone();
  if(dir.lengthSq()<1e-9)dir.copy(actor.aimDir);
  dir.normalize();
  Object.assign(p,{type:opts.type||'blast',wid:id,owner:actor,team:actor.team,age:0,
    life:opts.life||1.8,straight:opts.straight??.16,
    radius:opts.radius??descriptor.paintRadius,damage:opts.damage??descriptor.directDamage,
    size:opts.size??.22,trail:0,trailEvery:opts.trailEvery||0,trailRadius:.45,
    grav:opts.grav??20,drag:opts.drag??.24});
  p.pos.copy(origin);p.prev.copy(origin);p.start.copy(origin);
  p.vel.copy(dir).multiplyScalar(opts.speed||17);
  if(opts.arc)p.vel.y+=opts.arc;
  if(opts.sourceMode)p.s3AllSpecialMode=opts.sourceMode;
  applySpecialProjectileLaunch(p,dir,specialProjectileFlight(id,opts.sourceMode,p.type,ap));
  p.s3SpecialWeapon=descriptor;p.s3Weapon=opts.weapon||descriptor||{id,kind:'special',special:id};
  p.s3AllSpecial=id;p.s3SpecialPowerAP=ap;
  return p;
}

// One 60 Hz force pass, before the production position/collision integrator.
// PositionAirResist is the runtime's horizontal retention; ordinary AirResist
// retains all components. This preserves the existing source interpretation.
export function stepSpecialProjectileForces(p) {
  const source=p?.s3AllSpecialFlight;
  if (!source) return false;
  const frame=Math.round((p.age||0)*60),straight=source.straightFrames||0;
  if(source.maxSpeed&&frame===straight){
    const speed=p.vel.length();if(speed>source.maxSpeed)p.vel.multiplyScalar(source.maxSpeed/speed);
  }
  let gravity=source.gravity||0,resistance=source.airResist||0,
    positionResistance=source.positionAirResist||0;
  if(source.brakeFrames){
    if(frame<straight){gravity=0;resistance=0;}
    else if(frame<straight+source.brakeFrames){gravity=source.brakeGravity;resistance=source.brakeAirResist;}
  }else if(frame<straight){gravity=0;resistance=0;positionResistance=0;}
  if(gravity)p.vel.y-=gravity/60;
  if(resistance)p.vel.multiplyScalar(1-resistance);
  if(positionResistance){const retain=1-positionResistance;p.vel.x*=retain;p.vel.z*=retain;}
  return true;
}

