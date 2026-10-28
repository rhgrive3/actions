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
import {selectLowGraphicsFromMain,installLowGraphicsObserver,removeLowGraphicsObserver,readLowGraphicsUi,LOW_UI_ROUTE,assertLowUiSafety} from '../lib/inkwave-low-graphics-ui.mjs';
import {readResumeState} from '../check-inkwave-lock-resume-probe.mjs';
import {createBowActionBarrier,guardedBowInputPage,installEvidence as installBowEvidence} from '../check-inkwave-bow-native.mjs';
import {createDualiesActionBarrier,guardedDualiesInputPage,installEvidence as installDualiesEvidence} from '../check-inkwave-dualies-live-native.mjs';
import {createActionBarrier,guardedInputPage,installEvidence as installPencilEvidence} from '../check-inkwave-pencil-native.mjs';
function integrationPage({bad=false}={}){
 const clicks=[],events=[];let menu='main',quality='high',installed=false;const q={pixelRatio:.75,shadowSize:1024,msaa:0,bloom:false,ao:false,particles:.4};
 const genericEvents=()=>events.map(e=>({type:'click',trusted:e.trusted,id:({settings:'settings',video:'tab-video',quality:'set-quality',back:null})[e.key],menu:e.menu,time:e.time,lockElementId:null,inputLocked:false,pending:false,paused:false}));
 const state=()=>({menu,matchIdentity:1,playing:true,paused:false,range:false,pending:false,inputLocked:false,canvasLocked:false,observer:{installed:true,attributeMatch:true,stopFurtherInput:false,count:0,calls:[]},events:{eventCount:events.length,events:genericEvents()},keys:{count:0,keys:[]}});
 const ui=()=>({menu,owner:{matchIdentity:1,mode:'menu',gameMatches:true,matchMatches:true,attract:true,matchState:'playing',paused:false,noRange:true,noLocal:true,menusMatch:true,screenName:menu,screenConnected:true,screenInert:false,noModal:true,inputMatches:true,noPending:true,heldKeys:[],mouseLeft:false,mouseRight:false},settingsQuality:quality,effective:quality==='low'?q:null,selectedOptions:menu==='settings'?[quality==='low'?0:2]:[],optionCount:menu==='settings'?4:0,viewport:{width:640,height:480,deviceScaleFactor:1},pointerLockHeld:false,pointerLockElement:null,observer:installed?{count:events.length,events:[...events]}:null});
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

test('actual role evidence listeners correlate all four trusted LOW clicks; lock events remain forbidden',()=>{
 for(const install of [installBowEvidence,installDualiesEvidence,installPencilEvidence]){
  const prior={window:globalThis.window,document:globalThis.document,performance:globalThis.performance};const listeners={};let menu='main';
  try{globalThis.performance={now:()=>1};globalThis.document={pointerLockElement:null,addEventListener:(type,fn)=>{(listeners[type]??=[]).push(fn)},removeEventListener:()=>{}};const input={locked:false},game={input,menus:{get current(){return menu}}};globalThis.window={__inkwave:game,__G:{match:{paused:false}}};install();installLowGraphicsObserver();
   const steps=[['settings','main','BUTTON'],['video','settings','BUTTON'],['quality','settings','SPAN'],['back','settings','BUTTON']];
   for(const [key,expected,tag] of steps){menu=expected;const id=({settings:'settings',video:'tab-video',quality:'set-quality',back:null})[key];const row={dataset:{id},tagName:key==='quality'?'DIV':tag};const option={tagName:'SPAN',closest:sel=>sel==='[data-id="set-quality"]'?row:null};row.querySelectorAll=()=>[option,{}];const back={tagName:'BUTTON'};const target={tagName:tag,closest:sel=>sel==='[data-id]'?(id?row:null):sel==='.iw-seg__opt'&&key==='quality'?option:sel==='button.iw-backbtn'&&key==='back'?back:null};for(const fn of listeners.click)fn({type:'click',isTrusted:true,target});}
   const generic=window.__nativeLockEvidence,low=window.__lowGraphicsObserver.state;const state={menu:'main',matchIdentity:1,playing:true,paused:false,range:false,pending:false,inputLocked:false,canvasLocked:false,observer:{installed:true,attributeMatch:true,count:0,calls:[]},events:generic,keys:{count:0,keys:[]}};const ui={menu:'main',owner:{matchIdentity:1,mode:'menu',gameMatches:true,matchMatches:true,attract:true,matchState:'playing',paused:false,noRange:true,noLocal:true,menusMatch:true,screenName:'main',screenConnected:true,screenInert:false,noModal:true,inputMatches:true,noPending:true,heldKeys:[],mouseLeft:false,mouseRight:false},viewport:{width:640,height:480,deviceScaleFactor:1},pointerLockHeld:false,pointerLockElement:null,observer:low};assert.doesNotThrow(()=>assertLowUiSafety(state,ui,'main',ui.viewport));for(const fn of listeners.pointerlockerror)fn({type:'pointerlockerror',isTrusted:true,target:{closest:()=>null}});assert.throws(()=>assertLowUiSafety(state,ui,'main',ui.viewport));
  }finally{for(const k of Object.keys(prior))if(prior[k]===undefined)delete globalThis[k];else globalThis[k]=prior[k];}
 }
});
