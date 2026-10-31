#!/usr/bin/env node
// Production source display comparison. Two independently booted, seeded
// contexts differ only in the native-render portion of engine.mjs; no change to physics or paint.
// Software-GL readback/completion times do not represent device FPS.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const site=path.resolve(process.argv[2]||'_site'),out=path.resolve(process.argv[3]||'.ci-scratch/stage-tight.json');
const modulePath='patches/native-stages/runtime/engine.mjs';
const baseline=fs.readFileSync(path.join(site,modulePath),'utf8');
const trial=fs.readFileSync(process.env.INKWAVE_NATIVE_TIGHT_ENGINE||'/workspace/scratch/native-stage-tight-engine.mjs','utf8');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{
 const u=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
 if(!file.startsWith(site+path.sep)||!fs.statSync(file).isFile())throw Error('not found');
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
async function run(side){
 const context=await browser.newContext({viewport:{width:480,height:320},serviceWorkers:'block'}),page=await context.newPage(),errors=[];let intercepted=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/'+modulePath,async route=>{intercepted++;await route.fulfill({status:200,contentType:'text/javascript',body:side==='trial'?trial:baseline});});
 try{
  await page.addInitScript(()=>{
   localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:true,bloom:false,minimap:false,musicVolume:0,audioVolume:0}));
   let s=0x12345678;Math.random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/?map=scorch',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__G?.mode==='menu'||document.querySelector('#boot-error')?.textContent,null,{timeout:300000});
  console.log(side+' menu ready');
  const setup=await page.evaluate(async()=>{
   const G=window.__G,g=G.game;g.debug.freeze();g._skipRender=true;g.menus.wipe.cancel();
   await g.startMatch({mapId:'scorch',mode:'turf',difficulty:'normal'});
   for(let i=0,n=(g.match.turfIntroFrames??253)+77;i<n;i++)g._frame(1/60);
   g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;
   for(let i=0;i<80;i++)g._frame(1/60);
   return {native:G.level.native,stage:G.level.manifest?.id,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,
    sourceMode:G.level.manifest?.sourceMode,sourceSha256:G.level.manifest?.sourceSha256,
    groupChildren:g.nativeWorld?.display?.group?.children?.length,quality:g.settings.quality,shadowMap:G.renderer.shadowMap.enabled};
  });
  const views=await page.evaluate(async()=>{
   const G=window.__G,g=G.game,r=G.renderer,THREE=await import(new URL('vendor/three/build/three.module.js',document.baseURI));
   const gl=r.getContext(),origin=G.camera.clone(),old=r.getRenderTarget(),target=new THREE.WebGLRenderTarget(480,320,{depthBuffer:true,stencilBuffer:true});
   const hidden=G.actors.map(a=>[a.character.root,a.character.root.visible]);for(const [root] of hidden)root.visible=false;
   const display=g.nativeWorld.display.group, originals=[],counters={triangles:0,objects:0,indexUploads:0,indexBytes:0,indexCreates:0,indexCreateBytes:0};
   const indexArrays=new Set(display.children.map(o=>o.geometry?.index?.array).filter(Boolean));
   const oldSub=gl.bufferSubData,oldData=gl.bufferData;
   gl.bufferSubData=function(kind,offset,array,start,length){
    if(kind===gl.ELEMENT_ARRAY_BUFFER&&indexArrays.has(array)){counters.indexUploads++;counters.indexBytes+=(length??(array.length-(start||0)))*array.BYTES_PER_ELEMENT;}
    return oldSub.apply(this,arguments);
   };
   gl.bufferData=function(kind,array,...rest){
    if(kind===gl.ELEMENT_ARRAY_BUFFER&&indexArrays.has(array)){counters.indexCreates++;counters.indexCreateBytes+=array.byteLength;}
    return oldData.call(this,kind,array,...rest);
   };
   for(const obj of display.children){if(!obj.isMesh)continue;const before=obj.onBeforeRender;originals.push([obj,before]);
    obj.onBeforeRender=function(renderer,scene,camera,geometry,material,group){
     const result=before.call(this,renderer,scene,camera,geometry,material,group);
     if(scene===G.scene&&camera===G.camera&&!material.transparent&&!material.alphaTest){
      counters.objects++;counters.triangles+=Math.min(geometry.index?.count??geometry.attributes.position.count,geometry.drawRange.count)/3;
     }
     return result;
    };
   }
   const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
   const draw=async yaw=>{
    G.camera.copy(origin);G.camera.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw));G.camera.updateMatrixWorld();
    counters.triangles=0;counters.objects=0;counters.indexUploads=0;counters.indexBytes=0;counters.indexCreates=0;counters.indexCreateBytes=0;r.setRenderTarget(target);r.clear();r.render(G.scene,G.camera);
    const bytes=new Uint8Array(480*320*4);r.readRenderTargetPixels(target,0,0,480,320,bytes);
    return {hash:await hash(bytes),...counters,glError:gl.getError()};
   };
   const result=[];
   try{await draw(0);for(const yaw of [0,.35,-.35,1.2,Math.PI]){const moving=await draw(yaw),first=await draw(yaw),second=await draw(yaw);result.push({yaw,moving,first,second});}}
   finally{gl.bufferSubData=oldSub;gl.bufferData=oldData;for(const [obj,before]of originals)obj.onBeforeRender=before;for(const[root,visible]of hidden)root.visible=visible;G.camera.copy(origin);r.setRenderTarget(old);target.dispose();}
   return result;
  });
  return {side,setup,intercepted,errors,views};
 }finally{await context.close();}
}
let status='failed',runs=[];
try{
 for(const side of ['base','trial'])runs.push(await run(side));
 const [a,b]=runs;assert.equal(a.setup.stage,'scorch');assert(a.setup.native);assert.equal(a.setup.actors,8);assert.equal(a.intercepted,1);assert.equal(b.intercepted,1);
 assert.deepEqual(a.setup,b.setup);assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);
 const differences=a.views.map((v,i)=>({yaw:v.yaw,base:v.second.triangles,trial:b.views[i].second.triangles,
  baseUploadBytes:v.moving.indexBytes,trialUploadBytes:b.views[i].moving.indexBytes,baseUploads:v.moving.indexUploads,trialUploads:b.views[i].moving.indexUploads,
  pixelsEqual:v.second.hash===b.views[i].second.hash,baseStable:v.first.hash===v.second.hash,trialStable:b.views[i].first.hash===b.views[i].second.hash,
  glErrors:[v.first.glError,v.second.glError,b.views[i].first.glError,b.views[i].second.glError]}));
 console.log(JSON.stringify({setup:a.setup,differences}));
 assert(differences.every(x=>x.pixelsEqual&&x.baseStable&&x.trialStable&&x.glErrors.every(e=>e===0)),'visible pixels or repeated render differ');
 assert(differences.every(x=>x.base>0&&x.trial>0),'stage source meshes were not rendered');
 assert(differences.every(x=>x.trial<=x.base),'candidate increased opaque native source triangles');
 assert(differences.some(x=>x.trial<x.base),'candidate did not reduce source triangles');
 status='passed';
}catch(e){console.error(e.stack||String(e));process.exitCode=1;}
finally{
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({status,baselineSha256:sha(baseline),candidateSha256:sha(trial),
  scope:'Native Scorch production world; 8 actors in game, character meshes hidden during fixed-camera image comparison; normal atlas/scene WebGL rendering; geometry counters are instrumented; no FPS measurement.',runs},null,2)+'\n');
 await browser.close();await new Promise(r=>server.close(r));
}
