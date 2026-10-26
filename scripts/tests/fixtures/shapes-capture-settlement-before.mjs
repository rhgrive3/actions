// Harness only. Let native browser CSS finish on its own wall clock, while the
// source game stays frozen. No frame stepping, input, style or animation writes.
export async function waitForShapeCaptureSettlement({deadlineMs=1500,stableFrames=3}={}) {
  if(!Number.isFinite(deadlineMs)||deadlineMs<=0||!Number.isSafeInteger(stableFrames)||stableFrames<2)
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
  let frames=0,stable=0,previous=null,last=sample(),timer,raf;
  return await new Promise((resolve,reject)=>{
    const fail=(reason)=>{
      clearTimeout(timer);cancelAnimationFrame(raf);
      reject(Error(reason+' '+JSON.stringify({frames,stableFrames:stable,elapsedMs:performance.now()-started,
        deadlineMs,ownerBefore,ownerAfter:owner(),last})));
    };
    // Timer is a fail-closed deadline only, never a substitute for RAF evidence.
    timer=setTimeout(()=>fail('Native shape CSS settlement deadline exceeded'),deadlineMs);
    const frame=()=>{
      try {
        frames++;
        const ownerAfter=JSON.parse(JSON.stringify(owner()));
        if(JSON.stringify(ownerAfter)!==ownerKey)return fail('Native owner changed during shape CSS settlement');
        last=sample();const key=JSON.stringify(last.geometry);
        stable=last.activeGeometry.length===0&&key===previous?stable+1:0;previous=key;
        if(stable>=stableFrames){
          clearTimeout(timer);
          resolve({frames,stableFrames:stable,elapsedMs:performance.now()-started,deadlineMs,
            ownerInvariant:true,ownerBefore,ownerAfter,geometry:last.geometry,activeGeometry:last.activeGeometry});
          return;
        }
        raf=requestAnimationFrame(frame);
      }catch(error){fail('Native shape CSS settlement failed: '+String(error));}
    };
    raf=requestAnimationFrame(frame);
  });
}

export async function settleShapeCapture(page,options) {
  return page.evaluate(waitForShapeCaptureSettlement,options);
}
