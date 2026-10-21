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
for(const [name,paths,plan]of [['pose',CHARACTER_POSE_PATHS,planCharacterPoseBaseline],['paint',MAIN_INK_BASELINE_PATHS,planMainInkBaseline]]){
 const base=new Map(paths.map(p=>[p,historicalSource('oct21IntegrationBase',p)]));
 if(name==='paint')base.set(swimMain.path,swimMain.content);
 const candidate=new Map(paths.map(p=>[p,fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8')]));
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
