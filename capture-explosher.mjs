// Existing native batch attachment/pose path; caller owns exact build, environment and network binding.
export async function captureExplosher({api,R,THREE,scene,renderer,camera}){
 const {Actor,Character,G,WEAPONS}=api;
 const before={actors:G.actors,time:G.time,cameraPosition:camera.position.clone(),cameraQuaternion:camera.quaternion.clone()};
 const frames=[];const owned=[];const baseCameras=new Map(),basePoses=new Map();
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
 for(const id of ['s3-slosher-washtub','s3-slosher-washtub-01'])for(const team of [0,1]){
  const spec=R.weaponModelSpec(id),baseId=spec?.baseId||id,variantId=spec?.sourceRow||null;
  if(!WEAPONS[id]||!spec)throw Error('Missing actual model '+id);
  if(id==='s3-slosher-washtub-01'?(spec.sourceRow!=='Slosher_Washtub_01'||spec.baseId!=='s3-slosher-washtub'):spec.id!=='s3-slosher-washtub')throw Error('Wrong native Explosher identity');
  G.actors=[];G.time=0;window.__abResetRng();
  const a=new Actor({team,weapon:id,isLocal:false,name:'weapon-gallery',CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});owned.push(a);
  const ch=a.character;ch.actor=a;ch.onEvent=null;G.actors=[a];
  if(ch.root.parent||ch.weaponModel!==R.weaponModelKey(id)||ch.weapon.def.modelId!==baseId||(id.endsWith('-01')&&ch.weapon.def.modelVariantId!==variantId))throw Error('Native model identity '+id);
  window.__abResetRng();
  const paired=false,states=['rest'];
  for(const state of states){
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
    if(id==='s3-slosher-washtub'){camera.position.copy(center).add(new THREE.Vector3(-1,.3,.5).normalize().multiplyScalar(span*2.5));camera.lookAt(center);baseCameras.set(team,{position:camera.position.clone(),quaternion:camera.quaternion.clone()});}else{const fixed=baseCameras.get(team);if(!fixed)throw Error('Missing base camera');camera.position.copy(fixed.position);camera.quaternion.copy(fixed.quaternion);}camera.updateMatrixWorld(true);
    renderer.render(scene,camera);renderer.render(scene,camera);
    if(renderer.getContext().getError()!==0||renderer.info.render.triangles<=0)throw Error('WebGL native held');
    row={id,baseId,variantId,team,state,grounded,charge:ch._wst.charge,sinceRelease:ch._wst.sinceRelease,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,memory:{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures},camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray()},hands:snapshots.map(({weapon,before},hand)=>({hand,near:weapon.near,bodyVisible:weapon.body.visible,bodyFarVisible:weapon.bodyFar.visible,muzzle:weapon.muzzle.getWorldPosition(new THREE.Vector3()).toArray(),pivotMatrix:before})),png:renderer.domElement.toDataURL('image/png').split(',')[1]};
   }finally{restoreHeld(snapshots,group,scene,ch);}
   row.restored=true;if(id==='s3-slosher-washtub')basePoses.set(team,row);else{const ref=basePoses.get(team);if(!ref)throw Error('Missing base pose');for(const key of ['muzzle','pivotMatrix']){const a=row.hands[0][key],b=ref.hands[0][key];if(a.length!==b.length||a.some((v,i)=>!Number.isFinite(v)||Math.abs(v-b[i])>1e-8))throw Error('Explosher native pose drift '+key);}if(row.triangles!==ref.triangles||row.drawCalls!==ref.drawCalls)throw Error('Color-only Explosher changed render submissions');}frames.push(row);
  }
 }
 if(frames.length!==4)throw Error('Expected four matched base/Custom Explosher views');
 return {scope:'Native weapon component visibility; controlled presentation states, no gameplay firing admission or character render',frames};
 }finally{
  G.actors=before.actors;G.time=before.time;camera.position.copy(before.cameraPosition);camera.quaternion.copy(before.cameraQuaternion);camera.updateMatrixWorld(true);
  const errors=[];for(const a of owned)try{a.character.dispose();}catch(e){errors.push(String(e));}if(errors.length)throw Error('Native character cleanup: '+errors.join('; '));
 }
}
