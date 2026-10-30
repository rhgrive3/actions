import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {adaptHistoricalSourceMotion20261026,restoreHistoricalSourceMotion20261026}from'../queue-historical-source-motion-20261026-adapter.mjs';
const REL='src/game/motion/source-controller.js',sha=x=>createHash('sha256').update(x).digest('hex');
const legacyBytes=fs.readFileSync(new URL('./fixtures/queue-historical-source-motion-before-20261026.json',import.meta.url));
assert.equal(sha(legacyBytes),'92b24e5c1ff331c66623e73988d176561c8b47875fc6bdeffc85c799870c598a');
const before=JSON.parse(legacyBytes).modules[REL].source;
assert.equal(sha(before),'3b6d6be5d40cdc2e9815e3315c875bc35531811252711967a22d41ea53c62572');
const ownerBytes=fs.readFileSync(new URL('./fixtures/historical-motion-mot01-1913-incoming.json',import.meta.url));
assert.equal(sha(ownerBytes),'9591b6a11d79428aeb5806b8a4e97ca76db9f4cba47f283be76f8198df959284');
const incoming=JSON.parse(ownerBytes);
const once=(source,from,to)=>{assert.equal(source.split(from).length,2);return source.replace(from,to);};
const historical=adaptHistoricalSourceMotion20261026(REL,before);
const oldIncoming=incoming.reduce((source,[from,to])=>once(source,from,to),historical);
test('complete incoming MOT01 epoch reverses to every byte of the independently pinned native controller',()=>{
 assert.equal(restoreHistoricalSourceMotion20261026(REL,oldIncoming),before);
 assert.equal(restoreHistoricalSourceMotion20261026(REL,historical),before,'pre-MOT native source remains unchanged');
});
test('each missing incoming MOT01 site rejects the partial epoch before leaving cached fragments',()=>{
 for(const[from,to,label]of incoming)assert.throws(()=>restoreHistoricalSourceMotion20261026(REL,once(oldIncoming,to,from)),/partial MOT01 owner/,label);
});
test('duplicate and tampered incoming MOT01 anchors cannot masquerade as complete historical input',()=>{
 const tamper=[['p=item._prof||','p=item._unknownProf||'],['entry.clip=item._clip||','entry.clip=item._unknownClip||'],['item.clip.frames','item.unknownClip.frames'],['item.clip','item.unknownClip']];
 for(const[i,[,to,label]]of incoming.entries()){
  assert.throws(()=>restoreHistoricalSourceMotion20261026(REL,once(oldIncoming,to,to+to)),/composition conflict|expected exactly one/,label+' duplicate');
  const[from,replacement]=tamper[i];assert.equal(to.split(from).length,2);
  assert.throws(()=>restoreHistoricalSourceMotion20261026(REL,once(oldIncoming,to,to.replace(from,replacement))),/partial MOT01 owner|composition conflict/,label+' tamper');
 }
});
test('unrelated modules and sources without the exact historical helper suffix retain the original API contract',()=>{
 assert.equal(restoreHistoricalSourceMotion20261026('unrelated',oldIncoming),oldIncoming);
 assert.equal(restoreHistoricalSourceMotion20261026(REL,before),before);
});

const profileBytes=fs.readFileSync(new URL('./fixtures/historical-motion-mot01-1913-profile.json',import.meta.url));
assert.equal(sha(profileBytes),'43f78f3f0b862a5f1534ee6ca51cc59ea8d5d4a0eb7904ed30fe1c98a91bbea4');
const profile=JSON.parse(profileBytes),currentProfile=once(historical,profile.before,profile.after);
test('current guarded-profile epoch has its own inverse and preserves the same complete native source bytes',()=>{
 assert.equal(restoreHistoricalSourceMotion20261026(REL,currentProfile),before);
 assert.notEqual(currentProfile,oldIncoming,'current accepted profile epoch is distinct from the incoming four-cache epoch');
 assert.ok(profile.after.includes('(item._prof=locomotionProfile(bank,name),item._profName=name,item._profBank=bank,item._prof)'),'cache tags publish only after successful lookup');
});
test('partial, duplicate and tampered current profile ownership cannot acquire a historical identity',()=>{
 const lines=profile.after.split('\n');assert.equal(lines.length,3);
 for(let i=0;i<lines.length;i++)assert.throws(()=>restoreHistoricalSourceMotion20261026(REL,once(currentProfile,profile.after,lines.filter((_,j)=>j!==i).join('\n'))),/partial MOT01 profile owner/);
 assert.throws(()=>restoreHistoricalSourceMotion20261026(REL,once(currentProfile,profile.after,profile.after+profile.after)),/composition conflict|expected exactly one/);
 for(const[from,to]of [['item._profName===name','item._profName!==name'],['item._profBank===bank','item._profBank!==bank']])assert.throws(()=>restoreHistoricalSourceMotion20261026(REL,once(currentProfile,from,to)),/partial MOT01 profile owner/);
 const renamedMarkers=currentProfile.replaceAll('item._profBank','item._unknownBank').replaceAll('item._profName','item._unknownName');
 assert.throws(()=>restoreHistoricalSourceMotion20261026(REL,renamedMarkers),/partial MOT01 profile owner/,'paired cache-tag renames cannot hide the current profile epoch');
});
test('current profile owner cannot be mixed with any incoming cached clip producer or consumer',()=>{
 for(const[from,to,label]of incoming.slice(1))assert.throws(()=>restoreHistoricalSourceMotion20261026(REL,once(currentProfile,from,to)),/mixed MOT01/,label);
 const missingNativeClipSite=once(currentProfile,incoming[2][0],'unreviewed cadence');
 assert.throws(()=>restoreHistoricalSourceMotion20261026(REL,missingNativeClipSite),/mixed MOT01 clip-reference owner/);
});
