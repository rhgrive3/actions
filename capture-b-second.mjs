// Existing native batch attachment/pose path; caller owns exact build, environment and network binding.
export async function captureBSecond({api,R,THREE,scene,renderer,camera}){
 const {Actor,Character,G,WEAPONS}=api;
 const before={actors:G.actors,time:G.time,cameraPosition:camera.position.clone(),cameraQuaternion:camera.quaternion.clone(),random:Math.random};
 let rng=0x6b17a9c3,rngCalls=0;const resetRng=()=>{rng=0x6b17a9c3;rngCalls=0;};
 let primaryError=null,currentCapture=null;const frames=[];const owned=[];const baseCameras=new Map(),basePoses=new Map();
  function validateInputs(row,ref){
   if(JSON.stringify(row.hold)!==JSON.stringify(ref.hold)||row.time!==ref.time||row.charge!==ref.charge||row.sinceRelease!==ref.sinceRelease||row.rng.state!==ref.rng.state||row.rng.calls!==ref.rng.calls)throw Error('B3 input or hold mismatch '+JSON.stringify({actual:inputSnapshot(row),expected:inputSnapshot(ref)}));
  }
  function inputSnapshot(row){return {hold:row.hold,time:row.time,charge:row.charge,sinceRelease:row.sinceRelease,rng:row.rng};}
  function validateProjection(points){
   if(points.length!==8||points.some(p=>![p.x,p.y,p.z].every(Number.isFinite)||Math.abs(p.x)>.99||Math.abs(p.y)>.99||Math.abs(p.z)>1))throw Error('Held ROI outside camera');
   const min=['x','y','z'].map(k=>Math.min(...points.map(p=>p[k]))),max=['x','y','z'].map(k=>Math.max(...points.map(p=>p[k])));
   if(max[0]<=min[0]||max[1]<=min[1])throw Error('Empty held ROI');return {min,max};
  }
  function validatePixels(rgba){
   if(!rgba.length||rgba.length%4)throw Error('Invalid frame buffer');let foreground=0;const colors=new Set();
   for(let i=0;i<rgba.length;i+=4){if(Math.abs(rgba[i]-rgba[0])+Math.abs(rgba[i+1]-rgba[1])+Math.abs(rgba[i+2]-rgba[2])>12)foreground++;if(i%64===0)colors.add((rgba[i]>>3)*1024+(rgba[i+1]>>3)*32+(rgba[i+2]>>3));}
   if(foreground<250||colors.size<16)throw Error('Blank B3 held frame');return {foreground,quantizedColors:colors.size};
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

 try{
 Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;rngCalls++;return rng/4294967296;};
 if(camera.matrixAutoUpdate!==true)throw Error('B3 requires native automatic camera matrices');let occupied=false;scene.traverse(o=>{if(o.isMesh)occupied=true;});if(occupied)throw Error('B3 scene must contain only presentation environment');
 // Keep one non-scene Short/team0 Actor alive so both roles measure warmed native geometry caches.
 G.actors=[];G.time=0;resetRng();
 const warm=new Actor({team:0,weapon:'s3-stringer-short',isLocal:false,name:'weapon-gallery-warm',CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});owned.push(warm);
 warm.character.actor=warm;warm.character.onEvent=null;G.actors=[warm];
 warm.form='kid';warm.kidT=10;warm.grounded=true;warm.ground.hit=true;warm.intent.fire=false;warm.vel.set(0,0,0);
 warm.weaponRunner.charge=1;warm.weaponRunner.charging=true;warm.character.lastRelease=99;
 for(let frame=0;frame<60;frame++){G.time+=1/60;warm._finishFrame(1/60);}
 for(const entry of [{baseId:'s3-stringer-short',variantId:'Stringer_Short_01',kitId:'s3-stringer-short-01',view:[-1,.3,.5]},{baseId:'s3-stringer-normal',variantId:'Stringer_Normal_01',kitId:'s3-stringer-normal-01',view:[-1,.3,.5]},{baseId:'s3-stringer-explosion',variantId:'Stringer_Explosion_01',kitId:'s3-stringer-explosion-01',view:[-1,.3,.5]}])for(const role of ['base','variant'])for(const team of [0,1]){
  const id=role==='base'?entry.baseId:entry.kitId,pairKey=entry.baseId+':'+team;
  const spec=R.weaponModelSpec(id),baseId=spec?.baseId||id,variantId=spec?.sourceRow||null;
  if(!WEAPONS[id]||!spec)throw Error('Missing actual model '+id);
  if(role==='variant'?(spec.sourceRow!==entry.variantId||spec.baseId!==entry.baseId):spec.id!==entry.baseId)throw Error('Wrong native B3 identity');
  G.actors=[];G.time=0;resetRng();
  const a=new Actor({team,weapon:id,isLocal:false,name:'weapon-gallery',CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});owned.push(a);
  const ch=a.character;ch.actor=a;ch.onEvent=null;G.actors=[a];
  if(ch.root.parent||ch.weaponModel!==R.weaponModelKey(id)||ch.weapon.def.modelId!==baseId||(role==='variant'&&ch.weapon.def.modelVariantId!==entry.variantId))throw Error('Native model identity '+id);
  resetRng();
  const paired=false,states=['charge','release'];
  for(const state of states){
   const comparisonKey=pairKey+':'+state;currentCapture={id,team,state,role};resetRng();
   const grounded=true;a.form='kid';a.kidT=10;a.grounded=grounded;a.ground.hit=grounded;a.intent.fire=false;a.vel.set(0,0,0);
   a.weaponRunner.charge=state==='rest'?0:1;a.weaponRunner.charging=state!=='rest';ch.lastRelease=99;
   for(let frame=0;frame<60;frame++){G.time+=1/60;a._finishFrame(1/60);}
   if(state==='release'){a.weaponRunner.charge=0;a.weaponRunner.charging=false;ch.trigger('charge_release');G.time+=1/60;a._finishFrame(1/60);}
   if(state==='charge'&&!(ch._wst.charge>.99))throw Error('Native charge state missing');
   if(state==='release'&&!(ch._wst.sinceRelease<.05))throw Error('Native release state missing');
   ch.root.updateMatrixWorld(true);const weapons=nativeHands(ch.weapon,paired),snapshots=snapshotHeld(weapons),group=new THREE.Group();scene.add(group);
   let row;
   try{
    mountHeld(snapshots,group);
    for(const w of weapons)if(w.near!==true||w.body.visible!==true||w.bodyFar.visible!==false)throw Error('Native near-body required');
    const bounds=new THREE.Box3().setFromObject(group),center=bounds.getCenter(new THREE.Vector3()),span=Math.max(...bounds.getSize(new THREE.Vector3()).toArray());
    if(!(span>0&&Number.isFinite(span)))throw Error('Invalid native held bounds');
    if(role==='base'){camera.position.copy(center).add(new THREE.Vector3(...entry.view).transformDirection(weapons[0].body.matrixWorld).multiplyScalar(span*2.5));camera.lookAt(center);baseCameras.set(comparisonKey,{position:camera.position.clone(),quaternion:camera.quaternion.clone()});}else{const fixed=baseCameras.get(comparisonKey);if(!fixed)throw Error('Missing base camera');camera.position.copy(fixed.position);camera.quaternion.copy(fixed.quaternion);}camera.updateMatrixWorld(true);
    const projected=[];for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])projected.push(new THREE.Vector3(x,y,z).project(camera));
    const projectedBounds=validateProjection(projected);
    const poseRng={state:rng,calls:rngCalls};
    try{renderer.render(scene,camera);renderer.render(scene,camera);}finally{rng=poseRng.state;rngCalls=poseRng.calls;}
    const gl=renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,rgba=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,rgba);const {foreground,quantizedColors}=validatePixels(rgba);
    if(renderer.getContext().getError()!==0||renderer.info.render.triangles<=0)throw Error('WebGL native held');
    row={id,kit:entry.kitId,rowId:entry.variantId,baseId,variantId,role,team,state,grounded,time:G.time,rng:poseRng,hold:JSON.parse(JSON.stringify(ch.hold)),foregroundPixels:foreground,quantizedColors,projectedBounds,partMatrices:Object.fromEntries(Object.entries(ch.weapon.parts).map(([n,p])=>{p.updateMatrixWorld(true);if(p.matrixWorld.elements.some(v=>!Number.isFinite(v)))throw Error('Nonfinite native part');return[n,p.matrixWorld.elements.slice()]})),charge:ch._wst.charge,sinceRelease:ch._wst.sinceRelease,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,memory:{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures},camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray()},hands:snapshots.map(({weapon,before},hand)=>({hand,near:weapon.near,bodyVisible:weapon.body.visible,bodyFarVisible:weapon.bodyFar.visible,muzzle:weapon.muzzle.getWorldPosition(new THREE.Vector3()).toArray(),pivotMatrix:before})),png:renderer.domElement.toDataURL('image/png').split(',')[1]};
   }finally{restoreHeld(snapshots,group,scene,ch);}
   row.restored=true;if(role==='base')basePoses.set(comparisonKey,row);else{const ref=basePoses.get(comparisonKey);if(!ref)throw Error('Missing base pose');for(const key of ['muzzle','pivotMatrix']){const a=row.hands[0][key],b=ref.hands[0][key];if(a.length!==b.length||a.some((v,i)=>!Number.isFinite(v)||Math.abs(v-b[i])>1e-8))throw Error('B3 native pose drift '+key);}validateInputs(row,ref);for(const n of ['string','stringL','nock','arrow']){const x=row.partMatrices[n],y=ref.partMatrices[n];if(!x||!y||x.length!==16||x.some((v,i)=>!Number.isFinite(v)||Math.abs(v-y[i])>1e-8))throw Error('B3 native part drift '+n);}if(row.triangles!==ref.triangles||row.drawCalls!==ref.drawCalls)throw Error('Color-only B3 changed render submissions');}frames.push(row);
  }
 }
 if(frames.length!==24)throw Error('Expected 24 matched B3 charge/release views');
 return {scope:'Native weapon component visibility; controlled presentation states, no gameplay firing admission or character render',frames};
 }catch(error){primaryError=error;error.capturePartial={frames,state:currentCapture,error:String(error)};throw error;
 }finally{
  Math.random=before.random;G.actors=before.actors;G.time=before.time;
  const errors=[];try{camera.position.copy(before.cameraPosition);camera.quaternion.copy(before.cameraQuaternion);camera.updateMatrixWorld(true);}catch(e){errors.push(String(e));}for(const a of owned)try{a.character.dispose();}catch(e){errors.push(String(e));}if(errors.length){const error=new AggregateError(primaryError?[primaryError,...errors]:errors,'Native character cleanup: '+errors.join('; '));error.capturePartial=primaryError?.capturePartial||{frames,state:currentCapture,error:String(error)};throw error;}
 }
}
