#!/usr/bin/env node
// Full game in two browsers, native reference meshes, real WebSocket and the
// production relay handler. No public deployment, third-party assets stay local.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {chromium} from 'playwright';import {WebSocketServer} from 'ws';import {RoomDurableObject} from '../server/src/index.js';
const site=path.resolve(process.argv[2]||'_site-native'),out=path.resolve(process.argv[3]||'.browser-evidence/native-online');fs.mkdirSync(out,{recursive:true});
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp'},hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://local'),rel=decodeURIComponent(url.pathname),file=path.resolve(site,'.'+(rel==='/'?'/index.html':rel));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const relay=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(r=>relay.once('listening',r));const rooms=new Map();let packets=0;
relay.on('connection',(ws,req)=>{const url=new URL(req.url,'http://local'),code=url.pathname.split('/')[2];let room=rooms.get(code);if(!room){room=new RoomDurableObject({},{});rooms.set(code,room);}room.handleSession({send:s=>{if(ws.readyState===1)ws.send(s);},addEventListener:(n,fn)=>ws.on(n,n==='message'?d=>{packets++;fn({data:d.toString()});}:fn)},url.searchParams.get('name')||'Player');});
const address='http://127.0.0.1:'+server.address().port+'/?relay='+encodeURIComponent('ws://127.0.0.1:'+relay.address().port);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-features=LocalNetworkAccessChecks','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const pages=[],errors=[],results=[];
try{
 for(let i=0;i<2;i++){
  const context=await browser.newContext({viewport:{width:800,height:600}});await context.grantPermissions(['local-network-access']);const page=await context.newPage();pages.push(page);
  page.on('pageerror',e=>{errors.push(e.message);console.log('pageerror '+e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log('console '+m.text().slice(0,300));}});
  await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false,musicVolume:0})));
  console.log('boot peer '+i);await page.goto(address,{waitUntil:'domcontentloaded'});await page.evaluate(async()=>globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G);
  await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});
  assert.equal(await page.locator('#boot-error').textContent(),'');await page.evaluate(()=>{NG.game.debug.freeze();NG.game._skipRender=true;NG.game.menus.launchLobby=async()=>{};});
 }
 for(const id of (process.env.NATIVE_STAGE_IDS||'scorch,hagglefish,inkblot,mako,brinewater').split(','))for(const mode of (process.env.NATIVE_ONLINE_MODES||'turf,zones,tower,rainmaker,clams').split(',')){
  console.log('online '+id+' '+mode);
  const code=await pages[0].evaluate(()=>NG.net.create('Native Host'));await pages[1].evaluate(c=>NG.net.join(c,'Native Guest'),code);
  await Promise.all(pages.map(p=>p.waitForFunction(()=>NG.net.lobby.players.length===2)));
  await pages[0].evaluate(({id,mode})=>NG.net.setSettings({map:id,mode,bots:true}),{id,mode});
  await pages[1].waitForFunction(({id,mode})=>NG.net.lobby.map===id&&NG.net.lobby.mode===mode,{id,mode});
  await pages[0].evaluate(()=>{if(!NG.net.confirmTeams())throw Error('Teams not confirmed');});await pages[1].waitForFunction(()=>NG.net.lobby.teamsConfirmed);
  await pages[1].evaluate(()=>NG.net.setMe({ready:true}));await pages[0].evaluate(()=>NG.net.setMe({ready:true}));await pages[0].waitForFunction(()=>NG.net.canStart());
  await pages[0].evaluate(()=>{if(!NG.net.start())throw Error('Native room start refused');});
  await Promise.all(pages.map(p=>p.waitForFunction(()=>NG.match&&NG.level?.native&&NG.net.active,null,{timeout:180000})));
  // Keep transport clocks real while advancing the paused render loop manually.
  const step=async n=>{for(let k=0;k<n;k++){await Promise.all(pages.map(p=>p.evaluate(()=>{NG.game._skipRender=true;NG.game._frame(1/60);})));await Promise.all(pages.map(p=>p.evaluate(()=>new Promise(r=>setTimeout(r,1)))));}};
  await step(350);await Promise.all(pages.map(p=>p.waitForFunction(()=>NG.match.state==='playing',null,{timeout:30000})));
  const identities=await Promise.all(pages.map(p=>p.evaluate(()=>({stage:NG.level.manifest.sourceSha256,fingerprint:NG.netm.cfg.nativeStage,actors:NG.actors.length,rule:NG.match.mode,native:NG.level.native,gridBytes:NG.paint.grid.length}))));
  assert.deepEqual(identities[0],identities[1]);assert.equal(identities[0].actors,8);assert.ok(identities[0].fingerprint);
  // Explicit ordered ground paint uses real NetMatch recording/playback, not a
  // second networking implementation. Freeze bot producers for exact comparison.
  await Promise.all(pages.map(p=>p.evaluate(()=>{NG.game.debug.freezeBots();for(const a of NG.actors){a.intent.fire=false;a.intent.move.set(0,0,0);}})));
  if(mode==='turf'){
   await step(15);
   await pages[0].evaluate(()=>{const G=NG,p=G.level.spawnPads[0],o=p.clone().add({x:0,y:2,z:0}),h=G.physics.raycast(o,p.clone().set(0,-1,0),5);if(!h.hit)throw Error('No source spawn floor');G.paint.splat(h.point.clone().addScaledVector(h.normal,.03),1.5,G.local.team,{seed:.3125,instant:true});});
   await step(30);
  }else{
   await pages[0].evaluate(()=>{const G=NG,e=G.match.ranked;e.setCount(0,65);e.revision++;G.netm._sendNow({k:'rkstate',rk:{match:G.netm.cfg.id,host:G.netm.s.hostId,state:e.snapshot(),gains:G.match.rankedGains}});});
   await step(20);await pages[1].waitForFunction(()=>NG.match.ranked.counts[0]===65,null,{timeout:30000});
  }
  const evidence=await Promise.all(pages.map(p=>p.evaluate(async()=>{const G=NG,bytes=new Uint8Array(G.paint.grid),digest=await crypto.subtle.digest('SHA-256',bytes);return {gridSha256:Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join(''),coverage:G.paint.coverage(),ranked:G.match.ranked?.counts,stats:G.netm.stats};})));
  if(mode==='turf')assert.equal(evidence[0].gridSha256,evidence[1].gridSha256,'source chart paint divergence');else assert.deepEqual(evidence[0].ranked,evidence[1].ranked);
  results.push({id,mode,identities,evidence,transport:'real WebSocket + production RoomDurableObject',packets});fs.writeFileSync(path.join(out,'online.json'),JSON.stringify({status:'running',results,errors},null,2));
  await Promise.all(pages.map(p=>p.evaluate(()=>NG.net.leave())));
 }
 assert.equal(errors.length,0,JSON.stringify(errors));fs.writeFileSync(path.join(out,'online.json'),JSON.stringify({status:'passed',results,errors,packets},null,2));
}catch(error){fs.writeFileSync(path.join(out,'online.json'),JSON.stringify({status:'failed',results,errors,error:error.stack,states:await Promise.all(pages.map(p=>p.evaluate(()=>({net:NG.net.state,map:NG.level.layout.id,mode:NG.match?.mode,state:NG.match?.state,actors:NG.actors.length})).catch(()=>null)))},null,2));throw error;}
finally{await browser.close();relay.close();await new Promise(r=>server.close(r));}
