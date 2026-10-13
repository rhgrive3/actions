// Diagnostic only: native input/flight first, then frozen GPU comparisons.
// Never imported by the game. Restores temporary render visibility and camera.
import fs from 'node:fs';
import path from 'node:path';
export async function probeProjectileVisibility(page, out) {
  fs.mkdirSync(out, {recursive:true});
  const report={cases:[],physicalDevice:false,laneProbeScope:'Conservative 0.25 radius / 8-unit clearance control, not a weapon-profile radius. Native world traces retain each actual shot radius. Job success alone is not visibility proof; require visibilityEstablished=true.'};
  for (const scenario of ['original-stance','clear-lane']) for (const weapon of ['shooter','dualies','splatling']) {
    const label=scenario+'-'+weapon;
    try {
    const birth=await page.evaluate(async ({weapon,scenario})=>{
      const G=globalThis.NG||window.__G,g=G.game||window.__inkwave,a=G.local;
      globalThis.__projectileCaseRestore={yaw:g.rig.yaw,pitch:g.rig.pitch,camera:G.camera.clone(),step:G.projectiles._step,world:G.projectiles.inkFlight.world,fire:g.input.mouse.left,frozen:g.frozen,skipRender:g._skipRender,bots:(G.actors||[]).filter(a=>a.bot&&!a.isLocal).map(a=>[a.bot,a.bot.update])};
      g.debug.freeze();g.debug.freezeBots();g._skipRender=true;
      G.projectiles.clear();G.fx.clear();a.setWeapon(weapon);a.weaponRunner.reset();a.ink=100;
      const originalYaw=g.rig.yaw,originalPitch=g.rig.pitch;
      const laneSearch=[];let selectedLane=null;
      const searchPosition=a.pos.toArray();
      const hitMetadata=h=>{const b=G.level?.blocks?.[h.block];return {hit:!!h.hit,distance:h.hit?h.dist:null,point:h.hit?h.point.toArray():null,normal:h.hit?h.normal.toArray():null,block:h.block??null,face:h.face??null,triangle:h.triangle??null,nativeObject:b?.nativeObject??null,nativeFace:b?.nativeFace??null,blockCenter:b?.center?.toArray()??null,blockHalf:b?.half?.toArray()??null};};
      const measureLane=()=>{
        const muzzle=G.projectiles._muzzle(a,a.pos.clone()),aim=G.projectiles._aimFrom(a,muzzle,a.aimDir.clone());
        const to=muzzle.clone().addScaledVector(aim,8),h=G.projectiles.inkFlight.world(muzzle,to,.25,new G.projectiles.inkFlight.worldHit.constructor());
        return {muzzle:muzzle.toArray(),aim:aim.toArray(),to:to.toArray(),radius:.25,actorPosition:a.pos.toArray(),actorAim:a.aimDir.toArray(),rigYaw:g.rig.yaw,rigPitch:g.rig.pitch,...hitMetadata(h)};
      };
      g.debug.fire(false);
      for(let i=0;i<4;i++)g._frame(1/60);
      if(scenario==='clear-lane'){
        // A proposed yaw is not clearance evidence. Apply it through the live
        // rig/controller, then test the actual post-rig muzzle and aim.
        search:for(const pitch of [0,.35,.7])for(let i=0;i<16;i++){
          const yaw=originalYaw+i*Math.PI/8;g.rig.yaw=yaw;g.rig.pitch=pitch;
          for(let settle=0;settle<8;settle++)g._frame(1/60);
          const row={requestedYaw:yaw,requestedPitch:pitch,...measureLane()};laneSearch.push(row);
          if(!row.hit){selectedLane=row;break search;}
        }
      }
      const actualLane=measureLane(),clearLaneVerified=scenario==='clear-lane'&&!!selectedLane&&!actualLane.hit;
      const clearanceFailure=scenario!=='clear-lane'?null:!selectedLane?'no-clear-native-muzzle-lane':actualLane.hit?'selected-native-lane-lost-clearance':null;
      const trace=[],system=G.projectiles,flight=system.inkFlight,oldStep=system._step,oldWorld=flight.world;
      let current=null,traceTick=-1,traceDropped=0;
      system._step=function(p,dt){
        if(p.owner!==a)return oldStep.call(this,p,dt);
        const row={tick:traceTick,type:p.type,ageBefore:p.age,positionBefore:p.pos.toArray(),velocityBefore:p.vel.toArray(),actorPosition:a.pos.toArray(),aimDir:a.aimDir.toArray(),aimPoint:a.aimPoint.toArray(),world:[]};
        current=row;try{const dead=oldStep.call(this,p,dt);Object.assign(row,{dead,ageAfter:p.age,positionAfter:p.pos.toArray()});return dead;}finally{current=null;if(trace.length<500)trace.push(row);else traceDropped++;}
      };
      flight.world=function(from,to,radius,hit){const result=oldWorld.call(this,from,to,radius,hit);if(current)current.world.push({from:from.toArray(),to:to.toArray(),radius,hit:!!result.hit,distance:result.hit?result.dist:null,...hitMetadata(result)});return result;};
      const ticks=[];
      try {
      g.debug.fire(true);if(weapon==='splatling'){for(let i=0;i<40;i++)g._frame(1/60);g.debug.fire(false);}
      for(let i=0;i<90;i++){
        traceTick=i;
        g._frame(1/60);
        const rounds=G.projectiles.list.filter(p=>p.owner===a);
        ticks.push({tick:i,time:G.time,matchState:g.match?.state,paused:g.match?.paused,inputFire:g.input.mouse.left,intentFire:a.intent.fire,ink:a.ink,cooldown:a.weaponRunner.cooldown,rounds:rounds.length,age:rounds.map(p=>p.age),positions:rounds.map(p=>p.pos.toArray()),volumes:G.fx.inkVolumes?{...G.fx.inkVolumes.metrics}:null,blobs:G.projectiles.blobs.count});
        if(rounds.some(p=>p.age>=1/60&&p.delay<=0))break;
      }
      } finally {system._step=oldStep;flight.world=oldWorld;g.debug.fire(false);g.rig.yaw=originalYaw;g.rig.pitch=originalPitch;}
      g._skipRender=true;
      globalThis.__projectileProbe={camera:G.camera.clone(),rounds:G.projectiles.list.filter(p=>p.owner===a)};
      return {weapon,scenario,trace,traceDropped,traceComplete:traceDropped===0,laneSearch,selectedLane,actualLane,clearLaneVerified,clearanceFailure,searchPosition,status:G.projectiles.list.some(p=>p.owner===a)?'live-rounds':'inconclusive-no-live-rounds',ticks,local:{position:a.pos.toArray(),alive:a.alive,form:a.form},rounds:__projectileProbe.rounds.map(p=>({type:p.type,wid:p.wid,recipe:p._inkVolumeRecipe,age:p.age,size:p.size,vis:p.vis,delay:p.delay,position:p.pos.toArray(),velocity:p.vel.toArray()})),volumeError:G.fx.inkVolumeError||null,assets:[...(G.fx.inkVolumes?.assets.keys()||[])]};
    },{weapon,scenario});
    birth.views=[];report.cases.push(birth);fs.writeFileSync(path.join(out,'projectile-visibility.json'),JSON.stringify(report,null,2));
    if(!birth.rounds.length){try{await page.evaluate(()=>{const G=globalThis.NG||window.__G;(G.game||window.__inkwave).R.render();});birth.noLiveImageMode='fresh composer render after native stepping; no projectile redraw';await page.screenshot({path:path.join(out,label+'-no-live-rounds.png'),timeout:60000});}finally{await page.evaluate(()=>{delete globalThis.__projectileProbe;});}continue;}
    try {
    for(const view of ['native','side','behind','above']){
      const proof=await page.evaluate(view=>{
        const G=globalThis.NG||window.__G,g=G.game||window.__inkwave,c=G.camera,p=__projectileProbe.rounds[0];
        c.copy(__projectileProbe.camera);
        if(view!=='native'&&p){const dir=p.vel.clone().normalize(),offset=dir.clone();if(view==='side')offset.set(dir.z,.25,-dir.x);else if(view==='above')offset.set(0,1,.01);else offset.negate();c.position.copy(p.pos).addScaledVector(offset.normalize(),4);c.lookAt(p.pos);}
        c.updateMatrixWorld();
        const meshes=[G.projectiles.blobs];for(const asset of G.fx.inkVolumes?.assets.values()||[])for(const pattern of asset.patterns)for(const levels of pattern.frames)for(const batch of levels)meshes.push(batch.mesh,batch.fringe);
        const before=JSON.stringify(__projectileProbe.rounds.map(p=>[p.pos.toArray(),p.vel.toArray(),p.age,p.damage,p.seed]));
        const visible=meshes.map(m=>m.visible),gl=G.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
        const read=()=>{g.R.render();const bytes=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;};
        const beforeRedrawMetrics=G.fx.inkVolumes?{...G.fx.inkVolumes.metrics}:null,beforeRedraw=read();
        const beforeRedrawPNG=view==='native'?G.renderer.domElement.toDataURL('image/png'):null;
        let nativeControl,nativeOff,nativeOffControl;
        if(view==='native'){
          nativeControl=read();
          try{meshes.forEach(m=>m.visible=false);nativeOff=read();nativeOffControl=read();}
          finally{meshes.forEach((m,i)=>m.visible=visible[i]);}
        }
        const countChanged=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])n++;return n;};
        const nativeBeforeRedraw=view==='native'?{changedPixels:countChanged(beforeRedraw,nativeOff),onRepeatChangedPixels:countChanged(beforeRedraw,nativeControl),offRepeatChangedPixels:countChanged(nativeOff,nativeOffControl),glError:gl.getError()}:null;
        G.projectiles._draw();
        const on=read(),forcedOnPNG=G.renderer.domElement.toDataURL('image/png'),control=read();let off,offControl;
        try {meshes.forEach(m=>m.visible=false);off=read();offControl=read();}
        finally {meshes.forEach((m,i)=>m.visible=visible[i]);read();}
        let redrawChanged=0;for(let i=0;i<on.length;i+=4)if(on[i]!==beforeRedraw[i]||on[i+1]!==beforeRedraw[i+1]||on[i+2]!==beforeRedraw[i+2])redrawChanged++;
        let controlChanged=0;for(let i=0;i<on.length;i+=4)if(on[i]!==control[i]||on[i+1]!==control[i+1]||on[i+2]!==control[i+2])controlChanged++;
        let offControlChanged=0;for(let i=0;i<off.length;i+=4)if(off[i]!==offControl[i]||off[i+1]!==offControl[i+1]||off[i+2]!==offControl[i+2])offControlChanged++;
        let changed=0,total=0,max=0;for(let i=0;i<on.length;i+=4){let d=0;for(let k=0;k<3;k++)d+=Math.abs(on[i+k]-off[i+k]);if(d>0)changed++;total+=d;max=Math.max(max,d);}
        return {view,width:w,height:h,beforeRedrawPNG,forcedOnPNG,nativeBeforeRedraw,beforeRedrawMetrics,currentCameraRedrawChangedPixels:redrawChanged,onRepeatChangedPixels:controlChanged,offRepeatChangedPixels:offControlChanged,changedPixels:changed,totalDifference:total,maxDifference:max,glError:gl.getError(),blobs:G.projectiles.blobs.count,volumes:G.fx.inkVolumes?{...G.fx.inkVolumes.metrics}:null,camera:c.position.toArray(),sampledProjectileFields:['position','velocity','age','damage','seed'],sampledProjectileFieldsUnchanged:before===JSON.stringify(__projectileProbe.rounds.map(p=>[p.pos.toArray(),p.vel.toArray(),p.age,p.damage,p.seed]))};
      },view);
      if(proof.beforeRedrawPNG){const filename=label+'-'+view+'-before-redraw.png';if(!proof.beforeRedrawPNG.startsWith('data:image/png;base64,'))throw Error('Unexpected canvas image encoding');fs.writeFileSync(path.join(out,filename),Buffer.from(proof.beforeRedrawPNG.slice('data:image/png;base64,'.length),'base64'));proof.beforeRedrawImage=filename;}delete proof.beforeRedrawPNG;
      if(proof.forcedOnPNG){const filename=label+'-'+view+'-forced-on.png';if(!proof.forcedOnPNG.startsWith('data:image/png;base64,'))throw Error('Unexpected forced-on image encoding');fs.writeFileSync(path.join(out,filename),Buffer.from(proof.forcedOnPNG.slice('data:image/png;base64,'.length),'base64'));proof.forcedOnImage=filename;}delete proof.forcedOnPNG;
      birth.views.push(proof);fs.writeFileSync(path.join(out,'projectile-visibility.json'),JSON.stringify(report,null,2));
      await page.screenshot({path:path.join(out,label+'-'+view+'.png'),timeout:60000});
    }
    } finally {
      await page.evaluate(()=>{const G=globalThis.NG||window.__G;if(!globalThis.__projectileProbe)return;G.camera.copy(__projectileProbe.camera);G.camera.updateMatrixWorld();G.projectiles._draw();(G.game||window.__inkwave).R.render();delete globalThis.__projectileProbe;});
    }
    fs.writeFileSync(path.join(out,'projectile-visibility.json'),JSON.stringify(report,null,2));
    } catch(error) {
      report.cases.push({scenario,weapon,status:'failed-diagnostic-case',error:String(error?.stack||error),rounds:[],traceComplete:false,views:[]});
    } finally {
      try {await page.evaluate(()=>{const G=globalThis.NG||window.__G,g=G.game||window.__inkwave,r=globalThis.__projectileCaseRestore;if(!r)return;G.projectiles._step=r.step;G.projectiles.inkFlight.world=r.world;g.debug.fire(r.fire);g.frozen=r.frozen;g._skipRender=r.skipRender;for(const [bot,update] of r.bots)bot.update=update;g.rig.yaw=r.yaw;g.rig.pitch=r.pitch;G.camera.copy(r.camera);G.camera.updateMatrixWorld();delete globalThis.__projectileProbe;delete globalThis.__projectileCaseRestore;});}
      catch(error){report.cases.push({scenario,weapon,status:'failed-diagnostic-restore',error:String(error?.stack||error),rounds:[],traceComplete:false,views:[]});}
      fs.writeFileSync(path.join(out,'projectile-visibility.json'),JSON.stringify(report,null,2));
    }
  }
  const distinguishable=v=>!!v&&v.glError===0&&v.changedPixels>Math.max(v.onRepeatChangedPixels,v.offRepeatChangedPixels)*4+50;
  const clearCases=report.cases.filter(c=>c.scenario==='clear-lane');
  report.nativeBeforeRedrawVisibilityEstablished=clearCases.length===3&&clearCases.every(c=>c.clearLaneVerified&&c.traceComplete&&c.rounds.length>0&&distinguishable(c.views.find(v=>v.view==='native')?.nativeBeforeRedraw));
  report.forcedOrAlternateVisibilityEstablished=clearCases.length===3&&clearCases.every(c=>c.clearLaneVerified&&c.traceComplete&&c.rounds.length>0&&c.views.some(distinguishable));
  report.visibilityEstablished=report.nativeBeforeRedrawVisibilityEstablished;
  fs.writeFileSync(path.join(out,'projectile-visibility.json'),JSON.stringify(report,null,2));
  report.failures=report.cases.flatMap(c=>{
    const reasons=[];if(c.error)reasons.push(c.status);if(c.clearanceFailure)reasons.push(c.clearanceFailure);if(!c.traceComplete)reasons.push('native-trace-overflow');if(!c.rounds.length)reasons.push('no-surviving-native-round');
    if(c.rounds.length&&!distinguishable(c.views.find(v=>v.view==='native')?.nativeBeforeRedraw))reasons.push('native-before-redraw-pixels-not-established');
    return reasons.map(reason=>({scenario:c.scenario,weapon:c.weapon,reason}));
  });
  // Return failures instead of throwing here: the caller must retain them,
  // finish independent stage/quality cases, and evaluate overall success last.
  fs.writeFileSync(path.join(out,'projectile-visibility.json'),JSON.stringify(report,null,2));
  return report;
}
