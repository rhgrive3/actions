// Existing native batch attachment/pose path; caller owns exact build, environment and network binding.
export async function captureCThird({api,R,THREE,scene,renderer,camera}){
 const {Actor,Character,G,WEAPONS}=api;
 const before={random:Math.random,actors:G.actors,time:G.time,cameraPosition:camera.position.clone(),cameraQuaternion:camera.quaternion.clone()};
 let randomState=0;const resetRng=()=>{randomState=0x6b17a9c3;Math.random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};};
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
 for(const entry of [{baseId:'s3-slosher-launcher',variantId:'Slosher_Launcher_01',kitId:'s3-slosher-launcher-01',view:[1,.6,.9]},{baseId:'s3-slosher-bathtub',variantId:'Slosher_Bathtub_01',kitId:'s3-slosher-bathtub-01',view:[1,.6,.9]}])for(const role of ['base','variant'])for(const team of [0,1]){
  const id=role==='base'?entry.baseId:entry.kitId,comparisonKey=entry.baseId+':'+team;
  const spec=R.weaponModelSpec(id),baseId=spec?.baseId||id,variantId=spec?.sourceRow||null;
  if(!WEAPONS[id]||!spec)throw Error('Missing actual model '+id);
  if(role==='variant'?(spec.sourceRow!==entry.variantId||spec.baseId!==entry.baseId):spec.id!==entry.baseId)throw Error('Wrong native C3 identity');
  G.actors=[];G.time=0;resetRng();
  const a=new Actor({team,weapon:id,isLocal:false,name:'weapon-gallery',CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});owned.push(a);
  const ch=a.character;ch.actor=a;ch.onEvent=null;G.actors=[a];
  if(ch.root.parent||ch.weaponModel!==R.weaponModelKey(id)||ch.weapon.def.modelId!==baseId||(role==='variant'&&ch.weapon.def.modelVariantId!==entry.variantId))throw Error('Native model identity '+id);
  resetRng();
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
    if(role==='base'){camera.position.copy(center).add(new THREE.Vector3(...entry.view).normalize().multiplyScalar(span*2.5));camera.lookAt(center);baseCameras.set(comparisonKey,{position:camera.position.clone(),quaternion:camera.quaternion.clone()});}else{const fixed=baseCameras.get(comparisonKey);if(!fixed)throw Error('Missing base camera');camera.position.copy(fixed.position);camera.quaternion.copy(fixed.quaternion);}camera.updateMatrixWorld(true);
    const projected=[];for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])projected.push(new THREE.Vector3(x,y,z).project(camera).toArray());
    if(projected.flat().some(v=>!Number.isFinite(v)))throw Error('Nonfinite C3 projection');
    const projectedBounds={min:[0,1,2].map(k=>Math.min(...projected.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...projected.map(p=>p[k])))};
    if(projectedBounds.min.some(v=>v< -1)||projectedBounds.max.some(v=>v>1)||projectedBounds.max[0]<=projectedBounds.min[0]||projectedBounds.max[1]<=projectedBounds.min[1])throw Error('C3 held bounds outside camera');
    renderer.render(scene,camera);renderer.render(scene,camera);
    if(renderer.getContext().getError()!==0||renderer.info.render.triangles<=0)throw Error('WebGL native held');
    row={id,baseId,variantId,role,team,projectedBounds,state,grounded,charge:ch._wst.charge,sinceRelease:ch._wst.sinceRelease,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,memory:{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures},camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray()},hands:snapshots.map(({weapon,before},hand)=>({hand,near:weapon.near,bodyVisible:weapon.body.visible,bodyFarVisible:weapon.bodyFar.visible,muzzle:weapon.muzzle.getWorldPosition(new THREE.Vector3()).toArray(),pivotMatrix:before})),png:renderer.domElement.toDataURL('image/png').split(',')[1]};
   }finally{restoreHeld(snapshots,group,scene,ch);}
   row.restored=true;if(role==='base')basePoses.set(comparisonKey,row);else{const ref=basePoses.get(comparisonKey);if(!ref)throw Error('Missing base pose');for(const key of ['muzzle','pivotMatrix']){const a=row.hands[0][key],b=ref.hands[0][key];if(a.length!==b.length||a.some((v,i)=>!Number.isFinite(v)||Math.abs(v-b[i])>1e-8))throw Error('C3 native pose drift '+key);}if(row.triangles!==ref.triangles||row.drawCalls!==ref.drawCalls)throw Error('Color-only C3 changed render submissions');}frames.push(row);
  }
 }
 if(frames.length!==8)throw Error('Expected eight matched Machine Neo/Bloblobber Deco views');
 return {scope:'Native weapon component visibility; controlled presentation states, no gameplay firing admission or character render',frames};
 }finally{
  Math.random=before.random;G.actors=before.actors;G.time=before.time;
  const errors=[];try{camera.position.copy(before.cameraPosition);camera.quaternion.copy(before.cameraQuaternion);camera.updateMatrixWorld(true);}catch(e){errors.push(String(e));}
  for(const a of owned)try{a.character.dispose();}catch(e){errors.push(String(e));}if(errors.length)throw Error('Native capture cleanup: '+errors.join('; '));
 }
}
