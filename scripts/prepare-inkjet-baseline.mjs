#!/usr/bin/env node
// Diagnostic preparation only: no second site build and no production mutation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { transform, version } from 'esbuild';
import { adaptBuildSource } from './inkwave-source-composition.mjs';
import { compactModuleStrings } from './lib/inkwave-source-compaction.mjs';
const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const baseline=option('--baseline','c72dd6da46f53f3ea931e0263885685172bb12e9');
const candidate=option('--candidate','9c4ca8e60699ce786a96b351fdfc4c7ab3750fa1');
for(const ref of [baseline,candidate])assert.match(ref,/^[a-f0-9]{40}$/);
const site=fs.realpathSync(option('--site','_site'));
const out=path.resolve(option('--output','.ci-scratch/inkjet-baseline'));
assert.ok(out!==site && !out.startsWith(site+path.sep),'never modify emitted production directory');
const modulePath='patches/splatoon3/runtime/special-vfx.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:16*1024*1024});
const source=(ref,file)=>git('show',ref+':'+file);
const allowed=new Set([modulePath,'patches/splatoon3/runtime/inkjet-vfx-budget.mjs','patches/splatoon3/runtime/inkjet-vfx-clock.mjs']);
const changed=git('diff','--name-only',baseline,candidate,'--','patches','inkwave-public','scripts/inkwave-source-composition.mjs','scripts/lib/inkwave-source-compaction.mjs','scripts/build-inkwave.mjs').trim().split('\n').filter(Boolean);
for(const file of changed)if(!file.includes('/tests/')&&!file.endsWith('.md'))assert.ok(allowed.has(file),'shared production input differs: '+file);
for(const file of ['scripts/inkwave-source-composition.mjs','scripts/lib/inkwave-source-compaction.mjs','scripts/build-inkwave.mjs'])assert.equal(fs.readFileSync(file,'utf8'),source(candidate,file),'current compiler input matches candidate '+file);
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);
for(const [file,digest] of Object.entries(manifest.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,file))),digest,file);
const emit=async code=>compactModuleStrings((await transform(adaptBuildSource(modulePath,code),{
 loader:'js',format:'esm',minify:true,charset:'utf8',legalComments:'inline',sourcefile:modulePath
})).code).code;
const candidateSource=source(candidate,modulePath),candidateCode=await emit(candidateSource);
const emittedPath=path.join(site,'_versions',manifest.build.revision,modulePath);
assert.equal(hash(candidateCode),hash(fs.readFileSync(emittedPath)),'same single-file pipeline must reproduce emitted candidate bytes before overlay is trusted');
const baselineSource=source(baseline,modulePath),baselineCode=await emit(baselineSource);
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'special-vfx.mjs'),baselineCode);
const receipt={scope:'diagnostic single-module baseline overlay; not a second production build or benchmark result',baseline,candidate,modulePath,esbuild:version,contentHash:manifest.contentHash,buildRevision:manifest.build.revision,baselineSourceSha256:hash(baselineSource),candidateSourceSha256:hash(candidateSource),baselineEmittedSha256:hash(baselineCode),candidateEmittedSha256:hash(candidateCode),sharedProductionChanges:changed.filter(f=>!f.includes('/tests/')&&!f.endsWith('.md')),benchmarkExecuted:false};
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
