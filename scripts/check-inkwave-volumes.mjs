#!/usr/bin/env node
// Optional original assets live outside Git. This checks the emitted game, then
// the same renderer in a controlled orthographic comparison. No retail/device claim.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
const [siteArg, packArg, evidenceArg] = process.argv.slice(2);
if (!siteArg || !packArg || !evidenceArg) throw Error('Usage: node scripts/check-inkwave-volumes.mjs <built-site> <local-pack> <local-evidence>');
const site = path.resolve(siteArg), pack = path.resolve(packArg), evidence = path.resolve(evidenceArg); fs.mkdirSync(evidence, { recursive: true });
const html = '<!doctype html><style>body{margin:0;background:#161c2a}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js"}}</script>';
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((q,r) => {
  const url = new URL(q.url,'http://x').pathname;
  if (url === '/favicon.ico') { r.writeHead(204);r.end();return; }
  if (url === '/inspect') { r.writeHead(200,{'Content-Type':'text/html'});r.end(html);return; }
  const local = url.startsWith('/local-ink/'), root = local ? pack : site;
  const file = path.resolve(root, '.' + (local ? url.slice(10) : url === '/' ? '/index.html' : url));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { r.writeHead(404);r.end();return; }
  r.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(r);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const useWebkit=process.argv.includes('--webkit'), touch=process.argv.includes('--touch');
let browser; const errors = [], result = { environment: (useWebkit?'WebKit software WebGL (Mesa)':'Chromium software WebGL (SwiftShader)')+', Linux; emulated viewports, no physical mobile/iPad measurement' };
try {
 browser=useWebkit?await webkit.launch({headless:true}):await chromium.launch({executablePath:process.env.VOLUME_CHROMIUM || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath()),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:touch?{width:844,height:390}:{width:960,height:640},hasTouch:touch,isMobile:touch});page.on('pageerror',e=>{errors.push(String(e));console.error(String(e));});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});
 await page.goto(base+'/inspect');
 result.comparison=await page.evaluate(async()=>{
  const T=await import('three'),{InkVolumes}=await import('/patches/local-quality/ink-volume/runtime.mjs'),{loadVolumePack}=await import('/patches/local-quality/ink-volume/pack.mjs');
  const pack=await loadVolumePack('/local-ink/manifest.json'),renderer=new T.WebGLRenderer({alpha:true,antialias:false,preserveDrawingBuffer:true});renderer.setSize(640,640);document.body.append(renderer.domElement);
  const root=new T.Group(),scene=new T.Scene();scene.add(root);const camera=new T.OrthographicCamera(-.6,.6,.6,-.6,.1,20);camera.position.set(0,0,3);camera.lookAt(0,0,0);
  const lighting={sunDir:new T.Vector3(-.4,.8,.4).normalize(),sunCol:new T.Color(1,.93,.84),sky:new T.Color(.42,.62,.95),ground:new T.Color(.5,.46,.42)},engine=new InkVolumes(root,lighting);engine.register('roller',pack);
  const source={age:0,pos:new T.Vector3(),vel:new T.Vector3(0,0,1),owner:{color:new T.Color('#e34c1a')},_qualityGeneration:1};
  const maps=pack.patterns.map(p=>{
    const m=new T.DataTexture(p.frames[0].rgba,p.width,p.height);m.flipY=true;m.colorSpace=T.SRGBColorSpace;m.magFilter=T.LinearFilter;m.minFilter=T.LinearFilter;m.needsUpdate=true;return m;
  });
  const map=maps[0];
  const plane=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({map,color:source.owner.color,transparent:true,depthWrite:true}));scene.add(plane);
  const target=new T.WebGLRenderTarget(512,512),a=new Uint8Array(512*512*4),b=new Uint8Array(a.length),comparisons=[];
  window.renderInkView=(angle,frame=0,flat=false,pattern=0)=>{
    source.age=frame/30;plane.visible=flat;root.visible=!flat;camera.position.set(...angle);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    engine.begin(camera);engine.submit('roller',source,1,pattern);engine.end();renderer.setRenderTarget(null);renderer.setClearColor(0x161c2a,1);renderer.render(scene,camera);
  };
  for(let p=0;p<2;p++)for(let f=0;f<16;f++){
    const map=maps[p];plane.material.map=map;const data=pack.patterns[p].frames[f].rgba;map.image={data,width:pack.patterns[p].width,height:pack.patterns[p].height};map.needsUpdate=true;plane.scale.x=pack.patterns[p].width/pack.patterns[p].height;
    source.age=f/30;camera.position.set(0,0,3);camera.lookAt(0,0,0);camera.updateMatrixWorld();engine.begin(camera);engine.submit('roller',source,1,p);engine.end();renderer.setRenderTarget(target);renderer.setClearColor(0,0);
    plane.visible=true;root.visible=false;renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,512,512,a);
    plane.visible=false;root.visible=true;renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,512,512,b);
    let maskDiff=0,alphaMax=0,alphaSum=0;for(let i=3;i<a.length;i+=4){maskDiff+=(a[i]>0)!==(b[i]>0);alphaMax=Math.max(alphaMax,Math.abs(a[i]-b[i]));alphaSum+=Math.abs(a[i]-b[i]);}
    comparisons.push({pattern:p,frame:f,maskDiff,alphaMax,alphaMean:alphaSum/(512*512)});
  }
  // Restore source frame 0 for explicit views.
  plane.material.map=map;map.image={data:pack.patterns[0].frames[0].rgba,width:pack.patterns[0].width,height:pack.patterns[0].height};map.needsUpdate=true;plane.scale.x=1;
  window.inkInspector={engine,renderer,scene,camera,source,plane};renderInkView([0,0,3]);
  return {comparisons,renderer:renderer.getContext().getParameter(renderer.getContext().RENDERER),bytes:engine.metrics.bytes};
 });
 for(const [label,angle,flat] of [['source-front',[0,0,3],true],['volume-front',[0,0,3],false],['volume-side',[3,0,0],false],['volume-oblique',[2,1.4,3],false],['volume-top',[0,3,.001],false],['volume-bottom',[0,-3,.001],false]]){await page.evaluate(({angle,flat})=>renderInkView(angle,0,flat),{angle,flat});await page.locator('canvas').screenshot({path:path.join(evidence,label+'.png')});}
 for(let f=0;f<16;f++){await page.evaluate(f=>renderInkView([1,.7,3],f),f);await page.locator('canvas').screenshot({path:path.join(evidence,'frame-'+f+'.png')});}
 fs.writeFileSync(path.join(evidence,'shape-result.json'),JSON.stringify(result.comparison,null,2));
 for (const frame of result.comparison.comparisons) assert(frame.alphaMean < .3, 'front alpha mean error (byte units): '+JSON.stringify(frame));
 if (!process.argv.includes('--shape-only')) {
 await page.goto(base+'/?range&skipTitle');console.log('loaded document');await page.waitForFunction(()=>window.__G?.match?.range && window.__G.match.state==='playing',null,{timeout:240000});
 console.log('playing range');result.integration=await page.evaluate(async()=>{
  const G=window.__G,g=window.__inkwave,a=G.local;g.debug.freeze();a.setWeapon('roller');a.ink=100;
  const beforeRegistration={...G.renderer.info.memory};
  await G.fx.loadInkVolume('roller','/local-ink/manifest.json');
  G.projectiles.clear();g.debug.fire(true);g._skipRender=true;
  let ticks=0;while(ticks++<100 && !G.projectiles.list.some(p=>p._inkVolumeHorizontal))g._frame(1/60);
  g.debug.fire(false);g._skipRender=false;g._frame(1/60);
  const engine=G.fx.inkVolumes,p=G.projectiles.list.find(p=>p._inkVolumeHorizontal);if(!p)throw Error('Native Roller input did not emit horizontal volley');
  window.inkTestHead=p; const geometry=engine.assets.get('roller').patterns[0].frames[0][0].mesh.geometry;
  return { beforeRegistration, ticks, heads:G.projectiles.list.length, active:engine.metrics.active, metrics:{...engine.metrics}, frame:p.age, pos:p.pos.toArray(), vel:p.vel.toArray(), drawCalls:G.renderer.info.render.calls, triangles:G.renderer.info.render.triangles, bufferVertices:geometry.attributes.position.count, actualInput:true };
 });
 fs.writeFileSync(path.join(evidence,'integration.json'),JSON.stringify(result.integration,null,2));
 assert(result.integration.active>0);await page.screenshot({path:path.join(evidence,'game-horizontal.png')});
 result.flight=await page.evaluate(()=>{
  const G=window.__G,g=window.__inkwave,p=inkTestHead, samples=[];
  for(let i=0;i<90;i++){g._skipRender=true;g._frame(1/60);if(i%10===0)samples.push({tick:i,alive:G.projectiles.list.includes(p),pos:p.pos.toArray(),vel:p.vel.toArray(),active:G.fx.inkVolumes.metrics.active});}g._skipRender=false;g._frame(1/60);return {samples,paint:G.paint.coverage?.()||null,remaining:G.projectiles.list.length};
 });
 await page.screenshot({path:path.join(evidence,'game-landed.png')});
 // Fixed live game scene: compare only the renderer for the same real volley.
 result.performance=await page.evaluate(async()=>{
  const G=window.__G,g=window.__inkwave,a=G.local;G.projectiles.clear();a.ink=100;a.weaponRunner.reset();g.debug.fire(true);g._skipRender=true;
  let ticks=0;while(ticks++<100&&!G.projectiles.list.some(p=>p._inkVolumeHorizontal))g._frame(1/60);g.debug.fire(false);g._skipRender=false;
  const volumes=G.fx.inkVolumes, rows=[];const gl=G.renderer.getContext(), ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const quantile=(xs,q)=>[...xs].sort((a,b)=>a-b)[Math.floor((xs.length-1)*q)];
  for(const enabled of [false,true,false,true]) {
   G.fx.inkVolumes=enabled?volumes:null;if(!enabled)volumes.clear();const times=[],draw=[],cpu=[];for(let warm=0;warm<4;warm++){G.projectiles._draw();g.R.render();gl.finish();}
   const gpu=[],paces=[],pending=[];let previousFrame=null;
   const collectGPU=()=>{for(let i=pending.length-1;i>=0;i--){const q=pending[i];if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)){if(!gl.getParameter(ext.GPU_DISJOINT_EXT))gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);pending.splice(i,1);}}};
   for(let n=0;n<12;n++) {
    const frame=await new Promise(resolve=>requestAnimationFrame(resolve));if(previousFrame!==null)paces.push(frame-previousFrame);previousFrame=frame;
    const t=performance.now();G.projectiles._draw();cpu.push(performance.now()-t);G.renderer.info.reset();
    const query=ext?gl.createQuery():null;if(query)gl.beginQuery(ext.TIME_ELAPSED_EXT,query);
    const begin=performance.now();g.R.render();if(query)gl.endQuery(ext.TIME_ELAPSED_EXT);gl.finish();times.push(performance.now()-begin);
    draw.push({calls:G.renderer.info.render.calls,triangles:G.renderer.info.render.triangles});
    // Timer readiness must never delay the next measured animation frame.
    if(query){pending.push(query);collectGPU();}
   }
   for(let poll=0;pending.length&&poll<2;poll++){await new Promise(resolve=>requestAnimationFrame(resolve));collectGPU();}
   for(const q of pending)gl.deleteQuery(q);
   rows.push({enabled,heads:G.projectiles.list.length,cpuMedian:quantile(cpu,.5),cpuP95:quantile(cpu,.95),renderFinishMedian:quantile(times,.5),renderFinishP95:quantile(times,.95),fpsEquivalent:1000/quantile(times,.5),calls:draw.at(-1).calls,triangles:draw.at(-1).triangles,gpuTimerAvailable:!!ext,gpuMedianMs:gpu.length?quantile(gpu,.5):null,gpuSamples:gpu.length,pacedFPS:1000/quantile(paces,.5),pacedFrameMedianMs:quantile(paces,.5),geometryResources:G.renderer.info.memory.geometries,textures:G.renderer.info.memory.textures,jsHeap:performance.memory?.usedJSHeapSize||null});
  }G.fx.inkVolumes=volumes;return {fixedScene:true,softwareGLFinish:true,rows,volumeBytes:volumes.metrics.bytes};
 });
 fs.writeFileSync(path.join(evidence,'performance.json'),JSON.stringify(result.performance,null,2));
 result.lifecycle=await page.evaluate(()=>{
  const G=window.__G,e=G.fx.inkVolumes,initial=e.metrics.bytes,counts=[];
  for(let cycle=0;cycle<20;cycle++){G.projectiles.clear();G.fx.clear();G.projectiles._draw();G.renderer.render(G.scene,G.camera);counts.push({geometries:G.renderer.info.memory.geometries,textures:G.renderer.info.memory.textures,bytes:e.metrics.bytes,active:e.metrics.active});}
  const beforeDispose={...G.renderer.info.memory};e.dispose();G.renderer.render(G.scene,G.camera);return {initial,counts,beforeDispose,afterDispose:{...G.renderer.info.memory}};
 });
 }
 result.errors=errors;fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(result,null,2));assert.deepEqual(errors,[]);console.log(JSON.stringify({integration:result.integration,performance:result.performance,comparison:result.comparison.comparisons,errors},null,2));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
