#!/usr/bin/env node
// Same source mesh, camera, actors and paint: compare native ink selection of
// reached paint charts with the previous tile-only selection. Private pixels never enter
// the repository. Software GL drain times are diagnostic, not device FPS.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]||'_site-native-perf-local'),out=path.resolve(process.argv[3]||'.browser-evidence/native-ink-charts');fs.mkdirSync(out,{recursive:true});
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const quality=process.env.NATIVE_QUALITY||'low',frames=(process.env.NATIVE_PAINT_FRAMES||'420,3600').split(',').map(Number);
const result={status:'running',quality,synthSplats:Number(process.env.NATIVE_SYNTH_SPLATS||0),measurement:'Chromium SwiftShader; production painted-chart selection vs. tile-only selection of the same mesh; frozen unrelated per-draw hooks; pixel comparison hides character roots; alternating renders; not mobile hardware',stages:[],errors:[]},save=()=>fs.writeFileSync(path.join(out,'charts-'+quality+(process.env.NATIVE_SYNTH_SPLATS?'-synth':'')+'.json'),JSON.stringify(result,null,2));
try{
 for(const id of (process.env.NATIVE_STAGE_IDS||'scorch,brinewater').split(',')){
  console.log('chart selection compare '+id+' '+quality);const c=await browser.newContext({viewport:{width:960,height:640}}),p=await c.newPage();p.on('pageerror',e=>result.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
  await p.addInitScript(q=>{localStorage.setItem('inkwave.settings',JSON.stringify({quality:q,shadows:q!=='low',bloom:false,minimap:false,musicVolume:0}));let s=0x12345678;Math.random=()=>{s|=0;s=s+0x6d2b79f5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};},quality);
  await p.goto('http://127.0.0.1:'+server.address().port+'/?map='+id,{waitUntil:'domcontentloaded'});await p.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
  await p.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:240000});assert.equal(await p.locator('#boot-error').textContent(),'');
  await p.evaluate(async id=>{const g=NG.game;g.debug.freeze();g._skipRender=true;g.menus.wipe.cancel();await g.startMatch({mapId:id,mode:'turf',difficulty:'normal'});},id);
  const stage={id,phases:[]};let ran=0;
  for(const target of frames){
   await p.evaluate(n=>{const g=NG.game;for(let i=0;i<n;i++)g._frame(1/60);},target-ran);ran=target;
   // Optional diagnostic coverage: scattered ordinary splats across source paint
   // faces, so most tiles mix painted and unpainted fragments as in a late match.
   await p.evaluate(async n=>{if(!n)return;const G=NG,T=await import(new URL('vendor/three/build/three.module.js',document.baseURI)),faces=G.paint.paintFaces.filter(f=>f.atlas&&f.turf!==false),pt=new T.Vector3();
    for(let i=0;i<n;i++){const f=faces[Math.floor(Math.random()*faces.length)];pt.copy(f.origin).addScaledVector(f.u,Math.random()*f.su).addScaledVector(f.v,Math.random()*f.sv);G.paint.splat(pt,.6+Math.random()*.8,i&1);}
    G.paint.flush(1/60);},Number(process.env.NATIVE_SYNTH_SPLATS||0));
   const metrics=await p.evaluate(async samples=>{
    const G=NG,g=G.game,r=G.renderer,gl=r.getContext(),THREE=await import(new URL('vendor/three/build/three.module.js',document.baseURI)),ink=g.levelMesh;
    const grid=G.paint.grid.slice(),original=G.camera.clone();G.paint.flush(1/60);gl.finish();
    if(!ink._facePainted)throw Error('Painted-chart selection is not bound');
    let mode='production',inkTriangles=0;const select=ink.onBeforeRender;ink.onBeforeRender=function(...args){select.apply(this,args);inkTriangles=ink.geometry.drawRange.count/3;};
    const setMode=next=>{if(next===mode)return;mode=next;ink.faceCulling=next==='production';};
    const W=960,H=640,target=new THREE.WebGLRenderTarget(W,H),previous=r.getRenderTarget(),pixels=()=>{const b=new Uint8Array(W*H*4);r.readRenderTargetPixels(target,0,0,W,H,b);return b;};
    const sync=new Uint8Array(4),draw=next=>{setMode(next);const t=performance.now();r.render(G.scene,G.camera);r.readRenderTargetPixels(target,0,0,1,1,sync);return performance.now()-t;},count=next=>{draw(next);return inkTriangles;};
    const views=[];r.setRenderTarget(target);
    try{
     for(const name of ['gameplay','center','overhead']){
      const B=G.level.bounds,x=(B.minX+B.maxX)/2,z=(B.minZ+B.maxZ)/2,cam=G.camera;
      if(name==='gameplay')cam.copy(original);else if(name==='center'){const h=G.level.groundHeight(x,z);cam.position.set(x,(Number.isFinite(h)?h:0)+4,z+12);cam.lookAt(x,(Number.isFinite(h)?h:0)+1,z-20);}else{cam.position.set(x,150,z+.01);cam.lookAt(x,0,z);}cam.updateMatrixWorld();
      for(let i=0;i<2;i++){draw('control');draw('production');}
      const hooks=new Map();G.scene.traverse(o=>{if(o!==ink&&o.onBeforeRender!==THREE.Object3D.prototype.onBeforeRender){hooks.set(o,o.onBeforeRender);o.onBeforeRender=()=>{};}});
      const visible=G.scene.children.map(o=>[o,o.visible]),timing=label=>{const control=[],prod=[];for(let i=0;i<samples;i++){if(i%2){prod.push(draw('production'));control.push(draw('control'));}else{control.push(draw('control'));prod.push(draw('production'));}}const med=a=>a.sort((x,y)=>x-y)[Math.floor(a.length/2)];return {label,controlP50:med(control),productionP50:med(prod)};};
      const scene=timing('scene');
      for(const [o] of visible)if(o!==ink&&!o.isLight)o.visible=false;const inkOnly=timing('ink-only');for(const [o,v] of visible)o.visible=v;
      const characters=G.actors.map(a=>[a.character.root,a.character.root.visible]);for(const [root] of characters)root.visible=false;
      // A pixel that changes between repeated draws of the same mode belongs to a
      // time-varying non-ink effect; report it and compare everything else.
      const compare=()=>{const A=[],B=[],N=[];for(let i=0;i<3;i++){draw('control');A.push(pixels());draw('production');B.push(pixels());}
       // The same scene without ink: instability here cannot come from ink selection.
       ink.visible=false;for(let i=0;i<2;i++){draw('production');N.push(pixels());}ink.visible=true;
       const a=A[2],b=B[2];let changedPixels=0,unstablePixels=0,unstableWithoutInk=0,maxChannelError=0,controlSelfPixels=0,productionSelfPixels=0;const differences=[];
       const varies=(list,i)=>list.some(x=>x[i]!==list[0][i]||x[i+1]!==list[0][i+1]||x[i+2]!==list[0][i+2]||x[i+3]!==list[0][i+3]);
       for(let i=0;i<a.length;i+=4){const sa=varies(A,i),sb=varies(B,i);controlSelfPixels+=sa;productionSelfPixels+=sb;
        if(sa||sb){unstablePixels++;unstableWithoutInk+=varies(N,i);continue;}let changed=false;for(let k=0;k<4;k++)if(a[i+k]!==b[i+k])changed=true;
        if(changed){changedPixels++;for(let k=0;k<4;k++)maxChannelError=Math.max(maxChannelError,Math.abs(a[i+k]-b[i+k]));if(differences.length<16)differences.push({x:(i/4)%W,y:Math.floor(i/4/W),control:A.map(x=>Array.from(x.subarray(i,i+4))),production:B.map(x=>Array.from(x.subarray(i,i+4))),withoutInk:N.map(x=>Array.from(x.subarray(i,i+4)))});}}
       return {changedPixels,unstablePixels,unstableWithoutInk,maxChannelError,controlSelfPixels,productionSelfPixels,differences};};
      const scenePixels=compare();
      for(const [o] of visible)if(o!==ink&&!o.isLight)o.visible=false;const background=G.scene.background,clear=r.getClearColor(new THREE.Color()),clearAlpha=r.getClearAlpha();G.scene.background=null;r.setClearColor(0,0);
      const inkPixels=compare();for(const [o,v] of visible)o.visible=v;G.scene.background=background;r.setClearColor(clear,clearAlpha);
      for(const [root,v] of characters)root.visible=v;for(const [o,hook] of hooks)o.onBeforeRender=hook;
      views.push({name,inkTriangles:{control:count('control'),production:count('production')},scenePixels,inkPixels,pixels:W*H,scene,inkOnly});
     }
    }finally{setMode('production');ink.onBeforeRender=select;G.camera.copy(original);r.setRenderTarget(previous);target.dispose();}
    if(gl.getError()!==gl.NO_ERROR)throw Error('Native ink WebGL error');
    if(grid.some((v,i)=>v!==G.paint.grid[i]))throw Error('Rendering changed gameplay paint');
    let painted=0;for(const v of grid)painted+=v!==0;
    return {paintedCellShare:painted/grid.length,actors:G.actors.length,views};
   },Number(process.env.NATIVE_RENDER_SAMPLES||6));
   stage.phases.push({frames:target,...metrics});if(!result.stages.includes(stage))result.stages.push(stage);save();
   console.log(JSON.stringify({id,frames:target,painted:metrics.paintedCellShare.toFixed(3),views:metrics.views.map(v=>({name:v.name,changed:[v.scenePixels.changedPixels,v.inkPixels.changedPixels],unstable:v.scenePixels.unstablePixels,inkTriangles:[v.inkTriangles.control,v.inkTriangles.production],scene:[v.scene.controlP50.toFixed(1),v.scene.productionP50.toFixed(1)],inkOnly:[v.inkOnly.controlP50.toFixed(1),v.inkOnly.productionP50.toFixed(1)]}))}));
   for(const v of metrics.views){const where=id+' '+v.name+' @'+target;assert.equal(v.inkPixels.unstablePixels,0,where+' ink-only draw changed between identical renders');assert.equal(v.inkPixels.changedPixels,0,where+' changed ink-only pixels');
    assert.equal(v.scenePixels.changedPixels,0,where+' changed stable scene pixels');assert(v.scenePixels.unstablePixels<=v.pixels*1e-4,where+' too many time-varying scene pixels');assert(v.inkTriangles.production<=v.inkTriangles.control);}
   assert.equal(metrics.actors,8);
  }
  save();await c.close();
 }
 assert.equal(result.errors.length,0,JSON.stringify(result.errors));result.status='passed';
}catch(error){result.status='failed';result.error=error.stack;throw error;}finally{save();await browser.close();await new Promise(r=>server.close(r));}
