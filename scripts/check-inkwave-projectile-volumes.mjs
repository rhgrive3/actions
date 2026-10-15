#!/usr/bin/env node
// Native game input + presentation-only frozen comparisons. Original packs
// Fixture runs are structural tests; --default uses the shipped original pack
// through ordinary startup, without a global setting or registration call.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium,webkit } from 'playwright';
const [siteArg,sheetArg,rodArg,outArg]=process.argv.slice(2);
if(!outArg)throw Error('Usage: node scripts/check-inkwave-projectile-volumes.mjs <site> <sheet-pack> <rod-pack> <evidence> [--webkit --quick]');
const site=path.resolve(siteArg),sheets=path.resolve(sheetArg),rods=path.resolve(rodArg),out=path.resolve(outArg);fs.mkdirSync(out,{recursive:true});
const types={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://x').pathname;if(u==='/favicon.ico'){res.writeHead(204);res.end();return;}
 const root=u.startsWith('/local-sheet/')?sheets:u.startsWith('/local-rod/')?rods:site;
 const relative=u.startsWith('/local-sheet/')?u.slice('/local-sheet/'.length):u.startsWith('/local-rod/')?u.slice('/local-rod/'.length):u==='/'?'index.html':u.slice(1),file=path.resolve(root,relative);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,useWebkit=process.argv.includes('--webkit'),quick=process.argv.includes('--quick'),useDefaults=process.argv.includes('--default');
const identity=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
let browser,page;const errors=[],result={buildIdentity:{contentHash:identity.contentHash,inputHash:identity.inputHash},environment:useWebkit?'WebKit Linux software WebGL, emulated touch viewport':'Chromium Linux SwiftShader',physicalDevice:false,cases:[]};
try {
 browser=useWebkit?await webkit.launch({headless:true}):await chromium.launch({executablePath:process.env.VOLUME_CHROMIUM||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 page=await browser.newPage({viewport:useWebkit?{width:844,height:390}:{width:960,height:640},hasTouch:useWebkit,isMobile:useWebkit});page.setDefaultTimeout(120000);page.on('pageerror',e=>{errors.push(String(e));console.error(String(e));});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});
 if(!useDefaults)await page.addInitScript(()=>{globalThis.INKWAVE_INK_VOLUME_URLS={roller:'/local-sheet/manifest.json',shooter:'/local-rod/manifest.json'};});
 const bootStart=Date.now();await page.goto(base+'/?range&skipTitle');await page.waitForFunction(()=>window.__G?.match?.range&&window.__G.match.state==='playing',null,{timeout:240000});
 result.startup=await page.evaluate(async(useDefaults)=>{const G=window.__G,g=window.__inkwave;g.debug.freeze();g.debug.freezeBots();window.volumeSpawn=G.local.pos.clone();const ready=await G.fx.inkVolumeReady;window.volumePackURLs=useDefaults?(await import('/patches/local-quality/ink-volume/pack.mjs')).DEFAULT_INK_VOLUME_URLS:{roller:'/local-sheet/manifest.json',shooter:'/local-rod/manifest.json'};return {ready,error:G.fx.inkVolumeError||null,assets:[...G.fx.inkVolumes.assets.keys()],withoutConfiguration:globalThis.INKWAVE_INK_VOLUME_URL===undefined&&globalThis.INKWAVE_INK_VOLUME_URLS===undefined,geometry:G.renderer.info.memory.geometries,textures:G.renderer.info.memory.textures};},useDefaults);
 result.startup.elapsedMs=Date.now()-bootStart;assert.equal(result.startup.ready,true);assert.equal(result.startup.error,null);assert.deepEqual([...result.startup.assets].sort(),['roller','shooter']);if(useDefaults)assert(result.startup.withoutConfiguration);
 // Shooter rounds are drawn by the S3 rod silhouette (s3-projectile-shapes.mjs), not the rod volume.
 const shooterRecipes=await page.evaluate(()=>{const G=window.__G,g=window.__inkwave,a=G.local;G.projectiles.clear();a.pos.copy(volumeSpawn);a.setWeapon('shooter');a.ink=100;a.weaponRunner.reset();g._skipRender=true;g.debug.fire(true);let t=0;while(t++<60&&!G.projectiles.list.length)g._frame(1/60);g.debug.fire(false);g._frame(1/60);g._skipRender=false;return G.projectiles.list.map(p=>[p._inkVolumeRecipe??null,p.s3Shape??null]);});
 assert(shooterRecipes.length&&shooterRecipes.every(([r,s])=>r===null&&s==='shot'),'Shooter uses the S3 rod silhouette: '+JSON.stringify(shooterRecipes));result.shooterSilhouette=shooterRecipes;
 const cases=[['roller',false],['roller',true],['slosher',false],['dualies',false],['splatling',false],['s3-roller-compact',true],['s3-slosher-diffusion',false]];
 for(const [id,vertical] of cases) {
  const label=id+(vertical?'-vertical':'');console.log('native input',label);
  const data=await page.evaluate(({id,vertical})=>{
   const G=window.__G,g=window.__inkwave,a=G.local,e=G.fx.inkVolumes;G.projectiles.clear();G.fx.clear();a.pos.copy(volumeSpawn);a.vel.set(0,0,0);a.setWeapon(id);a.ink=100;a.weaponRunner.reset();g.debug.fire(false);g.debug.key('Space',false);g._skipRender=true;
   for(let i=0;i<6;i++)g._frame(1/60);
   if(vertical){g.debug.key('Space',true);g._frame(1/60);g.debug.key('Space',false);g._frame(1/60);}
   g.debug.fire(true);let ticks=0;
   if(id==='splatling'){for(let i=0;i<40;i++)g._frame(1/60);g.debug.fire(false);}
   while(ticks++<180&&!G.projectiles.list.some(p=>p._inkVolumeRecipe))g._frame(1/60);
   g.debug.fire(false);g._frame(1/60);g._frame(1/60);g._skipRender=false;g._frame(1/60);
   const eligible=G.projectiles.list.filter(p=>p._inkVolumeRecipe&&!p._qualityDead&&p.delay<=0);
   const snapshot=p=>[p.wid,p.type,p.age,p.delay,p.damage,p.life,p.radius,p.size,p.grav,p.drag,p.pos.toArray(),p.vel.toArray(),p.seed,JSON.stringify(p.inkMeta)];
   const before=JSON.stringify(G.projectiles.list.map(snapshot));G.projectiles._draw();const after=JSON.stringify(G.projectiles.list.map(snapshot));
   const visuals=G.projectiles.projectileVisuals,historyOwned=eligible.filter(p=>visuals?.handles(p)).length;
   window.volumeHeads=eligible;return {id,vertical,ticks,eligible:eligible.length,recipes:eligible.map(p=>p._inkVolumeRecipe),metrics:{...e.metrics},history:{owned:historyOwned,visible:!!visuals?.mesh?.visible,triangles:visuals?.stats?.triangles||0,indices:visuals?.geometry?.drawRange?.count||0},authorityUnchanged:before===after,calls:G.renderer.info.render.calls,triangles:G.renderer.info.render.triangles,positions:eligible.map(p=>p.pos.toArray())};
  },{id,vertical});
  assert(data.eligible>0,'native action emitted volume heads: '+label);assert(data.authorityUnchanged);
  if(data.history.owned){
   assert.equal(data.history.owned,data.eligible,'one presentation backend per native volley: '+label);
   assert(data.history.visible&&data.history.triangles>0&&data.history.indices===data.history.triangles*3,'history-owned native heads have visible uploaded geometry: '+label);
   assert.equal(data.metrics.active,0,'history-owned bodies must not duplicate the volume draw: '+label);
  }else assert(data.metrics.active>0,'native volume backend must draw every retained volume case: '+label);
  assert.equal(data.metrics.overflow,0,'bounded native volley fits: '+label);
  if(vertical)assert(data.recipes.every(x=>x==='roller-vertical'),'jump + fire must select actual vertical mode');
  assert(data.recipes.every(x=>x===data.recipes[0]));await page.screenshot({path:path.join(out,label+'-game.png')});
  // Render the very same native heads, with their original positions/data,
  // in a controlled scene. The game's camera is not modified by inspection.
  data.views=await page.evaluate(async()=>{
   const G=window.__G,T=await import('three'),{InkVolumes}=await import('/patches/local-quality/ink-volume/runtime.mjs'),{submitInkVolume}=await import('/patches/local-quality/ink-volume/recipes.mjs'),{loadVolumePack}=await import('/patches/local-quality/ink-volume/pack.mjs');
   if(!window.volumeInspector){
    const root=new T.Group(),scene=new T.Scene();scene.add(root);const engine=new InkVolumes(root,G.fx._light),packs=await Promise.all([loadVolumePack(volumePackURLs.roller),loadVolumePack(volumePackURLs.shooter)]);engine.register('roller',packs[0]);engine.register('shooter',packs[1]);
    const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(640,640);renderer.setClearColor(0x161c2a,1);renderer.domElement.id='volume-inspect';renderer.domElement.style.cssText='position:fixed;left:0;top:0;z-index:999999';window.volumeInspector={engine,renderer,scene,root,target:new T.WebGLRenderTarget(256,256)};
   }
   const {engine:e,renderer,scene,root}=volumeInspector;document.body.append(renderer.domElement);
   e.begin();for(const p of volumeHeads)submitInkVolume(e,p);e.end();const box=new T.Box3();for(const mesh of root.children)if(mesh.count){mesh.computeBoundingBox();box.union(mesh.boundingBox);}
   const centre=box.getCenter(new T.Vector3()),extent=box.getSize(new T.Vector3());
   const camera=new T.PerspectiveCamera(45,1,.01,200),span=Math.max(1,extent.length()*.6);
   volumeInspector.camera=camera;
   window.renderProjectileView=(xyz)=>{camera.position.copy(centre).add(new T.Vector3(...xyz).normalize().multiplyScalar(span*2.5));camera.lookAt(centre);camera.updateMatrixWorld();e.begin(camera);for(const p of volumeHeads)submitInkVolume(e,p);e.end();renderer.render(scene,camera);return {...e.metrics};};
   return renderProjectileView([1,.5,-1]);
  });
  data.grazing=[];
  for(const [name,dir] of [['front',[0,.3,-1]],['side',[1,.2,0]],['oblique',[1,.7,-1]],['top',[0,1,.001]],['bottom',[0,-1,.001]]]){
   await page.evaluate(dir=>renderProjectileView(dir),dir);await page.locator('#volume-inspect').screenshot({path:path.join(out,label+'-'+name+'.png')});
   const check=await page.evaluate(()=>{
    const {engine:e,renderer:r,scene,camera,target}=volumeInspector,materials=[];for(const asset of e.assets.values())for(const resource of asset.resources)if(resource.isShaderMaterial)materials.push(resource);
    const a=new Uint8Array(256*256*4),b=new Uint8Array(a.length),original=materials.map(m=>m.fragmentShader);
    r.setRenderTarget(target);r.setClearColor(0,0);
    for(const m of materials){m.fragmentShader='uniform sampler2D uMap;uniform vec4 uFrameBounds;varying vec2 vUv;void main(){vec4 tex=texture2D(uMap,clamp(vUv,uFrameBounds.xy,uFrameBounds.zw));if(tex.a<.99999)discard;gl_FragColor=vec4(tex.rgb,1.);}';m.needsUpdate=true;}
    r.render(scene,camera);r.readRenderTargetPixels(target,0,0,256,256,a);materials.forEach((m,i)=>{m.fragmentShader=original[i];m.needsUpdate=true;});r.render(scene,camera);r.readRenderTargetPixels(target,0,0,256,256,b);
    let interior=0,darkTransparent=0,blackPixels=0;for(let y=2;y<254;y++)for(let x=2;x<254;x++){let inside=true;for(let dy=-2;dy<=2&&inside;dy++)for(let dx=-2;dx<=2;dx++)if(a[((y+dy)*256+x+dx)*4+3]<254){inside=false;break;}if(inside){interior++;const i=(y*256+x)*4;if(b[i+3]<254)darkTransparent++;if(Math.max(a[i],a[i+1],a[i+2])>64&&Math.max(b[i],b[i+1],b[i+2])<8)blackPixels++;}}
    r.setRenderTarget(null);r.setClearColor(0x161c2a,1);return {interior,darkTransparent,blackPixels};
   });
   assert.equal(check.darkTransparent,0,label+' '+name+' opaque body must remain solid');assert.equal(check.blackPixels,0,label+' '+name+' black side regression');data.grazing.push({view:name,...check});
  }
  await page.evaluate(()=>{volumeInspector.engine.clear();document.getElementById('volume-inspect').remove();});
  if(!process.argv.includes('--no-performance')&&['roller','dualies','slosher'].includes(id)&&(id!=='roller'||vertical)) {
   data.performance=await page.evaluate(async({quick})=>{
    const G=window.__G,g=window.__inkwave,e=G.fx.inkVolumes,gl=G.renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'),rows=[],median=a=>[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)/2)];
    for(const enabled of [false,true,false,true]){
     G.fx.inkVolumes=enabled?e:null;if(!enabled)e.clear();for(let i=0;i<(quick?1:4);i++){G.projectiles._draw();g.R.render();gl.finish();}
     const cpu=[],gpu=[],pace=[],queries=[];let previous=null;
     const collect=()=>{for(let i=queries.length-1;i>=0;i--){const q=queries[i];if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)){if(!gl.getParameter(ext.GPU_DISJOINT_EXT))gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);queries.splice(i,1);}}};
     for(let i=0;i<(quick?3:8);i++){const t=await new Promise(r=>requestAnimationFrame(r));if(previous!==null)pace.push(t-previous);previous=t;const start=performance.now();G.projectiles._draw();cpu.push(performance.now()-start);G.renderer.info.reset();const q=ext?gl.createQuery():null;if(q)gl.beginQuery(ext.TIME_ELAPSED_EXT,q);g.R.render();if(q)gl.endQuery(ext.TIME_ELAPSED_EXT);gl.finish();if(q){queries.push(q);collect();}}
     for(let i=0;queries.length&&i<2;i++){await new Promise(r=>requestAnimationFrame(r));collect();}for(const q of queries)gl.deleteQuery(q);
     rows.push({enabled,headCount:volumeHeads.length,cpuMedianMs:median(cpu),gpuMedianMs:gpu.length?median(gpu):null,gpuSamples:gpu.length,pacedFPS:1000/median(pace),calls:G.renderer.info.render.calls,triangles:G.renderer.info.render.triangles});
    }G.fx.inkVolumes=e;G.projectiles._draw();return {fixedScene:true,pausedSimulation:true,rows};
   },{quick});
  }
  data.flight=await page.evaluate(()=>{const G=window.__G,g=window.__inkwave,heads=volumeHeads.slice(),samples=[];g._skipRender=true;for(let i=0;i<150;i++){g._frame(1/60);if(i%15===0)samples.push({tick:i,alive:heads.filter(p=>G.projectiles.list.includes(p)).length,positions:heads.filter(p=>G.projectiles.list.includes(p)).map(p=>p.pos.toArray())});}g._skipRender=false;g._frame(1/60);return {samples,remaining:heads.filter(p=>G.projectiles.list.includes(p)).length,paint:G.paint.coverage?.()||null};});
  result.cases.push(data);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({...result,errors},null,2));
 }
 result.lifecycle=await page.evaluate(()=>{volumeInspector.engine.dispose();volumeInspector.target.dispose();volumeInspector.renderer.dispose();volumeInspector.renderer.forceContextLoss();window.volumeInspector=null;window.renderProjectileView=null;const G=window.__G,e=G.fx.inkVolumes,counts=[];for(let i=0;i<20;i++){G.projectiles.clear();G.fx.clear();G.projectiles._draw();G.renderer.render(G.scene,G.camera);counts.push({...G.renderer.info.memory,bytes:e.metrics.bytes,active:e.metrics.active});}const before={...G.renderer.info.memory};e.dispose();G.renderer.render(G.scene,G.camera);return {counts,before,after:{...G.renderer.info.memory}};});
 for(const c of result.lifecycle.counts){assert.equal(c.bytes,result.lifecycle.counts[0].bytes);assert.equal(c.geometries,result.lifecycle.counts[0].geometries);assert.equal(c.textures,result.lifecycle.counts[0].textures);assert.equal(c.active,0);}assert(result.lifecycle.after.geometries<result.lifecycle.before.geometries);assert.equal(result.lifecycle.after.textures,result.lifecycle.before.textures-4);
 result.errors=errors;fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));assert.deepEqual(errors,[]);console.log(JSON.stringify({cases:result.cases.map(c=>({id:c.id,vertical:c.vertical,eligible:c.eligible,active:c.metrics.active,performance:c.performance})),lifecycle:result.lifecycle,errors},null,2));
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({message:String(error),errors,result},null,2));throw error;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
