#!/usr/bin/env node
// Diagnostic overlay: one common build, only the admitted halo source differs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as esbuild from 'esbuild';
const [sourceArg,siteArg,candidateArg,outArg]=process.argv.slice(2);
if(!outArg)throw Error('Expected common source, built site, candidate source and QA output');
const root=path.resolve(sourceArg),site=path.resolve(siteArg),candidate=path.resolve(candidateArg),out=path.resolve(outArg);
if(out===site||out.startsWith(site+path.sep))throw Error('QA output must not rewrite production build');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const blob=b=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(b)+'\0').update(b).digest('hex');
const rel='patches/splatoon3/runtime/s3-projectile-shapes.mjs';
const base=fs.readFileSync(path.join(root,rel),'utf8'),after=fs.readFileSync(candidate,'utf8');
if(blob(base)!=='83a76f51f56cffdf66bca6e16c56dd18b2c06f93'||blob(after)!=='351427cd20c9726dd21c3cbe949078cbce23c81b')throw Error('Unexpected common/halo source blob');
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
if(build.build.esbuild!==esbuild.version)throw Error('Compiler version differs from build');
const {adaptBuildSource}=await import(pathToFileURL(path.join(root,'scripts/inkwave-source-composition.mjs')));
const {compactModuleStrings}=await import(pathToFileURL(path.join(root,'scripts/lib/inkwave-source-compaction.mjs')));
const compile=async raw=>compactModuleStrings((await esbuild.transform(adaptBuildSource(rel,raw),{loader:'js',format:'esm',minify:true,charset:'utf8',legalComments:'inline',sourcefile:rel})).code).code;
const original=await compile(base),transformed=await compile(after),originalSha=hash(original),transformedSha=hash(transformed);
const paths=[rel,'_versions/'+build.build.revision+'/'+rel];
for(const p of paths)if(build.artifacts[p]!==originalSha||hash(fs.readFileSync(path.join(site,p)))!==originalSha)throw Error('Recompiled original differs from common emitted shape: '+p);
fs.mkdirSync(out,{recursive:true});
for(const [lane,code]of [['before',original],['after',transformed]]){
 const file=path.join(out,lane+'-shapes.mjs');fs.writeFileSync(file,code);
 const receipt={schema:1,lane,sameBuildComparison:true,fullGameTwoBuildAcceptance:false,expectedCommonSourceHead:'cc0c90afe8031643e6a890974f8f44a40a30509e',sourceRoot:root,site,buildContentHash:build.contentHash,compiler:esbuild.version,sourcePath:rel,baselineSourceBlob:blob(base),candidateSourceBlob:blob(after),originalEmittedSha256:originalSha,transformedEmittedSha256:hash(code),candidateEmittedSha256:transformedSha,paths,file};
 fs.writeFileSync(path.join(out,lane+'-shape-receipt.json'),JSON.stringify(receipt,null,2));
}
console.log(JSON.stringify({sameBuildComparison:true,originalSha,candidateSha:transformedSha,paths}));
