import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceChargerHitCue } from '../runtime/audio/combat-hit-classifier.mjs';

test('accepted original full-charge Charger hit selects CriticalHit even when nonlethal',()=>{
 for(const id of ['charger','charger-01','charger-02','s3-charger-quick','s3-charger-normalscope','s3-charger-long','s3-charger-longscope','s3-charger-keeper','s3-charger-long-01']){
  assert.equal(sourceChargerHitCue(id,1),'combat:critical',id);
  assert.equal(sourceChargerHitCue(id,.999),'combat:damage',id+' 99.9% is not a confirmed full charge');
  assert.equal(sourceChargerHitCue(id,.5),'combat:damage',id+' lethal partial never counts as full charge');
  assert.equal(sourceChargerHitCue(id,0),'combat:damage',id+' tap fire');
 }
});
test('Bamboo and R-PEN do not manufacture a generic critical hit cue',()=>{
 for(const id of ['s3-charger-light','s3-charger-light-01','s3-charger-pencil','s3-charger-pencil-01']){
  assert.equal(sourceChargerHitCue(id,1),'combat:damage',id);
 }
});
test('non-Charger hits and unknown metadata never trigger a Charger critical cue',()=>{
 for(const id of ['shooter','splatling','s3-blaster-middle','special:inkjet','sub:bomb','s3-charger-lightning','',null,undefined]){
  assert.equal(sourceChargerHitCue(id,1),null,String(id));
 }
 for(const c of [null,undefined,NaN,Infinity,-Infinity,0.99999]){
  assert.equal(sourceChargerHitCue('charger',c),'combat:damage',String(c));
 }
 assert.equal(sourceChargerHitCue('charger',1),sourceChargerHitCue('charger',1),
   'repeat samples share the same source event ID');
});
