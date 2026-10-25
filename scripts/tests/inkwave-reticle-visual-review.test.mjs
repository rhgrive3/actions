import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {BASELINE_SHA,CASES,VIEWPORTS,reticleCrop,assertSnapshot,pace,sha256,browserLaunchOptions,settleCamera,inspectCaptureSurface,assertSurfaceInvariant,pngDimensions,
  SPLATLING_CASES,SPLATLING_PHASES,captureMatrix,splatlingPhaseReady,assertSplatlingCapture,untilSplatling,splatlingSampleDt,closeOwnedBrowser} from '../check-inkwave-reticle-visual-review.mjs';

const source=fs.readFileSync(new URL('../check-inkwave-reticle-visual-review.mjs',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../../.github/workflows/inkwave-reticle-visual-review.yml',import.meta.url),'utf8');
function row(scenario,phase='idle',before=false) {
  return {weaponId:scenario.id,hudWeapon:scenario.id,kind:scenario.kind,installed:!before,
    retConnected:true,hudVisible:true,visible:!(scenario.kind==='charger'&&(before||!scenario.profile)&&['idle','release','switch-back'].includes(phase)),rect:{x:640,y:360,width:0,height:0},
    profiles:before||!scenario.profile?[]:[scenario.profile],profileArtwork:[{display:'block',bounds:{width:160,height:128}}],
    chargeHandleConnected:true,chargeHandleInReticle:true,chargeOffset:0,
    chargeArtworkHidden:!before&&!!scenario.profile&&scenario.kind==='charger',decoratedSpreadTicks:4,
    classes:!before&&scenario.profile?[]:['iw-ret--'+scenario.kind],
    charge:phase==='charging'?.5:phase==='full'?1:0,charging:['charging','full'].includes(phase)};
}
test('capture matrix is small, actual weapon IDs, 720p reference plus mobile DPR coverage',()=>{
  assert.equal(CASES.length,7);
  assert.deepEqual(CASES.map(s=>s.id),['roller','s3-shelter-normal','s3-saber-lite','s3-saber-normal','charger','s3-stringer-normal','s3-brush-normal']);
  assert.deepEqual(VIEWPORTS.map(v=>[v.width,v.height,v.deviceScaleFactor]),[[1280,720,1],[844,390,3]]);
  assert.equal(BASELINE_SHA,'7f863ea2d65671abd1453fdae1b61de00f1d10e2');
});
test('reticle crop is unscaled CSS rectangle, centered and clamped',()=>{
  assert.deepEqual(reticleCrop({x:640,y:360,width:0,height:0},VIEWPORTS[0]),{x:520,y:260,width:240,height:200});
  assert.deepEqual(reticleCrop({x:-40,y:500,width:0,height:0},VIEWPORTS[1]),{x:0,y:190,width:240,height:200});
});
test('baseline and actual supported/unprofiled candidate state contracts',()=>{
  for(const before of [true,false])for(const scenario of CASES) {
    for(const phase of scenario.idleOnly?['idle']:scenario.charge?['idle','charging','full','release','switch-back']:['idle','firing','release'])
      assertSnapshot(row(scenario,phase,before),scenario,phase,before);
  }
});
test('fail closed on missing installation, wrong actual ID/profile, hidden overlay and detached charge handle',()=>{
  const s=CASES[2];
  for(const patch of [{installed:false},{weaponId:'charger'},{hudWeapon:'charger'},{profiles:[]},
    {profileArtwork:[{display:'none',bounds:{width:160,height:128}}]},
    {chargeHandleConnected:false},{chargeHandleInReticle:false},{chargeOffset:NaN},{chargeArtworkHidden:false},
    {classes:['iw-ret--charger']},{charging:true,charge:.5}])
    assert.throws(()=>assertSnapshot({...row(s),...patch},s,'idle'),undefined,JSON.stringify(patch));
});
test('native fallback must never inherit a supported overlay or hidden native charge art',()=>{
  const s=CASES.find(s=>s.name==='native-charger-fallback');
  assert.throws(()=>assertSnapshot({...row(s),profiles:['wiper-reference-720p']},s,'idle'));
  assert.throws(()=>assertSnapshot({...row(s),chargeArtworkHidden:true},s,'idle'));
});
test('partial/full/release are real runner predicates, not manufactured frame snapshots',()=>{
  const s=CASES[3];
  assert.throws(()=>assertSnapshot({...row(s,'charging'),charge:1},s,'charging'));
  assert.throws(()=>assertSnapshot({...row(s,'full'),charge:.9},s,'full'));
  assert.throws(()=>assertSnapshot({...row(s,'release'),charging:true},s,'release'));
  assert.match(source,/range\.setWeapon\(id\)/);
  assert.match(source,/debug\.fire\(true\)/);
  assert.doesNotMatch(source,/\.setContent\(|\.insertAdjacentHTML\(|runner\.charge\s*=(?!=)|runner\.charging\s*=(?!=)/);
});
test('paced advancement yields every native RAF, never debug.step or synchronous GPU bursts',async()=>{
  let calls=0;
  await pace({evaluate:async(fn,arg)=>{calls++;assert.deepEqual(arg,{frames:3,dt:1/60});assert.match(fn.toString(),/await new Promise\(resolve=>requestAnimationFrame\(resolve\)\)/);}},3);
  assert.equal(calls,1);
  await assert.rejects(pace({},241));
  assert.doesNotMatch(source,/debug\.step\(/);
  assert.match(source,/g\._frame\(dt\)/);assert.match(source,/nativeTickDelta!==Math\.round\(dt\*60\)/);
});
test('use known full Chromium WebGL mitigation without overriding custom executable or quality',()=>{
  assert.equal(browserLaunchOptions().channel,'chromium');
  assert.equal(browserLaunchOptions().headless,true);
  assert.equal(browserLaunchOptions('/custom/chromium').executablePath,'/custom/chromium');
  assert(!('channel' in browserLaunchOptions('/custom/chromium')));
  assert.match(source,/a\.spawnAt\(a\.pos\.clone\(\)\.set\(-14\.6,\.04,0\),0\)/);
  assert.match(source,/g\.rig\.follow\(a,true\)/);
  assert.doesNotMatch(source,/animations:\s*'disabled'|\.finish\(\)[\s\S]*debug\.step/);
  assert.equal((source.match(/scale:'device',timeout:20000/g)||[]).length,2,'original screenshot deadlines unchanged');
});
test('native camera settles only after blend ends and four stable paced frames, with bounded failure',async()=>{
  let reads=0,steps=0;
  const page={evaluate:async(fn,arg)=>{
    if(arg?.frames){steps++;return;}
    reads++;return {pose:[reads<3?3-reads:0,0,0,0,0,0,1,55],blendActive:reads<2,weaponId:'roller',charging:false};
  }};
  const result=await settleCamera(page,10);
  assert.equal(result.stableFrames,4);assert.equal(result.weaponId,'roller');assert.equal(steps,reads);
  await assert.rejects(settleCamera({evaluate:async(fn,arg)=>arg?.frames?undefined:{pose:[0],blendActive:true,charging:false}},4),/did not settle/);
});
test('render-only surface redraw drains GPU without changing clock/pose/charge and fails closed on mutation',()=>{
  const oldWindow=globalThis.window,oldStyle=globalThis.getComputedStyle;
  const vec=()=>({toArray:()=>[0,0,0]}),box={width:1280,height:720,toJSON:()=>({width:1280,height:720})};
  let renders=0,finishes=0;
  const G={time:1,match:{time:2,stateT:3},local:{weaponId:'roller',pos:vec(),weaponRunner:{charge:.5,chargeT:.5,charging:true}},camera:{position:vec(),quaternion:vec(),fov:55,aspect:16/9},
    renderer:{domElement:{isConnected:true,width:960,height:540,getBoundingClientRect:()=>box},getPixelRatio:()=>.75,getContext:()=>({finish:()=>finishes++,isContextLost:()=>false})}};
  const g={frozen:true,R:{render:()=>renders++},hud:{_L:{splatFirst:1,splatSecond:.5}}};
  globalThis.window={__G:G,__inkwave:g};
  // Browser globals read by the evaluator are supplied as test-only DOM doubles.
  const saved={innerWidth:globalThis.innerWidth,innerHeight:globalThis.innerHeight,devicePixelRatio:globalThis.devicePixelRatio,document:globalThis.document};
  Object.assign(globalThis,{innerWidth:1280,innerHeight:720,devicePixelRatio:1,document:{fonts:{status:'loaded'},visibilityState:'visible'},getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'})});
  try {
    const before=inspectCaptureSurface({redraw:true}),after=inspectCaptureSurface();
    assert.equal(renders,1);assert.equal(finishes,1);assertSurfaceInvariant(before,after);
    assert.throws(()=>assertSurfaceInvariant(before,{...after,state:{...after.state,charge:.6}}));
    assert.throws(()=>assertSurfaceInvariant(before,{...after,state:{...after.state,clock:[9]}}));
    assert.throws(()=>assertSurfaceInvariant(before,{...after,state:{...after.state,streaming:true,streamElapsed:.5}}));
    g.R.render=()=>G.time++;
    assert.throws(()=>inspectCaptureSurface({redraw:true}),/advanced native clock, pose or charge/);
  } finally {globalThis.window=oldWindow;globalThis.getComputedStyle=oldStyle;Object.assign(globalThis,saved);}
});
test('affected next suite is explicitly bounded desktop-only, retaining unchanged default first-four matrix',()=>{
  assert.deepEqual(captureMatrix().cases,CASES);assert.deepEqual(captureMatrix().viewports,VIEWPORTS);
  const m=captureMatrix(['--suite=affected-brella-splatling','--viewport=desktop']);
  assert.equal(m.screenshotStateCount,19);assert.equal(m.viewports.length,1);assert.equal(m.viewports[0].name,'desktop');
  assert.deepEqual(m.cases.map(c=>c.id),['s3-shelter-normal','s3-spinner-serein','s3-spinner-downpour','charger']);
  assert.equal(m.cases.at(-1).idleOnly,true);
  assert.deepEqual(SPLATLING_CASES.map(c=>c.switchAt),['full','stream-second']);
  assert.throws(()=>captureMatrix(['--suite=affected-brella-splatling']));
  assert.throws(()=>captureMatrix(['--suite=all-weapons']));
  const split=['affected-brella','affected-nautilus','affected-ballpoint'].map(s=>captureMatrix(['--suite='+s,'--viewport=desktop','--render-hz=30']));
  assert.deepEqual(split.map(s=>s.screenshotStateCount),[4,8,7]);assert(split.every(s=>s.dt===1/30));
  assert.throws(()=>captureMatrix(['--render-hz=30']),'prior default matrix remains60Hz');
  assert.match(source,/invuln:a\.invuln,ink:a\.ink,fullT:/);
  assert.match(source,/shield:\{classes:/);assert.match(source,/tank:\{classes:/);
});
function splatRow(c,phase,before=false) {
  const values={idle:[0,0,0,false,false],'first-ready':[.01,1,0,true,false],'second-charging':[.6,1,.5,true,false],
    full:[1,1,1,true,false],'stream-second':[0,1,.5,false,true],'stream-first':[0,.5,0,false,true],depleted:[0,0,0,false,false],'switch-back':[0,0,0,false,false]};
  const [charge,first,second,charging,streaming]=values[phase];
  return {...row(c,phase,before),charge,first,second,charging,streaming,chargeT:1,
    visible:!['idle','depleted','switch-back'].includes(phase),classes:streaming?['iw-ret--splatling','is-streaming']:['iw-ret--splatling'],
    handlesAttached:true,offsets:[first,second].map(v=>Number((100*(1-v)).toFixed(2))),profiles:[],cornerCount:before?0:4,
    angles:['45deg','135deg','225deg','315deg'].map(a=>'--a:'+a),catalogId:c.id,streamTime:2,streamElapsed:.5};
}
test('Splatling authoritative two-stage/stream/depleted phases retain hidden idle and attached native rings',()=>{
  for(const c of SPLATLING_CASES)for(const before of [true,false])for(const phase of [...SPLATLING_PHASES,'switch-back']) {
    const state=splatRow(c,phase,before);assert(splatlingPhaseReady(state,phase));assertSplatlingCapture(state,c,phase,{before});assertSnapshot(state,c,phase,before);
  }
  const c=SPLATLING_CASES[0],stream=splatRow(c,'stream-second');
  assert(!splatlingPhaseReady(stream,'depleted'),'raw zero charge cannot pass while streaming');
  assert(!splatlingPhaseReady({...stream,streaming:false,first:1,second:0},'depleted'));
  for(const patch of [{cornerCount:8},{handlesAttached:false},{angles:['--a: 45deg']},{offsets:[0,100]},{visible:false},{catalogId:'splatling'}])
    assert.throws(()=>assertSplatlingCapture({...stream,...patch},c,'stream-second'));
  assert.equal(splatRow(c,'depleted').chargeT,1,'chargeT is observed, not incorrectly required to clear');
});
test('Ballpoint one-frame first stage waits native gauges, not generic normalized .35 charge',async()=>{
  let reads=0;
  const c=SPLATLING_CASES[1],page={evaluate:async(fn,arg)=>{
    if(arg?.frames)return;
    reads++;return splatRow(c,reads===1?'idle':'first-ready');
  }};
  assert.equal(await untilSplatling(page,'first-ready',4),1);
  assert(splatlingPhaseReady(splatRow(c,'first-ready'),'first-ready'));
  assert(splatRow(c,'first-ready').charge<.35);
  await assert.rejects(untilSplatling({evaluate:async(fn,arg)=>arg?.frames?undefined:splatRow(c,'idle')},'full',2),/phase deadline/);
  assert(!splatlingPhaseReady({...splatRow(c,'stream-first'),first:4.263e-13},'stream-first'),'floating-point dust is not visible stage1');
  assert(!splatlingPhaseReady({...splatRow(c,'stream-first'),first:4.263e-13,offsets:[100,100]},'stream-first'));
  assert(!splatlingPhaseReady({...splatRow(c,'stream-first'),first:1e-6,offsets:[100,100]},'stream-first'),'positive progress rounded to empty ring must fail');
  assert.match(source,/fallback\.cornerCount,0/);assert.match(source,/no old second ring in native fallback/);
});
test('physical PNG dimensions are explicit, rejecting non-PNG bytes rather than assuming CSS scale',()=>{
  const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.writeUInt32BE(720,16);bytes.writeUInt32BE(600,20);
  assert.deepEqual(pngDimensions(bytes),{width:720,height:600});
  assert.throws(()=>pngDimensions(Buffer.from('not png')));
  for(const pattern of [/xhClasses/,/effectiveOpacity/,/muzzleBlock/,/surfaceBefore/,/surfaceAfter/,/sourceSha=sourceSha/,/imagePixels/])assert.match(source,pattern);
});
test('identities, 1:1 frame/crop PNGs and failure diagnostics are persisted',()=>{
  for(const pattern of [/build\.artifacts\[relative\]/,/probeSha256/,/imageSha256/,/baseWeaponId/,/fov:/,/css:/,/failure\.png/,/browser\.log/,/interruption\?'interrupted':'failed'/])assert.match(source,pattern);
  assert.equal(sha256('reticle').length,64);
});
test('workflow has only exact isolated branch plus trigger path; no PR/manual/all-CI trigger',()=>{
  assert.match(workflow,/branches: \['improve\/inkwave-weapon-reticles-20261025'\]/);
  assert.match(workflow,/paths: \['diagnostics\/inkwave-reticle-visuals\.trigger\.json'\]/);
  assert.doesNotMatch(workflow,/pull_request:|workflow_dispatch:|schedule:|push:\s*\n\s+branches:.*main/);
  assert.equal((workflow.match(/runs-on:/g)||[]).length,1);
  assert.match(workflow,/ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow,/test "\$\(git rev-parse HEAD\)" = "\$SOURCE_SHA"/);
  assert.match(workflow,/assert\.equal\(trigger\.state,'run'\)/);
  assert.match(workflow,/assert\.equal\(trigger\.fullAcceptance,false\)/);
});
test('workflow pins tools, builds both actual production sources and always uploads hidden diagnostics',()=>{
  assert.match(workflow,/esbuild@0\.28\.2 playwright@1\.62\.1/);
  assert.equal((workflow.match(/node scripts\/build-inkwave\.mjs inkwave-public/g)||[]).length,2);
  assert.doesNotMatch(workflow,/INKWAVE_BUILD_UNMINIFIED|continue-on-error|npm test|npm run test/);
  assert.match(workflow,/if: always\(\)/);
  assert.match(workflow,/include-hidden-files: true/);
  assert.match(workflow,/set -euo pipefail/);
  assert.match(workflow,/retailParity:'unverified',fullAcceptance:false/);
});
test('exact-head three-suite matrix retains deadlines, independent siblings and distinct artifacts',()=>{
  assert.match(workflow,/fail-fast: false/);assert.match(workflow,/max-parallel: 3/);
  assert.match(workflow,/suite: \[affected-brella, affected-nautilus, affected-ballpoint\]/);
  assert.match(workflow,/reticle-visual-review-\$\{\{ github\.sha \}\}-\$\{\{ matrix\.suite \}\}/);
  assert.equal((workflow.match(/timeout-minutes: 12/g)||[]).length,2);
  assert.match(workflow,/timeout-minutes: 40/);
  assert.equal((workflow.match(/timeout --signal=TERM --kill-after=15s 700s node/g)||[]).length,2);
  assert.match(workflow,/steps\.baseline-cleanup\.outcome == 'success'/);
  assert.match(source,/chromium\.launchServer\([\s\S]*?host:'127\.0\.0\.1'/);
  assert.match(source,/if\(page&&!interruption\)/,'no late catch screenshot after interruption');
  assert.doesNotMatch(source+'\n'+workflow,/pkill|killall|process\.kill\(-1/);
});
test('owned BrowserServer cleanup records graceful exit, bounded force and failed-closed outcome',async()=>{
  const child={pid:12345,exitCode:null,signalCode:null},updates=[];
  const normal={process:()=>child,close:async()=>{child.exitCode=0;},kill:async()=>{throw Error('must not force normal close');}};
  const clean=await closeOwnedBrowser(normal,{timeoutMs:5,onUpdate:r=>updates.push(r)});
  assert.equal(clean.status,'closed');assert(clean.exited&&!clean.forced&&clean.startedAt&&clean.finishedAt);assert.equal(clean.browserPid,12345);
  assert.equal(updates[0].status,'closing');assert.equal(updates.at(-1).status,'closed');
  child.exitCode=null;
  const forced={process:()=>child,close:()=>new Promise(()=>{}),kill:async()=>{child.signalCode='SIGKILL';}};
  const force=await closeOwnedBrowser(forced,{reason:'signal:SIGTERM',timeoutMs:5});
  assert(force.forced&&force.exited);assert.equal(force.reason,'signal:SIGTERM');
  child.signalCode=null;
  await assert.rejects(closeOwnedBrowser({process:()=>child,close:async()=>{},kill:async()=>{}},{timeoutMs:5}),/did not exit/);
});
test('GNU timeout terminates only its owned child group, leaving a separately created child alone',{timeout:10000},async()=>{
  const configured=spawn('timeout',['--signal=TERM','--kill-after=15s','700s',process.execPath,'-e','process.exit(0)'],{stdio:'ignore'});
  assert.equal(await new Promise((resolve,reject)=>{configured.once('error',reject);configured.once('close',resolve);}),0,'exact configured timeout syntax must execute');
  const unrelated=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
  const unrelatedClosed=new Promise(resolve=>unrelated.once('close',resolve));
  try {
    const owned=spawn('timeout',['--signal=TERM','--kill-after=0.5s','2s',process.execPath,'-e',"process.on('SIGTERM',()=>{console.log('OWNED_TERM');process.exit(0)});console.log('OWNED_READY');setInterval(()=>{},1000)"],{stdio:['ignore','pipe','pipe']});
    let output='';owned.stdout.on('data',bytes=>output+=bytes);
    const code=await new Promise((resolve,reject)=>{owned.once('error',reject);owned.once('close',resolve);});
    assert.equal(code,124);assert.match(output,/OWNED_READY/,'child installed its signal handler before deadline');assert.match(output,/OWNED_TERM/);assert.equal(unrelated.exitCode,null,'unrelated child remains alive');
  } finally {unrelated.kill('SIGTERM');await unrelatedClosed;}
});

// Actual composed Main + FixedClock/native charge; visuals/emissions are doubles, NOT browser QA.
test('composed Main mixed cadence preserves native ticks and captures both Ballpoint boundary parities',async t=>{
const path=await import('node:path'); const {pathToFileURL,fileURLToPath}=await import('node:url');
const root=process.env.INKWAVE_RETICLE_BASELINE_ROOT||fileURLToPath(new URL('../../',import.meta.url));
const load=relative=>import(pathToFileURL(path.join(root,relative)));
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const source=read('patches/splatoon3/runtime/main-weapon-catalog.mjs');
const {adaptBuildSource}=await load('scripts/inkwave-source-composition.mjs');
const {runSimulation,installClock,FixedClock}=await load('patches/splatoon3/runtime/clock.mjs');
const {MAIN_WEAPON_CATALOG}=await load('patches/splatoon3/runtime/main-weapon-catalog-data.mjs');
const {updateSplatlingStages}=await load('patches/local-quality/splatling-reticle.mjs');
const record=MAIN_WEAPON_CATALOG.records.find(r=>r.id==='s3-spinner-downpour');
const firstShots=record.parameters.WeaponParam.MaxShootingFrame_First;
const between=(s,a,b)=>{const x=s.indexOf(a),y=s.indexOf(b,x);assert(x>=0&&y>x,a);return s.slice(x,y);};
const nativeFactory=Function(`
 const EPS=1e-9,HZ=60,DT=1/60,clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
 const lerp=(a,b,t)=>a+(b-a)*t,finite=(v,f)=>Number.isFinite(v)?v:f;
 ${between(source,'function weaponParam(r)','function recordMove(r)')}
 class ShooterAccuracy {}
 ${between(source,'function initialState(r,actor)','\nexport function installMainWeaponCatalogRuntime')}
 const inkMod=()=>1,pay=(r,cost)=>{r.a.ink-=cost;return true;},emitSingle=()=>{};
 const cancel=()=>{throw Error('unexpected funded trace cancellation');};
 ${between(source,'  function charge(runner,r,input,s,dt)','  function saberMeleeContact(')}
 return record=>{const actor={weapon:{catalogRecord:record},ink:100,grounded:true,hp:100,enemyTeam:1};
 const runner={a:actor,cooldown:0,charge:0,chargeT:0,charging:false,streaming:false};
 actor.weaponRunner=runner;runner.catalogState=initialState(record,actor);
 return {actor,runner,tick:(fire,dt)=>charge(runner,record,{fire,firePressed:false},runner.catalogState,dt)};};
`)();
const composed=adaptBuildSource('src/main.js',read('inkwave-public/src/main.js'));
const frameMethod=between(composed,'  _frame(dt) {','\n  // continuous sounds');
assert.match(frameMethod,/runSimulation\(this, portraitFrame\.released \? 0 : dt\)/);
assert.equal((frameMethod.match(/this\._updateHud\(/g)||[]).length,1,'one actual HUD sampling point per frame');
function harness(){
 const f=nativeFactory(record),frames=[],ticks=[],copy={copy(){}};
 const G={time:0,mode:'range',actors:[],renderer:{info:{reset(){},render:{calls:0,triangles:0}},shadowMap:{}},teamColors:[{},{}],projectiles:{update(){}}};
 // Real Main._frame method, unrelated visual/UI policies elided. A covered
 // NON-attract match is still simulated by actual runSimulation and updates HUD.
 const deps={G,runSimulation,document:{hidden:false},syncPortraitFrame:()=>({offline:false,released:false}),
   pausedWorldFrame:()=>({paused:false}),idleAttractMenuBudget:()=>false,
   effectiveQuality:()=>({shadowSize:1024}),damp:(a,b)=>b,clamp:(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v))};
 const Main=Function(...Object.keys(deps),'return class {'+frameMethod+'}')(...Object.values(deps));
 const game=new Main(),hud={_L:{},_chargeEl:{style:{}},_chargeSecond:{style:{}},ret:{classList:{toggle(){}}},_restart(){}};
 let fire=true,hudUpdates=0;
 Object.assign(game,{input:{padPressed:new Set(),pollPad(){},endFrame(){}},_padMenus(){},
   showcase:{fullFrame:true,update(){},render(){}},rig:{mode:'follow',target:f.actor},settings:{quality:'low'},
   R:{grade:{uniforms:{uHurt:{value:0},uHurtColor:{value:copy}}}},_updateLocalLoops(){},_updateAmbience(){},
   hud,_updateHud(){hudUpdates++;updateSplatlingStages(hud,f.runner.charge,f.runner,f.actor.weapon);},
   match:{state:'playing',attract:false,paused:false,local:f.actor,updateController(){},update(dt){
     assert.equal(dt,1/60);f.tick(fire,dt);ticks.push({dt,elapsed:f.runner.catalogState.streamElapsed,streaming:f.runner.streaming});}}});
 installClock({G});
 function state(){const r=f.runner,s=r.catalogState;return {charge:r.charge,charging:r.charging,streaming:r.streaming,
   streamTime:s.streamTime,streamElapsed:s.streamElapsed,first:hud._L.splatFirst,second:hud._L.splatSecond};}
 function frame(dt){const oldTicks=game.s3Clock?.ticks||0,oldHud=hudUpdates;game._frame(dt);
   const row={...state(),dt,tickDelta:game.s3Clock.ticks-oldTicks,offsets:[hud._chargeEl.style.strokeDashoffset,hud._chargeSecond.style.strokeDashoffset]};
   assert.equal(hudUpdates-oldHud,1);assert.equal(row.tickDelta,Math.round(dt*60));
   assert.equal(hud._chargeEl.style.strokeDashoffset,(100*(1-row.first)).toFixed(2));
   assert.equal(hud._chargeSecond.style.strokeDashoffset,(100*(1-row.second)).toFixed(2));
   frames.push(row);return row;}
 return {game,frames,ticks,frame,state,release:()=>{fire=false;}};
}
// Read only source-owned elapsed/duration. Never change a timer or gauge.
function chooseDt(state,baseDt=1/30){return splatlingSampleDt({...state,firstStreamFrames:firstShots},'stream-first',baseDt);}
// Reject floating-point dust which the prior >0 predicate labels nonempty.
const genuineStreamFirst=row=>splatlingPhaseReady({...row,offsets:row.offsets?.map(Number)},'stream-first');
function trace(parity,adaptive){const h=harness();
 while(!splatlingPhaseReady(h.state(),'full'))h.frame(1/30);
 h.release();h.frame(parity===0?1/60:1/30); // Real input/frame placement establishes parity, no clock writes.
 let caught=false;
 for(let i=0;i<200;i++){
   const row=h.frame(adaptive?chooseDt(h.state()):1/30);
   caught ||= genuineStreamFirst(row);
   if(splatlingPhaseReady(row,'depleted'))break;
 }
 assert(splatlingPhaseReady(h.state(),'depleted'));
 return {...h,caught};}
await t.test('30Hz Main._frame runs two real1/60 fixed ticks, HUD stages only once after both',()=>{
 const h=harness();h.frame(1/30);
 assert(h.game.s3Clock instanceof FixedClock);assert.deepEqual(h.ticks.map(t=>t.dt),[1/60,1/60]);
 assert.equal(h.frames.length,1);assert.equal(h.state().charge,2/record.parameters.WeaponParam.ChargeFrame_Second);
});
await t.test('Ballpoint one-source-frame stream-first is parity-sensitive at30Hz, not a reliable rendered capture',()=>{
 assert.equal(firstShots,1);
 const coarse=[trace(0,false),trace(1,false)];
 assert.deepEqual(coarse.map(t=>t.caught),[true,false]);
 const phantom=coarse[1].frames.find(r=>r.streaming&&!r.charging&&r.charge===0&&r.first>0&&r.first<1e-7&&Math.abs(r.second)<1e-7);
 assert(phantom&&phantom.first>0&&phantom.first<1e-7,'old predicate accepts floating-point dust');
 assert.equal(phantom.offsets[0],'100.00','the old predicate accepted an actually empty first ring');assert(!splatlingPhaseReady({...phantom,offsets:phantom.offsets.map(Number)},'stream-first'));
 for(const t of coarse)assert(t.frames.every((r,i)=>r.tickDelta===2||r.dt===1/60));
});
for(const parity of [0,1])await t.test(`source-owned near-boundary1/60 pacing catches Ballpoint stream-first at parity${parity}`,()=>{
 const t=trace(parity,true);assert(t.caught);
 const sampled=t.frames.filter(genuineStreamFirst);
 assert(sampled.length>0);assert(sampled.every(r=>r.first===1&&Number(r.offsets[0])<100));assert(sampled.every(r=>r.tickDelta===1&&r.dt===1/60));
 assert(t.frames.some(r=>r.streaming&&r.dt===1/30),'ordinary stream work stays30Hz');
 assert(t.frames.filter(r=>r.dt===1/60).length<=6,'small source-boundary window only');
});
await t.test('adaptive selection is read-only, preserves native30Hz elsewhere and never enlarges faster base cadence',()=>{
 const values=[{streaming:false},{streaming:true,streamTime:2,streamElapsed:0},
   {streaming:true,streamTime:2,streamElapsed:2-3/60},{streaming:true,streamTime:2,streamElapsed:2-1/60}];
 const before=JSON.stringify(values);
 assert.deepEqual(values.map(s=>chooseDt(s)),[1/30,1/30,1/60,1/60]);
 assert.equal(chooseDt(values.at(-1),1/60),1/60);assert.equal(JSON.stringify(values),before);
});

});
