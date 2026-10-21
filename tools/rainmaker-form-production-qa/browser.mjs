import {productionScene} from './shared/production-scene.mjs';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const OWNED=['spine','chest','neck','head','clavL','clavR','uArmL','uArmR','fArmL','fArmR','handL','handR'];
const trs=b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()];
const bank=b=>b?.map(x=>[...x.p.toArray(),...x.q.toArray(),...x.s.toArray()])??null;
const digest=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x)))),b=>b.toString(16).padStart(2,'0')).join('');
export const FORM_CAPTURE_PLAN=Object.freeze([
 {name:'shooter-lower',weapon:'shooter',pitch:-1.05,deliveryAt:null,frames:{3:['rear','side']}},
 {name:'dualies-upper',weapon:'dualies',pitch:1.15,deliveryAt:null,frames:{0:['side'],6:['rear','side'],9:['side']}},
 {name:'shooter-lower-event',weapon:'shooter',pitch:-1.05,deliveryAt:3,frames:{3:['side']}},
 {name:'dualies-upper-event',weapon:'dualies',pitch:1.15,deliveryAt:6,frames:{6:['side']}},
 {name:'dualies-upper-history-event',weapon:'dualies',pitch:1.15,deliveryAt:3,priorFullForm:true,frames:{3:['rear','side']}}
]);
// Same production input driver for source, emitted and native capture. No forced
// bone/source state. Only a host event's delivery is deferred in network cases.
export async function runFormScenario({api,weapon,pitch,deliveryAt=null,priorFullForm=false,onSetup=null,onFrame=null,onComplete=null}){
 const {G,THREE,Actor,Character,RankedEngine,Match,createRankedEffects,createRainmakerModel,createRainmakerPresentation}=api;
 const a=new Actor({team:0,isLocal:true,name:'rainmaker-form-fixed',weapon,CharacterClass:Character,style:{hair:0,hat:0,skin:2,outfit:0,eyes:0}}),ch=a.character;
 a.nid='carrier';a.slot=0;ch.actor=a;ch.onEvent=null;ch.setLod('hero');G.scene.add(ch.root);G.actors=[a];G.time=0;G.netm=null;
 a.grounded=a.ground.hit=true;a.ground.block=0;a.groundN.set(0,1,0);a.pos.set(0,0,0);a.vel.set(0,0,0);a.aimYaw=a.yaw=a.aimPitch=0;a.aimDir.set(0,0,1);a.aimPoint.set(0,1,20);delete a.s3.squidSpawn;
 const engine=new RankedEngine('rainmaker',{id:'rainmaker-form',rainmaker:{center:[0,0,0],goals:[[0,0,100],[0,0,-100]],checkpoints:[[],[]]}}),state=engine.rule.state,events=[];
 let queued=null,defer=deliveryAt!==null,delivering=false;const births=[],m=G.match={mode:'rainmaker',state:'playing',playing:()=>true,canRespawn:()=>false,ranked:engine,actors:[a],local:a,rankedBarrierHits:[],rankedGains:[0,0],rankedWorld:{zoneCoverage:()=>[],floorAt:()=>0,blocked:()=>false,update(){},presentEvent(){}},setState(s){this.state=s;}};
 m.playRankedEvents=function(batch,...args){const pass=[];for(const e of batch){events.push({...e});if(e.kind==='rainmaker-shot'&&defer){check(!queued,'one delayed legitimate event');queued=JSON.parse(JSON.stringify(e));}else pass.push(e);}return Match.prototype.playRankedEvents.call(this,pass,...args);};m.rankedEffects=createRankedEffects(api,m);
 const mesh=createRainmakerModel(THREE),display=createRainmakerPresentation(THREE,mesh);G.scene.add(mesh);
 const modelGeometry={triangles:mesh.geometry.index.count/3,vertices:mesh.geometry.attributes.position.count,sha256:await digest([Array.from(mesh.geometry.attributes.position.array),Array.from(mesh.geometry.index.array)])};
 const add=G.scene.add;G.scene.add=function(...objects){for(const o of objects)if(o.geometry?.parameters?.radius===.32)births.push({delivering,origin:o.position.toArray(),mesh:o});return add.apply(this,objects);};
 let frame=0,recording=false,poses=0,leftSolves=0,rightSolves=0,entry=null,captureCalls=0;const rows=[],apply=ch._applyPose,solve=ch._solveLimb;
 ch._applyPose=function(...args){poses++;return apply.apply(this,args);};ch._solveLimb=function(limb,...args){if(limb===this.limbs.armL)leftSolves++;if(limb===this.limbs.armR)rightSolves++;return solve.call(this,limb,...args);};
 // QA-only counters separate actual consumer work from receipt getters/rendering.
 let phase='consumer',processing=null;const fresh=()=>({getMuzzle:0,getMuzzleHand:0,updateWorldMatrixCalls:0,muzzleUpdateWorldMatrixCalls:0});
 const resetProcessing=()=>{processing={consumer:fresh(),measurement:fresh(),capture:fresh()};phase='consumer';};resetProcessing();
 const updateWorldMatrix=THREE.Object3D.prototype.updateWorldMatrix;
 THREE.Object3D.prototype.updateWorldMatrix=function(...args){const c=processing[phase];c.updateWorldMatrixCalls++;if(this===ch.weapon?.muzzle||this===ch.weapon?.left?.muzzle)c.muzzleUpdateWorldMatrixCalls++;return updateWorldMatrix.apply(this,args);};
 for(const method of ['getMuzzle','getMuzzleHand']){const raw=ch[method];ch[method]=function(...args){processing[phase][method]++;return raw.apply(this,args);};}
 const snapshot=()=>{const sm=ch.sourceMotion;return{bones:ch.boneList.map(b=>[b.name,trs(b)]),bank:[bank(sm.renderedPose),bank(sm.airPose),bank(sm.divePose),bank(sm.diveFrom)],pending:!!ch.s3RainmakerSupportPending};};
 const aim=value=>{a.aimPitch=value;a.aimDir.set(0,Math.sin(value),Math.cos(value));};
 const tick=()=>{resetProcessing();frame++;poses=leftSolves=rightSolves=0;G.time+=1/60;a.update(1/60);Match.prototype.advanceRanked.call(m,1/60);display.update(state.carrier?a:null,state.charge.value);G.scene.updateMatrixWorld(true);};
 try{
  await ch._sourceMotionLoader;await ch.sourceMotion?.ready;check(ch.sourceMotion?.status==='ready','real Player00 source ready');
  if(onSetup)await onSetup({a,ch,m,mesh});
  const capture=ch._captureRainmakerForm;if(capture)ch._captureRainmakerForm=function(sm){captureCalls++;return capture.call(this,sm);};
  const advance=ch.sourceMotion.advance;ch.sourceMotion.advance=function(...args){if(recording)entry=snapshot();return advance.apply(this,args);};
  for(let i=0;i<60;i++)tick();state.barrier.active=false;for(let i=0;i<12;i++)tick();check(state.carrier==='carrier','normal pickup');
  if(priorFullForm){a.intent.squid=true;for(let i=0;i<15;i++)tick();a.intent.squid=false;for(let i=0;i<15;i++)tick();}
  a.intent.fire=true;for(let i=0;i<60;i++)tick();a.intent.fire=false;
  if(deliveryAt===null){for(const p of [-1.05,0,1.15]){aim(p);a.intent.squid=true;for(let i=0;i<15;i++)tick();a.intent.squid=false;for(let i=0;i<15;i++)tick();}}
  aim(pitch);
  if(deliveryAt!==null){a.intent.fire=true;for(let i=0;i<2;i++)tick();check(state.charge.value===1,'real full charge');a.intent.fire=false;for(let i=0;!queued&&i<5;i++)tick();check(queued&&births.length===0,'hold real event for deferred transport');}
  a.intent.squid=true;for(let i=0;i<2;i++)tick();a.intent.squid=false;recording=true;
  for(let returnFrame=0;returnFrame<10;returnFrame++){
   tick();let delivered=null;
   if(returnFrame===deliveryAt){
    const nm={_disposed:false,match:m,_rankedAPI:api,cfg:{id:'rainmaker-form'},s:{hostId:'host'},isHost:false,rankedEventSeq:0},packet={k:'rkevent',match:nm.cfg.id,seq:1,events:[queued]};G.netm=nm;defer=false;delivering=true;
    api.NetMatch.prototype.onMessage.call(nm,'wrong-host',packet);check(births.length===0,'wrong host negative');api.NetMatch.prototype.onMessage.call(nm,'host',packet);check(births.length===1&&nm.rankedEventSeq===1,'real delayed shot admitted');api.NetMatch.prototype.onMessage.call(nm,'host',packet);check(births.length===1,'duplicate negative');
    delivered={event:queued,origin:births[0].origin,delaySeconds:G.time-queued.at,wrongHostRejected:true,duplicateRejected:true};G.netm=null;
   }
   phase='measurement';
   const sm=ch.sourceMotion,hand=ch.weapon.pivot.position.clone();hand.x=-hand.x;ch.bones.handL.localToWorld(hand);const target=mesh.localToWorld(new THREE.Vector3(0,0,.07)),visualMuzzle=mesh.localToWorld(new THREE.Vector3(...mesh.userData.rainmakerModel.muzzle));
   const row={frame,returnFrame,weapon,pitch,deliveryAt,source:{state:sm.state,active:sm.active,status:sm.status,formTime:sm.formTime,formDuration:sm.formDuration,formKid:sm.formKid,returnInterrupted:sm.returnInterrupted,bankSha256:sm.bank.meta.sha256,variant:sm.variant},kidScale:ch.kidScale,kidVisible:ch.kid.visible,opacity:ch.u.uOpacity.value,root:trs(ch.root),kid:trs(ch.kid),model:trs(mesh),pos:a.pos.toArray(),vel:a.vel.toArray(),aim:a.aimDir.toArray(),P:Array.from(ch.P),springs:Array.from(ch.sp),grip:hand.distanceTo(target),modelGeometry,visualMuzzle:visualMuzzle.toArray(),visualForward:mesh.getWorldDirection(new THREE.Vector3()).toArray(),owned12Sha:await digest(OWNED.map(n=>ch.bones[n].quaternion.toArray())),canonicalMuzzle:ch.getMuzzle(new THREE.Vector3()).toArray(),canonicalSecondary:ch.getMuzzleHand(new THREE.Vector3(),1).toArray(),poses,leftSolves,rightSolves,captureCalls,pending:!!ch.s3RainmakerFormPending,supportPending:!!ch.s3RainmakerSupportPending,clamArmActive:!!ch.s3ClamGripActive,beforeSourceSha:await digest(entry),sourceHistorySha:await digest(snapshot().bank),allBoneSha:await digest(ch.boneList.map(b=>[b.name,trs(b)])),non12Sha:await digest(ch.boneList.filter(b=>!OWNED.includes(b.name)).map(b=>[b.name,trs(b)])),positionScaleSha:await digest(ch.boneList.map(b=>[...b.position.toArray(),...b.scale.toArray()])),delivered,visualToOrigin:delivered?visualMuzzle.distanceTo(new THREE.Vector3(...delivered.origin)):null};
   row.processing={consumer:{...processing.consumer},measurement:{...processing.measurement},capture:null};phase='capture';
   rows.push(row);if(onFrame)await onFrame({row,a,ch,mesh});row.processing.capture={...processing.capture};
  }
  if(onComplete)await onComplete({a,ch,m,mesh,tick,rows});
  return{weapon,pitch,deliveryAt,priorFullForm,rows,births:births.map(b=>({delivering:b.delivering,origin:b.origin})),events:events.filter(e=>['rainmaker-pickup','rainmaker-shot'].includes(e.kind)),geometry:modelGeometry,scope:'Actual Actor.update and advanceRanked; current source input driver, no direct bone/source pose override'};
 }finally{THREE.Object3D.prototype.updateWorldMatrix=updateWorldMatrix;G.netm=null;G.scene.add=add;if(ch.s3RainmakerSupportPending)ch._restoreRainmakerSupport();display.release();G.scene.remove(mesh,ch.root);mesh.geometry.dispose();mesh.material.dispose();m.rankedEffects.dispose();ch.dispose();G.actors=[];G.projectiles.clear();}
}
export function verifyFormScenario(result,{corrected=true}={}){
 check(result.rows.length===10,'nine return frames plus first restored frame');
 for(const [i,r]of result.rows.entries()){
  check(r.returnFrame===i&&r.source.status==='ready'&&r.source.active===true,'ordered active source');check(r.poses===1,'one existing pose owner');check(r.clamArmActive===false,'Clam inactive');check(Number.isFinite(r.grip),'finite world grip');
  check(r.pending===(corrected&&i<9),'bounded nine-frame display transaction');check(r.leftSolves===(corrected&&i<9?2:1),'one extra left solve only on admitted frames');
  if(corrected)check(r.grip<.001,'world grip<.001 at return'+i+': '+r.grip);
 }
 if(result.deliveryAt!==null){check(result.births.length===1,'actual delayed shot');const row=result.rows[result.deliveryAt];check(row.delivered?.wrongHostRejected&&row.delivered?.duplicateRejected,'network negatives');check(row.source.formTime<row.source.formDuration,'shot admitted during return');}
 return true;
}
export async function run({prefix,baselinePrefix}){
 const rows=[],metrics=[],comparisons=[],before=new Map(),originalRandom=Math.random;let seed=1234,globalCalls=0,globalValues=[];
 const random=()=>{globalCalls++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;globalValues.push(seed);return seed/4294967296;};Math.random=random;
 try{for(const[revision,path]of[['before',baselinePrefix],['after',prefix]]){
  const ctx=await productionScene(path),{api,G,THREE,camera,capture}=ctx;
  const [{Level},{Match},{RankedEngine},{createRankedEffects},{createRainmakerModel,createRainmakerPresentation}]=await Promise.all([import(path+'src/world/level.js'),import(path+'src/game/match.js'),import(path+'patches/splatoon3/runtime/ranked/engine.mjs'),import(path+'patches/splatoon3/runtime/ranked/combat.mjs'),import(path+'patches/splatoon3/runtime/ranked/rainmaker-model.mjs')]);
  const live={...api,Match,RankedEngine,createRankedEffects,createRainmakerModel,createRainmakerPresentation};G.teamColors=[new THREE.Color('#ff8a14'),new THREE.Color('#2f5bff')];G.level=new Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});G.physics=new api.Physics(G.level);G.paint={sample:()=>1,splat:()=>0};G.projectiles=new api.Projectiles(G.scene);
  try{for(const plan of FORM_CAPTURE_PLAN){
   // Warm the same complete consumer path before resetting the measurement LCG.
   await runFormScenario({api:live,...plan});seed=1234;globalCalls=0;globalValues=[];
   const result=await runFormScenario({api:live,...plan,onFrame:async({row,ch,mesh})=>{
    row.globalCalls=globalCalls;
    for(const view of plan.frames[row.returnFrame]||[]){const target=new THREE.Vector3(0,1.05,.24),offset=view==='rear'?[1.4,.75,-2.6]:[2.8,.3,.15];camera.position.copy(target).add(new THREE.Vector3(...offset).normalize().multiplyScalar(4.1));camera.lookAt(target);const name=revision+'-'+plan.name+'-return-'+row.returnFrame+'-'+view;const image=await capture(name);rows.push({...image,revision,scenario:plan.name,returnFrame:row.returnFrame,measurement:row,modelGeometry:row.modelGeometry});}
   }});verifyFormScenario(result,{corrected:revision==='after'});const globalRng={calls:globalCalls,valuesSha256:await digest(globalValues)};metrics.push({revision,scenario:plan.name,...result,globalCalls,globalRng});
   if(revision==='before')before.set(plan.name,{result,globalRng});else{const prior=before.get(plan.name),old=prior.result;check(JSON.stringify(prior.globalRng)===JSON.stringify(globalRng),'same warmed native global RNG count/value column '+plan.name);const keys=['frame','returnFrame','weapon','pitch','deliveryAt','source','kidScale','kidVisible','opacity','root','kid','pos','vel','aim','P','springs','canonicalMuzzle','canonicalSecondary','poses','rightSolves','clamArmActive','beforeSourceSha','sourceHistorySha','non12Sha','positionScaleSha','delivered','globalCalls'];
    for(let i=0;i<10;i++){for(const key of keys)check(JSON.stringify(old.rows[i][key])===JSON.stringify(result.rows[i][key]),'canonical parity '+plan.name+'/'+i+'/'+key);if(i===9)check(old.rows[i].allBoneSha===result.rows[i].allBoneSha,'first restored frame exact');}
    comparisons.push({scenario:plan.name,frames:10,canonicalExact:true,globalRngExact:true,globalRng,oldMaxGrip:Math.max(...old.rows.map(r=>r.grip)),newMaxGrip:Math.max(...result.rows.map(r=>r.grip)),displayOriginDelta:plan.deliveryAt===null?null:result.rows[plan.deliveryAt].visualToOrigin-old.rows[plan.deliveryAt].visualToOrigin});
   }
  }}finally{G.projectiles.clear();ctx.dispose();}
 }return{status:'passed',expectedFrames:20,rows,metrics,comparisons,scope:'Separate interrupted-ToHuman12q comparison;20PNG/ten exact camera-light pairs. Existing Rainmaker actor-origin vs displayed-muzzle mismatch remains explicitly unresolved; numeric passes do not establish visual acceptance.'};
 }finally{Math.random=originalRandom;}
}
