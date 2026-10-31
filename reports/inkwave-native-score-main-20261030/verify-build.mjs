import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const roots=['/workspace/actions-score-base','/workspace/actions-score-main'];
const results=[];
for(const root of roots){
  const load=rel=>import(pathToFileURL(path.join(root,rel)));
  const {verifyRuntimeBuild,indexPrebuiltRuntimeAssets,hash}=await load('scripts/lib/inkwave-runtime-evidence.mjs');
  const sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const site=path.join(root,'_site'),manifest=verifyRuntimeBuild(site,root,sourceSha);
  assert.equal(hash(JSON.stringify(manifest.files)),manifest.inputHash);
  const assets=JSON.parse(fs.readFileSync(path.join(root,'.ci-scratch/score-main-verify/assets.json')));
  const prebuilt=indexPrebuiltRuntimeAssets(site,manifest);
  assert.equal(Object.keys(prebuilt).length,17);
  for(const file of assets.files){
    const bytes=fs.readFileSync(path.join(site,file.file));
    assert.equal(bytes.length,file.bytes,file.file);
    assert.equal(hash(bytes),file.sha256,file.file);
    assert.equal(prebuilt[file.file],file.sha256,file.file);
  }
  const rel='patches/splatoon3/runtime/scoring.mjs';
  const {adaptBuildSource}=await load('scripts/inkwave-source-composition.mjs');
  const {compactModuleStrings}=await load('scripts/lib/inkwave-source-compaction.mjs');
  const esbuild=await load('node_modules/esbuild/lib/main.js');
  const source=fs.readFileSync(path.join(root,rel),'utf8');
  const compiled=await esbuild.transform(adaptBuildSource(rel,source),{loader:'js',format:'esm',minify:true,charset:'utf8',legalComments:'inline',sourcefile:rel});
  const expected=compactModuleStrings(compiled.code).code;
  for(const artifact of [rel,'_versions/'+manifest.build.revision+'/'+rel])assert.equal(fs.readFileSync(path.join(site,artifact),'utf8'),expected,artifact);
  const result={status:'passed',root,sourceSha,contentHash:manifest.contentHash,inputHash:manifest.inputHash,revision:manifest.build.revision,sourceInputs:Object.keys(manifest.files).length,artifacts:Object.keys(manifest.artifacts).length,runtimeSourceSha256:hash(source),runtimeEmittedSha256:hash(expected),runtimeEmittedBytes:Buffer.byteLength(expected),scoringRecompiledExact:true,prebuiltFiles:Object.keys(prebuilt).length,prebuiltAssetsVerified:true,stageSha256:assets.files[0].sha256,nativeSourceSha256:JSON.parse(fs.readFileSync(path.join(site,'native-prebuilt/hagglefish/stage.json'))).sourceSha256};
  fs.writeFileSync(path.join(root,'.ci-scratch/score-main-verify/build-binding.json'),JSON.stringify(result,null,2)+'\n');
  results.push({manifest,result});
  console.log(JSON.stringify(result));
}
const changedInputs=Object.keys(results[0].manifest.files).filter(k=>results[0].manifest.files[k]!==results[1].manifest.files[k]);
assert.deepEqual(Object.keys(results[0].manifest.files),Object.keys(results[1].manifest.files));
assert.deepEqual(changedInputs,['patch/runtime/scoring.mjs']);
const plain=m=>Object.fromEntries(Object.entries(m.artifacts).filter(([k])=>!k.startsWith('_versions/')));
const before=plain(results[0].manifest),after=plain(results[1].manifest);
assert.deepEqual(Object.keys(before),Object.keys(after));
const changedArtifacts=Object.keys(before).filter(k=>before[k]!==after[k]);
fs.writeFileSync('/workspace/actions-score-main/.ci-scratch/score-main-verify/build-comparison.json',JSON.stringify({status:'passed',changedInputs,changedArtifacts},null,2)+'\n');
console.log(JSON.stringify({changedInputs,changedArtifacts}));
