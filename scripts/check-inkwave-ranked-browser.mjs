#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {chromium} from 'playwright';
import {WebSocketServer} from 'ws';
import {RoomDurableObject} from '../server/src/index.js';
const site=path.resolve(process.argv[2]||'_site-ranked'),out=path.resolve(process.argv[3]||'reports/ranked-browser');fs.mkdirSync(out,{recursive:true});
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const served=new Set();
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const[f,h]of Object.entries(build.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,f))),h,f);
const delay=Number(process.env.RANKED_RELAY_DELAY_MS||0);assert(Number.isFinite(delay)&&delay>=0&&delay<=1000);
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.glb':'model/gltf-binary'};
const server=http.createServer((req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(site,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(site+path.sep)||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});served.add(path.relative(site,file));fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const relay=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(r=>relay.once('listening',r));const rooms=new Map();
relay.on('connection',(ws,req)=>{const u=new URL(req.url,'http://localhost'),code=u.pathname.split('/')[2];let room=rooms.get(code);if(!room)rooms.set(code,room=new RoomDurableObject({},{}));room.handleSession({send:s=>{if(delay&&s.startsWith('m|'))setTimeout(()=>ws.readyState===1&&ws.send(s),delay);else if(ws.readyState===1)ws.send(s);},addEventListener:(n,fn)=>ws.on(n,n==='message'?d=>fn({data:d.toString()}):fn)},u.searchParams.get('name')||'Player');});
const url=`http://127.0.0.1:${server.address().port}/?relay=${encodeURIComponent('ws://127.0.0.1:'+relay.address().port)}`;
const errors=[],results=[],contexts=[],pages=[];let browser;
async function boot(){const c=await browser.newContext({viewport:{width:1280,height:800}});contexts.push(c);const p=await c.newPage();pages.push(p);p.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});await p.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true})));await p.goto(url,{waitUntil:'domcontentloaded'});await p.evaluate(async()=>{globalThis.RG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});await p.waitForFunction(()=>RG.game?.menus&&RG.s3?.installed&&RG.mode!=='boot',null,{timeout:180000});return p;}
async function advance(p,n){return p.evaluate(n=>{const g=RG.game;g._skipRender=true;try{for(let i=0;i<n;i++)g._frame(1/60);}finally{g._skipRender=false;}RG.renderer.render(RG.scene,RG.camera);},n);}
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-features=LocalNetworkAccessChecks','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const p=await boot();await p.evaluate(()=>RG.game.debug.freeze());
 for(const mode of process.env.RANKED_ONLINE_ONLY ? [] : ['zones','tower','rainmaker','clams']){
  console.log('offline',mode);
  await p.evaluate(async mode=>{RG.game.debug.freeze();RG.game.menus.wipe.cancel();await RG.game.startMatch({mapId:'tidewater',difficulty:'easy',mode});},mode);
  await p.waitForFunction(()=>RG.game.hud?._visible&&!document.querySelector('.iw-lineup'),null,{timeout:30000});
  await advance(p,330);
  const initial=await p.evaluate(()=>({mode:RG.match.mode,state:RG.match.state,time:RG.match.time,actors:RG.match.actors.length,ranked:!!RG.match.ranked,hud:document.querySelector('.iw-ranked-hud')?.textContent}));assert(initial.ranked&&initial.actors===8&&initial.time<=300&&initial.time>290);assert(initial.hud?.length>5);
  await p.screenshot({path:path.join(out,mode+'-offline.jpg'),type:'jpeg',quality:60});
  const proof=await p.evaluate(mode=>{
   const m=RG.match,e=m.ranked,w=m.rankedWorld,a=m.local;RG.game.debug.freezeBots();
   if(mode==='zones'){e.stage.zones.forEach((_,i)=>w.captureZone(i,0));m.advanceRanked(1.2);if(e.counts[0]>98)throw Error('Native paint capture did not score');}
   if(mode==='tower'){a.pos.fromArray(e.rule.state.position);a.grounded=true;a._rankedOnTower=true;m.advanceRanked(1);if(e.rule.state.controllingTeam!==a.team)throw Error('Real tower rider not detected');}
   if(mode==='rainmaker'){m.rankedBarrierHits.push({id:String(a.nid??`${a.team}:${a.slot}`),team:a.team,damage:2000,kind:'main'});m.advanceRanked(1/60);if(e.rule.state.barrier.active)throw Error('Native shield did not pop');a.pos.fromArray(e.rule.state.pos);m.advanceRanked(1/60);if(e.rule.state.carrier===null)throw Error('Native holder failed pickup');}
   if(mode==='clams'){const c=e.rule.state.clams[0];a.pos.fromArray(c.pos);a.grounded=true;m.advanceRanked(1/60);const id=String(a.nid??`${a.team}:${a.slot}`);if(!(e.rule.state.inventories[id]?.small||e.rule.state.inventories[id]?.power))throw Error('Real actor failed clam pickup');}
   const snap=e.snapshot();if(!e.restore(snap))throw Error('Own snapshot rejected');e.time=.001;m.time=.001;m.advanceRanked(1/60);return {counts:[...e.counts],winner:e.winner,overtime:e.overtime,state:m.state,snapshotBytes:JSON.stringify(snap).length};
  },mode);results.push({mode,offline:initial,proof});
 }
 const guest=await boot();
 // Real native session and production relay across isolated browser contexts.
 for(const mode of ['zones','tower','rainmaker','clams']){
  console.log('online',mode);
  await Promise.all([p,guest].map(pg=>pg.evaluate(()=>{RG.game.debug.unfreeze();RG.game.menus.launchLobby=async()=>{};})));
  const code=await p.evaluate(()=>RG.net.create('Ranked Host'));await guest.evaluate(c=>RG.net.join(c,'Ranked Guest'),code);
  await p.waitForFunction(()=>RG.net.lobby.players.length===2);await guest.waitForFunction(()=>RG.net.lobby.players.length===2);
  await p.evaluate(mode=>{RG.net.setSettings({mode,bots:true,map:'tidewater'});},mode);
  await guest.waitForFunction(mode=>RG.net.lobby.mode===mode,mode,{timeout:30000});
  await p.evaluate(()=>{if(!RG.net.confirmTeams())throw Error('Team confirmation failed');});
  await guest.waitForFunction(()=>RG.net.lobby.teamsConfirmed);
  await guest.evaluate(()=>RG.net.setMe({ready:true}));await p.evaluate(()=>RG.net.setMe({ready:true}));
  await p.waitForFunction(()=>RG.net.canStart());await p.evaluate(()=>{if(!RG.net.start())throw Error('Room start rejected');});
  await Promise.all([p,guest].map(pg=>pg.waitForFunction(()=>RG.match?.state==='playing'&&RG.net.active&&RG.match.ranked,null,{timeout:180000})));
  await p.evaluate(()=>{RG.game.debug.freeze();RG.game.debug.freezeBots();RG.match.ranked.setCount(0,65);RG.match.ranked.revision++;RG.netm._sendNow({k:'rkstate',rk:{match:RG.netm.cfg.id,host:RG.netm.s.hostId,state:RG.match.ranked.snapshot(),gains:RG.match.rankedGains}});});
  await guest.waitForFunction(()=>RG.match.ranked.counts[0]===65,null,{timeout:30000});
  const online=await Promise.all([p,guest].map(pg=>pg.evaluate(()=>({mode:RG.match.mode,counts:[...RG.match.ranked.counts],follower:RG.match.follower,actors:RG.match.actors.length,time:RG.match.time}))));assert.deepEqual(online[0].counts,online[1].counts);assert.equal(online[0].mode,mode);assert.equal(online[1].mode,mode);
  await Promise.all([p,guest].map((pg,i)=>pg.screenshot({path:path.join(out,mode+'-online-'+i+'.jpg'),type:'jpeg',quality:60})));
  let record=results.find(r=>r.mode===mode);if(!record)results.push(record={mode});record.online=online;
  await p.evaluate(()=>{RG.match.ranked.setCount(0,0);RG.match.advanceRanked(1/60);});
  await guest.waitForFunction(()=>RG.match.ranked.winner===0&&RG.match.ranked.knockout&&RG.match.state==='finish',null,{timeout:30000});
  record.terminal=await Promise.all([p,guest].map(pg=>pg.evaluate(()=>({winner:RG.match.ranked.winner,knockout:RG.match.ranked.knockout,counts:[...RG.match.ranked.counts],state:RG.match.state}))));
  assert.deepEqual(record.terminal[0],record.terminal[1]);
  await Promise.all([p,guest].map(pg=>pg.evaluate(()=>RG.net.leave())));
 }
 assert.equal(errors.length,0,JSON.stringify(errors));fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'passed',scope:process.env.RANKED_ONLINE_ONLY?'online-only':'offline-and-online',contentHash:build.contentHash,inputHash:build.inputHash,revision:build.build.revision,delayMs:delay,served:[...served],results,errors},null,2));
}catch(e){
 // Never let diagnostic image capture replace the original ranked/relay failure.
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'failed',contentHash:build.contentHash,error:e?.stack||String(e),results,errors},null,2));
 for(let i=0;i<pages.length;i++){
  try { await pages[i].screenshot({path:path.join(out,'failure-'+i+'.png'),timeout:5000}); }
  catch(captureError){console.warn('ranked failure screenshot '+i+' unavailable:',captureError.message);}
 }
 throw e;
}
finally{for(const c of contexts)await c.close();await browser?.close();for(const ws of relay.clients)ws.terminate();await new Promise(r=>relay.close(r));await new Promise(r=>server.close(r));}
