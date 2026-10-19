#!/usr/bin/env node
// Actual menu-start and two-peer production-relay camera/aim/launch regression.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {chromium} from 'playwright';import {WebSocketServer} from 'ws';import {createLocalRelay} from './lib/inkwave-local-relay-fixture.mjs';
const site=path.resolve(process.argv[2]||'_site-native-urchin'),out=path.resolve(process.argv[3]||'.browser-evidence/native-camera-basis'),id=process.env.NATIVE_STAGE_ID||'urchin';fs.mkdirSync(out,{recursive:true});
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{const name=new URL(req.url,'http://local').pathname,file=path.resolve(site,'.'+(name==='/'?'/index.html':decodeURIComponent(name)));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const relay=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(r=>relay.once('listening',r));const rooms=new Map();let packets=0;
const connectRelay=createLocalRelay({rooms});
relay.on('connection',(ws,req)=>connectRelay(ws,req,{receive:()=>{packets++;}}));
const result={status:'running',id,offline:[],online:[],errors:[],resources:[]},browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-features=LocalNetworkAccessChecks','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),pages=[];
const base='http://127.0.0.1:'+server.address().port,relayURL='ws://127.0.0.1:'+relay.address().port;
const proof=async(page,hz)=>page.evaluate(hz=>{
 const G=NG,g=G.game,a=G.local,p=G.level.spawnPads[a.team],q=G.level.spawnPads[1-a.team],dx=q.x-p.x,dz=q.z-p.z,span=Math.hypot(dx,dz),forward=[dx/span,dz/span],expected=Math.atan2(...forward),error=v=>Math.abs(Math.atan2(Math.sin(v-expected),Math.cos(v-expected)));
 g._skipRender=true;g._frame(1/hz);const target=a.s3?.squidSpawn?.target;if(!target)throw Error('Initial human source target missing');const tx=target.x-p.x,tz=target.z-p.z,alignment=(tx*forward[0]+tz*forward[1])/Math.hypot(tx,tz);
 if(error(g.rig.yaw)>1e-6||error(a.aimYaw)>1e-6||alignment<.8)throw Error('Initial camera-driven aim differs from inferred source axis: '+JSON.stringify({team:a.team,rig:g.rig.yaw,aim:a.aimYaw,expected,alignment,target,cameraDirection:G.camera.getWorldDirection(a.pos.clone()).toArray(),rigMode:g.rig.mode}));
 return {hz,team:a.team,rigYaw:g.rig.yaw,aimYaw:a.aimYaw,expectedYaw:expected,alignment,actors:G.actors.length,mode:G.match.mode,native:!!G.level.native};
},hz);
const step=async(peers,hz,n)=>{if(peers.length===1){await peers[0].evaluate(({hz,n})=>{for(let i=0;i<n;i++)NG.game._frame(1/hz);},{hz,n});return;}for(let i=0;i<n;i++){await Promise.all(peers.map(p=>p.evaluate(hz=>NG.game._frame(1/hz),hz)));await Promise.all(peers.map(p=>p.evaluate(()=>new Promise(r=>setTimeout(r,1)))));}};
const land=async(page,hz,peers=[page])=>{
 await page.bringToFront();
  // Grant a real browser lock through its canvas API; pointerlockchange still
  // performs every production admission check. Never set input.locked directly.
  await page.evaluate(async()=>{await NG.input.canvas.requestPointerLock();});
 await page.waitForFunction(()=>NG.input.locked,null,{timeout:10000});
 const inputAim=await proof(page,hz);
 await page.mouse.down();
 await step(peers,hz,Math.ceil(hz*.15));
 await page.mouse.up();
 await step(peers,hz,Math.ceil(hz*1.5));
 const landed=await page.evaluate(()=>{const a=NG.local;if(a.s3?.squidSpawn||!a.grounded||!a.alive)throw Error('Camera-directed human launch failed to land: '+JSON.stringify({alive:a.alive,grounded:a.grounded,spawn:a.s3?.squidSpawn,intentFire:a.intent.fire,controller:NG.match.controller.enabled,menu:NG.game.menus.current}));return {alive:a.alive,grounded:a.grounded,spawnActive:!!a.s3?.squidSpawn};});
 return {...landed,input:'browser canvas pointer lock + physical mouse fire',inputAlignment:inputAim.alignment};
};
try{
 const pointerProbe=await browser.newPage();
 await pointerProbe.setContent('<canvas id="canvas" width="400" height="200"></canvas><button id="lock">LOCK</button>');
 await pointerProbe.evaluate(()=>{globalThis.pointerError=null;document.getElementById('lock').onclick=async()=>{try{await document.getElementById('canvas').requestPointerLock();}catch(e){globalThis.pointerError=e.name+': '+e.message;}};});
 await pointerProbe.locator('#lock').click();await pointerProbe.waitForTimeout(500);
 result.pointerLockEnvironment=await pointerProbe.evaluate(()=>({locked:!!document.pointerLockElement,error:globalThis.pointerError,focused:document.hasFocus()}));
 await pointerProbe.close();console.log('pointer lock environment '+JSON.stringify(result.pointerLockEnvironment));assert.equal(result.pointerLockEnvironment.locked,true,'Actual mouse proof requires browser canvas pointer lock');
 for(let n=0;n<2;n++){const c=await browser.newContext({viewport:{width:960,height:640}});await c.grantPermissions(['local-network-access']);const p=await c.newPage();pages.push(p);p.on('pageerror',e=>result.errors.push(e.message));await p.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0})));await p.goto(base+'/?map=tidewater&relay='+encodeURIComponent(relayURL),{waitUntil:'domcontentloaded'});await p.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});await p.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:240000});assert.equal(await p.locator('#boot-error').textContent(),'');await p.evaluate(()=>{NG.game._skipRender=true;NG.game.debug.freeze();});console.log('boot peer '+n);}
 const p=pages[0];
 for(const hz of [30,60,120]){
  await p.evaluate(()=>{NG.input.exitLock();NG.game.debug.unfreeze();NG.game._skipRender=true;NG.game.menus.show('setup');});await p.waitForFunction(()=>!document.pointerLockElement);
  const stageName=await p.evaluate(async id=>(await import(new URL('src/config.js',document.baseURI))).MAPS.find(m=>m.id===id).name,id);
  await p.waitForFunction(name=>{const e=[...NG.game.menus._scr.el.querySelectorAll('.iw-ticket')].find(e=>e.textContent.includes(name));return !!e&&Number(getComputedStyle(e).opacity)>.7;},stageName);
  await p.locator('.iw-ticket').filter({hasText:stageName}).click();await p.evaluate(()=>{globalThis.cameraPreviousMatch=NG.match;});await p.locator('.iw-btn--start').click();await p.evaluate(()=>NG.game.debug.freeze());await p.waitForFunction(id=>NG.level?.native&&NG.level.layout.id===id&&NG.match&&NG.match!==globalThis.cameraPreviousMatch&&!NG.match.attract&&['intro','playing'].includes(NG.match.state),id,{timeout:240000});await p.evaluate(()=>{NG.game.debug.freeze();NG.game.debug.freezeBots();});await step([p],hz,Math.ceil(hz*5.5));assert.equal(await p.evaluate(()=>NG.match.state),'playing');console.log('menu match '+hz);
  const v=await proof(p,hz);result.offline.push(v);v.landing=await land(p,hz);result.resources.push(await p.evaluate(()=>({phase:'menu',gridBytes:NG.paint.grid.byteLength,paintGrowing:NG.paint.growing.length,paintOrderRecords:NG.paint._paintOrderRecords?.length,renderer:{...NG.renderer.info.memory},jsHeapBytes:performance.memory?.usedJSHeapSize})));fs.writeFileSync(path.join(out,'camera-basis.json'),JSON.stringify(result,null,2));console.log('menu camera '+hz+' team '+v.team+' alignment '+v.alignment);if(hz===120){await p.evaluate(()=>{NG.renderer.render(NG.scene,NG.camera);});await p.screenshot({path:path.join(out,'native-camera-game.png'),timeout:60000});}
 }
 // Real room ownership assigns the two humans to opposing teams.
 for(const hz of [30,60,120]){
  await Promise.all(pages.map(p=>p.evaluate(()=>{NG.input.exitLock();NG.game.debug.freeze();NG.game._skipRender=true;NG.game.menus.launchLobby=async()=>{};})));
  const code=await pages[0].evaluate(()=>NG.net.create('Camera Host'));await pages[1].evaluate(code=>NG.net.join(code,'Camera Guest'),code);await Promise.all(pages.map(p=>p.waitForFunction(()=>NG.net.lobby.players.length===2)));
  await pages[0].evaluate(id=>NG.net.setSettings({map:id,mode:'turf',bots:true}),id);await pages[1].waitForFunction(id=>NG.net.lobby.map===id,id);await pages[0].evaluate(()=>{if(!NG.net.confirmTeams())throw Error('Teams refused');});await pages[1].waitForFunction(()=>NG.net.lobby.teamsConfirmed);
  await Promise.all(pages.map(p=>p.evaluate(()=>NG.net.setMe({ready:true}))));await pages[0].waitForFunction(()=>NG.net.canStart());await Promise.all(pages.map(p=>p.evaluate(()=>{globalThis.cameraPreviousMatch=NG.match;})));await pages[0].evaluate(()=>{if(!NG.net.start())throw Error('Real native room refused');});await Promise.all(pages.map(p=>p.waitForFunction(()=>NG.net.active&&NG.level.native&&NG.match&&NG.match!==globalThis.cameraPreviousMatch&&!NG.match.attract,null,{timeout:240000})));
  for(let frame=0;frame<350;frame++){await Promise.all(pages.map(p=>p.evaluate(()=>NG.game._frame(1/60))));await Promise.all(pages.map(p=>p.evaluate(()=>new Promise(r=>setTimeout(r,1)))));}await Promise.all(pages.map(p=>p.waitForFunction(()=>NG.match.state==='playing')));
  const row=[];for(const page of pages){const v=await proof(page,hz);row.push(v);v.landing=await land(page,hz,pages);}assert.deepEqual(row.map(v=>v.team).sort(),[0,1]);result.online.push({hz,peers:row,transport:'real WebSocket + production RoomDurableObject'});fs.writeFileSync(path.join(out,'camera-basis.json'),JSON.stringify(result,null,2));console.log('online camera '+hz+' teams '+row.map(v=>v.team).join(','));await Promise.all(pages.map(p=>p.evaluate(()=>NG.net.leave())));
 }
 result.legacy=await p.evaluate(async()=>{const g=NG.game;g.menus.wipe.cancel();await g.startMatch({mapId:'tidewater',mode:'turf',difficulty:'normal'});for(let i=0;i<330;i++)g._frame(1/60);return {id:NG.level.layout.id,native:!!NG.level.native,rigYaw:g.rig.yaw,aimYaw:NG.local.aimYaw};});assert.equal(result.legacy.native,false);assert.equal(result.legacy.rigYaw,0);assert.equal(result.legacy.aimYaw,0);assert.equal(result.errors.length,0,JSON.stringify(result.errors));result.status='passed';
}catch(error){result.status='failed';result.error=error.stack;throw error;}finally{result.packets=packets;fs.writeFileSync(path.join(out,'camera-basis.json'),JSON.stringify(result,null,2));await browser.close();await new Promise(r=>relay.close(r));await new Promise(r=>server.close(r));}
