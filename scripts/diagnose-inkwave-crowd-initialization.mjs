#!/usr/bin/env node
// Initialization-only A/A audit. No frame timing or gameplay performance claim.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import os from 'node:os';import {pathToFileURL} from 'node:url';
import {verifyRuntimeBuild,hash,sampleStats} from './lib/inkwave-runtime-evidence.mjs';
const arg=n=>{const i=process.argv.indexOf(n);if(i<0||!process.argv[i+1])throw Error('Required '+n);return process.argv[i+1];};
const stage=arg('--stage');if(!['tidewater','scorch'].includes(stage))throw Error('Fixed stage required');
const evidence=path.resolve(arg('--evidence-dir'));fs.mkdirSync(evidence,{recursive:true});
const variants=Object.fromEntries(['before','after'].map(mode=>{const prefix=mode==='before'?'baseline':'candidate',root=path.resolve(arg('--'+prefix+'-root')),site=path.resolve(arg('--'+prefix+'-site')),sha=arg('--'+prefix+'-sha');return[mode,{root,site,sha,manifest:verifyRuntimeBuild(site,root,sha),receipts:new Set()}];}));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://localhost'),m=u.pathname.match(/^\/(before|after)\/(.*)$/);if(!m)throw Error('variant path required');const v=variants[m[1]],rel=decodeURIComponent(m[2]||'index.html'),file=path.resolve(v.site,rel);if(!file.startsWith(v.site+'/'))throw Error('path traversal');const b=fs.readFileSync(file);if(rel!=='inkwave-build.json'&&(!v.manifest.artifacts[rel]||hash(b)!==v.manifest.artifacts[rel]))throw Error('unverified artifact '+rel);v.receipts.add(rel);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(b);}catch(e){res.writeHead(404);res.end(String(e));}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {chromium}=await import(pathToFileURL(arg('--playwright')).href);
const result={status:'running',stage,order:['before','before'],environment:{cpu:os.cpus()[0]?.model,cores:os.cpus().length,node:process.version,renderer:'Chromium SwiftShader, not iPad hardware'},runs:[],limitations:['A/A initialization snapshots only; no gameplay frame timing.','Production startMatch keeps its existing warm timeout; final diagnostic snapshots also wait for every source loader and warm promise.']};
const save=()=>fs.writeFileSync(path.join(evidence,'initialization.json'),JSON.stringify(result,null,2));let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});result.environment.browser=browser.version();
 for(const [ordinal,mode] of result.order.entries()){
  const context=await browser.newContext({viewport:{width:960,height:600},hasTouch:true,isMobile:true,deviceScaleFactor:1}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{let seed=20261012,calls=0;window.crowdRandomState=()=>({seed,calls});window.resetCrowdSeed=i=>{seed=(20261012+Math.imul(i,2654435761))>>>0;};Math.random=()=>{calls++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,frameRate:60,musicVolume:0}));});
  await page.goto(`http://127.0.0.1:${server.address().port}/${mode}/?map=${stage}&autopilot`,{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{window.CG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
  await page.waitForFunction(()=>{const g=CG.game;if(g)g.frozen=true;return (g?.debug&&CG.s3?.installed&&CG.mode!=='boot')||document.getElementById('boot-error')?.textContent;},null,{timeout:900000});
  const bootError=await page.locator('#boot-error').textContent();if(bootError)throw Error(bootError);
  const setup=await page.evaluate(async stage=>{
   const G=CG,g=G.game;g.debug.freeze();g.menus.wipe.cancel();
   const scalar=o=>Object.fromEntries(Object.entries(o||{}).filter(([k,v])=>v===null||['number','string','boolean'].includes(typeof v)).sort(([a],[b])=>a.localeCompare(b)));
   window.crowdSnapshots=[];window.crowdSnapshot=label=>{const paint=G.paint;const snap={label,rng:window.crowdRandomState(),clock:scalar(g.s3Clock),time:G.time,frameN:g._frameN,mode:G.mode,frozen:g.frozen,hidden:document.hidden,match:scalar(g.match),game:scalar(g),profile:g.profile,paint:scalar(paint),counts:[...paint.counts],grid:Array.from(paint.grid),growth:(paint.growing||paint.growth||[]).map?.(scalar),actors:G.actors.map(a=>({scalars:scalar(a),position:a.pos.toArray(),intent:scalar(a.intent),weapon:scalar(a.weaponRunner),bot:scalar(a.bot),character:scalar(a.character),motion:scalar(a.character.sourceMotion),style:a.style}))};window.crowdSnapshots.push(snap);return snap;};
   window.crowdSnapshot('boot-frozen');
   const Match=g.match.constructor,setup=Match.prototype.setup;Match.prototype.setup=function(...args){window.crowdSnapshot('match-setup-before');const out=setup.apply(this,args);window.crowdSnapshot('match-setup-after');return out;};
   const warm=g._warmCharacters;g._warmCharacters=async function(...args){window.crowdSnapshot('warm-before');const out=await warm.apply(this,args);window.crowdSnapshot('warm-return');return out;};
   window.resetCrowdSeed(0);G.time=0;g.rig.time=0;g.rig.shakeSeed=Math.random()*100;window.crowdSnapshot('startMatch-before');
   if(G.audio){let seed=13579;G.audio.rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
   await g.startMatch({mapId:stage,mode:'turf',difficulty:'normal',duration:180});g.debug.freeze();window.crowdSnapshot('startMatch-return');g.R.setDynamicScale(1);g._skipRender=true;
   // Initialization diagnostic only, no performance claim and no extra game stepping.
   await Promise.all(G.actors.map(a=>a.character._sourceMotionLoader));window.crowdSnapshot('source-loaders-settled');
   await Promise.all(G.actors.map(a=>a.character.warmAll()));window.crowdSnapshot('all-warm-settled');
   return {native:!!G.level.native,atlas:G.paint.size,bots:G.actors.filter(a=>a.bot).length,snapshots:window.crowdSnapshots};
  },stage);
  if(setup.atlas!==2048||setup.bots!==8||setup.native!==(stage==='scorch'))throw Error('Incorrect production fixture '+JSON.stringify(setup));
  const row={mode,ordinal,sourceSha:variants[mode].sha,setup,errors};result.runs.push(row);save();console.log(JSON.stringify({mode,ordinal,snapshots:setup.snapshots.map(s=>({label:s.label,rng:s.rng,actorCount:s.actors.length,clock:s.clock,time:s.time}))}));await context.close();

 }
 result.exactState=null;result.status='measured';
}catch(e){result.status='failed';result.error=e.stack;process.exitCode=1;}finally{result.receipts=Object.fromEntries(Object.entries(variants).map(([k,v])=>[k,[...v.receipts].sort()]));save();await browser?.close();await new Promise(r=>server.close(r));}
