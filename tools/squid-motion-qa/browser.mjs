import * as THREE from 'three';
import {createProductionLighting,PRODUCTION_LIGHTING_CONFIG} from './lighting.mjs';
import {CLIP,driveInput} from './timeline.mjs';
export async function run({prefix,mode='live'}){
 const progress=globalThis.__headgearQA={stage:'continuous-init'};
 const {install}=await import(prefix+'patches/splatoon3/runtime/install.mjs');
 const api=install(await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json()));const {Character,Actor,G}=api;
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(CLIP.size,CLIP.size);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=.94;document.body.appendChild(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(CLIP.fov,1,.01,5000);Object.assign(G,{scene,camera,renderer,settings:{quality:'high',shadows:false},mode:'match',actors:[],time:0});
 const {Environment}=await import(prefix+'src/world/environment.js'),env=createProductionLighting(Environment,renderer,scene);G.env=env;
 const lightingReceipt={config:PRODUCTION_LIGHTING_CONFIG,exposure:renderer.toneMappingExposure,environmentIntensity:scene.environmentIntensity,sun:{color:env.sun.color.toArray(),intensity:env.sun.intensity,position:env.sun.position.toArray()}};
 G.teamColors=[new THREE.Color(0xe6e900),new THREE.Color(0x6340db)];G.level={blocks:[],groundHeight:()=>0};G.paint={sample:()=>1,splat:()=>0};G.match={playing:()=>true,canRespawn:()=>false};G.physics={los:()=>true,raycast:(_a,_b,_c,hit)=>{hit.hit=false;return hit;}};G.projectiles=Object.fromEntries(['fireShooter','fireDualies','fireCharger','fireSplatling','fireBlaster','fireSlosh','throwBomb','fireFlick'].map(n=>[n,()=>{}]));
 const target=new THREE.Vector3(),offset=new THREE.Vector3(0,.55,-2).normalize().multiplyScalar(CLIP.distance),dt=1/CLIP.simulationHz;
 async function make(){
  G.time=0;
  class SourceCharacter extends Character{constructor(opts){super({...opts,sourceMotion:true});}}
  const a=new Actor({team:0,isLocal:true,name:'squid-continuous-qa',weapon:'shooter',CharacterClass:SourceCharacter,style:{hair:0,hat:0,skin:2,outfit:0,eyes:0}}),ch=a.character;ch.actor=a;ch.onEvent=null;scene.add(ch.root);G.actors=[a];a.grounded=a.ground.hit=true;
  await ch._sourceMotionLoader;await ch.sourceMotion?.ready;if(ch.sourceMotion?.status!=='ready')throw Error('Continuous source bank not ready');
  for(let i=0;i<60;i++){G.time+=dt;a._finishFrame(dt);}a.form='squid';a.submerged=false;for(let i=0;i<60;i++){G.time+=dt;a._finishFrame(dt);}ch.root.updateMatrixWorld(true);
  return {a,ch,ticks:0,previous:'dry',jumpVelocity:0};
 }
 function advance(s,toTick){
  while(s.ticks<toTick){const t=s.ticks*dt,{a,ch}=s;driveInput(s,t,dt);G.time+=dt;a._finishFrame(dt);ch.root.updateMatrixWorld(true);s.ticks++;}

 }
 function frameCamera(ch){target.copy(ch.root.position);target.y+=CLIP.centerY;camera.position.copy(target).add(offset);camera.lookAt(target);camera.updateMatrixWorld(true);}
 const state=await make();frameCamera(state.ch);await renderer.compileAsync(scene,camera);renderer.render(scene,camera);renderer.getContext().finish();
 if(mode==='sampled'){
  // Every output frame is actual runtime state after two 60 Hz ticks. Wall time
  // is deliberately independent; this proves trajectory, not real-time FPS.
  const frames=[],coverage=[],p=new THREE.Vector3(),start=performance.now();
  for(let i=0;i<CLIP.duration*CLIP.fps;i++){
   const tick=(i+1)*CLIP.simulationHz/CLIP.fps,beforeAdvance=performance.now();advance(state,tick);const afterAdvance=performance.now();frameCamera(state.ch);
   renderer.render(scene,camera);renderer.getContext().finish();const afterRender=performance.now();
   const data=renderer.domElement.toDataURL('image/png'),afterReadback=performance.now();
   let count=0,maxX=0,maxY=0;state.ch.root.traverseVisible(o=>{if(!o.isMesh||!o.geometry?.attributes.position)return;const mats=Array.isArray(o.material)?o.material:[o.material];if(mats.every(m=>!m.visible||m.opacity===0))return;for(let j=0;j<o.geometry.attributes.position.count;j++){o.getVertexPosition(j,p);p.applyMatrix4(o.matrixWorld).project(camera);if(p.z< -1||p.z>1)throw Error('Sampled depth clipping');maxX=Math.max(maxX,Math.abs(p.x));maxY=Math.max(maxY,Math.abs(p.y));count++;}});
   if(maxX>.98||maxY>.98)throw Error('Sampled frame clipping '+JSON.stringify({frame:i,maxX,maxY}));
   const afterCoverage=performance.now();await globalThis.__saveSquidFrame(i,data);const afterSave=performance.now(),debug=state.ch.sourceMotion?.debug?.squid;
   frames.push({frame:i,wallMs:afterSave-start,simulationMs:tick*1000/CLIP.simulationHz,ticks:tick,state:state.previous,form:state.ch.form,grounded:state.a.grounded,position:state.a.pos.toArray(),sourceDebug:debug?{...debug}:null,sourceActive:!!state.ch.sourceMotion?.active,formBlend:{kid:state.ch.kidScale,squid:state.ch.sqScale,sourceTime:state.ch.sourceMotion?.formTime,sourceDuration:state.ch.sourceMotion?.formDuration,pivotPosition:state.ch.squid.pivot.position.toArray(),pivotQuaternion:state.ch.squid.pivot.quaternion.toArray()},uLook:state.ch.u.uLook.value.toArray(),advanceMs:afterAdvance-beforeAdvance,renderMs:afterRender-afterAdvance,readbackMs:afterReadback-afterRender,coverageMs:afterCoverage-afterReadback,saveMs:afterSave-afterCoverage});coverage.push({frame:i,count,maxX,maxY});progress.stage='sampled-capture';progress.frames=frames.length;
  }
  const distinct=[...new Set(frames.map(f=>f.state))];for(const name of ['dry','jump','land','swim','turn90','turn180','stop','emerge'])if(!distinct.includes(name))throw Error('Missing sampled state '+name);
  scene.remove(state.ch.root);state.ch.dispose();G.actors=[];scene.environment=null;env.dispose();renderer.dispose();
  return {status:'sampled-native-awaiting-review',mode,scope:'Actual emitted Actor, uniform 30fps simulation samples for 1x trajectory playback. Offline capture; NOT real-time performance or achieved-FPS proof.',clipConfig:CLIP,frames,coverage,lightingReceipt,states:distinct,pacing:{nominalPlaybackFPS:CLIP.fps,simulationDurationMs:8000,elapsedWallMs:performance.now()-start,smoothnessReviewEligible:false,trajectoryReviewEligible:true}};
 }
 if(!globalThis.MediaRecorder||!renderer.domElement.captureStream)throw Error('Native canvas video recording unavailable');
 const mime=['video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw Error('No native WebM encoder');
 const stream=renderer.domElement.captureStream(CLIP.fps),recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4500000}),chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
 const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=e=>reject(Error(e.error?.message||'Video encoder error'));});
 const started=new Promise(resolve=>{recorder.onstart=resolve;});recorder.start();await started;
 const start=performance.now(),initialDebug=state.ch.sourceMotion?.debug?.squid,frames=[{frame:0,wallMs:0,presentedWallMs:0,simulationMs:0,ticks:0,state:'dry',form:state.ch.form,grounded:state.a.grounded,position:state.a.pos.toArray(),sourceDebug:initialDebug?{...initialDebug}:null,sourceActive:!!state.ch.sourceMotion?.active,formBlend:{kid:state.ch.kidScale,squid:state.ch.sqScale,sourceTime:state.ch.sourceMotion?.formTime,sourceDuration:state.ch.sourceMotion?.formDuration,pivotPosition:state.ch.squid.pivot.position.toArray(),pivotQuaternion:state.ch.squid.pivot.quaternion.toArray()},uLook:state.ch.u.uLook.value.toArray(),renderMs:0}];let last=0;
 progress.stage='continuous-recording';
 while(true){
  await new Promise(requestAnimationFrame);const now=performance.now(),wallMs=now-start;
  if(wallMs-last<1000/CLIP.fps-1)continue;
  const ticks=Math.min(Math.floor(wallMs*CLIP.simulationHz/1000),CLIP.duration*CLIP.simulationHz);advance(state,ticks);frameCamera(state.ch);
  const beforeRender=performance.now();renderer.render(scene,camera);renderer.getContext().finish();const afterRender=performance.now();
  const debug=state.ch.sourceMotion?.debug?.squid;
  frames.push({frame:frames.length,wallMs,presentedWallMs:afterRender-start,simulationMs:state.ticks*1000/CLIP.simulationHz,ticks:state.ticks,state:state.previous,form:state.ch.form,grounded:state.a.grounded,position:state.a.pos.toArray(),sourceDebug:debug?{...debug}:null,sourceActive:!!state.ch.sourceMotion?.active,formBlend:{kid:state.ch.kidScale,squid:state.ch.sqScale,sourceTime:state.ch.sourceMotion?.formTime,sourceDuration:state.ch.sourceMotion?.formDuration,pivotPosition:state.ch.squid.pivot.position.toArray(),pivotQuaternion:state.ch.squid.pivot.quaternion.toArray()},uLook:state.ch.u.uLook.value.toArray(),renderMs:afterRender-beforeRender});last=wallMs;
  progress.frames=frames.length;progress.wallMs=wallMs;
  if(wallMs>=CLIP.duration*1000)break;
 }
 recorder.stop();await stopped;for(const track of stream.getTracks())track.stop();
 const blob=new Blob(chunks,{type:mime}),data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
 await globalThis.__saveSquidClip('source-continuous',data);
 scene.remove(state.ch.root);state.ch.dispose();G.actors=[];
 // Replay the recorded simulation ticks after encoding, so exhaustive posed bounds
 // checks cannot introduce stalls into the video whose smoothness is being assessed.
 progress.stage='continuous-coverage-replay';const replay=await make(),coverage=[],p=new THREE.Vector3();
 for(const frame of frames){advance(replay,frame.ticks);frameCamera(replay.ch);let count=0,maxX=0,maxY=0;
  replay.ch.root.traverseVisible(o=>{if(!o.isMesh||!o.geometry?.attributes.position)return;const mats=Array.isArray(o.material)?o.material:[o.material];if(mats.every(m=>!m.visible||m.opacity===0))return;for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,p);p.applyMatrix4(o.matrixWorld).project(camera);if(p.z< -1||p.z>1)throw Error('Continuous depth clipping');maxX=Math.max(maxX,Math.abs(p.x));maxY=Math.max(maxY,Math.abs(p.y));count++;}});
  if(maxX>.98||maxY>.98)throw Error('Continuous frame clipping '+JSON.stringify({frame:frame.frame,maxX,maxY}));
  const debug=replay.ch.sourceMotion?.debug?.squid;if(JSON.stringify(debug?{...debug}:null)!==JSON.stringify(frame.sourceDebug))throw Error('Continuous replay source-state mismatch at '+frame.frame);
  coverage.push({frame:frame.frame,count,maxX,maxY});
 }
 const gaps=frames.slice(1).map((f,i)=>f.presentedWallMs-frames[i].presentedWallMs).sort((a,b)=>a-b),elapsed=frames.at(-1).presentedWallMs-frames[0].presentedWallMs,achievedFPS=(frames.length-1)*1000/elapsed;
 const pacing={nominalFPS:CLIP.fps,achievedFPS,medianGapMs:gaps[Math.floor(gaps.length*.5)],p95GapMs:gaps[Math.floor(gaps.length*.95)],maxGapMs:gaps.at(-1),elapsedWallMs:elapsed,simulationDurationMs:CLIP.duration*1000,smoothnessReviewEligible:achievedFPS>=24&&gaps[Math.floor(gaps.length*.95)]<=70};
 const distinct=[...new Set(frames.map(f=>f.state))];for(const s of ['dry','jump','land','swim','turn90','turn180','stop','emerge'])if(!distinct.includes(s))throw Error('Missing continuous state '+s);
 scene.remove(replay.ch.root);replay.ch.dispose();G.actors=[];scene.environment=null;env.dispose();renderer.dispose();
 return {status:'continuous-native-awaiting-review',scope:'actual emitted Actor with driven input; source bank, production lighting, fixed camera; live wall-clock WebM at1x,60Hz simulation catch-up, no animation overrides; not full match physics',clipConfig:CLIP,mime,frames,pacing,coverage,lightingReceipt,states:distinct};
}
