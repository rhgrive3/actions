#!/usr/bin/env node
// Deterministic emitted-runtime CPU workload, NOT device/presentation FPS.
// Rendering can be included explicitly; SwiftShader submission is not GPU time.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {verifyRuntimeBuild, hash, persistentDirectory, persistentBrowserTemp} from './lib/inkwave-runtime-evidence.mjs';
import {summarizeGcTrace} from './lib/inkwave-cpu-trace.mjs';

const get=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const site=fs.realpathSync(get('--site','_site'));
const evidence=persistentDirectory(get('--evidence-dir','.browser-evidence/composed-cpu'));
const sourceSha=get('--source-sha','');
const manifest=verifyRuntimeBuild(site,fileURLToPath(new URL('../',import.meta.url)),sourceSha);
const frames=Number(get('--frames','600')),hz=Number(get('--hz','60'));
if(!Number.isInteger(frames)||frames<30||frames>18000||![30,60,120].includes(hz))throw Error('Invalid frames/hz');
const stages=get('--stages','range,tidewater,kelpline').split(',');
const render=process.argv.includes('--render'),wrappers=!process.argv.includes('--no-wrappers');
const quality=get('--quality','high');
const temp=persistentBrowserTemp(path.join(evidence,'tmp'));
for(const name of ['TMPDIR','TMP','TEMP'])process.env[name]=temp;
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
// Local prepared reference assets intentionally live outside public artifacts.
// Authenticate their private integrity tables against the build configuration;
// runtime loadNativeData independently checks each payload too.
const privateArtifacts={};
if(manifest.build.nativeStages.mode==='local-prepared')for(const stage of manifest.build.nativeStages.stages){
 const prefix='_native-reference-assets/'+stage.id+'/',bytes=fs.readFileSync(path.join(site,prefix,'integrity.json'));
 if(hash(bytes)!==stage.integritySha256)throw Error('Private native integrity table changed');
 privateArtifacts[prefix+'integrity.json']=hash(bytes);
 for(const [name,receipt] of Object.entries(JSON.parse(bytes))){
  if(name.split('/').some(p=>p==='..'||!p)||path.isAbsolute(name))throw Error('Private native path');
  privateArtifacts[prefix+name]=receipt.sha256;
 }
}
const served=new Set();
const server=http.createServer((req,res)=>{try{
 const file=path.resolve(site,'.'+(new URL(req.url,'http://local').pathname==='/'?'/index.html':decodeURIComponent(new URL(req.url,'http://local').pathname)));
 if(!file.startsWith(site+path.sep))throw Error('path');
 const bytes=fs.readFileSync(file),rel=path.relative(site,file);
 const expected=manifest.artifacts[rel]||privateArtifacts[rel];
 if(!expected||hash(bytes)!==expected)throw Error('artifact '+rel);
 served.add(rel);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes);
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
const report={schema:1,sourceSha,contentHash:manifest.contentHash,revision:manifest.build.revision,
 environment:{node:process.version,cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,quality,viewport:[960,640],render,wrappers},
 limits:['Linux Chromium/SwiftShader; no physical iPad or FPS evidence.',
 'Fixed-step CPU transaction; loading, async cold startup and presentation pacing are excluded.',
 'Inclusive scopes overlap. Wrappers and GC tracing perturb timings; use --no-wrappers as a control.',
 'GC pause intervals are observed V8 trace events on the measured renderer thread, not inferred from heap drops.'],scenarios:[]};
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 report.environment.browser=browser.version();
 for(const stage of stages){
  const context=await browser.newContext({viewport:{width:960,height:640}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(quality=>{
   localStorage.setItem('inkwave.settings',JSON.stringify({quality,musicVolume:0,audioVolume:0}));
   let s=987654321;Math.random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
  },quality);
  console.log('boot '+stage);
  // Boot the ordinary menu first; source-stage attract rendering is outside
  // the workload and can monopolize a software GPU before we can freeze it.
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__G?.mode==='menu',null,{timeout:300000});
  const initial=await page.evaluate(async({stage,render})=>{
   const g=window.__inkwave,G=window.__G;
   g.debug.freeze();g._skipRender=true;g.menus.wipe.cancel();G.time=0;g.s3Clock.reset();
   let seed=11223;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
   Math.random=random;
   const proto=Object.getPrototypeOf(G.match),setup=proto.setup;
   proto.setup=function(...args){seed=11223;return setup.apply(this,args);};
   try{await g.startMatch({mapId:stage,mode:'turf',duration:180,difficulty:'normal'});}finally{proto.setup=setup;}
   if(G.level.layout.id!==stage)throw Error('Requested stage did not load: '+stage);
   // Wait for actual source clips; never silently benchmark the fallback pose.
   const characters=G.actors.map(a=>a.character).filter(c=>Array.isArray(c.boneList));
   await Promise.all(characters.map(c=>c._sourceMotionLoader));
   await Promise.all(characters.map(c=>c.sourceMotion?.ready));
   if(!characters.length||characters.some(c=>c.sourceMotion?.status!=='ready'))throw Error('Source motion not ready');
   if(G.audio){let aseed=456;G.audio.rng=()=>{aseed=(Math.imul(aseed,1664525)+1013904223)>>>0;return aseed/4294967296;};}
   g._skipRender=true;seed=24680;
   for(const a of G.actors){if(!a.bot)continue;const b=a.bot;
    b.sweep=random()*10;b.strafe=random()<.5?1:-1;b.bombCd=3+random()*4;b.think=random()*.2;b.chargeRelease=.95+random()*.05;b.ph1=random()*20;b.ph2=random()*20;b.t=random()*10;b.dodgeCd=1+random()*2;
   }
   for(let i=0;i<300;i++)g._frame(1/60);
   g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;
   for(let i=0;i<120;i++)g._frame(1/60);
   g._skipRender=!render;
   // No forced GC. First-use shaders, if requested, are warmed separately.
   if(render){for(let i=0;i<4;i++)g._frame(1/60);G.renderer.getContext().finish();}
   window.cpuBenchResetStep=i=>{seed=(24680+Math.imul(i,2654435761))>>>0;};
   return {actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,roster:G.actors.map(a=>a.weapon.id),native:!!G.level.native,
    sourceCharacters:characters.length,triangles:G.level.triangleWorld?.triangleCount??0,paintFaces:G.paint.paintFaces?.length,atlas:G.paint.size,ppm:G.paint.ppm,settings:g.settings};
  },{stage,render});
  const cdp=await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const before=await cdp.send('Performance.getMetrics');
  await cdp.send('Tracing.start',{categories:'v8,devtools.timeline,blink.user_timing',transferMode:'ReturnAsStream'});
  const result=await page.evaluate(({frames,hz,wrappers})=>{
   const G=window.__G,g=window.__inkwave,acc={},restore=[];
   const wrap=(obj,key,name)=>{const fn=obj?.[key];if(typeof fn!=='function')return;
    const own=Object.getOwnPropertyDescriptor(obj,key);
    obj[key]=function(...args){const t=performance.now();try{return fn.apply(this,args);}finally{const row=acc[name]||(acc[name]={ms:0,calls:0});row.ms+=performance.now()-t;row.calls++;}};
    restore.push(()=>{if(own)Object.defineProperty(obj,key,own);else delete obj[key];});
   };
   if(wrappers){
    for(const key of ['update'])wrap(G.match,key,'simulation.'+key);
    for(const a of G.actors){wrap(a,'update','actor.update');wrap(a.bot,'update','bot.update');
     for(const key of ['update','_applyPose','_buildPose','_updateLod','_updateMaterials'])wrap(a.character,key,'character.'+key);
     for(const key of ['advance','applyBody','applyAccessories','updateSquid'])wrap(a.character.sourceMotion,key,'motion.'+key);
     wrap(a.character.sourceMotion?.bodyBalance,'apply','motion.bodyBalance');
    }
    for(const key of ['raycast','groundProbe','_nativeContacts','bodyFits','collideBody'])wrap(G.physics,key,'physics.'+key);
    for(const key of ['ray','queryBox','sweepSphere'])wrap(G.level.triangleWorld,key,'bvh.'+key);
    for(const key of ['path','nearest'])wrap(G.nav,key,'nav.'+key);
    for(const key of ['advanceSimulation','splat','regionStats','_advanceSplatOwnership','_emitGrowth','flush','_drawQuads'])wrap(G.paint,key,'paint.'+key);
    wrap(G.projectiles,'update','projectiles.update');wrap(G.fx,'update','fx.update');wrap(G.env,'update','environment.update');wrap(g.R,'render','render.submit');wrap(G.renderer.shadowMap,'render','render.shadow');wrap(G.scene,'updateMatrixWorld','render.sceneMatrices');wrap(g,'_updateHud','hud.update');
   }
   const w=G.level.triangleWorld,q0=w?.queryCount??0,t0=w?.triangleTests??0,ticks0=g.s3Clock.ticks,times=[],digests=[];
   const f64=new Float64Array(1),u32=new Uint32Array(f64.buffer);let digest=2166136261;
   const mix=x=>{digest=Math.imul(digest^x,16777619)>>>0;};
   const number=v=>{f64[0]=+v;mix(u32[0]);mix(u32[1]);};
   g.debug.key('KeyW',true);g.debug.fire(true);
   performance.mark('inkwave-cpu-start');
   try{for(let i=0;i<frames;i++){
    window.cpuBenchResetStep(i);g.rig.yaw+=.6/hz;g.debug.key('Space',i%Math.round(hz*2)===0);
    const t=performance.now();g._frame(1/hz);times.push(performance.now()-t);
    for(const a of G.actors){for(const v of [a.pos.x,a.pos.y,a.pos.z,a.vel.x,a.vel.y,a.vel.z,a.hp,a.ink,a.alive,a.grounded,a.yaw,a.turf])number(v);mix(a.form==='kid'?1:2);}
    for(const v of [...G.paint.counts,G.paint.version,G.paint.growing.length])number(v);
    digests.push(digest);
   }}finally{performance.mark('inkwave-cpu-end');for(const undo of restore.reverse())undo();g.debug.key('KeyW',false);g.debug.fire(false);}
   const ticks=g.s3Clock.ticks-ticks0;
   for(const v of G.paint.grid)mix(v);for(const v of G.paint._paintOwnershipOrder||[])mix(v);
   return {frames,hz,ticks,times,digests,digest,counts:[...G.paint.counts],state:G.match.state,
    bvh:{queries:(w?.queryCount??0)-q0,triangleTests:(w?.triangleTests??0)-t0},
    categories:Object.fromEntries(Object.entries(acc).sort((a,b)=>b[1].ms-a[1].ms).map(([k,v])=>[k,{msPerTick:v.ms/ticks,callsPerTick:v.calls/ticks}])),
    draw:{...G.renderer.info.render},resources:{...G.renderer.info.memory},contextLost:G.renderer.getContext().isContextLost()};
  },{frames,hz,wrappers});
  const completed=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
  await cdp.send('Tracing.end');const {stream}=await completed;
  let trace='';for(;;){const part=await cdp.send('IO.read',{handle:stream});trace+=part.base64Encoded?Buffer.from(part.data,'base64').toString():part.data;if(part.eof)break;}await cdp.send('IO.close',{handle:stream});
  fs.writeFileSync(path.join(evidence,stage+'-trace.json'),trace);
  const after=await cdp.send('Performance.getMetrics');
  const heap=m=>Object.fromEntries(m.metrics.filter(x=>/JSHeap|Nodes|Documents/.test(x.name)).map(x=>[x.name,x.value]));
  const sorted=[...result.times].sort((a,b)=>a-b),pick=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))];
  const row={stage,initial,...result,cpuFrameMs:{mean:result.times.reduce((a,b)=>a+b,0)/frames,p50:pick(.5),p95:pick(.95),p99:pick(.99),max:sorted.at(-1)},gc:summarizeGcTrace(JSON.parse(trace).traceEvents),heap:{before:heap(before),after:heap(after)},errors};
  report.scenarios.push(row);fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({stage,cpuFrameMs:row.cpuFrameMs,categories:row.categories,gc:row.gc,errors}));
  if(errors.length||row.contextLost||row.ticks!==Math.round(frames*60/hz))throw Error('Runtime workload failed');
  await context.close();
 }
 report.servedArtifacts=[...served].sort();report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;throw error;}
finally{fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(report,null,2)+'\n');await browser?.close();await new Promise(r=>server.close(r));}
