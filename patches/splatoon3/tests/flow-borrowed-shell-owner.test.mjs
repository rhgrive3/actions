import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transformSync} from 'esbuild';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {compactModuleStrings} from '../../../scripts/lib/inkwave-source-compaction.mjs';
const file='patches/splatoon3/runtime/flow-motion.mjs';
const original=fs.readFileSync(new URL('../runtime/flow-motion.mjs',import.meta.url),'utf8');
// Exact behavioral counterfactual: restore the former non-skinned squid view,
// leaving native source loading, the production installer and other hooks intact.
const plain=code=>code.replace('const shell = source.isSkinnedMesh ? new THREE.SkinnedMesh(view, material) : new THREE.Mesh(view, material);',
  'const shell = new THREE.Mesh(view, material);').replace('if (source.isSkinnedMesh) { shell.bindMode = source.bindMode; shell.bind(source.skeleton, source.bindMatrix); }','');
const noDetach=code=>code.replace('geometry.index = null; geometry.attributes = {}; geometry.morphAttributes = {};','');
function transform(compiled=false,mutate=x=>x){return(rel,code)=>{if(rel!==file)return code;code=adaptBuildSource(file,mutate(code));return compiled?compactModuleStrings(transformSync(code,{loader:'js',format:'esm',minify:true,charset:'utf8',legalComments:'inline',sourcefile:file}).code).code:code;};}
const shellOf=ch=>ch.root.getObjectByName('s3-flow-squid-edge');
function assertOwner(ch,THREE){
 const source=ch.squid.body,shell=shellOf(ch);assert.ok(shell);assert.equal(!!shell.isSkinnedMesh,!!source.isSkinnedMesh,'borrowed view must use native mesh type');
 assert.equal(shell.skeleton,source.skeleton,'borrow existing skeleton, never clone it');assert.equal(shell.bindMode,source.bindMode);
 assert.deepEqual(Array.from(shell.bindMatrix.elements),Array.from(source.bindMatrix.elements));
 assert.deepEqual(Array.from(shell.bindMatrixInverse.elements),Array.from(source.bindMatrixInverse.elements));
 assert.equal(shell.parent,source.parent);assert.notEqual(shell.geometry,source.geometry);assert.notEqual(shell.geometry.drawRange,source.geometry.drawRange);
 assert.equal(shell.geometry.index,source.geometry.index);
 for(const [name,a]of Object.entries(source.geometry.attributes))assert.equal(shell.geometry.attributes[name],a);
 source.skeleton.update();const native=new THREE.Vector3(),view=new THREE.Vector3();
 for(let i=0;i<source.geometry.index.count;i+=Math.max(1,Math.floor(source.geometry.index.count/37))){const id=source.geometry.index.getX(i);source.getVertexPosition(id,native);shell.getVertexPosition(id,view);assert.equal(view.distanceTo(native),0,'actual native skinned indexed vertex');}
 return {source,shell};
}
async function rig(moduleTransform){
 const f=await sourceLoadedActorFixture({sourceOnly:true,moduleTransform});const a=await f.make(),victim=await f.make(1);a.setWeapon('dualies');a.character.setLod('game');victim.pos.set(8,0,8);
 a.addTurf(10000);victim.splat(a);f.tick(a);return {f,a,ch:a.character};
}
for(const compiled of [false,true])test(`${compiled?'compiled':'source'} Flow borrows the ready native owner and keeps swim hidden, dry squid drawable, and source bytes intact`,async()=>{
 const {f,a,ch}=await rig(transform(compiled));try{
  const snapshots=[];
  for(const form of ['swim','squid','kid']){
   for(let i=0;i<30;i++)ch.update(1/60,{...a.anim,form,grounded:true});ch.root.updateMatrixWorld(true);
   const {source,shell}=assertOwner(ch,f.THREE);
   assert.equal(source.visible,form!=='swim');assert.equal(shell.visible,form==='squid');
   const range={...source.geometry.drawRange};shell.onBeforeRender({}, {overrideMaterial:{}}, {},shell.geometry);assert.equal(shell.geometry.drawRange.count,0);shell.onBeforeRender({}, {overrideMaterial:null},{},shell.geometry);assert.deepEqual({...source.geometry.drawRange},range);
   snapshots.push({source,index:source.geometry.index,array:source.geometry.index.array.slice(),attributes:Object.entries(source.geometry.attributes).map(([key,v])=>[key,v,v.array.slice()])});
  }
  const {shell,source}=assertOwner(ch,f.THREE),sourceGeometry=source.geometry;let nativeDisposals=0,viewDisposals=0;
  sourceGeometry.addEventListener('dispose',()=>nativeDisposals++);
  shell.geometry.addEventListener('dispose',()=>{viewDisposals++;assert.equal(shell.geometry.index,null);assert.equal(Object.keys(shell.geometry.attributes).length,0);});
  const survivor=await f.make();survivor.setWeapon('dualies');survivor.character.setLod('game');f.tick(survivor);
  assert.equal(survivor.character.squid.body.geometry.index,sourceGeometry.index,'other native owner shares cached indexed buffers');
  ch.dispose();ch.dispose();assert.equal(viewDisposals,1);assert.equal(nativeDisposals,0);
  for(const s of snapshots){assert.equal(s.source.geometry.index,s.index);assert.deepEqual(s.index.array,s.array);for(const[k,v,bytes]of s.attributes){assert.equal(s.source.geometry.attributes[k],v);assert.deepEqual(v.array,bytes);}}
 }finally{f.reset();}
});
for(const compiled of [false,true])test(`${compiled?'compiled':'source'} counterfactual non-skinned Flow shell is rejected with real source ownership`,async()=>{
 assert.notEqual(plain(original),original);const {f,ch}=await rig(transform(compiled,plain));try{assert.throws(()=>assertOwner(ch,f.THREE),/native mesh type/);}finally{f.reset();}
});
test('a loading native owner becoming ready retires its old view, binds the actual new skeleton, and preserves borrowed buffers',async()=>{
 const f=await sourceLoadedActorFixture({sourceOnly:true,moduleTransform:transform()});const {Actor,Character,THREE,G}=f;
 // Await the victim first: avoid unrelated concurrent VM-module-link races.
 const victim=await f.make(1);victim.pos.set(8,0,8);
 const a=new Actor({team:0,CharacterClass:Character,weapon:'dualies'});a.character.actor=a;G.actors.push(a);G.scene.add(a.character.root);a.character.setLod('game');
 const ch=a.character;a.addTurf(10000);victim.splat(a);
 try{
  f.tick(a);const old=shellOf(ch);assert.ok(old);assert.equal(old.isSkinnedMesh,undefined);let disposed=0;const g=ch.squid.body.geometry;let nativeDisposed=0;g.addEventListener('dispose',()=>nativeDisposed++);
  old.geometry.addEventListener('dispose',()=>{disposed++;assert.equal(old.geometry.index,null);assert.equal(Object.keys(old.geometry.attributes).length,0);});
  await ch._sourceMotionLoader;await ch.sourceMotion.ready;assert.equal(ch.sourceMotion.status,'ready');f.tick(a);const current=assertOwner(ch,THREE);assert.notEqual(current.shell,old);assert.equal(old.parent,null);assert.equal(disposed,1);assert.equal(nativeDisposed,0);
  ch.setLod('far');f.tick(a);assertOwner(ch,THREE);assert.equal(nativeDisposed,0);
 }finally{f.reset();}
});
test('counterfactual detachment removal is rejected on owner disposal',async()=>{
 const {f,ch}=await rig(transform(false,noDetach));try{const view=shellOf(ch).geometry;let stillBorrowed=false;view.addEventListener('dispose',()=>stillBorrowed=view.index!==null||Object.keys(view.attributes).length>0);ch.dispose();assert.equal(stillBorrowed,true,'negative demonstrates disposal would still expose borrowed native attributes');}finally{f.reset();}
});
test('public Actor squid input distinguishes own-ink swim from drawable dry squid without native visibility writes',async()=>{
 const {f,a,ch}=await rig(transform());try{
  a.intent.squid=true;
  for(let i=0;i<30;i++)f.tick(a);
  assert.equal(a.form,'squid');assert.equal(a.anim.form,'swim');assert.equal(ch.form,'swim');assert.equal(ch.squid.body.visible,false);assert.equal(shellOf(ch).visible,false);
  // CPU fixture's paint occupancy is an input, not a geometry/visibility override.
  // The browser acceptance uses the real PaintSystem.clear() at this boundary.
  f.G.paint.sample=()=>0;
  for(let i=0;i<30;i++)f.tick(a);
  assert.equal(a.anim.form,'squid');assert.equal(ch.form,'squid');assert.equal(ch.squid.body.visible,true);assert.equal(shellOf(ch).visible,true);assertOwner(ch,f.THREE);
 }finally{f.reset();}
});
