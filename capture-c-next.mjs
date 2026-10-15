// Controlled native component capture. Caller binds source, native light and transport.
export async function captureCNext({api,R,THREE,scene,renderer,camera}) {
 const {Actor,Character,G,WEAPONS,Physics}=api;
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
   if(foreground<250||colors.size<16)throw Error('Blank B9 held frame');return {foreground,quantizedColors:colors.size};
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
  for(const k of ['grounded','ticks','births','extension','attackSeen','time','rng','hold','pose','partMatrices','hands','camera','drawCalls','triangles'])if(JSON.stringify(row[k])!==JSON.stringify(ref[k]))throw Error('C native pair mismatch '+k+':'+JSON.stringify({actual:row[k],expected:ref[k]}));
 }
 function finishHeld(captureError,snapshots,group,scene,ch){
  const errors=[];try{restoreHeld(snapshots,group,scene,ch);}catch(e){errors.push(e);}try{scene.remove(group);}catch(e){errors.push(e);}
  if(errors.length)throw new AggregateError([...(captureError?[captureError]:[]),...errors],'Native held restoration failed',captureError?{cause:captureError}:undefined);
 }
 const entries=[{row:'Slosher_Strong_01',baseId:'slosher',kitId:'slosher-01',states:['rest','shot'],view:[-1,.48,.8]},{row:'Roller_Hunter_01',baseId:'s3-roller-hunter',kitId:'s3-roller-hunter-01',states:['rest','horizontal','vertical'],view:[-1,.48,.8]}];
 function advance(entry,id,team,state,warm=false){
  ownedProjectiles.clear();G.actors=[];G.time=0;resetRng();
  const a=new Actor({team,weapon:id,isLocal:false,name:'weapon-component',CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});owned.push(a);const ch=a.character;ch.actor=a;ch.onEvent=null;G.actors=[a];
  a.form='kid';a.kidT=10;a.grounded=a.ground.hit=state!=='vertical';a.pos.set(0,state==='vertical'?10:0,0);a.vel.set(0,0,0);births=0;resetRng();
  let extension=0,attackSeen=false,ticks=0;
  for(let tick=0;tick<180;tick++){
   a.intent.fire=state!=='rest'&&tick>=35&&tick<75;G.time+=1/60;a.update(1/60);ticks++;
   const attack=ch.s3RollerFlick;if(attack){if(attack.vertical!==(state==='vertical'))throw Error('Wrong native swing direction');attackSeen=true;}
   extension=Math.max(extension,ch.weapon.flingExt||0);
   if(!warm&&((state==='rest'&&ticks===30)||(state!=='rest'&&births>0)))break;
  }
  if(state==='rest'?births!==0:births<=0)throw Error('Missing native action outcome');
  if(state==='horizontal'&&(!attackSeen||extension!==0))throw Error('Missing native horizontal swing');
  if(state==='vertical'&&(!attackSeen||extension<=.5))throw Error('Missing native vertical extension');
  ch.root.updateMatrixWorld(true);return {a,ch,ticks,births,extension,attackSeen};
 }
 try{
  Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;rngCalls++;return rng/4294967296;};
  if(!Physics||!api.Projectiles||camera.matrixAutoUpdate!==true)throw Error('Missing native component contracts');
  let occupied=false;scene.traverse(o=>{if(o.isMesh)occupied=true;});if(occupied)throw Error('Scene contains non-environment mesh');
  const floor={id:0,solid:true,grate:false,faces:[-1,-1,-1,-1,-1,-1],center:new THREE.Vector3(0,-1,0),half:new THREE.Vector3(100,1,100),axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],aabbMin:new THREE.Vector3(-100,-2,-100),aabbMax:new THREE.Vector3(100,0,100)};
  G.level={...G.level,blocks:[floor],queryBlocks(_x,_z,_xx,_zz,out){out.length=0;out.push(0);return out;}};G.physics=new Physics(G.level);G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera(60,1,.1,100);G.camera.position.set(0,2,2);G.camera.updateMatrixWorld(true);
  ownedProjectiles=new api.Projectiles({add(){},remove(){}});G.projectiles=ownedProjectiles;const push=ownedProjectiles._push;ownedProjectiles._push=function(...args){births++;return push.apply(this,args);};
  for(const entry of entries)for(const state of entry.states.filter(s=>s!=='rest')){currentCapture={phase:'native-cache-warmup',row:entry.row,state};advance(entry,entry.baseId,0,state,true);}
  for(const entry of entries)for(const role of ['base','variant'])for(const team of [0,1])for(const state of entry.states){
   const id=role==='base'?entry.baseId:entry.kitId,pairKey=entry.row+':'+team+':'+state;currentCapture={id,team,state};
   const official=api.ALTERNATE_WEAPON_KITS?.find(k=>k.main===entry.row),spec=R.weaponModelSpec(id);
   if(!official||official.id!==entry.kitId||official.baseId!==entry.baseId||!WEAPONS[id]||!spec)throw Error('Wrong official C kit');
   if(role==='variant'?(spec.sourceRow!==entry.row||spec.baseId!==entry.baseId):spec.id!==entry.baseId)throw Error('Wrong model spec');
   const sim=advance(entry,id,team,state),{a,ch}=sim;
   if(ch.root.parent||ch.weaponModel!==(role==='variant'?entry.row:entry.baseId)||ch.weapon.def.modelId!==entry.baseId||(role==='variant'&&ch.weapon.def.modelVariantId!==entry.row))throw Error('Native C identity drift');
   const pose=Array.from(ch.P);if(!pose.length||pose.some(v=>!Number.isFinite(v))||!pose.some(v=>v!==0))throw Error('Invalid native pose');
   const snapshots=snapshotHeld(nativeHands(ch.weapon,false)),group=new THREE.Group();scene.add(group);let row,captureError=null;
   try{
    mountHeld(snapshots,group);if(ch.weapon.near!==true||ch.weapon.body.visible!==true||ch.weapon.bodyFar.visible!==false)throw Error('Native near body required');
    const bounds=new THREE.Box3().setFromObject(group),center=bounds.getCenter(new THREE.Vector3());
    if(role==='base'){fitHeldCamera(bounds,center,entry.view,camera,THREE);baseCameras.set(pairKey,{position:camera.position.clone(),quaternion:camera.quaternion.clone()});}else{const ref=baseCameras.get(pairKey);if(!ref)throw Error('Missing base camera');camera.position.copy(ref.position);camera.quaternion.copy(ref.quaternion);}camera.updateMatrixWorld(true);
    const points=[];for(const x of[bounds.min.x,bounds.max.x])for(const y of[bounds.min.y,bounds.max.y])for(const z of[bounds.min.z,bounds.max.z])points.push(new THREE.Vector3(x,y,z).project(camera));const projectedBounds=validateProjection(points),poseRng={state:rng,calls:rngCalls};
    try{renderer.render(scene,camera);renderer.render(scene,camera);}finally{rng=poseRng.state;rngCalls=poseRng.calls;}
    const gl=renderer.getContext(),rgba=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,rgba);const px=validatePixels(rgba);if(gl.getError()!==0||renderer.info.render.triangles<=0)throw Error('Invalid native frame');
    row={id,rowId:entry.row,baseId:entry.baseId,variantId:role==='variant'?entry.row:null,role,team,state,grounded:a.grounded,ticks:sim.ticks,births:sim.births,extension:sim.extension,attackSeen:sim.attackSeen,pose,rng:poseRng,time:G.time,hold:JSON.parse(JSON.stringify(ch.hold)),partMatrices:Object.fromEntries(Object.entries(ch.weapon.parts).map(([n,p])=>{p.updateMatrixWorld(true);const m=p.matrixWorld.toArray();if(m.some(v=>!Number.isFinite(v)))throw Error('Nonfinite part');return[n,m]})),hands:snapshots.map(({weapon,before},hand)=>({hand,near:weapon.near,bodyVisible:weapon.body.visible,bodyFarVisible:weapon.bodyFar.visible,muzzle:weapon.muzzle.getWorldPosition(new THREE.Vector3()).toArray(),pivotMatrix:before})),camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray()},projectedBounds,foregroundPixels:px.foreground,quantizedColors:px.quantizedColors,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,png:renderer.domElement.toDataURL('image/png').split(',')[1]};
   }catch(e){captureError=e;throw e;}finally{finishHeld(captureError,snapshots,group,scene,ch);}
   row.restored=true;
   if(role==='base')baseFrames.set(pairKey,row);else{const ref=baseFrames.get(pairKey);if(!ref)throw Error('Missing baseline');validatePair(row,ref);}
   frames.push(row);
  }
  if(frames.length!==20)throw Error('Expected 20 C action frames');return {scope:'Actual native component rest, Slosher shot, Flingza ground horizontal and natural-fall vertical; controlled no-paint floor; not whole-game performance',frames};
 }catch(e){e.capturePartial={frames,state:currentCapture,error:String(e)};primaryError=e;throw e;}finally{
  const errors=[];try{ownedProjectiles?.clear();}catch(e){errors.push(String(e));}Object.assign(G,{actors:before.actors,time:before.time,projectiles:before.projectiles,level:before.level,physics:before.physics,scene:before.scene,camera:before.camera});Math.random=before.random;
  try{camera.position.copy(before.position);camera.quaternion.copy(before.quaternion);camera.updateMatrixWorld(true);}catch(e){errors.push(String(e));}for(const a of owned)try{a.character.dispose();}catch(e){errors.push(String(e));}if(errors.length){const e=new AggregateError([...(primaryError?[primaryError]:[]),...errors.map(message=>new Error(message))],'Native C cleanup: '+errors.join('; '),primaryError?{cause:primaryError}:undefined);e.capturePartial=primaryError?.capturePartial||{frames,state:currentCapture,error:String(e)};throw e;}
 }
}
