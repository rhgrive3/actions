import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { adaptInitialGyroPreference } from '../platform-adapter.mjs';
import { migrateAimProfiles } from '../aim-profile.mjs';
import { initialGyroDefaults } from '../gyro-permission.mjs';
const main=fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8');
const raw="    this.settings = G.settings = loadJSON('inkwave.settings', DEFAULT_SETTINGS);\n    this.mobile = G.mobile = deviceProfile();";
const profiled=raw.replace("loadJSON('inkwave.settings', DEFAULT_SETTINGS)","migrateAimProfiles(loadJSON('inkwave.settings', DEFAULT_SETTINGS), DEFAULT_SETTINGS)").replace(";\n    this.mobile", ";\n    saveJSON('inkwave.settings', this.settings);\n    this.mobile");
test('native settings anchor and profile variant preserve first-run and explicit saved gyro preferences',()=>{
 assert.ok(main.includes(raw));
 for(const input of [raw,profiled])for(const touch of [false,true])for(const saved of [undefined,{gyro:false},{gyro:true}]){
  const code=adaptInitialGyroPreference(input),G={},calls=[],defaults={gyro:false};
  const env={DeviceOrientationEvent:{},DeviceMotionEvent:{},isSecureContext:true};
  const Game=vm.runInNewContext(`class Game { init(){${code}} }; Game`,{G,DEFAULT_SETTINGS:defaults,deviceProfile:()=>{calls.push('device');return{touch};},loadJSON:(_k,d)=>{calls.push('load');return{...d,...saved};},saveJSON:(_k,s)=>{calls.push('save');assert.equal(s,G.settings);},initialGyroDefaults:(d,p)=>initialGyroDefaults(d,p,env),migrateAimProfiles});
  const g=new Game();g.init();assert.equal(g.settings.gyro,saved?.gyro??touch);assert.equal(g.mobile,G.mobile);assert.equal(g.settings,G.settings);assert.deepEqual(calls.slice(0,2),['device','load']);assert.equal(calls.filter(c=>c==='save').length,input===profiled?1:0);assert.equal(defaults.gyro,false);
 }
});
test('profiled startup retains saved independent modes and persists the migrated active projection once',()=>{
 const saved={aimProfile:'handheld',aimProfiles:{tv:{gyro:true,invertX:true},handheld:{gyro:false,invertX:false}}};
 const G={},savedCopies=[];
 const Game=vm.runInNewContext(`class Game{init(){${adaptInitialGyroPreference(profiled)}}};Game`,{G,DEFAULT_SETTINGS:{gyro:false},deviceProfile:()=>({touch:true}),loadJSON:()=>structuredClone(saved),saveJSON:(_k,s)=>savedCopies.push(structuredClone(s)),initialGyroDefaults:(d)=>({...d,gyro:true}),migrateAimProfiles});
 const g=new Game();g.init();assert.equal(g.settings.gyro,false);assert.equal(g.settings.aimProfiles.tv.gyro,true);assert.equal(savedCopies.length,1);assert.equal(savedCopies[0].gyro,false);
});
test('unknown, mixed, duplicate and repeated startup transformations fail closed',()=>{
 for(const s of ['',raw+'\n'+raw,raw+'\n'+profiled,adaptInitialGyroPreference(raw),adaptInitialGyroPreference(profiled)])assert.throws(()=>adaptInitialGyroPreference(s),/platform anchor mismatch/);
});
