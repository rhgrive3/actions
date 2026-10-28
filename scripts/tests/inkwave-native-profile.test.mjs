import test from 'node:test';import assert from 'node:assert/strict';import {nativeDiagnosticProfile} from '../lib/inkwave-native-profile.mjs';
test('default profile remains standard; explicit compact LOW is separately labelled',()=>{assert.deepEqual(nativeDiagnosticProfile(),{name:'standard',viewport:{width:960,height:720},deviceScaleFactor:1,label:'standard-960x720-dpr1'});assert.deepEqual(nativeDiagnosticProfile('compact-low'),{name:'compact-low',viewport:{width:640,height:480},deviceScaleFactor:1,label:'compact-low-640x480-dpr1-diagnostic'});assert.throws(()=>nativeDiagnosticProfile('bad'),/Unsupported/);});
import fs from 'node:fs';
test('all three role drivers create fresh profile-bound contexts and retain standard default',()=>{
 for(const role of ['bow','dualies-live','pencil']){
  const src=fs.readFileSync(new URL(`../check-inkwave-${role}-native.mjs`,import.meta.url),'utf8');
  assert.match(src,/run\(\{site,root,out,viewport='standard'\}\)/);
  assert.match(src,/newContext\(\{viewport:profile\.viewport,deviceScaleFactor:profile\.deviceScaleFactor\}\)/);
  assert.match(src,/result\.viewportProfile=profile/);
  assert.match(src,/site\|root\|out\|viewport/);
  assert.match(src,/scripts\/lib\/inkwave-native-profile\.mjs/);
  assert.doesNotMatch(src,/storageState/);
 }
});
test('compact LOW setup is opt-in, after observers/main and before ordinary Play, through guarded facade with recorded evidence',()=>{
 for(const role of ['bow','dualies-live','pencil']){
  const src=fs.readFileSync(new URL(`../check-inkwave-${role}-native.mjs`,import.meta.url),'utf8');
  const init=src.indexOf('page.addInitScript(installLockOutcomeObserver)'),main=src.indexOf("'main ready'"),hook=src.indexOf("if(profile.name==='compact-low')"),play=src.indexOf("[['play','main','mode']");
  assert.ok(init>=0&&init<main&&main<hook&&hook<play,role);
  assert.match(src,/selectLowGraphicsFromMain\(\{page:inputPage,bounded,cap,record:\(label,value\)=>\{result\.lowUiRecords\.push\(\{label,value\}\);save\(\);\},expectedViewport:\{width:640,height:480,deviceScaleFactor:1\},freshContext:true\}\)/);
  assert.match(src,/scripts\/lib\/inkwave-low-graphics-ui\.mjs/);
 }
});
import {selectLowGraphicsFromMain,installLowGraphicsObserver,removeLowGraphicsObserver,readLowGraphicsUi,LOW_UI_ROUTE} from '../lib/inkwave-low-graphics-ui.mjs';
import {readResumeState} from '../check-inkwave-lock-resume-probe.mjs';
import {createBowActionBarrier,guardedBowInputPage} from '../check-inkwave-bow-native.mjs';
import {createDualiesActionBarrier,guardedDualiesInputPage} from '../check-inkwave-dualies-live-native.mjs';
import {createActionBarrier,guardedInputPage} from '../check-inkwave-pencil-native.mjs';
function integrationPage({bad=false}={}){
 const clicks=[],events=[];let menu='main',quality='high',installed=false;const q={pixelRatio:.75,shadowSize:1024,msaa:0,bloom:false,ao:false,particles:.4};
 const state=()=>({menu,playing:false,paused:false,range:false,pending:false,inputLocked:false,canvasLocked:false,observer:{installed:true,attributeMatch:true,stopFurtherInput:false,count:0,calls:[]},events:{eventCount:0,events:[]},keys:{count:0,keys:[]}});
 const ui=()=>({menu,settingsQuality:quality,effective:quality==='low'?q:null,selectedOptions:menu==='settings'?[quality==='low'?0:2]:[],optionCount:menu==='settings'?4:0,viewport:{width:640,height:480,deviceScaleFactor:1},pointerLockHeld:false,pointerLockElement:null,observer:installed?{count:events.length,events:[...events]}:null});
 const page={keyboard:{down:async()=>{},up:async()=>{}},mouse:{down:async()=>{},up:async()=>{}},evaluate:async f=>{if(f===installLowGraphicsObserver){installed=true;return true;}if(f===removeLowGraphicsObserver){installed=false;return true;}if(f===readResumeState)return state();if(f===readLowGraphicsUi)return ui();throw Error('unexpected eval');},waitForFunction:async()=>{},locator:selector=>({click:async()=>{const step=LOW_UI_ROUTE.find(x=>x.selector===selector);clicks.push(step.key);events.push({type:'click',trusted:!(bad&&step.key==='settings'),key:step.key,index:step.key==='quality'?0:null,controlTag:step.key==='quality'?'SPAN':'BUTTON',menu,time:1});if(step.key==='settings')menu='settings';if(step.key==='quality')quality='low';if(step.key==='back')menu='main';}})};
 return {page,clicks};
}
test('LOW helper operates through each actual guarded facade and stops after failed trusted evidence',async()=>{
 for(const role of ['bow','dualies','pencil'])for(const bad of [false,true]){
  const f=integrationPage({bad}),gate={assert(){},whenViolated:new Promise(()=>{})},remaining=()=>10000,cap=()=>10000;let barrier,inputPage;
  if(role==='bow'){barrier=createBowActionBarrier({remaining,cap,gate});inputPage=guardedBowInputPage(f.page,barrier);}
  if(role==='dualies'){barrier=createDualiesActionBarrier({remaining,cap,gate,onStop:()=>{}});inputPage=guardedDualiesInputPage(f.page,barrier.dispatch);}
  if(role==='pencil'){barrier=createActionBarrier({remaining,cap,gate,onTimeout:()=>{}});inputPage=guardedInputPage(f.page,gate,{},barrier.dispatch);}
  const records=[];const run=()=>selectLowGraphicsFromMain({page:inputPage,bounded:barrier.bounded,cap,record:(label,value)=>records.push({label,value}),expectedViewport:{width:640,height:480,deviceScaleFactor:1},freshContext:true});
  if(bad){await assert.rejects(run(),/trusted target/);assert.deepEqual(f.clicks,['settings'],role);}
  else {const result=await run();assert.equal(result.status,'observed',role);assert.deepEqual(f.clicks,['settings','video','quality','back'],role);assert.ok(records.some(x=>x.label==='low-effective'),role);}
 }
});
test('all receipt trust boundaries distinguish the separate official build run from this diagnostic',()=>{
 for(const role of ['bow','dualies-live','pencil']){
  const src=fs.readFileSync(new URL(`../check-inkwave-${role}-native.mjs`,import.meta.url),'utf8');
  assert.match(src,/official build artifact from another CI run by run ID and archive digest/);
  assert.doesNotMatch(src,/Same-run clean exact-source build|Same-run manifest/);
 }
});
