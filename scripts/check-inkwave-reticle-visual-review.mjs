// Actual production game/HUD screenshots, not an SVG fixture or retail parity gate.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {acquireNativeCaptureInput} from './lib/reticle-next/native-input-admission.mjs';
import {admitShapeCapturePresentation} from './lib/reticle-next/shapes-presentation-admission.mjs';
import {SHAPE_CASES,SHAPE_PHASES,readShapeSample,assertShapeSample,runShapesRecipe} from './lib/reticle-next/shapes-recipe.mjs';
import {DUALIES_PHASES,readDualiesSample,assertDualiesSample,runDualiesRecipe} from './lib/reticle-next/dualies-recipe.mjs';
import {CHARGER_CASES,BAMBOO_PHASES,PENCIL_PHASES,readChargerSnapshot,assertChargerSnapshot,runChargerRecipe,installChargerObservation,stopNativeShotObserver,SCOPE_CONTROL_ID} from './lib/reticle-next/charger-recipe.mjs';
export const NEXT_BASELINE_SHA='e0072a749df0ec8c2d368e383bdf337baa7b44ad';
export const nextRenderHz=suite=>suite==='next-dualies'?60:30;
export const NEXT_SUITES=Object.freeze(['next-shapes','next-dualies','next-bamboo','next-pencil']);
export const EXCLUDED_NEXT_SUITES=Object.freeze({'next-mobile-layout':'Not implemented; requires mobile actual accepted Pencil hit card then Wiper partial with card preserved.'});
export function nextSuiteCases(suite){
  if(suite==='next-shapes')return SHAPE_CASES;
  if(suite==='next-dualies')return [{name:'dualies',id:'dualies',kind:'dualies',profile:null,next:true}];
  if(suite==='next-bamboo'||suite==='next-pencil')return CHARGER_CASES.filter(c=>c.name===suite.slice(5)).map(c=>({...c,next:true}));
  return null;
}
export function expectedNextStates(suite){
  assert(NEXT_SUITES.includes(suite));
  return nextSuiteCases(suite).flatMap(c=>{
    const phases=c.name==='dualies'?DUALIES_PHASES:c.name==='bamboo'?BAMBOO_PHASES:c.name==='pencil'?PENCIL_PHASES:SHAPE_PHASES;
    return phases.map(phase=>({viewportName:'desktop',weaponId:phase.startsWith('scope-')?SCOPE_CONTROL_ID:c.id,phase}));
  });
}
export function assertMatchedProjection(before,after){
  assert.deepEqual(after.viewport,before.viewport,'paired viewport');assert.equal(after.dpr,before.dpr,'paired DPR');
  assert.deepEqual(after.canvas,before.canvas,'paired production canvas');
  for(const key of ['position','camera']){assert.equal(after[key].length,before[key].length);assert(after[key].every((v,i)=>Number.isFinite(v)&&Math.abs(v-before[key][i])<=1e-5),'paired native '+key);}
  for(const key of ['fov','aspect','yaw','pitch'])assert(Number.isFinite(after[key])&&Math.abs(after[key]-before[key])<=1e-5,'paired native '+key);
}
export function assertNextSnapshot(row,scenario,phase,before=false){
  const expected=phase.startsWith('scope-')?SCOPE_CONTROL_ID:scenario.id;
  assert.equal(row.weaponId,expected);assert.equal(row.hudWeapon,expected);assert.equal(row.kind,scenario.kind);
  assert(row.retConnected&&row.hudVisible,'native active connected HUD');
  if(!before)assert.equal(row.installed,true,'candidate reticle installer active');
  if(scenario.name==='dualies')assertDualiesSample(row.next,phase,{before});
  else if(['bamboo','pencil'].includes(scenario.name))assertChargerSnapshot(row.next,scenario,phase,{before});
  else assertShapeSample(row.next,scenario,phase,{before});
}
async function readNextSample(page,scenario){
  return page.evaluate(scenario.name==='dualies'?readDualiesSample:['bamboo','pencil'].includes(scenario.name)?readChargerSnapshot:readShapeSample);
}


export const BASELINE_SHA = '7f863ea2d65671abd1453fdae1b61de00f1d10e2';
export const VIEWPORTS = Object.freeze([
  {name:'desktop',width:1280,height:720,deviceScaleFactor:1,touch:false},
  {name:'mobile',width:844,height:390,deviceScaleFactor:3,touch:true},
]);
export const CASES = Object.freeze([
  {name:'roller',id:'roller',profile:'roller-reference-720p',kind:'roller'},
  {name:'brella',id:'s3-shelter-normal',profile:'brella-reference-720p',kind:'shooter'},
  {name:'wiper',id:'s3-saber-lite',profile:'wiper-reference-720p',kind:'charger',charge:true},
  {name:'stamper',id:'s3-saber-normal',profile:'stamper-reference-720p',kind:'charger',charge:true},
  // No geometry profile supports this actual weapon: it MUST stay native.
  {name:'native-charger-fallback',id:'charger',profile:null,kind:'charger',charge:true},
  {name:'tri-stringer-fallback',id:'s3-stringer-normal',profile:null,kind:'charger',idleOnly:true},
  {name:'octobrush-fallback',id:'s3-brush-normal',profile:null,kind:'roller',idleOnly:true},
]);
export const SPLATLING_CASES=Object.freeze([
  Object.freeze({name:'nautilus',id:'s3-spinner-serein',kind:'splatling',profile:null,splatling:true,switchAt:'full'}),
  Object.freeze({name:'ballpoint',id:'s3-spinner-downpour',kind:'splatling',profile:null,splatling:true,switchAt:'stream-second'}),
]);
export const SPLATLING_PHASES=Object.freeze(['idle','first-ready','second-charging','full','stream-second','stream-first','depleted']);
export function captureMatrix(flags=[]) {
  const suite=flags.find(f=>f.startsWith('--suite='))?.slice(8)||'first-four';
  const viewport=flags.find(f=>f.startsWith('--viewport='))?.slice(11)||'all';
  assert(['first-four','affected-brella-splatling','affected-brella','affected-nautilus','affected-ballpoint',...NEXT_SUITES].includes(suite),'unknown capture suite');
  assert(['all','desktop','mobile'].includes(viewport),'unknown capture viewport');
  // New affected coverage is explicitly desktop-only and bounded. The prior
  // first-four/mobile acceptance matrix remains the default, unchanged.
  if(suite!=='first-four')assert.equal(viewport,'desktop','affected suite requires explicit --viewport=desktop; new Splatling mobile is unverified');
  const brella=CASES.find(c=>c.name==='brella'),charger={...CASES.find(c=>c.name==='native-charger-fallback'),idleOnly:true};
  const suites={'first-four':CASES,'affected-brella-splatling':[brella,...SPLATLING_CASES,charger],
    'affected-brella':[brella],'affected-nautilus':[SPLATLING_CASES[0],charger],'affected-ballpoint':[SPLATLING_CASES[1]]};
  const nextCases=nextSuiteCases(suite);
  if(nextCases)assert(nextCases.length>0,'implemented next suite must own actual cases');
  const renderHz=Number(flags.find(f=>f.startsWith('--render-hz='))?.slice(12)||(nextCases?nextRenderHz(suite):60));
  assert([30,60].includes(renderHz),'only source-supported 30/60Hz render cadence allowed');
  if(nextCases)assert.equal(renderHz,nextRenderHz(suite),'exact per-suite source-supported render cadence required');
  if(suite==='first-four')assert.equal(renderHz,60,'prior default matrix retains its original60Hz protocol');
  return {suite,viewports:VIEWPORTS.filter(v=>viewport==='all'||v.name===viewport),
    cases:nextCases||suites[suite],renderHz,dt:1/renderHz,
    screenshotStateCount:({'affected-brella-splatling':19,'affected-brella':4,'affected-nautilus':8,'affected-ballpoint':7,'next-shapes':SHAPE_CASES.length*SHAPE_PHASES.length,'next-dualies':DUALIES_PHASES.length,'next-bamboo':BAMBOO_PHASES.length,'next-pencil':PENCIL_PHASES.length})[suite]??null};
}
export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export function pngDimensions(bytes) {
  assert(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'complete PNG header required');
  return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
}
export function browserLaunchOptions(executablePath) {
  // Same source-supported mitigation as check-inkwave-ranked-browser.mjs:
  // full Chromium, not its default headless shell, for offline WebGL captures.
  return {headless:true,...(executablePath?{executablePath}:{channel:'chromium'}),
    args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']};
}
async function settlesWithin(action,timeoutMs) {
  let timer;
  try{return await Promise.race([Promise.resolve().then(action).then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),timeoutMs);})]);}
  finally{clearTimeout(timer);}
}
export async function closeOwnedBrowser(browserServer,{reason='normal',timeoutMs=5000,onUpdate=()=>{}}={}) {
  const child=browserServer.process();
  assert(child?.pid>0,'owned browser process identity required');
  const record={ownerNodePid:process.pid,browserPid:child.pid,reason,startedAt:new Date().toISOString(),forced:false,status:'closing'};
  onUpdate({...record});
  try {
    let closed=false;
    try{closed=await settlesWithin(()=>browserServer.close(),timeoutMs);}catch(error){record.gracefulError=String(error);}
    if(!closed){record.forced=true;onUpdate({...record});assert(await settlesWithin(()=>browserServer.kill(),timeoutMs),'owned browser kill deadline');}
    record.exitCode=child.exitCode;record.signalCode=child.signalCode;
    record.exited=child.exitCode!=null||child.signalCode!=null;
    assert(record.exited,'owned browser process did not exit; next capture must not start');
    record.status='closed';return record;
  } catch(error){record.status='failed';record.error=String(error);throw error;}
  finally{record.finishedAt=new Date().toISOString();onUpdate({...record});}
}
export function reticleCrop(rect, viewport) {
  const width = Math.min(240,viewport.width),height = Math.min(200,viewport.height);
  return {x:Math.max(0,Math.min(viewport.width-width,Math.round(rect.x+rect.width/2-width/2))),
    y:Math.max(0,Math.min(viewport.height-height,Math.round(rect.y+rect.height/2-height/2))),width,height};
}
export function assertSnapshot(row, scenario, phase, before=false) {
  assert.equal(row.weaponId,scenario.id,'actual actor weapon identity');
  assert.equal(row.hudWeapon,scenario.id,'production HUD must receive actual weapon ID');
  assert.equal(row.kind,scenario.kind,'native update kind remains authoritative');
  assert(row.retConnected,'actual reticle must be connected');
  assert(row.hudVisible,'native HUD must be active');
  const nativeIdle=(scenario.kind==='charger'&&(before||!scenario.profile)||scenario.kind==='splatling')&&['idle','release','depleted','switch-back'].includes(phase);
  assert.equal(row.visible,!nativeIdle,'retain native idle visibility gate; supported Splatana profile is visible');
  assert(row.rect.width>=0 && row.rect.height>=0,'finite reticle bounds');
  if(!before)assert.equal(row.installed,true,'production HUD installer is active');
  assert.deepEqual(row.profiles,before||!scenario.profile?[]:[scenario.profile]);
  if(!before&&scenario.profile)assert(row.profileArtwork.every(a=>a.display!=='none'&&a.bounds.width>0&&a.bounds.height>0),'installed SVG must actually participate in browser layout');
  if(scenario.kind==='charger') {
    assert(row.chargeHandleConnected && row.chargeHandleInReticle,'native charge handle stays attached');
    assert(Number.isFinite(row.chargeOffset),'native charge offset remains writable');
    if(!before && scenario.profile)assert(row.chargeArtworkHidden,'splatana hides native artwork without detaching handle');
    else assert(!row.chargeArtworkHidden,'unsupported native charger artwork stays visible');
  }
  if(phase==='charging')assert(row.charging && row.charge>0 && row.charge<1,'real partially charged runner');
  if(phase==='full')assert(row.charging && row.charge>=1,'real fully charged runner');
  if(phase==='idle'||phase==='release'||phase==='switch-back')assert(!row.charging && row.charge===0,'real release/reset');
  if(!before && scenario.name==='brella')assert.equal(row.decoratedSpreadTicks,4,'all four native spread ticks retain decorations');
  if(!before && scenario.profile && scenario.kind==='charger')assert(!row.classes.includes('iw-ret--charger'),'no inherited charger visual selector');
  if(scenario.splatling)assertSplatlingCapture(row,scenario,phase,{before});
}
const near=(a,b)=>Number.isFinite(a)&&Math.abs(a-b)<=1e-7;
export function splatlingPhaseReady(row,phase) {
  if(!Number.isFinite(row.charge)||!Number.isFinite(row.first)||!Number.isFinite(row.second))return false;
  const hold=row.charging&&!row.streaming,stream=row.streaming&&!row.charging;
  if(['idle','depleted','switch-back'].includes(phase))return !row.charging&&!row.streaming&&row.charge===0&&near(row.first,0)&&near(row.second,0);
  if(phase==='first-ready')return hold&&near(row.first,1)&&row.second>=0&&row.second<=.05;
  if(phase==='second-charging')return hold&&near(row.first,1)&&row.second>=.35&&row.second<=.65;
  if(phase==='full')return hold&&row.charge>=1&&near(row.first,1)&&near(row.second,1);
  if(phase==='stream-second')return stream&&row.charge===0&&row.second>=.25&&row.second<=.75;
  if(phase==='stream-first')return stream&&row.charge===0&&row.first>1e-7&&near(row.second,0)&&Number.isFinite(row.offsets?.[0])&&row.offsets[0]<100;
  return false;
}
export function assertSplatlingCapture(row,scenario,phase,{before=false}={}) {
  assert.equal(row.weaponId,scenario.id);assert.equal(row.hudWeapon,scenario.id);assert.equal(row.kind,'splatling');
  assert(splatlingPhaseReady(row,phase),'actual native two-stage Splatling phase: '+phase);
  assert(row.handlesAttached,'both native charge ring handles remain attached');
  assert(row.offsets.every((offset,i)=>near(offset,Number((100*(1-[row.first,row.second][i])).toFixed(2)))),'both native offsets agree with real stage gauges');
  assert.equal(row.visible,!['idle','depleted','switch-back'].includes(phase),'native Splatling idle/depleted hidden');
  assert.equal(row.classes.includes('is-streaming'),row.streaming,'native streaming class');
  assert.equal(row.profiles.length,0,'corners are not replacement geometry profiles');
  assert.equal(row.cornerCount,before?0:4,'exactly four candidate-only native-tick decorations');
  assert.equal(row.angles.length,4);
  assert(['45deg','135deg','225deg','315deg'].every(angle=>row.angles.some(raw=>raw?.includes('--a:'+angle))),'native raw quadrant selector text survives');
  if(row.streaming)assert(row.catalogId===scenario.id&&Number.isFinite(row.streamTime)&&row.streamTime>0&&Number.isFinite(row.streamElapsed),'stream uses actual catalogue duration and elapsed time');
}
export function readSplatlingPhase() {
  const a=window.__G.local,h=window.__inkwave.hud,r=a.weaponRunner;
  return {charge:r.charge,charging:r.charging===true,streaming:r.streaming===true,first:h._L.splatFirst,second:h._L.splatSecond,
    offsets:[h._chargeEl,h._chargeSecond].map(el=>el?Number.parseFloat(el.style.strokeDashoffset):null),
    streamTime:r.catalogState?.streamTime,streamElapsed:r.catalogState?.streamElapsed,
    firstStreamFrames:a.weapon.catalogRecord?.parameters.WeaponParam?.MaxShootingFrame_First};
}
export function splatlingSampleDt(state,phase,baseDt=1/60) {
  if(phase==='stream-first'&&baseDt===1/30&&state.streaming) {
    assert(Number.isFinite(state.streamTime)&&Number.isFinite(state.streamElapsed)&&Number.isFinite(state.firstStreamFrames)&&state.firstStreamFrames>0,'source-owned stream boundary required');
    const remaining=(state.streamTime-Math.max(0,state.streamElapsed))*60;
    // Switch BEFORE a two-tick render could cross the one-frame Ballpoint
    // first-only window. Read the actual source table, never infer a timer.
    if(remaining<=state.firstStreamFrames+2+1e-7)return 1/60;
  }
  return baseDt;
}
export async function untilSplatling(page,phase,maxFrames=480,baseDt=1/60) {
  for(let frames=1;frames<=maxFrames;frames++) {
    const state=await page.evaluate(readSplatlingPhase);
    await pace(page,1,splatlingSampleDt(state,phase,baseDt));
    if(splatlingPhaseReady(await page.evaluate(readSplatlingPhase),phase))return frames;
  }
  throw Error('Actual Splatling phase deadline: '+phase);
}

// Freeze the scheduler only; advance the actual game once per native RAF. Never
// request a bulk debug step or run a synchronous 240-frame GPU/render burst.
export async function pace(page, frames=1,dt=1/60) {
  assert(Number.isInteger(frames) && frames>0 && frames<=240);
  assert(dt===1/60||dt===1/30,'supported native render interval');
  await page.evaluate(async ({frames,dt})=>{
    const g=window.__inkwave;
    if(!g.frozen)throw Error('Paced capture requires the native scheduler frozen');
    for(let i=0;i<frames;i++) {
      await new Promise(resolve=>requestAnimationFrame(resolve));
      const before=g.s3Clock?.ticks,accumulatorBefore=g.s3Clock?.accumulator;
      g._frame(dt);
      const after=g.s3Clock?.ticks,nativeTickDelta=after-before;
      if(nativeTickDelta!==Math.round(dt*60))throw Error('Actual fixed clock tick delta differs from requested cadence');
      (window.__reticleCadence ||= []).push({sequence:window.__reticleCadence.length+1,dt,renderHz:1/dt,nativeTickDelta,
        nativeTicksBefore:before,nativeTicksAfter:after,accumulatorBefore,accumulatorAfter:g.s3Clock?.accumulator,
        weaponId:window.__G.local.weaponId,wallTimestamp:Date.now()});
    }
  },{frames,dt});
}
export async function paceTicks(page,ticks,dt=1/60) {
  assert(Number.isSafeInteger(ticks)&&ticks>0&&ticks<=480);
  assert(dt===1/30||dt===1/60);
  const perRender=Math.round(dt*60),whole=Math.floor(ticks/perRender),rest=ticks%perRender;
  if(whole)await pace(page,whole,dt);if(rest)await pace(page,1,1/60);
}
async function until(page,predicate,label,maxFrames=240,dt=1/60) {
  for(let n=0;n<maxFrames;n++) {
    await pace(page,1,dt);
    if(await page.evaluate(predicate))return n+1;
  }
  throw Error('Actual game state deadline: '+label);
}
export async function settleCamera(page,maxFrames=180,dt=1/60) {
  let previous=null,stable=0;
  for(let frames=1;frames<=maxFrames;frames++) {
    await pace(page,1,dt);
    const current=await page.evaluate(()=>{
      const G=window.__G,g=window.__inkwave;
      return {pose:[...G.camera.position.toArray(),...G.camera.quaternion.toArray(),G.camera.fov],
        blendActive:!!g.rig.blend?.active,weaponId:G.local.weaponId,charging:G.local.weaponRunner.charging===true};
    });
    assert(!current.charging,'idle camera settlement must not charge or fire a weapon');
    const delta=previous?Math.max(...current.pose.map((v,i)=>Math.abs(v-previous.pose[i]))):Infinity;
    stable=!current.blendActive&&delta<=1e-5?stable+1:0;
    if(stable>=4)return {frames,stableFrames:stable,maxPoseDelta:delta,pose:current.pose,weaponId:current.weaponId};
    previous=current;
  }
  throw Error('Native idle camera/FOV did not settle within '+maxFrames+' paced frames');
}
// Browser-evaluated: the native render-only redraw and GPU drain are already
// used by frozen-HUD/ranked checkers. No Game frame, simulation clock, input,
// animation or quality setting is changed here.
export function inspectCaptureSurface({redraw=false}={}) {
  const G=window.__G,g=window.__inkwave,m=G.match,a=G.local,r=G.renderer;
  if(!g.frozen||!m||!r.domElement.isConnected)throw Error('Capture requires frozen native game surface');
  const state=()=>({clock:[G.time,m.time,m.stateT,g.s3Clock?.ticks],weaponId:a.weaponId,
    actorPosition:a.pos.toArray(),cameraPosition:G.camera.position.toArray(),cameraQuaternion:G.camera.quaternion.toArray(),fov:G.camera.fov,aspect:G.camera.aspect,
    charge:a.weaponRunner.charge||0,chargeT:a.weaponRunner.chargeT||0,charging:a.weaponRunner.charging===true,streaming:a.weaponRunner.streaming===true,
    streamTime:a.weaponRunner.catalogState?.streamTime??null,streamElapsed:a.weaponRunner.catalogState?.streamElapsed??null,
    streamUsed:a.weaponRunner.catalogState?.streamUsed??null,first:g.hud._L.splatFirst??null,second:g.hud._L.splatSecond??null,
    bowTilt:a.weaponRunner.catalogState?.bowTilt||0});
  const before=state(),started=performance.now();
  if(redraw){g.R.render();r.getContext().finish();}
  const after=state();
  if(JSON.stringify(after)!==JSON.stringify(before))throw Error('Render-only capture advanced native clock, pose or charge');
  const canvas=r.domElement,box=canvas.getBoundingClientRect(),style=getComputedStyle(canvas);
  if(r.getContext().isContextLost()||style.display==='none'||style.visibility!=='visible'||Number(style.opacity)<=0)
    throw Error('Native capture canvas is lost or hidden');
  if(Math.abs(box.width-innerWidth)>.01||Math.abs(box.height-innerHeight)>.01)throw Error('Native capture canvas bounds differ from viewport');
  return {state:after,wallTimestamp:Date.now(),redraw,gpuFinishMs:redraw?performance.now()-started:null,
    viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
    canvas:{width:canvas.width,height:canvas.height,pixelRatio:r.getPixelRatio(),box:box.toJSON()},
    fonts:document.fonts.status,visibility:document.visibilityState};
}
export function assertSurfaceInvariant(before,after) {
  assert.deepEqual(after.state,before.state,'screenshot must not advance actual clock/weapon/pose/charge');
  assert.deepEqual(after.viewport,before.viewport,'screenshot viewport must remain unchanged');
  assert.deepEqual(after.canvas,before.canvas,'native canvas must remain unchanged');
}
async function readSnapshot(page) {
  return page.evaluate(()=>{
    const g=window.__inkwave,a=window.__G.local,h=g.hud,r=h.ret,runner=a.weaponRunner;
    const charge=h._chargeEl,rect=r.getBoundingClientRect();
    const hidden=el=>{for(let p=el;p&&p!==r.parentNode;p=p.parentElement)if(getComputedStyle(p).display==='none')return true;return false;};
    const style=getComputedStyle(r),crosshair=g._hudTransport?.crosshair,guide=crosshair?.guide;
    let effectiveOpacity=1;const ancestors=[];
    for(let element=r;element;element=element.parentElement){const s=getComputedStyle(element);effectiveOpacity*=Number(s.opacity);ancestors.push({tag:element.tagName,classes:element.className?.baseVal??element.className,opacity:s.opacity,visibility:s.visibility,display:s.display});}
    return {weaponId:a.weaponId,baseWeaponId:a.weapon.catalogRecord?.id||a.weapon.id||a.weaponId,
      family:a.weapon.behaviorKind||a.weapon.catalogRecord?.family||a.weapon.kind,hudWeapon:h._L.weapon,kind:h._L.kind,
      installed:!!h[Symbol.for('inkwave.weaponReticlePresentation.installed')],
      retConnected:r.isConnected,visible:style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0,
      visibility:style.visibility,hudVisible:!h.el.classList.contains('is-hidden'),
      xhClasses:[...h.xh.classList],effectiveOpacity,ancestors,color:style.color,
      inRange:crosshair?.inRange??null,onTarget:crosshair?.onTarget??null,muzzleBlock:crosshair?.muzzleBlock??null,
      classes:[...r.classList],rect:rect.toJSON(),charge:runner.charge||0,charging:runner.charging===true,
      streaming:runner.streaming===true,first:h._L.splatFirst??null,second:h._L.splatSecond??null,
      offsets:[h._chargeEl,h._chargeSecond].map(el=>el?Number.parseFloat(el.style.strokeDashoffset):null),
      handlesAttached:[h._chargeEl,h._chargeSecond].every(el=>!!el?.isConnected&&r.contains(el)),
      cornerCount:r.querySelectorAll('.iw-ret__splatling-corner').length,
      angles:[...r.querySelectorAll(':scope > .iw-ret__tick')].map(el=>el.getAttribute('style')),
      catalogId:runner.catalogState?.id??null,streamTime:runner.catalogState?.streamTime??null,
      streamElapsed:runner.catalogState?.streamElapsed??null,streamUsed:runner.catalogState?.streamUsed??null,streamLimit:runner.catalogState?.streamLimit??null,
      invuln:a.invuln,ink:a.ink,fullT:h._L.fullT??0,
      shield:{classes:[...h.shield.classList],opacity:getComputedStyle(h.shield).opacity,visibility:getComputedStyle(h.shield).visibility},
      tank:{classes:[...h.tank.classList],opacity:getComputedStyle(h.tank).opacity,visibility:getComputedStyle(h.tank).visibility,level:h._tank?.level??null},
      cadence:{renderFrames:window.__reticleCadence?.length||0,last:window.__reticleCadence?.at(-1)||null},
      profiles:[...r.querySelectorAll('[data-iw-reticle-presentation-profile]')].map(n=>n.dataset.iwReticlePresentationProfile),
      profileArtwork:[...r.querySelectorAll('[data-iw-reticle-presentation-profile]')].map(n=>({display:getComputedStyle(n).display,bounds:n.getBoundingClientRect().toJSON()})),
      decoratedSpreadTicks:r.querySelectorAll('.iw-ret__tick > .iw-reticle-presentation-spread-tick').length,
      chargeHandleConnected:!!charge?.isConnected,chargeHandleInReticle:!!charge&&r.contains(charge),
      chargeOffset:charge?Number.parseFloat(charge.style.strokeDashoffset):null,chargeArtworkHidden:charge?hidden(charge):null,
      spread:h._L.spread,spreadVariable:r.style.getPropertyValue('--sp'),
      projectedShotGuide:guide?{x:guide.x,y:guide.y}:null,worldShotGuide:window.__G.match.controller?.shotGuide?.toArray?.()||null,
      runner:{charge:runner.charge||0,chargeT:runner.chargeT||0,charging:runner.charging===true,bowTilt:runner.catalogState?.bowTilt||0},
      settings:{quality:g.settings.quality,shadows:g.settings.shadows,bloom:g.settings.bloom,minimap:g.settings.minimap,frameRate:g.settings.frameRate},
      canvas:{width:window.__G.renderer.domElement.width,height:window.__G.renderer.domElement.height,pixelRatio:window.__G.renderer.getPixelRatio()},
      canopy:runner.catalogState?.canopy?{open:!!runner.catalogState.canopy.open,preparing:!!runner.catalogState.canopy.preparing}:null,
      saberSwingKey:runner.catalogState?.saberSwing?.key||null,
      css:{scale:style.scale,transform:style.transform,translate:style.translate,rotate:style.rotate,zoom:style.zoom},
      position:a.pos.toArray(),camera:window.__G.camera.position.toArray(),fov:window.__G.camera.fov,aspect:window.__G.camera.aspect,yaw:g.rig.yaw,pitch:g.rig.pitch,
      renderer:window.__G.renderer.getContext().getParameter(window.__G.renderer.getContext().RENDERER),
      dpr:devicePixelRatio,viewport:{width:innerWidth,height:innerHeight},
    };
  });
}
export async function main(argv=process.argv.slice(2)) {
  const [siteArg,outArg,...flags]=argv;
  assert(siteArg&&outArg,'Usage: node scripts/check-inkwave-reticle-visual-review.mjs SITE OUTPUT [--before]');
  const before=flags.includes('--before'),site=fs.realpathSync(siteArg),out=path.resolve(outArg),matrix=captureMatrix(flags);
  const sourceSha=process.env.SOURCE_SHA;
  assert(/^[a-f0-9]{40}$/.test(sourceSha||''),'SOURCE_SHA must pin the checked-out commit');
  if(before)assert.equal(sourceSha,NEXT_SUITES.includes(matrix.suite)?NEXT_BASELINE_SHA:BASELINE_SHA);
  fs.mkdirSync(out,{recursive:true});
  const script=fs.readFileSync(new URL(import.meta.url));
  fs.writeFileSync(path.join(out,'probe.mjs.txt'),script);
  const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
  assert(/^[a-f0-9]{64}$/.test(build.contentHash),'production build identity required');
  // Inspect actual emitted sources: production output, with its final CSS and
  // all adapters, is served unchanged. No setContent/HTML/SVG fixture exists.
  for(const relative of ['src/ui/hud.js','styles/hud.css']) {
    const bytes=fs.readFileSync(path.join(site,relative));
    assert.equal(sha256(bytes),build.artifacts[relative],'emitted identity: '+relative);
  }
  const receipt={schema:1,before,sourceSha,contentHash:build.contentHash,inputHash:build.inputHash,
    probeSha256:sha256(script),recipeSha256:Object.fromEntries(NEXT_SUITES.includes(matrix.suite)?['shapes-recipe.mjs','dualies-recipe.mjs','charger-recipe.mjs','native-input-admission.mjs','shapes-capture-settlement.mjs','shapes-presentation-admission.mjs'].map(file=>[file,sha256(fs.readFileSync(new URL('./lib/reticle-next/'+file,import.meta.url)))]):[]),build:build.build,viewports:matrix.viewports,scenarios:[],errors:[],status:'running',
    coverage:{suite:matrix.suite,actualWeapons:matrix.cases.map(c=>c.id),expectedScreenshotStates:matrix.screenshotStateCount,
      splatlingMobile:matrix.suite!=='first-four'?'not covered in this affected desktop gate':'not part of the unchanged first-four matrix',
      switches:matrix.cases.filter(c=>c.switchAt).map(c=>({weaponId:c.id,phase:c.switchAt,fallback:'charger',metadataOnly:true}))},
    scope:'Actual production range/HUD DOM and browser screenshots; software GPU only. Reference-guided approximation, NOT Nintendo pixel/behavior parity or full CI.',
    captureProtocol:{browser:process.env.CHROMIUM_PATH?'custom-executable':'chromium-full-headless',scale:'device',screenshotDeadlineMs:20000,nativeRenderOnly:true,animations:'unchanged',
      baseRenderHz:matrix.renderHz,baseDt:matrix.dt,physicsHz:60,adaptive:NEXT_SUITES.includes(matrix.suite)?'none; native60 physics with exact per-suite render cadence and recorded native tick deltas':'60Hz near source-owned first-only stream boundary; actual tick deltas recorded',ownedBrowserServerHost:'127.0.0.1'},
    comparison:'Pair same viewport/weapon/phase crop against immutable main; retail reference review is separate, not certified by this gate.'};
  const write=()=>fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  fs.copyFileSync(path.join(site,'inkwave-build.json'),path.join(out,'inkwave-build.json'));
  write();
  const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.mp3':'audio/mpeg','.wasm':'application/wasm'};
  const server=http.createServer((req,res)=>{
    let file;
    try {file=path.resolve(site,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));}
    catch {res.writeHead(400);res.end();return;}
    if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser,page,browserServer,cleanupPromise,interruption;
  const cleanup=reason=>browserServer?(cleanupPromise ||= closeOwnedBrowser(browserServer,{reason,onUpdate:record=>{
    receipt.cleanup=record;fs.writeFileSync(path.join(out,'cleanup.json'),JSON.stringify(record,null,2)+'\n');write();
  }})):Promise.resolve(null);
  const onSignal=signal=>{
    interruption=signal;receipt.status='interrupted';receipt.interruption={signal,ownerNodePid:process.pid,wallTimestamp:Date.now()};write();
    void cleanup('signal:'+signal).catch(error=>{receipt.cleanupFailure=String(error);write();});
  };
  const onTerm=()=>onSignal('SIGTERM'),onInt=()=>onSignal('SIGINT');
  process.once('SIGTERM',onTerm);process.once('SIGINT',onInt);
  const requireActive=()=>{if(interruption)throw Error('Capture interrupted by '+interruption);};
  try {
    const {chromium}=await import('playwright');
    const {enterRangeFromMenu}=await import('./lib/inkwave-range-menu-entry.mjs');
    // Official BrowserServer owns this invocation's process/child group only.
    // Binding the control endpoint to loopback does not expose it externally.
    browserServer=await chromium.launchServer({...browserLaunchOptions(process.env.CHROMIUM_PATH),host:'127.0.0.1'});
    requireActive();
    receipt.browserProcess={pid:browserServer.process().pid,ownerNodePid:process.pid,startedAt:new Date().toISOString()};write();
    browser=await chromium.connect(browserServer.wsEndpoint());requireActive();
    receipt.browserVersion=browser.version();write();
    for(const view of matrix.viewports) {
      const context=await browser.newContext({viewport:{width:view.width,height:view.height},deviceScaleFactor:view.deviceScaleFactor,hasTouch:view.touch,isMobile:view.touch});
      page=await context.newPage();
      page.on('pageerror',error=>{receipt.errors.push({viewport:view.name,error:String(error)});write();});
      page.on('console',message=>fs.appendFileSync(path.join(out,'browser.log'),`[${view.name}] ${message.type()}: ${message.text()}\n`));
      await page.addInitScript(()=>{
        let seed=0x52455449;
        Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
        localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',lang:'en',shadows:false,bloom:false,minimap:false}));
      });
      const entry=await enterRangeFromMenu(page,'http://127.0.0.1:'+server.address().port,{touch:view.touch,timeout:180000});
      if(NEXT_SUITES.includes(matrix.suite))await page.mouse.up({button:'left'});
      await page.evaluate(isNext=>{
        const g=window.__inkwave,G=window.__G,a=G.local;
        g.debug.freeze();g.debug.freezeBots();G.match.range.setMovingTargets(false);
        if(isNext)G.match.range.travel('lane');
        else {
          g.debug.fire(false);
          // Original protocol retained. Native spawn resets interpolation.
          a.spawnAt(a.pos.clone().set(-14.6,.04,0),0);g.rig.yaw=0;g.rig.pitch=-.12;g.rig.follow(a,true);
        }
      },NEXT_SUITES.includes(matrix.suite));
      for(const scenario of matrix.cases) {
        console.log(view.name,scenario.id,'start');
        if(scenario.next)await page.mouse.up({button:'left'});
        await page.evaluate(async ({id,next})=>{
          if(!next)window.__inkwave.debug.fire(false);
          window.__G.match.range.setWeapon(id);
          await window.__G.local.character.sourceMotion.ready;
        },{id:scenario.id,next:!!scenario.next});
        const cameraSettlement=await settleCamera(page,180,matrix.dt);
        if(scenario.next){
          await page.evaluate(installChargerObservation,{before:before||!['bamboo','pencil'].includes(scenario.name)});
          await acquireNativeCaptureInput(page,{onUpdate:record=>{
            receipt.inputAdmission={weaponId:scenario.id,...record};write();
          }});
        }
        const capture=async (phase,recipeMeta=null)=>{
          requireActive();
          console.log(before?'baseline':'candidate',view.name,scenario.id,phase,'capture');
          // Frozen native CSS may need browser presentation to start/finish.
          // Warmups remain unaccepted; strict settlement precedes row snapshot.
          const shapeAdmission=['slosher','blaster'].includes(scenario.name)?await admitShapeCapturePresentation(page,{
            inspectSurface:inspectCaptureSurface,assertSurfaceInvariant,onUpdate:record=>{
              receipt.shapePresentationAdmission={viewportName:view.name,weaponId:scenario.id,phase,...record};write();
            }}):null;
          const row=await readSnapshot(page);
          if(shapeAdmission){row.shapeSettlement=shapeAdmission.settlement;row.shapePresentation=shapeAdmission.presentation;}
          if(scenario.next){row.next=await readNextSample(page,scenario);row.recipe=recipeMeta;}
          console.log(JSON.stringify({head:sourceSha,before,viewport:view.name,actualWeaponId:row.weaponId,phase,profile:row.profiles,viewportCss:row.viewport,dpr:row.dpr,settings:row.settings}));
          const basename=`${view.name}-${scenario.name}-${phase}`;
          const crop=reticleCrop(row.rect,view);
          row.viewportName=view.name;row.phase=phase;row.entry=entry;row.cameraSettlement=cameraSettlement;row.sourceSha=sourceSha;row.contentHash=build.contentHash;
          row.files={frame:basename+'-frame.png',crop:basename+'-reticle.png'};row.crop=crop;row.screenshotScale='device';
          receipt.scenarios.push(row);write();
          const cadence=await page.evaluate(()=>window.__reticleCadence||[]);
          fs.writeFileSync(path.join(out,'cadence-'+view.name+'.json'),JSON.stringify(cadence,null,2)+'\n');
          row.surfaceBefore=await page.evaluate(inspectCaptureSurface,{redraw:true});write();
          assert.equal(row.surfaceBefore.state.weaponId,row.weaponId);
          await page.screenshot({path:path.join(out,row.files.frame),scale:'device',timeout:20000});
          requireActive();
          await page.screenshot({path:path.join(out,row.files.crop),clip:crop,scale:'device',timeout:20000});
          requireActive();
          row.surfaceAfter=await page.evaluate(inspectCaptureSurface,{redraw:false});
          assertSurfaceInvariant(row.surfaceBefore,row.surfaceAfter);
          const afterCapture=await readSnapshot(page);
          if(scenario.next){afterCapture.next=await readNextSample(page,scenario);assertNextSnapshot(afterCapture,scenario,phase,before);assert.deepEqual(afterCapture.next,row.next,'screenshot must not change native recipe state');}
          else assertSnapshot(afterCapture,scenario,phase,before);
          row.afterCapture={weaponId:afterCapture.weaponId,charge:afterCapture.charge,charging:afterCapture.charging,profiles:afterCapture.profiles,
            xhClasses:afterCapture.xhClasses,effectiveOpacity:afterCapture.effectiveOpacity,color:afterCapture.color,inRange:afterCapture.inRange,
            muzzleBlock:afterCapture.muzzleBlock,projectedShotGuide:afterCapture.projectedShotGuide};
          row.imagePixels=Object.fromEntries(Object.entries(row.files).map(([key,file])=>[key,pngDimensions(fs.readFileSync(path.join(out,file)))]));
          assert.deepEqual(row.imagePixels.frame,{width:view.width*view.deviceScaleFactor,height:view.height*view.deviceScaleFactor});
          assert.deepEqual(row.imagePixels.crop,{width:crop.width*view.deviceScaleFactor,height:crop.height*view.deviceScaleFactor});
          row.imageSha256={frame:sha256(fs.readFileSync(path.join(out,row.files.frame))),crop:sha256(fs.readFileSync(path.join(out,row.files.crop)))};
          if(scenario.next)assertNextSnapshot(row,scenario,phase,before);else assertSnapshot(row,scenario,phase,before);write();
        };
        if(scenario.next){
          const options={scenario,pace,capture,before,settleCamera,dt:matrix.dt,
            selectWeapon:async id=>{await page.mouse.up({button:'left'});await page.evaluate(id=>window.__G.match.range.setWeapon(id),id);await pace(page,2,matrix.dt);}};
          let recipeError;
          try {
            if(scenario.name==='dualies')await runDualiesRecipe(page,options);
            else if(['bamboo','pencil'].includes(scenario.name))await runChargerRecipe(page,options);
            else await runShapesRecipe(page,options);
          }catch(error){recipeError=error;throw error;}
          finally {
            try{await stopNativeShotObserver(page);}
            catch(error){if(!recipeError)throw error;receipt.observerCleanupFailure=String(error);write();}
          }
          continue;
        }
        await capture('idle');
        if(scenario.idleOnly)continue;
        if(scenario.splatling) {
          await page.evaluate(()=>window.__inkwave.debug.fire(true));
          for(const phase of ['first-ready','second-charging','full']){await untilSplatling(page,phase,480,matrix.dt);await capture(phase);}
          await page.evaluate(()=>window.__inkwave.debug.fire(false));
          for(const phase of ['stream-second','stream-first','depleted']){await untilSplatling(page,phase,480,matrix.dt);await capture(phase);}
          // A bounded representative interruption: full hold on Nautilus, an
          // active nonzero stream on Ballpoint. No additional PNGs or inferred
          // charge state; use the real input, runner and selection API.
          await page.evaluate(()=>window.__inkwave.debug.fire(true));await untilSplatling(page,'full',480,matrix.dt);
          if(scenario.switchAt==='stream-second'){await page.evaluate(()=>window.__inkwave.debug.fire(false));await untilSplatling(page,'stream-second',480,matrix.dt);}
          const interrupted=await readSnapshot(page);assertSnapshot(interrupted,scenario,scenario.switchAt,before);
          receipt.scenarios.push({...interrupted,viewportName:view.name,phase:'switch-interrupted-'+scenario.switchAt,sourceSha,contentHash:build.contentHash});write();
          await page.evaluate(()=>{window.__inkwave.debug.fire(false);window.__G.match.range.setWeapon('charger');});await paceTicks(page,2,matrix.dt);
          const fallback=await readSnapshot(page),native=CASES.find(c=>c.name==='native-charger-fallback');
          assertSnapshot(fallback,native,'switch-back',before);
          assert.equal(fallback.cornerCount,0,'no old Splatling corners in native fallback');
          assert.equal(await page.evaluate(()=>window.__inkwave.hud.ret.querySelectorAll('.iw-ret__charge-second').length),0,'no old second ring in native fallback');
          receipt.scenarios.push({...fallback,viewportName:view.name,phase:'switch-native-from-'+scenario.name,sourceSha,contentHash:build.contentHash});write();
          await page.evaluate(id=>window.__G.match.range.setWeapon(id),scenario.id);await paceTicks(page,2,matrix.dt);
          const restored=await readSnapshot(page);assertSnapshot(restored,scenario,'switch-back',before);
          receipt.scenarios.push({...restored,viewportName:view.name,phase:'switch-back',sourceSha,contentHash:build.contentHash});write();
          continue;
        }
        await page.evaluate(()=>window.__inkwave.debug.fire(true));
        if(scenario.charge) {
          await until(page,()=>{const r=window.__G.local.weaponRunner;return r.charging&&r.charge>=.35&&r.charge<1;},scenario.id+' partial charge after native display delay');
          await capture('charging');
          await until(page,()=>{const r=window.__G.local.weaponRunner;return r.charging&&r.charge>=1;},scenario.id+' full charge');
          await capture('full');
        } else {
          await paceTicks(page,8,matrix.dt);await capture('firing');
          if(scenario.name==='brella') {
            await until(page,()=>window.__G.local.weaponRunner.catalogState?.canopy?.open===true,'real Brella canopy opens',240,matrix.dt);
            await capture('canopy-open');
          }
        }
        await page.evaluate(()=>window.__inkwave.debug.fire(false));
        await until(page,()=>{const r=window.__G.local.weaponRunner;return !r.charging&&(r.charge||0)===0;},scenario.id+' release',240,matrix.dt);
        await capture('release');
      }
      // Return from unsupported native charger to Wiper, then native charger:
      // stale DOM/profile restoration is exercised via the real selection API.
      for(const name of matrix.suite==='first-four'?['wiper','native-charger-fallback']:[]) {
        const scenario=CASES.find(row=>row.name===name);
        await page.evaluate(id=>window.__G.match.range.setWeapon(id),scenario.id);await pace(page,2);
        const row=await readSnapshot(page);assertSnapshot(row,scenario,'switch-back',before);
        receipt.scenarios.push({...row,viewportName:view.name,phase:'switch-back'});write();
      }
      assert.deepEqual(receipt.errors,[],'uncaught browser errors');
      await context.close();page=null;
    }
    if(matrix.screenshotStateCount!=null)assert.equal(receipt.scenarios.filter(s=>s.files).length,matrix.screenshotStateCount,'exact bounded affected screenshot coverage');
    if(NEXT_SUITES.includes(matrix.suite)){
      const keys=rows=>rows.map(r=>[r.viewportName,r.weaponId,r.phase].join('|')).sort();
      assert.deepEqual(keys(receipt.scenarios.filter(r=>r.files)),keys(expectedNextStates(matrix.suite)),'exact named source-owned next states, no duplicates or omissions');
      receipt.coverage.actualCapturedWeapons=[...new Set(receipt.scenarios.filter(r=>r.files).map(r=>r.weaponId))];
    }
    requireActive();receipt.status=before?'baseline-recorded':'passed';
  } catch(error) {
    receipt.status=interruption?'interrupted':'failed';receipt.failure=String(error.stack||error);
    // Interruption artifacts must never masquerade as a late accepted state.
    if(page&&!interruption){await page.screenshot({path:path.join(out,'failure.png'),timeout:10000}).catch(()=>{});receipt.diagnostic=await page.evaluate(()=>({title:document.title,text:document.body.innerText.slice(0,2000),menu:window.__inkwave?.menus?.current})).catch(String);}
    throw error;
  } finally {
    try{await cleanup(interruption?'signal:'+interruption:'capture-ended');}
    catch(error){receipt.status=interruption?'interrupted':'failed';receipt.cleanupFailure=String(error);throw error;}
    finally{process.removeListener('SIGTERM',onTerm);process.removeListener('SIGINT',onInt);write();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  }
  return receipt;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)await main();

