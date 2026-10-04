#!/usr/bin/env node
// Reproduce the new post-minification stage from a verified main Pages artifact.
// This is NOT a fresh esbuild/exact-source attestation; provenance records that distinction.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import { prepareLoading,finalizeLoadingWorker,loadingIdentity } from '../patches/loading-cache/adapter.mjs';
const src=path.resolve(process.argv[2]||''),out=path.resolve(process.argv[3]||'');
if(process.argv.length<4||src===out||src.startsWith(out+path.sep)||out.startsWith(src+path.sep))throw new Error('Usage: node scripts/replay-inkwave-startup.mjs <verified baseline site> <separate output>');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]).sort();
const baseline=JSON.parse(fs.readFileSync(path.join(src,'inkwave-build.json'),'utf8'));
if(hash(JSON.stringify(baseline.artifacts))!==baseline.contentHash)throw new Error('Baseline content manifest hash mismatch');
for(const [file,expected]of Object.entries(baseline.artifacts))if(hash(fs.readFileSync(path.join(src,file)))!==expected)throw new Error('Baseline artifact mismatch: '+file);
const staged=out+'.building';if(fs.existsSync(staged)||fs.existsSync(out))throw new Error('Use an empty output; existing work is never overwritten by replay');
fs.mkdirSync(staged,{recursive:true});
for(const file of walk(src)){
 const rel=path.relative(src,file);if(rel.startsWith('_versions/')||rel==='inkwave-build.json')continue;
 const dst=path.join(staged,rel);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(file,dst);
}
let html=fs.readFileSync(path.join(staged,'index.html'),'utf8');
const base=`<base href="./_versions/${baseline.build.revision}/">\n`;
if(html.split(base).length!==2)throw new Error('Expected one exact baseline base tag');
html=html.replace(base,'');fs.writeFileSync(path.join(staged,'index.html'),html);
const stagedRevision=hash(JSON.stringify(walk(staged).map(file=>[path.relative(staged,file),hash(fs.readFileSync(file))])));
if(stagedRevision!==baseline.build.revision)throw new Error('Baseline pre-version staging tree does not reproduce the recorded revision');
const preloads=[...html.matchAll(/<link rel="modulepreload" href="\.\/([^"]+)">/g)].map(m=>m[1]);
const plan=prepareLoading(staged,preloads);
html=fs.readFileSync(path.join(staged,'index.html'),'utf8');
const revision=hash(JSON.stringify(walk(staged).map(file=>[path.relative(staged,file),hash(fs.readFileSync(file))])));
for(const file of walk(staged)){
 const rel=path.relative(staged,file);if(['index.html','.nojekyll'].includes(rel))continue;
 const dst=path.join(staged,'_versions',revision,rel);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(file,dst);
}
fs.writeFileSync(path.join(staged,'index.html'),html.replace('<head>',`<head>\n<base href="./_versions/${revision}/">`));
const summary=finalizeLoadingWorker(staged,revision,plan);
const identity=structuredClone(baseline);
identity.build.revision=revision;
identity.build.script=hash(fs.readFileSync(new URL('./build-inkwave.mjs',import.meta.url)));
identity.build.loadingCache={source:loadingIdentity(),...summary};
identity.build.replay={baselineRevision:baseline.build.revision,baselineContentHash:baseline.contentHash,stagedTreeReproduced:true,freshSourceBuildExecuted:false,productCommitAttested:false};
for(const [file,sha]of Object.entries(identity.build.loadingCache.source))identity.files['loading-cache/'+file]=sha;
identity.inputHash=hash(JSON.stringify(identity.files));
identity.artifacts=Object.fromEntries(walk(staged).map(file=>[path.relative(staged,file),hash(fs.readFileSync(file))]));
identity.contentHash=hash(JSON.stringify(identity.artifacts));
fs.writeFileSync(path.join(staged,'inkwave-build.json'),JSON.stringify(identity,null,2)+'\n');
fs.renameSync(staged,out);
console.log(JSON.stringify({status:'replayed',...summary,baselineStagedRevision:stagedRevision,freshSourceBuildExecuted:false,phaseMap:plan.phases},null,2));
