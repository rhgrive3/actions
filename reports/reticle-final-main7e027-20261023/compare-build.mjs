import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const [repo, currentSite, measuredSite, originalSite] = process.argv.slice(2);
assert.ok(repo && currentSite && measuredSite && originalSite, 'repo and three build directories required');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, {cwd:repo, encoding:'utf8', maxBuffer:16*1024*1024}).trimEnd();
const load = site => JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const now=load(currentSite), measured=load(measuredSite), original=load(originalSite);
const delta = (before, after) => [...new Set([...Object.keys(before),...Object.keys(after)])].filter(key=>before[key]!==after[key]);
const prefixes = {'upstream/':'inkwave-public/','patch/':'patches/splatoon3/','touch-layout/':'patches/touch-layout/','reliability/':'patches/reliability/','local-quality/':'patches/local-quality/','network-replication/':'patches/network-replication/','loading-cache/':'patches/loading-cache/','practice-range/':'patches/practice-range/','native-stages/':'patches/native-stages/','build-script/':'scripts/'};
const entries=Object.entries(now.files).map(([key,sha256])=>{
  const prefix=Object.keys(prefixes).find(prefix=>key.startsWith(prefix));
  assert.ok(prefix, `known canonical prefix: ${key}`);
  const file=prefixes[prefix]+key.slice(prefix.length);
  assert.equal(hash(fs.readFileSync(path.join(repo,file))),sha256,`input bytes: ${key}`);
  return {key,file,sha256};
});
const tree=new Map(git('ls-tree','-r','-z','HEAD').split('\0').filter(Boolean).map(row=>{
  const [header,file]=row.split('\t');return [file,header.split(' ')[2]];
}));
const objectIds=execFileSync('git',['hash-object','--stdin-paths'],{cwd:repo,encoding:'utf8',input:entries.map(row=>row.file).join('\n')+'\n'}).trim().split('\n');
entries.forEach((row,index)=>assert.equal(objectIds[index],tree.get(row.file),`committed input: ${row.file}`));
assert.equal(hash(fs.readFileSync(path.join(repo,'scripts/build-inkwave.mjs'))),now.build.script,'builder bytes');
assert.equal(git('hash-object','scripts/build-inkwave.mjs'),tree.get('scripts/build-inkwave.mjs'),'committed builder');
for (const [file,digest] of Object.entries(now.artifacts)) assert.equal(hash(fs.readFileSync(path.join(currentSite,file))),digest,`artifact bytes: ${file}`);
assert.equal(hash(JSON.stringify(now.files)),now.inputHash,'input manifest digest');
assert.equal(hash(JSON.stringify(now.artifacts)),now.contentHash,'artifact manifest digest');
assert.deepEqual(now.files,measured.files,'all canonical inputs equal prior browser build');
assert.deepEqual(now.artifacts,measured.artifacts,'all root/versioned artifacts equal prior browser build');
assert.equal(now.build.script,measured.build.script,'builder equal prior browser build');
assert.equal(now.build.revision,measured.build.revision,'build revision equal prior browser build');
const main='7e027ac2ff7eea31c04155e0ee1e0d3e5604ed51';
const protectedPaths=['inkwave-public','.github/workflows','patches/splatoon3/runtime','scripts/build-inkwave.mjs','scripts/inkwave-source-composition.mjs'];
assert.equal(git('diff','--name-only',main,'HEAD','--',...protectedPaths),'','no protected or special runtime changes');
const donor='22f3b7534ae2093aef4c2549112a85a1da09bbf3';
const qaPaths=['scripts/check-inkwave-local-references.mjs','scripts/tests/inkwave-local-references.test.mjs'];
const qaBlobs=Object.fromEntries(qaPaths.map(file=>{
  const blob=git('rev-parse',`HEAD:${file}`);assert.equal(blob,git('rev-parse',`${donor}:${file}`),'exact QA donor leaf');return [file,blob];
}));
const hud='patches/local-quality/s3-hud-look-adapter.mjs';
assert.equal(git('rev-parse',`HEAD:${hud}`),git('rev-parse',`c74a2d6011777eae7e001297c018ffcecaa263e7:${hud}`),'original HUD candidate preserved');
const changedPaths=git('diff','--name-only',main,'HEAD').split('\n');
const runtimePaths=changedPaths.filter(file=>!file.startsWith('reports/')&&!file.includes('/tests/')&&!file.startsWith('scripts/'));
assert.deepEqual(runtimePaths,[hud],'only HUD runtime leaf changes');
const receipt={
  status:'passed',checkedCommit:git('rev-parse','HEAD'),checkedTree:git('rev-parse','HEAD^{tree}'),baseMain:main,
  inputsVerified:entries.length,artifactsVerified:Object.keys(now.artifacts).length,inputHash:now.inputHash,contentHash:now.contentHash,revision:now.build.revision,builderSha256:now.build.script,
  versusMeasuredMain7e:{inputDelta:delta(measured.files,now.files),artifactDelta:delta(measured.artifacts,now.artifacts),fullManifestByteEqual:fs.readFileSync(path.join(currentSite,'inkwave-build.json')).equals(fs.readFileSync(path.join(measuredSite,'inkwave-build.json'))),browserEvidenceCommit:'e9f837d0c22191cb522907797a9af3c506fbaef2',browserRerun:false,acceptance:'reuse earlier normal Chromium/SwiftShader evidence by exact input/output equality; no new browser or hardware GPU claim'},
  versusOriginalC74:{inputDelta:delta(original.files,now.files),contentHash:original.contentHash},
  qaDonor:donor,qaBlobs,hudBlob:git('rev-parse',`HEAD:${hud}`),runtimePaths,changedPaths,
  protectedPathsUnchanged:protectedPaths,
  gates:{retailMotion:'reference media access denied; no bypass or new native measurement',liveTransport:'not tested against live relay; accepted ACK plus normal hit-forward/source dispatch produces one marker in 364409f1c699eb1269153419f4591ef2844521a2',hardwareGPU:'unverified',remoteRequiredCI:'not asserted by local checks'}
};
console.log(JSON.stringify(receipt,null,2));
