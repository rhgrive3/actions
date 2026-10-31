import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
import {composed,declaration} from './queue-visual-world-20261031.helper.mjs';
const rng=()=>{let s=31;return()=>((s=Math.imul(s,1664525)+1013904223>>>0)/2**32);};
const leaf=(source,name,params,values)=>new Function(...params,'return ({'+declaration(source,'Character',name).source+'}).'+name)(...values);
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const geom=g=>Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,[a.itemSize,a.count,createHash('sha256').update(bytes(a.array)).digest('hex')]]));

test('attention prefilter preserves selected actor and RNG sequence including NaN with an outside axis',()=>{
 const old=composed('src/game/character.js',true),now=composed('src/game/character.js');const inputs=[0,-0,.4999999,.5,1,17.999999999999996,18,18.000000000000004,30,Infinity,-Infinity,NaN];
 for(const x of inputs)for(const z of inputs){const acts=[{id:1,alive:true,pos:{x,z},team:1},{id:2,alive:true,pos:{x:1,z:3},team:0}],out=[];
  for(const s of [old,now]){let calls=0;const f=leaf(s,'_pickLook',['G','driveRootYawCos'],[{actors:acts},()=>1]),o={root:{position:{x:0,z:0}},_driveYawSin:0,_owner:()=>({team:0}),rng:()=>{calls++;return .4;},lookActor:null};f.call(o);out.push([o.lookActor?.id,calls]);}assert.deepEqual(out[0],out[1],String(x)+','+String(z));
 }
});

test('IK raw-distance reuse matches Three normalize through zero, clamped and nonfinite cases',()=>{
 const methods=[true,false].map(before=>leaf(composed('src/game/character.js',before),'_solveLimb',['clamp','_sEnd','_sT','_sPole','_sP','_sQp','_pA','_pD','_pN','_pE','_pH','_sQa','_sQb','_by','_bz','_m1','_m2'],[(v,a,b)=>v<a?a:v>b?b:v,new THREE.Quaternion(),new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3(),new THREE.Quaternion(),new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3(),new THREE.Quaternion(),new THREE.Quaternion(),new THREE.Vector3(),new THREE.Vector3(),new THREE.Matrix4(),new THREE.Matrix4()]));
 const random=rng();for(let i=0;i<1000;i++){const xyz=i<7?[[0,0,0],[-0,-0,-0],[1e-15,0,0],[4,5,6],[NaN,1,2],[Infinity,1,0],[-Infinity,0,0]][i]:[random()*4-2,random()*4-2,random()*4-2];
  const out=methods.map(fn=>{const parent=new THREE.Bone(),up=new THREE.Bone(),lo=new THREE.Bone(),end=new THREE.Bone();parent.add(up);up.add(lo);lo.add(end);const L={up,lo,end,a:.4,b:.3,Mu0T:new THREE.Matrix4(),Mf0T:new THREE.Matrix4()},o={ikErr:[],_kidXform(_p,pos,q){pos.set(0,0,0);q.identity();}};fn.call(o,L,new THREE.Vector3(...xyz),new THREE.Vector3(0,0,1),i%2?new THREE.Quaternion():null,.7,0);return [...up.quaternion.toArray(),...lo.quaternion.toArray(),...end.quaternion.toArray(),...o.ikErr];});assert.deepEqual(out[0],out[1]);
 }
});

test('hair acceleration conservative square gate retains original clamp at the threshold and exceptional inputs',()=>{
 const a=(v)=>{if(v.length()>34)v.setLength(34);return v.toArray();};const b=(v)=>{const sq=v.lengthSq();if(!(sq<1156-1e-8)&&v.length()>34)v.setLength(34);return v.toArray();};const random=rng();
 for(let i=0;i<30000;i++){const x=i<10?[0,-0,34,34-1e-14,34+1e-14,NaN,Infinity,-Infinity,1e-200,1e200][i]:random()*100-50;const v=new THREE.Vector3(x,i<10?0:random()*100-50,i<10?0:random()*100-50);assert.deepEqual(a(v.clone()),b(v.clone()));}
});

const apiPromise=sourceLoadedActorFixture({sourceOnly:true,random:()=>.4,extraExports:"export {getKidShared,__nativeKidShared,__buildSquid} from './src/game/character-geo.js';",moduleTransform:(rel,s)=>rel==='src/game/character-geo.js'?s+'\nexport {nativeKidShared as __nativeKidShared,buildSquid as __buildSquid};':s});

test('all twelve squid LOD/quality variants follow their independent detail key without rebaking bodies',async()=>{
 const f=await apiPromise;const history=new Map(),bodies=new Map();
 for(const q of ['low','medium','high','ultra','high','low'])for(const lod of ['hero','game','far']){
  f.G.settings.quality=q;const sh=f.__nativeKidShared(lod),publicShared=f.getKidShared(lod),expected=f.__buildSquid(lod);assert.equal(sh.squid,expected,q+'/'+lod);assert.equal(publicShared.squid,expected);
  for(const part of ['body','dark','eyes'])assert.deepEqual(geom(sh.squid[part]),geom(expected[part]));
  const key=lod+'/'+q;if(history.has(key))assert.equal(sh,history.get(key),'stable variant object');else history.set(key,sh);
  const skin=sh.skin;if(bodies.has(skin))assert.equal(sh.cloth,bodies.get(skin));else bodies.set(skin,sh.cloth);
 }
 for(const lod of ['hero','game']){const l=history.get(lod+'/low'),h=history.get(lod+'/high');assert.notEqual(l.squid,h.squid);}
});

test('real source squid hidden eyes skip attribute versions and update once on the visible return',async()=>{
 const f=await apiPromise;f.G.settings.quality='high';const a=await f.make(),c=a.character,m=c.sourceMotion,r=m.squidRig;
 for(const local of [true,false])for(const grounded of [true,false])for(const form of ['squid','swim','climb']){
  c.isLocal=local;c.grounded=grounded;c.sqScale=1;m.active=true;
  const oldVersion=r.eyeGeometry.attributes.position.version;
  m.updateSquid(1/60,{form,wallNormal:{x:0,y:0,z:1}});
  const hidden=form==='climb'||form==='swim'&&(grounded||!local);
  assert.equal(r.eyeGeometry.attributes.position.version-oldVersion,hidden?0:1,[local,grounded,form].join('/'));
  m.updateSquid(1/60,{form:'squid'});const visibleVersion=r.eyeGeometry.attributes.position.version;assert.equal(visibleVersion-oldVersion,hidden?1:2);
  const pos=Buffer.from(bytes(r.eyeGeometry.attributes.position.array)),normal=Buffer.from(bytes(r.eyeGeometry.attributes.normal.array));r.deformEyes();assert.equal(Buffer.compare(pos,bytes(r.eyeGeometry.attributes.position.array)),0);assert.equal(Buffer.compare(normal,bytes(r.eyeGeometry.attributes.normal.array)),0);
 }
 // Direct rig callers retain the old default; only the production caller opts out.
 c.isLocal=true;c.grounded=true;const v=r.eyeGeometry.attributes.position.version;r.apply(m.squidPose,{form:'climb',wallNormal:{x:0,y:0,z:1}});assert.equal(r.eyeGeometry.attributes.position.version,v+1);
 f.reset();
});

test('climb matrix reuse matches the original API under transformed ancestors and arbitrary hierarchy fallback',async()=>{
 const f=await apiPromise;const a=await f.make(),c=a.character,r=c.sourceMotion.squidRig;
 const original=declaration(composed('src/game/motion/squid-rig.js',true),'SourceSquidRig','apply').source;const fn=new Function('return ({'+original+'}).apply')();
 const snapshot=()=>[...c.squid.pivot.position.toArray(),...c.squid.pivot.quaternion.toArray(),...r.bones.flatMap(b=>Array.from(b.matrixWorld.elements))];
 for(const fallback of [false,true])for(const hz of [30,60,120]){
  if(fallback&&c.model.parent===c.root){const intermediary=new f.THREE.Group();c.root.add(intermediary);intermediary.add(c.model);intermediary.position.set(.1,.2,.3);}
  c.root.position.set(3,-2,5);c.root.rotation.set(.2,.7,-.1);c.root.scale.set(1.3,.8,1.1);c.model.rotation.set(-.1,.2,.3);c.grounded=true;
  const options={form:'climb',wallNormal:{x:Math.sin(hz),y:.1,z:Math.cos(hz)},yaw:.1};fn.call(r,c.sourceMotion.squidPose,options);const old=snapshot();r.apply(c.sourceMotion.squidPose,options);assert.deepEqual(snapshot(),old);
 }
 f.reset();
});

test('pre-render matrix walk is necessary for synchronous skinning consumers',async()=>{
 const f=await apiPromise,a=await f.make(),c=a.character,r=c.sourceMotion.squidRig;const pose=c.sourceMotion.squidPose;
 r.apply(pose,{form:'squid'});const mesh=c.squid.body,v=new f.THREE.Vector3(),before=mesh.getVertexPosition(0,v).clone();
 const walk=r.root.updateWorldMatrix;r.root.updateWorldMatrix=()=>{};c.root.position.x+=3;r.apply(pose,{form:'squid'});const stale=mesh.getVertexPosition(0,new f.THREE.Vector3());r.root.updateWorldMatrix=walk;walk.call(r.root,true,true);const current=mesh.getVertexPosition(0,new f.THREE.Vector3());
 assert.notDeepEqual(stale.toArray(),current.toArray(),'deferred world matrices are visible to CPU skin queries before rendering');assert.deepEqual(stale.toArray(),before.toArray());f.reset();
});
