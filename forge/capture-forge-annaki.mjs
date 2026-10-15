// Controlled native component capture. Caller binds source, native light and transport.
export async function captureForgeAnnaki({api,R,THREE,scene,renderer,camera,selection='all',appearance}) {
 const {Actor,Character,G,WEAPONS,Physics}=api;
 if(!appearance?.setWeaponAppearance||!appearance?.selectedWeaponAppearance||!appearance?.WEAPON_APPEARANCE_STORAGE_KEY)throw Error('Missing production appearance module');
 const storage=globalThis.localStorage,storageKey=appearance.WEAPON_APPEARANCE_STORAGE_KEY,oldPreference=storage.getItem(storageKey);
 const Preview=class extends Character{constructor(o){super({...o,weaponAppearancePreview:true});}};
 const before={random:Math.random,actors:G.actors,time:G.time,projectiles:G.projectiles,level:G.level,physics:G.physics,scene:G.scene,camera:G.camera,position:camera.position.clone(),quaternion:camera.quaternion.clone()};
 let rng=0x6b17a9c3,rngCalls=0;const resetRng=()=>{rng=0x6b17a9c3;rngCalls=0;};
 const frames=[],owned=[],baseCameras=new Map(),baseFrames=new Map();let currentCapture=null,ownedProjectiles,births=0,primaryError=null;
  function fitHeldCamera(bounds,center,view,camera,THREE){
   if(!(camera.isPerspectiveCamera&&camera.fov>0&&camera.fov<180&&camera.aspect>0&&camera.zoom>0&&camera.near>0&&camera.far>camera.near))throw Error('Invalid held camera');
   const direction=new THREE.Vector3(...view).normalize();
   camera.position.copy(center).add(direction);camera.lookAt(center);
   const inverse=camera.quaternion.clone().invert(),tanY=Math.tan(camera.fov*Math.PI/360)/camera.zoom,tanX=tanY*camera.aspect;
   let distance=0;
   for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
    const p=new THREE.Vector3(x,y,z).sub(center).applyQuaternion(inverse);
    distance=Math.max(distance,p.z+Math.abs(p.x)/(tanX*.9),p.z+Math.abs(p.y)/(tanY*.9),p.z+camera.near*1.1);
   }
   if(!Number.isFinite(distance)||distance<=0)throw Error('Invalid held fit distance');
   camera.position.copy(center).addScaledVector(direction,distance);camera.updateMatrixWorld(true);
  }
  function validateProjection(points){
   if(points.length!==8||points.some(p=>![p.x,p.y,p.z].every(Number.isFinite)||Math.abs(p.x)>.99||Math.abs(p.y)>.99||Math.abs(p.z)>1))throw Error('Held ROI outside camera');
   const min=['x','y','z'].map(k=>Math.min(...points.map(p=>p[k]))),max=['x','y','z'].map(k=>Math.max(...points.map(p=>p[k])));
   if(max[0]<=min[0]||max[1]<=min[1])throw Error('Empty held ROI');return {min,max};
  }
  function validatePixels(rgba){
   if(!rgba.length||rgba.length%4)throw Error('Invalid frame buffer');let foreground=0;const colors=new Set();
   for(let i=0;i<rgba.length;i+=4){if(Math.abs(rgba[i]-rgba[0])+Math.abs(rgba[i+1]-rgba[1])+Math.abs(rgba[i+2]-rgba[2])>12)foreground++;if(i%64===0)colors.add((rgba[i]>>3)*1024+(rgba[i+1]>>3)*32+(rgba[i+2]>>3));}
   if(foreground<250||colors.size<16)throw Error('Blank fourth held frame');return {foreground,quantizedColors:colors.size};
  }
  function nativeHands(w,paired){
   const hands=[],seen=new Set();
   for(let current=w;current;current=current.left){if(seen.has(current)||hands.length>=2)throw Error('Invalid native weapon chain');seen.add(current);hands.push(current);}
   if(hands.length!==(paired?2:1))throw Error('Unexpected native hand count');
   return hands;
  }
  function snapshotHeld(weapons){
   return weapons.map(weapon=>{const pivot=weapon.pivot,parent=pivot.parent;return {weapon,pivot,parent,sibling:parent.children.indexOf(pivot),before:pivot.matrixWorld.elements.slice(),local:pivot.matrix.clone(),world:pivot.matrixWorld.clone(),position:pivot.position.clone(),quaternion:pivot.quaternion.clone(),scale:pivot.scale.clone(),matrixAutoUpdate:pivot.matrixAutoUpdate,matrixWorldAutoUpdate:pivot.matrixWorldAutoUpdate,matrixWorldNeedsUpdate:pivot.matrixWorldNeedsUpdate};});
  }
  function mountHeld(snapshots,group){
   group.updateWorldMatrix(true,false);
   const inverse=group.matrixWorld.clone().invert();
   for(const s of snapshots){group.add(s.pivot);s.pivot.matrixAutoUpdate=false;s.pivot.matrixWorldAutoUpdate=true;s.pivot.matrix.copy(inverse).multiply(s.world);s.pivot.matrixWorldNeedsUpdate=true;}
   group.updateMatrixWorld(true);
   for(const {pivot,before} of snapshots)if(pivot.matrixWorld.elements.some((v,k)=>!Number.isFinite(v)||Math.abs(v-before[k])>1e-8))throw Error('Held capture changed rendered native pivot');
  }
  function restoreHeld(snapshots,group,scene,ch){
   for(const s of snapshots){
    s.parent.add(s.pivot);
    s.pivot.position.copy(s.position);s.pivot.quaternion.copy(s.quaternion);s.pivot.scale.copy(s.scale);
    s.pivot.matrix.copy(s.local);s.pivot.matrixWorld.copy(s.world);s.pivot.matrixAutoUpdate=s.matrixAutoUpdate;s.pivot.matrixWorldAutoUpdate=s.matrixWorldAutoUpdate;s.pivot.matrixWorldNeedsUpdate=s.matrixWorldNeedsUpdate;
   }
   for(const s of [...snapshots].sort((a,b)=>a.sibling-b.sibling)){const children=s.parent.children;children.splice(children.indexOf(s.pivot),1);children.splice(s.sibling,0,s.pivot);}
   scene.remove(group);ch.root.updateMatrixWorld(true);
   for(const {pivot,parent,before,local} of snapshots)if(pivot.parent!==parent||pivot.matrix.elements.some((v,k)=>!Number.isFinite(v)||Math.abs(v-local.elements[k])>1e-8)||pivot.matrixWorld.elements.some((v,k)=>!Number.isFinite(v)||Math.abs(v-before[k])>1e-8))throw Error('Held capture changed native pivot');
   for(const s of snapshots)s.pivot.matrixWorldNeedsUpdate=s.matrixWorldNeedsUpdate;
  }

 function validatePair(row,ref){
  for(const k of ['animationTime','kidTime','maxCharge','charge','handMotion','handAdmissions','grounded','ticks','births','time','rng','hold','pose','partMatrices','hands','camera','drawCalls','triangles'])if(JSON.stringify(row[k])!==JSON.stringify(ref[k]))throw Error('Fourth native pair mismatch '+k+':'+JSON.stringify({actual:row[k],expected:ref[k]}));
 }
 function finishHeld(captureError,snapshots,group,scene,ch){
  const errors=[];try{restoreHeld(snapshots,group,scene,ch);}catch(e){errors.push(e);}try{scene.remove(group);}catch(e){errors.push(e);}
  if(errors.length)throw new AggregateError([...(captureError?[captureError]:[]),...errors],'Native held restoration failed',captureError?{cause:captureError}:undefined);
 }
 const entries=[['Shooter_Expert_01','s3-shooter-expert'],['Shooter_QuickLong_01','s3-shooter-quicklong']].map(([row,baseId])=>({row,baseId,kitId:api.ALTERNATE_WEAPON_KITS.find(k=>k.main===row)?.id,states:['rest','fire'],paired:false}));
 const selected=selection==='all'?entries:null;if(!selected)throw Error('Unknown fourth selection');
 function advance(entry,id,team,state,warm=false){
  ownedProjectiles.clear();G.actors=[];G.time=0;resetRng();appearance.setWeaponAppearance(entry.kitId,id,storage);
  if(appearance.selectedWeaponAppearance(entry.kitId,storage)!==id)throw Error('Manual appearance selection failed');
  const a=new Actor({team,weapon:entry.kitId,isLocal:true,name:'manual-component',CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});owned.push(a);const ch=a.character;ch.actor=a;ch.onEvent=null;G.actors=[a];a.form='kid';a.kidT=10;a.grounded=a.ground.hit=true;a.pos.set(0,0,0);a.vel.set(0,0,0);births=0;resetRng();
  const initialTrigger=ch.weapon.parts.trigger.quaternion.toArray();let triggerMoved=false;for(let tick=0;tick<60;tick++){a.intent.fire=state==='fire'&&tick>=15;G.time+=1/60;a.update(1/60);triggerMoved ||= JSON.stringify(ch.weapon.parts.trigger.quaternion.toArray())!==JSON.stringify(initialTrigger);}
  if(a.anim.time!==G.time||!Number.isFinite(a.kidT)||Math.abs(a.kidT-(10+60/60))>1e-10)throw Error('Native rest update did not advance actor clocks');
  if(a.weaponRunner.charge!==0||(state==='fire'?(births<=0||!triggerMoved):births!==0))throw Error('Required native rest/fire admission missing');
  const color=G.teamColors[team].toArray();for(const mat of[ch.weapon.ink.material,ch.weapon.inkFar.material])if(JSON.stringify(mat.color.toArray())!==JSON.stringify(color))throw Error('Owner ink drift');for(const part of Object.values(ch.weapon.parts))if(part.userData.mat==='ink'&&JSON.stringify(part.userData.mesh.material.color.toArray())!==JSON.stringify(color))throw Error('Owner part ink drift');
  ch.root.updateMatrixWorld(true);return {a,ch,ticks:60,births,handMotion:[triggerMoved],handAdmissions:[births],maxCharge:0};
 }
 try{
  Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;rngCalls++;return rng/4294967296;};
  if(!Physics||!api.Projectiles||camera.matrixAutoUpdate!==true)throw Error('Missing native component contracts');
  let occupied=false;scene.traverse(o=>{if(o.isMesh)occupied=true;});if(occupied)throw Error('Scene contains non-environment mesh');
  const floor={id:0,solid:true,grate:false,faces:[-1,-1,-1,-1,-1,-1],center:new THREE.Vector3(0,-1,0),half:new THREE.Vector3(100,1,100),axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],aabbMin:new THREE.Vector3(-100,-2,-100),aabbMax:new THREE.Vector3(100,0,100)};
  G.level={...G.level,blocks:[floor],queryBlocks(_x,_z,_xx,_zz,out){out.length=0;out.push(0);return out;}};G.physics=new Physics(G.level);G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera(60,1,.1,100);G.camera.position.set(0,2,2);G.camera.updateMatrixWorld(true);
  ownedProjectiles=new api.Projectiles({add(){},remove(){}});G.projectiles=ownedProjectiles;const push=ownedProjectiles._push;ownedProjectiles._push=function(...args){births++;return push.apply(this,args);};
  for(const entry of selected)for(const id of[entry.baseId,entry.row]){currentCapture={phase:'native-cache-warmup',row:entry.row};advance(entry,id,0,'rest',true);}
  for(const entry of selected)for(const role of ['base','variant'])for(const team of [0,1])for(const state of entry.states){
   const id=role==='base'?entry.baseId:entry.row,pairKey=entry.baseId+':'+team+':'+state;if(role==='base'&&baseFrames.has(pairKey))continue;currentCapture={id,team,state};
   const official=api.ALTERNATE_WEAPON_KITS?.find(k=>k.main===entry.row),spec=R.weaponModelSpec(id);
   if(!official||official.id!==entry.kitId||official.baseId!==entry.baseId||!WEAPONS[entry.kitId]||!spec||R.weaponDefaultAppearance(entry.kitId)!==entry.baseId)throw Error('Wrong official fourth kit');
   if(role==='variant'?(spec.sourceRow!==entry.row||spec.baseId!==entry.baseId):spec.id!==entry.baseId)throw Error('Wrong model spec');
   const sim=advance(entry,id,team,state),{a,ch}=sim;
   if(ch.root.parent||ch.weaponModel!==entry.baseId||ch.weaponAppearanceModel!==id||ch.weapon.def.modelId!==entry.baseId||(role==='variant'&&ch.weapon.def.modelVariantId!==entry.row))throw Error('Native fourth identity drift');
   const pose=Array.from(ch.P);if(!pose.length||pose.some(v=>!Number.isFinite(v))||!pose.some(v=>v!==0))throw Error('Invalid native pose');
   const snapshots=snapshotHeld(nativeHands(ch.weapon,entry.paired)),group=new THREE.Group();scene.add(group);let row,captureError=null;
   try{
    mountHeld(snapshots,group);if(ch.weapon.near!==true||ch.weapon.body.visible!==true||ch.weapon.bodyFar.visible!==false)throw Error('Native near body required');
    const bounds=new THREE.Box3().setFromObject(group),center=bounds.getCenter(new THREE.Vector3());
    if(role==='base'){fitHeldCamera(bounds,center,new THREE.Vector3(1,.35,.65).transformDirection(ch.weapon.body.matrixWorld).toArray(),camera,THREE);baseCameras.set(pairKey,{position:camera.position.clone(),quaternion:camera.quaternion.clone()});}else{const ref=baseCameras.get(pairKey);if(!ref)throw Error('Missing base camera');camera.position.copy(ref.position);camera.quaternion.copy(ref.quaternion);}camera.updateMatrixWorld(true);
    const points=[];for(const x of[bounds.min.x,bounds.max.x])for(const y of[bounds.min.y,bounds.max.y])for(const z of[bounds.min.z,bounds.max.z])points.push(new THREE.Vector3(x,y,z).project(camera));const projectedBounds=validateProjection(points),poseRng={state:rng,calls:rngCalls};
    try{renderer.render(scene,camera);renderer.render(scene,camera);}finally{rng=poseRng.state;rngCalls=poseRng.calls;}
    const gl=renderer.getContext(),rgba=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,rgba);const px=validatePixels(rgba);if(gl.isContextLost()||gl.getError()!==0||renderer.info.render.triangles<=0)throw Error('Invalid native frame');
    row={id,rowId:entry.row,baseId:entry.baseId,variantId:role==='variant'?entry.row:null,role,team,state,animationTime:a.anim.time,kidTime:a.kidT,maxCharge:sim.maxCharge,charge:a.weaponRunner.charge,handMotion:sim.handMotion,handAdmissions:sim.handAdmissions,grounded:a.grounded,ticks:sim.ticks,births:sim.births,pose,rng:poseRng,time:G.time,hold:JSON.parse(JSON.stringify(ch.hold)),partMatrices:snapshots.map(({weapon})=>Object.fromEntries(Object.entries(weapon.parts).map(([n,p])=>{p.updateMatrixWorld(true);const m=p.matrixWorld.toArray();if(m.some(v=>!Number.isFinite(v)))throw Error('Nonfinite part');return[n,m]}))),hands:snapshots.map(({weapon,before},hand)=>({hand,near:weapon.near,bodyVisible:weapon.body.visible,bodyFarVisible:weapon.bodyFar.visible,muzzle:weapon.muzzle.getWorldPosition(new THREE.Vector3()).toArray(),pivotMatrix:before})),camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray()},projectedBounds,foregroundPixels:px.foreground,quantizedColors:px.quantizedColors,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,png:renderer.domElement.toDataURL('image/png').split(',')[1]};
   }catch(e){captureError=e;throw e;}finally{finishHeld(captureError,snapshots,group,scene,ch);}
   row.restored=true;
   if(role==='base')baseFrames.set(pairKey,row);else{const ref=baseFrames.get(pairKey);if(!ref)throw Error('Missing baseline');validatePair(row,ref);}
   frames.push(row);
  }
  if(frames.length!==16)throw Error('Wrong fourth action frame count');return {scope:'Existing manual Forge/Annaki finishes at actual native rest/fire, same base-body camera and both teams; normal Environment supplied by caller; no default appearance change or whole-game performance qualification',selection,frames};
 }catch(e){e.capturePartial={frames,state:currentCapture,error:String(e)};primaryError=e;throw e;}finally{
  const errors=[];try{if(oldPreference===null)storage.removeItem(storageKey);else storage.setItem(storageKey,oldPreference);if(storage.getItem(storageKey)!==oldPreference)throw Error('Preference restore failed');}catch(e){errors.push(String(e));}try{ownedProjectiles?.clear();}catch(e){errors.push(String(e));}Object.assign(G,{actors:before.actors,time:before.time,projectiles:before.projectiles,level:before.level,physics:before.physics,scene:before.scene,camera:before.camera});Math.random=before.random;
  try{camera.position.copy(before.position);camera.quaternion.copy(before.quaternion);camera.updateMatrixWorld(true);}catch(e){errors.push(String(e));}for(const a of owned)try{a.character.dispose();}catch(e){errors.push(String(e));}if(errors.length){const e=new AggregateError([...(primaryError?[primaryError]:[]),...errors.map(message=>new Error(message))],'Native fourth cleanup: '+errors.join('; '),primaryError?{cause:primaryError}:undefined);e.capturePartial=primaryError?.capturePartial||{frames,state:currentCapture,error:String(e)};throw e;}
 }
}
