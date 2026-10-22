#!/usr/bin/env node
// QA output only: reproduce and verify shipped main before compiling one controlled variant.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';
import {adaptExplosherControlledBoot,adaptExplosherControlledCompiledBoot} from './lib/inkwave-explosher-volume-barrier.mjs';
const [sourceArg,siteArg,outArg]=process.argv.slice(2);if(!sourceArg||!siteArg||!outArg)throw Error('Expected source, built site and QA output');
const root=path.resolve(sourceArg),site=path.resolve(siteArg),out=path.resolve(outArg),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(out===site||out.startsWith(site+path.sep))throw Error('QA output must not rewrite production build');
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
const {adaptBuildSource}=await import(pathToFileURL(path.join(root,'scripts/inkwave-source-composition.mjs')));
const {compactModuleStrings}=await import(pathToFileURL(path.join(root,'scripts/lib/inkwave-source-compaction.mjs')));
const {adaptCompiledMain}=await import(pathToFileURL(path.join(root,'patches/loading-cache/adapter.mjs')));
const {parse}=await import(pathToFileURL(path.join(root,'patches/loading-cache/vendor/acorn.mjs')));
const esbuild=await import('esbuild');if(build.build.esbuild!==esbuild.version)throw Error('Compiler version differs from build');
const raw=fs.readFileSync(path.join(root,'inkwave-public/src/main.js'),'utf8'),composed=adaptBuildSource('src/main.js',raw),controlled=adaptExplosherControlledBoot(composed);
const compile=async source=>compactModuleStrings((await esbuild.transform(source,{loader:'js',format:'esm',minify:true,charset:'utf8',legalComments:'inline',sourcefile:'src/main.js'})).code).code;
const minified=await compile(composed);
const original=adaptCompiledMain(minified).code,transformed=adaptExplosherControlledCompiledBoot(original,parse),originalSha=hash(original),transformedSha=hash(transformed);
const paths=['src/main.js','_versions/'+build.build.revision+'/src/main.js'];
for(const p of paths)if(build.artifacts[p]!==originalSha||hash(fs.readFileSync(path.join(site,p)))!==originalSha)throw Error('Recompiled original differs from emitted main: '+p);
fs.mkdirSync(out,{recursive:true});const file=path.join(out,'controlled-main.js');fs.writeFileSync(file,transformed);
const receipt={controlledInitialCondition:true,naturalBootAccepted:false,sourceRoot:root,site,buildContentHash:build.contentHash,compiler:esbuild.version,rawSourceSha256:hash(raw),composedSha256:hash(composed),rawControlledDesignSha256:hash(controlled),postMinificationAdapterSha256:hash(fs.readFileSync(path.join(root,'patches/loading-cache/adapter.mjs'))),controlledInsertionStage:'after-native-loading-adapter',originalEmittedSha256:originalSha,transformedEmittedSha256:transformedSha,paths,file};
fs.writeFileSync(path.join(out,'controlled-main-receipt.json'),JSON.stringify(receipt,null,2));console.log('EXPLOSHER_CONTROLLED_MAIN '+JSON.stringify(receipt));
