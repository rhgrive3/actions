// Main-weapon gameplay only. Values live in profile.json; provenance and retained
// uncertainty live in reference/weapons-fidelity-reference.json.
// Source fields and interpreted equations are explicitly separated in the profile.
import {distanceDamage, groupDamage, applyProjectileHit as legacyHit} from './weapons.mjs';
import { capsuleEntry, sweptWorldHit } from './weapons-collision.mjs';
import { installChargerFlight } from './weapons-charger-flight.mjs';
export const EPSILON = 1e-10;
const INSTALLED = Symbol.for('inkwave.weapons-fidelity.v1');
let api, completion;
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
  p.fidelityPrevAge = p.age;
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
    if (brake && (p.vel.y < move.freeVelocityY || move.freeFrame!=null && (p.age-p.straight)*move.hz+EPSILON>=move.freeFrame)) p.fidelityPhase = 2;
  }
  p.pos.addScaledVector(p.vel, step);
}

// Source records supply endpoints/counts. Added random draws are deterministic
// under the fixture seed; the source PRNG/bias distribution is not recovered.
function rawWeapon(w) { return completion?.weapons[w.id || w.kind]; }
function collisionRecord(c, target, offset = 0) {
  return { initRadius:Math.max(0,c['InitRadiusFor'+target]+offset*(c['AfterOffsetInitRadiusFor'+target]||0)),
    endRadius:Math.max(0,c['EndRadiusFor'+target]+offset*(c['AfterOffsetEndRadiusFor'+target]||0)),
    changeTime:Math.max(0,(c['ChangeFrameFor'+target]||0)/60) };
}
function radiusAt(c, age, fallback) {
  if(!c)return fallback;
  const t=c.changeTime>0?clamp01(age/c.changeTime):1;
  return c.initRadius+(c.endRadius-c.initRadius)*t;
}
export function fidelityPlayerCollisionRadius(p) { return radiusAt(p.fidelityPlayerCollision,p.age,p.size); }
function fieldRadiusAt(p,age) { return radiusAt(p.fidelityFieldCollision,age,p.fieldRadius||0); }
function setCollision(p,c,offset=0) {
  p.fidelityPlayerCollision=collisionRecord(c,'Player',offset);
  p.fidelityFieldCollision=collisionRecord(c,'Field',offset);
  // #656 only corrects ordinary Shooter rounds. Other weapon families retain
  // their existing teammate pass-through until their separate semantics are verified.
  p.fidelityFriendThrough=p.s3Weapon?.kind==='shooter' && Number.isFinite(c.FriendThroughFrameForPlayer)?c.FriendThroughFrameForPlayer:null;
  // Existing packet size carries initial radius; layout is unchanged.
  p.size=p.fidelityPlayerCollision.initRadius;
}
export function configureFidelityFlick(p, actor, weapon, index, angle, speed) {
  const b=weapon.ballistics, raw=rawWeapon(weapon);if(!b||!raw)return;
  // The attack argument owns this projectile's physics. Preserve it through
  // _push so a later actor/profile mutation cannot rewrite an already-fired volley.
  p.s3Weapon={...weapon}; p.wid=weapon.id;
  const vertical=!!actor.weaponRunner.s3FlickVertical;
  const group=raw[vertical?'VerticalSwingUnitGroupParam':'WideSwingUnitGroupParam'];
  let offset=index,unit;
  for(const u of group.Unit){if(offset<(u.BulletNum??1)){unit=u;break;}offset-=u.BulletNum??1;}
  if(!unit)throw new RangeError('Roller index exceeds pinned units + labelled defaults');
  let pitch=Math.max(-.2,Math.min(.5,actor.aimPitch));
  if(vertical){
    speed=60*(unit.SpawnSpeedBase+offset*(unit.AfterOffsetSpawnSpeed||0));
    pitch+=radians((unit.SpawnRotateXDegreeBase||0)+offset*(unit.AfterOffsetSpawnRotateXDegree||0));
    angle=actor.yaw+radians(unit.SpawnRotateYDegree||0);
  }else{
    const count=unit.BulletNum??1,fan=count>1?offset/(count-1)*2-1:0;
    speed=60*(unit.SpawnSpeedBase+(Math.random()*2-1)*(unit.SpawnSpeedRandom||0));
    angle=actor.yaw+fan*radians(unit.SpawnWideDegree||0);
    pitch+=radians(b.horizontalPitchDegrees); // retained calibrated launch angle, NOT extracted
    const side=fan*(unit.SpawnPositionWidth||0),j=unit.SpawnPositionRandomCube||0;
    p.pos.x+=Math.cos(actor.yaw)*side+(Math.random()*2-1)*j;
    p.pos.z-=Math.sin(actor.yaw)*side-(Math.random()*2-1)*j;
    p.pos.y+=(Math.random()*2-1)*j;
  }
  // Only offsets are extracted. Native body +1.3 anchor is not claimed as Switch height.
  p.pos.y+=(unit.SpawnPositionOffsetHeight||0)+(unit.SpawnPositionHeight||0);
  p.prev.copy(p.pos);p.start.copy(p.pos);
  const cp=Math.cos(pitch);
  p.vel.set(Math.sin(angle)*cp*speed,Math.sin(pitch)*speed,Math.cos(angle)*cp*speed);
  p.fidelityYaw=Math.atan2(Math.sin(angle-actor.yaw),Math.cos(angle-actor.yaw));
  p.fidelityMode=vertical?'vertical':'horizontal';p.fidelityRollerUnit=unit;
  setCollision(p,unit.UnitParam.CollisionParam);
  p.straight=unit.UnitParam.MoveParam.GoStraightToBrakeStateFrame/60;
  p.grav=weapon.flickGravity;p.drag=weapon.flickDrag;
}

function scratch(system) {
  return system._fidelityCollision || (system._fidelityCollision = {
    worldReady:false, bossReady:false, world:new api.Hit(), boss:null,
    base:new api.THREE.Vector3(), res:{t:0,dist:0}, targets:[],
  });
}
export function fidelityWorldHit(system,p) {
  const s=scratch(system);
  if(!s.worldReady){sweptWorldHit(api.G.physics,p.prev,p.pos,fieldRadiusAt(p,p.fidelityPrevAge??p.age),fieldRadiusAt(p,p.age),s.world,true);s.worldReady=true;}
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

// Use the native body dimensions with continuous first-contact capsule entry.
// The original loop selected actor-array order and tested the wall afterwards.
// One reusable scratch record avoids per-projectile sorting/allocation and
// also avoids a second terrain query when the segment reaches the world.
export function fidelityProjectileTargets(system,p) {
  const s=scratch(system),{G,PLAYER}=api;
  s.worldReady=s.bossReady=false;s.boss=null;s.targets.length=0;p.fidelityImpactActor=null;p.fidelityImpactT=null;
  // Ghosts share visual collision chronology, but never damage/paint ownership.
  const r0=radiusAt(p.fidelityPlayerCollision,p.fidelityPrevAge??p.age,p.size);
  const r1=fidelityPlayerCollisionRadius(p),radius=PLAYER.radius+Math.max(r0,r1);
  let nearest=null,best=Infinity;
  for(const actor of G.actors){
    if(!actor.alive||actor===p.owner)continue;
    const friendly=actor.team===p.team;
    // S3 teammate body-block: friendly capsules follow the per-family source
    // FriendThroughFrameForPlayer window. A missing source record keeps the
    // native same-team skip instead of inventing one global collider rule.
    if(friendly&&!Number.isFinite(p.fidelityFriendThrough))continue;
    if(actor.pos.x<Math.min(p.prev.x,p.pos.x)-radius||actor.pos.x>Math.max(p.prev.x,p.pos.x)+radius||
       actor.pos.z<Math.min(p.prev.z,p.pos.z)-radius||actor.pos.z>Math.max(p.prev.z,p.pos.z)+radius)continue;
    s.base.set(actor.pos.x,actor.pos.y+(actor.smoothY||0),actor.pos.z);
    const t=capsuleEntry(p.prev,p.pos,s.base,PLAYER.radius,actor.form==='squid'?PLAYER.squidHeight:PLAYER.height,r0,r1);
    if(t===null)continue;
    if(friendly){
      // The window is measured in source frames at the contact point of this
      // sweep, so the fixed-step result is identical at any render cadence.
      const prevAge=p.fidelityPrevAge??p.age;
      if((prevAge+(p.age-prevAge)*t)*60<p.fidelityFriendThrough-EPSILON)continue;
    }
    if(t<best-EPSILON||Math.abs(t-best)<EPSILON&&String(actor.nid??actor.name)<String(nearest?.nid??nearest?.name)){best=t;nearest=actor;}
  }
  if(nearest){
    const length=p.prev.distanceTo(p.pos),world=fidelityWorldHit(system,p),boss=fidelityBossHit(system,p);
    if((!world.hit||best*length<world.dist-EPSILON)&&(!boss||best*length<boss.dist-EPSILON)){
      s.targets.push(nearest);p.fidelityImpactActor=nearest;p.fidelityImpactT=best;
    }
  }
  return s.targets;
}

// Keep the old volley membership for splash exclusion, but do not let it defeat
// the already-installed maximum-per-volley damage group when a stronger glob
// reaches a victim after a weaker glob. No second full hit is awarded.
export function fidelityVolleyDamage(p,victim,amount) {
  // Teammate body-block contact consumes the round without friendly damage,
  // kill credit, or volley/damage-group bookkeeping.
  if(victim.team===p.team)return 0;
  if(!p.vol)return amount;
  const seen=p.vol.hits.includes(victim);
  if(!seen)p.vol.hits.push(victim);
  return seen && !p.s3DamageGroup ? 0 : amount;
}
export function applyFidelitySlosherSplash(system,p,victim,amount) {
  // A glob consumed by a teammate never splashes enemies behind the ally.
  if(victim.team===p.team)return;
  // Active Splat Bucket units have no SplashSlosherHitParam records. No radial damage.
  if(rawWeapon(p.s3Weapon||p.owner.weapon)?.UnitGroupParam)return;
  if(p.ghost)return;
  const delta=groupDamage(p.s3DamageGroup,victim,amount);
  if(delta>0)system.applyHit(p.owner,victim,delta,p.wid||'slosher');
}
export function fidelityDamage(p,point) {
  const w=p.s3Weapon||p.owner.weapon;
  if(w.kind==='roller'&&w.ballistics){
    const b=w.ballistics,d=p.start.distanceTo(point),xz=Math.hypot(point.x-p.start.x,point.z-p.start.z);
    const outside=!p.s3Vertical&&xz>b.horizontalInsideDistance&&Math.abs(p.fidelityYaw)>radians(b.horizontalInsideDegrees);
    const bands=p.s3Vertical?w.verticalDamageBands:outside?b.horizontalOutsideDamageBands:w.flickDamageBands;
    const source=rawWeapon(w)[p.s3Vertical?'VerticalSwingUnitGroupParam':'WideSwingUnitGroupParam'].DamageParam;
    const age=(p.fidelityPrevAge??p.age??0)+((p.age??0)-(p.fidelityPrevAge??p.age??0))*(p.fidelityImpactT??1);
    const t=clamp01((age*60-source.DamageRejectStartFrame)/(source.DamageRejectEndFrame-source.DamageRejectStartFrame));
    return distanceDamage(bands,d)*(1+(source.DamageRejectRate-1)*t);
  }
  if(w.kind==='slosher'&&p.fidelitySloshUnit){
    const d=p.fidelitySloshUnit.DamageParam,fall=Math.max(0,p.start.y-point.y);
    const t=clamp01((fall-d.ReduceStartFallDistance)/(d.ReduceEndFallDistance-d.ReduceStartFallDistance));
    return (d.ValueMax+(d.ValueMin-d.ValueMax)*t)/10;
  }
  const age=(p.fidelityPrevAge??p.age)+(p.age-(p.fidelityPrevAge??p.age))*(p.fidelityImpactT??1);
  if(['shooter','dualies','splatling'].includes(w.kind)){
    const t=clamp01((age-w.damageReduceStart)/(w.damageReduceEnd-w.damageReduceStart));
    return w.damage+(w.damageMin-w.damage)*t;
  }
  return p.damage;
}
export function applyFidelityProjectileHit(system,p,victim,amount,point) {
  // Teammate body-block: the round is already consumed by the solver; never
  // route friendly damage, kill credit, or enemy-hit side effects.
  if(victim.team===p.team)return;
  if(p.ghost)return;
  amount=groupDamage(p.s3DamageGroup,victim,fidelityDamage(p,point));
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
  api=context;completion=profile.weaponsFidelityCompletion;
  if(!completion||completion.schema!==1)throw new Error('Missing completion source table');
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
      for(const u of b.verticalUnits){
        if(!Number.isInteger(u.count)||u.count<=0||![u.speed??w.verticalSpeed,u.speedStep,u.pitchDegrees,u.pitchStepDegrees].every(Number.isFinite))throw new RangeError('Invalid roller unit');
        finite((u.speed??w.verticalSpeed)+(u.count-1)*u.speedStep,'last unit speed');
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
  Projectiles.prototype.clear=function(...args){const result=clear.apply(this,args);this._fidelityCollision=null;this._fidelitySloshContext=null;return result;};
  Projectiles.prototype._new=function(...args){
    const p=fresh.apply(this,args);p.fidelityMove=null;p.fidelityPhase=0;p.fidelityYaw=0;p.fidelityMode=null;p.fidelityPlayerCollision=null;p.fidelityFieldCollision=null;p.fidelityFriendThrough=null;p.fidelityRollerUnit=null;p.fidelitySloshUnit=null;p.fidelityPrevAge=0;p.fidelityImpactActor=null;p.fidelityImpactT=null;return p;
  };
  function initialize(p,w){
    if(!w)return;
    const raw=rawWeapon(w);p.s3Weapon={...w};p.wid=w.id;p.fidelityPhase=0;
    p.fidelityMove=moves.get(w.id)||null;
    if(raw?.CollisionParam){
      const c=w.kind==='dualies'&&p.owner?.weaponRunner?.s3Turret?raw.CollisionLapOverParam:raw.CollisionParam;
      // On ghosts the existing size field disambiguates standing vs turret radius.
      setCollision(p,p.ghost&&w.kind==='dualies'&&p.size>(raw.CollisionParam.InitRadiusForPlayer+raw.CollisionLapOverParam.InitRadiusForPlayer)/2?raw.CollisionLapOverParam:c);
    }
    if(w.kind==='blaster'){
      p.straight=w.ballistics.straightTime;p.life=w.ballistics.burstTime;
      p.grav=p.fidelityMove.freeGravity;p.drag=p.fidelityMove.freeDrag*60;
    }else if(w.kind==='roller'){
      const vertical=p.fidelityMode==='vertical'||p.ghost&&Math.round(p.straight*60)===Math.round(w.ballistics.verticalStraightTime*60);
      p.fidelityMode=vertical?'vertical':'horizontal';p.s3Vertical=vertical;
      if(!p.fidelityRollerUnit){
        const units=raw[vertical?'VerticalSwingUnitGroupParam':'WideSwingUnitGroupParam'].Unit;
        let best=Infinity;
        for(const u of units)for(let i=0;i<(u.BulletNum??1);i++){
          const d=Math.abs(p.vel.length()-60*(u.SpawnSpeedBase+i*(u.AfterOffsetSpawnSpeed||0)));
          if(d<best){best=d;p.fidelityRollerUnit=u;}
        }
        setCollision(p,p.fidelityRollerUnit.UnitParam.CollisionParam);
      }
      p.straight=(vertical?w.ballistics.verticalStraightTime:w.ballistics.horizontalStraightTime);
      p.grav=w.flickGravity;p.drag=w.flickDrag;
    }else if(w.kind==='slosher'){
      if(!p.fidelitySloshUnit){
        let best=Infinity;
        for(const u of raw.UnitGroupParam.Unit)for(let i=0;i<(u.BulletNum??1);i++){
          // Packet radius is rounded to 0.01, so use the unique source launch delay,
          // serialized at 0.001 seconds, to recover the unit without extra fields.
          const delay=((u.UnitDelayFrame||0)+i*(u.AfterOffsetDelayFrame||0))/60;
          const delta=Math.abs((p.delay||0)-delay);
          if(delta<best){best=delta;p.fidelitySloshUnit=u;p.fidelitySloshIndex=i;}
        }
      }
      const u=p.fidelitySloshUnit,c=u.MoveParam;
      setCollision(p,u.CollisionParam,p.fidelitySloshIndex);
      p.straight=c.GoStraightToBrakeStateFrame/60;
      p.fidelityMove={hz:60,endSpeed:c.GoStraightStateEndMaxSpeed*60,brakeDrag:c.BrakeAirResist,brakeGravity:c.BrakeGravity*3600,
        freeDrag:c.FreeAirResist,freeGravity:c.FreeGravity*3600,freeVelocityY:c.BrakeToFreeVelocityY*60,freeFrame:c.BrakeToFreeStateFrame};
      p.grav=c.FreeGravity*3600;p.drag=c.FreeAirResist*60;
    }else if(p.fidelityMove){p.straight=w.straightTime;p.grav=w.referenceGravity;p.drag=p.fidelityMove.freeDrag*60;}
  }
  Projectiles.prototype._push=function(p){
    const w=p.s3Weapon||WEAPONS[p.wid]||p.owner?.weapon,active=this._fidelitySloshContext;
    if(active&&p.type==='slosh'){
      let index=active.index++,u;
      for(const unit of rawWeapon(w).UnitGroupParam.Unit){if(index<(unit.BulletNum??1)){u=unit;break;}index-=unit.BulletNum??1;}
      if(!u)throw new RangeError('Slosher unit index');
      p.fidelitySloshUnit=u;p.fidelitySloshIndex=index;
      p.delay=((u.UnitDelayFrame||0)+index*(u.AfterOffsetDelayFrame||0))/60;
      const speed=((p.owner.grounded?u.SpawnSpeedGround:u.SpawnSpeedAir)+index*(u.AfterOffsetSpawnSpeed||0))*60;
      const aim=p.owner.aimDir.clone().normalize();
      const yaw=Math.atan2(aim.x,aim.z)+radians(u.BaseRotateYDegree||0)+
        (u.RandomRotateYOffOrderNum?.includes(index)?0:(Math.random()*2-1)*radians(u.RandomRotateYDegree||0));
      const pitch=Math.atan2(aim.y,Math.hypot(aim.x,aim.z)),horizontal=Math.cos(pitch)*speed;
      p.vel.set(Math.sin(yaw)*horizontal,Math.sin(pitch)*speed+horizontal*(u.AddSpawnSpeedYRateByXZ||0),Math.cos(yaw)*horizontal);
      p.damage=u.DamageParam.ValueMax/10;p.head=!!u.HitEffectBigOrderNum?.includes(index);
      p.s3DamageGroup=active.group;
    }
    initialize(p,w);
    const group=p.s3DamageGroup;const result=push.call(this,p);
    // The generic wrapper snapshots owner state too; retain a single per-volley owner.
    if(group)p.s3DamageGroup=group;
    return result;
  };
  Projectiles.prototype.ghostProjectile=function(actor,event){
    const before=this.list.length;const result=ghost.call(this,actor,event);
    if(this.list.length>before){const p=this.list.at(-1);initialize(p,WEAPONS[p.wid]||actor.weapon);}
    return result;
  };
  const slosh=Projectiles.prototype.fireSlosh;
  Projectiles.prototype.fireSlosh=function(actor,w){
    const previous=this._fidelitySloshContext;this._fidelitySloshContext={index:0,group:new Map()};
    try{return slosh.call(this,actor,{...w,drops:rawWeapon(w).UnitGroupParam.Unit.reduce((n,u)=>n+(u.BulletNum??1),0)});}
    finally{this._fidelitySloshContext=previous;}
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
    let speed=splatlingLaunchSpeed(w,actor.weaponRunner.fidelitySplatlingCharge??actor.weaponRunner.charge??0);
    const rate=rawWeapon(w).MoveParam.SpawnSpeedRandomRate;
    // Bounds are extracted. Uniform law is an explicit model; native bias law is unknown.
    speed*=1+(Math.random()*2-1)*rate;
    return fireSpin.call(this,actor,{...w,projSpeed:speed},spread);
  };
  // Boss and player hits share the same weapon damage envelope. The old native
  // boss path used a separate seven-unit falloff and an unrelated 0.3s throttle.
  const bossImpact=Projectiles.prototype._bossImpact,blastBurst=Projectiles.prototype._blastBurst;
  Projectiles.prototype._bossImpact=function(p,hit){
    if(p.ghost)return;
    const w=p.s3Weapon||p.owner.weapon;
    if(!['roller','slosher','shooter','dualies','splatling'].includes(w.kind))return bossImpact.call(this,p,hit);
    const victim=hit.target?.hp!==undefined&&hit.target?.id!==undefined?hit.target:context.G.boss;
    const damage=groupDamage(p.s3DamageGroup,victim,fidelityDamage(p,hit.point));
    if(damage>0)context.G.boss.hit(p.owner,damage,hit.target,w.id,hit.point.clone());
    context.emit('weapon:impact',{pos:hit.point.clone(),normal:p.vel.clone().normalize().negate(),team:p.team,kind:p.type==='shot'?'shot':'drop',radius:p.radius*.5,victim:null});
  };
  Projectiles.prototype._blastBurst=function(p,point,victim){
    if(!p.ghost)return blastBurst.call(this,p,point,victim);
    const w=p.s3Weapon||WEAPONS.blaster;
    context.G.fx?.explosion(point,p.owner.color,w.burstRadius);
    context.G.audio?.play('blaster_boom',{pos:point,volume:.7});
  };
  const nativeImpact=Projectiles.prototype._impact;
  Projectiles.prototype._impact=function(p,hit){
    if(!p.ghost)return nativeImpact.call(this,p,hit);
    // A disconnected ghost still cannot mutate paint even when G.netm is gone.
    if(p.type==='blast')this._blastBurst(p,hit.point,null);
    else context.G.fx?.burst(hit.point,hit.normal,p.owner.color,{count:5,speed:3,size:.07,paint:false});
  };
  installChargerFlight(context,completion);
}
