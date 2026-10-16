#!/usr/bin/env node
// Real ImageBitmap, OffscreenCanvas and WebGL with controlled PNG inputs.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {build} from 'esbuild';
import {NATIVE_RUNTIME_EXTERNALS} from './lib/inkwave-native-stages.mjs';
import {fileURLToPath} from 'node:url';
const option=n=>{const i=process.argv.indexOf(n);assert.ok(i>=0&&process.argv[i+1],n+' required');return path.resolve(process.argv[i+1]);};
const site=option('--site'),out=option('--evidence-dir');fs.mkdirSync(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);
const baseline=fs.readFileSync(new URL('../patches/native-stages/tests/fixtures/native-load-readback-before.mjs.txt',import.meta.url));
const baselineHash=hash(baseline);
assert.equal(baselineHash,'7e885a80b111238d4b479c798a3195641da5415637f2e89f6eec1b3819f9b09b','Frozen Core normal-loader preimage');
// Production packs this private helper inside engine.mjs. Emit a separate,
// bounded loader entry using the same bundler options and external bindings;
// this is not presented as an independently shipped full-site module.
const runtime=fileURLToPath(new URL('../patches/native-stages/runtime/',import.meta.url));
const candidate=fs.readFileSync(path.join(runtime,'native-load.mjs'));
assert.equal(hash(candidate),manifest.files['native-stages/runtime/native-load.mjs'],'Loader source must match the production build');
const nativeInputs={};
for(const [name,expected] of Object.entries(manifest.files))if(name.startsWith('native-stages/')){
 const file=new URL('../patches/'+name,import.meta.url);assert.equal(hash(fs.readFileSync(file)),expected,name+' must match the build');nativeInputs[name]=expected;
}
const emit=async contents=>(await build({stdin:{contents:contents.toString(),resolveDir:runtime,sourcefile:'native-load.mjs',loader:'js'},bundle:true,format:'esm',minify:true,charset:'utf8',write:false,external:NATIVE_RUNTIME_EXTERNALS,legalComments:'inline'})).outputFiles[0].contents;
const beforeModule=await emit(baseline),afterModule=await emit(candidate);
const base='/_versions/'+manifest.build.revision+'/',baselinePath=base+'patches/native-stages/runtime/native-load-readback-before.mjs',receipts=new Set();
const candidatePath=base+'patches/native-stages/runtime/native-load-readback-after.mjs';
const html=`<!doctype html><script type="importmap">${JSON.stringify({imports:{three:base+'vendor/three/build/three.module.js'}})}</script>`;
const server=http.createServer((req,res)=>{try{
 const name=new URL(req.url,'http://local').pathname;
 if(name==='/favicon.ico'){res.writeHead(204);res.end();return;}
 if(name==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return;}
 if(name===baselinePath||name===candidatePath){res.writeHead(200,{'content-type':'text/javascript'});res.end(name===baselinePath?beforeModule:afterModule);return;}
 const rel=decodeURIComponent(name.slice(1)),file=path.resolve(site,rel);
 assert.ok(file.startsWith(site+'/')&&manifest.artifacts[rel]);const bytes=fs.readFileSync(file);assert.equal(hash(bytes),manifest.artifacts[rel]);receipts.add(rel);
 res.writeHead(200,{'content-type':'text/javascript'});res.end(bytes);
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 const result=await page.evaluate(async({base,baselinePath,candidatePath})=>{
  const THREE=await import('three'),before=await import(baselinePath),after=await import(candidatePath);
  const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  const NativeCanvas=OffscreenCanvas,nativeBitmap=createImageBitmap,nativeFetch=fetch;
  const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(64,64);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.1,10);camera.position.z=3;
  scene.add(new THREE.HemisphereLight(0xffffff,0x202020,1));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(1,2,3);scene.add(light);
  const geometry=new THREE.PlaneGeometry(2,2),rows=[];let serial=0;
  const cases=[['unorm',[128,128,0,255],32],['signed',[0,0,0,255],32],['rgb',[128,128,255,255],32],['large-unorm',[128,128,0,255],1024],['resized-unorm',[128,128,0,255],128,32],['abort-before',[128,128,0,255],32,0,'before'],['abort-decode',[128,128,0,255],32,0,'decode']];
  const run=async(module,pixel,size,limit,abort)=>{
   const canvas=new NativeCanvas(size,size),ctx=canvas.getContext('2d'),pixels=new Uint8ClampedArray(size*size*4);
   for(let i=0;i<pixels.length;i++)pixels[i]=pixel[i%4];ctx.putImageData(new ImageData(pixels,size,size),0,0);
   const png=await canvas.convertToBlob({type:'image/png'}),bytes=await png.arrayBuffer(),sha256=await digest(bytes),file='normal-check-'+serial+++'.png';
   const controller=new AbortController(),counts={canvas:0,draw:0,reads:0,pixelBytes:0,bitmaps:0,closed:0,disposed:0};
   if(abort==='before')controller.abort();
   globalThis.fetch=(url,options)=>String(url).endsWith('/'+file)?Promise.resolve(new Response(bytes,{headers:{'content-type':'image/png'}})):nativeFetch(url,options);
   globalThis.OffscreenCanvas=class extends NativeCanvas{constructor(...a){super(...a);counts.canvas++;}getContext(...a){const c=super.getContext(...a),draw=c.drawImage,read=c.getImageData;c.drawImage=function(...args){counts.draw++;return draw.apply(this,args);};c.getImageData=function(...args){counts.reads++;const p=read.apply(this,args);counts.pixelBytes+=p.data.byteLength;return p;};return c;}};
   globalThis.createImageBitmap=async(...args)=>{const bitmap=await nativeBitmap(...args),close=bitmap.close.bind(bitmap);counts.bitmaps++;bitmap.close=()=>{counts.closed++;close();};if(abort==='decode')controller.abort();return bitmap;};
   const data={manifest:{sourceMode:'browser-direct',materials:{probe:{maps:{normal:file},normalEncoding:'unorm-rg',channels:{}}}},integrity:{[file]:{bytes:bytes.byteLength,sha256}}};
   let textures,error;
   try{textures=await module.loadNativeTextures('scorch',data,renderer,'high',controller.signal,limit||undefined);}catch(e){error=e.name;}
   finally{globalThis.OffscreenCanvas=NativeCanvas;globalThis.createImageBitmap=nativeBitmap;globalThis.fetch=nativeFetch;}
   if(error)return{counts,error};
   const texture=textures.get(file);texture.addEventListener('dispose',()=>counts.disposed++);
   let image=texture.image,imageBytes;
   if(image.data)imageBytes=image.data;
   else{const c=new NativeCanvas(image.width,image.height),context=c.getContext('2d');context.drawImage(image,0,0);imageBytes=context.getImageData(0,0,c.width,c.height).data;}
   const material=new THREE.MeshStandardMaterial({color:0xdddddd,normalMap:texture,roughness:.7}),mesh=new THREE.Mesh(geometry,material);scene.add(mesh);renderer.render(scene,camera);
   const rendered=new Uint8Array(64*64*4),gl=renderer.getContext();gl.readPixels(0,0,64,64,gl.RGBA,gl.UNSIGNED_BYTE,rendered);
   let renderedPixels=0;for(let i=0;i<rendered.length;i+=4)if(rendered[i]>16||rendered[i+1]>16||rendered[i+2]>16)renderedPixels++;
   if(renderedPixels<100)throw Error('Normal-map frame is blank');
   const renderHash=await digest(rendered),control=new THREE.DataTexture(new Uint8Array([255,128,128,255]),1,1);control.needsUpdate=true;
   try{material.normalMap=control;material.needsUpdate=true;renderer.render(scene,camera);gl.readPixels(0,0,64,64,gl.RGBA,gl.UNSIGNED_BYTE,rendered);
    if(await digest(rendered)===renderHash)throw Error('Perturbing the normal did not change rendered output');
   }finally{control.dispose();}
   const output={width:image.width,height:image.height,encoding:data.manifest.materials.probe.normalEncoding,imageHash:await digest(imageBytes),renderHash,renderedPixels,normalPerturbationRejected:true};
   scene.remove(mesh);material.dispose();if(image instanceof ImageBitmap)image.close();texture.dispose();return{counts,output};
  };
  try{for(const[name,pixel,size,limit,abort]of cases){rows.push({name,before:await run(before,pixel,size,limit,abort),after:await run(after,pixel,size,limit,abort)});}}
  finally{globalThis.OffscreenCanvas=NativeCanvas;globalThis.createImageBitmap=nativeBitmap;globalThis.fetch=nativeFetch;geometry.dispose();renderer.dispose();}
  return{rows};
 },{base,baselinePath,candidatePath});
 assert.deepEqual(errors,[]);
 for(const row of result.rows){const {before,after}=row;
  if(row.name.startsWith('abort')){assert.equal(before.error,'AbortError');assert.equal(after.error,'AbortError');assert.deepEqual(before.counts,after.counts);assert.equal(after.counts.bitmaps,after.counts.closed);continue;}
  assert.equal(before.error,undefined);assert.equal(after.error,undefined);assert.deepEqual(before.output,after.output,row.name+' exact decoded/GPU output');
  const reconstruct=row.name!=='rgb';assert.equal(before.counts.reads,reconstruct?2:1);assert.equal(after.counts.reads,1);
  assert.equal(before.counts.canvas,before.counts.reads);assert.equal(after.counts.canvas,1);assert.equal(before.counts.draw,before.counts.reads);assert.equal(after.counts.draw,1);
  assert.equal(after.counts.pixelBytes* (reconstruct?2:1),before.counts.pixelBytes);
  for(const side of [before,after]){assert.equal(side.counts.bitmaps,side.counts.closed);assert.equal(side.counts.disposed,1);}
 }
 const report={status:'passed',browser:browser.version(),contentHash:manifest.contentHash,revision:manifest.build.revision,baselineHash,candidateHash:hash(candidate),nativeInputCount:Object.keys(nativeInputs).length,nativeInputsHash:hash(JSON.stringify(nativeInputs)),emissionHashes:{before:hash(beforeModule),after:hash(afterModule)},scope:'Controlled PNG data through a separately emitted loader entry bound to production inputs, with real ImageBitmap, OffscreenCanvas and WebGL normal-map rendering; exact decoded and rendered pixel hashes. Not a full-site stage-loading run, browser RSS, whole-game FPS or physical-device evidence.',...result,artifacts:[...receipts].sort()};
 fs.writeFileSync(path.join(out,'native-normal-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,cases:report.rows.length,browser:report.browser}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
