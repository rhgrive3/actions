import {SOURCE_RECIPE,SOURCE_STAGES,sourceURL,sourceObjectBytes} from './source-catalog.mjs';
import {convertSource} from './source-convert.mjs';
import {sourceBytes,sourceTree,readDerived,writeDerived} from './source-cache.mjs';
const buffers=['vertices','indices','triangles','normals','flags','objectIds','nodes','order','triangleFace','mask'];
// Keep the complete object ordinal table used by collision objectIds. Only
// inactive, never-rendered position/index payloads are omitted from transport.
function compactInactiveDisplay(data){
 const objects=data.manifest?.objects;
 if(!Array.isArray(objects)||!objects.some(o=>!o.active&&o.vc>0)||data.manifest.placementReceipt)return data;
 let vertices=0,indices=0;for(const o of objects)if(o.active){vertices+=o.vc;indices+=o.ic;}
 const packedVertices=new Float32Array(vertices*8),packedIndices=new Uint32Array(indices);let vo=0,io=0;
 const packedObjects=objects.map(o=>{
  const result={...o,vo,io,vc:o.active?o.vc:0,ic:o.active?o.ic:0};
  if(o.active){packedVertices.set(data.vertices.subarray(o.vo*8,(o.vo+o.vc)*8),vo*8);packedIndices.set(data.indices.subarray(o.io,o.io+o.ic),io);vo+=o.vc;io+=o.ic;}
  return result;
 });
 data.vertices=packedVertices;data.indices=packedIndices;
 data.manifest={...data.manifest,sourceGeometry:data.manifest.sourceGeometry||data.manifest.geometry,objects:packedObjects,geometry:{...data.manifest.geometry,vertices,triangles:indices/3}};
 return data;
}

self.onmessage=async({data:{id,runtimeSha256,constrainedClient=false}})=>{
 try{
  const stage=SOURCE_STAGES.find(s=>s.id===id);if(!stage)throw Error('Unknown source stage');
  const key=SOURCE_RECIPE+'/'+runtimeSha256+'/'+stage.sourceSha256,start=performance.now();
  const ua=self.navigator?.userAgent||'';
  const gb=Number(self.navigator?.deviceMemory)||0,handheld=/Android|iPhone|iPad|iPod/i.test(ua);
  // iPadOS may present itself as Macintosh. WorkerNavigator may not even expose maxTouchPoints,
  // so trust the explicit device profile sent by the game before reading/writing derived blobs.
  const ipadDesktopUA=/Macintosh/i.test(ua)&&Number(self.navigator?.maxTouchPoints)>1;
  const constrained=constrainedClient===true||(gb>0&&gb<=4)||handheld||ipadDesktopUA;
  // Reading an older derived entry also structured-clones the entire stage.
  let data=constrained?null:await readDerived(key),cached=!!data;
  if(!data){
   self.postMessage({progress:'download',id});
   const objectPin={sha256:stage.sourceSha256};
   // Authenticated LFS payload length; inventory blob sizes describe pointers.
   if(!constrained)objectPin.bytes=sourceObjectBytes(stage);
   // The authenticated tree can admit MTL while the larger OBJ is still in flight.
   // Observe both branches immediately and cancel sibling fetches on failure.
   const abort = typeof AbortController === 'function' ? new AbortController() : null;
   let obj, mtl, files;
   try {
    [obj,{mtl,files}]=await Promise.all([
     sourceBytes(id,sourceURL(stage,stage.internal+'.obj'),objectPin,abort?.signal,constrained?undefined:p=>self.postMessage({progress:'download',id,...p})),
     sourceTree(id,stage.tree,abort?.signal).then(async tree=>{
      const files={};for(const f of tree.tree)if(f.type==='blob'){if(f.path.startsWith('/')||f.path.split('/').some(p=>p==='..'||p===''))throw Error('Unsafe source path');files[f.path]={bytes:f.size,gitSha1:f.sha};}
      const name=stage.internal+'.mtl';if(!files[name])throw Error('Missing pinned MTL');
      if(abort?.signal.aborted)throw abort.signal.reason;
      const mtl=await sourceBytes(id,sourceURL(stage,name),files[name],abort?.signal);
      return {mtl,files};
     }),
    ]);
   } catch(error) { abort?.abort(error); throw error; }
   self.postMessage({progress:'download',id,bytes:obj.byteLength,total:obj.byteLength});
   data=convertSource(stage,new Uint8Array(obj),new TextDecoder().decode(mtl),files,p=>self.postMessage({progress:p,id}),null,{compactBVHCenters:constrained,compactInactiveDisplay:true});
   data=compactInactiveDisplay(data);
   // Derived IndexedDB writes clone every large typed array before the
   // renderer takes ownership. Avoid that competing peak on small devices.
   // CacheStorage still retains the authenticated downloaded source.
   if(!constrained)await writeDerived(key,data);
  }
  data.sourceMetrics={cached,conversionMilliseconds:performance.now()-start,recipe:SOURCE_RECIPE};
  self.postMessage({result:data},buffers.map(k=>data[k].buffer));
 }catch(error){self.postMessage({error:error.message});}
};
