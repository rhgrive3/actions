#!/usr/bin/env node
// Source-floor setup, followed by physical keyboard boarding of the live tower.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]||'_site-native-urchin');
const out=path.resolve(process.argv[3]||'.browser-evidence/urchin-source-input');
fs.mkdirSync(out,{recursive:true});
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 try{
  const name=new URL(req.url,'http://local').pathname;
  const file=path.resolve(site,'.'+(name==='/'?'/index.html':decodeURIComponent(name)));
  if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error();
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const result={status:'running',id:'urchin',errors:[],boarding:[]};
const save=()=>fs.writeFileSync(path.join(out,'source-input.json'),JSON.stringify(result,null,2));
try{
 const page=await browser.newPage({viewport:{width:960,height:640}});
 page.on('pageerror',e=>result.errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0})));
 await page.goto('http://127.0.0.1:'+server.address().port+'/?map=tidewater',{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
 await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:240000});
 assert.equal(await page.locator('#boot-error').textContent(),'');
 await page.evaluate(()=>{NG.game.debug.freeze();NG.game._skipRender=true;});
 for(const hz of [30,60,120]){
  const setup=await page.evaluate(async hz=>{
   const G=NG,g=G.game;g.menus.wipe.cancel();
   await g.startMatch({mapId:'urchin',mode:'tower',difficulty:'easy'});
   g._skipRender=true;g.debug.freezeBots();
   for(let i=0;i<Math.ceil(hz*5.5);i++)g._frame(1/hz);
   g.input.mouse.left=true;for(let i=0;i<Math.ceil(hz*.15);i++)g._frame(1/hz);
   g.input.mouse.left=false;for(let i=0;i<Math.ceil(hz*1.5);i++)g._frame(1/hz);
   const a=G.local,e=G.match.ranked,w=G.match.rankedWorld;
   if(a.s3?.squidSpawn||!a.grounded)throw Error('Human initial source launch must land before floor boarding setup');
   const t=e.stage.tower,approach=t.boarding?.approaches[t.centerIndex];
   if(!approach)throw Error('Promoted legal source-floor approach is required');
   // Reproducible floor position only. Movement and jump begin at zero velocity.
   a.pos.fromArray(approach.start);a.vel.set(0,0,0);a._resolve(false,a.pos.y,false);
   if(!a.grounded||!a.ground.hit||a.ground.block===w.towerBlockId)throw Error('Setup must contact original source floor outside the tower');
   const position=e.rule.state.position,distance=Math.hypot(a.pos.x-position[0],a.pos.z-position[2]);
   if(distance<=Math.SQRT2*t.halfSize)throw Error('Setup overlaps the live deck footprint');
   g.rig.follow(a,true);g.rig.yaw=Math.atan2(approach.end[0]-a.pos.x,approach.end[2]-a.pos.z);g.rig.pitch=-.12;
   g._frame(1/hz);
   globalThis.urchinBoardingEnd=approach.end;
   return {hz,team:a.team,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,start:approach.start,end:approach.end,sourceNode:approach.sourceNode,height:approach.height,jumping:approach.jumping,deckBlock:w.towerBlockId,sourceGround:true,outsideDeck:true,zeroInitialVelocity:true,localLift:t.localLift,halfSize:t.halfSize,routePoints:t.path.length,legalApproaches:t.boarding.approaches.length,initialCount:e.counts[a.team]};
  },hz);
  await page.keyboard.down('w');if(setup.jumping)await page.keyboard.down('Space');
  let releasedMove=false,releasedJump=false,contact;
  for(let frame=0;frame<Math.ceil(hz*1.5);frame++){
   contact=await page.evaluate(hz=>{
    const G=NG,g=G.game,a=G.local;g._frame(1/hz);
    return {distance:Math.hypot(a.pos.x-urchinBoardingEnd[0],a.pos.z-urchinBoardingEnd[2]),alive:a.alive,grounded:a.grounded,groundHit:a.ground.hit,groundBlock:a.ground.block,onTower:!!a._rankedOnTower,riders:[...G.match.ranked.rule.state.riders],controllingTeam:G.match.ranked.rule.state.controllingTeam,count:G.match.ranked.counts[a.team],position:a.pos.toArray()};
   },hz);
   const dx=setup.end[0]-setup.start[0],dz=setup.end[2]-setup.start[2],length=Math.hypot(dx,dz);
   if(!releasedMove&&((contact.position[0]-setup.start[0])*dx+(contact.position[2]-setup.start[2])*dz)/length>=length-.15){await page.keyboard.up('w');releasedMove=true;}
   if(!releasedJump&&frame>=Math.ceil(hz*.4)){await page.keyboard.up('Space');releasedJump=true;}
   if(contact.grounded&&contact.groundHit&&contact.groundBlock===setup.deckBlock&&contact.controllingTeam===setup.team)break;
  }
  await page.keyboard.up('w');await page.keyboard.up('Space');
  assert.equal(contact.alive,true);assert.equal(contact.grounded,true);
  assert.equal(contact.groundHit,true);assert.equal(contact.groundBlock,setup.deckBlock,'Physical run/jump must land on the actual dynamic deck');
  assert.equal(contact.controllingTeam,setup.team);assert.equal(contact.onTower,true);
  assert.ok(contact.riders[setup.team]>0,'Actual grounded contact must produce a counted team rider');
  const progress=await page.evaluate(hz=>{for(let i=0;i<hz;i++)NG.game._frame(1/hz);const e=NG.match.ranked,a=NG.local;return{count:e.counts[a.team],controllingTeam:e.rule.state.controllingTeam,grounded:a.grounded,groundBlock:a.ground.block};},hz);
  assert.ok(progress.count<setup.initialCount,'Actual counted rider must advance the ranked score');
  result.boarding.push({...setup,input:setup.jumping?'physical KeyW + Space through production PlayerController':'physical KeyW through production PlayerController',contact,progress});save();
  console.log(JSON.stringify({hz,localLift:setup.localLift,deckContact:true,count:progress.count,controllingTeam:progress.controllingTeam}));
 }
 await page.evaluate(()=>{NG.renderer.render(NG.scene,NG.camera);});
 await page.screenshot({path:path.join(out,'urchin-keyboard-tower.png'),timeout:60000});
 assert.equal(result.errors.length,0,JSON.stringify(result.errors));result.status='passed';
}catch(error){result.status='failed';result.error=error.stack;throw error;}
finally{save();await browser.close();await new Promise(r=>server.close(r));}
