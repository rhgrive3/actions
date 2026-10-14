#!/usr/bin/env node
// Reuses existing immutable emitted sites; never builds or alters either checkout.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {initializePair,connectPair,pairBooted,preparePair,verifyPairRequest,finalizePairCase} from './check-inkwave-stage-game-pair.mjs';
import {collectControlledLaunchPair} from './check-inkwave-controlled-launch-pair.mjs';
import {installCanvasCapture} from './lib/inkwave-canvas-capture.mjs';
import {probeProjectileVisibility} from './lib/inkwave-projectile-repeat-probe.mjs';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function parkBootedGame(){
 const G=globalThis.NG,g=G?.game;
 if(!g?.menus||G.mode==='boot')throw Error('Cannot park an unbooted Game');
 g.debug.freeze();g._skipRender=true;
 return {mode:G.mode,frozen:g.frozen,skipRender:g._skipRender};
}
export function inspectBootProgress(){
 const G=globalThis.NG,g=G?.game;
 return {mode:G?.mode??null,gamePresent:!!g,menusPresent:!!g?.menus,frozen:g?.frozen??null,skipRender:g?._skipRender??null,actualMap:G?.level?.layout?.id??null,native:!!G?.level?.native,source:G?.level?.manifest?.sourceSha256??null,documentState:document.readyState,loadingText:document.body?.innerText?.slice(0,2000)??null};
}

export function verifyControlledSites({baselineSite,candidateSite,bindings,baselineSHA,candidateSHA}){
 assert.equal(baselineSHA,'55b4750aea5e45136a588fbd7242c106aff2323a');
 assert.equal(candidateSHA,'4318dca34dfb68443d7c962cacd905aa65d8202e');
 assert.equal(bindings.candidate?.tree,'52cdad1449199dd7d7a2b89ccbdb0b71afe302e3');
 const manifests={};
 for(const [variant,site,expected]of [['baseline',baselineSite,baselineSHA],['candidate',candidateSite,candidateSHA]]){
  const bytes=fs.readFileSync(path.join(site,'inkwave-build.json')),manifest=JSON.parse(bytes),binding=bindings[variant];
  assert.equal(binding.head,expected);assert.equal(binding.manifestSHA256,sha(bytes));assert.equal(binding.dirty,false);
  assert.ok(manifest.artifacts&&Object.keys(manifest.artifacts).length);
  for(const [relative,hash]of Object.entries(manifest.artifacts)){
   const file=path.resolve(site,relative);assert.ok(file.startsWith(path.resolve(site)+path.sep),'Artifact escapes site');assert.equal(sha(fs.readFileSync(file)),hash,'Emitted artifact mismatch '+relative);
  }
  manifests[variant]=manifest;
 }
 return manifests;
}
export async function runControlledDiagnostic(candidateSite,out,baselineSite){
 candidateSite=path.resolve(candidateSite);baselineSite=path.resolve(baselineSite);out=path.resolve(out);fs.mkdirSync(out,{recursive:true});
 const report={status:'incomplete',scope:'Separate frozen-build controlled input diagnostic; original natural failure remains independent',baselineSHA:process.env.BASELINE_SHA,candidateSHA:process.env.CANDIDATE_SHA,relay:'held-not-run',cases:[],errors:[]};
 const save=()=>fs.writeFileSync(path.join(out,'controlled-build-receipts.json'),JSON.stringify(report,null,2));
 const servers=[],contexts=[],pending=[];let browser;
 try{
  const bindings=JSON.parse(fs.readFileSync(process.env.STAGE_PAIR_BINDINGS));report.bindings=bindings;
  const manifests=verifyControlledSites({baselineSite,candidateSite,bindings,baselineSHA:report.baselineSHA,candidateSHA:report.candidateSHA});
  const {chromium}=await import('playwright');browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const pages={};
  const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
  for(const [variant,site]of [['baseline',baselineSite],['candidate',candidateSite]]){
   const row={variant,errors:[],loadedArtifacts:[],sourceDownloads:[],complete:false};report.cases.push(row);save();const manifest=manifests[variant];
   const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!file.startsWith(site+path.sep)||!fs.statSync(file).isFile())throw Error('Invalid path');res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});
   servers.push(server);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/';
   const context=await browser.newContext({viewport:{width:960,height:540},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-JP',serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'});contexts.push(context);
   await context.routeWebSocket('**/*',socket=>{row.errors.push('Unexpected WebSocket blocked by offline-only gate');socket.close();});
   const page=await context.newPage();pages[variant]=page;page.setDefaultTimeout(30000);page.on('pageerror',e=>row.errors.push(String(e)));
   await page.route('**/*',route=>{const task=verifyPairRequest(route,url,manifest,row).catch(async error=>{row.errors.push(String(error));await route.abort('failed').catch(()=>{});});pending.push(task);return task;});
   await page.addInitScript(initializePair);await page.goto(url+'?map=inkblot',{waitUntil:'domcontentloaded',timeout:90000});
   const served=await page.request.get(new URL('inkwave-build.json',url).href);assert.ok(served.ok());assert.deepEqual(await served.json(),manifest,'Served target changed');
   await page.evaluate(connectPair);
   row.phase='waiting-for-boot';save();
   try{await page.waitForFunction(pairBooted,null,{timeout:180000});}
   catch(error){row.bootProgress=await page.evaluate(inspectBootProgress).catch(e=>({inspectionError:String(e)}));throw error;}
   // Do not leave baseline's attract loop rendering while candidate converts
   // its native stage and initializes a second SwiftShader renderer.
   row.bootPark=await page.evaluate(parkBootedGame);row.phase='booted-parked';save();
  }
  // Independently capture the original natural frame-6 repeats. A controlled
  // aim mismatch must not prevent collecting the original visibility failure.
  for(const row of report.cases){
   const page=pages[row.variant];
   try{
    row.repeatConditions=await page.evaluate(preparePair,{mapId:'inkblot'});await page.evaluate(installCanvasCapture);
    row.naturalRepeats=await probeProjectileVisibility(page,path.join(out,'natural-repeats',row.variant),{casePlan:[{scenario:'original-stance',weapon:'shooter',frames:[1,2,3,6],resetFiringRandom:true,captureRepeats:true}]});
   }catch(error){row.repeatError=String(error?.stack||error);}
   save();
  }
  report.naturalRepeatCollectionComplete=report.cases.every(row=>!row.repeatError&&row.naturalRepeats?.complete===true);
  report.controlled=await collectControlledLaunchPair({baselinePage:pages.baseline,candidatePage:pages.candidate,out:path.join(out,'controlled-case')});
  await Promise.all(pending);
  for(const row of report.cases){
   const conditions=report.controlled.cases.find(c=>c.variant===row.variant)?.natural,manifest=manifests[row.variant];
   assert.equal(conditions?.actualMap,'inkblot');assert.equal(conditions.native,true);assert.equal(conditions.source,manifest.build.nativeStages.stages.find(s=>s.id==='inkblot').sourceSha256);
   assert.ok(conditions.baseURI.endsWith('/_versions/'+manifest.build.revision+'/'));assert.ok(row.sourceDownloads.length>0,'Pinned OBJ request not observed');assert.ok(row.loadedArtifacts.some(r=>r.path.endsWith('/src/game/inkCollision.js')),'Loaded collision module not verified');
   row.complete=row.errors.length===0;finalizePairCase(row);
  }
  report.status=report.naturalRepeatCollectionComplete&&report.controlled.status==='collected'&&report.cases.every(r=>r.complete)?'collected':'incomplete';
 }catch(error){report.errors.push(String(error?.stack||error));}
 finally{
  await Promise.allSettled(pending);
  for(const context of contexts)try{await context.close();}catch(error){report.errors.push('Context close: '+String(error));}
  await Promise.allSettled(pending);try{await browser?.close();}catch(error){report.errors.push('Browser close: '+String(error));}
  await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));
  for(const row of report.cases)finalizePairCase(row);
  if(report.errors.length||report.cases.length!==2||report.cases.some(r=>!r.complete))report.status='incomplete';save();
 }
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const r=await runControlledDiagnostic(process.argv[2],process.argv[3],process.argv[4]);if(r.status!=='collected')process.exitCode=1;}
