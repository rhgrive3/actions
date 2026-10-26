// Harness only. Let native browser CSS finish on its own wall clock, while the
// source game stays frozen. No frame stepping, input, style or animation writes.
export async function waitForShapeCaptureSettlement({deadlineMs=1500,stableSamples=3,pollIntervalMs=16}={}) {
  if(!Number.isFinite(deadlineMs)||deadlineMs<=0||!Number.isSafeInteger(stableSamples)||stableSamples<2||
    !Number.isFinite(pollIntervalMs)||pollIntervalMs<1||pollIntervalMs>=deadlineMs)
    throw Error('Invalid shape capture settlement bounds');
  const G=window.__G,g=window.__inkwave,a=G.local,ret=g.hud.ret;
  if(!g.frozen||!ret?.isConnected)throw Error('Shape capture settlement requires frozen connected native HUD');
  const started=performance.now();
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
  // Copy immediately: catalogue state can be a live mutable source object.
  const ownerBefore=JSON.parse(JSON.stringify(owner())),ownerKey=JSON.stringify(ownerBefore);
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
      property:animation.transitionProperty??null,currentTime:animation.currentTime})),
  });
  // RAF delivery is an observation, not a prerequisite for CSS reads: a browser
  // may service timer tasks without delivering a rendering opportunity. Do not manufacture frames or advance the game.
  const rafMetrics={callbacks:0,firstCallbackMs:null,lastCallbackMs:null};
  const wallPoll={intervalMs:pollIntervalMs,samples:0,stableSamples:0,
    requiredStableSamples:stableSamples,stableElapsedMs:0,maxGapMs:0,observations:[]};
  const minStableMs=(stableSamples-1)*pollIntervalMs;
  let previous=null,initial=null,last=null,stableSince=null,lastPollAt=null,deadlineTimer,pollTimer,raf,done=false;
  const context=()=>({visibility:document.visibilityState,focused:document.hasFocus(),
    timelineTime:document.timeline?.currentTime??null});
  return await new Promise((resolve,reject)=>{
    const cleanup=()=>{done=true;clearTimeout(deadlineTimer);clearTimeout(pollTimer);cancelAnimationFrame(raf);};
    const diagnostic=()=>({raf:{...rafMetrics},wallPoll:{...wallPoll},minStableMs,
      elapsedMs:performance.now()-started,deadlineMs,ownerBefore,ownerAfter:owner(),initial,last,context:context()});
    const fail=reason=>{cleanup();reject(Error(reason+' '+JSON.stringify(diagnostic())));};
    const observeRaf=()=>{
      if(done)return;
      const elapsed=performance.now()-started;rafMetrics.callbacks++;
      rafMetrics.firstCallbackMs??=elapsed;rafMetrics.lastCallbackMs=elapsed;
      raf=requestAnimationFrame(observeRaf);
    };
    const poll=()=>{
      if(done)return;
      try {
        let now=performance.now();
        if(now-started>=deadlineMs)return fail('Native shape CSS settlement deadline exceeded');
        let ownerAfter=JSON.parse(JSON.stringify(owner()));
        if(JSON.stringify(ownerAfter)!==ownerKey)return fail('Native owner changed during shape CSS settlement');
        if(!ret.isConnected)return fail('Native reticle disconnected during shape CSS settlement');
        last=sample();initial??=last;wallPoll.samples++;
        // A style/layout flush may itself be expensive. Recheck both the absolute
        // bound and source owner after it, including the final accepted sample.
        now=performance.now();ownerAfter=JSON.parse(JSON.stringify(owner()));
        if(JSON.stringify(ownerAfter)!==ownerKey)return fail('Native owner changed during shape CSS settlement');
        if(now-started>=deadlineMs)return fail('Native shape CSS settlement deadline exceeded');
        if(lastPollAt!==null)wallPoll.maxGapMs=Math.max(wallPoll.maxGapMs,now-lastPollAt);
        lastPollAt=now;
        const key=JSON.stringify(last.geometry),geometryChanged=key!==previous;
        if(last.activeGeometry.length===0){
          if(key!==previous||stableSince===null){wallPoll.stableSamples=1;stableSince=now;}
          else wallPoll.stableSamples++;
        }else{wallPoll.stableSamples=0;stableSince=null;}
        previous=key;wallPoll.stableElapsedMs=stableSince===null?0:now-stableSince;
        wallPoll.observations.push({sequence:wallPoll.samples,elapsedMs:now-started,
          geometryChanged,
          activeGeometryCount:last.activeGeometry.length,stableSamples:wallPoll.stableSamples,
          stableElapsedMs:wallPoll.stableElapsedMs,rafCallbacks:rafMetrics.callbacks});
        if(wallPoll.stableSamples>=stableSamples&&wallPoll.stableElapsedMs>=minStableMs){
          cleanup();
          resolve({raf:{...rafMetrics},wallPoll:{...wallPoll},minStableMs,
            elapsedMs:performance.now()-started,deadlineMs,ownerInvariant:true,ownerBefore,ownerAfter,
            initial,geometry:last.geometry,activeGeometry:last.activeGeometry,context:context()});
          return;
        }
        pollTimer=setTimeout(poll,pollIntervalMs);
      }catch(error){fail('Native shape CSS settlement failed: '+String(error));}
    };
    // Independent fail-closed deadline is unchanged, not increased to mask a
    // starved render scheduler. Timers schedule real computed-style observations.
    deadlineTimer=setTimeout(()=>fail('Native shape CSS settlement deadline exceeded'),deadlineMs);
    raf=requestAnimationFrame(observeRaf);
    poll();
  });
}

export async function settleShapeCapture(page,options) {
  return page.evaluate(waitForShapeCaptureSettlement,options);
}
