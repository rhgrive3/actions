#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]||'_site-native'),evidence=path.resolve(process.argv[3]||'.browser-evidence/native-ranked-traversal');fs.mkdirSync(evidence,{recursive:true});
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error('Missing');res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end('Missing');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const reports=[];
try{
 for(const id of (process.env.NATIVE_STAGE_IDS||'manta').split(',')){
  const context=await browser.newContext({viewport:{width:800,height:600}}),page=await context.newPage(),errors=[];
  page.on('console',m=>{if(m.text().startsWith('native-ranked '))console.log(m.text());});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,800));});
  await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0})));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
  await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});assert.equal(await page.locator('#boot-error').textContent(),'');
  const report=await page.evaluate(async id=>{
   const G=NG,{BotBrain}=await import(new URL('src/game/bots.js',document.baseURI)),cases=[],random=Math.random;Math.random=()=>.5;
   try{for(const mode of ['zones','rainmaker','clams']){
    const g=G.game;g.debug.freeze();g.menus.wipe.cancel();await g.startMatch({mapId:id,mode,difficulty:'normal'});g._skipRender=true;for(let i=0;i<330;i++)g._frame(1/60);g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<100;i++)g._frame(1/60);g.debug.freezeBots();
    if(G.match.mode!==mode||G.match.ranked?.mode!==mode||G.actors.length!==8||G.actors.filter(a=>a.bot).length!==7)throw Error('Actual ranked match/roster was not initialized');const L=G.level,V=G.local.pos.constructor;
    for(const team of [0,1])for(const hz of [30,60,120]){
     const a=G.actors.find(a=>a.team===team&&a.bot);for(const other of G.actors){if(other===a)continue;const p=L.spawnPads[other.team].clone(),angle=other.slot/4*Math.PI*2+.6;p.x+=Math.cos(angle)*.7;p.z+=Math.sin(angle)*.7;const h=G.physics.raycast(p.clone().add(new V(0,.1,0)),new V(0,-1,0),.3);if(!h.hit||h.face<0||Math.abs(h.point.y-p.y)>.15)throw Error('Other real actor setup lacks original source pad support');other.spawnAt(p,other.team?Math.PI:0);other.intent.move.set(0,0,0);other.intent.fire=other.intent.squid=other.intent.jump=other.intent.sub=other.intent.special=false;}
     G.paint.clear();G.projectiles.clear();a.setWeapon('shooter');a.spawnAt(L.spawnPads[team],team?Math.PI:0);a.invuln=0;a.bot=new BotBrain(a,'normal');let seconds=0,goal=null,fire=false,traversal=0;
     for(let frame=0;frame<hz*90;frame++){
      G.match.ranked.frame.actors=G.actors.map(o=>({id:String(o.nid??o.team+':'+o.slot),team:o.team,slot:o.slot,pos:o.pos.toArray(),alive:o.alive,grounded:o.grounded}));G.time+=1/hz;a.bot.update(1/hz);fire ||=a.intent.fire;traversal+=!!a.bot._nativeTraversalHandled;a.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);seconds=(frame+1)/hz;goal=a.bot._rankedGoalPos;if(goal&&a.grounded&&Math.hypot(a.pos.x-goal.x,a.pos.z-goal.z)<1&&Math.abs(a.pos.y-goal.y)<.2)break;
     }
     if(!(goal&&a.alive&&a.grounded&&Math.hypot(a.pos.x-goal.x,a.pos.z-goal.z)<1&&Math.abs(a.pos.y-goal.y)<.2&&fire&&traversal>0))throw Error('Actual packaged ranked source objective failed '+JSON.stringify({mode,team,hz,seconds,goal,end:a.pos.toArray(),fire,traversal,phase:a.bot._nativeSurge?.phase,modeBrain:a.bot.mode,target:a.bot.target?.team}));const source=G.physics.raycast(a.pos.clone().add(new V(0,.1,0)),new V(0,-1,0),.3);if(!source.hit||source.face<0)throw Error('Ranked goal touchdown lacks paintable source support');cases.push({mode,team,hz,seconds,sourcePad:L.spawnPads[team].toArray(),goal,end:a.pos.toArray(),sourceTriangle:source.triangle,fire,traversal,alive:true,grounded:true,gearAP:Object.keys(a.s3.abilityPoints)});console.log('native-ranked '+JSON.stringify(cases.at(-1)));
    }
   }}finally{Math.random=random;}
   G.paint.flush(1/60);G.game._skipRender=false;G.renderer.render(G.scene,G.camera);return{id:G.level.layout.id,sourceSha256:G.level.manifest.sourceSha256,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,cases,conditions:'Actual production Match/RankedEngine/rule botGoal/installed ranked wrapper/Actor/WeaponRunner/Projectiles; eight real actors and seven bots, original source-supported pad setups, empty initial ink, zero AP, no later pose/velocity/ink writes; controlled objective approach without score simulation; SwiftShader'};
  },id);
  assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(report.actors,8);assert.equal(report.bots,7);report.errors=errors;reports.push(report);console.log(JSON.stringify(report));fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(reports,null,2));await page.screenshot({path:path.join(evidence,id+'.png'),timeout:30000});await context.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(reports,null,2));}
