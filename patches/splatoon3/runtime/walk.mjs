import { dualiesMotionAllowsFootPlant } from './action-admission.mjs';
import { specialMotionAllowsFootPlant } from './special-motion.mjs';
import { sampleLegacyGait, LEGACY_GAIT_CHANNELS as REF } from './legacy-walk-curves.mjs';
// Walking is an animation layer. It never writes actor speed or collision state.
// Body/foot motion is guided by compact relative FSKA channels from Splatoon 1.
// Clip frame counts are source frames, NOT proven Splatoon 3 animation runtime rates.
// All root speeds, combat actions, surface probing and planted-foot IK remain native.
let api, tuning;
const states = new WeakMap();
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const ease=x=>{const u=clamp(x,0,1);return u*u*u*(10+u*(6*u-15));};
const damp=(a,b,rate,dt)=>mix(a,b,1-Math.exp(-rate*dt));
const angle=x=>Math.atan2(Math.sin(x),Math.cos(x));
const cycle=x=>x-Math.floor(x+.5);
const state=ch=>{let s=states.get(ch);if(!s){s={active:false,pitch:0,pitchV:0,roll:0,rollV:0,vx:0,vz:0,target:new api.THREE.Vector3(),support:new api.THREE.Vector3(),supportParent:new api.THREE.Vector3(),supportQ:new api.THREE.Quaternion(),reference:new Float32Array(14)};states.set(ch,s);}return s;};
function eligible(ch){
  const T=api.CHARACTER_TIMERS, tr=ch.tr;
  return ch.kidForm&&ch.grounded&&!ch.dance&&ch.kidScale>.5&&specialMotionAllowsFootPlant(ch,tr[T.T_LEAP]>1.9&&tr[T.T_SLAM]>1.4)&&dualiesMotionAllowsFootPlant(ch,tr[T.T_DODGE]>ch.dodgeDur*.86)&&tr[T.T_SPAWN]>1.4;
}
// Both legs share the one gait clock (ch.phase; foot i is half a cycle behind
// foot 0) that also drives the pelvis sway. Each contact still advances by its
// own elapsed time, so a step is never cut short. A regular lift-off sizes its
// swing (within a bounded range) to land when the clock says. Without this
// coupling an acceleration, a duty change or a catch step left the legs
// permanently out of anti-phase and a strafe drifted into both feet stepping
// together.
function lockedSwing(ch,f,ago){
  const nominal=1-ch.duty,late=cycle(ch.phase-ago*ch.cad+f.i*.5-ch.duty);
  return clamp(nominal-late,nominal*(1-tuning.phaseLockRange),nominal*(1+tuning.phaseLockRange))/ch.cad;
}
// The pelvis turns toward a sideways travel and the spine/chest turn back to
// the aim. A walking strafe keeps the native twist and side-steps; a running
// strafe turns the pelvis further so the legs stride along their own forward
// axis. With the native 0.8 rad limit a half stride at run speed moved each
// shoe further across the pelvis than the stance width, so the legs crossed.
function strafeTwist(ch,v){
  if(!ch.moving)return 0;
  const rw=ch.runW;let tw=Math.atan2(ch.mdx,Math.abs(ch.mdz)+mix(.3,.05,rw))*mix(.78,.9,rw);
  // Backpedalling turns the pelvis the other way; blend it so a reversal never
  // flips the twist target across the whole range in one tick.
  tw*=1-1.8*smooth(-.05,-.45,ch.mdz);
  const limit=mix(.8,tuning.strafeTwistRun,smooth(0,.6,rw));
  return clamp(tw,-limit,limit)*smooth(.5,2.2,v);
}
// The native travel direction damps a unit vector and renormalises it. Toward
// the opposite direction that vector shrinks through zero and renormalising
// restores the old heading, so after a strafe flip the legs and pelvis kept the
// old side for seconds. Turn the heading by angle at the native rate instead;
// a reversal turns through forward, where the chest already faces the aim.
function travelDirection(ch,mx,mz,dt,fromRest){
  const from=Math.atan2(mx,mz),to=Math.atan2(ch.kgx,ch.kgz);let d=angle(to-from);
  if(Math.abs(d)>tuning.reversalAngle)d=to-from;
  const h=fromRest?to:from+d*(1-Math.exp(-tuning.travelTurnRate*dt));ch.mdx=Math.sin(h);ch.mdz=Math.cos(h);
}
function startSwing(ch,f,settle=false,remaining,ago=0){
  const M=api.CHARACTER_FOOT_MODES;
  f.from.copy(f.planted?f.pw:f.cw);f.fromYaw=f.planted?f.yaw:f.cyaw;
  f.startPitch=f.pitch;f.planted=false;f.sw=true;f.mode=settle?M.M_SETTLE:M.M_GAIT;f.su=0;
  // First and catch steps keep their own short timing (offbeat until touchdown).
  f.dur=remaining??lockedSwing(ch,f,ago);f.offbeat=!settle&&remaining!==undefined;
  f.lift=settle?tuning.settleLift:ch.liftH;
  const forward=clamp(ch.mdz*Math.cos(ch.hipTwist)+ch.mdx*Math.sin(ch.hipTwist),-1,1);
  f.toe=mix(tuning.toeWalk,tuning.toeRun,ch.runW)*forward;
  f.land=mix(tuning.heelWalk,tuning.heelRun,ch.runW)*forward;
  f.fold=settle?0:mix(tuning.swingPitchWalk,tuning.swingPitchRun,ch.runW)*Math.max(0,forward);
  f.peak=settle?.5:mix(tuning.walkPickupPeak,tuning.runPickupPeak,ch.runW);
  f.toYaw=settle?ch._idealFoot(f,f.to):ch._gaitTarget(f,f.dur,f.to);
  f.to.y=ch._ground(f.to.x,f.to.z,f.tn);
}
function land(ch,f,loud){
  // Normal touchdown does not reset the other leg's clock.
  f.mode=api.CHARACTER_FOOT_MODES.M_GAIT;f.offbeat=false;ch._touchDown(f,loud);
}
function updateFeet(ch,dt){
  const F=ch.feet,R=ch.root.position,M=api.CHARACTER_FOOT_MODES;
  if(ch.tread)for(const f of F){f.pw.x-=ch.tvx*dt;f.pw.z-=ch.tvz*dt;f.from.x-=ch.tvx*dt;f.from.z-=ch.tvz*dt;f.disp.x-=ch.tvx*dt;f.disp.z-=ch.tvz*dt;}
  ch.plantW=damp(ch.plantW,1,14,dt);
  if(ch.replant||!ch.feetValid){
    for(const f of F){
      if(ch.feetValid&&f.dispOK){f.pw.copy(f.disp);f.yaw=f.dispYaw;}else f.yaw=ch._idealFoot(f,f.pw);
      f.pw.y=ch._ground(f.pw.x,f.pw.z,f.n);f.planted=true;f.sw=false;f.su=0;f.stU=.5;f.stT=0;f.inSt=true;
    }
    ch.replant=false;ch.feetValid=true;ch.moving=false;ch.settleCd=.06;
  }
  const was=ch.moving;
  const motion=state(ch),speed=Math.hypot(motion.vx,motion.vz);
  ch.moving=speed>(was?tuning.stopSpeed:tuning.startSpeed);
  if(ch.moving){
    if(!was){
      const along=f=>(f.pw.x-R.x)*ch.gvx+(f.pw.z-R.z)*ch.gvz;
      const first=along(F[0])<=along(F[1])?0:1;
      if(!F[first].sw)startSwing(ch,F[first],false,Math.min(tuning.firstStepTime,(1-ch.duty)/ch.cad));
      // From rest the clock reaches this foot's touchdown when the short first
      // step lands. A restart while the pelvis still sways (a reversal passing
      // through zero speed) keeps the running clock and the step joins it.
      if(ch.gaitW<tuning.clockRestartWeight)ch.phase=1-(1-F[first].su)*F[first].dur*ch.cad-first*.5;
      // Stagger the other leg by half a cycle, including the shorter first step.
      // Each contact then owns its elapsed time; a display phase cannot cut a
      // freshly planted step short or change the rhythm at a phase wrap.
      F[1-first].stT=0;F[1-first].stU=1-Math.max(0,F[first].dur*ch.cad+ch.duty-.5)/ch.duty;
      for(const f of F)if(f.sw&&f.mode===M.M_SETTLE)startSwing(ch,f,false,Math.min(tuning.firstStepTime,(1-ch.duty)/ch.cad));
    }
    ch.phase+=ch.cad*dt;
    for(let i=0;i<2;i++){
      const f=F[i];let elapsed=dt;
      if(f.planted){
        f.stT+=dt;f.stU+=dt*ch.cad/ch.duty;
        const rootDist=Math.hypot(f.pw.x-R.x,f.pw.z-R.z),far=rootDist>tuning.catchDistance;
        // A freshly landed foot normally owns at least 60 ms of stance to avoid
        // chatter. Do not keep that hold once the gameplay root has moved farther
        // than the whole leg can possibly span (common on a sharp reversal).
        const hardOverreach=rootDist>ch.legReach;
        if(f.stU>=1){elapsed=(f.stU-1)*ch.duty/ch.cad;startSwing(ch,f,false,undefined,elapsed);}
        else if(far&&(f.stT>.06||hardOverreach)){startSwing(ch,f,false,Math.min(tuning.firstStepTime,(1-ch.duty)/ch.cad));elapsed=0;}
      }
      if(f.sw){
        f.su+=elapsed/f.dur;
        // Retarget early, then commit to the landing. A turn cannot drag a shoe
        // sideways in the final frames of a step.
        if(f.su<tuning.landingLock){
          const target=state(ch).target,yaw=ch._gaitTarget(f,(1-f.su)*f.dur,target);
          f.to.lerp(target,1-Math.exp(-tuning.targetFollow*dt));f.toYaw+=angle(yaw-f.toYaw)*(1-Math.exp(-tuning.targetFollow*dt));
        }
        if(f.su>=1){const carry=(f.su-1)*f.dur;land(ch,f,1);f.stT=carry;f.stU=clamp(carry/(ch.duty/ch.cad),0,1);}
      }
    }
  }else{
    let swinging=0;
    for(const f of F){
      if(!f.sw)continue;
      // Rebase a stopping step on its displayed contact, not its old takeoff.
      // Changing the landing target must preserve position and progress.
      if(f.mode!==M.M_SETTLE)startSwing(ch,f,true,tuning.settleTime);
      f.su=Math.min(1,f.su+dt/f.dur);
      if(f.su<tuning.landingLock){
        const target=state(ch).target,yaw=ch._idealFoot(f,target);target.y=ch._ground(target.x,target.z,f.tn);
        f.to.lerp(target,1-Math.exp(-tuning.targetFollow*dt));f.toYaw+=angle(yaw-f.toYaw)*(1-Math.exp(-tuning.targetFollow*dt));
      }
      if(f.su>=1)land(ch,f,.45);else swinging++;
    }
    ch.settleCd-=dt;
    if(!swinging&&ch.settleCd<=0){const left=ch._footErr(F[0]),right=ch._footErr(F[1]),i=left>=right?0:1;if(Math.max(left,right)>tuning.settleThreshold)startSwing(ch,F[i],true,tuning.settleTime);}
  }
  // Advance the sole reference pose AFTER the native gait clock and both feet
  // have processed their current tick. No additional phase clocks may drift.
  sampleLegacyGait(state(ch).reference,ch.phase,ch.mdx,ch.mdz,ch.wAim,ch.runW);
  ch._footPose(F[0]);ch._footPose(F[1]);
  const twist=(angle(F[0].cyaw-ch.yaw-ch.stance[2])+angle(F[1].cyaw-ch.yaw-ch.stance[5]))*.5;
  ch.footTwist=damp(ch.footTwist,clamp(twist,-1.2,1.2),20,dt);
}
function footPose(ch,f){
  if(f.planted||!f.sw){
    f.cw.copy(f.pw);f.cyaw=f.yaw;f.cn.copy(f.n);
    const desired=ch.moving?-f.land*(1-smooth(0,.28,f.stU))+f.toe*smooth(.42,1,f.stU):0;
    const next=damp(f.pitch,desired,ch.moving?30:12,ch._dt),limit=tuning.footPitchRate*ch._dt;f.pitch+=clamp(next-f.pitch,-limit,limit);
    return;
  }
  const u=clamp(f.su,0,1),e=ease(u);
  f.cw.copy(f.from).lerp(f.to,e);
  const peak=f.peak??.5,lift=u<peak?ease(u/peak):ease((1-u)/(1-peak));
  f.cw.y+=(f.lift+Math.max(0,f.to.y-f.from.y)*.35)*lift;
  // The swing leg passes the support shoe on its own side of the pelvis. The
  // end points are already apart; only mid-swing bows outward.
  const o=ch.feet[1-f.i],hy=ch.yaw+ch.hipTwist,ax=Math.cos(hy),az=-Math.sin(hy),dx=f.cw.x-o.cw.x,dz=f.cw.z-o.cw.z;
  const along=Math.abs(dx*Math.sin(hy)+dz*Math.cos(hy)),need=(tuning.minFootGap-(dx*ax+dz*az)*f.side)*(1-smooth(tuning.footLength*.5,tuning.footLength,along))*Math.sin(Math.PI*u);
  if(need>0){f.cw.x+=need*f.side*ax;f.cw.z+=need*f.side*az;}
  f.cyaw=f.fromYaw+angle(f.toYaw-f.fromYaw)*e;f.cn.copy(f.n).lerp(f.tn,e).normalize();
  f.pitch=mix(f.startPitch??f.toe,0,smooth(0,.5,u))+(f.fold??0)*smooth(0,.22,u)*(1-smooth(.38,.78,u))-f.land*smooth(.55,.96,u);
  // Retarget source thigh/shin/ankle motion ONLY to a swinging foot. Planted
  // contacts keep exact world position/orientation; all offsets vanish at both
  // ends of each step, so switching direction cannot teleport an ankle.
  if (f.mode===M.M_GAIT && ch.moving) {
    const ref=state(ch).reference,side=f.i===0,gate=smooth(.04,.25,u)*(1-smooth(.76,.98,u));
    const excursion=Math.sin(Math.PI*u);
    const thigh=ref[side?REF.thighL:REF.thighR],shin=ref[side?REF.shinL:REF.shinR];
    const along=clamp(thigh*.017,-.018,.018)*gate*excursion;
    const yaw=ch.yaw+ch.hipTwist;
    f.cw.x+=Math.sin(yaw)*along;f.cw.z+=Math.cos(yaw)*along;
    f.cw.y+=Math.max(0,clamp(shin*.014,-.012,.018))*gate*excursion;
    f.pitch+=clamp(ref[side?REF.footL:REF.footR]*.29,-.15,.15)*gate;
  }
}
export function installWalkMotion(context,profile){
  api=context;tuning=profile.walkMotion;
  if(!tuning||!api.Character||!api.CHARACTER_CHANNELS||!api.CHARACTER_TIMERS||!api.CHARACTER_FOOT_MODES)throw Error('Walking motion contract missing');
  const C=api.Character.prototype,oldTrack=C._trackRoot,oldStates=C._updateStates,oldFeet=C._updateFeet,oldPose=C._footPose,oldTarget=C._gaitTarget;
  C._trackRoot=function(dt,s){
    const w=state(this),valid=this.rootInit&&this.root.position.distanceToSquared(this.rp)<=9,mx=this.mdx,mz=this.mdz;
    w.rootMotionKnown=valid&&dt>0;
    w.vx=valid&&dt>0?(this.root.position.x-this.rp.x)/dt:0;w.vz=valid&&dt>0?(this.root.position.z-this.rp.z)/dt:0;
    oldTrack.call(this,dt,s);if(this.tread){w.vx=this.tvx;w.vz=this.tvz;}
    // From rest the new travel sets the heading at once; the native update also
    // ignored slow walking below 0.35, which kept a stale heading for a slow step.
    // A paused frame keeps the heading; native renormalisation would still move its last bits.
    if(!(dt>0)){this.mdx=mx;this.mdz=mz;}
    else if(valid&&this.kidForm&&Math.hypot(w.vx,w.vz)>tuning.startSpeed)travelDirection(this,mx,mz,dt,!this.moving&&this.gaitW<tuning.clockRestartWeight);
  };
  C._updateStates=function(dt,s){
    const weight=this.gaitW,twist=this.hipTwist;oldStates.call(this,dt,s);
    const support=1-this.wAir*.75;advanceLean(this,'pitch',clamp(this.kaz,-48,48),support,dt);advanceLean(this,'roll',clamp(this.kax,-48,48),support,dt);
    if(!eligible(this))return;
    const v=this.gv,rw=smooth(tuning.runStart,tuning.runFull,v);this.runW=rw;
    this.duty=mix(tuning.walkDuty,tuning.runDuty,rw)+.06*this.wGoo;
    // One clock per travel speed, independently of stick direction. The old
    // sideStrideCut multiplied this cadence by up to 1.82x at a weak diagonal,
    // causing rapidly chattering steps while the character hardly moved.
    // Directional shape now comes from the distinct sampled side/back clips;
    // foot reach/landing still belongs to the original grounded IK solver.
    const half=mix(tuning.walkHalfStride,tuning.runHalfStride,rw)*(1-.18*this.wGoo);
    this.cad=clamp(Math.max(v,tuning.startSpeed)*this.duty/(2*half),tuning.minCadence,tuning.maxCadence);
    this.liftH=mix(tuning.walkLift,tuning.runLift,rw)*(1+.6*this.wGoo);
    this.gaitW=damp(weight,v>(this.moving?tuning.stopSpeed:tuning.startSpeed)?1:0,v>tuning.startSpeed?12:8,dt);
    const limit=tuning.twistRate*dt;this.hipTwist=twist+clamp(damp(twist,strafeTwist(this,v),7,dt)-twist,-limit,limit);
  };
  C._updateFeet=function(dt,s){const w=state(this);w.active=eligible(this);if(!w.active)return oldFeet.call(this,dt,s);return updateFeet(this,dt);};
  C._footPose=function(f){return state(this).active?footPose(this,f):oldPose.call(this,f);};
  C._gaitTarget=function(f,remaining,out){
    if(!state(this).active)return oldTarget.call(this,f,remaining,out);
    const motion=state(this),v=Math.hypot(motion.vx,motion.vz),yaw=this.yaw+this.hipTwist+clamp(this.yawRate*remaining*.55,-.2,.2),half=clamp(v*this.duty/this.cad*.5,0,tuning.runHalfStride),w=mix(Math.abs(this.stance[f.side>0?0:3]),.078,this.runW)*f.side;
    const inv=v>.001?1/v:0;
    out.set(this.root.position.x+motion.vx*remaining+motion.vx*inv*half+w*Math.cos(yaw),this.root.position.y,this.root.position.z+motion.vz*remaining+motion.vz*inv*half-w*Math.sin(yaw));
    // Beside the other foot, stay on its own side of the pelvis: a side step
    // closes next to the leading foot instead of passing it. A foot landing a
    // shoe length ahead or behind is not pushed, so a turn cannot shove it out
    // of the leg's reach.
    const o=this.feet[1-f.i],ref=o.planted?o.pw:o.to,ax=Math.cos(yaw),az=-Math.sin(yaw),dx=out.x-ref.x,dz=out.z-ref.z,lat=(dx*ax+dz*az)*f.side;
    const push=(tuning.minFootGap-lat)*(1-smooth(tuning.footLength*.5,tuning.footLength,Math.abs(dx*Math.sin(yaw)+dz*Math.cos(yaw))));
    if(push>0){out.x+=push*f.side*ax;out.z+=push*f.side*az;}
    out.y=this._ground(out.x,out.z,f.tn);return yaw+f.side*mix(.1,.04,this.runW);
  };
}
export function applyWalkLocomotion(ch,P){
  if(!api)throw Error('Walking motion not installed');
  const C=api.CHARACTER_CHANNELS,gw=ch.gaitW,rn=ch.runW,ph=ch.phase,tau=Math.PI*2;
  if(gw<=.001)return;
  const bk=smooth(.1,-.7,ch.mdz),ref=state(ch).reference;
  // Centered source-relative Euler curves: bounded retarget, never directly
  // assign the Wii U joint rotations to the INKWAVE procedural rest skeleton.
  const proceduralYaw=-mix(tuning.walkYaw,tuning.runYaw,rn)*Math.cos(tau*ph)*(1-bk*.5);
  const referenceYaw=clamp(ref[REF.rootY]*.46+ref[REF.hipY]*.2,-.085,.085);
  const yawOsc=mix(proceduralYaw,referenceYaw,.72)*gw;
  const proceduralRoll=mix(tuning.walkRoll,tuning.runRoll,rn)*Math.cos(tau*(ph-ch.duty*.5));
  const referenceRoll=clamp(ref[REF.hipZ]*.35,-.085,.085);
  const roll=mix(proceduralRoll,referenceRoll,.68)*gw;
  const c2=Math.cos(tau*2*(ph-ch.duty*.45));
  P[C.HIPS_P+1]+=gw*mix(tuning.walkDrop,tuning.runDrop,rn)*(1+.5*ch.wGoo)+mix(tuning.walkBob,tuning.runBob,rn)*c2*gw*smooth(.1,2,ch.gs);
  P[C.HIPS_P]+=mix(.014,.01,rn)*Math.cos(tau*(ph-ch.duty*.5-.06))*gw;
  P[C.HIPS+1]+=ch.hipTwist+yawOsc;P[C.SPINE+1]-=ch.hipTwist*.45+yawOsc*.45;P[C.CHEST+1]-=ch.hipTwist*.55+yawOsc*.55;
  P[C.HIPS+2]+=roll;P[C.SPINE+2]-=roll*.6;P[C.CHEST+2]-=roll*.35;
  const sourcePitch=clamp(ref[REF.hipX]*.27+ref[REF.rootX]*.12,-.09,.09)*gw;
  P[C.HIPS]+=sourcePitch*.65;P[C.SPINE]-=sourcePitch*.45;P[C.CHEST]-=sourcePitch*.2;
  // The gun hand remains IK-owned; only the free-arm/shoulder cadence gets a
  // small source-guided counter-swing, faded while actively aiming.
  const freeArm=(1-ch.wAim)*(1-ch.wTwo),armSwing=clamp((ref[REF.thighR]-ref[REF.thighL])*.08,-.085,.085)*gw;
  P[C.UARML]+=armSwing*freeArm;P[C.CLAVL+1]+=ref[REF.armL]*.11*freeArm*gw;
  P[C.CLAVR+1]+=ref[REF.armR]*.06*(1-ch.wAim)*gw;
  const lean=gw*(mix(.025,.17,rn)*(1-bk*1.3)*(1-.55*ch.wAim)+.1*ch.wGoo);
  P[C.HIPS]+=lean*.3;P[C.SPINE]+=lean*.45;P[C.CHEST]+=lean*.25;
  const lat=clamp(ch.kgx/6,-1,1)*gw*(1-.3*ch.wGoo);P[C.SPINE+2]-=.05*lat;P[C.CHEST+2]-=.025*lat;P[C.HIPS+2]-=.02*lat;
  const squash=.012*c2*rn*gw;P[C.SQY]*=1-squash;P[C.SQXZ]*=1+squash*.45;P[C.HEAD]-=.018*c2*rn*gw;P[C.NECK]+=.012*c2*rn*gw;
}
function advanceLean(ch,axis,acceleration,weight,dt){
  if(!api)return null;
  const s=state(ch),key=axis==='pitch'?'pitch':'roll',velocity=key+'V',goal=clamp(acceleration*(key==='pitch'?1:-1)*tuning.leanGain,-tuning.leanMax,tuning.leanMax)*weight,omega=2*Math.PI*tuning.leanFrequency;
  const y=s[key]-goal,j=s[velocity]+omega*y,e=Math.exp(-omega*dt);s[key]=goal+(y+j*dt)*e;s[velocity]=(s[velocity]-omega*j*dt)*e;return s[key];
}

// A foot in flight does not carry body weight. Action poses keep their original
// contact blend; this only changes the grounded walking controller.
export function walkSwingUnloaded(ch,f){return state(ch).active?f.sw:f.sw&&f.su>.02&&f.su<.9;}

// The extra swing knee margin must not pull a weight-bearing ankle away from
// its locked heel/toe contact. The pelvis already solves planted-leg reach.
// The planted pelvis calculation keeps its source soft-knee margin, and the
// native analytic IK keeps its own final limit. Flight/actions retain the
// original additional swing margin.
export function walkFootReach(ch,f){
  if(!states.get(ch)?.active||!f.planted)return ch.legReach*.97;
  const leg=f.side>0?ch.limbs.legL:ch.limbs.legR;return (leg.a+leg.b)*.9995;
}

// A filtered pelvis can lag behind the support constraint during a reversal.
// Keep its native smoothing, but enforce the actual analytic IK reach before
// it can shorten a fully weighted, world-locked foot target. This uses the
// native kid-space targets and limb lengths; no actor or foot clocks change.
export function walkPelvisDrop(ch,nativeDrop){
  const s=states.get(ch);if(!s?.active)return nativeDrop;
  const C=api.CHARACTER_CHANNELS;
  let drop=nativeDrop;
  for(let i=0;i<2;i++){
    const f=ch.feet[i],weight=ch.P[i===0?C.WPL:C.WPR]*ch.plantW*(ch.feetValid?1:0);
    if(!f.planted||weight<.999)continue;
    const leg=i===0?ch.limbs.legL:ch.limbs.legR,ft=i===0?ch._fL:ch._fR;
    // Mirror Character._solveLimb's actual IK origin.  Using hips directly
    // misses intermediate parent transforms during a turn/reversal and can
    // make a fully weighted planted ankle just unreachable, visibly sliding it.
    ch._kidXform(leg.up.parent,s.supportParent,s.supportQ);
    const hip=s.support.copy(leg.up.position).applyQuaternion(s.supportQ).add(s.supportParent);
    const hx=ft.x-hip.x,hz=ft.z-hip.z,reach=(leg.a+leg.b)*.9995;
    const vertical=Math.sqrt(Math.max(0,reach*reach-hx*hx-hz*hz));
    drop=Math.max(drop,hip.y-ft.y-vertical+1e-6);
  }
  return drop;
}

export function walkActive(ch){return !!states.get(ch)?.active;}

// A reversing filtered velocity can pass through zero while the real root
// still travels. Only an actually stationary root uses preview tread motion.
export function walkTreadAllowed(ch,nativeTread){
  const w=states.get(ch);
  if(!nativeTread||!w?.rootMotionKnown||!ch.kidForm||!ch.grounded||ch.dance)return nativeTread;
  return Math.hypot(w.vx,w.vz)<=1e-6;
}

// _updateStates advances these once per tick, including hidden/squid bodies.
export function walkLean(ch,axis){return api&&eligible(ch)?state(ch)[axis==='pitch'?'pitch':'roll']:null;}
