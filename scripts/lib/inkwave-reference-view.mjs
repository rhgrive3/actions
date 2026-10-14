import fs from 'node:fs';
import path from 'node:path';
import {createCaptureEvaluator,withCaptureRestoration} from './inkwave-capture-evidence.mjs';
import {battleVerticalFov,BATTLE_HUMANOID_VERTICAL_FOV,battleFrame} from '../../patches/splatoon3/runtime/battle-framing.mjs';
import {captureUserCondition} from './inkwave-user-condition-probe.mjs';

// Approximate, independently checked visible roof corners, not recovered source vertices.
export const referenceLandmarks={reference:'IMG_7083.jpeg',photo:[1536,1009],gameCrop:[0,109,1536,864],candidate:[1359,892],candidateCssViewport:[1133,744],candidateProjection:[1.0805524464212812,1.6455187120904726],candidatePosition:[17.858118671327816,22.682854932800137,-62.06203718183782],candidateQuaternion:[0,.9982005399352043,.05996400647944456,0],points:[
 {name:'near facade roof-right',candidate:[752,302],photo:[510,274]},
 {name:'narrow facade roof-right',candidate:[1154,333],photo:[899,301]},
 {name:'distant rectangular block roof-right',candidate:[1130,272],photo:[864,232]}
]};
export function fitReferenceOrientation(projection,landmarks=referenceLandmarks){
 if(projection.length!==16||projection.some(x=>!Number.isFinite(x)))throw Error('Invalid reference projection');
 const predict=(point,yaw,pitch)=>{
  let x=(2*point.candidate[0]/landmarks.candidate[0]-1)/landmarks.candidateProjection[0],y=(1-2*point.candidate[1]/landmarks.candidate[1])/landmarks.candidateProjection[1],z=-1;
  [x,z]=[Math.cos(yaw)*x-Math.sin(yaw)*z,Math.sin(yaw)*x+Math.cos(yaw)*z];
  [y,z]=[Math.cos(pitch)*y+Math.sin(pitch)*z,-Math.sin(pitch)*y+Math.cos(pitch)*z];
  if(z>=-.01)return [Infinity,Infinity];
  const [left,top,width,height]=landmarks.gameCrop;return [left+(projection[0]*x/-z+1)*width/2,top+(1-projection[5]*y/-z)*height/2];
 };
 const score=(yaw,pitch)=>landmarks.points.reduce((sum,p)=>{const a=predict(p,yaw,pitch);return sum+(a[0]-p.photo[0])**2+(a[1]-p.photo[1])**2;},0);
 let yaw=0,pitch=0;
 for(const step of [.1,.01,.001,.0001,.00001])for(let iter=0;iter<1000;iter++){
  let best=[yaw,pitch],value=score(yaw,pitch);
  for(const i of [-1,0,1])for(const j of [-1,0,1]){const a=yaw+i*step,b=pitch+j*step;if(Math.abs(a)>.7||Math.abs(b)>.4)continue;const s=score(a,b);if(s<value){value=s;best=[a,b];}}
  if(best[0]===yaw&&best[1]===pitch)break;
  [yaw,pitch]=best;if(iter===999)throw Error('Reference orientation fit failed to converge');
 }
 return {yaw,pitch,localRotationOrder:'originalQuaternion * localY(yaw) * localX(pitch)',exactPhotoMatch:false,positionAndFovUnverified:true,residualsAreProjectionPredictions:true,landmarks,rootMeanSquarePixels:Math.sqrt(score(yaw,pitch)/landmarks.points.length),residuals:landmarks.points.map(p=>{const before=predict(p,0,0),after=predict(p,yaw,pitch);return {name:p.name,observed:p.photo,before,after,beforeResidual:before.map((x,i)=>x-p.photo[i]),afterResidual:after.map((x,i)=>x-p.photo[i])};})};
}

export function referenceCameraControl({action,yaw=0,pitch=0}){
 const G=NG,c=G.camera,g=G.game;
 const pose=()=>({position:c.position.toArray(),quaternion:c.quaternion.toArray(),projection:c.projectionMatrix.toArray(),aspect:c.aspect,fov:c.fov});
 const inputs=()=>{const fills=[];g.nativeWorld.display.group.traverse(m=>{if(!m.isMesh)return;for(const mat of Array.isArray(m.material)?m.material:[m.material])if(mat.userData.nativeShadeFill)fills.push({material:mat.uuid,value:mat.userData.nativeShadeFill.value});});if(!fills.length||fills.some(x=>!Number.isFinite(x.value)||x.value!==0))throw Error('Reference view requires unchanged zero fill');return {fills,matchTime:g.match.time,matchState:g.match.state,actor:G.local.pos.toArray(),quality:g.settings.quality,nativeQuality:g.nativeWorld.metrics.quality,textureCount:g.nativeWorld.metrics.textureCount,qualityError:g.nativeWorld.metrics.qualityError||null};};
 if(action==='save'){if(globalThis.__referenceCameraOriginal)throw Error('Reference camera already held');const value={pose:pose(),inputs:inputs()};globalThis.__referenceCameraOriginal=value;return value;}
 const original=globalThis.__referenceCameraOriginal;if(!original)throw Error('Reference camera original missing');
 if(action==='restore'){c.position.fromArray(original.pose.position);c.quaternion.fromArray(original.pose.quaternion);c.updateMatrixWorld(true);const restored=pose();if(JSON.stringify(restored)!==JSON.stringify(original.pose))throw Error('Reference camera restoration mismatch');const restoredInputs=inputs();if(JSON.stringify(restoredInputs)!==JSON.stringify(original.inputs))throw Error('Reference game inputs changed at restoration');delete globalThis.__referenceCameraOriginal;return {restored,inputs:restoredInputs};}
 if(action==='orient'){
  if(!Number.isFinite(yaw)||!Number.isFinite(pitch)||Math.abs(yaw)>.7||Math.abs(pitch)>.4)throw Error('Reference orientation outside bounded fit');
  const mul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
  const q=mul(mul(original.pose.quaternion,[0,Math.sin(yaw/2),0,Math.cos(yaw/2)]),[Math.sin(pitch/2),0,0,Math.cos(pitch/2)]);c.quaternion.fromArray(q);c.updateMatrixWorld(true);
 }
 if(JSON.stringify(inputs())!==JSON.stringify(original.inputs))throw Error('Reference game/fill/quality inputs drifted');
 return {pose:pose(),inputs:inputs(),screen:[screen.width,screen.height],viewport:[innerWidth,innerHeight],drawingBuffer:[G.renderer.domElement.width,G.renderer.domElement.height],devicePixelRatio,shaderPrograms:(G.renderer.info?.programs||[]).map(p=>({id:p.id,name:p.name,diagnosticsAvailable:!!p.diagnostics,runnable:p.diagnostics?.runnable,programLog:p.diagnostics?.programLog,vertexLog:p.diagnostics?.vertexShader?.log,fragmentLog:p.diagnostics?.fragmentShader?.log}))};
}

export async function probeReferenceViews(page,out){
 fs.mkdirSync(out,{recursive:true});const report={status:'running',scope:'Exploratory fixed-position orientation fit from approximate image geometry landmarks; fill0, unchanged scene setup; not exact photo, source-build or physical Safari reproduction',frames:[],errors:[]};
 const save=()=>fs.writeFileSync(path.join(out,'reference-views.json'),JSON.stringify(report,null,2));
 const evaluate=createCaptureEvaluator({page,out,onPersistenceError:e=>report.errors.push(e)});
 try{await withCaptureRestoration(async()=>{
  report.original=await page.evaluate(referenceCameraControl,{action:'save'});
  for(const mode of ['aspect-only','landmark-oriented']){
   if(mode==='landmark-oriented'){
  for(const [key,expected] of [['position',referenceLandmarks.candidatePosition],['quaternion',referenceLandmarks.candidateQuaternion]])if(report.original.pose[key].some((v,i)=>Math.abs(v-expected[i])>1e-8))throw Error('Reference landmark source camera differs: '+key);
  const pose=report.original.pose,expectedFov=battleVerticalFov(BATTLE_HUMANOID_VERTICAL_FOV,pose.aspect),expectedY=1/Math.tan(expectedFov*Math.PI/360);
  if(Math.abs(pose.fov-expectedFov)>1e-8||Math.abs(pose.projection[5]-expectedY)>1e-8||Math.abs(pose.projection[0]-expectedY/pose.aspect)>1e-8)throw Error('Reference camera violates native battle framing');
  report.framingContract={referenceVerticalFov:BATTLE_HUMANOID_VERTICAL_FOV,actualVerticalFov:pose.fov,expectedVerticalFov:expectedFov,source:'patches/splatoon3/runtime/battle-framing.mjs',priorCandidateCssCrop:battleFrame(...referenceLandmarks.candidateCssViewport),currentCssCrop:battleFrame(1133,637)};
  report.fit=fitReferenceOrientation(report.original.pose.projection);
   }
   const control=await page.evaluate(referenceCameraControl,{action:'orient',...(mode==='landmark-oriented'?report.fit:{yaw:0,pitch:0})});
   const frame=await evaluate(captureUserCondition,true);frame.mode=mode;frame.referenceControl=control;report.frames.push(frame);
   const errors=[];for(const [ext,bytes] of [['png',Buffer.from(frame.png.split(',')[1],'base64')],['rgba',Buffer.from(frame.rawRGBA,'base64')]])try{fs.writeFileSync(path.join(out,mode+'.'+ext),bytes);}catch(e){errors.push(e);}
   if(errors.length)throw new AggregateError(errors,'Reference view persistence failed');delete frame.png;delete frame.rawRGBA;frame.pngFile=mode+'.png';frame.rawRGBAFile=mode+'.rgba';
   frame.afterCapture=await page.evaluate(referenceCameraControl,{action:'observe'});
   if(JSON.stringify(frame.afterCapture.pose)!==JSON.stringify(control.pose))throw Error('Reference camera changed during capture');
   if(frame.conditions.cloudErrors.length)throw Error('Reference cloud/environment readback failed');save();
  }
 },async()=>{report.restoration=await page.evaluate(referenceCameraControl,{action:'restore'});});
 }catch(e){report.errors.push(String(e.stack||e));}
 report.status=report.errors.length?'failed':'collected';save();return report;
}
