// Read-only prediction for the nineteen PvP specials. The flight owners below
// are also used by real throws. Never run _step/_new/_push, damage, paint,
// onHit callbacks, action timers or RNG while drawing a guide.
import { advanceFidelityProjectile, fidelityPlayerCollisionRadius, fidelityWorldCollisionRadius } from './weapons-fidelity.mjs';
import { sweptWorldHit, capsuleEntry } from './weapons-collision.mjs';
import { segmentCapsuleEntry } from './projectile-collision.mjs';
import { hurtboxRadius, hurtboxHeight } from './player-hurtbox.mjs';
import { kitTrizookaWorldSweep, kitTrizookaActorRadius } from './trizooka-collision.mjs';
import { TRIZOOKA, VOLLEY_CONFIG, trizookaState, trizookaSpecialWeapon, trizookaLaunchGeometry, trizookaApplyProjectile, perpendicularBasis } from './kit-trizooka.mjs';
import { inkVacState, inkVacExhaleKinematics, inkVacBlastDescriptor, inkVacAbsorbCandidate } from './kit-ink-vac.mjs';
import { stepSpecialProjectileForces } from './special-projectile-flight.mjs';
import { specialDeviceFlight, specialDeviceLaunchOrigin, stepSpecialDeviceFlight, settleSpecialDeviceContact, deviceBelowWorld } from './special-device-flight.mjs';
import { createCoolerFlight, stepCoolerFlight } from './support-cooler-flight.mjs';
import { snapshotThrowCollisionSystem } from './throw-prediction-record.mjs';
import { tripleSlamFistCenters, FIST_FLAT_IMPACT, FIST_FAR_RADIUS } from './triple-slam-fists.mjs';

const STEP=1/60,EPS=1e-10;
export const SPECIAL_PREDICTION_IDS=Object.freeze(['trizooka','bubbler','zipcaster','tentaMissiles','storm','inkjet','slam','booyahBomb','ultraStamp','inkVac','killerWail','crabTank','reefslider','tripleInkstrike','tacticooler','superChump','krakenRoyale','splattercolorScreen','waveBreaker']);
const DEVICES=new Set(['waveBreaker','tripleInkstrike','splattercolorScreen']);
const ROUNDS=new Set(['booyahBomb','ultraStamp','crabTank','inkjet']);
const finite3=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function hitRecord(api){return api.Hit?new api.Hit():{hit:false,point:new api.THREE.Vector3(),normal:new api.THREE.Vector3(),dist:0};}
function roundRecord(api,actor){const V=api.THREE.Vector3;return {owner:actor,team:actor.team,pos:new V(),prev:new V(),start:new V(),vel:new V(),age:0,life:0,straight:0,grav:0,drag:0,size:0,fieldRadius:0,ghost:false,s3Prediction:true,fidelityMove:null};}
function result(api,id,origin,velocity){return {kind:id,origin:origin.clone(),velocity:velocity.clone(),points:[origin.clone()],endpoint:origin.clone(),normal:new api.THREE.Vector3(0,1,0),outcome:'unresolved',complete:false,radius:0,time:0,targetDependent:false,simulationStep:STEP};}
function empty(api,id,actor,outcome='not-applicable'){
  const r=result(api,id,actor.pos,new api.THREE.Vector3());r.points=[];r.outcome=outcome;return r;
}
function capPoints(r,options){
  const requested=Number.isFinite(options.maxPoints)?options.maxPoints:Number.isFinite(options.points)?options.points:Infinity;
  const max=Math.floor(clamp(requested,2,2048)),p=r.points;
  if(p.length>max){r.points=Array.from({length:max},(_,i)=>p[Math.round(i*(p.length-1)/(max-1))]);}
  if(Array.isArray(options.points)){
    const out=options.points,pool=out._s3PredictionPool||(out._s3PredictionPool=[]),count=r.points.length;
    for(let i=0;i<count;i++){const v=pool[i]||(pool[i]=r.points[i].clone());v.copy(r.points[i]);out[i]=v;}
    out.length=count;r.points=out;
  }
  return r;
}
function finish(r,p,outcome,complete,normal=null,time=p.age){
  r.endpoint.copy(p.pos);r.time=time;r.outcome=outcome;r.complete=complete;
  if(normal&&finite3(normal))r.normal.copy(normal);
  if(!r.points.length||r.points.at(-1).distanceToSquared(p.pos)>EPS)r.points.push(p.pos.clone());
  return r;
}
function contactSnapshot(hit,time){return {point:hit.point.clone(),normal:hit.normal.clone(),time};}
function worldContact(api,system,p,hit,r0){
  hit.hit=false;hit.dist=Infinity;
  if(!api.G.physics?.segment)return hit;
  if(p.wid==='trizooka')kitTrizookaWorldSweep(system,p,hit,api.G.physics);
  else sweptWorldHit(api.G.physics,p.prev,p.pos,r0,fidelityWorldCollisionRadius(p),hit,true);
  if(hit.hit&&!Number.isFinite(hit.dist))hit.dist=p.prev.distanceTo(hit.point);
  return hit;
}

// Freeze body/defense geometry at the current scene. A hit on that geometry
// is conditional: do not advertise a future moving target as a fixed explosion.
function firstContact(api,system,p,hit,r0,actorR0){
  worldContact(api,system,p,hit,r0);
  const length=p.prev.distanceTo(p.pos);
  let best=hit.hit?{distance:hit.dist,point:hit.point.clone(),normal:hit.normal.clone(),kind:'terrain'}:null;
  const defense=system.kitDefenseCandidate?.(p,p.prev,p.pos);
  if(defense&&Number.isFinite(defense.distance)&&defense.distance>=0&&defense.distance<=length+EPS&&(!best||defense.distance<best.distance-EPS)){
    best={distance:defense.distance,point:finite3(defense.point)?defense.point.clone():p.prev.clone().lerp(p.pos,length?defense.distance/length:0),
      normal:finite3(defense.normal)?defense.normal.clone():p.vel.clone().normalize().negate(),kind:defense.kind||'defense',conditional:true};
  }
  const boss=api.G.boss?.segHit?.(p.prev,p.pos,p.size*.6);
  if(boss&&finite3(boss.point)){
    const d=Number.isFinite(boss.dist)?boss.dist:p.prev.distanceTo(boss.point);
    if(!best||d<best.distance-EPS)best={distance:d,point:boss.point.clone(),normal:p.vel.clone().normalize().negate(),kind:'actor',conditional:true};
  }
  const ar=fidelityPlayerCollisionRadius(p),kr=p.wid==='trizooka'?kitTrizookaActorRadius(system,p):null;
  for(const a of api.G.actors||[]){
    if(!a?.alive||a===p.owner)continue;
    const friendly=a.team===p.team;
    if(friendly&&(a.submerged||!Number.isFinite(p.fidelityFriendThrough)))continue;
    const hr=hurtboxRadius(a,api.PLAYER),hh=hurtboxHeight(a,api.PLAYER);
    const t=kr==null?capsuleEntry(p.prev,p.pos,a.pos,hr,hh,actorR0,ar):segmentCapsuleEntry(p.prev,p.pos,a.pos,hr,hh,kr);
    if(!Number.isFinite(t)||t<0||t>1||friendly&&((p.fidelityPrevAge??p.age)+(p.age-(p.fidelityPrevAge??p.age))*t)*60<p.fidelityFriendThrough-EPS)continue;
    const d=t*length;
    if(!best||d<best.distance-EPS)best={distance:d,point:p.prev.clone().lerp(p.pos,t),normal:p.vel.clone().normalize().negate(),kind:'actor',conditional:true};
  }
  return best;
}

export function traceSpecialProjectile(api,system,p,options={}){
  const r=result(api,p.wid,p.pos,p.vel),hit=hitRecord(api),collisionSystem=snapshotThrowCollisionSystem(system);
  r.radius=p.type==='blast'?(p.s3SpecialWeapon?.splashRadius||p.s3SpecialWeapon?.burstRadius||0):0;
  const horizon=Math.min(p.life,Number.isFinite(options.maxTime)?Math.max(0,options.maxTime):p.life);
  for(let n=0;n<1200&&p.age+EPS<horizon;n++){
    const before=p.age,r0=fidelityWorldCollisionRadius(p),ar0=fidelityPlayerCollisionRadius(p);
    if(p.s3AllSpecialFlight){
      stepSpecialProjectileForces(p);
      const {grav,drag,straight}=p;p.grav=0;p.drag=0;p.straight=0;
      advanceFidelityProjectile(p,STEP);p.grav=grav;p.drag=drag;p.straight=straight;
    }else advanceFidelityProjectile(p,STEP);
    const hitAt=firstContact(api,collisionSystem,p,hit,r0,ar0);
    if(hitAt){
      p.pos.copy(hitAt.point);
      r.firstImpact=contactSnapshot(hitAt,p.age);
      r.targetDependent=!!hitAt.conditional;
      const absorbed=hitAt.kind!=='terrain'&&hitAt.kind!=='actor'&&hitAt.kind!=='tacticooler';
      if(absorbed)r.radius=0;
      finish(r,p,absorbed?'absorbed':p.type==='blast'?'impact-explosion':'impact',!hitAt.conditional,hitAt.normal);
      if(p.type==='blast'&&!absorbed){
        // Production terrain/cooler bursts settle at the next fixed tick.
        // Contact time and effect startup are different clocks, even though
        // their position is the same captured point.
        const deferred=(hitAt.kind==='terrain'||hitAt.kind==='tacticooler')&&typeof system.flushBlastImpacts==='function'?STEP:0;
        r.explosions=[{point:r.endpoint.clone(),normal:r.normal.clone(),time:r.time+deferred+(p.wid==='booyahBomb'?40/60:0),complete:r.complete}];
      }
      return capPoints(r,options);
    }
    r.points.push(p.pos.clone());
    if(p.age+EPS>=p.life){
      finish(r,p,p.type==='blast'?'airburst':'expired',p.type==='blast');
      if(p.type==='blast')r.explosions=[{point:r.endpoint.clone(),normal:r.normal.clone(),time:r.time+(p.wid==='booyahBomb'?40/60:0),complete:true}];
      return capPoints(r,options);
    }
    if(p.pos.y<api.PLAYER.waterY-1.8)return capPoints(finish(r,p,'lost',false),options);
    if(p.age<=before)break;
  }
  return capPoints(finish(r,p,'horizon',false),options);
}

function predictDevice(api,actor,id,ap,options){
  const f=specialDeviceFlight(api,actor,id,ap),pos=specialDeviceLaunchOrigin(actor,new api.THREE.Vector3());
  const o={...f,pos,id,kind:id==='waveBreaker'?'wave':id==='tripleInkstrike'?'marker':'screen',age:0};
  const r=result(api,id,pos,f.vel),hit=hitRecord(api),previous=pos.clone();
  const horizon=Number.isFinite(options.maxTime)?clamp(options.maxTime,0,30):10;
  for(let n=0;n<1800&&o.age+EPS<horizon;n++){
    previous.copy(o.pos);o.age+=STEP;
    const contact=stepSpecialDeviceFlight(api,o,STEP,hit,previous);
    if(id!=='tripleInkstrike'){
      const proxy={owner:actor,team:actor.team,ghost:false,s3Prediction:true,damage:id==='splattercolorScreen'?400:0,s3SpecialWeapon:{id}};
      for(const a of api.G.actors||[]){
        const c=inkVacAbsorbCandidate(a,previous,o.pos,proxy);
        if(!c)continue;
        const length=previous.distanceTo(o.pos),to=o.pos.clone();o.pos.copy(previous).lerp(to,length?c.distance/length:0);
        r.targetDependent=true;return capPoints(finish(r,o,'absorbed',false),options);
      }
    }
    if(deviceBelowWorld(api,o))return capPoints(finish(r,o,'lost',false),options);
    if(contact){
      r.firstImpact ||= contactSnapshot(contact,o.age);
      if(settleSpecialDeviceContact(o,contact)){
        finish(r,o,'deployment',true,contact.normal);
        if(id==='tripleInkstrike'){
          r.radius=7.7;r.explosions=[{point:o.pos.clone(),normal:contact.normal.clone(),time:o.age+82/60,complete:true}];
        }
        return capPoints(r,options);
      }
    }
    r.points.push(o.pos.clone());
  }
  return capPoints(finish(r,o,'horizon',false),options);
}
function predictCooler(api,actor,options){
  const d=createCoolerFlight(api,actor),r=result(api,'tacticooler',d.pos,d.vel);
  const horizon=Number.isFinite(options.maxTime)?clamp(options.maxTime,0,6):6;
  while(d.age+EPS<horizon&&d.outcome==='flight'){
    stepCoolerFlight(api,d,STEP);r.points.push(d.pos.clone());
    if(d.hit.hit)r.firstImpact ||= contactSnapshot(d.hit,d.age);
  }
  return capPoints(finish(r,d,d.outcome==='landed'?'deployment':d.outcome==='flight'?'horizon':d.outcome,d.outcome==='landed',d.normal),options);
}
function trizookaRounds(api,system,actor,ap){
  const desc=trizookaSpecialWeapon(ap),origin=new api.THREE.Vector3(),aim=new api.THREE.Vector3();
  trizookaLaunchGeometry(system,actor,origin,aim);
  const spread=VOLLEY_CONFIG.spreadDeg*Math.PI/180,lateral=spread?perpendicularBasis(aim):null;
  return Array.from({length:VOLLEY_CONFIG.lobes},(_,i)=>{
    const p=roundRecord(api,actor);p.pos.copy(origin);p.prev.copy(origin);p.start.copy(origin);p.vel.copy(aim);
    if(lateral)p.vel.addScaledVector(lateral.u,Math.sin((i===VOLLEY_CONFIG.damageLobeIndex?0:i===1?-1:1)*spread));
    p.vel.normalize().multiplyScalar(TRIZOOKA.spawnSpeed);
    Object.assign(p,{wid:'trizooka',type:desc.type,life:TRIZOOKA.duration,straight:TRIZOOKA.goStraightFrames,
      size:.22,s3SizeBase:.22,s3Yaw:actor.aimYaw,damage:desc.directDamage,radius:desc.impactRadius,grav:desc.grav,drag:desc.drag});
    trizookaApplyProjectile(p,{descriptor:desc,volleyIndex:i});return p;
  });
}
function predictSlam(api,actor){
  const r=empty(api,'slam',actor,'action-dependent'),record=actor._s3TripleSlamFists;
  const origin=record?.origin||actor.pos,centers=record?.centers||tripleSlamFistCenters(origin,actor.yaw||0,1),scale=record?.scale||1;
  const body=actor.pos.clone(),floor=api.G.level?.groundHeight?.(body.x,body.z,body.y+.001);
  r.radius=FIST_FAR_RADIUS*scale;r.targetDependent=true;
  // The player's landing still belongs to Actor._resolve. The fists have an
  // independent fixed destination and may continue after the player's death.
  r.explosions=[];
  if(Number.isFinite(floor)){body.y=floor;r.explosions.push({point:body,normal:r.normal.clone(),time:null,complete:false,kind:'body'});}
  for(const c of centers){
    const h=api.G.level?.groundHeight?.(c.x,c.z,c.y+8),at=new api.THREE.Vector3(c.x,Number.isFinite(h)?h+.12:c.y+.12,c.z);
    const from=new api.THREE.Vector3(origin.x,origin.y+.6,origin.z);
    if(api.G.physics?.los&&!api.G.physics.los(from,at))continue;
    r.explosions.push({point:at,normal:r.normal.clone(),time:Math.max(0,FIST_FLAT_IMPACT-(record?.age||0)),complete:Number.isFinite(h),kind:'fist'});
  }
  r.positions=r.explosions.map(e=>e.point);if(r.explosions.length)r.endpoint.copy(r.explosions[0].point);
  return r;
}

export function specialTrajectoryAimReady(actor,id,state){
  const active=actor.specialActive;if(!active||active.id!==id||actor.alive===false||actor.remote)return false;
  if(state?.throwAt!==undefined)return false;
  if(id==='storm'||id==='tacticooler')return active.phase==='hold';
  if(id==='booyahBomb')return state?.phase==='ready';
  if(id==='ultraStamp')return state?.phase==='aimThrow'||!!actor.intent?.sub;
  if(id==='inkVac')return inkVacState(actor)?.phase==='exhale';
  if(id==='crabTank')return !!state&&state.phase!=='finish'&&state.t+EPS<state.duration-25/60&&!actor.intent?.squid&&!!actor.intent?.sub;
  if(id==='inkjet')return !actor.intent?.squid&&actor.form!=='squid';
  if(id==='trizooka'){const s=trizookaState(actor);return !!s?.active&&s.shots<TRIZOOKA.maxFireActions&&s.t<s.duration&&actor.form!=='squid';}
  if(id==='tripleInkstrike')return !!state&&state.shots<3&&!state.markerQueued&&state.t+14/60<=state.duration+EPS;
  if(id==='waveBreaker'||id==='splattercolorScreen')return !!state&&actor.form!=='squid';
  if(id==='tentaMissiles')return state?.phase!=='launching';
  if(id==='superChump')return !!actor.grounded;
  if(id==='zipcaster')return state?.phase==='ready';
  return id==='slam'||id==='reefslider';
}

export function installSpecialTrajectory(api,hooks){
  api.Projectiles.prototype.s3CanPredictSpecialTrajectory=function(actor){
    if(!actor?.pos||!actor.aimDir)return false;
    return specialTrajectoryAimReady(actor,actor.specialActive?.id,hooks.stateOf(actor));
  };
  api.Projectiles.prototype.s3PredictSpecialTrajectory=function(actor,options={}){
    if(!actor?.pos||!actor.aimDir||actor.alive===false)return null;
    const knownState=hooks.stateOf(actor),id=options.activeOnly?actor.specialActive?.id:options.id||actor.specialActive?.id||knownState?.id||actor.weapon?.special;
    if(!id)return null;
    const state=knownState?.id===id?knownState:null;
    if(options.activeOnly&&!specialTrajectoryAimReady(actor,id,state))return null;
    if(!SPECIAL_PREDICTION_IDS.includes(id))return empty(api,id,actor,'unsupported');
    const ap=Number.isFinite(options.ap)?clamp(options.ap,0,57):state?.specialPowerAP??(id==='trizooka'?trizookaState(actor)?.ap:undefined)??actor.s3?.abilityPoints?.specialPower??0;
    if(id==='storm')return this.s3PredictSubTrajectory?.(actor,{...options,id:'storm',kind:'storm'})||empty(api,id,actor,'unavailable');
    if(DEVICES.has(id))return predictDevice(api,actor,id,ap,options);
    if(id==='tacticooler')return predictCooler(api,actor,options);
    if(ROUNDS.has(id))return traceSpecialProjectile(api,this,hooks.projectile(actor,id,options.mode||'cannon',ap,options),options);
    if(id==='inkVac'){
      const flight=inkVacExhaleKinematics(actor,options.charge??inkVacState(actor)?.charge??0),p=roundRecord(api,actor),desc=inkVacBlastDescriptor(flight.charge);
      p.pos.copy(flight.origin);p.prev.copy(p.pos);p.start.copy(p.pos);p.vel.copy(flight.velocity);
      Object.assign(p,{wid:id,type:'blast',life:flight.life,straight:flight.straight,grav:flight.grav,drag:flight.drag,size:flight.size,
        s3SpecialWeapon:desc,s3Weapon:desc,radius:desc.impactRadius,damage:desc.splashDamageMax});
      return traceSpecialProjectile(api,this,p,options);
    }
    if(id==='trizooka'){
      const traces=trizookaRounds(api,this,actor,ap).map((p,i)=>{const r=traceSpecialProjectile(api,this,p,i?{...options,points:undefined}:options);r.delay=i*VOLLEY_CONFIG.lobeInterval;return r;});
      const r=traces[0];r.trajectories=traces.map(t=>({points:t.points,endpoint:t.endpoint,complete:t.complete,delay:t.delay}));
      r.explosions=traces.flatMap(t=>(t.explosions||[]).map(e=>({...e,time:e.time+t.delay})));
      r.complete=traces.every(t=>t.complete);r.targetDependent=traces.some(t=>t.targetDependent);return r;
    }
    if(id==='superChump'){
      const plan=hooks.chumps(actor,state||{seed:options.seed??0,specialPowerAP:ap}),r=empty(api,id,actor,'landing-pattern');
      r.presentationOwner='special-vfx';r.endpoint.copy(plan.target);r.radius=hooks.description(id,ap).radius;
      const supported=!!actor.grounded&&(!!state||Number.isFinite(options.seed))&&Number.isFinite(api.G.level?.groundHeight?.(plan.target.x,plan.target.z,plan.target.y+.25));
      r.complete=supported;r.targetDependent=!supported;r.time=108/60+210/60;r.positions=plan.positions;
      r.explosions=plan.positions.map(point=>({point,normal:r.normal.clone(),time:r.time,complete:supported}));return r;
    }
    if(id==='tentaMissiles'){
      const targets=hooks.missiles(actor),r=empty(api,id,actor,'target-dependent');r.targetDependent=true;r.radius=4.25;
      r.positions=targets.map(a=>a.pos.clone());r.explosions=r.positions.map(point=>({point,normal:r.normal.clone(),time:null,complete:false}));return r;
    }
    if(id==='slam')return predictSlam(api,actor);
    if(id==='reefslider'){
      const r=empty(api,id,actor,'action-dependent');r.radius=hooks.description(id,ap).radius;r.targetDependent=true;
      // Early-stop input, terrain resolution, and the 38F moving preburst can
      // change the final centre. Never place a guaranteed ring at a ray hit.
      r.phase=state?.phase||'startup';return r;
    }
    if(id==='zipcaster'){
      const plan=hooks.zipHook(actor),r=result(api,id,plan.origin,plan.direction.clone().multiplyScalar(3.36*60));
      r.radius=6;r.endpoint.copy(plan.point);r.points.push(plan.point.clone());r.normal.copy(plan.normal);
      r.time=plan.origin.distanceTo(plan.point)/(3.36*60);r.complete=plan.valid;r.outcome=plan.valid?'hook-contact':'hook-miss';
      if(plan.valid)r.firstImpact={point:plan.point.clone(),normal:plan.normal.clone(),time:r.time};return r;
    }
    return empty(api,id,actor); // Big Bubbler, Killer Wail, Kraken: no thrown blast.
  };
}
