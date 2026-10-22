import {requireInverseShapePair} from './inkwave-explosher-inverse-contract.mjs';
// Pure acceptance gate for actual consecutive native frames. Not an image generator.
import assert from 'node:assert/strict';
import {requireControlledStartupPair}from'./inkwave-explosher-volume-barrier.mjs';
export function validateContinuousPair(before,after,br,ar,expectedBefore,expectedAfter){
 requireInverseShapePair(br,ar);
 const ticks=Array.from({length:61},(_,i)=>i);
 for(const [frames,r,sha] of [[before,br,expectedBefore],[after,ar,expectedAfter]]){
  assert.match(sha,/^[a-f0-9]{40}$/);
  assert.equal(r.actualSourceSha,sha);assert.equal(r.sourceSha,sha);
  assert.equal(r.captureMode,'continuous-native-60Hz');assert.equal(r.simulationHz,60);
  assert.deepEqual(r.captureTicks,ticks);assert.deepEqual(r.captureViews,['behind']);
  assert.equal(frames.length,61);
  for(let i=0;i<61;i++){
   const f=frames[i];assert.equal(f.tick,i);assert.equal(f.view,'behind');assert.equal(f.label,'s3-slosher-washtub');
   assert.equal(f.file,'s3-slosher-washtub-t'+String(i).padStart(2,'0')+'-behind.png');
   assert.match(f.sha256,/^[a-f0-9]{64}$/);assert.equal(f.actualFileSha256,f.sha256);
   assert.equal(f.imageStats.width,800);assert.equal(f.imageStats.height,450);assert(f.imageStats.opaque>0&&f.imageStats.range>=8);
   assert(f.measurement.render.calls>0&&f.measurement.render.triangles>0);
   for(const k of ['oldDisposed','oldDetached','actorOwned','sceneOwned','constructorPreserved','stylePreserved','sourceReady'])assert.equal(f.measurement.nativeReset[k],true);
   assert(Math.abs(f.measurement.time-frames[0].measurement.time-i/60)<1e-10,'consecutive fixed simulation time');
   if(i===0||i===3){
    assert(f.count===1&&f.measurement.sparkles===28&&f.measurement.render.points>=28);
    const physical=f.measurement.physical;assert.equal(physical.length,1);assert.equal(physical[0].wid,'s3-slosher-washtub');assert(Number.isFinite(physical[0].seed));
    for(const key of ['pos','vel'])assert(Array.isArray(physical[0][key])&&physical[0][key].length===3&&physical[0][key].every(Number.isFinite));
    const trace=f.measurement.aimTrace;assert(Array.isArray(trace)&&trace.length>0);assert(trace.every(t=>t.local&&t.wid==='s3-slosher-washtub'&&[t.time,...t.from,...t.result].every(Number.isFinite)));
   }
  }
 }
 assert.equal(expectedBefore,'364dd0a7fad9508652b4b4c6ec3d82eb124e9c5c');assert.equal(expectedAfter,expectedBefore);
 for(const k of ['captureProtocolSha256','captureUiGateSha256','nativeResetHelperSha256','nativeDummy'])assert.deepEqual(br[k],ar[k]);assert.deepEqual(br.build,ar.build);assert.deepEqual(br.stageAdmission,ar.stageAdmission);for(const[r,lane]of[[br,'before'],[ar,'after']])assert.deepEqual(explosherCaptureIdentity(r),r.stageAdmission.laneProvenance[lane],'Current capture provenance differs from admitted still pair');assert.equal(br.stageAdmission.stage,'stills');assert.equal(br.stageAdmission.passed,true);
 for(const [r,lane]of[[br,'before'],[ar,'after']]){assert.equal(r.shapeOverlay.lane,lane);assert.equal(r.shapeOverlay.sameBuildComparison,true);assert.equal(r.shapeOverlay.expectedCommonSourceHead,expectedBefore);assert.equal(r.shapeOverlay.fullGameTwoBuildAcceptance,false);assert.equal(r.shapeOverlay.buildContentHash,r.build.contentHash);assert.equal(r.controlledMain.buildContentHash,r.build.contentHash);assert.equal(r.stageAdmission.buildContentHash,r.build.contentHash);assert.equal(r.stageAdmission.commonHead,expectedBefore);assert.equal(r.shapeOverlay.baselineSourceBlob,'7afb76e80960dde61d51effb89057dd1f183d16f');assert.equal(r.shapeOverlay.candidateSourceBlob,'ff05f46db9eb5179440cd2c375663148ca05f48a');assert.match(r.captureUiGateSha256,/^[a-f0-9]{64}$/);}
 assert.equal(br.captureUiGateSha256,ar.captureUiGateSha256);
 for(const[r,lane]of[[br,'before'],[ar,'after']]){assert.equal(r.preflightBindingSha256,r.stageAdmission.preflightManifestSha256[lane]);assert.match(r.preflightBindingSha256,/^[a-f0-9]{64}$/);assert.equal(r.shapeOverlay.transformedEmittedSha256,lane==='before'?r.shapeOverlay.baselineEmittedSha256:r.shapeOverlay.candidateEmittedSha256);}
 for(const key of ['nativeEmittedSha256','baselineEmittedSha256','candidateEmittedSha256']){assert.match(br.shapeOverlay[key],/^[a-f0-9]{64}$/);assert.equal(br.shapeOverlay[key],ar.shapeOverlay[key]);}
 for(const key of ['originalEmittedSha256','transformedEmittedSha256']){assert.match(br.controlledMain[key],/^[a-f0-9]{64}$/);assert.equal(br.controlledMain[key],ar.controlledMain[key]);}
 for(let i=0;i<61;i++)requireControlledStartupPair(before[i].measurement.controlledStartup,after[i].measurement.controlledStartup);
 assert(Number.isFinite(br.seed));assert.equal(br.seed,ar.seed);
 for(const r of [br,ar])for(const k of ['originalDriverSha256','nativeResetHelperSha256','sourceShapeSha256','captureProtocolSha256'])assert.match(r[k],/^[a-f0-9]{64}$/);assert.equal(br.originalDriverSha256,ar.originalDriverSha256);
 assert.equal(br.nativeResetHelperSha256,ar.nativeResetHelperSha256);
 for(let i=0;i<61;i++){
  const a=before[i].measurement,b=after[i].measurement;
  for(const key of ['rng','effects','style','sceneClocks','startup','physical','aimTrace','nativeReset','camera','palette','inkHex','time','sparkles','lighting','viewport']){assert(Object.hasOwn(a,key)&&Object.hasOwn(b,key),'Missing '+key+' at tick '+i);assert.deepEqual(b[key],a[key],key+' at tick '+i);}
  for(const key of ['calls','triangles','points','lines'])assert(Number.isFinite(a.render[key])&&Number.isFinite(b.render[key])&&a.render[key]>=0&&b.render[key]>=0&&b.render[key]<=a.render[key],key+' at tick '+i);
  for(const key of ['geometries','textures'])assert(Number.isFinite(a.memory[key])&&Number.isFinite(b.memory[key])&&a.memory[key]>=0&&b.memory[key]>=0&&b.memory[key]<=a.memory[key],key+' at tick '+i);
 }
 return {framesPerSide:61,simulationHz:60,interpolation:false,origin:'first native projectile birth',comparison:'INKWAVE before/after, not retail reference'};
}
export function validateEncodedVideo(probe){
 const streams=probe.streams.filter(s=>s.codec_type==='video');
 assert.equal(streams.length,1);const v=streams[0];
 assert.equal(v.codec_name,'h264');assert.equal(v.width,1600);assert.equal(v.height,450);
 assert.equal(v.avg_frame_rate,'60/1');assert.equal(Number(v.nb_read_frames),61);
 assert(Math.abs(Number(v.duration)-61/60)<.001);
}


export function validateCapturePngHeader(bytes){
 assert(Buffer.isBuffer(bytes)&&bytes.length>=33,'Truncated PNG header');
 assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a','PNG signature');
 assert.equal(bytes.readUInt32BE(8),13,'IHDR length');assert.equal(bytes.subarray(12,16).toString('ascii'),'IHDR');
 assert.equal(bytes.readUInt32BE(16),800,'actual PNG width');assert.equal(bytes.readUInt32BE(20),450,'actual PNG height');
}

import fs from'node:fs';import {spawnSync}from'node:child_process';
export function requireExplosherVideoTools(){
 const run=(name,args)=>{const r=spawnSync(name,args,{encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024});assert.equal(r.status,0,name+' unavailable');return r.stdout+r.stderr;};
 const version=run('ffmpeg',['-version']).split('\n')[0],probeVersion=run('ffprobe',['-version']).split('\n')[0];
 assert.match(run('ffmpeg',['-hide_banner','-encoders']),/\blibx264\b/);assert.match(run('ffmpeg',['-hide_banner','-filters']),/\bdrawtext\b/);assert(fs.existsSync('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'));
 return{version,probeVersion,libx264:true,drawtext:true,labelFont:true};
}

export function explosherVideoDeliveryProvenance(before,after){
 requireInverseShapePair(before.r,after.r);
 const lane=x=>{for(const k of ['manifestSha256','sourceReceiptSha256'])assert.match(x[k],/^[a-f0-9]{64}$/);return{manifestSha256:x.manifestSha256,sourceReceiptSha256:x.sourceReceiptSha256,shapeSourceBlob:x.r.shapeOverlay.lane==='before'?x.r.shapeOverlay.baselineSourceBlob:x.r.shapeOverlay.candidateSourceBlob,consumedShapeSha256:x.r.shapeOverlay.transformedEmittedSha256};};
 return{commonSourceSha:before.r.actualSourceSha,commonSourceShapeSha256:before.r.sourceShapeSha256,buildContentHash:before.r.build.contentHash,sameBuildComparison:true,comparisonMode:'after-native-inverse-baseline',nativeSourceBlob:before.r.shapeOverlay.nativeSourceBlob,nativeEmittedSha256:before.r.shapeOverlay.nativeEmittedSha256,baselineEmittedSha256:before.r.shapeOverlay.baselineEmittedSha256,naturalBootAccepted:false,fullGameTwoBuildAcceptance:false,before:lane(before),after:lane(after),controlledMain:{originalEmittedSha256:before.r.controlledMain.originalEmittedSha256,consumedEmittedSha256:before.r.controlledMain.transformedEmittedSha256}};
}

export function explosherCaptureIdentity(r){
 return{commonBuildAdmission:r.commonBuildAdmission??null,sourceSha:r.actualSourceSha,buildContentHash:r.build.contentHash,captureProtocolSha256:r.captureProtocolSha256,captureUiGateSha256:r.captureUiGateSha256,originalDriverSha256:r.originalDriverSha256,nativeResetHelperSha256:r.nativeResetHelperSha256,nativeDummy:r.nativeDummy,sourceShapeSha256:r.sourceShapeSha256,controlledMain:{original:r.controlledMain.originalEmittedSha256,consumed:r.controlledMain.transformedEmittedSha256},shape:{sourceEpochKind:r.shapeOverlay.sourceEpochKind,commonSourceTree:r.shapeOverlay.commonSourceTree,finalCommonHeadPending:r.shapeOverlay.finalCommonHeadPending,nativeCaptureReady:r.shapeOverlay.nativeCaptureReady,schema:r.shapeOverlay.schema,comparisonMode:r.shapeOverlay.comparisonMode,nativeSource:r.shapeOverlay.nativeSourceBlob,native:r.shapeOverlay.nativeEmittedSha256,lane:r.shapeOverlay.lane,baseline:r.shapeOverlay.baselineEmittedSha256,candidate:r.shapeOverlay.candidateEmittedSha256,consumed:r.shapeOverlay.transformedEmittedSha256,baselineSource:r.shapeOverlay.baselineSourceBlob,candidateSource:r.shapeOverlay.candidateSourceBlob}};
}
