#!/usr/bin/env node
// Four-case diagnostic; never an adoption or physical-iPad verdict.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {probeProjectileVisibility} from './lib/inkwave-projectile-visibility-probe.mjs';
import {installCanvasCapture} from './lib/inkwave-canvas-capture.mjs';
export function initializePair(){
 localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false,musicVolume:0}));
 let s=0x12345678;Math.random=()=>{s|=0;s=s+0x6d2b79f5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
}
export async function connectPair(){globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;globalThis.T=await import(new URL('vendor/three/build/three.module.js',document.baseURI));}
export function pairBooted(){return !!(NG.game?.menus&&NG.mode!=='boot');}
export async function preparePair({mapId}){
 const G=NG,g=G.game;g.debug.freeze();g._skipRender=true;g.menus.wipe.cancel();
 g._setSettings({quality:'low',shadows:false,bloom:false});await g.startMatch({mapId,mode:'turf',difficulty:'normal',time:'day'});
 g.debug.freeze();g.debug.freezeBots();g._skipRender=true;g.debug.fire(false);
 for(let i=0;i<240;i++)g._frame(1/60);G.paint.flush(1/60);
 const gl=G.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
 return {baseURI:document.baseURI,mapId,actualMap:G.level.layout.id,native:!!G.level.native,source:G.level.manifest?.sourceSha256??null,quality:g.settings.quality,mobile:g.mobile,userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight,devicePixelRatio],canvas:[G.renderer.domElement.width,G.renderer.domElement.height],renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),actor:G.local.pos.toArray(),camera:{position:G.camera.position.toArray(),quaternion:G.camera.quaternion.toArray(),projection:G.camera.projectionMatrix.toArray(),near:G.camera.near,far:G.camera.far},rig:{yaw:g.rig.yaw,pitch:g.rig.pitch},time:G.time};
}
export function validatePairInputs(baseline,fixed){
 assert.equal(baseline.inputHash,'79c46b321b3b348e2820a64de719596b503457747209d416723c10da0c361555','Baseline source inputs changed');
 assert.equal(baseline.contentHash,'326a305b410f2bb76a02b2e874af8d5559f04c6f9512b19ac11c1353ac4819f1','Baseline public bytes changed');
 const allowed=['native-stages/adapter.mjs','native-stages/runtime/engine.mjs','native-stages/runtime/triangle-world.mjs','native-stages/runtime/native-projectile-sweep.mjs'];
 const changed=[...new Set([...Object.keys(baseline.files),...Object.keys(fixed.files)])].filter(k=>baseline.files[k]!==fixed.files[k]);
 assert.deepEqual(changed.sort(),allowed.sort(),'Only four reviewed collision inputs may differ');
 const expected={"native-stages/adapter.mjs": "1b1ded97ea9aa6abc4135a6d4ed6f4693fe01e9e21dea0a12683091c43289e00", "native-stages/runtime/engine.mjs": "dc1b9a66472d23784d979977d4c96b6d0d1c7c149c9be7efdb6e5ded7b3801fd", "native-stages/runtime/triangle-world.mjs": "c9bcc78a5d9802983c3e735c1994253fed85e196b33b2d371d6c32620bd5feb5", "native-stages/runtime/native-projectile-sweep.mjs": "80e5bb9e8648d851d0ee1f070ab29b8cc1999bc02de9025e54e597ab5480ed32"};for(const[k,h]of Object.entries(expected))assert.equal(fixed.files[k],h,'Unreviewed collision input '+k);return changed;
}
export function finalizePairCase(row){if(row.errors.length||row.loadedArtifacts.some(r=>!r.match))row.complete=false;return row.complete;}
export async function runPair(candidateSite,out,baselineURL='https://rhgrive3.github.io/actions/'){
 const {chromium}=await import('playwright');fs.mkdirSync(out,{recursive:true});
 const report={status:'running',scope:'Current public source b3e8312c plus collision-only comparison; Chromium iPad-like emulation is not physical Safari. Asset revision is a build content identity, not a Git source commit.',sourceBaseline:'b3e8312c9ab4be773561ff8c28ff3423271593b5',cases:[],errors:[],visibilityEstablished:false};
 const save=()=>fs.writeFileSync(path.join(out,'projectile-pair.json'),JSON.stringify(report,null,2));save();
 const response=await fetch(new URL('inkwave-build.json',baselineURL));assert.ok(response.ok);const baselineBytes=Buffer.from(await response.arrayBuffer());assert.equal(crypto.createHash('sha256').update(baselineBytes).digest('hex'),'78b852e50d358ec27bb0f9a39e1a8090274a511dd1788f63e13eb7ec8d4dead7','Exact public manifest changed');const baseline=JSON.parse(baselineBytes),fixed=JSON.parse(fs.readFileSync(path.join(candidateSite,'inkwave-build.json')));
 report.changedInputs=validatePairInputs(baseline,fixed);report.baseline={contentHash:baseline.contentHash,inputHash:baseline.inputHash,assetRevision:baseline.build.revision};report.fixed={contentHash:fixed.contentHash,inputHash:fixed.inputHash,assetRevision:fixed.build.revision};
 fs.writeFileSync(path.join(out,'baseline-build.json'),JSON.stringify(baseline,null,2));fs.writeFileSync(path.join(out,'fixed-build.json'),JSON.stringify(fixed,null,2));
 for(const[p,expected]of Object.entries(fixed.artifacts))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(candidateSite,p))).digest('hex'),expected,'Candidate emitted artifact mismatch '+p);
 const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
 const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://local'),file=path.resolve(candidateSite,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!file.startsWith(candidateSite+'/')||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const variant of ['baseline','fixed'])for(const mapId of ['inkblot','tidewater']){
   const row={variant,mapId,errors:[],loadedArtifacts:[]};report.cases.push(row);save();let context;const pendingResponses=[];
   try{
    const manifest=variant==='baseline'?baseline:fixed,url=variant==='baseline'?baselineURL:'http://127.0.0.1:'+server.address().port+'/';
    context=await browser.newContext({viewport:{width:960,height:540},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-JP',serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'});
    const page=await context.newPage();page.on('response',response=>{const responseURL=new URL(response.url()),base=new URL(url);if(responseURL.origin!==base.origin||!responseURL.pathname.startsWith(base.pathname))return;const relative=responseURL.pathname.slice(base.pathname.length)||'index.html';const expected=manifest.artifacts[relative];if(!expected){if(/\.(?:m?js|css)$/.test(relative))row.errors.push('Unmanifested module '+relative);return;}pendingResponses.push((async()=>{try{assert.ok(response.ok(),'Loaded artifact HTTP failure '+relative);const bytes=await response.body(),actual=crypto.createHash('sha256').update(bytes).digest('hex');row.loadedArtifacts.push({path:relative,bytes:bytes.length,sha256:actual,expected,match:actual===expected});if(actual!==expected)row.errors.push('Loaded artifact hash mismatch '+relative);}catch(error){row.errors.push(String(error));}})());});page.on('pageerror',e=>row.errors.push(String(e)));page.setDefaultTimeout(30000);
    await page.addInitScript(initializePair);await page.goto(url+'?map='+mapId,{waitUntil:'domcontentloaded',timeout:90000});
    const served=await page.request.get(new URL('inkwave-build.json',url).href);assert.ok(served.ok());assert.deepEqual(await served.json(),manifest,'Served target changed');
    await page.evaluate(connectPair);await page.waitForFunction(pairBooted,null,{timeout:180000});await page.evaluate(installCanvasCapture);
    row.conditions=await page.evaluate(preparePair,{mapId});assert.equal(row.conditions.actualMap,mapId,'Requested stage was not installed');assert.equal(row.conditions.native,mapId==='inkblot');if(mapId==='inkblot')assert.equal(row.conditions.source,manifest.build.nativeStages.stages.find(s=>s.id===mapId).sourceSha256,'Native source identity changed');assert.ok(row.conditions.baseURI.endsWith('/_versions/'+manifest.build.revision+'/'),'HTML asset revision changed');
    row.projectiles=await probeProjectileVisibility(page,path.join(out,variant+'-'+mapId),{casePlan:[{scenario:'original-stance',weapon:'shooter',frames:[1,2,3,6]}]});
    assert.equal(row.projectiles.complete,true,'Native temporal collection incomplete');await Promise.all(pendingResponses);assert.ok(row.loadedArtifacts.some(r=>r.path.endsWith('/src/game/inkCollision.js')),'Actual collision module response not verified');assert.equal(row.errors.length,0,'Browser runtime or artifact error');row.complete=true;
   }catch(e){row.error=String(e?.stack||e);row.complete=false;}finally{await Promise.all(pendingResponses);try{await context?.close();}catch(error){row.errors.push('Context close: '+String(error));}await Promise.all(pendingResponses);finalizePairCase(row);save();}
  }
  report.matchedConditions=['inkblot','tidewater'].map(mapId=>{const a=report.cases.find(r=>r.mapId===mapId&&r.variant==='baseline'),b=report.cases.find(r=>r.mapId===mapId&&r.variant==='fixed');const fields=['actualMap','native','source','actor','camera','rig','time','quality','canvas'];return {mapId,matched:!!a?.conditions&&!!b?.conditions&&fields.every(k=>JSON.stringify(a.conditions[k])===JSON.stringify(b.conditions[k])),fields};});
  report.status=report.cases.length===4&&report.cases.every(r=>r.complete)&&report.matchedConditions.every(r=>r.matched)?'collected':'incomplete';
 }finally{await browser?.close();await new Promise(r=>server.close(r));save();}
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const report=await runPair(path.resolve(process.argv[2]),path.resolve(process.argv[3]),process.argv[4]);if(report.status!=='collected')process.exitCode=1;}
