// Actual delivered Actor/Character/RankedWorld presentation. Characters run the
// normal mounted update path: sixteen model-only frames hide their meshes;
// two carrier-fit frames display the unchanged character and both hands.
// The shared caller owns the normal native lighting and the delivered-module pins.
export async function captureRainmakerModel({api,THREE,RankedWorld,scene,renderer,camera}) {
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 check(api?.G&&typeof api.Actor==='function'&&typeof api.Character==='function'&&typeof api.Physics==='function','Rainmaker runtime API missing');
 const G=api.G,keys=['scene','camera','level','physics','actors','match','time'],saved=Object.fromEntries(keys.map(k=>[k,{own:Object.hasOwn(G,k),value:G[k]}]));
 const cameraBefore={position:camera.position.clone(),quaternion:camera.quaternion.clone()};
 const frames=[],roles=[],owned=[],cleanup=[],motionLoaders=[];let primary=null;
 const width=renderer.domElement.width,height=renderer.domElement.height;
 check(width>=640&&height>=360,'Rainmaker capture resolution too small');
 const blank=new Uint8Array(width*height*4),pixels=new Uint8Array(blank.length),gl=renderer.getContext();
 const readPixels=target=>{gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,target);check(!gl.isContextLost()&&gl.getError()===gl.NO_ERROR,'Rainmaker WebGL capture failed');};
 const box=new THREE.Box3(),point=new THREE.Vector3(),center=new THREE.Vector3(),direction=new THREE.Vector3(.85,.4,1).normalize();
 function coreBounds(core){
  box.setFromObject(core);check(!box.isEmpty(),'Rainmaker empty bounds');
  for(let i=0;i<8;i++){
   point.set(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).project(camera);
   check(point.toArray().every(Number.isFinite)&&Math.abs(point.x)<.96&&Math.abs(point.y)<.96&&point.z>-1&&point.z<1,'Rainmaker clipping '+JSON.stringify({corner:point.toArray(),box:[box.min.toArray(),box.max.toArray()],camera:camera.position.toArray(),fov:camera.fov}));
  }
  return {min:box.min.toArray(),max:box.max.toArray()};
 }
 async function capture(world,team,state,distance,ch=null){
  scene.updateMatrixWorld(true);box.setFromObject(world.rainmakerCore);
  if(ch)for(const name of['handR','handL','chest']){check(ch.bones[name],'Rainmaker carrier landmark missing');box.expandByPoint(ch.bones[name].getWorldPosition(new THREE.Vector3()));}
  box.getCenter(center);
  camera.position.copy(center).addScaledVector(direction,distance==='far'?9.2:4.6);camera.lookAt(center);camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);
  const bounds=coreBounds(world.rainmakerCore),visible=world.group.visible;
  check(world.rainmakerCore.visible,'Rainmaker core hidden');
  world.group.visible=false;let carrier=null;
  if(ch){
   const landmarks={};for(const name of['handR','handL','chest']){const v=ch.bones[name].getWorldPosition(new THREE.Vector3()).project(camera);check(v.toArray().every(Number.isFinite)&&Math.abs(v.x)<.96&&Math.abs(v.y)<.96&&v.z>-1&&v.z<1,'Rainmaker carrier landmark clipping');landmarks[name]=v.toArray();}
   let visibleCharacterMeshes=0;ch.root.traverseVisible(o=>{if(o.isMesh)visibleCharacterMeshes++;});check(visibleCharacterMeshes>0,'Rainmaker carrier meshes hidden');
   const rootVisible=ch.root.visible;ch.root.visible=false;renderer.info.reset();renderer.render(scene,camera);const floorOnly={triangles:renderer.info.render.triangles,calls:renderer.info.render.calls};readPixels(blank);
   ch.root.visible=rootVisible;renderer.info.reset();renderer.render(scene,camera);readPixels(pixels);let actorPixels=0;for(let i=0;i<pixels.length;i+=4)if(Math.max(Math.abs(pixels[i]-blank[i]),Math.abs(pixels[i+1]-blank[i+1]),Math.abs(pixels[i+2]-blank[i+2]))>4)actorPixels++;
   carrier={landmarks,visibleCharacterMeshes,actorPixels,actorTriangles:renderer.info.render.triangles-floorOnly.triangles,actorDraws:renderer.info.render.calls-floorOnly.calls};check(actorPixels>32&&carrier.actorTriangles>0&&carrier.actorDraws>0,'Rainmaker carrier blank');
  }
  renderer.info.reset();renderer.render(scene,camera);const empty={triangles:renderer.info.render.triangles,calls:renderer.info.render.calls};readPixels(blank);
  world.group.visible=visible;renderer.info.reset();renderer.render(scene,camera);const actual={triangles:renderer.info.render.triangles,calls:renderer.info.render.calls};readPixels(pixels);
  const triangles=actual.triangles-empty.triangles,draws=actual.calls-empty.calls;
  check(triangles===444&&draws===1,'Rainmaker draw or triangle budget mismatch');
  let changedPixels=0,signature=2166136261;
  for(let i=0;i<pixels.length;i+=4){if(Math.max(Math.abs(pixels[i]-blank[i]),Math.abs(pixels[i+1]-blank[i+1]),Math.abs(pixels[i+2]-blank[i+2]))>4)changedPixels++;for(let j=0;j<4;j++)signature=Math.imul(signature^pixels[i+j],16777619)>>>0;}
  check(changedPixels>32,'Rainmaker blank frame');
  const png=renderer.domElement.toDataURL('image/png');check(png.startsWith('data:image/png;base64,'),'Rainmaker PNG unavailable');
  frames.push({team,state,distance,triangles,draws,changedPixels,pixelSignature:signature,bounds,width,height,...(carrier?{carrier}:{}),camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray()},png});
 }
 const floor={id:0,solid:true,grate:false,faces:[-1,-1,-1,-1,-1,-1],center:new THREE.Vector3(0,-1,0),half:new THREE.Vector3(100,1,100),axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],aabbMin:new THREE.Vector3(-100,-2,-100),aabbMax:new THREE.Vector3(100,0,100)};
 try{
  G.scene=scene;G.camera=camera;G.time=0;G.actors=[];
  G.level={...G.level,blocks:[floor],groundHeight:()=>0,queryBlocks(_x,_z,_xx,_zz,out){out.length=0;out.push(0);return out;}};G.physics=new api.Physics(G.level);
  const floorGeometry=new THREE.PlaneGeometry(20,20),floorMaterial=new THREE.MeshStandardMaterial({color:0x787878,roughness:.9}),floorMesh=new THREE.Mesh(floorGeometry,floorMaterial);
  owned.push({dispose(){floorGeometry.dispose();}},{dispose(){floorMaterial.dispose();}},{dispose(){scene.remove(floorMesh);}});floorMesh.rotation.x=-Math.PI/2;floorMesh.position.y=-.008;scene.add(floorMesh);
  for(const team of[0,1]){
   const actor=new api.Actor({team,weapon:'shooter',isLocal:true,CharacterClass:api.Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=actor.character;
   if(ch._sourceMotionLoader?.then)motionLoaders.push(ch._sourceMotionLoader);
   const charOwner={dispose(){const errors=[];try{scene.remove(ch.root);}catch(error){errors.push(error);}try{ch.dispose();}catch(error){errors.push(error);}if(errors.length===1)throw errors[0];if(errors.length)throw new AggregateError(errors,'Rainmaker Character cleanup failed');}};owned.push(charOwner);
   actor.nid='rainmaker-capture-'+team;ch.actor=actor;ch.onEvent=null;G.actors=[actor];scene.add(ch.root);actor.form='kid';actor.kidT=10;actor.grounded=actor.ground.hit=true;actor.pos.set(0,0,0);actor.vel.set(0,0,0);
   const state={pos:[0,0,0],carrier:actor.nid,barrier:{active:false,max:1000,health:0},charge:{value:0},checkpoint:{passed:[[],[]],goalOpen:[false,false]}};
   const match={mode:'rainmaker',actors:[actor],state:'playing',ranked:{rule:{state}},playing:()=>true};G.match=match;
   const world=new RankedWorld({...api,G,THREE},match,{rainmaker:{center:[0,0,0],checkpoints:[[],[]],goals:[]}});owned.push(world);
   const pivots=[];for(let w=ch.weapon;w;w=w.left)pivots.push([w.pivot,w.pivot.visible]);check(pivots.length===1,'Unexpected Rainmaker capture weapon');
   let gd=0,md=0,maxAnchorError=0,handTravel=0,lastHand=null;const characterVisibility=new Map();
   world.rainmakerCore.geometry.addEventListener('dispose',()=>gd++);world.rainmakerCore.material.addEventListener('dispose',()=>md++);
   const startClock=ch.t;
   const updateVisual=()=>{const before=JSON.stringify(state);world.update(match.ranked,1/60);check(JSON.stringify(state)===before,'Rainmaker visual mutated rule state');world.rainmakerCarrier.visible=false;scene.updateMatrixWorld(true);};
   for(let tick=0;tick<90;tick++){
    for(const[o,visible]of characterVisibility)o.visible=visible;
    actor.intent.fire=false;actor.intent.move.set(0,0,0);actor.aimPitch=.15*Math.sin(tick*.08);actor.yaw=tick*.015;G.time+=1/60;actor.update(1/60);
    // Keep the actual mounted update/LOD path, without drawing any character,
    // hair, ordinary weapon or nameplate in the model comparison frames.
    characterVisibility.clear();ch.root.traverse(o=>{if(o.isMesh||o.isSprite){characterVisibility.set(o,o.visible);o.visible=false;}});ch.root.updateMatrixWorld(true);
    const pose=Array.from(ch.P),position=actor.pos.toArray(),hand=ch.bones.handR.getWorldPosition(new THREE.Vector3());check(pose.length>0&&pose.every(Number.isFinite),'Rainmaker native pose empty or nonfinite');
    if(lastHand)handTravel+=hand.distanceTo(lastHand);lastHand=hand.clone();updateVisual();
    check(JSON.stringify(Array.from(ch.P))===JSON.stringify(pose)&&JSON.stringify(actor.pos.toArray())===JSON.stringify(position),'Rainmaker visual changed native pose or movement');
    const error=world.rainmakerCore.getWorldPosition(new THREE.Vector3()).distanceTo(hand);maxAnchorError=Math.max(maxAnchorError,error);check(error<1e-6,'Rainmaker hand anchor mismatch');for(const[p]of pivots)check(p.visible===false,'Ordinary weapon still visible');
   }
   const clockDelta=ch.t-startClock;check(Number.isFinite(clockDelta)&&clockDelta>1.4&&handTravel>1e-4,'Rainmaker actual Actor update missing');
   const both=async label=>{for(const distance of['near','far'])await capture(world,team,label,distance);};
   state.carrier=null;state.charge.value=0;state.dropped=false;updateVisual();for(const[p,v]of pivots)check(p.visible===v,'Field release did not restore weapon');await both('field');
   state.carrier=actor.nid;updateVisual();await both('held');state.charge.value=1;updateVisual();check(world.rainmakerCore.material.emissiveIntensity>0,'Rainmaker charge cue missing');await both('charge');
   state.carrier=null;state.pos=[.6,0,-.2];state.dropped=true;state.charge.value=0;updateVisual();for(const[p,v]of pivots)check(p.visible===v,'Drop did not restore weapon');await both('drop');
   state.carrier=actor.nid;state.dropped=false;updateVisual();for(const[o,visible]of characterVisibility)o.visible=visible;
   await capture(world,team,'carrier','fit',ch);
   world.dispose();world.dispose();check(!world.group.parent&&gd===1&&md===1,'Rainmaker objective cleanup mismatch');for(const[p,v]of pivots)check(p.visible===v,'Disposal did not restore weapon');owned.splice(owned.indexOf(world),1);
   roles.push({team,ticks:90,clockDelta,handTravel,maxAnchorError,geometryDispose:gd,materialDispose:md,restored:true});
   owned.splice(owned.indexOf(charOwner),1);charOwner.dispose();G.actors=[];
  }
  check(frames.length===18&&roles.length===2,'Missing Rainmaker capture');
  return {scope:'Actual delivered local Actor/Character update plus RankedWorld; sixteen model-only frames and two ordinary existing-character carrier frames; unshielded objective only. Near/far are camera distances, not native actor LOD qualification. Carrier images require separate human clearance/left-hand-fit review; live shooting/network are outside this component.',frames,roles};
 }catch(error){primary=error;error.capturePartial={frames,roles};throw error;}
 finally{
  for(const item of owned.reverse())try{item.dispose();}catch(error){cleanup.push(error);}
  // Drain the existing optional loader after its owner is disposed; do not leave
  // versioned module requests racing the shared server/context cleanup.
  for(const item of await Promise.allSettled(motionLoaders))if(item.status==='rejected')cleanup.push(item.reason);
  try{camera.position.copy(cameraBefore.position);camera.quaternion.copy(cameraBefore.quaternion);camera.updateMatrixWorld(true);}catch(error){cleanup.push(error);}
  for(const key of keys)try{if(saved[key].own)G[key]=saved[key].value;else delete G[key];}catch(error){cleanup.push(error);}
  if(cleanup.length){const error=new AggregateError(primary?[primary,...cleanup]:cleanup,'Rainmaker cleanup failed',{cause:primary});error.capturePartial=primary?.capturePartial||{frames,roles};throw error;}
 }
}

export function validateRainmakerCapture(result){
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 check(Array.isArray(result?.frames)&&result.frames.length===18,'Rainmaker frame count');
 const signatures=new Set(),cameras=new Map(),pixelSignatures=new Map(),expected=new Set();for(const team of[0,1])for(const state of['field','held','charge','drop'])for(const distance of['near','far'])expected.add(`${team}/${state}/${distance}`);for(const team of[0,1])expected.add(`${team}/carrier/fit`);
 for(const row of result.frames){
  const key=`${row.team}/${row.state}/${row.distance}`;check(expected.delete(key),'Rainmaker frame identity');
  if(row.state==='carrier'){const c=row.carrier;check(c&&c.visibleCharacterMeshes>0&&c.actorPixels>32&&c.actorTriangles>0&&c.actorDraws>0,'Rainmaker carrier pixels');for(const name of['handR','handL','chest']){const v=c.landmarks?.[name];check(Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)&&Math.abs(v[0])<.96&&Math.abs(v[1])<.96&&v[2]>-1&&v[2]<1,'Rainmaker carrier landmarks');}}
  check(row.triangles===444&&row.draws===1,'Rainmaker frame budget');check(Number.isFinite(row.changedPixels)&&row.changedPixels>32,'Rainmaker blank frame');
  check(row.width>=640&&row.height>=360&&row.changedPixels<=row.width*row.height,'Rainmaker frame dimensions');
  check(Array.isArray(row.bounds?.min)&&Array.isArray(row.bounds?.max)&&row.bounds.min.length===3&&row.bounds.max.length===3&&[...row.bounds.min,...row.bounds.max].every(Number.isFinite),'Rainmaker finite bounds');check(row.bounds.min.every((n,i)=>n<row.bounds.max[i]),'Rainmaker nonempty bounds');
  check(Array.isArray(row.camera?.position)&&row.camera.position.length===3&&Array.isArray(row.camera?.quaternion)&&row.camera.quaternion.length===4&&[...row.camera.position,...row.camera.quaternion].every(Number.isFinite)&&Math.abs(Math.hypot(...row.camera.quaternion)-1)<1e-5,'Rainmaker camera');cameras.set(key,row.camera.position);
  check(Number.isInteger(row.pixelSignature)&&row.pixelSignature>=0&&row.pixelSignature<=0xffffffff,'Rainmaker pixel signature');signatures.add(row.pixelSignature);pixelSignatures.set(key,row.pixelSignature);
  check(typeof row.png==='string'&&row.png.startsWith('data:image/png;base64,'),'Rainmaker PNG missing');
 }
 for(const team of[0,1])for(const state of['field','held','charge','drop']){const a=cameras.get(`${team}/${state}/near`),b=cameras.get(`${team}/${state}/far`);check(Math.hypot(...a.map((n,i)=>n-b[i]))>1e-3,'Rainmaker near/far camera identity');check(pixelSignatures.get(`${team}/${state}/near`)!==pixelSignatures.get(`${team}/${state}/far`),'Rainmaker near/far pixel identity');}
 check(signatures.size>1,'Rainmaker identical frames');
 check(expected.size===0&&Array.isArray(result.roles)&&result.roles.length===2,'Rainmaker missing team');const teams=new Set([0,1]);
 for(const role of result.roles){
  check(teams.delete(role.team)&&role.ticks===90,'Rainmaker Actor identity');
  check(Number.isFinite(role.clockDelta)&&role.clockDelta>1.4&&Number.isFinite(role.handTravel)&&role.handTravel>1e-4,'Rainmaker actual Actor clock');
  check(Number.isFinite(role.maxAnchorError)&&role.maxAnchorError>=0&&role.maxAnchorError<1e-6,'Rainmaker actual hand anchor');
  check(role.restored===true&&role.geometryDispose===1&&role.materialDispose===1,'Rainmaker ownership');
 }
 return true;
}

export {captureRainmakerModel as captureRainmaker};
