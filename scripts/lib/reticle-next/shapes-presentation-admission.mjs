import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {settleShapeCapture} from './shapes-capture-settlement.mjs';

// Read-only browser observation. Native CSS timing is observed, never edited.
export function inspectShapePresentation() {
  const G=window.__G,g=window.__inkwave,a=G.local,ret=g.hud.ret;
  if(!g.frozen||!ret?.isConnected)throw Error('Shape capture settlement requires frozen connected native HUD');
  const owner=()=>({
    frozen:g.frozen,clock:[G.time,G.match.time,G.match.stateT,g.s3Clock?.ticks,g.s3Clock?.accumulator],
    weaponId:a.weaponId,position:a.pos.toArray(),grounded:a.grounded,
    cameraPosition:G.camera.position.toArray(),cameraQuaternion:G.camera.quaternion.toArray(),
    fov:G.camera.fov,aspect:G.camera.aspect,yaw:g.rig.yaw,pitch:g.rig.pitch,
    input:{fire:G.input?.mouse?.left??null,enabled:G.input?.enabled??null,
      locked:G.input?.locked??null,lastDevice:G.input?.lastDevice??null,keys:[...(G.input?.keys||[])].sort()},
    intent:{fire:a.intent?.fire??null,jump:a.intent?.jump??null,squid:a.intent?.squid??null,
      move:a.intent?.move?.toArray?.()??null},
    runner:{charge:a.weaponRunner.charge??null,chargeT:a.weaponRunner.chargeT??null,
      charging:a.weaponRunner.charging===true,cooldown:a.weaponRunner.cooldown??null,
      streaming:a.weaponRunner.streaming===true,
      streamTime:a.weaponRunner.catalogState?.streamTime??null,
      streamElapsed:a.weaponRunner.catalogState?.streamElapsed??null,
      streamUsed:a.weaponRunner.catalogState?.streamUsed??null,
      bowTilt:a.weaponRunner.catalogState?.bowTilt??null},
    renderFrames:window.__reticleCadence?.length||0,
    shotCount:window.__chargerRecipeObservation?.events.length||0,
  });
  const geometric=new Set(['transform','translate','rotate','scale','width','height','left','top','right','bottom','x','y','r','rx','ry','cx','cy','d','offsetDistance','offsetPath','transformOrigin','zoom']);
  const sample=()=>({
    geometry:[ret,...ret.querySelectorAll('*')].map((node,index)=>{
      const s=getComputedStyle(node);
      return {index,tag:node.tagName,classes:node.getAttribute('class'),bounds:node.getBoundingClientRect().toJSON(),
        transform:s.transform,translate:s.translate,rotate:s.rotate,scale:s.scale,display:s.display};
    }),
    activeGeometry:ret.getAnimations({subtree:true}).filter(animation=>
      (animation.pending||animation.playState==='running')&&
      animation.effect?.getKeyframes().some(frame=>Object.keys(frame).some(key=>geometric.has(key)))
    ).map(animation=>({type:animation.constructor.name,playState:animation.playState,pending:animation.pending,
      property:animation.transitionProperty??null,currentTime:animation.currentTime,
      timing:(()=>{const t=animation.effect.getComputedTiming();return {duration:t.duration,delay:t.delay,endTime:t.endTime,iterations:t.iterations};})()})),
  });
  const ownerBefore=JSON.parse(JSON.stringify(owner())),surface=sample(),ownerAfter=JSON.parse(JSON.stringify(owner()));
  if(JSON.stringify(ownerBefore)!==JSON.stringify(ownerAfter))throw Error('Native owner changed during presentation observation');
  return {owner:ownerAfter,...surface,wallTime:performance.now(),
    timelineTime:document.timeline?.currentTime??null,visibility:document.visibilityState,focused:document.hasFocus()};
}

// Real wall time only, derived from observed finite native CSS end times. This
// does not advance a document timeline or seek/change an Animation object.
export async function waitNaturalCssDuration(durationMs) {
  if(!Number.isFinite(durationMs)||durationMs<0||durationMs>500)throw Error('Invalid bounded native CSS duration');
  const start=performance.now();let timerCallbacks=0;
  while(performance.now()-start<durationMs){
    await new Promise(resolve=>setTimeout(resolve,Math.max(1,Math.ceil(durationMs-(performance.now()-start)))));
    timerCallbacks++;
  }
  return {requestedMs:durationMs,elapsedMs:performance.now()-start,timerCallbacks};
}

export function remainingFiniteCssMs(sample,maxNaturalWaitMs=500) {
  assert(Number.isFinite(maxNaturalWaitMs)&&maxNaturalWaitMs>0&&maxNaturalWaitMs<=500);
  return Math.max(0,...sample.activeGeometry.map(animation=>{
    const {endTime,duration,delay,iterations}=animation.timing||{};
    assert(Number.isFinite(endTime)&&endTime>=0&&Number.isFinite(duration)&&duration>=0&&
      Number.isFinite(delay)&&Number.isFinite(iterations)&&iterations>=0,
      'Presentation admission requires finite native CSS timing, not a perpetual animation');
    const current=animation.currentTime??0;
    assert(Number.isFinite(current),'Presentation admission requires numeric native CSS currentTime');
    const remaining=Math.max(0,endTime-current);
    assert(endTime<=maxNaturalWaitMs&&remaining<=maxNaturalWaitMs,'Native CSS duration exceeds bounded presentation admission budget');
    return Math.ceil(remaining);
  }));
}

export async function admitShapeCapturePresentation(page,{inspectSurface,assertSurfaceInvariant,onUpdate=()=>{},
  maxWarmups=3,maxNaturalWaitMs=500}={}) {
  assert.equal(typeof inspectSurface,'function');assert.equal(typeof assertSurfaceInvariant,'function');
  assert(Number.isInteger(maxWarmups)&&maxWarmups>=1&&maxWarmups<=3,'Bounded ordinary presentation count');
  assert(Number.isFinite(maxNaturalWaitMs)&&maxNaturalWaitMs>0&&maxNaturalWaitMs<=500);
  const started=performance.now();
  const initial=await page.evaluate(inspectShapePresentation);
  const owner=initial.owner,trace={schema:1,status:'admitting',maxWarmups,maxNaturalWaitMs,
    screenshotDeadlineMs:20000,acceptedScreenshot:false,initial,operations:[],warmups:[]};
  const report=()=>onUpdate({...trace,elapsedMs:performance.now()-started});
  const checkpoint=async label=>{
    const sample=await page.evaluate(inspectShapePresentation);
    trace.operations.push({operation:'checkpoint',label,sample});report();
    assert.deepEqual(sample.owner,owner,'Presentation admission must not advance native owners: '+label);
    return sample;
  };
  try {
    report();let current=initial;
    // Validate before causing any native presentation; never hide an infinite or
    // unexpectedly long animation behind screenshots or a larger timeout.
    if(current.activeGeometry.length)remainingFiniteCssMs(current,maxNaturalWaitMs);
    for(let index=1;current.activeGeometry.length&&index<=maxWarmups;index++){
      await checkpoint('before-redraw-'+index);
      const surfaceBefore=await page.evaluate(inspectSurface,{redraw:true});
      await checkpoint('after-redraw-'+index);
      const before=await checkpoint('before-warmup-'+index);
      trace.operations.push({operation:'ordinary-screenshot-start',index,acceptedScreenshot:false});report();
      const bytes=await page.screenshot({scale:'device',animations:'allow',timeout:20000});
      const warmup={index,acceptedScreenshot:false,bytes:bytes.length,
        sha256:crypto.createHash('sha256').update(bytes).digest('hex'),before,after:null,surfaceBefore};
      trace.warmups.push(warmup);report();
      const after=await checkpoint('after-warmup-'+index);warmup.after=after;
      const surfaceAfter=await page.evaluate(inspectSurface,{redraw:false});
      assertSurfaceInvariant(surfaceBefore,surfaceAfter);
      await checkpoint('after-surface-check-'+index);
      warmup.surfaceAfter=surfaceAfter;report();
      current=after;
      if(current.activeGeometry.length&&index<maxWarmups){
        const durationMs=remainingFiniteCssMs(current,maxNaturalWaitMs);
        await checkpoint('before-natural-css-wait-'+index);
        const measured=await page.evaluate(waitNaturalCssDuration,durationMs);
        current=await checkpoint('after-natural-css-wait-'+index);
        trace.operations.push({operation:'natural-css-duration-wait',index,...measured});report();
        // A wall wait does not itself prove native CSS progressed. If animation
        // remains active, the NEXT ordinary screenshot requests real presentation.
      }
    }
    trace.status='strict-settlement';report();await checkpoint('before-strict-settlement');
    const settlement=await settleShapeCapture(page);
    const final=await checkpoint('after-strict-settlement');
    assert.deepEqual(settlement.ownerBefore,owner,'Strict settlement must start at unchanged admission owner');
    assert.deepEqual(settlement.ownerAfter,owner,'Strict settlement must end at unchanged admission owner');
    trace.status='admitted';trace.final=final;trace.ownerInvariant=true;trace.elapsedMs=performance.now()-started;report();
    return {presentation:trace,settlement};
  }catch(error){trace.status='failed';trace.failure=String(error);report();throw error;}
}
