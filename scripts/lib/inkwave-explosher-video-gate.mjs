// Pure acceptance gate for actual consecutive native frames. Not an image generator.
import assert from 'node:assert/strict';
export function validateContinuousPair(before,after,br,ar,expectedBefore,expectedAfter){
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
   if(i===0||i===3)assert(f.count===1&&f.measurement.sparkles===28&&f.measurement.render.points>=28);
  }
 }
 assert(Number.isFinite(br.seed));assert.equal(br.seed,ar.seed);
 for(const r of [br,ar])for(const k of ['originalDriverSha256','nativeResetHelperSha256','sourceShapeSha256'])assert.match(r[k],/^[a-f0-9]{64}$/);assert.equal(br.originalDriverSha256,ar.originalDriverSha256);
 assert.equal(br.nativeResetHelperSha256,ar.nativeResetHelperSha256);
 for(let i=0;i<61;i++){
  const a=before[i].measurement,b=after[i].measurement;
  for(const key of ['physical','aimTrace','nativeReset','camera','inkHex','time','sparkles','lighting','viewport'])assert.deepEqual(b[key],a[key],key+' at tick '+i);
  for(const key of ['calls','triangles','points','lines'])assert(b.render[key]<=a.render[key],key+' at tick '+i);
  for(const key of ['geometries','textures'])assert(b.memory[key]<=a.memory[key],key+' at tick '+i);
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
