// Uses the actual delivered RankedWorld and ClamsRule. Carrier positions are
// a deterministic component fixture; no character or stage assets are loaded.
export async function captureClamModels({THREE,RankedWorld,ClamsRule,scene,renderer,camera}) {
 const frames=[],owned=[],saved={position:camera.position.clone(),quaternion:camera.quaternion.clone()};
 let primary=null;
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 let floor;
 const pixelSignature=()=>{
  const gl=renderer.getContext(),p=new Uint8Array(renderer.domElement.width*renderer.domElement.height*4);gl.readPixels(0,0,renderer.domElement.width,renderer.domElement.height,gl.RGBA,gl.UNSIGNED_BYTE,p);
  check(!gl.isContextLost()&&gl.getError()===gl.NO_ERROR,'WebGL capture failed');
  let h=2166136261;for(let i=0;i<p.length;i++)h=Math.imul(h^p[i],16777619)>>>0;return h;
 };
 function visibleBounds(root){
  const result=new THREE.Box3(),instance=new THREE.Matrix4(),matrix=new THREE.Matrix4();
  root.traverseVisible(object=>{
   if(!object.isMesh||!object.geometry)return;
   const g=object.geometry;if(!g.boundingBox)g.computeBoundingBox();
   if(object.isInstancedMesh){for(let i=0;i<object.count;i++){object.getMatrixAt(i,instance);matrix.multiplyMatrices(object.matrixWorld,instance);result.union(g.boundingBox.clone().applyMatrix4(matrix));}}
   else result.union(g.boundingBox.clone().applyMatrix4(object.matrixWorld));
  });return result;
 }
 function bounds(root){
  const b=visibleBounds(root);check(!b.isEmpty(),'Empty objective bounds');
  const min=b.min,max=b.max;
  for(let i=0;i<8;i++){
   const v=new THREE.Vector3(i&1?max.x:min.x,i&2?max.y:min.y,i&4?max.z:min.z).project(camera);
   check(v.toArray().every(Number.isFinite)&&Math.abs(v.x)<.96&&Math.abs(v.y)<.96&&v.z>-1&&v.z<1,'Objective clipping');
  }
  check(min.y>=-.012,'Objective buried below floor');return {min:min.toArray(),max:max.toArray()};
 }
 async function capture(root,team,state,triangles,distance,observed){
  scene.updateMatrixWorld(true);const center=visibleBounds(root).getCenter(new THREE.Vector3());
  const radius=visibleBounds(root).getSize(new THREE.Vector3()).length()/2;
  const vertical=camera.fov*Math.PI/360,horizontal=Math.atan(Math.tan(vertical)*camera.aspect);
  const nearDistance=Math.max(2.3,radius/Math.sin(Math.min(vertical,horizontal))/.85+camera.near);
  const d=nearDistance*(distance==='near'?1:2);
  camera.position.copy(center).add(new THREE.Vector3(.9,.6,1).normalize().multiplyScalar(d));camera.lookAt(center);camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);
  const box=bounds(root),visible=root.visible;
  root.visible=false;renderer.info.reset();renderer.render(scene,camera);const empty={triangles:renderer.info.render.triangles,calls:renderer.info.render.calls,pixels:pixelSignature()};
  root.visible=visible;renderer.info.reset();renderer.render(scene,camera);const rendered={triangles:renderer.info.render.triangles,calls:renderer.info.render.calls,pixels:pixelSignature()};
  check(rendered.triangles-empty.triangles===triangles,'Objective triangle budget mismatch');check(rendered.calls-empty.calls===1,'Objective draw budget mismatch');check(rendered.pixels!==empty.pixels,'Objective empty pixels');
  frames.push({team,state,distance,observed,triangles:rendered.triangles-empty.triangles,draws:rendered.calls-empty.calls,bounds:box,camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray()},pixelSignature:rendered.pixels,blankSignature:empty.pixels,png:renderer.domElement.toDataURL('image/png')});
 }
 try {
  const geometry=new THREE.PlaneGeometry(20,20);owned.push({dispose:()=>geometry.dispose()});
  const material=new THREE.MeshStandardMaterial({color:0x787878,roughness:.9});owned.push({dispose:()=>material.dispose()});
  floor=new THREE.Mesh(geometry,material);owned.push({dispose:()=>scene.remove(floor)});
  floor.rotation.x=-Math.PI/2;floor.position.y=-.008;scene.add(floor);
  for(const team of[0,1]){
   const stage={clams:{spawns:[],goals:[[-50,0,0],[50,0,0]]}},actor={id:'carrier',nid:'carrier',team,alive:true,yaw:0,pos:new THREE.Vector3()};
   const G={scene,time:0},engine={event(){}};engine.rule=new ClamsRule(engine,stage);const r=engine.rule;
   const world=new RankedWorld({G,THREE},{mode:'clams',actors:[actor]},stage);owned.push(world);
   const update=()=>{const before=JSON.stringify(r.state);world.update(engine,1/60);check(before===JSON.stringify(r.state),'Presentation changed rule state');for(const b of world.baskets)b.marker.visible=false;scene.updateMatrixWorld(true);};
   const both=async(root,state,triangles)=>{
    const inventory=r.state.inventories.carrier||{small:0,power:false};
    const field=[...world._clamMarkers].find(([,entry])=>entry.mesh===root);
    const clam=field?r.state.clams.find(c=>c.id===field[0]):null;
    const observed={inventorySmall:inventory.small||0,inventoryPower:!!inventory.power,rootVisible:root.visible,
     fieldKind:clam?.kind??null,fieldTeam:clam?.team??null,grounded:clam?!!clam.grounded:null,
     instances:clam?null:root.userData.smallClams.count};
    for(const distance of['near','far'])await capture(root,team,state,triangles,distance,observed);
   };
   const small=r._newClam('small',null,[0,0,0]);update();await both(world._clamMarkers.get(small.id).mesh,'small-field',128);
   check(r._pickup(small,{...actor,pos:[0,0,0]},{}),'Small pickup failed');update();await both(world._inventoryMarkers.get('carrier'),'small-held-1',128);
   for(let i=2;i<=8;i++){
    const c=r._newClam('small',null,[0,0,0]);check(r._pickup(c,{...actor,pos:[0,0,0]},{}),'Conversion pickup failed');update();
    if(i===7)await both(world._inventoryMarkers.get('carrier'),'small-held-7',896);
   }
   check(r.state.inventories.carrier.power,'Eight clams did not form power');await both(world._inventoryMarkers.get('carrier'),'power-created',288);
   check(r._throw({...actor,pos:[0,0,0]},{aim:[0,0,1]},{actors:[]}), 'Power throw failed');r._advanceProjectiles(1/60,{actors:[],floorAt:()=>0,blocked:()=>false});update();
   const thrown=r.state.clams.find(c=>c.kind==='power');check(thrown&&!thrown.grounded,'Power birth missing');await both(world._clamMarkers.get(thrown.id).mesh,'power-thrown',288);
   r.state.clams=[];const field=r._newClam('power',team,[0,0,0]);update();await both(world._clamMarkers.get(field.id).mesh,'power-field',288);
   world.dispose();owned.splice(owned.indexOf(world),1);check(!world.group.parent,'World retained after disposal');
  }
  check(frames.length===24,'Missing clam frame');return {scope:'Actual delivered RankedWorld/ClamsRule plus synthetic carriers and floor; software GPU, not full stage/network/device',frames};
 }catch(error){primary=error;error.capturePartial={frames};throw error;}
 finally{
  const errors=[];for(const o of owned.reverse())try{if(o.dispose)o.dispose();else{scene.remove(o);o.geometry.dispose();o.material.dispose();}}catch(e){errors.push(e);}
  try{camera.position.copy(saved.position);camera.quaternion.copy(saved.quaternion);camera.updateMatrixWorld(true);}catch(e){errors.push(e);}
  if(errors.length){const e=new AggregateError(primary?[primary,...errors]:errors,'Objective cleanup failed',{cause:primary});e.capturePartial=primary?.capturePartial||{frames};throw e;}
 }
}
