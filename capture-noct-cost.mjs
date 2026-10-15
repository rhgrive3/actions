// Narrow real-Actor NOC-T comparison. The caller binds both emitted graphs and native lighting.
export async function captureNoctCost({api,R,THREE,scene,renderer,camera,role,reference=null}){
 const {Actor,Character,G}=api,now=window.__captureNativeNow;
 if(typeof now!=='function'||!['current','light'].includes(role))throw Error('Invalid NOC-T capture contract');
 if(role==='light'&&!reference)throw Error('Current camera/state reference required');
 const before={actors:G.actors,time:G.time,projectiles:G.projectiles,random:Math.random,position:camera.position.clone(),quaternion:camera.quaternion.clone()};
 const owned=[],mounted=[],frames=[],traces=[],views={},gl=renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);let projectiles,active;
 let rng=0;const reset=()=>{rng=0x6b17a9c3;};const finite=(v)=>v.length>0&&v.every(Number.isFinite);
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

 const draw=()=>{const t=now();renderer.render(scene,camera);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const ms=now()-t;if(!Number.isFinite(ms)||ms<0||gl.getError()!==0)throw Error('Invalid NOC-T readback');return ms;};
 const cost=hands=>{let bytes=0;const geometries=new Set(),arrays=new Set();for(const w of hands)w.pivot.traverse(o=>{const g=o.geometry;if(!g||geometries.has(g))return;geometries.add(g);for(const a of [...Object.values(g.attributes),...(g.index?[g.index]:[])]){const arr=a.array||a.data?.array;if(!arr||!Number.isInteger(arr.byteLength))throw Error('Unknown attribute storage');if(!arrays.has(arr)){arrays.add(arr);bytes+=arr.byteLength;}}});return {uniqueAttributeArrayBytes:bytes,scope:'all native pivot descendant geometries including hidden/far; unique geometry and typed-array identity'};};
 let primaryError;

 try{
 Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};projectiles=new api.Projectiles({add(){},remove(){}});G.projectiles=projectiles;const originalPush=projectiles._push;if(typeof originalPush!=='function')throw Error('Actual projectile admission required');projectiles._push=function(...args){const result=originalPush.apply(this,args);if(!active)throw Error('Projectile outside measured native actor');active.births++;return result;};
 for(const team of [0,1]){
  const pair=[];
  for(const label of ['base',role]){const id=label==='base'?'s3-maneuver-short':'s3-maneuver-short-02';G.actors=[];G.time=0;reset();const t=now(),a=new Actor({team,weapon:id,isLocal:false,CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});owned.push(a);const constructionMs=now()-t,ch=a.character;ch.actor=a;ch.onEvent=null;a.form='kid';a.kidT=10;a.grounded=a.ground.hit=true;a.vel.set(0,0,0);if(ch.weaponModel!==R.weaponModelKey(id)||ch.weapon.def.modelId!=='s3-maneuver-short'||(label!=='base'&&ch.weapon.def.modelVariantId!=='Maneuver_Short_02'))throw Error('Wrong NOC-T selection');const hands=nativeHands(ch.weapon,true),geometry=cost(hands);if(label!=='base'){const expected=role==='current'?579452:411428;if(geometry.uniqueAttributeArrayBytes!==expected)throw Error('NOC-T exact geometry cost mismatch');}pair.push({a,ch,hands,label,id,constructionMs,geometry,moved:[false,false],births:0,trace:[]});}
  for(let tick=0;tick<120;tick++){
   for(const q of pair){active=q;G.actors=[q.a];G.time=(tick+1)/60;reset();q.a.ink=100;const fire=tick>=30&&tick<100;q.a.intent.fire=fire;q.a.weaponRunner.update(1/60,{fire,firePressed:tick===30});q.a._finishFrame(1/60);q.ch.root.updateMatrixWorld(true);const hands=q.hands.map((w,i)=>{q.moved[i]||=Math.abs(w.parts.trigger.rotation.x)>.001;if(w.near!==true||!w.body.visible||w.bodyFar.visible)throw Error('Near native hands required');const matrices=[w.pivot,...Object.values(w.parts)].map(x=>x.matrixWorld.toArray());if(!finite(matrices.flat()))throw Error('Invalid native hand matrices');return {matrices,muzzle:w.muzzle.getWorldPosition(new THREE.Vector3()).toArray()};});q.trace.push({tick,births:q.births,ink:q.a.ink,sinceHand:Array.from(q.a.weaponRunner.sinceHand),pose:Array.from(q.ch.P),hands});}
   if(tick!==29&&tick!==99)continue;
   const state=tick===29?'rest':'firing',key=team+':'+state;
   for(const q of pair){q.snapshots=snapshotHeld(q.hands);q.group=new THREE.Group();scene.add(q.group);mounted.push(q);mountHeld(q.snapshots,q.group);q.group.visible=false;}
   if(reference){const v=reference.views[key];if(!v||v.position?.length!==3||v.quaternion?.length!==4||!finite(v.position)||!finite(v.quaternion))throw Error('Missing matched camera');camera.position.fromArray(v.position);camera.quaternion.fromArray(v.quaternion);camera.updateMatrixWorld(true);}
   else {const box=new THREE.Box3();for(const q of pair)box.union(new THREE.Box3().setFromObject(q.group));const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),span=Math.max(...size.toArray());if(!(span>0&&Number.isFinite(span)))throw Error('Invalid Noct bounds');camera.position.copy(center).addScaledVector(new THREE.Vector3(-1,.35,-.8).normalize(),span*3.5);camera.lookAt(center);camera.updateMatrixWorld(true);}
   views[key]={position:camera.position.toArray(),quaternion:camera.quaternion.toArray()};
   for(const q of pair){q.group.visible=true;q.firstRenderMs=draw();q.drawCalls=renderer.info.render.calls;q.triangles=renderer.info.render.triangles;q.group.visible=false;q.samples=[];}
   for(let n=0;n<16;n++)for(const q of n%2?[...pair].reverse():pair){q.group.visible=true;const ms=draw();q.group.visible=false;if(n>=4)q.samples.push(ms);}
   for(const q of pair){q.group.visible=true;draw();const box=new THREE.Box3().setFromObject(q.group),corners=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push(new THREE.Vector3(x,y,z).project(camera).toArray());if(!finite(corners.flat())||corners.flat().some(v=>v< -1||v>1))throw Error('NOC-T projected bounds');if(!(q.triangles>0&&q.drawCalls>0))throw Error('Empty NOC-T draw');if(q.label!=='base'&&q.triangles!==(role==='current'?22196:15672))throw Error('Unexpected visible NOC-T triangles');frames.push({role:q.label,team,state,id:q.id,geometry:q.geometry,camera:views[key],corners,constructionMs:q.constructionMs,firstRenderMs:q.firstRenderMs,steadyMs:q.samples,drawCalls:q.drawCalls,triangles:q.triangles,png:renderer.domElement.toDataURL('image/png')});q.group.visible=false;restoreHeld(q.snapshots,q.group,scene,q.ch);mounted.splice(mounted.indexOf(q),1);}
  }
  for(const q of pair){if(!q.moved.every(Boolean)||!(q.births>0))throw Error('Both native triggers and admitted shots required');q.a.weaponRunner.reset();if(Array.from(q.a.weaponRunner.sinceHand).some(v=>v!==99))throw Error('Native hand reset');traces.push({role:q.label,team,moved:q.moved,births:q.births,frames:q.trace});}
 }
 if(frames.length!==8)throw Error('Expected eight site-local Noct images');return {role,frames,traces,views,warmup:4,samples:12};
 }catch(error){primaryError=error;error.capturePartial={frames,traces,views,error:String(error)};throw error;}finally{const errors=[];for(const q of mounted)try{restoreHeld(q.snapshots,q.group,scene,q.ch);}catch(e){errors.push(String(e));}try{projectiles?.clear();}catch(e){errors.push(String(e));}G.actors=before.actors;G.time=before.time;G.projectiles=before.projectiles;Math.random=before.random;try{camera.position.copy(before.position);camera.quaternion.copy(before.quaternion);camera.updateMatrixWorld(true);}catch(e){errors.push(String(e));}for(const a of owned)try{a.character.dispose();}catch(e){errors.push(String(e));}if(errors.length){const error=new AggregateError([...(primaryError?[primaryError]:[]),...errors.map(x=>new Error(x))],'NOC-T capture/cleanup: '+[primaryError?String(primaryError):'',...errors].filter(Boolean).join('; '));error.capturePartial=primaryError?.capturePartial||{frames,traces,views,error:String(error)};throw error;}}
}
