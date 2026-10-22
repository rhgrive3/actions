// Real compiler against a deliberately labelled local fixture, not an admitted build.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import {spawnSync}from'node:child_process';import {fileURLToPath,pathToFileURL}from'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const source=process.env.EXPLOSHER_COMMON_SOURCE_ROOT;
const rel='patches/splatoon3/runtime/s3-projectile-shapes.mjs';
test('real source compiler overlay contract accepts reproduced fixture and rejects provenance changes',async()=>{
 assert(source,'EXPLOSHER_COMMON_SOURCE_ROOT must name the preserved common source');
 const {adaptBuildSource}=await import(pathToFileURL(path.join(root,'scripts/inkwave-source-composition.mjs')));const {compactModuleStrings}=await import(pathToFileURL(path.join(root,'scripts/lib/inkwave-source-compaction.mjs')));const e=await import('esbuild');
 const raw=fs.readFileSync(path.join(source,rel),'utf8'),code=compactModuleStrings((await e.transform(adaptBuildSource(rel,raw),{loader:'js',format:'esm',minify:true,charset:'utf8',legalComments:'inline',sourcefile:rel})).code).code;
 const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
 const dir=fs.mkdtempSync(path.join(root,'overlay-contract-fixture-')),site=path.join(dir,'site'),paths=[rel,'_versions/fixture/'+rel];
 const build={contentHash:'fixture-not-admitted-build',build:{revision:'fixture',esbuild:e.version},artifacts:Object.fromEntries(paths.map(p=>[p,sha(code)]))};
 for(const p of paths){fs.mkdirSync(path.dirname(path.join(site,p)),{recursive:true});fs.writeFileSync(path.join(site,p),code);}
 const save=()=>fs.writeFileSync(path.join(site,'inkwave-build.json'),JSON.stringify(build));save();
 const run=(out=path.join(dir,'qa'),candidate=path.join(root,rel))=>spawnSync(process.execPath,[path.join(root,'scripts/compile-inkwave-explosher-shape-overlay.mjs'),source,site,candidate,out],{encoding:'utf8',env:{...process.env,NODE_OPTIONS:'--preserve-symlinks'}});
 let result=run();assert.equal(result.status,0,result.stderr);const before=JSON.parse(fs.readFileSync(path.join(dir,'qa/before-shape-receipt.json'))),after=JSON.parse(fs.readFileSync(path.join(dir,'qa/after-shape-receipt.json')));
 assert.equal(before.originalEmittedSha256,sha(code));assert.equal(before.transformedEmittedSha256,sha(code));assert.notEqual(after.transformedEmittedSha256,sha(code));assert.deepEqual(before.paths,after.paths);assert.equal(after.fullGameTwoBuildAcceptance,false);
 fs.writeFileSync(path.join(site,paths[1]),code+' ');result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/Recompiled original differs/);fs.writeFileSync(path.join(site,paths[1]),code);
 build.artifacts[paths[0]]='0'.repeat(64);save();assert.notEqual(run().status,0);build.artifacts[paths[0]]=sha(code);save();
 assert.notEqual(run(site).status,0);const bad=path.join(dir,'wrong-shape.mjs');fs.writeFileSync(bad,raw);assert.notEqual(run(path.join(dir,'qa'),bad).status,0);
 build.build.esbuild='0.0.0';save();assert.match(run().stderr,/Compiler version/);
});
