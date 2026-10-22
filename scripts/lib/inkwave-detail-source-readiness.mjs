// QA-only source readiness gate. No animation clock, form or visibility mutation.
export async function awaitDetailSourceOwner(character, timeoutMs=180000) {
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw Error('Invalid source readiness timeout');
  const initial=character?.sourceMotion;
  if(!initial?.ready || typeof initial.ready.then!=='function')throw Error('Missing actual source motion readiness promise');
  let timer;
  try {
    await Promise.race([initial.ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Source motion readiness timeout')),timeoutMs);})]);
  } finally {clearTimeout(timer);}
  const owner=character.sourceMotion;
  if(!owner||owner.status!=='ready'||owner.enabled!==true||owner.error||owner.disposed
    ||!['Player00','Player01'].includes(owner.variant)||!owner.bank?.clips?.has('WaitHold_Nrml')
    ||!owner.squidBank?.clips?.has('Sqd_Walk')||!owner.squidBank.clips.has('Sqd_ToSquid')
    ||owner.squidRig?.character!==character)
    throw Error('Source motion owner did not load; native fallback is not accepted');
  return owner;
}
export function detailSourceOwnerReceipt(character, owner, requireActive=true) {
  if(character?.sourceMotion!==owner||owner?.status!=='ready'||owner.enabled!==true||owner.error||owner.disposed)
    throw Error('Source motion owner changed or became unavailable');
  if(requireActive&&owner.active!==true)throw Error('Source motion owner is not active');
  const clips=owner.currentClips;
  if(requireActive&&(!Array.isArray(clips)||!clips.length||clips.length>32))throw Error('Missing active source clips');
  const human=(clips||[]).map(clip=>{
    if(typeof clip.name!=='string'||clip.name.length>96||!owner.bank.clips.has(clip.name)
      ||!Number.isFinite(clip.frame)||!Number.isFinite(clip.weight))throw Error('Invalid loaded human clip identity');
    return {name:clip.name,frame:clip.frame,weight:clip.weight};
  });
  const sq=owner.debug?.squid;
  let squid=null;
  if(character.sqScale>.001&&requireActive){
    if(!sq||typeof sq.name!=='string'||sq.name.length>96||!owner.squidBank.clips.has(sq.name)||!Number.isFinite(sq.frame))
      throw Error('Invalid loaded squid clip identity');
    squid={name:sq.name,frame:sq.frame};
  }
  return {status:owner.status,enabled:owner.enabled,active:owner.active===true,variant:owner.variant,
    sameOwner:true,human,squid};
}

// Read only actual draw-eligible indexed vertices through Three's CPU skinning API.
// GPU vertex-shader displacement, clipping and depth occlusion are NOT represented.
export function detailCpuDrawBounds(root, makeVector, camera, maxEntries=250000) {
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  const projectedMin=[Infinity,Infinity,Infinity],projectedMax=[-Infinity,-Infinity,-Infinity];
  let indexedVertices=0,eligibleMeshes=0,nonFiniteVertices=0,unsupportedMeshes=0,truncated=false;
  root.traverseVisible(mesh=>{
    if(!mesh.isMesh)return;
    if(mesh.isInstancedMesh||!mesh.geometry?.index||typeof mesh.getVertexPosition!=='function'){unsupportedMeshes++;return;}
    const g=mesh.geometry,index=g.index,range=g.drawRange||{start:0,count:Infinity};
    const groups=Array.isArray(mesh.material)?(g.groups||[]):[{start:0,count:index.count,materialIndex:0}];
    let accepted=false;
    for(const group of groups){
      const mat=Array.isArray(mesh.material)?mesh.material[group.materialIndex||0]:mesh.material;
      if(!mat||mat.visible===false||mat.colorWrite===false)continue;
      const lo=Math.max(0,group.start,range.start),hi=Math.min(index.count,group.start+group.count,range.start+range.count);
      for(let i=lo;i<hi;i++){
        if(indexedVertices>=maxEntries){truncated=true;break;}
        const v=makeVector();mesh.getVertexPosition(index.getX(i),v);v.applyMatrix4(mesh.matrixWorld);
        indexedVertices++;accepted=true;
        const world=[v.x,v.y,v.z];
        if(!world.every(Number.isFinite)){nonFiniteVertices++;continue;}
        for(let k=0;k<3;k++){min[k]=Math.min(min[k],world[k]);max[k]=Math.max(max[k],world[k]);}
        v.project(camera);const ndc=[v.x,v.y,v.z];
        if(!ndc.every(Number.isFinite)){nonFiniteVertices++;continue;}
        for(let k=0;k<3;k++){projectedMin[k]=Math.min(projectedMin[k],ndc[k]);projectedMax[k]=Math.max(projectedMax[k],ndc[k]);}
      }
    }
    if(accepted)eligibleMeshes++;
  });
  const valid=a=>a.every(Number.isFinite)?a:null;
  return {scope:'CPU skinned indexed draw bounds; excludes GPU displacement and depth visibility',
    indexedVertices,eligibleMeshes,nonFiniteVertices,unsupportedMeshes,truncated,
    worldMin:valid(min),worldMax:valid(max),ndcMin:valid(projectedMin),ndcMax:valid(projectedMax)};
}
