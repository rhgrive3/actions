import {requireApprovedCommonBuild} from './inkwave-explosher-common-build.mjs';
import {requireInverseShapePair} from './inkwave-explosher-inverse-contract.mjs';
// LOCAL acceptance protocol. Read evidence only; never starts captures or repairs state.
import assert from 'node:assert/strict';
import {compareExplosherCaptures}from'./inkwave-explosher-scene-census.mjs';
import {requireControlledStartupPair}from'./inkwave-explosher-volume-barrier.mjs';
export const COMMON_HEAD='364dd0a7fad9508652b4b4c6ec3d82eb124e9c5c';
export function requireExplosherStagePair(stage,before,after,br,ar){
 requireInverseShapePair(br,ar);
 assert(['preflight','stills'].includes(stage));
 const ticks=stage==='preflight'?[0]:[0,3,8,14,22,30],views=stage==='preflight'?['behind']:['behind','tele-side','tele-oblique'];
 const expected=ticks.flatMap(t=>views.map(v=>t+':'+v));
 for(const [frames,r,lane]of[[before,br,'before'],[after,ar,'after']]){
  assert.equal(r.actualSourceSha,COMMON_HEAD);assert.equal(r.sourceSha,COMMON_HEAD);
  assert.equal(r.captureMode,stage==='preflight'?'preflight':'multi-view-stills');
  assert.deepEqual(r.captureTicks,ticks);assert.deepEqual(r.captureViews,views);assert.equal(r.simulationHz,60);
  assert.equal(r.shapeOverlay.lane,lane);assert.equal(r.shapeOverlay.sameBuildComparison,true);assert.equal(r.shapeOverlay.fullGameTwoBuildAcceptance,false);
  assert.equal(r.shapeOverlay.expectedCommonSourceHead,COMMON_HEAD);assert.equal(r.shapeOverlay.baselineSourceBlob,'7afb76e80960dde61d51effb89057dd1f183d16f');assert.equal(r.shapeOverlay.candidateSourceBlob,'ff05f46db9eb5179440cd2c375663148ca05f48a');
  assert.equal(r.shapeOverlay.buildContentHash,r.build.contentHash);assert.equal(r.controlledMain.buildContentHash,r.build.contentHash);assert.equal(r.controlledMain.controlledInitialCondition,true);assert.equal(r.controlledMain.naturalBootAccepted,false);
  assert.equal(r.shapeOverlay.transformedEmittedSha256,lane==='before'?r.shapeOverlay.baselineEmittedSha256:r.shapeOverlay.candidateEmittedSha256);
  assert.deepEqual(frames.map(f=>f.tick+':'+f.view),expected);
  for(const f of frames){assert.equal(f.label,'s3-slosher-washtub');assert.equal(f.file,`s3-slosher-washtub-t${String(f.tick).padStart(2,'0')}-${f.view}.png`);assert.match(f.sha256,/^[0-9a-f]{64}$/);assert.equal(f.actualFileSha256,f.sha256);assert(f.imageStats.width===800&&f.imageStats.height===450&&f.imageStats.opaque>0&&f.imageStats.range>=8);assert(f.measurement.render.calls>0&&f.measurement.render.triangles>0);assert(Number.isFinite(f.measurement.time));assert(Number.isInteger(f.measurement.sparkles)&&f.measurement.sparkles>=0);for(const k of ['oldDisposed','oldDetached','actorOwned','sceneOwned','constructorPreserved','stylePreserved','sourceReady'])assert.equal(f.measurement.nativeReset[k],true);if(f.tick===0){assert.equal(f.count,1);assert.equal(f.measurement.physical.length,1);assert.equal(f.measurement.physical[0].wid,'s3-slosher-washtub');assert(Number.isFinite(f.measurement.physical[0].seed));assert(Array.isArray(f.measurement.aimTrace)&&f.measurement.aimTrace.length>0);}}
 }
 if(stage==='stills'){for(const[r,lane]of[[br,'before'],[ar,'after']])assert.deepEqual(explosherCaptureIdentity(r),r.stageAdmission.laneProvenance[lane],'Current capture provenance differs from admitted preflight');assert.deepEqual(br.stageAdmission,ar.stageAdmission);assert.equal(br.stageAdmission.stage,'preflight');assert.equal(br.stageAdmission.passed,true);for(const[r,lane]of[[br,'before'],[ar,'after']]){assert.equal(r.preflightBindingSha256,r.stageAdmission[lane].manifestSha256);assert.match(r.preflightBindingSha256,/^[0-9a-f]{64}$/);}}
 for(const k of ['captureProtocolSha256','sourceShapeSha256','nativeDummy'])assert.deepEqual(br[k],ar[k]);assert.deepEqual(br.build,ar.build);assert.equal(br.seed,ar.seed);assert.equal(br.originalDriverSha256,ar.originalDriverSha256);assert.equal(br.nativeResetHelperSha256,ar.nativeResetHelperSha256);assert.equal(br.captureUiGateSha256,ar.captureUiGateSha256);
 for(const r of [br,ar]){assert(Number.isFinite(r.seed));for(const k of ['originalDriverSha256','nativeResetHelperSha256','captureUiGateSha256','captureProtocolSha256','sourceShapeSha256'])assert.match(r[k],/^[0-9a-f]{64}$/);}
 for(const r of [br,ar]){assert.equal(typeof r.nativeDummy.path,'string');assert(r.nativeDummy.path.endsWith('/patches/practice-range/runtime/dummy.mjs'));assert.match(r.nativeDummy.sha256,/^[0-9a-f]{64}$/);}
 for(const key of ['nativeEmittedSha256','baselineEmittedSha256','candidateEmittedSha256']){assert.match(br.shapeOverlay[key],/^[0-9a-f]{64}$/);assert.equal(br.shapeOverlay[key],ar.shapeOverlay[key]);}
 for(const r of [br,ar])for(const key of ['originalEmittedSha256','transformedEmittedSha256'])assert.match(r.controlledMain[key],/^[0-9a-f]{64}$/);
 assert.equal(br.controlledMain.originalEmittedSha256,ar.controlledMain.originalEmittedSha256);assert.equal(br.controlledMain.transformedEmittedSha256,ar.controlledMain.transformedEmittedSha256);
 const mismatches=[],check=(name,fn)=>{try{fn();}catch(e){mismatches.push({domain:name,error:e.message.slice(0,512)});}};
 for(let i=0;i<before.length;i++){
  const a=before[i].measurement,b=after[i].measurement,prefix=before[i].tick+':'+before[i].view;
  for(const k of ['rng','effects','style','sceneClocks','startup','aimTrace','nativeReset','physical','camera','palette','inkHex','time','sparkles','lighting','viewport'])check(prefix+':'+k,()=>{assert(Object.hasOwn(a,k)&&Object.hasOwn(b,k));assert.deepEqual(a[k],b[k]);});
  for(const [domain,keys]of[['render',['calls','triangles','points','lines']],['memory',['geometries','textures']]])for(const key of keys)check(prefix+':'+domain+'.'+key,()=>{assert(Number.isFinite(a[domain][key])&&Number.isFinite(b[domain][key])&&a[domain][key]>=0&&b[domain][key]>=0);assert(b[domain][key]<=a[domain][key]);});
  check(prefix+':controlledBoundary',()=>requireControlledStartupPair(a.controlledStartup,b.controlledStartup));
  if(before[i].tick===0){
   for(const k of ['aimPoint','aimDir','aimYaw','aimPitch','characterTime'])check(prefix+':preShot.'+k,()=>{assert(Object.hasOwn(a.preShot,k)&&Object.hasOwn(b.preShot,k));assert.deepEqual(a.preShot[k],b.preShot[k]);});
   const effective=r=>({...r,blend:r.blend?.active?r.blend:null,superJumpLandTime:r.superJumpLandTime<.45?r.superJumpLandTime:null});
   check(prefix+':preShot.rig',()=>{assert(a.preShot.rig&&b.preShot.rig);assert.deepEqual(effective(a.preShot.rig),effective(b.preShot.rig));});
  }
 }
 if(stage==='stills')for(const m of compareExplosherCaptures(before,after).mismatches)mismatches.push(m);
 assert.equal(mismatches.length,0,'Strict '+stage+' pair mismatch: '+JSON.stringify(mismatches));
 return{stage,commonHead:COMMON_HEAD,buildContentHash:br.build.contentHash,sameBuildComparison:true,naturalBootAccepted:false,fullGameTwoBuildAcceptance:false,passed:true,framesPerSide:before.length,laneProvenance:{before:explosherCaptureIdentity(br),after:explosherCaptureIdentity(ar)},preflightManifestSha256:stage==='stills'?{before:br.preflightBindingSha256,after:ar.preflightBindingSha256}:null};
}

import {spawnSync}from'node:child_process';
import fs from'node:fs';import path from'node:path';import crypto from'node:crypto';
import {validateCapturePngHeader,explosherCaptureIdentity}from'./inkwave-explosher-video-gate.mjs';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),read=(d,n)=>JSON.parse(fs.readFileSync(path.join(d,n),'utf8'));
export function readExplosherCaptureLane(d){
 const r=read(d,'source-receipt.json');
 assert(r.commonBuildAdmission,'Missing final common build admission');
 const admitted=requireApprovedCommonBuild(r.shapeOverlay.sourceRoot,r.shapeOverlay.site);
 assert.deepEqual(r.commonBuildAdmission,admitted,'Final common build admission changed');
 const frames=read(d,'manifest.json').map(f=>{assert.match(f.file,/^s3-slosher-washtub-t\d{2}-(behind|tele-side|tele-oblique)\.png$/);const bytes=fs.readFileSync(path.join(d,f.file));validateCapturePngHeader(bytes);const decoded=spawnSync('ffmpeg',['-v','error','-xerror','-i','pipe:0','-frames:v','1','-f','rawvideo','-pix_fmt','rgba','pipe:1'],{input:bytes,maxBuffer:2*1024*1024,timeout:15000});assert.equal(decoded.error,undefined,'PNG decoder execution failed: '+(decoded.error?.message||''));assert.equal(decoded.status,0,'PNG decoder failed: '+decoded.stderr?.toString());assert.equal(decoded.stdout.length,800*450*4);let lo=255,hi=0,opaque=0;for(let i=0;i<decoded.stdout.length;i+=4){if(!decoded.stdout[i+3])continue;opaque++;const v=(decoded.stdout[i]+decoded.stdout[i+1]+decoded.stdout[i+2])/3;lo=Math.min(lo,v);hi=Math.max(hi,v);}assert(opaque>0&&hi-lo>=8,'Actual decoded PNG is blank');return{...f,actualFileSha256:hash(bytes),decodedImageStats:{width:800,height:450,opaque,range:hi-lo}};});
 for(const [file,proof]of[['served-shape-overlay.json',r.shapeOverlay],['served-controlled-main.json',r.controlledMain]]){
  assert(proof);const rel=file==='served-shape-overlay.json'?'patches/splatoon3/runtime/s3-projectile-shapes.mjs':'src/main.js';assert.match(r.build.build.revision,/^[a-zA-Z0-9_-]+$/);assert.deepEqual(proof.paths,[rel,'_versions/'+r.build.build.revision+'/'+rel]);const p=read(d,file);assert.deepEqual(p.errors,[]);assert(Array.isArray(p.responses)&&p.responses.length>0);assert.match(proof.transformedEmittedSha256,/^[0-9a-f]{64}$/);assert(Array.isArray(proof.paths)&&proof.paths.length===2);
  for(const response of p.responses){assert(proof.paths.map(x=>'/'+x).includes(new URL(response.url).pathname));assert.equal(response.sha256,proof.transformedEmittedSha256);}
 }
 return{r,frames,manifestSha256:hash(fs.readFileSync(path.join(d,'manifest.json'))),sourceReceiptSha256:hash(fs.readFileSync(path.join(d,'source-receipt.json')))};
}
export function readExplosherStagePair(stage,beforeDir,afterDir){
 const lanes=[beforeDir,afterDir].map(readExplosherCaptureLane);
 return{...requireExplosherStagePair(stage,lanes[0].frames,lanes[1].frames,lanes[0].r,lanes[1].r),before:{manifestSha256:lanes[0].manifestSha256,sourceReceiptSha256:lanes[0].sourceReceiptSha256},after:{manifestSha256:lanes[1].manifestSha256,sourceReceiptSha256:lanes[1].sourceReceiptSha256}};
}
