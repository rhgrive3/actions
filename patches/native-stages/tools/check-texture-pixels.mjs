// Real-browser controls for read-only ImageData strips and Blob resize parity.
// CHROMIUM_PATH=... FONTCONFIG_PATH=... node .../check-texture-pixels.mjs
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const module=process.env.PLAYWRIGHT_MODULE||process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright/index.mjs';
const {chromium}=await import(pathToFileURL(module).href);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();
 await page.route('https://native-pixels.invalid/',route=>route.fulfill({body:'<!doctype html><title>pixel controls</title>',contentType:'text/html'}));await page.goto('https://native-pixels.invalid/');
 const result=await page.evaluate(async({old,current})=>{
 const Canvas=OffscreenCanvas,stats=[],resizes=[];
 const hash=async p=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',p)),x=>x.toString(16).padStart(2,'0')).join('');
 const pixels=bitmap=>{const c=new Canvas(bitmap.width,bitmap.height),ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};
 // sourceBytes is injected per verified PNG below, avoiding network variability.
 for(const [width,height]of [[1,1],[17,63],[31,64],[33,65],[129,257],[1024,1024]])for(let pattern=0;pattern<3;pattern++){
 const c=new Canvas(width,height),ctx=c.getContext('2d'),image=ctx.createImageData(width,height);for(let i=0;i<image.data.length;i+=4){const k=i/4;image.data.set(pattern===0?[(k*13)%256,(k*57)%256,0,k%11===0?0:k%7===0?249:255]:pattern===1?[128,128,k%2,255]:[(k*31)%256,(k*83)%256,(k*7)%256,k%256],i);}ctx.putImageData(image,0,0);const blob=await c.convertToBlob({type:'image/png'}),bytes=await blob.arrayBuffer();
 const snapshots=[];
 for(const source of [old,current]){
  const readbacks=[];globalThis.OffscreenCanvas=class extends Canvas{getContext(...args){const context=super.getContext(...args);return {drawImage:(...a)=>context.drawImage(...a),getImageData:(x,y,w,h)=>{readbacks.push({w,h});return context.getImageData(x,y,w,h);}};}};
  class Texture{constructor(image){this.image=image;}dispose(){}}class DataTexture extends Texture{constructor(data,width,height){super({data,width,height});}}
  const fn=new Function('THREE','nativeStageURL','nativeStageBuild','sourceBytes','loadBrowserSource',source.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')+';return loadNativeTextures;')({Texture,DataTexture,SRGBColorSpace:'srgb',NoColorSpace:'none',RepeatWrapping:1000,LinearMipmapLinearFilter:1008},(_id,file)=>file,{mode:'browser-direct'},async()=>bytes,()=>{});
  const materials={albedo:{albedo:'a.png',maps:{},channels:{}},normal:{maps:{normal:'n.png'},channels:{}},rough:{maps:{roughness:'r.png'},channels:{}},opacity:{maps:{opacity:'o.png'},channels:{}}};
  const loaded=await fn('fixture',{manifest:{sourceMode:'browser-direct',materials},integrity:{}},{capabilities:{getMaxAnisotropy:()=>4}},'high',undefined,4096),rows=[];
  globalThis.OffscreenCanvas=Canvas;
  for(const [name,t]of loaded){rows.push({name,width:t.image.width,height:t.image.height,data:await hash(t.image.data||pixels(t.image)),space:t.colorSpace,mipmaps:t.generateMipmaps??null,filter:t.minFilter??null});t.image.close?.();t.dispose();}
  rows.sort((a,b)=>a.name.localeCompare(b.name));snapshots.push({materials,rows,readbacks});
 }
 const equal=JSON.stringify([snapshots[0].materials,snapshots[0].rows])===JSON.stringify([snapshots[1].materials,snapshots[1].rows]);if(!equal)throw Error('Readback output mismatch '+width+'x'+height+' pattern'+pattern);
 stats.push({width,height,pattern,equal,before:snapshots[0].readbacks,after:snapshots[1].readbacks});
 }
 for(const [width,height,cap]of [[413,257,128],[1024,1024,128],[4096,512,256]]){
 const c=new Canvas(width,height),ctx=c.getContext('2d'),image=ctx.createImageData(width,height);for(let i=0;i<image.data.length;i+=4){const k=i/4;image.data.set([(k*13)%256,(k*57)%256,(k*101)%256,k%17===0?0:k%7===0?119:255],i);}ctx.putImageData(image,0,0);const blob=await c.convertToBlob({type:'image/png'}),original=await createImageBitmap(blob,{imageOrientation:'flipY'}),ratio=Math.min(1,cap/Math.max(width,height)),options={resizeWidth:Math.max(1,Math.round(width*ratio)),resizeHeight:Math.max(1,Math.round(height*ratio)),resizeQuality:'high'},a=await createImageBitmap(original,options),b=await createImageBitmap(blob,{...options,imageOrientation:'flipY'}),pa=pixels(a),pb=pixels(b);let differences=0,maxDifference=0;for(let i=0;i<pa.length;i++)if(pa[i]!==pb[i]){differences++;maxDifference=Math.max(maxDifference,Math.abs(pa[i]-pb[i]));}resizes.push({width,height,cap,differences,maxDifference,baseline:await hash(pa),direct:await hash(pb)});original.close();a.close();b.close();
 }
 return {browser:navigator.userAgent,readbacks:stats,resizes};
 },{old:fs.readFileSync(new URL('../tests/fixtures/native-load-07f44b97.mjs.txt',import.meta.url),'utf8'),current:fs.readFileSync(new URL('../runtime/native-load.mjs',import.meta.url),'utf8')});
 const target=new URL('../../../reports/queue-native-20261022/texture-pixels-chromium.json',import.meta.url);fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({browser:result.browser,readbackFixtures:result.readbacks.length,readbacksEqual:result.readbacks.every(r=>r.equal),resizes:result.resizes}));
}finally{await browser.close();}
