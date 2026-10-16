import * as THREE from 'three';
import { nativeStageURL } from './registry.mjs';
import { nativeStageBuild } from './build-config.mjs';
import {loadBrowserSource} from './source-data.mjs';
import {sourceBytes} from './source-cache.mjs';
const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
async function verified(id,file,integrity,signal){
 if(nativeStageBuild.mode==='browser-direct')return sourceBytes(id,nativeStageURL(id,file),integrity[file],signal);
 const response=await fetch(nativeStageURL(id,file),{signal});if(!response.ok)throw Error(`Native asset ${response.status}: ${id}/${file}`);
 const bytes=await response.arrayBuffer(),expected=integrity[file];
 if(!expected||bytes.byteLength!==expected.bytes||hex(await crypto.subtle.digest('SHA-256',bytes))!==expected.sha256)throw Error('Native integrity mismatch: '+id+'/'+file);
 return bytes;
}
export async function loadNativeData(id,signal){
 if(nativeStageBuild.mode==='browser-direct')return loadBrowserSource(id,signal);
 const r=await fetch(nativeStageURL(id,'integrity.json'),{signal});if(!r.ok)throw Error('Missing native integrity: '+id);
 const raw=await r.arrayBuffer(),digest=hex(await crypto.subtle.digest('SHA-256',raw));
 if(digest!==nativeStageBuild.stages.find(s=>s.id===id)?.integritySha256)throw Error('Native integrity manifest changed: '+id);
 const integrity=JSON.parse(new TextDecoder().decode(raw));
 const manifest=JSON.parse(new TextDecoder().decode(await verified(id,'manifest.json',integrity,signal)));
 const names={vertices:Float32Array,indices:Uint32Array,triangles:Float32Array,normals:Float32Array,flags:Uint32Array,objectIds:Uint32Array,nodes:Float32Array,order:Uint32Array,triangleFace:Int32Array,mask:Uint8Array};
 const file={triangles:'collision',objectIds:'objects',nodes:'bvh'};const data={manifest,integrity};
 await Promise.all(Object.entries(names).map(async([key,Type])=>{data[key]=new Type(await verified(id,(file[key]||key)+'.bin',integrity,signal));}));
 if(manifest.schema!==1||manifest.id!==id||data.triangles.length/9!==manifest.geometry.collisionTriangles||data.triangleFace.length!==manifest.geometry.collisionTriangles||data.mask.length!==manifest.gridCells)throw Error('Unsupported native asset schema: '+id);
 return data;
}
export async function loadNativeTextures(id,data,renderer,quality,signal,textureLimit){
 const jobs=new Map(),textures=new Map(),limit=Math.min(textureLimit||Infinity,quality==='low'?512:quality==='high'?4096:1024);
 const materials=Object.values(data.manifest.materials);
 for(const src of materials){
  const roles={albedo:src.albedo,opacity:src.maps?.opacity};
  if(quality==='high')Object.assign(roles,{normal:src.maps?.normal,roughness:src.maps?.roughness,emissive:src.maps?.emissive});
  for(const [role,file] of Object.entries(roles))if(file)jobs.set(file,{role,encoding:src.normalEncoding});
 }
 // Index each material once, including unrequested roles that share a selected
 // file. Keep the job's original last-role precedence and material order.
 if(data.manifest.sourceMode==='browser-direct')for(const m of materials){
  for(const file of new Set([m.albedo,...Object.values(m.maps||{})])){
   const job=jobs.get(file);if(job)(job.materials||(job.materials=[])).push(m);
  }
 }
 const checkAbort=()=>{if(signal?.aborted)throw new DOMException('Aborted','AbortError');};
 let next=0;const rows=[...jobs];
 const worker=async()=>{while(next<rows.length){
  checkAbort();
  const [file,job]=rows[next++],{role}=job;let {encoding}=job;const buffer=await verified(id,file,data.integrity,signal);checkAbort();const blob=new Blob([buffer],{type:'image/png'});
  let bitmap,texture,transferred=false;
  try{
  bitmap=await createImageBitmap(blob,{imageOrientation:'flipY'});checkAbort();const ratio=Math.min(1,limit/Math.max(bitmap.width,bitmap.height));
  if(ratio<1){const original=bitmap;bitmap=null;try{bitmap=await createImageBitmap(original,{resizeWidth:Math.max(1,Math.round(original.width*ratio)),resizeHeight:Math.max(1,Math.round(original.height*ratio)),resizeQuality:'high'});}finally{original.close();}checkAbort();}
   let pixels;
   const readPixels=()=>{if(!pixels){const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;}return pixels;};
  if(data.manifest.sourceMode==='browser-direct'){
   const matched=job.materials;
   if(role==='albedo'){
    let alpha=false;const pngType=new Uint8Array(buffer)[25];if(pngType===6||pngType===4){const p=readPixels();for(let i=3;i<p.length;i+=4)if(p[i]<250){alpha=true;break;}}
    for(const m of matched)if(m.albedo===file)m.hasAlpha=alpha;
   }
   // Each role only consults a subset of channels. Preserve the original
   // accumulation order and exact channel threshold tests.
   if(role==='normal'){
    const p=readPixels(),count=p.length/4;let mean2=0,unorm=0,signed=0;
    for(let i=0;i<p.length;i+=4){
     mean2+=p[i+2];
     const x=p[i]/127.5-1,y=p[i+1]/127.5-1;
     const sx=(p[i]>127?p[i]-256:p[i])/127,sy=(p[i+1]>127?p[i+1]-256:p[i+1])/127;
     unorm+=x*x+y*y>1.02;signed+=sx*sx+sy*sy>1.02;
    }
    encoding=mean2/count<1?(signed/count+.1<unorm/count?'signed-byte-rg':'unorm-rg'):'rgb';
    for(const m of matched)m.normalEncoding=encoding;
   }else if(role==='roughness'||role==='opacity'){
    const p=readPixels(),count=p.length/4;let mean0=0,mean1=0,lo0=255,hi0=0;
    for(let i=0;i<p.length;i+=4){const r=p[i];mean0+=r;mean1+=p[i+1];if(r<lo0)lo0=r;if(r>hi0)hi0=r;}
    const ch=mean1/count<1&&(mean0/count>2||hi0-lo0>4)?'r':'g';
    for(const m of matched)m.channels[role]=ch;
   }
  }
  if(role==='normal'&&['rg-reconstruct-z','unorm-rg','signed-byte-rg'].includes(encoding)){
   const pixels=readPixels();
   for(let i=0;i<pixels.length;i+=4){let x=encoding==='signed-byte-rg'?Math.max(-1,(pixels[i]>127?pixels[i]-256:pixels[i])/127):pixels[i]/127.5-1,y=encoding==='signed-byte-rg'?Math.max(-1,(pixels[i+1]>127?pixels[i+1]-256:pixels[i+1])/127):pixels[i+1]/127.5-1;const len=Math.hypot(x,y);if(len>.95){x*=.95/len;y*=.95/len;}pixels[i]=Math.round((x*.5+.5)*255);pixels[i+1]=Math.round((y*.5+.5)*255);pixels[i+2]=Math.round((Math.sqrt(Math.max(0,1-x*x-y*y))*.5+.5)*255);pixels[i+3]=255;}
   texture=new THREE.DataTexture(pixels,bitmap.width,bitmap.height);texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;bitmap.close();bitmap=null;
  }else texture=new THREE.Texture(bitmap);
  texture.colorSpace=['albedo','emissive'].includes(role)?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());texture.needsUpdate=true;textures.set(file,texture);transferred=true;
  }finally{if(!transferred){bitmap?.close();texture?.dispose();}}
 }};
 // Bound concurrent full-resolution decode/upload peaks; the same images and filters are used.
  const results=await Promise.allSettled(Array.from({length:Math.min(rows.length,textureLimit?2:quality==='high'?2:3)},worker));const failed=results.find(r=>r.status==='rejected');
 if(failed||signal?.aborted){for(const t of textures.values()){t.image?.close?.();t.dispose();}throw failed?.reason||new DOMException('Aborted','AbortError');}
 return textures;
}
