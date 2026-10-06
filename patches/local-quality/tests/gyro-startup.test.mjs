import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {migrateAimProfiles,applyAimSettingsChange} from '../aim-profile.mjs';
import {viabilityFixture} from './gyro-viability-fixture.mjs';import {initialGyroDefaults} from '../gyro-permission.mjs';
import {adaptSource} from '../../splatoon3/adapter.mjs';import {adaptTouchLayout} from '../../touch-layout/adapter.mjs';import {adaptReliability} from '../../reliability/adapter.mjs';import {adaptQualitySource} from '../adapter.mjs';
const raw=fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8');
const main=adaptQualitySource('src/main.js',adaptReliability('src/main.js',adaptTouchLayout('src/main.js',adaptSource('src/main.js',raw))));
function settings(saved,profile,env) {
 const persistence=raw.slice(raw.indexOf('function loadJSON'),raw.indexOf('const DEFAULT_PROFILE'));
 const begin=main.indexOf('    this.mobile = G.mobile = deviceProfile();'),end=main.indexOf('\n    //',begin);
 assert.ok(begin>=0&&end>begin);const G={},storage={value:saved===undefined?null:JSON.stringify(saved),getItem(){return this.value;},setItem(_k,v){this.value=v;}};
 const Game=vm.runInNewContext(`${persistence}\nclass Game{bootSettings(){${main.slice(begin,end)}}};Game`,{G,migrateAimProfiles,localStorage:storage,DEFAULT_SETTINGS:{gyro:false,fovMode:'h'},deviceProfile:()=>profile,initialGyroDefaults:(d,p)=>initialGyroDefaults(d,p,env)});
 const game=new Game();game.bootSettings();return {value:game.settings,G,game,storage};
}
for(const saved of [undefined,{}, {gyro:false},{gyro:true}])test(`#404 existing settings merge preserves ${JSON.stringify(saved)}`,()=>{
 let requests=0;const env={isSecureContext:true,DeviceOrientationEvent:{requestPermission(){requests++;}},document:{}};
 const h=settings(saved,{touch:true},env);assert.equal(h.value.gyro,saved?.gyro??true);assert.equal(requests,0);
 applyAimSettingsChange(h.value,{gyro:false});h.storage.value=JSON.stringify(h.value);h.game.bootSettings();assert.equal(h.game.settings.gyro,false);assert.equal(requests,0);
});
test('#404 non-touch, motion-only and insecure defaults stay off',()=>{
 const cap={isSecureContext:true,DeviceOrientationEvent:function(){},document:{}};
 assert.equal(settings(undefined,{touch:false},cap).value.gyro,false);
 assert.equal(settings(undefined,{touch:true},{DeviceMotionEvent:function(){},document:{}}).value.gyro,false);
 assert.equal(settings(undefined,{touch:true},{...cap,isSecureContext:false}).value.gyro,false);
 assert.equal(settings({gyro:true},{touch:false},cap).value.gyro,true,'saved intent is not overwritten');
 assert.match(main,/_prepareGyro\(\) \{ return prepareGyroStartup\(this, G\); \}/);
 assert.match(main,/_startGyro\(\) \{ return startGyroStartup\(this, G\); \}/);
});
const gameFor=h=>({input:{mobile:h.m},settings:{gyro:true},match:{state:'playing',paused:false},menus:{current:null}});
for(const order of ['grant-before-start','start-before-grant'])test(`#364/#368 ${order} installs one listener pair without a second prompt`,async t=>{
 const h=await viabilityFixture({permission:'deferred'});t.after(h.close);const game=gameFor(h),G={mode:'match'};
 const prepared=h.prepare(game,G);assert.equal(h.prompts.length,1,'native request still synchronous');assert.equal(h.listenerCount('deviceorientation'),0);
 let started;
 if(order==='start-before-grant')started=h.start(game,G);
 h.answers.shift()('granted');await prepared;
 if(!started)started=h.start(game,G);
 assert.equal(await started,true);assert.equal(h.listenerCount('deviceorientation'),1);assert.equal(h.listenerCount('devicemotion'),1);assert.equal(h.prompts.length,1);
 await h.start(game,G);assert.equal(h.listenerCount('deviceorientation'),1);h.orientation();assert.equal(h.m.gyro.platformStatus.availability,'active');
});
for(const cancel of ['deny','off','destroy','replace','menu','match','suspend'])test(`#364/#368 late grant cannot bypass ${cancel}`,async t=>{
 const h=await viabilityFixture({permission:'deferred'});t.after(h.close);const game=gameFor(h),G={mode:'match'};
 const prepared=h.prepare(game,G);const started=h.start(game,G);
 if(cancel==='off'){game.settings.gyro=false;await h.m.setGyro(false);}
 if(cancel==='destroy')h.m.destroy();
 if(cancel==='replace')game.input.mobile={};
 if(cancel==='menu')game.menus.current='title';
 if(cancel==='match')game.match={state:'playing',paused:false};
 if(cancel==='suspend')h.hide(true);
 h.answers.shift()(cancel==='deny'?'denied':'granted');await prepared;await started;
 assert.equal(h.m.gyro.enabled,false);assert.equal(h.listenerCount('deviceorientation'),0);
});
test('#364/#368 Android immediate start remains immediate; a missing gesture never requests permission',async t=>{
 const h=await viabilityFixture();t.after(h.close);const game=gameFor(h),G={mode:'match'};assert.equal(await h.start(game,G),true);assert.equal(h.prompts.length,0);assert.equal(h.m.gyro.enabled,true);
 const p=await viabilityFixture({permission:'deferred'});t.after(p.close);assert.equal(await p.start(gameFor(p),G),false);assert.equal(p.prompts.length,0);assert.equal(p.m.gyro.enabled,false);
});
test('#364/#368 a second start call cannot retarget an older armed permission to a replaced match',async t=>{
 const h=await viabilityFixture({permission:'deferred'});t.after(h.close);const game=gameFor(h),G={mode:'match'};
 const prepared=h.prepare(game,G);const first=h.start(game,G);game.match={state:'playing',paused:false};
 assert.equal(await h.start(game,G),false);h.answers.shift()('granted');await prepared;await first;
 assert.equal(h.m.gyro.enabled,false);assert.equal(h.prompts.length,1);
});

test('#404 a stale flat flag cannot override the saved active profile; actual settings changes persist',()=>{
 const env={isSecureContext:true,DeviceOrientationEvent:function(){},document:{}},h=settings({gyro:true},{touch:true},env);
 h.storage.value=JSON.stringify({...h.value,gyro:false});h.game.bootSettings();assert.equal(h.game.settings.gyro,true,'profile remains authoritative');
 applyAimSettingsChange(h.game.settings,{gyro:false});h.storage.value=JSON.stringify(h.game.settings);h.game.bootSettings();assert.equal(h.game.settings.gyro,false);
});
