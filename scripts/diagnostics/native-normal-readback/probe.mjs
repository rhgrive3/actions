// Actual Canvas, ImageBitmap, CacheStorage and Three; synthetic PNGs only.
export async function probeNormalReadback({loaderURL,threeURL,variant,scenario}) {
 const check=(x,m)=>{if(!x)throw Error(m)}, THREE=await import(threeURL),loader=await import(loaderURL);
 const configs={unorm:{color:[128,128,0],encoding:'unorm-rg'},signed:{color:[0,0,0],encoding:'signed-byte-rg'},rgb:{color:[128,128,255],encoding:'rgb'},resize:{color:[128,128,0],encoding:'unorm-rg',limit:16},multiple:{color:[128,128,0],encoding:'unorm-rg',count:2},unknown:{color:[128,128,0],encoding:'unknown',baked:true},readFailure:{color:[128,128,0],fail:true},abort:{color:[128,128,0],abort:true}};
 const cfg=configs[scenario];check(cfg,'Known scenario');const id='normal-readback-'+variant+'-'+scenario,cacheName='inkwave-native-source-v2-'+id,cache=await caches.open(cacheName),controller=new AbortController();
 const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');const digest=async b=>hex(await crypto.subtle.digest('SHA-256',b));
 const integrity={},materials={};for(let i=0;i<(cfg.count||1);i++){const file='normal'+i+'.png',c=new OffscreenCanvas(64,32),ctx=c.getContext('2d');ctx.fillStyle=`rgb(${(i?[32,0,0]:cfg.color).join(',')})`;ctx.fillRect(0,0,64,32);const bytes=await(await c.convertToBlob({type:'image/png'})).arrayBuffer();integrity[file]={bytes:bytes.byteLength,sha256:await digest(bytes)};materials[i]={maps:{normal:file},normalEncoding:cfg.encoding,channels:{}};await cache.put(new URL('/synthetic/'+file,location.origin),new Response(bytes));}
 const descriptors={create:Object.getOwnPropertyDescriptor(globalThis,'createImageBitmap'),close:Object.getOwnPropertyDescriptor(ImageBitmap.prototype,'close'),read:Object.getOwnPropertyDescriptor(OffscreenCanvasRenderingContext2D.prototype,'getImageData'),dispose:Object.getOwnPropertyDescriptor(THREE.Texture.prototype,'dispose')};
 const bitmaps=[],closes=new Map(),disposed=new Map();let reads=0,allocatedBytes=0,result,error,primary,receipt;const fault=Error('injected native readback failure');
 try {
 globalThis.createImageBitmap=async function(...args){const b=await Reflect.apply(descriptors.create.value,this,args);bitmaps.push(b);if(cfg.abort)controller.abort();return b};
 ImageBitmap.prototype.close=function(...args){closes.set(this,(closes.get(this)||0)+1);return Reflect.apply(descriptors.close.value,this,args)};
 OffscreenCanvasRenderingContext2D.prototype.getImageData=function(...args){reads++;if(cfg.fail)throw fault;const r=Reflect.apply(descriptors.read.value,this,args);allocatedBytes+=r.data.byteLength;return r};
 THREE.Texture.prototype.dispose=function(...args){disposed.set(this,(disposed.get(this)||0)+1);return Reflect.apply(descriptors.dispose.value,this,args)};
 try{result=await loader.loadNativeTextures(id,{manifest:{sourceMode:cfg.baked?undefined:'browser-direct',materials},integrity},{capabilities:{getMaxAnisotropy:()=>4}},'high',controller.signal,cfg.limit)}catch(e){error=e}
 const outputs=[];for(const[file,t]of result||[]){let pixels;if(t.isDataTexture)pixels=t.image.data;else{const c=new OffscreenCanvas(t.image.width,t.image.height),ctx=c.getContext('2d');ctx.drawImage(t.image,0,0);pixels=Reflect.apply(descriptors.read.value,ctx,[0,0,c.width,c.height]).data;}outputs.push({file,dataTexture:!!t.isDataTexture,width:t.image.width,height:t.image.height,rgba:await digest(pixels),bytes:pixels.byteLength,firstPixel:Array.from(pixels.slice(0,4)),colorSpace:t.colorSpace,wrap:[t.wrapS,t.wrapT],anisotropy:t.anisotropy,mipmaps:t.generateMipmaps,filter:t.minFilter});}
 outputs.sort((a,b)=>a.file.localeCompare(b.file));
 receipt={variant,scenario,reads,allocatedBytes,outputs,encodings:Object.values(materials).map(m=>m.normalEncoding),error:error?{name:error.name,message:error.message,isInjected:error===fault}:null,bitmapBefore:bitmaps.map(b=>({width:b.width,height:b.height,closes:closes.get(b)||0})),disposeBefore:[...result?.values()||[]].map(t=>disposed.get(t)||0),restored:false};
 for(const t of result?.values()||[]){t.image?.close?.();t.dispose()}
 receipt.bitmapAfter=bitmaps.map(b=>({width:b.width,height:b.height,closes:closes.get(b)||0}));receipt.disposeAfter=[...result?.values()||[]].map(t=>disposed.get(t)||0);
 }catch(e){primary=e}finally{
 const errors=[];const attempt=fn=>{try{fn()}catch(e){errors.push(e)}};for(const b of bitmaps)if(b.width||b.height)attempt(()=>Reflect.apply(descriptors.close.value,b,[]));for(const t of result?.values()||[])if(!disposed.has(t))attempt(()=>Reflect.apply(descriptors.dispose.value,t,[]));
 for(const[obj,key,d]of [[globalThis,'createImageBitmap',descriptors.create],[ImageBitmap.prototype,'close',descriptors.close],[OffscreenCanvasRenderingContext2D.prototype,'getImageData',descriptors.read],[THREE.Texture.prototype,'dispose',descriptors.dispose]])attempt(()=>Object.defineProperty(obj,key,d));
 try{await caches.delete(cacheName)}catch(e){errors.push(e)}
 if(receipt)receipt.restored=globalThis.createImageBitmap===descriptors.create.value&&ImageBitmap.prototype.close===descriptors.close.value&&OffscreenCanvasRenderingContext2D.prototype.getImageData===descriptors.read.value&&THREE.Texture.prototype.dispose===descriptors.dispose.value;
 if(errors.length)primary=new AggregateError(primary?[primary,...errors]:errors,'Normal readback cleanup failed',{cause:primary});
 }if(primary){primary.capturePartial=receipt||{variant,scenario,reads,allocatedBytes};throw primary}return receipt;
}
