import {productionScene} from './shared/production-scene.mjs';
export async function run({prefix,baselinePrefix}){
 const rows=[],metrics=[];let beforeLighting;
 for(const[variant,source]of [['before',baselinePrefix],['after',prefix]]){
  const ctx=await productionScene(source),{api,G,THREE,scene,camera,capture}=ctx,{Actor,Character}=api;
  Object.assign(G,{teamColors:[new THREE.Color('#703be6'),new THREE.Color('#c3d52b')],level:{blocks:[],spawnPads:[new THREE.Vector3(),new THREE.Vector3(0,0,40)],groundHeight:()=>0},paint:{sample:()=>1,splat:()=>0},match:{state:'playing',mode:'turf',playing:()=>true,canRespawn:()=>false},physics:{los:()=>true,groundProbe:(_x,_y,_z,_up,_down,_r,hit)=>{hit.hit=false;return hit;},raycast:(_a,_b,_c,hit)=>{hit.hit=false;return hit;}}});
  G.projectiles=Object.fromEntries(['fireShooter','fireDualies','fireCharger','fireSplatling','fireBlaster','fireSlosh','throwBomb','fireFlick'].map(n=>[n,()=>{}]));
  class FixedCharacter extends Character{constructor(opts){super({...opts,sourceMotion:false});}}
  const a=new Actor({team:0,isLocal:true,name:'Spawner fixed-scale diagnostic',weapon:'shooter',CharacterClass:FixedCharacter,style:{hair:0,hat:0,skin:2,outfit:0,eyes:0}});a.character.actor=a;a.character.onEvent=null;a.pos.set(0,0,0);a.yaw=a.aimYaw=0;G.actors=[a];G.local=a;scene.add(a.character.root);
  a.s3.squidSpawn={phase:'aim',wait:0,initial:false,fireArmed:true,target:{x:0,y:0,z:7.5},transferTargetPending:true};a.update(1/60);
  for(let i=0;i<60;i++){G.time+=1/60;a._finishFrame(1/60);}
  const pod=scene.getObjectByName('s3Spawner');if(!pod)throw Error('Native Actor did not create spawner');scene.getObjectByName('s3SquidSpawnMarker').visible=false;
  document.querySelector('#s3-squid-spawn-prompt')?.remove();const boxes=new THREE.Box3().setFromObject(pod),geos=pod.children.map(m=>m.geometry);
  const metric={variant,meshes:pod.children.length,materials:new Set(pod.children.map(m=>m.material)).size,triangles:geos.reduce((s,g)=>s+(g.index?.count||g.attributes.position.count)/3,0),attributeBytes:geos.reduce((s,g)=>s+Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0)+(g.index?.array.byteLength||0),0),textures:pod.children.flatMap(m=>Object.values(m.material)).filter(v=>v?.isTexture).length,bounds:{min:boxes.min.toArray(),max:boxes.max.toArray()}};
  if(metric.meshes!==5||metric.textures!==0)throw Error('Model batch/texture budget');if(variant==='after'&&metric.triangles>2800)throw Error('Model triangle budget');metrics.push(metric);
  for(const actorVisible of [false,true]){
   a.character.root.visible=actorVisible;
   const target=new THREE.Vector3(0,actorVisible?.55:-.29,actorVisible?0:.09),distance=actorVisible?6.3:3.5;
   for(const[view,dir]of Object.entries({front:[0,.05,1],side:[1,.05,0],back:[0,.05,-1],oblique:[.7,.45,1]})){
    camera.position.copy(target).add(new THREE.Vector3(...dir).normalize().multiplyScalar(distance));camera.lookAt(target);
    const name=variant+'-'+(actorVisible?'native-actor-':'model-')+view,row=await capture(name);rows.push({...row,variant,actorVisible,view});
    if(!beforeLighting)beforeLighting=row.lighting;else if(JSON.stringify(row.lighting)!==JSON.stringify(beforeLighting))throw Error('Unequal native lighting/post state');
   }
  }
  // Repeated frame/update does not replace shared model buffers.
  a.character.root.visible=false;for(let frame=0;frame<180;frame++){G.time+=1/60;a.s3.squidSpawn.transferTargetPending=true;a.update(1/60);}
  if(pod.children.some((m,i)=>m.geometry!==geos[i]))throw Error('Per-frame geometry allocation');
  const originalPosition=pod.position.clone();a.s3.squidSpawn={phase:'flight',t:0,duration:1,from:{x:0,y:0,z:0},to:{x:0,y:0,z:7.5},kidShown:false};a.update(1/60);
  if(!pod.position.equals(originalPosition))throw Error('Spawner travels with flight');
  scene.remove(a.character.root);a.character.dispose();
  // Actual optional Player00 controller, loaded from the same emitted build.
  // Do not force source activity or alter its ownership decisions in spawn aim.
  G.time=0;
  const sa=new Actor({team:0,isLocal:true,name:'Spawner fixed-scale diagnostic',weapon:'shooter',CharacterClass:Character,style:{hair:0,hat:0,skin:2,outfit:0,eyes:0}});
  sa.character.actor=sa;sa.character.onEvent=null;sa.pos.set(0,0,0);sa.yaw=sa.aimYaw=0;G.actors=[sa];G.local=sa;scene.add(sa.character.root);
  sa.s3.squidSpawn={phase:'aim',wait:0,initial:false,fireArmed:true,target:{x:0,y:0,z:7.5},transferTargetPending:true};sa.update(1/60);
  await sa.character._sourceMotionLoader;await sa.character.sourceMotion?.ready;
  if(sa.character.sourceMotion?.status!=='ready')throw Error('Spawner Player00 bank not ready');
  for(let i=0;i<60;i++){G.time+=1/60;sa._finishFrame(1/60);}
  const sourcePod=scene.getObjectByName('s3Spawner');if(!sourcePod)throw Error('Source-loaded Actor did not create spawner');
  scene.getObjectByName('s3SquidSpawnMarker').visible=false;document.querySelector('#s3-squid-spawn-prompt')?.remove();
  if(sourcePod.children.some((mesh,i)=>mesh.geometry!==geos[i]))throw Error('Source Actor did not reuse the five model geometries');
  scene.updateMatrixWorld(true);
  if(!sa.character.sourceMotion.active||sa.character.sourceMotion.variant!=='Player00'||!sa.character.root.visible||!sa.character.kid.visible)throw Error('Source-loaded spawner capture requires the active visible Player00 owner');
  const sourceOwner={variant:sa.character.sourceMotion.variant,status:sa.character.sourceMotion.status,active:!!sa.character.sourceMotion.active,sourceUpper:sa.character.sourceMotion.sourceUpper??null,seed:sa.character.seed,footBones:Object.fromEntries(['footL','footR'].map(name=>[name,sa.character.bones[name].getWorldPosition(new THREE.Vector3()).toArray()])),podBounds:{min:new THREE.Box3().setFromObject(sourcePod).min.toArray(),max:new THREE.Box3().setFromObject(sourcePod).max.toArray()}};
  metric.sourceOwner=sourceOwner;
  for(const[view,dir]of Object.entries({front:[0,.05,1],side:[1,.05,0],back:[0,.05,-1],oblique:[.7,.45,1]})){
    const target=new THREE.Vector3(0,.55,0);camera.position.copy(target).add(new THREE.Vector3(...dir).normalize().multiplyScalar(6.3));camera.lookAt(target);
    const row=await capture(variant+'-source-loaded-actor-'+view);rows.push({...row,variant,actorVisible:true,view,sourceOwner});
    if(JSON.stringify(row.lighting)!==JSON.stringify(beforeLighting))throw Error('Unequal source/native lighting/post state');
  }
  scene.remove(sa.character.root);sa.character.dispose();ctx.dispose();
 }
 return{status:'passed',expectedFrames:24,rows,metrics,scope:'Actual composed Actor creates both models, with native fallback and real same-build Player00 source-loaded owners; fixed native Environment and complete Renderer post stack. Historical module overlay only. Full match and Nintendo runtime timing are separate.'};
}
