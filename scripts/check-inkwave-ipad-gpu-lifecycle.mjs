#!/usr/bin/env node
// Production Menus/InkWipe/Renderer with a deterministic offline API and simple
// scene. Counts real GL resources and completed pixels, not iPad hardware RAM.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium,webkit,devices} from 'playwright';
import {createResponsiveAssetServer} from './lib/inkwave-responsive-server.mjs';
const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const site=path.resolve(arg('--site','_site')),out=path.resolve(arg('--out','work/ipad-gpu-lifecycle.json'));
const engine=arg('--browser','chromium');assert(['chromium','webkit'].includes(engine));
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);
// Validate the exact served tree, including native version-addressed imports.
for(const [name,digest] of Object.entries(manifest.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,name))),digest,name);
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/styles/ui.css"><link rel="stylesheet" href="/styles/mobile.css"><link rel="stylesheet" href="/patches/splatoon3/ui.css">
<style>html,body{margin:0;overflow:hidden}#ui-root{position:fixed;inset:0}</style>
<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>
<div id="host"></div><div id="ui-root"></div><script type="module">
import {Menus} from '/src/ui/menus.js';import {G} from '/src/core/ctx.js';import {DEFAULT_SETTINGS} from '/src/config.js';
import {install} from '/patches/splatoon3/runtime/install.mjs';
install(await(await fetch('/patches/splatoon3/profile.json')).json());
window.G=G;window.settings={...DEFAULT_SETTINGS,lang:'en',quality:'high',shadows:false,bloom:false};G.settings=settings;
window.menus=new Menus(document.querySelector('#ui-root'),{getSettings:()=>settings,getProfile:()=>({name:'GPU check',weapon:'shooter'}),getLoadout:()=>({weapon:'shooter'})});window.ready=true;
</script></html>`;
const server=createResponsiveAssetServer({source:site,html});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await({chromium,webkit}[engine]).launch({headless:true,...(engine==='chromium'?{...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']}: {})});
 const context=await browser.newContext({...devices['iPad Pro 11'],viewport:{width:1194,height:834},reducedMotion:'no-preference'});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/__menus?news=0`);await page.waitForFunction(()=>window.ready);
 const menus=await page.evaluate(async()=>{
  const m=window.menus;document.documentElement.classList.add('iw-ios');
  const rows=[],original=m._runWipe;let wipes=0;
  m._runWipe=function(...args){wipes++;return original.apply(this,args);};
  // A previous full wipe's onMid must not restore the old page when pause cancels it.
  m.show('main',{wipe:false,light:false});m.show('settings',{wipe:true});
  const stale=m._swapToken;m.show('pause');
  if(m.wipe.running||m.current!=='pause'||m._scr.name!=='pause'||m._swapToken<=stale)throw Error('Stale menu transition survived pause');
  rows.push({action:'cancel running wipe',screen:m.current,canvas:[m.wipe.cv.width,m.wipe.cv.height]});
  for(let cycle=0;cycle<12;cycle++)for(const nested of [false,true])for(const destination of [null,'main','title']){
   m.show('pause',{wipe:false,light:false,force:true});if(nested)m.show('settings',{push:true});
   const old=m._scr.el,before=wipes;m.show(destination,{wipe:true});
   if(wipes!==before||old.isConnected||m.current!==destination||m.wipe.running)throw Error('iPad pause departure retained a wipe or old screen');
  }
  rows.push({action:'pause/nested settings exits',cycles:12,transitions:72,passed:true});
  m.show('pause',{wipe:false,light:false,force:true});let quit=0;
  m.api.quitMatch=()=>{quit++;m.show(null);};
  document.querySelector('[data-id="quit"]').click();
  const old=m._scr.el;document.querySelector('.iw-modal__btns button:last-child').click();
  if(quit!==1||m.current!==null||old.isConnected)throw Error('Real quit confirmation failed');
  rows.push({action:'real quit confirmation',passed:true});
  for(const mode of ['full','light','fade']){
   let mid=0,done=0;m.wipe.run({mode,onMid(){mid++;},onDone(){done++;}});
   const allocated=[m.wipe.cv.width,m.wipe.cv.height];
   await new Promise(resolve=>{const finish=m.wipe.r.onDone;m.wipe.r.onDone=()=>{finish();resolve();};});
   if(mid!==1||done!==1||m.wipe.cv.width!==1||m.wipe.cv.height!==1)throw Error('Completed wipe retained its canvas or lost its callback');
   rows.push({action:'natural '+mode+' completion',allocated,released:[m.wipe.cv.width,m.wipe.cv.height]});
  }
  m.show(null);return rows;
 });
 // Use real WebGL attachments at a small fixed fixture size: changing the
 // logical viewport below exercises resize without claiming physical iPad load.
 const gpu=await page.evaluate(async()=>{
  const THREE=await import('three'),{Renderer}=await import('/src/core/renderer.js'),{pausedWorldFrame}=await import('/patches/local-quality/idle-resources.mjs');
  let width=400,height=300;Object.defineProperty(window,'innerWidth',{configurable:true,get:()=>width});Object.defineProperty(window,'innerHeight',{configurable:true,get:()=>height});
  G.mobile={touch:true,ios:true};G.env={grade:{uLift:0}};
  const R=new Renderer(document.querySelector('#host'),settings),r=R.renderer,gl=r.getContext();
  const live={textures:new Set(),renderbuffers:new Set(),framebuffers:new Set()};
  for(const [create,remove,key]of [['createTexture','deleteTexture','textures'],['createRenderbuffer','deleteRenderbuffer','renderbuffers'],['createFramebuffer','deleteFramebuffer','framebuffers']]){
   const a=gl[create].bind(gl),b=gl[remove].bind(gl);gl[create]=()=>{const v=a();live[key].add(v);return v;};gl[remove]=v=>{live[key].delete(v);return b(v);};
  }
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,width/height,.1,20);camera.position.z=4;
  const geometry=new THREE.BoxGeometry(2,2,1),material=new THREE.MeshBasicMaterial({color:0xef6821});scene.add(new THREE.Mesh(geometry,material));R.setScene(scene,camera);
  const counts=()=>Object.fromEntries(Object.entries(live).map(([key,values])=>[key,values.size]));
  const pixels=()=>{
   gl.finish();const result=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
   gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,result);
   if(gl.isContextLost()||gl.getError()!==gl.NO_ERROR)throw Error('WebGL context/pixel error');
   let lit=0;for(let i=0;i<result.length;i++)if(i%4!==3&&result[i]>24)lit++;
   if(lit<100)throw Error('Blank GPU frame');return result;
  };
  const rows=[];let plateau=null;
  for(let i=0;i<12;i++){
   R.releasePausedFrame();R.setDynamicScale(i%2?.75:1);width=i%2?300:400;height=i%2?400:300;R.resize();
   R.render();const before=pixels(),rendered=counts();
   if(!R.capturePausedFrame())throw Error('Capture failed');
   const captured=counts();if(R.composer.renderTarget1!==null)throw Error('Captured frame retained composer attachments');
   if(captured.textures>=rendered.textures||captured.framebuffers!==0||captured.renderbuffers!==0)throw Error('Pause did not retire native attachments');
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   if(!R.presentPausedFrame())throw Error('Pause presentation failed');
   const after=pixels();if(before.length!==after.length||before.some((value,index)=>value!==after[index]))throw Error('Pause changed completed pixels');
   if(plateau&&JSON.stringify(captured)!==JSON.stringify(plateau))throw Error('Resource count grows across pause/resize/resume cycles');
   plateau=captured;rows.push({cycle:i,size:[gl.drawingBufferWidth,gl.drawingBufferHeight],rendered,captured,unchangedPixels:true,checkedChannels:before.length});
  }
  const game={R,match:{paused:true},settings},ctx={renderer:r,level:{}};
  pausedWorldFrame(game,ctx).commit();document.dispatchEvent(new Event('visibilitychange'));
  if(R._pauseSnapshot||game._pausedWorld)throw Error('No-RAF visibility event retained snapshot');
  if(!pausedWorldFrame(game,ctx).draw)throw Error('Visible return did not invalidate snapshot');
  R.render();pixels();R.releasePausedFrame();R._disposeComposer();geometry.dispose();material.dispose();
  if(Object.values(counts()).some(n=>n!==0))throw Error('Final GL resources leaked');
  // Keep the existing safe recovery path rather than silently resuming stale ink.
  r.domElement.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));
  if(!R._contextLost||!document.querySelector('.iw-webgl-recovery button'))throw Error('Missing context recovery UI');
  r.dispose();r.domElement.remove();return{cycles:rows,visibilityReleased:true,finalLive:counts(),recoveryShown:true};
 });
 assert.deepEqual(errors,[]);
 const result={status:'passed',engine,version:browser.version(),contentHash:manifest.contentHash,inputHash:manifest.inputHash,revision:manifest.build.revision,physicalDeviceVerified:false,scope:'production modules; offline menu API; small software-GL scene, no hardware memory measurement',menus,gpu,errors};
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({status:result.status,engine,menuChecks:menus.length,gpuCycles:gpu.cycles.length,out}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
