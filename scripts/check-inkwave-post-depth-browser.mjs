#!/usr/bin/env node
// Exact pixel and live WebGL attachment comparison using the emitted Renderer,
// Grade/Output/FXAA and ScreenFX. Restoring only the old depth flag before first
// binding is the baseline; format, shaders, scene and every pass are identical.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {launchSandboxBrowser} from './lib/inkwave-sandbox-browser.mjs';
import {verifyRuntimeBuild} from './lib/inkwave-runtime-evidence.mjs';
const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const site=path.resolve(arg('--site','_site')),out=path.resolve(arg('--out','post-depth.json')),engine=arg('--browser','chromium');
const sourceSha=arg('--source-sha',null),root=fileURLToPath(new URL('../',import.meta.url));
if(sourceSha)verifyRuntimeBuild(site,root,sourceSha);
assert.ok(['chromium','webkit'].includes(engine));
const hash=b=>createHash('sha256').update(b).digest('hex'),manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),base='/_versions/'+manifest.build.revision+'/',receipts=new Set();
assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);
const html='<!doctype html><div id="host"></div><script type="importmap">'+JSON.stringify({imports:{three:base+'vendor/three/build/three.module.js','three/addons/':base+'vendor/three/jsm/'}})+'</script>';
const server=http.createServer((req,res)=>{try{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(name==='/favicon.ico'){res.writeHead(204);res.end();return;}
 if(name==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return;}
 const rel=name.slice(1),file=path.resolve(site,rel);assert.ok(file.startsWith(site+'/')&&manifest.artifacts[rel]);const bytes=fs.readFileSync(file);assert.equal(hash(bytes),manifest.artifacts[rel]);receipts.add(rel);
 res.writeHead(200,{'content-type':/\.m?js$/.test(file)?'text/javascript':'application/octet-stream'});res.end(bytes);
 }catch(e){res.writeHead(404);res.end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=engine==='chromium'?await launchSandboxBrowser(chromium):await webkit.launch({headless:true,...(process.env.INKWAVE_WEBKIT?{executablePath:process.env.INKWAVE_WEBKIT}:{})});
 const page=await browser.newPage({viewport:{width:320,height:180},deviceScaleFactor:2}),errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto('http://127.0.0.1:'+server.address().port+'/');
 const result=await page.evaluate(async base=>{
  const THREE=await import('three'),{Renderer}=await import(base+'src/core/renderer.js'),{ScreenFX}=await import(base+'src/fx/screenfx.js'),{G}=await import(base+'src/core/ctx.js');
  let width=320,height=180;Object.defineProperty(window,'innerWidth',{configurable:true,get:()=>width});Object.defineProperty(window,'innerHeight',{configurable:true,get:()=>height});
  const rows=[],lifecycle=[],contextRecovery=[];let negativeControl=false,frameCount=0;
  const make=(quality,baseline,touch=true,rejectPacked=false)=>{
   G.mobile={touch,ios:touch};G.settings={quality,shadows:false,bloom:false};G.env={grade:{uLift:0}};
   const R=new Renderer(document.querySelector('#host'),G.settings),r=R.renderer,gl=r.getContext(),live=new Set();let created=0,deleted=0,sceneDraws=0;
   const create=gl.createRenderbuffer.bind(gl),remove=gl.deleteRenderbuffer.bind(gl);gl.createRenderbuffer=()=>{const b=create();live.add(b);created++;return b;};gl.deleteRenderbuffer=b=>{if(live.delete(b))deleted++;return remove(b);};
   const bind=r.setRenderTarget;r.setRenderTarget=function(target,...a){if(baseline&&target&&target===R.composer?.renderTarget1)target.depthBuffer=true;return bind.call(this,target,...a);};
   const status=gl.checkFramebufferStatus.bind(gl);gl.checkFramebufferStatus=function(target){const bound=r.getRenderTarget();return rejectPacked&&bound?.width===1&&bound?.texture?.format===THREE.RGBFormat?gl.FRAMEBUFFER_UNSUPPORTED:status(target);};
   const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,width/height,.1,100);camera.position.set(0,0,5);
   const frontMat=new THREE.MeshBasicMaterial({color:0xf32b19}),backMat=new THREE.MeshBasicMaterial({color:0x1769ed}),frontGeo=new THREE.PlaneGeometry(1.4,1.4),backGeo=new THREE.PlaneGeometry(5,4),front=new THREE.Mesh(frontGeo,frontMat),back=new THREE.Mesh(backGeo,backMat);
   front.position.z=1;back.renderOrder=1;scene.add(front,back);R.setScene(scene,camera);const fx=new ScreenFX(R,G);
   const render=r.render;r.render=function(s,...a){if(s===scene){sceneDraws++;if(R._composerPackedCapable&&r.getRenderTarget()!==R.composer.renderTarget2)throw Error('Scene drew into the color-only target');}return render.call(this,s,...a);};
   const flags=()=>({post:R.composer.renderTarget1.depthBuffer,scene:R.composer.renderTarget2.depthBuffer,packed:R._composerUsesPackedTarget,canPack:R._composerPackedCapable,active:fx.pass.enabled,postType:R.composer.renderTarget1.texture.type,sceneType:R.composer.renderTarget2.texture.type,live:live.size,size:[R.composer.renderTarget1.width,R.composer.renderTarget1.height],created,deleted,sceneDraws});
   return {R,r,gl,fx,scene,camera,front,live,flags,dispose(){fx.dispose();R._disposeComposer();frontGeo.dispose();backGeo.dispose();frontMat.dispose();backMat.dispose();if(live.size)throw Error('Retained renderbuffers after disposal: '+live.size);r.dispose();/* Retire owned test contexts instead of depending on GC to stay below the browser context limit. */R._contextLost=true;r.forceContextLoss();r.domElement.remove();}};
  };
  const effects=[null,'damage','heart','swim','aura','flood','reveal','splat'];
  const prepare=(p,effect)=>{
   p.fx.reset();p.fx.time=.375;p.fx.force=null;p.fx.debugHold=0;let seed=71;const random=Math.random;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
   try{if(effect)p.fx.test(effect,{amount:50,t:.64,x:.73,y:.58,size:.13,angle:.3,hold:8});p.fx.update(effect?1/60:0,null);}finally{Math.random=random;}
  };
  const capture=p=>{
   p.R.render();const {gl,r}=p;gl.finish();const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL error');
   const attachment=t=>{r.setRenderTarget(t);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Incomplete framebuffer');return gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE);};
   const depth=[attachment(p.R.composer.renderTarget1),attachment(p.R.composer.renderTarget2)];r.setRenderTarget(null);frameCount++;return {pixels,flags:p.flags(),depth};
  };
  const compare=(a,b,label)=>{if(a.pixels.length!==b.pixels.length)throw Error(label+' pixel lengths');let nonblank=0;for(let i=0;i<a.pixels.length;i++){if(a.pixels[i]!==b.pixels[i])throw Error(label+' changed channel '+i);if(i%4!==3&&a.pixels[i]>24)nonblank++;}if(nonblank<100)throw Error(label+' blank frame');};
  const mobileRoles=(a,b,label,gl)=>{
   const expectedPacked=!b.flags.active&&(G.env?.grade?.uLift??0)>=0;
   if(!a.flags.canPack||!b.flags.canPack||a.flags.packed!==expectedPacked||b.flags.packed!==expectedPacked||a.flags.live!==2||b.flags.live!==1||b.flags.post!==false||b.flags.scene!==true||b.depth[0]!==gl.NONE||b.depth[1]!==gl.RENDERBUFFER||a.depth[0]!==gl.RENDERBUFFER||a.depth[1]!==gl.RENDERBUFFER||b.flags.sceneType!==THREE.HalfFloatType||b.flags.postType!==(expectedPacked?THREE.UnsignedInt101111Type:THREE.HalfFloatType))throw Error(label+' unexpected mobile precision/depth roles');
  };
  const digest=async pixels=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels)),v=>v.toString(16).padStart(2,'0')).join('');
  for(const quality of ['low','medium','high']){
   const pair=[make(quality,true),make(quality,false)];
   try{
    pair.forEach(p=>prepare(p,'damage'));const startup=pair.map(capture);compare(startup[0],startup[1],'startup active HDR');mobileRoles(startup[0],startup[1],'startup active HDR',pair[1].gl);lifecycle.push({quality,startupActive:true,before:startup[0].flags,after:startup[1].flags});
    for(const [w,h,scale]of [[320,180,1],[180,320,.73],[640,360,1]]){
     width=w;height=h;pair.forEach(p=>p.R.setDynamicScale(scale));
     for(const effect of effects){
      G.env.grade={uLift:0};pair.forEach(p=>prepare(p,effect));const a=capture(pair[0]),b=capture(pair[1]);compare(a,b,quality+'/'+w+'/'+effect);
      mobileRoles(a,b,quality+'/'+w+'/'+effect,pair[1].gl);
      rows.push({quality,width:w,height:h,scale,effect:effect||'idle',pixelHash:await digest(b.pixels),before:a.flags,after:b.flags,changedChannels:0,depthBefore:a.depth,depthAfter:b.depth});
     }
    }
    for(const effect of [null,'damage']){
     pair.forEach(p=>{p.R.fxaa.enabled=false;prepare(p,effect);});const a=capture(pair[0]),b=capture(pair[1]);compare(a,b,'FXAA disabled '+effect);mobileRoles(a,b,'FXAA disabled '+effect,pair[1].gl);
     rows.push({quality,fxaa:false,effect:effect||'idle',pixelHash:await digest(b.pixels),before:a.flags,after:b.flags,changedChannels:0});
    }
    pair.forEach(p=>p.R.fxaa.enabled=true);
    // Both HDR fallback and the return to packed mode recreate correct roles.
    for(const lift of [-.1,-.1,0,0]){
     G.env.grade={uLift:lift};pair.forEach(p=>prepare(p,null));const a=capture(pair[0]),b=capture(pair[1]);compare(a,b,'grade fallback '+lift);
     mobileRoles(a,b,'grade fallback '+lift,pair[1].gl);lifecycle.push({quality,lift,before:a.flags,after:b.flags});
    }
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));
    if(pair.some(p=>p.live.size||p.R.composer.renderTarget1))throw Error('Hidden composer retained its depth attachments');
    delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));pair.forEach(p=>prepare(p,null));
    const resumed=pair.map(capture);compare(resumed[0],resumed[1],'visible reconstruction');if(resumed[1].flags.live!==1||resumed[0].flags.live!==2)throw Error('Rebuilt composer lost depth roles');
    lifecycle.push({quality,visibility:'hidden release / visible rebuild',before:resumed[0].flags,after:resumed[1].flags});
    pair.forEach(p=>p.R.composer.reset());
    const resetFrames=pair.map(capture);compare(resetFrames[0],resetFrames[1],'native composer reset');compare(resumed[1],resetFrames[1],'reset output continuity');if(resetFrames[1].flags.live!==1||resetFrames[0].flags.live!==2)throw Error('Reset cloned away the scene/post depth roles');
    lifecycle.push({quality,operation:'native composer reset',before:resetFrames[0].flags,after:resetFrames[1].flags});
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));
    if(pair.some(p=>p.live.size||p.R.composer.renderTarget1))throw Error('Hidden composer retained active reconstruction attachments');
    delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));pair.forEach(p=>prepare(p,'damage'));
    const activeRebuild=pair.map(capture);compare(activeRebuild[0],activeRebuild[1],'hidden to active HDR reconstruction');mobileRoles(activeRebuild[0],activeRebuild[1],'hidden to active HDR reconstruction',pair[1].gl);
    lifecycle.push({quality,visibility:'hidden release / active HDR rebuild',before:activeRebuild[0].flags,after:activeRebuild[1].flags});
    if(quality==='low'){
     const p=pair[1];G.env.grade={uLift:0};prepare(p,null);const normal=capture(p),target=p.R.composer.renderTarget2;target.dispose();target.depthBuffer=false;const broken=capture(p);let changed=0;for(let i=0;i<normal.pixels.length;i++)changed+=normal.pixels[i]!==broken.pixels[i];if(!changed)throw Error('Removing scene depth was not detected');negativeControl=true;
    }
   }finally{pair.forEach(p=>p.dispose());}
  }
  const desktop=make('low',false,false);try{G.env.grade={uLift:0};prepare(desktop,null);const r=capture(desktop);if(r.flags.packed||r.flags.live!==2||!r.flags.post||!r.flags.scene)throw Error('Desktop depth roles changed');lifecycle.push({desktop:true,after:r.flags});}finally{desktop.dispose();}
  const unsupported=[make('low',true,true,true),make('low',false,true,true)];
  try{G.env.grade={uLift:0};unsupported.forEach(p=>prepare(p,'damage'));const pair=unsupported.map(capture);compare(pair[0],pair[1],'injected packed-FBO rejection HDR');
   for(const p of pair)if(p.flags.canPack||p.flags.packed||p.flags.live!==2||!p.flags.post||!p.flags.scene||p.flags.postType!==THREE.HalfFloatType||p.flags.sceneType!==THREE.HalfFloatType)throw Error('Unsupported packed FBO changed HDR/depth fallback');
   lifecycle.push({unsupportedPackedFbo:true,before:pair[0].flags,after:pair[1].flags,changedChannels:0});
  }finally{unsupported.forEach(p=>p.dispose());}
  // Actual Renderer intentionally blocks all draws after a lost context: the
  // paint atlas contents cannot be reconstructed from surviving CPU score state.
  // Verify the real GL generation boundary and controlled-reload policy, then
  // compare a newly constructed renderer to the exact pre-loss output.
  const waitContextEvent=(canvas,type)=>new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error(type+' event timed out')),10000);
   canvas.addEventListener(type,event=>{clearTimeout(timer);if(type==='webglcontextlost')event.preventDefault();resolve();},{once:true});
  });
  for(const quality of ['low','medium','high'])for(const baseline of [true,false]){
   G.env.grade={uLift:0};const p=make(quality,baseline);let before;
   const savedMatch=G.match,savedNet=G.net;let leaves=0;
   try{
    prepare(p,null);before=capture(p);const draws=p.flags().sceneDraws;
    G.match={paused:false};G.net={active:true,leave(){leaves++;this.active=false;}};
    const lose=p.gl.getExtension('WEBGL_lose_context');if(!lose)throw Error('Context-loss extension unavailable');
    p.r.domElement.addEventListener('webglcontextlost',()=>p.live.clear(),{once:true});
    const lost=waitContextEvent(p.r.domElement,'webglcontextlost');
    lose.loseContext();await lost;
    if(!p.gl.isContextLost()||!p.R._contextLost||!G.match.paused||leaves!==1)throw Error('Context loss did not halt the owned match/network');
    const overlay=p.R._contextRecoveryOverlay;
    if(!overlay?.isConnected||overlay.getAttribute('role')!=='alertdialog'||!overlay.querySelector('button'))throw Error('Missing actionable graphics recovery overlay');
    p.R.render();if(p.flags().sceneDraws!==draws||p.live.size)throw Error('Lost context rendered or rebuilt invalid targets');
    const restored=waitContextEvent(p.r.domElement,'webglcontextrestored');
    // A microtask is still inside the lost-event task. Chromium only permits
    // WEBGL_lose_context restoration after that entire task has completed.
    await new Promise(resolve=>setTimeout(resolve,0));lose.restoreContext();await restored;
    p.R.render();
    if(p.gl.isContextLost()||!p.R._contextLost||!G.match.paused||leaves!==1||p.flags().sceneDraws!==draws||p.live.size)throw Error('Restored GL silently resumed stale game/paint output');
    contextRecovery.push({quality,baseline,lossObserved:true,restorationObserved:true,matchPaused:true,leaveCalls:leaves,reloadRequired:true,drawsAfterLoss:0,liveTargetsAfterLoss:0});
   }finally{G.match=savedMatch;G.net=savedNet;p.R._contextRecoveryOverlay?.remove();p.dispose();}
   const fresh=make(quality,baseline);
   try{prepare(fresh,null);const after=capture(fresh);compare(before,after,quality+' clean reconstruction after context loss');
    if(after.flags.live!==(baseline?2:1)||after.flags.post!==baseline||!after.flags.scene)throw Error('Clean renderer lost scene/post depth policy');
    Object.assign(contextRecovery.at(-1),{cleanReconstructionChangedChannels:0,cleanDepth:after.depth,cleanFlags:after.flags});
   }finally{fresh.dispose();}
  }
  return {rows,lifecycle,contextRecovery,negativeControl,frameCount,disposedLiveRenderbuffers:0};
 },base);
 assert.deepEqual(errors,[]);assert.equal(result.rows.length,78);assert.equal(result.negativeControl,true);assert.equal(result.contextRecovery.length,6);
 if(sourceSha)verifyRuntimeBuild(site,root,sourceSha);
 const report={status:'passed',engine,browser:browser.version(),sourceSha,harnessSha256:hash(fs.readFileSync(new URL(import.meta.url))),contentHash:manifest.contentHash,revision:manifest.build.revision,scope:'Actual emitted Renderer and ScreenFX; baseline restores only the old post-depth flag before first WebGL binding. Exact completed RGBA pixel comparison and live renderbuffer/attachment counts. No physical-iPad GPU memory, RSS or FPS claim.',...result,artifacts:[...receipts].sort()};
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,browser:report.browser,cases:report.rows.length,negativeControl:report.negativeControl,contentHash:report.contentHash}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
