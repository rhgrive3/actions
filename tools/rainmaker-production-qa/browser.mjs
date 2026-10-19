import {productionScene} from './shared/production-scene.mjs';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const near=(a,b,e=1e-8)=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<=e);
// Actual composed Actor + source controller + native renderer, driven in the
// production actor-before-rule order. This fixture is not a full match/network.
export async function run({prefix,baselinePrefix}){
 const rows=[],metrics=[],ordinaryComparisons=[],ordinary=new Map(),progress=globalThis.__objectQA={suite:'rainmaker',stage:'init'};
 const random=Math.random;Math.random=()=>.5;
 try{
  for(const [revision,path] of [['before',baselinePrefix],['after',prefix]]){
   const ctx=await productionScene(path),{api,G,THREE,scene,camera,capture}=ctx,{Actor,Character}=api;
   const {RainmakerRule}=await import(path+'patches/splatoon3/runtime/ranked/rainmaker.mjs');
   const {createRainmakerModel,createRainmakerPresentation}=await import(path+'patches/splatoon3/runtime/ranked/rainmaker-model.mjs');
   G.teamColors=[new THREE.Color(0xe6e900),new THREE.Color(0x6340db)];G.level={blocks:[],groundHeight:()=>0};G.paint={sample:()=>1,splat:()=>0};G.physics={los:()=>true,raycast:(_a,_b,_c,hit)=>{hit.hit=false;return hit;}};
   G.projectiles=Object.fromEntries(['fireShooter','fireDualies','fireCharger','fireSplatling','fireBlaster','fireSlosh','throwBomb','fireFlick'].map(n=>[n,()=>{}]));
   try{
    for(const source of [true,false])for(const weapon of ['shooter','roller','dualies'])for(const team of [0,1]){
     const mode=source?'source':'native',key=mode+'-'+weapon+'-'+team;
     class Selected extends Character{constructor(opts){super({...opts,sourceMotion:source});}}
     const a=new Actor({team,isLocal:true,name:'rainmaker-qa-fixed',weapon,CharacterClass:Selected,style:{hair:0,hat:0,skin:2,outfit:0,eyes:0}}),ch=a.character;
     // Character seeds its own generator from the same fixed name. Wrap rather
     // than replace it: objective IK may change idle regrip draw consumption.
     const nativeRandom=ch.rng,rngTrace=[];let rngIndex=0;
     ch.rng=()=>{const value=nativeRandom();rngTrace.push({index:rngIndex++,tick,value});return value;};
     a.nid='carrier';ch.actor=a;ch.onEvent=null;ch.setLod('hero');scene.add(ch.root);G.actors=[a];a.grounded=a.ground.hit=true;G.time=0;
     const events=[],rule=new RainmakerRule({event:(kind,data)=>events.push({kind,charge:data.charge,pos:data.pos,aim:data.aim,tick})},{rainmaker:{center:[0,0,0]}}),state=rule.state;
     const match={mode:'rainmaker',ranked:{rule},playing:()=>true,canRespawn:()=>false};G.match=match;
     state.barrier.active=false;state.carrier=null;const mesh=createRainmakerModel(THREE);scene.add(mesh);const display=createRainmakerPresentation(THREE,mesh);
     let tick=0,poseCalls=0,leftSolves=0,maxLeft=0,maxRight=0,maxReach=0,maxPoseCalls=0,maxLeftSolves=0;
     const apply=ch._applyPose,solve=ch._solveLimb;ch._applyPose=function(...args){poseCalls++;return apply.apply(this,args);};ch._solveLimb=function(limb,...args){if(limb===this.limbs.armL)leftSolves++;const r=solve.call(this,limb,...args);if(limb===this.limbs.armL&&this._rainmakerPose)maxReach=Math.max(maxReach,this.ikErr[0]);return r;};
     const right=new THREE.Vector3(),origin=new THREE.Vector3(),left=new THREE.Vector3(),support=new THREE.Vector3();
     const receipt=()=>({pose:Array.from(ch.P),opacity:ch.u.uOpacity.value,pivotVisible:ch.weapon.pivot.visible,material:mesh.material.uuid,sourceUpper:ch.sourceMotion?.sourceUpper??null,keepSourceArms:ch.sourceMotion?.keepSourceArms??null,constrainLeft:ch.sourceMotion?.constrainLeft??null,poseCalls,leftSolves,rngIndex});
     const normal=(name)=>{const sample=receipt(),id=key+'-'+name;if(revision==='before')ordinary.set(id,sample);else{const old=ordinary.get(id);const poseEqual=near(sample.pose,old.pose),sameRandomIndex=sample.rngIndex===old.rngIndex;ordinaryComparisons.push({id,poseEqual,rngBefore:old.rngIndex,rngAfter:sample.rngIndex,maxPoseDelta:Math.max(...sample.pose.map((v,i)=>Math.abs(v-old.pose[i]))),history:name==='before'?'identical nonholder history':'objective path may suppress the ordinary left regrip random draw'});if(name==='before'){check(sameRandomIndex,id+' nonholder RNG count changed');check(poseEqual,id+' nonholder pose changed');}check(sample.opacity===old.opacity&&sample.poseCalls===old.poseCalls&&sample.leftSolves===old.leftSolves,id+' ordinary opacity/solver changed');check(sample.sourceUpper===old.sourceUpper&&sample.keepSourceArms===old.keepSourceArms&&sample.constrainLeft===old.constrainLeft,id+' source ownership changed');}};
     const step=(fire=false,advanceRule=true)=>{
      tick++;poseCalls=leftSolves=0;G.time+=1/60;a._finishFrame(1/60);
      if(advanceRule&&state.carrier)rule._updateShot(1/60,{id:'carrier',team,pos:a.pos.toArray(),aim:a.aimDir.toArray(),swimming:a.form==='squid'},{fire});
      display.update(state.carrier?a:null,state.charge.value);scene.updateMatrixWorld(true);
      if(ch._rainmakerPose){
       ch.weapon.pivot.getWorldPosition(right);mesh.getWorldPosition(origin);maxRight=Math.max(maxRight,right.distanceTo(origin));
       left.copy(ch.weapon.pivot.position);left.x=-left.x;ch.bones.handL.localToWorld(left);support.set(0,0,.07);mesh.localToWorld(support);maxLeft=Math.max(maxLeft,left.distanceTo(support));
       maxPoseCalls=Math.max(maxPoseCalls,poseCalls);maxLeftSolves=Math.max(maxLeftSolves,leftSolves);
       check(poseCalls===1&&leftSolves===1,key+' one pose / one left solve');
      }
     };
     const snap=async name=>{
      if(weapon!=='shooter'||team!==0)return;
      const target=ch.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.80,.24));
      for(const [view,offset]of [['rear',[1.4,.75,-2.6]],['side',[2.8,.3,.15]]]){
       camera.position.copy(target).add(new THREE.Vector3(...offset).normalize().multiplyScalar(4.1));camera.lookAt(target);
       const label=revision+'-'+mode+'-'+name+'-'+view;progress.stage=label;
       const muzzle=mesh.localToWorld(new THREE.Vector3(...mesh.userData.rainmakerModel.muzzle)),authorityOrigin=a.pos.clone().add(new THREE.Vector3(0,1,0)),muzzleForward=new THREE.Vector3(0,0,1).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
       const image=await capture(label);rows.push({...image,muzzleAuthorityDistance:muzzle.distanceTo(authorityOrigin),muzzleAimAngle:muzzleForward.angleTo(a.aimDir),revision,mode,name,tick,authority:JSON.parse(JSON.stringify(state.charge)),pose:{active:!!ch._rainmakerPose,ready:ch._rainmakerReady??null,pitch:ch._rainmakerPitch??null,kick:ch._rainmakerKick??null},sourceActive:!!ch.sourceMotion?.active,sourceUpper:ch.sourceMotion?.sourceUpper??null});
      }
     };
     // Freeze rule state only for isolated camera-limit keyframe inspection;
     // this is labelled in names, not treated as a continuous match timeline.
     const aimExtremes=async name=>{
      if(weapon!=='shooter'||team!==0)return;
      const old=a.aimPitch;
      for(const [label,pitch]of [['down',-1.05],['up',1.15]]){
       a.aimPitch=pitch;a.aimDir.set(Math.sin(a.yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(a.yaw)*Math.cos(pitch));
       for(let i=0;i<12;i++)step(false,false);await snap(name+'-isolated-aim-'+label);
      }
      a.aimPitch=old;a.aimDir.set(Math.sin(a.yaw)*Math.cos(old),Math.sin(old),Math.cos(a.yaw)*Math.cos(old));for(let i=0;i<12;i++)step(false,false);
     };
     try{
      if(source){await ch._sourceMotionLoader;await ch.sourceMotion?.ready;check(ch.sourceMotion?.status==='ready',key+' source ready');}
      for(let i=0;i<60;i++)step(false,false);normal('before');
      state.carrier='carrier';for(let i=0;i<12;i++)step(false);await snap('carry');await aimExtremes('carry');
      for(let i=0;i<7;i++)step(true);await snap('raise');
      for(let i=0;i<24;i++)step(true);await snap('half-charge');
      for(let i=0;i<31;i++)step(true);await snap('charged');await aimExtremes('charged');
      step(false);await snap('release-latched');step(false);step(false);await snap('recoil');await aimExtremes('recoil');
      for(let i=0;i<9;i++)step(false);await snap('return-half');
      for(let i=0;i<30;i++)step(false);await snap('returned');
      check(events.filter(e=>e.kind==='rainmaker-shot').length===1,key+' exactly one actual shot');
      // Main weapon one-shots may still be live when picking up the objective.
      ch.trigger(weapon==='roller'?'flick':'throw');for(let i=0;i<15;i++)step(false,false);
      // Camera pitch, jump and re-emergence use the same live grip frame.
      for(const pitch of [-1.05,1.15]){a.aimPitch=pitch;a.aimDir.set(Math.sin(a.yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(a.yaw)*Math.cos(pitch));for(let i=0;i<8;i++)step(false,false);}
      a.aimPitch=0;a.aimDir.set(0,0,1);a.grounded=a.ground.hit=false;a.vel.set(0,2,0);for(let i=0;i<8;i++)step(false,false);a.grounded=a.ground.hit=true;a.vel.set(0,0,0);
      a.form='squid';for(let i=0;i<12;i++)step(false,false);check(!ch._rainmakerPose,key+' squid releases pose');a.form='kid';for(let i=0;i<18;i++)step(false,false);
      if(revision==='after'){check(maxRight<1e-6,key+' right grip');check(maxLeft<.001,key+' left grip '+maxLeft);check(maxReach<.001,key+' arm overextension '+maxReach);}
      if(source){ch.sourceMotion.setEnabled(false);for(let i=0;i<12;i++)step(false,false);ch.sourceMotion.setEnabled(true);for(let i=0;i<30;i++)step(false,false);}
      state.carrier=null;for(let i=0;i<120;i++)step(false,false);check(ch.weapon.pivot.visible,key+' restored weapon');check(!ch._rainmakerPose,key+' released pose');normal('drop');await snap('drop');
      a.alive=false;state.carrier='carrier';step(false,false);check(!ch._rainmakerPose,key+' dead releases pose');a.alive=true;state.carrier=null;
      match.mode='clams';ch.trigger('throw');for(let i=0;i<6;i++)step(false,false);normal('ordinary-throw-in-clams-mode');
      match.mode='rainmaker';state.carrier='carrier';for(let i=0;i<5;i++)step(false,false);if(revision==='after')check(ch._rainmakerPose,key+' reacquired');
      metrics.push({revision,mode,weapon,team,maxLeft,maxRight,maxReach,maxPoseCalls,maxLeftSolves,events,triangles:mesh.geometry.index.count/3,geometryBytes:Object.values(mesh.geometry.attributes).reduce((n,a)=>n+a.array.byteLength,0)+mesh.geometry.index.array.byteLength,opacity:ch.u.uOpacity.value,sourceReady:ch.sourceMotion?.status??null,rngSeed:ch.seed,rngCalls:rngIndex,rngTrace});
     }finally{display.release();scene.remove(mesh,ch.root);mesh.geometry.dispose();mesh.material.dispose();ch.dispose();G.actors=[];}
    }
   }finally{ctx.dispose();}
  }
  return{status:'passed',expectedFrames:120,rows,metrics,ordinaryComparisons,scope:'Production composed Actor/source/native driven sequence and real render pipeline; before is main3839 motion modules only; not full match/network. Nintendo angles are calibration, not extracted joints.'};
 }finally{Math.random=random;}
}
