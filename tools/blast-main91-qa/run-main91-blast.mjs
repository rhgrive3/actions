#!/usr/bin/env node
// Private standalone QA driver; NOT installed in a workflow. Only standard sandbox.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {captureBlastPair,HEAD} from './capture-main91-blast.mjs';
const [rootArg,siteArg,outArg]=process.argv.slice(2);assert.ok(rootArg&&siteArg&&outArg,'usage: node run-main91-blast.mjs EXACT_CHECKOUT BUILT_SITE PRIVATE_OUTPUT');
const root=path.resolve(rootArg),site=path.resolve(siteArg),out=path.resolve(outArg);
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),HEAD);
assert.equal(execFileSync('git',['-C',root,'status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim(),'','tracked source must be clean');
assert.equal(fs.existsSync(site),false,'fresh nonexisting build output required; never overwrite an existing build');
const buildEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('INKWAVE_')&&!['NODE_OPTIONS','NODE_PATH'].includes(k)));
execFileSync(process.execPath,['scripts/build-inkwave.mjs','inkwave-public',site],{cwd:root,env:buildEnv,stdio:'inherit'});
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
assert.equal(sha(JSON.stringify(manifest.artifacts)),manifest.contentHash);
for(const [f,h] of Object.entries(manifest.artifacts)){const file=path.resolve(site,f);assert.ok(file.startsWith(site+path.sep));assert.equal(sha(fs.readFileSync(file)),h,f);}
// CI must build site from this exact clean checkout in the preceding step.
assert.equal(execFileSync('git',['-C',root,'status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim(),'','tracked source must be clean');
const lib=n=>import(pathToFileURL(path.join(root,'scripts/lib',n)).href);
const {startProjectileThroughMenu}=await lib('inkwave-projectile-menu-start.mjs');
const {completeNativeTurfIntro}=await lib('inkwave-projectile-ci-intro.mjs');
const {serveProjectileCaptureFile}=await lib('inkwave-projectile-http-file.mjs');
const {launchSandboxBrowser}=await lib('inkwave-sandbox-browser.mjs');
const {chromium}=createRequire(path.join(root,'package.json'))('playwright');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://localhost'),f=path.resolve(site,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));assert.ok(f.startsWith(site+path.sep));serveProjectileCaptureFile(req,res,f,mime);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
const driver={head:HEAD,manifestHash:manifest.contentHash,launch:'existing launchSandboxBrowser; chromiumSandbox:true; no local --no-sandbox fallback',cases:[],status:'incomplete'};
fs.mkdirSync(out,{recursive:true});const save=()=>fs.writeFileSync(path.join(out,'driver-receipt.json'),JSON.stringify(driver,null,2));save();
try{
 browser=await launchSandboxBrowser(chromium);const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1,serviceWorkers:'block'});const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{
  localStorage.setItem('inkwave.settings',JSON.stringify({quality:'high',shadows:true,bloom:true,minimap:false,cameraShake:0,colorblind:true,difficulty:'normal',matchLength:180,lastStage:'tidewater',lastMode:'turf',stageTimes:{tidewater:'day'}}));
  let boot=0x49574b33;Math.random=()=>{boot^=boot<<13;boot^=boot>>>17;boot^=boot<<5;return(boot>>>0)/4294967296;};
  window.__iwResetScenarioRandom=seed=>{let state=seed>>>0,draws=0;const callers=[];Math.random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;draws++;if(callers.length<12)callers.push({draw:draws,stack:(new Error('scenario Math.random').stack||'').split('\n').slice(2,8).map(s=>s.trim())});return(state>>>0)/4294967296;};return{snapshot:()=>({seed:seed>>>0,draws,state:state>>>0,callers})};};
 });
 async function bootAndWarm(){
  const events=[];await page.goto(`http://127.0.0.1:${server.address().port}/?map=tidewater&difficulty=normal&skipTitle`,{waitUntil:'domcontentloaded',timeout:60000});
  const deadline=Date.now()+180000;
  const waitForPhase=async(fn,label)=>{while(Date.now()<deadline){if(await page.evaluate(fn))return;await page.waitForTimeout(250);}throw Error(label+' timeout');};
  await startProjectileThroughMenu(page,{waitForPhase,remainingMs:()=>deadline-Date.now(),receipt:events});
  await waitForPhase(()=>{const g=window.__inkwave,G=window.__G;return G?.mode==='match'&&g?.match===G.match&&!g.match.attract&&g.match.local?.isLocal&&g.match.controller&&['intro','playing'].includes(g.match.state);},'native admission');
  const intro=await page.evaluate(completeNativeTurfIntro);
  const warm=await page.evaluate(()=>{
   const G=__G,g=__inkwave,a=g.match.local;g.debug.freeze();g.debug.freezeBots();g._skipRender=true;
   for(let i=0;a.s3?.squidSpawn&&i<180;i++)g._frame(1/60);
   if(a.s3?.squidSpawn||!a.alive||!a.grounded)throw Error('native spawn lifecycle not settled');
   a.setWeapon('blaster');const origin=a.pos.toArray();
   // Actual stage paint fixture via native public paint API, no sample()/flags spoof.
   G.paint.splat(a.pos,12,a.team);G.paint.flush(1/60);
   g.debug.key('ShiftLeft',true);g.debug.key('KeyW',true);g.debug.key('Space',false);
   let frames=0;for(;frames<120;frames++){g._frame(1/60);if(a.form==='squid'&&a.submerged&&a.grounded&&Math.hypot(a.vel.x,a.vel.z)>=8.7&&!a.weaponRunner.busy()&&!(a.fireBuffer>0))break;}
   if(frames>=120)throw Error('native own-ink swim admission failed');
   return {origin,actor:a.pos.toArray(),velocity:a.vel.toArray(),frames,form:a.form,submerged:a.submerged,grounded:a.grounded,weapon:a.weaponId,paintFixture:'native splat radius12 at native settled spawn'};
  });
  events.push({intro,warm});return {events,warm};
 }
 // First prepare computes native scene coordinates; subsequent cases fresh reload.
 let first=await bootAndWarm();const origin=first.warm.origin;
 const blastPosition=[origin[0],origin[1]+1.8,origin[2]+5];
 const camera={position:[origin[0],origin[1]+2,origin[2]-4],target:blastPosition};
 const prepareCase=async(_page,{withRoll})=>{const setup=first||await bootAndWarm();first=null;driver.cases.push({withRoll,...setup});save();return {nativeMatch:true,verifiedHead:HEAD,contentHash:manifest.contentHash,allArtifactHashesVerified:true,...setup};};
 const admitRoll=async()=>page.evaluate(()=>{
  const g=__inkwave,G=__G,a=g.match.local,before={time:G.time,velocity:a.vel.toArray(),form:a.form,submerged:a.submerged,grounded:a.grounded,jump:a.intent.jump,busy:a.weaponRunner.busy(),fireBuffer:a.fireBuffer};
  if(a.intent.jump||a.weaponRunner.busy()||a.fireBuffer>0||a.s3?.actions?.roll)throw Error('roll requires clean rising jump edge');
  g.debug.key('KeyW',false);g.debug.key('KeyS',true);g.debug.key('Space',true);
  // Exact native controller->match order, deliberately stop BEFORE FX.update.
  G.time+=1/60;g.match.updateController(1/60);g.match.update(1/60);g.input.endFrame();
  const r=a.s3?.actions?.roll;if(!(r?.time>0)||a.grounded||a.form!=='squid')throw Error('native reverse+jump input did not admit airborne roll');
  g.debug.key('Space',false);g.debug.key('KeyS',false);
  return {realInputRollAdmission:true,before,after:{time:G.time,intentMove:a.intent.move.toArray(),reverseAngleDegrees:(()=>{const v=before.velocity,m=a.intent.move;return Math.acos(Math.max(-1,Math.min(1,(v[0]*m.x+v[2]*m.z)/(Math.hypot(v[0],v[2])*Math.hypot(m.x,m.z)))))*180/Math.PI;})(),remaining:r.time,armorTime:r.armorTime,armorHP:r.armorHP,velocity:a.vel.toArray(),grounded:a.grounded},input:['ShiftLeft held','KeyW up','KeyS down','Space rising','native updateController','native match.update','stop before FX.update']};
 });
 await captureBlastPair({page,out,expectedContentHash:manifest.contentHash,prepareCase,admitRoll,camera,blastPosition});
 assert.deepEqual(errors,[]);driver.status='captured-not-reviewed';driver.browser=browser.version();save();
} catch(e){driver.error=String(e.stack||e);save();throw e;}finally{await browser?.close();await new Promise(r=>server.close(r));}
