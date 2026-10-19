import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
export const BASE_SHA='00b8994711809ba6d0469723c858ddef6805e2ae';
const changed='patches/local-quality/squid-motion-binding-adapter.mjs';
const presentationKeys=new Set(['heading','pitch','roll','mantle','width','pivotQuaternion','skinned']);
const stableRow=r=>({...Object.fromEntries(Object.entries(r).filter(([k])=>!presentationKeys.has(k))),skinnedIndices:r.skinned?.indices});
export function compareHeadingReceipts(before,after,head){
 assert.match(head,/^[0-9a-f]{40}$/);assert.equal(before.sourceSha,BASE_SHA);assert.equal(after.sourceSha,head);assert.equal(before.expect,'baseline');assert.equal(after.expect,'candidate');
 for(const r of [before,after]){assert.equal(r.status,'rendered-awaiting-visual-review');assert.equal(r.browserRun,true);assert.equal(r.sourceBankAwaited,true);assert.equal(r.expectedFrames,12);assert.equal(r.images.length,12);assert.equal(r.screenshots.length,12);assert.equal(r.rows.length,4);assert.equal(r.errors.length,0);assert.equal(r.blocked.length,0);assert.equal(new Set(r.images.map(x=>x.name)).size,12);}
 assert.equal(before.browserVersion,after.browserVersion);assert.deepEqual(before.harnessHashes,after.harnessHashes);assert.deepEqual(before.lighting,after.lighting);assert.equal(before.seed,after.seed);assert.equal(before.tickSeconds,after.tickSeconds);
 const beforeHashes={...before.authoredHashes},afterHashes={...after.authoredHashes};assert.notEqual(beforeHashes[changed],afterHashes[changed],'runtime candidate must differ');delete beforeHashes[changed];delete afterHashes[changed];assert.deepEqual(beforeHashes,afterHashes,'all other authored runtime/geometry/material/form owners stay exact');
 assert.deepEqual(before.rows.map(stableRow),after.rows.map(stableRow),'same inputs, source phase, root transform, physics and ground normal');
 // Surface pitch need not equal the straight source-bone chord during a curved
 // transform clip. Compare the same surface/clip on both builds instead.
 for(let i=0;i<before.rows.length;i++)for(const key of ['pitch','roll']){const a=before.rows[i].skinned?.[key],b=after.rows[i].skinned?.[key];assert(Number.isFinite(a)&&Number.isFinite(b));assert(Math.abs(a-b)<1e-8,'same skinned '+key+' within matrix arithmetic tolerance');}
 const views=r=>r.images.map(x=>({name:x.name,view:x.view,state:x.state,camera:x.camera,vertexCount:x.coverage.count}));assert.deepEqual(views(before),views(after),'same fixed camera and drawn vertex denominator');
 for(const r of [before,after])assert.deepEqual(r.screenshots.map(x=>x.name),r.images.map(x=>x.name),'each native image has exactly one saved hash receipt');
 return {status:'same-input-comparison-verified',baselineSha:before.sourceSha,candidateSha:after.sourceSha,framesPerSide:12,rows:4,geometryMaterialAndFormHashesPreserved:true,cameraLightingPhysicsSourcePhasePreserved:true,skinnedPitchRollToleranceRadians:1e-8,visualAcceptance:'pending human image review; heading/swim bank calibration are not Nintendo-exact measurements'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [a,b,head,out]=process.argv.slice(2);assert(a&&b&&head&&out,'baseline candidate head output required');const result=compareHeadingReceipts(JSON.parse(fs.readFileSync(a,'utf8')),JSON.parse(fs.readFileSync(b,'utf8')),head);fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
