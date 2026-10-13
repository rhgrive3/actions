#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]||'.browser-evidence/humpback-ranked');
fs.mkdirSync(out,{recursive:true});
const identity=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const report={status:'running',buildFingerprint:identity.contentHash,clock:'production Game._frame; observed fixed STEP 1/60',cases:[],errors:[]};
const save=()=>fs.writeFileSync(path.join(out,'ranked.json'),JSON.stringify(report,null,2)+'\n');
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{
 const name=new URL(req.url,'http://local').pathname,file=path.resolve(site,'.'+(name==='/'?'/index.html':decodeURIComponent(name)));
 if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error('Missing');
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:960,height:640}}),page=await context.newPage();
page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text().slice(0,1000));});
try{
 await page.addInitScript(()=>{Math.random=()=>.5;localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0}));});
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
 await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});
 assert.equal(await page.locator('#boot-error').textContent(),'');
 const modes=(process.env.HUMPBACK_RANKED_MODES||'zones,rainmaker,clams').split(','),rates=(process.env.HUMPBACK_RENDER_RATES||'30,60,120').split(',').map(Number);
 for(const mode of modes)for(const team of [0,1])for(const hz of rates){
  await page.evaluate(async({mode,team,hz})=>{
   const G=NG,g=G.game,{BotBrain}=await import(new URL('src/game/bots.js',document.baseURI)),{PLAYER}=await import(new URL('src/config.js',document.baseURI));
   g.debug.freeze();g.menus.wipe.cancel();await g.startMatch({mapId:'humpback',mode,difficulty:'normal'});g._skipRender=true;
   for(let i=0;i<330;i++)g._frame(1/60);g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;
   for(let i=0;i<100;i++)g._frame(1/60);g.debug.freezeBots();
   if(!G.local.grounded||G.local.s3?.squidSpawn||G.match.mode!==mode||G.match.ranked?.mode!==mode)throw Error('Actual human launch/ranked match initialization failed');
   const a=G.actors.find(o=>o.team===team&&o.bot&&o!==G.local),V=a.pos.constructor;
   for(const other of G.actors){
    const p=G.level.spawnPads[other.team].clone();if(other!==a){p.x+=Math.cos(other.slot/4*Math.PI*2+.6)*.7;p.z+=Math.sin(other.slot/4*Math.PI*2+.6)*.7;}
    const h=G.physics.raycast(p.clone().add(new V(0,.1,0)),new V(0,-1,0),.3);
    if(!h.hit||h.face<0||!G.physics.bodyFits(p,PLAYER.s3HumanoidTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale,PLAYER.stepUp,PLAYER.height,false,.003))throw Error('Real actor lacks original source pad support');
    other.spawnAt(p,other.team?Math.PI:0);other.intent.move.set(0,0,0);other.intent.fire=other.intent.squid=other.intent.jump=other.intent.sub=other.intent.special=false;
   }
   G.paint.clear();G.projectiles.clear();a.setWeapon('shooter');a.invuln=0;a.bot=new BotBrain(a,'normal');
   const id=String(a.nid??a.team+':'+a.slot),state=G.match.ranked.rule.state;
   globalThis.humpRankedRun={mode,team,hz,a,id,start:a.pos.toArray(),frames:0,ticks:0,startClock:g.s3Clock.ticks,actorSteps:new Set(),brainSteps:new Set(),projectileSteps:new Set(),fire:false,jump:false,traversal:0,maxTravel:0,sawPower:false,firstPowerTick:null,inventoryMaximum:0,initialInventory:JSON.parse(JSON.stringify(state.inventories?.[id]||{small:0,power:false}))};
   const r=humpRankedRun,au=a.update.bind(a),bu=a.bot.update.bind(a.bot),pu=G.projectiles.update.bind(G.projectiles);
   a.update=dt=>{r.ticks++;r.actorSteps.add(dt);au(dt);r.maxTravel=Math.max(r.maxTravel,Math.hypot(a.pos.x-r.start[0],a.pos.z-r.start[2]));};
   a.bot.update=dt=>{r.brainSteps.add(dt);bu(dt);r.fire ||=a.intent.fire;r.jump ||=a.intent.jump;r.traversal+=!!a.bot._nativeTraversalHandled;};
   G.projectiles.update=dt=>{r.projectileSteps.add(dt);pu(dt);};
   const advance=G.match.advanceRanked.bind(G.match);G.match.advanceRanked=(...args)=>{const result=advance(...args),inv=G.match.ranked.rule.state.inventories?.[r.id];if(inv){r.inventoryMaximum=Math.max(r.inventoryMaximum,inv.small||0);if(inv.power&&!r.initialInventory.power){r.sawPower=true;r.firstPowerTick??=r.ticks;}}return result;};
  },{mode,team,hz});
  let row;
  for(let chunk=0;chunk<180;chunk++){
   row=await page.evaluate(()=>{
    const G=NG,r=humpRankedRun,a=r.a,e=G.match.ranked;
    for(let i=0;i<Math.ceil(r.hz*.5);i++){if(!G.match.playing())throw Error('Ranked match ended before source objective approach');G.game._frame(1/r.hz);r.frames++;}
    const F=e.frame,actor=F.actors.find(o=>o.id===r.id),goal=actor?e.rule.botGoal(actor,F):null,inv=e.rule.state.inventories?.[r.id]||null,botGoal=a.bot._rankedGoalPos||null;
    const collected=r.mode==='clams'&&!!inv&&((inv.small||0)>(r.initialInventory.small||0)||!!inv.power&&!r.initialInventory.power);
    const p=goal?.pos,goalMatches=!!p&&!!botGoal&&Math.hypot(p[0]-botGoal.x,p[1]-botGoal.y,p[2]-botGoal.z)<.3;
    const approached=r.mode!=='clams'&&goalMatches&&a.grounded&&Math.hypot(a.pos.x-p[0],a.pos.z-p[2])<1&&Math.abs(a.pos.y-p[1])<.2;
    const V=a.pos.constructor,h=G.physics.raycast(a.pos.clone().add(new V(0,.1,0)),new V(0,-1,0),.3);
    return{mode:r.mode,team:r.team,renderCadence:r.hz,seconds:r.frames/r.hz,actorTicks:r.ticks,gameClockTicks:G.game.s3Clock.ticks-r.startClock,actorSteps:[...r.actorSteps],brainSteps:[...r.brainSteps],projectileSteps:[...r.projectileSteps],start:r.start,end:a.pos.toArray(),goal:p??null,goalAction:goal?.action??null,botGoal,inventory:inv,initialInventory:r.initialInventory,collected,sawPower:r.sawPower,firstPowerTick:r.firstPowerTick,inventoryMaximum:r.inventoryMaximum,approached,alive:a.alive,grounded:a.grounded,sourceTriangle:h.hit?h.triangle:null,sourceObject:h.hit?G.level.manifest.objects[G.level.triangleWorld.objectIds[h.triangle]].name:null,sourceFace:h.hit?h.face:null,fire:r.fire,jump:r.jump,traversal:r.traversal,maxTravel:r.maxTravel,gearAP:Object.keys(a.s3.abilityPoints),sourceWeapon:a.weapon.sourceMainActor,actors:G.actors.length,aliveActors:G.actors.filter(o=>o.alive).length,bots:G.actors.filter(o=>o.bot).length,counts:[...G.paint.counts],matchState:G.match.state};
   });
   report.lastCase=row;save();if(!row.alive||(row.mode==='clams'&&row.sawPower)||row.approached)break;
  }
  assert(row.alive&&row.grounded&&(row.mode==='clams'?row.sawPower:row.approached),'Real fixed-clock ranked source approach failed '+JSON.stringify(row));
  assert(row.sourceFace>=0&&row.sourceTriangle>=0);assert(row.maxTravel>5);assert.equal(row.actors,8);assert.equal(row.aliveActors,8);assert.equal(row.bots,7);assert.deepEqual(row.gearAP,[]);
  assert.deepEqual(row.actorSteps,[1/60]);assert.deepEqual(row.brainSteps,[1/60]);assert.deepEqual(row.projectileSteps,[1/60]);assert.equal(row.actorTicks,row.gameClockTicks);
  report.cases.push(row);save();console.log(JSON.stringify(row));
 }
 assert.equal(report.errors.length,0,JSON.stringify(report.errors));report.status='passed';
 await page.evaluate(()=>{NG.paint.flush(1/60);NG.game._skipRender=false;NG.renderer.render(NG.scene,NG.camera);});
 await page.screenshot({path:path.join(out,'humpback-ranked.png'),timeout:60000});
}catch(error){report.status='failed';report.error=error.stack;throw error;}finally{save();await browser.close();await new Promise(r=>server.close(r));}
