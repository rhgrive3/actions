import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {runFrozenComposerControls} from './inkwave-frozen-composer-controls.mjs';
import {verifySavedPngCapture} from './inkwave-png-evidence.mjs';
export const INKBLOT_SOURCE='bef74ead213cfc4c041820319dbac7ab702d5f0f2df86db8369b162879f8b4f3';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export function verifyLightingIdentity(result,{expectedSourceSha,manifest}){
 assert.equal(expectedSourceSha,INKBLOT_SOURCE,'Unreviewed source pin');
 assert.equal(result.stage,'inkblot');assert.equal(result.source,expectedSourceSha);
 assert.equal(manifest.build.nativeStages.stages.find(s=>s.id==='inkblot')?.sourceSha256,expectedSourceSha);
 assert.ok(result.baseURI.endsWith('/_versions/'+manifest.build.revision+'/'),'Lighting page revision differs');
 assert.equal(result.quality,'high','Lighting coverage requires actual high quality');assert.equal(result.theme,'day','Lighting coverage requires actual day theme');
 assert.equal(result.settings?.shadowMapEnabled,true,'Lighting coverage requires active shadows');
 for(const key of ['nativeMeshes','shadowReceivers','shadowCastingLights','normalMapMaterials','roughnessMapMaterials','environmentMaterials'])assert.ok(Number.isInteger(result.applicability?.[key])&&result.applicability[key]>0,'No applicable '+key);
 assert.equal(result.applicability.neutralToneMapping,true,'Tone control requires original Neutral mapping');
 assert.equal(result.camera.length,16);assert.equal(result.projection.length,16);
 assert.ok([...result.camera,...result.projection].every(Number.isFinite));
 assert.equal(result.rows.length,9,'Lighting controls incomplete');
 assert.deepEqual(result.rows.map(r=>r.mode),['baseline','no-ink','no-receive-shadow','no-normal-map','no-roughness-map','no-environment','unlit-albedo','linear-tone-control','restored-baseline']);
 for(const row of result.rows){assert.equal(row.capture.glError,0);assert.equal(row.capture.capture.preReadError,0);verifySavedPngCapture(row.capture);}
 assert.equal(result.rows[0].capture.rawRGBA,result.rows.at(-1).capture.rawRGBA,'Restored composer framebuffer differs from baseline');
 return true;
}
export async function collectFrozenLighting(page,out,options){
 fs.mkdirSync(out,{recursive:true});
 let result,error;
 try{result=await page.evaluate(runFrozenComposerControls);}catch(e){error=String(e?.stack||e);result=await page.evaluate(()=>globalThis.__lightingControlsPartial||{rows:[]});const rejected=await page.evaluate(()=>globalThis.__nativeCanvasCaptureFailure);if(rejected)result.rejectedCapture=rejected;}
 const report={scope:'Frozen high/day actual production composer diagnostic; not dusk, photo-camera parity, retail or iPad acceptance',statisticsScope:'floor/walls/sky labels are fixed mixed screen rectangles, not native geometry masks; controls affect native display materials while actors and ink remain unless explicitly disabled',status:'incomplete',build:{contentHash:options.manifest.contentHash,inputHash:options.manifest.inputHash,revision:options.manifest.build.revision},...result};
 const persist=(capture,label)=>{
   const row={...capture};
   if(capture.png){assert.ok(capture.png.startsWith('data:image/png;base64,'));const b=Buffer.from(capture.png.slice(22),'base64');fs.writeFileSync(path.join(out,label+'.png'),b);row.pngFile=label+'.png';row.pngSha256=hash(b);delete row.png;}
   if(capture.rawRGBA){const b=Buffer.from(capture.rawRGBA,'base64');fs.writeFileSync(path.join(out,label+'.rgba'),b);row.rawFile=label+'.rgba';row.rawSha256=hash(b);delete row.rawRGBA;}
   try{row.exactPngVerification=verifySavedPngCapture(capture);}catch(e){row.verificationError=String(e);}
   return row;
 };
 try{if(error)throw Error(error);verifyLightingIdentity(result,options);report.status='collected';report.baselineRestoredExactly=true;}catch(e){report.error=String(e?.stack||e);}
 const baseline=result.rows?.[0]?.capture?.rawRGBA?Buffer.from(result.rows[0].capture.rawRGBA,'base64'):null;
 const differences=capture=>{if(!baseline||!capture?.rawRGBA)return null;const raw=Buffer.from(capture.rawRGBA,'base64');if(raw.length!==baseline.length)return {error:'Framebuffer byte lengths differ'};let changedPixels=0,maxChannelDifference=0,totalChannelDifference=0;for(let i=0;i<raw.length;i+=4){let changed=false;for(let k=0;k<4;k++){const d=Math.abs(raw[i+k]-baseline[i+k]);if(d)changed=true;maxChannelDifference=Math.max(maxChannelDifference,d);totalChannelDifference+=d;}if(changed)changedPixels++;}return {changedPixels,maxChannelDifference,totalChannelDifference,scope:'Raw framebuffer difference from frozen baseline; eligible targets do not guarantee a visible contribution'};};
 report.rows=(result.rows||[]).map(row=>({...row,differenceFromBaseline:differences(row.capture),capture:persist(row.capture,row.mode)}));
 if(result.rejectedCapture)report.rejectedCapture=persist(result.rejectedCapture,'rejected-capture');
 fs.writeFileSync(path.join(out,'lighting-controls.json'),JSON.stringify(report,null,2));
 return report;
}
