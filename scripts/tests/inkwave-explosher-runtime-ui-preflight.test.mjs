import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {assertRuntimePreflightEvent,inspectRuntimePreflightBuild,runtimePreflightIdentity,PREFLIGHT_MODE} from '../lib/inkwave-explosher-runtime-ui-preflight.mjs';
const base='26a4db4123d23162a3dbf8a12150b1b5bc6ccf64',head='bbc59c80917dbb01738e543c05866238381f797d';
const repo={full_name:'rhgrive3/actions'};
const event=()=>({action:'synchronize',number:1844,repository:repo,pull_request:{number:1844,base:{ref:'main',sha:base,repo},head:{ref:'inkwave/runtime-ui-acceptance-20261022',sha:head,repo}}});
const env=()=>({GITHUB_EVENT_NAME:'pull_request',GITHUB_REPOSITORY:'rhgrive3/actions',EXPLOSHER_RUNTIME_UI_PREFLIGHT:PREFLIGHT_MODE,EXPLOSHER_PREFLIGHT:'1'});
test('owned final PR accepts actual immutable event head and future QA heads',()=>{assert.deepEqual(assertRuntimePreflightEvent(event(),env()),{baseSha:base,candidateSha:head});const e=event();e.pull_request.head.sha='a'.repeat(40);assert.equal(assertRuntimePreflightEvent(e,env()).candidateSha,'a'.repeat(40));});
for(const [name,change] of Object.entries({wrongAction:e=>e.action='closed',wrongPR:e=>e.number=1845,wrongInnerPR:e=>e.pull_request.number=1845,wrongRepo:e=>e.repository={full_name:'other/repo'},fork:e=>e.pull_request.head.repo={full_name:'other/repo'},wrongBaseRepo:e=>e.pull_request.base.repo={full_name:'other/repo'},wrongBase:e=>e.pull_request.base.sha=head,wrongBaseRef:e=>e.pull_request.base.ref='other',wrongBranch:e=>e.pull_request.head.ref='other',nonCommit:e=>e.pull_request.head.sha='main',baseAsHead:e=>e.pull_request.head.sha=base}))test('reject '+name,()=>{const e=event();change(e);assert.throws(()=>assertRuntimePreflightEvent(e,env()));});
for(const[k,v]of Object.entries({GITHUB_EVENT_NAME:'pull_request_target',GITHUB_REPOSITORY:'other/repo',EXPLOSHER_RUNTIME_UI_PREFLIGHT:'unknown',EXPLOSHER_PREFLIGHT:'0',EXPLOSHER_VIDEO:'1',EXPLOSHER_EXPECT_PREFLIGHT:'x',EXPLOSHER_ADMIT_BEFORE:'x',EXPLOSHER_ADMIT_AFTER:'x',EXPLOSHER_CONTROLLED_MAIN:'x',EXPLOSHER_SHAPE_OVERLAY:'x'}))test('reject '+k,()=>assert.throws(()=>assertRuntimePreflightEvent(event(),{...env(),[k]:v})));
test('unsealed output manifest cannot self-authorize',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'explosher-preflight-contract-'));try{fs.writeFileSync(path.join(root,'inkwave-build.json'),JSON.stringify({schema:1,files:{},artifacts:{}}));assert.throws(()=>inspectRuntimePreflightBuild({root,site:root,lane:'after'}),/Pinned complete build manifest/);assert.throws(()=>inspectRuntimePreflightBuild({root,site:root,lane:'unknown'}),/Explicit lane/);}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('driver preserves default historical admission and explicitly scopes inverse exception',()=>{const s=fs.readFileSync(new URL('../check-inkwave-explosher-flight-glitter.mjs',import.meta.url),'utf8');assert.match(s,/:requireApprovedCommonBuild\(sourceRoot,site\)/);assert.match(s,/if\(!runtimeUIRoute&&\(!shapeOverlay\|\|!controlled\)\)/);assert.match(s,/if\(!runtimeUIRoute\)\{\nconst counterpart=/);assert.match(s,/receipt\.diagnosticOnly=true;receipt\.fullPairAccepted=false/);});
function integratedWorkflowContract(s) {
  assert.doesNotMatch(s,/if: false/);
  assert(s.includes("readExplosherStagePair('stills'"));
  assert.match(s,/ref: \$\{\{ github.event.pull_request.head.sha \}\}/);
  // Integration retains the independently admitted common-build experiment,
  // separate from current-head native execution and the PR1844-only protocol.
  for (const gate of [
    'ref: 364dd0a7fad9508652b4b4c6ec3d82eb124e9c5c',
    'requireApprovedCommonBuild',
    'node scripts/check-inkwave-current-explosher-native.mjs .built-site/explosher-current',
    'EXPECTED_HEAD: ${{ github.event.pull_request.head.sha }}',
    'compile-inkwave-explosher-inverse-pair.mjs',
    'compile-inkwave-explosher-controlled-main.mjs',
    "readExplosherStagePair('preflight'",
    "EXPLOSHER_PREFLIGHT: '1'",
  ]) assert(s.includes(gate),gate);
  assert.doesNotMatch(s,/continue-on-error|EXPLOSHER_RUNTIME_UI_PREFLIGHT:/);
  assert(s.indexOf('requireApprovedCommonBuild')<s.indexOf('readExplosherStagePair'));
}
test('integrated workflow preserves strict long stages and independent exact current/common sources',()=>{
  const s=fs.readFileSync(new URL('../../.github/workflows/inkwave-explosher-flight-glitter.yml',import.meta.url),'utf8');
  integratedWorkflowContract(s);
  const admission=fs.readFileSync(new URL('../lib/inkwave-explosher-stage-admission.mjs',import.meta.url),'utf8');
  assert(admission.includes('naturalBootAccepted:false,fullGameTwoBuildAcceptance:false'));
  assert(admission.includes("assert.equal(mismatches.length,0,'Strict '+stage+' pair mismatch:"));
  for(const gate of ['ref: 364dd0a7fad9508652b4b4c6ec3d82eb124e9c5c',
    'requireApprovedCommonBuild','check-inkwave-current-explosher-native.mjs',
    "readExplosherStagePair('preflight'","readExplosherStagePair('stills'"]) {
    const changed=s.replaceAll(gate,'removed');
    assert.notEqual(changed,s);assert.throws(()=>integratedWorkflowContract(changed));
  }
});

test('separate exact catalogue-admission seal retains the historical before lane',()=>{
 const before=runtimePreflightIdentity('before'),after=runtimePreflightIdentity('after');
 assert.deepEqual(before,{manifest:'8212ef17727097bb0b779a260e896f2c006b937ec5e05da8eb4df63e281ebaf9',input:'eaeedda634324a8e72320e67546a4d3beeb8ae0544b5d32af8cadaa7ac7f10a6',content:'c37e66cd3c6de7b3a1dc2aa73ca6b00d4e0d72d1b16719f62c6cb96d096dd759',inputs:1362,artifacts:2016});
 assert.deepEqual(after,{manifest:'6707a985a10b7c02a5c2034bfd343adf8af345d120f6eee58334316d5b22b7c1',input:'fd991853769d8ccb6740fb0283ea7c363d9b336d072485333e3c551e2faf5f23',content:'7e93e0edeb92e2bbd45853185b9f01fa97fde16291b2254d635dea09a577fe5e',inputs:1363,artifacts:2018});
 assert.notEqual(after.manifest,'8a6349970578f81c3b43b6b1d86f35d1123ad1cd1b786e2ef944e90e045eb4d0','old owner-clock output cannot authorize current catalogue-admission input');
 after.manifest=before.manifest;after.inputs=before.inputs;
 assert.equal(runtimePreflightIdentity('after').inputs,1363,'callers cannot rewrite the private seal');
 assert.notEqual(runtimePreflightIdentity('after').manifest,before.manifest);
 for(const lane of ['unknown','__proto__','constructor',undefined])assert.throws(()=>runtimePreflightIdentity(lane),/Explicit lane/);
});
