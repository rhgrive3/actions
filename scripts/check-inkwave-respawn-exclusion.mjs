#!/usr/bin/env node
// Real two-context Game/Actor + WebSocket/production relay acceptance.
// Position setup uses spawnAt; actual ingress/egress uses the keyboard controller
// and native Game._frame. This is not direct replay or a deployed relay test.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {WebSocketServer}=require(process.env.WS_MODULE||'ws');
import { createLocalRelay } from './lib/inkwave-local-relay-fixture.mjs';

const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);assert(!fs.existsSync(out),'preserve previous evidence');fs.mkdirSync(out,{recursive:true});
const baseline=process.argv.includes('--baseline');
const sixway=process.argv.includes('--sixway');assert(!(baseline&&sixway));
const hash=b=>createHash('sha256').update(b).digest('hex'),manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
if(sixway){assert.equal(manifest.inputHash,'09589df9b999fcad5c6ae7db6d9ad4519816ff0231736f2f5492ea4a1ff83003');assert.equal(manifest.contentHash,'8e3a99d990ef0f2185c0b013386c24b8e1c676975927a255efd6808ff2b0e09f');}
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{try{
  const url=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
  if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error();
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const relay=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(r=>relay.once('listening',r));
const connect=createLocalRelay(),wire=[];
relay.on('connection',(ws,req)=>connect(ws,req,{receive:raw=>{
  if(raw.startsWith('b|')){try{const d=JSON.parse(raw.slice(2));if(d.k==='t')wire.push({name:new URL(req.url,'http://local').searchParams.get('name'),ts:d.ts,tick:d.u,actors:d.a,...(sixway?{events:d.e}:{} )});}catch{}}
}}));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--disable-features=LocalNetworkAccessChecks','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const reads=[],pages=[],result={status:'running',baseline,sixway,site,build:manifest.contentHash,inputHash:manifest.inputHash,scriptSha256:hash(fs.readFileSync(new URL(import.meta.url))),responses:[],
  transport:'two browser contexts, real WebSockets, production Worker fetch/RoomDurableObject with local upgrade shim',
  limits:['Software Chromium; controlled native frame scheduling, not physical-device timing.','Local production relay shim, not public/deployed network or mixed-version clients.'],cases:[],errors:[]};
const write=()=>fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
const pump=async(count=1,hz=60)=>{for(let i=0;i<count;i++){
  await Promise.all(pages.map(p=>p.evaluate(({dt,sixway})=>{if(sixway&&NG.mode==='match'&&NG.level.spawnBarrier!==4.2)throw Error('native nonzero barrier changed');NG.game._skipRender=true;NG.game._frame(dt);},{dt:1/hz,sixway})));
  await new Promise(r=>setTimeout(r,12));
}};
const until=async(fn,label)=>{console.log('wait '+label);const deadline=Date.now()+180000;while(Date.now()<deadline){if(await fn())return;await pump();}throw Error('Timeout: '+label);};
try{
  const address='http://127.0.0.1:'+server.address().port+'/?map=tidewater&relay='+encodeURIComponent('ws://127.0.0.1:'+relay.address().port);
  for(let i=0;i<2;i++){
    console.log('boot peer '+i);
    const context=await browser.newContext({viewport:{width:900,height:620}});await context.grantPermissions(['local-network-access']);
    const page=await context.newPage();pages.push(page);page.on('pageerror',e=>result.errors.push(e.message));
    page.on('response',r=>{const u=new URL(r.url());if(sixway&&/\/src\/(?:main|game\/(?:actor|weapons)|net\/(?:netmatch|transport|session))\.js$|\/runtime\/(?:spawn-exclusion|spawn-pose-motion|respawn-lifecycle|weapon-handoff-motion|roller)\.mjs$/.test(u.pathname))reads.push(r.body().then(b=>result.responses.push({path:u.pathname,status:r.status(),sha256:hash(b)})));});
    await page.addInitScript(sixway=>{localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false,musicVolume:0,audioVolume:0}));if(sixway){localStorage.setItem('inkwave.profile',JSON.stringify({name:'Six-way Room',weapon:'roller',style:{hair:0,skin:2,outfit:0,eyes:0}}));localStorage.setItem('inkwave.splatoon3.gear.v1',JSON.stringify(Array.from({length:3},()=>({main:'none',subs:['none','none','none']}))));}},sixway);
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
  if(sixway)await Promise.all(pages.map(p=>p.evaluate(async()=>{if(NG.local.weaponId!=='roller')throw Error('Room roster did not retain Roller');for(const a of NG.actors){await a.character._sourceMotionLoader;if(a.character.sourceMotion?.ready)await a.character.sourceMotion.ready;}})));
  for(const hz of (baseline||sixway?[60]:[30,60,120]))for(let peer=0;peer<2;peer++)for(const jump of [false,true]){
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
    if(sixway){entry.maxOwnerHeight=Math.max(...own.filter(Boolean).map(a=>a.pos[1]-setup.pad[1]));entry.maxRemoteHeight=Math.max(...remote.filter(Boolean).map(a=>a.pos[1]-setup.pad[1]));entry.maxWireHeight=Math.max(...wireRows.map(a=>a[2]-setup.pad[1]));assert.equal(setup.radius,4.2);if(jump)for(const height of [entry.maxOwnerHeight,entry.maxRemoteHeight,entry.maxWireHeight])assert(height>.2,'keyboard jump must actually leave the floor on owner, wire and proxy');write();}
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
  if(!baseline&&!sixway){
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
  if(sixway){
    // Reuse this harness's real Room, controllers and paired Game._frame pump.
    // Observe births/paint without replacing their native implementation.
    await Promise.all(pages.map(p=>p.evaluate(async()=>{
      const {weaponHandoffSnapshot}=await import(new URL('patches/splatoon3/runtime/weapon-handoff-motion.mjs',document.baseURI));
      const {spawnPoseSnapshot,spawnMotionAllowsAction}=await import(new URL('patches/splatoon3/runtime/spawn-pose-motion.mjs',document.baseURI));
      const THREE=await import('three');globalThis.__sixRoom={births:[],paint:[],weaponHandoffSnapshot,spawnPoseSnapshot,spawnMotionAllowsAction,THREE};
      const ps=NG.projectiles,push=ps._push;
      const record=p=>__sixRoom.births.push({nid:p.owner?.nid,ghost:!!p.ghost,type:p.type,wid:p.wid,seed:p.seed,pos:p.pos.toArray(),vel:p.vel.toArray(),age:p.age,damage:p.damage});
      ps._push=function(p){const value=push.call(this,p);record(p);return value;};
      // Native ghostProjectile pushes directly to list rather than _push.
      // Observe its real post-admission records too; do not synthesize ghosts.
      const ghost=ps.ghostProjectile;ps.ghostProjectile=function(...args){const before=new Set(this.list),value=ghost.apply(this,args);for(const p of this.list)if(!before.has(p)&&p.ghost)record(p);return value;};
      const paint=NG.paint.splat;NG.paint.splat=function(p,r,team,o={}){const area=paint.call(this,p,r,team,o);__sixRoom.paint.push({pos:p.toArray(),radius:r,team,cosmetic:!!o.cosmetic,area});return area;};
      globalThis.__sixSnapshot=nid=>{
        const a=NG.actors.find(x=>x.nid===nid),c=a.character,d=__sixRoom;
        return {nid:a.nid,team:a.team,remote:a.remote,alive:a.alive,position:a.pos.toArray(),velocity:a.vel.toArray(),grounded:a.grounded,groundHit:a.ground.hit,barrier:NG.level.spawnBarrier,
          weapon:a.weaponId,phase:a.s3?.squidSpawn?.phase??null,armor:a.s3?.spawnArmor??null,ink:a.ink,turf:a.stats.turf,rolling:a.weaponRunner.rolling,flick:a.weaponRunner.flick,
          attack:a.weaponRunner.s3RollerAttack?{elapsed:a.weaponRunner.s3RollerAttack.elapsed,windup:a.weaponRunner.s3RollerAttack.windup}:null,
          display:d.weaponHandoffSnapshot(c),spawnPose:d.spawnPoseSnapshot(c),allowsAction:d.spawnMotionAllowsAction(c,true),sourceStatus:c.sourceMotion?.status,sourceHistory:c.sourceMotion?.renderedPose,
          channels:Array.from(c.P),timers:Array.from(c.tr),muzzle:c.getMuzzle(new d.THREE.Vector3()).toArray(),paintCounts:Array.from(NG.paint.counts),buffer:a.net?.buf?.length??0,
          births:d.births.filter(p=>p.nid===nid),live:NG.projectiles.list.filter(p=>p.owner?.nid===nid).map(p=>({ghost:!!p.ghost,type:p.type,wid:p.wid,seed:p.seed,pos:p.pos.toArray(),vel:p.vel.toArray(),age:p.age,damage:p.damage}))};
      };
      globalThis.__sixRender=nid=>{
        const a=NG.actors.find(x=>x.nid===nid),c=a.character,d=__sixRoom,T=d.THREE;
        // A controlled observer camera only; Actor/pose/physics stay native.
        NG.camera.position.copy(a.pos).add(new T.Vector3(4,3,-5));NG.camera.lookAt(a.pos.clone().add(new T.Vector3(0,.8,0)));NG.camera.updateMatrixWorld(true);
        NG.game.R.render();NG.renderer.getContext().finish();
        const v=new T.Vector3(),box=new T.Box3();let vertices=0;
        c.weapon.drum.traverseVisible(mesh=>{const p=mesh.geometry?.attributes?.position;if(p)for(let i=0;i<p.count;i++){mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);box.expandByPoint(v);vertices++;}});
        const hand=c.bones.handR.getWorldQuaternion(new T.Quaternion()).toArray(),pivot=c.weapon.pivot.getWorldQuaternion(new T.Quaternion()).toArray();
        return {...__sixSnapshot(nid),rendered:true,camera:NG.camera.position.toArray(),drum:{vertices,min:box.min.toArray(),max:box.max.toArray()},hand,pivot};
      };
    })));
    async function rendered(peer,nid,label){
      const row=await pages[peer].evaluate(nid=>__sixRender(nid),nid);
      await pages[peer].screenshot({path:path.join(out,label+'.png'),timeout:30000});return row;
    }
    for(let peer=0;peer<2;peer++){
      console.log('six-way friendly respawn/landing/first Roller attack peer '+peer);
      const wireStart=wire.length;
      const start=await pages[peer].evaluate(()=>{NG.game.input.keys.clear();NG.game.input.pressed.clear();NG.game.input.mouse.left=false;const a=NG.local;if(a.weaponId!=='roller'||NG.level.spawnBarrier!==4.2)throw Error('actual Roller/nonzero world required');a.invuln=0;a.splat(null,'fall');return{nid:a.nid,team:a.team};});
      await until(()=>pages[peer].evaluate(()=>NG.local.alive&&NG.local.s3?.squidSpawn?.phase==='aim'),'six-way real respawn aim');
      await pump(1);
      const aim=await pages[peer].evaluate(()=>{NG.rig.yaw=NG.local.team===0?0:Math.PI;NG.rig.pitch=-.8;return __sixSnapshot(NG.local.nid);});
      const entry={kind:'sixway-friendly-respawn-landing-first-roller',peer,...start,aim,status:'running'};result.cases.push(entry);write();
      assert.equal(aim.phase,'aim');assert.equal(aim.rolling,false);assert.equal(aim.barrier,4.2);
      await pages[peer].evaluate(()=>NG.game.debug.fire(true));
      await until(()=>pages[peer].evaluate(()=>NG.local.s3?.squidSpawn?.phase==='flight'),'six-way friendly native launch');
      await pages[peer].evaluate(()=>NG.game.debug.fire(false));
      let flightFrames=0;const flight=[];
      while(await pages[peer].evaluate(()=>!!NG.local.s3?.squidSpawn)){
        if(++flightFrames>300)throw Error('six-way supported landing timeout');await pump();
        const row=await pages[peer].evaluate(()=>__sixSnapshot(NG.local.nid));flight.push(row);
        if(row.phase)assert.equal(row.allowsAction,false,'active lifecycle retains action through native flight');
      }
      await pump(2);
      const landed=await rendered(peer,start.nid,'team-'+start.team+'-owner-landing');
      const proxy=await pages[1-peer].evaluate(nid=>__sixSnapshot(nid),start.nid);
      Object.assign(entry,{flightFrames,flight,landed,proxy});write();
      assert(landed.alive&&landed.grounded&&landed.groundHit&&!landed.phase);
      assert.equal(landed.weapon,'roller');assert.equal(landed.sourceStatus,'ready');
      assert(landed.display?.weight>0&&landed.display.weight<1,'real rendered landing fade is active');
      assert(landed.drum.vertices>0&&landed.drum.min[1]>=landed.position[1]-1e-5,'actual displayed drum clears supported landing floor');
      assert.equal(landed.rolling,false);assert.equal(landed.flick,-1);assert.equal(landed.ink,100);
      assert(proxy.remote&&proxy.buffer>0,'real Room proxy received respawn/launch samples');
      const birthStart=landed.births.length,paintStart=await pages[peer].evaluate(()=>__sixRoom.paint.length);
      await pages[peer].evaluate(()=>{NG.rig.pitch=-.35;NG.game.debug.fire(true);});await pump();
      const first=await pages[peer].evaluate(()=>__sixSnapshot(NG.local.nid));
      entry.first=first;write();
      assert(first.attack,'first deliberate supported press reaches the native Roller runner');assert.equal(first.display?.weight??0,0,'first attack immediately owns its displayed pose');
      const attacks=[];for(let i=0;i<90;i++){if(i===45)await pages[peer].evaluate(()=>NG.game.debug.key('KeyW',true));await pump();attacks.push(await pages[peer].evaluate(()=>__sixSnapshot(NG.local.nid)));}
      await pages[peer].evaluate(()=>{NG.game.debug.fire(false);NG.game.input.keys.clear();});
      const final=await rendered(peer,start.nid,'team-'+start.team+'-owner-first-attack');
      const remote=await pages[1-peer].evaluate(nid=>__sixSnapshot(nid),start.nid),births=final.births.slice(birthStart),remoteBirths=remote.births.filter(p=>p.ghost);
      const paints=await pages[peer].evaluate(index=>__sixRoom.paint.slice(index),paintStart);
      const events=wire.slice(wireStart).flatMap(t=>t.events||[]),projectileEvents=events.filter(e=>e[1]==='p'&&e[2]===start.nid);
      Object.assign(entry,{attacks,final,remote,projectileEvents,paints});write();
      assert(births.some(p=>!p.ghost&&p.wid==='roller'),'actual first native Roller projectile is observed');
      assert(remoteBirths.some(p=>p.wid==='roller'),'real remote instantiates the owner Roller projectile');
      assert(projectileEvents.length>0,'the real relay carries the native projectile event');
      assert(paints.some(p=>!p.cosmetic&&p.team===start.team&&p.area>0)&&final.turf>landed.turf,'first attack/held movement reaches actual CPU/GPU paint ownership');
      assert(attacks.some(r=>r.live.length>0)&&attacks.every(r=>(r.display?.weight??0)===0),'native shots and displayed attack are observed together');
      entry.status='passed';write();
    }
  }
  result.wireTicks=wire.length;assert(wire.length>20,'real transport must carry ticks');
  if(sixway){await Promise.all(reads);assert(result.responses.length>=20);for(const r of result.responses){assert.equal(r.status,200);assert.equal(r.sha256,manifest.artifacts[r.path.slice(1)]);}}
  assert.equal(result.errors.length,0);result.status='passed';write();
}catch(e){result.status='failed';result.error=e.stack;write();throw e;}
finally{await Promise.all(reads);write();fs.writeFileSync(path.join(out,'wire.json'),JSON.stringify(wire)+'\n');await browser.close();for(const ws of relay.clients)ws.terminate();await new Promise(r=>relay.close(r));await new Promise(r=>server.close(r));}
