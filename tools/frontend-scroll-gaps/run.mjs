import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const [rootArg,siteArg,outArg,id,batch]=process.argv.slice(2),root=path.resolve(rootArg),site=path.resolve(siteArg),out=path.resolve(outArg);
const PRODUCT='379533f541d86346a068e397f879cb6c13590ffd',QA=process.env.QA_SHA;
assert.match(QA||'',/^[a-f0-9]{40}$/);assert(!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});
const profiles={'phone-landscape':{width:844,height:390},'phone-portrait':{width:390,height:844}};assert(['loadout','setup'].includes(batch));assert(batch!=='setup'||id==='phone-landscape');assert(profiles[id]);const device={id,viewport:profiles[id],isMobile:true,hasTouch:true,deviceScaleFactor:1};
const {chromium}=createRequire(path.join(root,'package.json'))('playwright');
const {launchSandboxBrowser}=await import(pathToFileURL(path.join(root,'scripts/lib/inkwave-sandbox-browser.mjs')));
assert(!process.env.CHROMIUM_EXECUTABLE_PATH);
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const [rel,sha] of Object.entries(build.artifacts)){const p=path.resolve(site,rel);assert(p.startsWith(site+path.sep));assert.equal(hash(fs.readFileSync(p)),sha,rel);}
const receipt={schema:1,productHead:PRODUCT,qaHead:QA,run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,device,buildContentHash:build.contentHash,realDevice:false,browser:'sandbox Chromium',images:[],failures:[],notes:['Targeted missing UI states only; fixed original product; JPEG quality80 without resize/crop/postprocessing','Gap-only continuation using prior step coverage plus separately recorded bottom captures; prior captures retained','No UI-preview or network room creation in this supplement'],complete:false};
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

 const capture=async(name,meta={})=>{assert(++seq<=64,'gap capture bound');const slug=String(name).replace(/[^a-z0-9_-]/gi,'-'),stem=String(seq).padStart(3,'0')+'-'+slug;
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

 const coverage=[];
 const fillGap=async(name,pane,completedSteps,hasBottom,fresh=false)=>{
  await page.evaluate(()=>document.fonts.ready);
  const panes=await page.evaluate(()=>{const root=window.__inkwave.menus._scr.el;return [root,...root.querySelectorAll('main,section,div')].filter(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&e.clientHeight>100&&e.scrollHeight>e.clientHeight+30&&/auto|scroll/.test(getComputedStyle(e).overflowY)).map((e,j)=>{e.dataset.qaGap=String(j);return {j,height:e.clientHeight,total:e.scrollHeight};});});
  assert(panes[pane],name+' missing pane');const loc=page.locator('[data-qa-gap="'+pane+'"]');
  assert(await loc.evaluate((e,isLoadout)=>isLoadout?e.matches('.iw-wgrid'):!!(e.matches('.iw-ss__list')||e.querySelector('.iw-ss__list')),batch==='loadout'),'unexpected scroll pane identity');
  // Position ancestors before stabilization too: scroll-dependent layout may change.
  await loc.evaluate(e=>e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
  // Fonts must settle BEFORE using geometry as evidence, not only inside capture().
  let stable=0,lastGeometry='',geometry;
  for(let sample=0;sample<30&&stable<4;sample++){
   await page.waitForTimeout(200);geometry=await loc.evaluate(e=>({height:e.clientHeight,total:e.scrollHeight,width:e.clientWidth}));
   const key=JSON.stringify(geometry);stable=key===lastGeometry?stable+1:0;lastGeometry=key;
  }
  assert(stable>=4,'catalogue geometry did not stabilize');
  if(id==='phone-portrait'&&batch==='loadout'&&(geometry.total!==7750||geometry.height!==540)){fresh=true;completedSteps=0;hasBottom=false;receipt.geometryFallback={reason:'settled geometry differs from prior capture',prior:{height:540,total:7750},current:geometry};}
  // Match the original sweep's 85% steps without recapturing completed images.
  await loc.evaluate(e=>e.scrollTop=0);
  for(let n=0;n<completedSteps;n++)await loc.evaluate(e=>{e.scrollTop=Math.min(e.scrollHeight-e.clientHeight,e.scrollTop+e.clientHeight*.85);});
  const baseline=await loc.evaluate(e=>({top:e.scrollTop,height:e.clientHeight,total:e.scrollHeight}));
  const targetEnd=hasBottom?baseline.total-baseline.height:baseline.total;
  const conservativeCount=Math.ceil((baseline.total-baseline.top)/(baseline.height*.85))+1;assert(conservativeCount<=40&&seq+conservativeCount<=64,'preflight gap count exceeds budget');
  let coveredEnd=fresh?0:baseline.top+baseline.height;const positions=[];
  while(coveredEnd<targetEnd-1){
   assert(positions.length<40,'per-pane gap limit');
   const first=fresh&&positions.length===0;
   const pos=await loc.evaluate((e,first)=>{const before=e.scrollTop;if(!first)e.scrollTop=Math.min(e.scrollHeight-e.clientHeight,e.scrollTop+e.clientHeight*.85);return {before,after:e.scrollTop,height:e.clientHeight,total:e.scrollHeight};},first);
   assert(first||pos.after>pos.before+1,'gap scroll stalled');assert.equal(pos.height,baseline.height);assert.equal(pos.total,baseline.total);
   // Scroll ancestors only, not this catalogue, so its full client area is visible.
   await loc.evaluate(e=>e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
   const visible=await loc.evaluate(e=>{const r=e.getBoundingClientRect();let top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom),left=Math.max(0,r.left),right=Math.min(innerWidth,r.right);for(let p=e.parentElement;p;p=p.parentElement){if(/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowY)){const q=p.getBoundingClientRect();top=Math.max(top,q.top);bottom=Math.min(bottom,q.bottom);}if(/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowX)){const q=p.getBoundingClientRect();left=Math.max(left,q.left);right=Math.min(right,q.right);}}return {top,bottom,height:bottom-top,left,right,width:right-left,clientWidth:e.clientWidth,scrollTop:e.scrollTop};});
   assert.equal(visible.scrollTop,pos.after,'ancestor positioning changed pane');assert(visible.height>=pos.height-2&&visible.width>=visible.clientWidth-2,'catalogue clipped by viewport');
   assert(pos.after<=coveredEnd+1,'coverage gap between new captures');
   await capture(name+'-gap-pane'+pane+'-step'+(completedSteps+positions.length+1),{scope:'native-scroll-gap',notes:{position:pos,visible,priorCompletedSteps:completedSteps,priorBottom:hasBottom}});
   const afterCapture=await loc.evaluate(e=>({height:e.clientHeight,total:e.scrollHeight,top:e.scrollTop}));assert.deepEqual(afterCapture,{height:baseline.height,total:baseline.total,top:pos.after},'geometry changed during screenshot');
   coveredEnd=pos.after+pos.height;positions.push(pos);
  }
  assert(coveredEnd>=targetEnd-1,'gap coverage incomplete');coverage.push({name,pane,baseline,targetEnd,coveredEnd,priorBottom:hasBottom,fresh,positions});
 };
 if(batch==='loadout')await attempt('loadout-scroll-gap',async()=>{
  await home();await tap('.iw-main [data-id="loadout"]');await waitScreen('loadout');
  const filters=await page.locator('.s3-wfilter__tab[data-cat]').evaluateAll(es=>es.map(e=>({category:e.dataset.cat,selected:e.classList.contains('is-sel')||e.getAttribute('aria-selected')==='true'})));
  assert(filters[0]?.selected,'default catalogue is not first All tab');
  const before=await page.locator('.iw-wgrid').innerText();await page.locator('.s3-wfilter__tab[data-cat]').first().tap();await page.waitForTimeout(300);assert.equal(await page.locator('.iw-wgrid').innerText(),before,'All tab differs from default');
  await fillGap('loadout-all',1,id==='phone-landscape'?0:8,false,id==='phone-landscape');
  receipt.equivalentStates=['loadout','loadout-tab-0'];
 });
 if(batch==='setup')for(const mode of ['turf','boss','zones','tower','rainmaker','clams'])await attempt('setup-'+mode+'-scroll-gap',async()=>{
  await home();await tap('.iw-main [data-id="play"]');await waitScreen('mode');await tap('[data-id="mode-'+mode+'"]');await waitScreen('setup');
  await fillGap('setup-'+mode,0,mode==='clams'?0:mode==='rainmaker'?1:8,['rainmaker','clams'].includes(mode));
 });
 const required=batch==='loadout'?['loadout-all']:['turf','boss','zones','tower','rainmaker','clams'].map(m=>'setup-'+m);
 for(const name of required)if(!coverage.some(x=>x.name===name))receipt.failures.push({phase:'gap-coverage',screen:name,error:'Required gap not verified'});
 receipt.gapCoverage=coverage;receipt.batch=batch;
 receipt.required=required;receipt.transport={maxLogBytes:MAX_LOG_BYTES,rawImageProcessing:'none',artifactRetainsAllOriginals:true};persist();
} catch(e){receipt.failures.push({phase:'fatal',error:String(e.stack||e)});persist();await emit({type:'failure',device:id,error:String(e.stack||e)});}
finally{await browser?.close().catch(e=>receipt.failures.push({phase:'cleanup',error:e.message}));await new Promise(r=>server.close(r));receipt.complete=receipt.failures.length===0;persist();assert(Buffer.byteLength(recordLine({type:'manifest',...receipt}))+64<=RESERVED_MANIFEST_BYTES,'manifest reserve');await emit({type:'manifest',...receipt});}
if(!receipt.complete)process.exitCode=1;
