import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {restoreBeforeSlosherPhaseWorkflow as restore} from '../lib/inkwave-slosher-phase-workflow.mjs';
const current=fs.readFileSync(new URL('../../.github/workflows/inkwave-projectile-visuals.yml',import.meta.url),'utf8');
const sha=s=>createHash('sha256').update(s).digest('hex');
// The same sealed inverse is fixture data, not an executable authoring dependency.
const sparseCheckoutMetadataBytes=fs.readFileSync(new URL('../fixtures/inkwave-projectile-sparse-checkout-epoch-20261031.json',import.meta.url));
assert.equal(sha(sparseCheckoutMetadataBytes),'f609e9d8a3c7ad9e36cb11598e33ef31a7c6fb8410f7047811312e9b302ba14d','Exact reviewed sparse checkout inverse metadata');
const block=JSON.parse(sparseCheckoutMetadataBytes).checkoutBlock;
test('exact sparse successor maps to the original phase-only seal and original predecessor',()=>{
 assert.equal(sha(current),'4c360faa9ad52c4766770b1839f43fcee8098167bdfd423444fccfa7af9136cd');
 assert.equal(current.split(block).length,4);
 const phase=current.split(block).join('');
 assert.equal(sha(phase),'8a0de1c78f47b01c7d99061ad06994abe57faf348986e8d76b9478f19240a9fa');
 assert.equal(restore(current),restore(phase));
 assert.equal(sha(restore(current)),'6402a428fbc726542c8566537f449bccb7b591bcfb46f0f8b7c234f50ef1ed9d');
});
test('partial, duplicated and mutated checkout contracts cannot normalize',()=>{
 const parts=current.split(block);
 for(let index=0;index<3;index++){
  const alter=replacement=>parts.map((part,i)=>i===3?part:part+(i===index?replacement:block)).join('');
  for(const value of ['',block+block,block.replace('filter: blob:none','filter: tree:0'),block.replace('cone-mode: false','cone-mode: true'),block.replace('/reports/ink-volume/source/','/reports/')]){
   assert.throws(()=>restore(alter(value)));
  }
 }
 assert.throws(()=>restore(current+'\n'));
 assert.throws(()=>restore(current.replace('--require-complete','--allow-incomplete')));
});
