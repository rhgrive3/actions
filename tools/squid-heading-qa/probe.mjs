import {measureSkinnedHeading} from './axes.mjs';
import {observeExistingBank} from './bank-contract.mjs';
// A local diagnostic scene. Character geometry/materials and source clips stay native.
// Inputs go through PlayerController -> Actor.update -> real Level/Physics.
const KEYS=['actors','level','physics','paint','match','rig','projectiles','time','camera','mode','settings','teamColors'];
const input=()=>({keys:new Set(),pressed:new Set(),padPressed:new Set(),mouse:{dx:0,dy:0,left:false,right:false},down(k){return this.keys.has(k);},wasPressed(k){return this.pressed.has(k);},padButton:()=>false,padValue:()=>0});
const EMPTY_RANDOM_HASH='4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945';
const RANDOM_CHECKS={installed:1,sourceReady:2,beforeTick:360,afterTick:360,beforeCapture:4,afterCapture:4,complete:1};
// Explicit-style movement has no gameplay draws; production Three UUIDs use
// crypto. A zero stream still requires the observer at every native boundary.
export function verifyRandomObservation(result){
 const fail=message=>{throw Error('random observation: '+message);},o=result.randomObservation;
 if(!Number.isSafeInteger(result.randomCalls)||result.randomCalls<0)fail('invalid draw count');
 if(!/^[a-f0-9]{64}$/.test(result.randomValuesHash||''))fail('missing stream digest');
 if(!o||o.version!==1||o.algorithm!=='fixed-0.4'||o.value!==.4||result.seed!==.4)fail('missing fixed observer');
 if(Object.keys(o.checks||{}).length!==Object.keys(RANDOM_CHECKS).length)fail('missing observation boundaries');
 for(const [name,count]of Object.entries(RANDOM_CHECKS))if(o.checks[name]!==count)fail('incomplete '+name);
 if(result.simulationTicks!==360||result.tickSeconds!==1/60)fail('incomplete simulation');
 if(result.randomCalls===0&&result.randomValuesHash!==EMPTY_RANDOM_HASH)fail('empty stream mismatch');
 if(result.randomCalls>0&&result.randomValuesHash===EMPTY_RANDOM_HASH)fail('nonempty stream mismatch');
 return true;
}
export async function collectHeadingFrames(api,onFrame){
 const {G,THREE,Actor,Character,Level,Physics,Projectiles,PlayerController}=api;
 const saved=Object.fromEntries(KEYS.map(k=>[k,G[k]])),random=Math.random,owned=[],rows=[],sceneChildren=new Set(G.scene.children),trace=[],sourceHeadings=[],randomValues=[],bank=observeExistingBank(THREE,Character);
 const arr=v=>v?.toArray?Array.from(v.toArray()):v?.elements?Array.from(v.elements):null;
 const checks=Object.fromEntries(Object.keys(RANDOM_CHECKS).map(k=>[k,0])),observedRandom=()=>{randomValues.push(.4);return .4;};
 const checkRandom=where=>{if(Math.random!==observedRandom)throw Error('RNG instrumentation replaced at '+where);checks[where]++;};
 try{
  Math.random=observedRandom;checkRandom('installed');G.mode='match';G.settings={quality:'high',shadows:false};G.teamColors=[new THREE.Color(0xe6e900),new THREE.Color(0x6340db)];G.time=0;
  G.level=new Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});
  G.physics=new Physics(G.level);G.paint={sample:()=>0,splat:()=>0};G.match={playing:()=>true,canRespawn:()=>false};G.projectiles=new Projectiles(G.scene);G.actors=[];
  for(const surface of [0,1]){
   G.time=0;G.paint.sample=()=>surface;
   const a=new Actor({team:0,isLocal:true,name:'squid-heading-fixed-input',weapon:'shooter',CharacterClass:Character,style:{hair:0,hat:0,skin:2,outfit:0,eyes:0}}),c=a.character;
   owned.push(a);a.nid=901+surface;c.actor=a;c.onEvent=null;c.setLod('hero');G.scene.add(c.root);G.actors=[a];
   a.pos.set(0,0,0);a.grounded=a.ground.hit=true;a.ground.block=0;a.groundN.set(0,1,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,1,20);
   await c._sourceMotionLoader;await c.sourceMotion?.ready;if(c.sourceMotion?.status!=='ready')throw Error('heading source bank not ready');
   checkRandom('sourceReady');
   const raw=input(),rig={yaw:0,pitch:0,mode:'follow',target:a,gameCam:G.camera||new THREE.PerspectiveCamera(25,1,.01,5000)};G.rig=rig;const controller=new PlayerController(a,rig,raw);
   const tick=()=>{checkRandom('beforeTick');controller.update(1/60);G.time+=1/60;a.update(1/60);c.root.updateMatrixWorld(true);c.skeleton.update();checkRandom('afterTick');const sm=c.sourceMotion,r=sm.squidRig;
    trace.push({surface,time:G.time,position:arr(a.pos),velocity:arr(a.vel),rootYaw:a.yaw,rootPosition:arr(c.root.position),rootQuaternion:arr(c.root.quaternion),modelQuaternion:arr(c.model.quaternion),grounded:a.grounded,groundNormal:arr(a.groundN),form:c.form,formT:c.formT,kidScale:c.kidScale,squidScale:c.sqScale,hp:a.hp,ink:a.ink,inputMove:arr(a.intent.move),sourceActive:sm.active,sourceClip:{...sm.debug.squid},sourceTime:sm.time,sourceFormTime:sm.formTime,sourceBoneMatrices:r.bones.map(b=>arr(b.matrix)),renderedPose:sm.renderedPose.map(b=>[arr(b.p),arr(b.q),arr(b.s)]),sourcePose:Object.fromEntries(Object.entries(sm.squidPose||{}).filter(([k])=>['p','q','s','world','wp'].includes(k)).map(([k,v])=>[k,Array.isArray(v)?v.map(arr):arr(v)]))});sourceHeadings.push(sm.squidYaw);
   };
   for(let i=0;i<60;i++)tick();raw.keys=new Set(['ShiftLeft','KeyA']);
   const capture=async(name,frame)=>{
    const r=c.sourceMotion.squidRig,wp=n=>r.bones[r.index[n]].getWorldPosition(new THREE.Vector3()),mantle=wp('Sqd_head2').sub(wp('Sqd_head0')).normalize(),width=wp('Sqd_eye_R').sub(wp('Sqd_eye_L')).normalize();
    const row={name,surface,simulationFrame:frame,time:G.time,form:c.form,grounded:a.grounded,groundNormal:a.groundN.toArray(),position:a.pos.toArray(),velocity:a.vel.toArray(),rootYaw:a.yaw,rootQuaternion:c.root.quaternion.toArray(),modelQuaternion:c.model.quaternion.toArray(),pivotQuaternion:c.squid.pivot.quaternion.toArray(),mantle:mantle.toArray(),width:width.toArray(),heading:Math.atan2(mantle.x,mantle.z),pitch:Math.asin(mantle.y),roll:Math.asin(width.y),sourceStatus:c.sourceMotion.status,sourceActive:c.sourceMotion.active,sourceClip:{...c.sourceMotion.debug.squid},formTime:c.sourceMotion.formTime,inputKeys:[...raw.keys],skinned:measureSkinnedHeading(THREE,c)};
    if(!row.grounded||row.groundNormal.some((x,i)=>Math.abs(x-[0,1,0][i])>1e-10))throw Error('heading fixture left its flat ground');
    if(![...row.mantle,...row.width,row.heading,row.pitch,row.roll,...row.skinned.mantle,...row.skinned.width,row.skinned.heading,row.skinned.pitch,row.skinned.roll].every(Number.isFinite))throw Error('non-finite heading pose');
    row.bankPrediction=bank.capture(c,row.skinned);rows.push(row);checkRandom('beforeCapture');await onFrame?.({actor:a,row});checkRandom('afterCapture');
   };
   for(let i=1;i<=60;i++){tick();if(i===12)await capture(surface?'swim-right-12':'dry-right-12',i);if(i===60&&surface)await capture('swim-right-60',i);}
   if(surface){raw.keys=new Set(['ShiftLeft']);for(let i=0;i<120;i++)tick();await capture('swim-stop-120',180);}
   G.scene.remove(c.root);c.dispose();owned.splice(owned.indexOf(a),1);
  }
  checkRandom('complete');
  const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
  return {scope:'actual normal input/Actor/Physics; flat diagnostic scene, not a live match or Nintendo timing measurement',seed:.4,tickSeconds:1/60,sourceBankAwaited:true,rows,simulationTicks:trace.length,canonicalTraceHash:await digest(trace),sourceHeadingTraceHash:await digest(sourceHeadings),randomCalls:randomValues.length,randomValuesHash:await digest(randomValues),bankContract:bank.summary(),randomObservation:{version:1,algorithm:'fixed-0.4',value:.4,checks}};
 }finally{
  for(const a of owned){G.scene.remove(a.character.root);a.character.dispose();}G.projectiles?.clear?.();for(const o of [...G.scene.children])if(!sceneChildren.has(o)){G.scene.remove(o);o.traverse(n=>{n.geometry?.dispose?.();for(const m of Array.isArray(n.material)?n.material:[n.material])m?.dispose?.();});}for(const k of KEYS)G[k]=saved[k];Math.random=random;bank.restore();
 }
}
