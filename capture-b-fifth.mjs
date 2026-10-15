// Existing native batch attachment/pose path; caller owns exact build, environment and network binding.
export async function captureBFifth({api,R,THREE,scene,renderer,camera}){
 const {Actor,Character,G,WEAPONS}=api;
 const before={actors:G.actors,time:G.time,projectiles:G.projectiles,cameraPosition:camera.position.clone(),cameraQuaternion:camera.quaternion.clone(),random:Math.random};
 let rng=0x6b17a9c3,rngCalls=0;const resetRng=()=>{rng=0x6b17a9c3;rngCalls=0;};
 let currentCapture=null;let ownedProjectiles;const frames=[];const owned=[];const offs=[];let births=0,beamEvents=0,activeActor=null;const baseCameras=new Map(),basePoses=new Map();
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
  function inputSnapshot(row){return {births:row.births,beamEvents:row.beamEvents,hold:row.hold,time:row.time,charge:row.charge,sinceRelease:row.sinceRelease,rng:row.rng};}
  function validateInputs(row,ref){
   if(row.births!==ref.births||row.beamEvents!==ref.beamEvents||JSON.stringify(row.hold)!==JSON.stringify(ref.hold)||row.time!==ref.time||row.charge!==ref.charge||row.sinceRelease!==ref.sinceRelease||row.rng.state!==ref.rng.state||row.rng.calls!==ref.rng.calls)throw Error('B9 input or hold mismatch '+JSON.stringify({actual:inputSnapshot(row),expected:inputSnapshot(ref)}));
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

 try{
 Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;rngCalls++;return rng/4294967296;};
 if(camera.matrixAutoUpdate!==true)throw Error('B9 requires native automatic camera matrices');let occupied=false;scene.traverse(o=>{if(o.isMesh)occupied=true;});if(occupied)throw Error('B9 scene must contain only presentation environment');
 const entries=[{"baseId": "charger", "variantId": "Charger_Normal_01", "kitId": "charger-01", "view": [-1, 0.35, 0.65]}, {"baseId": "s3-charger-normalscope", "variantId": "Charger_NormalScope_01", "kitId": "s3-charger-normalscope-01", "view": [-1, 0.35, 0.65]}, {"baseId": "s3-charger-long", "variantId": "Charger_Long_01", "kitId": "s3-charger-long-01", "view": [-1, 0.35, 0.65]}, {"baseId": "s3-charger-longscope", "variantId": "Charger_LongScope_01", "kitId": "s3-charger-longscope-01", "view": [-1, 0.35, 0.65]}, {"baseId": "s3-charger-keeper", "variantId": "Charger_Keeper_01", "kitId": "s3-charger-keeper-01", "view": [-1, 0.35, 0.65]}, {"baseId": "s3-charger-light", "variantId": "Charger_Light_01", "kitId": "s3-charger-light-01", "view": [-1, 0.35, 0.65]}, {"baseId": "s3-charger-pencil", "variantId": "Charger_Pencil_01", "kitId": "s3-charger-pencil-01", "view": [-1, 0.35, 0.65]}, {"baseId": "charger", "variantId": "Charger_Normal_02", "kitId": "charger-02", "view": [-1, 0.35, 0.65]}, {"baseId": "s3-charger-normalscope", "variantId": "Charger_NormalScope_02", "kitId": "s3-charger-normalscope-02", "view": [-1, 0.35, 0.65]}];
 if(typeof api.Projectiles!=='function')throw Error('Missing native Projectiles');
 ownedProjectiles=new api.Projectiles({add(){},remove(){}});G.projectiles=ownedProjectiles;
 if(typeof api.onNativeEvent!=='function')throw Error('Missing native event observer');
 const push=ownedProjectiles._push;ownedProjectiles._push=function(...args){births++;return push.apply(this,args);};
 offs.push(api.onNativeEvent('weapon:fire',e=>{if(e.actor===activeActor&&Number.isFinite(e.len)&&e.len>0&&Number.isFinite(e.charge)&&e.charge>0&&e.muzzle?.toArray().every(Number.isFinite))beamEvents++;}));
 // Keep one native Actor per distinct base alive, warming presentation and projectile caches before pairing.
 for(const entry of entries.filter((e,i,a)=>a.findIndex(x=>x.baseId===e.baseId)===i))for(const team of [0]){
  currentCapture={phase:'native-cache-warmup',baseId:entry.baseId,team};G.actors=[];G.time=0;resetRng();const a=new Actor({team,weapon:entry.baseId,isLocal:false,name:'weapon-gallery-warmup',CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});owned.push(a);
  try{const ch=a.character;ch.actor=a;ch.onEvent=null;G.actors=[a];a.form='kid';a.kidT=10;a.grounded=a.ground.hit=true;a.vel.set(0,0,0);resetRng();
   for(let tick=0;tick<182;tick++){const fire=tick>=15&&tick<180;a.intent.fire=fire;G.time+=1/60;a.weaponRunner.update(1/60,{fire,firePressed:tick===15});a._finishFrame(1/60);}
  }finally{ownedProjectiles.clear();}
 }
 for(const entry of entries)for(const role of ['base','variant'])for(const team of [0,1]){
  const id=role==='base'?entry.baseId:entry.kitId,pairKey=entry.variantId+':'+team;
  const spec=R.weaponModelSpec(id),baseId=spec?.baseId||id,variantId=spec?.sourceRow||null;
  if(!WEAPONS[id]||!spec)throw Error('Missing actual model '+id);
  const official=api.ALTERNATE_WEAPON_KITS?.find(k=>k.main===entry.variantId);if(!official||official.id!==entry.kitId||official.baseId!==entry.baseId)throw Error('Wrong official charger kit mapping');
  if(role==='variant'?(spec.sourceRow!==entry.variantId||spec.baseId!==entry.baseId):spec.id!==entry.baseId)throw Error('Wrong native B9 identity');
  if(typeof api.Projectiles!=='function')throw Error('Missing native Projectiles');
  if(!ownedProjectiles){ownedProjectiles=new api.Projectiles({add(){},remove(){}});G.projectiles=ownedProjectiles;}
  ownedProjectiles.clear();G.actors=[];G.time=0;resetRng();
  const a=new Actor({team,weapon:id,isLocal:false,name:'weapon-gallery',CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});owned.push(a);
  const ch=a.character;ch.actor=a;ch.onEvent=null;G.actors=[a];activeActor=a;births=0;beamEvents=0;
  if(ch.root.parent||ch.weaponModel!==R.weaponModelKey(id)||ch.weapon.def.modelId!==baseId||(role==='variant'&&ch.weapon.def.modelVariantId!==entry.variantId))throw Error('Native model identity '+id);
  resetRng();
  const paired=false,states=['charge','release'];let tick=0;
  a.form='kid';a.kidT=10;a.grounded=a.ground.hit=true;a.vel.set(0,0,0);
  for(const state of states){
   currentCapture={id,team,state};const comparisonKey=pairKey+':'+state;
   const grounded=true,target=state==='charge'?180:182;
   for(;tick<target;tick++){const fire=tick>=15&&tick<180;a.intent.fire=fire;G.time+=1/60;a.weaponRunner.update(1/60,{fire,firePressed:tick===15});a._finishFrame(1/60);}
   if(state==='charge'&&!(a.weaponRunner.charge>=1))throw Error('Native charged Runner state missing');
   if(state==='release'){currentCapture={...currentCapture,lastRelease:ch.lastRelease,beamEvents,births,runnerCharge:a.weaponRunner.charge};if(!(ch.lastRelease<.05))throw Error('Native release event missing');if(entry.baseId==='charger'?(beamEvents<1||births!==0):births<1)throw Error('Native successful charger release missing');}
   if(!ch.P?.length||Array.from(ch.P).some(v=>!Number.isFinite(v))||!Array.from(ch.P).some(v=>v!==0))throw Error('Missing native charger pose');
   ch.root.updateMatrixWorld(true);const weapons=nativeHands(ch.weapon,paired),snapshots=snapshotHeld(weapons),group=new THREE.Group();scene.add(group);
   let row;
   try{
    mountHeld(snapshots,group);
    for(const w of weapons)if(w.near!==true||w.body.visible!==true||w.bodyFar.visible!==false)throw Error('Native near-body required');
    const bounds=new THREE.Box3().setFromObject(group),center=bounds.getCenter(new THREE.Vector3()),span=Math.max(...bounds.getSize(new THREE.Vector3()).toArray());
    if(!(span>0&&Number.isFinite(span)))throw Error('Invalid native held bounds');
    if(role==='base'){fitHeldCamera(bounds,center,entry.view,camera,THREE);baseCameras.set(comparisonKey,{position:camera.position.clone(),quaternion:camera.quaternion.clone()});}else{const fixed=baseCameras.get(comparisonKey);if(!fixed)throw Error('Missing base camera');camera.position.copy(fixed.position);camera.quaternion.copy(fixed.quaternion);}camera.updateMatrixWorld(true);
    const projected=[];for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])projected.push(new THREE.Vector3(x,y,z).project(camera));
    const projectedBounds=validateProjection(projected);
    const poseRng={state:rng,calls:rngCalls};
    try{renderer.render(scene,camera);renderer.render(scene,camera);}finally{rng=poseRng.state;rngCalls=poseRng.calls;}
    const gl=renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,rgba=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,rgba);const {foreground,quantizedColors}=validatePixels(rgba);
    if(renderer.getContext().getError()!==0||renderer.info.render.triangles<=0)throw Error('WebGL native held');
    row={id,kit:entry.kitId,rowId:entry.variantId,baseId,variantId,role,team,state,grounded,tick,pose:Array.from(ch.P),time:G.time,rng:poseRng,hold:JSON.parse(JSON.stringify(ch.hold)),foregroundPixels:foreground,quantizedColors,projectedBounds,partMatrices:Object.fromEntries(Object.entries(ch.weapon.parts).map(([n,p])=>{p.updateMatrixWorld(true);if(p.matrixWorld.elements.some(v=>!Number.isFinite(v)))throw Error('Nonfinite native part');return[n,p.matrixWorld.elements.slice()]})),births,beamEvents,charge:ch._wst.charge,sinceRelease:ch._wst.sinceRelease,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,memory:{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures},camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray()},hands:snapshots.map(({weapon,before},hand)=>({hand,near:weapon.near,bodyVisible:weapon.body.visible,bodyFarVisible:weapon.bodyFar.visible,muzzle:weapon.muzzle.getWorldPosition(new THREE.Vector3()).toArray(),pivotMatrix:before})),png:renderer.domElement.toDataURL('image/png').split(',')[1]};
   }finally{restoreHeld(snapshots,group,scene,ch);}
   row.restored=true;if(role==='base')basePoses.set(comparisonKey,row);else{const ref=basePoses.get(comparisonKey);if(!ref)throw Error('Missing base pose');for(const key of ['muzzle','pivotMatrix']){const a=row.hands[0][key],b=ref.hands[0][key];if(a.length!==b.length||a.some((v,i)=>!Number.isFinite(v)||Math.abs(v-b[i])>1e-8))throw Error('B9 native pose drift '+key);}currentCapture={id,team,state,actual:inputSnapshot(row),expected:inputSnapshot(ref)};validateInputs(row,ref);if(row.pose.length!==ref.pose.length||row.pose.some((v,i)=>Math.abs(v-ref.pose[i])>1e-8))throw Error('B9 public pose drift');if(JSON.stringify(Object.keys(row.partMatrices))!==JSON.stringify(Object.keys(ref.partMatrices)))throw Error('B9 part inventory drift');for(const n of Object.keys(ref.partMatrices)){const x=row.partMatrices[n],y=ref.partMatrices[n];if(!x||!y||x.length!==16||x.some((v,i)=>!Number.isFinite(v)||Math.abs(v-y[i])>1e-8))throw Error('B9 native part drift '+n);}if(row.triangles!==ref.triangles||row.drawCalls!==ref.drawCalls)throw Error('Color-only B9 changed render submissions');}frames.push(row);
  }
 }
 if(frames.length!==72)throw Error('Expected 72 matched B9 charge/release views');
 return {scope:'Native weapon component visibility through actual Runner charge/release and Character updates; no character render or gameplay damage qualification',frames};
 }catch(error){error.capturePartial={frames,state:currentCapture,error:String(error)};throw error;}finally{
  const errors=[];for(const off of offs)try{off();}catch(e){errors.push(String(e));}try{ownedProjectiles?.clear();}catch(e){errors.push(String(e));}G.projectiles=before.projectiles;Math.random=before.random;G.actors=before.actors;G.time=before.time;try{camera.position.copy(before.cameraPosition);camera.quaternion.copy(before.cameraQuaternion);camera.updateMatrixWorld(true);}catch(e){errors.push(String(e));}
  for(const a of owned)try{a.character.dispose();}catch(e){errors.push(String(e));}if(errors.length)throw Error('Native character cleanup: '+errors.join('; '));
 }
}
