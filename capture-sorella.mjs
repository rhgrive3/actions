// Native held-component comparison; caller binds source, emitted inputs and day environment.
export async function captureSorella({api,R,THREE,scene,renderer,camera}){
 const {Actor,Character,G}=api,dt=1/60;
 const saved={actors:G.actors,time:G.time,projectiles:G.projectiles,segment:G.physics.segment,cameraPosition:camera.position.clone(),cameraQuaternion:camera.quaternion.clone()};
 let lastObservation=null;
 const frames=[],owned=[],reference=new Map();let ownedProjectiles=null;
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

      function observeCanopyHandoff(before, wasLaunched, after, actor, weaponId, scene, source) {
        const mesh = before?.mesh;
        return !!before && wasLaunched === false && before.launched === true && after === null
          && before.owner === actor && before.weaponId === weaponId && before.visualSource === source
          && Number.isFinite(before.remaining) && before.remaining > 0
          && mesh?.parent === scene && mesh.visible === true && mesh.name === 'brella-canopy:' + weaponId
          && !!before.visualSource?.parts?.canopy?.geo
          && ['canopy', 'canopyInk'].every(name => !before.visualSource.parts[name] || mesh.children.some(part =>
            part.name === name && part.isMesh && part.geometry === before.visualSource.parts[name].geo && part.visible === true));
      }
      function heldCanopyHidden(weapon) {
        return !!weapon.parts.canopy && ['canopy', 'canopyInk'].every(name => !weapon.parts[name] || weapon.parts[name].visible === false);
      }
      // makeAnimate damps bv toward zero at 28/s and hides at <= .02.
      // Runner.update precedes _finishFrame/Character.update, so launch includes application 1.
      function canopyHideApplications(dt) { return Math.ceil(Math.log(.02) / (-28 * dt)); }
      function observeHeldAfterHandoff(pending, frame, state, weapon, actor, weaponId, scene) {
        if (!pending || !Number.isInteger(frame) || frame < pending.frame
          || frame - pending.frame >= canopyHideApplications(1 / 60)) return false;
        if (weapon !== pending.weapon || state?.canopy !== null || !(state.naked > 0)
          || pending.canopy.mesh !== pending.mesh || pending.canopy.visualSource !== pending.source
          || !observeCanopyHandoff(pending.canopy, false, state.canopy, actor, weaponId, scene, weapon.def)) return false;
        return heldCanopyHidden(weapon);
      }

 function finite(values,label){if(!values.length||!values.every(Number.isFinite))throw Error('Nonfinite '+label);}
 function compare(a,b,label){if(a.length!==b.length||a.some((v,i)=>!Number.isFinite(v)||Math.abs(v-b[i])>1e-8))throw Error('Base/variant native mismatch '+label);}
 try{
 ownedProjectiles=new api.Projectiles({add(){},remove(){}});G.projectiles=ownedProjectiles;
 G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 for(const team of [0,1])for(const role of ['base','variant']){
  const id=role==='base'?'s3-shelter-normal':'s3-shelter-normal-01';
  if((R.weaponModelSpec(id)?.baseId||id)!=='s3-shelter-normal')throw Error('Sorella base mismatch');
  if(role==='variant'&&R.weaponModelSpec(id)?.sourceRow!=='Shelter_Normal_01')throw Error('Sorella appearance missing');
  G.projectiles.clear();G.actors=[];G.time=0;window.__abResetRng();
  const a=new Actor({team,weapon:id,isLocal:true,name:'sorella-native',CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character,w=ch.weapon;owned.push(a);
  ch.actor=a;ch.onEvent=null;ch.setLod('game');a.grounded=a.ground.hit=true;a.form='kid';a.kidT=10;G.actors=[a];
  if(ch.root.parent||w.def.modelId!=='s3-shelter-normal')throw Error('Unexpected held model');
  if(role==='variant'&&w.def.modelVariantId!=='Shelter_Normal_01')throw Error('Wrong emitted Sorella');
  const catalogId=a.weapon.catalogRecord?.id;
  if(catalogId!=='s3-shelter-normal'||catalogId!==w.def.modelId)throw Error('Wrong native catalog base identity');
  if(ch._sourceMotionLoader)await ch._sourceMotionLoader;if(ch.sourceMotion?.ready)await ch.sourceMotion.ready;
  window.__abResetRng();
  let frame=0,lastFire=false,pending=null,maxGrip=0;
  const tick=fire=>{
   a.ink=100;a.intent.fire=fire;a.aimPitch=0;a.vel.set(0,0,0);const c=a.weaponRunner.catalogState?.canopy,launched=c?.launched;
   G.time+=dt;a.weaponRunner.update(dt,{fire,firePressed:fire&&!lastFire});a._finishFrame(dt);ch.root.updateMatrixWorld(true);lastFire=fire;
   finite([...ch.P],'pose');
   if(w.near!==true||w.body.visible!==true||w.bodyFar.visible!==false)throw Error('Sorella near body required');
   const C=api.CHARACTER_CHANNELS;if(ch.P[C.IKL]>.99&&ch.P[C.LTW]<.001){const grip=w.off.localToWorld(w.def.handL.pos.clone()).distanceTo(ch.bones.handL.getWorldPosition(new THREE.Vector3()));if(!Number.isFinite(grip)||grip>.008)throw Error('Sorella grip error');maxGrip=Math.max(maxGrip,grip);}
   const state=a.weaponRunner.catalogState;
   if(observeCanopyHandoff(c,launched,state?.canopy,a,catalogId,scene,w.def))pending={canopy:c,mesh:c.mesh,source:c.visualSource,weapon:w,frame};
   lastObservation={id,catalogId,role,team,frame,heldCanopy:!!state?.canopy,naked:state?.naked,pending:!!pending,observedWeaponId:c?.weaponId||null,observedMeshName:c?.mesh?.name||null,observedOwner:c?.owner===a,observedSource:c?.visualSource===w.def,bo:w.ps.bo,bv:w.ps.bv};
   frame++;return state;
  };
  const snap=state=>{
   const snapshots=snapshotHeld([w]),group=new THREE.Group();scene.add(group);let row;
   try{
    mountHeld(snapshots,group);camera.position.set(-2.8,1.8,3.5);camera.lookAt(0,.8,.5);camera.updateMatrixWorld(true);
    renderer.render(scene,camera);renderer.render(scene,camera);
    if(renderer.getContext().getError()!==0||renderer.info.render.triangles<=0)throw Error('Sorella WebGL');
    const cs=a.weaponRunner.catalogState;
    row={role,id,team,state,frame,variantId:w.def.modelVariantId,baseId:w.def.modelId,grounded:a.grounded,near:w.near,bodyVisible:w.body.visible,bodyFarVisible:w.bodyFar.visible,pivotMatrix:snapshots[0].before,muzzle:w.muzzle.getWorldPosition(new THREE.Vector3()).toArray(),camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray()},bo:w.ps.bo,bv:w.ps.bv,naked:cs.naked,heldCanopy:!!cs.canopy,canopyVisible:w.parts.canopy.visible,canopyInkVisible:w.parts.canopyInk?.visible??null,maxGrip,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,png:renderer.domElement.toDataURL('image/png').split(',')[1]};
    finite([...row.pivotMatrix,...row.muzzle,row.bo,row.bv,row.naked,row.maxGrip],'receipt');
    const key=team+':'+state;
    if(role==='base')reference.set(key,row);else{const base=reference.get(key);if(!base)throw Error('Missing base comparison');for(const k of ['pivotMatrix','muzzle'])compare(row[k],base[k],k);for(const k of ['frame','grounded','near','bodyVisible','bodyFarVisible','heldCanopy','canopyVisible','canopyInkVisible'])if(row[k]!==base[k])throw Error('State mismatch '+k);compare([row.bo,row.bv,row.naked],[base.bo,base.bv,base.naked],'animation');if(row.triangles>base.triangles||row.drawCalls>base.drawCalls)throw Error('Sorella render submission increased');}
   }finally{restoreHeld(snapshots,group,scene,ch);}
   row.restored=true;frames.push(row);
  };
  for(let n=0;n<60;n++)tick(false);snap('initial');
  for(let n=0;n<100;n++){const cs=tick(true);if(cs.canopy?.open&&w.ps.bo>.9)break;}
  if(!a.weaponRunner.catalogState.canopy?.open||!(w.ps.bo>.9))throw Error('Missing native open');snap('open');
  for(let n=0;n<90;n++)tick(false);
  if(!(w.ps.bo<.02)||!w.parts.canopy.visible)throw Error('Missing native close');snap('closed');
  pending=null;
  for(let n=0;n<400;n++){
   const cs=tick(true);if(!pending)continue;
   const current=frame-1;
   if(!observeCanopyHandoff(pending.canopy,false,cs.canopy,a,catalogId,scene,w.def)||pending.canopy.mesh!==pending.mesh||pending.canopy.visualSource!==pending.source)throw Error('Detached ownership lost');
   if(current-pending.frame>=canopyHideApplications(dt))throw Error('Native hide bound');
   if(observeHeldAfterHandoff(pending,current,cs,w,a,catalogId,scene)){snap('launched');break;}
  }
  if(!frames.some(r=>r.role===role&&r.team===team&&r.state==='launched'))throw Error('Missing launch');
  G.projectiles.clear();a.weaponRunner.reset();pending=null;lastFire=false;
  for(let n=0;n<100;n++){const cs=tick(true);if(cs.canopy?.open&&w.ps.bo>.9)break;}
  const can=a.weaponRunner.catalogState.canopy;if(!can?.open||can.launched)throw Error('Missing break target');
  const axis=can.dir.clone().normalize(),shot={team:1-team,prev:can.pos.clone().addScaledVector(axis,-2),pos:can.pos.clone().addScaledVector(axis,2),damage:can.hp+1,ghost:false};
  const friendly=G.projectiles.kitDefenseCandidate({...shot,team});if(friendly)throw Error('Friendly shot admitted to canopy defense');
  const hit=G.projectiles.kitDefenseCandidate(shot);if(!hit?.onHit)throw Error('Missing real canopy defense');const beforeHP=can.hp;hit.onHit({...shot,ghost:true});if(can.hp!==beforeHP||a.weaponRunner.catalogState.canopy!==can)throw Error('Ghost shot changed canopy');hit.onHit(shot);
  if(a.weaponRunner.catalogState.canopy!==null||!(a.weaponRunner.catalogState.naked>0))throw Error('Native canopy break missing');
  for(let n=0;n<9;n++)tick(false);
  if(!heldCanopyHidden(w))throw Error('Broken canopy still visible');snap('broken');
  G.projectiles.clear();ch.dispose();owned.pop();
 }
 if(frames.length!==20)throw Error('Expected twenty matched Sorella images');
 return {frames,scope:'Actual native Runner/Actor animation and damage admission with controlled level/projectile rendering; held weapon components only, no full Game/compositor or FPS claim'};
 }catch(error){error.capturePartial={frames,state:lastObservation,error:String(error)};throw error; }finally{
  const cleanupErrors=[];try{ownedProjectiles?.clear();}catch(e){cleanupErrors.push(String(e));}G.projectiles=saved.projectiles;G.actors=saved.actors;G.time=saved.time;G.physics.segment=saved.segment;try{camera.position.copy(saved.cameraPosition);camera.quaternion.copy(saved.cameraQuaternion);camera.updateMatrixWorld(true);}catch(e){cleanupErrors.push(String(e));}for(const a of owned)try{a.character.dispose();}catch(e){cleanupErrors.push(String(e));}if(cleanupErrors.length)throw Error('Sorella cleanup: '+cleanupErrors.join('; '));
 }
}
