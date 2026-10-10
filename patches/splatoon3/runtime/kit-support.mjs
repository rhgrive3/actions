// Opt-in INKWAVE support-kit mechanics for the S3 Point Sensor / Tacticooler
// uncovered by Issue #710/#835. Existing verified main-weapon kits do not change.
// Network: the originating player's actor is the only sender; received packets
// are typed, finite, life-bound and duplicate-checked before any state change.
// Cross-version S3 lobby-line <-> INKWAVE world geometry remains uncalibrated.
import { POINT_SENSOR, pointSensorContact, pointSensorMark, clearPointSensorMarks } from './support-recon.mjs';
import { TACTICOOLER, drinkEligible, giveDrink, retireDrink } from './support-cooler.mjs';

const INSTALL = Symbol.for('inkwave.s3.support-kit.v1');
const TINY = 1e-9;
const aliveInMatch = G => G.match?.state === 'playing' || G.match?.playing?.() === true;
const life = a => Number.isSafeInteger(a?.netLife) && a.netLife >= 0 ? a.netLife : 0;
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
  m.traverse?.(o => {
    if (!o.isMesh) return;
    o.geometry?.dispose?.();
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    materials.forEach(a => a?.dispose?.());
  });
  record.mesh = null;
}
function sensorVisual(owner, pos, THREE, G) {
  if (!G.scene?.add) return null;
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.13, 9, 7),
    new THREE.MeshStandardMaterial({ color: owner.color || G.teamColors?.[owner.team] || 0xffcc33, emissive: owner.color || 0xffcc33, emissiveIntensity: .4 }));
  sphere.position.copy(pos);
  G.scene.add(sphere);
  return sphere;
}
function coolerVisual(owner, pos, THREE, G) {
  if (!G.scene?.add) return null;
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: owner.color || G.teamColors?.[owner.team] || 0xffcc33 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(.8,.9,.58), mat);
  body.position.y = .48; group.add(body);
  for(let i=0;i<4;i++) {
    const drink = new THREE.Mesh(new THREE.CylinderGeometry(.095,.095,.3,8),
      new THREE.MeshStandardMaterial({ color: 0xf7ebca, metalness:.2, roughness:.45 }));
    drink.position.set(i % 2 ? .22 : -.22, .96, i < 2 ? -.16 : .16);
    group.add(drink);
  }
  group.position.copy(pos); G.scene.add(group); return group;
}
export function registerSupportKit({ WEAPONS, SUB, SPECIALS, SUB_ICONS, SPECIAL_ICONS, WEAPON_ORDER }) {
  if (!WEAPONS.shooter || !SUB.bomb) throw new Error('support kit requires the installed Shooter and sub registry');
  if (WEAPONS.support || SUB.pointSensor || SPECIALS.tacticooler) throw new Error('support kit registered twice');
  SUB.pointSensor = {
    ...SUB.bomb, id:'pointSensor', name:'Point Sensor', inkCost:POINT_SENSOR.inkCost,
    inkCostFallback:POINT_SENSOR.inkCost, throwSpeed:POINT_SENSOR.launchSpeedWorld,
    inkRecoverStop:75/60, damageMax:0, damageMin:0, paintRadius:0,
    radius:POINT_SENSOR.radiusWorld,
    status:'S3 11.3.0 timing/cost; INKWAVE world radius/throw calibration pending',
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
  const pos = record ? new THREE.Vector3(record[0],record[1],record[2]) :
    owner.pos.clone().add(new THREE.Vector3(0,1.35,0));
  const vel = record ? new THREE.Vector3(record[3],record[4],record[5]) :
    projectile.throwVelocity(owner, POINT_SENSOR.launchSpeedWorld, new THREE.Vector3());
  if (!vec3(pos) || !vec3(vel)) return null;
  const sensor = { owner, team:owner.team, pos, vel, prev:pos.clone(), age:0,
    activeAt:null, expires:Infinity, seq:remote ? record[6] : serial(owner),
    sourceLife:life(owner), seen:new Set(), ghost:remote, hit:new Hit(),
    mesh:sensorVisual(owner,pos,THREE,G), pulses:0 };
  (projectile._s3SupportSensors ||= []).push(sensor);
  if (!remote) emitNet(G,owner,['p',owner.nid,sensor.seq,pos.x,pos.y,pos.z,vel.x,vel.y,vel.z,sensor.sourceLife]);
  return sensor;
}
function deployCooler(owner, projectile, G, THREE, remote = false, position = null, incomingSeq = null) {
  const pos = position ? new THREE.Vector3(...position) :
    owner.pos.clone().add(new THREE.Vector3(Math.sin(owner.yaw || 0)*1.6,0,Math.cos(owner.yaw || 0)*1.6));
  if (!vec3(pos)) return null;
  // One stand per player; other teammates can each maintain their own.
  const stands = projectile._s3SupportCoolers ||= [];
  for(let i=stands.length-1;i>=0;i--) if(stands[i].owner===owner) {
    releaseVisual(stands[i],G);stands.splice(i,1);
  }
  const stand={ owner, team:owner.team, pos, expires:G.time+TACTICOOLER.standSeconds,
    sourceLife:life(owner), seq:remote?incomingSeq:serial(owner), taken:new Set(), mesh:coolerVisual(owner,pos,THREE,G) };
  stands.push(stand);
  if (!remote) emitNet(G,owner,['c',owner.nid,stand.seq,pos.x,pos.y,pos.z,stand.sourceLife]);
  return stand;
}
function stepSupport(projectile, G, THREE, dt) {
  if (!(dt>0) || !Number.isFinite(G.time)) return;
  const playing = aliveInMatch(G);
  for(const sensor of projectile._s3SupportSensors || []) {
    if(sensor.activeAt===null) {
      sensor.age+=dt;
      sensor.prev.copy(sensor.pos);
      sensor.vel.y-=24*dt;
      sensor.pos.addScaledVector(sensor.vel,dt);
      const hit = G.physics?.segment?.(sensor.prev,sensor.pos,sensor.hit);
      if(hit?.hit || sensor.age>=POINT_SENSOR.maxFlightSeconds) {
        if(hit?.hit && vec3(hit.point)) sensor.pos.copy(hit.point).addScaledVector(hit.normal, .03);
        sensor.activeAt=G.time;sensor.expires=G.time+POINT_SENSOR.areaSeconds;
      }
    }
    sensor.mesh?.position?.copy(sensor.pos);
    if(sensor.activeAt!==null && playing) {
      if(!sensor.ghost && life(sensor.owner)===sensor.sourceLife) for(const actor of G.actors || []) {
        if(sensor.seen.has(actor) || actor.team===sensor.team ||
           !pointSensorContact(actor,sensor.pos)) continue;
        sensor.seen.add(actor);
        if(pointSensorMark(actor,sensor.team,G.time)) {
          emitNet(G,sensor.owner,['m',sensor.owner.nid,sensor.seq,actor.nid,life(actor)]);
        }
      }
      sensor.pulses+=dt;
      if(sensor.pulses>=.5) {
        sensor.pulses%=.5;
        G.fx?.ring?.(sensor.pos,new THREE.Vector3(0,1,0),G.teamColors?.[sensor.team],{radius:POINT_SENSOR.radiusWorld,life:.35});
      }
    }
  }
  const sensors=projectile._s3SupportSensors || [];
  for(let i=sensors.length-1;i>=0;i--)if(G.time>=sensors[i].expires ||
    sensors[i].age>POINT_SENSOR.maxFlightSeconds+POINT_SENSOR.areaSeconds+.25) {
    releaseVisual(sensors[i],G);sensors.splice(i,1);
  }
  const coolers=projectile._s3SupportCoolers || [];
  for(let i=coolers.length-1;i>=0;i--) {
    const stand=coolers[i];
    if(G.time>=stand.expires||!playing) {releaseVisual(stand,G);coolers.splice(i,1);continue;}
    // Each actor's owner decides whether it obtained a drink; remote replicas
    // never mutate another peer's authoritative gear, HP or weapon state.
    for(const a of G.actors || [])if(drinkEligible(a,stand,G.time)) {
      stand.taken.add(a); giveDrink(a,G.time);
      G.fx?.burst?.(a.pos,new THREE.Vector3(0,1,0),G.teamColors?.[a.team],{count:6,speed:2,size:.08});
    }
  }
  for(const a of G.actors || []) if(!a.remote) retireDrink(a,G.time);
}
export function installSupportGameplay({ Actor, Projectiles, NetMatch, G, THREE, Hit }) {
  if (Actor.prototype[INSTALL]) return;
  Object.defineProperty(Actor.prototype,INSTALL,{value:true});
  const throwBomb=Projectiles.prototype.throwBomb;
  Projectiles.prototype.throwBomb=function(actor,...rest) {
    if(actor?.weapon?.sub==='pointSensor' && !actor.remote && aliveInMatch(G))
      return spawnPointSensor(actor,this,G,THREE,Hit);
    return throwBomb.call(this,actor,...rest);
  };
  const update=Projectiles.prototype.update,clear=Projectiles.prototype.clear;
  Projectiles.prototype.update=function(dt,...args) {
    const result=update.call(this,dt,...args);
    stepSupport(this,G,THREE,dt);
    return result;
  };
  Projectiles.prototype.clear=function(...args) {
    for(const record of [...this._s3SupportSensors||[],...this._s3SupportCoolers||[]])releaseVisual(record,G);
    this._s3SupportSensors=[];this._s3SupportCoolers=[];
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
    deployCooler(this,G.projectiles,G,THREE);
    this.specialActive={id:'tacticooler',t:0,phase:'placed',armor:false};
    return result;
  };
  Actor.prototype._updateSpecial=function(dt,...args) {
    if(this.specialActive?.id!=='tacticooler')return advance.call(this,dt,...args);
    this.specialActive.t+=dt;
    if(this.specialActive.t>=TACTICOOLER.windupSeconds) this.specialActive=null;
    return undefined;
  };
  const reset=Actor.prototype.reset,splat=Actor.prototype.splat;
  Actor.prototype.reset=function(...args) {
    const result=reset.apply(this,args);
    clearPointSensorMarks(this);
    if(this.s3){this.s3.drink=false;this.s3.drinkUntil=0;}
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
  const play=NetMatch.prototype._play;
  const last=new WeakMap();
  NetMatch.prototype._play=function(from,e) {
    if(e?.[1]!=='ks')return play.call(this,from,e);
    const kind=e[2],owner=this.byNid?.get(e[3]);
    if(!owner?.remote || owner.owner!==from || !seqOK(e[4]) ||
       this.match!==G.match || !aliveInMatch(G))return;
    const record=last.get(owner)||{p:0,c:0};
    if(kind==='p') {
      if(owner.weapon?.sub!=='pointSensor' || e.length!==12 || !finiteTriplet(e,5) ||
         !finiteTriplet(e,8) || e[11]!==life(owner) || e[4]<=record.p ||
         Math.hypot(e[5]-owner.pos.x,e[6]-owner.pos.y,e[7]-owner.pos.z)>10)return;
      record.p=e[4];last.set(owner,record);
      spawnPointSensor(owner,G.projectiles,G,THREE,Hit,true,[...e.slice(5,11),e[4]]);
    } else if(kind==='m') {
      if(e.length!==7 || owner.weapon?.sub!=='pointSensor' || !Number.isSafeInteger(e[5]))return;
      const target=this.byNid?.get(e[5]);
      const sensor=G.projectiles?._s3SupportSensors?.find(s=>s.owner===owner&&s.seq===e[4]);
      if(!sensor || sensor.seen.has(target) || !target || target.team===owner.team ||
         e[6]!==life(target) || target.alive===false ||
         !pointSensorContact(target,sensor.pos,POINT_SENSOR.radiusWorld+3))return;
      sensor.seen.add(target);pointSensorMark(target,owner.team,G.time);
    } else if(kind==='c') {
      if(owner.weapon?.special!=='tacticooler' || e.length!==9 || !finiteTriplet(e,5) ||
         e[8]!==life(owner) || e[4]<=record.c ||
         Math.hypot(e[5]-owner.pos.x,e[6]-owner.pos.y,e[7]-owner.pos.z)>10)return;
      record.c=e[4];last.set(owner,record);
      deployCooler(owner,G.projectiles,G,THREE,true,e.slice(5,8),e[4]);
    }
  };
}
