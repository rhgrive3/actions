import * as THREE from 'three';
import {PLAYER} from '../../config.js';
import {SourcePose,loadSourceBank,clamp,mod} from './source-bank.js';
import {locomotionProfile,sampleContact,feasibleContact,smooth5} from './locomotion-profile.js';
import {GaitTargets} from './gait-targets.js';
import {HumanRetarget} from './retarget.js';
import {SourceSquidRig} from './squid-rig.js';
import {RootHairInertia} from './root-hair.js';
import {BodyBalance} from './body-balance.js';
import {HairTargets} from './hair-targets.js';
import {motionCadence} from './cadence-control.js';
// These are HOST integration choices, NOT values asserted to have been extracted from Nintendo's state machine.
export const HOST_MOTION = Object.freeze({fps:60,transitionSeconds:0.12,directionResponse:7,runBlendResponse:12,teleportDistance:3});
export const SOURCE_WEAPONS = Object.freeze({shooter:'Nrml',blaster:'Nrml',charger:'Chrg',splatling:'Glng',roller:'Rllr',slosher:'BBll'});
const SMOOTH=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const SIDES=['','Back','Left','Right'];
export class SourceMotionController {
 constructor(character, options={}) {
  this.character=character;this.options=options;this.variant=options.motionVariant==='Player01'?'Player01':'Player00';
  this.enabled=options.sourceMotion!==false;this.status=this.enabled?'loading':'disabled';this.error=null;this.disposed=false;
  this.time=0;this.phase=0;this.distance=0;this.speed=0;this.velocityY=0;this.localX=0;this.localZ=1;this.active=false;
  this.previousRoot=character.root.position.clone();this.rootSet=false;this.previousYaw=0;this.turnRate=0;this.yawStep=0;this.pivoting=false;this.gaitSpeed=0;this.localTurnRate=0;this.localYawReady=false;this.lastLocalYaw=0;this.turnGroundDisable=false;
  this.runBlend=0;this.strafeBalance=0;this.direction=new Float64Array([1,0,0,0]);this.directionTarget=new Float64Array(4);this.shootBlend=0;this.shootUntil=0;this.directionTurnUntil=0;
  this.currentState='';this.transitionTime=99;this.currentClips=[];this.fallbacks=new Set();this.contact=[0,0];this.lift=[0,0];
  this.formKid=true;this.formWeight=1;this.formFrom=1;this.formTime=99;this.formDuration=0;this.formEvent=false;
  this.grounded=true;this.airTime=0;this.launchY=PLAYER.jumpVel;this.landTime=99;this.action=null;this.jumpEvent=false;
  this.squidState='';this.squidFrame=0;this.squidBlendTime=99;this.squidYaw=0;this.wasActive=false;this.dodgeUntil=0;this.specialUntil=0;this.manual=null;this.debug={};this.loadToken=0;
  this.ready=this.enabled?this.load(this.variant):Promise.resolve(this);
 }
 async load(variant) {
  const token=++this.loadToken;
  try{
   const [bank,squidBank]=await Promise.all([loadSourceBank(variant),loadSourceBank('Player_Squid')]);
   if(this.disposed||token!==this.loadToken)return this;
   this.variant=variant;this.bank=bank;this.pose=new SourcePose(bank);this.tmp=new SourcePose(bank);this.previousPose=new SourcePose(bank);this.overlay=new SourcePose(bank);this.restGait=new SourcePose(bank);
   this.bodyBalance=new BodyBalance(bank);this.hairTargets=new HairTargets(bank);this.previousHairTargets=new HairTargets(bank);this.pivotWeight=0;this.balanceWeight=0;this.bodyPose=null;this.previousBodyPose=new SourcePose(bank);this.previousBalanceTargets={wp:bank.bones.map(()=>new THREE.Vector3())};
   this.gaitTargets=new GaitTargets(bank);this.shortTargets=new GaitTargets(bank);this.previousTargets=new GaitTargets(bank);this.targetsActive=false;
   this.retarget=new HumanRetarget(this.character,bank);this.retarget.onReset=()=>this.bodyBalance.reset();this.rootHair=new RootHairInertia(this.character);this.squidBank=squidBank;this.squidPose=new SourcePose(squidBank);this.previousSquid=new SourcePose(squidBank);
   if(this.squidRig)this.squidRig.dispose();this.squidRig=new SourceSquidRig(this.character,squidBank);
   this.upperMask=bank.bones.map((b,i)=>{for(let p=i;p>=0;p=bank.bones[p].parent)if(bank.bones[p].name==='spine1')return true;return false;});
   const weaponIndex=bank.index.weapon;bank.sample('WaitShoot_Nrml',0,this.tmp,false);this.weaponReference=this.tmp.wq[weaponIndex].clone().invert();this.weaponQ=new THREE.Quaternion();this.wristQ=new THREE.Quaternion();this.parentQ=new THREE.Quaternion();this.handP=new THREE.Vector3();this.gripBases=new Map();this.gripV=new THREE.Vector3();this.gripV2=new THREE.Vector3();this.fitR=new THREE.Vector3();this.fitL=new THREE.Vector3();this.shoulderR=new THREE.Vector3();this.shoulderL=new THREE.Vector3();this.armPole=new THREE.Vector3();this.fitQ=new THREE.Quaternion();
   this.walk=locomotionProfile(bank,'WalkHold_Nrml');this.run=locomotionProfile(bank,'RunHold_Nrml');
   this.walkSpeed=this.walk.stride*this.retarget.legScale*HOST_MOTION.fps/bank.clips.get('WalkHold_Nrml').frames;
   this.runSpeed=this.run.stride*this.retarget.legScale*HOST_MOTION.fps/bank.clips.get('RunHold_Nrml').frames;
   bank.sample('WaitHold_Nrml',this.time*HOST_MOTION.fps,this.pose);this.activationTime=0;this.activationPose=null;
   this.renderedPose=this.character.boneList.map(b=>({p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}));this.airFrom=this.renderedPose.map(b=>({p:b.p.clone(),q:b.q.clone(),s:b.s.clone()}));this.finalState=null;this.airBlendTime=99;
   this.currentState='';this.rootSet=false;this.runBlend=0;this.strafeBalance=0;this.shootBlend=0;this.shootUntil=0;this.directionTurnUntil=0;this.status='ready';this.error=null;return this;
  }catch(error){if(token===this.loadToken){this.status='error';this.error=String(error?.message||error);console.error('[INKWAVE source motion]',this.error);}return this;}
 }
 setVariant(variant){if(!['Player00','Player01'].includes(variant))throw new Error('Unknown human source variant');this.status='loading';this.active=false;this.ready=this.load(variant);return this.ready;}
 setEnabled(enabled){this.pivotWeight=0;this.pivoting=false;this.runBlend=0;this.strafeBalance=0;this.enabled=!!enabled;this.activationTime=0;this.activationPose=null;this.rootHair?.reset();if(!this.enabled)this.squidRig?.resetDeformation();this.active=false;this.rootSet=false;this.retarget?.reset();if(this.enabled&&!this.bank)this.ready=this.load(this.variant);}
 playClip(name,{frame=0,loop=undefined,rate=1,squid=false,contact=false}={}){
  const bank=squid?this.squidBank:this.bank;if(!bank?.clips.has(name))throw new Error(`Unavailable source clip ${name}`);
  this.manual={name,frame,loop,rate,squid,contact};this.activationTime=99;this.currentState='';this.retarget?.reset();
 }
 stopClip(){this.manual=null;this.currentState='';this.retarget?.reset();}
 trigger(name,arg){
  if(name==='jump'){this.jumpEvent=true;this.airTime=0;this.launchY=Math.max(this.velocityY,PLAYER.jumpVel);}
  if(name==='land'){this.landTime=0;this.retarget?.reset();}
  if(name==='dodge'){this.dodgeUntil=this.time+(Number(arg?.t)||0.3)+0.2;this.retarget?.reset();}
  if(name==='special_leap'||name==='special_slam')this.specialUntil=this.time+2;
  if(name==='spawn'){this.pivotWeight=0;this.pivoting=false;this.runBlend=0;this.strafeBalance=0;this.shootUntil=0;this.directionTurnUntil=0;this.shootBlend=0;this.rootSet=false;this.retarget?.reset();this.currentState='';this.action={name:'spawn',time:0};return;}
  if(['shoot','slosh','flick','throw','charge_release','hit'].includes(name))this.action={name,time:0};
 }
 choose(candidates){for(const name of candidates)if(this.bank.clips.has(name))return name;throw new Error(`No source clip in ${candidates.join(', ')}`);}
 directionClips(family,shooting,run){
  const mode=run?'Run':'Walk',suffix=shooting?'Shoot':'Hold';
  return SIDES.map((side,index)=>{
   const exact=`${mode}${side}${suffix}_${family}`;
   if(this.bank.clips.has(exact))return {name:exact,sourceDirection:side,rot:0};
   const generic=`${mode}${side}${suffix}_Nrml`;
   // Missing directional family: use the observed full-body direction with a sourced weapon upper-body layer.
   if(this.bank.clips.has(generic)){this.fallbacks.add(exact+' -> '+generic);return{name:generic,sourceDirection:side,rot:0};}
   const walk=`Walk${side}${suffix}_${family}`;
   if(this.bank.clips.has(walk))return{name:walk,sourceDirection:side,rot:0};
   const final=this.choose([`Walk${side}Hold_Nrml`,'WalkHold_Nrml']);this.fallbacks.add(exact+' -> '+final);return{name:final,sourceDirection:side,rot:0};
  });
 }
 advance(dt,s={}){
  dt=Number.isFinite(dt)?clamp(dt,0,0.1):0;
  if(this.lastAdvanceTime!==undefined&&this.time<this.lastAdvanceTime){this.shootUntil=0;this.directionTurnUntil=0;this.retarget?.reset();}
  this.time+=dt;this.lastAdvanceTime=this.time;
  this.active=this.enabled&&this.status==='ready'&&!this.disposed;
  const c=this.character,R=c.root.position,yaw=c.root.rotation.y;
  let dx=0,dy=0,dz=0,dist=0;
  if(this.rootSet){dx=R.x-this.previousRoot.x;dy=R.y-this.previousRoot.y;dz=R.z-this.previousRoot.z;dist=Math.hypot(dx,dz);}
  const teleport=!this.rootSet||Math.hypot(dx,dy,dz)>HOST_MOTION.teleportDistance;
  this.previousRoot.copy(R);this.rootSet=true;
  this.motionVX=dt>0&&!teleport?dx/dt:0;this.motionVZ=dt>0&&!teleport?dz/dt:0;
  this.yawStep=dt>0&&!teleport?mod(yaw-this.previousYaw+Math.PI,Math.PI*2)-Math.PI:0;this.turnRate=dt>0?this.yawStep/dt:0;this.previousYaw=yaw;
  if(teleport){this.pivotWeight=0;this.pivoting=false;this.runBlend=0;this.strafeBalance=0;dx=dy=dz=dist=0;this.bodyBalance?.reset();this.retarget?.reset();this.rootHair?.reset();}
  const lm=s.localMove||{};this.treadmill=!c.inWorld&&dist<1e-10&&Number(s.speed)>0&&Math.hypot(lm.x||0,lm.z||0)>0;
  if(this.treadmill){const n=Math.hypot(lm.x||0,lm.z||0);this.localX=-(lm.x||0)/n;this.localZ=(lm.z||0)/n;dist=Number(s.speed)*dt;}
  else if(dist>1e-12){this.localX=(dx*Math.cos(yaw)-dz*Math.sin(yaw))/dist;this.localZ=(dx*Math.sin(yaw)+dz*Math.cos(yaw))/dist;}
  const localYaw=Math.atan2(this.localX,this.localZ);
  this.localTurnRate=dt>0&&this.localYawReady&&!teleport?mod(localYaw-this.lastLocalYaw+Math.PI,Math.PI*2)-Math.PI:0;
  this.localTurnRate=dt>0?this.localTurnRate/dt:0;
  this.lastLocalYaw=localYaw;this.localYawReady=true;
  this.speed=dt>0?dist/dt:0;this.velocityY=dt>0?dy/dt:0;this.distance+=dist;
  const nextGround=s.grounded??true;
  if(!nextGround&&this.grounded){this.airTime=0;this.launchY=Math.max(PLAYER.jumpVel,this.velocityY);this.retarget?.reset();}
  else if(!nextGround)this.airTime+=dt;
  if(nextGround&&!this.grounded){this.landTime=0;this.retarget?.reset();}else this.landTime+=dt;
  this.grounded=nextGround;
  const nextKid=(s.form||'kid')==='kid';
  if(nextKid!==this.formKid){this.formKid=nextKid;this.formFrom=this.formWeight;this.formTime=0;this.formEvent=true;
   if(this.bank){const human=this.bank.clips.get(nextKid?'ToHuman':'ToSquid'),squid=this.squidBank.clips.get(nextKid?'Sqd_ToHuman':'Sqd_ToSquid');this.formDuration=Math.min(human.frames,squid.frames)/HOST_MOTION.fps;}
  }else this.formTime+=dt;
  if(this.action)this.action.time+=dt;
  if(!this.active){if(this.wasActive)this.squidRig?.resetDeformation();this.wasActive=false;return;}
  this.wasActive=true;
  this.formWeight=this.formTime>=this.formDuration?(this.formKid?1:0):this.formFrom+((this.formKid?1:0)-this.formFrom)*SMOOTH(this.formTime/Math.max(1e-6,this.formDuration));
  if(this.manual){this.manual.frame+=dt*HOST_MOTION.fps*this.manual.rate;this.sampleManual();return;}
  // Modern mechanics without an exact source clip must retain the host action, not be mislabeled as source-exact.
  if(this.time<this.dodgeUntil||this.time<this.specialUntil){this.active=false;this.squidRig?.resetDeformation();this.debug.fallback='native modern dodge/special action';return;}
  const family=SOURCE_WEAPONS[c.weaponKind]||'Nrml';
// A roller's authoritative native two-hand rig owns the moving roller contact.
// Its source curves continue to drive both legs and body balance, but replacing
// the held upper torso made the native support arm physically unreachable.
this.sourceUpper=!!SOURCE_WEAPONS[c.weaponKind]&&c.weaponKind!=='roller';
  if(!this.sourceUpper)this.fallbacks.add(`modern ${c.weaponKind}: sourced legs; native weapon/upper body`);
  const triggerActive=!!s.firing||Number(s.charge)>0||c.lastShot<0.1;
  // Preserve the aiming gait between individual shots. This is a host pose
  // release grace, not an extracted Nintendo animation timing.
  if(triggerActive)this.shootUntil=this.time+0.18;
  const shooting=triggerActive||this.time<this.shootUntil;
  // Do not interrupt the complete walk cycle on every trigger edge. Blend the
  // sourced walking+shooting poses continuously while foot anchors persist.
  this.shootBlend+=((shooting?1:0)-this.shootBlend)*(1-Math.exp(-12*dt));
  this.keepSourceArms=this.sourceUpper;
// Native LTW/IKL already gives thrown subs a separate left-hand target.
// Suppressing its solver until a throw clip expires leaves a detached support
// hand precisely when the native IK weight crosses back to 1.
this.constrainLeft=true;
  // A pure yaw rotation has no linear displacement, but planted feet still need
  // to step around the rotation axis. Keep the turn step separate from world speed:
  // source sideways walk provides real foot curves, while the arc-to-phase rule
  // is explicitly a host locomotion choice (not a claimed Nintendo turn clip).
  this.pivoting=(this.pivoting?this.speed<.18&&Math.abs(this.turnRate)>.10:this.speed<.12&&Math.abs(this.turnRate)>.18)&&this.grounded&&this.formKid;
  this.pivotWeight+=((this.pivoting?1:0)-this.pivotWeight)*(-Math.expm1(-10*dt));
  this.gaitSpeed=this.pivoting?Math.max(this.speed,Math.abs(this.turnRate)*Math.hypot(c.rest.footL.x,c.rest.footL.z+0.11)):this.speed;
  // The previous code switched the ENTIRE walk/run pose in a single frame
  // on speed change, despite staying in `state=move`. Keep the source clips
  // and contact phase, but interpolate their contribution continuously.
  const wantedRun=clamp((this.speed-this.walkSpeed)/Math.max(1e-6,this.runSpeed-this.walkSpeed),0,1);
  this.runBlend+=(wantedRun-this.runBlend)*(-Math.expm1(-HOST_MOTION.runBlendResponse*dt));
  const run=this.runBlend;
  const walkClips=[this.directionClips(family,false,false),this.directionClips(family,true,false)];
  const runClips=[this.directionClips(family,false,true),this.directionClips(family,true,true)];
  this.directionTarget.set(this.pivoting?
   (this.turnRate>=0?[0,0,1,0]:[0,0,0,1]):
   [Math.max(0,this.localZ),Math.max(0,-this.localZ),Math.max(0,this.localX),Math.max(0,-this.localX)]);
  let sum=this.directionTarget.reduce((a,b)=>a+b,0);if(sum<1e-10){this.directionTarget.set([1,0,0,0]);sum=1;}
  const mix=1-Math.exp(-HOST_MOTION.directionResponse*dt);
  for(let i=0;i<4;i++)this.direction[i]+=(this.directionTarget[i]/sum-this.direction[i])*mix;
  let stride=0;const list=[];
  for(let j=0;j<2;j++)for(let i=0;i<4;i++)for(let mode=0;mode<2;mode++){
   const weight=this.direction[i]*(j?run:1-run)*(mode?this.shootBlend:1-this.shootBlend);if(weight<1e-6)continue;
   const item=(j?runClips:walkClips)[mode][i],p=locomotionProfile(this.bank,item.name);
   // This is a convex blend of full authored stride lengths. The old code
   // projected each clip onto the blended heading a SECOND time; diagonals
   // consequently gained a much higher cadence than forward/side motion.
   const axis=p.axis;
   stride+=p.stride*weight*(Math.abs(axis[0])*this.retarget.lateralScale+Math.abs(axis[2])*this.retarget.scale);list.push({name:item.name,weight,profile:p});
  }
  stride=Math.max(stride,Math.min(this.walk.stride,this.run.stride)*Math.min(this.retarget.scale,this.retarget.lateralScale)*0.25);
  // The source clip length defines the 60 Hz *authored* cadence, rather than
  // letting distance / an undersized host stride spin it 2–3x faster. Blend
  // speeds in host space, preserving phase through walk/run and shot changes.
  // At weak input both cadence and step amplitude diminish continuously.
  const nominalCadence=list.reduce((sum,item)=>sum+item.weight*HOST_MOTION.fps/this.bank.clips.get(item.name).frames,0);
  const timing=motionCadence({speed:this.speed,walkSpeed:this.walkSpeed,runSpeed:this.runSpeed,runWeight:run,nominalHz:nominalCadence,stride});
  const stepAmplitude=this.pivoting?1:timing.stepAmplitude;
  const cadenceHz=this.pivoting?Math.abs(this.turnRate)/Math.PI:timing.cadenceHz;
  stride*=Math.max(1e-6,stepAmplitude);
  if(this.grounded&&this.formKid){
   if(this.pivoting)this.phase+=Math.abs(this.yawStep)/Math.PI; // One left+right step sequence per half turn.
   else this.phase+=cadenceHz*dt;
  }
  const moving=this.speed>1e-5||this.pivoting;
  const wantedStrafe=moving&&!this.pivoting?Math.abs(this.localX):0;
  this.strafeBalance+=(wantedStrafe-this.strafeBalance)*(-Math.expm1(-8*dt));
  let state=moving?'move':'idle',special=null;
  const jumpBase=this.choose([`Jump${shooting?'Shoot':''}_${family}00`,`Jump_${family}00`,`Jump_Nrml00`]);
  if(this.formEvent&&this.formTime<(this.bank.clips.get(this.formKid?'ToHuman':'ToSquid').frames/HOST_MOTION.fps)){
   special={name:this.formKid?'ToHuman':'ToSquid',frame:this.formTime*HOST_MOTION.fps};state=special.name;
  }else if(!this.grounded){
   const st=this.bank.clips.get(jumpBase+'_St');
   if(st&&this.airTime<st.frames/HOST_MOTION.fps)special={name:st.name,frame:this.airTime*HOST_MOTION.fps};
   else{
    const dur=Math.max(this.launchY*2/PLAYER.gravity,1/HOST_MOTION.fps),start=(st?.frames||0)/HOST_MOTION.fps;
    const u=clamp((this.airTime-start)/Math.max(1/HOST_MOTION.fps,dur-start),0,1);
    special={name:jumpBase,frame:u*this.bank.clips.get(jumpBase).frames};
   }state='air';
  }else if(this.landTime<(this.bank.clips.get(jumpBase+'_Ed')?.frames||0)/HOST_MOTION.fps){special={name:jumpBase+'_Ed',frame:this.landTime*HOST_MOTION.fps};state='land';}
  else if(c.dance==='victory'||c.dance==='defeat'){
   const prefix=c.dance==='victory'?'Win':'Lose';const name=this.choose([`${prefix}_${family}`,`${prefix}_Nrml`,...Array.from(this.bank.clips.keys()).filter(k=>k.startsWith(prefix))]);special={name,frame:c.danceT*HOST_MOTION.fps};state=c.dance;
  }
  const key=`${state}:${family}:${state==='move'?'locomotion':shooting}:${this.sourceUpper}`;
  if(key!==this.currentState){
   this.previousBodyPose.copy(this.bodyPose||this.pose);
   for(const name of ['leg1_L','leg1_R']){const i=this.bank.index[name];this.previousBalanceTargets.wp[i].copy(this.balanceWeight?this.bodyBalance.targets.wp[i]:this.pose.wp[i]);}
   this.previousHairTargets.copy(this.hairTargets);this.previousTargets.copy(this.targetsActive?this.gaitTargets:this.pose);this.previousPose.copy(this.pose);this.transitionTime=0;this.currentState=key;if(!['move','idle'].includes(this.state)||!['move','idle'].includes(state))this.retarget.reset();}else this.transitionTime+=dt;
  this.currentClips=[];this.contact.fill(0);this.lift.fill(0);this.gaitTargets.clear();this.shortTargets.clear();this.bodyBalance.clear();this.hairTargets.clear();
  if(special){this.bank.sample(special.name,special.frame,this.pose,false);this.hairTargets.add(this.pose,locomotionProfile(this.bank,special.name),1);this.currentClips.push({name:special.name,frame:special.frame,weight:1});}
  else if(moving){
   let total=0;
   for(const item of list){
    const clip=this.bank.clips.get(item.name),p=item.profile;
    // Align *measured* left contact entry, rather than assuming forward/side/back clips share frame zero.
    const frame=mod(this.phase+p.feet[0].strike,1)*clip.frames;
    this.bank.sample(clip,frame,this.tmp,true);this.bodyBalance.add(p,item.weight);this.hairTargets.add(this.tmp,p,item.weight);this.gaitTargets.add(this.tmp,item.weight,p,mod(frame/clip.frames,1));this.shortTargets.add({wp:p.centers,wq:this.tmp.wq},item.weight);if(!total)this.pose.copy(this.tmp);else this.pose.mix(this.tmp,item.weight/(total+item.weight));total+=item.weight;
    const normalizedFrame=mod(frame/clip.frames,1);
    for(let i=0;i<2;i++){
     this.contact[i]+=sampleContact(p,i,normalizedFrame)*feasibleContact(p,i,normalizedFrame,{speed:this.speed,cadenceHz,legReach:this.character.limbs.legL.a+this.character.limbs.legL.b})*item.weight;
     const f=this.bank.index['foot_'+(i?'R':'L')],t=this.bank.index['toe_'+(i?'R':'L')];
     const fy=Math.min(this.tmp.wp[f].y-this.bank.rest.wp[f].y,this.tmp.wp[t].y-this.bank.rest.wp[t].y);
     this.lift[i]+=Math.max(0,fy-p.feet[i].threshold)*this.retarget.scale*item.weight;
    }
    this.currentClips.push({name:item.name,frame,weight:item.weight});
   }
   this.pose.fk();
   if(stepAmplitude<1){
    // An independent idle clock used to add large, unrelated head sway to
    // weak-stick locomotion. Shorten toward this gait's measured cycle mean.
    this.restGait.copy(this.bodyBalance.center).fk();
    this.pose.mix(this.restGait,1-stepAmplitude).fk();
    // Neutral stance comes from THIS gait's measured cycle center, not the
    // much wider weapon-idle pose. Retain the minimum authored ankle height.
    for(const i of this.shortTargets.indices)this.shortTargets.wq[i].copy(this.restGait.wq[i]);
    this.gaitTargets.mix(this.shortTargets,1-stepAmplitude);
   }
   // Family-specific upper pose when that family's direction clips are absent.
   if(this.sourceUpper&&family!=='Nrml'&&list.some(x=>x.name.endsWith('_Nrml'))){
    // Use the same shoot weight for the weapon-family overlay as for the legs.
    let upperTotal=0;
    for(let mode=0;mode<2;mode++){
     const weight=mode?this.shootBlend:1-this.shootBlend;
     const upperName=`${run>0.5?'Run':'Walk'}${mode?'Shoot':'Hold'}_${family}`;
     if(weight<1e-6||!this.bank.clips.has(upperName))continue;
     const cl=this.bank.clips.get(upperName),p=this.bank.profile(upperName);
     this.bank.sample(cl,mod(this.phase+p.feet[0].strike,1)*cl.frames,this.overlay);
     this.mixUpper(this.overlay,weight/(upperTotal+weight));upperTotal+=weight;
    }
   }
  }else{
   const name=this.choose([`Wait${shooting?'Shoot':'Hold'}_${family}`,`WaitHold_${family}`,'WaitHold_Nrml','Wait']);
   const frame=this.time*HOST_MOTION.fps;this.bank.sample(name,frame,this.pose);const idleProfile=locomotionProfile(this.bank,name);this.bodyBalance.add(idleProfile,1);this.hairTargets.add(this.pose,idleProfile,1);this.currentClips.push({name,frame,weight:1});this.contact.fill(1);
  }
  // Pivoting changes the feet, not the gaze/weapon pose into a full lateral
  // strafe. Use the sourced quiet upper-body centre while root yaw is live.
  if(this.pivotWeight>1e-5&&!special){
   const name=this.choose([`Wait${shooting?'Shoot':'Hold'}_${family}`,'WaitHold_Nrml']);
   this.mixUpper(locomotionProfile(this.bank,name).centerPose,this.pivotWeight);
  }
  if(this.action&&!special){
   const action=this.actionClip(family,this.action.name);
   if(action){const cl=this.bank.clips.get(action),f=this.action.time*HOST_MOTION.fps;
    if(f<=cl.frames){this.bank.sample(cl,f,this.overlay,false);const weight=SMOOTH(f/2)*SMOOTH((cl.frames-f)/3);if(moving)this.mixUpper(this.overlay,weight);else this.pose.mix(this.overlay,weight);this.currentClips.push({name:action,frame:f,weight,upperOnly:moving});}
    else this.action=null;
   } else if(this.action.time>0.5) this.action=null;
  }
  this.pose.fk();
  if(!moving||special)this.gaitTargets.copy(this.pose);
  const blendSeconds=special?Math.min(HOST_MOTION.transitionSeconds,this.bank.clips.get(special.name).frames/HOST_MOTION.fps/2):HOST_MOTION.transitionSeconds;
  const transition=SMOOTH(this.transitionTime/Math.max(1e-6,blendSeconds));
  // Crossfade in the SAME presentation space on both sides. Resetting the
  // balancing gain to zero at a state boundary exposed the old unbalanced
  // pose for a frame (particularly obvious at 120 Hz idle -> walk).
  this.bodyPose=!special?this.bodyBalance.apply(this.pose,this.gaitTargets,{run,weight:1,pivot:this.pivotWeight,strafe:this.strafeBalance*(1-this.pivotWeight)}):this.bodyBalance.pose.copy(this.pose);
  if(transition<1){
   this.bodyPose.mix(this.previousBodyPose,1-transition).fk();
   if(!special)for(const name of ['leg1_L','leg1_R']){const i=this.bank.index[name];this.bodyBalance.targets.wp[i].lerp(this.previousBalanceTargets.wp[i],1-transition);}
   this.tmp.copy(this.previousPose).mix(this.pose,transition);this.pose.copy(this.tmp);for(let i=0;i<2;i++)if(!this.retarget.contacts[i].locked)this.contact[i]=0;
  }
  this.pose.fk();
  if(transition<1)this.gaitTargets.mix(this.previousTargets,1-transition);
  this.targetsActive=!special;
  this.state=state;this.balanceWeight=special?0:1;
  if(transition<1)this.hairTargets.mix(this.previousHairTargets,1-transition);
  this.aimPitch=this.sourceUpper?Number(s.aimPitch)||0:0;
  c.phase=this.phase;c.cad=cadenceHz;c.runW=run; // Consumers receive the same cycle rate used to sample sourced feet.
  this.debug={status:this.status,variant:this.variant,state,family,speed:this.speed,pivoting:this.pivoting,pivotTurnRate:this.turnRate,phase:this.phase,stride,stepAmplitude,cadenceHz,authoredCadenceHz:nominalCadence,run,shootBlend:this.shootBlend,sourceUpper:this.sourceUpper,clips:this.currentClips,contact:[...this.contact],fallbacks:[...this.fallbacks]};
 }
 mixUpper(pose,weight){for(let i=0;i<this.upperMask.length;i++)if(this.upperMask[i]){this.pose.p[i].lerp(pose.p[i],weight);this.pose.q[i].slerp(pose.q[i],weight);this.pose.s[i].lerp(pose.s[i],weight);}this.pose.fk();}
 actionClip(family,event){
  const names=event==='slosh'||event==='shoot'&&family==='BBll'?['Attack_BBll']:event==='flick'||event==='shoot'&&family==='Rllr'?['Attack_Rllr']:event==='charge_release'?[`Shoot_${family}`]:event==='throw'?[`ThrowBomb_${family}`,'ThrowBomb_Nrml']:event==='hit'?['Damage']:event==='spawn'?['ToHumanRespawn']:[];
  return names.find(n=>this.bank.clips.has(n))||null;
 }
 sampleManual(){
  this.targetsActive=false;this.bodyPose=null;this.bodyBalance?.reset();
  const m=this.manual;if(!m.squid){this.bank.sample(m.name,m.frame,this.pose,m.loop);this.formWeight=1;this.formKid=true;this.sourceUpper=true;this.keepSourceArms=true;this.constrainLeft=false;this.aimPitch=0;this.state='manual';}
  else{this.squidBank.sample(m.name,m.frame,this.squidPose,m.loop);this.formWeight=0;this.formKid=false;this.state='manual-squid';}
  this.currentClips=[{name:m.name,frame:m.frame,weight:1}];this.debug={status:this.status,state:this.state,variant:this.variant,clips:this.currentClips};
 }
 applyForm(){
  const c=this.character;c.kidScale=this.formWeight;c.sqScale=1-this.formWeight;c.kidSY=1;c.kidSXZ=1;c.sqSY=1;c.sqSXZ=1;c.kidLift=0;
  c.kid.visible=c.kidScale>0.001;c.squidRoot.visible=c.sqScale>0.001;
 }
 applyBody(dt,s){
  if(!this.active||!this.pose)return;
  if(!this.activationPose)this.activationPose=this.character.boneList.map(b=>({p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}));
  this.activationTime+=dt;
  const balanceActive=['move','idle'].includes(this.state)&&!this.manual;
  this.retarget.apply(this.bodyPose||this.pose,{upper:this.sourceUpper,aimPitch:this.aimPitch,rootScale:this.character.kidScale,trajectory:this.targetsActive?this.gaitTargets:this.pose,pelvisTrajectory:balanceActive?this.bodyBalance.targets:null});
  const activation=SMOOTH(this.activationTime/HOST_MOTION.transitionSeconds);
  if(activation<1)for(let i=0;i<this.character.boneList.length;i++){const b=this.character.boneList[i],old=this.activationPose[i];b.position.lerp(old.p,1-activation);b.quaternion.slerp(old.q,1-activation);b.scale.lerp(old.s,1-activation);}
  // A changing heading can conflict with a world-space plant even when the
  // body faces straight ahead. Keep the release through the direction blend;
  // do not toggle both feet on/off for a single joystick impulse.
  if(Math.abs(this.localTurnRate)>.6&&this.speed>.02)this.directionTurnUntil=this.time+.16;
  const turnMagnitude=Math.abs(this.turnRate);
  this.turnGroundDisable=(this.turnGroundDisable?turnMagnitude>.18:turnMagnitude>.28)||this.time<this.directionTurnUntil;
  const groundEnabled=activation>=1&&this.state!=='manual'&&this.state!=='ToHuman'&&this.state!=='ToSquid'&&this.state!=='victory'&&this.state!=='defeat';
  this.debug.groundMode=this.pivoting?'pivot-free':this.turnGroundDisable?'turn-free':groundEnabled?'plant':'air-free';
  this.retarget.ground(this.pose,dt,{grounded:this.grounded,enabled:groundEnabled,freeProtect:this.pivoting||this.turnGroundDisable,contact:this.contact,lift:this.lift,speed:this.gaitSpeed,lateral:this.localX,runWeight:this.runBlend,turn:this.turnRate,velocityX:this.motionVX,velocityZ:this.motionVZ,treadmill:this.treadmill,unplant:this.pivoting||this.turnGroundDisable});
  this.bodyBalance.compensateReach(this.character,this.retarget.pelvisDelta.y,dt,balanceActive&&this.grounded&&groundEnabled);
  this.debug.bodyBalance={enabled:balanceActive,reachCorrection:this.bodyBalance.reachCorrection};
  if(this.state==='air'&&!this.manual){
   if(this.finalState!=='air'){this.airBlendTime=0;for(let i=0;i<this.airFrom.length;i++){this.airFrom[i].p.copy(this.renderedPose[i].p);this.airFrom[i].q.copy(this.renderedPose[i].q);this.airFrom[i].s.copy(this.renderedPose[i].s);}}
   const t=SMOOTH(this.airBlendTime/HOST_MOTION.transitionSeconds);
   if(t<1)for(let i=0;i<this.character.boneList.length;i++){const b=this.character.boneList[i],old=this.airFrom[i];b.position.lerp(old.p,1-t);b.quaternion.slerp(old.q,1-t);b.scale.lerp(old.s,1-t);}
   this.airBlendTime+=dt;
  }

 }
 /** Calibrate the weapon attachment basis from the actual forward-shoot reference.
  * Source wrist/weapon axes are not the host grip axes. Preserve the source arm pose;
  * orient the attached weapon from its own source bone, not the index finger direction. */
 alignWeapon(leftWeight=0,explicitLeft=0){
  if(!this.active||!this.sourceUpper||!this.pose)return;
  const c=this.character,i=this.bank.index.weapon,d=c.weapon.def;
  let basis=this.weaponReference;
  if(c.weaponKind==='roller'){
   basis=this.gripBases.get(c.weaponKind);
   if(!basis){
    this.bank.sample('WaitShoot_Rllr',0,this.tmp,false);
    this.weaponQ.copy(this.tmp.wq[i]).multiply(this.weaponReference);
    this.gripV.subVectors(d.handL.pos,d.handR.pos).applyQuaternion(this.weaponQ).normalize();
    this.gripV2.subVectors(this.tmp.wp[this.bank.index.hand_L],this.tmp.wp[this.bank.index.hand_R]).normalize();
    this.weaponQ.premultiply(this.fitQ.setFromUnitVectors(this.gripV,this.gripV2));
    basis=this.tmp.wq[i].clone().invert().multiply(this.weaponQ);this.gripBases.set(c.weaponKind,basis);
   }
  }
  this.weaponQ.copy(this.pose.wq[i]).multiply(basis).premultiply(this.retarget.aim);
  this.wristQ.copy(this.weaponQ).multiply(d.handR.quat);
  c._kidXform(c.bones.handR,this.handP,this.parentQ);
  this.fitR.copy(this.handP);
  // Project only an unreachable bimanual grip into the intersection of the two arm reach spheres.
  // This keeps the source elbow direction and minimises the host-proportion correction.
  if(this.constrainLeft&&leftWeight>0.5&&explicitLeft<0.05){
   c._kidXform(c.limbs.armR.up,this.shoulderR,this.parentQ);c._kidXform(c.limbs.armL.up,this.shoulderL,this.parentQ);
   this.gripV.subVectors(d.handL.pos,d.handR.pos);if(c.weapon.pump)this.gripV.z-=0.036*c.weapon.pump;this.gripV.applyQuaternion(this.weaponQ);
   const rr=(c.limbs.armR.a+c.limbs.armR.b)*0.995,rl=(c.limbs.armL.a+c.limbs.armL.b)*0.995;
   for(let k=0;k<16;k++){
    this.gripV2.subVectors(this.fitR,this.shoulderR);if(this.gripV2.length()>rr)this.fitR.copy(this.shoulderR).add(this.gripV2.setLength(rr));
    this.fitL.copy(this.fitR).add(this.gripV);this.gripV2.subVectors(this.fitL,this.shoulderL);
    if(this.gripV2.length()>rl)this.fitR.add(this.shoulderL).add(this.gripV2.setLength(rl)).sub(this.fitL);
   }
   c._kidXform(c.limbs.armR.lo,this.armPole,this.parentQ);this.armPole.sub(this.shoulderR);
   c._solveLimb(c.limbs.armR,this.fitR,this.armPole,this.wristQ,1,1);
  }else{
   c._kidXform(c.bones.handR.parent,this.gripV,this.parentQ);
   c.bones.handR.quaternion.copy(this.parentQ.invert().multiply(this.wristQ)).normalize();
  }
  this.debug.gripFitMeters=this.fitR.distanceTo(this.handP);
 }
 applyAccessories(dt){if(this.active&&this.pose){this.retarget.applyAccessories(this.pose,{hairTargets:!this.manual?this.hairTargets:null,shootBlend:this.shootBlend,dt});if(!this.manual)this.rootHair.update(dt,this.turnRate);for(let i=0;i<this.character.boneList.length;i++){const b=this.character.boneList[i],saved=this.renderedPose[i];saved.p.copy(b.position);saved.q.copy(b.quaternion);saved.s.copy(b.scale);}this.finalState=this.state;}}
 updateSquid(dt,s){
  if(!this.active||this.character.sqScale<=0.001)return false;
  let name,frame;
  if(this.manual?.squid){name=this.manual.name;frame=this.manual.frame;}
  else{
   if(this.formEvent&&this.formTime<this.squidBank.clips.get(this.formKid?'Sqd_ToHuman':'Sqd_ToSquid').frames/HOST_MOTION.fps){name=this.formKid?'Sqd_ToHuman':'Sqd_ToSquid';frame=this.formTime*HOST_MOTION.fps;}
   else if(!this.grounded){name='Sqd_Jump';frame=this.airTime*HOST_MOTION.fps;}
   else if(this.landTime<this.squidBank.clips.get('Sqd_Jump_Ed').frames/HOST_MOTION.fps){name='Sqd_Jump_Ed';frame=this.landTime*HOST_MOTION.fps;}
   else{name=this.speed>1e-5?'Sqd_Walk':'Sqd_Wait';frame=null;}
   if(name!==this.squidState){this.previousSquid.copy(this.squidPose);this.squidState=name;this.squidFrame=0;this.squidBlendTime=0;}
   else{this.squidFrame+=dt*HOST_MOTION.fps;this.squidBlendTime+=dt;}
   if(frame===null)frame=this.squidFrame;
   this.squidBank.sample(name,frame,this.squidPose);
   if(this.squidBlendTime<HOST_MOTION.transitionSeconds&&!name.startsWith('Sqd_To')){const out=this.squidBlendPose||(this.squidBlendPose=new SourcePose(this.squidBank));out.copy(this.previousSquid).mix(this.squidPose,SMOOTH(this.squidBlendTime/HOST_MOTION.transitionSeconds));this.squidPose.copy(out).fk();}
  }
  const wantedYaw=this.speed>1e-5?Math.atan2(this.localX,this.localZ):this.squidYaw;this.squidYaw+=(mod(wantedYaw-this.squidYaw+Math.PI,2*Math.PI)-Math.PI)*(1-Math.exp(-16*dt));
  this.squidRig.apply(this.squidPose,{yaw:this.squidYaw,form:s.form||'squid',wallNormal:s.wallNormal,velocityY:this.velocityY,speed:this.speed,localX:this.localX,localZ:this.localZ,scale:this.character.sqScale});
  this.debug.squid={name,frame};return true;
 }
 dispose(){this.disposed=true;this.active=false;this.loadToken++;this.squidRig?.dispose();}
}