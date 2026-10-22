#!/usr/bin/env node
// QA-only baseline overlay, from literal material candidate 429cc. One unchanged build.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {transform} from 'esbuild';
import {adaptBuildSource} from './inkwave-source-composition.mjs';
import {compactModuleStrings} from './lib/inkwave-source-compaction.mjs';
import {verifyRuntimeBuild} from './lib/inkwave-runtime-evidence.mjs';
const source=path.resolve(process.argv[2]),site=path.resolve(process.argv[3]),out=path.resolve(process.argv[4]);
const sha='429cc1352d9b13ffe83c579ed714b84acf6139ed',rel='src/world/inkShading.js',hash=x=>createHash('sha256').update(x).digest('hex');
assert.ok(out!==site&&!out.startsWith(site+path.sep));
const manifest=verifyRuntimeBuild(site,source,sha),raw=fs.readFileSync(path.join(source,'inkwave-public',rel),'utf8');
const candidate=adaptBuildSource(rel,raw);
const changes=[['(0.7125 - 0.375 * gFresh)','(0.95 - 0.5 * gFresh)'],['* 0.02625 * gf * gInk;','* 0.035 * gf * gInk;']];
let baseline=candidate;
for(const [a,b]of changes){assert.equal(baseline.split(a).length,2);baseline=baseline.replace(a,b);}
let reversed=baseline;for(const [a,b]of changes){assert.equal(reversed.split(b).length,2);reversed=reversed.replace(b,a);}assert.equal(reversed,candidate);
assert.ok(baseline.includes('gInkD *= uPpm * 0.004 / 1.9'));
const emit=async code=>compactModuleStrings((await transform(code,{loader:'js',format:'esm',minify:true,charset:'utf8',legalComments:'inline',sourcefile:rel})).code).code;
const emitted=await emit(candidate),before=await emit(baseline);
assert.equal(hash(emitted),hash(fs.readFileSync(path.join(site,'_versions',manifest.build.revision,rel))),'candidate compiler reproduces exact emitted bytes');
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'inkShading.js'),before);
const receipt={sourceSha:sha,modulePath:rel,inputHash:manifest.inputHash,contentHash:manifest.contentHash,revision:manifest.build.revision,rawSha256:hash(raw),candidateComposedSha256:hash(candidate),baselineComposedSha256:hash(baseline),candidateEmittedSha256:hash(emitted),baselineEmittedSha256:hash(before),changes,scope:'two-amplitude inverse only; no source/build mutation'};
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
