#!/usr/bin/env node
// Short real-game state/profile audit. No FPS or throughput acceptance claim.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import os from 'node:os';import {pathToFileURL} from 'node:url';
import {verifyRuntimeBuild,hash,sampleStats} from './lib/inkwave-runtime-evidence.mjs';
const arg=n=>{const i=process.argv.indexOf(n);if(i<0||!process.argv[i+1])throw Error('Required '+n);return process.argv[i+1];};
const stage=arg('--stage');if(!['tidewater','scorch'].includes(stage))throw Error('Fixed stage required');
const evidence=path.resolve(arg('--evidence-dir'));fs.mkdirSync(evidence,{recursive:true});
const variants=Object.fromEntries(['before','after'].map(mode=>{const prefix=mode==='before'?'baseline':'candidate',root=path.resolve(arg('--'+prefix+'-root')),site=path.resolve(arg('--'+prefix+'-site')),sha=arg('--'+prefix+'-sha');return[mode,{root,site,sha,manifest:verifyRuntimeBuild(site,root,sha),receipts:new Set()}];}));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://localhost'),m=u.pathname.match(/^\/(before|after)\/(.*)$/);if(!m)throw Error('variant path required');const v=variants[m[1]],rel=decodeURIComponent(m[2]||'index.html'),file=path.resolve(v.site,rel);if(!file.startsWith(v.site+'/'))throw Error('path traversal');const b=fs.readFileSync(file);if(rel!=='inkwave-build.json'&&(!v.manifest.artifacts[rel]||hash(b)!==v.manifest.artifacts[rel]))throw Error('unverified artifact '+rel);v.receipts.add(rel);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(b);}catch(e){res.writeHead(404);res.end(String(e));}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {chromium}=await import(pathToFileURL(arg('--playwright')).href);
const result={status:'running',stage,order:['before','after'],environment:{cpu:os.cpus()[0]?.model,cores:os.cpus().length,node:process.version,renderer:'Chromium SwiftShader, not iPad hardware'},runs:[],limitations:['Seeded actual-main A/B: simulation-only countdown/crowd warmup, then 12 real rendered frames with separate CPU sampling. FX diagnosis adds frame fingerprints inside the sampling interval; do not use these profile timings as product CPU cost. Music stays enabled at 0.6.','Production startMatch keeps its existing warm timeout; final diagnostic snapshots also wait for every source loader and warm promise.']};
const save=()=>fs.writeFileSync(path.join(evidence,'short-state.json'),JSON.stringify(result,null,2));let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});result.environment.browser=browser.version();
 for(const [ordinal,mode] of result.order.entries()){
  const context=await browser.newContext({viewport:{width:960,height:600},hasTouch:true,isMobile:true,deviceScaleFactor:1}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{let seed=20261012,calls=0,resetCalls=0;window.crowdRandomCalls=[];window.crowdRandomState=()=>({seed,calls,callsSinceReset:calls-resetCalls});window.resetCrowdSeed=i=>{resetCalls=calls;seed=(20261012+Math.imul(i,2654435761))>>>0;};Math.random=()=>{calls++;if(window.crowdTraceRandom&&window.crowdRandomCalls.length<100)window.crowdRandomCalls.push({call:calls,seedBefore:seed,stack:new Error().stack});seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,frameRate:60,music:0.6}));});
  await page.goto(`http://127.0.0.1:${server.address().port}/${mode}/?map=${stage}&autopilot`,{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{window.CG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
  await page.waitForFunction(()=>{const g=CG.game;if(g)g.frozen=true;return (g?.debug&&CG.s3?.installed&&CG.mode!=='boot')||document.getElementById('boot-error')?.textContent;},null,{timeout:900000});
  const bootError=await page.locator('#boot-error').textContent();if(bootError)throw Error(bootError);
  const setup=await page.evaluate(async stage=>{
   const G=CG,g=G.game;g.debug.freeze();g.menus.wipe.cancel();
   const scalar=o=>Object.fromEntries(Object.entries(o||{}).filter(([k,v])=>v===null||['number','string','boolean'].includes(typeof v)).sort(([a],[b])=>a.localeCompare(b)));
   const typedState=a=>a?Array.from(a):null;
   const vectorState=o=>Object.fromEntries(Object.entries(o||{}).filter(([k,v])=>v?.isVector3||v?.isQuaternion||v?.isEuler).map(([k,v])=>[k,v.toArray()]));
   const fxState=()=>{const f=G.fx,out={scalars:scalar(f),vectors:vectorState(f),drops:{P:typedState(f.dP?.subarray(0,f.dN*3)),V:typedState(f.dV?.subarray(0,f.dN*3)),K:typedState(f.dK?.subarray(0,f.dN*3)),A:typedState(f.dA?.subarray(0,f.dN*8))}};for(const k of ['puffs','glows','rings','shells','beams','marks','pillars']){const p=f[k];if(!p)continue;out[k]={scalars:scalar(p)};for(const [key,v]of Object.entries(p))if(ArrayBuffer.isView(v))out[k][key]=typedState(v.subarray(0,p.cap?p.n*v.length/p.cap:v.length));}return out;};
   window.crowdSteps=[];window.crowdStep=(frame,dt=1/60)=>{window.resetCrowdSeed(frame);const begin=window.crowdRandomState();g._frame(dt);let h=2166136261;const f=G.fx;for(const a of [f.dP?.subarray(0,f.dN*3),f.dV?.subarray(0,f.dN*3),f.dA?.subarray(0,f.dN*8)])if(a){const bytes=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);for(const x of bytes)h=Math.imul(h^x,16777619)>>>0;}window.crowdSteps.push({frame,rng:window.crowdRandomState(),begin,fxDrops:f.dN,fxHash:h,fxTime:f._time,camera:G.camera.position.toArray(),cameraQ:G.camera.quaternion.toArray(),rig:scalar(g.rig)});};
   const gridSnapshot=grid=>{const cells=[];for(let i=0;i<grid.length;i++)if(grid[i])cells.push([i,grid[i]]);return{length:grid.length,nonzero:cells};};
   window.crowdSnapshots=[];window.crowdSnapshot=label=>{const paint=G.paint;const snap={label,rng:window.crowdRandomState(),clock:scalar(g.s3Clock),time:G.time,frameN:g._frameN,mode:G.mode,frozen:g.frozen,hidden:document.hidden,fx:fxState(),rig:{scalars:scalar(g.rig),vectors:vectorState(g.rig)},camera:{position:G.camera.position.toArray(),quaternion:G.camera.quaternion.toArray()},match:scalar(g.match),game:scalar(g),profile:g.profile,paint:scalar(paint),counts:[...paint.counts],renderInfo:{calls:G.renderer.info.render.calls,triangles:G.renderer.info.render.triangles},teamHex:[...G.teamHex],grid:gridSnapshot(paint.grid),growth:(paint.growing||paint.growth||[]).map?.(scalar),actors:G.actors.map(a=>({scalars:scalar(a),position:a.pos.toArray(),intent:scalar(a.intent),weapon:scalar(a.weaponRunner),bot:scalar(a.bot),character:scalar(a.character),motion:scalar(a.character.sourceMotion),style:a.style}))};window.crowdSnapshots.push(snap);return snap;};
   window.crowdSnapshot('boot-frozen');
   const Match=g.match.constructor,setup=Match.prototype.setup;Match.prototype.setup=function(...args){window.crowdSnapshot('match-setup-before');window.resetCrowdSeed(701);window.crowdSnapshot('match-setup-seeded');window.crowdTraceRandom=false;const out=setup.apply(this,args);window.crowdSnapshot('match-setup-after');return out;};
   const palette=g._pickPalette;g._pickPalette=function(...args){window.crowdSnapshot('palette-before');window.resetCrowdSeed(700);const out=palette.apply(this,args);window.crowdSnapshot('palette-after');return out;};
   const warm=g._warmCharacters;g._warmCharacters=async function(...args){window.crowdSnapshot('warm-before');const out=await warm.apply(this,args);window.crowdSnapshot('warm-return');return out;};
   window.resetCrowdSeed(0);G.time=0;g.rig.time=0;g.rig.shakeSeed=Math.random()*100;window.crowdSnapshot('startMatch-before');window.crowdTraceRandom=true;
   if(G.audio){let seed=13579;G.audio.rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
   await g.startMatch({mapId:stage,mode:'turf',difficulty:'normal',duration:180});g.debug.freeze();window.crowdSnapshot('startMatch-return');g.R.setDynamicScale(1);g._skipRender=true;
   // Initialization diagnostic only, no performance claim and no extra game stepping.
   await Promise.all(G.actors.map(a=>a.character._sourceMotionLoader));window.crowdSnapshot('source-loaders-settled');
   await Promise.all(G.actors.map(a=>a.character.warmAll()));window.crowdSnapshot('all-warm-settled');
   g._skipRender=false;window.crowdStep(900);window.crowdSnapshot('one-frame-seeded');
   g._skipRender=true;for(let i=0;i<330;i++){window.crowdStep(1000+i);}
   window.crowdSnapshot('after-countdown-before-respawn');
   if(g.match.state!=='playing')throw Error('Expected playing after countdown');
   const nodes=G.nav.nodes.filter(n=>Number.isFinite(n.y)).sort((a,b)=>(a.x*a.x+a.z*a.z)-(b.x*b.x+b.z*b.z)||a.id-b.id),anchor=nodes[0];
   const near=nodes.filter(n=>Math.abs(n.y-anchor.y)<.5&&Math.hypot(n.x-anchor.x,n.z-anchor.z)<5).slice(0,8);if(near.length!==8)throw Error('No crowd nodes');
   const center={x:near.reduce((s,n)=>s+n.x,0)/8,y:near.reduce((s,n)=>s+n.y,0)/8,z:near.reduce((s,n)=>s+n.z,0)/8};
   window.crowdCamera=()=>{G.camera.position.set(center.x,center.y+12,center.z-12);G.camera.lookAt(center.x,center.y+1,center.z);G.camera.updateMatrixWorld();};
   const render=g.R.render.bind(g.R);g.R.render=function(...args){window.crowdCamera();return render(...args);};
   window.resetCrowdSeed(1330);
   for(let i=0;i<8;i++){const a=G.actors[i],n=near[i];a.setWeapon('shooter');a.spawnAt(a.pos.clone().set(n.x,n.y+.05,n.z),0);const update=a.bot.update;a.bot.update=function(dt){const out=update.call(this,dt);a.intent.move.set(0,0,0);a.intent.fire=true;a.intent.squid=false;a.intent.jump=false;a.intent.sub=false;a.intent.special=false;a.aimYaw=Math.atan2(a.pos.x-center.x,a.pos.z-center.z);a.aimPitch=-.6;a.aimPoint.set(a.pos.x+Math.sin(a.aimYaw)*4,center.y,a.pos.z+Math.cos(a.aimYaw)*4);return out;};}
   g.s3Clock.reset();for(let i=0;i<30;i++){window.crowdStep(1330+i);window.crowdCamera();}
   window.crowdSnapshot('crowd-before-12-rendered-frames');
   return {native:!!G.level.native,atlas:G.paint.size,bots:G.actors.filter(a=>a.bot).length,snapshots:window.crowdSnapshots,initialRandomCalls:window.crowdRandomCalls};
  },stage);
  if(setup.atlas!==2048||setup.bots!==8||setup.native!==(stage==='scorch'))throw Error('Incorrect production fixture '+JSON.stringify(setup));
  const row={mode,ordinal,sourceSha:variants[mode].sha,setup,errors};result.runs.push(row);save();
  const cdp=await context.newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
  row.finalState=await page.evaluate(()=>{const g=CG.game;g._skipRender=false;for(let i=0;i<12;i++){window.crowdStep(1360+i);}return window.crowdSnapshot('crowd-after-12-rendered-frames');});
  row.frameFingerprints=await page.evaluate(()=>window.crowdSteps);const {profile}=await cdp.send('Profiler.stop');fs.writeFileSync(path.join(evidence,mode+'-12frame.cpuprofile'),JSON.stringify(profile));await cdp.detach();save();
  if(row.finalState.actors.some(a=>!a.scalars.alive))throw Error('Crowd lost a live actor');
  const trace=await page.evaluate(()=>{const G=CG,g=G.game,w=G.level.triangleWorld,ray=w.ray,rows=[],number=n=>Object.is(n,-0)?'-0':Number.isFinite(n)?n:String(n);w.ray=function(o,d,far=1000,opt={}){rows.push([o.x,o.y,o.z,d.x,d.y,d.z,far,opt.ignoreGrates??false,opt.minNormalY??-2].map(v=>typeof v==='number'?number(v):v));return ray.call(this,o,d,far,opt);};try{g._skipRender=true;for(let i=0;i<12;i++){window.resetCrowdSeed(1372+i);g._frame(1/60);window.crowdCamera();}}finally{w.ray=ray;g._skipRender=false;}return{rows,stage:G.level.layout.id,manifestSummary:{id:G.level.manifest.id,source:G.level.manifest.source},frameCount:12,rendered:false,actors:G.actors.length};});
  fs.writeFileSync(path.join(evidence,mode+'-native-ray-inputs.json'),JSON.stringify(trace));row.trace={queries:trace.rows.length,sha256:hash(Buffer.from(JSON.stringify(trace.rows))),rendered:false,frames:12};save();
  const png=await page.evaluate(()=>{CG.game.R.render();return CG.renderer.domElement.toDataURL('image/png');});const bytes=Buffer.from(png.split(',')[1],'base64');fs.writeFileSync(path.join(evidence,mode+'.png'),bytes);row.imageSha256=hash(bytes);save();
  console.log(JSON.stringify({mode,ordinal,actors:row.finalState.actors.length,renderInfo:row.finalState.renderInfo,trace:row.trace,errors}));await context.close();

 }
 const stable=state=>{const snap=structuredClone(state);delete snap.rng.calls;delete snap.game.bootMs;for(const a of snap.actors)delete a.scalars._netLifeStartedAt;return JSON.stringify(snap);};result.exactInitialState=result.runs.every(r=>stable(r.setup.snapshots.at(-1))===stable(result.runs[0].setup.snapshots.at(-1)));result.exactFinalState=result.runs.every(r=>stable(r.finalState)===stable(result.runs[0].finalState));result.exactState=result.exactInitialState&&result.exactFinalState;result.gateExclusions=['total RNG lifetime calls before explicit fixture reseeds; callsSinceReset and seed compared','game.bootMs wall-clock startup duration','actor._netLifeStartedAt networking wall clock (offline scene)'];if(!result.exactState)throw Error('Seeded short actual-game A/B state differs');result.status='measured';
}catch(e){result.status='failed';result.error=e.stack;process.exitCode=1;}finally{result.receipts=Object.fromEntries(Object.entries(variants).map(([k,v])=>[k,[...v.receipts].sort()]));save();await browser?.close();await new Promise(r=>server.close(r));}
