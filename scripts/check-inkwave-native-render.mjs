#!/usr/bin/env node
// Same source mesh, camera, actors and paint: compare the original single ink
// draw with spatial draws. Private pixels never enter the repository. Software
// GL drain times are diagnostic measurements, not retail/mobile-device FPS.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]||'_site-native-perf-local'),out=path.resolve(process.argv[3]||'.browser-evidence/native-render');fs.mkdirSync(out,{recursive:true});
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const result={status:'running',measurement:'Chromium SwiftShader; warm then freeze unrelated per-draw mesh hooks; timing retains eight actors; pixel comparison hides character roots to isolate stage rendering; alternating renders; not mobile hardware',stages:[],errors:[]},save=()=>fs.writeFileSync(path.join(out,'render.json'),JSON.stringify(result,null,2));
try{
 for(const id of (process.env.NATIVE_STAGE_IDS||'scorch,hagglefish,inkblot,mako,brinewater').split(',')){
  console.log('render compare '+id);const c=await browser.newContext({viewport:{width:960,height:640}}),p=await c.newPage();p.on('pageerror',e=>result.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
  await p.addInitScript(()=>{localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false,musicVolume:0}));let s=0x12345678;Math.random=()=>{s|=0;s=s+0x6d2b79f5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};});
  await p.goto('http://127.0.0.1:'+server.address().port+'/?map='+id,{waitUntil:'domcontentloaded'});await p.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
  await p.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:240000});assert.equal(await p.locator('#boot-error').textContent(),'');
  await p.evaluate(async id=>{const g=NG.game;g.debug.freeze();g._skipRender=true;g.menus.wipe.cancel();await g.startMatch({mapId:id,mode:'turf',difficulty:'normal'});for(let i=0;i<330;i++)g._frame(1/60);g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<80;i++)g._frame(1/60);},id);
  await p.evaluate(enabled=>globalThis.nativeMovingProbe=enabled,process.env.NATIVE_RENDER_MOVING==='1');
  const metrics=await p.evaluate(async samples=>{
   const G=NG,g=G.game,r=G.renderer,gl=r.getContext(),THREE=await import(new URL('vendor/three/build/three.module.js',document.baseURI)),ink=g.levelMesh;
   if(!ink.isMesh||ink.chunks.length<2)throw Error('Source ink not partitioned');
   const grid=G.paint.grid.slice(),level=G.level,physics=G.physics,nav=G.nav,geometry=ink.geometry,original=G.camera.clone();
   // Flush actual paint before measuring; preserve all gameplay state across A/B.
   G.paint.flush(1/60);gl.finish();
   // Own the reference attributes so disposing this control does not remove
   // GPU buffers that are still in use by the production ink geometry.
   const singleGeometry=new THREE.BufferGeometry();for(const [name,a] of Object.entries(geometry.attributes))singleGeometry.setAttribute(name,a.clone());singleGeometry.boundingSphere=geometry.boundingSphere.clone();
   const single=new THREE.Mesh(singleGeometry,ink.material);single.receiveShadow=true;single.visible=false;G.scene.add(single);
   const target=new THREE.WebGLRenderTarget(480,320),previous=r.getRenderTarget(),pixels=()=>{const b=new Uint8Array(480*320*4);r.readRenderTargetPixels(target,0,0,480,320,b);return b;};
   let inkTriangles=0,inkCalls=0,selectionMilliseconds=0;const select=ink.onBeforeRender;ink.onBeforeRender=function(...args){const t=performance.now();select.apply(this,args);selectionMilliseconds+=performance.now()-t;inkCalls++;inkTriangles+=geometry.drawRange.count/3;};single.onBeforeRender=()=>{inkCalls++;inkTriangles+=geometry.getAttribute('position').count/3;};
   const draw=chunked=>{ink.visible=chunked;single.visible=!chunked;inkTriangles=inkCalls=selectionMilliseconds=0;const t=performance.now(),version=geometry.index.version;r.render(G.scene,G.camera);gl.finish();return {milliseconds:performance.now()-t,selectionMilliseconds,indexChanged:geometry.index.version!==version,inkTriangles,inkCalls,triangles:r.info.render.triangles,calls:r.info.render.calls};};
   const views=[],moving=[];r.setRenderTarget(target);
   try{
    for(const name of ['gameplay','center','overhead']){
     const B=G.level.bounds,x=(B.minX+B.maxX)/2,z=(B.minZ+B.maxZ)/2,c=G.camera;
     if(name==='gameplay')c.copy(original);else if(name==='center'){const h=G.level.groundHeight(x,z);c.position.set(x,(Number.isFinite(h)?h:0)+4,z+12);c.lookAt(x,(Number.isFinite(h)?h:0)+1,z-20);}else{c.position.set(x,150,z+.01);c.lookAt(x,0,z);}c.updateMatrixWorld();
     for(let i=0;i<2;i++){draw(false);draw(true);}
     // Character return-to-view hooks can change poses during a draw, even with
     // the simulation paused. Warm those hooks, then hold that exact scene pose
     // for the comparison; keep the production ink selection hook active.
     const hooks=new Map();G.scene.traverse(o=>{if(o.isMesh&&o!==ink&&o!==single){hooks.set(o,o.onBeforeRender);o.onBeforeRender=()=>{};}});
     const baseline=[],chunked=[];for(let i=0;i<samples;i++){if(i%2){chunked.push(draw(true));baseline.push(draw(false));}else{baseline.push(draw(false));chunked.push(draw(true));}}
     // Character silhouettes contain their own LOD/dither presentation, which
     // has a measurable A/A pixel variation. Compare static stage rendering
     // independently; timing above still includes every actual character.
     const characters=G.actors.map(a=>[a.character.root,a.character.root.visible]);for(const [root] of characters)root.visible=false;
     draw(false);const a0=pixels();draw(false);const a=pixels();draw(true);const b0=pixels();draw(true);const b=pixels();let changedPixels=0,maxChannelError=0,baselineSelfPixels=0,chunkedSelfPixels=0;const differences=[];
     for(let i=0;i<a.length;i+=4){let changed=false,selfA=false,selfB=false;for(let k=0;k<4;k++){const e=Math.abs(a[i+k]-b[i+k]);maxChannelError=Math.max(maxChannelError,e);if(e)changed=true;if(a0[i+k]!==a[i+k])selfA=true;if(b0[i+k]!==b[i+k])selfB=true;}if(changed){changedPixels++;if(differences.length<16)differences.push({x:(i/4)%480,y:Math.floor(i/4/480),baseline:Array.from(a.subarray(i,i+4)),chunked:Array.from(b.subarray(i,i+4))});}if(selfA)baselineSelfPixels++;if(selfB)chunkedSelfPixels++;}
     const summary=data=>{const times=data.map(x=>x.milliseconds).sort((a,b)=>a-b);return {...data.at(-1),p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],samples:data.map(x=>x.milliseconds)};};
     views.push({name,changedPixels,maxChannelError,baselineSelfPixels,chunkedSelfPixels,differences,pixels:480*320,baseline:summary(baseline),chunked:summary(chunked)});
     for(const [root,visible] of characters)root.visible=visible;
     for(const [object,hook] of hooks)object.onBeforeRender=hook;
    }
    // Deliberately cross frustum tile boundaries: measure index rebuilding and
    // uploading, rather than only the cached fixed-camera path.
    if(globalThis.nativeMovingProbe){
     for(let i=0;i<12;i++){
      G.camera.copy(original);G.camera.position.x+=Math.sin(i*.7)*6;
      const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),(i-5.5)*.09);G.camera.quaternion.premultiply(rotation);G.camera.updateMatrixWorld();
      let baseline,chunked;if(i%2){chunked=draw(true);baseline=draw(false);}else{baseline=draw(false);chunked=draw(true);}moving.push({frame:i,baseline,chunked});
     }
    }
   }finally{ink.visible=true;single.removeFromParent();singleGeometry.dispose();G.camera.copy(original);r.setRenderTarget(previous);target.dispose();ink.onBeforeRender=select;}
   if(gl.getError()!==gl.NO_ERROR)throw Error('Source ink WebGL error');
   if(G.level!==level||G.physics!==physics||G.nav!==nav||g.levelMesh.geometry!==geometry||grid.some((v,i)=>v!==G.paint.grid[i]))throw Error('Rendering changed gameplay authority');
   const ext=gl.getExtension('WEBGL_debug_renderer_info');return {id:G.level.layout.id,sourceSha256:level.manifest.sourceSha256,actors:G.actors.length,chunks:ink.chunks.length,tileSize:ink.tileSize,views,moving,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),authoritiesUnchanged:true,cpuPaintUnchanged:true,version1130Verified:false};
  },Number(process.env.NATIVE_RENDER_SAMPLES||6));
  result.stages.push(metrics);save();console.log(JSON.stringify({id,views:metrics.views.map(v=>({name:v.name,changedPixels:v.changedPixels,inkTriangles:[v.baseline.inkTriangles,v.chunked.inkTriangles],p50:[v.baseline.p50,v.chunked.p50]}))}));
  for(const v of metrics.views){assert.equal(v.baselineSelfPixels,0,'baseline scene changed during comparison');assert.equal(v.chunkedSelfPixels,0,'partitioned scene changed during comparison');assert.equal(v.changedPixels,0,id+' '+v.name+' changed rendered pixels');assert(v.chunked.inkTriangles<=v.baseline.inkTriangles);}
  assert.equal(metrics.actors,8);assert(metrics.views[0].chunked.inkTriangles<metrics.views[0].baseline.inkTriangles,'gameplay view did not cull source ink');await c.close();
 }
 assert.equal(result.errors.length,0,JSON.stringify(result.errors));result.status='passed';
}catch(error){result.status='failed';result.error=error.stack;throw error;}finally{save();await browser.close();await new Promise(r=>server.close(r));}
