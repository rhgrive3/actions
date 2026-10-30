import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const [rootArg,siteArg,outArg,id]=process.argv.slice(2),root=path.resolve(rootArg),site=path.resolve(siteArg),out=path.resolve(outArg);
const PRODUCT='379533f541d86346a068e397f879cb6c13590ffd',QA=process.env.QA_SHA;
assert.match(QA||'',/^[a-f0-9]{40}$/);assert(!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});
const profiles={'phone-landscape':{width:844,height:390}};assert(profiles[id]);const device={id,viewport:profiles[id],isMobile:true,hasTouch:true,deviceScaleFactor:1};
const {chromium}=createRequire(path.join(root,'package.json'))('playwright');
const {launchSandboxBrowser}=await import(pathToFileURL(path.join(root,'scripts/lib/inkwave-sandbox-browser.mjs')));
assert(!process.env.CHROMIUM_EXECUTABLE_PATH);
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const [rel,sha] of Object.entries(build.artifacts)){const p=path.resolve(site,rel);assert(p.startsWith(site+path.sep));assert.equal(hash(fs.readFileSync(p)),sha,rel);}
const receipt={schema:1,productHead:PRODUCT,qaHead:QA,run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,device,buildContentHash:build.contentHash,realDevice:false,browser:'sandbox Chromium',images:[],failures:[],notes:['Targeted missing UI states only; fixed original product; JPEG quality80 without resize/crop/postprocessing','Bottom control screenshots do not constitute full intermediate catalogue coverage; prior captures retained','No UI-preview or network room creation in this supplement'],complete:false};
const MAX_LOG_BYTES=2621440,RESERVED_MANIFEST_BYTES=131072;let logBytes=0;
const recordLine=x=>'FRONTEND_TARGETED_V1 '+JSON.stringify(x)+'\n';
const emit=async x=>{const line=recordLine(x),bytes=Buffer.byteLength(line)+64;assert(logBytes+bytes<=MAX_LOG_BYTES,'hard transport log budget');logBytes+=bytes;if(!process.stdout.write(line))await new Promise(r=>process.stdout.once('drain',r));};
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://localhost');if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}

let p=path.resolve(site,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));assert(p.startsWith(site+path.sep));const b=fs.readFileSync(p);res.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:b);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
let browser,context,page,scope='native-route',seq=0;
const persist=()=>fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(receipt,null,2));
try{
 browser=await launchSandboxBrowser(chromium);context=await browser.newContext({viewport:device.viewport,screen:device.viewport,isMobile:device.isMobile,hasTouch:device.hasTouch,deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});
 await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort('blockedbyclient'));
 page=await context.newPage();page.on('pageerror',e=>receipt.failures.push({phase:'pageerror',error:e.message}));page.on('crash',()=>receipt.failures.push({phase:'crash'}));
 const waitScreen=async name=>{await page.waitForFunction(n=>{const m=window.__inkwave?.menus||window.menus,r=m?._scr?.el;return m?.current===n&&m._scr?.name===n&&r&&!r.inert&&!r.classList.contains('is-leaving')&&!m.wipe?.busy&&r.getBoundingClientRect().width>0&&Number(getComputedStyle(r).opacity)>.99;},name,{timeout:30000});await page.waitForTimeout(400);};
 const tap=async selector=>{const target=page.locator(selector).filter({visible:true}).first();await target.waitFor({state:'visible',timeout:15000});await target.scrollIntoViewIfNeeded();const handle=await target.elementHandle();try{await page.waitForFunction(e=>{if(!e||!e.isConnected||e.disabled||e.closest('[inert],.is-leaving'))return false;const r=e.getBoundingClientRect();if(!r.width||!r.height)return false;let opacity=1;for(let p=e;p;p=p.parentElement)opacity*=Number(getComputedStyle(p).opacity);return opacity>.6;},handle,{timeout:15000});}finally{await handle?.dispose();}await target.tap();await page.waitForTimeout(350);};

 const capture=async(name,meta={})=>{assert(++seq<=24,'targeted capture bound');const slug=String(name).replace(/[^a-z0-9_-]/gi,'-'),stem=String(seq).padStart(3,'0')+'-'+slug;
 await page.evaluate(()=>document.fonts.ready);assert(await page.locator('body').innerText().then(t=>t.trim().length>0),'blank frontend text');const viewport=page.viewportSize();assert.deepEqual(viewport,device.viewport);const active=await page.evaluate(()=>{const m=window.__inkwave?.menus||window.menus,r=m?._scr?.el,rect=r?.getBoundingClientRect();return {screen:m?.current,name:m?._scr?.name,connected:!!r?.isConnected,inert:!!r?.inert,opacity:r?Number(getComputedStyle(r).opacity):0,width:rect?.width||0,height:rect?.height||0,wipe:!!m?.wipe?.busy,gameMode:window.__G?.mode};});if(active.screen){assert(active.connected&&!active.inert&&active.opacity>.6&&active.width>0&&active.height>0&&!active.wipe,'active frontend not ready');assert.equal(active.screen,active.name);}else assert.equal(active.gameMode,'match');const readback=await page.evaluate(()=>({width:innerWidth,height:innerHeight,screenWidth:screen.width,screenHeight:screen.height,dpr:devicePixelRatio,touchPoints:navigator.maxTouchPoints,portrait:matchMedia('(orientation: portrait)').matches}));assert.equal(readback.width,viewport.width);assert.equal(readback.height,viewport.height);assert.equal(readback.screenWidth,viewport.width);assert.equal(readback.screenHeight,viewport.height);assert.equal(readback.dpr,1);assert(readback.touchPoints>0);assert.equal(readback.portrait,viewport.height>viewport.width);
 const jpeg=await page.screenshot({type:'jpeg',quality:80,animations:'disabled',timeout:60000});
 let jpegSize=null;for(let p=2;p<jpeg.length;){assert.equal(jpeg[p++],255);let marker=jpeg[p++];while(marker===255)marker=jpeg[p++];if(marker===217||marker===218)break;const length=jpeg.readUInt16BE(p);if([192,193,194].includes(marker)){jpegSize={height:jpeg.readUInt16BE(p+3),width:jpeg.readUInt16BE(p+5)};break;}assert(length>=2);p+=length;}assert.deepEqual(jpegSize,viewport);
 fs.writeFileSync(path.join(out,stem+'.jpg'),jpeg,{flag:'wx'});
 const item={index:seq,name,active,readback,scope:meta.scope||scope,screen:meta.screen||await page.evaluate(()=>(window.__inkwave?.menus||window.menus)?.current),notes:meta.notes||[],width:viewport.width,height:viewport.height,jpeg:{file:stem+'.jpg',bytes:jpeg.length,sha256:hash(jpeg),quality:80,nativeScreenshot:true,type:'jpeg',within180KiB:jpeg.length<=180*1024}};
 item.transport={inline:true,artifactOnly:false};
 const records=[{type:'image-meta',device:id,productHead:PRODUCT,qaHead:QA,run:receipt.run,...item}];
 const b64=jpeg.toString('base64'),chunks=Math.ceil(b64.length/12000);
 for(let i=0;i<chunks;i++)records.push({type:'chunk',device:id,index:seq,part:i,parts:chunks,base64:b64.slice(i*12000,(i+1)*12000)});
 records.push({type:'image-complete',device:id,index:seq,sha256:item.jpeg.sha256,parts:chunks});
 const transportBytes=records.reduce((n,x)=>n+Buffer.byteLength(recordLine(x))+64,0);
 item.transport={inline:jpeg.length<=180*1024&&logBytes+transportBytes+RESERVED_MANIFEST_BYTES<=MAX_LOG_BYTES,artifactOnly:false};item.transport.artifactOnly=!item.transport.inline;
 records[0].transport=item.transport;
 receipt.images.push(item);persist();
 if(item.transport.inline){for(const record of records)await emit(record);}else await emit({type:'artifact-only',device:id,index:seq,file:item.jpeg.file,sha256:item.jpeg.sha256,bytes:item.jpeg.bytes,reason:jpeg.length>180*1024?'image-size':'job-log-budget'});
 };
 const attempt=async(name,fn)=>{try{await fn();}catch(e){receipt.failures.push({phase:name,error:String(e.stack||e).slice(0,3000)});persist();await emit({type:'failure',device:id,phase:name,error:String(e.message)});}};
 const home=async()=>{scope='native-route';if(page.url().startsWith(origin+'/')&&!page.url().includes('/__menus')){for(let i=0;i<6;i++){const state=await page.evaluate(()=>({screen:window.__inkwave?.menus?.current,modal:!!document.querySelector('.iw-modal,.s3-stage-settings')}));if(state.screen==='main'&&!state.modal){await waitScreen('main');return;}if(state.modal)await page.keyboard.press('Escape');else if(await page.locator('.iw-backbtn:visible').count())await tap('.iw-backbtn:visible');else await page.keyboard.press('Escape');await page.waitForTimeout(250);}receipt.failures.push({phase:'home-navigation',error:'Native back did not reach main; explicit reload fallback used'});}await page.goto(origin+'/?news=0&skipTitle=1',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__inkwave?.debug&&window.__inkwave?.menus,null,{timeout:180000});await waitScreen('main');};

 const bottomPanes=async name=>{
  const states=await page.evaluate(()=>{const root=window.__inkwave.menus._scr.el;return [root,...root.querySelectorAll('main,section,div')].filter(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&e.clientHeight>100&&e.scrollHeight>e.clientHeight+30&&/auto|scroll/.test(getComputedStyle(e).overflowY)).map((e,j)=>{e.dataset.qaTargetBottom=String(j);return {j,height:e.clientHeight,total:e.scrollHeight};});});
  for(const state of states){const loc=page.locator('[data-qa-target-bottom="'+state.j+'"]');const pos=await loc.evaluate(e=>{const before=e.scrollTop;e.scrollTop=e.scrollHeight-e.clientHeight;return {before,after:e.scrollTop,height:e.clientHeight,total:e.scrollHeight,bottom:e.scrollTop+e.clientHeight>=e.scrollHeight-1};});assert(pos.bottom);await capture(name+'-pane'+state.j+'-bottom',{scope:'native-bottom-controls',notes:{position:pos,coverage:'Only bottom controls. Intermediate card-list pages are deliberately not claimed complete.'}});await loc.evaluate(e=>e.scrollTop=0);}
 };
 // Only remaining states; no all-screen sweep and no online room mutations.
 for(const mode of ['rainmaker','clams'])await attempt('target-setup-'+mode,async()=>{
  await home();await tap('.iw-main [data-id="play"]');await waitScreen('mode');await tap('[data-id="mode-'+mode+'"]');await waitScreen('setup');
  if(mode==='clams')await capture('setup-clams');
  await bottomPanes('setup-'+mode);
  await tap('[data-id="match-options"]');await page.locator('.s3-stage-settings').waitFor({state:'visible'});await capture('setup-'+mode+'-options');
 });
 await attempt('target-loadout-bottom',async()=>{await home();await tap('.iw-main [data-id="loadout"]');await waitScreen('loadout');await bottomPanes('loadout');});
 await attempt('target-practice',async()=>{
  await home();await tap('.iw-main [data-id="play"]');await waitScreen('mode');await tap('[data-id="mode-range"]');
  await page.waitForFunction(()=>window.__G?.mode==='match'&&window.__inkwave?.match&&!window.__inkwave.match.attract&&window.__G.match?.range,null,{timeout:45000});
  await capture('practice-live',{scope:'actual-game',notes:['Actual offline practice; any rotation overlay is preserved']});
  await page.evaluate(()=>window.__inkwave.pause());await page.locator('.iwr-pausescr').waitFor({state:'visible',timeout:15000});
  await capture('practice-pause',{scope:'actual-game-api-pause'});
  for(const tab of ['tools','travel','weapon']){await tap('[data-id="r-tab-'+tab+'"]');await capture('practice-pause-'+tab,{scope:'actual-game-api-pause'});}
  await tap('[data-id="quit"]');await page.locator('.iw-modal').waitFor({state:'visible'});await capture('practice-leave-confirm',{scope:'actual-game-api-pause',notes:['Confirmation not accepted']});
 });
 const required=['setup-rainmaker-options','setup-clams','setup-clams-options','practice-live','practice-pause','practice-pause-tools','practice-pause-travel','practice-pause-weapon','practice-leave-confirm'];
 for(const name of required)if(!receipt.images.some(x=>x.name===name))receipt.failures.push({phase:'target-coverage',screen:name,error:'Required targeted state missing'});
 receipt.required=required;receipt.transport={maxLogBytes:MAX_LOG_BYTES,rawImageProcessing:'none',artifactRetainsAllOriginals:true};persist();
} catch(e){receipt.failures.push({phase:'fatal',error:String(e.stack||e)});persist();await emit({type:'failure',device:id,error:String(e.stack||e)});}
finally{await browser?.close().catch(e=>receipt.failures.push({phase:'cleanup',error:e.message}));await new Promise(r=>server.close(r));receipt.complete=receipt.failures.length===0;persist();assert(Buffer.byteLength(recordLine({type:'manifest',...receipt}))+64<=RESERVED_MANIFEST_BYTES,'manifest reserve');await emit({type:'manifest',...receipt});}
if(!receipt.complete)process.exitCode=1;
