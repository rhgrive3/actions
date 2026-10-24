import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {CHARACTER_POSE_PATHS,planCharacterPoseBaseline} from '../lib/inkwave-character-pose-baseline.mjs';
import {ROLLER_PR1856_POSE_PAIR as P,ROLLER_PR1856_HELPER_PATH as helper,ROLLER_PR1856_POSE_FIXTURE_SHA256} from '../lib/inkwave-roller-pr1856-pose-pair.mjs';
const packed=fs.readFileSync(new URL('../fixtures/inkwave-roller-pr1856-pose-pair.json.gz',import.meta.url));
assert.equal(createHash('sha256').update(packed).digest('hex'),ROLLER_PR1856_POSE_FIXTURE_SHA256);
const fixture=JSON.parse(gunzipSync(packed)),paths=[...CHARACTER_POSE_PATHS,helper];
const maps=()=>[new Map(Object.entries(fixture.baseline)),new Map(Object.entries(fixture.candidate))];
const blob=s=>s===null?null:createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
function assertHelperRejection(bad,mutation){
 assert.equal(bad.error,undefined,'helper '+mutation+': spawn error');
 assert.equal(bad.signal,null,'helper '+mutation+': process signal');
 assert.equal(bad.status,1,'helper '+mutation+': expected assertion exit');
 assert.match(bad.stderr,/AssertionError/);
 assert.ok(bad.stderr.includes(helper+': '+(mutation==='missing'?'missing Roller source':'unreviewed Roller source tuple')),bad.stderr);
}
test('exact main7e to433299 admits only pinned source identity, preserving baseline and all visible motion differences',()=>{
 assert.deepEqual(Object.keys(P.paths),paths);assert.equal(fixture.sourceBase,P.sourceBase);assert.equal(fixture.sourceHead,P.sourceHead);
 const [before,after]=maps(),b=[...before],a=[...after];
 for(const p of paths){assert.equal(blob(before.get(p)),P.paths[p].baseline,p);assert.equal(blob(after.get(p)),P.paths[p].candidate,p);assert.equal(fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8'),after.get(p),'live candidate must match fixed433299 source');}
 const plan=planCharacterPoseBaseline(before,after);
 assert.equal(plan.pairEvidence.mode,P.mode);assert.equal(plan.pairEvidence.sourceBase,P.sourceBase);assert.equal(plan.pairEvidence.sourceHead,P.sourceHead);
 assert.match(plan.pairEvidence.validationLimit,/not pose or gameplay equivalence/);
 assert.deepEqual(plan.changes,[]);assert.deepEqual([...plan.sources],b);assert.deepEqual([...before],b);assert.deepEqual([...after],a);
 assert.equal(plan.evidence.length,17);assert.equal(plan.evidence.filter(r=>r.originalGitBlob!==r.candidateGitBlob).length,2);
 for(const r of plan.evidence){assert.equal(r.referenceGitBlob,r.originalGitBlob);assert.equal(r.referenceSha256,r.originalSha256);assert.deepEqual(r.replayed,[]);assert.equal(r.changed,false);}
 assert.equal(plan.sources.get(helper),null,'new helper must not be copied into main');
});
test('every non-absent leaf omission/edit and baseline helper introduction reject the new tuple without mutation',()=>{
 let rejected=0;
 for(const side of [0,1])for(const p of paths){
  if(side===0&&p===helper)continue;
  for(const missing of [false,true]){
   const pair=maps();if(missing)pair[side].delete(p);else pair[side].set(p,pair[side].get(p)+' ');
   const snapshot=pair.map(m=>[...m]);assert.throws(()=>planCharacterPoseBaseline(...pair));assert.deepEqual(pair.map(m=>[...m]),snapshot);rejected++;
  }
 }
 assert.equal(rejected,66);
 for(const value of ['',fixture.candidate[helper]]){const pair=maps();pair[0].set(helper,value);assert.throws(()=>planCharacterPoseBaseline(...pair));}
 const pair=maps();pair[0].delete(helper);assert.throws(()=>planCharacterPoseBaseline(...pair),'absence must be explicitly observed as null in this tuple');
});
test('reversal, identical candidate and mixed old/new ownership cannot acquire433299 admission',()=>{
 const [before,after]=maps();assert.throws(()=>planCharacterPoseBaseline(after,before));assert.throws(()=>planCharacterPoseBaseline(after,after));
 const oldPlan=planCharacterPoseBaseline(before,before);assert.notEqual(oldPlan.pairEvidence.sourceHead,P.sourceHead,'historical identical epoch is preserved, not relabeled as433299');
 const pair=maps();pair[1].set('patches/splatoon3/runtime/roller.mjs',pair[0].get('patches/splatoon3/runtime/roller.mjs'));assert.throws(()=>planCharacterPoseBaseline(...pair),'new helper plus old Roller must reject');
});
test('actual pose CLI reads the helper, writes no source and rejects helper drift without replacing receipt',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'roller1856-pose-'));
 try{
  const before=path.join(root,'before'),after=path.join(root,'after'),receipt=path.join(root,'receipt.json');
  for(const [directory,rows]of [[before,fixture.baseline],[after,fixture.candidate]])for(const [relative,text]of Object.entries(rows))if(text!==null){const file=path.join(directory,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}
  const cli=fileURLToPath(new URL('../prepare-inkwave-character-pose-baseline.mjs',import.meta.url));
  const invoke=()=>spawnSync(process.execPath,[cli,'--baseline',before,'--candidate',after,'--receipt',receipt],{encoding:'utf8',timeout:60000});
  const ok=invoke();assert.equal(ok.status,0,ok.stderr);
  const saved=fs.readFileSync(receipt,'utf8'),out=JSON.parse(saved);assert.equal(out.mode,P.mode);assert.equal(out.sourceBase,P.sourceBase);assert.equal(out.sourceHead,P.sourceHead);assert.deepEqual(out.writtenPaths,[]);assert.equal(out.paths.length,17);
  assert.equal(fs.existsSync(path.join(before,helper)),false);
  for(const [relative,text]of Object.entries(fixture.baseline))if(text!==null)assert.equal(fs.readFileSync(path.join(before,relative),'utf8'),text);
  for(const mutation of ['missing','edited']){
   const file=path.join(after,helper);mutation==='missing'?fs.rmSync(file):fs.writeFileSync(file,fixture.candidate[helper]+' ');
   const bad=invoke();assertHelperRejection(bad,mutation);assert.equal(fs.readFileSync(receipt,'utf8'),saved);
   fs.writeFileSync(file,fixture.candidate[helper]);
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('nonexecution, timeout, signal and unrelated errors cannot count as helper assertion rejection',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'roller1856-cli-proof-'));
 try{
  const absent=spawnSync(path.join(root,'not-an-executable'),[],{encoding:'utf8'});
  const timeout=spawnSync(process.execPath,['-e','setInterval(()=>{},1000)'],{encoding:'utf8',timeout:50});
  assert.equal(absent.error?.code,'ENOENT');assert.equal(timeout.error?.code,'ETIMEDOUT');
  for(const bad of [absent,timeout]){
   assert.equal(bad.status,null);assert.doesNotThrow(()=>assert.notEqual(bad.status,0),'old predicate falsely accepted nonexecution');
   for(const mutation of ['missing','edited'])assert.throws(()=>assertHelperRejection(bad,mutation));
  }
  for(const bad of [{status:null,error:undefined,signal:'SIGTERM',stderr:''},{status:1,error:undefined,signal:null,stderr:'unrelated failure'},{status:1,error:undefined,signal:null,stderr:'AssertionError: another-file.mjs: missing Roller source'}]){
   for(const mutation of ['missing','edited'])assert.throws(()=>assertHelperRejection(bad,mutation));
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
