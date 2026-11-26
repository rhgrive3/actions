import { captureNav, followNav, strafe, noteSighting, recentSighting } from './bot-special-movement.mjs';
import { trizookaState } from './kit-trizooka.mjs';
import { inkVacState } from './kit-ink-vac.mjs';
import { tentaMissilesLockPreview } from './all-specials.mjs';
import { crabTankMuzzle } from './crab-tank-aim.mjs';

// INKWAVE bot heuristics, not retail CPU behaviour or new weapon parameters.
// Only admitted Actor inputs and the existing aim spring are driven here.
const RANGED = new Set(['trizooka','tentaMissiles','inkjet','booyahBomb','killerWail','inkVac','crabTank','zipcaster']);
const LIMITS = {trizooka:[8,38,12],tentaMissiles:[12,90,35],inkjet:[9,28,12],booyahBomb:[8,30,9],killerWail:[5,80,30],inkVac:[6,26,10],crabTank:[10,32,10],zipcaster:[12,30,12]};
const INPUT_KEYS = ['fire','sub','special','squid','jump','booyah'];
const AIM_OPTS = {height:0,lead:0};
const WATER_PROBE = {pos:null};
const LOCK_API = {Projectiles:null};
const finitePoint = p => !!(p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
const stop = c => c.move?.set(0,0,0);
const aimed = (c,t=.13) => c.isAimed ? c.isAimed(t) : c.aligned === true;
const mainRange = c => Math.max(1, Number(c.brain?._range?.()) || Number(c.actor.weapon?.range) || 16);
function safeFloor(c,p) {
  if(!finitePoint(p))return false;
  const y=c.world?.level?.groundHeight?.(p.x,p.z,p.y+1);
  if(!(Number.isFinite(y) && y> -100 && Math.abs(y-p.y)<2))return false;
  WATER_PROBE.pos=p;
  const wet=!!c.brain?._nearWater?.(WATER_PROBE,1.5);
  WATER_PROBE.pos=null;
  return !wet;
}
function aim(c,p,height=.7,lead=0) {
  AIM_OPTS.height=height;AIM_OPTS.lead=lead;
  c.aimAt?.(p,AIM_OPTS);
}
function keepDistance(c,near,far) {
  // A blocked retreat/approach sidesteps instead of freezing in place.
  if(c.distance<near){if(!c.moveToward?.(c.enemy.pos,-1)&&!strafe(c,c.enemy.pos,.8))stop(c);}
  else if(c.distance>far){if(!c.moveToward?.(c.enemy.pos,.65)&&!strafe(c,c.enemy.pos,.65))stop(c);}
  else stop(c);
}
// No visible target while a moving special is active: chase the recent
// sighting, then follow the brain's own navigation instead of idling.
function roam(c,scale=1) {
  const p=recentSighting(c,2.5);
  if(p&&Math.hypot(p.x-c.actor.pos.x,p.z-c.actor.pos.z)>2&&Math.abs(p.y-c.actor.pos.y)<=3&&c.moveToward?.(p,scale)){aim(c,p,.7);return true;}
  if(followNav(c,scale))return true;
  stop(c);return false;
}
// Crab Tank paints while travelling; aim the stream at the ground ahead.
function paintAhead(c) {
  const mv=c.move,l=mv?Math.hypot(mv.x,mv.z):0;if(!(l>=.1))return false;
  const p=(c.memory.rangedPaintPoint ||= c.actor.pos.clone());
  p.set(c.actor.pos.x+mv.x/l*9,c.actor.pos.y,c.actor.pos.z+mv.z/l*9);
  aim(c,p,0);return aimed(c,.2);
}
function flyToward(c,point,scale=1) {
  const {actor,world,move,memory:m}=c;
  if(!finitePoint(point)||!move?.set||!Number.isFinite(scale)||scale===0){stop(c);return false;}
  const dx=point.x-actor.pos.x,dz=point.z-actor.pos.z,d=Math.hypot(dx,dz);
  if(!(d>=.5)){stop(c);return false;}
  const step=Math.sign(scale)*Math.min(2,d),probe=(m.rangedFlightProbe ||= actor.pos.clone());
  probe.set(actor.pos.x+dx/d*step,actor.pos.y,actor.pos.z+dz/d*step);
  const floor=world?.level?.groundHeight?.(probe.x,probe.z,probe.y+.25);
  // The common walking path correctly rejects a five-unit drop. Inkjet is
  // already hovering, so check flight clearance and landing support instead.
  let wet=false;
  if(c.brain?._wet)wet=!!c.brain._wet(probe.x,probe.z,probe.y);
  else if(c.brain?._nearWater){WATER_PROBE.pos=probe;wet=!!c.brain._nearWater(WATER_PROBE,.5);WATER_PROBE.pos=null;}
  if(!Number.isFinite(floor)||floor<= -100||floor>probe.y+.1||probe.y-floor>14||wet||world?.physics?.los?.(actor.pos,probe)!==true){stop(c);return false;}
  const clamped=Math.max(-1,Math.min(1,scale));
  move.set(dx/d*clamped,0,dz/d*clamped);return true;
}
function inputsOff(c) {
  const it=c.intent;if(!it)return;
  for(let i=0;i<INPUT_KEYS.length;i++)it[INPUT_KEYS[i]]=false;
}
function resetActivationMemory(m) {
  m.rangedLockTime=0;m.rangedLockTarget=null;
  m.rangedCrabRolling=false;m.rangedCrabRollHold=0;
}
function ownState(c) {
  if(c.special==='trizooka')return trizookaState(c.actor)||c.state;
  if(c.special==='inkVac')return inkVacState(c.actor)||c.state;
  return c.actor._s3AllSpecialState?.id===c.special?c.actor._s3AllSpecialState:c.state;
}
function rememberVisible(c) {
  const m=c.memory;
  m.rangedSeenAge=(m.rangedSeenAge??Infinity)+c.dt;
  if(c.enemy&&c.visible&&finitePoint(c.enemy.pos)){
    (m.rangedSeenPoint ||= c.actor.pos.clone()).copy(c.enemy.pos);
    m.rangedSeenTarget=c.enemy;m.rangedSeenAge=0;
  }
}
function recentLockPoint(c) {
  const m=c.memory;
  return m.rangedSeenAge<=.8 && m.rangedSeenTarget?.alive && m.rangedSeenTarget.team!==c.actor.team ? m.rangedSeenPoint : null;
}
function bombThreat(c) {
  for(const bomb of c.world?.projectiles?.bombs||[]){
    if(bomb.dead||bomb.team===c.actor.team||!finitePoint(bomb.pos))continue;
    if(c.actor.pos.distanceTo(bomb.pos)<4.5&&c.world.physics?.los?.(c.actor.pos,bomb.pos)!==false)return true;
  }
  return false;
}
// Pick the low flight arc of the existing NiceBall source trajectory. This
// compensates its horizontal drag; it does not modify the projectile itself.
function aimBooyah(c) {
  const dx=c.enemy.pos.x-c.actor.pos.x,dz=c.enemy.pos.z-c.actor.pos.z,d=Math.hypot(dx,dz);
  const h=c.actor.pos.y+1.2-c.enemy.pos.y;
  let bestError=Infinity,bestPitch=0;
  for(let pitch=-.6;pitch<=1.00001;pitch+=.04){
    const vy=Math.max(-24,60*Math.sin(pitch)),a=75.6/7200,b=a-vy/60;
    const disc=b*b+4*a*h;if(disc<0)continue;
    const frames=(-b+Math.sqrt(disc))/(2*a);if(!(frames>0&&frames<=126))continue;
    const travel=Math.cos(pitch)*.955*(1-Math.pow(.955,frames))/.045;
    const error=Math.abs(travel-d);
    if(error<bestError){bestError=error;bestPitch=pitch;}
  }
  const p=(c.memory.rangedAimPoint ||= c.actor.pos.clone());
  // all-specials emits along aimPoint minus feet, while the shared spring
  // constructs that point from the eye. Keep this target in the emitter basis.
  p.set(c.enemy.pos.x,c.actor.pos.y+Math.tan(bestPitch)*d,c.enemy.pos.z);
  aim(c,p,0);return bestError<=10;
}
// Cannon shells brake and drop much sooner than the rapid-fire rounds. Aim
// their existing short arc toward the target's ground instead of reusing ZR.
function aimCrabCannon(c) {
  const m=c.memory,direction=(m.rangedCannonDirection ||= c.actor.pos.clone());
  const origin=(m.rangedCannonOrigin ||= c.actor.pos.clone());
  const point=(m.rangedAimPoint ||= c.actor.pos.clone());
  const yaw=Math.atan2(c.enemy.pos.x-c.actor.pos.x,c.enemy.pos.z-c.actor.pos.z);
  const reach=Math.max(3,Number.isFinite(c.distance)?c.distance:3);
  let error=Infinity;
  for(let pitch=-.1;pitch<=1.00001;pitch+=.05){
    const cp=Math.cos(pitch);direction.set(Math.sin(yaw)*cp,Math.sin(pitch),Math.cos(yaw)*cp);
    crabTankMuzzle(c.actor,'cannon',origin,direction);
    let x=origin.x,y=origin.y,z=origin.z,vx=direction.x*18,vy=direction.y*18,vz=direction.z*18;
    for(let frame=0;frame<102;frame++){
      if(frame>=8){vy-=(frame===8?144:180)/60;const retain=frame===8?.9:.88;vx*=retain;vy*=retain;vz*=retain;}
      x+=vx/60;y+=vy/60;z+=vz/60;
      if(y<=c.enemy.pos.y+.28&&vy<0){
        const miss=Math.hypot(x-c.enemy.pos.x,z-c.enemy.pos.z);
        if(miss<error){error=miss;point.copy(origin).addScaledVector(direction,reach);}
        break;
      }
    }
  }
  if(error>4)return false;
  aim(c,point,0);return true;
}
function hookPoint(c) {
  const {actor,enemy,memory:m,world}=c,d=c.distance;
  if(!(d>1)||!world?.physics?.raycast)return null;
  const gap=Math.max(3.5,Math.min(8,mainRange(c)*.65));
  const point=(m.rangedHookPoint ||= actor.pos.clone());
  point.copy(enemy.pos);point.x-=(enemy.pos.x-actor.pos.x)*gap/d;point.z-=(enemy.pos.z-actor.pos.z)*gap/d;
  const floor=world.level?.groundHeight?.(point.x,point.z,point.y+1);
  if(!Number.isFinite(floor))return null;point.y=floor;
  if(!safeFloor(c,point))return null;
  const origin=(m.rangedHookOrigin ||= actor.pos.clone()).copy(actor.pos);origin.y+=1.05;
  const direction=(m.rangedHookDirection ||= actor.pos.clone()).copy(point).sub(origin);
  const length=direction.length();if(length<3||length>35)return null;direction.normalize();
  const hit=(m.rangedHookHit ||= {hit:false,point:actor.pos.clone(),normal:actor.pos.clone()});
  hit.hit=false;const contact=world.physics.raycast(origin,direction,Math.min(35,length+.3),hit,true);
  if(!contact?.hit||!finitePoint(contact.point)||!finitePoint(contact.normal)||contact.normal.y<.5)return null;
  if(contact.point.distanceTo(point)>1.5||!safeFloor(c,contact.point))return null;
  // The aim point must be the actual surface, never an arbitrary enemy reticle.
  return point.copy(contact.point);
}


function hookAimedAtSurface(c,point) {
  if(!finitePoint(c.actor.aimPoint)||!c.world?.physics?.raycast)return false;
  const m=c.memory,origin=(m.rangedHookOrigin ||= c.actor.pos.clone()).copy(c.actor.pos);
  origin.y+=1.05;
  const direction=(m.rangedHookDirection ||= c.actor.pos.clone()).copy(c.actor.aimPoint).sub(c.actor.pos);
  if(!(direction.lengthSq()>=4))return false;direction.normalize();
  const hit=(m.rangedHookEmissionHit ||= {hit:false,point:c.actor.pos.clone(),normal:c.actor.pos.clone()});
  hit.hit=false;
  const contact=c.world.physics.raycast(origin,direction,35,hit,true);
  return !!(contact?.hit&&finitePoint(contact.point)&&contact.normal?.y>=.5
    &&contact.point.distanceTo(point)<=.8&&safeFloor(c,contact.point));
}

export function driveRangedSpecial(c) {
  if(!RANGED.has(c.special))return false;
  captureNav(c);
  const {actor,intent:it}=c;
  if(!actor?.alive||actor.remote||!finitePoint(actor.pos)||!(c.dt>0)||!Number.isFinite(c.dt)){
    if(c.memory&&!actor?.alive){
      c.memory.rangedSeenAge=Infinity;c.memory.rangedSeenTarget=null;
      resetActivationMemory(c.memory);
    }
    inputsOff(c);return true;
  }
  const m=(c.memory ||= {});
  if(m.rangedLife!==actor.netLife){
    m.rangedLife=actor.netLife;m.rangedSeenAge=Infinity;m.rangedSeenTarget=null;
    resetActivationMemory(m);
  }
  if(m.rangedState!==c.state){
    m.rangedState=c.state;
    resetActivationMemory(m);
  }
  const valid=c.enemy?.alive&&c.enemy.team!==actor.team&&finitePoint(c.enemy.pos)&&c.visible===true;
  if(!valid)c.enemy=null;
  rememberVisible(c);
  noteSighting(c);
  const active=c.state?.id===c.special;
  if(!active){
    if(it)it.special=false;
    if(!c.enemy||((c.special==='tentaMissiles'||c.special==='killerWail')&&c.enemy.botBossTarget))return true;
    const [near,far,height]=LIMITS[c.special];
    if(!(c.distance>=near&&c.distance<=far&&Math.abs(c.height)<=height)||!actor.specialReady?.())return true;
    if((c.special==='inkjet'||c.special==='booyahBomb'||c.special==='zipcaster')&&(!actor.grounded||!safeFloor(c,actor.pos)))return true;
    if(c.special==='zipcaster'&&(c.distance<=mainRange(c)*1.1||!hookPoint(c)))return true;
    aim(c,c.enemy.pos,.7);
    if(aimed(c,.2)&&it)it.special=true;
    return true;
  }
  inputsOff(c);
  if(!it)return true;
  const s=ownState(c)||c.state;
  if(s.phase==='finish'||s.phase==='recovery'||s.phase==='done'){stop(c);return true;}
  const enemy=c.enemy;
  if(c.special==='killerWail'){
    // Three lock windows share the real aim; after them the native main policy
    // resumes, including its ordinary weapon range and release semantics.
    if((s.beams||0)<3){
      const p=enemy?.pos||recentLockPoint(c);if(p)aim(c,p,.7);
    }
    if((s.t??c.state.t??0)>=40/60){
      const normal=c.normalIntent;
      it.fire=!!normal?.fire&&!!enemy&&c.distance<=mainRange(c)*1.1&&aimed(c,.16);
      it.sub=!!normal?.sub&&!!enemy;it.squid=!!normal?.squid;it.jump=!!normal?.jump;
    }
    return true;
  }
  if(c.special==='tentaMissiles'){
    stop(c);if(s.phase==='launching'){m.rangedLockTime=0;m.rangedLockTarget=null;return true;}
    const p=enemy?.pos||recentLockPoint(c);
    const target=enemy||m.rangedSeenTarget;
    if(!p||target?.botBossTarget){m.rangedLockTime=0;m.rangedLockTarget=null;return true;}
    aim(c,p,.7);
    LOCK_API.Projectiles=c.world?.projectiles?.constructor;
    const preview=tentaMissilesLockPreview(LOCK_API,actor);
    LOCK_API.Projectiles=null;
    const locked=aimed(c,.13)&&!!preview?.targets?.includes(target);
    if(m.rangedLockTarget!==target){m.rangedLockTarget=target;m.rangedLockTime=0;}
    m.rangedLockTime=locked?(m.rangedLockTime||0)+c.dt:0;
    it.fire=m.rangedLockTime>=.12&&!s.held?.fire;return true;
  }
  if(c.special==='booyahBomb'){
    stop(c);
    if(s.throwAt!==undefined){if(enemy)aimBooyah(c);return true;}
    if((s.charge??0)<1&&s.phase!=='ready'){
      // One sampled release between cheers, gated by the runtime's own cooldown.
      it.booyah=!s.held?.booyah&&(s.t||0)+c.dt>=Math.max(.5,s.nextCheer||0);
      if(enemy)aimBooyah(c);return true;
    }
    if(!enemy){it.sub=!!s.held?.sub;return true;}
    const reachable=aimBooyah(c),ready=reachable&&aimed(c,.13);
    // A held R followed by release is the native throw, not a ZR pulse.
    it.sub=s.held?.sub?!ready:ready;return true;
  }
  if(c.special==='inkVac'){
    if(enemy)aim(c,enemy.pos,.7);
    if(s.phase==='exhale'){
      // Preserve the held level while target/aim is lost: a release would fire.
      it.fire=!!s.fireHeld;
      if(enemy&&c.distance<=32&&Math.abs(c.height)<=12&&aimed(c,.13)&&(s.t||0)>=20/60)it.fire=!s.fireHeld;
      if(enemy)keepDistance(c,8,22);else stop(c);
    }else{
      it.fire=!!enemy&&c.distance<=30&&Math.abs(c.height)<=10;
      if(enemy)keepDistance(c,7,18);else stop(c);
    }
    return true;
  }
  if(!enemy){
    if(c.special==='crabTank'){
      m.rangedCrabRolling=false;m.rangedCrabRollHold=0;
      // Never sit idle in the tank: move on and keep painting the route.
      if(roam(c,.8))it.fire=paintAhead(c);
      return true;
    }
    if(c.special==='trizooka'){roam(c,.8);return true;}
    if(c.special==='inkjet'&&finitePoint(s.origin))flyToward(c,s.origin,.65);
    else if(c.special==='zipcaster'&&s.phase==='ready'){
      // Entering swim cancels a held native charge; releasing ZR in kid form
      // would fire at the last aim after recognition has already been lost.
      it.squid=true;
      if(finitePoint(s.origin))c.moveToward?.(s.origin,.65);
      else stop(c);
    }
    else stop(c);
    return true;
  }
  if(c.special==='trizooka'){
    aim(c,enemy.pos,.75,Number.isFinite(c.distance)?Math.min(.35,c.distance/67.5):0);keepDistance(c,12,28);
    it.fire=c.distance<=38&&Math.abs(c.height)<=12&&aimed(c,.12);return true;
  }
  if(c.special==='inkjet'){
    const dist3=Math.hypot(c.distance,c.height);
    aim(c,enemy.pos,.65,Number.isFinite(dist3)?Math.min(1.5,dist3/21):0);
    if(c.distance<16)flyToward(c,enemy.pos,-1);
    else if(c.distance>24)flyToward(c,enemy.pos,.65);
    else stop(c);
    it.fire=dist3<=29.5&&(c.aimDistance??0)<=30&&aimed(c,.14);
    return true;
  }
  if(c.special==='crabTank'){
    aim(c,enemy.pos,.65,Number.isFinite(c.distance)?Math.min(.2,c.distance/150):0);
    const yaw=Math.atan2(enemy.pos.x-actor.pos.x,enemy.pos.z-actor.pos.z);
    const rearCos=Math.cos(yaw-(actor.yaw||0));
    const rear=rearCos<0&&c.distance<12;
    const threat=c.distance<6||rear||(actor.hp<35&&actor.lastDamage<.8)||bombThreat(c);
    const holdRoll=m.rangedCrabRolling&&((m.rangedCrabRollHold||0)>0||c.distance<7.5||(rearCos<.25&&c.distance<13));
    if(threat||holdRoll){
      if(!m.rangedCrabRolling)m.rangedCrabRollHold=.35;
      else m.rangedCrabRollHold=Math.max(0,(m.rangedCrabRollHold||0)-c.dt);
      m.rangedCrabRolling=true;
      it.squid=true;
      // Roll away; when the retreat is walled off roll sideways past the threat.
      if(!c.moveToward?.(enemy.pos,-1)&&!strafe(c,enemy.pos,1)&&!c.moveToward?.(enemy.pos,1))stop(c);
      return true;
    }
    m.rangedCrabRolling=false;m.rangedCrabRollHold=0;
    const cannon=c.distance<=9&&Math.abs(c.height)<=3&&enemy.hp<=50&&(s.t||0)>=(s.nextCannon||0);
    // R interrupts the accelerating ZR stream; use it only for a close finisher.
    // Settle this short lob before R instead of firing a flat shell into the floor.
    if(cannon&&aimCrabCannon(c)){stop(c);it.sub=aimed(c,.05);return true;}
    keepDistance(c,16,26);
    it.fire=c.distance<=32&&Math.abs(c.height)<=10&&aimed(c,.14);
    return true;
  }
  if(c.special==='zipcaster'){
    stop(c);if(s.phase!=='ready')return true;
    if(c.distance<=mainRange(c)*1.05&&Math.abs(c.height)<=10){
      const speed=Number(actor.weapon?.projSpeed);
      aim(c,enemy.pos,.65,Number.isFinite(c.distance)?Math.min(.25,c.distance/(Number.isFinite(speed)&&speed>0?speed:30)):0);
      // The native main policy owns charge/release cycles (Stringer/Splatana,
      // Charger and Splatling); a permanent hold never fires release weapons.
      it.fire=!!c.normalIntent?.fire&&aimed(c,.14);return true;
    }
    if((s.inkFuel??150)<15||(s.t||0)<(s.nextHookAt||0))return true;
    const point=hookPoint(c);if(!point)return true;
    // Hook uses aimPoint-minus-feet from a chest-height origin. Offset the
    // reticle so the actual emitted ray reaches the sampled floor surface.
    aim(c,point,-1.05);
    // A loose angular gate can overshoot a shallow floor ray by many metres.
    // Confirm the current emitted ray, not just its requested eye-angle.
    it.sub=aimed(c,.1)&&hookAimedAtSurface(c,point)&&!s.held?.sub;
    return true;
  }
  return true;
}
