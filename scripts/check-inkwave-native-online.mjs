#!/usr/bin/env node
// Full game in two browsers, native reference meshes, real WebSocket and the
// production relay handler. No public deployment, third-party assets stay local.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {chromium} from 'playwright';import {WebSocketServer} from 'ws';import {RoomDurableObject} from '../server/src/index.js';
const site=path.resolve(process.argv[2]||'_site-native'),out=path.resolve(process.argv[3]||'.browser-evidence/native-online');fs.mkdirSync(out,{recursive:true});
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp'},hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://local'),rel=decodeURIComponent(url.pathname),file=path.resolve(site,'.'+(rel==='/'?'/index.html':rel));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const relay=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(r=>relay.once('listening',r));const rooms=new Map(),trace=[];let packets=0,lastCase,lastEvidence;
function traceTick(raw,name){
 try{
  const payload=raw.startsWith('b|')?raw.slice(2):raw.startsWith('s|')?raw.slice(raw.indexOf('|',2)+1):raw;
  const p=JSON.parse(payload);if(p.k!=='t')return;
  trace.push({name,ts:p.ts,u:p.u,events:p.e?.map(e=>({kind:e[1],ts:e[0],tick:e.at(-2),seq:e.at(-1)}))});
  if(trace.length>100)trace.shift();
 }catch{}
}
relay.on('connection',(ws,req)=>{const url=new URL(req.url,'http://local'),code=url.pathname.split('/')[2];let room=rooms.get(code);if(!room){room=new RoomDurableObject({},{});rooms.set(code,room);}room.handleSession({send:s=>{if(ws.readyState===1)ws.send(s);},addEventListener:(n,fn)=>ws.on(n,n==='message'?d=>{packets++;const raw=d.toString();traceTick(raw,url.searchParams.get('name'));fn({data:raw});}:fn)},url.searchParams.get('name')||'Player');});
const address='http://127.0.0.1:'+server.address().port+'/?map=tidewater&relay='+encodeURIComponent('ws://127.0.0.1:'+relay.address().port);
const proxyURL=process.env.HTTPS_PROXY?new URL(process.env.HTTPS_PROXY):null,proxy=proxyURL?{server:proxyURL.origin,username:decodeURIComponent(proxyURL.username),password:decodeURIComponent(proxyURL.password),bypass:'127.0.0.1,localhost'}:undefined;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,proxy,args:['--no-sandbox','--disable-dev-shm-usage','--disable-features=LocalNetworkAccessChecks','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const pages=[],errors=[],results=[];
try{
 for(let i=0;i<2;i++){
  const context=await browser.newContext({viewport:{width:800,height:600}});await context.grantPermissions(['local-network-access']);const page=await context.newPage();pages.push(page);
  page.on('pageerror',e=>{errors.push(e.message);console.log('pageerror '+e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log('console '+m.text().slice(0,300));}});
  await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false,musicVolume:0})));
  console.log('boot peer '+i);await page.goto(address,{waitUntil:'domcontentloaded'});await page.evaluate(async()=>globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G);
  await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});
  assert.equal(await page.locator('#boot-error').textContent(),'');await page.evaluate(()=>{NG.game.debug.freeze();NG.game._skipRender=true;NG.game.menus.launchLobby=async()=>{};});
  await page.evaluate(()=>{globalThis.nativePaintTrace=[];const proto=Object.getPrototypeOf(NG.paint),fn=proto.splat;proto.splat=function(center,radius,team,opts={}){const nm=NG.netm,row={stage:this.level.layout.id,match:nm?.cfg.id,network:!!nm,applying:!!nm?.applying,point:center.toArray(),radius,team,kind:opts.kind,face:opts.face,instant:opts.instant,cosmetic:opts.cosmetic,remoteSequence:opts.__netOrder?.seq},result=fn.call(this,center,radius,team,opts);row.sequence=nm?._paintClockState?.applied.get(nm.myId);row.claimed=result;nativePaintTrace.push(row);if(nativePaintTrace.length>2000)nativePaintTrace.shift();return result;};});
 }
 for(const id of (process.env.NATIVE_STAGE_IDS||'scorch,hagglefish,inkblot,mako,brinewater').split(','))for(const mode of (process.env.NATIVE_ONLINE_MODES||'turf,zones,tower,rainmaker,clams').split(',')){
  console.log('online '+id+' '+mode);
  lastCase={id,mode};lastEvidence=null;trace.length=0;await Promise.all(pages.map(p=>p.evaluate(()=>nativePaintTrace.length=0)));
  const code=await pages[0].evaluate(()=>NG.net.create('Native Host'));await pages[1].evaluate(c=>NG.net.join(c,'Native Guest'),code);
  await Promise.all(pages.map(p=>p.waitForFunction(()=>NG.net.lobby.players.length===2)));
  if(process.env.NATIVE_HOST_WEAPON){await pages[0].evaluate(weapon=>NG.net.setMe({weapon}),process.env.NATIVE_HOST_WEAPON);await pages[1].waitForFunction(weapon=>NG.net.lobby.players.find(p=>p.host)?.weapon===weapon,process.env.NATIVE_HOST_WEAPON);}
  await pages[0].evaluate(({id,mode})=>NG.net.setSettings({map:id,mode,bots:true}),{id,mode});
  await pages[1].waitForFunction(({id,mode})=>NG.net.lobby.map===id&&NG.net.lobby.mode===mode,{id,mode});
  await pages[0].evaluate(()=>{if(!NG.net.confirmTeams())throw Error('Teams not confirmed');});await pages[1].waitForFunction(()=>NG.net.lobby.teamsConfirmed);
  await pages[1].evaluate(()=>NG.net.setMe({ready:true}));await pages[0].evaluate(()=>NG.net.setMe({ready:true}));
  const capability=await pages[0].evaluate(async({id,mode})=>{const {nativeStageBuild}=await import(new URL('patches/native-stages/runtime/build-config.mjs',document.baseURI));return nativeStageBuild.stages.find(s=>s.id===id)?.ruleAvailability?.[mode]||null;},{id,mode});
  if(capability?.supported===false){
   assert.equal(capability.status,'source-route-unverified');assert.ok(capability.reason);
   await Promise.all(pages.map(p=>p.waitForFunction(()=>NG.net.lobby.players.every(p=>p.ready)&&NG.net.lobby.teamsConfirmed)));
   await Promise.all(pages.map(p=>p.evaluate(()=>{const G=NG;globalThis.nativeRefusalBefore={match:G.match,level:G.level,physics:G.physics,nav:G.nav,actors:[...G.actors],flow:G.game._matchFlow,transport:G.net.tr,state:G.net.state,start:G.net._startCfg,room:JSON.stringify({map:G.net.lobby.map,mode:G.net.lobby.mode,teamsConfirmed:G.net.lobby.teamsConfirmed,players:G.net.lobby.players.map(p=>({id:p.id,team:p.team,ready:p.ready}))})};globalThis.nativeRefusalErrors=[];G.net.on('error',e=>nativeRefusalErrors.push(e.message));})));
   const host=await pages[0].evaluate(()=>{const net=NG.net;return{block:net.startBlock(),canStart:net.canStart(),started:net.start()};});assert.ok(host.block.includes(capability.reason));assert.equal(host.canStart,false);assert.equal(host.started,false);
   // Send a malformed host begin over the real WebSocket/production relay.
   // The guest's actual NetSession preflight must preserve its room and actors.
   await pages[0].evaluate(async({id,mode})=>{const {nativeStageFingerprint}=await import(new URL('patches/native-stages/runtime/registry.mjs',document.baseURI));NG.net.tr.broadcast({k:'start',map:id,mode,host:NG.net.myId,id:'unsupported-rule-probe',roster:[],nativeStage:nativeStageFingerprint(id)});},{id,mode});
   await pages[1].waitForFunction(()=>nativeRefusalErrors.length>0,null,{timeout:30000});
   const refusals=await Promise.all(pages.map(p=>p.evaluate(()=>{const G=NG,b=nativeRefusalBefore,room=JSON.stringify({map:G.net.lobby.map,mode:G.net.lobby.mode,teamsConfirmed:G.net.lobby.teamsConfirmed,players:G.net.lobby.players.map(p=>({id:p.id,team:p.team,ready:p.ready}))});return{roomPreserved:room===b.room,statePreserved:G.net.state===b.state,startPreserved:G.net._startCfg===b.start,transportPreserved:G.net.tr===b.transport,worldPreserved:G.level===b.level&&G.physics===b.physics&&G.nav===b.nav,matchPreserved:G.match===b.match&&G.game._matchFlow===b.flow,actorsPreserved:b.actors.every((a,i)=>G.actors[i]===a),actors:G.actors.length,errors:nativeRefusalErrors};})));
   for(const refusal of refusals)for(const key of ['roomPreserved','statePreserved','startPreserved','transportPreserved','worldPreserved','matchPreserved','actorsPreserved'])assert.equal(refusal[key],true,key);
   assert.ok(refusals[1].errors.some(m=>m.includes(capability.reason)));
   results.push({id,mode,supported:false,status:capability.status,host,refusals,transport:'real WebSocket + production RoomDurableObject',packets});fs.writeFileSync(path.join(out,'online.json'),JSON.stringify({status:'running',results,errors},null,2));await Promise.all(pages.map(p=>p.evaluate(()=>NG.net.leave())));continue;
  }
  await pages[0].waitForFunction(()=>NG.net.canStart());
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
   const stamp=await pages[0].evaluate(()=>{const G=NG,p=G.level.spawnPads[0],o=p.clone().add({x:0,y:2,z:0}),h=G.physics.raycast(o,p.clone().set(0,-1,0),5);if(!h.hit)throw Error('No source spawn floor');const radius=G.local.weaponId==='s3-blaster-short'?G.local.weapon.catalogRecord.parameters.BlasterBurstParam.SplashDropPaintRadius:1.5;G.paint.splat(h.point.clone().addScaledVector(h.normal,.03),radius,G.local.team,{seed:.3125,instant:true});return {peer:G.netm.myId,sequence:G.netm._paintClockState.applied.get(G.netm.myId),radius};});
   lastCase.probeRadius=stamp.radius;
   // Compare after the real replay watermark and both growth queues settle.
   // A fixed number of manually accelerated frames can leave accepted paint
   // on the wall-clock playback timeline, especially with a busy software GPU.
   const deadline=Date.now()+120000;lastCase.paintPlaybackSettled=false;
   for(let batch=0;batch<300&&Date.now()<deadline;batch++){
    await step(5);
    const state=await Promise.all(pages.map(p=>p.evaluate(stamp=>{const G=NG;return {applied:G.netm._paintClockState.applied.get(stamp.peer)||0,growing:G.paint.growing.length,queued:[...G.netm.peers.values()].reduce((n,p)=>n+p.events.filter(e=>e[1]==='s').length,0),out:G.netm.out.filter(e=>e[1]==='s').length};},stamp)));
    lastCase.paintSettlingFrames=(batch+1)*5;
    if(state[1].applied>=stamp.sequence&&state.every(s=>s.growing===0&&s.queued===0&&s.out===0)){lastCase.paintPlaybackSettled=true;break;}
   }
  }else{
   await pages[0].evaluate(()=>{const G=NG,e=G.match.ranked;e.setCount(0,65);e.revision++;G.netm._sendNow({k:'rkstate',rk:{match:G.netm.cfg.id,host:G.netm.s.hostId,state:e.snapshot(),gains:G.match.rankedGains}});});
   await step(20);await pages[1].waitForFunction(()=>NG.match.ranked.counts[0]===65,null,{timeout:30000});
  }
  const evidence=lastEvidence=await Promise.all(pages.map(p=>p.evaluate(async()=>{const G=NG,bytes=new Uint8Array(G.paint.grid),digest=await crypto.subtle.digest('SHA-256',bytes);return {gridSha256:Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join(''),coverage:G.paint.coverage(),ranked:G.match.ranked?.counts,stats:G.netm.stats,diagnostic:{time:G.time,out:G.netm.out.length,growing:G.paint.growing.length,counts:G.paint.counts,applied:[...G.netm._paintClockState.applied],peers:[...G.netm.peers].map(([id,p])=>({id,tr:p.tr,lastTs:p.lastTs,lastEventSeq:p._lastEventSeq,lastPaintSeq:p._lastPaintSeq,queued:p.events.length,paintQueued:p.events.filter(e=>e[1]==='s').length,physicsPoints:p.physicsPoints?.slice(-4)}))}};})));
  if(mode==='turf'&&evidence[0].gridSha256!==evidence[1].gridSha256){const grids=await Promise.all(pages.map(p=>p.evaluate(()=>Array.from(NG.paint.grid))));for(let i=0;i<grids.length;i++)fs.writeFileSync(path.join(out,`${id}-peer-${i}-grid.bin`),Buffer.from(grids[i]));const differences=[];for(let i=0;i<grids[0].length;i++)if(grids[0][i]!==grids[1][i])differences.push([i,grids[0][i],grids[1][i]]);const ownership=await Promise.all(pages.map(p=>p.evaluate(indices=>({ppm:NG.paint.ppm,atlas:NG.paint.size,orders:indices.map(index=>({index,value:NG.paint.grid[index],order:NG.paint._paintOrderRecords[NG.paint._paintOwnershipOrder[index]],face:NG.level.faces.find(f=>index>=f.grid&&index<f.grid+f.nu*f.nv)?.id})),calls:nativePaintTrace}),differences.slice(0,40).map(d=>d[0]))));lastEvidence.push({differentCells:differences.length,firstDifferences:differences.slice(0,40),ownership});}
  if(mode==='turf'){assert.equal(lastCase.paintPlaybackSettled,true,'real source paint playback did not settle');assert.equal(evidence[0].gridSha256,evidence[1].gridSha256,'source chart paint divergence');}else assert.deepEqual(evidence[0].ranked,evidence[1].ranked);
  results.push({id,mode,identities,evidence,playback:mode==='turf'?{settled:lastCase.paintPlaybackSettled,frames:lastCase.paintSettlingFrames,probeRadius:lastCase.probeRadius}:undefined,transport:'real WebSocket + production RoomDurableObject',packets});fs.writeFileSync(path.join(out,'online.json'),JSON.stringify({status:'running',results,errors},null,2));
  await Promise.all(pages.map(p=>p.evaluate(()=>NG.net.leave())));
 }
 assert.equal(errors.length,0,JSON.stringify(errors));fs.writeFileSync(path.join(out,'online.json'),JSON.stringify({status:'passed',results,errors,packets},null,2));
}catch(error){fs.writeFileSync(path.join(out,'online.json'),JSON.stringify({status:'failed',results,errors,lastCase,lastEvidence,trace,error:error.stack,states:await Promise.all(pages.map(p=>p.evaluate(()=>({net:NG.net.state,map:NG.level.layout.id,mode:NG.match?.mode,state:NG.match?.state,actors:NG.actors.length})).catch(()=>null)))},null,2));throw error;}
finally{await browser.close();relay.close();await new Promise(r=>server.close(r));}
