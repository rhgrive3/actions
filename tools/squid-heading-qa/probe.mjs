import {measureSkinnedHeading} from './axes.mjs';
// A local diagnostic scene. Character geometry/materials and source clips stay native.
// Inputs go through PlayerController -> Actor.update -> real Level/Physics.
const KEYS=['actors','level','physics','paint','match','rig','projectiles','time','camera','mode','settings','teamColors'];
const input=()=>({keys:new Set(),pressed:new Set(),padPressed:new Set(),mouse:{dx:0,dy:0,left:false,right:false},down(k){return this.keys.has(k);},wasPressed(k){return this.pressed.has(k);},padButton:()=>false,padValue:()=>0});
export async function collectHeadingFrames(api,onFrame){
 const {G,THREE,Actor,Character,Level,Physics,Projectiles,PlayerController}=api;
 const saved=Object.fromEntries(KEYS.map(k=>[k,G[k]])),random=Math.random,owned=[],rows=[],sceneChildren=new Set(G.scene.children);
 try{
  Math.random=()=>.4;G.mode='match';G.settings={quality:'high',shadows:false};G.teamColors=[new THREE.Color(0xe6e900),new THREE.Color(0x6340db)];G.time=0;
  G.level=new Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});
  G.physics=new Physics(G.level);G.paint={sample:()=>0,splat:()=>0};G.match={playing:()=>true,canRespawn:()=>false};G.projectiles=new Projectiles(G.scene);G.actors=[];
  for(const surface of [0,1]){
   G.time=0;G.paint.sample=()=>surface;
   const a=new Actor({team:0,isLocal:true,name:'squid-heading-fixed-input',weapon:'shooter',CharacterClass:Character,style:{hair:0,hat:0,skin:2,outfit:0,eyes:0}}),c=a.character;
   owned.push(a);a.nid=901+surface;c.actor=a;c.onEvent=null;c.setLod('hero');G.scene.add(c.root);G.actors=[a];
   a.pos.set(0,0,0);a.grounded=a.ground.hit=true;a.ground.block=0;a.groundN.set(0,1,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,1,20);
   await c._sourceMotionLoader;await c.sourceMotion?.ready;if(c.sourceMotion?.status!=='ready')throw Error('heading source bank not ready');
   const raw=input(),rig={yaw:0,pitch:0,mode:'follow',target:a,gameCam:G.camera||new THREE.PerspectiveCamera(25,1,.01,5000)};G.rig=rig;const controller=new PlayerController(a,rig,raw);
   const tick=()=>{controller.update(1/60);G.time+=1/60;a.update(1/60);c.root.updateMatrixWorld(true);c.skeleton.update();};
   for(let i=0;i<60;i++)tick();raw.keys=new Set(['ShiftLeft','KeyA']);
   const capture=async(name,frame)=>{
    const r=c.sourceMotion.squidRig,wp=n=>r.bones[r.index[n]].getWorldPosition(new THREE.Vector3()),mantle=wp('Sqd_head2').sub(wp('Sqd_head0')).normalize(),width=wp('Sqd_eye_R').sub(wp('Sqd_eye_L')).normalize();
    const row={name,surface,simulationFrame:frame,time:G.time,form:c.form,grounded:a.grounded,groundNormal:a.groundN.toArray(),position:a.pos.toArray(),velocity:a.vel.toArray(),rootYaw:a.yaw,rootQuaternion:c.root.quaternion.toArray(),modelQuaternion:c.model.quaternion.toArray(),pivotQuaternion:c.squid.pivot.quaternion.toArray(),mantle:mantle.toArray(),width:width.toArray(),heading:Math.atan2(mantle.x,mantle.z),pitch:Math.asin(mantle.y),roll:Math.asin(width.y),sourceStatus:c.sourceMotion.status,sourceActive:c.sourceMotion.active,sourceClip:{...c.sourceMotion.debug.squid},formTime:c.sourceMotion.formTime,inputKeys:[...raw.keys],skinned:measureSkinnedHeading(THREE,c)};
    if(!row.grounded||row.groundNormal.some((x,i)=>Math.abs(x-[0,1,0][i])>1e-10))throw Error('heading fixture left its flat ground');
    if(![...row.mantle,...row.width,row.heading,row.pitch,row.roll,...row.skinned.mantle,...row.skinned.width,row.skinned.heading,row.skinned.pitch,row.skinned.roll].every(Number.isFinite))throw Error('non-finite heading pose');
    rows.push(row);await onFrame?.({actor:a,row});
   };
   for(let i=1;i<=60;i++){tick();if(i===12)await capture(surface?'swim-right-12':'dry-right-12',i);if(i===60&&surface)await capture('swim-right-60',i);}
   if(surface){raw.keys=new Set(['ShiftLeft']);for(let i=0;i<120;i++)tick();await capture('swim-stop-120',180);}
   G.scene.remove(c.root);c.dispose();owned.splice(owned.indexOf(a),1);
  }
  return {scope:'actual normal input/Actor/Physics; flat diagnostic scene, not a live match or Nintendo timing measurement',seed:.4,tickSeconds:1/60,sourceBankAwaited:true,rows};
 }finally{
  for(const a of owned){G.scene.remove(a.character.root);a.character.dispose();}G.projectiles?.clear?.();for(const o of [...G.scene.children])if(!sceneChildren.has(o)){G.scene.remove(o);o.traverse(n=>{n.geometry?.dispose?.();for(const m of Array.isArray(n.material)?n.material:[n.material])m?.dispose?.();});}for(const k of KEYS)G[k]=saved[k];Math.random=random;
 }
}
