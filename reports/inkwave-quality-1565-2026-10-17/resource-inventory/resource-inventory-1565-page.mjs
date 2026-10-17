// Standalone page callback. Read-only, deliberately called outside frame loops.
// No renderer.properties.get(), GL queries, warm/compile/render/dispose or writes
// to production objects. All inventory maps and paths belong to this callback.
export function collectResourceInventory(spec) {
 const G=window.BG,g=G.game,s=g?.showcase,e=G.env,R=g?.R;
 const own=(o,k)=>o&&typeof o==='object'?Object.getOwnPropertyDescriptor(o,k)?.value:undefined;
 const inherited=(o,k)=>{for(let p=o;p&&typeof p==='object';p=Object.getPrototypeOf(p)){const d=Object.getOwnPropertyDescriptor(p,k);if(d)return 'value'in d?d.value:undefined;}};
 const flag=(o,k)=>inherited(o,k)===true;
 const entries=o=>o&&typeof o==='object'?Object.entries(Object.getOwnPropertyDescriptors(o)).filter(([,d])=>'value'in d).map(([k,d])=>[k,d.value]):[];
 const primitive=v=>v===null||['string','number','boolean'].includes(typeof v);
 const scalars=o=>Object.fromEntries(entries(o).filter(([k,v])=>primitive(v)&&!['id','uuid','version'].includes(k)).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,typeof v==='string'&&v.length>256?{stringLength:v.length,fnv1a32:fnv(v)}:v]));
 const fnv=text=>{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return(h>>>0).toString(16).padStart(8,'0');};
 const plainVector=o=>o?Object.fromEntries(['x','y','z','w'].filter(k=>(own(o,k)??own(o,'_'+k))!==undefined).map(k=>[k,own(o,k)??own(o,'_'+k)])):null;
 const normalizeUrl=v=>typeof v==='string'?v.replace(location.origin+'/', '<served-origin>/').replace(/^<served-origin>\/[AB]\//,'<served-origin>/<variant>/'):null;
 const refs={nodes:new Map(),geometries:new Map(),materials:new Map(),textures:new Map(),targets:new Map()}, roots=[], owners=[], skipped=[], listenerFunctions=new Map(), listeners=[];
 const ref=(kind,obj,owner)=>{if(!obj)return null;let r=refs[kind].get(obj);if(!r){r={key:kind.slice(0,-1)+'-'+refs[kind].size,object:obj,owners:new Set()};refs[kind].set(obj,r);}r.owners.add(owner);return r;};
 const disposeListeners=obj=>{
  const a=own(own(obj,'_listeners'),'dispose');if(!Array.isArray(a))return[];
  return a.map(fn=>{if(typeof fn!=='function')return {invalidType:typeof fn};let l=listenerFunctions.get(fn);if(!l){const source=Function.prototype.toString.call(fn),exactGeometry=source===spec.geometryDispose.source,exactTexture=source===spec.textureDispose?.source;l={key:'listener-'+listeners.length,source,sourceFnv1a32:fnv(source),exactGeometryDispose:exactGeometry,exactTextureDispose:exactTexture};listenerFunctions.set(fn,l);listeners.push(l);}return l.key;});
 };
 const addGeometry=(obj,p)=>flag(obj,'isBufferGeometry')?ref('geometries',obj,p):null;
 const addTexture=(obj,p)=>flag(obj,'isTexture')?ref('textures',obj,p):null;
 const addTarget=(obj,p)=>{
  if(!flag(obj,'isRenderTarget')&&!flag(obj,'isWebGLRenderTarget'))return null;
  const r=ref('targets',obj,p);
  for(const k of ['texture','depthTexture'])addTexture(own(obj,k),p+'.'+k);
  const ts=own(obj,'textures');if(Array.isArray(ts))ts.forEach((t,i)=>addTexture(t,p+'.textures['+i+']'));
  return r;
 };
 const uniformTextures=(v,p,depth=0,seen=new Set())=>{
  if(!v||typeof v!=='object'||seen.has(v))return;seen.add(v);
  if(addTexture(v,p)||addTarget(v,p))return;
  if(depth>=6){skipped.push({path:p,reason:'uniform nesting limit'});return;}
  if(ArrayBuffer.isView(v)||v instanceof ArrayBuffer)return;
  if(Array.isArray(v)){v.forEach((x,i)=>uniformTextures(x,p+'['+i+']',depth+1,seen));return;}
  // Uniform records may contain plain nested structs. Never invoke a getter.
  const proto=Object.getPrototypeOf(v);if(proto!==Object.prototype&&proto!==null)return;
  for(const[k,x]of entries(v))uniformTextures(x,p+'.'+k,depth+1,seen);
 };
 const addMaterial=(obj,p)=>{
  if(!flag(obj,'isMaterial'))return null;const r=ref('materials',obj,p);
  if(r.scanned)return r;r.scanned=true;
  for(const[k,v]of entries(obj)){addTexture(v,p+'.'+k);addTarget(v,p+'.'+k);}
  uniformTextures(own(obj,'uniforms'),p+'.uniforms');return r;
 };
 const addNode=(obj,p,ancestors=new Set())=>{
  if(!flag(obj,'isObject3D'))return null;const r=ref('nodes',obj,p);
  if(r.scanned)return r;r.scanned=true;
  if(ancestors.has(obj)){skipped.push({path:p,reason:'Object3D child cycle'});return r;}
  const next=new Set(ancestors);next.add(obj);
  addGeometry(own(obj,'geometry'),p+'.geometry');
  const mats=own(obj,'material');if(Array.isArray(mats))mats.forEach((m,i)=>addMaterial(m,p+'.material['+i+']'));else addMaterial(mats,p+'.material');
  for(const k of ['background','environment'])addTexture(own(obj,k),p+'.'+k);
  addMaterial(own(obj,'overrideMaterial'),p+'.overrideMaterial');
  const skeleton=own(obj,'skeleton');addTexture(own(skeleton,'boneTexture'),p+'.skeleton.boneTexture');
  const shadow=own(obj,'shadow');for(const k of ['map','mapPass'])addTarget(own(shadow,k),p+'.shadow.'+k);
  const children=own(obj,'children');if(Array.isArray(children))children.forEach((c,i)=>addNode(c,p+'/children['+i+']('+String(own(c,'type')||'Object3D')+':'+String(own(c,'name')||'')+')',next));
  return r;
 };
 const root=(obj,p)=>{if(!obj)return;const r=addNode(obj,p);if(r)roots.push({path:p,node:r.key});};
 const resourceValue=(v,p,depth=0,seen=new Set())=>{
  if(!v||typeof v!=='object'||seen.has(v))return;seen.add(v);
  if(flag(v,'isObject3D')){root(v,p);return;}
  if(addGeometry(v,p)||addMaterial(v,p)||addTexture(v,p)||addTarget(v,p))return;
  if(Array.isArray(v)&&depth<3)v.forEach((x,i)=>resourceValue(x,p+'['+i+']',depth+1,seen));
  else if(v instanceof Map&&depth<3){for(const[k,x]of v)resourceValue(x,p+'.map['+String(k)+']',depth+1,seen);}
  else if(depth<2&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null))for(const[k,x]of entries(v))resourceValue(x,p+'.'+k,depth+1,seen);
 };
 const owner=(obj,p)=>{if(!obj)return;owners.push({path:p,scalarState:scalars(obj),fields:entries(obj).map(([k,v])=>({name:k,kind:v===null?'null':Array.isArray(v)?'Array':v instanceof Map?'Map':typeof v,size:Array.isArray(v)?v.length:v instanceof Map?v.size:null})).sort((a,b)=>a.name.localeCompare(b.name))});for(const[k,v]of entries(obj))resourceValue(v,p+'.'+k);};
 const character=(c,p)=>{if(!c)return;owner(c,p);root(own(c,'root'),p+'.root');const skeleton=own(c,'skeleton');addTexture(own(skeleton,'boneTexture'),p+'.skeleton.boneTexture');const lods=own(c,'lodSets');if(Array.isArray(lods))lods.forEach((l,i)=>resourceValue(l,p+'.lodSets['+i+']'));};
 root(G.scene,'G.scene');root(G.camera,'G.camera');owner(e,'G.env');owner(G.level,'G.level');owner(G.paint,'G.paint');owner(G.fx,'G.fx');
 if(s){owner(s,'G.game.showcase');for(const k of ['scene','compScene','_presScene'])root(own(s,k),'G.game.showcase.'+k);for(const k of ['_portraitKid','_warmChar','_portraitCharacter','_portraitPreparedCharacter','_portraitActiveCharacter'])character(own(s,k),'G.game.showcase.'+k);for(const k of ['chars','_chars']){const cs=own(s,k);if(Array.isArray(cs))cs.forEach((c,i)=>character(c,'G.game.showcase.'+k+'['+i+']'));}const lob=own(s,'lob')||own(s,'_lobby');if(lob){owner(lob,'G.game.showcase.lobby');owner(own(lob,'set'),'G.game.showcase.lobby.set');const members=own(lob,'members');if(members instanceof Map)for(const[k,m]of members)character(own(m,'c'),'G.game.showcase.lobby.members['+String(k)+'].c');}}
 const actors=G.actors||[];actors.forEach((a,i)=>{owners.push({path:'G.actors['+i+']',scalarState:scalars(a)});character(own(a,'character'),'G.actors['+i+'].character');});
 owner(e?._pmrem,'G.env._pmrem');
 owner(R,'G.game.R');const comp=R?.composer;owner(comp,'G.game.R.composer');
 const passes=own(comp,'passes');if(Array.isArray(passes))passes.forEach((p,i)=>{const base='G.game.R.composer.passes['+i+']';owner(p,base);for(const k of ['_fsQuad','fsQuad']){const q=own(p,k);if(q){owner(q,base+'.'+k);root(own(q,'_mesh'),base+'.'+k+'._mesh');}}});
 const warms=own(g,'_warmMeshes');if(Array.isArray(warms))warms.forEach((x,i)=>resourceValue(x,'G.game._warmMeshes['+i+']'));
 const refKey=(kind,obj)=>refs[kind].get(obj)?.key??null;
 const base=r=>({key:r.key,id:own(r.object,'id')??null,uuid:own(r.object,'uuid')??null,type:own(r.object,'type')??null,name:own(r.object,'name')??null,owners:[...r.owners].sort(),disposeListeners:disposeListeners(r.object)});
 const attribute=a=>{if(!a)return null;const arr=own(a,'array')||own(own(a,'data'),'array');return{itemSize:own(a,'itemSize')??null,count:own(a,'count')??null,normalized:own(a,'normalized')??null,gpuType:own(a,'gpuType')??null,usage:own(a,'usage')??own(own(a,'data'),'usage')??null,isInterleaved:flag(a,'isInterleavedBufferAttribute'),offset:own(a,'offset')??null,stride:own(own(a,'data'),'stride')??null,arrayType:arr?Object.getPrototypeOf(arr)?.constructor?.name:null,arrayLength:arr?.length??null,arrayByteLength:arr?.byteLength??null,backingByteLength:arr?.buffer?.byteLength??null};};
 const geometries=[...refs.geometries.values()].map(r=>{const o=r.object,box=own(o,'boundingBox'),sphere=own(o,'boundingSphere');return{...base(r),attributes:Object.fromEntries(entries(own(o,'attributes')).sort(([a],[b])=>a.localeCompare(b)).map(([k,a])=>[k,attribute(a)])),morphAttributes:Object.fromEntries(entries(own(o,'morphAttributes')).sort(([a],[b])=>a.localeCompare(b)).map(([k,a])=>[k,Array.isArray(a)?a.map(attribute):null])),index:attribute(own(o,'index')),drawRange:scalars(own(o,'drawRange')),groups:(own(o,'groups')||[]).map(scalars),parameters:scalars(own(o,'parameters')),userData:scalars(own(o,'userData')),instanceCount:own(o,'instanceCount')??null,boundingBox:box?{min:plainVector(own(box,'min')),max:plainVector(own(box,'max'))}:null,boundingSphere:sphere?{center:plainVector(own(sphere,'center')),radius:own(sphere,'radius')??null}:null};});
 const textureFields=['mapping','wrapS','wrapT','wrapR','magFilter','minFilter','anisotropy','internalFormat','format','type','generateMipmaps','premultiplyAlpha','flipY','unpackAlignment','colorSpace','compareFunction','channel','isRenderTargetTexture'];
 const image=d=>{if(!d)return null;if(Array.isArray(d))return d.map(image);if(ArrayBuffer.isView(d))return{type:Object.getPrototypeOf(d)?.constructor?.name??null,length:d.length,byteLength:d.byteLength};const pixels=own(d,'data'),nativeImage=['HTMLImageElement','HTMLCanvasElement','HTMLVideoElement','ImageBitmap','OffscreenCanvas'].some(k=>typeof globalThis[k]==='function'&&d instanceof globalThis[k]);return{type:Object.getPrototypeOf(d)?.constructor?.name??null,width:own(d,'width')??(nativeImage?d.width:null),height:own(d,'height')??(nativeImage?d.height:null),naturalWidth:nativeImage?(d.naturalWidth??d.videoWidth??null):null,naturalHeight:nativeImage?(d.naturalHeight??d.videoHeight??null):null,depth:own(d,'depth')??null,url:normalizeUrl(own(d,'src')||own(d,'currentSrc')||(nativeImage?(d.currentSrc||d.src):null)),pixelArray:pixels?{type:Object.getPrototypeOf(pixels)?.constructor?.name??null,length:pixels.length??null,byteLength:pixels.byteLength??null}:null,ownScalarState:scalars(d)};};
 const textures=[...refs.textures.values()].map(r=>{const o=r.object,source=own(o,'source');return{...base(r),version:own(o,'version')??null,sourceId:own(source,'id')??null,sourceUuid:own(source,'uuid')??null,sourceVersion:own(source,'version')??null,sourceData:image(own(source,'data')),parameters:Object.fromEntries(textureFields.map(k=>[k,inherited(o,k)??null])),mipmaps:(own(o,'mipmaps')||[]).map(image),userData:scalars(own(o,'userData'))};});
 const targets=[...refs.targets.values()].map(r=>{const o=r.object;return{...base(r),width:own(o,'width')??null,height:own(o,'height')??null,depth:own(o,'depth')??null,samples:own(o,'samples')??null,depthBuffer:own(o,'depthBuffer')??null,stencilBuffer:own(o,'stencilBuffer')??null,texture:refKey('textures',own(o,'texture')),textures:(own(o,'textures')||[]).map(t=>refKey('textures',t)),depthTexture:refKey('textures',own(o,'depthTexture')),viewport:plainVector(own(o,'viewport')),scissor:plainVector(own(o,'scissor'))};});
 const materials=[...refs.materials.values()].map(r=>{const o=r.object;return{...base(r),state:scalars(o),userData:scalars(own(o,'userData')),uniformNames:entries(own(o,'uniforms')).map(([k])=>k).sort(),defines:scalars(own(o,'defines'))};});
 const nodes=[...refs.nodes.values()].map(r=>{const o=r.object,mat=own(o,'material');return{...base(r),parent:refKey('nodes',own(o,'parent')),parentName:own(own(o,'parent'),'name')??null,children:(own(o,'children')||[]).map(c=>refKey('nodes',c)),state:Object.fromEntries(['visible','frustumCulled','renderOrder','castShadow','receiveShadow','count'].map(k=>[k,own(o,k)??null])),layers:own(own(o,'layers'),'mask')??null,geometry:refKey('geometries',own(o,'geometry')),materials:(Array.isArray(mat)?mat:[mat]).filter(Boolean).map(m=>refKey('materials',m)),position:plainVector(own(o,'position')),quaternion:plainVector(own(o,'quaternion')),scale:plainVector(own(o,'scale')),userData:scalars(own(o,'userData'))};});
 const exactGeometryIds=new Set(listeners.filter(l=>l.exactGeometryDispose).map(l=>l.key));
 const matched=geometries.filter(r=>r.disposeListeners.some(k=>exactGeometryIds.has(k)));
 const byListener=[...exactGeometryIds].map(k=>({listener:k,reachableGeometryCount:geometries.filter(r=>r.disposeListeners.includes(k)).length,mainSceneGeometryCount:geometries.filter(r=>r.disposeListeners.includes(k)&&r.owners.some(p=>p==='G.scene.geometry'||p.startsWith('G.scene/'))).length}));
 return{schema:1,purpose:'Read-only resource ownership classification; not timing/calibration/nondegradation acceptance',sourceBinding:{threeArtifact:spec.path,threeSha256:spec.threeSha256,geometryDisposeSourceSha256:spec.geometryDispose.sha256,textureDisposeSourceSha256:spec.textureDispose?.sha256??null},renderer:{geometries:G.renderer.info.memory.geometries,textures:G.renderer.info.memory.textures,programs:G.renderer.info.programs.length},privateOwners:window.benchPrivateState(),roots,owners,nodes,geometries,materials,textures,targets,listeners,coverage:{reachableNodes:nodes.length,reachableGeometries:geometries.length,reachableMaterials:materials.length,reachableTextures:textures.length,reachableRenderTargets:targets.length,reachableGeometriesWithExactDisposeListener:matched.length,exactGeometryListenerClosures:byListener,rendererGeometryCountMinusReachableExactMatches:G.renderer.info.memory.geometries-matched.length,skipped,completeRendererLedger:false},limitations:['Exact matching onGeometryDispose source proves registration by a renderer using this served Three implementation, not uniquely G.renderer. Listener closure IDs distinguish registrations within one snapshot only.','Inventory follows explicit owner roots and bounded plain resource containers. Unreachable resources, module-local caches and renderer WeakMaps are not enumerated; a remaining counter delta is UNKNOWN.','Geometry descriptors describe existing attribute/index layout, backing sizes and owner paths; attribute contents are not hashed. CPU objects are deduplicated by identity inside each snapshot; UUID/id are only local references, not cross-context semantic equality.','Texture CPU identities and dispose listeners are not GPU texture allocation counts. Source/cache-key sharing, render-target allocations, cube faces and renderbuffers prevent equating this texture list to info.memory.textures or VRAM.','No renderer.properties.get(), GL probing, production method calls, warming, compilation, rendering, disposal, listeners or resource mutation are performed by this callback.','Inventories allocate diagnostic JavaScript outside measured loops and can alter GC/scheduling chronology. All timings from this derivative are inadmissible as the original isolated timing evidence.']};
}
