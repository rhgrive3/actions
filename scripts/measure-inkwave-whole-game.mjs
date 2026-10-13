#!/usr/bin/env node
// Diagnostic only. Production builds are unmodified and verified against exact Git SHAs.
// Synchronous 1-pixel readback completes every full Game._frame transaction. This
// serializes CPU/GPU work and is NOT native display FPS or photon/input latency.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { verifyRuntimeBuild, hash } from './lib/inkwave-runtime-evidence.mjs';
const arg=(name,def)=>{const i=process.argv.indexOf(name);return i<0?def:process.argv[i+1];};
const output=path.resolve(arg('--out','evidence'));
fs.mkdirSync(output,{recursive:true});
const mode=arg('--mode','calibrate');
if(!['calibrate','measure'].includes(mode))throw Error('Invalid mode');
const stage=arg('--stage','scorch');
const samples=Number(arg('--samples','120'));
const warmup=Number(arg('--warmup',mode==='calibrate'?'12':'30'));
const order=mode==='calibrate'?['A','B']:['A','B','B','A','B','A','A','B'];
const variants=Object.fromEntries([['A','545c6b3fcfc0d25c43678e9b44b1af4e26400fec'],['B','7fd172f9c09a13d958fc3c01b721cac443d9ceb8']].map(([name,sha])=>{
 const root=path.resolve(arg('--root-'+name)),site=path.resolve(arg('--site-'+name));
 return [name,{root,site,sha,manifest:verifyRuntimeBuild(site,root,sha),receipts:new Set()}];
}));
const settings={quality:'medium',shadows:true,bloom:true,frameRate:'display',music:.6,sfx:.85,master:.8};
const result={schema:1,status:'running',mode,stage,order,settings,samples:mode==='calibrate'?6:samples,warmup,viewport:[960,600],deviceScaleFactor:1,hardwareClaim:false,
 scope:'Full production Game._frame with input polling, BotBrain, actors, collision, projectiles, paint, FX, environment, decor, props, camera, audio owners, HUD, menus and all render/post passes. Primary timing is successive rAF starts, including intervening browser/UI/audio scheduling contention. Secondary completedMs is only synchronous Game._frame JavaScript plus GPU readback; it excludes deferred DOM/compositing/audio completion. Fixed 60 Hz simulation and diagnostic crowd input/camera; readback serializes CPU/GPU.',
 limitations:['Software-rendered GitHub Actions is not a hardware-PC measurement.','Completed-frame throughput includes a 1-pixel synchronous readback, prevents CPU/GPU overlap, and excludes display scanout. It is not ordinary gameplay FPS or input-to-photon latency.','The built-in autopilot scene has eight bot actors and no PlayerController; this is automated crowd gameplay, not coverage of the normal human input path.','The native game scheduler is frozen; the diagnostic schedules one complete fixed-step frame per rAF. Dynamic resolution is held at 1 for workload comparability.','BotBrain still executes; its output intent is replaced by the same stationary, outward-firing input after its update. This avoids deaths and measures eight live actors throughout.','An eight-trial ABBA/BAAB comparison must pass workload checks before reporting a comparative effect; improvement requires a positive lower confidence bound. Full image parity is verified at the endpoint, not on every measured frame.'],
 environment:{cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,memBytes:os.totalmem(),node:process.version,os:os.release(),platform:os.platform()},
 provenance:Object.fromEntries(Object.entries(variants).map(([k,v])=>[k,{sourceSha:v.sha,contentHash:v.manifest.contentHash,revision:v.manifest.build.revision}])),trials:[]};
const save=()=>fs.writeFileSync(path.join(output,'whole-game-'+mode+'.json'),JSON.stringify(result,null,2));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://localhost'),m=url.pathname.match(/^\/(A|B)\/(.*)$/);if(!m)throw Error('No variant');const v=variants[m[1]],rel=decodeURIComponent(m[2]||'index.html'),file=path.resolve(v.site,rel);if(!file.startsWith(v.site+'/'))throw Error('Traversal');const bytes=fs.readFileSync(file);if(rel!=='inkwave-build.json'&&(!v.manifest.artifacts[rel]||hash(bytes)!==v.manifest.artifacts[rel]))throw Error('Unverified served bytes');v.receipts.add(rel);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes);}catch(e){res.writeHead(404);res.end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {chromium}=await import(pathToFileURL(path.resolve(arg('--playwright'))).href);
let browser;
const stats=values=>{const a=[...values].sort((a,b)=>a-b),n=a.length;if(!n)return{n};const q=p=>a[Math.max(0,Math.min(n-1,Math.ceil(n*p)-1))];const mean=a.reduce((s,x)=>s+x,0)/n;return{n,mean,p50:q(.5),p95:q(.95),p99:q(.99),min:a[0],max:a.at(-1),fps:1000/mean,over16_67:a.filter(x=>x>1000/60).length,over33_33:a.filter(x=>x>1000/30).length,over50:a.filter(x=>x>50).length,over100:a.filter(x=>x>100).length};};
try{
 const launch={executablePath:arg('--chromium','/usr/bin/google-chrome'),headless:true,chromiumSandbox:true,args:['--use-angle=swiftshader']};
 result.environment.launch=launch;browser=await chromium.launch(launch);result.environment.browser=browser.version();save();
 for(const [ordinal,variant]of order.entries()){
  const context=await browser.newContext({viewport:{width:960,height:600},deviceScaleFactor:1,hasTouch:false,isMobile:false});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const trial={ordinal,variant,status:'booting',errors};result.trials.push(trial);save();
  // Bootstrap RNG streams are separated by source file so async audio startup
  // cannot consume world/character RNG. Measured frames use a cheap fixed-step
  // stream, and audio keeps a separate cheap seeded stream. No features removed.
  await page.addInitScript(settings=>{
   const streams=new Map();let state=20261013,calls=0,fixed=false;
   const next=s=>(Math.imul(s,1664525)+1013904223)>>>0;
   const seedFor=key=>{let h=2166136261;for(let i=0;i<key.length;i++)h=Math.imul(h^key.charCodeAt(i),16777619);return h>>>0;};
   Math.random=()=>{calls++;if(fixed){state=next(state);return state/4294967296;}const stack=new Error().stack||'';const file=(stack.split('\n').slice(2).find(x=>x.includes('/src/')||x.includes('/patches/'))||'other').replace(/^.*?\/(src|patches)\//,'$1/').replace(/:\d+:\d+\)?$/,'');const s=next(streams.get(file)??seedFor(file));streams.set(file,s);return s/4294967296;};
   window.benchSeed=(frame)=>{fixed=true;state=(20261013+Math.imul(frame,2654435761))>>>0;calls=0;};
   window.benchRandomState=()=>({state,calls});
   window.benchAudioRng=(()=>{let s=8172361;return()=>{s=next(s);return s/4294967296;};})();
   localStorage.setItem('inkwave.settings',JSON.stringify(settings));
  },settings);
  await page.goto(`http://127.0.0.1:${server.address().port}/${variant}/?map=${stage}&autopilot`,{waitUntil:'domcontentloaded',timeout:120000});
  await page.evaluate(async()=>{window.BG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
  await page.waitForFunction(()=>{const g=BG.game;if(g)g.frozen=true;return !!(g?.debug&&BG.s3?.installed&&BG.mode!=='boot')||!!document.querySelector('#boot-error')?.textContent;},null,{timeout:900000});
  const bootError=await page.locator('#boot-error').textContent();if(bootError)throw Error(bootError);
  // A real keyboard gesture enables audio through the unchanged production path.
  await page.keyboard.press('Shift');
  trial.setup=await page.evaluate(async({stage,warmup})=>{
   const G=BG,g=G.game;g.debug.freeze();g.menus.wipe.cancel();
   G.audio.rng=window.benchAudioRng;
   // Music already exposes an explicit seed option. Preserve real music/timer
   // work while ensuring track creation cannot perturb the gameplay RNG stream.
   const musicPlay=G.music.play;G.music.play=function(track,opts={}){return musicPlay.call(this,track,{...opts,seed:883122});};
   window.benchSeed(0);G.time=0;g.rig.time=0;g.rig.shakeSeed=.25;
   await g.startMatch({mapId:stage,mode:'turf',difficulty:'normal',duration:180});g.debug.freeze();
   await Promise.all(G.actors.map(a=>a.character._sourceMotionLoader));
   await Promise.all(G.actors.map(a=>a.character.warmAll()));
   g.R.setDynamicScale(1);g._skipRender=true;g.s3Clock?.reset();
   for(let i=0;i<330;i++){window.benchSeed(i);g._frame(1/60);}
   if(g.match.state!=='playing')throw Error('Countdown not complete');
   const nodes=G.nav.nodes.filter(n=>Number.isFinite(n.y)).sort((a,b)=>(a.x*a.x+a.z*a.z)-(b.x*b.x+b.z*b.z)||a.id-b.id),anchor=nodes[0];
   const near=nodes.filter(n=>Math.abs(n.y-anchor.y)<.5&&Math.hypot(n.x-anchor.x,n.z-anchor.z)<5).slice(0,8);
   if(near.length!==8||G.actors.length!==8)throw Error('Eight-actor fixture not available');
   const center={x:near.reduce((s,n)=>s+n.x,0)/8,y:near.reduce((s,n)=>s+n.y,0)/8,z:near.reduce((s,n)=>s+n.z,0)/8};
   window.benchCamera=()=>{G.camera.position.set(center.x,center.y+12,center.z-12);G.camera.lookAt(center.x,center.y+1,center.z);G.camera.updateMatrixWorld();};
   const render=g.R.render.bind(g.R);g.R.render=function(...args){window.benchCamera();return render(...args);};
   window.benchBotCalls=0;
   for(let i=0;i<8;i++){
    const a=G.actors[i],n=near[i];a.setWeapon('shooter');a.spawnAt(a.pos.clone().set(n.x,n.y+.05,n.z),0);
    if(!a.bot)throw Error('Autopilot bot missing');
    const update=a.bot.update;a.bot.update=function(dt){window.benchBotCalls++;const out=update.call(this,dt);a.intent.move.set(0,0,0);a.intent.fire=true;a.intent.squid=false;a.intent.jump=false;a.intent.sub=false;a.intent.special=false;a.aimYaw=Math.atan2(a.pos.x-center.x,a.pos.z-center.z);a.aimPitch=-.6;a.aimPoint.set(a.pos.x+Math.sin(a.aimYaw)*4,center.y,a.pos.z+Math.cos(a.aimYaw)*4);return out;};
   }
   g.s3Clock.reset();g._skipRender=false;
   const gl=G.renderer.getContext(),pixel=new Uint8Array(4),ext=gl.getExtension('WEBGL_debug_renderer_info');
   window.benchRead=()=>{gl.readPixels(gl.drawingBufferWidth>>1,gl.drawingBufferHeight>>1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);if(gl.getError()||gl.isContextLost()||pixel[3]!==255)throw Error('Invalid GPU-completed output');return [...pixel];};
   const scalar=o=>Object.fromEntries(Object.entries(o||{}).filter(([k,v])=>v===null||['number','boolean','string'].includes(typeof v)&&!['uuid','id','_extTick'].includes(k)).sort(([a],[b])=>a.localeCompare(b)));
   const hash32=a=>{let h=2166136261;const b=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);for(let i=0;i<b.length;i++)h=Math.imul(h^b[i],16777619);return(h>>>0).toString(16);};
   window.benchState=()=>({time:G.time,frame:g._frameN,match:{state:g.match.state,time:g.match.time},random:window.benchRandomState(),camera:{p:G.camera.position.toArray(),q:G.camera.quaternion.toArray()},paint:{counts:[...G.paint.counts],grid:hash32(G.paint.grid)},fx:{stats:G.fx.stats?.(),dN:G.fx.dN},actors:G.actors.map(a=>({alive:a.alive,hp:a.hp,ink:a.ink,form:a.form,pos:a.pos.toArray(),vel:a.vel.toArray(),weapon:a.weaponId,intent:{fire:a.intent.fire,squid:a.intent.squid,jump:a.intent.jump,move:a.intent.move.toArray()},motion:scalar(a.character.sourceMotion)}))});
   window.benchFrame=frame=>{window.benchSeed(frame);const beforeBots=window.benchBotCalls,t=performance.now();g._frame(1/60);const submit=performance.now(),pixel=window.benchRead(),complete=performance.now();return{frame,submitMs:submit-t,readbackMs:complete-submit,completedMs:complete-t,pixel,botCalls:window.benchBotCalls-beforeBots,alive:G.actors.filter(a=>a.alive).length,calls:G.renderer.info.render.calls,triangles:G.renderer.info.render.triangles,scale:g.R.dynScale,gameTime:G.time,fxDrops:G.fx.dN,projectiles:G.projectiles.list.length,rng:window.benchRandomState()};};
   window.benchCapture=()=>{const bytes=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return{rgba:Array.from(bytes),png:G.renderer.domElement.toDataURL('image/png').split(',')[1]};};
   return{native:!!G.level.native,atlas:G.paint.size,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,settings:g.settings,mobile:g.mobile,audio:{on:g._audioOn,state:G.audio.ctx?.state,music:G.music.track,worker:!!G.music.worker},width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),gpuTimerQuery:!!gl.getExtension('EXT_disjoint_timer_query_webgl2'),near:near.map(n=>({id:n.id,x:n.x,y:n.y,z:n.z})),prewarmState:window.benchState()};
  },{stage,warmup});
  if(trial.setup.bots!==8||trial.setup.mobile.touch||trial.setup.native!==(stage==='scorch'))throw Error('Incorrect desktop-profile scenario');
  result.environment.renderer=trial.setup.renderer;
  if(!/SwiftShader/i.test(trial.setup.renderer))throw Error('Expected explicitly labeled software renderer');
  trial.status='warming';save();console.log(JSON.stringify({phase:'setup',ordinal,variant,renderer:trial.setup.renderer,resolution:[trial.setup.width,trial.setup.height],audio:trial.setup.audio}));
  for(let i=0;i<warmup;i++)await page.evaluate(i=>window.benchFrame(1000+i),i);
  trial.startState=await page.evaluate(()=>window.benchState());
  trial.frames=[];trial.status='measuring';save();
  // One in-browser transaction per trial; no CDP round-trip is included in frame
  // intervals. All blocking work, GPU completion, and rAF waits remain observable.
  const measured=await page.evaluate(async({samples,warmup})=>{
   const rows=[];let prevStart=null;
   for(let i=0;i<samples;i++){
    await new Promise(requestAnimationFrame);const start=performance.now(),row=window.benchFrame(1000+warmup+i);
    row.startIntervalMs=prevStart===null?null:start-prevStart;prevStart=start;rows.push(row);
   }return {rows,endState:window.benchState(),capture:window.benchCapture()};
  },{samples:result.samples,warmup});
  trial.frames=measured.rows;trial.endState=measured.endState;
  const capture=measured.capture;
  const pixels=Buffer.from(capture.rgba);trial.pixelSha256=hash(pixels);trial.pixelBytes=pixels.length;
  const colors=new Set();let opaque=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]===255)opaque++;colors.add(pixels.readUInt32LE(i));}
  trial.imageValidation={opaque,pixels:pixels.length/4,colors:colors.size};
  fs.writeFileSync(path.join(output,`trial-${ordinal}-${variant}.rgba`),pixels);
  fs.writeFileSync(path.join(output,`trial-${ordinal}-${variant}.png`),Buffer.from(capture.png,'base64'));
  trial.completed=stats(trial.frames.map(f=>f.completedMs));trial.pacing=stats(trial.frames.slice(1).map(f=>f.startIntervalMs));trial.submit=stats(trial.frames.map(f=>f.submitMs));
  trial.status=errors.length?'failed':'complete';
  trial.invariants={allEightAlive:trial.frames.every(f=>f.alive===8),allEightBotUpdates:trial.frames.every(f=>f.botCalls===8),fixedScale:trial.frames.every(f=>f.scale===1),nonemptyRender:trial.frames.every(f=>f.calls>0&&f.triangles>1000),audioOn:trial.setup.audio.on&&trial.setup.audio.state==='running',stableDrawingBuffer:trial.pixelBytes===trial.setup.width*trial.setup.height*4,nonblankImage:opaque===pixels.length/4&&colors.size>=32};
  save();console.log(JSON.stringify({phase:'trial-complete',ordinal,variant,completed:trial.completed,pacing:trial.pacing,invariants:trial.invariants,errors}));
  await context.close();
  if(errors.length||Object.values(trial.invariants).some(v=>!v))throw Error('Whole-game trial invariant failed');
 }
 const first=result.trials[0];
 result.comparability=result.trials.map(t=>({ordinal:t.ordinal,variant:t.variant,startStateEqual:JSON.stringify(t.startState)===JSON.stringify(first.startState),endStateEqual:JSON.stringify(t.endState)===JSON.stringify(first.endState),pixelEqual:t.pixelSha256===first.pixelSha256,inputNodesEqual:JSON.stringify(t.setup.near)===JSON.stringify(first.setup.near),frameWorkEqual:JSON.stringify(t.frames.map(f=>({alive:f.alive,botCalls:f.botCalls,triangles:f.triangles,scale:f.scale,gameTime:f.gameTime,fxDrops:f.fxDrops,projectiles:f.projectiles,rng:f.rng})))===JSON.stringify(first.frames.map(f=>({alive:f.alive,botCalls:f.botCalls,triangles:f.triangles,scale:f.scale,gameTime:f.gameTime,fxDrops:f.fxDrops,projectiles:f.projectiles,rng:f.rng})))}));
 result.comparable=result.comparability.every(t=>t.startStateEqual&&t.endStateEqual&&t.pixelEqual&&t.inputNodesEqual&&t.frameWorkEqual);
 result.summary=Object.fromEntries(['A','B'].map(v=>[v,{completed:stats(result.trials.filter(t=>t.variant===v).flatMap(t=>t.frames.map(f=>f.completedMs))),pacing:stats(result.trials.filter(t=>t.variant===v).flatMap(t=>t.frames.slice(1).map(f=>f.startIntervalMs))),trialFps:result.trials.filter(t=>t.variant===v).map(t=>t.completed.fps)}]));
 result.comparisonValid=result.comparable;
 result.rawObservedPacingChangePercent=100*(result.summary.A.pacing.mean-result.summary.B.pacing.mean)/result.summary.A.pacing.mean;
 result.rawObservedSynchronousChangePercent=100*(result.summary.A.completed.mean-result.summary.B.completed.mean)/result.summary.A.completed.mean;
 if(mode==='measure'){
  const pairs=[[0,1],[3,2],[5,4],[6,7]].map(([a,b])=>({A:a,B:b,improvementPercent:100*(1-result.trials[b].pacing.mean/result.trials[a].pacing.mean)}));
  const values=pairs.map(p=>p.improvementPercent),mean=values.reduce((a,b)=>a+b,0)/values.length;
  const sd=Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/(values.length-1)),margin=3.182446305*sd/Math.sqrt(values.length);
  result.pairedEffect={metric:'rAF start-to-start pacing',pairs,meanImprovementPercent:mean,ci95:[mean-margin,mean+margin],method:'Paired-trial mean relative effect, two-sided Student t interval, df=3; four independent adjacent A/B pairs. Small sample; not a hardware-PC inference.'};
 }
 result.improvementClaimAllowed=result.comparable&&mode==='measure'&&result.pairedEffect.ci95[0]>0;
 result.status=result.comparable?'passed':'inconclusive-workload-mismatch';
 if(mode==='calibrate')result.withinFrameBudget=Math.max(...result.trials.map(t=>t.completed.p50))<=2500;
 if(!result.comparable)process.exitCode=2;
}catch(e){result.status='failed';result.error=e.stack;process.exitCode=1;}finally{
 result.receipts=Object.fromEntries(Object.entries(variants).map(([k,v])=>[k,[...v.receipts].sort()]));save();
 console.log(JSON.stringify({status:result.status,error:result.error,comparable:result.comparable,withinFrameBudget:result.withinFrameBudget,summary:result.summary,comparability:result.comparability}));
 await browser?.close();await new Promise(r=>server.close(r));
}
