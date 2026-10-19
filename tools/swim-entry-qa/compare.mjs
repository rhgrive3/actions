import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {verifyIdentityPair,CURRENT_SHA256,REFERENCE_SHA256} from './reference.mjs';
const changed='patches/splatoon3/runtime/swim-motion.mjs';
const presentation=new Set(['swimYaw','heading','mantle','pivotQuaternion','skinned','previousSkinnedHeading','headingStep']);
export function compareSwimEntryReceipts(before,after,head){
 assert.match(head,/^[0-9a-f]{40}$/);assert.equal(before.sourceSha,head);assert.equal(after.sourceSha,head);assert.equal(before.expect,'baseline');assert.equal(after.expect,'candidate');
 for(const r of [before,after]){
  assert.equal(r.status,'rendered-awaiting-visual-review');assert.equal(r.browserRun,true);assert.equal(r.sourceBankAwaited,true);assert.equal(r.expectedFrames,12);assert.equal(r.images.length,12);assert.equal(r.screenshots.length,12);assert.equal(r.rows.length,4);assert.equal(r.errors.length,0);assert.equal(r.blocked.length,0);assert.equal(new Set(r.images.map(x=>x.name)).size,12);assert.equal(r.simulationTicks,73);assert.equal(r.randomCalls>0,true);assert.match(r.randomValuesHash,/^[0-9a-f]{64}$/);assert.match(r.canonicalTraceHash,/^[0-9a-f]{64}$/);
  assert.deepEqual(r.rows.map(x=>x.simulationFrame),[28,29,72,73]);for(const x of r.rows){assert.equal(x.sourceStatus,'ready');assert.equal(x.sourceActive,true);assert.equal(x.active,true);assert.deepEqual(x.input,{kind:'normalized-mobile-stick',moveX:-.02,moveY:0,squid:true});assert.equal(x.skinned.mantle.every(Number.isFinite),true);}
 }
 for(const key of ['browserVersion','seed','tickSeconds','canonicalTraceHash','randomCalls','randomValuesHash'])assert.equal(before[key],after[key],key);
 verifyIdentityPair(before.sourceIdentity,after.sourceIdentity,head);
 assert.equal(before.authoredHashes[changed],REFERENCE_SHA256);assert.equal(after.authoredHashes[changed],CURRENT_SHA256);
 for(const r of [before,after]){assert.equal(r.threeExportContract?.status,'passed');assert.equal(r.buildInputHashes?.['patch/runtime/swim-motion.mjs'],r.authoredHashes[changed]);}
 assert.deepEqual(before.threeExportContract,after.threeExportContract,'same exact production Three contract');
 const beforeInputs={...before.buildInputHashes},afterInputs={...after.buildInputHashes};delete beforeInputs['patch/runtime/swim-motion.mjs'];delete afterInputs['patch/runtime/swim-motion.mjs'];assert.deepEqual(beforeInputs,afterInputs,'all other build inputs exact');
 assert.deepEqual(before.harnessHashes,after.harnessHashes);assert.deepEqual(before.lighting,after.lighting);
 const old={...before.authoredHashes},next={...after.authoredHashes};assert.notEqual(old[changed],next[changed]);delete old[changed];delete next[changed];assert.deepEqual(old,next,'all other source/geometry/material/form owners exact');
 const stable=r=>({...Object.fromEntries(Object.entries(r).filter(([k])=>!presentation.has(k))),skinnedIndices:r.skinned.indices});assert.deepEqual(before.rows.map(stable),after.rows.map(stable));
 for(let i=0;i<4;i++)if([1,3].includes(i)){assert(Math.abs(before.rows[i].headingStep)>.5,'baseline negative must reproduce');assert(Math.abs(after.rows[i].headingStep)<.01,'candidate must remove owner-entry snap');}else assert(Math.abs(after.rows[i].swimYaw-after.rows[i].skinned.heading)<1e-6,'new initial yaw follows the drawn mantle');
 const views=r=>r.images.map(x=>({name:x.name,view:x.view,state:x.state,camera:x.camera,vertexCount:x.coverage.count}));assert.deepEqual(views(before),views(after),'same camera and drawn vertex denominator');
 for(const r of [before,after])assert.deepEqual(r.screenshots.map(x=>x.name),r.images.map(x=>x.name));
 return {status:'same-input-comparison-verified',referenceKind:before.sourceIdentity.kind,referenceSourceSha:head,candidateSha:head,framesPerSide:12,rows:4,canonicalSourceAndPhysicsExact:true,globalRandomValueStreamExact:true,scope:'first activation and one-tick invalidation; no bank-axis calibration change',visualAcceptance:'pending human review of all 24 original PNGs'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const [a,b,head,out]=process.argv.slice(2);assert(a&&b&&head&&out);const result=compareSwimEntryReceipts(JSON.parse(fs.readFileSync(a)),JSON.parse(fs.readFileSync(b)),head);fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
