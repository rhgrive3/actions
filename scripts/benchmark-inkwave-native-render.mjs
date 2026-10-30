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
assert.ok([warmup,frames,runs].every(Number.isSafeInteger)&&warmup>=1&&warmup<=600&&frames>=1&&frames<=300&&runs>=1&&runs<=10);
assert.ok(Number.isSafeInteger(setupFrames)&&setupFrames>=450&&setupFrames<=1800);
assert.ok(!['/tmp','/var/tmp','/dev/shm'].some(p=>out===p||out.startsWith(p+'/')));
fs.mkdirSync(out,{recursive:true});
const browserTemp=path.resolve('.ci-scratch/native-render-tmp');
fs.mkdirSync(browserTemp,{recursive:true});
for(const name of ['TMPDIR','TMP','TEMP'])process.env[name]=browserTemp;
const {chromium}=await import('playwright');
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
  sourceInputHash:hash(JSON.stringify(build.files)),revision:build.build.revision,
  environment:{cpu:os.cpus()[0]?.model,node:process.version,viewport:[960,540],renderer:'SwiftShader'},windows:[],errors:[],
  measurement:'Fixed 60 Hz production simulation plus all ordinary render passes; wall time includes GPU completion. Not a physical-device or presentation-latency measurement.'};
const save=()=>{const file=path.join(out,'result.json');fs.writeFileSync(file+'.pending',JSON.stringify(result,null,2)+'\n');fs.renameSync(file+'.pending',file);};
save();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:960,height:540}});
  page.setDefaultTimeout(300000);
  page.on('pageerror',e=>{result.errors.push(e.message);save();});
  page.on('console',m=>{if(m.type()==='error'&&/THREE\.WebGLProgram|GL_INVALID|VALIDATE_STATUS|shader error/i.test(m.text())){result.errors.push(m.text());save();}});
  await page.addInitScript(quality=>{
    localStorage.setItem('inkwave.settings',JSON.stringify({quality,shadows:true,bloom:true,minimap:true,musicVolume:0,audioVolume:0}));
    let seed=24680;
    window.nativeRenderSeed=step=>{seed=(24680+Math.imul(step,2654435761))>>>0;};
    Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  },quality);
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
    for(let i=0;i<setupFrames;i++){
      if(i===330)g.debug.fire(true);if(i===333)g.debug.fire(false);
      nativeRenderSeed(i);g._frame(1/60);
    }
    g._skipRender=false;g.R.setDynamicScale(1);window.nativeRenderFrame=setupFrames;
    const gl=G.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
    window.nativeRenderPrograms=0;const create=gl.createProgram;
    gl.createProgram=function(...a){nativeRenderPrograms++;return create.apply(this,a);};
    g.debug.key('KeyW',true);g.debug.fire(true);
    return{native:G.level.native,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,state:G.match.state,
      quality:g.R.q,atlas:G.paint.size,sourceSha256:G.level.manifest.sourceSha256,
      renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
  },{stage,setupFrames});
  assert.equal(result.setup.native,true);assert.equal(result.setup.actors,8);assert.equal(result.setup.bots,7);assert.equal(result.setup.state,'playing');save();
  console.log('setup '+JSON.stringify(result.setup));
  for(let i=0;i<warmup;i++){
    await page.evaluate(()=>{nativeRenderSeed(nativeRenderFrame++);__G.game._frame(1/60);const gl=__G.renderer.getContext();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));});
    if(i%10===9){result.completedWarmup=i+1;save();console.log('warmup '+(i+1));}
  }
  for(let run=0;run<runs;run++){
    const row=await page.evaluate(frames=>{
      const G=__G,g=G.game,gl=G.renderer.getContext(),times=[],counts=[],trace=[];
      if(g._skipRender||!g.frozen||G.actors.length!==8)throw Error('Full-frame replay owners changed');
      const firstStep=nativeRenderFrame,programs=nativeRenderPrograms;
      const completionPixel=new Uint8Array(4),complete=()=>gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,completionPixel);
      complete();const start=performance.now();
      for(let i=0;i<frames;i++){
        nativeRenderSeed(nativeRenderFrame++);const t=performance.now();g._frame(1/60);times.push(performance.now()-t);
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
        targets:[g.R.composer.renderTarget1,g.R.composer.renderTarget2].map(t=>({samples:t.samples,depth:t.depthBuffer,stencil:t.stencilBuffer,width:t.width,height:t.height,type:t.texture.type}))};
    },frames);
    row.traceSha256=hash(JSON.stringify(row.trace));delete row.trace;
    row.paint.gridSha256=hash(Uint8Array.from(row.paint.grid));delete row.paint.grid;
    result.windows.push({run,...row});save();console.log('window '+JSON.stringify({run,fps:row.fps,newPrograms:row.newPrograms,trace:row.traceSha256,grid:row.paint.gridSha256}));
    assert.equal(row.glError,0);assert.equal(row.scale,1);assert.equal(row.state,'playing');assert.deepEqual(row.quality,result.setup.quality);
  }
  assert.ok(result.windows.every(w=>w.newPrograms===0),'Measured window created cold shaders; increase the common warmup');
  // Frozen image comparisons are separate from timed windows. Re-render the
  // water reflection for each camera; no simulation advances between views.
  for(const [label,turn] of [['forward',0],['left',Math.PI/2],['back',Math.PI],['right',-Math.PI/2]]){
    const png=await page.evaluate(turn=>{
      const G=__G,g=G.game,c=G.camera;
      window.nativeRenderCamera??={q:c.quaternion.clone()};c.quaternion.copy(nativeRenderCamera.q);
      c.rotateY(turn);c.updateMatrixWorld();if(G.env)G.env._reflFrame=-1;
      g.R.render();const gl=G.renderer.getContext();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));return G.renderer.domElement.toDataURL();
    },turn);
    fs.writeFileSync(path.join(out,label+'.png'),Buffer.from(png.split(',')[1],'base64'));
  }
  assert.equal(result.errors.length,0);result.status='passed';
}catch(error){result.status='failed';result.error=error.stack;process.exitCode=1;}
finally{save();await browser.close();await new Promise(r=>server.close(r));}
console.log(JSON.stringify({status:result.status,fps:result.windows.map(w=>w.fps),error:result.error}));
