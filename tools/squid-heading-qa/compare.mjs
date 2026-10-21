import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {verifyIdentityPair,CURRENT_SHA256,REFERENCE_SHA256} from './reference.mjs';
import {validatePredictedPair,BANK_PRECISION} from './bank-contract.mjs';
const changed='patches/local-quality/squid-motion-binding-adapter.mjs';
const presentationKeys=new Set(['heading','pitch','roll','mantle','width','pivotQuaternion','skinned','bankPrediction']);
const stableRow=r=>({...Object.fromEntries(Object.entries(r).filter(([k])=>!presentationKeys.has(k))),skinnedIndices:r.skinned?.indices});
export function compareHeadingReceipts(before,after,head){
 assert.match(head,/^[0-9a-f]{40}$/);assert.equal(before.sourceSha,head);assert.equal(after.sourceSha,head);assert.equal(before.expect,'baseline');assert.equal(after.expect,'candidate');
 for(const r of [before,after]){assert.equal(r.status,'rendered-awaiting-visual-review');assert.equal(r.browserRun,true);assert.equal(r.sourceBankAwaited,true);assert.equal(r.expectedFrames,12);assert.equal(r.images.length,12);assert.equal(r.screenshots.length,12);assert.equal(r.rows.length,4);assert.equal(r.errors.length,0);assert.equal(r.blocked.length,0);assert.equal(new Set(r.images.map(x=>x.name)).size,12);}
 for(const r of [before,after])assert.equal(r.threeExportContract?.status,'passed','exact production Three QA export gate');assert.deepEqual(before.threeExportContract,after.threeExportContract,'same production export contract');
 verifyIdentityPair(before.sourceIdentity,after.sourceIdentity,head);
 assert.equal(before.authoredHashes[changed],REFERENCE_SHA256);assert.equal(after.authoredHashes[changed],CURRENT_SHA256);
 for(const r of [before,after]){assert.equal(r.simulationTicks,360);assert(r.randomCalls>0);for(const k of ['canonicalTraceHash','sourceHeadingTraceHash','randomValuesHash'])assert.match(r[k],/^[0-9a-f]{64}$/);assert.deepEqual(r.bankContract,{status:'existing-bank-response-verified',advances:152,precision:BANK_PRECISION});assert.equal(r.buildInputHashes?.['local-quality/squid-motion-binding-adapter.mjs'],r.authoredHashes[changed]);}
 for(const k of ['canonicalTraceHash','randomCalls','randomValuesHash'])assert.equal(before[k],after[k],k);assert.notEqual(before.sourceHeadingTraceHash,after.sourceHeadingTraceHash,'named source-heading response must differ');
 const oldInputs={...before.buildInputHashes},newInputs={...after.buildInputHashes};delete oldInputs['local-quality/squid-motion-binding-adapter.mjs'];delete newInputs['local-quality/squid-motion-binding-adapter.mjs'];assert.deepEqual(oldInputs,newInputs,'all other build inputs exact');
 assert.equal(before.browserVersion,after.browserVersion);assert.deepEqual(before.harnessHashes,after.harnessHashes);assert.deepEqual(before.lighting,after.lighting);assert.equal(before.seed,after.seed);assert.equal(before.tickSeconds,after.tickSeconds);
 const beforeHashes={...before.authoredHashes},afterHashes={...after.authoredHashes};assert.notEqual(beforeHashes[changed],afterHashes[changed],'runtime candidate must differ');delete beforeHashes[changed];delete afterHashes[changed];assert.deepEqual(beforeHashes,afterHashes,'all other authored runtime/geometry/material/form owners stay exact');
 assert.deepEqual(before.rows.map(stableRow),after.rows.map(stableRow),'same inputs, source phase, root transform, physics and ground normal');
 // The heading fix changes the initial condition of the unchanged swim bank.
 // Verify that named recurrence, then rotate the same canonical skinned axes
 // through its predicted world quaternion. No tilt epsilon is increased.
 for(let i=0;i<before.rows.length;i++)validatePredictedPair(before.rows[i],after.rows[i]);
 for(const [r,role]of [[before,'baseline'],[after,'candidate']]){const fresh=r.rows.filter(x=>x.name.endsWith('-12'));assert.equal(fresh.length,2);for(const x of fresh){assert.equal(x.sourceStatus,'ready');assert.equal(x.sourceActive,true);assert.deepEqual(x.inputKeys,['ShiftLeft','KeyA']);if(role==='baseline')assert(x.heading>Math.PI/2+.1,'counterfactual heading defect required');else assert(x.heading>0&&x.heading<=Math.PI/2+1e-7,'candidate heading bound required');}}
 const views=r=>r.images.map(x=>({name:x.name,view:x.view,state:x.state,camera:x.camera,vertexCount:x.coverage.count}));assert.deepEqual(views(before),views(after),'same fixed camera and drawn vertex denominator');
 for(const r of [before,after])assert.deepEqual(r.screenshots.map(x=>x.name),r.images.map(x=>x.name),'each native image has exactly one saved hash receipt');
 return {status:'same-input-comparison-verified',referenceKind:before.sourceIdentity.kind,referenceSourceSha:before.sourceSha,candidateSha:after.sourceSha,framesPerSide:12,rows:4,geometryMaterialAndFormHashesPreserved:true,cameraLightingPhysicsSourcePhasePreserved:true,canonicalNonHeadingPoseAndPhysicsExact:true,globalRandomValueStreamExact:true,predictedExistingBankResponse:true,bankNumericPrecision:BANK_PRECISION,visualAcceptance:'pending human image review; heading/swim bank calibration are not Nintendo-exact measurements'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [a,b,head,out]=process.argv.slice(2);assert(a&&b&&head&&out,'baseline candidate head output required');const result=compareHeadingReceipts(JSON.parse(fs.readFileSync(a,'utf8')),JSON.parse(fs.readFileSync(b,'utf8')),head);fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
