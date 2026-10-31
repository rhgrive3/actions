// Renderer callbacks are self-contained for Playwright serialization.
// Keep the initial fixed fixture identical to benchmark-inkwave-composed-cpu.
export async function prepareCpuBattle({stage,render,weapon}) {
   const g=window.__inkwave,G=window.__G;
   g.debug.key('KeyW',false);g.debug.key('Space',false);g.debug.fire(false);
   g.debug.freeze();g._skipRender=true;g.menus.wipe.cancel();G.time=0;g.s3Clock.reset();
   let seed=11223;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
   Math.random=random;
   if(weapon){if(!g.api.weapons[weapon])throw Error('Unknown fixture weapon: '+weapon);g.profile.weapon=weapon;}
   const proto=Object.getPrototypeOf(G.match),setup=proto.setup;
   proto.setup=function(...args){seed=11223;return setup.apply(this,args);};
   try{await g.startMatch({mapId:stage,mode:'turf',duration:180,difficulty:'normal'});}finally{proto.setup=setup;}
   if(G.level.layout.id!==stage)throw Error('Requested stage did not load: '+stage);
   if(weapon&&G.local?.weapon?.id!==weapon)throw Error('Requested local weapon did not load');
   // Wait for actual source clips; never silently benchmark the fallback pose.
   const characters=G.actors.map(a=>a.character).filter(c=>Array.isArray(c.boneList));
   await Promise.all(characters.map(c=>c._sourceMotionLoader));
   await Promise.all(characters.map(c=>c.sourceMotion?.ready));
   if(!characters.length||characters.some(c=>c.sourceMotion?.status!=='ready'))throw Error('Source motion not ready');
   if(G.audio){let aseed=456;G.audio.rng=()=>{aseed=(Math.imul(aseed,1664525)+1013904223)>>>0;return aseed/4294967296;};}
   g._skipRender=true;seed=24680;
   for(const a of G.actors){if(!a.bot)continue;const b=a.bot;
    b.sweep=random()*10;b.strafe=random()<.5?1:-1;b.bombCd=3+random()*4;b.think=random()*.2;b.chargeRelease=.95+random()*.05;b.ph1=random()*20;b.ph2=random()*20;b.t=random()*10;b.dodgeCd=1+random()*2;
   }
   for(let i=0,n=(g.match.turfIntroFrames??253)+47;i<n;i++)g._frame(1/60);
   g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;
   for(let i=0;i<120;i++)g._frame(1/60);
   g._skipRender=!render;
   // No forced GC. First-use shaders, if requested, are warmed separately.
   if(render){for(let i=0;i<4;i++)g._frame(1/60);}
   else {
    // Observe the native playing scene once, rather than the final menu/fade
    // pass left in renderer.info. This warm render does not advance simulation.
    const ticks=g.s3Clock.ticks;g.R.render();
    if(g.s3Clock.ticks!==ticks)throw Error('Warm render advanced simulation');
   }
   G.renderer.getContext().finish();
   window.cpuBenchResetStep=i=>{seed=(24680+Math.imul(i,2654435761))>>>0;};
   return {clockTicks:g.s3Clock.ticks,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,roster:G.actors.map(a=>a.weapon.id),native:!!G.level.native,
    sourceCharacters:characters.length,triangles:G.level.triangleWorld?.triangleCount??0,paintFaces:G.paint.paintFaces?.length,atlas:G.paint.size,ppm:G.paint.ppm,settings:g.settings,scene:globalThis.__iwReadCpuCounters(G.renderer,G.scene).scene};
}

export function runCpuBattle({frames,hz}) {
   const G=window.__G,g=window.__inkwave;
   const budgetKeys=['_oobTicks','_oobBudgetTicks','_oobHairSkips','_oobHairCatchUps','_oobPoseCoreTicks','_oobPoseDecorativeSkips','_oobMaterialSkips','_oobMaterialCatchUps','_oobCatchUps'];
   const readBudget=()=>G.actors.map(a=>Object.fromEntries(budgetKeys.map(key=>[key,a.character?.[key]??0])));
   const budgetBefore=readBudget();
   // Read raw counters: Audio.stats() itself prunes voices/byName and would
   // alter the workload that an observer is supposed to leave intact.
   const readAudio=()=>{const audio=G.audio;return audio?{counts:{...audio.counts},voices:audio.voices?.length??0,liveVoices:audio.voices?.filter(voice=>!voice.v.dead&&!voice.stolen).length??0,loops:audio.loops?.size??0,byName:audio.byName?.size??0,last:audio.last?.size??0,state:audio.ctx?.state??'none',currentTime:audio.ctx?.currentTime??null,realAudioSuppressed:audio._realAudioSuppressed??0,authoredFallbackShots:audio._realAudioFallbackShots??0}:null;};
   const audioBefore=readAudio();
   // Count-only observation of actual scene submissions; no scope timer.
   const render=g.R.render,renderOwn=Object.getOwnPropertyDescriptor(g.R,'render');let sceneRenderCalls=0;
   g.R.render=function(...args){sceneRenderCalls++;return render.apply(this,args);};
   const poseF64=new Float64Array(1),poseU32=new Uint32Array(poseF64.buffer),poseDigests=[];
   let poseDigest=2166136261;
   const poseMix=value=>{poseDigest=Math.imul(poseDigest^value,16777619)>>>0;};
   const matrix=values=>{for(const value of values){if(!Number.isFinite(value))throw Error('Non-finite visible pose');poseF64[0]=value;poseMix(poseU32[0]);poseMix(poseU32[1]);}};
   const drawnActorFrames=G.actors.map(()=>0);
   const w=G.level.triangleWorld,q0=w?.queryCount??0,t0=w?.triangleTests??0,ticks0=g.s3Clock.ticks,times=[],gameplay=globalThis.__iwCreateCpuGameplayDigest(),counterBefore=globalThis.__iwReadCpuCounters(G.renderer,G.scene);
   let minActors=G.actors.length,minLiving=G.actors.length;
   g.debug.key('KeyW',true);g.debug.fire(true);
   performance.mark('inkwave-cpu-start');
   try{for(let i=0;i<frames;i++){
    window.cpuBenchResetStep(i);g.rig.yaw+=.6/hz;g.debug.key('Space',i%Math.round(hz*2)===0);
    const renderFrameBefore=G.renderer.info.render.frame;
    const t=performance.now();g._frame(1/hz);times.push(performance.now()-t);
    let living=0;for(const a of G.actors)if(a.alive)living++;minLiving=Math.min(minLiving,living);minActors=Math.min(minActors,G.actors.length);
    gameplay.step(G.actors,G.paint);
    // Observe the final rendered bone transforms without updating matrices or
    // materializing diagnostics. Hidden decorative poses intentionally defer.
    for(let actorIndex=0;actorIndex<G.actors.length;actorIndex++){
     const character=G.actors[actorIndex].character;
     if(character?._camFrame>=renderFrameBefore){
      drawnActorFrames[actorIndex]++;poseMix(actorIndex);matrix(character.root.matrixWorld.elements);
      for(const bone of character.boneList||[])matrix(bone.matrixWorld.elements);
     }
    }
    poseDigests.push(poseDigest);
   }}finally{performance.mark('inkwave-cpu-end');g.debug.key('KeyW',false);g.debug.fire(false);if(renderOwn)Object.defineProperty(g.R,'render',renderOwn);else delete g.R.render;}
   const ticks=g.s3Clock.ticks-ticks0;
   const counters=globalThis.__iwCpuCounterWindow(counterBefore,globalThis.__iwReadCpuCounters(G.renderer,G.scene));
   const budgetAfter=readBudget();
   const audioAfter=readAudio();
   const audioWork={before:audioBefore,after:audioAfter,countsDelta:audioBefore&&audioAfter?Object.fromEntries(Object.keys(audioAfter.counts).map(key=>[key,audioAfter.counts[key]-(audioBefore.counts[key]??0)])):null};
   const budgetWork=budgetAfter.map((row,index)=>Object.fromEntries(budgetKeys.map(key=>[key,row[key]-budgetBefore[index][key]])));
   return {frames,hz,ticks,times,minActors,minLiving,digests:gameplay.digests,digest:gameplay.finish(G.paint),counts:[...G.paint.counts],state:G.match.state,
    sceneRenderCalls,drawnActorFrames,poseDigests,poseDigest,budgetWork,audioWork,
    bvh:{queries:(w?.queryCount??0)-q0,triangleTests:(w?.triangleTests??0)-t0},
    draw:counters.draw,resources:counters.resources,scene:counters.scene,rawCounters:counters.raw,contextLost:G.renderer.getContext().isContextLost()};
}
