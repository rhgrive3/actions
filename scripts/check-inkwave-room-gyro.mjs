#!/usr/bin/env node
// Built native session/transport/NetMatch + production relay. Async game setup
// is deliberately deferred; this is not a full rendered-match or hardware test.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {WebSocketServer} from 'ws';
import {RoomDurableObject} from '../server/src/index.js';
const site=path.resolve(process.argv[2]||'_site'), engines=process.argv.includes('--webkit')?['chromium','webkit']:['chromium'];
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
for(const [file,digest] of Object.entries(build.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,file))),digest,file);
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/probe'){
    res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="en"><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script><body></body></html>');return;
  }
  const file=path.resolve(site,'.'+url.pathname);
  if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const relay=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(r=>relay.once('listening',r));
const rooms=new Map(),wire=[],withheld=[];
relay.on('connection',(ws,req)=>{
  const url=new URL(req.url,'http://localhost'),code=url.pathname.split('/')[2],name=url.searchParams.get('name');
  let room=rooms.get(code);if(!room)rooms.set(code,room=new RoomDurableObject({},{}));
  room.handleSession({send(text){if(name==='Delay'&&text.includes('"welcome"'))withheld.push({ws,text});else if(ws.readyState===1)ws.send(text);},
    addEventListener:(name,fn)=>ws.on(name,name==='message'?data=>{wire.push(data.toString());fn({data:data.toString()});}:fn)},name);
});
const address=`http://127.0.0.1:${server.address().port}/probe?relay=${encodeURIComponent('ws://127.0.0.1:'+relay.address().port)}`;
const results=[];let browser;
try{
  for(const engine of engines){
    browser=await ({chromium,webkit}[engine]).launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-features=LocalNetworkAccessChecks']}: {})});
    const pages=[],errors=[];
    for(let i=0;i<2;i++){
      const page=await browser.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));await page.goto(address);
      await page.evaluate(async()=>{
        const {G}=await import('/src/core/ctx.js'),{NetSession}=await import('/src/net/session.js');
        globalThis.G=G;globalThis.count={bound:0,go:0};globalThis.stage=null;
        G.game={profile:{weapon:'shooter'},settings:{},menus:{launchLobby:async()=>{if(stage==='lobby')await gate;}},
          async startNetMatch(cfg,nm){
            if(stage==='world'||stage==='warmup')await gate;
            // Controlled scene setup: all networking methods remain native.
            const match={actors:[],state:'init',time:180};nm.bind(match);
            if(nm._disposed)return;
            G.match=this.match=match;count.bound++;
          },
          netMatchGo(){if(!this.match||this.match.state!=='init')throw Error('GO without bound scene');this.match.state='playing';count.go++;},
          netMatchAborted(){G.mode='menu';this.match=null;}};
        G.actors=[];G.net=new NetSession();
        globalThis.hold=kind=>{stage=kind;globalThis.gate=new Promise(r=>globalThis.release=r);};
      });
    }
    const [host,guest]=pages,code=await host.evaluate(()=>G.net.create('Host'));
    await guest.evaluate(code=>G.net.join(code,'Guest'),code);
    await host.waitForFunction(()=>G.net._members.size===2);
    const owners=await Promise.all(pages.map(p=>p.evaluate(()=>G.net.myId)));
    for(const stage of ['lobby','world','warmup']){
      const cfg={id:engine+'-'+stage,map:'',mode:'turf',roster:owners.map(owner=>({owner,bot:false}))};
      await guest.evaluate(({cfg,stage})=>{hold(stage);globalThis.pending=G.net._begin(cfg);},{cfg,stage});
      await host.evaluate(cfg=>{globalThis.pending=G.net._begin(cfg);},cfg);
      await host.waitForFunction(()=>G.net._setupReady);
      await host.evaluate(()=>{G.net.tr.broadcast({k:'go',id:'obsolete'});G.net._go();G.net.tr.broadcast({k:'go',id:G.net._startCfg.id});});
      await guest.waitForFunction(()=>G.net._goPending===G.net._startCfg.id);
      assert.deepEqual(await guest.evaluate(()=>({state:G.net.state,go:count.go,bound:count.bound})),{state:'starting',go:results.filter(x=>x.engine===engine&&x.stage).length,bound:results.filter(x=>x.engine===engine&&x.stage).length});
      await guest.evaluate(async()=>{release();await pending;});
      assert.equal(await guest.evaluate(()=>G.net.active&&G.net.match.match===G.game.match&&G.game.match.state==='playing'),true);
      const packetCount=wire.filter(x=>x.includes('"k":"ready"')&&x.includes(JSON.stringify(cfg.id))).length;assert.equal(packetCount,1);
      const guard=await guest.evaluate(()=>{const nm=G.net.match,m=G.game.match,n=nm.unsubs.length;nm.bind(m);const once=nm.unsubs.length===n;nm.dispose();const rejected=nm.bind(m)===false;return{once,rejected,cleared:G.netm===null,subscriptions:nm.unsubs.length};});
      assert.deepEqual(guard,{once:true,rejected:true,cleared:true,subscriptions:0});
      results.push({engine,stage,readyPackets:packetCount});
      await Promise.all(pages.map(p=>p.evaluate(()=>{G.net.endMatch();stage=null;})));
    }
    const abandonedCfg={id:engine+'-abandoned',map:'',mode:'turf',roster:owners.map(owner=>({owner,bot:false}))};
    await guest.evaluate(cfg=>{hold('warmup');globalThis.pending=G.net._begin(cfg);},abandonedCfg);
    await guest.waitForFunction(()=>G.net.match!==null);
    await host.evaluate(cfg=>{globalThis.pending=G.net._begin(cfg);},abandonedCfg);
    await host.waitForFunction(()=>G.net._setupReady);await host.evaluate(()=>G.net._go());
    await guest.waitForFunction(()=>G.net._goPending===G.net._startCfg.id);
    await guest.evaluate(()=>{globalThis.abandoned=G.net.match;G.net.tr.ws.close(1000,'probe disconnect');});
    await guest.waitForFunction(()=>G.net.state==='error'&&G.mode==='menu');
    await guest.evaluate(code=>G.net.join(code,'Reconnected'),code);
    await guest.evaluate(async()=>{release();await pending;});
    assert.deepEqual(await guest.evaluate(()=>({state:G.net.state,mode:G.mode,netm:G.netm,disposed:abandoned._disposed,subscriptions:abandoned.unsubs.length,bound:count.bound,go:count.go})),
      {state:'lobby',mode:'menu',netm:null,disposed:true,subscriptions:0,bound:3,go:3});
    await host.evaluate(()=>G.net.endMatch());results.push({engine,disconnectDuringWarmup:true});
    // Existing #1167 guards: withheld welcome, cancellation, successful retry,
    // then passage beyond the original 8-second deadline on a real socket.
    await guest.clock.install();
    await guest.evaluate(code=>{globalThis.cancelled=G.net.join(code,'Delay').then(()=>false,e=>e.name);},code);
    await guest.waitForFunction(()=>G.net.tr?.ws?.readyState===1);
    assert.ok(withheld.length>0,'Relay actually withheld welcome');
    await guest.evaluate(()=>G.net.leave());assert.equal(await guest.evaluate(()=>cancelled),'AbortError');
    await guest.evaluate(code=>G.net.join(code,'Retry'),code);
    await guest.clock.fastForward(8100);
    assert.equal(await guest.evaluate(()=>G.net.state==='lobby'&&G.net.tr.open),true);
    results.push({engine,cancelRetry:true});
    await Promise.all(pages.map(p=>p.evaluate(()=>G.net.leave())));
    const gyro=await browser.newPage();gyro.on('pageerror',e=>errors.push(e.message));await gyro.goto(address);await gyro.clock.install();
    await gyro.evaluate(async()=>{
      globalThis.prompts=0;Object.defineProperty(window,'DeviceOrientationEvent',{configurable:true,value:class {static requestPermission(){prompts++;return Promise.resolve('granted');}}});
      const {MobileInput}=await import('/src/core/mobile.js');globalThis.m=new MobileInput(document.createElement('canvas'),{});
      document.documentElement.lang='en';
      m.active=true;m.visible=true;m.root=document.createElement('div');m.els={gyro:document.createElement('button')};m.root.append(m.els.gyro);document.body.append(m.root);
      m._layoutAll=()=>{};globalThis.notices=[];m.toast=text=>notices.push(text);
      globalThis.orient=alpha=>{const e=Object.assign(new Event('deviceorientation'),{alpha,beta:0,gamma:0});Object.defineProperty(e,'timeStamp',{value:performance.now()});window.dispatchEvent(e);};
      await m.setGyro(true);orient(0);
    });
    for(let i=0;i<3;i++){
      await gyro.clock.fastForward(15001);
      assert.deepEqual(await gyro.evaluate(()=>({state:m.gyro.platformStatus.state,enabled:m.gyro.enabled,saved:m.s.gyro,pressed:m.els.gyro.getAttribute('aria-pressed'),prompts})),{state:'supported-stale',enabled:true,saved:true,pressed:'true',prompts:1});
      assert.equal(await gyro.evaluate(()=>/No recent gyro samples/.test(m.els.gyro.title)),true);
      await gyro.evaluate(()=>{orient(120);const d=m.gyro.consume({yaw:0,pitch:0});if(d.yaw||d.pitch)throw Error('Recovery aim spike');});
      await gyro.clock.runFor(17);await gyro.evaluate(()=>orient(130));
      const motion=await gyro.evaluate(()=>({delta:m.gyro.consume({yaw:0,pitch:0}),hasQ:m.gyro._hasQ,time:m.gyro._tQ,now:performance.now(),focus:m.gyro._platformGyroAccess.lifecycle.focused,quality:m.gyro._qualityGyro}));
      assert.ok(Math.abs(motion.delta.yaw)+Math.abs(motion.delta.pitch)>0,JSON.stringify(motion));
    }
    assert.equal(await gyro.evaluate(()=>notices.length),3);await gyro.evaluate(()=>m.destroy());
    assert.deepEqual(errors,[]);results.push({engine,gyroOutages:3,permissionPrompts:1});
    await browser.close();browser=null;
  }
  console.log(JSON.stringify({status:'passed',contentHash:build.contentHash,transport:'native WebSocket + RoomDurableObject',sensor:'synthetic orientation; no device hardware claim',results},null,2));
}finally{
  await browser?.close();for(const ws of relay.clients)ws.terminate();await new Promise(r=>relay.close(r));await new Promise(r=>server.close(r));
}
