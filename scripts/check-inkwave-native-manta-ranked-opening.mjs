#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const site=path.resolve(process.argv[2]);
const out=path.resolve(process.argv[3]||'.browser-evidence/manta-ranked-opening');
fs.mkdirSync(out,{recursive:true});
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const mime={'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 try{
  const url=new URL(req.url,'http://local');
  const file=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
  if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error('missing');
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={status:'running',id:'manta',buildFingerprint:build.contentHash,cases:[],errors:[],scope:'Actual production ranked Match/BotBrain opening route and ordinary source-bank movement; no full objective arrival or scoring assertion; original supported setup pads, no later pose/velocity/route/ink writes; SwiftShader'};
try{
 const context=await browser.newContext({viewport:{width:960,height:640}}),page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.addInitScript(()=>{Math.random=()=>.5;localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0}));});
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
 await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});
 assert.equal(await page.locator('#boot-error').textContent(),'');
 for(const mode of (process.env.NATIVE_MANTA_RANKED_MODES||'zones,rainmaker').split(',')){
  await page.evaluate(async mode=>{
   const G=NG,g=G.game;g.debug.freeze();g.menus.wipe.cancel();await g.startMatch({mapId:'manta',mode,difficulty:'normal'});g._skipRender=true;
   for(let i=0;i<330;i++)g._frame(1/60);g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<100;i++)g._frame(1/60);g.debug.freezeBots();
   if(!G.level.native||G.match.ranked?.mode!==mode||G.actors.length!==8||G.actors.filter(a=>a.bot).length!==7||G.local.s3?.squidSpawn||!G.local.grounded)throw Error('Actual ranked match and source landing required');
   const flags=G.level.manifest.sourceNavigation;
   if(!flags?.wallClimb||!flags?.highDrops||!flags?.wallSurge)throw Error('Manta source traversal definition must stay intact');
  },mode);
  for(const team of [0,1])for(const hz of [30,60,120]){
   const proof=await page.evaluate(async({team,hz})=>{
    const G=NG,g=G.game,L=G.level,N=G.nav,V=G.local.pos.constructor;
    const {BotBrain}=await import(new URL('src/game/bots.js',document.baseURI));
    const {GroundHit}=await import(new URL('src/game/physics.js',document.baseURI));
    const {nativeSourceFootSupported}=await import(new URL('patches/native-stages/runtime/engine.mjs',document.baseURI));
    const a=G.actors.find(a=>a.team===team&&a.bot),support=new GroundHit();
    for(const other of G.actors){
     if(other===a)continue;
     const p=L.spawnPads[other.team].clone(),angle=other.slot/4*Math.PI*2+.6;
     p.x+=Math.cos(angle)*.7;p.z+=Math.sin(angle)*.7;
     const h=G.physics.raycast(p.clone().setY(p.y+.1),new V(0,-1,0),.3);
     if(!h.hit||Math.abs(h.point.y-p.y)>.1)throw Error('Other actor setup lacks original source pad support');
     other.spawnAt(p,0);other.intent.move.set(0,0,0);other.intent.fire=other.intent.squid=other.intent.jump=false;
     if(other.bot)other.bot.update=()=>{};
    }
    G.projectiles.clear();G.paint.clear();a.setWeapon('shooter');a.spawnAt(L.spawnPads[team],team?Math.PI:0);a.invuln=0;a.bot=new BotBrain(a,'normal');
    const start=a.pos.clone(),path=N.path,calls=[];
    N.path=function(...args){const result=path.apply(this,args);calls.push({limit:args[3]??6000,nodes:result?.length||0,start:args[0],end:args[1]});return result;};
    let inputFrames=0,groundedSourceSamples=0,traversalFrames=0,initialRoute=null,initialGoal=null,ticks=0;const actorDts=[],brainDts=[],actorUpdate=a.update,brainUpdate=a.bot.update,clockStart=g.s3Clock.ticks;a.update=function(dt){ticks++;if(!actorDts.includes(dt))actorDts.push(dt);return actorUpdate.call(this,dt);};a.bot.update=function(dt){if(!brainDts.includes(dt))brainDts.push(dt);return brainUpdate.call(this,dt);};
    try{
     for(let i=0;i<hz*2;i++){
      g._frame(1/hz);
      if(!a.alive)throw Error('Ranked opening bank movement died');
      inputFrames+=a.intent.move.lengthSq()>0;
      traversalFrames+=!!a.bot._nativeTraversalHandled;
      if(!initialRoute&&a.bot.path?.length>1){initialRoute={nodes:a.bot.path.length,start:a.bot.path[0],end:a.bot.path.at(-1)};initialGoal={...a.bot._rankedGoalPos};}
      if(a.grounded){const node=N.nodes[N.nearest(a.pos,1.2)];if(!node||!nativeSourceFootSupported(G,a,node))throw Error('Ranked movement lacks static source-foot support');groundedSourceSamples++;}
     }
    }finally{N.path=path;a.update=actorUpdate;a.bot.update=brainUpdate;}
    if(ticks!==g.s3Clock.ticks-clockStart||actorDts.length!==1||actorDts[0]!==1/60||brainDts.length!==1||brainDts[0]!==1/60)throw Error('Installed Game must own actual fixed Actor/Brain cadence');const distance=a.pos.distanceTo(start);
    if(!initialRoute||!initialGoal||!Object.keys(initialGoal).length||!inputFrames||distance<1||!a.grounded||!groundedSourceSamples){
     const e=G.match.ranked,frame=e.frame,actor=frame.actors.find(o=>o.id===String(a.nid??`${a.team}:${a.slot}`)),sourceStart=N.nearest(start,1.2),limit=Math.max(6000,N.nodes.length*4);
     const candidates=e.mode==='clams'?e.rule.state.clams.filter(c=>c.grounded&&(c.kind==='small'||c.team===team)).map(c=>{
      const p=new V(...c.pos),node=N.nearest(p,2.5),route=node<0?null:path.call(N,sourceStart,node,team,limit),hit=G.physics.raycast(p.clone().setY(p.y+.15),new V(0,-1,0),.4);
      return{id:c.id,kind:c.kind,team:c.team,pos:c.pos,grounded:c.grounded,node,routeNodes:route?.length||0,blockedFromOriginalPad:frame.blocked(start.toArray(),c.pos),sourceSupport:hit.hit&&hit.triangle>=0,sourceTriangle:hit.triangle,sourceHeight:hit.point.y};
     }):[];
     globalThis.mantaRankedFailure={mode:G.match.mode,team,hz,sourceSha256:L.manifest.sourceSha256,sourceNavigation:L.manifest.sourceNavigation||null,sourceNodes:N.nodes.length,validNodes:N.validIds.length,sourceStart,searchBound:limit,weapon:a.weaponId,weaponConfig:{radius:a.weapon?.radius,range:a.weapon?.range,weight:a.weapon?.weight},gearAP:Object.keys(a.s3.abilityPoints),originalPad:start.toArray(),actualActor:actor,actualRuleGoal:actor?e.rule.botGoal(actor,frame):null,inventory:e.rule.state.inventories?.[actor?.id],candidates,initialRoute,initialGoal,inputFrames,distance,grounded:a.grounded,groundedSourceSamples,traversalFrames,calls};
     throw Error('Actual ordinary ranked opening failed '+JSON.stringify({mode:G.match.mode,team,hz,initialRoute,initialGoal,inputFrames,distance,grounded:a.grounded,groundedSourceSamples,traversalFrames}));
    }
    if(!calls.some(c=>c.limit===Math.max(6000,N.nodes.length*4)&&c.nodes>1))throw Error('Ranked wrapper did not select its installed bounded native route');
    return {mode:G.match.mode,team,hz,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,start:start.toArray(),end:a.pos.toArray(),ticks,actorDts,brainDts,renderHz:hz,physicsHz:60,initialRoute,initialGoal,distance,inputFrames,groundedSourceSamples,traversalFrames,grounded:true,alive:true,gearAP:Object.keys(a.s3.abilityPoints),searchCalls:calls,sourceSha256:L.manifest.sourceSha256};
   },{team,hz});
   report.cases.push(proof);console.log('manta-ranked '+JSON.stringify(proof));
   fs.writeFileSync(path.join(out,'ranked-opening.json'),JSON.stringify(report,null,2));
  }
 }
 assert.equal(report.errors.length,0,JSON.stringify(report.errors));report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;report.diagnostic=await browser.contexts()[0]?.pages()[0]?.evaluate(()=>globalThis.mantaRankedFailure||null).catch(()=>null);throw error;}
finally{fs.writeFileSync(path.join(out,'ranked-opening.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
