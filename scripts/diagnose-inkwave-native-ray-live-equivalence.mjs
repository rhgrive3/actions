#!/usr/bin/env node
// Live real-game differential ray observer. No speed or FPS measurement.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import os from 'node:os';import {pathToFileURL} from 'node:url';
import {verifyRuntimeBuild,hash} from './lib/inkwave-runtime-evidence.mjs';
const arg=n=>{const i=process.argv.indexOf(n);if(i<0||!process.argv[i+1])throw Error('Required '+n);return process.argv[i+1];};
const stage=arg('--stage');if(!['tidewater','scorch'].includes(stage))throw Error('Fixed stage required');
const evidence=path.resolve(arg('--evidence-dir'));fs.mkdirSync(evidence,{recursive:true});
const variants=Object.fromEntries(['before','after'].map(mode=>{const prefix=mode==='before'?'baseline':'candidate',root=path.resolve(arg('--'+prefix+'-root')),site=path.resolve(arg('--'+prefix+'-site')),sha=arg('--'+prefix+'-sha');return[mode,{root,site,sha,manifest:verifyRuntimeBuild(site,root,sha),receipts:new Set()}];}));
const oldSource=fs.readFileSync(path.join(variants.before.root,'patches/native-stages/runtime/triangle-world.mjs'));
const oldHash=hash(oldSource);if(oldHash!=='216165efa7be96b47def23f11740696efff64478e31c6253ea2728745d650b91'||oldHash!==variants.before.manifest.files['native-stages/runtime/triangle-world.mjs'])throw Error('Immutable baseline ray source mismatch');
const candidateRayHash=hash(fs.readFileSync(path.join(variants.after.root,'patches/native-stages/runtime/triangle-world.mjs')));if(candidateRayHash!=='76206bdf0a42a5122759ca0914435e3a3f89da590740253e8c4f18d6127af92f')throw Error('Candidate ray source mismatch');
const mirrorSource=fs.readFileSync(new URL('./lib/live-ray-mirror.mjs',import.meta.url));
const diagnosticRoutes={'/diagnostic-baseline-triangle-world.mjs':oldSource,'/diagnostic-live-ray-mirror.mjs':mirrorSource};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://localhost');if(diagnosticRoutes[u.pathname]){res.writeHead(200,{'content-type':'text/javascript'});res.end(diagnosticRoutes[u.pathname]);return;}const m=u.pathname.match(/^\/(before|after)\/(.*)$/);if(!m)throw Error('variant path required');const v=variants[m[1]],rel=decodeURIComponent(m[2]||'index.html'),file=path.resolve(v.site,rel);if(!file.startsWith(v.site+'/'))throw Error('path traversal');const b=fs.readFileSync(file);if(rel!=='inkwave-build.json'&&(!v.manifest.artifacts[rel]||hash(b)!==v.manifest.artifacts[rel]))throw Error('unverified artifact '+rel);v.receipts.add(rel);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(b);}catch(e){res.writeHead(404);res.end(String(e));}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {chromium}=await import(pathToFileURL(arg('--playwright')).href);
const result={status:'running',stage,order:['after'],provenance:{baselineSourceSha:variants.before.sha,baselineRaySha256:oldHash,candidateSourceSha:variants.after.sha,candidateRaySha256:candidateRayHash,candidateContentHash:variants.after.manifest.contentHash,diagnosticHelperSha256:hash(mirrorSource)},environment:{cpu:os.cpus()[0]?.model,cores:os.cpus().length,node:process.version,renderer:'Chromium SwiftShader, not iPad hardware'},runs:[],limitations:['One actual-main candidate game, 8 living actors, live BotBrain then fixed outward firing. Every live ray is immediately evaluated by an immutable baseline mirror. Audio, FX and gameplay owners remain active.','Dual evaluation, stack classification and byte checks add overhead. This is functional equivalence evidence, never a speed measurement.']};
const save=()=>fs.writeFileSync(path.join(evidence,'live-equivalence.json'),JSON.stringify(result,null,2));let browser;
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
   window.crowdStep=(frame,dt=1/60)=>{window.liveRayMirror?.setFrame(frame);g._frame(dt);};
   const gridSnapshot=grid=>{const cells=[];for(let i=0;i<grid.length;i++)if(grid[i])cells.push([i,grid[i]]);return{length:grid.length,nonzero:cells};};
   window.crowdSnapshots=[];window.crowdSnapshot=label=>{const paint=G.paint;const snap={label,rng:window.crowdRandomState(),clock:scalar(g.s3Clock),time:G.time,frameN:g._frameN,mode:G.mode,frozen:g.frozen,hidden:document.hidden,fx:fxState(),fxHooks:scalar(g.fxHooks),fxHookCounts:{...g.fxHooks.count},rig:{scalars:scalar(g.rig),vectors:vectorState(g.rig)},camera:{position:G.camera.position.toArray(),quaternion:G.camera.quaternion.toArray()},match:scalar(g.match),game:scalar(g),profile:g.profile,paint:scalar(paint),counts:[...paint.counts],renderInfo:{calls:G.renderer.info.render.calls,triangles:G.renderer.info.render.triangles},teamHex:[...G.teamHex],grid:gridSnapshot(paint.grid),growth:(paint.growing||paint.growth||[]).map?.(scalar),actors:G.actors.map(a=>({scalars:scalar(a),position:a.pos.toArray(),intent:scalar(a.intent),weapon:scalar(a.weaponRunner),bot:scalar(a.bot),character:scalar(a.character),motion:scalar(a.character.sourceMotion),style:a.style}))};window.crowdSnapshots.push(snap);return snap;};
   window.crowdSnapshot('boot-frozen');
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
   return {native:!!G.level.native,atlas:G.paint.size,bots:G.actors.filter(a=>a.bot).length,snapshots:window.crowdSnapshots};
  },stage);
  if(setup.atlas!==2048||setup.bots!==8||setup.native!==(stage==='scorch'))throw Error('Incorrect production fixture '+JSON.stringify(setup));
  const row={mode,ordinal,sourceSha:variants[mode].sha,setup,errors};result.runs.push(row);save();
  await page.evaluate(async()=>{const {TriangleWorld:Old}=await import('/diagnostic-baseline-triangle-world.mjs');const {installLiveRayMirror}=await import('/diagnostic-live-ray-mirror.mjs');const proto=CG.level.triangleWorld.constructor.prototype;if(proto===Old.prototype)throw Error('Aliased ray implementations');window.liveRayMirror=installLiveRayMirror(proto,Old,window.crowdRandomState);});
  row.frames=[];for(let i=0;i<12;i++){row.frames.push(await page.evaluate(i=>{CG.game._skipRender=false;window.crowdStep(1360+i);return {frame:i,time:CG.time,alive:CG.actors.filter(a=>a.alive).length,queries:window.liveRayMirror.state.calls,mismatches:window.liveRayMirror.state.mismatchCount};},i));save();}
  row.finalState=await page.evaluate(()=>{CG.game.debug.freeze();window.liveRayMirror.restore();return window.crowdSnapshot('crowd-after-12-rendered-frames');});save();
  row.equivalence=await page.evaluate(async()=>{if(!CG.game.frozen)throw Error('Simulation must be frozen before geometry digest');return await window.liveRayMirror.finish();});save();
  if(row.finalState.actors.length!==8||row.finalState.actors.some(a=>!a.scalars.alive))throw Error('Crowd lost a live actor');
  const image=await page.evaluate(()=>{CG.game.R.render();const c=CG.renderer.domElement,url=c.toDataURL('image/png'),copy=document.createElement('canvas');copy.width=c.width;copy.height=c.height;const ctx=copy.getContext('2d');ctx.drawImage(c,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;let opaque=0;for(let i=3;i<data.length;i+=4)if(data[i]===255)opaque++;return {url,opaque,total:c.width*c.height,width:c.width,height:c.height};});const bytes=Buffer.from(image.url.split(',')[1],'base64');row.image={opaque:image.opaque,total:image.total,width:image.width,height:image.height};fs.writeFileSync(path.join(evidence,mode+'.png'),bytes);row.imageSha256=hash(bytes);save();
  console.log(JSON.stringify({mode,ordinal,actors:row.finalState.actors.length,renderInfo:row.finalState.renderInfo,equivalent:row.equivalence.allEquivalent,queries:row.equivalence.calls,callers:row.equivalence.callers,errors}));await context.close();

 }
 const row=result.runs[0],eq=row.equivalence;
 result.coverage={calls: eq.calls,requiredCallers:['FX','Character','Physics','Bot'],allRequiredCallers:['FX','Character','Physics','Bot'].every(k=>eq.callers[k]?.calls>0),frames:Object.keys(eq.frames).length};
 if(!eq.allEquivalent||eq.calls===0||!result.coverage.allRequiredCallers||result.coverage.frames!==12)throw Error('Live equivalence or caller/frame coverage failed');
 if(row.image.opaque!==row.image.total||row.image.total===0)throw Error('Actual canvas image not fully opaque');if(row.errors.length)throw Error('Browser page errors');result.status='passed';
}catch(e){result.status='failed';result.error=e.stack;process.exitCode=1;}finally{result.receipts=Object.fromEntries(Object.entries(variants).map(([k,v])=>[k,[...v.receipts].sort()]));save();await browser?.close();await new Promise(r=>server.close(r));}
