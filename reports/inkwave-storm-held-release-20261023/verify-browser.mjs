import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {WebSocketServer} from 'ws';
import {createLocalRelay} from '/workspace/actions/scripts/lib/inkwave-local-relay-fixture.mjs';
import {publicBuildIdentity,verifyPublishedSource} from '/workspace/actions/scripts/lib/inkwave-public-boot-evidence.mjs';

const root='/workspace/storm-held-release',variant=process.argv[2],site=path.join(root,'site-'+variant),out=path.join(root,'evidence',variant);
fs.mkdirSync(out,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const frozen='726e338ac256ba9609086ce65e25a68ddd99df85';
const original=JSON.parse(fs.readFileSync(path.join(root,'site-baseline/inkwave-build.json')));
verifyPublishedSource(original,'/workspace/actions',frozen);
const changedInputs=Object.keys(manifest.files).filter(k=>manifest.files[k]!==original.files[k]);
assert.deepEqual(changedInputs,variant==='candidate'?['network-replication/adapter.mjs']:[]);
assert.deepEqual(Object.keys(manifest.files),Object.keys(original.files));
for(const [f,h] of Object.entries(manifest.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,f))),h,f);
const adapter=fs.readFileSync(path.join(variant==='candidate'?root+'/candidate':'/workspace/actions','patches/network-replication/adapter.mjs'));
const report={status:'running',variant,frozenBase:frozen,...publicBuildIdentity(manifest),changedInputs,
 adapterSha256:hash(adapter),adapterBlob:execFileSync('git',['hash-object','--stdin'],{input:adapter,encoding:'utf8'}).trim(),
 patchSha256:variant==='candidate'?hash(fs.readFileSync(root+'/runtime.patch')):null,
 scope:'Full production Game/Match/Actor/Character and minified build, two isolated browser contexts, native Input/Controller, real browser WebSockets and production Worker/RoomDurableObject via existing Node platform shim. Controlled paid gauge setup and frozen native frame stepping; native clocks, nonce and authority guards unchanged.',
 launchArgs:['--no-sandbox','--disable-dev-shm-usage'],cases:[],errors:[],wire:[],connections:[],responses:[],limits:['Local relay platform adapter, not deployed Cloudflare service.','Shared Chromium process and software/cloud rendering; no physical-device pacing or Nintendo comparison.','No late inactive/dead endpoint fix claimed.']};
const write=()=>fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2)+'\n');
fs.copyFileSync(path.join(site,'inkwave-build.json'),path.join(out,'build-identity.json'));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{try{
 const rel=decodeURIComponent(new URL(req.url,'http://local').pathname),f=path.resolve(site,'.'+(rel==='/'?'/index.html':rel));
 if(rel==='/favicon.ico'){res.writeHead(204).end();return;}
 if(!f.startsWith(site+'/')||!fs.statSync(f).isFile())throw Error('missing');
 res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(f).pipe(res);
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const relay=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(r=>relay.once('listening',r));
const connectRelay=createLocalRelay({rooms:new Map()});let duplicateArmed=false;
function payload(raw){try{let s=raw;if(s.startsWith('m|')){s=s.slice(s.indexOf('|',2)+1);if(s.startsWith('@'))s=s.slice(s.indexOf('|')+1);}else if(s.startsWith('b|'))s=s.slice(2);else if(s.startsWith('s|'))s=s.slice(s.indexOf('|',2)+1);return JSON.parse(s);}catch{return null;}}
relay.on('connection',(ws,req)=>{
 const name=new URL(req.url,'http://local').searchParams.get('name');report.connections.push({name,event:'open',at:Date.now()});
 ws.on('close',()=>report.connections.push({name,event:'close',at:Date.now()}));
 connectRelay(ws,req,{receive:raw=>{const d=payload(raw);report.wire.push({direction:'received-by-relay',name,at:Date.now(),sha256:hash(raw),bytes:Buffer.byteLength(raw),kind:d?.k,ts:d?.ts,u:d?.u,events:d?.e});},send:(raw,deliver)=>{
  const d=payload(raw);if(d?.k==='t')report.wire.push({direction:'delivered-to-browser',name,at:Date.now(),sha256:hash(raw),bytes:Buffer.byteLength(raw),kind:d.k,ts:d.ts,u:d.u,events:d.e});
  deliver(raw);
  if(duplicateArmed&&d?.e?.some(e=>e[1]==='b'&&e[3]==='storm')){duplicateArmed=false;deliver(raw);report.duplicate={name,at:Date.now(),sha256:hash(raw),kind:'byte-identical relay delivery'};}
 }});
});
const address='http://127.0.0.1:'+server.address().port+'/?map=tidewater&skipTitle&relay='+encodeURIComponent('ws://127.0.0.1:'+relay.address().port);
const pages=[];let browser;
const step=async n=>{for(let i=0;i<n;i++){
 const begin=Date.now();await Promise.all(pages.map(p=>p.evaluate(()=>{NG.game._skipRender=true;NG.game._frame(1/60);})));const wait=Math.max(0,17-(Date.now()-begin));await new Promise(r=>setTimeout(r,wait));
}};
const until=async(test,label,seconds=45)=>{const deadline=Date.now()+seconds*1000;while(Date.now()<deadline){if(await test())return;await step(1);}throw Error('Timed out: '+label);};
const state=()=>Promise.all(pages.map(p=>p.evaluate(()=>{const G=NG;return {id:G.net.myId,net:G.net.state,active:G.net.active,mode:G.mode,match:G.netm?.cfg.id,state:G.match?.state,time:G.time,clockNative:Function.prototype.toString.call(performance.now).includes('[native code]'),
 actors:G.actors.map(a=>({nid:a.nid,owner:a.owner,remote:a.remote,alive:a.alive,life:a.netLife,weapon:a.weaponId,actorClass:a.constructor.name,characterClass:a.character.constructor.name,meshChildren:a.character.root.children.length,special:a.specialActive,buffer:a.net?.buf.length,auth:a.net?._stormBirthAuth?{...a.net._stormBirthAuth,epoch:!!a.net._stormBirthAuth.epoch}:null,epoch:!!a.net?._stormEpoch})),
 peers:G.netm?[...G.netm.peers].map(([id,p])=>({id,lastTs:p.lastTs,tr:p.tr,sim:p.sim,lastEventSeq:p._lastEventSeq,queued:p.events.length,physics:p.physicsPoints?.slice(-4)})):[],trace:globalThis.stormTrace||null,
 bombs:G.projectiles.bombs.map(b=>({kind:b.kind,ghost:!!b.ghost,owner:b.owner.nid,pos:b.pos.toArray(),visible:b.group?.visible,age:b.age})),clouds:G.projectiles.clouds.map(c=>({ghost:!!c.ghost,owner:c.owner.nid,pos:c.group.position.toArray(),visible:c.group.visible,t:c.t}))};})));
const screenshot=async(label,kind)=>{
 const page=pages[1],render=await page.evaluate(kind=>{const G=NG,b=kind==='canister'?G.projectiles.bombs.find(b=>b.ghost&&b.kind==='storm'):G.projectiles.clouds.find(c=>c.ghost);const target=b?(b.pos||b.group.position):G.actors.find(a=>a.remote).pos;
 G.camera.position.copy(target).add({x:kind==='cloud'?12:7,y:kind==='cloud'?7:5,z:-10});G.camera.lookAt(target);G.renderer.render(G.scene,G.camera);
 const gl=G.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {target:target.toArray(),drawCalls:G.renderer.info.render.calls,triangles:G.renderer.info.render.triangles,contextLost:gl.isContextLost(),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),observedObject:!!b};},kind);
 await page.screenshot({path:path.join(out,label+'.png'),timeout:30000});return render;
};
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:report.launchArgs});report.browser=browser.version();write();
 for(let i=0;i<2;i++){
  const context=await browser.newContext({viewport:{width:960,height:640},serviceWorkers:'block'}),page=await context.newPage();pages.push(page);
  page.on('pageerror',e=>{report.errors.push({peer:i,error:String(e)});console.log('pageerror '+i+' '+e.message);});
  page.on('console',m=>{if(m.type()==='error')console.log('console '+i+' '+m.text().slice(0,400));});
  const responses=new Map();page.on('response',async response=>{const f=decodeURIComponent(new URL(response.url()).pathname).slice(1)||'index.html';if(!manifest.artifacts[f])return;
   let bytes;try{bytes=await response.body();}catch(e){(report.responseUnavailable??=[]).push({peer:i,file:f,error:String(e)});return;}
   try{assert.equal(hash(bytes),manifest.artifacts[f],f);responses.set(f,{peer:i,file:f,sha256:hash(bytes),bytes:bytes.length});}catch(e){report.errors.push({peer:i,responseError:String(e)});}
  });
  report.responses.push(responses);
  await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false,musicVolume:0})));
  console.log(variant+' boot peer '+i);await page.goto(address,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>window.__G?.game?.debug||document.querySelector('#boot-error')?.textContent,null,{timeout:120000});
  const bootError=await page.locator('#boot-error').textContent();assert.equal(bootError,'');
  await page.evaluate(()=>{globalThis.NG=window.__G;NG.game.debug.freeze();NG.game._skipRender=true;NG.game.menus.launchLobby=async()=>{};});
 }
 const weapon=await pages[0].evaluate(async()=>{const {WEAPONS}=await import(new URL('src/config.js',document.baseURI));return Object.values(WEAPONS).find(w=>w.special==='storm').id;});report.weapon=weapon;
 const code=await pages[0].evaluate(()=>NG.net.create('Storm Host'));await pages[1].evaluate(c=>NG.net.join(c,'Storm Guest'),code);
 await until(async()=>await pages[0].evaluate(()=>NG.net.lobby.players.length===2),'room roster');
 await pages[0].evaluate(w=>{NG.net.setMe({weapon:w});NG.net.setSettings({map:'tidewater',mode:'turf',bots:false});},weapon);await pages[1].evaluate(w=>NG.net.setMe({weapon:w}),weapon);
 await until(async()=>await pages[0].evaluate(w=>NG.net.lobby.players.every(p=>p.weapon===w),weapon),'loadout');
 await pages[0].evaluate(()=>{if(!NG.net.confirmTeams())throw Error('teams refused');});
 await until(async()=>await pages[1].evaluate(()=>NG.net.lobby.teamsConfirmed),'teams confirmed');
 await pages[1].evaluate(()=>NG.net.setMe({ready:true}));await pages[0].evaluate(()=>NG.net.setMe({ready:true}));
 await until(async()=>await pages[0].evaluate(()=>NG.net.canStart()),'ready');await pages[0].evaluate(()=>{if(!NG.net.start())throw Error('start refused');});
 await until(async()=>{const s=await state();return s.every(s=>s.state==='playing'&&s.active&&s.peers.length===1&&s.peers[0].lastTs);},'native match with accepted snapshots',120);
 await step(120); // Let the native spawn transition finish before charging the first independent case.
 report.initial=await state();assert(report.initial.every(s=>s.clockNative&&s.actors.length===2&&s.actors.every(a=>a.meshChildren>0)));console.log(variant+' match ready');
 for(const page of pages)await page.evaluate(()=>{
  const G=NG,P=G.projectiles;globalThis.stormTrace={recorded:[],births:[],clouds:[]};
  const rec=G.netm._rec;G.netm._rec=function(e){const r=rec.call(this,e);if((e[0]==='ev'&&e[1]==='special:use')||(e[0]==='tr'&&e[2]==='throw')||(e[0]==='b'&&e[2]==='storm'))stormTrace.recorded.push(JSON.parse(JSON.stringify(r)));return r;};
  const ghost=P.ghostBomb;P.ghostBomb=function(...args){const before=this.bombs.length,r=ghost.apply(this,args);stormTrace.births.push({at:performance.now()/1000,tick:Math.round(G.time*60),before,after:this.bombs.length,kind:args[1],owner:args[0].nid});return r;};
  const cloud=P._spawnCloud;P._spawnCloud=function(b){const r=cloud.call(this,b);stormTrace.clouds.push({at:performance.now()/1000,tick:Math.round(G.time*60),ghost:!!b.ghost,owner:b.owner.nid,clouds:this.clouds.length});return r;};
 });
 for(const delay of [2,30,600]){
  console.log(variant+' held release '+delay);const row={delay,startedAt:Date.now()};report.cases.push(row);write();
  await until(async()=>await pages[0].evaluate(()=>!NG.local.specialActive),'prior throw end');
  await pages[0].evaluate(()=>{const G=NG,a=G.local,g=G.game;g.debug.key('KeyQ',false);g.debug.key('KeyE',false);g.debug.fire(false);a.stormGaugeLock=0;a.stormGaugeDuration=0;a.special=a.specialCost();a.aimPitch=.3;});
  await step(1);
  row.before=await state();await pages[0].evaluate(()=>NG.game.debug.key('KeyQ',true));await step(1);
  assert.equal(await pages[0].evaluate(()=>NG.local.specialActive?.id),'storm','native Q must activate before the held-release case starts');
  await pages[0].evaluate(()=>{NG.game.debug.key('KeyQ',false);NG.game.debug.key('KeyE',true);});
  await step(delay-1);row.held=await state();
  if(delay===30)duplicateArmed=true;
  await pages[0].evaluate(()=>NG.game.debug.key('KeyE',false));await step(1);row.release=await state();
  row.canisterRender=null;let captured=false;const cloudStart=row.release[1].trace.clouds.length,deadline=Date.now()+12000;
  while(Date.now()<deadline){
   const s=await state();if(!captured&&s[1].bombs.some(b=>b.ghost&&b.kind==='storm')){captured=true;row.canister=s;row.canisterRender=await screenshot('held-'+delay+'-canister','canister');}
   if(s[0].trace.clouds.length>row.before[0].trace.clouds.length&&((variant==='baseline')||s[1].trace.clouds.length>cloudStart))break;
   await step(1);
  }
  row.after=await state();if(row.after[1].clouds.some(c=>c.ghost))row.cloudRender=await screenshot('held-'+delay+'-cloud','cloud');
  const events=row.after[0].trace.recorded.slice(row.before[0].trace.recorded.length),use=events.find(e=>e[1]==='ev'),birth=events.find(e=>e[1]==='b'),release=events.find(e=>e[1]==='tr');
  row.events=events;row.releaseTickDelta=birth&&use?birth.at(-2)-use.at(-2):null;row.genuineNativeThrow=!!(use&&release&&birth);row.remoteBirths=row.after[1].trace.births.length-row.before[1].trace.births.length;row.remoteClouds=row.after[1].trace.clouds.length-row.before[1].trace.clouds.length;
  row.expected=variant==='candidate'?'one remote canister and cloud':'native local throw; remote canister rejected';
  row.accepted=row.genuineNativeThrow&&row.releaseTickDelta===delay&&(variant==='candidate'?row.remoteBirths===1&&row.remoteClouds===1&&row.canisterRender?.observedObject&&row.cloudRender?.observedObject:row.remoteBirths===0&&row.remoteClouds===0);
  console.log(JSON.stringify({variant,delay,delta:row.releaseTickDelta,remoteBirths:row.remoteBirths,remoteClouds:row.remoteClouds,accepted:row.accepted}));write();
 }
 await step(30);report.afterEnd=await state();
 if(variant==='candidate'){
  await pages[0].evaluate(()=>{const a=NG.local;a.invuln=0;a.damage(10000,NG.actors.find(a=>a.remote),'storm-verification-controlled-death');});await step(30);report.afterDeath=await state();
 }
 report.status=report.cases.every(c=>c.accepted)&&!report.errors.length?'passed':'failed';
}catch(e){report.status='failed';report.error=String(e.stack||e);report.lastState=await state().catch(()=>null);console.error(report.error);}
finally{
 report.responses=report.responses.flatMap(m=>m instanceof Map?[...m.values()]:[]);write();await browser?.close();await new Promise(r=>relay.close(r));await new Promise(r=>server.close(r));write();
}
console.log(JSON.stringify({variant,status:report.status,cases:report.cases.map(c=>({delay:c.delay,delta:c.releaseTickDelta,accepted:c.accepted})),errors:report.errors,error:report.error}));
process.exitCode=report.status==='passed'?0:1;
