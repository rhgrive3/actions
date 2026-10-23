#!/usr/bin/env node
// Real two-context Game/Actor + WebSocket/production relay acceptance.
// Position setup uses spawnAt; actual ingress/egress uses the keyboard controller
// and native Game._frame. This is not direct replay or a deployed relay test.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { WebSocketServer } from 'ws';
import { createLocalRelay } from './lib/inkwave-local-relay-fixture.mjs';

const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
const baseline=process.argv.includes('--baseline');
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{try{
  const url=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
  if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error();
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const relay=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(r=>relay.once('listening',r));
const connect=createLocalRelay(),wire=[];
relay.on('connection',(ws,req)=>connect(ws,req,{receive:raw=>{
  if(raw.startsWith('b|')){try{const d=JSON.parse(raw.slice(2));if(d.k==='t')wire.push({name:new URL(req.url,'http://local').searchParams.get('name'),ts:d.ts,tick:d.u,actors:d.a});}catch{}}
}}));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--disable-features=LocalNetworkAccessChecks','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const pages=[],result={status:'running',baseline,site,build:JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))).contentHash,
  transport:'two browser contexts, real WebSockets, production Worker fetch/RoomDurableObject with local upgrade shim',
  limits:['Software Chromium; controlled native frame scheduling, not physical-device timing.','Local production relay shim, not public/deployed network or mixed-version clients.'],cases:[],errors:[]};
const write=()=>fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
const pump=async(count=1,hz=60)=>{for(let i=0;i<count;i++){
  await Promise.all(pages.map(p=>p.evaluate(dt=>{NG.game._skipRender=true;NG.game._frame(dt);},1/hz)));
  await new Promise(r=>setTimeout(r,12));
}};
const until=async(fn,label)=>{console.log('wait '+label);const deadline=Date.now()+180000;while(Date.now()<deadline){if(await fn())return;await pump();}throw Error('Timeout: '+label);};
try{
  const address='http://127.0.0.1:'+server.address().port+'/?map=tidewater&relay='+encodeURIComponent('ws://127.0.0.1:'+relay.address().port);
  for(let i=0;i<2;i++){
    console.log('boot peer '+i);
    const context=await browser.newContext({viewport:{width:900,height:620}});await context.grantPermissions(['local-network-access']);
    const page=await context.newPage();pages.push(page);page.on('pageerror',e=>result.errors.push(e.message));
    await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false,musicVolume:0,audioVolume:0})));
    await page.goto(address,{waitUntil:'domcontentloaded'});
    await page.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
    await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});
    assert.equal(await page.locator('#boot-error').textContent(),'');
    await page.evaluate(()=>{NG.game.debug.freeze();NG.game._skipRender=true;});
  }
  async function start(reconnect=false){
    if(reconnect){await Promise.all(pages.map(p=>p.evaluate(()=>{NG.game.netMatchEnd();NG.net.leave();})));await pump(5);}
    const code=await pages[0].evaluate(()=>NG.net.create('Spawn Host'));
    await pages[1].evaluate(c=>NG.net.join(c,'Spawn Guest'),code);
    await until(async()=> (await Promise.all(pages.map(p=>p.evaluate(()=>NG.net.lobby.players.length===2)))).every(Boolean),'room membership');
    await pages[0].evaluate(()=>NG.net.setSettings({map:'tidewater',mode:'turf',bots:true}));
    await until(()=>pages[1].evaluate(()=>NG.net.lobby.map==='tidewater'),'settings');
    await pages[0].evaluate(()=>{if(!NG.net.confirmTeams())throw Error('Teams refused');});
    await until(()=>pages[1].evaluate(()=>NG.net.lobby.teamsConfirmed),'teams');
    await pages[1].evaluate(()=>NG.net.setMe({ready:true}));await pages[0].evaluate(()=>NG.net.setMe({ready:true}));
    await until(()=>pages[0].evaluate(()=>NG.net.canStart()),'ready');
    await pages[0].evaluate(()=>{if(!NG.net.start())throw Error('Start refused');});
    await until(async()=> (await Promise.all(pages.map(p=>p.evaluate(()=>!!NG.netm?.match&&NG.match?.state==='playing')))).every(Boolean),'playing');
    await pump(100);
    await Promise.all(pages.map(p=>p.evaluate(()=>{NG.game.debug.freezeBots();NG.game.input.keys.clear();})));
    return pages[0].evaluate(()=>NG.netm.cfg.id);
  }
  result.match=await start();console.log('playing '+result.match);
  result.opening=await Promise.all(pages.map(p=>p.evaluate(()=>NG.actors.filter(a=>!a.remote).map(a=>({nid:a.nid,team:a.team,alive:a.alive,spawn:a.s3?.squidSpawn?.phase||null,pos:a.pos.toArray()})))));write();
  async function sample(){return Promise.all(pages.map(p=>p.evaluate(()=>NG.actors.map(a=>({nid:a.nid,team:a.team,owner:a.owner,remote:a.remote,alive:a.alive,pos:a.pos.toArray(),vel:a.vel.toArray(),buffer:a.net?.buf?.length||0,netTp:a.netTp||0})))));}
  for(const hz of (baseline?[60]:[30,60,120]))for(let peer=0;peer<2;peer++)for(const jump of [false,true]){
    console.log('ingress '+JSON.stringify({hz,peer,jump}));
    const wireStart=wire.length;
    const setup=await pages[peer].evaluate(jump=>{
      const a=NG.local,pad=NG.level.spawnPads[1-a.team],r=NG.level.spawnBarrier;
      delete a.s3.squidSpawn;a.spawnAt(pad.clone().add({x:-r-.65,y:0,z:0}),Math.PI/2);a.invuln=0;
      NG.rig.yaw=Math.PI/2;NG.rig.pitch=-.2;NG.game.input.keys.clear();NG.game.debug.key('KeyW',true);if(jump)NG.game.debug.key('Space',true);
      return{team:a.team,nid:a.nid,pad:pad.toArray(),radius:r,start:a.pos.toArray()};
    },jump);
    const traces=[];
    for(let i=0;i<hz*2;i++){await pump(1,hz);traces.push(await sample());}
    await pages[peer].evaluate(()=>NG.game.input.keys.clear());
    const own=traces.map(row=>row[peer].find(a=>a.nid===setup.nid)),remote=traces.map(row=>row[1-peer].find(a=>a.nid===setup.nid));
    const active=a=>a?.alive&&a.pos[1]>setup.pad[1]-1;
    const dist=a=>Math.hypot(a.pos[0]-setup.pad[0],a.pos[2]-setup.pad[2]);
    const minOwner=Math.min(...own.filter(active).map(dist)),minRemote=Math.min(...remote.filter(active).map(dist));
    const wireRows=wire.slice(wireStart).flatMap(t=>t.actors||[]).filter(a=>a[0]===setup.nid&&a[2]>setup.pad[1]-1);
    const minWire=Math.min(...wireRows.map(a=>Math.hypot(a[1]-setup.pad[0],a[3]-setup.pad[2])));
    const entry={kind:'ingress',hz,peer,jump,...setup,minOwner,minRemote,ownerCrossed:minOwner<setup.radius-.01,
      minWire,wireRows:wireRows.length,remoteReceived:remote.some(a=>a?.remote&&a.buffer>0),traces};result.cases.push(entry);write();
    if(baseline)assert(entry.ownerCrossed,'baseline must reproduce actual ingress');
    else {
      for(const minimum of [minOwner,minRemote,minWire])assert(minimum>=setup.radius+.35&&minimum<=setup.radius+.65,'owner, wire and real remote must reach the protected edge');
      assert(entry.remoteReceived);assert(wireRows.length>0);
    }
    if(hz===60&&!jump){
      await pages[peer].evaluate(()=>{NG.renderer.render(NG.scene,NG.camera);NG.renderer.getContext().finish();});
      await pages[peer].screenshot({path:path.join(out,'enemy-team-'+setup.team+'.png'),timeout:60000});
    }
    // Same owning actor can leave its own pad normally. Keyboard path only.
    const exit=await pages[peer].evaluate(()=>{const a=NG.local,pad=NG.level.spawnPads[a.team];a.spawnAt(pad,Math.PI/2);NG.rig.yaw=Math.PI/2;NG.game.debug.key('KeyW',true);return {pad:pad.toArray(),start:a.pos.toArray(),team:a.team};});
    await pump(hz*2,hz);
    const end=await pages[peer].evaluate(()=>{NG.game.input.keys.clear();return NG.local.pos.toArray();});
    const displacement=Math.hypot(end[0]-exit.pad[0],end[2]-exit.pad[2]);
    result.cases.push({kind:'allied-exit',hz,peer,jump,...exit,end,displacement});assert(displacement>4.5,'allied exit blocked');write();
  }
  if(!baseline){
    for(let peer=0;peer<2;peer++){
      console.log('respawn/superjump peer '+peer);
      await pages[peer].evaluate(()=>{NG.local.invuln=0;NG.local.splat(null,'fall');});
      await until(()=>pages[peer].evaluate(()=>NG.local.alive&&NG.local.s3?.squidSpawn?.phase==='aim'),'respawn aim');
      const aim=await pages[peer].evaluate(()=>{NG.rig.yaw=NG.local.team===0?0:Math.PI;NG.rig.pitch=-.8;NG.game.input.mouse.left=true;return NG.local.pos.toArray();});
      await until(()=>pages[peer].evaluate(()=>NG.local.s3?.squidSpawn?.phase==='flight'),'respawn launch');
      await pages[peer].evaluate(()=>NG.game.input.mouse.left=false);
      await until(()=>pages[peer].evaluate(()=>!NG.local.s3?.squidSpawn),'respawn landing');
      const landed=await pages[peer].evaluate(()=>({team:NG.local.team,pos:NG.local.pos.toArray(),grounded:NG.local.grounded,alive:NG.local.alive,invuln:NG.local.invuln}));
      assert(landed.alive&&landed.grounded);
      // Real native Super Jump admission/charge/flight, fixed own-pad target.
      const admitted=await pages[peer].evaluate(()=>NG.local.superJump(NG.level.spawnPads[NG.local.team].clone()));assert(admitted);
      await until(()=>pages[peer].evaluate(()=>NG.local.superJumpState?.phase==='flight'),'home Super Jump flight');
      await until(()=>pages[peer].evaluate(()=>!NG.local.superJumpState),'home Super Jump landing');
      const home=await pages[peer].evaluate(()=>({pos:NG.local.pos.toArray(),pad:NG.level.spawnPads[NG.local.team].toArray(),alive:NG.local.alive}));
      assert(home.alive);assert(Math.hypot(home.pos[0]-home.pad[0],home.pos[2]-home.pad[2])<.2);
      result.cases.push({kind:'respawn-and-home-superjump',peer,aim,landed,home});write();
    }
    // Supply an inward intent to a real host-owned bot. This exercises its
    // authoritative Actor + real relay proxy, not autonomous AI route choice.
    const bot=await pages[0].evaluate(()=>{
      const a=NG.actors.find(a=>a.bot&&!a.remote),pad=NG.level.spawnPads[1-a.team];
      a.spawnAt(pad.clone().add({x:-NG.level.spawnBarrier-.65,y:0,z:0}),Math.PI/2);
      a.bot.update=()=>{a.intent.move.set(1,0,0);a.intent.fire=a.intent.jump=false;};
      return{nid:a.nid,team:a.team,pad:pad.toArray(),radius:NG.level.spawnBarrier};
    });
    await pump(120);
    const botRows=(await sample()).map(row=>row.find(a=>a.nid===bot.nid));
    assert(botRows[0]&&!botRows[0].remote&&botRows[1]?.remote&&botRows[1].buffer>0);
    for(const a of botRows)assert(Math.hypot(a.pos[0]-bot.pad[0],a.pos[2]-bot.pad[2])>=bot.radius+.35);
    result.cases.push({kind:'host-owned-bot-inward-intent',...bot,rows:botRows});write();
    const previous=result.match;result.reconnectMatch=await start(true);assert.notEqual(result.reconnectMatch,previous);
    const a=await sample();assert(a.every(row=>row.length===8));result.reconnect={actors:a};
  }
  result.wireTicks=wire.length;assert(wire.length>20,'real transport must carry ticks');
  assert.equal(result.errors.length,0);result.status='passed';write();
}catch(e){result.status='failed';result.error=e.stack;write();throw e;}
finally{fs.writeFileSync(path.join(out,'wire.json'),JSON.stringify(wire)+'\n');await browser.close();await new Promise(r=>relay.close(r));await new Promise(r=>server.close(r));}
