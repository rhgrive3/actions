// Real browser APIs; synthetic loopback PNGs and controlled async completion boundaries.
export async function probeTextureCancellation({loaderURL,threeURL,variant,scenario}){
 const check=(v,m)=>{if(!v)throw Error(m);},THREE=await import(threeURL),loader=await import(loaderURL);
 const id='texture-acceptance',controller=new AbortController(),cacheName='inkwave-native-source-v2-'+id;
 const files=Array.from({length:8},(_,i)=>`texture${i}.png`),colors=files.map((_,i)=>[24+i*23,48+i*17,192-i*19,255]);
 const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
 const cache=await caches.open(cacheName),integrity={},materials={},urls=files.map(f=>new URL('/synthetic/'+f,location.origin).href);
 for(let i=0;i<8;i++){
  const canvas=new OffscreenCanvas(16,8),ctx=canvas.getContext('2d');ctx.fillStyle=`rgb(${colors[i].slice(0,3).join(',')})`;ctx.fillRect(0,0,16,8);
  const blob=await canvas.convertToBlob({type:'image/png'}),bytes=await blob.arrayBuffer();integrity[files[i]]={bytes:bytes.byteLength,sha256:hex(await crypto.subtle.digest('SHA-256',bytes))};materials[i]={albedo:files[i]};await cache.put(urls[i],new Response(bytes,{'headers':{'content-type':'image/png'}}));
 }
 const descriptors={create:Object.getOwnPropertyDescriptor(globalThis,'createImageBitmap'),close:Object.getOwnPropertyDescriptor(ImageBitmap.prototype,'close'),dispose:Object.getOwnPropertyDescriptor(THREE.Texture.prototype,'dispose'),update:Object.getOwnPropertyDescriptor(THREE.Texture.prototype,'needsUpdate'),match:Object.getOwnPropertyDescriptor(Cache.prototype,'match')};
 const bitmaps=[],textures=[],closes=[],disposes=[],reads=[];let createCalls=0,cacheCalls=0,abortedAt=null,result,error,primaryError,receipt;
 let releaseDecode,releaseCache;const decodeGate=new Promise(r=>releaseDecode=r),cacheGate=new Promise(r=>releaseCache=r);
 const waitGate=async gate=>{let timer;try{await Promise.race([gate,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Controlled async boundary timed out')),5000);})]);}finally{clearTimeout(timer);}};
 const abort=reason=>{if(!controller.signal.aborted){abortedAt=reason;controller.abort();}};
 const snapshot=()=>bitmaps.map((b,i)=>{let drawable=false,pixel=null;try{const c=new OffscreenCanvas(1,1),ctx=c.getContext('2d');ctx.drawImage(b,0,0,1,1);pixel=Array.from(ctx.getImageData(0,0,1,1).data);drawable=true;}catch(e){if(e.name!=='InvalidStateError')throw e;}return{id:i,width:b.width,height:b.height,drawable,pixel,closeCount:closes.filter(x=>x.id===i).length};});
 try{
  globalThis.createImageBitmap=async function(...args){
   const ordinal=++createCalls,promise=Reflect.apply(descriptors.create.value,this,args);
   // Both real native calls have been started; do not fake bitmap allocation or close.
   if(scenario==='decode'&&ordinal===2){abort('two-native-decode-calls-started');releaseDecode();}
   const b=await promise;bitmaps.push(b);
   if(['decode','transferred'].includes(scenario)&&ordinal<=2){if(scenario==='transferred'&&bitmaps.length===2)releaseDecode();await waitGate(decodeGate);}
   return b;
  };
  ImageBitmap.prototype.close=function(...args){const id=bitmaps.indexOf(this),before=[this.width,this.height];const r=Reflect.apply(descriptors.close.value,this,args);closes.push({id,before,after:[this.width,this.height]});return r;};
  THREE.Texture.prototype.dispose=function(...args){disposes.push(this);return Reflect.apply(descriptors.dispose.value,this,args);};
  Object.defineProperty(THREE.Texture.prototype,'needsUpdate',{...descriptors.update,set(value){Reflect.apply(descriptors.update.set,this,[value]);if(value&&this.image instanceof ImageBitmap&&!textures.includes(this)){textures.push(this);if(scenario==='transferred'&&textures.length===1)abort('first-native-texture-update-before-synchronous-map-transfer');}}});
  Cache.prototype.match=async function(...args){const url=typeof args[0]==='string'?new URL(args[0],location.href).href:args[0].url;const promise=Reflect.apply(descriptors.match.value,this,args);if(urls.includes(url)){reads.push(url);cacheCalls++;if(scenario==='cache'&&cacheCalls<=2){if(cacheCalls===2){abort('two-native-cache-matches-started');releaseCache();}const r=await promise;await waitGate(cacheGate);return r;}}return promise;};
  if(scenario==='before')abort('before-load');
  try{result=await loader.loadNativeTextures(id,{manifest:{materials},integrity},{capabilities:{getMaxAnisotropy:()=>4}},'balanced',controller.signal,1024);}catch(e){error={name:e.name,message:e.message};}
  const beforeCleanup=snapshot();
  const returned=[];for(const [file,t]of result||[]){const i=files.indexOf(file);check(i>=0,'Unknown returned texture');check(t.isTexture&&t.image instanceof ImageBitmap,'Native Texture ownership');check(t.colorSpace===THREE.SRGBColorSpace&&t.wrapS===THREE.RepeatWrapping&&t.wrapT===THREE.RepeatWrapping&&t.anisotropy===4,'Texture configuration');const b=beforeCleanup[bitmaps.indexOf(t.image)];returned.push({file,bitmap:b.id,pixel:b.pixel,width:b.width,height:b.height,expectedPixel:colors[i]});}
  receipt={variant,scenario,error:error||null,returned,createCalls,cacheCalls,bitmapCount:bitmaps.length,textureCount:textures.length,abortedAt,beforeCleanup,closeEvents:closes.slice(),disposeCounts:textures.map(t=>disposes.filter(x=>x===t).length),nativeAPIs:{bitmap:bitmaps.every(b=>b instanceof ImageBitmap),texture:textures.every(t=>t instanceof THREE.Texture),canvas:true,cache:true},restored:false};
  if(result){for(const t of result.values()){t.image.close();t.dispose();}}
  receipt.afterCallerCleanup=snapshot();receipt.afterCallerDisposeCounts=textures.map(t=>disposes.filter(x=>x===t).length);
 }catch(e){primaryError=e;}
 finally{
  const failures=[];const attempt=f=>{try{f();}catch(e){failures.push(String(e.stack||e));}};
  releaseDecode();releaseCache();
  for(const b of bitmaps)if(b.width||b.height)attempt(()=>Reflect.apply(descriptors.close.value,b,[]));
  for(const t of textures)if(!disposes.includes(t))attempt(()=>Reflect.apply(descriptors.dispose.value,t,[]));
  for(const [obj,key,d]of [[globalThis,'createImageBitmap',descriptors.create],[ImageBitmap.prototype,'close',descriptors.close],[THREE.Texture.prototype,'dispose',descriptors.dispose],[THREE.Texture.prototype,'needsUpdate',descriptors.update],[Cache.prototype,'match',descriptors.match]])attempt(()=>Object.defineProperty(obj,key,d));
  const restored=globalThis.createImageBitmap===descriptors.create.value&&ImageBitmap.prototype.close===descriptors.close.value&&THREE.Texture.prototype.dispose===descriptors.dispose.value&&Object.getOwnPropertyDescriptor(THREE.Texture.prototype,'needsUpdate').set===descriptors.update.set&&Cache.prototype.match===descriptors.match.value;
  if(receipt){receipt.restored=restored;receipt.cleanupErrors=failures;}
  if(!restored||failures.length){const e=new Error('Probe cleanup/restoration failed',{cause:primaryError});e.capturePartial=receipt||{variant,scenario,createCalls,cacheCalls,bitmapCount:bitmaps.length,cleanupErrors:failures};primaryError=e;}
 }
 if(primaryError){primaryError.capturePartial??=receipt||{variant,scenario,createCalls,cacheCalls,bitmapCount:bitmaps.length};throw primaryError;}
 return receipt;
}
