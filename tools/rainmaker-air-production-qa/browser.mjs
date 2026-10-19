import {productionScene} from './shared/production-scene.mjs';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const trs=bone=>[...bone.position.toArray(),...bone.quaternion.toArray(),...bone.scale.toArray()];
export const AIR_CAPTURE_FRAMES=Object.freeze({
 'carry-jump':Object.freeze({109:['maximum-descending-correction'],112:['last-descending','pre-landing'],113:['landed']}),
 'charge-jump':Object.freeze({304:['maximum-descending-correction','last-descending','pre-landing'],305:['landed']})
});
// This exact input driver is shared by source/emitted CPU gates and the native
// renderer. Each of three actual jumps has 28 airborne frames: 84 per case.
export async function runAirScenario({api,scenario,onFrame=null}){
 const {G,THREE,Actor,Character,RankedEngine,Match,createRankedEffects,createRainmakerModel,createRainmakerPresentation}=api;
 check(Object.hasOwn(AIR_CAPTURE_FRAMES,scenario),'known full-jump case');
 const a=new Actor({team:0,isLocal:true,name:'rainmaker-qa-fixed',weapon:'dualies',CharacterClass:Character,style:{hair:0,hat:0,skin:2,outfit:0,eyes:0}}),ch=a.character;
 a.nid='carrier';a.slot=0;ch.actor=a;ch.onEvent=null;ch.setLod('hero');G.scene.add(ch.root);G.actors=[a];G.time=0;
 a.grounded=a.ground.hit=true;a.ground.block=0;a.groundN.set(0,1,0);a.pos.set(0,0,0);a.vel.set(0,0,0);a.aimYaw=a.yaw=a.aimPitch=0;a.aimDir.set(0,0,1);a.aimPoint.set(0,1,20);delete a.s3.squidSpawn;
 const events=[],engine=new RankedEngine('rainmaker',{id:'rainmaker-full-jump',rainmaker:{center:[0,0,0],goals:[[0,0,100],[0,0,-100]],checkpoints:[[],[]]}});
 const m=G.match={mode:'rainmaker',state:'playing',playing:()=>true,canRespawn:()=>false,ranked:engine,actors:[a],local:a,rankedBarrierHits:[],rankedGains:[0,0],rankedWorld:{zoneCoverage:()=>[],floorAt:()=>0,blocked:()=>false,update(){},presentEvent(){}},setState(s){this.state=s;}};
 m.playRankedEvents=function(batch,...args){events.push(...batch.map(e=>({...e})));return Match.prototype.playRankedEvents.call(this,batch,...args);};m.rankedEffects=createRankedEffects(api,m);
 const mesh=createRainmakerModel(THREE),display=createRainmakerPresentation(THREE,mesh);G.scene.add(mesh);
 const baselinePosition=new THREE.Vector3(),baselineQuaternion=new THREE.Quaternion(),afterPosition=new THREE.Vector3(),hand=new THREE.Vector3(),target=new THREE.Vector3(),solvedTarget=new THREE.Vector3(),solvedHand=new THREE.Vector3();
 let frame=0,cycle=-1,stage='warm',poses=0,solves=0,measured=false,rawKid=0,rawWorld=0,rngIndex=0;const traces=[];
 const rng=ch.rng;ch.rng=()=>{rngIndex++;return rng();};
 const apply=ch._applyPose,solve=ch._solveLimb;
 ch._applyPose=function(...args){poses++;return apply.apply(this,args);};
 ch._solveLimb=function(limb,...args){if(limb===this.limbs.armL)solves++;const r=solve.call(this,limb,...args);if(limb===this.limbs.armL&&this._rainmakerPose){measured=true;this.bones.clavL.getWorldPosition(baselinePosition);baselineQuaternion.copy(this.bones.clavL.quaternion);rawKid=this.ikErr[0];solvedTarget.copy(args[0]);this.kid.localToWorld(solvedTarget);this.bones.handL.getWorldPosition(solvedHand);rawWorld=solvedTarget.distanceTo(solvedHand);}return r;};
 const tick=async(n=1,fire=false,jump=false)=>{for(let i=0;i<n;i++){
  frame++;poses=solves=0;measured=false;G.time+=1/60;a.intent.fire=fire;a.intent.jump=jump&&i===0;
  a.update(1/60);Match.prototype.advanceRanked.call(m,1/60);display.update(engine.rule.state.carrier?a:null,engine.rule.state.charge.value);G.scene.updateMatrixWorld(true);
  if(!engine.rule.state.carrier)continue;
  // Rule pickup follows Actor.update; presentation begins on the next frame.
  if(!measured){check(frame===61&&!ch._rainmakerPose,'only pickup frame may precede pose ownership');continue;}
  hand.copy(ch.weapon.pivot.position);hand.x=-hand.x;ch.bones.handL.localToWorld(hand);target.set(0,0,.07);mesh.localToWorld(target);ch.bones.clavL.getWorldPosition(afterPosition);
  const row={frame,cycle,stage,source:ch.sourceMotion.state,grounded:a.grounded,pos:a.pos.toArray(),vel:a.vel.toArray(),form:a.form,kidScale:ch.kidScale,visible:ch.kid.visible,grip:target.distanceTo(hand),translationWorld:afterPosition.distanceTo(baselinePosition),angle:baselineQuaternion.angleTo(ch.bones.clavL.quaternion),rawKid,rawWorld,poses,solves,pending:!!ch.s3RainmakerSupportPending,clamArmActive:!!ch.s3ClamGripActive,root:trs(ch.root),kid:trs(ch.kid),model:trs(mesh),P:Array.from(ch.P),springs:Array.from(ch.sp),muzzle:ch.getMuzzle(new THREE.Vector3()).toArray(),left:['clavL','uArmL','fArmL','handL'].map(n=>({name:n,trs:trs(ch.bones[n])})),rngIndex,charge:engine.rule.state.charge.value,recovery:engine.rule.state.charge.recovery||0,jumpSerial:a.s3JumpSerial||0};traces.push(row);
  if(onFrame)await onFrame({row,a,ch,mesh,scenario,roles:AIR_CAPTURE_FRAMES[scenario][frame]||null});
 }};
 try{
  await ch._sourceMotionLoader;await ch.sourceMotion?.ready;check(ch.sourceMotion?.status==='ready','Player00 source ready');
  await tick(60);engine.rule.state.barrier.active=false;stage='pickup';await tick(12);check(engine.rule.state.carrier==='carrier','normal rule pickup');
  for(cycle=0;cycle<3;cycle++){
   stage='carry';await tick(scenario==='charge-jump'?62:12,scenario==='charge-jump');
   stage='jump';await tick(8,scenario==='charge-jump',true);stage='air-and-land';await tick(72);
   check(a.s3JumpSerial>=cycle+1&&a.grounded,'actual jump and landing admitted');
  }
  const airborne=traces.filter(r=>r.source==='air'),bad=airborne.filter(r=>r.grip>=.001),worst=airborne.reduce((a,b)=>!a||b.grip>a.grip?b:a,null),maxTranslation=Math.max(...airborne.map(r=>r.translationWorld));
  return {scenario,frames:frame,cycles:3,airFrames:airborne.length,airFramesPerJump:[0,1,2].map(c=>airborne.filter(r=>r.cycle===c).length),badFrames:bad.length,badCycles:[...new Set(bad.map(r=>r.cycle))],firstBad:bad[0]||null,worst,maxTranslation,sourceOwner:{status:ch.sourceMotion.status,active:ch.sourceMotion.active,variant:ch.sourceMotion.variant,bankSha256:ch.sourceMotion.bank.meta.sha256,seed:ch.seed},events:events.filter(e=>['rainmaker-pickup','rainmaker-shot'].includes(e.kind)),traces};
 }finally{display.release();G.scene.remove(mesh,ch.root);mesh.geometry.dispose();mesh.material.dispose();m.rankedEffects.dispose?.();ch.dispose();G.actors=[];G.projectiles.clear();}
}
export function verifyAirScenario(result,{corrected=true}={}){
 check(result.airFrames===84&&result.airFramesPerJump.every(n=>n===28),'28 airborne frames per actual jump, 3 jumps, total84');
 check(result.sourceOwner.status==='ready'&&result.sourceOwner.active&&result.sourceOwner.variant==='Player00','real active source owner');
 check(/^[a-f0-9]{64}$/.test(result.sourceOwner.bankSha256),'source bank digest');
 check(result.events.filter(e=>e.kind==='rainmaker-pickup').length===1,'one actual pickup');
 for(const row of result.traces){check(row.clamArmActive===false,'Historical Clam helper must stay inactive in Rainmaker mode');check(row.poses===1&&row.solves===1,'one pose and support solve per holder frame');check(Number.isFinite(row.grip)&&Number.isFinite(row.translationWorld),'finite world measurements');check(row.angle<=.2+1e-7,'rotation cap retained');check(row.translationWorld<=.03+1e-10,'world translation cap retained');}
 if(corrected)check(result.badFrames===0&&result.worst.grip<.001,'all84 actual air frames keep world grip < .001: '+result.worst.grip);
 return true;
}
export async function run({prefix,baselinePrefix}){
 const rows=[],metrics=[],comparisons=[],before=new Map(),random=Math.random,progress=globalThis.__objectQA={suite:'rainmaker-air',stage:'init'};Math.random=()=>.5;
 try{for(const[revision,path]of[['before',baselinePrefix],['after',prefix]]){
  const ctx=await productionScene(path),{api,G,THREE,camera,capture}=ctx;
  const [{Level},{Match},{RankedEngine},{createRankedEffects},{createRainmakerModel,createRainmakerPresentation}]=await Promise.all([import(path+'src/world/level.js'),import(path+'src/game/match.js'),import(path+'patches/splatoon3/runtime/ranked/engine.mjs'),import(path+'patches/splatoon3/runtime/ranked/combat.mjs'),import(path+'patches/splatoon3/runtime/ranked/rainmaker-model.mjs')]);
  const live={...api,Match,RankedEngine,createRankedEffects,createRainmakerModel,createRainmakerPresentation};
  G.teamColors=[new THREE.Color('#ff8a14'),new THREE.Color('#2f5bff')];
  G.level=new Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});G.physics=new api.Physics(G.level);G.paint={sample:()=>1,splat:()=>0};G.projectiles=new api.Projectiles(G.scene);
  try{for(const scenario of ['carry-jump','charge-jump']){
   const result=await runAirScenario({api:live,scenario,onFrame:async({row,ch,mesh,roles})=>{
    if(!roles)return;
    // Fixed floor-relative cameras across both timelines, including landing.
    const target=new THREE.Vector3(0,1.05,.24);
    for(const[view,offset]of[['rear',[1.4,.75,-2.6]],['side',[2.8,.3,.15]]]){
     camera.position.copy(target).add(new THREE.Vector3(...offset).normalize().multiplyScalar(4.1));camera.lookAt(target);
     const name=revision+'-'+scenario+'-frame-'+row.frame+'-'+view;progress.stage=name;
     const image=await capture(name),footBones=Object.fromEntries(['footL','footR'].map(n=>[n,ch.bones[n].getWorldPosition(new THREE.Vector3()).toArray()]));
     rows.push({...image,revision,scenario,frame:row.frame,roles,simulationSeconds:row.frame/60,measurement:row,sourceOwner:{status:ch.sourceMotion.status,active:ch.sourceMotion.active,sourceUpper:ch.sourceMotion.sourceUpper??null,seed:ch.seed,footBones,variant:ch.sourceMotion.variant,bankSha256:ch.sourceMotion.bank.meta.sha256},modelGeometry:{triangles:mesh.geometry.index.count/3,vertices:mesh.geometry.attributes.position.count}});
    }
   }});verifyAirScenario(result,{corrected:revision==='after'});metrics.push({revision,...result});
   if(revision==='before'){before.set(scenario,result);check(result.badFrames>0,'381319 negative must reproduce actual grip failure');}
   else{const old=before.get(scenario);check(old.traces.length===result.traces.length,'same actual input denominator');let compared=0;
    for(let i=0;i<result.traces.length;i++){const keys=['frame','cycle','stage','source','grounded','pos','vel','form','kidScale','visible','poses','solves','root','kid','model','P','springs','muzzle','rngIndex','charge','recovery','jumpSerial','clamArmActive'];for(const key of keys)check(JSON.stringify(result.traces[i][key])===JSON.stringify(old.traces[i][key]),'gameplay/right-owner parity '+scenario+'/'+i+'/'+key);compared++;}
    check(JSON.stringify(result.events)===JSON.stringify(old.events),'authoritative events exact');comparisons.push({scenario,frames:compared,gameplayRootSourceRightMuzzleExact:true,beforeBad:old.badFrames,afterBad:result.badFrames});
   }
  }}finally{G.projectiles.clear();ctx.dispose();}
 }return{status:'passed',expectedFrames:20,rows,metrics,comparisons,scope:'Actual Actor.update -> advanceRanked with flat real Physics and normal pickup/jump inputs. Source Dualies/team0; carry and charge each3 jumps x28 air frames =84,168 total per revision. Before overlays381319 handoff and its contemporaneous bomb helper dependency; mode is fixed to Rainmaker and the historical Clam arm branch stays inactive. This is not full old main. Shoulder/landing visual acceptance remains a separate human review.'};
 }finally{Math.random=random;}
}
