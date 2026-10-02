// Walking is an animation layer. It never writes actor speed or collision state.
// The numbers in walkMotion are visual calibration, not measured Nintendo clips.
let api, tuning;
const states = new WeakMap();
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const ease=x=>{const u=clamp(x,0,1);return u*u*u*(10+u*(6*u-15));};
const damp=(a,b,rate,dt)=>mix(a,b,1-Math.exp(-rate*dt));
const angle=x=>Math.atan2(Math.sin(x),Math.cos(x));
const state=ch=>{let s=states.get(ch);if(!s){s={active:false,pitch:0,pitchV:0,roll:0,rollV:0,vx:0,vz:0,target:new api.THREE.Vector3()};states.set(ch,s);}return s;};
function eligible(ch){
  const T=api.CHARACTER_TIMERS, tr=ch.tr;
  return ch.kidForm&&ch.grounded&&!ch.dance&&ch.kidScale>.5&&tr[T.T_LEAP]>1.9&&tr[T.T_SLAM]>1.4&&tr[T.T_DODGE]>ch.dodgeDur*.86&&tr[T.T_SPAWN]>1.4;
}
function startSwing(ch,f,settle=false,remaining){
  const M=api.CHARACTER_FOOT_MODES;
  f.from.copy(f.planted?f.pw:f.cw);f.fromYaw=f.planted?f.yaw:f.cyaw;
  f.startPitch=f.pitch;f.planted=false;f.sw=true;f.mode=settle?M.M_SETTLE:M.M_GAIT;f.su=0;
  f.dur=remaining??(1-ch.duty)/ch.cad;
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
  f.mode=api.CHARACTER_FOOT_MODES.M_GAIT;ch._touchDown(f,loud);
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
      ch.phase=ch.duty+.001-first*.5;
      if(!F[first].sw)startSwing(ch,F[first],false,Math.min(tuning.firstStepTime,(1-ch.duty)/ch.cad));
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
        const far=Math.hypot(f.pw.x-R.x,f.pw.z-R.z)>tuning.catchDistance;
        if(f.stU>=1){elapsed=(f.stU-1)*ch.duty/ch.cad;startSwing(ch,f);}
        else if(far&&f.stT>.06){startSwing(ch,f,false,Math.min(tuning.firstStepTime,(1-ch.duty)/ch.cad));elapsed=0;}
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
  f.cyaw=f.fromYaw+angle(f.toYaw-f.fromYaw)*e;f.cn.copy(f.n).lerp(f.tn,e).normalize();
  f.pitch=mix(f.startPitch??f.toe,0,smooth(0,.5,u))+(f.fold??0)*smooth(0,.22,u)*(1-smooth(.38,.78,u))-f.land*smooth(.55,.96,u);
}
export function installWalkMotion(context,profile){
  api=context;tuning=profile.walkMotion;
  if(!tuning||!api.Character||!api.CHARACTER_CHANNELS||!api.CHARACTER_TIMERS||!api.CHARACTER_FOOT_MODES)throw Error('Walking motion contract missing');
  const C=api.Character.prototype,oldTrack=C._trackRoot,oldStates=C._updateStates,oldFeet=C._updateFeet,oldPose=C._footPose,oldTarget=C._gaitTarget;
  C._trackRoot=function(dt,s){
    const w=state(this),valid=this.rootInit&&this.root.position.distanceToSquared(this.rp)<=9;
    w.vx=valid&&dt>0?(this.root.position.x-this.rp.x)/dt:0;w.vz=valid&&dt>0?(this.root.position.z-this.rp.z)/dt:0;
    oldTrack.call(this,dt,s);if(this.tread){w.vx=this.tvx;w.vz=this.tvz;}
  };
  C._updateStates=function(dt,s){
    const weight=this.gaitW;oldStates.call(this,dt,s);
    const support=1-this.wAir*.75;advanceLean(this,'pitch',clamp(this.kaz,-48,48),support,dt);advanceLean(this,'roll',clamp(this.kax,-48,48),support,dt);
    if(!eligible(this))return;
    const v=this.gv,rw=smooth(tuning.runStart,tuning.runFull,v);this.runW=rw;
    this.duty=mix(tuning.walkDuty,tuning.runDuty,rw)+.06*this.wGoo;
    const half=mix(tuning.walkHalfStride,tuning.runHalfStride,rw)*(1-.18*this.wGoo);
    this.cad=clamp(Math.max(v,tuning.startSpeed)*this.duty/(2*half),tuning.minCadence,tuning.maxCadence);
    this.liftH=mix(tuning.walkLift,tuning.runLift,rw)*(1+.6*this.wGoo);
    this.gaitW=damp(weight,v>(this.moving?tuning.stopSpeed:tuning.startSpeed)?1:0,v>tuning.startSpeed?12:8,dt);
  };
  C._updateFeet=function(dt,s){const w=state(this);w.active=eligible(this);if(!w.active)return oldFeet.call(this,dt,s);return updateFeet(this,dt);};
  C._footPose=function(f){return state(this).active?footPose(this,f):oldPose.call(this,f);};
  C._gaitTarget=function(f,remaining,out){
    if(!state(this).active)return oldTarget.call(this,f,remaining,out);
    const motion=state(this),v=Math.hypot(motion.vx,motion.vz),yaw=this.yaw+this.hipTwist+clamp(this.yawRate*remaining*.55,-.2,.2),half=clamp(v*this.duty/this.cad*.5,0,tuning.runHalfStride),w=mix(Math.abs(this.stance[f.side>0?0:3]),.078,this.runW)*f.side;
    const inv=v>.001?1/v:0;
    out.set(this.root.position.x+motion.vx*remaining+motion.vx*inv*half+w*Math.cos(yaw),this.root.position.y,this.root.position.z+motion.vz*remaining+motion.vz*inv*half-w*Math.sin(yaw));
    out.y=this._ground(out.x,out.z,f.tn);return yaw+f.side*mix(.1,.04,this.runW);
  };
}
export function applyWalkLocomotion(ch,P){
  if(!api)throw Error('Walking motion not installed');
  const C=api.CHARACTER_CHANNELS,gw=ch.gaitW,rn=ch.runW,ph=ch.phase,tau=Math.PI*2;
  if(gw<=.001)return;
  const bk=smooth(.1,-.7,ch.mdz),yawOsc=-mix(tuning.walkYaw,tuning.runYaw,rn)*Math.cos(tau*ph)*gw*(1-bk*.5),roll=mix(tuning.walkRoll,tuning.runRoll,rn)*Math.cos(tau*(ph-ch.duty*.5))*gw;
  const c2=Math.cos(tau*2*(ph-ch.duty*.45));
  P[C.HIPS_P+1]+=gw*mix(tuning.walkDrop,tuning.runDrop,rn)*(1+.5*ch.wGoo)+mix(tuning.walkBob,tuning.runBob,rn)*c2*gw*smooth(.1,2,ch.gs);
  P[C.HIPS_P]+=mix(.014,.01,rn)*Math.cos(tau*(ph-ch.duty*.5-.06))*gw;
  P[C.HIPS+1]+=ch.hipTwist+yawOsc;P[C.SPINE+1]-=ch.hipTwist*.45+yawOsc*.45;P[C.CHEST+1]-=ch.hipTwist*.55+yawOsc*.55;
  P[C.HIPS+2]+=roll;P[C.SPINE+2]-=roll*.6;P[C.CHEST+2]-=roll*.35;
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
  const leg=f.side>0?ch.limbs.legL:ch.limbs.legR;return leg.a+leg.b;
}

export function walkActive(ch){return !!states.get(ch)?.active;}

// _updateStates advances these once per tick, including hidden/squid bodies.
export function walkLean(ch,axis){return api&&eligible(ch)?state(ch)[axis==='pitch'?'pitch':'roll']:null;}
