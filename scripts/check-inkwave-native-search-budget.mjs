#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]||'.browser-evidence/native-search-budget'),id=process.env.NATIVE_STAGE_ID||'wahoo';
fs.mkdirSync(out,{recursive:true});
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),mime={'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const result={status:'running',id,buildFingerprint:build.contentHash,errors:[]};
try{
 const context=await browser.newContext({viewport:{width:960,height:640}}),page=await context.newPage();
 page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());else if(m.text().startsWith('native-search '))console.log(m.text());});
 await page.addInitScript(()=>{Math.random=()=>.5;localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0}));});
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
 await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});assert.equal(await page.locator('#boot-error').textContent(),'');
 result.native=await page.evaluate(async id=>{
  const G=NG,g=G.game,{BotBrain}=await import(new URL('src/game/bots.js',document.baseURI)),{GroundHit}=await import(new URL('src/game/physics.js',document.baseURI)),{PLAYER}=await import(new URL('src/config.js',document.baseURI)),{nativeRankedStage}=await import(new URL('patches/native-stages/runtime/engine.mjs',document.baseURI)),support=new GroundHit();
  g.debug.freeze();g.menus.wipe.cancel();await g.startMatch({mapId:id,mode:'turf',difficulty:'normal'});g._skipRender=true;for(let i=0;i<330;i++)g._frame(1/60);g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<100;i++)g._frame(1/60);g.debug.freezeBots();
  if(!G.level.native||G.actors.length!==8||G.actors.filter(a=>a.bot).length!==7||G.local.s3?.squidSpawn||!G.local.grounded)throw Error('Real native match/initial source landing required');
  const L=G.level,N=G.nav,V=G.local.pos.constructor,stage=nativeRankedStage(G),goal=new V(...stage.zones[0].center),cases=[];
  if(L.manifest.sourceNavigation?.wallClimb||L.manifest.sourceNavigation?.highDrops||L.manifest.sourceNavigation?.wallSurge)throw Error('Ordinary source proof must keep traversal opt-ins OFF');
  for(const team of [0,1])for(const hz of [30,60,120]){
   const a=G.actors.find(a=>a.team===team&&a.bot);
   for(const other of G.actors){if(other===a)continue;const p=L.spawnPads[other.team].clone(),angle=other.slot/4*Math.PI*2+.6;p.x+=Math.cos(angle)*1.8;p.z+=Math.sin(angle)*1.8;const h=G.physics.raycast(p.clone().setY(p.y+.1),new V(0,-1,0),.3);if(!h.hit||Math.abs(h.point.y-p.y)>.1)throw Error('Other actor setup lacks original source pad support');other.spawnAt(p,0);other.intent.move.set(0,0,0);other.intent.fire=other.intent.squid=other.intent.jump=false;if(other.bot)other.bot.update=()=>{};}
   G.paint.clear();G.projectiles.clear();a.setWeapon('shooter');a.spawnAt(L.spawnPads[team],team?-Math.PI/2:Math.PI/2);a.invuln=0;a.bot=new BotBrain(a,'normal');
   const start=N.nearest(a.pos,1.2),end=N.nearest(goal,.6),oldAt=performance.now(),old=N.path(start,end,team,6000),oldMilliseconds=performance.now()-oldAt,original=N.path,bounds=[];
   N.path=function(...args){bounds.push(args[3]);return original.apply(this,args);};const at=performance.now(),selected=a.bot._pathTo(goal,.6),searchMilliseconds=performance.now()-at;N.path=original;
   if(!selected||bounds[0]!==Math.max(6000,N.nodes.length*4))throw Error('Installed finite native search did not select the exact route');if(team===0&&(old!==null||a.bot.path.length!==118))throw Error('Exact Wahoo former6000 failure/118-node route not reproduced');
   const routeNodes=a.bot.path.length,enemyRejected=!a.bot._pathTo(L.spawnPads[1-team],.6);if(!enemyRejected)throw Error('Forbidden opposing spawn became reachable');if(!a.bot._pathTo(goal,.6))throw Error('Real source route retry failed');a.bot.goalTimer=a.bot.repath=a.bot.bombCd=1000;
   const before=a.pos.clone();let frames=0,groundedSourceSamples=0;
   for(;frames<hz*3;frames++){g._frame(1/hz);if(!a.alive)throw Error('Ordinary bank movement died');if(a.grounded){const h=G.physics.groundProbe(a.pos.x,a.pos.y,a.pos.z,PLAYER.stepUp,PLAYER.stepDown,PLAYER.footRadius,support,false);if(!h.hit||h.block<0||h.block>=L.staticBlockCount)throw Error('Grounded movement lacks real source support');groundedSourceSamples++;}if(frames>=hz*2&&a.grounded)break;}
   const distance=a.pos.distanceTo(before);if(distance<1||!a.grounded||!groundedSourceSamples)throw Error('Ordinary production bank movement failed '+JSON.stringify({team,hz,distance,end:a.pos.toArray(),grounded:a.grounded}));
   cases.push({team,hz,oldRejected:old===null,routeNodes,searchBound:bounds[0],sourceNodes:N.nodes.length,validNodes:N.validIds.length,oldMilliseconds,searchMilliseconds,start:before.toArray(),goal:goal.toArray(),end:a.pos.toArray(),distance,frames:frames+1,groundedSourceSamples,grounded:true,alive:true,enemySpawnRejected:true,gearAP:Object.keys(a.s3.abilityPoints)});console.log('native-search '+JSON.stringify(cases.at(-1)));
  }
  g._skipRender=false;G.renderer.render(G.scene,G.camera);
  return {sourceSha256:L.manifest.sourceSha256,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,sourceNavigation:L.manifest.sourceNavigation||null,cases,scope:'Actual production Match/Actor/Character/BotBrain/WeaponRunner/Projectiles with eight actors; source-supported initial pad setups, empty initial ink, controlled existing zone-center target; no later pose/velocity/route/ink writes. Initial route and ordinary bank movement only; no full 118-waypoint objective-arrival claim; SwiftShader'};
 },id);
 await page.screenshot({path:path.join(out,id+'-native-search.png'),timeout:60000});
 result.legacy=await page.evaluate(async()=>{const G=NG,g=G.game;g.menus.wipe.cancel();await g.startMatch({mapId:'tidewater',mode:'turf',difficulty:'normal'});g._skipRender=true;for(let i=0;i<330;i++)g._frame(1/60);const a=G.actors.find(a=>a.bot),N=G.nav,n=N.nodes[N.nearest(G.level.spawnPads[a.team],1.2)],goal=a.pos.clone().set(n.x,n.y,n.z),original=N.path,bounds=[];N.path=function(...args){bounds.push(args[3]);return original.apply(this,args);};a.bot._pathTo(goal,.6);N.path=original;if(G.level.native||bounds.length!==1||bounds[0]!==undefined)throw Error('Real Tidewater default search behavior changed');return {id:'tidewater',native:false,defaultBudgetArgumentUndefined:true};});
 assert.equal(result.errors.length,0,JSON.stringify(result.errors));result.status='passed';
}catch(error){result.status='failed';result.error=error.stack;throw error;}
finally{fs.writeFileSync(path.join(out,'search-budget.json'),JSON.stringify(result,null,2));await browser.close();await new Promise(r=>server.close(r));}
