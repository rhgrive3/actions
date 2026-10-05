import { capsuleEntry, sweptWorldHit } from './weapons-collision.mjs';
// Linear interpolation of extracted endpoints; ellipse rasterization remains INKWAVE's.
export function chargerPaintParameters(raw,charge){
 const full=charge>=.999,q=Math.max(0,Math.min(1,charge));
 const value=(record,name)=>full?record[name+'FullCharge']:record[name+'MinCharge']+(record[name+'MaxCharge']-record[name+'MinCharge'])*q;
 const width=value(raw.SplashPaintParam,'WidthHalf'),depth=value(raw.SplashPaintParam,'DepthHalf');
 return {width,depth,impact:value(raw.PaintParam,'Radius'),nearest:raw.SplashPaintParam.RadiusSpawnNearest,
  interval:2*depth*(1-value(raw.SplashSpawnParam,'OnTopRate'))*Math.max(1,raw.SplashSpawnParam.SkipNum),
  terminalRate:1.5}; // community-reported omitted default, NOT an explicit pinned field
}
// #625: charge-interpolated Charger wall-drop paint envelopes. Only the
// explicitly sourced Min/Max/FullCharge endpoints participate; omitted fields
// are never guessed. Top-level bolt and SplashWallHitParam droplet envelopes
// stay separate; the splash ground radius is a single pinned constant.
export function chargerWallDropPaint(completion,charge){
 const raw=completion?.weapons?.charger;if(!raw)return null;
 const full=charge>=.999,q=Math.max(0,Math.min(1,Number.isFinite(charge)?charge:0));
 const top=raw.WallDropCollisionPaintParam,splash=raw.SplashWallHitParam?.WallDropCollisionPaintParam;
 if(!top||!splash)return null;
 const value=(record,name)=>full?record[name+'FullCharge']??record[name]:record[name+'MinCharge']+(record[name+'MaxCharge']-record[name+'MinCharge'])*q;
 return {
  shock:value(top,'PaintRadiusShock'),fall:value(top,'PaintRadiusFall'),
  splashShock:value(splash,'PaintRadiusShock'),splashFall:value(splash,'PaintRadiusFall'),
  splashGround:Number(splash.PaintRadiusGround)||0,
 };
}
// #625: deterministic Charger wall-drop frame counts from the pinned
// WallDropMoveParam records. Present single endpoints pin the duration;
// present Min/Max ranges interpolate by the same charge fraction used for
// paint. No endpoint is borrowed across records or invented.
function chargerWallDropFrames(charge,topMove,splashMove){
 const full=charge>=.999,q=Math.max(0,Math.min(1,Number.isFinite(charge)?charge:0));
 const frames=(record,name)=>{
  const min=record[name+'Min'],max=record[name+'Max'];
  if(Number.isFinite(min)&&Number.isFinite(max))return Math.round(min+(max-min)*q);
  if(Number.isFinite(min))return Math.round(min);
  if(Number.isFinite(max))return Math.round(max);
  return 0;
 };
 return {
  topFirst:frames(topMove,'FallPeriodFirstFrame'),topLast:frames(topMove,'FallPeriodLastFrame'),
  splashFirst:frames(splashMove,'FallPeriodFirstFrame'),splashLast:frames(splashMove,'FallPeriodLastFrame'),
 };
}
// #625: qualifying Charger wall contact only. Floors/ceilings (|normal.y|),
// grates, non-solid and explicitly non-paintable faces stay terminal.
// sweptWorldHit already skips grates, so this re-checks the resolved face.
function chargerWallDropEligible(world,G){
 if(!world?.hit||Math.abs(world.normal?.y??1)>=.55)return false;
 const level=G?.physics?.level,block=level?.blocks?.[world.block];
 if(!block||block.grate||block.solid===false)return false;
 const face=world.face>=0?level?.faces?.[world.face]:null;
 return !face||face.paintable!==false;
}
const INSTALLED=Symbol.for('inkwave.charger-flight.v1'),EPS=1e-10,SIM_DT=1/60;
// Finite straight flight. Source supplies endpoints and radii, not recovered engine
// interpolation code. Uses the existing weapon:fire packet; no new network fields.
export function installChargerFlight(api,completion) {
  const {Projectiles,WEAPONS,THREE,G,Hit,PLAYER,emit}=api,P=Projectiles.prototype;
  if(Object.hasOwn(P,INSTALLED))return;
  Object.defineProperty(P,INSTALLED,{value:true});
  const raw=completion.weapons.charger.MoveParam,collision=completion.weapons.charger.CollisionParam;
  const topMove=completion.weapons.charger.WallDropMoveParam,splashMove=completion.weapons.charger.SplashWallHitParam?.WallDropMoveParam;
  const nativeGhost=P.ghostFire,nativeUpdate=P.update,nativeClear=P.clear;
  function wallDropPaint(job,point,radius){
   if(job.ghost||!(radius>0))return 0;
   const area=G.paint.splat(point,radius,job.team,{seed:Math.random()});
   if(Number.isFinite(area))job.owner.addTurf(area);
   return area||0;
  }
  function beginWallDrop(system,job,world){
   // #625: dedicated post-impact wall-drop state. Qualifying vertical-wall
   // contacts enter a retained falling lifecycle; floors, grates,
   // non-paintable faces, player/boss contacts and ghosts stay terminal.
   // Speeds stay in source-frame units while the runtime keeps its
   // world-unit convention (same approach as PR #609's generic wall-drop).
   if(job.ghost||job.wallDrop||!chargerWallDropEligible(world,G))return false;
   const envelope=chargerWallDropPaint(completion,job.charge);
   if(!envelope||!topMove||!splashMove)return false;
   const frames=chargerWallDropFrames(job.charge,topMove,splashMove);
   const firstSpeed=Number(topMove.FallPeriodFirstTargetSpeed??0),secondSpeed=Number(topMove.FallPeriodSecondTargetSpeed??0);
   if(![firstSpeed,secondSpeed].every(v=>Number.isFinite(v)&&v>=0))return false;
   job.wallDrop={frame:0,firstFrames:frames.topFirst,lastFrames:frames.topLast,
    totalFrames:frames.topFirst+frames.topLast,firstSpeed,secondSpeed,envelope,
    splashFrame:0,splashFirst:frames.splashFirst,splashLast:frames.splashLast,
    splashTotal:frames.splashFirst+frames.splashLast,
    from:new THREE.Vector3(),next:new THREE.Vector3()};
   job.pos.copy(world.point).addScaledVector(world.normal,.025);
   job.prev.copy(job.pos);
   // Existing terminal shock splat becomes the wall-drop entry stamp, now
   // charge-interpolated from the sourced top-level shock envelope.
   wallDropPaint(job,job.pos,envelope.shock);
   G.fx?.burst(world.point,world.normal,job.owner.color,{count:10,speed:4,size:.09,paint:false});
   emit('weapon:impact',{pos:job.pos.clone(),normal:world.normal.clone(),team:job.team,kind:'charger',radius:envelope.shock,victim:null});
   return true;
  }
  function advanceWallDrop(job,dt){
   // #625: source-frame phased fall. The first period uses the sourced first
   // target speed, the last period the sourced second target speed; the top
   // record carries no other phase, so no middle speed is invented. Splash
   // fall paint runs on the same motion from the separate splash envelope.
   const state=job.wallDrop;if(!state)return true;
   if(!(dt>0))return false;
   let frames=dt*60;
   const fall=state.envelope.fall,splashFall=state.envelope.splashFall;
   const spacing=Math.max(.08,(Number.isFinite(fall)&&fall>0?fall:0)*.5||.08);
   const carry=(job._wallDropCarry||(job._wallDropCarry={fall:0,splash:0}));
   while(frames>EPS&&state.frame<state.totalFrames-EPS){
    const phaseEnd=state.frame<state.firstFrames?state.firstFrames:state.totalFrames;
    const stepFrames=Math.min(frames,phaseEnd-state.frame);
    const speed=state.frame<state.firstFrames?state.firstSpeed:state.secondSpeed;
    state.from.copy(job.pos);state.next.copy(job.pos);state.next.y-=speed*stepFrames;
    const distance=state.from.distanceTo(state.next);
    if(distance>EPS&&!job.ghost){
     for(const [radius,slot] of [[fall,'fall'],[splashFall,'splash']]){
      if(!(radius>0))continue;
      let cursor=spacing-(carry[slot]??0);
      while(cursor<=distance+EPS){
       wallDropPaint(job,state.from.clone().lerp(state.next,Math.min(1,cursor/distance)),radius);
       cursor+=spacing;
      }
      carry[slot]=((carry[slot]??0)+distance)%spacing;
     }
    }
    job.pos.copy(state.next);job.prev.copy(state.from);
    state.frame+=stepFrames;state.splashFrame=Math.min(state.splashTotal,state.splashFrame+stepFrames);frames-=stepFrames;
   }
   const done=state.frame+EPS>=state.totalFrames;
   if(done){
    // Splash ground stamp only where the splash path applies; movement and
    // damage timing are unchanged and wall-drop itself adds no HP damage.
    if(!job.ghost&&state.envelope.splashGround>0){
     const h=G.physics.raycast(job.pos,new THREE.Vector3(0,-1,0),3.5,new Hit(),true);
     if(h.hit)wallDropPaint(job,h.point.clone().addScaledVector(h.normal,.1),state.envelope.splashGround);
    }
    job.wallDrop=null;job._wallDropCarry=null;
   }
   return done;
  }
  function begin(system,actor,w,charge,origin,dir,ghost=false,maxDistance=null){
    charge=Math.max(0,Math.min(1,Number.isFinite(charge)?charge:0));
    const full=charge>=.999;
    const speed=60*(full?raw.SpawnSpeedFullCharge:raw.SpawnSpeedMinCharge+(raw.SpawnSpeedMaxCharge-raw.SpawnSpeedMinCharge)*charge);
    const distance=maxDistance??(full?raw.DistanceFullCharge:raw.DistanceMinCharge+(raw.DistanceMaxCharge-raw.DistanceMinCharge)*charge);
    const direction=dir.clone().normalize();
    if(!Number.isFinite(distance)||distance<=0||direction.lengthSq()<EPS)return;
    const job={owner:actor,team:actor.team,weapon:{...w},charge,full,speed,range:distance,travel:0,origin:origin.clone(),dir:direction,
      pos:origin.clone(),prev:origin.clone(),hit:new Hit(),base:new THREE.Vector3(),seen:new Set(),ghost,nextPaint:1.2,paint:chargerPaintParameters(completion.weapons.charger,charge),beam:null};
    system._ghostBeam(actor,origin,direction,.0001,charge,false);
    job.beam=system.beams.at(-1);
    (system._fidelityChargerFlights||(system._fidelityChargerFlights=[])).push(job);
    if(!ghost){
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
    // #625: retained wall-drop jobs keep falling/painting after the bolt's
    // terminal contact; the flight path below only runs pre-impact.
    if(job.wallDrop){
     const wallDone=advanceWallDrop(job,dt);
     if(job.beam){job.beam.mesh.scale.z=Math.max(.0001,job.travel);job.beam.mesh.material.uniforms.uLen.value=Math.max(.0001,job.travel);}
     return wallDone;
    }
    job.prev.copy(job.pos);
    const length=Math.min(job.speed*dt,Math.max(0,job.range-job.travel));
    job.pos.copy(job.prev).addScaledVector(job.dir,length);
    const world=sweptWorldHit(G.physics,job.prev,job.pos,collision.InitRadiusForField,collision.EndRadiusForField,job.hit,true);
    let distance=world.hit?world.dist:length,ended=world.hit,normal=world.hit?world.normal.clone():job.dir.clone().negate(),target=null;
    const boss=G.boss?.segHit(job.prev,job.pos,collision.InitRadiusForPlayer);
    if(boss&&boss.dist<distance-EPS){distance=boss.dist;ended=true;normal=job.dir.clone().negate();target='boss';}
    const actors=[];
    for(const actor of G.actors){
      if(!actor.alive||actor.team===job.team||job.seen.has(actor))continue;
      job.base.copy(actor.pos);job.base.y+=actor.smoothY||0;
      const t=capsuleEntry(job.prev,job.pos,job.base,PLAYER.radius,actor.form==='squid'?PLAYER.squidHeight:PLAYER.height,
        collision.InitRadiusForPlayer,collision.EndRadiusForPlayer);
      if(t!==null&&t*length<distance-EPS)actors.push({actor,d:t*length});
    }
    actors.sort((a,b)=>a.d-b.d||String(a.actor.nid??a.actor.name).localeCompare(String(b.actor.nid??b.actor.name)));
    const amount=job.full?job.weapon.damageMax:job.weapon.damageMin+(job.weapon.damagePartialMax-job.weapon.damageMin)*job.charge;
    for(const a of actors){
      job.seen.add(a.actor);if(!job.ghost)system.applyHit(job.owner,a.actor,amount,job.weapon.id);
      if(!job.full){distance=a.d;ended=true;target=a.actor;normal=job.dir.clone().negate();break;}
    }
    if(target==='boss'&&!job.ghost)G.boss.hit(job.owner,amount,boss.target,job.weapon.id,boss.point.clone());
    job.pos.copy(job.prev).addScaledVector(job.dir,distance);job.travel+=distance;
    paintTravel(job,job.travel);
    if(job.beam){job.beam.mesh.scale.z=Math.max(.0001,job.travel);job.beam.mesh.material.uniforms.uLen.value=Math.max(.0001,job.travel);}
    ended=ended||job.travel+EPS>=job.range;
    if(ended){
      // Final trail stamp at the stopping point, never beyond an obstruction.
      if(!job.ghost && !(world.hit && !target)){
        const h=G.physics.raycast(job.pos,new THREE.Vector3(0,-1,0),3.5,new Hit(),true);
        if(h.hit)job.owner.addTurf(G.paint.splat(h.point.clone().addScaledVector(h.normal,.1),job.paint.width*job.paint.terminalRate,job.team,
          {seed:Math.random(),stretch:job.dir,stretchAmt:Math.max(0,job.paint.depth/job.paint.width-1)}));
      }
      if(world.hit&&!target&&!job.ghost){
        // #625: qualifying vertical-wall contacts enter the sourced wall-drop
        // lifecycle; the shock stamp keeps its FX shape but now uses the
        // charge-interpolated top-level shock envelope. Floors, grates,
        // player/boss contacts and non-paintable faces stay terminal.
        if(beginWallDrop(system,job,world))return false;
        const area=G.paint.splat(world.point.clone().addScaledVector(world.normal,.12),job.paint.impact,job.team,
          {seed:Math.random(),stretch:job.dir,stretchAmt:.6});job.owner.addTurf(area);
        G.fx?.burst(world.point,world.normal,job.owner.color,{count:10,speed:4,size:.09,paint:false});
      }
      if(!job.ghost)emit('weapon:impact',{pos:job.pos.clone(),normal,team:job.team,kind:'charger',radius:job.paint.impact,victim:target==='boss'?null:target});
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
