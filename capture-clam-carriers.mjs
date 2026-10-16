// Four direct browser captures of actual native carriers. No character assets are edited.
export async function captureClamCarriers({api,THREE,RankedWorld,ClamsRule,scene,renderer,camera}){
 const {G,Actor,Character,Physics}=api,frames=[],saved={};
 for(const k of ['scene','camera','level','physics','actors','match','time'])saved[k]=G[k];
 const cameraSaved={p:camera.position.clone(),q:camera.quaternion.clone()};let primary;
 function releaseCharacter(s,c) { const errors=[];for(const task of [()=>s.remove(c.root),()=>c.dispose()])try{task();}catch(e){errors.push(e);}if(errors.length)throw new AggregateError(errors,'Carrier character cleanup failed',{cause:errors[0]}); }
 async function drainMotion(loaders,errors) { for(const result of await Promise.allSettled(loaders))if(result.status==='rejected')errors.push(result.reason); }
 const motionLoaders=[],owned=[];const check=(v,m)=>{if(!v)throw Error(m);};
 try{
  const block={id:0,solid:true,grate:false,faces:[-1,-1,-1,-1,-1,-1],center:new THREE.Vector3(0,-1,0),half:new THREE.Vector3(100,1,100),axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],aabbMin:new THREE.Vector3(-100,-2,-100),aabbMax:new THREE.Vector3(100,0,100)};
  G.level={...G.level,blocks:[block],groundHeight:()=>0,queryBlocks(_x,_z,_xx,_zz,out){out.length=0;out.push(0);return out;}};
  G.scene=scene;G.camera=camera;G.physics=new Physics(G.level);G.time=0;
  for(const team of [0,1]){
   const actor=new Actor({team,weapon:'shooter',isLocal:true,CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
   const ch=actor.character;if(ch._sourceMotionLoader?.then)motionLoaders.push(ch._sourceMotionLoader);owned.push(()=>releaseCharacter(scene,ch));actor.nid='carrier';ch.actor=actor;ch.onEvent=null;scene.add(ch.root);G.actors=[actor];
   actor.form='kid';actor.kidT=10;actor.grounded=actor.ground.hit=true;actor.pos.set(0,0,0);actor.vel.set(0,0,0);actor.yaw=0;
   const stage={clams:{spawns:[],goals:[[-50,0,0],[50,0,0]]}},engine={event(){}};engine.rule=new ClamsRule(engine,stage);
   const match={mode:'clams',actors:[actor],state:'playing',ranked:engine,playing:()=>true};G.match=match;
   const world=new RankedWorld({...api,G,THREE},match,stage);owned.push(()=>world.dispose());
   for(let i=1;i<=8;i++){
    const clam=engine.rule._newClam('small',null,[0,0,0]);check(engine.rule._pickup(clam,{id:'carrier',nid:'carrier',team,alive:true,pos:[0,0,0]},{}),'Native carrier pickup failed');
    if(i!==7&&i!==8)continue;
    const startClock=ch.t,startKid=actor.kidT;
    for(let tick=0;tick<30;tick++){
     actor.intent.fire=false;actor.intent.move.set(0,0,0);G.time+=1/60;actor.update(1/60);
     const pose=Array.from(ch.P),pos=actor.pos.toArray(),state=JSON.stringify(engine.rule.state);world.update(engine,1/60);
     check(JSON.stringify(Array.from(ch.P))===JSON.stringify(pose)&&JSON.stringify(actor.pos.toArray())===JSON.stringify(pos),'Carrier presentation changed native pose');
     check(JSON.stringify(engine.rule.state)===state,'Carrier presentation changed rules');
    }
    check(Number.isFinite(ch.t)&&Math.abs(ch.t-startClock-.5)<1e-6&&Math.abs(actor.kidT-startKid-.5)<1e-6,'Actual carrier native clock missing');
    check(Array.from(ch.P).length>0&&Array.from(ch.P).every(Number.isFinite),'Nonfinite carrier pose');
    for(const b of world.baskets)b.marker.visible=false;
    const root=world._inventoryMarkers.get('carrier');check(root?.visible,'Missing actual carrier inventory');
    const power=i===8,small=root.userData.smallClams;
    check(small.count===(power?0:7)&&root.userData.powerClam.visible===power,'Wrong actual carrier resource');
    scene.updateMatrixWorld(true);const p=root.getWorldPosition(new THREE.Vector3());
    check(Math.abs(p.z-(actor.pos.z-.72))<1e-6&&Math.abs(p.y-(actor.pos.y+(power?.34:.16)))<1e-6,'Actual carrier attachment');
    const target=actor.pos.clone().add(new THREE.Vector3(0,.65,-.25));camera.position.copy(target).add(new THREE.Vector3(2.8,1.1,-3.2));camera.lookAt(target);camera.updateMatrixWorld(true);
    const box=new THREE.Box3(),im=new THREE.Matrix4(),wm=new THREE.Matrix4();
    root.traverseVisible(o=>{if(!o.isMesh)return;if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();if(o.isInstancedMesh){for(let n=0;n<o.count;n++){o.getMatrixAt(n,im);wm.multiplyMatrices(o.matrixWorld,im);box.union(o.geometry.boundingBox.clone().applyMatrix4(wm));}}else box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));});
    check(!box.isEmpty(),'Empty carrier inventory bounds');let maxProjected=0;
    for(let n=0;n<8;n++){const v=new THREE.Vector3(n&1?box.max.x:box.min.x,n&2?box.max.y:box.min.y,n&4?box.max.z:box.min.z).project(camera);check(v.toArray().every(Number.isFinite)&&v.z>-1&&v.z<1,'Carrier depth clipping');maxProjected=Math.max(maxProjected,Math.abs(v.x),Math.abs(v.y));}check(maxProjected<.96,'Carrier inventory clipping');
    const gl=renderer.getContext();
    const signature=()=>{const pixels=new Uint8Array(renderer.domElement.width*renderer.domElement.height*4);gl.readPixels(0,0,renderer.domElement.width,renderer.domElement.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);check(!gl.isContextLost()&&gl.getError()===gl.NO_ERROR,'Carrier render failed');let h=2166136261;for(const v of pixels)h=Math.imul(h^v,16777619)>>>0;return h;};
    let blankSignature,blankCost;root.visible=false;try{renderer.info.reset();renderer.render(scene,camera);blankSignature=signature();blankCost={triangles:renderer.info.render.triangles,draws:renderer.info.render.calls};}finally{root.visible=true;}
    renderer.info.reset();renderer.render(scene,camera);const pixelSignature=signature();check(pixelSignature!==blankSignature,'Carrier inventory hidden pixels');
    const objectiveTriangles=renderer.info.render.triangles-blankCost.triangles,objectiveDraws=renderer.info.render.calls-blankCost.draws;check(objectiveTriangles===(power?288:896)&&objectiveDraws===1,'Actual carrier objective cost');
    frames.push({team,state:power?'power':'small7',clockDelta:ch.t-startClock,kidDelta:actor.kidT-startKid,pixelSignature,blankSignature,objectiveTriangles,objectiveDraws,maxProjected,bounds:{min:box.min.toArray(),max:box.max.toArray()},inventoryPosition:p.toArray(),actorPosition:actor.pos.toArray(),poseFinite:Array.from(ch.P).every(Number.isFinite),triangles:renderer.info.render.triangles,draws:renderer.info.render.calls,camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray()},png:renderer.domElement.toDataURL('image/png')});
   }
   owned.pop()();owned.pop()();
  }
  check(frames.length===4,'Missing actual carrier frames');return {scope:'Actual local native carriers for visual rear attachment inspection; no character model comparison',frames};
 }catch(e){primary=e;e.capturePartial={frames};throw e;}
 finally{
  const errors=[];for(const dispose of owned.reverse())try{dispose();}catch(e){errors.push(e);}
  await drainMotion(motionLoaders,errors);
  for(const restore of [...Object.entries(saved).map(([k,v])=>()=>{G[k]=v;}),()=>camera.position.copy(cameraSaved.p),()=>camera.quaternion.copy(cameraSaved.q),()=>camera.updateMatrixWorld(true)])try{restore();}catch(e){errors.push(e);}
  if(errors.length){const e=new AggregateError(primary?[primary,...errors]:errors,'Carrier cleanup failed',{cause:primary});e.capturePartial=primary?.capturePartial||{frames};throw e;}
 }
}
