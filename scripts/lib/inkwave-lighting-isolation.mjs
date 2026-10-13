import fs from 'node:fs';
import path from 'node:path';
import {createCaptureEvaluator} from './inkwave-capture-evidence.mjs';
import {decodeCapturePng} from './inkwave-png-evidence.mjs';

// Repeated unchanged baselines are a separate gate from PNG serialization.
export function compareLightingRepeat(before,after){
 const a=decodeCapturePng(Buffer.from(before.png.split(',')[1],'base64'));
 const b=decodeCapturePng(Buffer.from(after.png.split(',')[1],'base64'));
 if(a.width!==b.width||a.height!==b.height)throw Error('Lighting repeat dimensions changed');
 const rawA=Buffer.from(before.rawRGBA,'base64'),rawB=Buffer.from(after.rawRGBA,'base64');
 if(rawA.length!==a.width*a.height*4||rawB.length!==rawA.length)throw Error('Lighting repeat raw dimensions changed');
 const max=[0,0,0,0],rawMax=[0,0,0,0];let changedPixels=0,rawChangedPixels=0;
 for(let i=0;i<a.rgba.length;i+=4){let changed=false;for(let k=0;k<4;k++){const d=Math.abs(a.rgba[i+k]-b.rgba[i+k]);max[k]=Math.max(max[k],d);if(d>(k===3?0:1))changed=true;}if(changed)changedPixels++;}
 for(let i=0;i<rawA.length;i+=4){let changed=false;for(let k=0;k<4;k++){const d=Math.abs(rawA[i+k]-rawB[i+k]);rawMax[k]=Math.max(rawMax[k],d);if(d>(k===3?0:1))changed=true;}if(changed)rawChangedPixels++;}
 const result={maxChannelDifference:max,rawMaxChannelDifference:rawMax,changedPixels,rawChangedPixels,tolerance:1,alphaTolerance:0};
 if(changedPixels||rawChangedPixels){const error=Error('Unchanged lighting baseline drifted');error.comparison=result;throw error;}
 return result;
}

export async function collectLightingIsolation({capture,persist,restore,save}){
 const report={status:'running',causalComparisonAccepted:false,frames:[],errors:[]};
 const safeSave=async()=>{try{await save(report);}catch(error){report.errors.push({mode:'report-persistence',error:String(error.stack||error)});report.status='failed';report.causalComparisonAccepted=false;}};
 let baseline;
 try{
  for(const [mode,coefficient] of [['baseline-first',0],['baseline-repeat',0],['fill-035',.35],['restored-first',0],['restored-repeat',0]]){
   try{
    const frame=await capture(mode,coefficient);
    // Save immutable bytes before state/repeat acceptance, including failed repeats.
    report.frames.push(frame);await persist(frame);frame.persisted=true;
    if(frame.fillUniformValid===false)throw Error('Native shade uniform changed outside intended coefficient');
    if(!baseline)baseline=frame;
    if(JSON.stringify(frame.lightingState)!==JSON.stringify(baseline.lightingState))throw Error('Lighting scene/material/texture/shadow state changed');
    if(coefficient===0&&frame!==baseline)frame.repeatValidation=compareLightingRepeat(baseline,frame);
   }catch(error){report.errors.push({mode,error:String(error.stack||error),comparison:error.comparison});}
   await safeSave();
  }
 }finally{
  try{await restore();}catch(error){report.errors.push({mode:'final-restoration',error:String(error.stack||error)});}
  report.causalComparisonAccepted=report.frames.length===5&&report.errors.length===0;
  report.status=report.causalComparisonAccepted?'passed':'failed';await safeSave();
 }
 return report;
}

// Called only after preparing a fresh page/match. No temporary material clones,
// scene visibility changes, camera moves, or quality switches inside this probe.
export async function probeLightingIsolation(page,out,{writeFile=fs.writeFileSync}={}){
 fs.mkdirSync(out,{recursive:true});
 const persistenceErrors=[];
 const evaluate=createCaptureEvaluator({page,out,onPersistenceError:e=>persistenceErrors.push(e),writeFile});
 await page.evaluate(()=>{globalThis.__lightingObjectIds=new WeakMap();globalThis.__lightingObjectId=0;globalThis.__lightingOriginalFills=new Map();NG.game.nativeWorld.display.group.traverse(m=>{if(m.isMesh&&m.material.userData.nativeShadeFill)globalThis.__lightingOriginalFills.set(m.material.userData.nativeShadeFill,m.material.userData.nativeShadeFill.value);});});
 const report=await collectLightingIsolation({
  capture:(mode,coefficient)=>evaluate(async({mode,coefficient})=>{
   const G=NG,g=G.game,r=G.renderer;
   g.nativeWorld.display.group.traverse(m=>{if(m.isMesh&&m.material.userData.nativeShadeFill)m.material.userData.nativeShadeFill.value=m.material.transparent?0:coefficient;});
   const snapshot=()=>{
   const texture=t=>t?{uuid:t.uuid,version:t.version,width:t.image?.width,height:t.image?.height,colorSpace:t.colorSpace,format:t.format,type:t.type}:null;
   const objectId=o=>{const ids=globalThis.__lightingObjectIds;if(!ids.has(o))ids.set(o,++globalThis.__lightingObjectId);return ids.get(o);};
   const materialState=mat=>{
    const seen=new Set();const finiteArray=values=>{if(values.some(v=>typeof v==='number'&&!Number.isFinite(v)))throw Error('Non-finite material vector/array state');return values;};
    const value=(v,depth=0)=>{
     if(typeof v==='number'&&!Number.isFinite(v))throw Error('Non-finite material state');
     if(v===null||typeof v!=='object'&&typeof v!=='function')return v;
     const identity=objectId(v);
     if(v===mat.userData?.nativeShadeFill)return {identity,intentionallyVariedUniform:'nativeShadeFill'};
     if(typeof v==='function')return {identity,functionSource:String(v)};
     if(v.isTexture)return {...texture(v),identity,imageIdentity:v.image?objectId(v.image):null,wrapS:v.wrapS,wrapT:v.wrapT,minFilter:v.minFilter,magFilter:v.magFilter,anisotropy:v.anisotropy,flipY:v.flipY,premultiplyAlpha:v.premultiplyAlpha,offset:v.offset?.toArray(),repeat:v.repeat?.toArray(),rotation:v.rotation,matrix:v.matrix?.toArray()};
     if(typeof v.toArray==='function')return {identity,type:v.constructor?.name,values:finiteArray(v.toArray())};
     if(ArrayBuffer.isView(v))return {identity,type:v.constructor.name,values:finiteArray(Array.from(v))};
     if(seen.has(v))return {reference:identity};seen.add(v);
     if(depth>8)throw Error('Material state exceeds diagnostic snapshot depth');
     return {identity,values:Object.fromEntries(Object.keys(v).sort().map(k=>[k,value(v[k],depth+1)]))};
    };
    return Object.fromEntries([...new Set([...Object.keys(mat),'onBeforeCompile','customProgramCacheKey'])].sort().map(k=>[k,value(mat[k])]));
   };
   const meshes=[];g.nativeWorld.display.group.traverse(m=>{if(!m.isMesh)return;const mat=m.material;
    meshes.push({name:m.name,uuid:m.uuid,matrix:m.matrixWorld.toArray(),visible:m.visible,receiveShadow:m.receiveShadow,castShadow:m.castShadow,material:Array.isArray(mat)?mat.map(materialState):materialState(mat)});
   });
   const lights=[];G.scene.traverse(l=>{if(l.isLight)lights.push({uuid:l.uuid,intensity:l.intensity,color:l.color.toArray(),matrix:l.matrixWorld.toArray(),shadow:l.shadow?{bias:l.shadow.bias,normalBias:l.shadow.normalBias,radius:l.shadow.radius,mapSize:l.shadow.mapSize.toArray(),map:texture(l.shadow.map?.texture),autoUpdate:l.shadow.autoUpdate,needsUpdate:l.shadow.needsUpdate,matrix:l.shadow.matrix.toArray()}:null});});
   return {renderer:{toneMapping:r.toneMapping,toneMappingExposure:r.toneMappingExposure,outputColorSpace:r.outputColorSpace,autoClear:r.autoClear,autoClearColor:r.autoClearColor,autoClearDepth:r.autoClearDepth,autoClearStencil:r.autoClearStencil,clearAlpha:r.getClearAlpha?.()},scene:{environment:texture(G.scene.environment),environmentIntensity:G.scene.environmentIntensity,environmentRotation:G.scene.environmentRotation?.toArray(),background:G.scene.background?.isTexture?texture(G.scene.background):G.scene.background?.toArray?.(),backgroundIntensity:G.scene.backgroundIntensity,fog:G.scene.fog?{color:G.scene.fog.color?.toArray(),near:G.scene.fog.near,far:G.scene.fog.far,density:G.scene.fog.density}:null},quality:g.settings.quality,builtQuality:g._builtQuality,nativeQuality:g.nativeWorld.metrics.quality,textureCount:g.nativeWorld.metrics.textureCount,qualityError:g.nativeWorld.metrics.qualityError||null,camera:G.camera.matrixWorld.toArray(),projection:G.camera.projectionMatrix.toArray(),shadowEnabled:r.shadowMap.enabled,shadowAutoUpdate:r.shadowMap.autoUpdate,shadowNeedsUpdate:r.shadowMap.needsUpdate,meshes,lights};
   };
   const fillState=()=>{const rows=[];g.nativeWorld.display.group.traverse(m=>{if(m.isMesh&&m.material.userData.nativeShadeFill)rows.push({material:m.material.uuid,actual:m.material.userData.nativeShadeFill.value,expected:m.material.transparent?0:coefficient});});return rows;};
   const before=snapshot(),fillBefore=fillState();
   g.R.render();
   const after=snapshot(),fillAfter=fillState();
   const frame=await globalThis.__captureNativeCanvas(mode);frame.lightingState={before,after,afterCapture:snapshot()};frame.fillUniformState={before:fillBefore,after:fillAfter,afterCapture:fillState()};frame.fillUniformValid=Object.values(frame.fillUniformState).every(rows=>rows.every(row=>row.actual===row.expected));frame.coefficient=coefficient;return frame;
  },{mode,coefficient}),
  persist:frame=>{const stem=path.join(out,frame.mode),errors=[];for(const [ext,bytes] of [['png',Buffer.from(frame.png.split(',')[1],'base64')],['rgba',Buffer.from(frame.rawRGBA,'base64')]])try{writeFile(stem+'.'+ext,bytes);}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Lighting evidence write failed');},
  restore:()=>page.evaluate(()=>{for(const [uniform,value] of globalThis.__lightingOriginalFills)uniform.value=value;for(const [uniform,value] of globalThis.__lightingOriginalFills)if(uniform.value!==value)throw Error('Lighting original uniform restoration failed');delete globalThis.__lightingOriginalFills;delete globalThis.__lightingObjectIds;delete globalThis.__lightingObjectId;}),
  save:report=>writeFile(path.join(out,'lighting-isolation.json'),JSON.stringify({...report,frames:report.frames.map(({png,rawRGBA,...frame})=>({...frame,...(frame.persisted?{}:{png,rawRGBA}),pngFile:frame.mode+'.png',rawRGBAFile:frame.mode+'.rgba'})),persistenceErrors},null,2))
 });
 if(persistenceErrors.length)report.causalComparisonAccepted=false;
 return report;
}
