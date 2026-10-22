import {requireApprovedCommonBuild} from './lib/inkwave-explosher-common-build.mjs';
// Readiness prototype only. Explicit after-native common build; no capture dispatch.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';import * as esbuild from 'esbuild';
export const HEAD='364dd0a7fad9508652b4b4c6ec3d82eb124e9c5c',BASE='7afb76e80960dde61d51effb89057dd1f183d16f',AFTER='ff05f46db9eb5179440cd2c375663148ca05f48a',REL='patches/splatoon3/runtime/s3-projectile-shapes.mjs';
export const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),blob=b=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(b)+'\0').update(b).digest('hex');
export async function compileInversePair({root,site,baseline,out,sourceEpoch={kind:'leaf-fixture',head:HEAD,tree:null}}){
 root=fs.realpathSync(root);site=fs.realpathSync(site);baseline=fs.realpathSync(baseline);out=path.resolve(out);
 // Resolve existing parent too, to prevent a symlink QA output from targeting production.
 let ancestor=out,tail=[];while(!fs.existsSync(ancestor)){tail.unshift(path.basename(ancestor));ancestor=path.dirname(ancestor);}out=path.join(fs.realpathSync(ancestor),...tail);
 if(out===site||out.startsWith(site+path.sep)||out===root||out.startsWith(root+path.sep))throw Error('QA output must not rewrite source or production build');
 const native=fs.readFileSync(path.join(root,REL),'utf8'),before=fs.readFileSync(baseline,'utf8');
 if(blob(native)!==AFTER||blob(before)!==BASE)throw Error('Unexpected after-native or inverse-baseline source blob');
 const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
 if(build.build.esbuild!==esbuild.version)throw Error('Compiler version differs from build');
 const {adaptBuildSource}=await import(pathToFileURL(path.join(root,'scripts/inkwave-source-composition.mjs'))),{compactModuleStrings}=await import(pathToFileURL(path.join(root,'scripts/lib/inkwave-source-compaction.mjs')));
 const compile=async s=>compactModuleStrings((await esbuild.transform(adaptBuildSource(REL,s),{loader:'js',format:'esm',minify:true,charset:'utf8',legalComments:'inline',sourcefile:REL})).code).code;
 const nativeCode=await compile(native),beforeCode=await compile(before),nativeSha=hash(nativeCode),baselineSha=hash(beforeCode);
 if(nativeSha===baselineSha)throw Error('Distinct source lanes emitted identical bytes');
 const paths=[REL,'_versions/'+build.build.revision+'/'+REL];
 for(const p of paths)if(build.artifacts[p]!==nativeSha||hash(fs.readFileSync(path.join(site,p)))!==nativeSha)throw Error('Recompiled native-after differs from common emitted shape: '+p);
 const common={schema:2,comparisonMode:'after-native-inverse-baseline',sameBuildComparison:true,fullGameTwoBuildAcceptance:false,expectedCommonSourceHead:sourceEpoch.head,commonSourceTree:sourceEpoch.tree,sourceEpochKind:sourceEpoch.kind,finalCommonHeadPending:sourceEpoch.kind!=='published-commit',nativeCaptureReady:sourceEpoch.kind==='published-commit',sourceRoot:root,site,buildContentHash:build.contentHash,compiler:esbuild.version,sourcePath:REL,nativeSourceBlob:AFTER,baselineSourceBlob:BASE,candidateSourceBlob:AFTER,nativeEmittedSha256:nativeSha,baselineEmittedSha256:baselineSha,candidateEmittedSha256:nativeSha,paths};
 fs.mkdirSync(out,{recursive:true});
 for(const[lane,code]of[['before',beforeCode],['after',nativeCode]]){const file=path.join(out,lane+'-shapes.mjs');fs.writeFileSync(file,code);fs.writeFileSync(path.join(out,lane+'-shape-receipt.json'),JSON.stringify({...common,lane,transformedEmittedSha256:hash(code),file},null,2));}
 return common;
}

if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname){const[root,site,baseline,out]=process.argv.slice(2);if(!out)throw Error('Expected common source, site, inverse baseline, output');const admission=requireApprovedCommonBuild(root,site);await compileInversePair({root,site,baseline,out,sourceEpoch:{kind:'published-commit',head:admission.head,tree:admission.tree}});}
