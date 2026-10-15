// PRIVATE additive read-only diagnostic. This function is serialized into the page.
export function installTrackedBlobReadback(binding) {
 if(globalThis.__trackedBlobReadback||globalThis.__restoreTrackedBlobReadback)throw Error('Readback already installed');
 const capture=({frame})=>{
  const G=globalThis.NG,g=G.game,p=globalThis.__projectileProbe?.rounds?.[0],b=G.projectiles.blobs,c=G.camera;
  if(!p||!G.projectiles.list.includes(p))throw Error('No live tracked projectile');
  const count=b.count;if(!Number.isSafeInteger(count)||count<0||count>700)throw Error('Bad active count');
  const pos=b.geometry.attributes.position,nor=b.geometry.attributes.normal,shape=G.projectiles.blobShape;
  if(!pos||!nor||pos.count!==nor.count||pos.count>4096||shape.itemSize!==4)throw Error('Unsupported geometry');
  const scalars={};for(const k of ['type','wid','sats','_inkVolumeRecipe','age','life','size','vis','tail0','tailK','wob','wobF','nose','seed','delay'])scalars[k]=p[k]??null;
  const vertices=a=>Array.from({length:a.count},(_,i)=>[a.getX(i),a.getY(i),a.getZ(i)]).flat();
  const other=[];for(const asset of G.fx.inkVolumes?.assets.values()||[])for(const pattern of asset.patterns)for(const levels of pattern.frames)for(const batch of levels)for(const mesh of [batch.mesh,batch.fringe])if(mesh?.count>0)other.push({uuid:mesh.uuid,count:mesh.count,visible:mesh.visible});
  return {schema:1,binding:JSON.parse(JSON.stringify(binding)),frame,time:G.time,tick:g.s3Clock?.ticks,tracked:{...scalars,pos:p.pos.toArray(),vel:p.vel.toArray(),start:p.start?.toArray(),live:true},blob:{uuid:b.uuid,count,visible:b.visible,matrixWorld:b.matrixWorld.toArray(),matrices:Array.from(b.instanceMatrix.array.subarray(0,count*16)),shapes:Array.from(shape.array.subarray(0,count*4)),positions:vertices(pos),normals:vertices(nor)},camera:{world:c.matrixWorld.toArray(),view:c.matrixWorldInverse.toArray(),projection:c.projectionMatrix.toArray()},viewport:{width:G.renderer.getContext().drawingBufferWidth,height:G.renderer.getContext().drawingBufferHeight},otherProjectileBatches:other};
 };
 globalThis.__trackedBlobReadback={capture,restore(){if(globalThis.__trackedBlobReadback?.capture!==capture)throw Error('Readback hook replaced');delete globalThis.__trackedBlobReadback;delete globalThis.__restoreTrackedBlobReadback;return !globalThis.__trackedBlobReadback;}};
 globalThis.__restoreTrackedBlobReadback=globalThis.__trackedBlobReadback.restore;
}

export function restoreReadbackAndCatalogue() {
 const result={readbackRestored:false,readbackRestorationError:null,hooksRestored:false};
 NG.game.input.mouse.left=false;
 try{if(typeof globalThis.__restoreTrackedBlobReadback!=='function')throw Error('Readback restore hook missing');result.readbackRestored=globalThis.__restoreTrackedBlobReadback()===true;if(!result.readbackRestored)throw Error('Readback restore returned false');}catch(error){result.readbackRestorationError=String(error);}
 try{result.hooksRestored=globalThis.__catalogueAcceptance?.restore()??false;}finally{delete globalThis.__projectileProbe;}
 return result;
}
