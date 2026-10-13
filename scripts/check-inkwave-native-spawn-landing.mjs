#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {nativeStageCatalog} from './lib/inkwave-native-stages.mjs';
const ids=(process.env.NATIVE_STAGE_IDS===undefined?'scorch,hagglefish,inkblot,mako,brinewater':process.env.NATIVE_STAGE_IDS).split(',').map(id=>id.trim()),available=nativeStageCatalog().stages.map(s=>s.id);
assert(ids.length&&ids.every(Boolean)&&new Set(ids).size===ids.length,'Native spawn selection requires unique nonempty stage ids');
for(const id of ids)assert(available.includes(id),'Unknown playable native spawn stage: '+id);
const site=path.resolve(process.argv[2]||'_site-native'),out=path.resolve(process.argv[3]||'.browser-evidence/native-spawn-landing');fs.mkdirSync(out,{recursive:true});
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{const rel=decodeURIComponent(new URL(req.url,'http://local').pathname),file=path.resolve(site,'.'+(rel==='/'?'/index.html':rel));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const result={status:'running',stages:[],errors:[]};
try{
 for(const id of ids){
  const context=await browser.newContext({viewport:{width:800,height:600}}),page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text().slice(0,800));});
  await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0})));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await page.evaluate(async()=>globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G);
  await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});assert.equal(await page.locator('#boot-error').textContent(),'');
  await page.evaluate(async id=>{const g=NG.game;g.debug.freeze();g.menus.wipe.cancel();await g.startMatch({mapId:id,mode:'turf',difficulty:'normal'});g._skipRender=true;for(let i=0;i<330;i++)g._frame(1/60);g.debug.freezeBots();},id);
  const proof=await page.evaluate(async()=>{
   const G=NG,{beginInitialSquidSpawn}=await import(new URL('patches/splatoon3/runtime/respawn-lifecycle.mjs',document.baseURI)),{nativeRankedStage}=await import(new URL('patches/native-stages/runtime/engine.mjs',document.baseURI)),goal=nativeRankedStage(G).zones[0].center,cases=[];
   for(const team of [0,1])for(const hz of [30,60,120])for(const role of ['human','bot0','bot1','bot2','bot3']){
    const slot=role==='human'?0:Number(role.at(-1)),a=G.actors.find(a=>a.team===team&&a.slot===slot);if(!a)throw Error('Missing actual team/slot actor');const originalBot=a.isBot;
    try{
     a.isBot=role!=='human';a.aimPoint.set(0,0,0);a.intent.move.set(0,0,0);a.intent.fire=a.intent.squid=a.intent.jump=a.intent.sub=a.intent.special=false;
     if(!beginInitialSquidSpawn(a))throw Error('Source initial spawn did not begin');const target={...a.s3.squidSpawn.target},from=a.pos.toArray();
     if(!a.isBot){a.intent.fire=true;G.time+=1/hz;a.update(1/hz);a.intent.fire=false;}
     let frames=0,maxY=a.pos.y;while(a.s3.squidSpawn&&frames<hz*3){G.time+=1/hz;a.update(1/hz);maxY=Math.max(maxY,a.pos.y);frames++;}
     if(a.s3.squidSpawn||!a.alive||!a.grounded||!a.ground.hit)throw Error('Actual source launch did not settle '+JSON.stringify({team,hz,role,frames,pos:a.pos.toArray(),spawn:a.s3.squidSpawn}));
     const down=a.pos.clone().set(0,-1,0),hit=G.physics.raycast(a.pos.clone().setY(a.pos.y+.1),down,.3),landingNode=G.nav.nearest(a.pos,1.2),goalNode=G.nav.nearest(a.pos.clone().fromArray(goal),1.2),route=G.nav.path(landingNode,goalNode,team,50000);
     if(!hit.hit||hit.triangle<0||!route?.length)throw Error('Landed source actor has no real support or directed objective route '+JSON.stringify({team,hz,role,landingNode,goalNode}));
     const landed=a.pos.toArray(),start=a.pos.clone();
     // Ordinary controlled movement follows the real directed source route.
     // Keep all actors/physics intact; do not teleport to the objective.
     let waypoint=1;for(let i=0;i<hz&&waypoint<route.length;i++){
      const n=G.nav.nodes[route[waypoint]],dx=n.x-a.pos.x,dz=n.z-a.pos.z,d=Math.hypot(dx,dz);if(d<.35){waypoint++;continue;}a.intent.move.set(dx/d,0,dz/d);a.intent.jump=n.y>a.pos.y+.5;G.time+=1/hz;a.update(1/hz);
     }
     a.intent.move.set(0,0,0);a.intent.jump=false;const moved=a.pos.distanceTo(start);if(route.length>1&&moved<.1)throw Error('Post-launch ordinary movement stalled '+JSON.stringify({team,hz,role,routeNodes:route.length,moved}));
     cases.push({team,hz,role,slot,from,target,landingFrames:frames,landingSeconds:frames/hz,maxY,landed,supportTriangle:hit.triangle,supportObject:G.level.manifest.objects[G.level.triangleWorld.objectIds[hit.triangle]].name,landingNode,goalNode,routeNodes:route.length,postLaunchMove:moved,alive:a.alive,groundedAtLanding:true});
    }finally{a.isBot=originalBot;}
   }
   return {id:G.level.layout.id,sourceSha256:G.level.manifest.sourceSha256,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,cases,conditions:'production Actor integrator, real source support/nav; controlled neutral aim + fire; both human teams and all four bot slots; normal movement along a source route; SwiftShader',version1130Verified:false};
  });assert.equal(proof.actors,8);assert.equal(proof.bots,7);result.stages.push(proof);console.log(JSON.stringify({id,cases:proof.cases.length,maxLandingSeconds:Math.max(...proof.cases.map(c=>c.landingSeconds)),minimumPostLaunchMove:Math.min(...proof.cases.map(c=>c.postLaunchMove))}));await context.close();
 }
 assert.equal(result.errors.length,0,JSON.stringify(result.errors));result.status='passed';
}catch(error){result.status='failed';result.error=error.stack;throw error;}
finally{fs.writeFileSync(path.join(out,'spawn-landing.json'),JSON.stringify(result,null,2));await browser.close();await new Promise(r=>server.close(r));}
