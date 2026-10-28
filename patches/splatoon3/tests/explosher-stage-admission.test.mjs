import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import {fixture}from'./explosher-stage-fixture.mjs';import {requireExplosherStagePair as gate}from'../../../scripts/lib/inkwave-explosher-stage-admission.mjs';
function lanes(stage='preflight'){
 return ['before','after'].map(l=>{const f=fixture(l),ticks=stage==='preflight'?[0]:[0,3,8,14,22,30],views=stage==='preflight'?['behind']:['behind','tele-side','tele-oblique'];f.receipt.captureMode=stage==='preflight'?'preflight':'multi-view-stills';f.receipt.captureTicks=ticks;f.receipt.captureViews=views;if(stage==='stills'){f.receipt.preflightBindingSha256='1'.repeat(64);f.receipt.stageAdmission={laneProvenance:f.receipt.stageAdmission.laneProvenance,stage:'preflight',passed:true,before:{manifestSha256:'1'.repeat(64)},after:{manifestSha256:'1'.repeat(64)}};}f.frames=ticks.flatMap(t=>views.map(view=>({...structuredClone(f.frames[t]),view,file:`s3-slosher-washtub-t${String(t).padStart(2,'0')}-${view}.png`})));return f;});
}
for(const stage of ['preflight','stills'])test(stage+' structural pass is not native evidence',()=>{const[a,b]=lanes(stage);assert.equal(gate(stage,a.frames,b.frames,a.receipt,b.receipt).passed,true);});
for(const [name,mutate]of[
 ['coverage',b=>b.frames.pop()],['wrong lane',b=>b.receipt.shapeOverlay.lane='before'],['source',b=>b.receipt.actualSourceSha='0'.repeat(40)],['different build',b=>b.receipt.build.contentHash='different'],['private startup change',b=>b.frames[0].measurement.controlledStartup.after.sprayT=1],['RNG',b=>b.frames[0].measurement.rng.word++],['resource increase',b=>b.frames[0].measurement.memory.textures++],['missing UI provenance',b=>delete b.receipt.captureUiGateSha256],['PNG bytes',b=>b.frames[0].actualFileSha256='f'.repeat(64)],['preShot drift',b=>b.frames[0].measurement.preShot.aimYaw=1],['NaN time',b=>b.frames[0].measurement.time=NaN],['empty aim',b=>b.frames[0].measurement.aimTrace=[]]
])test('stage rejects '+name,()=>{const[a,b]=lanes();mutate(b);assert.throws(()=>gate('preflight',a.frames,b.frames,a.receipt,b.receipt));});
test('LOCAL ladder requires source evidence, does not start long capture from a boolean flag',()=>{const s=fs.readFileSync(new URL('../../../scripts/check-inkwave-explosher-flight-glitter.mjs',import.meta.url),'utf8');assert.match(s,/readExplosherStagePair\(video\?'stills':'preflight'/);assert.match(s,/!beforeEvidence\|\|!afterEvidence\|\|!expectedFrame/);assert.match(s,/captureTicks\.join/);assert.match(s,/__iwProjectileCaptureUiGate\(\{phase:'capture',requireReady:true\}\)/);assert.match(s,/Preserve ordinary native UI visibility; capture admission owns no CSS override/);});
test('both lanes cannot change controlled bytes after prior admission',()=>{const[a,b]=lanes('stills');for(const x of [a,b])x.receipt.controlledMain.transformedEmittedSha256='e'.repeat(64);assert.throws(()=>gate('stills',a.frames,b.frames,a.receipt,b.receipt),/provenance/);});

for(const key of ['captureProtocolSha256','sourceShapeSha256','nativeDummy'])test('preflight rejects cross-lane '+key+' drift',()=>{const[a,b]=lanes('preflight');b.receipt[key]='e'.repeat(64);assert.throws(()=>gate('preflight',a.frames,b.frames,a.receipt,b.receipt));});

// Synthetic guard regression only: never substitute for actual native evidence.
test('extra 281-to-295 candidate post-birth allocation still fails the preflight gate',()=>{const[a,b]=lanes();for(const x of [a,b]){const m=x.frames[0].measurement;m.memory.geometries=281;for(const e of m.rngDiagnostic.boundaries)e.nativeState.resources.geometries=281;}const m=b.frames[0].measurement;m.memory.geometries=295;for(const e of m.rngDiagnostic.boundaries)if(e.label==='before-draw-probe'||e.label==='after-draw-probe')e.nativeState.resources.geometries=295;assert.throws(()=>gate('preflight',a.frames,b.frames,a.receipt,b.receipt),/Candidate allocated extra post-birth geometry: 14 > 0/);});
test('resource diagnostic boundaries and scene provenance are required',()=>{for(const mutate of [m=>delete m.sceneCensus,m=>delete m.sceneSources,m=>delete m.rngDiagnostic,m=>m.rngDiagnostic.boundaries.pop()]){const[a,b]=lanes();mutate(b.frames[0].measurement);assert.throws(()=>gate('preflight',a.frames,b.frames,a.receipt,b.receipt));}});
test('every still rejects disabled, missing, or duplicated resource boundaries and RNG drift',()=>{
 for(let i=0;i<18;i++)for(const mutate of [
  m=>m.rngDiagnostic.enabled=false,
  m=>{m.rngDiagnostic.boundaries=m.rngDiagnostic.boundaries.filter(x=>x.label!=='after-draw-probe');},
  m=>m.rngDiagnostic.boundaries.push(structuredClone(m.rngDiagnostic.boundaries.find(x=>x.label==='before-draw-probe'))),
  m=>m.rng.word++,
 ]){
  const[a,b]=lanes('stills');mutate(b.frames[i].measurement);
  assert.throws(()=>gate('stills',a.frames,b.frames,a.receipt,b.receipt),'frame '+i);
 }
});
