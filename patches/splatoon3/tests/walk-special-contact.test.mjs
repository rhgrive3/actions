import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';

const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const SRC=path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE||path.join(ROOT,'inkwave-public'));
let cached;
async function production(){
 if(cached)return cached;
 const context=vm.createContext({console,performance,URL}),modules=new Map();
 const load=requested=>{
  let file=requested.startsWith(path.join(SRC,'patches')+path.sep)?path.join(ROOT,path.relative(SRC,requested)):requested;
  if(file.startsWith(path.join(ROOT,'src')+path.sep))file=path.join(SRC,path.relative(ROOT,file));
  if(modules.has(file))return modules.get(file);
  const source=fs.readFileSync(file,'utf8'),m=new vm.SourceTextModule(file.startsWith(SRC+path.sep)?adaptSource(path.relative(SRC,file),source):source,
   {context,identifier:file,initializeImportMeta(meta){meta.url=pathToFileURL(file).href;}});
  modules.set(file,m);return m;
 };
 const entry=new vm.SourceTextModule(`export {install} from './patches/splatoon3/runtime/install.mjs';
  export {walkActive} from './patches/splatoon3/runtime/walk.mjs';
  export {specialMotionSnapshot} from './patches/splatoon3/runtime/special-motion.mjs';
  export {formMotionSnapshot} from './patches/splatoon3/runtime/form-motion.mjs';
  export {jumpMotionSnapshot} from './patches/splatoon3/runtime/jump-motion.mjs';`,{context,identifier:path.join(ROOT,'walk-special-entry.mjs')});
 await entry.link((s,f)=>load(s==='three'?path.join(SRC,'vendor/three/build/three.module.js'):
  s.startsWith('three/addons/')?path.join(SRC,'vendor/three/jsm',s.slice(13)):path.resolve(path.dirname(f.identifier),s)));
 await entry.evaluate();
 const api={...entry.namespace.install(JSON.parse(fs.readFileSync(path.join(ROOT,'patches/splatoon3/profile.json')))),...entry.namespace};
 const {G,THREE}=api;
 G.scene=new THREE.Scene();G.teamColors=[new THREE.Color('#ff8a14'),new THREE.Color('#2f5bff')];
 G.paint={sample:()=>1,splat:()=>0};G.match={playing:()=>true,canRespawn:()=>false};G.actors=[];G.time=0;
 G.projectiles=Object.fromEntries(['fireShooter','fireDualies','fireCharger','fireSplatling','fireBlaster','fireSlosh','throwBomb','throwStorm','fireFlick'].map(n=>[n,()=>{}]));
 cached=api;return api;
}
function world(api,ceiling=false){
 const {G,THREE}=api,V=THREE.Vector3;
 const box=(id,y,h)=>{const center=new V(0,y,0),half=new V(100,h/2,100);return {id,solid:true,center,half,
  axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)],faces:[-1,-1,-1,-1,-1,-1],aabbMin:center.clone().sub(half),aabbMax:center.clone().add(half)};};
 const blocks=[box(0,-.1,.2)];if(ceiling)blocks.push(box(1,1.6,.2));
 G.level={blocks,faces:[],hasRails:false,groundHeight:()=>0,pointInside:()=>false,
  spawnPads:[new V(),new V(80,0,80)],spawnBarrier:1,
  queryBlocks:(_x,_z,_xx,_zz,out)=>{out.length=0;out.push(...blocks.map(b=>b.id));return out;}};
 G.physics=new api.Physics(G.level);
}
function rig(api,hz=60,kind='shooter'){
 const {G,THREE,Actor,Character}=api,a=new Actor({team:0,name:'walk special contact',weapon:kind,CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
 const ch=a.character;ch.actor=a;ch.onEvent=null;G.actors.push(a);G.scene.add(ch.root);a.grounded=a.ground.hit=true;
 const visual=()=>{G.time+=1/hz;a._finishFrame(1/hz);ch.root.updateMatrixWorld(true);ch.skeleton.update();};
 for(let i=0;i<hz*2;i++)visual();
 return {a,ch,visual,close(){G.actors=G.actors.filter(x=>x!==a);G.scene.remove(ch.root);ch.dispose();}};
}
function contact(api,ch,plantedOnly=false){
 const {THREE,CHARACTER_CHANNELS:C,CHARACTER_FOOT_METRICS:{ANKLE_H:h,BALL_Z:ball,HEEL_Z:heel}}=api;
 for(const key of ['WPL','WPR','TIPTOE'])assert.ok(Number.isInteger(C[key]),'actual named native foot channel '+key);
 for(const [i,f]of ch.feet.entries()){
  if(!f.planted&&plantedOnly)continue;
  assert.ok(f.planted,'idle return uses actual planted feet');
  const pitch=f.pitch+(!ch.moving&&i===(ch.shiftS>0?1:0)?.1*Math.abs(ch.shiftS||0)*(1-ch.gaitW):0)+.55*Math.max(0,ch.P[C.TIPTOE]),ay=h*Math.cos(pitch)+(pitch>=0?ball:-heel)*Math.sin(pitch);
  const az=pitch>=0?ball+h*Math.sin(pitch)-ball*Math.cos(pitch):-heel+h*Math.sin(pitch)+heel*Math.cos(pitch);
  const normal=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),f.cn)
   .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),f.cyaw));
  const expected=new THREE.Vector3(0,ay,az).applyQuaternion(normal).add(f.cw);
  const error=ch.bones[i===0?'footL':'footR'].getWorldPosition(new THREE.Vector3()).distanceTo(expected);
  assert.ok(error<.001,'drawn ankle follows its native heel/toe pivot: '+error);
  assert.ok(ch.ikErr[i+2]<1e-6,'native planted leg is reachable');
 }
 const mesh=ch.lodSets[ch.lod.tier].list.find(m=>m.isSkinnedMesh&&m.geometry.index);
 assert.ok(mesh?.geometry.index.count>0,'actual native indexed skin');
 assert.ok(mesh.getVertexPosition(mesh.geometry.index.getX(0),new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).toArray().every(Number.isFinite));
}
test('actual Slam recovery and cancellation release both native contact and walking before old visual timers',async()=>{
 const api=await production(),T=api.CHARACTER_TIMERS;
 for(const ceiling of [false,true])for(const hz of [30,60,120]){
  world(api,ceiling);const r=rig(api,hz);
  try{
   r.a._startSpecial();r.visual();assert.equal(api.walkActive(r.ch),false,'active Slam owns the pose');
   for(let i=0;r.a.specialActive&&i<hz*3;i++){r.a._updateSpecial(1/hz);r.visual();}
   assert.equal(r.a.specialActive,null,'native floor/ceiling Physics completes Slam');
   // Allow native contact blending to settle after the .42s presentation recovery.
   for(let i=0;i<Math.ceil(.75*hz);i++)r.visual();
   assert.equal(api.specialMotionSnapshot(r.ch)?.phase,null);
   assert.ok(r.ch.tr[T.T_SLAM]<1.4,'the obsolete timer is still active');
   assert.equal(api.walkActive(r.ch),true,'walking resumes when the mapped action releases its pose');
   contact(api,r.ch);
   r.a._startSpecial();r.visual();r.a.specialActive=null;r.a.grounded=true;r.a.pos.y=0;r.a.vel.set(0,0,0);
   for(let i=0;i<Math.ceil(.5*hz);i++)r.visual();
   assert.ok(r.ch.tr[T.T_LEAP]<1.9);assert.equal(api.walkActive(r.ch),true,'cancelled rise does not leave a timer-only contact lock');
   contact(api,r.ch);
   if(!ceiling&&hz===60){
    r.a.intent.jump=true;api.G.time+=1/hz;r.a.update(1/hz);r.ch.root.updateMatrixWorld(true);
    assert.equal(r.a.grounded,false,'fresh ordinary jump uses actual Actor input and Physics');
    assert.equal(api.walkActive(r.ch),false);assert.equal(api.jumpMotionSnapshot(r.ch)?.active,true,'fresh ordinary jump is admitted before the old special timer expires');
    r.a.intent.jump=false;let apex=r.a.pos.y;
    for(let i=0;i<hz*2;i++){api.G.time+=1/hz;r.a.update(1/hz);apex=Math.max(apex,r.a.pos.y);}
    r.ch.root.updateMatrixWorld(true);r.ch.skeleton.update();
    assert.ok(apex>.5);assert.equal(r.a.grounded,true);assert.equal(api.walkActive(r.ch),true);contact(api,r.ch);
   }
  }finally{r.close();}
 }
});
test('disabled and unmapped specials retain the native contact gate; Storm adds no gait restriction',async()=>{
 const api=await production();world(api);
 for(const mode of ['disabled','network','storm']){
  const r=rig(api,60,mode==='storm'?'charger':'shooter');
  try{
   r.a._startSpecial();
   if(mode==='disabled')r.ch.s3SpecialMotionEnabled=false;
   if(mode==='network')r.a.specialActive={id:'slam',net:true};
   if(mode!=='storm')r.a.grounded=true;
   r.visual();assert.equal(api.walkActive(r.ch),mode==='storm',mode);
   if(mode==='storm')contact(api,r.ch);
   else assert.ok(r.ch.plantW<.9,'native unplanting is still in force');
  }finally{r.close();}
 }
});

// Reproduces the independent GPU review with native acceleration and collision,
// including the actual rendered ankle instead of only the stored world contact.
test('native input turns and reversals keep actual planted shoes on their heel/toe contacts',async()=>{
 const api=await production();world(api);const r=rig(api);let contacts=0;
 try{
  for(let i=0;i<210;i++){
   const speed=i<25?.15:i<65?1.2:i<105?5.76:i<165?2.4:0;
   const [x,z]=i<70?[0,1]:i<90?[1,0]:i<105?[0,-1]:[0,1];
   const top=r.a.weaponRunner.moveSpeed();r.a.intent.move.set(x*speed/top,0,z*speed/top);
   r.a._horizontal(1/60,false,false);r.a._integrate(1/60,false,false);
   r.a.intent.fire=i>=105&&i<145;r.a.weaponRunner.update(1/60,{fire:r.a.intent.fire});r.visual();
   try{contact(api,r.ch,true);}catch(e){e.message+=' frame '+i;throw e;}
   contacts+=r.ch.feet.filter(f=>f.planted).length;
  }
  assert.ok(contacts>100,'real weight-bearing samples through slow input, turn, reversal, fire and release');
 }finally{r.close();}
});

test('completed managed Slam permits actual form emergence while its old special timer remains active',async()=>{
 const api=await production();world(api);const r=rig(api),T=api.CHARACTER_TIMERS;
 try{
  r.a._startSpecial();r.visual();
  for(let i=0;r.a.specialActive&&i<180;i++){r.a._updateSpecial(1/60);r.visual();}
  assert.equal(r.a.specialActive,null);
  for(let i=0;i<51;i++)r.visual();
  assert.equal(api.specialMotionSnapshot(r.ch)?.phase,null);
  assert.ok(r.ch.tr[T.T_SLAM]<1.4,'obsolete special timer is still active');
  r.a.form='squid';r.a.submerged=true;r.visual();r.visual();r.visual();
  r.a.form='kid';r.a.submerged=false;r.visual();
  const snap=api.formMotionSnapshot(r.ch);
  assert.equal(snap.phase,'emerge');
  assert.equal(snap.actionBlocked,false,'released mapped action cannot suppress the new form gesture');
  assert.ok(Array.from(r.ch.P).every(Number.isFinite));
  assert.ok(r.ch.root.position.distanceTo(r.a.pos)<1e-9,'presentation keeps actual gameplay root');
  const timers=Array.from(r.ch.tr);
  r.ch.s3SpecialMotionEnabled=false;r.ch._poseForm(r.ch.P);
  assert.equal(api.formMotionSnapshot(r.ch).actionBlocked,true,'disabled presentation preserves the native special timer gate');
  assert.deepEqual(Array.from(r.ch.tr),timers,'form admission never retimes native events');
 }finally{r.close();}
});
