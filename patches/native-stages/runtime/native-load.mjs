import * as THREE from 'three';
import { nativeStageURL } from './registry.mjs';
import { nativeStageBuild } from './build-config.mjs';
import {loadBrowserSource} from './source-data.mjs';
import {sourceBytes} from './source-cache.mjs';
const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
// Metadata belongs to the texture, not a persistent stage cache. Only unchanged
// colour/cutout jobs may borrow from the currently displayed profile.
const TEXTURE_INPUTS = new WeakMap();
const TEXTURE_STATE = ['colorSpace','wrapS','wrapT','anisotropy','minFilter','magFilter','generateMipmaps','flipY','premultiplyAlpha'];
function inferredInputs(job) {
 return (job.materials||[]).map(material=>({material,alpha:job.role==='albedo'?material.hasAlpha:undefined,channel:job.role==='opacity'?material.channels?.opacity:undefined}));
}
function canBorrowTexture(texture,data,file,job,renderer) {
 const input=texture&&TEXTURE_INPUTS.get(texture);
 if(!input||!['albedo','opacity'].includes(job.role)||input.data!==data||input.file!==file||input.role!==job.role||input.limit!==job.roleLimit||input.integrity!==JSON.stringify(data.integrity?.[file]))return false;
 if(texture.image!==input.image||texture.image?.width!==input.width||texture.image?.height!==input.height)return false;
 if(TEXTURE_STATE.some(key=>texture[key]!==input.state[key])||texture.anisotropy!==Math.min(4,renderer.capabilities.getMaxAnisotropy()))return false;
 const inferred=inferredInputs(job);
 return inferred.length===input.inferred.length&&inferred.every((value,i)=>value.material===input.inferred[i].material&&value.alpha===input.inferred[i].alpha&&value.channel===input.inferred[i].channel);
}
function rememberTextureInput(texture,data,file,job) {
 TEXTURE_INPUTS.set(texture,{data,file,role:job.role,limit:job.roleLimit,integrity:JSON.stringify(data.integrity?.[file]),image:texture.image,width:texture.image?.width,height:texture.image?.height,state:Object.fromEntries(TEXTURE_STATE.map(key=>[key,texture[key]])),inferred:inferredInputs(job)});
}

async function verified(id,file,integrity,signal){
 if(nativeStageBuild.mode==='browser-direct')return sourceBytes(id,nativeStageURL(id,file),integrity[file],signal);
 const response=await fetch(nativeStageURL(id,file),{signal});if(!response.ok)throw Error(`Native asset ${response.status}: ${id}/${file}`);
 const bytes=await response.arrayBuffer(),expected=integrity[file];
 if(!expected||bytes.byteLength!==expected.bytes||hex(await crypto.subtle.digest('SHA-256',bytes))!==expected.sha256)throw Error('Native integrity mismatch: '+id+'/'+file);
 return bytes;
}
export async function loadNativeData(id,signal,options={}){
 if(nativeStageBuild.mode==='browser-direct')return loadBrowserSource(id,signal,options);
 const r=await fetch(nativeStageURL(id,'integrity.json'),{signal});if(!r.ok)throw Error('Missing native integrity: '+id);
 const raw=await r.arrayBuffer(),digest=hex(await crypto.subtle.digest('SHA-256',raw));
 if(digest!==nativeStageBuild.stages.find(s=>s.id===id)?.integritySha256)throw Error('Native integrity manifest changed: '+id);
 const integrity=JSON.parse(new TextDecoder().decode(raw));
 const manifest=JSON.parse(new TextDecoder().decode(await verified(id,'manifest.json',integrity,signal)));
 if(manifest.diagnosticOnly||manifest.placementReceipt)throw Error('Diagnostic placement data cannot be loaded as a playable stage: '+id);
 const names={vertices:Float32Array,indices:Uint32Array,triangles:Float32Array,normals:Float32Array,flags:Uint32Array,objectIds:Uint32Array,nodes:Float32Array,order:Uint32Array,triangleFace:Int32Array,mask:Uint8Array};
 const file={triangles:'collision',objectIds:'objects',nodes:'bvh'};const data={manifest,integrity};
 await Promise.all(Object.entries(names).map(async([key,Type])=>{data[key]=new Type(await verified(id,(file[key]||key)+'.bin',integrity,signal));}));
 if(manifest.schema!==1||manifest.id!==id||data.triangles.length/9!==manifest.geometry.collisionTriangles||data.triangleFace.length!==manifest.geometry.collisionTriangles||data.mask.length!==manifest.gridCells)throw Error('Unsupported native asset schema: '+id);
 return data;
}
// Loaded only for stages that ship KTX2 textures. A loader is bound to one
// renderer; a replaced loader is disposed only after its pending parses
// settle, because disposing the worker pool drops their callbacks.
let ktx2=null;
function ktx2Loader(renderer){
 if(ktx2?.renderer!==renderer){
  if(ktx2){ktx2.retired=true;releaseKtx2(ktx2);}
  ktx2={renderer,pending:0,retired:false,loader:import('../../../vendor/three/jsm/loaders/KTX2Loader.js').then(({KTX2Loader})=>
   new KTX2Loader().setTranscoderPath(new URL('vendor/three/jsm/libs/basis/',globalThis.document?.baseURI||globalThis.location?.href).href).detectSupport(renderer))};
 }
 return ktx2;
}
function releaseKtx2(entry){if(entry.retired&&!entry.pending)entry.loader.then(l=>l.dispose(),()=>{});}
// Textures ship as whole KTX2 slices of per-stage packs. One load fetches a
// pack once (verified) and drops it after its last listed texture is taken.
function prebuiltPacks(stage,rows){
 const uses=new Map(),pending=new Map();
 for(const [file,job] of rows){const pack=stage.manifest.prebuiltTextures?.[file]?.[job.role]?.pack;if(pack)uses.set(pack,(uses.get(pack)||0)+1);}
 const specs=new Map((stage.manifest.prebuiltTexturePacks||[]).map(p=>[p.file,p]));
 return {async slice(variant,signal){
  let bytes=pending.get(variant.pack);
  if(!bytes){const spec=specs.get(variant.pack);if(!spec)throw Error('Unlisted prebuilt pack: '+variant.pack);bytes=import('./prebuilt-load.mjs').then(({fetchVerified})=>fetchVerified(spec.file,spec,signal));pending.set(variant.pack,bytes);bytes.catch(()=>pending.delete(variant.pack));}
  const pack=await bytes;
  const left=(uses.get(variant.pack)||1)-1;uses.set(variant.pack,left);if(left<=0)pending.delete(variant.pack);
  if(variant.offset+variant.bytes>pack.byteLength)throw Error('Prebuilt texture outside its pack');
  return pack.slice(variant.offset,variant.offset+variant.bytes);
 },release(){pending.clear();}};
}
async function prebuiltCompressedTexture(variant,packs,renderer,signal){
 const bytes=await packs.slice(variant,signal);
 const entry=ktx2Loader(renderer);entry.pending++;
 try{
  const loader=await entry.loader;
  // The transcode cannot be cancelled. An abort settles this call at once;
  // a texture that still arrives afterwards is disposed, never published.
  return await new Promise((resolve,reject)=>{
   let settled=false;
   const settle=(fn,value)=>{if(settled)return false;settled=true;signal?.removeEventListener?.('abort',onAbort);fn(value);return true;};
   const onAbort=()=>settle(reject,new DOMException('Aborted','AbortError'));
   if(signal?.aborted)return onAbort();
   signal?.addEventListener?.('abort',onAbort,{once:true});
   loader.parse(bytes,texture=>{if(signal?.aborted)onAbort();if(!settle(resolve,texture))texture?.dispose?.();},error=>settle(reject,error));
  });
 }finally{entry.pending--;releaseKtx2(entry);}
}
/** Same bound as the PNG path's resize: start the chain at the first level within the cap. */
export function capMipLevels(texture,limit){
 const mips=texture.mipmaps;if(!Number.isFinite(limit)||!mips?.length)return;
 let drop=0;while(drop<mips.length-1&&Math.max(mips[drop].width,mips[drop].height)>limit)drop++;
 if(!drop)return;
 texture.mipmaps=mips.slice(drop);texture.image={width:texture.mipmaps[0].width,height:texture.mipmaps[0].height};
}
export async function loadNativeTextures(id,data,renderer,quality,signal,textureLimit,previousTextures=null){
 const cap=textureLimit && typeof textureLimit==='object' ? textureLimit.maxDimension : textureLimit;
 const roleCaps=textureLimit && typeof textureLimit==='object' ? textureLimit.perRole : null;
 const fallback=textureLimit && typeof textureLimit==='object' ? textureLimit.fallback||null : null;
 const jobs=new Map(),textures=new Map(),limit=Math.min(cap||Infinity,quality==='low'?512:quality==='high'?4096:1024);
 textures._nativeBorrowed=new Set();
 // A source export can contain hundreds of textures for inactive/unrendered objects.
 // nativeDisplay skips those objects; decoding their maps on a touch GPU cannot improve the image.
 // Keep old callers without an object registry compatible.
 const active=Array.isArray(data.manifest.objects)
  ?new Set(data.manifest.objects.filter(o=>o?.active).map(o=>o.material)):null;
 const materials=active
  ?Object.entries(data.manifest.materials).filter(([name])=>active.has(name)).map(([,value])=>value)
  :Object.values(data.manifest.materials);
 for(const src of materials){
  const roles={albedo:src.albedo,opacity:src.maps?.opacity};
  if(quality==='high')Object.assign(roles,{normal:src.maps?.normal,roughness:src.maps?.roughness,emissive:src.maps?.emissive});
  for(const [role,file] of Object.entries(roles))if(file){
   // A file may serve more than one material role. Retain its existing
   // last-role decode precedence, but never downsize a shared colour map
   // merely because another material uses it as roughness/normal data.
   const requestedCap=Math.min(limit,roleCaps?.[role]||Infinity);
   jobs.set(file,{role,encoding:src.normalEncoding,roleLimit:Math.max(jobs.get(file)?.roleLimit||0,requestedCap)});
  }
 }
 // Index each material once, including unrequested roles that share a selected
 // file. Keep the job's original last-role precedence and material order.
 if(data.manifest.sourceMode==='browser-direct')for(const m of materials){
  for(const file of new Set([m.albedo,...Object.values(m.maps||{})])){
   const job=jobs.get(file);if(job)(job.materials||(job.materials=[])).push(m);
  }
 }
 // Only the authenticated browser source inventory can identify byte aliases.
 // Role, cap and declared normal encoding retain independent decode semantics.
 const rows=[],identical=new Map();
 for(const [file,job] of jobs){
  job.aliases=[file];
  const pin=data.integrity?.[file];
  const key=data.manifest.sourceMode==='browser-direct'&&!pin?.sha256&&/^[a-f0-9]{40}$/.test(pin?.gitSha1)&&Number.isSafeInteger(pin.bytes)&&pin.bytes>=0
   ?JSON.stringify([pin.gitSha1,pin.bytes,job.role,job.roleLimit,job.encoding??null]):null;
  const shared=key&&identical.get(key);
  if(shared){shared.aliases.push(file);for(const m of job.materials||[])if(!shared.materials.includes(m))shared.materials.push(m);}
  else{rows.push([file,job]);if(key)identical.set(key,job);}
 }
 let failure=null;
 const checkAbort=()=>{if(failure)throw failure;if(signal?.aborted)throw new DOMException('Aborted','AbortError');};
 let next=0;const packs=prebuiltPacks(data,rows);
 const worker=async()=>{try{while(next<rows.length){
  checkAbort();
  const [file,rowJob]=rows[next++],{role}=rowJob;let job=rowJob;
  const borrowed=previousTextures?.get(file);
  if(canBorrowTexture(borrowed,data,file,job,renderer)){textures._nativeBorrowed.add(borrowed);for(const alias of job.aliases)textures.set(alias,borrowed);continue;}
  let {encoding}=job;
  const variant=data.manifest.prebuiltTextures?.[file]?.[role];
  if(variant){
   // Prebuilt KTX2 (UASTC): pixel inference already applied to the manifest
   // at build time; the GPU receives a compressed format.
   let texture;
   try{
    texture=await prebuiltCompressedTexture(variant,packs,renderer,signal);checkAbort();
    // Without a compressed target KTX2Loader still returns a CompressedTexture,
    // holding RGBA32 data in RGBAFormat; the relaxed touch budget only holds
    // for a GPU-compressed format.
    if(fallback&&(!texture.isCompressedTexture||texture.format===THREE.RGBAFormat))throw Error('KTX2 transcoded uncompressed');
    capMipLevels(texture,job.roleLimit);
    texture.colorSpace=['albedo','emissive'].includes(role)?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());texture.needsUpdate=true;rememberTextureInput(texture,data,file,job);for(const alias of job.aliases)textures.set(alias,texture);texture=null;
    continue;
   }catch(error){
    // Abort and earlier failures still stop the pipeline; otherwise use the pinned PNG.
    if(error?.name==='AbortError'||signal?.aborted||failure)throw error;
    console.warn('[native] prebuilt texture unavailable, decoding source PNG: '+variant.pack+'@'+variant.offset+' '+error.message);
   }finally{texture?.dispose();}
  }
  // Every PNG decode, including images a partial prebuilt table does not
  // cover, keeps the uncompressed budget this load was relieved from.
  if(fallback){
   const allowed=fallback.quality==='high'||['albedo','opacity'].includes(role);
   if(!allowed)continue;
   const roleLimit=Math.min(job.roleLimit,fallback.maxDimension||Infinity,fallback.perRole?.[role]||Infinity,fallback.quality==='low'?512:fallback.quality==='high'?4096:1024);
   if(roleLimit!==job.roleLimit)job={...job,roleLimit};
  }
  const buffer=await verified(id,file,data.integrity,signal);checkAbort();const blob=new Blob([buffer],{type:'image/png'});
  let bitmap,texture,transferred=false;
  try{
  bitmap=await createImageBitmap(blob,{imageOrientation:'flipY'});checkAbort();const ratio=Math.min(1,job.roleLimit/Math.max(bitmap.width,bitmap.height));
  if(ratio<1){const original=bitmap;bitmap=null;try{bitmap=await createImageBitmap(original,{resizeWidth:Math.max(1,Math.round(original.width*ratio)),resizeHeight:Math.max(1,Math.round(original.height*ratio)),resizeQuality:'high'});}finally{original.close();}checkAbort();}
   let pixels,canvas,ctx;
   const pixelContext=()=>{if(!ctx){canvas=new OffscreenCanvas(bitmap.width,bitmap.height);ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);}return ctx;};
   // Keep the identical full canvas/drawImage and its colour conversion. Only
   // the JS readback is bounded: rows retain the original accumulation order.
   const scanPixels=visit=>{const context=pixelContext();for(let y=0;y<bitmap.height;y+=64){const p=context.getImageData(0,y,bitmap.width,Math.min(64,bitmap.height-y)).data;if(visit(p)===false)break;}};
   // Mutating normal reconstruction still needs one full owned destination.
   const readPixels=()=>{if(!pixels)pixels=pixelContext().getImageData(0,0,bitmap.width,bitmap.height).data;return pixels;};
  if(data.manifest.sourceMode==='browser-direct'){
   const matched=job.materials;
   if(role==='albedo'){
    let alpha=false;const pngType=new Uint8Array(buffer)[25];if(pngType===6||pngType===4)scanPixels(p=>{for(let i=3;i<p.length;i+=4)if(p[i]<250){alpha=true;return false;}});
    for(const m of matched)if(job.aliases.includes(m.albedo))m.hasAlpha=alpha;
   }
   // Each role only consults a subset of channels. Preserve the original
   // accumulation order and exact channel threshold tests.
   if(role==='normal'){
    const count=bitmap.width*bitmap.height;let mean2=0,unorm=0,signed=0;
    scanPixels(p=>{for(let i=0;i<p.length;i+=4){
     mean2+=p[i+2];
     const x=p[i]/127.5-1,y=p[i+1]/127.5-1;
     const sx=(p[i]>127?p[i]-256:p[i])/127,sy=(p[i+1]>127?p[i+1]-256:p[i+1])/127;
     unorm+=x*x+y*y>1.02;signed+=sx*sx+sy*sy>1.02;
    }});
    encoding=mean2/count<1?(signed/count+.1<unorm/count?'signed-byte-rg':'unorm-rg'):'rgb';
    for(const m of matched)m.normalEncoding=encoding;
   }else if(role==='roughness'||role==='opacity'){
    const count=bitmap.width*bitmap.height;let mean0=0,mean1=0,lo0=255,hi0=0;
    scanPixels(p=>{for(let i=0;i<p.length;i+=4){const r=p[i];mean0+=r;mean1+=p[i+1];if(r<lo0)lo0=r;if(r>hi0)hi0=r;}});
    const ch=mean1/count<1&&(mean0/count>2||hi0-lo0>4)?'r':'g';
    for(const m of matched)m.channels[role]=ch;
   }
  }
  if(role==='normal'&&['rg-reconstruct-z','unorm-rg','signed-byte-rg'].includes(encoding)){
   const pixels=readPixels();
   for(let i=0;i<pixels.length;i+=4){let x=encoding==='signed-byte-rg'?Math.max(-1,(pixels[i]>127?pixels[i]-256:pixels[i])/127):pixels[i]/127.5-1,y=encoding==='signed-byte-rg'?Math.max(-1,(pixels[i+1]>127?pixels[i+1]-256:pixels[i+1])/127):pixels[i+1]/127.5-1;const len=Math.hypot(x,y);if(len>.95){x*=.95/len;y*=.95/len;}pixels[i]=Math.round((x*.5+.5)*255);pixels[i+1]=Math.round((y*.5+.5)*255);pixels[i+2]=Math.round((Math.sqrt(Math.max(0,1-x*x-y*y))*.5+.5)*255);pixels[i+3]=255;}
   texture=new THREE.DataTexture(pixels,bitmap.width,bitmap.height);texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.onUpdate=t=>{t.onUpdate=null;t.image.data=null;};bitmap.close();bitmap=null;
  }else{
   texture=new THREE.Texture(bitmap);
   // The GPU copy is all rendering needs. Retaining the decoded bitmap doubles
   // texture memory on unified-memory devices (iPad Safari context loss).
   // These textures are never re-uploaded: quality changes build new ones.
   texture.onUpdate=t=>{t.onUpdate=null;t.image?.close?.();};
  }
  texture.colorSpace=['albedo','emissive'].includes(role)?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());texture.needsUpdate=true;rememberTextureInput(texture,data,file,job);for(const alias of job.aliases)textures.set(alias,texture);transferred=true;
  }finally{if(!transferred){bitmap?.close();texture?.dispose();}}
 }}catch(error){if(!failure)failure=error;throw error;}};
 // Bound concurrent full-resolution decode/upload peaks; the same images and filters are used.
  const results=await Promise.allSettled(Array.from({length:Math.min(rows.length,textureLimit?2:quality==='high'?2:3)},worker));packs.release();const failed=results.find(r=>r.status==='rejected');
 if(failed||signal?.aborted){for(const t of new Set(textures.values()))if(!textures._nativeBorrowed.has(t)){t.image?.close?.();t.dispose();}throw failure||failed?.reason||new DOMException('Aborted','AbortError');}
 return textures;
}
