import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
import {buildSourceBVH} from '../../native-stages/runtime/source-convert.mjs';

const current='function flatFootHeightAt(f, x, z) {\n  return null;\n}';
const old=`function flatFootHeightAt(f, x, z) {
  return f._iwFlatY !== null && f._iwFlatY !== undefined &&
    x >= f._iwFlatMinX && x <= f._iwFlatMaxX &&
    z >= f._iwFlatMinZ && z <= f._iwFlatMaxZ ? f._iwFlatY : null;
}`;
export async function nativeProbe({oldPolicy=false,hz=60}={}) {
 if(oldPolicy)assert.equal(!!process.env.INKWAVE_BUILT_SITE,false,'counterfactual is source-only');
 const moduleTransform=(rel,source)=>{
  if(!oldPolicy||rel!=='src/game/motion/retarget.js')return source;
  assert.equal(source.split(current).length,2,'exact counterfactual helper');return source.replace(current,old);
 };
 const f=await sourceLoadedActorFixture({moduleTransform:oldPolicy?moduleTransform:null,random:()=>.5,extraExports:"export {installQuality}from './patches/local-quality/install.mjs'; export {NativeLevel}from './patches/native-stages/runtime/native-level.mjs';export {NativePhysics}from './patches/native-stages/runtime/native-physics.mjs';"});
 f.installQuality(f.profile);const {G,THREE}=f;
 G.mode='match';G.match={state:'playing',attract:false,opts:{range:false},playing:()=>true};G.renderer={info:{render:{frame:100}},getRenderTarget:()=>null,getPixelRatio:()=>1,getSize:t=>{t.x=1280;t.y=720;return t;}};
 G.camera=new THREE.PerspectiveCamera(60,16/9,.15,6500);G.camera.position.set(0,1.5,8);G.camera.lookAt(0,1.5,100);G.camera.updateMatrixWorld(true);
 const triangles=new Float32Array([-10,0,-10,-10,0,10,10,0,-10,10,0,-10,-10,0,10,10,0,10]);
 const data={triangles,...buildSourceBVH(triangles),normals:new Float32Array([0,1,0,0,1,0]),flags:new Uint32Array([3,3]),objectIds:new Uint32Array([0,0]),triangleFace:new Int32Array([0,0]),mask:new Uint8Array(),manifest:{id:'845-certificate-floor',bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10},spawnPads:[[-9,0,-9],[9,0,9]],spawnBarrier:0,objects:[{collidable:true,bounds:[[-10,-.2,-10],[10,0,10]]}],faces:[{n:[0,1,0],u:[1,0,0],v:[0,0,1],origin:[-10,0,-10],su:20,sv:20,triangles:[0,1],bounds:[[-10,0,-10],[10,0,10]]}]}};
 G.level=new f.NativeLevel(data);G.physics=new f.NativePhysics(G.level);
 const a=await f.make();a.isLocal=false;a.isBot=true;a.character.isLocal=false;a.character.setLod(null);a.vel.set(0,0,2.4);const ch=a.character;
 for(let i=0;i<240;i++){G.renderer.info.render.frame++;G.time+=1/60;ch._camFrame=G.renderer.info.render.frame;a._finishFrame(1/60);}
 G.level._addBlock({kind:'box',min:[.157057,0,.040705],max:[.159057,.1,.042705],paint:false,hidden:true});
 const frameBase=G.renderer.info.render.frame+40;let ground=0,targetHits=0;const nativeGround=ch._ground;
 const normal=new THREE.Vector3(),groundAt=ch._ground(.15805709895280812,.04170500396920568,normal);
 ch._ground=function(...args){ground++;const y=nativeGround.apply(this,args);if(Math.abs(args[0]-.15805709895280812)<1e-10&&Math.abs(args[1]-.04170500396920568)<1e-10&&Math.abs(y-.1)<1e-9)targetHits++;return y;};
 const rows=[];
 for(let i=0;i<120;i++){
  G.time+=1/60;G.renderer.info.render.frame=frameBase+Math.floor(i*hz/60);a._finishFrame(1/60);
  rows.push({muzzle:ch.getMuzzle(new THREE.Vector3()).toArray(),position:a.pos.toArray(),vel:a.vel.toArray(),hp:a.hp,ink:a.ink,
   contacts:ch.sourceMotion.retarget.contacts.map(c=>({anchor:c.anchor.toArray(),support:c.support.toArray(),normal:c.normal.toArray(),locked:c.locked}))});
 }
 const budget=ch._oobBudgetTicks;f.reset();return {groundAt,normal:normal.toArray(),ground,targetHits,rows,budget};
}
