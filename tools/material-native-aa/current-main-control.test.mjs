import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {commonRoot} from '../../scripts/tests/material-native-common/source-fixture.mjs';
import {compileCommonPair,inspectCompilerInputs,materialControlFromProduction,materialCandidateFromBaseline,requireCommonEmission,SOURCE_SHA,SOURCE_TREE,MODULE_PATH,CHANGES} from '../../scripts/prepare-inkwave-material-common.mjs';
import {generatedReceipt} from '../../scripts/tests/material-native-common/normal-receipt-fixture.mjs';import {requireNormalNativeReceipt} from '../../scripts/lib/inkwave-material-normal-admission.mjs';
const pair=await compileCommonPair(commonRoot),hash=x=>createHash('sha256').update(x).digest('hex');
test('current production hook is included in actual compiler provenance',()=>{const inputs=inspectCompilerInputs(commonRoot);assert.equal(inputs.find(x=>x.path==='patches/local-quality/adapter.mjs').gitBlob,'aded7281dfff012d3fdd4f71912dd662c31e153a');assert.equal(inputs.find(x=>x.path==='patches/local-quality/ink-micro-surface-adapter.mjs').gitBlob,'e7a734b05767ac5c3fffdd728b0b96a8eb896368');});
test('forward old-baseline transform cannot be silently reapplied to current production',()=>assert.throws(()=>materialCandidateFromBaseline(pair.candidate)));
test('both lanes inverted/swapped roles are rejected by unchanged normal workload admission',()=>{for(const variant of ['A','B']){const r=generatedReceipt(variant);r.overlay.commonVariant='A';r.overlay.overlayVariant='B';assert.throws(()=>requireNormalNativeReceipt(r,variant));}});
test('wrong A/B loaded bodies are rejected even with valid current source pins',()=>{for(const variant of ['A','B']){const r=generatedReceipt(variant),target='_versions/'+r.overlay.revision+'/'+MODULE_PATH;r.loaded.find(x=>x[0]===target)[1]=variant==='A'?r.overlay.candidateEmittedSha256:r.overlay.baselineEmittedSha256;assert.throws(()=>requireNormalNativeReceipt(r,variant));}});
const source=fs.readFileSync(new URL('../../scripts/prepare-inkwave-material-common.mjs',import.meta.url),'utf8');
const start=source.indexOf('export async function prepareCommonMaterial('),end=source.indexOf('\nif(process.argv[1]',start),verifyImport="await import(pathToFileURL(path.join(root,'scripts/lib/inkwave-runtime-evidence.mjs')))";assert.ok(start>=0&&end>start);assert.equal(source.slice(start,end).split(verifyImport).length,2);
function preparation(actual=pair.candidateEmitted){
 const writes=new Map(),manifest={inputHash:hash('input'),contentHash:hash('content'),build:{revision:hash('revision'),esbuild:pair.esbuildVersion}};
 const fakeFs={mkdirSync(){},readFileSync(){return Buffer.from(actual);},writeFileSync(p,b){writes.set(p,b);}};
 const body=source.slice(start,end).replace('export async function','async function').replace(verifyImport,'({verifyRuntimeBuild:runtimeVerifier})');
 const fn=Function('path','assert','execFileSync','SOURCE_SHA','SOURCE_TREE','inspectCompilerInputs','runtimeVerifier','compileCommonPair','fs','MODULE_PATH','requireCommonEmission','hash','CHANGES','console','return '+body)(path,assert,(_cmd,args)=>args[0]==='diff'?'':(args[1]==='HEAD'?SOURCE_SHA:SOURCE_TREE)+'\n',SOURCE_SHA,SOURCE_TREE,()=>pair.compilerInputs,(_site,_root,head)=>{assert.equal(head,SOURCE_SHA);return manifest;},async()=>pair,fakeFs,MODULE_PATH,requireCommonEmission,hash,CHANGES,{log(){}});
 return{run:()=>fn('/native-source','/built-site','/controlled-overlay'),writes};
}
test('actual preparation writes inverse A only and binds original production B bytes',async()=>{const x=preparation(),receipt=await x.run();assert.equal(x.writes.get('/controlled-overlay/inkShading.js'),pair.baselineEmitted);assert.notEqual(x.writes.get('/controlled-overlay/inkShading.js'),pair.candidateEmitted);assert.equal(receipt.commonVariant,'B');assert.equal(receipt.overlayVariant,'A');assert.equal(receipt.sourceSha,SOURCE_SHA);assert.equal(receipt.sourceTree,SOURCE_TREE);assert.equal(receipt.baselineEmittedSha256,hash(pair.baselineEmitted));assert.equal(receipt.candidateEmittedSha256,hash(pair.candidateEmitted));assert.equal(receipt.performanceAccepted,false);});
test('actual preparation rejects a served A module before writing any overlay',async()=>{const x=preparation(pair.baselineEmitted);await assert.rejects(x.run(),/production B/);assert.equal(x.writes.size,0);});
test('actual preparation rejects unrelated served bytes before writing any overlay',async()=>{const x=preparation(pair.candidateEmitted+'\n');await assert.rejects(x.run(),/production B/);assert.equal(x.writes.size,0);});

const workflow=fs.readFileSync(new URL('../../.github/workflows/inkwave-material-native-aa.yml',import.meta.url),'utf8');
function requireCurrentWorkflow(s){
 assert.match(s,/^on:\n  pull_request:\n    branches: \['main'\]\n/m);
 assert.match(s,/^    if: github\.head_ref == 'diagnostic\/ink-material-native-aa-20261022' \|\| github\.head_ref == 'diagnostic\/ink-material-native-aa-phase-20261022'$/m);
 assert.ok(!s.includes('preparation/ink-material-normal-admission-20261022'));
 assert.ok(s.includes('ref: '+SOURCE_SHA));assert.ok(s.includes(SOURCE_TREE));
 assert.ok(s.includes('scripts/tests/inkwave-three-composition.test.mjs'));
 assert.ok(s.includes('tools/material-native-aa/*.test.mjs'));
 assert.ok(s.includes('node tools/material-native-aa/run.mjs work/material-site work/material-source work/material-overlay/inkShading.js work/material-aa'));
}
test('current-main workflow targets main but keeps exact two owned diagnostic branches and A/A execution',()=>requireCurrentWorkflow(workflow));
test('old merged PR preparation base is rejected',()=>assert.throws(()=>requireCurrentWorkflow(workflow.replace("branches: ['main']","branches: ['preparation/ink-material-normal-admission-20261022']"))));
test('foreign head branch cannot trigger the reviewed native job',()=>assert.throws(()=>requireCurrentWorkflow(workflow.replace("github.head_ref == 'diagnostic/ink-material-native-aa-20261022'","github.head_ref != ''"))));
test('foreign phase branch cannot trigger the reviewed native job',()=>assert.throws(()=>requireCurrentWorkflow(workflow.replace("diagnostic/ink-material-native-aa-phase-20261022","diagnostic/foreign-material-phase"))));
test('an appended third branch cannot trigger the reviewed native job',()=>assert.throws(()=>requireCurrentWorkflow(workflow.replace("github.head_ref == 'diagnostic/ink-material-native-aa-phase-20261022'","github.head_ref == 'diagnostic/ink-material-native-aa-phase-20261022' || github.head_ref == 'diagnostic/foreign-material-third'"))));
