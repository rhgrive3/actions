import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const script=new URL('../check-inkwave-native-lifecycle.mjs',import.meta.url);
for(const [ids,reason] of [['','empty id'],['scorch,','empty id'],['scorch,scorch','duplicate ids'],['missing-native','Unknown playable']]){
 test('lifecycle rejects invalid selection before browser work: '+JSON.stringify(ids),()=>{
  const result=spawnSync(process.execPath,[script.pathname],{env:{...process.env,NATIVE_STAGE_IDS:ids},encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,new RegExp(reason));
 });
}
for(const [ids,reason] of [['','empty id'],['missing-native','Unknown playable']]){
 test('lifecycle rejects invalid mobile selection before browser work: '+JSON.stringify(ids),()=>{
  const result=spawnSync(process.execPath,[script.pathname],{env:{...process.env,NATIVE_STAGE_IDS:'scorch',NATIVE_MOBILE_STAGE_IDS:ids},encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,new RegExp(reason));
 });
}
