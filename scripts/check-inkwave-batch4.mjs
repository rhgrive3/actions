#!/usr/bin/env node
// Emitted native Menus + NetSession/NetMatch, two isolated browser contexts.
// Packet transport is controlled; no retail timing or physical-device claim.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {chromium,webkit} from 'playwright';
const site=path.resolve(process.argv[2]||'_site');
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
for(const [p,digest] of Object.entries(manifest.artifacts))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(site,p))).digest('hex'),digest,p);
const html=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles/ui.css"><link rel="stylesheet" href="/styles/mobile.css"><link rel="stylesheet" href="/patches/splatoon3/ui.css"><style>body{margin:0;background:#121629}#ui-root{position:fixed;inset:0}</style><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script><div id="ui-root"></div>`;
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/probe'){res.setHeader('content-type','text/html');res.end(html);return;}const p=path.resolve(site,'.'+url.pathname);if(!p.startsWith(site+path.sep)||!fs.existsSync(p)){res.writeHead(404);res.end();return;}res.setHeader('content-type',mime[path.extname(p)]||'application/octet-stream');fs.createReadStream(p).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 const results=[];
 for(const engine of process.argv.includes('--webkit')?['chromium','webkit']:['chromium']){
  browser=await ({chromium,webkit}[engine]).launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']}: {})});
  for(const touch of [false,true]){
   const contexts=[],pages=[],errors=[];
   for(const id of ['host','guest']){
    const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1440,height:900},hasTouch:touch,reducedMotion:'reduce'}),page=await context.newPage();contexts.push(context);pages.push(page);page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/probe`);
    await page.evaluate(async id=>{
     const THREE=await import('three'),{G}=await import('/src/core/ctx.js'),{Actor}=await import('/src/game/actor.js'),{Projectiles}=await import('/src/game/weapons.js'),{NetMatch}=await import('/src/net/netmatch.js'),{NetSession}=await import('/src/net/session.js'),{Menus}=await import('/src/ui/menus.js'),{DEFAULT_SETTINGS}=await import('/src/config.js');
     const profile=await fetch('/patches/splatoon3/profile.json').then(r=>r.json());(await import('/patches/splatoon3/runtime/install.mjs')).install(profile);
     const fidelity=await import('/patches/splatoon3/runtime/disconnect-fidelity.mjs');fidelity.installDisconnectFidelity({G,NetMatch});
     G.time=0;G.scene=new THREE.Scene();G.teamColors=[new THREE.Color('#f80'),new THREE.Color('#03f')];G.settings={...DEFAULT_SETTINGS};G.camera={position:new THREE.Vector3()};
     G.level={blocks:[],groundHeight:()=>0};G.physics={segment:(_a,_b,h)=>{h.hit=false;return h;},raycast:(_a,_b,_c,h)=>{h.hit=false;return h;},los:()=>true};G.paint={sample:()=>0,splat:()=>0};G.projectiles=new Projectiles(G.scene);
     class Display{constructor(a){this.actor=a;this.root=new THREE.Group();this.style={};}_owner(){return this.actor;}_runner(){return this.actor.weaponRunner;}trigger(){}setVisible(){}setHurt(){}setWeapon(){}getMuzzle(out){return out.copy(this.actor.pos).add(new THREE.Vector3(0,1.05,0));}}
     const actors=Array.from({length:8},(_,n)=>{const a=new Actor({team:n<4?0:1,name:'Actor '+n,weapon:'shooter',CharacterClass:Display});a.nid=n;a.owner=n<4?'host':'guest';a.remote=a.owner!==id;a.netLife=1;a.alive=true;a.isBot=false;return a;});
     G.actors=actors;G.local=actors.find(a=>a.owner===id);G.local.isLocal=true;
     const m=G.match={mode:'turf',state:'playing',duration:180,time:180,actors,local:G.local,playing:()=>m.state==='playing',removeActor(a){this.actors=this.actors.filter(x=>x!==a);}};
     const s=G.net=new NetSession();s.myId=id;s.hostId='host';s.state='match';s.code='TEST3';s._members=new Map([['host','Host'],['guest','Guest']]);s.lobby.players=['host','guest'].map((id,i)=>({id,name:id,team:i,weapon:'shooter',ready:false,style:{}}));
     window.messages=[];s.tr={broadcast:d=>messages.push({d:structuredClone(d)}),sendTo:(to,d)=>messages.push({to,d:structuredClone(d)}),lock(){},rtt:0};
     const nm=s.match=new NetMatch(s,{id:'batch4-room',map:'tidewater'});nm.bind(m);
     window.ended=0;const account={name:id,level:1,xp:0,weapon:'shooter',style:{}};G.game={profile:account,netMatchEnd(){if(s.state==='lobby')return;ended++;s.endMatch();menus.show('lobby',{wipe:false});}};
     const api={getSettings:()=>G.settings,setSettings:v=>Object.assign(G.settings,v),getProfile:()=>account,getLoadout:()=>({weapon:account.weapon}),setLoadout:v=>account.weapon=v.weapon,setProfileStyle:v=>account.style=v,
      netContinue:choice=>{if(choice==='keep')s.setMe({weapon:account.weapon,style:account.style});return fidelity.chooseOnlineContinuation(nm,choice);},quitMatch:()=>{window.left=true;},rematch:()=>{throw Error('online must not use offline rematch');}};
     window.menus=new Menus(document.getElementById('ui-root'),api);window.G=G;window.nm=nm;window.account=account;window.profile=profile;
     window.tickWire=frame=>{m.time=180-frame/60;nm._sendTick();};window.receive=(from,d)=>s._message(from,d);
     window.results=()=>{m.state='results';const d=menus._demoResults();d.online=true;menus.showResults(d);window.resultBefore=JSON.stringify(menus._results);menus.wipe.cancel();menus.show('results',{force:true,wipe:false});};
    },id);
   }
   const pump=async()=>{for(let n=0;n<20;n++){let count=0;for(let i=0;i<2;i++){const packets=await pages[i].evaluate(()=>messages.splice(0));count+=packets.length;for(const {to,d} of packets)if(!to||to===['host','guest'][1-i])await pages[1-i].evaluate(({from,d})=>receive(from,d),{from:['host','guest'][i],d});}if(!count)return;}throw Error('packet loop');};
   // Full owner histories cross two JS realms. Delay all four splats until the
   // next packet; proxies need not replay them before the bonus is accepted.
   for(const page of pages)await page.evaluate(()=>tickWire(1));await pump();
   await pages[1].evaluate(()=>{G.match.time=179;for(const a of G.match.actors.slice(4)){a.alive=false;nm._onLocalEvent('splatted',{victim:a,attacker:G.match.actors[0]});}tickWire(61);});await pages[0].evaluate(()=>tickWire(61));await pump();
   for(const page of pages)assert(await page.evaluate(()=>G.match.actors.slice(0,4).every(a=>a.s3.flow.score===profile.flow.progress.wipeoutBonus*profile.flow.threshold/profile.flow.progress.referenceThreshold)),'online +10fp on both peers');
   for(const page of pages)await page.evaluate(()=>results());
   const settle=async page=>{await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});await page.waitForFunction(()=>performance.now()-menus._shownAt>=220);};
   const press=async(page,selector)=>{await settle(page);const e=page.locator(selector).first();await e.scrollIntoViewIfNeeded();await (touch?e.tap():e.click());};
   await press(pages[0],'[data-id="keep-going"]');await pump();assert.equal(await pages[0].evaluate(()=>ended),0);
   await press(pages[1],'[data-id="change-gear-continue"]');await pump();await pages[1].waitForFunction(()=>menus.current==='loadout');
   const gear=pages[1].locator('.s3-gear select').first();await pages[1].locator('.s3-gear summary').click();await gear.selectOption('swimSpeed');
   await press(pages[1],'[data-id="w-roller"]');assert.equal(await pages[1].evaluate(()=>account.weapon),'roller');
   await press(pages[1],'.iw-loadout .iw-backbtn');await pages[1].waitForFunction(()=>menus.current==='results');await pump();assert.equal(await pages[0].evaluate(()=>ended),0);
   assert(await pages[1].evaluate(()=>JSON.stringify(menus._results)===resultBefore),'old result identity/data');
   await press(pages[1],'[data-id="change-gear-continue"]');await pages[1].waitForFunction(()=>menus.current==='loadout');
   assert.equal(await pages[1].locator('.s3-gear select').first().inputValue(),'swimSpeed');
   await press(pages[1],'[data-id="continue-with-gear"]');await pump();
   for(const page of pages){await page.waitForFunction(()=>menus.current==='lobby');assert.equal(await page.evaluate(()=>ended),1);assert(await page.evaluate(()=>G.net.lobby.players.every(p=>p.ready)));}
   assert.equal(await pages[0].evaluate(()=>G.net.lobby.players.find(p=>p.id==='guest').weapon),'roller');assert.deepEqual(errors,[]);
   results.push({engine,touch,onlineWipeoutPeers:2,gear:'swimSpeed',nextWeapon:'roller',readyPlayers:2,matchEnds:1});
   for(const context of contexts)await context.close();
  }
  await browser.close();browser=null;
 }
 console.log(JSON.stringify({source:process.env.SOURCE_SHA||null,build:manifest.build.revision,workerBytes:fs.statSync(path.join(site,'sw.js')).size,results},null,2));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
