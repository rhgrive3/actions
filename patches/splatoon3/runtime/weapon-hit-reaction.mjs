// Issue #1097: class/state hit-pose presentation. Shape values are INKWAVE
// calibration; public S3 names do not establish retail curves or timing.
const INSTALL = Symbol.for('inkwave.s3.weapon-hit-reaction.install.v1');
const FEEDBACK_FIELDS = [
  ['lifeLv'],['hipDrop'],['ikErrPre'],['_toeUp'],['_headSet'],['_hairOdd'],['_hairAcc'],
  ['ikErr','0123'],['_fL','xyz'],['_fR','xyz'],['_fLq','xyzw'],['_fRq','xyzw'],['_headQW','xyzw'],
];
const FOOT_FIELDS = [['disp','xyz'],['dispYaw'],['dispOK']];
const fieldWidth = fields => fields.reduce((n,[,axes]) => n+(axes?.length||1),0);
const FEEDBACK_WIDTH = fieldWidth(FEEDBACK_FIELDS), FOOT_WIDTH = fieldWidth(FOOT_FIELDS);
const SHAPES = [
  -10,-12,-15,-5,6,5,-3,-1,5,-4,-6,-4,6,3,25,85,
  15,12,9,4,-5,-4,6,-2,6,10,12,-15,-10,-4,45,90,
  -13,-15,-18,-6,5,6,-4,-2,8,5,11,-13,18,10,50,80,
  -10,-14,-15,-5,7,5,-3,-1,7,-3,-4,-9,12,5,35,85,
  -6,-8,-10,-3,18,12,-2,-1,4,-5,-5,-3,4,-6,15,90,
  -4,10,-8,-3,10,-15,2,-1,10,-18,5,-7,6,8,30,85,
  -12,-10,-14,-5,4,5,-5,-2,16,8,8,-11,-6,4,45,85,
];
const ATTACK = .04, HOLD = .10, RELEASE = .60, MOVE = .25;
const clamp = (x, lo, hi) => x > hi ? hi : x < lo ? lo : x;
const clamp01 = x => x > 1 ? 1 : x < 0 ? 0 : x;
const smooth = x => { x=clamp01(x); return x*x*(3-2*x); };
const envelope = age => age < 0 || age >= RELEASE || !Number.isFinite(age) ? 0 :
  Math.min(1,age/ATTACK) * (1-smooth((age-HOLD)/(RELEASE-HOLD)));
const stateOf = ch => ch?.[INSTALL]?.states.get(ch);

function feedback(ch,s,restore) {
  let n=0;
  for(const [key,axes] of FEEDBACK_FIELDS) {
    const o=ch[key];
    if(axes) for(let i=0;i<axes.length;i++) {
      const a=axes[i]; if(restore)o[a]=s.fb[n];else s.fb[n]=o[a]; n++;
    } else if(restore) ch[key]=s.fb[n++]; else s.fb[n++]=ch[key];
  }
  for(const foot of ch.feet) for(const [key,axes] of FOOT_FIELDS) {
    const o=foot[key];
    if(axes) for(let i=0;i<axes.length;i++) {
      const a=axes[i]; if(restore)o[a]=s.fb[n];else s.fb[n]=o[a]; n++;
    } else if(restore) foot[key]=s.fb[n++]; else s.fb[n++]=foot[key];
  }
}

function stateFor(ch) {
  const hooks=ch[INSTALL]; let s=hooks.states.get(ch);
  if(!s) {
    s={k:-1,m:false,a:1,x:0,z:1,t:Infinity,e:0,on:false,pre:null,
      basePose:new Float32Array(ch.P.length),gm:ch.root.position.clone(),gl:ch.root.position.clone(),
      kp:ch.kid.position.clone(),kq:ch.kid.quaternion.clone(),ks:ch.kid.scale.clone(),
      rp:ch.kid.position.clone(),rq:ch.kid.quaternion.clone(),rs:ch.kid.scale.clone(),
      fb:new Array(FEEDBACK_WIDTH+ch.feet.length*FOOT_WIDTH),
      mv:false,mm:false,lm:false,q:false};
    hooks.states.set(ch,s);
  }
  return s;
}

function select(ch,arg,kinds) {
  const s=stateFor(ch), kind=kinds.indexOf(ch.weaponKind);
  let x=0,z=1,amp=1;
  if(arg && typeof arg==='object') {
    x=+arg.x||0; z=+arg.z||0;
    const len=Math.hypot(x,z); if(len>1e-4){x/=len;z/=len;}else z=1;
    amp=clamp(arg.amount??arg.amp??1,.3,1.6);
  } else if(typeof arg==='number' && Number.isFinite(arg)) amp=clamp(arg,.3,1.4);
  s.k=kind; s.m=(ch.gaitW||0)>MOVE; s.a=amp; s.x=x; s.z=z;
  s.t=0;s.e=0;s.on=false;s.pre=null;s.mv=false;
}

function eligible(ch,s) {
  return ch.s3WeaponHitReactionEnabled!==false && s.k>=0 && ch.kidForm && !ch.dance &&
    ch.root.visible && ch._owner()?.alive!==false;
}

function applyPresentation(ch,T,C,s) {
  const {SPINE,CHEST,NECK,HEAD,HIPS,HIPS_P,CLAVL,CLAVR,UARML,UARMR}=C;
  s.t=ch.tr[T.T_HIT];
  const env=eligible(ch,s)?envelope(s.t):0;
  s.e=env;s.on=false;
  if(env<=0) return;
  const P=ch.P,j=s.k*16,d=SHAPES,k=env*s.a*(s.m?d[j+15]:100)/10000,
    hz=clamp(s.z,-1,1),hx=clamp(s.x,-1,1),w=env*d[j+14]/100;
  const front=hz*k,side=hx*k,y=d[j+4]*side,r=d[j+5]*side,clav=d[j+8]*k;
  s.mv=false;
  if(s.pre&&w>.001) for(const base of [ANC,ANCR,ANL,ANLR,C.POLER,C.POLEL])
    for(let i=base;i<base+3;i++){const before=s.pre[i];P[i]=before+(P[i]-before)*(1-w);}
  P[SPINE]+=d[j]*front;P[SPINE+1]+=y;P[SPINE+2]+=r;
  P[CHEST]+=d[j+1]*front;P[CHEST+1]+=.6*y;P[CHEST+2]+=.6*r;
  P[NECK]+=d[j+3]*front;P[HEAD]+=d[j+2]*front;P[HEAD+1]+=.8*y;
  P[HIPS]+=d[j+6]*front;P[HIPS_P+1]+=d[j+7]*k;
  P[CLAVL+2]+=clav;P[CLAVR+2]-=clav;
  P[UARML]+=d[j+9]*k;P[UARMR]+=d[j+10]*k;
  // Retain the native held-weapon anchor. Displacing it after the authored
  // weapon hold has been solved can pull the support hand away from the grip.
  // Torso, head, clavicles and upper arms still carry the hit response.
  s.on=true;
}

export function installWeaponHitReaction(api) {
  const {Character,CHARACTER_CHANNELS:C,CHARACTER_TIMERS:T}=api;
  if(!Character||!C||!Number.isInteger(T?.T_HIT)) throw Error('Hit reaction requires Character channels and T_HIT');
  const proto=Character.prototype,kinds=Object.keys(api.WEAPONS);
  if(proto[INSTALL]) return;
  const states=new WeakMap(),applyPose=proto._applyPose,trigger=proto.trigger,buildPose=proto._buildPose,
    poseWeapon=proto._poseWeapon,getMuzzle=proto.getMuzzle,getMuzzleHand=proto.getMuzzleHand,
    getAimMuzzle=proto.getAimMuzzle,setWeapon=proto.setWeapon,setVisible=proto.setVisible,dispose=proto.dispose;
  Object.defineProperty(proto,INSTALL,{value:{states}});
  proto.trigger=function(name,...args){const result=trigger.call(this,name,...args);if(name==='hit')select(this,args[0],kinds);return result;};
  proto._poseWeapon=function(dt,s){
    const v=stateOf(this);
    if(v?.k>=0&&eligible(this,v)&&this.tr[T.T_HIT]<RELEASE){v.pre||=new Float32Array(this.P.length);v.pre.set(this.P);}
    return poseWeapon.call(this,dt,s);
  };
  proto._buildPose=function(dt,s){
    const result=buildPose.call(this,dt,s),v=stateOf(this);
    if(v){v.basePose.set(this.P);v.mv=false;applyPresentation(this,T,C,v);}
    return result;
  };
  proto._applyPose=function(dt,s){
    const v=stateOf(this);
    if(!v?.on||v.q||v.basePose.length!==this.P.length) return applyPose.call(this,dt,s);
    const render=this.P;v.q=true;let result;
    try {
      this.P=v.basePose;applyPose.call(this,dt,s);this.root.updateMatrixWorld(true);
      v.kp.copy(this.kid.position);v.kq.copy(this.kid.quaternion);v.ks.copy(this.kid.scale);
      const main=this.weapon?.muzzle;v.mm=!!main;if(main)main.getWorldPosition(v.gm);
      const left=this.dual&&this.weapon?.left?.muzzle;v.lm=!!left;if(left)left.getWorldPosition(v.gl);
      this.P=render;
      feedback(this,v,false);this.lifeLv=0;this._hairOdd=false;
      try{result=applyPose.call(this,0,s);}
      finally {
        feedback(this,v,true);
      }
      v.mv=true;
    } finally {this.P=render;v.q=false;}
    return result;
  };
  proto.getMuzzle=function(out){const v=stateOf(this);if(v?.on&&!v.q&&v.mv&&v.mm)return out.copy(v.gm);return getMuzzle.call(this,out);};
  proto.getMuzzleHand=function(out,hand=0){
    const v=stateOf(this);
    if(v?.on&&!v.q&&v.mv&&v.mm&&hand===1&&this.form==='kid'&&this.dual&&this.weapon?.left&&v.lm)return out.copy(v.gl);
    return getMuzzleHand.call(this,out,hand);
  };
  proto.getAimMuzzle=function(out,pitch){
    const v=stateOf(this);if(!v?.on||v.q||!v.mv||!this.kid)return getAimMuzzle.call(this,out,pitch);
    v.rp.copy(this.kid.position);v.rq.copy(this.kid.quaternion);v.rs.copy(this.kid.scale);
    this.kid.position.copy(v.kp);this.kid.quaternion.copy(v.kq);this.kid.scale.copy(v.ks);this.kid.updateWorldMatrix(true,false);
    let result;
    try{result=getAimMuzzle.call(this,out,pitch);}
    finally{this.kid.position.copy(v.rp);this.kid.quaternion.copy(v.rq);this.kid.scale.copy(v.rs);this.kid.updateWorldMatrix(true,false);}
    return result;
  };
  proto.setWeapon=function(...args){const v=stateOf(this),result=setWeapon.apply(this,args);if(v?.k>=0&&args[0]!==kinds[v.k])select(this,null,kinds);return result;};
  const retire=s=>{if(s){s.k=-1;s.on=false;s.pre=null;s.mv=false;}};
  proto.setVisible=function(value){if(!value)retire(stateOf(this));return setVisible.call(this,value);};
  proto.dispose=function(...args){retire(stateOf(this));return dispose.apply(this,args);};
}
