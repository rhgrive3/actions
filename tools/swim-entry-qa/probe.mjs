import {measureSkinnedHeading} from './axes.mjs';
// Normalized mobile stick -> actual PlayerController -> Actor/Physics.
// The only forced state is a one-tick presentation eligibility cancellation.
const KEYS=['actors','level','physics','paint','match','rig','projectiles','time','camera','mode','settings','teamColors'];
export const FRAME_NAMES=['first-entry-28','first-follow-29','reentry-72','reentry-follow-73'];
const angle=x=>Math.atan2(Math.sin(x),Math.cos(x));
const arr=v=>v?.toArray?Array.from(v.toArray()):v?.elements?Array.from(v.elements):v&&ArrayBuffer.isView(v)?Array.from(v):null;
export async function collectSwimEntryFrames(api,onFrame){
 const {G,THREE,Actor,Character,Level,Physics,Projectiles,PlayerController,swimMotionSnapshot}=api;
 const saved=Object.fromEntries(KEYS.map(k=>[k,G[k]])),random=Math.random,children=new Set(G.scene.children),rows=[],trace=[];let a,seed=913,randomCalls=0;
 const randomValues=[];
 try{
  Math.random=()=>{randomCalls++;seed=Math.imul(seed,1664525)+1013904223>>>0;randomValues.push(seed);return seed/2**32;};
  G.mode='match';G.settings={quality:'high',shadows:false,aimAssist:0};G.teamColors=[new THREE.Color(0xe6e900),new THREE.Color(0x6340db)];G.time=0;
  G.level=new Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});
  G.physics=new Physics(G.level);G.paint={sample:()=>1,splat:()=>0};G.match={playing:()=>true,canRespawn:()=>false};G.projectiles=new Projectiles(G.scene);G.actors=[];
  a=new Actor({team:0,isLocal:true,name:'swim-owner-entry',weapon:'shooter',CharacterClass:Character,style:{hair:0,hat:0,skin:2,outfit:0,eyes:0}});const c=a.character;
  a.nid=901;c.actor=a;c.setLod('hero');G.scene.add(c.root);G.actors=[a];a.pos.set(0,0,0);a.grounded=a.ground.hit=true;a.ground.block=0;a.groundN.set(0,1,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,1,20);
  await c._sourceMotionLoader;await c.sourceMotion?.ready;if(c.sourceMotion?.status!=='ready')throw Error('swim source bank not ready');
  let dive=false;const mobile={active:true,root:{},moveX:0,moveY:0,lookDX:0,lookDY:0,pressed:new Set(),wasPressed:()=>false,gyro:{enabled:false,discard(){}},down:k=>k==='squid'&&dive};
  const raw={keys:new Set(),pressed:new Set(),padPressed:new Set(),mouse:{dx:0,dy:0,left:false,right:false},mobile,lastDevice:'touch',down:()=>false,wasPressed:()=>false,padButton:()=>false,padValue:()=>0};
  const rig={yaw:0,pitch:0,mode:'follow',target:a,gameCam:G.camera||new THREE.PerspectiveCamera(25,1,.01,5000)};G.rig=rig;const controller=new PlayerController(a,rig,raw);
  const tick=()=>{controller.update(1/60);G.time+=1/60;a.update(1/60);c.root.updateMatrixWorld(true);c.skeleton.update();};
  for(let i=0;i<60;i++)tick();dive=true;mobile.moveX=-.02;let priorHeading=null;
  for(let frame=1;frame<=73;frame++){
   if(frame===71)c.s3SwimMotionEnabled=false;if(frame===72)c.s3SwimMotionEnabled=true;tick();
   const s=c.sourceMotion,r=s.squidRig,snap=swimMotionSnapshot(c),skinned=measureSkinnedHeading(THREE,c),wp=n=>r.bones[r.index[n]].getWorldPosition(new THREE.Vector3()),mantle=wp('Sqd_head2').sub(wp('Sqd_head0')).normalize();
   const canonical={frame,time:G.time,position:arr(a.pos),velocity:arr(a.vel),rootYaw:a.yaw,rootPosition:arr(c.root.position),rootQuaternion:arr(c.root.quaternion),modelQuaternion:arr(c.model.quaternion),grounded:a.grounded,groundNormal:arr(a.groundN),form:c.form,formT:c.formT,kidScale:c.kidScale,squidScale:c.sqScale,hp:a.hp,ink:a.ink,inputMove:arr(a.intent.move),sourceActive:s.active,sourceClip:{...s.debug.squid},sourceTime:s.time,sourceFormTime:s.formTime,sourceHeading:s.squidYaw,sourceBoneMatrices:r.bones.map(b=>arr(b.matrix)),renderedPose:s.renderedPose.map(b=>[arr(b.p),arr(b.q),arr(b.s)]),sourcePose:Object.fromEntries(Object.entries(s.squidPose).filter(([k])=>['p','q','s','world','wp'].includes(k)).map(([k,v])=>[k,Array.isArray(v)?v.map(arr):arr(v)]))};
   trace.push(canonical);
   if(!canonical.grounded||canonical.groundNormal.some((v,i)=>v!==[0,1,0][i]))throw Error('fixture left its flat ground');
   if(![...skinned.mantle,...skinned.width,skinned.pitch,skinned.roll].every(Number.isFinite))throw Error('non-finite drawn mantle');
   if([28,29,72,73].includes(frame)){
    const row={name:FRAME_NAMES[rows.length],simulationFrame:frame,active:snap.active,age:snap.age,swimYaw:snap.yaw,sourceStatus:s.status,sourceActive:s.active,input:{kind:'normalized-mobile-stick',moveX:mobile.moveX,moveY:mobile.moveY,squid:dive},position:canonical.position,velocity:canonical.velocity,form:c.form,formT:c.formT,mantle:arr(mantle),heading:Math.atan2(mantle.x,mantle.z),pivotQuaternion:arr(c.squid.pivot.quaternion),skinned,previousSkinnedHeading:priorHeading,headingStep:priorHeading===null?null:angle(skinned.heading-priorHeading)};
    rows.push(row);await onFrame?.({actor:a,row});
   }
   priorHeading=skinned.heading;
  }
  const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
  return {scope:'actual mobile-stick/PlayerController/Actor/Physics; one eligibility cancellation; CPU source matrices and skinned landmarks',seed:913,tickSeconds:1/60,sourceBankAwaited:true,rows,simulationTicks:73,canonicalTraceHash:await digest(trace),randomCalls,randomValuesHash:await digest(randomValues)};
 }finally{
  if(a){G.scene.remove(a.character.root);a.character.dispose();}G.projectiles?.clear?.();for(const o of [...G.scene.children])if(!children.has(o)){G.scene.remove(o);o.traverse(n=>{n.geometry?.dispose?.();for(const m of Array.isArray(n.material)?n.material:[n.material])m?.dispose?.();});}for(const k of KEYS)G[k]=saved[k];Math.random=random;
 }
}
