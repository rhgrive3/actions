import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {historicalSource} from '../lib/inkwave-historical-baseline-sources.mjs';
import {CHARACTER_POSE_PATHS,planCharacterPoseBaseline} from '../lib/inkwave-character-pose-baseline.mjs';
import {MAIN_INK_BASELINE_PATHS,planMainInkBaseline} from '../lib/inkwave-main-ink-baseline.mjs';
for(const [name,paths,plan]of [['pose',CHARACTER_POSE_PATHS,planCharacterPoseBaseline],['paint',MAIN_INK_BASELINE_PATHS,planMainInkBaseline]]){
 const base=new Map(paths.map(p=>[p,historicalSource('oct21IntegrationBase',p)]));
 const candidate=new Map(paths.map(p=>[p,fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8')]));
 test(name+' six-PR tuple preserves both complete source trees without replay',()=>{
  const b=[...base],c=[...candidate],result=plan(base,candidate);
  assert.deepEqual(result.changes,[]);assert.deepEqual([...result.sources],b);
  assert.deepEqual([...base],b);assert.deepEqual([...candidate],c);
  const receipt=result.pairEvidence??result.evidence;
  assert.equal(receipt.sourceBase,'ecfb851ad7d9c78c2e7b1937dda0a723946dc215');
  assert.equal(receipt.sourceHead,'eba73df522934b4406585f42ca3f8593dddf2dd3');
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
   // Replacing only the ceiling identity list reconstructs the independently
   // reviewed #1738 tuple, which must retain its own immutable provenance.
   if(name==='paint'&&p==='patches/network-replication/adapter.mjs'&&side===1){
    const result=plan(...rows);assert.deepEqual(result.changes,[]);
    assert.equal(result.evidence.sourceHead,'15c98195a885739c63c78073a958482078a55d23');continue;
   }
   assert.throws(()=>plan(...rows),p+' side '+side);
  }
 });
}
