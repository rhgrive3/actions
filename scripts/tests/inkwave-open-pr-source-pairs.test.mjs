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
 const candidate=new Map(paths.map(p=>[p,fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8')]));
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
 const current=new Map(MAIN_INK_BASELINE_PATHS.map(p=>[p,fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8')]));
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
