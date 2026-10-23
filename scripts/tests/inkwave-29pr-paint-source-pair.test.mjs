import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {ALL_29_PRS_SOURCE_PAIR as P,ALL_29_PRS_FIXTURE_SHA256 as ALL_PRS_FIXTURE_SHA256} from '../lib/inkwave-29pr-paint-source-pair.mjs';
import {CHARACTER_POSE_PATHS,planCharacterPoseBaseline} from '../lib/inkwave-character-pose-baseline.mjs';
import {MAIN_INK_BASELINE_PATHS as paths,planMainInkBaseline,gitBlobSha1} from '../lib/inkwave-main-ink-baseline.mjs';
const packed=fs.readFileSync(new URL('../fixtures/inkwave-29pr-paint-source-pair.json.gz',import.meta.url));
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
