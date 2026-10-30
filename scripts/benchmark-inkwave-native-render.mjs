#!/usr/bin/env node
// Full production-frame throughput, including GPU completion. SwiftShader
// results describe this software renderer, not physical-device/display FPS.
// Compare separate ordinary builds with the same arguments and replay hashes.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const site=fs.realpathSync(option('--site','_site'));
const out=path.resolve(option('--out','.browser-evidence/native-render'));
const stage=option('--stage','robo'),quality=option('--quality','medium');
const warmup=Number(option('--warmup','60')),frames=Number(option('--frames','30')),runs=Number(option('--runs','3'));
const setupFrames=Number(option('--setup-frames','450'));
const syncFrames=process.argv.includes('--sync-frames'),occlusionChecks=process.argv.includes('--occlusion-checks');
const imagesOnly=process.argv.includes('--images-only');
assert.ok([warmup,frames,runs].every(Number.isSafeInteger)&&warmup>=1&&warmup<=600&&frames>=1&&frames<=300&&runs>=1&&runs<=10);
assert.ok(Number.isSafeInteger(setupFrames)&&setupFrames>=450&&setupFrames<=1800);
assert.ok(!['/tmp','/var/tmp','/dev/shm'].some(p=>out===p||out.startsWith(p+'/')));
fs.mkdirSync(out,{recursive:true});
const browserTemp=path.resolve('.ci-scratch/native-render-tmp');
fs.mkdirSync(browserTemp,{recursive:true});
for(const name of ['TMPDIR','TMP','TEMP'])process.env[name]=browserTemp;
const {chromium,webkit}=await import('playwright');
const browserName=option('--browser','chromium'),device=option('--device','desktop');
assert.ok(['chromium','webkit'].includes(browserName));assert.ok(['desktop','ipad'].includes(device));
const viewport=device==='ipad'?{width:1024,height:768}:{width:960,height:540};
const activePreroll=Number(option('--active-preroll','0'));assert.ok(Number.isSafeInteger(activePreroll)&&activePreroll>=0&&activePreroll<=600);
const hash=b=>createHash('sha256').update(b).digest('hex');
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
assert.equal(hash(JSON.stringify(build.artifacts)),build.contentHash);
for(const [file,digest] of Object.entries(build.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,file))),digest,file);
const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
  try{
    const rel=decodeURIComponent(new URL(req.url,'http://local').pathname);
    const file=path.resolve(site,'.'+(rel==='/'?'/index.html':rel));
    if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error('Missing');
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const result={schema:1,status:'running',stage,quality,setupFrames,warmup,frames,runs,contentHash:build.contentHash,
  syncFrames,occlusionChecks,imagesOnly,activePreroll,
  sourceInputHash:hash(JSON.stringify(build.files)),revision:build.build.revision,
  environment:{cpu:os.cpus()[0]?.model,node:process.version,viewport:[viewport.width,viewport.height],browser:browserName,device,renderer:browserName==='chromium'?'SwiftShader':'WebKit GL'},windows:[],errors:[],
  measurement:'Fixed 60 Hz production simulation plus all ordinary render passes; wall time includes GPU completion. Not a physical-device or presentation-latency measurement.'};
const save=()=>{const file=path.join(out,'result.json');fs.writeFileSync(file+'.pending',JSON.stringify(result,null,2)+'\n');fs.renameSync(file+'.pending',file);};
save();
if(imagesOnly)result.measurement='Image-only fixed replay. Post-setup simulation skips drawing; snapshots are rendered separately. No FPS measurement.';
const browser=await (browserName==='webkit'?webkit.launch({headless:true}):chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']}));
result.environment.browserVersion=browser.version();
try{
  const page=await browser.newPage({viewport,...(device==='ipad'?{deviceScaleFactor:2,isMobile:true,hasTouch:true,
    userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'}:{})});
  page.setDefaultTimeout(300000);
  page.on('pageerror',e=>{result.errors.push(e.message);save();});
  page.on('console',m=>{if(m.type()==='error'&&/THREE\.WebGLProgram|GL_INVALID|VALIDATE_STATUS|shader error/i.test(m.text())){result.errors.push(m.text());save();}});
  await page.addInitScript(({quality,device})=>{
    if(device==='ipad'){
      Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5});
      Object.defineProperty(navigator,'deviceMemory',{get:()=>undefined});
    }
    localStorage.setItem('inkwave.settings',JSON.stringify({quality,shadows:true,bloom:true,minimap:true,musicVolume:0,audioVolume:0}));
    let seed=24680;
    window.nativeRenderSeed=step=>{seed=(24680+Math.imul(step,2654435761))>>>0;};
    Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  },{quality,device});
  await page.goto('http://127.0.0.1:'+server.address().port+'/?map='+encodeURIComponent(stage),{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__G?.game?.menus&&__G.mode!=='boot'||document.querySelector('#boot-error')?.textContent);
  result.setup=await page.evaluate(async ({stage,setupFrames})=>{
    const G=__G,g=G.game;g.debug.freeze();g._skipRender=true;g.menus.wipe.cancel();
    const proto=Object.getPrototypeOf(G.match),setup=proto.setup;
    proto.setup=function(...a){nativeRenderSeed(0);return setup.apply(this,a);};
    if(G.audio){let s=12345;G.audio.rng=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
    await g.startMatch({mapId:stage,mode:'turf',difficulty:'normal',duration:180});
    G.time=0;g.rig.time=0;g.rig.shakeSeed=37.5;G.paint.clock=0;g.s3Clock?.reset();
    const [p0,p1]=G.level.spawnPads;g.rig.yaw=Math.atan2(p1.x-p0.x,p1.z-p0.z);g.rig.pitch=.2;
    // Match the same 77-frame post-intro probe after the current cinematic.
    const probeFire=(G.match.turfIntroFrames??253)+77;
    for(let i=0;i<setupFrames;i++){
      if(i===probeFire)g.debug.fire(true);if(i===probeFire+3)g.debug.fire(false);
      nativeRenderSeed(i);g._frame(1/60);
    }
    g._skipRender=false;g.R.setDynamicScale(1);window.nativeRenderFrame=setupFrames;
    const gl=G.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
    window.nativeRenderPrograms=0;window.nativeRenderProgramEvents=[];const create=gl.createProgram,attach=gl.attachShader;
    gl.createProgram=function(...a){nativeRenderPrograms++;return create.apply(this,a);};
    gl.attachShader=function(program,shader){
      const source=gl.getShaderSource(shader)||'',name=source.match(/#define SHADER_NAME ([^\n]+)/)?.[1];
      nativeRenderProgramEvents.push({step:window.nativeRenderFrame,name,type:gl.getShaderParameter(shader,gl.SHADER_TYPE),defines:source.split('\n').filter(l=>/^#define (USE_|SHADOWMAP_TYPE_)/.test(l))});
      return attach.call(this,program,shader);
    };
    g.debug.key('KeyW',true);g.debug.fire(true);
    return{native:G.level.native,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,state:G.match.state,
      device:g.mobile,paused:G.match.paused,menu:g.menus.current||null,framebuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],coreDepth:!!g.levelMesh._coreDepth,
      textureQuality:g.nativeWorld.metrics.quality,textureLimit:g.nativeWorld.metrics.textureLimit,textureCount:g.nativeWorld.metrics.textureCount,
      idleTextureWorkersReleased:!!g.nativeWorld.display.currentTextures()._idleWorkersReleased,
      quality:g.R.q,atlas:G.paint.size,sourceSha256:G.level.manifest.sourceSha256,
      renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
  },{stage,setupFrames});
  assert.equal(result.setup.native,true);assert.equal(result.setup.actors,8);assert.equal(result.setup.bots,7);assert.equal(result.setup.state,'playing');save();
  assert.ok(!result.setup.paused&&!result.setup.menu,'Replay must run an unobstructed active match');
  if(device==='ipad')assert.ok(result.setup.device.touch&&result.setup.device.ios&&result.setup.device.ipad,'iPad profile was not selected');
  console.log('setup '+JSON.stringify(result.setup));
  result.workersAfterSetup=page.workers().length;
  if(activePreroll)await page.evaluate(count=>{
    const g=__G.game;g._skipRender=true;
    for(let i=0;i<count;i++){nativeRenderSeed(nativeRenderFrame++);g._frame(1/60);}
    g._skipRender=false;
  },activePreroll);
  if(imagesOnly){
    result.semantic=await page.evaluate(count=>{
      const G=__G,g=G.game;g._skipRender=true;
      for(let i=0;i<count;i++){nativeRenderSeed(nativeRenderFrame++);g._frame(1/60);}
      g._skipRender=false;
      return{step:nativeRenderFrame,actors:G.actors.map(a=>({pos:a.pos.toArray(),vel:a.vel.toArray(),hp:a.hp,ink:a.ink,alive:a.alive})),
        paint:{counts:[...G.paint.counts],grid:Array.from(G.paint.grid),coverage:G.paint.coverage()}};
    },warmup+frames*runs);
    result.semantic.paint.gridSha256=hash(Uint8Array.from(result.semantic.paint.grid));delete result.semantic.paint.grid;save();
  }else{
  for(let i=0;i<warmup;i++){
    await page.evaluate(()=>{nativeRenderSeed(nativeRenderFrame++);__G.game._frame(1/60);const gl=__G.renderer.getContext();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));});
    if(i%10===9){result.completedWarmup=i+1;save();console.log('warmup '+(i+1));}
  }
  for(let run=0;run<runs;run++){
    const row=await page.evaluate(({frames,syncFrames})=>{
      const G=__G,g=G.game,gl=G.renderer.getContext(),times=[],counts=[],trace=[];
      if(g._skipRender||!g.frozen||G.actors.length!==8||g.menus.current||G.match.paused)throw Error('Full-frame replay owners changed');
      const firstStep=nativeRenderFrame,programs=nativeRenderPrograms;
      const completionPixel=new Uint8Array(4),complete=()=>gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,completionPixel);
      complete();const start=performance.now();
      for(let i=0;i<frames;i++){
        nativeRenderSeed(nativeRenderFrame++);const t=performance.now();g._frame(1/60);if(syncFrames)complete();times.push(performance.now()-t);
        counts.push({calls:G.renderer.info.render.calls,triangles:G.renderer.info.render.triangles});
        trace.push(G.actors.map(a=>[a.pos.x,a.pos.y,a.pos.z,a.vel.x,a.vel.y,a.vel.z,a.hp,a.ink,a.alive]));
      }
      const submit=performance.now();complete();const end=performance.now();
      return{firstStep,frames,elapsedMs:end-start,submitMs:submit-start,completionMs:end-submit,fps:frames*1000/(end-start),
        newPrograms:nativeRenderPrograms-programs,times,counts,trace,
        actors:G.actors.map(a=>({weapon:a.weaponId,pos:a.pos.toArray(),hp:a.hp,ink:a.ink,alive:a.alive})),
        paint:{counts:[...G.paint.counts],grid:Array.from(G.paint.grid),coverage:G.paint.coverage()},
        quality:g.R.q,scale:g.R.dynScale,glError:gl.getError(),state:G.match.state,completionPixel:Array.from(completionPixel),
        stencilMask:{present:!!g.levelMesh._stencilMask,visible:g.levelMesh._stencilMask?.material.visible??false},
        coreDepth:{present:!!g.levelMesh._coreDepth,seeOn:g.levelMat.userData.uniforms.uSeeOn.value},
        targets:[g.R.composer.renderTarget1,g.R.composer.renderTarget2].map(t=>({samples:t.samples,depth:t.depthBuffer,stencil:t.stencilBuffer,width:t.width,height:t.height,type:t.texture.type}))};
    },{frames,syncFrames});
    row.traceSha256=hash(JSON.stringify(row.trace));delete row.trace;
    row.paint.gridSha256=hash(Uint8Array.from(row.paint.grid));delete row.paint.grid;
    result.windows.push({run,...row});save();console.log('window '+JSON.stringify({run,fps:row.fps,newPrograms:row.newPrograms,trace:row.traceSha256,grid:row.paint.gridSha256}));
    assert.equal(row.glError,0);assert.equal(row.scale,1);assert.equal(row.state,'playing');assert.deepEqual(row.quality,result.setup.quality);
  }
  result.programEvents=await page.evaluate(()=>nativeRenderProgramEvents);
  assert.ok(result.windows.every(w=>w.newPrograms===0),'Measured window created cold shaders; increase the common warmup');
  if(syncFrames){
    const sorted=result.windows.flatMap(w=>w.times).sort((a,b)=>a-b),q=p=>sorted[Math.min(sorted.length-1,Math.ceil(p*sorted.length)-1)];
    result.completedFrameMs={samples:sorted.length,p50:q(.5),p95:q(.95),p99:q(.99),max:sorted.at(-1)};
  }
  }
  // Frozen image comparisons are separate from timed windows. Re-render the
  // water reflection for each camera; no simulation advances between views.
  const views=[['forward',0],['left',Math.PI/2],['back',Math.PI],['right',-Math.PI/2]];
  if(occlusionChecks)views.push(['feet-lowered',0,-3,1],['feet-raised',0,3,1],['window-off',0,0,0]);
  result.imageViews=views.map(v=>v[0]);
  for(const [label,turn,feetOffset=0,seeOn] of views){
    const png=await page.evaluate(({turn,feetOffset,seeOn})=>{
      const G=__G,g=G.game,c=G.camera;
      window.nativeRenderCamera??={q:c.quaternion.clone(),feet:G.match.local.pos.y,see:g.levelMat.userData.uniforms.uSeeOn.value};c.quaternion.copy(nativeRenderCamera.q);
      G.match.local.pos.y=nativeRenderCamera.feet+feetOffset;g.levelMat.userData.uniforms.uSeeOn.value=seeOn??nativeRenderCamera.see;
      c.rotateY(turn);c.updateMatrixWorld();if(G.env)G.env._reflFrame=-1;
      g.R.render();const gl=G.renderer.getContext();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
      const error=gl.getError();if(error)throw Error('Image render GL error '+error);return G.renderer.domElement.toDataURL();
    },{turn,feetOffset,seeOn});
    fs.writeFileSync(path.join(out,label+'.png'),Buffer.from(png.split(',')[1],'base64'));
  }
  result.workersAfterImages=page.workers().length;
  assert.equal(result.errors.length,0);result.status='passed';
}catch(error){result.status='failed';result.error=error.stack;process.exitCode=1;}
finally{save();await browser.close();await new Promise(r=>server.close(r));}
console.log(JSON.stringify({status:result.status,fps:result.windows.map(w=>w.fps),error:result.error}));
