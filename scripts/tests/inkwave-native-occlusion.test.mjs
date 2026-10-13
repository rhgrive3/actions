import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as T from '../../inkwave-public/vendor/three/build/three.module.js';
import {inspectNativeProjectileOcclusion,persistOcclusionCaptureFailure} from '../lib/inkwave-projectile-visibility-probe.mjs';
const results=[];
for(const mode of ['success','capture-failure','camera-mutation','field-mutation','material-mutation','capture-plus-field-mutation']){
 const failure=mode!=='success';
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(60,1,.15,100);camera.position.set(0,2,-5);camera.lookAt(0,1,0);camera.updateMatrixWorld();
 const actor=new T.Group();actor.name='local-actor';scene.add(actor);const skin=new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial());actor.add(skin);
 const stage=new T.Group();stage.name='native-stage';scene.add(stage);stage.add(new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial()));
 const geometry=new T.BoxGeometry(.2,.2,.2),mat=new T.MeshBasicMaterial({color:0xff00ff}),mesh=new T.InstancedMesh(geometry,mat,1),fringe=new T.InstancedMesh(geometry,mat,1);mesh.name='ink';mesh.setMatrixAt(0,new T.Matrix4().makeTranslation(0,1,1));fringe.count=0;const ancestor=new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial());ancestor.name='projectile-mesh-ancestor';scene.add(ancestor);ancestor.add(mesh,fringe);scene.updateMatrixWorld(true);
 const blobs=new T.InstancedMesh(geometry,mat,1);blobs.count=0;scene.add(blobs);
 const round={pos:new T.Vector3(0,1,1),start:new T.Vector3(0,1,0),vel:new T.Vector3(0,0,100),age:1/60,damage:10,seed:.4,size:.3,vis:.088,delay:0,_inkVolumeRecipe:'shooter'};
 let rendered=0,captures=0;const gl={drawingBufferWidth:2,drawingBufferHeight:2,RGBA:1,UNSIGNED_BYTE:2,readPixels(x,y,w,h,f,t,out){out.fill(rendered);},getError(){return 0;}};
 const assets=new Map();assets.set('shooter',{patterns:[{frames:[[{mesh,fringe}]]}]});
 const G=globalThis.NG={scene,camera,local:{character:{root:actor}},projectiles:{blobs},fx:{inkVolumes:{assets}},renderer:{domElement:{width:2,height:2},getContext(){return gl;}}};
 camera.matrixWorldNeedsUpdate=true;camera.matrixAutoUpdate=false;camera.matrixWorldAutoUpdate=false;
 G.game={nativeWorld:{display:{group:stage}},R:{render(){camera.matrixWorldNeedsUpdate=false;if(mode==='camera-mutation')camera.projectionMatrix.elements[0]+=1;if(mode==='field-mutation'||mode==='capture-plus-field-mutation')round.size+=1;if(mode==='material-mutation')mat.depthTest=false;assert.equal(ancestor.visible,true,'A projectile mesh ancestor must never be hidden');rendered=mesh.visible?(actor.visible?100:180):0;}}};globalThis.__projectileProbe={rounds:[round]};
 globalThis.__captureNativeCanvas=async captureMode=>{captures++;if((mode==='capture-failure'||mode==='capture-plus-field-mutation')&&captures===4){globalThis.__nativeCanvasCaptureFailure={mode:captureMode,width:2,height:2,png:'data:image/png;base64,AQID',rawRGBA:Buffer.from(Array.from({length:16},(_,i)=>i)).toString('base64'),error:'controlled capture failure'};throw Error('controlled capture failure');}return {mode:captureMode,png:'data:image/png;base64,AA==',glError:0,capture:{maxChannelDifference:0}};};
 const original={camera:camera.toJSON(),visibility:[],material:JSON.stringify(mat.toJSON()),matrix:Array.from(mesh.instanceMatrix.array),field:round.pos.toArray()};scene.traverse(o=>original.visibility.push([o,o.visible]));
 const dirty=camera.matrixWorldNeedsUpdate;
 const setters=[];for(const obj of [camera.position,camera.quaternion,camera.scale,camera.up,camera.matrix,camera.matrixWorld,camera.matrixWorldInverse,camera.projectionMatrix,camera.projectionMatrixInverse]){const prior=obj.fromArray;obj.fromArray=()=>{throw Error('read-only path wrote camera');};setters.push(()=>obj.fromArray=prior);}
 const priorUpdate=camera.updateMatrixWorld;camera.updateMatrixWorld=()=>{throw Error('read-only path updated camera');};
 const visibilityDescriptors=[];scene.traverse(o=>{const v=o.visible;Object.defineProperty(o,'visible',{get(){return v;},set(){throw Error('read-only path wrote visibility');},configurable:true});visibilityDescriptors.push(()=>Object.defineProperty(o,'visible',{value:v,writable:true,configurable:true,enumerable:true}));});
 const readback=await inspectNativeProjectileOcclusion({isolate:false});
 for(const reset of [...setters,...visibilityDescriptors])reset();camera.updateMatrixWorld=priorUpdate;assert.equal(camera.matrixWorldNeedsUpdate,dirty);assert.equal(captures,0);assert.equal(readback.phase,'original-native-before-forced-draw-readback');assert.equal(readback.meshes[0].instances[0].projectedBoundsCorners.length,8);assert.equal(readback.shots[0].position.insideClip,true);
 if(mode==='field-mutation'||mode==='material-mutation'){
   const rejected=await inspectNativeProjectileOcclusion({isolate:true});assert.ok(rejected.errors.some(e=>e.includes('restoration or sampled-field check failed')));assert.equal(mode==='field-mutation'?rejected.sampledProjectileFieldsUnchanged:rejected.materialFlagsUnchanged,false);
   for(const [o,v] of original.visibility)assert.equal(o.visible,v);assert.equal(camera.matrixWorldNeedsUpdate,true);
   if(mode==='field-mutation')assert.ok(round.size>.3,'Must not overwrite a mutated gameplay field to hide failure');
   else assert.equal(mat.depthTest,false,'Must reject, not rewrite unexpectedly changed material flags');
   results.push({mode,rejected:true,visibilityCameraRestored:true,mutationNotHidden:true});
   delete globalThis.NG;delete globalThis.__projectileProbe;delete globalThis.__captureNativeCanvas;continue;
 }
 const report=await inspectNativeProjectileOcclusion({isolate:true});assert.equal(report.errors.length,mode==='capture-plus-field-mutation'?2:failure?1:0);assert.equal(report.acceptanceEvidence,false);assert.equal(report.restoredVisibility,true);assert.equal(report.restoredCamera,true);assert.equal(report.sampledProjectileFieldsUnchanged,mode!=='capture-plus-field-mutation');
 for(const [o,v] of original.visibility)assert.equal(o.visible,v);assert.equal(JSON.stringify(mat.toJSON()),original.material);assert.deepEqual(Array.from(mesh.instanceMatrix.array),original.matrix);assert.deepEqual(round.pos.toArray(),original.field);assert.deepEqual(camera.toJSON(),original.camera);assert.equal(camera.matrixWorldNeedsUpdate,true);assert.equal(camera.matrixAutoUpdate,false);assert.equal(camera.matrixWorldAutoUpdate,false);
 if(!failure){assert.equal(report.controls.length,4);assert.equal(report.controls[1].mode,'local-actor-hidden');assert.equal(report.controls[1].projectileChangedPixels,4);assert.equal(report.controls[1].onRepeatChangedPixels,0);}
 if(mode==='capture-failure'||mode==='capture-plus-field-mutation'){
   assert.ok(report.captureFailure);assert.equal(globalThis.__nativeCanvasCaptureFailure,undefined);
   const dir=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-occlusion-'));try{const saved=persistOcclusionCaptureFailure(report.captureFailure,dir,'dualies-test');assert.deepEqual([...fs.readFileSync(path.join(dir,saved.pngFile))],[1,2,3]);assert.deepEqual([...fs.readFileSync(path.join(dir,saved.rawRGBAFile))],Array.from({length:16},(_,i)=>i));assert.equal(saved.png,undefined);assert.deepEqual(saved.writeErrors,[]);assert.equal(saved.rawRGBA,undefined);assert.match(fs.readFileSync(path.join(dir,saved.evidenceFile),'utf8'),/controlled capture failure/);assert.throws(()=>persistOcclusionCaptureFailure(report.captureFailure,dir,'../unsafe'),/Unsafe/);const realWrite=fs.writeFileSync;try{fs.writeFileSync=(file,...args)=>{if(String(file).endsWith('.png'))throw Error('controlled PNG write failure');return realWrite(file,...args);};const partial=persistOcclusionCaptureFailure(report.captureFailure,dir,'partial-write');assert.equal(partial.png,report.captureFailure.png);assert.equal(partial.rawRGBA,undefined);assert.ok(fs.existsSync(path.join(dir,partial.rawRGBAFile)));assert.ok(partial.writeErrors.some(e=>e.includes('controlled PNG write failure')));assert.equal(JSON.parse(fs.readFileSync(path.join(dir,partial.evidenceFile),'utf8')).png,report.captureFailure.png);}finally{fs.writeFileSync=realWrite;}}finally{fs.rmSync(dir,{recursive:true});}
 }
 results.push({mode,failureInjected:failure,controls:report.controls.length,errors:report.errors.length,cameraVisibilityRestored:true,sampledFieldsUnchanged:report.sampledProjectileFieldsUnchanged});
 delete globalThis.NG;delete globalThis.__projectileProbe;delete globalThis.__captureNativeCanvas;
}
console.log(JSON.stringify({scope:'Unit-level diagnostic readback and restoration with actual Three objects, mocked renderer; not GPU/visibility acceptance',results},null,2));
