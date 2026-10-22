#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import * as esbuild from 'esbuild';
import {WIPER_SOURCE,WIPER_TREE,WIPER_BASELINE,WIPER_MODULES,assertWiperCurrentBinding} from './lib/inkwave-wiper-current-binding.mjs';
const [sourceArg,siteArg,outArg]=process.argv.slice(2);assert.equal(process.argv.slice(2).length,3);const source=path.resolve(sourceArg),site=path.resolve(siteArg),out=path.resolve(outArg);
const git=(...args)=>execFileSync('git',args,{cwd:source,encoding:'utf8',maxBuffer:8*1024*1024});
assert.equal(git('rev-parse','HEAD').trim(),WIPER_SOURCE);assert.equal(git('rev-parse',WIPER_SOURCE+'^{tree}').trim(),WIPER_TREE);assert.equal(git('status','--porcelain','--untracked-files=no').trim(),'');
const {verifyRuntimeBuild,hash}=await import(pathToFileURL(path.join(source,'scripts/lib/inkwave-runtime-evidence.mjs')));
const {adaptBuildSource}=await import(pathToFileURL(path.join(source,'scripts/inkwave-source-composition.mjs')));
const {compactModuleStrings}=await import(pathToFileURL(path.join(source,'scripts/lib/inkwave-source-compaction.mjs')));
const manifest=verifyRuntimeBuild(site,source,WIPER_SOURCE);assert.equal(esbuild.version,'0.28.2');assert.equal(manifest.build.esbuild,esbuild.version);
const modules=[],output=[];
for(const [name,pins]of Object.entries(WIPER_MODULES)){
 const rel='patches/splatoon3/runtime/'+name,candidateSource=git('show',WIPER_SOURCE+':'+rel),baselineSource=git('show',WIPER_BASELINE+':'+rel);
 assert.equal(hash(candidateSource),pins.candidate);assert.equal(hash(baselineSource),pins.baseline);
 const emit=async code=>compactModuleStrings((await esbuild.transform(adaptBuildSource(rel,code),{loader:'js',format:'esm',minify:true,charset:'utf8',legalComments:'inline',sourcefile:rel})).code).code;
 const candidateBytes=await emit(candidateSource),baselineBytes=await emit(baselineSource),served='_versions/'+manifest.build.revision+'/'+rel;
 assert.equal(hash(candidateBytes),manifest.artifacts[served],'Exact current production emission recipe');assert.equal(candidateBytes,fs.readFileSync(path.join(site,served),'utf8'));
 modules.push({name,rel,candidateSourceSha256:hash(candidateSource),baselineSourceSha256:hash(baselineSource),candidateEmittedSha256:hash(candidateBytes),baselineEmittedSha256:hash(baselineBytes)});output.push([name,baselineBytes]);
}
const receipt={schema:1,candidate:WIPER_SOURCE,sourceTree:WIPER_TREE,baseline:WIPER_BASELINE,contentHash:manifest.contentHash,inputHash:manifest.inputHash,revision:manifest.build.revision,compiler:esbuild.version,modules,scope:'Verified two-module historical visual overlay on complete current production runtime; no runtime or model edits'};
assertWiperCurrentBinding(manifest,receipt);assert.ok(!fs.existsSync(out),'Use fresh overlay output; do not overwrite historical evidence');fs.mkdirSync(out,{recursive:true});for(const [name,bytes]of output)fs.writeFileSync(path.join(out,name),bytes);fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
