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
