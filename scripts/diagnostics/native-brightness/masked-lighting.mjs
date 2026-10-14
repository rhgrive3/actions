import assert from 'node:assert/strict';
import {runFrozenComposerControls} from './frozen-controls.mjs';
import {captureNativeGeometryMask} from './geometry-mask.mjs';

export async function runIndependentLightControls({expectedTheme='day',exposureFactor=1.25,hemisphereFactor=2}={}) {
 const {NG:G}=globalThis,g=G.game,r=G.renderer;
 if(!['day','sunset'].includes(expectedTheme)||g.theme!==expectedTheme||g._skipRender!==true)throw Error('Frozen requested theme required');
 if(!Number.isFinite(exposureFactor)||exposureFactor<=0||!Number.isFinite(hemisphereFactor)||hemisphereFactor<=0)throw Error('Positive finite factors required');
 g.R.render();
 const exposure=g.R.grade?.uniforms?.uExposure;
 if(!exposure||!Number.isFinite(exposure.value))throw Error('Actual production grade exposure required');
 const lights=[];G.scene.traverse(o=>{if(o.isLight)lights.push([o,o.intensity]);});
 const hemi=lights.filter(([o])=>o.isHemisphereLight);if(!hemi.length||!hemi.some(([,v])=>v>0))throw Error('Active hemisphere required');
 const saved={exposure:exposure.value,env:G.scene.environmentIntensity,tone:r.toneMapping,toneExposure:r.toneMappingExposure,camera:G.camera.matrixWorld.toArray(),projection:G.camera.projectionMatrix.toArray(),paint:G.paint.grid.slice(),level:G.level};
 const restore=()=>{exposure.value=saved.exposure;for(const [l,v]of lights)l.intensity=v;};
 const unchanged=()=>{
   G.camera.updateMatrixWorld();
   if(G.level!==saved.level||g.theme!==expectedTheme||G.scene.environmentIntensity!==saved.env||r.toneMapping!==saved.tone||r.toneMappingExposure!==saved.toneExposure||G.paint.grid.length!==saved.paint.length||G.paint.grid.some((v,i)=>v!==saved.paint[i])||G.camera.matrixWorld.toArray().some((v,i)=>v!==saved.camera[i])||G.camera.projectionMatrix.toArray().some((v,i)=>v!==saved.projection[i]))throw Error('Independent control changed protected state');
 };
 const rows=[];
 try {
   for(const mode of ['extended-baseline','exposure-only','hemisphere-only','extended-restored-baseline']){
     restore();
     if(mode==='exposure-only')exposure.value=saved.exposure*exposureFactor;
     if(mode==='hemisphere-only')for(const [l,v]of hemi)l.intensity=v*hemisphereFactor;
     g.R.render();unchanged();
     const settings={gradeExposure:exposure.value,hemisphere:hemi.map(([l])=>l.intensity),otherLights:lights.filter(([l])=>!l.isHemisphereLight).map(([l])=>l.intensity),environmentIntensity:G.scene.environmentIntensity};
     if(exposure.value!==(mode==='exposure-only'?saved.exposure*exposureFactor:saved.exposure))throw Error('Render overwrote requested exposure');
     for(const [l,v]of lights)if(l.intensity!==(mode==='hemisphere-only'&&l.isHemisphereLight?v*hemisphereFactor:v))throw Error('Render overwrote isolated light');
     rows.push({mode,settings,capture:await globalThis.__captureNativeCanvas(mode)});
   }
   const native=[];g.nativeWorld.display.group.traverse(mesh=>{if(!mesh.isMesh)return;if(Array.isArray(mesh.material)||!mesh.material?.isMeshStandardMaterial)throw Error('Expected single native MeshStandardMaterial');const m=mesh.material,n=mesh.geometry.getAttribute('normal');let min=Infinity,max=0,up=0,down=0,zero=0;for(let i=0;i<(n?.count||0);i++){const x=n.getX(i),y=n.getY(i),z=n.getZ(i),len=Math.hypot(x,y,z);min=Math.min(min,len);max=Math.max(max,len);if(len<1e-9)zero++;else if(y/len>.85)up++;else if(y/len<-.85)down++;}native.push({name:mesh.name,material:m.name,aoMap:!!m.aoMap,aoMapIntensity:m.aoMapIntensity,vertexColors:m.vertexColors,colorAttribute:!!mesh.geometry.getAttribute('color'),metalness:m.metalness,metalnessMap:!!m.metalnessMap,roughness:m.roughness,roughnessMap:!!m.roughnessMap,color:m.color.toArray(),mapColorSpace:m.map?.colorSpace,normalMap:!!m.normalMap,normalMapType:m.normalMapType,normalScale:m.normalScale.toArray(),emissive:m.emissive.toArray(),emissiveIntensity:m.emissiveIntensity,envMap:!!m.envMap,envMapIntensity:m.envMapIntensity,matrixWorld:mesh.matrixWorld.toArray(),normalSource:{count:n?.count||0,lengthMin:Number.isFinite(min)?min:null,lengthMax:max,up,down,zero}});});
   return {rows,native,factors:{exposureFactor,hemisphereFactor},theme:expectedTheme,lights:lights.map(([l,intensity])=>({type:l.type,name:l.name,intensity,color:l.color.toArray(),groundColor:l.groundColor?.toArray(),position:l.position.toArray(),castShadow:l.castShadow}))};
 } finally {restore();g.R.render();unchanged();}
}

export function maskedStatistics(capture,mask){
 const {width:w,height:h}=capture.capture;assert.equal(w,mask.width);assert.equal(h,mask.height);
 assert.equal(capture.capture.orientation,'bottom-up');assert.equal(mask.orientation,'bottom-up');
 const rgba=Buffer.from(capture.rawRGBA,'base64'),labels=Buffer.from(mask.labels,'base64');
 assert.equal(rgba.length,w*h*4);assert.equal(labels.length,w*h);
 const out={};
 for(const [name,id]of [['floor',1],['wall',2]]){
   const lum=[],rgb=[0,0,0];let black=0,white=0;
   for(let p=0;p<labels.length;p++)if(labels[p]===id){const i=p*4,l=.2126*rgba[i]+.7152*rgba[i+1]+.0722*rgba[i+2];lum.push(l);for(let k=0;k<3;k++)rgb[k]+=rgba[i+k];if(l<16)black++;if(l>245)white++;}
   lum.sort((a,b)=>a-b);const n=lum.length;
   out[name]={pixels:n,mean:n?lum.reduce((a,b)=>a+b,0)/n:null,median:n?lum[Math.floor((n-1)*.5)]:null,p10:n?lum[Math.floor((n-1)*.1)]:null,p90:n?lum[Math.floor((n-1)*.9)]:null,blackFraction:n?black/n:null,whiteFraction:n?white/n:null,rgbMean:n?rgb.map(v=>v/n):null};
 }
 return out;
}

// Call twice, on independently prepared/frozen actual day and sunset matches.
// The shared capture helper remains responsible for PNG/readPixels equality.
export async function collectMaskedLighting(page,{expectedTheme,expectedRevision,verifyCapture,onMask=()=>{},onOriginal=()=>{},minimumPixels=64}={}){
 assert.ok(['day','sunset'].includes(expectedTheme));assert.equal(typeof verifyCapture,'function');assert.ok(typeof expectedRevision==='string'&&expectedRevision.length>0,'Exact build revision required');
 const before=await page.evaluate(captureNativeGeometryMask);await onMask(before);
 const original=await page.evaluate(runFrozenComposerControls,{expectedTheme});await onOriginal(original);
 assert.equal(original.source,'bef74ead213cfc4c041820319dbac7ab702d5f0f2df86db8369b162879f8b4f3','Unexpected native source');
 assert.ok(original.baseURI.endsWith('/_versions/'+expectedRevision+'/'),'Unexpected build revision');
 const extended=await page.evaluate(runIndependentLightControls,{expectedTheme});
 const after=await page.evaluate(captureNativeGeometryMask);
 assert.deepEqual(after,before,'Geometry/paint mask changed between controls');
 const rows=[...original.rows,...extended.rows];
 for(const row of rows){verifyCapture(row.capture);row.masked=maskedStatistics(row.capture,before);for(const region of ['floor','wall'])assert.ok(row.masked[region].pixels>=minimumPixels,'Insufficient '+region+' mask pixels');}
 const baseline=rows[0].capture.rawRGBA;
 for(const mode of ['restored-baseline','extended-baseline','extended-restored-baseline'])assert.equal(rows.find(r=>r.mode===mode).capture.rawRGBA,baseline,'Baseline not restored '+mode);
 return {scope:'Private geometry-masked diagnostic, not runtime fix, photo parity or iPad acceptance',theme:expectedTheme,source:original.source,baseURI:original.baseURI,camera:original.camera,projection:original.projection,settings:original.settings,applicability:original.applicability,mask:before,factors:extended.factors,lights:extended.lights,native:extended.native,rows,baselineRestoredExactly:true,statistics:'Display-encoded RGB luminance; not linear irradiance. Compare same geometry pixels within this frozen theme only.'};
}
