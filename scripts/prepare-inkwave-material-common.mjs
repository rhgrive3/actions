#!/usr/bin/env node
// LOCAL QA candidate. One immutable common runtime/compiler; B overlays only two amplitudes.
import fs from'node:fs';import path from'node:path';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{createRequire}from'node:module';import{pathToFileURL}from'node:url';import{execFileSync}from'node:child_process';
export const SOURCE_SHA='cc0c90afe8031643e6a890974f8f44a40a30509e';
export const SOURCE_TREE='de64f6d82cdf518b9acbc4ce3ae7c897509b406c';
export const MODULE_PATH='src/world/inkShading.js';
export const CHANGES=[['(0.95 - 0.5 * gFresh)','(0.7125 - 0.375 * gFresh)'],['* 0.035 * gf * gInk;','* 0.02625 * gf * gInk;']];
export const EXPECTED_BLOBS={
 'inkwave-public/src/world/inkShading.js':'ba23601c7d1320e252082b9334ea5be8bac14522',
 'scripts/build-inkwave.mjs':'17d59758049518a6e5c93f50e1f3a0614e7c6ee4',
 'scripts/inkwave-source-composition.mjs':'33a535481402bae5e846870bed2ee7e76ef9b298',
 'scripts/lib/inkwave-source-compaction.mjs':'df4048abcecc32c8bc928671f5e6198029352fe3',
 'scripts/lib/inkwave-runtime-evidence.mjs':'eda5bf0f09dd87a34cffa20833ca228373c8453f'};
const hash=x=>createHash('sha256').update(x).digest('hex');
export const gitBlob=x=>createHash('sha1').update('blob '+Buffer.byteLength(x)+'\0').update(x).digest('hex');
export function inspectCompilerInputs(root){return Object.entries(EXPECTED_BLOBS).map(([name,expected])=>{const bytes=fs.readFileSync(path.join(root,name));assert.equal(gitBlob(bytes),expected,name+' exact common-source blob');return{path:name,gitBlob:expected,sha256:hash(bytes)};});}
export function materialCandidateFromBaseline(baseline){let candidate=baseline;for(const[a,b]of CHANGES){assert.equal(candidate.split(a).length,2,'unique original amplitude');assert.equal(candidate.split(b).length,1,'candidate amplitude absent');candidate=candidate.replace(a,b);}let inverse=candidate;for(const[a,b]of CHANGES){assert.equal(inverse.split(b).length,2);inverse=inverse.replace(b,a);}assert.equal(inverse,baseline,'two-amplitude reversal exact');assert.ok(baseline.includes('gInkD *= uPpm * 0.004 / 1.9'),'production 4mm composition retained');return candidate;}
export async function compileCommonPair(root){
 const compilerInputs=inspectCompilerInputs(root),raw=fs.readFileSync(path.join(root,'inkwave-public',MODULE_PATH),'utf8');
 const {adaptBuildSource}=await import(pathToFileURL(path.join(root,'scripts/inkwave-source-composition.mjs')));
 const {compactModuleStrings}=await import(pathToFileURL(path.join(root,'scripts/lib/inkwave-source-compaction.mjs')));
 const esbuild=createRequire(path.join(root,'package.json'))('esbuild');
 const baseline=adaptBuildSource(MODULE_PATH,raw),candidate=materialCandidateFromBaseline(baseline);
 const emit=async code=>compactModuleStrings((await esbuild.transform(code,{loader:'js',format:'esm',minify:true,charset:'utf8',legalComments:'inline',sourcefile:MODULE_PATH})).code).code;
 return{baseline,candidate,baselineEmitted:await emit(baseline),candidateEmitted:await emit(candidate),compilerInputs,esbuildVersion:esbuild.version,rawSha256:hash(raw)};
}
export function requireCommonEmission(pair,actual,build){assert.equal(pair.esbuildVersion,build?.esbuild,'compiler version must match common build');assert.equal(hash(pair.baselineEmitted),hash(actual),'common A compiler must reproduce exact served production bytes');assert.notEqual(hash(pair.baselineEmitted),hash(pair.candidateEmitted),'B overlay must have a signal');}
export async function prepareCommonMaterial(root,site,out){
 root=path.resolve(root);site=path.resolve(site);out=path.resolve(out);assert.ok(out!==site&&!out.startsWith(site+path.sep));assert.ok(out!==root&&!out.startsWith(root+path.sep),'overlay outside immutable runtime source');
 assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),SOURCE_SHA);
 assert.equal(execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:root,encoding:'utf8'}).trim(),SOURCE_TREE);
 assert.equal(execFileSync('git',['diff','--name-only','HEAD','--'],{cwd:root,encoding:'utf8'}),'','common runtime tracked sources unchanged');
 inspectCompilerInputs(root);const{verifyRuntimeBuild}=await import(pathToFileURL(path.join(root,'scripts/lib/inkwave-runtime-evidence.mjs')));
 const manifest=verifyRuntimeBuild(site,root,SOURCE_SHA),pair=await compileCommonPair(root),actual=fs.readFileSync(path.join(site,'_versions',manifest.build.revision,MODULE_PATH));requireCommonEmission(pair,actual,manifest.build);
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'inkShading.js'),pair.candidateEmitted);
 const receipt={sourceSha:SOURCE_SHA,sourceTree:SOURCE_TREE,modulePath:MODULE_PATH,commonVariant:'A',overlayVariant:'B',inputHash:manifest.inputHash,contentHash:manifest.contentHash,revision:manifest.build.revision,rawSha256:pair.rawSha256,baselineComposedSha256:hash(pair.baseline),candidateComposedSha256:hash(pair.candidate),baselineEmittedSha256:hash(pair.baselineEmitted),candidateEmittedSha256:hash(pair.candidateEmitted),compilerInputs:pair.compilerInputs,esbuildVersion:pair.esbuildVersion,changes:CHANGES,scope:'same common emitted A; B two approved amplitude replacements only',diagnosticOnly:true,performanceAccepted:false};
 fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await prepareCommonMaterial(...process.argv.slice(2));
