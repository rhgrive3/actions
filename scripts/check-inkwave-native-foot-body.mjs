#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const site=path.resolve(process.argv[2]),evidence=path.resolve(process.argv[3]);
fs.mkdirSync(evidence,{recursive:true});
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 try{const url=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
  if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error('Missing');
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(404);res.end('Missing');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let receipt;
try{
 const page=await browser.newPage({viewport:{width:800,height:600}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,800));if(m.text().startsWith('native-foot-body '))console.log(m.text());if(m.text().startsWith('native-foot-body-observation ')){fs.appendFileSync(path.join(evidence,'events.jsonl'),m.text().slice('native-foot-body-observation '.length)+'\n');console.log(m.text());}});
 await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0})));
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
 await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});
 assert.equal(await page.locator('#boot-error').textContent(),'');
 const parsedSetup=JSON.parse(fs.readFileSync(process.argv[4],'utf8')),setup=Array.isArray(parsedSetup)?parsedSetup[0]:parsedSetup;
 if(!setup)throw Error('A naturally reproduced source-supported input setup is required');
 receipt=await page.evaluate(async({setup,baseline})=>{
  const G=NG,g=G.game,rates=[30,60,120],results=[],random=Math.random;Math.random=()=>.5;
  const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value))).map(n=>n.toString(16).padStart(2,'0')).join('');
  try{for(const hz of rates){
   g.debug.freeze();g.menus.wipe.cancel();await g.startMatch({mapId:'shipshape',mode:'turf',difficulty:'normal'});g._skipRender=true;
   for(let i=0;i<330;i++)g._frame(1/60);g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<100;i++)g._frame(1/60);g.debug.freezeBots();
   const L=G.level,P=G.physics,a=G.actors.find(a=>a.team===0&&a.bot),V=a.pos.constructor,buffers={};
   for(const[k,v]of Object.entries(L.data))if(ArrayBuffer.isView(v))buffers[k]=await hash(v.buffer);
   const beforeTextures=JSON.stringify(L.manifest.textureIntegrity);
   for(const other of G.actors){const p=L.spawnPads[other.team].clone().add(new V((other.slot-1.5)*1.3,0,other.team?-1.5:1.5));other.spawnAt(p,other.team?Math.PI:0);other.intent.move.set(0,0,0);other.intent.fire=other.intent.squid=other.intent.jump=other.intent.sub=other.intent.special=false;}
   a.setWeapon('shooter');a.spawnAt(new V(...setup.initial),0);a.invuln=0;
   const startProbe=P.raycast(a.pos.clone().add(new V(0,.1,0)),new V(0,-1,0),.3);
   if(!a.grounded||!startProbe.hit||startProbe.triangle<0||!P.bodyFits(a.pos,.35,.35,1.45,false,.0001))throw Error('The controlled initial pose is not original source-supported and body clear');
   let inputTicks=0,ticks=0,profile=null,lastBody=null,lands=0;const calls=[],intrusions=[],raised=[],coupling=[],intervals=new Set(),originalCollide=P.collideBody,originalUpdate=a.update,originalLand=a._onLand,originalCoupling=P.reconcileSourceFootBody;
   if(originalCoupling)P.reconcileSourceFootBody=function(p,r,l,h,c,ground,...args){const before=p.toArray(),beforeFit=P.bodyFits(p,r,l,h,!!args[3],.0001),result=originalCoupling.call(this,p,r,l,h,c,ground,...args);if(!beforeFit)coupling.push({tick:ticks+1,before,after:p.toArray(),supported:result,bodyFits:P.bodyFits(p,r,l,h,!!args[3],.0001),foot:{y:ground.y,block:ground.block,face:ground.face}});return result;};
   a.bot.update=()=>{inputTicks++;a.intent.move.set(0,0,setup.move);a.intent.jump=inputTicks<=(setup.jumpTicks||30);a.intent.squid=a.intent.fire=a.intent.sub=a.intent.special=false;};
   P.collideBody=function(p,r,l,h,...args){const selected=p===a.pos,before=selected?p.toArray():null,result=originalCollide.call(this,p,r,l,h,...args);if(selected){profile={radius:r,lift:l,height:h,skipGrates:!!args[2]};lastBody={before,resolved:p.toArray(),fits:P.bodyFits(p,r,l,h,!!args[2],.0001),contacts:{wall:!!args[0].wall,ground:!!args[0].ground,ceiling:!!args[0].ceiling,wallBlock:args[0].wallBlock,groundBlock:args[0].groundBlock}};calls.push(lastBody);}return result;};
   a._onLand=function(...args){lands++;return originalLand.apply(this,args);};
   a.update=function(dt){intervals.add(dt);lastBody=null;const result=originalUpdate.call(this,dt);ticks++;if(profile){const fit=P.bodyFits(this.pos,profile.radius,profile.lift,profile.height,profile.skipGrates,.0001);if(this.grounded&&!fit)intrusions.push({tick:ticks,position:this.pos.toArray(),velocity:this.vel.toArray(),profile:{...profile},lastBody,ground:{y:this.ground.y,block:this.ground.block,face:this.ground.face,normal:this.ground.normal.toArray()}});if(this.grounded&&lastBody&&this.pos.y>lastBody.resolved[1]+1e-4)raised.push({tick:ticks,position:this.pos.toArray(),lastBody,fit});}return result;};
   const clockStart=g.s3Clock.ticks;
   try{for(let i=0;i<hz*2.5;i++){g._frame(1/hz);if(baseline&&intrusions.length)break;}}
   finally{P.collideBody=originalCollide;P.reconcileSourceFootBody=originalCoupling;a.update=originalUpdate;a._onLand=originalLand;}
   const unchanged={};for(const[k,v]of Object.entries(L.data))if(ArrayBuffer.isView(v))unchanged[k]=await hash(v.buffer)===buffers[k];
   if(!Object.values(unchanged).every(Boolean)||beforeTextures!==JSON.stringify(L.manifest.textureIntegrity))throw Error('Original source buffers or texture manifest changed');
   if(intervals.size!==1||![...intervals].every(dt=>Math.abs(dt-1/60)<1e-12)||ticks!==g.s3Clock.ticks-clockStart)throw Error('Actual installed Game/Actor fixed STEP missing');
   console.log('native-foot-body-observation '+JSON.stringify({hz,baseline,setup,ticks,profile,intrusions,raised,coupling,lands,jumpSerial:a.s3JumpSerial,end:a.pos.toArray(),grounded:a.grounded,alive:a.alive,lastBody,bodyCalls:calls.slice(-5)}));
   if(baseline&&!intrusions.length)throw Error('Matched historical source pipeline did not reproduce the post-foot intrusion');
   if(!baseline&&(intrusions.length||!a.alive||!a.grounded||lands!==1||!a.s3JumpSerial||!coupling.length||coupling.some(x=>!x.supported||!x.bodyFits)))throw Error('Natural source jump/landing body-foot constraint failed');
   results.push({renderHz:hz,physicsIntervals:[...intervals],ticks,profile,start:{position:setup.initial,triangle:startProbe.triangle,sourceObject:L.manifest.objects[L.triangleWorld.objectIds[startProbe.triangle]].name},input:{move:[0,0,setup.move],jumpHeldFixedTicks:setup.jumpTicks||30,squid:false},intrusions,raised,coupling,bodyCalls:calls.length,end:a.pos.toArray(),alive:a.alive,grounded:a.grounded,lands,jumpSerial:a.s3JumpSerial,sourceBuffers:buffers,unchanged,gearAP:Object.keys(a.s3.abilityPoints),actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,scope:'ordinary controlled inputs after original source-supported setup; actual fixed Game/Actor/Character; no pose/velocity/ink writes after setup, no internal collision-correction trajectory claim'});
   console.log('native-foot-body '+JSON.stringify({renderHz:hz,ticks,intrusions:intrusions.length,end:a.pos.toArray(),lands}));
  }}finally{Math.random=random;}
  return{sourceSha256:G.level.manifest.sourceSha256,baseline,results};
 },{setup,baseline:process.env.NATIVE_FOOT_BODY_BASELINE==='1'});
 receipt.errors=errors;receipt.buildContentHash=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8')).contentHash;
 assert.equal(errors.length,0,JSON.stringify(errors));
 fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(receipt,null,2));
 await page.screenshot({path:path.join(evidence,'shipshape.png'),timeout:60000,animations:'disabled'});
 console.log(JSON.stringify({buildContentHash:receipt.buildContentHash,cases:receipt.results.length,errors:errors.length,baseline:receipt.baseline}));
}finally{await browser.close();await new Promise(r=>server.close(r));if(receipt)fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(receipt,null,2));}
