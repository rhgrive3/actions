#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]||'.browser-evidence/native-floor-initial');
const ids=(process.env.NATIVE_STAGE_IDS||'scorch,hagglefish,inkblot,mako,brinewater').split(',');
assert(ids.every(id=>/^[-a-z0-9]+$/.test(id))&&new Set(ids).size===ids.length);
fs.mkdirSync(out,{recursive:true});
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{try{const pathname=new URL(req.url,'http://local').pathname,file=path.resolve(site,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const proxyURL=process.env.HTTPS_PROXY?new URL(process.env.HTTPS_PROXY):null;const proxy=proxyURL?{server:proxyURL.origin,username:decodeURIComponent(proxyURL.username),password:decodeURIComponent(proxyURL.password),bypass:'127.0.0.1,localhost'}:undefined;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,proxy,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const result={status:'running',fingerprint:build.contentHash,revision:build.build.revision,cases:[],errors:[],scope:'Installed Game._frame at render30/60/120, observed fixed Actor STEP1/60; fresh normal Match, all eight actual actors/seven brains, actual initial source launch/landing. Existing source zone-center targets through production BotBrain._pathTo. Brains paused through initial launch; the actual Actor owns automatic bot launch. Selected production brains resume for initial navigation; no subsequent pose, velocity, route or paint writes. Six seconds of ordinary input is an initial navigation check, not whole-route arrival. SwiftShader only.'};
try{
 for(const id of ids)for(const hz of [30,60,120]){
  const context=await browser.newContext({viewport:{width:800,height:600}}),page=await context.newPage();
  page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text().slice(0,800));});
  await page.addInitScript(()=>{Math.random=()=>.5;localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0}));});
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
  await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});assert.equal(await page.locator('#boot-error').textContent(),'');
  const proof=await page.evaluate(async({id,hz})=>{
   const G=NG,g=G.game,{nativeRankedStage}=await import(new URL('patches/native-stages/runtime/engine.mjs',document.baseURI)),{GroundHit}=await import(new URL('src/game/physics.js',document.baseURI)),{PLAYER}=await import(new URL('src/config.js',document.baseURI)),support=new GroundHit();const sourceGround=a=>{G.physics.groundProbe(a.pos.x,a.pos.y,a.pos.z,a.form==='squid'?PLAYER.squidStepUp:PLAYER.stepUp,PLAYER.stepDown,PLAYER.footRadius,support,a.form==='squid');if(!support.hit||support.block<0||support.block>=G.level.staticBlockCount||support.normal.y<=.68||Math.abs(support.y-a.pos.y)>.16)throw Error('Actual controller foot probe lacks original source support '+JSON.stringify({id,hz,position:a.pos.toArray(),grounded:a.grounded,form:a.form,block:support.block,supportY:support.y,normal:support.normal.toArray()}));return {block:support.block,height:support.y,normal:support.normal.toArray()};};
   g.debug.freeze();g.menus.wipe.cancel();await g.startMatch({mapId:id,mode:'turf',difficulty:'normal'});g._skipRender=true;const selected=[0,1].map(team=>G.actors.find(a=>a.team===team&&a.bot)),brainUpdates=selected.map(a=>a.bot.update);g.debug.freezeBots();
   const dts=new Set(),updates=[];for(const a of G.actors){const update=a.update;updates.push([a,update]);a.update=function(dt){dts.add(dt);return update.call(this,dt);};}
   for(let i=0;i<hz*5.5;i++)g._frame(1/hz);g.input.mouse.left=true;for(let i=0;i<Math.ceil(hz*.05);i++)g._frame(1/hz);g.input.mouse.left=false;for(let i=0;i<hz*2;i++)g._frame(1/hz);
   if(!G.level.native||G.actors.length!==8||G.actors.filter(a=>a.bot).length!==7||G.actors.some(a=>!a.alive||a.s3.squidSpawn||!a.grounded))throw Error('Actual initial source actors did not all settle alive');
   const landed=G.actors.map(a=>{const foot=sourceGround(a),hit=G.physics.raycast(a.pos.clone().setY(a.pos.y+.1),a.pos.clone().set(0,-1,0),.6);return {team:a.team,slot:a.slot,position:a.pos.toArray(),foot,triangle:hit.triangle,object:hit.triangle>=0?G.level.manifest.objects[G.level.triangleWorld.objectIds[hit.triangle]].name:null};});
   selected.forEach((a,i)=>a.bot.update=brainUpdates[i]);
   const goal=G.local.pos.clone().fromArray(nativeRankedStage(G).zones[0].center),nav=G.nav,originalPath=nav.path,calls=[];
   nav.path=function(...args){calls.push({team:args[2],bound:args[3],nodes:nav.nodes.length});return originalPath.apply(this,args);};
   const routes=selected.map(a=>{if(!a.bot._pathTo(goal,.6))throw Error('Initial source bot lacks a directed source objective route');a.bot.goalTimer=a.bot.repath=a.bot.bombCd=1000;return {team:a.team,routeNodes:a.bot.path.length,position:a.pos.toArray(),gearAP:Object.keys(a.s3.abilityPoints)};});nav.path=originalPath;
   const starts=selected.map(a=>a.pos.clone()),grounded=[0,0],brainDts=new Set();selected.forEach(a=>{const update=a.bot.update;a.bot.update=function(dt){brainDts.add(dt);return update.call(this,dt);};});
   for(let i=0;i<hz*6;i++){g._frame(1/hz);selected.forEach((a,j)=>{if(a.grounded){sourceGround(a);grounded[j]++;}});}
   for(const[a,update]of updates)a.update=update;
   if(dts.size!==1||!dts.has(1/60)||G.actors.some(a=>!a.alive))throw Error('Installed fixed-step clock or actual live roster changed');
   const banks=selected.map((a,i)=>{const moved=a.pos.distanceTo(starts[i]);if(moved<1||!grounded[i])throw Error('Ordinary initial source navigation stalled');return {...routes[i],moved,end:a.pos.toArray(),groundedSamples:grounded[i],finalWaypoint:a.bot.pi,finalGoal:a.bot.goal,finalRouteNodes:a.bot.path?.length||0};});
   if(calls.length!==2||calls.some(c=>c.bound!==Math.max(6000,c.nodes*4)))throw Error('Native search must retain its finite reviewed budget');
   return {id,hz,sourceSha256:G.level.manifest.sourceSha256,sourceNavigation:G.level.manifest.sourceNavigation||null,actors:8,bots:7,alive:8,actorDts:[...dts],brainDts:[...brainDts],landed,banks,calls};
  },{id,hz});result.cases.push(proof);console.log(JSON.stringify({id,hz,moved:proof.banks.map(b=>b.moved),grounded:proof.banks.map(b=>b.groundedSamples)}));fs.writeFileSync(path.join(out,'initial-floor.json'),JSON.stringify(result,null,2));await context.close();
 }
 assert.equal(result.errors.length,0,JSON.stringify(result.errors));result.status='passed';
}catch(error){result.status='failed';result.error=error.stack;throw error;}
finally{fs.writeFileSync(path.join(out,'initial-floor.json'),JSON.stringify(result,null,2));await browser.close();await new Promise(r=>server.close(r));}
