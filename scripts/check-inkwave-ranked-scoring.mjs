#!/usr/bin/env node
// Focused Halyard scoring regression on the built game. Touch/viewport/UA
// emulation in Chromium is not a physical iPad or a Safari/WebKit acceptance.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const site=fs.realpathSync(path.resolve(process.argv[2]||'_site'));
const evidence=path.resolve(process.argv[3]||'.browser-evidence/ranked-scoring');
fs.mkdirSync(evidence,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
for(const [file,expected] of Object.entries(manifest.artifacts))
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(site,file))).digest('hex'),expected,file);
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),file=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
 if(!file.startsWith(site+path.sep)||!fs.statSync(file).isFile())throw Error('Missing');
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
 fs.createReadStream(file).pipe(res);
}catch{res.writeHead(404);res.end('Missing');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
let browser,result;
const errors=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1024,height:768},hasTouch:true,isMobile:true,
  userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.text().startsWith('probe '))console.log(m.text());});
 await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0})));
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__inkwave?.debug,null,{timeout:180000,polling:250});
 await page.evaluate(()=>window.__inkwave.debug.freeze());
 result=await page.evaluate(probeHalyardScoring);
 assert.equal(result.device.ipad,true);assert.equal(result.device.touch,true);
 assert.deepEqual(result.rainmaker.map(r=>r.hz),[30,60,120]);
 for(const row of result.rainmaker){
  assert.equal(row.carrier,row.expectedCarrier,`Rainmaker ${row.hz}: retains supported possession`);
  assert.ok(row.count<row.startCount,`Rainmaker ${row.hz}: count ${row.startCount} -> ${row.count}`);
  assert.ok(row.alive&&row.grounded);assert.equal(row.events.length,0,'no false fall/drop');
 }
 assert.deepEqual(result.clams.map(r=>r.hz),[30,60,120]);
 for(const row of result.clams){
  assert.equal(row.before.power,true);assert.equal(row.raw.held,false);assert.equal(row.raw.pressed,true);
  assert.equal(row.opened,true);assert.equal(row.powerCount,80);assert.equal(row.finalCount,77);assert.equal(row.heldCount,74);
  assert.equal(row.inventory.power,false);assert.equal(row.inventory.small,0);
  assert.equal(row.bombsBefore,0);assert.equal(row.bombsAfter,0,'throw does not also emit a sub weapon');
 }
 assert.deepEqual(errors,[]);
 await page.screenshot({path:path.join(evidence,'halyard-scoring.png')});
 console.log('Halyard touch scoring passed: Rainmaker carry/count and Power+small clam scoring at 30/60/120fps');
}finally{
 fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify({revision:manifest.build.revision,contentHash:manifest.contentHash,result,errors,conditions:'Chromium touch/viewport/UA emulation with actual Halyard collision, Match/Actor/PlayerController/rule/world and DOM PointerEvents; controlled supported pickup/field-clam setups, frozen other bots; no fabricated score or held-carrier assignment; physical iPad/Safari unverified'},null,2));
 await browser?.close();await new Promise(resolve=>server.close(resolve));
}

async function probeHalyardScoring(){
 const G=window.__G,g=G.game,out={device:g.mobile,rainmaker:[],clams:[]};
 g.debug.freeze();g.menus.wipe.cancel();g._skipRender=true;
 const setup=async mode=>{
  g.input.reset?.();await g.startMatch({mapId:'halyard',mode,difficulty:'easy'});g.debug.freezeBots();
  for(let i=0;i<400;i++)g._frame(1/60);G.projectiles.clear();
  const m=G.match,a=m.local;a.invuln=999;a.s3.spawnArmor=null;
  return {m,a,e:m.ranked,id:String(a.nid??`${a.team}:${a.slot}`),touch:g.input.mobile};
 };
 const pointer=(touch,type,id,x,y)=>touch.root.dispatchEvent(new PointerEvent(type,{pointerType:'touch',pointerId:id,clientX:x,clientY:y,buttons:type==='pointerup'?0:1,bubbles:true,cancelable:true}));
 const tap=touch=>{const b=touch._box('sub');pointer(touch,'pointerdown',93,b.x,b.y);pointer(touch,'pointerup',93,b.x,b.y);};
 for(const hz of [30,60,120]){
  const {m,a,e,id,touch}=await setup('rainmaker');
  let start=null;
  // Keep the ordinary footprint's supported plank edge: the centre ray is
  // over water, while real capsule/foot support is still on the gangway.
  for(const z of [6.5,7.5,5.8])for(const x of [1.72,1.78,1.84,1.90]){
   if(start)continue;
   const y=G.level.groundHeight(1.6,z);if(!Number.isFinite(y))continue;
   const p=a.pos.clone().set(x,y,z);a.spawnAt(p,0);
   if(a.grounded&&m.rankedWorld.floorAt(a.pos.x,a.pos.z)===null)start=a.pos.toArray();
  }
  if(!start)throw Error('No naturally foot-supported Halyard gangway edge found');
  e.rule.state.pos=start.slice();m.rankedBarrierHits.push({id,team:0,damage:1000,kind:'shooter'});m.advanceRanked(1/60);
  const startCount=e.counts[0],events=[],play=m.playRankedEvents;
  m.playRankedEvents=function(es,...args){events.push(...es);return play.call(this,es,...args);};
  g.rig.yaw=0;g.rig.pitch=0;touch.setVisible(true);g.input.lastDevice='touch';
  const b=touch._box('stick');pointer(touch,'pointerdown',91,b.x,b.y);pointer(touch,'pointermove',91,b.x,b.y-150);
  const move=touch.moveY;
  for(let i=0;i<hz;i++)g._frame(1/hz);
  pointer(touch,'pointerup',91,b.x,b.y-150);
  for(let i=0;i<3;i++)g._frame(1/60);
  out.rainmaker.push({hz,start,startCount,move,end:a.pos.toArray(),grounded:a.grounded,alive:a.alive,count:e.counts[0],carrier:e.rule.state.carrier,expectedCarrier:id,events:events.filter(e=>/drop|reset|checkpoint/.test(e.kind))});
  console.log('probe Halyard Rainmaker '+hz+' count='+e.counts[0]+' carrier='+e.rule.state.carrier);
 }
 for(const hz of [30,60,120]){
  const {m,a,e,id,touch}=await setup('clams'),goal=e.stage.clams.goals[0];
  a.spawnAt(a.pos.clone().set(goal[0],goal[1],goal[2]-5),Math.PI);
  for(let i=0;i<8;i++)e.rule._newClam('small',null,a.pos.toArray());m.advanceRanked(1/60);
  const before=structuredClone(e.rule.state.inventories[id]);
  g.rig.yaw=0;g.rig.pitch=-.1;a.aimYaw=Math.PI;a.aimDir.set(0,0,-1);
  touch.setVisible(true);g.input.lastDevice='touch';const bombs=G.projectiles.bombs.length;
  tap(touch);const raw={held:touch.down('sub'),pressed:touch.wasPressed('sub')};
  for(let i=0;i<3*hz;i++)g._frame(1/hz);
  const opened=e.rule.state.baskets[0].barrierOpen,powerCount=e.counts[0];
  if(opened){e.rule._newClam('small',null,a.pos.toArray());m.advanceRanked(1/60);tap(touch);for(let i=0;i<2*hz;i++)g._frame(1/hz);}
  const finalCount=e.counts[0];
  if(opened){
   e.rule._newClam('small',null,a.pos.toArray());m.advanceRanked(1/60);
   const b=touch._box('sub');pointer(touch,'pointerdown',94,b.x,b.y);
   for(let i=0;i<Math.ceil(hz/3);i++)g._frame(1/hz);
   pointer(touch,'pointerup',94,b.x,b.y);
   for(let i=0;i<2*hz;i++)g._frame(1/hz);
  }
  out.clams.push({hz,goal,before,raw,opened,powerCount,finalCount,heldCount:e.counts[0],inventory:e.rule.state.inventories[id],bombsBefore:bombs,bombsAfter:G.projectiles.bombs.length,alive:a.alive,grounded:a.grounded});
  console.log('probe Halyard Clams '+hz+' count='+e.counts[0]);
 }
 g._skipRender=false;g._frame(1/60);return out;
}
