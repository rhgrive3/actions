#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const site=path.resolve(process.argv[2]||'_site-native-shipshape');
const out=path.resolve(process.argv[3]||'.browser-evidence/shipshape-climb-refill-guards');
fs.mkdirSync(out,{recursive:true});
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://local'),p=path.resolve(site,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!p.startsWith(site+'/')||!fs.statSync(p).isFile())throw Error('Missing');res.writeHead(200,{'content-type':mime[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(res);}catch{res.writeHead(404);res.end('Missing');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:800,height:600}});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,800));if(m.text().startsWith('source-refill-control '))console.log(m.text());});
 await page.addInitScript(()=>{Math.random=()=>.5;localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0}));});
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
 await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});
 assert.equal(await page.locator('#boot-error').textContent(),'');
 const report=await page.evaluate(async()=>{
  const G=NG,g=G.game,{BotBrain}=await import(new URL('src/game/bots.js',document.baseURI)),{PLAYER}=await import(new URL('src/config.js',document.baseURI)),cases=[];
  const humanRadius=Number.isFinite(PLAYER.s3HumanoidTerrainRadiusRaw)&&Number.isFinite(PLAYER.s3TerrainDistanceScale)?PLAYER.s3HumanoidTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale:PLAYER.radius;
  for(const hz of [30,60,120]){
   g.debug.freeze();g.menus.wipe.cancel();await g.startMatch({mapId:'shipshape',mode:'zones',difficulty:'normal'});g._skipRender=true;
   for(let i=0;i<330;i++)g._frame(1/60);g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<100;i++)g._frame(1/60);g.debug.freezeBots();
   const L=G.level,V=G.local.pos.constructor,a=G.actors.find(a=>a.team===1&&a.bot),from=G.nav.nodes[16843],edge=from.nb.find(e=>e.to===16578&&e.type==='climb'&&!e.climb.kind),c=edge.climb;
   for(const other of G.actors){if(other===a)continue;const p=L.spawnPads[other.team].clone(),angle=other.slot/4*Math.PI*2+.6;p.x+=Math.cos(angle)*.7;p.z+=Math.sin(angle)*.7;const h=G.physics.raycast(p.clone().add(new V(0,.1,0)),new V(0,-1,0),.3);if(!h.hit||h.face<0)throw Error('Other actor lacks genuine source pad');other.spawnAt(p,other.team?Math.PI:0);other.intent.move.set(0,0,0);other.intent.fire=other.intent.squid=other.intent.jump=other.intent.sub=other.intent.special=false;}
   G.paint.clear();G.projectiles.clear();a.setWeapon('shooter');a.spawnAt(new V(...c.paintStance),0);a.invuln=0;a.intent.move.set(0,0,0);a.intent.fire=a.intent.squid=a.intent.jump=a.intent.sub=a.intent.special=false;a.bot.update=()=>{};
   const intervals=new Set(),oldUpdate=a.update;
   a.update=function(dt){intervals.add(dt);return oldUpdate.call(this,dt);};
   const advance=ticks=>{const begin=g.s3Clock.ticks;while(g.s3Clock.ticks-begin<ticks)g._frame(1/hz);};
   advance(36);a.aimYaw=0;a.aimPitch=-1.1;a.aimPoint.copy(a.pos).add(new V(0,-.1,.5));a.intent.fire=true;
   let preparation=0;const before=g.s3Clock.ticks;
   while(a.ink>8&&g.s3Clock.ticks-before<1200)g._frame(1/hz);preparation=g.s3Clock.ticks-before;
   a.intent.fire=false;advance(20);
   if(!(a.alive&&a.grounded&&a.form==='kid'&&!a.submerged&&a.ink<15&&a.ground.face===33518&&G.paint.sample(a.ground.face,a.ground.u,a.ground.v)===2&&Math.hypot(a.pos.x-c.paintStance[0],a.pos.z-c.paintStance[2])<=.2&&Math.abs(a.pos.y-c.lower[1])<.16))throw Error('Natural shots did not prepare own-painted low-ink kid '+JSON.stringify({hz,position:a.pos.toArray(),stance:c.paintStance,inputMove:a.intent.move.toArray(),ink:a.ink,form:a.form,submerged:a.submerged,face:a.ground.face,owner:G.paint.sample(a.ground.face,a.ground.u,a.ground.v)}));
   const b=a.bot=new BotBrain(a,'normal');b.path=[from.id,edge.to];b.pi=1;b.goal=edge.to;b.goalTimer=b.repath=b.bombCd=1000;
   const observations=[],brainUpdate=b.update;
   b.update=function(dt){const f=L.faces[a.ground.face],i=f?Math.max(0,Math.min(f.nu-1,Math.floor(a.ground.u/f.cu))):0,j=f?Math.max(0,Math.min(f.nv-1,Math.floor(a.ground.v/f.cv))):0,before={position:a.pos.toArray(),form:a.form,submerged:a.submerged,grounded:a.grounded,ink:a.ink,face:a.ground.face,block:a.ground.block,staticBlockCount:L.staticBlockCount,u:a.ground.u,v:a.ground.v,normal:a.ground.normal.toArray(),grate:a.ground.grate,owner:G.paint.sample(a.ground.face,a.ground.u,a.ground.v),inside:!!f&&L.containsFaceUV(f,a.ground.u,a.ground.v),mask:f?L.mask[f.grid+j*f.nu+i]:0,humanFits:G.physics.bodyFits(a.pos,humanRadius,PLAYER.stepUp,PLAYER.height,false,.003),humanProfile:[humanRadius,PLAYER.stepUp,PLAYER.height],stanceDistance:Math.hypot(a.pos.x-c.paintStance[0],a.pos.z-c.paintStance[2])},r=brainUpdate.call(this,dt);if(this._nativeClimb?.phase==='refill'&&before.ink<15&&before.owner===2){if(!a.intent.squid)throw Error('Own-painted low-ink source refill lost existing squid input');observations.push({...before,wantsSquid:a.intent.squid,phase:this._nativeClimb.phase,tick:g.s3Clock.ticks});}return r;};
   const wetGains=[];
   a.update=function(dt){intervals.add(dt);const before={form:this.form,submerged:this.submerged,ink:this.ink},r=oldUpdate.call(this,dt);if(before.form==='squid'&&before.submerged&&this.form==='squid'&&this.submerged&&this.ink>before.ink)wetGains.push(this.ink-before.ink);return r;};
   try{for(let i=0;i<hz*2;i++){g._frame(1/hz);if(observations.some(q=>q.form==='kid'&&!q.submerged)&&observations.some(q=>q.form==='squid'&&q.submerged)&&wetGains.length)break;}}
   finally{a.update=oldUpdate;b.update=brainUpdate;}
   if(!observations.some(q=>q.form==='kid'&&!q.submerged&&q.grounded&&q.block>=0&&q.block<q.staticBlockCount&&!q.grate&&q.normal[1]>.68&&q.inside&&q.mask&&q.humanFits&&q.stanceDistance<=.2)||!observations.some(q=>q.form==='squid'&&q.submerged)||!wetGains.length)throw Error('Actual own-painted kid and wet-squid controls were not both exercised '+JSON.stringify({hz,observations,wetGains}));
   if(intervals.size!==1||![...intervals].every(dt=>Math.abs(dt-1/60)<1e-12))throw Error('Actual Actor is not fixed STEP');
   if(G.actors.filter(a=>a.alive).length!==8||G.actors.filter(a=>a.bot).length!==7)throw Error('Actual roster changed');
   const row={renderHz:hz,physicsIntervals:[...intervals],preparationSteps:preparation,observations,wetRecoveryDeltas:wetGains,actors:8,bots:7,gearAP:Object.keys(a.s3.abilityPoints),conditions:'Fresh actual Match/Game/Brain/Actor/Character/Shooter/resources; source-supported initial setup, ordinary downward shots naturally create low ink and own Floor00; no later pose/velocity/resource/paint writes; actual own-painted kid→squid and wet-squid input/recovery'};cases.push(row);console.log('source-refill-control '+JSON.stringify(row));
  }
  return {id:'shipshape',sourceSha256:G.level.manifest.sourceSha256,cases};
 });
 assert.equal(errors.length,0,JSON.stringify(errors));report.errors=errors;
 const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));report.contentHash=build.contentHash;report.inputHash=build.inputHash;
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(r=>server.close(r));}
