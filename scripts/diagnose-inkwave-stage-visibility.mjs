#!/usr/bin/env node
// Diagnostic only: render the actual composed native world, then isolate one
// render input at a time. No reference assets or pixels are committed.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { probeProjectileVisibility } from './lib/inkwave-projectile-visibility-probe.mjs';
import { collectVisibilityEvidence, requireProjectileEvidence, visibilityVerdict } from './lib/inkwave-visibility-sequence.mjs';
import { installCanvasCapture } from './lib/inkwave-canvas-capture.mjs';
const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
fs.mkdirSync(out,{recursive:true});
const result={status:'running',sourceSha:process.env.SOURCE_SHA||null,measurement:'Controlled candidate experiment on main465c: existing native source-triangle collision plus zero-default scoped lighting with diagnostic-only coefficient overrides; exact sourceSha and build receipt identify this composition; held projectile draw fix and CPU optimization excluded; job success alone does not establish native-camera visibility, current-main acceptance or mobile/retail equivalence',components:{baseMain:'465c7a978c577f9c156e565f594bb7f5f1c7e470',nativeSweep:'c5b27bde991e0db63d609b587f358410cc66df58',lightingScope:'69695c299392832828cd47f880190d7d675f1d35',diagnosticControls:'85880387761be8335a0e1616a476e8b9a54a02ac',heldProjectileDrawFix:false,cpuOptimization:false},stages:[],errors:[]};
const buildPath=path.join(site,'inkwave-build.json');result.build=JSON.parse(fs.readFileSync(buildPath,'utf8'));fs.copyFileSync(buildPath,path.join(out,'inkwave-build.json'));
const save=()=>fs.writeFileSync(path.join(out,'stage-visibility.json'),JSON.stringify(result,null,2));
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser,page;
try{
 browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:960,height:640},locale:'ja-JP'});page=await context.newPage();
 page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
 await page.addInitScript(()=>{localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false,musicVolume:0}));let s=0x12345678;Math.random=()=>{s|=0;s=s+0x6d2b79f5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};});
 await page.goto('http://127.0.0.1:'+server.address().port+'/?map=inkblot',{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G);
 await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:240000});assert.equal(await page.locator('#boot-error').textContent(),'');
 result.runtime=await page.evaluate(async()=>{const gl=NG.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {build:await (await fetch(new URL('inkwave-build.json',location.href))).json(),userAgent:navigator.userAgent,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),version:gl.getParameter(gl.VERSION),shadingLanguage:gl.getParameter(gl.SHADING_LANGUAGE_VERSION)};});assert.deepEqual(result.runtime.build,result.build,'Served build differs from local receipt');save();
 await page.evaluate(installCanvasCapture);
 const writeCapture=(capture,file)=>{assert.ok(capture.png?.startsWith('data:image/png;base64,'),'Expected synchronous PNG');fs.writeFileSync(file,Buffer.from(capture.png.slice('data:image/png;base64,'.length),'base64'));delete capture.png;};
 const prepareNativeMatch=async(quality,time)=>{
  return page.evaluate(async({quality,time})=>{const G=NG,g=G.game;g.debug.freeze();g._skipRender=true;g.menus.wipe.cancel();g._setSettings({quality,shadows:quality==='high',bloom:false});await g.startMatch({mapId:'inkblot',mode:'turf',difficulty:'normal',time});g.debug.freeze();g._skipRender=true;for(let i=0;i<330;i++)g._frame(1/60);G.paint.flush(1/60);globalThis.T=await import(new URL('vendor/three/build/three.module.js',document.baseURI));globalThis.stageMaterials=new Map();globalThis.stageReceivers=new Map();globalThis.stageFills=new Map();g.nativeWorld.display.group.traverse(m=>{if(m.isMesh){stageMaterials.set(m,m.material);stageReceivers.set(m,m.receiveShadow);stageFills.set(m,m.material.userData.nativeShadeFill?.value);}});globalThis.stageIdentity={level:G.level,physics:G.physics,nav:G.nav,paint:G.paint.grid.slice(),inkVisible:g.levelMesh.visible,shadowEnabled:G.renderer.shadowMap.enabled,quality:g.settings.quality,theme:g.theme};}, {quality,time});
 };
 const renderStage=async(quality,time)=>{
  console.log('stage '+quality+' '+time);save();
  await prepareNativeMatch(quality,time);
  const row={quality,time,metadata:await page.evaluate(()=>{const G=NG,g=G.game,rows=[];g.nativeWorld.display.group.traverse(m=>{if(!m.isMesh)return;const a=m.geometry.attributes.normal,v=m.geometry.attributes.position,ix=m.geometry.index;let lo=Infinity,hi=0,pos=0,neg=0;for(let i=0;i<a.count;i++){const l=Math.hypot(a.getX(i),a.getY(i),a.getZ(i));lo=Math.min(lo,l);hi=Math.max(hi,l);}const p=new T.Vector3(),q=new T.Vector3(),r=new T.Vector3(),n=new T.Vector3();for(let i=0;i<ix.count;i+=3){const aa=ix.getX(i),bb=ix.getX(i+1),cc=ix.getX(i+2);p.fromBufferAttribute(v,aa);q.fromBufferAttribute(v,bb).sub(p);r.fromBufferAttribute(v,cc).sub(p);n.fromBufferAttribute(a,aa);const dot=q.cross(r).dot(n);if(dot>1e-8)pos++;else if(dot< -1e-8)neg++;}rows.push({name:m.name,material:m.material.name,mapSize:[m.material.map?.image?.width,m.material.map?.image?.height],color:m.material.color.getHexString(),alphaTest:m.material.alphaTest,normals:[lo,hi],winding:{pos,neg},bounds:m.userData.nativeObject.bounds});});return {id:G.level.layout.id,sourceSha:G.level.manifest.sourceSha256,rows,lights:G.scene.children.filter(o=>o.isLight).map(l=>({name:l.name,intensity:l.intensity,color:l.color.getHexString()})),env:!!G.scene.environment,envIntensity:G.scene.environmentIntensity,theme:g.theme,camera:G.camera.position.toArray(),native:g.nativeWorld.metrics};}),views:[]};
  result.stages.push(row);save();
  try{
  for(const mode of ['baseline','no-ink','unlit-albedo','white-lit','no-shadow','no-normal','no-roughness','no-env','fill-020','fill-035','fill-035-no-ink','fill-050','opposite-side']){
   const metrics=await page.evaluate(async mode=>{const G=NG,g=G.game,r=G.renderer;g.levelMesh.visible=!mode.includes('no-ink')&&mode!=='unlit-albedo'&&mode!=='white-lit';for(const [mesh,orig] of stageMaterials){mesh.receiveShadow=mode==='no-shadow'?false:stageReceivers.get(mesh);if(orig.userData.nativeShadeFill)orig.userData.nativeShadeFill.value=globalThis.__nativeFillCoefficient(G.level.manifest.id,g.theme,mode,orig.transparent);if(mesh.material!==orig){mesh.material.dispose();mesh.material=orig;}if(mode==='unlit-albedo'){mesh.material=new T.MeshBasicMaterial({map:orig.map,color:orig.color,side:T.DoubleSide,alphaMap:orig.alphaMap,alphaTest:orig.alphaTest});mesh.material.onBeforeCompile=orig.userData.nativeChannelHook||orig.onBeforeCompile;mesh.material.customProgramCacheKey=orig.customProgramCacheKey;}if(mode==='white-lit'){mesh.material=orig.clone();mesh.material.onBeforeCompile=orig.onBeforeCompile;mesh.material.customProgramCacheKey=orig.customProgramCacheKey;mesh.material.map=null;mesh.material.normalMap=null;mesh.material.color.set(0xffffff);}if(['no-normal','no-roughness','no-env'].includes(mode)){mesh.material=orig.clone();mesh.material.onBeforeCompile=orig.onBeforeCompile;mesh.material.customProgramCacheKey=orig.customProgramCacheKey;if(mode==='no-normal')mesh.material.normalMap=null;if(mode==='no-roughness')mesh.material.roughnessMap=null;if(mode==='no-env'){mesh.material.envMap=G.scene.environment;mesh.material.envMapIntensity=0;}}if(mode==='opposite-side'){mesh.material=orig.clone();mesh.material.onBeforeCompile=orig.onBeforeCompile;mesh.material.customProgramCacheKey=orig.customProgramCacheKey;mesh.material.side=T.BackSide;}}// receiveShadow is a live shader uniform; toggling renderer.shadowMap.enabled alone leaves a cached shader active.
r.shadowMap.enabled=stageIdentity.shadowEnabled;r.render(G.scene,G.camera);return await globalThis.__captureNativeCanvas(mode);},mode);
   writeCapture(metrics,path.join(out,`${quality}-${time}-${mode}.png`));row.views.push(metrics);save();assert.equal(metrics.glError,0,'Stage GPU error');
   if(mode==='baseline'||mode.startsWith('fill-')){const capture=await page.evaluate(async mode=>{NG.game.R.render();return await globalThis.__captureNativeCanvas(mode+'-composer');},mode);writeCapture(capture,path.join(out,`${quality}-${time}-${mode}-composer.png`));metrics.composer=capture;save();assert.equal(capture.glError,0,'Stage composer GPU error');}
  }
  }finally{
  const finalCapture=await page.evaluate(async()=>{const G=NG,g=G.game;for(const [mesh,orig] of stageMaterials){mesh.receiveShadow=stageReceivers.get(mesh);if(orig.userData.nativeShadeFill)orig.userData.nativeShadeFill.value=stageFills.get(mesh);if(mesh.material!==orig)mesh.material.dispose();mesh.material=orig;}g.levelMesh.visible=stageIdentity.inkVisible;G.renderer.shadowMap.enabled=stageIdentity.shadowEnabled;if(g.settings.quality!==stageIdentity.quality||g.theme!==stageIdentity.theme)throw Error('Render control changed quality/theme');if(G.level!==stageIdentity.level||G.physics!==stageIdentity.physics||G.nav!==stageIdentity.nav||G.paint.grid.some((v,i)=>v!==stageIdentity.paint[i]))throw Error('Render diagnostic mutated gameplay authority');g.R.render();return await globalThis.__captureNativeCanvas('restored-composer');});
  writeCapture(finalCapture,path.join(out,`${quality}-${time}-composer.png`));row.restoredComposer=finalCapture;save();assert.equal(finalCapture.glError,0,'Restored stage composer GPU error');
  }
  save();
 };
 result.projectiles=[];result.failures=[];
 const probeProjectiles=async(quality,time)=>{
  await prepareNativeMatch(quality,time);
  const report=await probeProjectileVisibility(page,path.join(out,quality+'-projectiles'));
  result.projectiles.push({quality,time,...report});save();
  requireProjectileEvidence(report);
 };
 await collectVisibilityEvidence({renderStage,probeProjectiles,save,onFailure:failure=>{result.failures.push(failure);}});
 if(result.failures.length)result.error=result.failures.map(f=>`${f.phase}/${f.quality}/${f.time}: ${f.error}`).join('\n');
 result.status=result.error?'failed':'rendered';
}catch(error){result.status='failed';result.error=error.stack;await page?.screenshot({path:path.join(out,'failure.png'),timeout:15000}).catch(()=>{});}
finally{try{await browser?.close();}catch(error){result.errors.push('Browser close: '+error.message);}await new Promise(r=>server.close(r));result.status=visibilityVerdict(result);save();}
if(result.status!=='passed')throw new Error(result.error||result.errors.join('\n'));
