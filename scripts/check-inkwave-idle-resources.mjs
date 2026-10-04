#!/usr/bin/env node
// Real published-game WebGL/Web Audio checks. Counts are work/allocation evidence,
// not estimates of mobile watts, frame rate, driver memory or Nintendo budgets.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyWallBuild } from './check-inkwave-wall-render.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export function validateIdleResult(r) {
  if(r.clouds?.length!==3||r.clouds.some((v,i)=>v.theme!==['day','sunset','golden'][i]||v.highBytes!==10485760||v.lowBytes!==2621440||!Number.isFinite(v.meanByteError)||v.meanByteError<0||v.meanByteError>8||!Number.isFinite(v.largeErrorFraction)||v.largeErrorFraction<0||v.largeErrorFraction>.1||v.highRepeatChanged!==0||!Number.isInteger(v.nonzero)||v.nonzero<100))throw Error('Cloud appearance/budget gate');
  if(r.far?.length!==4||r.far.some(v=>v.size!==256||v.disposes!==1||!v.deleted||!v.cleared||!v.sameEnvironment))throw Error('Far reflection disposal gate');
  if(r.pause?.renders!==1||r.pause.environment!==0||r.pause.paint!==0||r.pause.shadowMarks!==0||r.pause.menuTicks!==120||!r.pause.matchUnchanged||r.pause.resizeRenders!==1||r.pause.resumedRenders!==1||r.pause.onlineRenders!==3)throw Error('Offline pause work gate');
  if(!r.audio?.running||r.audio.initialPlayers!==0||r.audio.initialScheduler||r.audio.mutedTicks!==0||r.audio.mutedNodes!==0||r.audio.mutedPlayers!==0||r.audio.mutedScheduler||!r.audio.sfxPlayed||r.audio.resumedTrack!=='battle'||r.audio.toggleMaxPlayers!==1)throw Error('Muted music/SFX gate');
  if(r.errors?.length||!r.gpu?.webgl?.startsWith('WebGL 2.0')||!r.gpu.renderer)throw Error('Browser/GPU errors');
  return {cloudMiB:[10,2.5],farTransitions:4,pausedWorldRenders:'1/120',mutedSchedulerTicks:0};
}
async function main(){
 const option=n=>{const i=process.argv.indexOf(n);if(i<0||!process.argv[i+1])throw Error('Required '+n);return path.resolve(process.argv[i+1]);};
 const site=fs.realpathSync(option('--site')),output=option('--evidence-dir'),profile=option('--profile-dir');
 for(const d of [output,profile]){if(['/tmp','/var/tmp','/dev/shm'].some(p=>d===p||d.startsWith(p+'/')))throw Error('Persistent evidence required');fs.mkdirSync(d,{recursive:true});}
 const publish=r=>fs.writeFileSync(path.join(output,'idle-resources-result.json'),JSON.stringify(r,null,2)+'\n');
 let browser,server,page,identity,result;const errors=[];let phase='identity';
 publish({status:'running',phase});
 try{
  identity=verifyWallBuild(site,process.argv.includes('--exact-source'));
  if(process.argv.includes('--exact-source')){
   const p='scripts/check-inkwave-idle-resources.mjs';
   if(execFileSync('git',['rev-parse','HEAD:'+p],{cwd:ROOT,encoding:'utf8'}).trim()!==execFileSync('git',['hash-object',p],{cwd:ROOT,encoding:'utf8'}).trim())throw Error('Idle verifier differs from commit');
  }
  const {manifest}=identity;
  const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
  server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://localhost'),p=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!p.startsWith(site+path.sep)||!fs.statSync(p).isFile())throw Error('missing');res.writeHead(200,{'content-type':mime[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(res);}catch{res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const address='http://127.0.0.1:'+server.address().port+'/';
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
  browser=await chromium.launchPersistentContext(profile,{headless:true,viewport:{width:800,height:600},args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  page=await browser.newPage();page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,1500));});
  const loaded=new Set();await page.route(address+'**',async route=>{try{const response=await route.fetch(),body=await response.body(),key=decodeURIComponent(new URL(response.url()).pathname).slice(1)||'index.html';if(manifest.artifacts[key]&&sha(body)!==manifest.artifacts[key])throw Error('Loaded byte mismatch '+key);loaded.add(key);await route.fulfill({response,body});}catch(e){errors.push(e.message);await route.abort();}});
  await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,music:0,sfx:1})));
  phase='boot';await page.goto(address+'?devstage&skipTitle',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.__inkwave?.debug&&window.__G?.s3?.installed,null,{timeout:180000});
  await page.evaluate(()=>{__inkwave.debug.freeze();__inkwave.menus.wipe.cancel();});
  await page.keyboard.press('Shift');
  phase='audio';result=await page.evaluate(async()=>{
   const G=window.__G,g=G.game,m=G.music,a=G.audio;
   const initialPlayers=m.players.length,initialScheduler=!!(m.worker||m.timer);let ticks=0,nodes=0;
   const tick=m._tick,osc=a.ctx.createOscillator.bind(a.ctx);m._tick=function(...args){ticks++;return tick.apply(this,args);};a.ctx.createOscillator=(...args)=>{nodes++;return osc(...args);};
   try{
    const before=a.counts.played;a.play('jump');const sfxPlayed=a.counts.played>before;
    g._setSettings({music:.5});m.play('battle',{fade:0});await new Promise(r=>setTimeout(r,200));
    g._setSettings({music:0});ticks=nodes=0;await new Promise(r=>setTimeout(r,400));
    const mutedTicks=ticks,mutedNodes=nodes,mutedPlayers=m.players.length,mutedScheduler=!!(m.worker||m.timer);
    let toggleMaxPlayers=0;for(let i=0;i<10;i++){g._setSettings({music:.5});toggleMaxPlayers=Math.max(toggleMaxPlayers,m.players.length);g._setSettings({music:0});}
    m.play('battle');g._setSettings({music:.5});const resumedTrack=m.track;g._setSettings({music:0});
    return {audio:{initialPlayers,initialScheduler,mutedTicks,mutedNodes,mutedPlayers,mutedScheduler,sfxPlayed,resumedTrack,toggleMaxPlayers,running:a.ctx.state==='running'}};
   }finally{m._tick=tick;a.ctx.createOscillator=osc;}
  });
  phase='clouds';const cloudEvidence=await page.evaluate(async()=>{
   const G=__G,g=G.game,THREE=await import('three'),{refreshEnvironmentBudget}=await import(new URL('patches/local-quality/idle-resources.mjs',document.baseURI).href);
   const scene=new THREE.Scene(),cam=new THREE.OrthographicCamera(-1,1,1,-1,0,1),mat=new THREE.MeshBasicMaterial({toneMapped:false}),quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),mat);scene.add(quad);
   const rt=new THREE.WebGLRenderTarget(256,80,{depthBuffer:false,stencilBuffer:false}),renderer=G.renderer,old=renderer.getRenderTarget();
   function sample(){mat.map=G.env._cloudRT.texture;mat.needsUpdate=true;renderer.setRenderTarget(rt);renderer.render(scene,cam);const a=new Uint8Array(256*80*4);renderer.readRenderTargetPixels(rt,0,0,256,80,a);renderer.setRenderTarget(old);return a;}
   function png(a){const c=document.createElement('canvas');c.width=256;c.height=80;const x=c.getContext('2d'),im=x.createImageData(256,80);for(let y=0;y<80;y++)im.data.set(a.subarray(y*1024,(y+1)*1024),(79-y)*1024);x.putImageData(im,0,0);return c.toDataURL('image/png').split(',')[1];}
   const rows=[];try{for(const theme of ['day','sunset','golden']){
    G.settings.quality='high';refreshEnvironmentBudget(G.env,G.settings,{touch:false});G.env.setTheme(theme);if(G.env.theme!==theme)throw Error("Unknown theme "+theme);const hi=sample();G.env.setTheme(theme);const repeat=sample();
    const highBytes=G.env._cloudRT.width*G.env._cloudRT.height*8;
    G.settings.quality='low';refreshEnvironmentBudget(G.env,G.settings,{touch:false});const lo=sample();let total=0,large=0,nonzero=0,highRepeatChanged=0;
    for(let i=0;i<hi.length;i++){const d=Math.abs(hi[i]-lo[i]);total+=d;if(d>32)large++;if(i%4!==3&&hi[i]>0)nonzero++;if(hi[i]!==repeat[i])highRepeatChanged++;}
    rows.push({theme,highBytes,lowBytes:G.env._cloudRT.width*G.env._cloudRT.height*8,meanByteError:total/hi.length,largeErrorFraction:large/hi.length,highRepeatChanged,nonzero,high:png(hi),low:png(lo)});
   }}finally{renderer.setRenderTarget(old);quad.geometry.dispose();mat.dispose();rt.dispose();}
   return rows;
  });
  for(const row of cloudEvidence){for(const p of ['high','low']){fs.writeFileSync(path.join(output,`cloud-${row.theme}-${p}.png`),Buffer.from(row[p],'base64'));delete row[p];}}
  result.clouds=cloudEvidence;
  phase='far-stage-transitions';result.far=await page.evaluate(async()=>{
   const G=__G,g=G.game,{MAPS}=await import(new URL('src/config.js',document.baseURI).href),env=G.env,gl=G.renderer.getContext(),deleted=new Set(),del=gl.deleteTexture.bind(gl);
   gl.deleteTexture=t=>{deleted.add(t);return del(t);};const rows=[];
   try{for(let i=0;i<4;i++){
    await g._buildWorld(MAPS.find(m=>m.id==='halyard'));const rt=env._farRT;if(!rt)throw Error('Halyard cube absent');let disposes=0;rt.addEventListener('dispose',()=>disposes++);
    const handle=G.renderer.properties.get(rt.texture).__webglTexture;if(!handle)throw Error('Cube never reached GPU');
    await g._buildWorld(MAPS.find(m=>m.id==='tidewater'));
    rows.push({size:rt.width,disposes,deleted:deleted.has(handle),cleared:env._farRT===null&&env._farCam===null&&env.U.uFarCube.value===null&&env.U.uFarOn.value===0,sameEnvironment:G.env===env});
   }}finally{gl.deleteTexture=del;}return rows;
  });
  phase='pause';await page.evaluate(async()=>{await __inkwave.startMatch({mapId:'tidewater',difficulty:'easy',duration:180,mode:'turf'});__inkwave.debug.freeze();__inkwave.debug.freezeBots();__inkwave._skipRender=true;for(let i=0;i<270;i++)__inkwave._frame(1/60);__inkwave._skipRender=false;__inkwave.menus.wipe.cancel();__inkwave.pause();});
  result.pause=await page.evaluate(()=>{
   const G=__G,g=G.game,c={renders:0,environment:0,paint:0,shadowMarks:0,menuTicks:0};const restore=[];
   for(const [obj,key,label] of [[g.R,'render','renders'],[G.env,'update','environment'],[G.paint,'flush','paint'],[g.menus,'update','menuTicks']]){const old=obj[key];obj[key]=function(...a){c[label]++;return old.apply(this,a);};restore.push(()=>obj[key]=old);}
   const snapshot=()=>JSON.stringify({time:g.match.time,actors:G.actors.map(a=>[a.pos.x,a.pos.y,a.pos.z,a.hp,a.alive])}),before=snapshot();
   try{for(let i=0;i<120;i++){G.renderer.shadowMap.needsUpdate=false;g._frame(1/60);if(G.renderer.shadowMap.needsUpdate)c.shadowMarks++;}c.matchUnchanged=before===snapshot();window.__idlePause=c;}
   finally{restore.forEach(f=>f());}return c;
  });
  await page.screenshot({path:path.join(output,'offline-paused.png'),animations:'disabled'});
  await page.setViewportSize({width:810,height:610});
  const extra=await page.evaluate(()=>{
   const G=__G,g=G.game,old=g.R.render;let draws=0;g.R.render=function(...a){draws++;return old.apply(this,a);};
   try{g._frame(1/60);g._frame(1/60);const resizeRenders=draws;draws=0;g.resume();g._frame(1/60);const resumedRenders=draws;
    // Network presence is a control-plane fixture only: actual rendering and Game._frame stay production.
    // Do not pretend this is a two-peer network timing validation.
    const net=G.netm;G.netm={};g.match.paused=true;draws=0;try{for(let i=0;i<3;i++)g._frame(1/60);}finally{G.netm=net;g.match.paused=false;}return {resizeRenders,resumedRenders,onlineRenders:draws};
   }finally{g.R.render=old;}
  });Object.assign(result.pause,extra);
  result.gpu=await page.evaluate(()=>{const gl=__G.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {webgl:gl.getParameter(gl.VERSION),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};});
  for(const f of ['patches/local-quality/idle-resources.mjs','patches/local-quality/music-idle.mjs'])if(![...loaded].some(p=>p.endsWith('/'+f)))throw Error('Runtime module not actually loaded: '+f);
  result.errors=errors;const summary=validateIdleResult(result);
  publish({status:'passed',...result,summary,sourceSha:identity.source.sourceSha,contentHash:manifest.contentHash,verifierSha256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),browser:browser.browser()?.version()});
 }catch(error){publish({status:'failed',phase,error:error.stack,errors,result,sourceSha:identity?.source.sourceSha,contentHash:identity?.manifest.contentHash});if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw error;}
 finally{await browser?.close();if(server)await new Promise(r=>server.close(r));}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e);process.exitCode=1;});
