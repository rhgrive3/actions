#!/usr/bin/env node
// Exact pixel and live WebGL attachment comparison using the emitted Renderer,
// Grade/Output/FXAA and ScreenFX. Restoring only the old depth flag before first
// binding is the baseline; format, shaders, scene and every pass are identical.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const site=path.resolve(arg('--site','_site')),out=path.resolve(arg('--out','post-depth.json')),engine=arg('--browser','chromium');
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
 browser=await ({chromium,webkit}[engine]).launch({headless:true,args:engine==='chromium'?['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 const page=await browser.newPage({viewport:{width:320,height:180},deviceScaleFactor:2}),errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto('http://127.0.0.1:'+server.address().port+'/');
 const result=await page.evaluate(async base=>{
  const THREE=await import('three'),{Renderer}=await import(base+'src/core/renderer.js'),{ScreenFX}=await import(base+'src/fx/screenfx.js'),{G}=await import(base+'src/core/ctx.js');
  let width=320,height=180;Object.defineProperty(window,'innerWidth',{configurable:true,get:()=>width});Object.defineProperty(window,'innerHeight',{configurable:true,get:()=>height});
  const rows=[],lifecycle=[];let negativeControl=false,frameCount=0;
  const make=(quality,baseline,touch=true)=>{
   G.mobile={touch,ios:touch};G.settings={quality,shadows:false,bloom:false};G.env={grade:{uLift:0}};
   const R=new Renderer(document.querySelector('#host'),G.settings),r=R.renderer,gl=r.getContext(),live=new Set();let created=0,deleted=0,sceneDraws=0;
   const create=gl.createRenderbuffer.bind(gl),remove=gl.deleteRenderbuffer.bind(gl);gl.createRenderbuffer=()=>{const b=create();live.add(b);created++;return b;};gl.deleteRenderbuffer=b=>{if(live.delete(b))deleted++;return remove(b);};
   const bind=r.setRenderTarget;r.setRenderTarget=function(target,...a){if(baseline&&target&&target===R.composer?.renderTarget1)target.depthBuffer=true;return bind.call(this,target,...a);};
   const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,width/height,.1,100);camera.position.set(0,0,5);
   const frontMat=new THREE.MeshBasicMaterial({color:0xf32b19}),backMat=new THREE.MeshBasicMaterial({color:0x1769ed}),frontGeo=new THREE.PlaneGeometry(1.4,1.4),backGeo=new THREE.PlaneGeometry(5,4),front=new THREE.Mesh(frontGeo,frontMat),back=new THREE.Mesh(backGeo,backMat);
   front.position.z=1;back.renderOrder=1;scene.add(front,back);R.setScene(scene,camera);const fx=new ScreenFX(R,G);
   const render=r.render;r.render=function(s,...a){if(s===scene){sceneDraws++;if(R._composerUsesPackedTarget&&r.getRenderTarget()!==R.composer.renderTarget2)throw Error('Scene drew into the color-only target');}return render.call(this,s,...a);};
   const flags=()=>({post:R.composer.renderTarget1.depthBuffer,scene:R.composer.renderTarget2.depthBuffer,packed:R._composerUsesPackedTarget,live:live.size,size:[R.composer.renderTarget1.width,R.composer.renderTarget1.height],created,deleted,sceneDraws});
   return {R,r,gl,fx,scene,camera,front,live,flags,dispose(){fx.dispose();R._disposeComposer();frontGeo.dispose();backGeo.dispose();frontMat.dispose();backMat.dispose();if(live.size)throw Error('Retained renderbuffers after disposal: '+live.size);r.dispose();r.domElement.remove();}};
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
  const digest=async pixels=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels)),v=>v.toString(16).padStart(2,'0')).join('');
  for(const quality of ['low','medium','high']){
   const pair=[make(quality,true),make(quality,false)];
   try{
    for(const [w,h,scale]of [[320,180,1],[180,320,.73],[640,360,1]]){
     width=w;height=h;pair.forEach(p=>p.R.setDynamicScale(scale));
     for(const effect of effects){
      G.env.grade={uLift:0};pair.forEach(p=>prepare(p,effect));const a=capture(pair[0]),b=capture(pair[1]);compare(a,b,quality+'/'+w+'/'+effect);
      if(!b.flags.packed||a.flags.live!==2||b.flags.live!==1||b.flags.post!==false||b.flags.scene!==true||b.depth[0]!==pair[1].gl.NONE||b.depth[1]!==pair[1].gl.RENDERBUFFER)throw Error('Unexpected mobile depth allocation');
      rows.push({quality,width:w,height:h,scale,effect:effect||'idle',pixelHash:await digest(b.pixels),before:a.flags,after:b.flags,changedChannels:0,depthBefore:a.depth,depthAfter:b.depth});
     }
    }
    for(const effect of [null,'damage']){
     pair.forEach(p=>{p.R.fxaa.enabled=false;prepare(p,effect);});const a=capture(pair[0]),b=capture(pair[1]);compare(a,b,'FXAA disabled '+effect);
     rows.push({quality,fxaa:false,effect:effect||'idle',pixelHash:await digest(b.pixels),before:a.flags,after:b.flags,changedChannels:0});
    }
    pair.forEach(p=>p.R.fxaa.enabled=true);
    // Both HDR fallback and the return to packed mode recreate correct roles.
    for(const lift of [-.1,-.1,0,0]){
     G.env.grade={uLift:lift};pair.forEach(p=>prepare(p,null));const a=capture(pair[0]),b=capture(pair[1]);compare(a,b,'grade fallback '+lift);
     if(b.flags.live!==(lift<0?2:1)||b.flags.post!==(lift<0))throw Error('Incorrect fallback depth policy');lifecycle.push({quality,lift,before:a.flags,after:b.flags});
    }
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));
    if(pair.some(p=>p.live.size||p.R.composer.renderTarget1))throw Error('Hidden composer retained its depth attachments');
    delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));pair.forEach(p=>prepare(p,null));
    const resumed=pair.map(capture);compare(resumed[0],resumed[1],'visible reconstruction');if(resumed[1].flags.live!==1||resumed[0].flags.live!==2)throw Error('Rebuilt composer lost depth roles');
    lifecycle.push({quality,visibility:'hidden release / visible rebuild',before:resumed[0].flags,after:resumed[1].flags});
    pair.forEach(p=>p.R.composer.reset());
    const resetFrames=pair.map(capture);compare(resetFrames[0],resetFrames[1],'native composer reset');compare(resumed[1],resetFrames[1],'reset output continuity');if(resetFrames[1].flags.live!==1||resetFrames[0].flags.live!==2)throw Error('Reset cloned away the scene/post depth roles');
    lifecycle.push({quality,operation:'native composer reset',before:resetFrames[0].flags,after:resetFrames[1].flags});
    if(quality==='low'){
     const p=pair[1];G.env.grade={uLift:0};prepare(p,null);const normal=capture(p),target=p.R.composer.renderTarget2;target.dispose();target.depthBuffer=false;const broken=capture(p);let changed=0;for(let i=0;i<normal.pixels.length;i++)changed+=normal.pixels[i]!==broken.pixels[i];if(!changed)throw Error('Removing scene depth was not detected');negativeControl=true;
    }
   }finally{pair.forEach(p=>p.dispose());}
  }
  const desktop=make('low',false,false);try{G.env.grade={uLift:0};prepare(desktop,null);const r=capture(desktop);if(r.flags.packed||r.flags.live!==2||!r.flags.post||!r.flags.scene)throw Error('Desktop depth roles changed');lifecycle.push({desktop:true,after:r.flags});}finally{desktop.dispose();}
  return {rows,lifecycle,negativeControl,frameCount,disposedLiveRenderbuffers:0};
 },base);
 assert.deepEqual(errors,[]);assert.equal(result.rows.length,78);assert.equal(result.negativeControl,true);
 const report={status:'passed',engine,browser:browser.version(),contentHash:manifest.contentHash,revision:manifest.build.revision,scope:'Actual emitted Renderer and ScreenFX; baseline restores only the old post-depth flag before first WebGL binding. Exact completed RGBA pixel comparison and live renderbuffer/attachment counts. No physical-iPad GPU memory, RSS or FPS claim.',...result,artifacts:[...receipts].sort()};
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,browser:report.browser,cases:report.rows.length,negativeControl:report.negativeControl,contentHash:report.contentHash}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
