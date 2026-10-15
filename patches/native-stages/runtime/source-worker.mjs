import {SOURCE_RECIPE,SOURCE_STAGES,sourceURL} from './source-catalog.mjs';
import {convertSource} from './source-convert.mjs';
import {sourceBytes,readDerived,writeDerived} from './source-cache.mjs';
const buffers=['vertices','indices','triangles','normals','flags','objectIds','nodes','order','triangleFace','mask'];
self.onmessage=async({data:{id,runtimeSha256}})=>{
 try{
  const stage=SOURCE_STAGES.find(s=>s.id===id);if(!stage)throw Error('Unknown source stage');
  const key=SOURCE_RECIPE+'/'+runtimeSha256+'/'+stage.sourceSha256,start=performance.now();
  const gb=Number(self.navigator?.deviceMemory)||0,handheld=/Android|iPhone|iPad|iPod/i.test(self.navigator?.userAgent||'');
  const constrained=(gb>0&&gb<=4)||handheld;
  let data=await readDerived(key),cached=!!data;
  if(!data){
   self.postMessage({progress:'download',id});
   const [obj,tree]=await Promise.all([
    sourceBytes(id,sourceURL(stage,stage.internal+'.obj'),{sha256:stage.sourceSha256},undefined,constrained?undefined:p=>self.postMessage({progress:'download',id,...p})),
    fetch('https://api.github.com/repos/kirakira-dev/KiTrix/git/trees/'+stage.tree+'?recursive=1',{credentials:'omit',mode:'cors',referrerPolicy:'no-referrer'}).then(async r=>{if(!r.ok)throw Error('Source file list unavailable ('+r.status+')');const t=await r.json();if(t.sha!==stage.tree||t.truncated)throw Error('Unpinned source file list');return t;}),
   ]);
   self.postMessage({progress:'download',id,bytes:obj.byteLength,total:obj.byteLength});
   const files={};for(const f of tree.tree)if(f.type==='blob'){if(f.path.startsWith('/')||f.path.split('/').some(p=>p==='..'||p===''))throw Error('Unsafe source path');files[f.path]={bytes:f.size,gitSha1:f.sha};}
   const name=stage.internal+'.mtl';if(!files[name])throw Error('Missing pinned MTL');
   const mtl=await sourceBytes(id,sourceURL(stage,name),files[name]);
   data=convertSource(stage,new TextDecoder().decode(obj),new TextDecoder().decode(mtl),files,p=>self.postMessage({progress:p,id}));
   // Derived IndexedDB writes clone every large typed array before the
   // renderer takes ownership. Avoid that competing peak on small devices.
   // CacheStorage still retains the authenticated downloaded source.
   if(!constrained)await writeDerived(key,data);
  }
  data.sourceMetrics={cached,conversionMilliseconds:performance.now()-start,recipe:SOURCE_RECIPE};
  self.postMessage({result:data},buffers.map(k=>data[k].buffer));
 }catch(error){self.postMessage({error:error.message});}
};
