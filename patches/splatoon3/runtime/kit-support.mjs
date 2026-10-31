// Opt-in INKWAVE support-kit mechanics for the S3 Point Sensor / Tacticooler
// uncovered by Issue #710/#835. Existing verified main-weapon kits do not change.
// Network: the originating player's actor is the only sender; received packets
// are typed, finite, life-bound and duplicate-checked before any state change.
// Cross-version S3 lobby-line <-> INKWAVE world geometry remains uncalibrated.
import { POINT_SENSOR, POINT_SENSOR_SOURCE, pointSensorMarkFrames, pointSensorThrowSpeed, pointSensorContact, pointSensorMark, clearPointSensorMarks } from './support-recon.mjs';
import { gearCurve } from './gear.mjs';
import { buildSubModel, poseSubModel, isSharedGeometry } from './sub-models.mjs';
import { createTacticooler, disposeSpecialModel } from './special-motion.mjs';
import { TACTICOOLER, TACTICOOLER_SOURCE, tacticoolerStandFrames, tacticoolerDrinkFrames, drinkEligible, giveDrink, retireDrink } from './support-cooler.mjs';
import { installTacticoolerGauge, startTacticoolerGauge, endTacticoolerGauge, clearSpecialGaugeLocks, startHeldSpecialGauge, startPendingSpecialGauge } from './tacticooler-gauge.mjs';
import { installCoolerCollision } from './support-cooler-collision.mjs';
import { cancelStormPendingInput } from './storm-effects.mjs';
import { registerReplicaRetirement } from './replica-retirement.mjs';
import { observeSupportTick, consumeSupportEvent, consumeCoolerUse, clearSupportAdmission } from './support-replay-admission.mjs';
import { SUB_SPECIAL_FIDELITY } from './sub-special-fidelity.mjs';
import { createCoolerFlight, stepCoolerFlight } from './support-cooler-flight.mjs';
import { pointSensorLaunch, stepPointSensorFlight, predictPointSensor } from './support-sensor-flight.mjs';

const INSTALL = Symbol.for('inkwave.s3.support-kit.v1');
const TINY = 1e-9;
const aliveInMatch = G => !!G.match?.range || G.match?.state === 'playing' || G.match?.playing?.() === true;
const life = a => Math.max(
  Number.isSafeInteger(a?.netLife) && a.netLife >= 0 ? a.netLife : 0,
  Number.isSafeInteger(a?.net?.lastLife) && a.net.lastLife >= 0 ? a.net.lastLife : 0);
const vec3 = v => v && [v.x,v.y,v.z].every(Number.isFinite);
const finiteTriplet = (r, i) => [r[i],r[i+1],r[i+2]].every(Number.isFinite);
const seqOK = n => Number.isSafeInteger(n) && n > 0 && n < 1e9;
const serial = actor => {
  actor.s3SupportSerial = ((actor.s3SupportSerial || 0) + 1) % 1e9;
  if (!actor.s3SupportSerial) actor.s3SupportSerial = 1;
  return actor.s3SupportSerial;
};
function emitNet(G, actor, e) {
  const nm = G.netm;
  if (!actor.remote && nm?.match === G.match && Number.isInteger(actor.nid) &&
      nm.byNid?.get(actor.nid) === actor) nm._rec(['ks', ...e]);
}
function releaseVisual(record, G) {
  const m = record?.mesh;
  if (!m) return;
  G.scene?.remove?.(m);
  if(m.userData?.specialKind){disposeSpecialModel(m);record.mesh=null;return;}
  m.traverse?.(o => {
    if (!o.isMesh) return;
    if (!isSharedGeometry(o.geometry)) o.geometry?.dispose?.();
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    materials.forEach(a => a?.dispose?.());
  });
  record.mesh = null;
}
// S3 Point Sensor model (sub-models.mjs); presentation only.
function sensorVisual(owner, pos, THREE, G) {
  if (!G.scene?.add) return null;
  const color = owner.color || G.teamColors?.[owner.team] || 0xffcc33;
  const ink = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .12, roughness: .4, metalness: .1 });
  const model = buildSubModel(THREE, 'pointSensor', ink);
  const group = new THREE.Group();
  if (model) group.add(model.root);
  else group.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 9, 7), ink));
  group.userData.s3SubModel = model;
  group.rotation.y = owner.aimYaw || owner.yaw || 0;
  group.position.copy(pos);
  G.scene.add(group);
  return group;
}
function poseSensorVisual(sensor, dt) {
  const m = sensor.mesh;
  if (!m) return;
  if(!Object.is(m.position.x,sensor.pos.x)||!Object.is(m.position.y,sensor.pos.y)||!Object.is(m.position.z,sensor.pos.z))m.position.copy(sensor.pos);
  // Tumbles in flight; settles upright where it lands.
  const model = m.userData?.s3SubModel;
  if (sensor.activeAt === null) { m.rotation.x += dt * 8; m.rotation.z += dt * 3; }
  else {
    if(!Object.is(m.rotation.x,0)||!Object.is(m.rotation.z,0))m.rotation.set(0, m.rotation.y, 0);
    if (model) model.root.position.y = 0.07;   // box bottom on the surface (pos is 0.03 off it)
  }
  const pose=sensor._poseArgs ||= {dt:0};pose.dt=dt;poseSubModel(model,pose);
}
function coolerVisual(owner, pos, THREE, G) {
  if (!G.scene?.add) return null;
  const group=createTacticooler(owner.color || G.teamColors?.[owner.team] || 0xffcc33, THREE);
  group.position.copy(pos); G.scene.add(group); return group;
}
export function registerSupportKit({ WEAPONS, SUB, SPECIALS, SUB_ICONS, SPECIAL_ICONS, WEAPON_ORDER }) {
  if (!WEAPONS.shooter || !SUB.bomb) throw new Error('support kit requires the installed Shooter and sub registry');
  if (WEAPONS.support || SUB.pointSensor || SPECIALS.tacticooler) throw new Error('support kit registered twice');
  SUB.pointSensor = {
    ...SUB.bomb, id:'pointSensor', name:'Point Sensor', inkCost:POINT_SENSOR.inkCost,
    inkCostFallback:POINT_SENSOR.inkCost, throwSpeed:POINT_SENSOR.launchSpeedWorld,
    inkRecoverStop:POINT_SENSOR_SOURCE.inkRecoverStopFrames/60, damageMax:0, damageMin:0, paintRadius:0,
    radius:POINT_SENSOR.radiusWorld, inkSaverCurve:[1,.85,.7],
    status:'S3 11.3.0 timing/cost; source radius agrees with Wiki line conversion; collision/throw calibration pending',
  };
  SPECIALS.tacticooler = { id:'tacticooler', name:'Tacticooler', duration:TACTICOOLER.standSeconds,
    cost:TACTICOOLER.specialCost, status:'S3 11.3.0 timing/AP; world positioning calibrated' };
  WEAPONS.support = { ...WEAPONS.shooter,
    id:'support', name:'Recon Training Kit', kind:'shooter',
    // Never inherit a pinned Shooter-specific 11.3.0 source field: this is an
    // explicitly prototype kit with no corresponding source row.
    shotGuideFrame: null,
    // Do not call this a source-verified H-3: it uses existing Shooter main
    // ballistics with only the sourced Point Sensor / Tacticooler support pair.
    sub:'pointSensor', special:'tacticooler', specialCost:TACTICOOLER.specialCost,
    kitReference:null, kitStatus:'opt-in-inkwave-support-approx-main',
    blurb:'Optional training kit: Shooter main with Point Sensor and Tacticooler. Main-weapon model is NOT an H-3 Nozzlenose recreation.',
  };
  if (SUB_ICONS) SUB_ICONS.pointSensor = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="6"/><circle cx="32" cy="32" r="8" fill="currentColor"/></svg>';
  if (SPECIAL_ICONS) SPECIAL_ICONS.tacticooler = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="20" width="44" height="34" rx="7" fill="currentColor"/><path d="M18 11H46V20H18Z" fill="currentColor"/></svg>';
  // Device users explicitly opt in with ?supportKit=1; this does not change
  // the published seven verified/legacy weapon choices by default.
  if (WEAPON_ORDER && /(?:^|[?&])supportKit=1(?:&|$)/.test(globalThis.location?.search || '') &&
      !WEAPON_ORDER.includes('support')) WEAPON_ORDER.push('support');
}
function spawnPointSensor(owner, projectile, G, THREE, Hit, remote = false, record = null) {
  // Native throw and its read-only predicted trajectory share the exact
  // source launch tuple. Authenticated receiver rows supply their own tuple.
  const launch=record?null:pointSensorLaunch(owner,THREE);
  const pos=record?new THREE.Vector3(record[0],record[1],record[2]):launch.origin;
  const vel=record?new THREE.Vector3(record[3],record[4],record[5]):launch.velocity;
  if (!vec3(pos) || !vec3(vel)) return null;
  const sensor = { owner, team:owner.team, pos, vel, prev:pos.clone(), age:0,
    activeAt:null, expires:Infinity, seq:remote ? record[6] : serial(owner),
    sourceLife:life(owner), seen:new Map(), ghost:remote, hit:new Hit(),
    mesh:sensorVisual(owner,pos,THREE,G), pulses:0 };
  (projectile._s3SupportSensors ||= []).push(sensor);
  if (!remote) emitNet(G,owner,['p',owner.nid,sensor.seq,pos.x,pos.y,pos.z,vel.x,vel.y,vel.z,sensor.sourceLife]);
  return sensor;
}
// A stand follows a physical Tower platform, not the caster who threw it.
// Use the existing RankedWorld footprint so off-tower throws keep 900F.
function supportTowerBinding(G, pos) {
  const world=G.match?.mode==='tower'&&G.match.rankedWorld;
  if (!world || world._inTowerVolume?.({pos},false)!==true) return {onTower:false,local:null};
  const block=world.towerBlock,axes=block?.axes;
  if (!vec3(block?.center)||!Array.isArray(axes)||axes.length!==3||!axes.every(vec3))
    return {onTower:true,local:null};
  const relative=pos.clone().sub(block.center);
  return {onTower:true,local:axes.map(axis=>relative.dot(axis))};
}
function advanceTowerStand(stand,G) {
  const offset=stand.towerLocal,block=G.match?.rankedWorld?.towerBlock;
  if (!offset||!vec3(block?.center)||!Array.isArray(block?.axes)||block.axes.length!==3)return;
  stand.pos.copy(block.center);
  for(let i=0;i<3;i++)stand.pos.addScaledVector(block.axes[i],offset[i]);
  stand.mesh?.position?.copy?.(stand.pos);
}
function deployCooler(owner, projectile, G, THREE, remote = false, position = null, incomingSeq = null, incomingFrames = null) {
  const pos = position ? new THREE.Vector3(...position) :
    owner.pos.clone().add(new THREE.Vector3(Math.sin(owner.yaw || 0)*1.6,0,Math.cos(owner.yaw || 0)*1.6));
  if (!vec3(pos)) return null;
  // A new stand replaces the caster's old one. The explicit FridgeParam
  // VanishDistance also retires any stand it overlaps, including enemy stands.
  // This shared deploy path applies the same geometry to validated wire replay.
  const stands = projectile._s3SupportCoolers ||= [];
  for(let i=stands.length-1;i>=0;i--) if(stands[i].owner===owner ||
      stands[i].pos.distanceToSquared(pos)<=TACTICOOLER_SOURCE.vanishDistance**2+TINY) {
    endTacticoolerGauge(stands[i]);
    releaseVisual(stands[i],G);stands.splice(i,1);
  }
  const drinkFrames = remote && Number.isSafeInteger(incomingFrames)
    && incomingFrames >= TACTICOOLER_SOURCE.powerUpFrames[0]
    && incomingFrames <= TACTICOOLER_SOURCE.powerUpFrames[2]
    ? incomingFrames : tacticoolerDrinkFrames(owner.s3?.abilityPoints?.specialPower, gearCurve);
  const tower=supportTowerBinding(G,pos);
  const stand={ owner, team:owner.team, pos, onTower:tower.onTower,towerLocal:tower.local,
    expires:G.time+tacticoolerStandFrames(tower.onTower)/60,
    drinkSeconds:drinkFrames/60, sourceLife:life(owner), seq:incomingSeq??serial(owner),
    taken:new Set(), mesh:coolerVisual(owner,pos,THREE,G) };
  stands.push(stand);
  if (!remote) startTacticoolerGauge(stand,G);
  if (!remote) emitNet(G,owner,['c',owner.nid,stand.seq,pos.x,pos.y,pos.z,stand.sourceLife,drinkFrames]);
  return stand;
}
function throwCooler(owner,projectile,G,THREE,Hit,record=null) {
  // A remote verified throw replays the admitted birth velocity and identity.
  // Local throw uses precisely the shared launch primitive from the preview.
  const device=record?{
    owner,pos:new THREE.Vector3(...record.pos),vel:new THREE.Vector3(...record.vel),
    age:0,flightCarry:0,hit:new Hit(),normal:new THREE.Vector3(0,1,0),outcome:'flight'
  }:createCoolerFlight({G,THREE,Hit},owner);
  if(record)device.prev=device.pos.clone();
  device.ghost=!!record;device.seq=record?.seq||serial(owner);device.sourceLife=life(owner);
  device.mesh=coolerVisual(owner,device.pos,THREE,G);
  if(device.mesh)device.mesh.scale.setScalar(.35);
  (projectile._s3SupportCoolerThrows ||= []).push(device);
  if(!record){
    startPendingSpecialGauge(owner,G,'tacticooler',device,projectile._s3SupportCoolerThrows);
    const {pos,vel}=device;
    emitNet(G,owner,['t',owner.nid,device.seq,pos.x,pos.y,pos.z,vel.x,vel.y,vel.z,device.sourceLife]);
  }
  return device;
}
// Both the native field and its aim preview use this exact fixed-step flight.
// Preview state is private and never joins the live sensor registry.
function advancePointSensorFlight(sensor,G,THREE,dt,Physics,PLAYER,time) {
  const contact=stepPointSensorFlight(sensor,{G,THREE,Physics,PLAYER},dt);
  if(!contact)return false;
  sensor.activeAt=time;sensor.expires=time+POINT_SENSOR.areaSeconds;
  if(sensor.previewNormal){
    if(contact.normal&&vec3(contact.normal))sensor.previewNormal.copy(contact.normal);
    else sensor.previewNormal.set(0,1,0);
  }
  return true;
}
const SUPPORT_EMPTY_ROSTER = Object.freeze([]);
function stepSupport(projectile, G, THREE, dt, Physics, PLAYER) {
  if (!(dt>0) || !Number.isFinite(G.time)) return;
  const playing = aliveInMatch(G);
  for(const sensor of projectile._s3SupportSensors || SUPPORT_EMPTY_ROSTER) {
    if(sensor.activeAt===null) {
      advancePointSensorFlight(sensor,G,THREE,dt,Physics,PLAYER,G.time);
    }
    poseSensorVisual(sensor, dt);
    if(sensor.activeAt!==null && playing && G.time+TINY<sensor.expires) {
      for(const actor of G.actors || SUPPORT_EMPTY_ROSTER) {
        if(sensor.ghost&&actor.remote)continue;
        if(sensor.seen.get(actor)===life(actor) || actor.team===sensor.team ||
           !pointSensorContact(actor,sensor.pos)) continue;
        sensor.seen.set(actor,life(actor));
        const frames=pointSensorMarkFrames(sensor.owner.s3?.abilityPoints?.subPower,gearCurve);
        if(pointSensorMark(actor,sensor.team,G.time,Math.max(0,frames/60-(G.time-sensor.activeAt)))) {
          if(!sensor.ghost)emitNet(G,sensor.owner,['m',sensor.owner.nid,sensor.seq,actor.nid,life(actor),frames,sensor.sourceLife,'l']);
        }
      }
      sensor.pulses+=dt;
      if(sensor.pulses>=.5) {
        sensor.pulses%=.5;
        G.fx?.ring?.(sensor.pos,new THREE.Vector3(0,1,0),G.teamColors?.[sensor.team],{radius:POINT_SENSOR.radiusWorld,life:.35});
      }
    }
  }
  const sensors=projectile._s3SupportSensors || SUPPORT_EMPTY_ROSTER;
  for(let i=sensors.length-1;i>=0;i--)if(G.time>=sensors[i].expires ||
    sensors[i].age>POINT_SENSOR.maxFlightSeconds+POINT_SENSOR.areaSeconds+.25) {
    releaseVisual(sensors[i],G);sensors.splice(i,1);
  }
  const throws=projectile._s3SupportCoolerThrows||SUPPORT_EMPTY_ROSTER;
  for(let i=throws.length-1;i>=0;i--){
    const d=throws[i],outcome=stepCoolerFlight({G,THREE,PLAYER},d,dt);
    if(outcome==='landed'){
      releaseVisual(d,G);throws.splice(i,1);
      // Retain the verified remote birth identity. A ghost must not
      // incorrectly gain owner-local gauge authority at landing.
      deployCooler(d.owner,projectile,G,THREE,d.ghost,d.pos.toArray(),d.seq);
    }else if(outcome==='expired'||outcome==='lost'||!playing){
      releaseVisual(d,G);throws.splice(i,1);
    }else d.mesh?.position.copy(d.pos);
  }
  const coolers=projectile._s3SupportCoolers || SUPPORT_EMPTY_ROSTER;
  for(let i=coolers.length-1;i>=0;i--) {
    const stand=coolers[i];
    advanceTowerStand(stand,G);
    if(G.time+TINY>=stand.expires||!playing) {endTacticoolerGauge(stand);releaseVisual(stand,G);coolers.splice(i,1);continue;}
    // Each actor's owner decides whether it obtained a drink; remote replicas
    // never mutate another peer's authoritative gear, HP or weapon state.
    for(const a of G.actors || SUPPORT_EMPTY_ROSTER)if(drinkEligible(a,stand,G.time,PLAYER)) {
      stand.taken.add(a); giveDrink(a,G.time,stand.drinkSeconds);
      G.fx?.burst?.(a.pos,new THREE.Vector3(0,1,0),G.teamColors?.[a.team],{count:6,speed:2,size:.08});
    }
    const drinks=stand.mesh?.userData?.drinks;
    if(drinks)for(let j=0;j<drinks.length;j++){const visible=j>=Math.min(4,stand.taken.size);if(drinks[j].visible!==visible)drinks[j].visible=visible;}
  }
  for(const a of G.actors || SUPPORT_EMPTY_ROSTER) if(!a.remote) retireDrink(a,G.time);
}
export function installSupportGameplay({ Actor, WeaponRunner, Projectiles, NetMatch, G, THREE, Hit, Physics, PLAYER }) {
  if (Actor.prototype[INSTALL]) return;
  Object.defineProperty(Actor.prototype,INSTALL,{value:true});
  const cancelInput=(actor,sub)=>{
    if(!sub||!actor||actor.remote)return;
    const held=actor.specialActive;
    if(held?.id==='tacticooler'&&held.phase==='hold')held.subHeld=false;
    cancelStormPendingInput(actor);
  };
  const runner=WeaponRunner?.prototype;
  if(runner){
    const pending=runner.cancelPendingInput,hold=runner.cancelHold;
    runner.cancelPendingInput=function(...args){cancelInput(this.a,true);return pending?.apply(this,args);};
    runner.cancelHold=function(fire,sub){cancelInput(this.a,sub);return hold?.call(this,fire,sub);};
  }
  installTacticoolerGauge({Actor,G});
  installCoolerCollision({Actor,Projectiles,G,THREE,Hit,Physics,PLAYER});
  // Chain the latest source predictor without removing the existing catalogue
  // or native Sub forecast owner. It has no live paint, status or packet effect.
  const priorSubPrediction=Projectiles.prototype.s3PredictSubTrajectory;
  Projectiles.prototype.s3PredictSubTrajectory=function(actor,options={}){
    const id=options.id||options.kind||actor?.weapon?.sub;
    return id==='pointSensor' ? predictPointSensor({G,THREE,Hit,Physics,PLAYER},actor,options)
      : priorSubPrediction?.call(this,actor,options)||null;
  };
  const throwBomb=Projectiles.prototype.throwBomb;
  Projectiles.prototype.throwBomb=function(actor,...rest) {
    if(actor?.weapon?.sub==='pointSensor' && !actor.remote && aliveInMatch(G))
      return spawnPointSensor(actor,this,G,THREE,Hit);
    return throwBomb.call(this,actor,...rest);
  };
  const nativeArc=Projectiles.prototype.updateArc;
  Projectiles.prototype.updateArc=function(actor,show){
    if(!show||!actor?.alive||actor.weapon?.sub!=='pointSensor')return nativeArc.call(this,actor,show);
    const pool=this._s3SensorArcScratch ||= {depth:0,frames:[]},depth=pool.depth++;
    let scratch=pool.frames[depth];
    if(!scratch){scratch={pos:new THREE.Vector3(),prev:new THREE.Vector3(),vel:new THREE.Vector3(),hit:new Hit(),previewNormal:new THREE.Vector3(),up:new THREE.Vector3(0,1,0),gray:new THREE.Color(.6,.6,.6)};if(depth<8)pool.frames[depth]=scratch;}
    try{
      scratch.owner=actor;scratch.team=actor.team;scratch.age=0;scratch.activeAt=null;scratch.expires=Infinity;
      const forecast=pointSensorLaunch(actor,THREE,true);
      scratch.pos.copy(forecast.origin);scratch.prev.copy(scratch.pos);
      scratch.vel.copy(forecast.velocity);scratch.s3SensorRemainder=0;
      const position=this.arcGeo.attributes.position,per=2,dt=1/60;let count=1,landed=false;
      position.setXYZ(0,scratch.pos.x,scratch.pos.y,scratch.pos.z);
      for(let i=0;i<(this.arcN-1)*per;i++){
        landed=advancePointSensorFlight(scratch,G,THREE,dt,Physics,PLAYER,G.time+(i+1)*dt);
        if(landed){position.setXYZ(count++,scratch.pos.x,scratch.pos.y,scratch.pos.z);this.arcRing.position.copy(scratch.pos);this.arcRing.quaternion.setFromUnitVectors(scratch.up,scratch.previewNormal);break;}
        if((i+1)%per===0)position.setXYZ(count++,scratch.pos.x,scratch.pos.y,scratch.pos.z);
        if(count>=this.arcN)break;
      }
      position.clearUpdateRanges();position.addUpdateRange(0,count*position.itemSize);position.needsUpdate=true;this.arcGeo.setDrawRange(0,count);
      const distance=this.arcGeo.attributes.lineDistance,points=position.array;distance.setX(0,0);let total=0;
      for(let i=1;i<count;i++){const k=i*3,dx=points[k]-points[k-3],dy=points[k+1]-points[k-2],dz=points[k+2]-points[k-1];total+=Math.sqrt(dx*dx+dy*dy+dz*dz);distance.setX(i,total);}
      distance.clearUpdateRanges();distance.addUpdateRange(0,count);distance.needsUpdate=true;
      const color=actor.ink>=POINT_SENSOR.inkCost?actor.color:scratch.gray;
      this.arcLine.material.color.copy(color).multiplyScalar(1.4);this.arcRing.material.color.copy(color).multiplyScalar(1.4);
      this.arcLine.visible=true;this.arcRing.visible=landed;this.arcRing.scale.setScalar(1+Math.sin(G.time*8)*.06);
      // Dynamic actors participate in this preview; never lend these vertices
      // to the native bomb cache, even if its launch tuple happens to match.
      this._arcCache=null;
    }finally{scratch.owner=null;pool.depth--;}
  };
  const update=Projectiles.prototype.update,clear=Projectiles.prototype.clear;
  Projectiles.prototype.update=function(dt,...args) {
    const result=update.call(this,dt,...args);
    stepSupport(this,G,THREE,dt,Physics,PLAYER);
    return result;
  };
  Projectiles.prototype.clear=function(...args) {
    for(const owner of new Set([...(G.actors||[]),...(this.clouds||[]).map(c=>c.owner),...(this.bombs||[]).map(b=>b.owner),...(this._s3SupportCoolerThrows||[]).map(d=>d.owner)]))clearSpecialGaugeLocks(owner,false);
    for(const stand of this._s3SupportCoolers||[])endTacticoolerGauge(stand);
    for(const record of [...this._s3SupportSensors||[],...this._s3SupportCoolers||[],...this._s3SupportCoolerThrows||[]])releaseVisual(record,G);
    this._s3SupportSensors=[];this._s3SupportCoolers=[];this._s3SupportCoolerThrows=[];delete this._s3SensorArcScratch;
    return clear.call(this,...args);
  };
  const start=Actor.prototype._startSpecial, advance=Actor.prototype._updateSpecial;
  Actor.prototype._startSpecial=function(...args) {
    if(this.weapon?.special!=='tacticooler')return start.apply(this,args);
    if(this.remote || this.alive===false || this.specialActive || this.superJumpState ||
       !this.specialReady?.() || !aliveInMatch(G))return;
    const before=this.stats?.specials;
    const result=start.apply(this,args);
    if(this.special!==0 || this.stats?.specials!==before+1)return result;
    this.specialActive={id:'tacticooler',t:0,phase:'hold',armor:false,subHeld:!!this.intent.sub};
    startHeldSpecialGauge(this,G,'tacticooler');
    return result;
  };
  Actor.prototype._updateSpecial=function(dt,...args) {
    if(this.specialActive?.id!=='tacticooler')return advance.call(this,dt,...args);
    if(!(dt>0))return;
    const state=this.specialActive;state.t+=dt;
    if(state.phase==='hold'){
      const released=state.subHeld&&!this.intent.sub;state.subHeld=!!this.intent.sub;
      this.form=this.intent.squid?'squid':'kid';this._horizontal?.(dt,this.form==='squid',false);this._integrate?.(dt,this.form==='squid',false);
      if(released){state.phase='throw';state.t=0;this.character?.trigger?.('throw');}
    }else if(state.t+1e-9>=13/60){throwCooler(this,G.projectiles,G,THREE,Hit);this.specialActive=null;}
    return undefined;
  };
  const reset=Actor.prototype.reset,splat=Actor.prototype.splat;
  Actor.prototype.reset=function(...args) {
    // Gear.reset recalculates effective AP inside the original call. Retire the
    // old drink *before* that calculation so a newly spawned life never keeps
    // expired/consumed buff multipliers with a false drink flag.
    if(this.s3){this.s3.drink=false;this.s3.drinkUntil=0;}
    const result=reset.apply(this,args);
    clearPointSensorMarks(this);
    return result;
  };
  Actor.prototype.splat=function(...args) {
    const result=splat.apply(this,args);
    if(!this.alive)retireDrink(this,G.time,true);
    return result;
  };
  // Existing NetMatch tick replay delivers the same ordered event array to
  // this wrapper. Sender-owned actor, configured kit, life, serial, target and
  // finite coordinates must all match before we accept a claim.
  const nativeTick=NetMatch.prototype._tick,nativeDispose=NetMatch.prototype.dispose;
  NetMatch.prototype._tick=function(from,packet){return observeSupportTick(this,from,packet,()=>nativeTick.call(this,from,packet));};
  NetMatch.prototype.dispose=function(...args){clearSupportAdmission(this);return nativeDispose.apply(this,args);};
  const play=NetMatch.prototype._play;
  const last=new WeakMap();
  registerReplicaRetirement(G,actor=>last.delete(actor));
  // Native adoption keeps the Actor object while changing its sender. A new
  // owner must not inherit the departed sender's local support serial ceiling.
  const leave=NetMatch.prototype.onLeave;
  NetMatch.prototype.onLeave=function(id,...args){
    for(const actor of this.byNid?.values?.()||[])if(actor.owner===id)last.delete(actor);
    return leave?.call(this,id,...args);
  };
  NetMatch.prototype._play=function(from,e) {
    if(e?.[1]!=='ks')return play.call(this,from,e);
    const kind=e[2],owner=this.byNid?.get(e[3]);
    // Production network-replication appends authoritative tick and transport
    // sequence to every _rec event (r=2). A legacy fixture has no trailer.
    // Reject malformed/truncated/spoofed envelope lengths before using fields.
    const baseLength=kind==='p'||kind==='t'?12:
      kind==='m'?(e[9]==='l'?10:[8,10].includes(e.length)?8:7):
      kind==='c'?([10,12].includes(e.length)?10:9):0;
    if(!baseLength || e.length!==baseLength && e.length!==baseLength+2)return;
    if(e.length===baseLength+2) {
      const tick=e[baseLength], transportSeq=e[baseLength+1];
      if(!Number.isSafeInteger(tick) || tick<0 || !seqOK(transportSeq) ||
         e._netSeq!==undefined && e._netSeq!==transportSeq ||
         e._netTick!==undefined && e._netTick!==tick)return;
    }
    if(!owner?.remote || owner.owner!==from || !seqOK(e[4]) ||
       this.match!==G.match || !aliveInMatch(G))return;
    const receipt=consumeSupportEvent(this,from,e,owner);if(!receipt)return;
    const record=last.get(owner)||{p:0,c:0,t:0};
    const position=receipt.snapshot;
    const launchAllowed=(height,cooler=false)=>{
      const lag=Math.max(0,receipt.packetTime-receipt.time),speed=Math.hypot(position.vx,position.vy,position.vz);
      const allowance=.06+speed*lag+1.5; // native stair smoothing is included in the snapshot y
      if(Math.hypot(e[5]-position.x,e[6]-position.y-height,e[7]-position.z)>allowance)return false;
      const origin=new THREE.Vector3(e[5],e[6],e[7]),body=new THREE.Vector3(position.x,position.y+height,position.z);
      if(G.physics?.los&&G.physics.los(body,origin)!==true)return false;
      if(cooler){const dx=e[8],dy=e[9]-TACTICOOLER_SOURCE.spawnSpeedY*60,dz=e[10];return Math.abs(Math.hypot(dx,dy,dz)-TACTICOOLER_SOURCE.spawnSpeedZ*60)<.03;}
      // The owner's view may turn between its throw and 20 Hz snapshot. Only
      // native speed and inherited player motion are legal; no arbitrary jump.
      const nativeSpeed=pointSensorThrowSpeed(owner.s3?.abilityPoints?.subPower,gearCurve);
      const magnitude=Math.hypot(e[8],e[9],e[10]);
      const native=SUB_SPECIAL_FIDELITY.bomb;
      const inherited=speed*Math.max(native.inheritXRate??native.inheritX,native.inheritZRate??native.inheritZ??native.inheritX,native.inheritYPlus)+Math.abs(native.inheritYMax);
      const low=Math.max(0,nativeSpeed*Math.cos(1.15)-Math.abs(native.spawnSpeedY)-inherited-.03);
      const high=Math.hypot(nativeSpeed,native.spawnSpeedY)+inherited+.03;
      return magnitude>=low&&magnitude<=high;
    };
    if(kind==='p') {
      if(owner.weapon?.sub!=='pointSensor' || !finiteTriplet(e,5) ||
         !finiteTriplet(e,8) || e[11]!==life(owner) || e[4]<=record.p ||
         !launchAllowed(1.35))return;
      record.p=e[4];last.set(owner,record);
      const sensor=spawnPointSensor(owner,G.projectiles,G,THREE,Hit,true,[...e.slice(5,11),e[4]]);
      if(sensor)sensor.admission=record;
    } else if(kind==='m') {
      const frames = baseLength>=8 ? e[7] : POINT_SENSOR_SOURCE.markingFrames[0];
      if(owner.weapon?.sub!=='pointSensor' || !Number.isSafeInteger(e[5]) ||
         !Number.isSafeInteger(frames) || frames < POINT_SENSOR_SOURCE.markingFrames[0] ||
         frames > POINT_SENSOR_SOURCE.markingFrames[2])return;
      const target=this.byNid?.get(e[5]);
      // Serials restart after native ownership transfer. Earlier fields may
      // still be visible, but cannot shadow a new sender's same-numbered field.
      const sensor=G.projectiles?._s3SupportSensors?.find(s=>s.owner===owner&&s.seq===e[4]&&s.admission===record);
      if(!sensor || sensor.activeAt===null || G.time+TINY>=sensor.expires || baseLength===10&&e[8]!==sensor.sourceLife || sensor.seen.get(target)===life(target) || !target || target.team===owner.team ||
         e[6]!==life(target) || target.alive===false ||
         !pointSensorContact(target,sensor.pos))return;
      sensor.seen.set(target,life(target));pointSensorMark(target,owner.team,G.time,
        Math.max(0,frames/60-(sensor.activeAt===null?0:G.time-sensor.activeAt)));
    } else if(kind==='t') {
      if(owner.weapon?.special!=='tacticooler'||!finiteTriplet(e,5)||!finiteTriplet(e,8)||e[11]!==life(owner)||e[4]<=record.t||
        !launchAllowed(1.1,true)||!consumeCoolerUse(this,owner,receipt))return;
      record.t=e[4];last.set(owner,record);
      throwCooler(owner,G.projectiles,G,THREE,Hit,{pos:e.slice(5,8),vel:e.slice(8,11),seq:e[4]});
    } else if(kind==='c') {
      const frames = baseLength===10 ? e[9] : TACTICOOLER_SOURCE.powerUpFrames[0];
      if(!Number.isSafeInteger(frames) || frames < TACTICOOLER_SOURCE.powerUpFrames[0] ||
         frames > TACTICOOLER_SOURCE.powerUpFrames[2] ||
         owner.weapon?.special!=='tacticooler' || !finiteTriplet(e,5) ||
         e[8]!==life(owner) || e[4]<=record.c ||
         Math.hypot(e[5]-position.x,e[6]-position.y,e[7]-position.z)>10)return;
      // A deploy row cannot create a drink field. The accepted use + throw
      // runs the native gravity/drag and receiver collision above; its stand
      // owns position and duration, including when this row arrives earlier.
      const device=(G.projectiles._s3SupportCoolerThrows||SUPPORT_EMPTY_ROSTER).find(d=>d.owner===owner&&d.seq===e[4]&&d.sourceLife===e[8]);
      const stand=(G.projectiles._s3SupportCoolers||SUPPORT_EMPTY_ROSTER).find(d=>d.owner===owner&&d.seq===e[4]&&d.sourceLife===e[8]);
      if(!device&&!stand)return;
      record.c=e[4];last.set(owner,record);
    }
  };
}
