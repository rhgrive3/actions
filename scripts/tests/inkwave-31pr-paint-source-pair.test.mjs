import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {ALL_31_PRS_SOURCE_PAIR as P,POST_30_PRS_SOURCE_PAIR as D,POST_30_PRS_POSE_PAIR,ALL_31_PRS_FIXTURE_SHA256 as ALL_PRS_FIXTURE_SHA256} from '../lib/inkwave-31pr-paint-source-pair.mjs';
import {CHARACTER_POSE_PATHS,planCharacterPoseBaseline} from '../lib/inkwave-character-pose-baseline.mjs';
import {RESPAWN_1862_POSE_PAIR as RESPAWN} from '../lib/inkwave-respawn1862-source-pair.mjs';
import {MAIN_INK_BASELINE_PATHS as paths,planMainInkBaseline,gitBlobSha1} from '../lib/inkwave-main-ink-baseline.mjs';
const packed=fs.readFileSync(new URL('../fixtures/inkwave-31pr-paint-source-pair.json.gz',import.meta.url));
assert.equal(createHash('sha256').update(packed).digest('hex'),ALL_PRS_FIXTURE_SHA256);
const fixture=JSON.parse(gunzipSync(packed));
const maps=()=>[new Map(Object.entries(fixture.baseline)),new Map(Object.entries(fixture.candidate))];
const expected={mode:'current-pair-with-gameplay-differences',sourceBase:P.baseCommit,sourceHead:P.candidateCommit};
test('all thirteen exact source leaves admit without replay or a physics equality claim',()=>{
 const [before,after]=maps(),snap=JSON.stringify([...before]);
 assert.deepEqual(Object.keys(P.blobs),paths);
 for(const path of paths){
  assert.equal(gitBlobSha1(before.get(path)),P.blobs[path].base);
  assert.equal(gitBlobSha1(after.get(path)),P.blobs[path].candidate);
  assert.equal(fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8'),after.get(path),'current source must match the additional fixed epoch');
 }
 const result=planMainInkBaseline(before,after,expected);
 assert.equal(JSON.stringify([...result.sources]),snap);assert.deepEqual(result.changes,[]);
 assert.equal(result.evidence.paths.filter(p=>p.originalGitBlob!==p.candidateGitBlob).length,9);
 for(const p of result.evidence.paths){assert.equal(p.originalGitBlob,p.referenceGitBlob);assert.deepEqual(p.replayed,[]);}
 assert.match(result.evidence.validationLimit,/full native browser\/image comparisons remain mandatory/);
});
test('missing, changed, reversed and falsely identical current tuples cannot gain admission',()=>{
 for(const side of [0,1])for(const path of paths)for(const omit of [false,true]){
  const pair=maps();if(omit)pair[side].delete(path);else pair[side].set(path,pair[side].get(path)+' ');
  assert.throws(()=>planMainInkBaseline(...pair,expected));
 }
 const [before,after]=maps();
 for(const pair of [[after,before],[before,before],[after,after]])assert.throws(()=>planMainInkBaseline(...pair,expected));
 for(const key of ['sourceBase','sourceHead'])assert.throws(()=>planMainInkBaseline(before,after,{...expected,[key]:'a'.repeat(40)}));
});
test('actual controls CLI accepts only the frozen nine-difference tuple and completes every negative control',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-31pr-cli-'));
 try{
  const before=path.join(root,'before'),after=path.join(root,'after'),receipt=path.join(root,'receipt.json');
  for(const [directory,rows]of [[before,fixture.baseline],[after,fixture.candidate]]){
   for(const [relative,text]of Object.entries(rows)){
    const file=path.join(directory,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);
   }
   fs.writeFileSync(path.join(directory,'patches/splatoon3/profile.json'),fs.readFileSync(new URL('../../patches/splatoon3/profile.json',import.meta.url)));
  }
  const cli=fileURLToPath(new URL('../check-inkwave-current-pair-controls.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[cli,'--baseline',before,'--candidate',after,
   '--expected-mode',expected.mode,'--expected-source-base',expected.sourceBase,
   '--expected-source-head',expected.sourceHead,'--receipt',receipt],{encoding:'utf8',timeout:60000});
  assert.equal(result.status,0,result.stderr);
  const out=JSON.parse(fs.readFileSync(receipt,'utf8'));
  assert.deepEqual(out.counts,{positiveCli:2,cliRejected:56,helperRejected:29});
  assert.equal(out.originalInputsUnchanged,true);assert.equal(out.scratchRemoved,true);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

const deltaExpected={mode:'current-pair-with-gameplay-differences',sourceBase:D.baseCommit,sourceHead:D.candidateCommit};
const deltaMaps=()=>[new Map(Object.entries(fixture.post30Baseline)),new Map(Object.entries(fixture.candidate))];
test('the subsequent batch preserves the integrated main and admits exactly its one differing source leaf',()=>{
 const [before,after]=deltaMaps(),original=JSON.stringify([...before]);
 for(const path of paths){assert.equal(gitBlobSha1(before.get(path)),D.blobs[path].base);assert.equal(gitBlobSha1(after.get(path)),D.blobs[path].candidate);}
 const result=planMainInkBaseline(before,after,deltaExpected);
 assert.deepEqual(result.changes,[]);assert.equal(JSON.stringify([...result.sources]),original);
 assert.equal(result.evidence.paths.filter(p=>p.originalGitBlob!==p.candidateGitBlob).length,1);
 for(const p of result.evidence.paths){assert.equal(p.originalGitBlob,p.referenceGitBlob);assert.deepEqual(p.replayed,[]);}
 for(const side of [0,1])for(const path of paths)for(const omit of [false,true]){
  const pair=deltaMaps();if(omit)pair[side].delete(path);else pair[side].set(path,pair[side].get(path)+' ');
  assert.throws(()=>planMainInkBaseline(...pair,deltaExpected));
 }
 for(const pair of [[after,before],[before,before],[after,after]])assert.throws(()=>planMainInkBaseline(...pair,deltaExpected));
});
test('only the sixteen pinned pose source leaves are identical after the first batch, with no replay',()=>{
 const maps=()=>[new Map(Object.entries(fixture.post30Pose)),new Map(Object.entries(fixture.post30Pose))];
 const [before,after]=maps(),result=planCharacterPoseBaseline(before,after);
 assert.equal(result.pairEvidence.mode,POST_30_PRS_POSE_PAIR.mode);assert.deepEqual(result.changes,[]);
 assert.deepEqual([...result.sources],[...before]);
 for(const path of CHARACTER_POSE_PATHS){
  assert.equal(gitBlobSha1(before.get(path)),POST_30_PRS_POSE_PAIR.paths[path].baseline);
  assert.equal(gitBlobSha1(after.get(path)),POST_30_PRS_POSE_PAIR.paths[path].candidate);
  for(const side of [0,1])for(const omit of [false,true]){
   const pair=maps();if(omit)pair[side].delete(path);else pair[side].set(path,pair[side].get(path)+' ');
   assert.throws(()=>planCharacterPoseBaseline(...pair));
  }
 }
});
// Keep the historical fixtures above pinned. Admit the reviewed respawn delta
// as its own complete tuple, preserving both inputs without historical replay.
const respawnMaps=()=>[new Map(Object.entries(fixture.post30Pose)),
 new Map(CHARACTER_POSE_PATHS.map(p=>[p,fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8')]))];
test('1862 admits exactly the reviewed sixteen-leaf main/respawn pair without replay',()=>{
 const [before,after]=respawnMaps(),snap=[...before],subject=[...after];
 assert.deepEqual(Object.keys(RESPAWN.paths),CHARACTER_POSE_PATHS);
 for(const p of CHARACTER_POSE_PATHS){
  assert.equal(gitBlobSha1(before.get(p)),RESPAWN.paths[p].baseline,p+' baseline');
  assert.equal(gitBlobSha1(after.get(p)),RESPAWN.paths[p].candidate,p+' current source');
 }
 const result=planCharacterPoseBaseline(before,after);
 assert.equal(result.pairEvidence.mode,'current-pose-pair-with-gameplay-differences');
 assert.equal(result.pairEvidence.sourceBase,RESPAWN.sourceBase);assert.equal(result.pairEvidence.sourceHead,RESPAWN.sourceHead);
 assert.deepEqual(result.changes,[]);assert.deepEqual([...result.sources],snap);
 assert.deepEqual([...before],snap);assert.deepEqual([...after],subject);
 assert.equal(result.evidence.length,16);
 assert.deepEqual(result.evidence.filter(p=>p.originalGitBlob!==p.candidateGitBlob).map(p=>p.path),
  ['patches/splatoon3/runtime/roller.mjs','patches/splatoon3/runtime/weapon-handoff-motion.mjs']);
 for(const p of result.evidence){assert.equal(p.referenceGitBlob,p.originalGitBlob);assert.equal(p.referenceSha256,p.originalSha256);assert.equal(p.changed,false);assert.deepEqual(p.replayed,[]);}
 assert.match(result.pairEvidence.validationLimit,/not pose or gameplay equivalence/);
});
test('1862 rejects every missing/altered leaf, both-side drift, reversal and partial epoch',()=>{
 const [before,after]=respawnMaps();
 const rejects=(b,c)=>{const snap=[...b],subject=[...c];assert.throws(()=>planCharacterPoseBaseline(b,c));assert.deepEqual([...b],snap);assert.deepEqual([...c],subject);};
 for(const p of CHARACTER_POSE_PATHS)for(const sides of [[0],[1],[0,1]])for(const missing of [false,true]){
  const pair=[new Map(before),new Map(after)];
  for(const side of sides)if(missing)pair[side].delete(p);else pair[side].set(p,pair[side].get(p)+' ');
  rejects(...pair);
 }
 for(const p of CHARACTER_POSE_PATHS.filter(p=>before.get(p)!==after.get(p))){
  const b=new Map(before),c=new Map(after);c.set(p,b.get(p));rejects(b,c);
  const mixed=new Map(before);mixed.set(p,after.get(p));rejects(mixed,after);
 }
 rejects(after,before);rejects(after,after);
 // Identical historical main remains a valid, separately pinned old epoch.
 assert.equal(planCharacterPoseBaseline(before,before).pairEvidence.mode,POST_30_PRS_POSE_PAIR.mode);
});
test('1862 pose CLI writes no source and preserves its prior receipt on late rejection',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-respawn1862-pose-'));
 try{
  const [before,after]=respawnMaps(),b=path.join(temp,'base'),c=path.join(temp,'candidate'),receipt=path.join(temp,'receipt.json');
  for(const [dir,rows]of [[b,before],[c,after]])for(const [p,s]of rows){const f=path.join(dir,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s);}
  const read=dir=>new Map(CHARACTER_POSE_PATHS.map(p=>[p,fs.readFileSync(path.join(dir,p),'utf8')]));
  const run=()=>spawnSync(process.execPath,[fileURLToPath(new URL('../prepare-inkwave-character-pose-baseline.mjs',import.meta.url)),
   '--baseline',b,'--candidate',c,'--receipt',receipt],{encoding:'utf8',timeout:60000});
  const positive=run();assert.equal(positive.status,0,positive.stderr);
  const saved=fs.readFileSync(receipt,'utf8'),out=JSON.parse(saved);
  assert.equal(out.sourceBase,RESPAWN.sourceBase);assert.equal(out.sourceHead,RESPAWN.sourceHead);
  assert.equal(out.mode,'current-pose-pair-with-gameplay-differences');assert.deepEqual(out.writtenPaths,[]);assert.equal(out.reviewedDiffSha256,undefined);
  assert.deepEqual([...read(b)],[...before]);assert.deepEqual([...read(c)],[...after]);
  fs.appendFileSync(path.join(c,CHARACTER_POSE_PATHS.at(-1)),'\n// unreviewed final leaf\n');
  const negative=run();assert.equal(negative.status,1);assert.deepEqual([...read(b)],[...before]);assert.equal(fs.readFileSync(receipt,'utf8'),saved);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('post30 controls CLI accepts only the frozen single-difference tuple and completes every negative control',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-31pr-cli-'));
 try{
  const before=path.join(root,'before'),after=path.join(root,'after'),receipt=path.join(root,'receipt.json');
  for(const [directory,rows]of [[before,fixture.post30Baseline],[after,fixture.candidate]]){
   for(const [relative,text]of Object.entries(rows)){
    const file=path.join(directory,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);
   }
   fs.writeFileSync(path.join(directory,'patches/splatoon3/profile.json'),fs.readFileSync(new URL('../../patches/splatoon3/profile.json',import.meta.url)));
  }
  const cli=fileURLToPath(new URL('../check-inkwave-current-pair-controls.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[cli,'--baseline',before,'--candidate',after,
   '--expected-mode',deltaExpected.mode,'--expected-source-base',deltaExpected.sourceBase,
   '--expected-source-head',deltaExpected.sourceHead,'--receipt',receipt],{encoding:'utf8',timeout:60000});
  assert.equal(result.status,0,result.stderr);
  const out=JSON.parse(fs.readFileSync(receipt,'utf8'));
  assert.deepEqual(out.counts,{positiveCli:2,cliRejected:56,helperRejected:29});
  assert.equal(out.originalInputsUnchanged,true);assert.equal(out.scratchRemoved,true);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
