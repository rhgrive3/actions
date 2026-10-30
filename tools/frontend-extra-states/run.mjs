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
const profiles={'phone-landscape':{width:844,height:390},'phone-portrait':{width:390,height:844},'ipad-mini-portrait':{width:744,height:1133},'ipad-mini-landscape':{width:1133,height:744}};assert(['editor','variants','battle','error-bottom'].includes(batch));assert(profiles[id]);assert(batch!=='battle'||id.endsWith('landscape'));const device={id,viewport:profiles[id],isMobile:true,hasTouch:true,deviceScaleFactor:1};
const {chromium}=createRequire(path.join(root,'package.json'))('playwright');
const {launchSandboxBrowser}=await import(pathToFileURL(path.join(root,'scripts/lib/inkwave-sandbox-browser.mjs')));
assert(!process.env.CHROMIUM_EXECUTABLE_PATH);
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const [rel,sha] of Object.entries(build.artifacts)){const p=path.resolve(site,rel);assert(p.startsWith(site+path.sep));assert.equal(hash(fs.readFileSync(p)),sha,rel);}
const receipt={schema:1,productHead:PRODUCT,qaHead:QA,run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,device,buildContentHash:build.contentHash,realDevice:false,browser:'sandbox Chromium',images:[],failures:[],notes:['Targeted omitted UI only; original JPEG quality80 without modification','Offline fixture variants are synthetic and never evidence of real room or match outcomes','Only loopback GET/HEAD HTTP permitted; no external HTTP/WebSocket; fresh disposable context'],complete:false};
const MAX_LOG_BYTES=2621440,RESERVED_MANIFEST_BYTES=131072;let logBytes=0;
const recordLine=x=>'FRONTEND_TARGETED_V1 '+JSON.stringify(x)+'\n';
const emit=async x=>{const line=recordLine(x),bytes=Buffer.byteLength(line)+64;assert(logBytes+bytes<=MAX_LOG_BYTES,'hard transport log budget');logBytes+=bytes;if(!process.stdout.write(line))await new Promise(r=>process.stdout.once('drain',r));};
const original=fs.readFileSync(path.join(root,'scripts/check-inkwave-mobile-menus.mjs'),'utf8');
const begin=original.indexOf('const html = `')+14,end=original.indexOf('`;\nconst cases',begin);assert(begin>=14&&end>begin);const fixtureHTML=original.slice(begin,end);assert(!fixtureHTML.includes('${'));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://localhost');if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}

if(u.pathname==='/__menus'){res.writeHead(200,{'content-type':'text/html'});return res.end(fixtureHTML);}
let p=path.resolve(site,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));assert(p.startsWith(site+path.sep));const b=fs.readFileSync(p);res.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:b);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
let browser,context,page,scope='native-route',seq=0;
const persist=()=>fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(receipt,null,2));
try{
 browser=await launchSandboxBrowser(chromium);context=await browser.newContext({viewport:device.viewport,screen:device.viewport,isMobile:device.isMobile,hasTouch:device.hasTouch,deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});
 await context.route('**/*',r=>r.request().url().startsWith(origin+'/')&&['GET','HEAD'].includes(r.request().method())?r.continue():r.abort('blockedbyclient'));
 await context.addInitScript(()=>{window.WebSocket=class{constructor(){throw Error('WebSocket disabled for offline screenshot QA');}};});
 page=await context.newPage();receipt.console=[];page.on('console',m=>{if(['error','warning'].includes(m.type())&&receipt.console.length<30)receipt.console.push({type:m.type(),text:m.text().slice(0,1200)});});page.on('pageerror',e=>receipt.failures.push({phase:'pageerror',error:e.message}));page.on('crash',()=>receipt.failures.push({phase:'crash'}));
 const waitScreen=async name=>{await page.waitForFunction(n=>{const m=window.__inkwave?.menus||window.menus,r=m?._scr?.el;return m?.current===n&&m._scr?.name===n&&r&&!r.inert&&!r.classList.contains('is-leaving')&&!m.wipe?.busy&&r.getBoundingClientRect().width>0&&Number(getComputedStyle(r).opacity)>.99;},name,{timeout:30000});await page.waitForTimeout(400);};
 const tap=async selector=>{const target=page.locator(selector).filter({visible:true}).first();await target.waitFor({state:'visible',timeout:15000});await target.scrollIntoViewIfNeeded();const handle=await target.elementHandle();try{await page.waitForFunction(e=>{if(!e||!e.isConnected||e.disabled||e.closest('[inert],.is-leaving'))return false;const r=e.getBoundingClientRect();if(!r.width||!r.height)return false;let opacity=1;for(let p=e;p;p=p.parentElement)opacity*=Number(getComputedStyle(p).opacity);return opacity>.6;},handle,{timeout:15000});}finally{await handle?.dispose();}await target.tap();await page.waitForTimeout(350);};

 const capture=async(name,meta={})=>{assert(++seq<=40,'extra-state capture bound');const slug=String(name).replace(/[^a-z0-9_-]/gi,'-'),stem=String(seq).padStart(3,'0')+'-'+slug;
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
 const attempt=async(name,fn)=>{try{await fn();}catch(e){receipt.lastFailureState=await page.evaluate(()=>{const g=window.__inkwave,m=g?.menus;return {mode:window.__G?.mode,screen:m?.current,starting:m?._starting,setup:m?._setup,match:g?.match?{state:g.match.state,attract:g.match.attract,time:g.match.time,duration:g.match.duration}:null,audioState:window.__G?.audio?.ctx?.state,map:g?.mapDef?{id:g.mapDef.id,layout:g.mapDef.layout}:null,lastMatchOpts:g?.lastMatchOpts,toasts:[...document.querySelectorAll('.iw-toast')].map(e=>e.textContent)};}).catch(()=>null);receipt.failures.push({phase:name,error:String(e.stack||e).slice(0,3000)});persist();await emit({type:'failure',device:id,phase:name,error:String(e.message)});}};
 const home=async()=>{scope='native-route';if(page.url().startsWith(origin+'/')&&!page.url().includes('/__menus')){for(let i=0;i<6;i++){const state=await page.evaluate(()=>({screen:window.__inkwave?.menus?.current,modal:!!document.querySelector('.iw-modal,.s3-stage-settings')}));if(state.screen==='main'&&!state.modal){await waitScreen('main');return;}if(state.modal)await page.keyboard.press('Escape');else if(await page.locator('.iw-backbtn:visible').count())await tap('.iw-backbtn:visible');else await page.keyboard.press('Escape');await page.waitForTimeout(250);}receipt.failures.push({phase:'home-navigation',error:'Native back did not reach main; explicit reload fallback used'});}await page.goto(origin+'/?news=0&skipTitle=1',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__inkwave?.debug&&window.__inkwave?.menus,null,{timeout:180000});await waitScreen('main');};


 const required=[];
 const snap=async(name,meta)=>{required.push(name);await capture(name,meta);};
 const fixture=async()=>{
  await page.goto(origin+'/__menus?netmock=1&mockauto=0&mocklat=0&news=0',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.menuReady);scope='UI-preview';
  await page.evaluate(()=>{if(!window.G.net?.isMock)throw Error('Expected repository offline MockNet');window.G.net.create=async()=>{throw Error('Room creation excluded');};});
 };
 const show=async name=>{await page.evaluate(n=>{menus.wipe.cancel();menus.show(n,{wipe:false,light:false,force:true});},name);await waitScreen(name);};
 if(batch==='editor')await attempt('touch-layout-editor',async()=>{
  await home();await tap('.iw-main [data-id="settings"]');await waitScreen('settings');await tap('.iw-settings [data-id="tab-touch"]');
  const before=await page.evaluate(()=>JSON.stringify(window.__inkwave.input.mobile.layout));
  await tap('[data-id="set-_layout"]');await page.waitForFunction(()=>window.__inkwave.input.mobile.editing);await page.locator('.iwm-edit').waitFor({state:'visible'});
  await snap('touch-layout-editor',{scope:'native-route',notes:['Opened actual settings link; default fire selection; product touch-layout adapter active']});
  await page.locator('#iwm-layout-control').selectOption('stick');assert.equal(await page.evaluate(()=>window.__inkwave.input.mobile._sel),'stick');
  await snap('touch-layout-stick-selection',{scope:'native-route',notes:['Native control selector; no layout values changed']});
  await tap('details.iwm-layout-position summary');assert.equal(await page.locator('details.iwm-layout-position').evaluate(e=>e.open),true);await snap('touch-layout-position-details',{scope:'native-route',notes:['Expanded X and Y controls; positions unchanged']});
  assert.equal(await page.locator('details.iwm-layout-position[open] [data-axis]').filter({visible:true}).count(),2);
  await page.evaluate(()=>{window.__qaStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='inkwave.touchLayout')throw new DOMException('QA simulated storage unavailable','QuotaExceededError');return window.__qaStorageSet.call(this,key,value);};});
  try{await tap('[data-e="save"]');await page.waitForFunction(()=>document.querySelector('.iwm-layout-error')?.textContent.trim());assert.equal(await page.evaluate(()=>window.__inkwave.input.mobile.editing),true);await snap('touch-layout-storage-error',{scope:'actual-app-fault-fixture',notes:['Synthetic storage failure limited to inkwave.touchLayout in disposable context; actual product error renderer; no setting saved']});}finally{await page.evaluate(()=>{Storage.prototype.setItem=window.__qaStorageSet;delete window.__qaStorageSet;});}
  await tap('[data-e="cancel"]');assert.equal(await page.evaluate(()=>JSON.stringify(window.__inkwave.input.mobile.layout)),before,'cancel restored layout');assert.equal(await page.evaluate(()=>window.__inkwave.input.mobile.editing),false);
  const reset=page.locator('.iw-settings [data-id="reset"]');await reset.scrollIntoViewIfNeeded();await reset.tap();await page.waitForFunction(()=>document.querySelector('.iw-settings [data-id="reset"]')?.classList.contains('is-armed'));
  await snap('settings-reset-confirmation',{scope:'native-route',notes:['First press only; reset was NOT confirmed']});
 });
 if(batch==='variants'){
  await attempt('online-entry-and-errors',async()=>{
   const errors=['Room not found','Room is full','Match in progress','Could not connect','Room code taken','Lost connection to the room'];
   for(let n=0;n<errors.length;n++){
    await fixture();await show('online');
    await page.evaluate(({message,hold})=>{G.net.join=()=>new Promise((resolve,reject)=>{if(hold)window.__qaRejectJoin=()=>reject(Error(message));else reject(Error(message));});},{message:errors[n],hold:n===0});
    await tap('[data-id="join"]');await page.locator('.iw-code-input').fill('BCEFG');
    if(n===0)await snap('preview-online-code-entry',{scope:'UI-preview',notes:['Offline repository fixture; inert sample code; no network request']});
    await tap('.iw-join__btns .is-go');
    if(n===0){await page.waitForFunction(()=>document.querySelector('.iw-online')?.classList.contains('is-connecting')||document.querySelector('.iw-hub')?.classList.contains('is-connecting')||document.querySelector('.is-connecting'));await snap('preview-online-connecting',{scope:'UI-preview',notes:['Local delayed Promise only, not a real connection']});}
    if(n===0)await page.evaluate(()=>window.__qaRejectJoin());
    await page.locator('.iw-jstat.is-on').waitFor({state:'visible'});await snap('preview-online-error-'+n,{scope:'UI-preview',notes:['Synthetic local rejected API result: '+errors[n]+'; no real room create/join']});
   }
  });
  for(const mode of ['turf','boss','zones','tower','rainmaker','clams'])await attempt('results-loss-'+mode,async()=>{
   await fixture();await page.evaluate(mode=>{const d=menus._demoResults();d.mode=mode;d.win=false;d.percents=[32,61];if(mode==='boss'){d.boss={defeated:false,time:180,hpLeft:.45,phase:2};d.players=d.players.map((p,i)=>({...p,team:0,damage:3000-i*240,weakHits:5+i}));}else if(mode!=='turf'){d.counts=[60,15];d.penalties=[0,12];d.knockout=false;d.winner=1;}menus._results=d;},mode);
   await show('results');await tap('.iw-res__title');await page.waitForFunction(()=>menus._scr.el.classList.contains('is-done'));await snap('preview-results-loss-'+mode,{scope:'UI-preview',notes:['Synthetic losing result; no actual match outcome']});
  });
  for(const host of [false,true])await attempt('online-results-'+(host?'host':'guest'),async()=>{
   await fixture();await page.evaluate(host=>{G.net.myId='qa-self';G.net.hostId=host?'qa-self':'qa-other';menus.api.netBackToLobby=()=>{};const d=menus._demoResults();d.online=true;menus._results=d;},host);
   await show('results');await tap('.iw-res__title');await page.waitForFunction(()=>menus._scr.el.classList.contains('is-done'));await snap('preview-online-results-'+(host?'host':'guest'),{scope:'UI-preview',notes:['Synthetic online result role; no room exists']});
   if(!host){await tap('[data-id="leave"]');await page.locator('.iw-modal').waitFor({state:'visible'});await snap('preview-online-results-leave-confirm',{scope:'UI-preview',notes:['Confirmation not accepted']});}
  });
  await attempt('online-pause',async()=>{await fixture();await page.evaluate(()=>G.netm={});await show('pause');await snap('preview-online-pause',{scope:'UI-preview'});await tap('[data-id="quit"]');await page.locator('.iw-modal').waitFor({state:'visible'});await snap('preview-online-pause-leave-confirm',{scope:'UI-preview',notes:['Confirmation not accepted']});});
  await attempt('room-disconnect',async()=>{await fixture();await show('lobby');await page.evaluate(()=>menus._roomGone('Lost connection to the room'));await waitScreen('online');await snap('preview-room-disconnect',{scope:'UI-preview',notes:['Existing room-loss handler invoked in offline fixture; no real room']});});
 }
 if(batch==='battle')await attempt('offline-bot-match',async()=>{
  await page.goto(origin+'/?news=0&skipTitle=1&autopilot=1',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__inkwave?.debug&&window.__inkwave?.menus,null,{timeout:180000});await waitScreen('main');
  await tap('.iw-main [data-id="play"]');await waitScreen('mode');await tap('[data-id="mode-turf"]');await waitScreen('setup');
  // Keep the native START event/permission route, but supply the originally
  // requested 20s to its real API once. No live match clock is overwritten.
  await page.evaluate(()=>{const api=window.__inkwave.menus.api,original=api.startMatch;api.startMatch=function(options){api.startMatch=original;return original.call(this,{...options,duration:20});};});
  await tap('.iw-setup [data-id="start"]');await page.waitForFunction(()=>window.__G?.mode==='match'&&['intro','playing'].includes(window.__inkwave.match?.state)&&!window.__inkwave.match.attract,null,{timeout:60000});
  // Native START has admitted the match. Step its existing intro simulation
  // instead of making software-GPU wall time a second admission condition.
  let introAdvancedMs=0;await page.evaluate(()=>window.__inkwave.debug.freeze());
  for(let n=0;n<20;n++){
   const state=await page.evaluate(()=>window.__inkwave.match.state);if(state==='playing')break;assert.equal(state,'intro');
   await page.evaluate(()=>window.__inkwave.debug.step(250));introAdvancedMs+=250;
  }
  assert.equal(await page.evaluate(()=>window.__inkwave.match.state),'playing','native intro must complete through simulation');
  receipt.introClock={method:'existing debug.freeze/step after native START admission',stepMs:250,advancedMs:introAdvancedMs};persist();
  const actualDuration=await page.evaluate(()=>{window.__inkwave.debug.freeze();return window.__inkwave.match.duration;});assert.equal(actualDuration,20,'real API must honor the requested 20s Turf input');receipt.matchInput={duration:20,route:'native START with one original startMatch API call'};
  if(id==='ipad-mini-landscape'){await snap('offline-battle-hud',{scope:'actual-game-native-start',notes:['Actual local offline Turf match with bots; native START gesture with valid setup map; Native setup duration; autopilot; actual simulation advanced by supported audit clock after HUD; no result injection']});
  await page.evaluate(()=>window.__inkwave.pause());await waitScreen('pause');await snap('offline-battle-pause',{scope:'actual-game-api-pause'});await tap('[data-id="quit"]');await page.locator('.iw-modal').waitFor({state:'visible'});await snap('offline-battle-quit-confirm',{scope:'actual-game-api-pause',notes:['Confirmation not accepted']});await page.keyboard.press('Escape');await page.evaluate(()=>window.__inkwave.resume());}
  let advancedMs=0;for(let n=0;n<Math.ceil((actualDuration+60)/2);n++){const done=await page.evaluate(()=>window.__inkwave.menus?.current==='results'||window.__G?.mode==='results');if(done)break;await page.evaluate(()=>window.__inkwave.debug.step(2000));advancedMs+=2000;await page.waitForTimeout(10);}receipt.auditClock={method:'existing debug.freeze/step',stepMs:2000,advancedMs,configuredDuration:actualDuration};await page.evaluate(()=>window.__inkwave.debug.unfreeze());await page.waitForFunction(()=>window.__inkwave?.menus?.current==='results',null,{timeout:30000});await waitScreen('results');await tap('.iw-res__title');await page.waitForFunction(()=>window.__inkwave.menus._scr.el.classList.contains('is-done'));await snap('offline-battle-results',{scope:'actual-game',notes:['Actual offline bot simulation, audit-clock advanced; no injected winner, match.time or result']});
 });
 if(batch==='error-bottom')await attempt('short-viewport-error-banners',async()=>{
  assert.equal(id,'phone-landscape');
  const errors=['Room not found','Room is full','Match in progress','Could not connect','Room code taken','Lost connection to the room'];
  for(let n=0;n<errors.length;n++){
   await fixture();await show('online');await page.evaluate(message=>{G.net.join=async()=>{throw Error(message);};},errors[n]);
   await tap('[data-id="join"]');await page.locator('.iw-code-input').fill('BCEFG');await tap('.iw-join__btns .is-go');
   const banner=page.locator('.iw-jstat.is-on');await banner.waitFor({state:'visible'});await banner.scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);
   const box=await banner.boundingBox();assert(box&&box.x>=-1&&box.y>=-1&&box.x+box.width<=device.viewport.width+1&&box.y+box.height<=device.viewport.height+1,'complete error banner not visible');
   await snap('preview-online-error-'+n+'-bottom',{scope:'UI-preview',notes:['Synthetic local rejected API outcome: '+errors[n],'Scroll-only bottom continuation of retained initial capture; banner bounding box verified',box]});
  }
 });
 const planned=batch==='editor'?5:batch==='variants'?20:batch==='error-bottom'?6:id==='phone-landscape'?1:4;
 assert.equal(receipt.images.length,planned,'required distinct-state count');receipt.required=required;receipt.batch=batch;receipt.transport={maxLogBytes:MAX_LOG_BYTES,rawImageProcessing:'none',artifactRetainsAllOriginals:true};persist();

} catch(e){receipt.failures.push({phase:'fatal',error:String(e.stack||e)});persist();await emit({type:'failure',device:id,error:String(e.stack||e)});}
finally{await browser?.close().catch(e=>receipt.failures.push({phase:'cleanup',error:e.message}));await new Promise(r=>server.close(r));receipt.complete=receipt.failures.length===0;persist();assert(Buffer.byteLength(recordLine({type:'manifest',...receipt}))+64<=RESERVED_MANIFEST_BYTES,'manifest reserve');await emit({type:'manifest',...receipt});}
if(!receipt.complete)process.exitCode=1;
