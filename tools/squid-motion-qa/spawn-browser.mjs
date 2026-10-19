import * as THREE from 'three';
import {createProductionLighting,PRODUCTION_LIGHTING_CONFIG} from './lighting.mjs';
import {SPAWN_CLIP as CLIP} from './spawn-config.mjs';
// Real Actor.update drives the shipped spawn lifecycle on a bounded test floor.
// The camera follows the actor; no form, pose, clip or flight clock is overridden.
export async function run({prefix,mode}){
 if(mode!=='sampled')throw Error('Spawn QA requires uniform sampled mode');
 const progress=globalThis.__headgearQA={stage:'spawn-init'};
 const {install}=await import(prefix+'patches/splatoon3/runtime/install.mjs');
 const api=install(await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json()));
 const {Actor,Character,Physics,Projectiles,G}=api;
 const {Level}=await import(prefix+'src/world/level.js');
 const {Environment}=await import(prefix+'src/world/environment.js');
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(CLIP.size,CLIP.size);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=.94;document.body.appendChild(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(CLIP.fov,1,.01,5000);
 Object.assign(G,{scene,camera,renderer,settings:{quality:'high',shadows:false},mode:'match',actors:[],time:0});
 const env=createProductionLighting(Environment,renderer,scene);G.env=env;
 const lightingReceipt={config:PRODUCTION_LIGHTING_CONFIG,exposure:renderer.toneMappingExposure,environmentIntensity:scene.environmentIntensity,sun:{color:env.sun.color.toArray(),intensity:env.sun.intensity,position:env.sun.position.toArray()}};
 G.teamColors=[new THREE.Color(0xe6e900),new THREE.Color(0x6340db)];
 G.level=new Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});
 G.physics=new Physics(G.level);G.paint={sample:()=>1,splat:()=>0};G.projectiles=new Projectiles(scene);
 const frames=[],coverage=[],target=new THREE.Vector3(),offset=new THREE.Vector3(.7,.55,-2).normalize().multiplyScalar(CLIP.distance),p=new THREE.Vector3(),dt=1/60,start=performance.now();
 for(const source of [true,false]){
  G.match={mode:'turf',opts:{},state:'playing',playing:()=>true,canRespawn:()=>true};
  const random=Math.random;let a;
  try{Math.random=()=>.4;a=new Actor({team:0,isLocal:true,name:'spawn-curve-qa',weapon:'shooter',CharacterClass:Character,style:{hair:0,hat:0,skin:2,outfit:0,eyes:0}});}finally{Math.random=random;}
  const ch=a.character;ch.actor=a;ch.onEvent=null;scene.add(ch.root);G.actors=[a];a.pos.set(0,0,0);a.grounded=a.ground.hit=true;a.ground.block=0;a.groundN.set(0,1,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,1,20);
  await ch._sourceMotionLoader;await ch.sourceMotion?.ready;if(ch.sourceMotion?.status!=='ready')throw Error('Spawn source bank not ready');if(!source)ch.sourceMotion.setEnabled(false);
  a.slot=0;a.alive=false;
  try{Math.random=()=>.4;a.respawn();}finally{Math.random=random;}
  if(a.s3.squidSpawn?.phase!=='aim')throw Error('Actual spawn aim not entered');
  for(let i=0;i<60;i++){
   const beforeAdvance=performance.now();
   for(let j=0;j<2;j++){if(i===15&&j===0)a.intent.fire=true;G.time+=dt;a.update(dt);ch.root.updateMatrixWorld(true);ch.skeleton.update();}
   const afterAdvance=performance.now();target.copy(ch.root.position);target.y+=CLIP.centerY;camera.position.copy(target).add(offset);camera.lookAt(target);camera.updateMatrixWorld(true);
   renderer.render(scene,camera);renderer.getContext().finish();const afterRender=performance.now(),data=renderer.domElement.toDataURL('image/png'),afterReadback=performance.now();
   let count=0,maxX=0,maxY=0;ch.root.traverseVisible(o=>{if(!o.isMesh||!o.geometry?.attributes.position)return;const mats=Array.isArray(o.material)?o.material:[o.material];if(mats.every(m=>!m.visible||m.opacity===0))return;for(let k=0;k<o.geometry.attributes.position.count;k++){o.getVertexPosition(k,p);p.applyMatrix4(o.matrixWorld).project(camera);if(p.z< -1||p.z>1)throw Error('Spawn depth clipping');maxX=Math.max(maxX,Math.abs(p.x));maxY=Math.max(maxY,Math.abs(p.y));count++;}});
   if(maxX>.98||maxY>.98)throw Error('Spawn frame clipping '+JSON.stringify({source,i,maxX,maxY}));
   const afterCoverage=performance.now(),frame=frames.length;await globalThis.__saveSquidFrame(frame,data);const afterSave=performance.now(),spawn=a.s3.squidSpawn,debug=ch.sourceMotion?.debug?.squid;
   const state=(source?'source':'fallback')+'-'+(spawn?.phase||'landed');
   frames.push({frame,wallMs:afterSave-start,simulationMs:(frame+1)*1000/30,ticks:(frame+1)*2,segmentMs:(i+1)*1000/30,state,sourceEnabled:source,form:a.form,grounded:a.grounded,position:a.pos.toArray(),velocity:a.vel.toArray(),invuln:Number.isFinite(a.invuln)?a.invuln:String(a.invuln),spawn:spawn?{phase:spawn.phase,t:spawn.t,duration:spawn.duration}:null,sourceDebug:debug?{...debug}:null,sourceActive:!!ch.sourceMotion?.active,formBlend:{kid:ch.kidScale,squid:ch.sqScale,sourceTime:ch.sourceMotion?.formTime,sourceDuration:ch.sourceMotion?.formDuration},advanceMs:afterAdvance-beforeAdvance,renderMs:afterRender-afterAdvance,readbackMs:afterReadback-afterRender,coverageMs:afterCoverage-afterReadback,saveMs:afterSave-afterCoverage});coverage.push({frame,count,maxX,maxY});progress.stage='spawn-capture';progress.frames=frames.length;
  }
  scene.remove(ch.root);ch.dispose();G.actors=[];G.projectiles.clear();
 }
 const states=[...new Set(frames.map(f=>f.state))];scene.environment=null;env.dispose();renderer.dispose();
 return {status:'sampled-spawn-awaiting-review',mode,scenario:'spawn',scope:'Actual emitted Actor spawn lifecycle, source and fallback; offline30fps trajectory on a bounded floor, not full-match or performance proof.',clipConfig:CLIP,frames,coverage,lightingReceipt,states,pacing:{nominalPlaybackFPS:30,simulationDurationMs:4000,elapsedWallMs:performance.now()-start,smoothnessReviewEligible:false,trajectoryReviewEligible:true}};
}
