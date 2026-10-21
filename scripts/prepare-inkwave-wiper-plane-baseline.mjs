#!/usr/bin/env node
// QA-only two-module overlay. Never mutate the production site or source.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {transform,version} from 'esbuild';
import {adaptBuildSource} from './inkwave-source-composition.mjs';
import {compactModuleStrings} from './lib/inkwave-source-compaction.mjs';
import {verifyRuntimeBuild,hash} from './lib/inkwave-runtime-evidence.mjs';
const [sourceArg,siteArg,outArg]=process.argv.slice(2);if(!outArg)throw Error('Usage: source site out');
const source=path.resolve(sourceArg),site=path.resolve(siteArg),out=path.resolve(outArg);
const candidate='0430673b09a5009628fc87baa414b3560090fc1d',baseline='7581ca9be8cf87d253918b8abb3b8ebe728c2093';
const git=args=>execFileSync('git',['-C',source,...args],{encoding:'utf8',maxBuffer:32*1024*1024});
assert.equal(git(['rev-parse','HEAD']).trim(),candidate);assert.equal(version,'0.28.2');
assert.ok(out!==site&&!out.startsWith(site+path.sep)&&out!==source&&!out.startsWith(source+path.sep));
const allowed=new Set(['patches/splatoon3/runtime/s3-projectile-shapes.mjs','patches/splatoon3/runtime/s3-ink-sheets.mjs']);
const changed=git(['diff','--name-only',baseline,candidate,'--','patches','inkwave-public','scripts/inkwave-source-composition.mjs','scripts/lib/inkwave-source-compaction.mjs','scripts/build-inkwave.mjs']).trim().split('\n').filter(Boolean);
for(const file of changed)if(!file.includes('/tests/')&&!file.endsWith('.md'))assert.ok(allowed.has(file),'unexpected baseline production difference '+file);
for(const file of ['scripts/inkwave-source-composition.mjs','scripts/lib/inkwave-source-compaction.mjs','scripts/build-inkwave.mjs'])assert.equal(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),git(['show',candidate+':'+file]));
const manifest=verifyRuntimeBuild(site,source,candidate),modules=[];
for(const name of ['s3-projectile-shapes.mjs','s3-ink-sheets.mjs']){
 const rel='patches/splatoon3/runtime/'+name,current=git(['show',candidate+':'+rel]),old=git(['show',baseline+':'+rel]);
 assert.equal(fs.readFileSync(path.join(source,rel),'utf8'),current);
 const emit=async raw=>compactModuleStrings((await transform(adaptBuildSource(rel,raw),{loader:'js',format:'esm',minify:true,charset:'utf8',legalComments:'inline',sourcefile:rel})).code).code;
 const after=await emit(current),before=await emit(old),emitted=path.join(site,'_versions',manifest.build.revision,rel);
 assert.equal(hash(after),hash(fs.readFileSync(emitted)),'exact candidate compiler reproduction '+rel);
 modules.push({rel,name,candidateSourceSha256:hash(current),baselineSourceSha256:hash(old),candidateEmittedSha256:hash(after),baselineEmittedSha256:hash(before),bytes:before});
}
const receipt={schema:1,candidate,baseline,contentHash:manifest.contentHash,inputHash:manifest.inputHash,revision:manifest.build.revision,compiler:version,modules:modules.map(({bytes,...m})=>m),scope:'two-module baseline overlay on unchanged candidate production build'};
fs.mkdirSync(out,{recursive:true});for(const m of modules)fs.writeFileSync(path.join(out,m.name),m.bytes);
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
