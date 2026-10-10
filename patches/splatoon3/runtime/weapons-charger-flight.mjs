import { hurtboxRadius, hurtboxHeight } from './player-hurtbox.mjs';
import { capsuleEntry, sweptWorldHit } from './weapons-collision.mjs';
import { chargerDamage, isChargerFullCharge } from './weapons.mjs';
// #961: linear authoritative charge reaches the legal minimum at 8/60.
// Paint and launch endpoints must share this coordinate; retaining the old
// 1/6 early-boost boundary would create a second plateau after frame 8.
export const CHARGER_FIRST_LEGAL_CHARGE = 8 / 60;
export function chargerPartialCharge(charge) {
  const c = Math.max(0, Math.min(1, Number.isFinite(charge) ? charge : 0));
  return c <= CHARGER_FIRST_LEGAL_CHARGE ? 0 : (c - CHARGER_FIRST_LEGAL_CHARGE) / (1 - CHARGER_FIRST_LEGAL_CHARGE);
}
// #514: range uses the same legal-minimum band as the paint coordinate above.
// The authoritative linear charge is 8/60 after the first legal 8F release, so that
// value — not raw zero — anchors DistanceMinCharge: a legal 8F tap resolves to
// 9.033 instead of the interior 11.5337 the raw-charge lerp produced. Sub-law
// releases clamp to the lower endpoint and full charge keeps
// DistanceFullCharge. Aliases keep one band law shared by paint and range;
// damage (#506), launch speed, ink, laser sight and the 1-7F gate (#304) are
// separate coordinates and stay unchanged.
export const CHARGER_MIN_LEGAL_CHARGE = CHARGER_FIRST_LEGAL_CHARGE;
export const chargerRangeCharge = chargerPartialCharge;
// Linear interpolation of extracted endpoints; ellipse rasterization remains INKWAVE's.
export function chargerPaintParameters(raw,charge){
  const full=isChargerFullCharge(charge),q=chargerPartialCharge(charge);
  const value=(record,name)=>full?record[name+'FullCharge']:record[name+'MinCharge']+(record[name+'MaxCharge']-record[name+'MinCharge'])*q;
  const width=value(raw.SplashPaintParam,'WidthHalf'),depth=value(raw.SplashPaintParam,'DepthHalf');
  const onTop=value(raw.SplashSpawnParam,'OnTopRate');
  return {width,depth,impact:value(raw.PaintParam,'Radius'),nearest:raw.SplashPaintParam.RadiusSpawnNearest,
    onTop,interval:2*depth*(1-onTop)*Math.max(1,raw.SplashSpawnParam.SkipNum),
    terminalRate:1.5}; // community-reported omitted default, NOT an explicit pinned field
}
// Extracted minimum/max/full launch speeds remain independent endpoints.
export const CHARGER_MIN_CHARGE = CHARGER_FIRST_LEGAL_CHARGE;
export function chargerLaunchSpeed(raw, charge) {
  const q = Math.max(0, Math.min(1, (charge - CHARGER_MIN_CHARGE) / (1 - CHARGER_MIN_CHARGE)));
  return 60 * (raw.SpawnSpeedMinCharge + (raw.SpawnSpeedMaxCharge - raw.SpawnSpeedMinCharge) * q);
}
const INSTALLED=Symbol.for('inkwave.charger-flight.v1'),EPS=1e-10,SIM_DT=1/60;
// #1134: an actor may only enter the authoritative candidate set when its
// swept-capsule entry lies strictly before the nearest world/kit-defense stop.
// Keeping this as one predicate prevents a later refactor from reintroducing
// "damage every capsule on the full segment, then stop at the shield" ordering.
export function chargerActorBeforeStop(entryFraction, stepLength, stopDistance) {
  return entryFraction !== null && Number.isFinite(entryFraction) &&
    entryFraction * stepLength < stopDistance - EPS;
}
// #1098: ordinary-muzzle-relative retargeting from the independently measured
// S3 Charger Root/Muzzle joint (not from the keep anchor being transformed).
// Source: Models Resource asset 342258, Wmn_Charger_NormalT.dae, SHA-256
// 7914851c0cd0c1cf30970774b22362ae7e01969ed084c95d94ad87605c951626.
// Joint-local +Y up/+Z barrel forward; exporter scene rotation/"inch" label
// are not game-unit calibration. See the behavior report and extraction script.
// This is an INKWAVE rig retarget; Nintendo's keep-charge frame binding remains
// unverified. A model extract alone cannot prove runtime engine equivalence.
export const CHARGER_SOURCE_MODEL_MUZZLE = Object.freeze({ X: 0, Y: .1781852, Z: 1.717447 });
export function storedChargerModelMuzzle(source, modelMuzzle, out) {
  if (!source || !modelMuzzle || !out ||
      ![source.X, source.Y, source.Z, modelMuzzle.x, modelMuzzle.y, modelMuzzle.z].every(Number.isFinite) ||
      source.Z <= 0 || modelMuzzle.z <= 0) return false;
  const reference = CHARGER_SOURCE_MODEL_MUZZLE;
  const scale = modelMuzzle.z / reference.Z;
  out.set(modelMuzzle.x + (source.X - reference.X) * scale,
    modelMuzzle.y + (source.Y - reference.Y) * scale,
    modelMuzzle.z + (source.Z - reference.Z) * scale);
  return true;
}
// Finite straight flight. Source supplies endpoints and radii, not recovered engine
// interpolation code. Uses the existing weapon:fire packet; no new network fields.
export function installChargerFlight(api,completion) {
  const {Projectiles,WEAPONS,THREE,G,Hit,PLAYER,emit}=api,P=Projectiles.prototype;
  if(Object.hasOwn(P,INSTALLED))return;
  Object.defineProperty(P,INSTALLED,{value:true});
  const raw=completion.weapons.charger.MoveParam,collision=completion.weapons.charger.CollisionParam;
  const nativeGhost=P.ghostFire,nativeUpdate=P.update,nativeClear=P.clear;
  // Single source of the finite flight distance (world units); begin() and the HUD reach query share it.
  // #514: remap raw charge through the legal-minimum band so the first legal
  // 8F release (authoritative linear charge 8/60) lands on DistanceMinCharge exactly.
  const reachFor=charge=>{
    charge=Math.max(0,Math.min(1,Number.isFinite(charge)?charge:0));
    if(isChargerFullCharge(charge))return raw.DistanceFullCharge;
    const q=chargerRangeCharge(charge);
    return raw.DistanceMinCharge+(raw.DistanceMaxCharge-raw.DistanceMinCharge)*q;
  };
  P.chargerReach=function(charge){return reachFor(charge);};
  const feetDown=new THREE.Vector3(0,-1,0),feetFrom=new THREE.Vector3(),feetAt=new THREE.Vector3(),feetHit=new Hit();
  function feetSplash(actor,w){
    const radius=w.feetPaintRadius;
    if(!(radius>0)||!actor?.alive)return;
    feetFrom.set(actor.pos.x,actor.pos.y+.2,actor.pos.z);
    const h=G.physics.raycast(feetFrom,feetDown,3.5,feetHit,true);
    if(!h.hit)return;
    const area=G.paint.splat(feetAt.copy(h.point).addScaledVector(h.normal,.1),radius,actor.team,{seed:0,kind:'trail',claimOwner:actor});
    actor.addTurf(area);
  }
  function begin(system,actor,w,charge,origin,dir,ghost=false,maxDistance=null){
    charge=Math.max(0,Math.min(1,Number.isFinite(charge)?charge:0));
    const full=isChargerFullCharge(charge);
    // The native runner resets chargeT immediately after this synchronous release
    // call. Snapshot it here and keep it with the in-flight shot; `charge` stays
    // the same linear value used for range and launch speed.
    const chargeT=!ghost&&Number.isFinite(actor.weaponRunner?.chargeT)?actor.weaponRunner.chargeT:null;
    const damage=ghost?0:full?w.damageMax:chargerDamage({weaponRunner:{chargeT}},w,charge);
    const speed=full?60*raw.SpawnSpeedFullCharge:chargerLaunchSpeed(raw,charge);
    const distance=maxDistance??reachFor(charge);
    const direction=dir.clone().normalize();
    if(!Number.isFinite(distance)||distance<=0||direction.lengthSq()<EPS)return;
    const job={owner:actor,team:actor.team,weapon:w,charge,chargeT,damage,full,speed,range:distance,travel:0,origin:origin.clone(),dir:direction,
      pos:origin.clone(),prev:origin.clone(),hit:new Hit(),base:new THREE.Vector3(),seen:new Set(),ghost,nextPaint:1.2,nearestPending:true,seed:Math.random(),paint:chargerPaintParameters(completion.weapons.charger,charge),beam:null};
    system._ghostBeam(actor,origin,direction,.0001,charge,false);
    job.beam=system.beams.at(-1);
    (system._fidelityChargerFlights||(system._fidelityChargerFlights=[])).push(job);
    if(!ghost){
      feetSplash(actor,w);
      if(actor.weaponRunner)actor.weaponRunner.s3ChargerPostShot=16/60;
      emit('weapon:fire',{actor,weapon:w.id,muzzle:origin.clone(),dir:direction.clone(),charge,len:distance});
      if(actor.isLocal)emit('recoil',{amount:.005+charge*.013});
      // #982: S3 Charger fires below 50% without shot vibration.
      // charge and chargeT now share the linear progression (formerly .5
      // at 7/15 progress). Haptics use the authoritative normalized clock.
      if(actor.isLocal && chargeT >= .5)G.input?.rumble?.(.12+charge*.45,.2+charge*.35,80+charge*90);
    }
    if(actor.isLocal||actor._nearCamera?.())G.audio?.play('shoot_charger',{pos:actor.isLocal?undefined:origin,volume:actor.isLocal ? .8 : .6,pitch:1.08-.16*charge});
  }
  const keepMuzzle = completion.weapons.charger.WeaponKeepChargeParam?.MuzzleLocalPos;
  const keepBody = new THREE.Vector3();
  function resolveKeepOrigin(actor, out) {
    const gun = actor.character?.weapon;
    if (!gun?.off?.localToWorld ||
        !storedChargerModelMuzzle(keepMuzzle, gun.def?.muzzle, out)) return false;
    gun.off.localToWorld(out); // live hand pose, shared with ordinary gun muzzle
    keepBody.copy(actor.pos); keepBody.y += actor.form === 'squid' ? .4 : 1.05;
    // Keep the native geometry/finite-value muzzle guard; unsafe points fall
    // back to the ordinary muzzle instead of spawning through nearby cover.
    return Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z) &&
      out.distanceToSquared(keepBody) <= 2.5 && G.physics.los(keepBody, out);
  }
  P.fireCharger=function(actor,w,charge){
    const origin=this._muzzle(actor,new THREE.Vector3()).clone();
    if (actor.weaponRunner?.s3KeepMuzzleFiring) {
      const kept = new THREE.Vector3();
      if (resolveKeepOrigin(actor, kept)) origin.copy(kept);
    }
    const dir=this._aimFrom(actor,origin,new THREE.Vector3()).clone();
    begin(this,actor,w,charge,origin,dir);
  };
  P.ghostFire=function(actor,event){
    const w=WEAPONS[event.weapon]||actor.weapon;
    if(w.kind!=='charger')return nativeGhost.call(this,actor,event);
    const origin=new THREE.Vector3().copy(event.muzzle||actor.pos),dir=new THREE.Vector3().copy(event.dir||actor.aimDir);
    begin(this,actor,w,event.charge??0,origin,dir,true,event.len??null);
  };
  function paintTravel(system,job,end){
    if(job.ghost)return;
    const paint=job.paint,interval=paint.interval;
    if(!(interval>EPS))return;
    let area=0;
    for(;job.nextPaint<end-.3;job.nextPaint+=interval){
      // The first checkpoint owns the sourced RadiusSpawnNearest (1.2),
      // not the ordinary charge-dependent SplashPaintParam.WidthHalf.
      // Consume this first slot even if the surface probe misses.
      const radius=job.nearestPending?paint.nearest:paint.width;
      job.nearestPending=false;
      const p=job.origin.clone().addScaledVector(job.dir,job.nextPaint);
      const h=G.physics.raycast(p,new THREE.Vector3(0,-1,0),3.5,new Hit(),true);
      if(h.hit && beginChargerWallDrop(system,job,h,completion.weapons.charger,api,true)) continue;
      if(h.hit)area+=G.paint.splat(h.point.clone().addScaledVector(h.normal,.1),radius,job.team,
        {seed:Math.random(),stretch:job.dir,stretchAmt:Math.max(0,paint.depth/paint.width-1),claimOwner:job.owner});
    }
    job.owner.addTurf(area);
  }
  function step(system,job,dt){
    job.prev.copy(job.pos);
    const length=Math.min(job.speed*dt,Math.max(0,job.range-job.travel));
    job.pos.copy(job.prev).addScaledVector(job.dir,length);
    const world=sweptWorldHit(G.physics,job.prev,job.pos,collision.InitRadiusForField,collision.EndRadiusForField,job.hit,true);
    let distance=world.hit?world.dist:length,ended=world.hit,normal=world.hit?world.normal.clone():job.dir.clone().negate(),target=null;
    const defense=system.kitDefenseCandidate?.({owner:job.owner,team:job.team,prev:job.prev,pos:job.pos,vel:job.dir,damage:job.damage,type:'beam',size:0,ghost:job.ghost,full:!!job.full});
    if(defense&&(!world.hit||defense.distance<world.dist-EPS)){distance=defense.distance;ended=true;target='defense';normal=job.dir.clone().negate();}
    const boss=G.boss?.segHit(job.prev,job.pos,collision.InitRadiusForPlayer);
    if(boss&&boss.dist<distance-EPS){distance=boss.dist;ended=true;normal=job.dir.clone().negate();target='boss';}
    const actors=[];
    for(const actor of G.actors){
      // Partial rounds meet allied bodies; full rounds retain teammate piercing.
      if(!actor.alive||actor===job.owner||(job.full&&actor.team===job.team)||job.seen.has(actor))continue;
      job.base.copy(actor.pos); // same authoritative basis as ordinary projectiles
      const t=capsuleEntry(job.prev,job.pos,job.base,hurtboxRadius(actor,PLAYER),hurtboxHeight(actor,PLAYER),
        collision.InitRadiusForPlayer,collision.EndRadiusForPlayer);
      if(chargerActorBeforeStop(t,length,distance))actors.push({actor,d:t*length});
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
    paintTravel(system,job,job.travel);
    if(job.beam){job.beam.mesh.scale.z=Math.max(.0001,job.travel);job.beam.mesh.material.uniforms.uLen.value=Math.max(.0001,job.travel);}
    ended=ended||job.travel+EPS>=job.range;
    if(ended){
      // Final trail stamp at the stopping point, never beyond an obstruction.
      if(!job.ghost && target!=='defense' && !(world.hit && !target)){
        const h=G.physics.raycast(job.pos,new THREE.Vector3(0,-1,0),3.5,new Hit(),true);
        if(h.hit)job.owner.addTurf(G.paint.splat(h.point.clone().addScaledVector(h.normal,.1),job.paint.width*job.paint.terminalRate,job.team,
          {seed:Math.random(),stretch:job.dir,stretchAmt:Math.max(0,job.paint.depth/job.paint.width-1),claimOwner:job.owner}));
      }
      if(world.hit&&!target&&!job.ghost){
        if (!beginChargerWallDrop(system,job,world,completion.weapons.charger,api)) {
          const area=G.paint.splat(world.point.clone().addScaledVector(world.normal,.12),job.paint.impact,job.team,
            {seed:Math.random(),stretch:job.dir,stretchAmt:.6,claimOwner:job.owner});job.owner.addTurf(area);
        }
        G.fx?.burst(world.point,world.normal,job.owner.color,{count:10,speed:4,size:.09,paint:false});
      }
      if(!job.ghost)emit('weapon:impact',{pos:job.pos.clone(),normal,team:job.team,kind:'charger',radius:job.paint.impact,victim:target==='boss'||target==='defense'||target?.team===job.team?null:target});
    }
    return ended;
  }
  P.update=function(dt){
    advanceChargerWallDrops(this,dt,api);
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
  P.clear=function(...args){this._s3ChargerWallDrops=[];this._fidelityChargerFlights=[];return nativeClear.apply(this,args);};
}

// #625: charge-dependent post-contact gameplay paint. Explicit endpoints come
// from pinned 11.3.0 WeaponChargerNormal. Missing movement defaults (30,15,10,
// gravity .008) come from XarrotD's original paramtable, not zero-filled JSON.
// Seeded inclusive phase selection, linear charge interpolation, 60Hz force
// integration and overlapping raster stamps are INKWAVE calibration; the
// Nintendo engine/PRNG and the omitted main Ground radius remain unverified.
const WALL_DROP_EPS=1e-9;
const defaults=Object.freeze({FallPeriodFirstFrameMax:30,FallPeriodLastFrameMin:15,FallPeriodSecondFrame:10,FreeGravityType:'value_0_008'});
const unit=(seed,salt)=>{let x=((seed*0x100000000)>>>0)^salt;x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return ((x^(x>>>16))>>>0)/0x100000000;};
export function chargerWallDropParameters(raw,charge,splash=false,seed=.5){
 const source=splash?raw.SplashWallHitParam:raw,move={...defaults,...source?.WallDropMoveParam},paint=source?.WallDropCollisionPaintParam;
 if(!paint)throw Error('Missing Charger wall paint source');
 const q=Math.max(0,Math.min(1,(charge-8/60)/(1-8/60)));
 const radius=name=>charge===1?paint[name]:paint[name+'MinCharge']+(paint[name+'MaxCharge']-paint[name+'MinCharge'])*q;
 const frames=(min,max,salt)=>min+Math.floor(unit(seed,salt)*(max-min+1));
 const gravity=/^value_(\d+)_(\d+)$/.exec(move.FreeGravityType);
 if(!gravity)throw Error('Unsupported Charger wall-drop gravity');
 const result={first:frames(move.FallPeriodFirstFrameMin,move.FallPeriodFirstFrameMax,625),second:move.FallPeriodSecondFrame,
  last:frames(move.FallPeriodLastFrameMin,move.FallPeriodLastFrameMax,626),
  firstSpeed:move.FallPeriodFirstTargetSpeed,secondSpeed:move.FallPeriodSecondTargetSpeed,
  gravity:Number(gravity[1]+'.'+gravity[2]),shock:radius('PaintRadiusShock'),fall:radius('PaintRadiusFall'),
  ground:Number.isFinite(paint.PaintRadiusGround)?paint.PaintRadiusGround:null};
 if(!Object.entries(result).every(([k,v])=>k==='ground'&&v===null||Number.isFinite(v)&&v>=0))throw Error('Invalid Charger wall-drop source');
 return result;
}
export function beginChargerWallDrop(system,job,hit,raw,api,splash=false){
 if(job.ghost||!hit?.hit||Math.abs(hit.normal.y)>=.55||hit.block?.grate)return false;
 const seed=Number.isFinite(job.seed)?job.seed:.5,plan=chargerWallDropParameters(raw,job.charge,splash,seed);
 const state={owner:job.owner,team:job.team,ghost:false,plan,seed,frame:0,carry:0,speed:0,paintIndex:0,
  pos:hit.point.clone().addScaledVector(hit.normal,.025),normal:hit.normal.clone(),face:hit.face,
  prev:new api.THREE.Vector3(),next:new api.THREE.Vector3(),point:new api.THREE.Vector3(),hit:new api.Hit(),paintCarry:0};
 (system._s3ChargerWallDrops||=[]).push(state);stamp(state,state.pos,plan.shock,api,state.face);return true;
}
function stamp(s,point,radius,api,face){
 if(s.ghost||!(radius>0))return;
 const opts={seed:unit(s.seed,++s.paintIndex),kind:'drop',claimOwner:s.owner};
 if(Number.isInteger(face)&&face>=0)opts.face=face;
 const area=api.G.paint.splat(point,radius,s.team,opts);if(Number.isFinite(area))s.owner?.addTurf?.(area);
}
export function advanceChargerWallDrops(system,dt,api){
 const list=system._s3ChargerWallDrops;if(!list?.length||!(dt>0))return;
 for(let i=list.length-1;i>=0;i--){const s=list[i],p=s.plan;let done=false;s.carry+=dt;
  while(s.carry+WALL_DROP_EPS>=1/60&&!done){s.carry=Math.max(0,s.carry-1/60);
   if(s.frame>=p.first+p.second+p.last){done=true;break;}
   s.speed=s.frame<p.first?p.firstSpeed:s.frame<p.first+p.second?p.secondSpeed:s.speed+p.gravity;
   s.prev.copy(s.pos);s.next.copy(s.pos);s.next.y-=s.speed;
   const h=api.G.physics.segment(s.prev,s.next,s.hit,true);
   if(h.hit){if(h.normal.y>.55)stamp(s,h.point.clone().addScaledVector(h.normal,.025),p.ground,api,h.face);done=true;break;}
   s.pos.copy(s.next);const distance=s.prev.distanceTo(s.pos),spacing=Math.max(.025,p.fall*.5);
   for(let cursor=spacing-s.paintCarry;cursor<=distance+WALL_DROP_EPS;cursor+=spacing){s.point.copy(s.prev).lerp(s.pos,Math.min(1,cursor/distance));stamp(s,s.point,p.fall,api,s.face);}
   s.paintCarry=(s.paintCarry+distance)%spacing;
   if(s.paintCarry< WALL_DROP_EPS || spacing-s.paintCarry<WALL_DROP_EPS)s.paintCarry=0;
   s.frame++;
  }
  if(done||s.frame>=p.first+p.second+p.last)list.splice(i,1);
 }
}
