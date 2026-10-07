import { capsuleEntry, sweptWorldHit } from './weapons-collision.mjs';
import { chargerDamage } from './weapons.mjs';
// Splatoon-3-normalized partial-charge coordinate for Charger paint endpoints.
// The authoritative charge progression reaches charge = 1/6 after the first
// legal 8 frames at 60Hz (chargeT = 8/60 through the installed charge curve)
// and 1 at the full 60th frame, so the pinned S3 11.3.0 MinCharge family
// anchors to the first legal release and the MaxCharge family to 60f;
// charge >= .999 keeps the extracted FullCharge step. Charge-rate modifiers
// (airborne/empty tank) only change how fast the progression advances, and
// releases below the boundary clamp to 0, so the legal minimum endpoint never
// shifts. Damage (#506), range (#514), projectile speed, ink consumption and
// the sub-8f release gate (#304) keep consuming the raw charge separately.
export const CHARGER_FIRST_LEGAL_CHARGE = 1 / 6;
export function chargerPartialCharge(charge) {
  const c = Math.max(0, Math.min(1, Number.isFinite(charge) ? charge : 0));
  if (c >= .999) return 1;
  return c <= CHARGER_FIRST_LEGAL_CHARGE ? 0 : (c - CHARGER_FIRST_LEGAL_CHARGE) / (1 - CHARGER_FIRST_LEGAL_CHARGE);
}
// Linear interpolation of extracted endpoints; ellipse rasterization remains INKWAVE's.
export function chargerPaintParameters(raw,charge){
  const full=charge>=.999,q=chargerPartialCharge(charge);
  const value=(record,name)=>full?record[name+'FullCharge']:record[name+'MinCharge']+(record[name+'MaxCharge']-record[name+'MinCharge'])*q;
  const width=value(raw.SplashPaintParam,'WidthHalf'),depth=value(raw.SplashPaintParam,'DepthHalf');
  const onTop=value(raw.SplashSpawnParam,'OnTopRate');
  return {width,depth,impact:value(raw.PaintParam,'Radius'),nearest:raw.SplashPaintParam.RadiusSpawnNearest,
    onTop,interval:2*depth*(1-onTop)*Math.max(1,raw.SplashSpawnParam.SkipNum),
    terminalRate:1.5}; // community-reported omitted default, NOT an explicit pinned field
}
// Normalized S3 launch-speed coordinate. WeaponRunner._charger's upstream
// S-curve reaches 1/6 after the S3 8-frame legal minimum (8/60 * 1.25) and 1
// at the 60-frame full charge, while the extracted SpawnSpeed* endpoints are
// per-frame values anchored at the minimum legal shot (pinned Ver. 11.3.0
// completion table). Mapping [1/6, 1] -> [0, 1] makes the first legal 8f shot
// launch exactly at SpawnSpeedMinCharge, keeps full charge on
// SpawnSpeedFullCharge, and clamps sub-minimum taps to the minimum endpoint.
// Damage, distance, paint and ink keep consuming the raw runner charge; their
// separate issues track those coordinates. No device measurement is claimed.
export const CHARGER_MIN_CHARGE = 1 / 6;
export function chargerLaunchSpeed(raw, charge) {
  const q = Math.max(0, Math.min(1, (charge - CHARGER_MIN_CHARGE) / (1 - CHARGER_MIN_CHARGE)));
  return 60 * (raw.SpawnSpeedMinCharge + (raw.SpawnSpeedMaxCharge - raw.SpawnSpeedMinCharge) * q);
}
const INSTALLED=Symbol.for('inkwave.charger-flight.v1'),EPS=1e-10,SIM_DT=1/60;
// Finite straight flight. Source supplies endpoints and radii, not recovered engine
// interpolation code. Uses the existing weapon:fire packet; no new network fields.
export function installChargerFlight(api,completion) {
  const {Projectiles,WEAPONS,THREE,G,Hit,PLAYER,emit}=api,P=Projectiles.prototype;
  if(Object.hasOwn(P,INSTALLED))return;
  Object.defineProperty(P,INSTALLED,{value:true});
  const raw=completion.weapons.charger.MoveParam,collision=completion.weapons.charger.CollisionParam;
  const nativeGhost=P.ghostFire,nativeUpdate=P.update,nativeClear=P.clear;
  // Single source of the finite flight distance (world units); begin() and the HUD reach query share it.
  const reachFor=charge=>{
    charge=Math.max(0,Math.min(1,Number.isFinite(charge)?charge:0));
    return charge>=.999?raw.DistanceFullCharge:raw.DistanceMinCharge+(raw.DistanceMaxCharge-raw.DistanceMinCharge)*charge;
  };
  P.chargerReach=function(charge){return reachFor(charge);};
  const feetDown=new THREE.Vector3(0,-1,0),feetFrom=new THREE.Vector3(),feetAt=new THREE.Vector3(),feetHit=new Hit();
  function feetSplash(actor,w){
    const radius=w.feetPaintRadius;
    if(!(radius>0)||!actor?.alive)return;
    feetFrom.set(actor.pos.x,actor.pos.y+.2,actor.pos.z);
    const h=G.physics.raycast(feetFrom,feetDown,3.5,feetHit,true);
    if(!h.hit)return;
    const area=G.paint.splat(feetAt.copy(h.point).addScaledVector(h.normal,.1),radius,actor.team,{seed:0,kind:'trail'});
    actor.addTurf(area);
  }
  function begin(system,actor,w,charge,origin,dir,ghost=false,maxDistance=null){
    charge=Math.max(0,Math.min(1,Number.isFinite(charge)?charge:0));
    const full=charge>=.999;
    // The native runner resets chargeT immediately after this synchronous release
    // call. Snapshot it here and keep it with the in-flight shot; `charge` stays
    // the generic nonlinear value used for range and launch speed.
    const chargeT=!ghost&&Number.isFinite(actor.weaponRunner?.chargeT)?actor.weaponRunner.chargeT:null;
    const damage=ghost?0:full?w.damageMax:chargerDamage({weaponRunner:{chargeT}},w,charge);
    const speed=full?60*raw.SpawnSpeedFullCharge:chargerLaunchSpeed(raw,charge);
    const distance=maxDistance??reachFor(charge);
    const direction=dir.clone().normalize();
    if(!Number.isFinite(distance)||distance<=0||direction.lengthSq()<EPS)return;
    const job={owner:actor,team:actor.team,weapon:w,charge,chargeT,damage,full,speed,range:distance,travel:0,origin:origin.clone(),dir:direction,
      pos:origin.clone(),prev:origin.clone(),hit:new Hit(),base:new THREE.Vector3(),seen:new Set(),ghost,nextPaint:1.2,paint:chargerPaintParameters(completion.weapons.charger,charge),beam:null};
    system._ghostBeam(actor,origin,direction,.0001,charge,false);
    job.beam=system.beams.at(-1);
    (system._fidelityChargerFlights||(system._fidelityChargerFlights=[])).push(job);
    if(!ghost){
      feetSplash(actor,w);
      if(actor.weaponRunner)actor.weaponRunner.s3ChargerPostShot=16/60;
      emit('weapon:fire',{actor,weapon:w.id,muzzle:origin.clone(),dir:direction.clone(),charge,len:distance});
      if(actor.isLocal)emit('recoil',{amount:.005+charge*.013});
      if(actor.isLocal)G.input?.rumble?.(.12+charge*.45,.2+charge*.35,80+charge*90);
    }
    if(actor.isLocal||actor._nearCamera?.())G.audio?.play('shoot_charger',{pos:actor.isLocal?undefined:origin,volume:actor.isLocal ? .8 : .6,pitch:1.08-.16*charge});
  }
  P.fireCharger=function(actor,w,charge){
    const origin=this._muzzle(actor,new THREE.Vector3()).clone(),dir=this._aimFrom(actor,origin,new THREE.Vector3()).clone();
    begin(this,actor,w,charge,origin,dir);
  };
  P.ghostFire=function(actor,event){
    const w=WEAPONS[event.weapon]||actor.weapon;
    if(w.kind!=='charger')return nativeGhost.call(this,actor,event);
    const origin=new THREE.Vector3().copy(event.muzzle||actor.pos),dir=new THREE.Vector3().copy(event.dir||actor.aimDir);
    begin(this,actor,w,event.charge??0,origin,dir,true,event.len??null);
  };
  function paintTravel(job,end){
    if(job.ghost)return;
    const paint=job.paint,interval=paint.interval;
    if(!(interval>EPS))return;
    let area=0;
    for(;job.nextPaint<end-.3;job.nextPaint+=interval){
      const p=job.origin.clone().addScaledVector(job.dir,job.nextPaint);
      const h=G.physics.raycast(p,new THREE.Vector3(0,-1,0),3.5,new Hit(),true);
      if(h.hit)area+=G.paint.splat(h.point.clone().addScaledVector(h.normal,.1),job.nextPaint===1.2?paint.nearest:paint.width,job.team,
        {seed:Math.random(),stretch:job.dir,stretchAmt:Math.max(0,paint.depth/paint.width-1)});
    }
    job.owner.addTurf(area);
  }
  function step(system,job,dt){
    job.prev.copy(job.pos);
    const length=Math.min(job.speed*dt,Math.max(0,job.range-job.travel));
    job.pos.copy(job.prev).addScaledVector(job.dir,length);
    const world=sweptWorldHit(G.physics,job.prev,job.pos,collision.InitRadiusForField,collision.EndRadiusForField,job.hit,true);
    let distance=world.hit?world.dist:length,ended=world.hit,normal=world.hit?world.normal.clone():job.dir.clone().negate(),target=null;
    const defense=system.kitDefenseCandidate?.({owner:job.owner,team:job.team,prev:job.prev,pos:job.pos,vel:job.dir,damage:job.damage,type:'beam',size:0,ghost:job.ghost});
    if(defense&&(!world.hit||defense.distance<world.dist-EPS)){distance=defense.distance;ended=true;target='defense';normal=job.dir.clone().negate();}
    const boss=G.boss?.segHit(job.prev,job.pos,collision.InitRadiusForPlayer);
    if(boss&&boss.dist<distance-EPS){distance=boss.dist;ended=true;normal=job.dir.clone().negate();target='boss';}
    const actors=[];
    for(const actor of G.actors){
      // Partial rounds meet allied bodies; full rounds retain teammate piercing.
      if(!actor.alive||actor===job.owner||(job.full&&actor.team===job.team)||job.seen.has(actor))continue;
      job.base.copy(actor.pos); // same authoritative basis as ordinary projectiles
      const t=capsuleEntry(job.prev,job.pos,job.base,PLAYER.radius,actor.form==='squid'?PLAYER.squidHeight:PLAYER.height,
        collision.InitRadiusForPlayer,collision.EndRadiusForPlayer);
      if(t!==null&&t*length<distance-EPS)actors.push({actor,d:t*length});
    }
    actors.sort((a,b)=>a.d-b.d||String(a.actor.nid??a.actor.name).localeCompare(String(b.actor.nid??b.actor.name)));
    const amount=job.damage;
    for(const a of actors){
      job.seen.add(a.actor);if(!job.ghost&&a.actor.team!==job.team)system.applyHit(job.owner,a.actor,amount,job.weapon.id);
      if(!job.full){distance=a.d;ended=true;target=a.actor;normal=job.dir.clone().negate();break;}
    }
    if(target==='boss'&&!job.ghost)G.boss.hit(job.owner,amount,boss.target,job.weapon.id,boss.point.clone());
    if(target==='defense')defense.onHit();
    job.pos.copy(job.prev).addScaledVector(job.dir,distance);job.travel+=distance;
    paintTravel(job,job.travel);
    if(job.beam){job.beam.mesh.scale.z=Math.max(.0001,job.travel);job.beam.mesh.material.uniforms.uLen.value=Math.max(.0001,job.travel);}
    ended=ended||job.travel+EPS>=job.range;
    if(ended){
      // Final trail stamp at the stopping point, never beyond an obstruction.
      if(!job.ghost && target!=='defense' && !(world.hit && !target)){
        const h=G.physics.raycast(job.pos,new THREE.Vector3(0,-1,0),3.5,new Hit(),true);
        if(h.hit)job.owner.addTurf(G.paint.splat(h.point.clone().addScaledVector(h.normal,.1),job.paint.width*job.paint.terminalRate,job.team,
          {seed:Math.random(),stretch:job.dir,stretchAmt:Math.max(0,job.paint.depth/job.paint.width-1)}));
      }
      if(world.hit&&!target&&!job.ghost){
        const area=G.paint.splat(world.point.clone().addScaledVector(world.normal,.12),job.paint.impact,job.team,
          {seed:Math.random(),stretch:job.dir,stretchAmt:.6});job.owner.addTurf(area);
        G.fx?.burst(world.point,world.normal,job.owner.color,{count:10,speed:4,size:.09,paint:false});
      }
      if(!job.ghost)emit('weapon:impact',{pos:job.pos.clone(),normal,team:job.team,kind:'charger',radius:job.paint.impact,victim:target==='boss'||target==='defense'||target?.team===job.team?null:target});
    }
    return ended;
  }
  P.update=function(dt){
    const list=this._fidelityChargerFlights;
    if(list)for(let i=list.length-1;i>=0;i--){
      const job=list[i],beam=job.beam,peer=job.ghost&&beam?._netPeer;
      let ended=false;
      if(peer){
        const clock=Math.min(peer.tr,peer.lastTs??peer.tr);
        const target=Math.max(0,Math.floor((Number.isFinite(peer.sim)&&Number.isFinite(beam._netBornTick)
          ? peer.sim-beam._netBornTick : (clock-beam._netBorn)/SIM_DT)+.0306)+1);
        job._netSteps??=0;
        const maxSteps=Math.ceil(job.range/Math.max(EPS,job.speed*SIM_DT))+2;
        while(!ended&&job._netSteps<target&&job._netSteps<maxSteps){ended=step(this,job,SIM_DT);job._netSteps++;}
      }else ended=step(this,job,dt);
      if(ended)list.splice(i,1);
    }
    return nativeUpdate.call(this,dt);
  };
  P.clear=function(...args){this._fidelityChargerFlights=[];return nativeClear.apply(this,args);};
}
