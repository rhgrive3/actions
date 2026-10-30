import { trizookaState } from './kit-trizooka.mjs';
import { inkVacState } from './kit-ink-vac.mjs';
import { tentaMissilesLockPreview } from './all-specials.mjs';

// INKWAVE bot heuristics, not retail CPU behaviour or new weapon parameters.
// Only admitted Actor inputs and the existing aim spring are driven here.
const RANGED = new Set(['trizooka','tentaMissiles','inkjet','booyahBomb','killerWail','inkVac','crabTank','zipcaster']);
const LIMITS = {trizooka:[8,38,12],tentaMissiles:[12,90,35],inkjet:[9,28,12],booyahBomb:[8,30,9],killerWail:[5,80,30],inkVac:[6,26,10],crabTank:[10,32,10],zipcaster:[12,30,12]};
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const stop = c => c.move?.set(0,0,0);
const aimed = (c,t=.13) => c.isAimed ? c.isAimed(t) : c.aligned === true;
const mainRange = c => Math.max(1, Number(c.brain?._range?.()) || Number(c.actor.weapon?.range) || 16);
function safeFloor(c,p) {
  const y=c.world?.level?.groundHeight?.(p.x,p.z,p.y+1);
  return Number.isFinite(y) && y> -100 && Math.abs(y-p.y)<2 && !c.brain?._nearWater?.({pos:p},1.5);
}
function aim(c,p,height=.7,lead=0) { c.aimAt?.(p,{height,lead}); }
function keepDistance(c,near,far) {
  if(c.distance<near)c.moveToward?.(c.enemy.pos,-1);
  else if(c.distance>far)c.moveToward?.(c.enemy.pos,.65);
  else stop(c);
}
function inputsOff(c) {
  for(const key of ['fire','sub','special','squid','jump','booyah'])c.intent[key]=false;
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
  const m=c.memory,origin=(m.rangedHookOrigin ||= c.actor.pos.clone()).copy(c.actor.pos);
  origin.y+=1.05;
  const direction=(m.rangedHookDirection ||= c.actor.pos.clone()).copy(c.actor.aimPoint).sub(c.actor.pos);
  if(direction.lengthSq()<4)return false;direction.normalize();
  const hit=(m.rangedHookEmissionHit ||= {hit:false,point:c.actor.pos.clone(),normal:c.actor.pos.clone()});
  hit.hit=false;
  const contact=c.world.physics.raycast(origin,direction,35,hit,true);
  return contact?.hit&&finitePoint(contact.point)&&contact.normal?.y>=.5
    &&contact.point.distanceTo(point)<=.8&&safeFloor(c,contact.point);
}

export function driveRangedSpecial(c) {
  if(!RANGED.has(c.special))return false;
  const {actor,intent:it}=c;
  if(!actor?.alive||actor.remote||!(c.dt>0)||!Number.isFinite(c.dt)){inputsOff(c);return true;}
  c.memory ||= {};
  const valid=c.enemy?.alive&&c.enemy.team!==actor.team&&finitePoint(c.enemy.pos)&&c.visible===true;
  if(!valid)c.enemy=null;
  rememberVisible(c);
  const active=c.state?.id===c.special;
  if(!active){
    it.special=false;
    if(!c.enemy||(['tentaMissiles','killerWail'].includes(c.special)&&c.enemy.botBossTarget))return true;
    const [near,far,height]=LIMITS[c.special];
    if(!(c.distance>=near&&c.distance<=far&&Math.abs(c.height)<=height)||!actor.specialReady?.())return true;
    if(['inkjet','booyahBomb','zipcaster'].includes(c.special)&&(!actor.grounded||!safeFloor(c,actor.pos)))return true;
    if(c.special==='zipcaster'&&(c.distance<=mainRange(c)*1.1||!hookPoint(c)))return true;
    aim(c,c.enemy.pos,.7);
    if(aimed(c,.2))it.special=true;
    return true;
  }
  inputsOff(c);
  const s=ownState(c)||c.state;
  if(['finish','recovery','done'].includes(s.phase)){stop(c);return true;}
  const enemy=c.enemy;
  if(c.special==='killerWail'){
    // Three lock windows share the real aim; after them the native main policy
    // resumes, including its ordinary weapon range and release semantics.
    if((s.beams||0)<3){
      const p=enemy?.pos||recentLockPoint(c);if(p)aim(c,p,.7);
    }
    if((s.t??c.state.t??0)>=40/60){
      const normal=c.normalIntent||{};
      it.fire=!!normal.fire&&!!enemy&&c.distance<=mainRange(c)*1.1&&aimed(c,.16);
      it.sub=!!normal.sub&&!!enemy;it.squid=!!normal.squid;it.jump=!!normal.jump;
    }
    return true;
  }
  if(c.special==='tentaMissiles'){
    stop(c);if(s.phase==='launching')return true;
    const p=enemy?.pos||recentLockPoint(c);if(!p||c.memory.rangedSeenTarget?.botBossTarget)return true;
    aim(c,p,.7);
    const preview=tentaMissilesLockPreview({Projectiles:c.world?.projectiles?.constructor},actor);
    const locked=aimed(c,.13)&&preview?.targets?.includes(enemy||c.memory.rangedSeenTarget);
    c.memory.rangedLockTime=locked?(c.memory.rangedLockTime||0)+c.dt:0;
    it.fire=c.memory.rangedLockTime>=.12&&!s.held?.fire;return true;
  }
  if(c.special==='booyahBomb'){
    stop(c);
    if(s.charge<1&&s.phase!=='ready'){
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
  if(!enemy){stop(c);return true;}
  if(c.special==='trizooka'){
    aim(c,enemy.pos,.75,Math.min(.35,c.distance/67.5));keepDistance(c,12,28);
    it.fire=c.distance<=38&&Math.abs(c.height)<=12&&aimed(c,.12);return true;
  }
  if(c.special==='inkjet'){
    aim(c,enemy.pos,.65,Math.min(.7,c.distance/21));keepDistance(c,16,24);
    it.fire=Math.hypot(c.distance,c.height)<=29.5&&aimed(c,.14);
    return true;
  }
  if(c.special==='crabTank'){
    aim(c,enemy.pos,.65,Math.min(.2,c.distance/150));
    const yaw=Math.atan2(enemy.pos.x-actor.pos.x,enemy.pos.z-actor.pos.z);
    const rear=Math.cos(yaw-(actor.yaw||0))<0&&c.distance<12;
    const rolling=c.distance<6||rear||(actor.hp<35&&actor.lastDamage<.8)||bombThreat(c);
    if(rolling){it.squid=true;c.moveToward?.(enemy.pos,-1);return true;}
    keepDistance(c,16,26);
    const cannon=c.distance<=9&&Math.abs(c.height)<=3&&enemy.hp<=50&&(s.t||0)>=(s.nextCannon||0);
    // R interrupts the accelerating ZR stream; use it only for a close finisher.
    it.sub=cannon&&aimed(c,.15);it.fire=!it.sub&&c.distance<=32&&Math.abs(c.height)<=10&&aimed(c,.14);
    return true;
  }
  if(c.special==='zipcaster'){
    stop(c);if(s.phase!=='ready')return true;
    if(c.distance<=mainRange(c)*1.05&&Math.abs(c.height)<=10){
      aim(c,enemy.pos,.65,Math.min(.25,c.distance/(actor.weapon?.projSpeed||30)));
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
