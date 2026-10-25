import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BASELINE_SHA,CASES,VIEWPORTS,reticleCrop,assertSnapshot,pace,sha256,browserLaunchOptions,settleCamera,inspectCaptureSurface,assertSurfaceInvariant,pngDimensions,
  SPLATLING_CASES,SPLATLING_PHASES,captureMatrix,splatlingPhaseReady,assertSplatlingCapture,untilSplatling} from '../check-inkwave-reticle-visual-review.mjs';

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
  await pace({evaluate:async(fn,n)=>{calls++;assert.equal(n,3);assert.match(fn.toString(),/await new Promise\(resolve=>requestAnimationFrame\(resolve\)\)/);}},3);
  assert.equal(calls,1);
  await assert.rejects(pace({},241));
  assert.doesNotMatch(source,/debug\.step\(/);
  assert.match(source,/g\._frame\(1\/60\)/);
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
    if(typeof arg==='number'){steps++;return;}
    reads++;return {pose:[reads<3?3-reads:0,0,0,0,0,0,1,55],blendActive:reads<2,weaponId:'roller',charging:false};
  }};
  const result=await settleCamera(page,10);
  assert.equal(result.stableFrames,4);assert.equal(result.weaponId,'roller');assert.equal(steps,reads);
  await assert.rejects(settleCamera({evaluate:async(fn,arg)=>typeof arg==='number'?undefined:{pose:[0],blendActive:true,charging:false}},4),/did not settle/);
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
    if(typeof arg==='number')return;
    reads++;return splatRow(c,reads===1?'idle':'first-ready');
  }};
  assert.equal(await untilSplatling(page,'first-ready',4),2);
  assert(splatlingPhaseReady(splatRow(c,'first-ready'),'first-ready'));
  assert(splatRow(c,'first-ready').charge<.35);
  await assert.rejects(untilSplatling({evaluate:async(fn,arg)=>typeof arg==='number'?undefined:splatRow(c,'idle')},'full',2),/phase deadline/);
  assert.match(source,/fallback\.cornerCount,0/);assert.match(source,/no old second ring in native fallback/);
});
test('physical PNG dimensions are explicit, rejecting non-PNG bytes rather than assuming CSS scale',()=>{
  const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.writeUInt32BE(720,16);bytes.writeUInt32BE(600,20);
  assert.deepEqual(pngDimensions(bytes),{width:720,height:600});
  assert.throws(()=>pngDimensions(Buffer.from('not png')));
  for(const pattern of [/xhClasses/,/effectiveOpacity/,/muzzleBlock/,/surfaceBefore/,/surfaceAfter/,/sourceSha=sourceSha/,/imagePixels/])assert.match(source,pattern);
});
test('identities, 1:1 frame/crop PNGs and failure diagnostics are persisted',()=>{
  for(const pattern of [/build\.artifacts\[relative\]/,/probeSha256/,/imageSha256/,/baseWeaponId/,/fov:/,/css:/,/failure\.png/,/browser\.log/,/receipt\.status='failed'/])assert.match(source,pattern);
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
