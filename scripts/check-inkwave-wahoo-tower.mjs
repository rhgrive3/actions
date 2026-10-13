#!/usr/bin/env node
// Inspect real source geometry and live human support at every local tower pose.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]||'_site-native-wahoo-clearance'),out=path.resolve(process.argv[3]||'.browser-evidence/tower-clearance');fs.mkdirSync(out,{recursive:true});
const mime={'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const result={status:'running',errors:[]};
try{
 const context=await browser.newContext({viewport:{width:960,height:640}}),page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
 await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0})));
 await page.goto('http://127.0.0.1:'+server.address().port+'/?map=wahoo',{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G);
 await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});assert.equal(await page.locator('#boot-error').textContent(),'');
 result.proof=await page.evaluate(async()=>{
  const G=NG,g=G.game;g.debug.freeze();g.menus.wipe.cancel();g._skipRender=true;await g.startMatch({mapId:'wahoo',mode:'tower',difficulty:'easy'});
  for(let i=0;i<330;i++)g._frame(1/60);g.debug.freezeBots();g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<80;i++)g._frame(1/60);
  const m=G.match,e=m.ranked,w=m.rankedWorld,a=m.local;
  if(a.s3?.squidSpawn||!a.grounded)throw Error('Human initial squid spawn did not land');
  for(const b of G.actors)if(b!==a){b.pos.copy(G.level.spawnPads[b.team]);b._rankedOnTower=false;b.intent.fire=false;b.intent.move.set(0,0,0);b.vel.set(0,0,0);}
  a.pos.fromArray(e.rule.state.position);a.pos.x+=.7;a._resolve(false,a.pos.y,false);m.advanceRanked(1);
  if(a.ground.block!==w.towerBlockId||e.rule.state.controllingTeam!==a.team)throw Error('Landed human boarding was not counted');
  const {nativeTowerClearance}=await import(new URL('patches/native-stages/runtime/native-tower-clearance.mjs',document.baseURI));
  const route=e.stage.tower,clearance=nativeTowerClearance(G.level,G.physics.actorBody,route.halfSize),snapshot=e.snapshot();
  const lengths=[0];for(let i=1;i<route.path.length;i++)lengths.push(lengths[i-1]+Math.hypot(...route.path[i].map((v,k)=>v-route.path[i-1][k])));
  let supportSamples=0;
  for(let i=0;i<route.path.length;i++){
   const p=route.path[i];if(!clearance.clear(p,route.path[Math.max(0,i-1)]))throw Error('Swept source obstruction at '+i);
   e.rule.state.progress=lengths[i]/lengths.at(-1);e.rule.state.position=p.slice();w.update(e,0);
   for(const [x,z] of [[.7,0],[-.7,0],[0,.7],[0,-.7],[.7,.7]]){
    a.pos.fromArray(p).addScaledVector(w.towerBlock.axes[0],x).addScaledVector(w.towerBlock.axes[2],z);a.vel.set(0,0,0);a._resolve(false,a.pos.y,false);
    if(a.ground.block!==w.towerBlockId||!a.grounded)throw Error('Human deck support failed at '+i+' offset '+x+','+z);
    const body=G.physics.actorBody;if(!G.physics.bodyFits(a.pos.clone().setY(a.pos.y+.01),body.radius,.3,body.height,false,.01))throw Error('Human body intersects source or pole at '+i);
    supportSamples++;
   }
  }
  if(!e.restore(snapshot))throw Error('Original ranked state restore failed');w.update(e,0);G.renderer.render(G.scene,G.camera);
  return {id:G.level.layout.id,actors:G.actors.length,bots:G.actors.filter(b=>b.bot).length,humanSpawnLanded:true,humanRiderCounted:true,nodes:route.path.length,halfSize:route.halfSize,localLift:route.localLift,sweptSegments:clearance.metrics.queries,sourceTriangleTests:clearance.metrics.triangleTests,liveCapsule:G.physics.actorBody,supportSamples,sourceClearance:route.sourceClearance,version1130Verified:false,assurance:'Production match and landed human; static route-pose inspection at five deck offsets, plus conservative full-segment source sweep. Retail tower behavior and native moving platforms unverified.'};
 });
 assert.equal(result.proof.actors,8);assert.equal(result.proof.bots,7);assert.equal(result.errors.length,0,JSON.stringify(result.errors));result.status='passed';await page.screenshot({path:path.join(out,'wahoo-tower.png'),timeout:60000});console.log(JSON.stringify(result.proof));
}catch(error){result.status='failed';result.error=error.stack;throw error;}
finally{fs.writeFileSync(path.join(out,'tower.json'),JSON.stringify(result,null,2));await browser.close();await new Promise(r=>server.close(r));}
