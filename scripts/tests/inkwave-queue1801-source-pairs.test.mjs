import test,{after} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import {execFileSync,spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {QUEUE1801_PAINT_SOURCE_PAIR as pair,paintSourcePaths,planMainInkBaseline} from '../lib/inkwave-main-ink-baseline.mjs';
import {QUEUE1801_POSE_PAIR as posePair,CHARACTER_POSE_PATHS,planCharacterPoseBaseline} from '../lib/inkwave-character-pose-baseline.mjs';
const raw=fs.readFileSync(new URL('../fixtures/inkwave-queue1801-source-pairs.json.gz',import.meta.url));assert.equal(createHash('sha256').update(raw).digest('hex'),'28e1b12947574b6501564a02b833d72a10e7a676f9aa10fa8e66ac79b97f9336');
const fixture=JSON.parse(gunzipSync(raw));assert.equal(fixture.schema,1);
const paint=[new Map(Object.entries(fixture.paint.baseline)),new Map(Object.entries(fixture.paint.candidate))],pose=[new Map(Object.entries(fixture.pose.baseline)),new Map(Object.entries(fixture.pose.candidate))],paths=paintSourcePaths(pair);
test('fixed fourteen-leaf queue pair preserves both sources, exposes its two changes and never replays',()=>{
 assert.equal(paths.length,14);const plan=planMainInkBaseline(...paint,pair);assert.equal(plan.evidence.mode,pair.mode);assert.deepEqual(plan.changes,[]);assert.deepEqual([...plan.sources],[...paint[0]]);assert.equal(plan.evidence.paths.filter(r=>r.originalGitBlob!==r.candidateGitBlob).length,2);assert.throws(()=>planMainInkBaseline(...paint));assert.throws(()=>planMainInkBaseline(paint[1],paint[0],pair));assert.throws(()=>planMainInkBaseline(...paint,{...pair,sourceHead:'f'.repeat(40)}));
});
test('84 paint omissions/edits and 96 pose omissions/edits reject the complete declared tuples',()=>{
 for(const [maps,selected,plan] of [[paint,paths,(b,c)=>planMainInkBaseline(b,c,pair)],[pose,CHARACTER_POSE_PATHS,planCharacterPoseBaseline]]){
  let n=0;for(const p of selected)for(const sides of [[0],[1],[0,1]])for(const missing of [true,false]){const m=maps.map(x=>new Map(x));for(const side of sides)missing?m[side].delete(p):m[side].set(p,m[side].get(p)+' ');assert.throws(()=>plan(...m));n++;}assert.equal(n,selected.length*6);
 }
 const result=planCharacterPoseBaseline(...pose);assert.equal(result.pairEvidence.sourceBase,posePair.sourceBase);assert.equal(result.pairEvidence.sourceHead,posePair.sourceHead);assert.deepEqual(result.changes,[]);assert.deepEqual([...result.sources],[...pose[0]]);
});
const root=fs.mkdtempSync(path.join(os.tmpdir(),'queue-source-admission-'));after(()=>fs.rmSync(root,{recursive:true,force:true}));
const git=(dir,...args)=>execFileSync('git',['-C',dir,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
function repo(name,map){const dir=path.join(root,name);fs.mkdirSync(dir);for(const[p,v]of [...map,['patches/splatoon3/profile.json',fs.readFileSync(new URL('../../patches/splatoon3/profile.json',import.meta.url),'utf8')]]){fs.mkdirSync(path.dirname(path.join(dir,p)),{recursive:true});fs.writeFileSync(path.join(dir,p),v);}git(dir,'init','-q');git(dir,'add','.');git(dir,'-c','user.name=QA','-c','user.email=qa@example.invalid','-c','commit.gpgsign=false','commit','-qm',name);return{dir,sha:git(dir,'rev-parse','HEAD')};}
const left=repo('left',paint[0]),right=repo('right',paint[1]),receipt=path.join(root,'receipt.json');
function run(script,flags=[]){return spawnSync(process.execPath,[fileURLToPath(new URL('../'+script,import.meta.url)),'--baseline',left.dir,'--candidate',right.dir,'--base-sha',left.sha,'--candidate-sha',right.sha,'--expected-mode',pair.mode,'--expected-source-base',pair.sourceBase,'--expected-source-head',pair.sourceHead,'--receipt',receipt,...flags],{encoding:'utf8'});}
test('real Git-bound CLI leaves all inputs unchanged and executes all rejection controls',()=>{
 const r=run('check-inkwave-current-pair-controls.mjs');assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(fs.readFileSync(receipt)).counts,{positiveCli:2,cliRejected:60,helperRejected:31});for(const [side,map]of [[left,paint[0]],[right,paint[1]]])for(const[p,v]of map)assert.equal(fs.readFileSync(path.join(side.dir,p),'utf8'),v);
});
test('dirty input cannot replace the prior receipt even with correct declared epoch',()=>{const p=path.join(right.dir,paths.at(-1));fs.appendFileSync(p,' ');fs.writeFileSync(receipt,'sentinel');try{const r=run('prepare-inkwave-projectile-baseline.mjs');assert.equal(r.status,1);assert.match(r.stderr,/working source differs from declared immutable Git blob/);assert.equal(fs.readFileSync(receipt,'utf8'),'sentinel');}finally{fs.writeFileSync(p,paint[1].get(paths.at(-1)));}});

// Separate candidate/candidate identity admission. The original changed pair above remains mandatory.
import {QUEUE1801_IDENTICAL_PAINT_SOURCE_PAIR as identityPair} from '../lib/inkwave-main-ink-baseline.mjs';
import {QUEUE1801_IDENTICAL_POSE_PAIR as poseIdentityPair} from '../lib/inkwave-character-pose-baseline.mjs';
test('explicit queue candidate identity preserves all fourteen paint and sixteen pose leaves',()=>{
 assert.equal(identityPair.sourceBase,pair.sourceHead);assert.equal(identityPair.sourceHead,pair.sourceHead);
 const result=planMainInkBaseline(paint[1],paint[1],identityPair);
 assert.deepEqual(result.changes,[]);assert.deepEqual([...result.sources],[...paint[1]]);
 assert.equal(result.evidence.paths.length,14);assert.equal(result.evidence.mode,identityPair.mode);
 for(const row of result.evidence.paths){assert.equal(row.originalGitBlob,row.candidateGitBlob);assert.equal(row.originalSha256,row.referenceSha256);assert.deepEqual(row.replayed,[]);}
 const p=planCharacterPoseBaseline(pose[1],pose[1]);assert.deepEqual(p.changes,[]);assert.deepEqual([...p.sources],[...pose[1]]);
 assert.equal(p.evidence.length,16);assert.equal(p.pairEvidence.mode,poseIdentityPair.mode);
 assert.equal(p.pairEvidence.sourceBase,pair.sourceHead);assert.equal(p.pairEvidence.sourceHead,pair.sourceHead);
 for(const row of p.evidence){assert.equal(row.originalGitBlob,row.candidateGitBlob);assert.equal(row.originalSha256,row.referenceSha256);assert.deepEqual(row.replayed,[]);}
});
test('identity rejects 84 paint and 96 pose altered/missing leaf cases, old/mixed epochs and implicit paint mode',()=>{
 for(const [source,selected,plan] of [[paint[1],paths,(b,c)=>planMainInkBaseline(b,c,identityPair)],[pose[1],CHARACTER_POSE_PATHS,planCharacterPoseBaseline]]){
  let count=0;
  for(const p of selected)for(const sides of [[0],[1],[0,1]])for(const missing of [true,false]){
   const maps=[new Map(source),new Map(source)];for(const side of sides)missing?maps[side].delete(p):maps[side].set(p,maps[side].get(p)+' ');
   assert.throws(()=>plan(...maps));count++;
  }
  assert.equal(count,selected.length*6);
 }
 for(const b of [paint[0],paint[1]])for(const c of [paint[0],paint[1]])if(b!==paint[1]||c!==paint[1])assert.throws(()=>planMainInkBaseline(b,c,identityPair));
 assert.throws(()=>planMainInkBaseline(paint[1],paint[1]));
 assert.throws(()=>planMainInkBaseline(paint[1],paint[1],pair));
 for(const key of ['mode','sourceBase','sourceHead'])assert.throws(()=>planMainInkBaseline(paint[1],paint[1],{...identityPair,[key]:key==='mode'?'unknown':pair.sourceBase}));
 // Retain original mixed pose tuple, but reject reversed old/new and leaf-level mixtures.
 assert.throws(()=>planCharacterPoseBaseline(pose[1],pose[0]));
 for(const side of [0,1])for(const p of CHARACTER_POSE_PATHS.filter(p=>pose[0].get(p)!==pose[1].get(p))){const maps=[new Map(pose[1]),new Map(pose[1])];maps[side].set(p,pose[0].get(p));assert.throws(()=>planCharacterPoseBaseline(...maps));}
});
const identityLeft=repo('identity-left',paint[1]),identityRight=repo('identity-right',paint[1]);
function runIdentity(script,overrides={}){
 const args=new Map([['--baseline',identityLeft.dir],['--candidate',identityRight.dir],['--base-sha',identityLeft.sha],['--candidate-sha',identityRight.sha],['--expected-mode',identityPair.mode],['--expected-source-base',identityPair.sourceBase],['--expected-source-head',identityPair.sourceHead],['--receipt',receipt]]);
 for(const [key,value]of Object.entries(overrides))value===null?args.delete(key):args.set(key,value);
 return spawnSync(process.execPath,[fileURLToPath(new URL('../'+script,import.meta.url)),...[...args].flat()],{encoding:'utf8'});
}
test('real distinct Git commits bind identity controls without substituting source epoch or writing inputs',()=>{
 assert.notEqual(identityLeft.sha,identityRight.sha);assert.notEqual(identityLeft.sha,identityPair.sourceBase);
 const r=runIdentity('check-inkwave-current-pair-controls.mjs');assert.equal(r.status,0,r.stderr);
 const e=JSON.parse(fs.readFileSync(receipt));assert.equal(e.mode,identityPair.mode);assert.deepEqual(e.counts,{positiveCli:2,cliRejected:57,helperRejected:28});
 assert.equal(e.declaredSources.declaredBaseCommit,identityLeft.sha);assert.equal(e.declaredSources.declaredCandidateCommit,identityRight.sha);
 const prepared=runIdentity('prepare-inkwave-projectile-baseline.mjs');assert.equal(prepared.status,0,prepared.stderr);
 const out=JSON.parse(fs.readFileSync(receipt));assert.deepEqual(out.changes,[]);assert.deepEqual(out.writtenPaths,[]);assert.equal(out.paint.paths.length,14);
 for(const side of [identityLeft,identityRight])for(const[p,v]of paint[1])assert.equal(fs.readFileSync(path.join(side.dir,p),'utf8'),v);
});
test('identity CLI rejects false Git SHA, wrong epochs, missing declarations and dirty source while preserving receipt',()=>{
 for(const script of ['check-inkwave-current-pair-controls.mjs','prepare-inkwave-projectile-baseline.mjs']){
  for(const flags of [{'--base-sha':'f'.repeat(40)},{'--candidate-sha':identityPair.sourceHead},{'--base-sha':null},{'--candidate-sha':null},{'--expected-source-base':pair.sourceBase},{'--expected-source-head':'f'.repeat(40)},{'--expected-mode':'unknown'},{'--expected-source-base':null}]){
   fs.writeFileSync(receipt,'sentinel');const r=runIdentity(script,flags);assert.equal(r.status,1,r.stderr);assert.equal(r.signal,null);assert.equal(fs.readFileSync(receipt,'utf8'),'sentinel');
  }
  for(const side of [identityLeft,identityRight]){
   const p=path.join(side.dir,paths.at(-1));fs.appendFileSync(p,' ');fs.writeFileSync(receipt,'sentinel');
   try{const r=runIdentity(script);assert.equal(r.status,1);assert.match(r.stderr,/working source differs from declared immutable Git blob/);assert.equal(fs.readFileSync(receipt,'utf8'),'sentinel');}
   finally{fs.writeFileSync(p,paint[1].get(paths.at(-1)));}
  }
 }
});
