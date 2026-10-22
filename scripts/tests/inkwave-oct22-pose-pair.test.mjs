import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {CHARACTER_POSE_PATHS as paths,OCT22_INTEGRATION_POSE_PAIR as pair,planCharacterPoseBaseline} from '../lib/inkwave-character-pose-baseline.mjs';
const bytes=fs.readFileSync(new URL('../fixtures/inkwave-oct22-pose-pair.json.gz',import.meta.url));
assert.equal(createHash('sha256').update(bytes).digest('hex'),'b646eca8f2102e2d1d996d32cad7794709fba72df4a2f289cfe7e1bff5d4fd5e');
const source=JSON.parse(gunzipSync(bytes)),before=new Map(Object.entries(source.baseline)),after=new Map(Object.entries(source.candidate));
const blob=text=>createHash('sha1').update('blob '+Buffer.byteLength(text)+'\0').update(text).digest('hex');
test('complete immutable sixteen-leaf integration tuple retains all source differences without replay',()=>{
 assert.equal(paths.length,16);assert.deepEqual(Object.keys(pair.paths),paths);
 for(const p of paths){assert.equal(blob(before.get(p)),pair.paths[p].baseline);assert.equal(blob(after.get(p)),pair.paths[p].candidate);assert.equal(fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8'),after.get(p));}
 const result=planCharacterPoseBaseline(before,after);assert.equal(result.pairEvidence.sourceBase,pair.sourceBase);assert.equal(result.pairEvidence.sourceHead,pair.sourceHead);assert.deepEqual(result.changes,[]);assert.deepEqual([...result.sources],[...before]);assert.match(result.pairEvidence.validationLimit,/not pose or gameplay equivalence/);
});
test('every missing, edited or mixed integration leaf is rejected before any replay',()=>{
 let rejected=0;for(const path of paths)for(const sides of [[0],[1],[0,1]])for(const missing of [true,false]){
  const maps=[new Map(before),new Map(after)];for(const side of sides)missing?maps[side].delete(path):maps[side].set(path,maps[side].get(path)+' ');
  assert.throws(()=>planCharacterPoseBaseline(...maps));rejected++;
 }assert.equal(rejected,96);assert.throws(()=>planCharacterPoseBaseline(after,before));
});
