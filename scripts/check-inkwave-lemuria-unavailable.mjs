#!/usr/bin/env node
// Built game + real WebSocket relay proof for the unavailable Lemuria entry.
// Run browser checks under the shared native-stage flock. No source payload is fetched.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {WebSocketServer} from 'ws';
import {RoomDurableObject} from '../server/src/index.js';

const site=path.resolve(process.argv[2]||'_site-native-lemuria');
const evidence=path.resolve(process.argv[3]||'.browser-evidence/lemuria');
fs.mkdirSync(evidence,{recursive:true});
console.log('Lemuria unavailable browser proof started');
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{
 const rel=decodeURIComponent(new URL(req.url,'http://local').pathname);
 const file=path.resolve(site,'.'+(rel==='/'?'/index.html':rel));
 if(!file.startsWith(site+path.sep)||!fs.statSync(file).isFile())throw Error('Missing');
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
}catch{res.writeHead(404);res.end('Missing');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const relay=new WebSocketServer({host:'127.0.0.1',port:0});
await new Promise(resolve=>relay.once('listening',resolve));
const rooms=new Map(),wireStarts=[];
relay.on('connection',(socket,req)=>{
 const url=new URL(req.url,'http://local'),code=url.pathname.split('/')[2];
 if(!rooms.has(code))rooms.set(code,new RoomDurableObject({},{}));
 rooms.get(code).handleSession({send:data=>{if(socket.readyState===1)socket.send(data);},addEventListener:(name,fn)=>socket.on(name,name==='message'?data=>{
  const raw=data.toString();
  try{const payload=JSON.parse(raw.startsWith('b|')?raw.slice(2):raw.startsWith('s|')?raw.slice(raw.indexOf('|',2)+1):raw);if(payload.k==='start')wireStarts.push({map:payload.map,mode:payload.mode,id:payload.id});}catch{}
  fn({data:raw});
 }:fn)},url.searchParams.get('name')||'Player');
});
const address='http://127.0.0.1:'+server.address().port;
const relayURL='ws://127.0.0.1:'+relay.address().port;
const proxyURL=process.env.HTTPS_PROXY?new URL(process.env.HTTPS_PROXY):null;
const proxy=proxyURL?{server:proxyURL.origin,username:decodeURIComponent(proxyURL.username),password:decodeURIComponent(proxyURL.password),bypass:'127.0.0.1,localhost'}:undefined;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,proxy,args:['--no-sandbox','--disable-dev-shm-usage','--disable-features=LocalNetworkAccessChecks','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const pages=[],errors=[],sourceRequests=[],report={schema:1,id:'lemuria',availability:'source-unavailable',status:'running',version1130Verified:false};
try{
 for(let peer=0;peer<2;peer++){
  console.log('Lemuria menu boot peer '+peer);
  const context=await browser.newContext({viewport:{width:1100,height:760}});
  await context.grantPermissions(['local-network-access']);
  const page=await context.newPage();pages.push(page);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/kirakira-dev\/KiTrix/.test(request.url()))sourceRequests.push(request.url());});
  await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false,musicVolume:0,audioVolume:0})));
  await page.goto(address+'/?map='+(peer?'tidewater':'lemuria')+(peer?'':'&autostart=90')+'&relay='+encodeURIComponent(relayURL),{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI).href)).G);
  await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});
  assert.equal(await page.locator('#boot-error').textContent(),'');
  await page.waitForFunction(()=>NG.game?.debug?.freeze);
  await page.evaluate(()=>{NG.game.debug.freeze();NG.game._skipRender=true;});
 }
 const host=pages[0],guest=pages[1];
 const row=host.locator('button[data-native-stage="lemuria"]');
 await row.waitFor({state:'attached'});
 assert.equal(await row.isDisabled(),true);
 assert.equal(await row.getAttribute('aria-disabled'),'true');
 assert.equal(await row.getAttribute('data-nav'),null);
 assert.match(await row.innerText(),/リュウグウターミナル/);
 assert.match(await row.innerText(),/公開モデルが見つからない/);
 report.catalog=await host.evaluate(async()=>{
  const registry=await import(new URL('patches/native-stages/runtime/registry.mjs',document.baseURI).href);
  let urlRejected=false;try{registry.nativeStageURL('lemuria','Vss_AutoWalk00.obj');}catch(error){urlRejected=error.name==='RangeError';}
  return {unavailableCount:registry.UNAVAILABLE_NATIVE_STAGES.filter(stage=>stage.id==='lemuria').length,playableMap:registry.NATIVE_MAPS.some(stage=>stage.id==='lemuria'),nativeId:registry.NATIVE_IDS.includes('lemuria'),hasLayout:!!registry.NATIVE_LAYOUTS.lemuria,fingerprint:registry.nativeStageFingerprint('lemuria'),urlRejected};
 });
 assert.equal(report.catalog.unavailableCount,1);assert.equal(report.catalog.playableMap,false);assert.equal(report.catalog.nativeId,false);assert.equal(report.catalog.hasLayout,false);assert.equal(report.catalog.fingerprint,null);assert.equal(report.catalog.urlRejected,true);
 await row.scrollIntoViewIfNeeded();
 await host.screenshot({path:path.join(evidence,'lemuria-unavailable-menu.png')});
 report.menu=await host.evaluate(()=>({mode:NG.mode,screen:NG.game.menus.current,attract:NG.match.attract,map:NG.game.mapDef.id,disabled:document.querySelector('[data-native-stage="lemuria"]').disabled,reasonVisible:document.querySelector('[data-native-stage="lemuria"]').textContent,bootMs:NG.game.bootMs}));
 assert.equal(report.menu.mode,'menu');assert.equal(report.menu.screen,'setup');assert.equal(report.menu.attract,true);
 assert.notEqual(report.menu.map,'lemuria');
 await Promise.all(pages.map(page=>page.evaluate(()=>{NG.game.debug.freeze();NG.game._skipRender=true;})));
 report.offline=await host.evaluate(async()=>{
  const G=NG,game=G.game,world={level:G.level,paint:G.paint,physics:G.physics,nav:G.nav,match:G.match,flow:game._matchFlow};
  const rows=[];
  for(const mode of ['turf','zones','tower','rainmaker','clams']){
   const core=await game.startMatch({mapId:'lemuria',mode,rule:mode});
   const api=await game.api.startMatch({mapId:'lemuria',mode,rule:mode});
   rows.push({mode,core,api,sameWorld:G.level===world.level&&G.paint===world.paint&&G.physics===world.physics&&G.nav===world.nav&&G.match===world.match,sameFlow:game._matchFlow===world.flow,attract:G.match.attract});
  }
  let onlineError;try{await game.startNetMatch({map:'lemuria',mode:'turf'},{});}catch(error){onlineError={name:error.name,message:error.message};}
  let worldError;try{await game._buildWorld({id:'lemuria'});}catch(error){worldError={name:error.name,message:error.message};}
  game.menus._setup.mapId='lemuria';game.menus._startMatch();
  return {rules:rows,onlineError,worldError,menuStarting:!!game.menus._starting,sameWorld:G.level===world.level&&G.paint===world.paint&&G.physics===world.physics&&G.nav===world.nav&&G.match===world.match};
 });
 assert.ok(report.offline.rules.every(row=>row.core===false&&row.api===false&&row.sameWorld&&row.sameFlow&&row.attract));
 assert.equal(report.offline.onlineError.name,'RangeError');assert.equal(report.offline.menuStarting,false);assert.equal(report.offline.sameWorld,true);
 assert.equal(report.offline.worldError.name,'RangeError');
 report.online=[];
 for(const mode of ['turf','zones','tower','rainmaker','clams']){
  console.log('Lemuria real WebSocket blocked '+mode);
  const code=await host.evaluate(()=>NG.net.create('Lemuria Host'));
  await guest.evaluate(code=>NG.net.join(code,'Lemuria Guest'),code);
  await Promise.all(pages.map(page=>page.waitForFunction(()=>NG.net.state==='lobby'&&NG.net.lobby.players.length===2)));
  const beforeStarts=wireStarts.length;
  const hostBlock=await host.evaluate(mode=>{
   const net=NG.net,prior=net.lobby.map;
   net.setSettings({map:'lemuria'});
   const settingsRejected=net.lobby.map===prior;
   net.lobby.map='lemuria';net.lobby.mode=mode;
   return {settingsRejected,canStart:net.canStart(),started:net.start(),reason:net.startBlock()};
  },mode);
  assert.equal(hostBlock.settingsRejected,true);assert.equal(hostBlock.canStart,false);assert.equal(hostBlock.started,false);
  assert.equal(wireStarts.length,beforeStarts);
  await guest.evaluate(()=>{globalThis.lemuriaWorld={level:NG.level,paint:NG.paint,physics:NG.physics,match:NG.match};});
  // A malformed start from the legitimate host crosses the real relay; the
  // guest's production session rejects it before NetMatch or stage loading.
  await host.evaluate(mode=>NG.net.tr.broadcast({k:'start',map:'lemuria',mode,roster:[],host:NG.net.myId,id:'lemuria-unavailable-'+mode}),mode);
  await guest.waitForFunction(()=>NG.net.state==='error'&&NG.net.error?.includes('リュウグウターミナル'));
  const incoming=await guest.evaluate(()=>({state:NG.net.state,error:NG.net.error,startCfg:NG.net._startCfg,sameWorld:NG.level===lemuriaWorld.level&&NG.paint===lemuriaWorld.paint&&NG.physics===lemuriaWorld.physics&&NG.match===lemuriaWorld.match,attract:NG.match.attract}));
  assert.equal(incoming.sameWorld,true);assert.equal(incoming.attract,true);assert.equal(incoming.startCfg,null);
  report.online.push({mode,hostBlock,incoming,wireStartCount:wireStarts.length-beforeStarts});
  await Promise.all(pages.map(page=>page.evaluate(()=>NG.net.leave())));
 }
 assert.equal(sourceRequests.length,0);assert.equal(errors.length,0,JSON.stringify(errors));
 report.status='passed';report.sourceRequestCount=sourceRequests.length;report.browserErrors=errors;
 report.transport='real WebSocket + production RoomDurableObject';report.wireStarts=wireStarts;
 console.log(JSON.stringify({id:report.id,status:report.status,offlineRuleCount:report.offline.rules.length,realWebSocketBlockedRuleCount:report.online.length,sourceRequestCount:sourceRequests.length}));
}catch(error){report.status='failed';report.error=error.stack;report.browserErrors=errors;throw error;}
finally{
 fs.writeFileSync(path.join(evidence,'lemuria-browser.json'),JSON.stringify(report,null,2)+'\n');
 await browser.close();for(const client of relay.clients)client.terminate();await new Promise(resolve=>relay.close(resolve));await new Promise(resolve=>server.close(resolve));
}
