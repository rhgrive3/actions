#!/usr/bin/env node
// Isolated real production-material check of first-use GL reflection.
// Baseline and candidate use separate pages/contexts; no physical FPS claim.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const site = path.resolve(process.argv[2] || '_site');
const out = path.resolve(process.argv[3] || '/workspace/scratch/shader-reflection-browser.json');
const candidateRoot=path.resolve(process.env.INKWAVE_SHADER_PROBE_DIR||'.');
const files = new Map([
  ['/patches/splatoon3/runtime/special-motion.mjs', fs.readFileSync(path.join(candidateRoot,'patches/splatoon3/runtime/special-motion.mjs'))],
  ['/patches/local-quality/swim-surface.mjs', fs.readFileSync(path.join(candidateRoot,'patches/local-quality/swim-surface.mjs'))],
  ['/patches/local-quality/shader-program-reflection.mjs', fs.readFileSync(path.join(candidateRoot,'patches/local-quality/shader-program-reflection.mjs'))],
]);
const server=http.createServer((req,res)=>{try{
  const u=decodeURIComponent(new URL(req.url,'http://local').pathname);
  if(u==='/fixture'){res.writeHead(200,{'content-type':'text/html'});res.end('<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js"}}</script>');return;}
  if(u==='/favicon.ico'){res.writeHead(204);res.end();return;}
  const f=path.resolve(site,'.'+u);if(!f.startsWith(site+path.sep)||!fs.statSync(f).isFile())throw Error('not found');
  res.writeHead(200,{'content-type':/\.(mjs|js)$/.test(f)?'text/javascript':'application/octet-stream'});fs.createReadStream(f).pipe(res);
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;const runs=[];
try {
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const order=process.argv.includes('--abba')?['base','candidate','candidate','base']:['base','candidate'];
 for(const side of order){
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  if(side==='candidate')await page.route('**/patches/**',async route=>{const u=new URL(route.request().url()).pathname;const data=files.get(u);if(data)await route.fulfill({status:200,contentType:'text/javascript',body:data});else await route.continue();});
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);
  const result=await page.evaluate(async()=>{
    const THREE=await import('three'),{G}=await import('/src/core/ctx.js');
    const special=await import('/patches/splatoon3/runtime/special-motion.mjs');
    const swim=await import('/patches/local-quality/swim-surface.mjs');
    async function scenario(kind,halfFloat){
      const r=new THREE.WebGLRenderer({canvas:document.createElement('canvas'),antialias:false,alpha:true});r.setSize(128,128,false);r.debug.checkShaderErrors=false;
      const gl=r.getContext(), parallel=!!r.extensions.has('KHR_parallel_shader_compile'), events=[];const gp=gl.getProgramParameter.bind(gl);
      gl.getProgramParameter=(p,q)=>{const t=performance.now();try{return gp(p,q);}finally{if(q===gl.ACTIVE_UNIFORMS||q===gl.ACTIVE_ATTRIBUTES)events.push({p,q,ms:performance.now()-t});}};
      const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,.1,100);camera.position.set(2,1.5,4);camera.lookAt(0,.5,0);camera.updateMatrixWorld();
      scene.add(new THREE.HemisphereLight(0xffffff,0x333333,1));let sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(1,4,3);scene.add(sun);
      const rt=new THREE.WebGLRenderTarget(128,128,{type:halfFloat?THREE.HalfFloatType:THREE.UnsignedByteType});
      G.scene=scene;G.camera=camera;G.renderer=r;G.post={composer:{readBuffer:rt}};
      let material,model,fx;
      const t0=performance.now();
      if(kind==='cooler'){
        const keep=special.specialProgramKeepers(THREE);material=keep.getObjectByName('cooler-glass').material;
        await special.warmSpecialPrograms(THREE,G,r,camera,scene);
        model=special.createTacticooler(0xffffff,THREE);scene.add(model);
      } else {
        fx={root:new THREE.Group(),scene,_light:{sunDir:new THREE.Vector3(0,1,0)}};scene.add(fx.root);
        await swim.warmSwimSurface(fx,r,camera,scene);
        model=fx.swimSurface.slots[0].mesh;material=model.material;
        const pos=model.geometry.attributes.position;pos.array.set([-1,0,0,1,0,0,0,2,0]);pos.needsUpdate=true;model.visible=true;
      }
      const warmMs=performance.now()-t0;
      const entries=[...(r.properties.get(material).programs?.values()||[])], programs=new Set(entries.map(x=>x.program));
      const reflectedWarm=events.filter(x=>programs.has(x.p)&&x.q===gl.ACTIVE_UNIFORMS).length;
      const reflectionWarmMs=events.filter(x=>programs.has(x.p)).reduce((a,x)=>a+x.ms,0);
      const cut=events.length;r.setRenderTarget(rt);r.clear();const firstStart=performance.now();r.render(scene,camera);const firstRenderMs=performance.now()-firstStart;
      const reflectedFirst=events.slice(cut).filter(x=>programs.has(x.p)&&x.q===gl.ACTIVE_UNIFORMS).length;
      const reflectionFirstMs=events.slice(cut).filter(x=>programs.has(x.p)).reduce((a,x)=>a+x.ms,0);
      const actualMaterial=kind==='cooler'?model.getObjectByName('cooler-glass').material:material;
      const actualEntries=[...(r.properties.get(actualMaterial).programs?.values()||[])];
      const shared=actualEntries.filter(x=>entries.includes(x)).length;
      let pixelHash=null,nonzero=0;if(!halfFloat){const pixels=new Uint8Array(128*128*4);r.readRenderTargetPixels(rt,0,0,128,128,pixels);for(const n of pixels)if(n)nonzero++;pixelHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))].map(x=>x.toString(16).padStart(2,'0')).join('');}
      const glError=gl.getError();gl.getProgramParameter=gp;
      if(fx)swim.disposeSwimSurface(fx);rt.dispose();r.dispose();
      return {kind,halfFloat,parallel,programs:entries.length,actualPrograms:actualEntries.length,shared,reflectedWarm,reflectedFirst,warmMs,firstRenderMs,reflectionWarmMs,reflectionFirstMs,pixelHash,nonzero,glError};
    }
    const result=[];for(const kind of ['cooler','film'])for(const half of [true,false])result.push(await scenario(kind,half));return result;
  });
  runs.push({side,result,errors});await context.close();
 }
 const report={browser:browser.version(),runs,scope:'Production cooler and swim-film materials with same scene/target per scenario; isolated Chromium WebGL, no native full-match FPS claim.'};
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 assert(runs.every(r=>r.errors.length===0));
 for(const compared of runs.slice(1))for(let i=0;i<runs[0].result.length;i++){
  const a=runs[0].result[i],b=compared.result[i];
  assert.equal(a.glError,0);assert.equal(b.glError,0);assert(a.programs>0&&a.shared>0&&b.shared>0,'programs not reused');
  assert.equal(a.pixelHash,b.pixelHash);if(a.pixelHash)assert(a.nonzero>0);
  if(compared.side==='candidate'&&!b.parallel){assert.equal(b.reflectedWarm,a.reflectedWarm,`${a.kind}: unsupported context must not prewarm`);
  assert.equal(b.reflectedFirst,a.reflectedFirst,`${a.kind}: unsupported context must retain first-use path`);}
  if(compared.side==='candidate'&&b.parallel){assert(b.reflectedFirst<=a.reflectedFirst,`${a.kind}: unexpected additional first-use query`);}
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));}
