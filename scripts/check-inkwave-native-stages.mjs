#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const site=path.resolve(process.argv[2]||'_site-native'),evidence=path.resolve(process.argv[3]||'.browser-evidence/native-stage5');fs.mkdirSync(evidence,{recursive:true});
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{const rel=decodeURIComponent(new URL(req.url,'http://local').pathname),file=path.resolve(site,'.'+(rel==='/'?'/index.html':rel));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error('Missing');res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end('Missing');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const address='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const reports=[];
try{
 for(const id of (process.env.NATIVE_STAGE_IDS||'scorch,hagglefish,inkblot,mako,brinewater').split(',')){
  const context=await browser.newContext({viewport:{width:960,height:640},deviceScaleFactor:1}),page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('page-error '+e.message);});
  page.on('console',m=>{if(m.type()==='error'){errors.push(m.text().slice(0,1000));console.log('browser-error '+m.text().slice(0,1000));}});
  await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0})));
  console.log('boot '+id);
  await page.goto(address+'/?map='+id,{waitUntil:'domcontentloaded',timeout:30000});
  await page.evaluate(async()=>globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI).href)).G);
  await page.waitForFunction(()=>NG?.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});
  const bootError=await page.locator('#boot-error').textContent();assert.equal(bootError,'',bootError);assert.equal(errors.length,0,JSON.stringify(errors));
  await page.evaluate(async(id)=>{NG.game.debug.freeze();NG.game.menus.wipe.cancel();await NG.game.startMatch({mapId:id,mode:'turf',duration:180,difficulty:'normal'});},id);
  await page.evaluate(()=>{const g=NG.game;g._skipRender=true;for(let i=0;i<300;i++)g._frame(1/60);g._skipRender=false;});
  await page.waitForFunction(()=>NG.game.match?.state==='playing',null,{timeout:60000});
  console.log('match '+id);
  await page.evaluate(()=>{const g=NG.game;g._skipRender=true;g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<80;i++)g._frame(1/60);g._skipRender=false;});
  await page.evaluate(()=>{
   const G=NG;globalThis.nativeProfile={};
   const wrap=(obj,name,label)=>{const fn=obj?.[name];if(typeof fn!=='function')return;obj[name]=function(...args){const t=performance.now();try{return fn.apply(this,args);}finally{const m=nativeProfile[label]||(nativeProfile[label]={milliseconds:0,calls:0});m.milliseconds+=performance.now()-t;m.calls++;}};};
   for(const n of ['raycast','collideBody','bodyFits','groundProbe'])wrap(G.physics,n,'physics.'+n);
   for(const n of ['splat','_cpuSplat','flush','_drawQuads','_emitGrowth'])wrap(G.paint,n,'paint.'+n);
   for(const n of ['path','nearest'])wrap(G.nav,n,'nav.'+n);
   for(const a of G.actors){wrap(a,'update','actor.update');wrap(a.character,'update','character.update');wrap(a.bot,'update','bot.update');}
   wrap(G.projectiles,'update','projectiles.update');wrap(G.fx,'update','fx.update');
  });
  const report=await page.evaluate(()=>{
   const G=NG,g=G.game;g.debug.freeze();g._skipRender=true;
   const positions=G.actors.map(a=>a.pos.toArray());const times=[];
   for(let frame=0;frame<300;frame++){const t=performance.now();g._frame(1/60);times.push(performance.now()-t);}
   g._skipRender=false;const a=g.match.local;
   const physics=G.physics,vec=a.pos.clone(),hit=physics.raycast(vec.clone().setY(vec.y+2),vec.clone().set(0,-1,0),5);
   if(hit.hit)G.paint.splat(hit.point.clone().addScaledVector(hit.normal,.03),2,a.team,{seed:.25,instant:true});
   g.minimap.ensure();G.paint.flush(1/60);G.renderer.render(G.scene,G.camera);times.sort((a,b)=>a-b);
   return {id:G.level.layout.id,native:G.level.native,actors:G.actors.length,alive:G.actors.filter(a=>a.alive).length,bots:G.actors.filter(a=>!!a.bot).length,
    moved:G.actors.map((a,i)=>a.pos.distanceTo(a.pos.clone().fromArray(positions[i]))),coverage:G.paint.coverage(),turfTotal:G.paint.turfTotal,counts:G.paint.counts,metrics:g.nativeWorld.metrics,
    cpuFrame:{p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1)},render:G.renderer.info.render,memory:G.renderer.info.memory,navValid:G.nav.validIds.length,
    local:{pos:a.pos.toArray(),alive:a.alive,grounded:a.grounded},profile:nativeProfile,version1130Verified:G.level.manifest.version1130Verified};
  });
  await page.screenshot({path:path.join(evidence,id+'-game.png'),timeout:60000});
  // Same integrated scene in a top-down reference view, both teams + source scenery.
  await page.evaluate(()=>{const G=NG,B=G.level.bounds,c=G.camera;c.position.set((B.minX+B.maxX)/2,180,(B.minZ+B.maxZ)/2+.01);c.lookAt((B.minX+B.maxX)/2,0,(B.minZ+B.maxZ)/2);G.renderer.render(G.scene,c);});
  await page.screenshot({path:path.join(evidence,id+'-overhead.png'),timeout:60000});
  report.errors=errors;reports.push(report);fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(report));
  assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(report.native,true);assert.equal(report.actors,8);assert.equal(report.bots,7);assert.ok(report.moved.some(n=>n>1));assert.ok(report.coverage.some(n=>n>0));
  await context.close();
 }
}catch(error){for(const page of browser.contexts().flatMap(c=>c.pages())){console.log('failure '+JSON.stringify(await page.evaluate(()=>({mode:globalThis.NG?.mode,state:globalThis.NG?.game?.match?.state,boot:document.getElementById('boot-error')?.textContent})).catch(()=>null)));await page.screenshot({path:path.join(evidence,'failure.png'),timeout:15000}).catch(()=>{});}throw error;}finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(reports,null,2));}
