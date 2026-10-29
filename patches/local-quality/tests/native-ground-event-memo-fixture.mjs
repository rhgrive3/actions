import fs from 'node:fs';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
import {buildSourceBVH} from '../../native-stages/runtime/source-convert.mjs';

const before="    this.character.onEvent = (name, data) => emit('actor:' + name, { actor: this, surface: this.groundTeam, ...(data || {}) });";
const after=`    const characterEventOwner = this.character;
    this.character.onEvent = (name, data) => {
      const groundMemoLease = characterEventOwner._oobPauseGroundMemo?.();
      try { return emit('actor:' + name, { actor: this, surface: this.groundTeam, ...(data || {}) }); }
      finally { characterEventOwner._oobResumeGroundMemo?.(groundMemoLease); }
    };`;
const apis=new Map();
async function api(oldPolicy){
 if(oldPolicy)assert.equal(!!process.env.INKWAVE_BUILT_SITE,false,'counterfactual is source-only');
 if(!apis.has(oldPolicy))apis.set(oldPolicy,(async()=>{
  const moduleTransform=(rel,code)=>{
   if(rel!=='src/game/actor.js')return code;
   assert.equal(code.split(after).length,2,'exact old-policy Actor event boundary');return code.replace(after,before);
  };
  const f=await sourceLoadedActorFixture({random:()=>.4,moduleTransform:oldPolicy?moduleTransform:null,
   extraExports:"export {installQuality}from './patches/local-quality/install.mjs';export {NativeLevel,NativePhysics}from './patches/native-stages/runtime/engine.mjs';"});
  f.installQuality(JSON.parse(fs.readFileSync(new URL('../../splatoon3/profile.json',import.meta.url))));return f;
 })());
 return apis.get(oldPolicy);
}
function world(f){
 const triangles=new Float32Array([-20,0,-20,-20,0,20,20,0,-20,20,0,-20,-20,0,20,20,0,20]);
 const level=new f.NativeLevel({triangles,...buildSourceBVH(triangles),normals:new Float32Array([0,1,0,0,1,0]),flags:new Uint32Array([3,3]),objectIds:new Uint32Array([0,0]),triangleFace:new Int32Array([0,0]),mask:new Uint8Array(),
  manifest:{id:'native-event-memo',bounds:{minX:-20,maxX:20,minZ:-20,maxZ:20},spawnPads:[[-15,0,-15],[15,0,15]],spawnBarrier:0,objects:[{collidable:true,bounds:[[-20,-.2,-20],[20,0,20]]}],faces:[{n:[0,1,0],u:[1,0,0],v:[0,0,1],origin:[-20,0,-20],su:40,sv:40,triangles:[0,1],bounds:[[-20,0,-20],[20,0,20]]}]}});
 level._addBlock({kind:'box',min:[-10,-.2,-10],max:[10,0,10],paint:false,hidden:true});return{level,physics:new f.NativePhysics(level)};
}
export async function nativeEventMemoProbe({oldPolicy=false,hz=60,throws=false}={}){
 const f=await api(oldPolicy),{G,THREE}=f,dt=1/hz;
 G.time=0;G.match={state:'playing',opts:{},local:null,playing:()=>true};G.renderer={info:{render:{frame:100}},getRenderTarget:()=>null};
 const states=[];let frame=-2*hz;const expectedError=new Error('native actor event failure');
 for(let side=0;side<2;side++){
  const w=world(f);G.level=w.level;G.physics=w.physics;const a=await f.make(),ch=a.character;ch.phys=w.physics;a.vel.set(0,0,1.8);
  const ground=ch._ground;
  if(side===0)ch._ground=function(...args){const active=this._oobGroundMemoActive;this._oobGroundMemoActive=false;try{return ground.apply(this,args);}finally{this._oobGroundMemoActive=active;}};
  states.push({...w,a,ch,events:[],callback:[],nested:[],shifted:false,error:null});
 }
 const tick=s=>{G.level=s.level;G.physics=s.physics;s.a.pos.z+=1.8*dt;s.a._finishFrame(dt);s.ch.root.updateMatrixWorld(true);s.ch.skeleton.update();};
 for(;frame<0;frame++){G.time+=dt;G.renderer.info.render.frame++;for(const s of states)tick(s);}
 const baseline=states.map(s=>({queries:s.level.triangleWorld.queryCount,hits:s.ch._oobGroundMemoHits}));
 const offNested=f.on('actor:ground-memo-nested',event=>{const s=states.find(x=>x.a===event.actor);if(s){s.nested.push(s.ch._oobGroundMemoActive);s.ch._ground(0,0,new THREE.Vector3());}});
 const off=f.on('actor:footstep',event=>{
  const s=states.find(x=>x.a===event.actor);if(!s)return;s.events.push(frame);
  if(s.shifted)return;s.shifted=true;
  const first=s.ch._ground(event.pos.x,event.pos.z,new THREE.Vector3());
  s.level.blocks.at(-1).center.y+=.1;
  const second=s.ch._ground(event.pos.x,event.pos.z,new THREE.Vector3());
  s.callback.push({frame,first,second,active:s.ch._oobGroundMemoActive});
  s.ch.onEvent('ground-memo-nested',{});
  if(throws)throw expectedError;
 });
 const snapshot=s=>({authoritative:{position:s.a.pos.toArray(),velocity:s.a.vel.toArray(),hp:s.a.hp,ink:s.a.ink,alive:s.a.alive,weapon:s.a.weapon.id},
  contacts:s.ch.sourceMotion.retarget.contacts.map(x=>({anchor:x.anchor.toArray(),support:x.support.toArray(),normal:x.normal.toArray(),locked:x.locked})),
  bones:s.ch.boneList.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.matrixWorld.elements]),skin:Array.from(s.ch.skeleton.boneMatrices),muzzle:s.ch.getMuzzle(new THREE.Vector3()).toArray()});
 let firstContact=-1,firstPose=-1,firstMuzzle=-1,maxMuzzle=0,authoritativeEqual=true;
 try{
  for(;frame<hz;frame++){
   G.time+=dt;G.renderer.info.render.frame++;
   for(const s of states)try{tick(s);}catch(e){s.error=e;}
   if(throws&&states.some(s=>s.error))break;
   for(const s of states)assert.equal(s.error,null);
   const[a,b]=states.map(snapshot);
   authoritativeEqual&&=JSON.stringify(a.authoritative)===JSON.stringify(b.authoritative);
   if(firstContact<0&&JSON.stringify(a.contacts)!==JSON.stringify(b.contacts))firstContact=frame;
   if(firstPose<0&&(JSON.stringify(a.bones)!==JSON.stringify(b.bones)||JSON.stringify(a.skin)!==JSON.stringify(b.skin)))firstPose=frame;
   const d=Math.hypot(...a.muzzle.map((v,i)=>v-b.muzzle[i]));if(d>0&&firstMuzzle<0)firstMuzzle=frame;maxMuzzle=Math.max(maxMuzzle,d);
  }
  return{hz,oldPolicy,throws,firstContact,firstPose,firstMuzzle,maxMuzzle,authoritativeEqual,states:states.map((s,i)=>({events:s.events,callback:s.callback,nested:s.nested,
   queries:s.level.triangleWorld.queryCount-baseline[i].queries,memoHits:s.ch._oobGroundMemoHits-baseline[i].hits,
   expectedError:s.error===expectedError,active:s.ch._oobGroundMemoActive,retained:s.ch._oobGroundMemo?.length??0,poolRetainsPhysics:(s.ch._oobGroundMemoPool||[]).some(x=>x.phys)}))};
 }finally{off();offNested();f.reset();}
}
