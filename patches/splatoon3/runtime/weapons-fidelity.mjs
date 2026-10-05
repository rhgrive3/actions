// Main-weapon gameplay only. Values live in profile.json; provenance and retained
// uncertainty live in reference/weapons-fidelity-reference.json. No RNG here.
import {distanceDamage, groupDamage, applyProjectileHit as legacyHit} from './weapons.mjs';
export const EPSILON = 1e-10;
const INSTALLED = Symbol.for('inkwave.weapons-fidelity.v1');
let api;
const clamp01 = value => Math.max(0, Math.min(1, value));
const radians = degrees => degrees * Math.PI / 180;

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

// Preserve the native 60 Hz semi-implicit convention. A straight-state boundary
// is counted exactly once, then a capped/braked phase precedes free fall.
// Unsupported families retain native force order; all main rounds now respect their declared lifetime.
export function advanceFidelityProjectile(p, dt) {
  p.prev.copy(p.pos);
  const remaining = Math.max(0, p.life - p.age);
  const step = Math.min(dt, remaining);
  p.age += step;
  const move = p.fidelityMove;
  if (!move) {
    if (p.age > p.straight) p.vel.y -= p.grav * step;
    if (p.drag) p.vel.multiplyScalar(1 - p.drag * step * (p.age > p.straight ? 1 : 0));
  } else if (p.age > p.straight + EPSILON) {
    if (p.fidelityPhase === 0) {
      const speed = p.vel.length();
      if (move.endSpeed !== null && speed > move.endSpeed) p.vel.multiplyScalar(move.endSpeed / speed);
      p.fidelityPhase = 1;
    }
    const brake = p.fidelityPhase === 1;
    p.vel.multiplyScalar(Math.pow(1 - (brake ? move.brakeDrag : move.freeDrag), step * move.hz));
    p.vel.y -= (brake ? move.brakeGravity : move.freeGravity) * step;
    // The documented Y transition is used; the apparently unused frame/XZ
    // defaults are not silently interpreted as additional transition tests.
    if (brake && p.vel.y < move.freeVelocityY) p.fidelityPhase = 2;
  }
  p.pos.addScaledVector(p.vel, step);
}

// Source keeps the existing random draws at their original call sites. This
// function changes the vertical fan into five distinct pitch/speed layers;
// horizontal speed/yaw sampling and all cosmetic samples remain inherited.
export function configureFidelityFlick(p, actor, weapon, index, angle, speed) {
  const b = weapon.ballistics;
  if (!b) return;
  const vertical = !!actor.weaponRunner.s3FlickVertical;
  let pitch = Math.max(-.2, Math.min(.5, actor.aimPitch)); // native aim envelope
  let unit = null;
  if (vertical) {
    let offset = index;
    for (const candidate of b.verticalUnits) {
      if (offset < candidate.count) { unit = candidate; break; }
      offset -= candidate.count;
    }
    if (!unit) throw new RangeError('Roller projectile count exceeds the reference unit layout');
    speed = (unit.speed ?? weapon.verticalSpeed) + offset * unit.speedStep;
    pitch += radians(unit.pitchDegrees + offset * unit.pitchStepDegrees);
    angle = actor.yaw; // all selected vertical units have SpawnRotateYDegree=0
  } else pitch += radians(b.horizontalPitchDegrees);
  const cp = Math.cos(pitch);
  p.vel.set(Math.sin(angle)*cp*speed, Math.sin(pitch)*speed, Math.cos(angle)*cp*speed);
  p.fidelityYaw = Math.atan2(Math.sin(angle-actor.yaw),Math.cos(angle-actor.yaw));
  p.fidelityMode = vertical ? 'vertical' : 'horizontal';
  p.fidelityPlayerCollision = vertical ? unit?.playerCollision ?? null : b.horizontalPlayerCollision ?? null;
  p.straight = vertical ? b.verticalStraightTime : b.horizontalStraightTime;
  // Set these before _push/recProj; the old wrapper set them after publication.
  p.grav = weapon.flickGravity; p.drag = weapon.flickDrag;
}

export function fidelityPlayerCollisionRadius(p) {
  const c = p.fidelityPlayerCollision;
  if (!c) return p.size;
  if (!(Number.isFinite(c.initRadius) && Number.isFinite(c.endRadius) && Number.isFinite(c.changeTime) && c.changeTime > 0)) return p.size;
  const t = clamp01(p.age / c.changeTime);
  return c.initRadius + (c.endRadius - c.initRadius) * t;
}

function rollerCollisionForProjectile(weapon,p,vertical) {
  if (p.fidelityPlayerCollision) return p.fidelityPlayerCollision;
  const b=weapon.ballistics;
  if(!vertical) return b.horizontalPlayerCollision??null;
  const speed=p.vel.length();
  let chosen=b.verticalUnits[0]?.playerCollision??null,best=Infinity;
  for(const unit of b.verticalUnits) for(let offset=0;offset<unit.count;offset++){
    const expected=(unit.speed??weapon.verticalSpeed)+offset*unit.speedStep;
    const delta=Math.abs(speed-expected);
    if(delta<best){best=delta;chosen=unit.playerCollision??chosen;}
  }
  return chosen;
}

function scratch(system) {
  return system._fidelityCollision || (system._fidelityCollision = {
    worldReady:false, bossReady:false, world:new api.Hit(), boss:null,
    base:new api.THREE.Vector3(), res:{t:0,dist:0}, targets:[],
  });
}
export function fidelityWorldHit(system,p) {
  const s=scratch(system);
  if(!s.worldReady){api.G.physics.segment(p.prev,p.pos,s.world,true);s.worldReady=true;}
  return s.world;
}
export function fidelityBossHit(system,p) {
  const s=scratch(system);
  if(!s.bossReady){
    s.boss = api.G.boss?.segHit(p.prev,p.pos,p.size*.6) || null;
    const world=fidelityWorldHit(system,p);
    if(s.boss && world.hit && s.boss.dist >= world.dist - EPSILON)s.boss=null;
    s.bossReady=true;
  }
  return s.boss;
}

// Use the real Physics capsule query, retaining its native size convention.
// The original loop selected actor-array order and tested the wall afterwards.
// One reusable scratch record avoids per-projectile sorting/allocation and
// also avoids a second terrain query when the segment reaches the world.
export function fidelityProjectileTargets(system,p) {
  const s=scratch(system),{G,Physics,PLAYER}=api;
  s.worldReady=s.bossReady=false;s.boss=null;s.targets.length=0;
  const radius=PLAYER.radius*.95+fidelityPlayerCollisionRadius(p);
  let nearest=null,best=Infinity;
  for(const actor of G.actors){
    if(actor.team===p.team||!actor.alive)continue;
    if(actor.pos.x < Math.min(p.prev.x,p.pos.x)-radius || actor.pos.x > Math.max(p.prev.x,p.pos.x)+radius ||
       actor.pos.z < Math.min(p.prev.z,p.pos.z)-radius || actor.pos.z > Math.max(p.prev.z,p.pos.z)+radius)continue;
    s.base.set(actor.pos.x,actor.pos.y+(actor.smoothY||0),actor.pos.z);
    Physics.segmentCapsuleDist(p.prev,p.pos,s.base,PLAYER.radius,actor.form==='squid'?PLAYER.squidHeight:PLAYER.height,s.res);
    if(s.res.dist < radius && s.res.t < best){best=s.res.t;nearest=actor;}
  }
  if(nearest){
    const length=p.prev.distanceTo(p.pos),world=fidelityWorldHit(system,p),boss=fidelityBossHit(system,p);
    if((!world.hit || best*length < world.dist-EPSILON) && (!boss || best*length < boss.dist-EPSILON))s.targets.push(nearest);
  }
  return s.targets;
}

// Keep the old volley membership for splash exclusion, but do not let it defeat
// the already-installed maximum-per-volley damage group when a stronger glob
// reaches a victim after a weaker glob. No second full hit is awarded.
export function fidelityVolleyDamage(p,victim,amount) {
  if(!p.vol)return amount;
  const seen=p.vol.hits.includes(victim);
  if(!seen)p.vol.hits.push(victim);
  return seen && !p.s3DamageGroup ? 0 : amount;
}
export function applyFidelitySlosherSplash(system,p,victim,amount) {
  const delta=groupDamage(p.s3DamageGroup,victim,amount);
  if(delta>0)system.applyHit(p.owner,victim,delta,p.wid||'slosher');
}
export function applyFidelityProjectileHit(system,p,victim,amount,point) {
  const w=p.s3Weapon||p.owner.weapon;
  if(w.kind!=='roller')return legacyHit(system,p,victim,amount,point);
  const b=w.ballistics;
  if(!b)return legacyHit(system,p,victim,amount,point);
  const d=p.start.distanceTo(point);
  const outside=!p.s3Vertical && d>b.horizontalInsideDistance && Math.abs(p.fidelityYaw)>radians(b.horizontalInsideDegrees);
  const bands=p.s3Vertical?w.verticalDamageBands:outside?b.horizontalOutsideDamageBands:w.flickDamageBands;
  amount=groupDamage(p.s3DamageGroup,victim,distanceDamage(bands,d));
  if(amount>0)system.applyHit(p.owner,victim,amount,p.wid||p.type);
}

export function splatlingLaunchSpeed(weapon,charge) {
  const maximum=weapon.ballistics?.firstChargeSpeed;
  if(!Number.isFinite(maximum))return weapon.projSpeed;
  const first=weapon.firstChargeTime/weapon.chargeTime;
  // Endpoints are extracted; the interpolation is a labelled minimal model,
  // not a claim of recovered Nintendo code or of its random speed bias.
  return weapon.projSpeed+(maximum-weapon.projSpeed)*clamp01(charge/first);
}

export function installWeaponsFidelity(context,profile) {
  const {WeaponRunner,Projectiles,WEAPONS}=context;
  if(Object.hasOwn(Projectiles.prototype,INSTALLED))return;
  const defaults=profile.weaponsFidelity;
  if(!defaults || defaults.schema!==1 || profile.referenceHz!==60)throw new Error('Missing or unsupported weapons fidelity profile');
  for (const [name,value] of Object.entries({brakeDrag:defaults.brakeDragPerFrame,freeDrag:defaults.freeDragPerFrame}))
    if(!Number.isFinite(value)||value<0||value>=1)throw new RangeError('Invalid '+name);
  if(!Number.isFinite(defaults.brakeGravity)||defaults.brakeGravity<0||!Number.isFinite(defaults.freeGravity)||defaults.freeGravity<0||!Number.isFinite(defaults.brakeToFreeVelocityY))throw new RangeError('Invalid ballistic gravity/transition');
  const roller=WEAPONS.roller;
  if(roller?.ballistics && roller.ballistics.verticalUnits.reduce((n,u)=>n+u.count,0)!==roller.verticalDrops)throw new Error('Vertical roller unit count differs from profile');
  api=context;
  const moves=new Map();
  for(const [id,w]of Object.entries(WEAPONS)){
    if(!w.ballistics)continue;
    const b=w.ballistics;
    const finite=(value,label)=>{if(!Number.isFinite(value)||value<0)throw new RangeError('Invalid '+id+' '+label);};
    if(b.endSpeed!==null)finite(b.endSpeed,'brake entry speed');
    const drag=b.freeDragPerFrame??defaults.freeDragPerFrame;
    if(!Number.isFinite(drag)||drag<0||drag>=1)throw new RangeError('Invalid '+id+' free drag');
    if(w.kind==='roller'){
      finite(b.horizontalStraightTime,'horizontal straight time');finite(b.verticalStraightTime,'vertical straight time');
      if(!Number.isFinite(b.horizontalPitchDegrees)||!Number.isFinite(b.horizontalInsideDegrees))throw new RangeError('Invalid roller angle');
      const collisionOk=c=>c&&[c.initRadius,c.endRadius,c.changeTime].every(Number.isFinite)&&c.initRadius>=0&&c.endRadius>=c.initRadius&&c.changeTime>0;
      if(!collisionOk(b.horizontalPlayerCollision))throw new RangeError('Invalid roller horizontal player collision');
      for(const u of b.verticalUnits){
        if(!Number.isInteger(u.count)||u.count<=0||![u.speed??w.verticalSpeed,u.speedStep,u.pitchDegrees,u.pitchStepDegrees].every(Number.isFinite))throw new RangeError('Invalid roller unit');
        finite((u.speed??w.verticalSpeed)+(u.count-1)*u.speedStep,'last unit speed');
        if(!collisionOk(u.playerCollision))throw new RangeError('Invalid roller vertical player collision');
      }
    }
    if(w.kind==='blaster'){finite(b.straightTime,'straight time');finite(b.burstTime,'burst time');}
    if(w.kind==='splatling')finite(b.firstChargeSpeed,'charged speed');
    freezeDeep(b);
    moves.set(id,freezeDeep({hz:profile.referenceHz,endSpeed:b.endSpeed??null,
      brakeDrag:defaults.brakeDragPerFrame,brakeGravity:defaults.brakeGravity,
      freeDrag:b.freeDragPerFrame??defaults.freeDragPerFrame,
      freeGravity:w.kind==='roller'?w.flickGravity:w.referenceGravity??defaults.freeGravity,
      freeVelocityY:defaults.brakeToFreeVelocityY}));
  }
  Object.defineProperty(Projectiles.prototype,INSTALLED,{value:true});
  const fresh=Projectiles.prototype._new,push=Projectiles.prototype._push,ghost=Projectiles.prototype.ghostProjectile,clear=Projectiles.prototype.clear;
  Projectiles.prototype.clear=function(...args){const result=clear.apply(this,args);this._fidelityCollision=null;return result;};
  Projectiles.prototype._new=function(...args){
    const p=fresh.apply(this,args);p.fidelityMove=null;p.fidelityPhase=0;p.fidelityYaw=0;p.fidelityMode=null;p.fidelityPlayerCollision=null;return p;
  };
  function initialize(p,w){
    if(!w)return;
    p.fidelityMove=moves.get(w.id)||null;p.fidelityPhase=0;
    if(!p.fidelityMove)return;
    if(w.kind==='blaster'){
      p.straight=w.ballistics.straightTime;p.life=w.ballistics.burstTime;
      p.grav=p.fidelityMove.freeGravity;p.drag=p.fidelityMove.freeDrag*profile.referenceHz;
    } else if(w.kind==='roller'){
      // Both modes send their real straight duration in the existing packet.
      // Ghosts derive the mode from that duration, without a protocol extension.
      const vertical=p.fidelityMode==='vertical'||p.ghost&&Math.round(p.straight*profile.referenceHz)===Math.round(w.ballistics.verticalStraightTime*profile.referenceHz);
      p.fidelityMode=vertical?'vertical':'horizontal';p.s3Vertical=vertical;
      p.fidelityPlayerCollision=rollerCollisionForProjectile(w,p,vertical);
      p.straight=vertical?w.ballistics.verticalStraightTime:w.ballistics.horizontalStraightTime;
      p.grav=w.flickGravity;p.drag=w.flickDrag;
    } else {
      p.straight=w.straightTime;p.grav=w.referenceGravity;p.drag=p.fidelityMove.freeDrag*profile.referenceHz;
    }
  }
  Projectiles.prototype._push=function(p){
    initialize(p,p.owner?.weapon);
    return push.call(this,p);
  };
  Projectiles.prototype.ghostProjectile=function(actor,event){
    const before=this.list.length;const result=ghost.call(this,actor,event);
    if(this.list.length>before){const p=this.list.at(-1);initialize(p,WEAPONS[p.wid]||actor.weapon);}
    return result;
  };
  const reset=WeaponRunner.prototype.reset,auto=WeaponRunner.prototype._auto,spin=WeaponRunner.prototype._splatling;
  WeaponRunner.prototype.reset=function(...args){const result=reset.apply(this,args);this.fidelitySplatlingCharge=null;return result;};
  WeaponRunner.prototype._auto=function(dt,input,w){
    if(w.kind==='blaster' && this.s3BlasterWindup>0 && this.s3BlasterWindup-dt<=EPSILON)this.cooldown=0;
    return auto.call(this,dt,input,w);
  };
  WeaponRunner.prototype._splatling=function(dt,input,w){
    if(this.charging && !input.fire)this.fidelitySplatlingCharge=this.charge;
    return spin.call(this,dt,input,w);
  };
  const fireSpin=Projectiles.prototype.fireSplatling;
  Projectiles.prototype.fireSplatling=function(actor,w,spread){
    const speed=splatlingLaunchSpeed(w,actor.weaponRunner.fidelitySplatlingCharge??actor.weaponRunner.charge??0);
    return fireSpin.call(this,actor,{...w,projSpeed:speed},spread);
  };
}