import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {startProjectileThroughMenu} from '../lib/inkwave-projectile-menu-start.mjs';

function fakePage(overrides={}){
  const clicks=[],phases=[],events=[];
  const g={debug:{},bootMs:94000,match:{attract:true},profile:{weapon:'shooter'},menus:{current:'main',_scr:{name:'main'},_setup:{mode:'turf',mapId:'tidewater',difficulty:'normal',duration:180,...overrides},_stageTime:()=> 'day'}};
  const context={window:{__inkwave:g,__G:{mode:'menu'}}};
  const evaluate=fn=>vm.runInNewContext('('+fn.toString()+')()',context);
  const page={evaluate:async fn=>evaluate(fn),locator:selector=>({click:async options=>{assert.equal(options.timeout,1234);clicks.push(selector);if(selector.includes('"play"'))g.menus.current='mode';else if(selector.includes('mode-turf'))g.menus.current='setup';else if(selector.includes('"start"'))g.menus.current=null;}})};
  return {page,clicks,phases,events,options:{receipt:events,remainingMs:()=>1234,waitForPhase:async(fn,label)=>{phases.push(label);assert.equal(evaluate(fn),true);}}};
}
test('normal menu navigation issues one real START after verifying exact scenario',async()=>{
  const h=fakePage();await startProjectileThroughMenu(h.page,h.options);
  assert.deepEqual(h.clicks,['.iw-main [data-id="play"]','.iw-modesel [data-id="mode-turf"]','.iw-setup [data-id="map-tidewater"]','.iw-setup [data-id="start"].iw-btn--start']);
  assert.equal(h.events.at(-1).event,'native-start-clicked');assert.equal(h.events.at(-1).attempt,1);
  assert.equal(h.events.find(e=>e.event==='native-setup-verified').config.map,'tidewater');
});
test('wrong configuration fails before START rather than mutating game settings or retrying',async()=>{
  const h=fakePage({duration:90});await assert.rejects(startProjectileThroughMenu(h.page,h.options),/configuration mismatch/);
  assert.equal(h.clicks.some(s=>s.includes('"start"')),false);
});
test('failed readiness propagates without a hidden start or retry',async()=>{
  const h=fakePage();h.options.waitForPhase=async()=>{throw new Error('boot not ready');};
  await assert.rejects(startProjectileThroughMenu(h.page,h.options),/boot not ready/);assert.deepEqual(h.clicks,[]);
});
test('production START handler prepares synchronously, then wipes, then admits the same configuration',()=>{
  const source=fs.readFileSync(new URL('../../inkwave-public/src/ui/menus.js',import.meta.url),'utf8');
  for(const anchor of ["id: 'play'","id: 'mode-' + m.id","id: 'map-' + m.id","id: 'start', label: 'START!'",'el.dataset.id = opts.id'])assert.ok(source.includes(anchor),anchor);
  const lo=source.indexOf('  _startMatch() {'),hi=source.indexOf('\n  /**',lo);
  assert.ok(lo>0&&hi>lo);const Menu=vm.runInNewContext('class Menu{'+source.slice(lo,hi)+'};Menu',{safeCall:fn=>fn()});
  const calls=[],m=new Menu();let wipe;
  Object.assign(m,{_setup:{mode:'turf',mapId:'tidewater',difficulty:'normal',duration:180},_stageTime:()=> 'day',api:{prepareMatch:()=>calls.push('prepare'),setSettings:()=>{},startMatch:cfg=>calls.push(cfg)},_runWipe:fn=>{calls.push('wipe');wipe=fn;}});
  m._startMatch();assert.deepEqual(calls,['prepare','wipe']);wipe();assert.equal(calls[2].duration,180);assert.equal(calls[2].mapId,'tidewater');
});
test('harness keeps one admission budget and strict predicate, with retained failure evidence',()=>{
  const s=fs.readFileSync(new URL('../check-inkwave-projectile-visuals.mjs',import.meta.url),'utf8');
  assert.ok(!s.includes('&autostart=180'));assert.equal((s.match(/const deadline = Date.now\(\) \+ NATIVE_BOOT_TIMEOUT_MS/g)||[]).length,1);
  assert.ok(s.includes('const NATIVE_BOOT_TIMEOUT_MS = 180000;'));
  for(const bit of ["G?.mode === 'match'","m === G.match","!m.attract && m.local?.isLocal && m.controller && g.debug","G.projectiles && G.renderer",'prior failure retained separately',"await snapshotAudio('native-startup-timeout')"])assert.ok(s.includes(bit),bit);
});
