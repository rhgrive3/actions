import {paintEpochSource} from './fixtures/inkwave-paint-source-epochs.mjs';
import {verifyDeclaredPaintSources} from '../lib/inkwave-declared-paint-source-pair.mjs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const swimMain=JSON.parse(fs.readFileSync(new URL('../fixtures/inkwave-open-pr-main-95c-source.json',import.meta.url),'utf8'));
assert.equal(swimMain.commit,'95c25af145418691991a1452d4d10589754a0f1c');
assert.equal(swimMain.path,'scripts/lib/inkwave-build-only-modules.mjs');
assert.equal(createHash('sha1').update('blob '+Buffer.byteLength(swimMain.content)+'\0').update(swimMain.content).digest('hex'),'89f3b41a400307f8c6f7156bb4850d6c67e67c85');
import {historicalSource} from '../lib/inkwave-historical-baseline-sources.mjs';
import {CHARACTER_POSE_PATHS,planCharacterPoseBaseline} from '../lib/inkwave-character-pose-baseline.mjs';
import {MAIN_INK_BASELINE_PATHS,planMainInkBaseline} from '../lib/inkwave-main-ink-baseline.mjs';
// Historical six-PR input is immutable, not whichever runtime main has today.
const historicalRaw=fs.readFileSync(new URL('../fixtures/inkwave-open-pr-af66-sources.json',import.meta.url),'utf8');
assert.equal(createHash('sha1').update('blob '+Buffer.byteLength(historicalRaw)+'\0').update(historicalRaw).digest('hex'),'13661ec34f512985267156c48ec1178ee2008655');
const historical=JSON.parse(historicalRaw);assert.equal(historical.commit,'af66a10bd34e4de9e182f8fb4f24da6d51c16fb6');
for(const [path,row]of Object.entries(historical.paths))assert.equal(createHash('sha1').update('blob '+Buffer.byteLength(row.content)+'\0').update(row.content).digest('hex'),row.gitBlob,path);
for(const [name,paths,plan]of [['pose',CHARACTER_POSE_PATHS,planCharacterPoseBaseline],['paint',MAIN_INK_BASELINE_PATHS,planMainInkBaseline]]){
 const base=new Map(paths.map(p=>[p,historicalSource('oct21IntegrationBase',p)]));
 if(name==='paint')base.set(swimMain.path,swimMain.content);
 const candidate=new Map(paths.map(p=>[p,historical.paths[p].content]));
 test(name+' six-PR tuple preserves both complete source trees without replay',()=>{
  const b=[...base],c=[...candidate],result=plan(base,candidate);
  assert.deepEqual(result.changes,[]);assert.deepEqual([...result.sources],b);
  assert.deepEqual([...base],b);assert.deepEqual([...candidate],c);
  const receipt=result.pairEvidence??result.evidence;
  assert.equal(receipt.sourceBase,name==='pose'?'ecfb851ad7d9c78c2e7b1937dda0a723946dc215':'95c25af145418691991a1452d4d10589754a0f1c');
  assert.equal(receipt.sourceHead,name==='pose'?'eba73df522934b4406585f42ca3f8593dddf2dd3':'af66a10bd34e4de9e182f8fb4f24da6d51c16fb6');
 });
 test(name+' every missing, altered or paired-drift source rejects without mutation',()=>{
  for(const p of paths)for(const sides of [[0],[1],[0,1]])for(const missing of [false,true]){
   const rows=[new Map(base),new Map(candidate)];
   for(const side of sides)if(missing)rows[side].delete(p);else rows[side].set(p,rows[side].get(p)+'\n// unknown source');
   const before=rows.map(m=>[...m]);assert.throws(()=>plan(...rows));
   assert.deepEqual(rows.map(m=>[...m]),before);
  }
 });
 test(name+' no changed component may be substituted from its peer',()=>{
  for(const p of paths.filter(p=>base.get(p)!==candidate.get(p)))for(const side of [0,1]){
   const rows=[new Map(base),new Map(candidate)];rows[side].set(p,rows[1-side].get(p));
   // A complete candidate/candidate pose epoch is separately admitted as unchanged.
   if(name==='pose'&&paths.every(p=>rows[0].get(p)===rows[1].get(p))){assert.deepEqual(plan(...rows).changes,[]);continue;}
   assert.throws(()=>plan(...rows),p+' side '+side);
  }
 });
}

 
// PR #1746 is a distinct complete source epoch, not a repin of the six-PR pair.
// These inputs still retain every base byte and all gameplay/image differences.
for(const [name,paths,plan]of [['pose',CHARACTER_POSE_PATHS,planCharacterPoseBaseline],['paint',MAIN_INK_BASELINE_PATHS,planMainInkBaseline]]){
 const base=new Map(paths.map(p=>[p,historicalSource('oct21IntegrationBase',p)]));
 if(name==='paint')base.set(swimMain.path,swimMain.content);
 const candidate=new Map(paths.map(p=>[p,MAIN_INK_BASELINE_PATHS.includes(p) ? paintEpochSource('pr1746', p) : fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8')]));
 test(name+' PR1746 complete pair preserves source identity and rejects every unknown leaf',()=>{
  const b=[...base],a=[...candidate],result=plan(base,candidate),receipt=result.pairEvidence??result.evidence;
  assert.deepEqual(result.changes,[]);assert.deepEqual([...result.sources],b);
  assert.equal(receipt.sourceBase,name==='pose'?'ecfb851ad7d9c78c2e7b1937dda0a723946dc215':'95c25af145418691991a1452d4d10589754a0f1c');
  assert.equal(receipt.sourceHead,'f31238a48b9d1a4af2d4f5f5f9182af777a79c83');
  for(const p of paths)for(const sides of [[0],[1],[0,1]])for(const missing of [false,true]){
   const rows=[new Map(base),new Map(candidate)];
   for(const side of sides)if(missing)rows[side].delete(p);else rows[side].set(p,rows[side].get(p)+'\\n// unreviewed');
   const unchanged=rows.map(m=>[...m]);assert.throws(()=>plan(...rows));assert.deepEqual(rows.map(m=>[...m]),unchanged);
  }
  assert.deepEqual([...base],b);assert.deepEqual([...candidate],a);
 });
 test(name+' PR1746 rejects partially reverted historical candidate epochs',()=>{
  const changed=paths.filter(p=>candidate.get(p)!==historical.paths[p].content);
  assert.equal(changed.length,name==='pose'?2:1);
  for(const p of changed){
   const mixed=new Map(candidate);mixed.set(p,historical.paths[p].content);
   // A full old candidate remains a separately reviewed historical pair.
   if(paths.every(p=>mixed.get(p)===historical.paths[p].content))continue;
   assert.throws(()=>plan(base,mixed),p);
  }
  // Any baseline component copied from the new candidate is also forbidden.
  for(const p of paths.filter(p=>base.get(p)!==candidate.get(p))){
   const mixed=new Map(base);mixed.set(p,candidate.get(p));
   assert.throws(()=>plan(mixed,candidate),p);
  }
 });
}

test('only the complete PR1746 paint epoch admits equal sources and rejects every unknown equal leaf',()=>{
 const current=new Map(MAIN_INK_BASELINE_PATHS.map(p=>[p,MAIN_INK_BASELINE_PATHS.includes(p) ? paintEpochSource('pr1746', p) : fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8')]));
 const original=[...current],result=planMainInkBaseline(current,new Map(current));
 assert.equal(result.evidence.mode,'pr1746-byte-identical-current-paint');
 assert.equal(result.evidence.sourceBase,'f31238a48b9d1a4af2d4f5f5f9182af777a79c83');
 assert.equal(result.evidence.sourceHead,'f31238a48b9d1a4af2d4f5f5f9182af777a79c83');
 assert.deepEqual(result.changes,[]);assert.deepEqual([...result.sources],original);
 for(const p of MAIN_INK_BASELINE_PATHS)for(const sides of [[0],[1],[0,1]])for(const missing of [false,true]){
  const rows=[new Map(current),new Map(current)];
  for(const side of sides)if(missing)rows[side].delete(p);else rows[side].set(p,rows[side].get(p)+' // unknown');
  const before=rows.map(x=>[...x]);assert.throws(()=>planMainInkBaseline(...rows));assert.deepEqual(rows.map(x=>[...x]),before);
 }
 for(const p of MAIN_INK_BASELINE_PATHS.filter(p=>current.get(p)!==historical.paths[p].content)){
  for(const sides of [[0],[1],[0,1]]){
   const rows=[new Map(current),new Map(current)];
   for(const side of sides)rows[side].set(p,historical.paths[p].content);
   assert.throws(()=>planMainInkBaseline(...rows),p);
  }
 }
 assert.deepEqual([...current],original);
});

test('explicit requested paint contract rejects whole-tree substitution into otherwise approved identity',()=>{
 const base=new Map(MAIN_INK_BASELINE_PATHS.map(p=>[p,historicalSource('oct21IntegrationBase',p)]));base.set(swimMain.path,swimMain.content);
 const current=new Map(MAIN_INK_BASELINE_PATHS.map(p=>[p,MAIN_INK_BASELINE_PATHS.includes(p) ? paintEpochSource('pr1746', p) : fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8')]));
 const differing={mode:'current-pair-with-gameplay-differences',sourceBase:'95c25af145418691991a1452d4d10589754a0f1c',sourceHead:'f31238a48b9d1a4af2d4f5f5f9182af777a79c83'};
 const identical={mode:'pr1746-byte-identical-current-paint',sourceBase:differing.sourceHead,sourceHead:differing.sourceHead};
 assert.equal(planMainInkBaseline(base,current,differing).evidence.mode,differing.mode);
 assert.equal(planMainInkBaseline(current,new Map(current),identical).evidence.mode,identical.mode);
 for(const [b,c,expected]of [[current,current,differing],[base,current,identical],[current,current,{...identical,sourceHead:'unknown'}]]){
  const before=[[...b],[...c]];assert.throws(()=>planMainInkBaseline(b,c,expected),/explicitly requested comparison/);assert.deepEqual([[...b],[...c]],before);
 }
 for(const invalid of [{},{mode:identical.mode},{...identical,extra:'ignored?'}])assert.throws(()=>planMainInkBaseline(current,current,invalid),/complete expected/);
});

test('CLI expected differing epochs rejects copied identity before overwriting source or receipt',t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-explicit-pair-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const left=path.join(temp,'before'),right=path.join(temp,'after'),receipt=path.join(temp,'receipt.json');
 const sources=new Map(MAIN_INK_BASELINE_PATHS.map(p=>[p,MAIN_INK_BASELINE_PATHS.includes(p) ? paintEpochSource('pr1746', p) : fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8')]));
 sources.set('patches/splatoon3/profile.json',fs.readFileSync(new URL('../../patches/splatoon3/profile.json',import.meta.url),'utf8'));
 for(const dir of [left,right])for(const [p,source]of sources){const file=path.join(dir,p);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,source);}
 const run=args=>spawnSync(process.execPath,[fileURLToPath(new URL('../prepare-inkwave-projectile-baseline.mjs',import.meta.url)),'--baseline',left,'--candidate',right,'--receipt',receipt,...args],{encoding:'utf8'});
 const f312='f31238a48b9d1a4af2d4f5f5f9182af777a79c83',sentinel='previous receipt';
 fs.writeFileSync(receipt,sentinel);
 const bad=run(['--expected-mode','current-pair-with-gameplay-differences','--expected-source-base','95c25af145418691991a1452d4d10589754a0f1c','--expected-source-head',f312]);
 assert.equal(bad.error,undefined);assert.equal(bad.signal,null);assert.equal(bad.status,1,bad.stderr);assert.match(bad.stderr,/explicitly requested comparison/);
 assert.equal(fs.readFileSync(receipt,'utf8'),sentinel);
 const partial=run(['--expected-mode','pr1746-byte-identical-current-paint']);
 assert.equal(partial.status,1,partial.stderr);assert.equal(fs.readFileSync(receipt,'utf8'),sentinel);
 const good=run(['--expected-mode','pr1746-byte-identical-current-paint','--expected-source-base',f312,'--expected-source-head',f312]);
 assert.equal(good.status,0,good.stderr);
 const result=JSON.parse(fs.readFileSync(receipt,'utf8'));assert.equal(result.mode,'pr1746-byte-identical-current-paint');assert.deepEqual(result.writtenPaths,[]);
 assert.match(result.scope,/not evidence of an improvement/);
 for(const dir of [left,right])for(const [p,source]of sources)assert.equal(fs.readFileSync(path.join(dir,p),'utf8'),source,p);
});

test('declared Git leaves reject dirty whole-tree copy with unchanged HEAD and permit intended immutable identity',t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-git-pair-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const base=new Map(MAIN_INK_BASELINE_PATHS.map(p=>[p,historicalSource('oct21IntegrationBase',p)]));base.set(swimMain.path,swimMain.content);
 const current=new Map(MAIN_INK_BASELINE_PATHS.map(p=>[p,MAIN_INK_BASELINE_PATHS.includes(p) ? paintEpochSource('pr1746', p) : fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8')]));
 const git=(root,args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const write=(root,rows)=>{for(const [p,s]of rows){const file=path.join(root,p);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,s);}};
 const make=(name,rows)=>{const root=path.join(temp,name);fs.mkdirSync(root);write(root,rows);git(root,['init']);git(root,['add','.']);git(root,['-c','user.name=QA','-c','user.email=qa@example.invalid','-c','commit.gpgsign=false','commit','-m','fixture']);return {root,sha:git(root,['rev-parse','HEAD'])};};
 const b=make('base',base),c=make('candidate',current),i=make('identity',current);
 const options=(left,leftRows)=>({baseline:leftRows,candidate:current,baseGitRoot:left.root,candidateGitRoot:c.root,baseSha:left.sha,candidateSha:c.sha});
 const differing=verifyDeclaredPaintSources(options(b,base));
 assert.equal(planMainInkBaseline(differing.baseline,differing.candidate).evidence.mode,'current-pair-with-gameplay-differences');
 const identical=verifyDeclaredPaintSources(options(i,current));
 assert.equal(planMainInkBaseline(identical.baseline,identical.candidate).evidence.mode,'pr1746-byte-identical-current-paint');assert.equal(identical.evidence.paths.length,13);
 write(b.root,current);assert.equal(git(b.root,['rev-parse','HEAD']),b.sha);
 assert.throws(()=>verifyDeclaredPaintSources(options(b,current)),/working source differs from declared immutable Git blob/);
 assert.throws(()=>verifyDeclaredPaintSources({...options(i,current),baseSha:'0'.repeat(40)}),/declared commit must match Git HEAD/);
 const receipt=path.join(temp,'prior.json');fs.writeFileSync(receipt,'prior');
 for(const root of [b.root,c.root])fs.writeFileSync(path.join(root,'patches/splatoon3/profile.json'),fs.readFileSync(new URL('../../patches/splatoon3/profile.json',import.meta.url)));
 const run=spawnSync(process.execPath,[fileURLToPath(new URL('../prepare-inkwave-projectile-baseline.mjs',import.meta.url)),'--baseline',b.root,'--candidate',c.root,'--receipt',receipt,'--base-sha',b.sha,'--candidate-sha',c.sha],{encoding:'utf8'});
 assert.equal(run.status,1,run.stderr);assert.match(run.stderr,/working source differs from declared immutable Git blob/);
 assert.equal(fs.readFileSync(receipt,'utf8'),'prior');assert.equal(git(b.root,['rev-parse','HEAD']),b.sha);
});
