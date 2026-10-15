// Controlled renderer submission plus synchronous RGBA readback; not frame rate.
export async function compareNativeWeaponWork({api,R,THREE,scene,renderer,camera}){
 const {Actor,Character,G}=api,now=window.__captureNativeNow;
 if(typeof now!=='function')throw Error('Native measurement clock unavailable');
 const before={actors:G.actors,time:G.time,position:camera.position.clone(),quaternion:camera.quaternion.clone()};
 const rows=[["s3-shelter-wide-01", "s3-shelter-wide"], ["s3-shelter-wide-02", "s3-shelter-wide"], ["s3-shelter-focus-01", "s3-shelter-focus"], ["s3-stringer-short-01", "s3-stringer-short"], ["s3-stringer-normal-01", "s3-stringer-normal"], ["s3-stringer-explosion-01", "s3-stringer-explosion"], ["s3-roller-heavy-01", "s3-roller-heavy"], ["s3-slosher-diffusion-01", "s3-slosher-diffusion"]];
 const owned=[],mounted=[],results=[],gl=renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
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

 const draw=()=>{const start=now();renderer.render(scene,camera);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const elapsed=now()-start;if(!Number.isFinite(elapsed)||elapsed<0||gl.getError()!==0)throw Error('Invalid measured render');return elapsed;};
 try{
 for(const [kit,base]of rows)for(const team of [0,1]){
  const pair=[];let view;
  for(const [role,id]of [['base',base],['variant',kit]]){
   G.actors=[];G.time=0;window.__abResetRng();const t=now(),a=new Actor({team,weapon:id,isLocal:false,name:'work-compare',CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});owned.push(a);const constructionMs=now()-t,ch=a.character;ch.actor=a;ch.onEvent=null;G.actors=[a];
   if(ch.weaponModel!==R.weaponModelKey(id))throw Error('Measured model selection');
   a.form='kid';a.kidT=10;a.grounded=a.ground.hit=true;a.intent.fire=false;a.vel.set(0,0,0);a.weaponRunner.charge=0;a.weaponRunner.charging=false;window.__abResetRng();
   for(let i=0;i<60;i++){G.time+=1/60;a._finishFrame(1/60);}ch.root.updateMatrixWorld(true);
   const snapshots=snapshotHeld(nativeHands(ch.weapon,base==='s3-maneuver-short')),group=new THREE.Group();scene.add(group);mounted.push({snapshots,group,ch});mountHeld(snapshots,group);
   if(role==='base'){const box=new THREE.Box3().setFromObject(group),center=box.getCenter(new THREE.Vector3()),span=Math.max(...box.getSize(new THREE.Vector3()).toArray());if(!(span>0&&Number.isFinite(span)))throw Error('Invalid base framing');camera.position.copy(center).add(new THREE.Vector3(-1,.3,.5).normalize().multiplyScalar(span*2.5));camera.lookAt(center);view={position:camera.position.toArray(),quaternion:camera.quaternion.toArray()};}
   const firstMeasuredRenderMs=draw(),drawCalls=renderer.info.render.calls,triangles=renderer.info.render.triangles;
   if(!(triangles>0&&drawCalls>0))throw Error('Empty measured render');
   let geometryBytes=0;const seen=new Set(),arrays=new Set();const addAttribute=v=>{const array=v?.array||v?.data?.array;if(!array||!Number.isInteger(array.byteLength))throw Error('Unknown geometry attribute storage');if(!arrays.has(array)){arrays.add(array);geometryBytes+=array.byteLength;}};group.traverse(o=>{const g=o.geometry;if(!g||seen.has(g))return;seen.add(g);for(const v of Object.values(g.attributes))addAttribute(v);if(g.index)addAttribute(g.index);});
   group.visible=false;pair.push({role,a,ch,snapshots,group,constructionMs,firstMeasuredRenderMs,drawCalls,triangles,geometryBytes,steadyMs:[]});
  }
  for(let n=0;n<16;n++)for(const q of n%2?pair.slice().reverse():pair){q.group.visible=true;const ms=draw();q.group.visible=false;if(n>=4)q.steadyMs.push(ms);}
  for(const q of pair){restoreHeld(q.snapshots,q.group,scene,q.ch);mounted.splice(mounted.findIndex(x=>x.group===q.group),1);results.push({kit,base,team,role:q.role,constructionMs:q.constructionMs,firstMeasuredRenderMs:q.firstMeasuredRenderMs,drawCalls:q.drawCalls,triangles:q.triangles,geometryBytes:q.geometryBytes,steadyMs:q.steadyMs,camera:view});q.ch.dispose();owned.splice(owned.indexOf(q.a),1);}
 }
 return {scope:'Single-browser controlled native held-model render submission plus synchronous full RGBA readback; construction includes Character fixture; first render may reuse shared shader caches; no GPU timer or gameplay FPS claim',warmupPerRole:4,samplesPerRole:12,width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,results};
 }finally{const cleanupErrors=[];for(const q of mounted)try{restoreHeld(q.snapshots,q.group,scene,q.ch);}catch(e){cleanupErrors.push(String(e));}G.actors=before.actors;G.time=before.time;try{camera.position.copy(before.position);camera.quaternion.copy(before.quaternion);camera.updateMatrixWorld(true);}catch(e){cleanupErrors.push(String(e));}for(const a of owned)try{a.character.dispose();}catch(e){cleanupErrors.push(String(e));}if(cleanupErrors.length)throw Error('Measured native cleanup: '+cleanupErrors.join('; '));}
}
