import {productionScene} from './shared/production-scene.mjs';
const assert=(value,message)=>{if(!value)throw Error(message);};
const stage={id:'clam-native-qa',clams:{spawns:[],goals:[[0,0,8],[0,0,-18]]}};
export async function run({prefix,baselinePrefix}){
 const rows=[],metrics=[];let beforeLighting;
 for(const [variant,source] of [['before',baselinePrefix],['after',prefix]]){
  const ctx=await productionScene(source),{api,G,THREE,scene,camera,capture}=ctx,{Actor,Character,Physics}=api;
  const [{RankedWorld},{RankedEngine},{Match},{bombMotionSnapshot,bombReleasePosition}]=await Promise.all([
   import(source+'patches/splatoon3/runtime/ranked/world.mjs'),import(source+'patches/splatoon3/runtime/ranked/engine.mjs'),
   import(source+'src/game/match.js'),import(source+'patches/splatoon3/runtime/bomb-motion.mjs')]);
  G.teamColors=[new THREE.Color('#703be6'),new THREE.Color('#c3d52b')];
  G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};
  G.physics=new Physics(G.level);G.paint={sample:()=>1,splat:()=>0};G.audio={play(){}};
  let projectileCalls=0;G.projectiles=Object.fromEntries(['fireShooter','fireDualies','fireCharger','fireSplatling','fireBlaster','fireSlosh','throwBomb','fireFlick'].map(n=>[n,()=>projectileCalls++]));
  class FixedCharacter extends Character{constructor(opts){super({...opts,sourceMotion:false});}}
  const actor=new Actor({team:0,isLocal:true,name:'Clam fixed-scale diagnostic',weapon:'shooter',CharacterClass:FixedCharacter,style:{hair:0,hat:0,skin:2,outfit:0,eyes:0}});
  actor.nid='player';actor.character.actor=actor;actor.character.onEvent=null;actor.pos.set(0,0,0);actor.yaw=actor.aimYaw=0;actor.grounded=true;actor.ground.hit=true;G.actors=[actor];G.local=actor;scene.add(actor.character.root);
  const engine=new RankedEngine('clams',stage),rule=engine.rule,match=G.match={mode:'clams',state:'playing',ranked:engine,actors:[actor],playing:()=>true,rankedGains:[0,0],rankedEffects:{event(){}}};
  const world=match.rankedWorld=new RankedWorld(api,match,stage),floor=new THREE.Mesh(new THREE.PlaneGeometry(10,10),new THREE.MeshStandardMaterial({color:0x70777f,roughness:.9}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.005;scene.add(floor);
  const metric={variant,release:[],ground:[],load:{}};metrics.push(metric);
  const physics=()=>JSON.stringify({pos:actor.pos.toArray(),vel:actor.vel.toArray(),hp:actor.hp,ink:actor.ink,special:actor.special,alive:actor.alive,weapon:actor.weapon.id});
  const update=(dt=0)=>{const before=JSON.stringify(engine.snapshot());world.update(engine,dt);assert(JSON.stringify(engine.snapshot())===before,'Presentation mutated rules');};
  const view=(target,direction,distance)=>{camera.position.copy(new THREE.Vector3(...target)).add(new THREE.Vector3(...direction).normalize().multiplyScalar(distance));camera.lookAt(...target);};
  const save=async(name,extra={})=>{const row=await capture(variant+'-'+name);rows.push({...row,variant,...extra});if(!beforeLighting)beforeLighting=row.lighting;else assert(JSON.stringify(row.lighting)===JSON.stringify(beforeLighting),'Unequal native lighting/post');};
  const baskets=visible=>world.baskets.forEach((b,i)=>b.marker.visible=visible&&i===0);
  for(let i=0;i<60;i++){G.time+=1/60;actor._finishFrame(1/60);}
  baskets(false);
  for(const [kind,count] of [['small',1],['small',7],['power',1]]){
   rule.state.inventories.player={team:0,small:kind==='small'?count:0,power:kind==='power'};update();
   for(const [label,dir] of [['side',[1,.2,0]],['rear-oblique',[.8,.5,-1]]]){view([0,.72,-.15],dir,5.1);await save(`carry-${kind}-${count}-${label}`,{kind,count,view:label});}
  }
  rule.state.inventories={};update();
  for(const kind of ['small','power']){
   const c=rule._newClam(kind,0,[.8,0,0]);update();const mesh=world._clamMarkers.get(c.id).mesh;
   const bounds=new THREE.Box3().setFromObject(mesh);metric.ground.push({kind,min:bounds.min.toArray(),max:bounds.max.toArray(),scale:mesh.scale.toArray()});
   if(variant==='after')assert(bounds.min.y>=-.002,'Clam penetrates the floor');view([.3,.65,0],[.8,.35,1],5.1);await save('ground-'+kind,{kind});
   rule.state.clams=[];update();
  }
  actor.character.root.visible=false;
  for(const kind of ['small','power'])for(const [label,v]of [['ascending',[3,3,5]],['descending',[-3,-3,-5]]]){
   const c=rule._newClam(kind,0,[0,.7,0],{grounded:false,velocity:v,age:.2});update();view([0,.7,0],[.4,.2,1],kind==='power'?4.2:2.6);await save('flight-'+kind+'-'+label,{kind,velocity:v});rule.state.clams=[];update();
  }
  actor.character.root.visible=true;rule.state.inventories.player={team:0,small:0,power:true};update();view([0,.95,.3],[1,.15,1],5.1);
  const handBefore=actor.character.bones.handL.getWorldPosition(new THREE.Vector3());metric.preReleaseHand=handBefore.toArray();await save('release-before',{t:'pre-event'});
  const physical=physics();assert(rule._throw({id:'player',team:0,alive:true,pos:actor.pos.toArray()},{aim:[0,0,1]},{actors:[],floorAt:()=>0}),'Throw rejected');
  Match.prototype.playRankedEvents.call(match,engine.events.splice(0));assert(physics()===physical,'Throw presentation changed actor gameplay');
  const clam=rule.state.clams.at(-1),origin=[...clam.pos],velocity=[...clam.velocity];
  const sampled=bombReleasePosition(actor,new THREE.Vector3(...origin));metric.sampledRelease=sampled.toArray();
  let previous=0;
  for(const t of [0,1/60,2/60,.05,.15,.30,.52]){
   while(previous<t-1e-10){const dt=Math.min(1/60,t-previous);previous+=dt;G.time+=dt;actor._finishFrame(dt);engine.update(dt,{actors:[],inputs:{},floorAt:()=>0,blocked:()=>false});update(dt);}update();
   actor.character.root.updateMatrixWorld(true);const mesh=world._clamMarkers.get(clam.id).mesh,hand=new THREE.Vector3().setFromMatrixPosition(actor.character.bones.handL.matrixWorld);
   if(variant==='after'&&t===0)assert(hand.distanceTo(new THREE.Vector3(...origin).add(new THREE.Vector3(0,-.255*1.2,0)))<.02,'No event-frame grip');
   if(t===0)metric.eventFrameHandJump=hand.distanceTo(handBefore);
   metric.release.push({t,hand:hand.toArray(),model:mesh.position.toArray(),rule:[...clam.pos],motion:bombMotionSnapshot(actor.character)});
   await save('release-'+Math.round(t*1000)+'ms',{t});
  }
  assert(projectileCalls===0,'Clam animation spawned a weapon projectile');rule.state.clams=[];rule.state.inventories={};update();
  actor.setWeapon('dualies');for(let i=0;i<60;i++){G.time+=1/60;actor._finishFrame(1/60);}
  const leftBefore=actor.character.getMuzzleHand(new THREE.Vector3(),1);
  rule.state.inventories.player={team:0,power:true,small:0};update();
  rule._throw({id:'player',team:0,alive:true,pos:actor.pos.toArray()},{aim:[0,0,1]},{actors:[],floorAt:()=>0});
  Match.prototype.playRankedEvents.call(match,engine.events.splice(0));update();
  metric.dualies={armOverlayDeferred:!actor.character.s3ClamGripActive,leftMuzzleDifference:leftBefore.distanceTo(actor.character.getMuzzleHand(new THREE.Vector3(),1))};
  if(variant==='after')assert(metric.dualies.armOverlayDeferred&&metric.dualies.leftMuzzleDifference===0,'Deferred Dualies arm must preserve its visible shot origin');
  await save('dualies-release-0ms');rule.state.clams=[];rule.state.inventories={};update();actor.character.root.visible=false;floor.visible=false;baskets(true);
  const basket=rule.state.baskets[0];view([0,.8,8],[.6,.15,-1],10);
  const barrierViews=async label=>{for(const [viewName,dir]of [['front',[0,.15,-1]],['back',[0,.15,1]]]){view([0,.8,8],dir,10);await save(label+'-'+viewName,{view:viewName});}view([0,.8,8],[.6,.15,-1],10);};
  basket.barrierOpen=false;basket.pendingBreak=null;update();await save('barrier-closed');await barrierViews('barrier-closed');
  const gate=world.baskets[0].gate,gateMask=gate.layers.mask,cameraMask=camera.layers.mask;
  const gateVisible=gate.visible,gateMaterial=gate.material,singlePass=gateMaterial.forceSinglePass,materialSide=gateMaterial.side;
  const drawGate=()=>{ctx.renderer.info.reset();ctx.renderer.render(scene,camera);return ctx.renderer.info.render.calls;};
  metric.barrierDrawIsolation={transparent:gateMaterial.transparent,side:materialSide,forceSinglePass:singlePass,instances:gate.count??1};
  try{
   gate.layers.set(31);camera.layers.set(31);gate.visible=false;
   metric.barrierDrawIsolation.hidden=drawGate();assert(metric.barrierDrawIsolation.hidden===0,'A non-barrier draw contaminated isolation');
   gate.visible=true;metric.barrierDrawCalls=metric.barrierDrawIsolation.shown=drawGate();
   assert(metric.barrierDrawCalls===1,'Barrier must render in one pass, including transparent DoubleSide');
   if(variant==='after'){
    assert(gateMaterial.transparent&&gateMaterial.side===THREE.DoubleSide&&singlePass===true,'Unexpected barrier material');
    gateMaterial.forceSinglePass=false;metric.barrierDrawIsolation.twoPassNegative=drawGate();
    assert(metric.barrierDrawIsolation.twoPassNegative===2,'forceSinglePass negative did not expose both transparent passes');
   }
  }finally{gate.visible=gateVisible;gateMaterial.forceSinglePass=singlePass;gateMaterial.side=materialSide;gate.layers.mask=gateMask;camera.layers.mask=cameraMask;}
  basket.pendingBreak={remaining:.5,pos:[0,.55,7],sequence:1};update();await save('barrier-drilling');await barrierViews('barrier-drilling');
  basket.pendingBreak=null;basket.barrierOpen=true;update();await save('barrier-break-start');update(.18);await save('barrier-break-spread');await barrierViews('barrier-break-spread');update(.38);await save('barrier-open');
  basket.barrierOpen=false;update();await save('barrier-reclosed');
  // Also exercise the actual optional Player00 source owner, with its real
  // same-build coefficient bank loaded; fixed rig above isolates comparisons.
  baskets(false);floor.visible=true;
  const sourceActor=new Actor({team:0,isLocal:true,name:'Clam source-loaded diagnostic',weapon:'shooter',CharacterClass:Character,style:{hair:0,hat:0,skin:2,outfit:0,eyes:0}});
  sourceActor.nid='source-player';sourceActor.character.actor=sourceActor;sourceActor.character.onEvent=null;sourceActor.grounded=true;sourceActor.ground.hit=true;
  G.actors=match.actors=[sourceActor];G.local=sourceActor;scene.add(sourceActor.character.root);
  await sourceActor.character._sourceMotionLoader;if(sourceActor.character.sourceMotion?.ready)await sourceActor.character.sourceMotion.ready;
  assert(sourceActor.character.sourceMotion?.status==='ready','Player00 bank not loaded');
  for(let i=0;i<60;i++){G.time+=1/60;sourceActor._finishFrame(1/60);}
  rule.state.inventories={'source-player':{team:0,power:true,small:0}};update();
  rule._throw({id:'source-player',team:0,alive:true,pos:sourceActor.pos.toArray()},{aim:[0,0,1]},{actors:[],floorAt:()=>0});
  Match.prototype.playRankedEvents.call(match,engine.events.splice(0));update();view([0,.95,.3],[1,.15,1],5.1);await save('source-release-0ms');
  G.time+=.1;sourceActor._finishFrame(.1);engine.update(.1,{actors:[],inputs:{},floorAt:()=>0,blocked:()=>false});update(.1);await save('source-release-100ms');
  metric.sourceOwner={status:sourceActor.character.sourceMotion.status,active:sourceActor.character.sourceMotion.active};
  // Rear-view reference diagnostic. Nintendo JP is 16:9 with unknown camera
  // intrinsics; this keeps the suite's 900-square contract. Actual inputs only.
  const {Level}=await import(source+'src/world/level.js');
  G.level=new Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});
  G.physics=new Physics(G.level);match.canRespawn=()=>false;match.rankedEffects.update=()=>{};match.rankedBarrierHits=[];
  match.playRankedEvents=events=>Match.prototype.playRankedEvents.call(match,events);
  rule.state.clams=[];rule.state.inventories={};update();
  sourceActor.pos.set(0,0,0);sourceActor.vel.set(0,0,0);sourceActor.grounded=sourceActor.ground.hit=true;sourceActor.ground.block=0;sourceActor.groundN.set(0,1,0);sourceActor.aimPitch=.6;
  const rearTick=()=>{G.time+=1/60;sourceActor.update(1/60);Match.prototype.advanceRanked.call(match,1/60);};
  for(let i=0;i<45;i++)rearTick();
  rule.state.inventories['source-player']={team:0,power:true,small:0};update();
  sourceActor.intent.jump=true;rearTick();sourceActor.intent.jump=false;
  let jumpTicks=1;while(sourceActor.vel.y>0&&jumpTicks<90){rearTick();jumpTicks++;}
  assert(!sourceActor.grounded&&sourceActor.vel.y<=0&&jumpTicks<90,'Rear diagnostic requires the real descending jump');
  const rearOrigin=sourceActor.pos.clone();camera.fov=82;camera.updateProjectionMatrix();
  camera.position.copy(rearOrigin).add(new THREE.Vector3(0,.3,-3.25));camera.lookAt(rearOrigin.clone().add(new THREE.Vector3(0,1.25,0)));camera.updateMatrixWorld(true);
  metric.rearReference={cameraScope:'Rear 900-square, FOV82; not recovered Nintendo intrinsics or matched 16:9 framing',aimPitch:.6,jumpTicks,rows:[]};
  const rearSave=async(label,eventRelativeTime)=>{
   sourceActor.character.root.updateMatrixWorld(true);camera.updateMatrixWorld(true);
   const point=v=>{const view=v.clone().applyMatrix4(camera.matrixWorldInverse),ndc=v.clone().project(camera);return{world:v.toArray(),cameraDepth:-view.z,pixel:[(ndc.x+1)*450,(1-ndc.y)*450]};};
   const ch=sourceActor.character,head=point(ch.bones.head.localToWorld(new THREE.Vector3(0,.164,.014))),hands={};
   for(const side of ['L','R'])hands[side]=point(ch.bones['hand'+side].getWorldPosition(new THREE.Vector3()));
   const c=rule.state.clams.at(-1),inventory=world._inventoryMarkers.get('source-player'),ball=c?point(new THREE.Vector3(...c.pos)):point(inventory.getWorldPosition(new THREE.Vector3()));
   const extra={eventRelativeTime,head,hands,ball,headMinusBallDepth:head.cameraDepth-ball.cameraDepth,actor:{pos:sourceActor.pos.toArray(),vel:sourceActor.vel.toArray(),aimPitch:sourceActor.aimPitch},ballState:c?{pos:[...c.pos],velocity:[...c.velocity],age:c.age}:null};
   metric.rearReference.rows.push(extra);await save('jp-rear-'+label,extra);
  };
  await rearSave('pre-2',-2/60);rearTick();await rearSave('pre-1',-1/60);
  sourceActor.intent.throw=true;rearTick();sourceActor.intent.throw=false;
  assert(rule.state.clams.at(-1)?.kind==='power','Actual input did not release a power clam');
  await rearSave('0ms',0);rearTick();await rearSave('17ms',1/60);rearTick();await rearSave('33ms',2/60);
  assert(projectileCalls===0,'Rear diagnostic spawned an unrelated weapon projectile');
  sourceActor.character.dispose();scene.remove(sourceActor.character.root);G.actors=match.actors=[actor];G.local=actor;rule.state.clams=[];rule.state.inventories={};update();
  const geometry=world.powerClamResources.geometry,material=world.powerClamResources.material,gateGeometry=world.baskets[0].gate.geometry;
  const start=performance.now();
  for(let i=0;i<200;i++){const c=rule._newClam('power',0,[0,0,0]);update(1/60);c.expiresIn=.001;rule._expireAndAge(.002);update(1/60);}
  metric.load={cycles:200,cpuMs:performance.now()-start,markerCache:world._clamMarkers.size,children:world.clamsGroup.children.length,geometryReused:geometry===world.powerClamResources.geometry,materialReused:material===world.powerClamResources.material,barrierGeometryReused:gateGeometry===world.baskets[0].gate.geometry};
  assert(metric.load.geometryReused&&metric.load.materialReused&&metric.load.barrierGeometryReused,'Resource replaced');if(variant==='after')assert(metric.load.markerCache<=48,'Unbounded marker cache');
  world.dispose();actor.character.dispose();floor.geometry.dispose();floor.material.dispose();ctx.dispose();
 }
 return{status:'passed',expectedFrames:80,rows,metrics,contactSheets:['before','after'].map(variant=>({name:variant+'-clam-release-sequence',frames:['release-before','release-0ms','release-17ms','release-33ms'].map(name=>({name:variant+'-'+name}))})),scope:'Ten additional rear-view frames use real jump/throw input and head/ball depth receipts at FOV82 in 900-square output; Nintendo camera intrinsics, input timing and 16:9 framing are not recovered. Native installed Actor/RankedWorld and production Environment/PMREM/Renderer post. Before overlays three main3839 ranked modules plus bomb-motion and the shared final handoff owner (five modules total), not an entire historical build. Scale and break-tail are provisional visual calibration, not retail dimensions/timing; pre-event/event/1-frame/2-frame hand rows expose contact jumps and release residual instead of claiming exact retail motion. Dualies arm presentation is deferred to preserve both visible shot origins until its retail throw/stow rules are established.'};
}
