import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {CHARACTER_POSE_PATHS,planCharacterPoseBaseline} from '../lib/inkwave-character-pose-baseline.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
assert.ok(process.env.INKWAVE_POSE_BASELINE,'exact current baseline source root required');
const baseRoot=path.resolve(process.env.INKWAVE_POSE_BASELINE);
const candidateRoot=path.resolve(process.env.INKWAVE_POSE_CANDIDATE||root);
const read=root=>new Map(CHARACTER_POSE_PATHS.map(p=>[p,fs.readFileSync(path.join(root,p),'utf8')]));
const baseline=read(baseRoot),candidate=read(candidateRoot);
test('whole current tuple preserves both inputs and exposes gameplay/pose differences',()=>{
 const b=[...baseline],c=[...candidate],plan=planCharacterPoseBaseline(baseline,candidate);
 assert.equal(plan.pairEvidence.mode,'current-pose-pair-with-gameplay-differences');
 assert.equal(plan.pairEvidence.sourceBase,'b77b51df6a4e6683ca23a213c8ba4b0bc2f0c8ae');
 assert.equal(plan.pairEvidence.sourceHead,'cb7b7575c22443776b2e820aba9a0f8655c34604');
 assert.deepEqual(plan.changes,[]);assert.deepEqual([...plan.sources],b);
 assert.deepEqual([...baseline],b);assert.deepEqual([...candidate],c);
 assert.equal(plan.evidence.length,16);
 assert.equal(plan.evidence.filter(r=>r.originalGitBlob!==r.candidateGitBlob).length,4);
 for(const r of plan.evidence){assert.equal(r.mode,'pinned-current-pose-pair');assert.equal(r.changed,false);assert.deepEqual(r.replayed,[]);assert.equal(r.referenceGitBlob,r.originalGitBlob);assert.equal(r.referenceSha256,r.originalSha256);}
 assert.match(plan.pairEvidence.validationLimit,/not pose or gameplay equivalence/);
});
test('every missing/altered input fails without changing its peer',()=>{
 for(const p of CHARACTER_POSE_PATHS)for(const side of ['base','candidate'])for(const mutation of ['missing','altered']){
  const b=new Map(baseline),c=new Map(candidate),m=side==='base'?b:c;
  if(mutation==='missing')m.delete(p);else m.set(p,m.get(p)+'\n// unknown source\n');
  const snapshot=[...b];assert.throws(()=>planCharacterPoseBaseline(b,c));assert.deepEqual([...b],snapshot);
 }
});
test('each changed component rejects mixed epochs; swapped and same-side pairs fail',()=>{
 for(const p of CHARACTER_POSE_PATHS.filter(p=>baseline.get(p)!==candidate.get(p))){
  const b=new Map(baseline),c=new Map(candidate);c.set(p,b.get(p));assert.throws(()=>planCharacterPoseBaseline(b,c));
  const b2=new Map(baseline);b2.set(p,candidate.get(p));assert.throws(()=>planCharacterPoseBaseline(b2,candidate));
 }
 for(const [b,c] of [[candidate,baseline],[baseline,baseline],[candidate,candidate]])assert.throws(()=>planCharacterPoseBaseline(b,c));
});
test('both-side drift cannot escape to historical replay',()=>{
 for(const p of CHARACTER_POSE_PATHS)for(const mutation of ['missing','altered']){
  const b=new Map(baseline),c=new Map(candidate);for(const m of [b,c])if(mutation==='missing')m.delete(p);else m.set(p,m.get(p)+'\n// both-side drift\n');
  assert.throws(()=>planCharacterPoseBaseline(b,c));
 }
});
test('CLI returns truthful no-replay receipt and late rejection preserves files/receipt',t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-pose-pair-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const b=path.join(temp,'base'),c=path.join(temp,'candidate'),receipt=path.join(temp,'receipt.json');
 for(const [dir,rows] of [[b,baseline],[c,candidate]])for(const [p,s]of rows){const f=path.join(dir,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s);}
 const run=()=>spawnSync(process.execPath,[path.join(root,'scripts/prepare-inkwave-character-pose-baseline.mjs'),'--baseline',b,'--candidate',c,'--receipt',receipt],{encoding:'utf8'});
 const positive=run();assert.equal(positive.status,0,positive.stderr);
 const e=JSON.parse(fs.readFileSync(receipt,'utf8'));assert.equal(e.mode,'current-pose-pair-with-gameplay-differences');assert.equal(e.sourceBase,'b77b51df6a4e6683ca23a213c8ba4b0bc2f0c8ae');assert.equal(e.sourceHead,'cb7b7575c22443776b2e820aba9a0f8655c34604');assert.deepEqual(e.writtenPaths,[]);assert.equal(e.reviewedDiffSha256,undefined);
 assert.deepEqual([...read(b)],[...baseline]);assert.deepEqual([...read(c)],[...candidate]);
 const saved=fs.readFileSync(receipt,'utf8');fs.appendFileSync(path.join(c,CHARACTER_POSE_PATHS.at(-1)),'\n// unknown final file');
 const negative=run();assert.equal(negative.status,1);assert.deepEqual([...read(b)],[...baseline]);assert.equal(fs.readFileSync(receipt,'utf8'),saved);
});
