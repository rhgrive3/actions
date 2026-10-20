#!/usr/bin/env node
// Full game check with privately prepared, authenticated Bluefin source assets.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]||'_site'),out=path.resolve(process.argv[3]||'.browser-evidence/terrain-game');fs.mkdirSync(out,{recursive:true});
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{try{const p=new URL(req.url,'http://local').pathname,file=path.resolve(site,'.'+(p==='/'?'/index.html':decodeURIComponent(p)));assert(file.startsWith(site+'/'));res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).on('error',()=>{res.statusCode=404;res.end();}).pipe(res);}catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const result={status:'running',scope:'actual composed Game fixed-step simulation, controlled local movement, original meshes and low-quality textures; Chromium SwiftShader; no retail/hardware FPS claim',errors:[]},save=()=>fs.writeFileSync(path.join(out,'terrain-game.json'),JSON.stringify(result,null,2)+'\n');
try{
 const page=await browser.newPage({viewport:{width:640,height:480}});page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
 await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false,musicVolume:0})));
 await page.goto('http://127.0.0.1:'+server.address().port+'/?map=tidewater',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>globalThis.__G?.game?.menus&&__G.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:240000});
 assert.equal(await page.locator('#boot-error').textContent(),'');
 await page.evaluate(async()=>{const G=globalThis.__G,g=G.game;g.debug.freeze();g._skipRender=true;g.menus.wipe.cancel();await g.startMatch({mapId:'bluefin',mode:'turf',difficulty:'easy'});});console.log('actual Bluefin game ready');
 result.movement=await page.evaluate(async()=>{
  const G=globalThis.__G,g=G.game,T=await import(new URL('vendor/three/build/three.module.js',document.baseURI)),a=G.local,controller=G.match.controller,update=controller.update,rows=[];
  let sign=-1;controller.update=()=>{a.intent.move.set(sign,0,0);a.intent.jump=a.intent.fire=a.intent.squid=false;};
  try{for(sign of [-1,1])for(const hz of [30,60,120]){
   const start=new T.Vector3(sign*12,3,sign*6),support=G.physics.raycast(start.clone().add(new T.Vector3(0,.2,0)),new T.Vector3(0,-1,0),.4);
   if(!support.hit||Math.abs(support.point.y-3)>.00001)throw Error('No central source support');
   a.spawnAt(start,0);G.paint.splat(support.point.clone().addScaledVector(support.normal,.03),.7,a.team,{instant:true,seed:.1});
   for(let frame=0;frame<hz*.5;frame++){g._frame(1/hz);if(!a.alive||frame>1&&(!a.grounded||Math.abs(a.pos.y-3)>.01))throw Error('Central Game traversal lost support '+JSON.stringify({sign,hz,frame,pos:a.pos.toArray(),grounded:a.grounded}));}
   if(a.pos.distanceTo(start)<1)throw Error('Movement did not execute');
   if(G.paint.sample(support.face,support.u,support.v)!==a.team+1)throw Error('Central source paint ownership missing');
   rows.push({sign,hz,start:start.toArray(),end:a.pos.toArray(),grounded:a.grounded});
  }}finally{controller.update=update;}
  return {rows,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,sourceSha256:G.level.manifest.sourceSha256,geometry:G.level.manifest.geometry};
 });
 assert.equal(result.movement.rows.length,6);assert.equal(result.movement.actors,8);assert.equal(result.movement.bots,7);save();
 result.views=[];
 for(const [name,position,target] of [['center',[0,20,28],[0,3,0]],['overhead',[0,80,.01],[0,0,0]],['negative-court',[-12,7,-20],[-12,3,-6]],['positive-court',[12,7,20],[12,3,6]]]){
  const draw=await page.evaluate(({position,target})=>{const G=globalThis.__G;G.paint.flush(1/60);G.camera.position.set(...position);G.camera.lookAt(...target);G.camera.updateMatrixWorld();G.post.render(1/60);const gl=G.renderer.getContext();if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL error');return {...G.renderer.info.render};},{position,target});
  assert(draw.calls>0&&draw.triangles>0);result.views.push({name,...draw});await page.screenshot({path:path.join(out,name+'.png')});save();
 }
 result.reload=await page.evaluate(async()=>{const G=globalThis.__G,g=G.game,old=G.level,signature=JSON.stringify(old.manifest.geometry);for(const mapId of ['tidewater','bluefin'])await g.startMatch({mapId,mode:'turf',difficulty:'easy'});const h=G.physics.raycast(G.local.pos.clone().set(12,3.2,6),G.local.pos.clone().set(0,-1,0),.4);return {newWorld:G.level!==old,id:G.level.layout.id,geometryUnchanged:JSON.stringify(G.level.manifest.geometry)===signature,centralSupport:h.hit&&Math.abs(h.point.y-3)<.00001,actors:G.actors.length};});
 assert.equal(result.reload.newWorld,true);assert.equal(result.reload.id,'bluefin');assert.equal(result.reload.geometryUnchanged,true);assert.equal(result.reload.centralSupport,true);assert.equal(result.reload.actors,8);assert.deepEqual(result.errors,[]);result.status='passed';
}catch(error){result.status='failed';result.error=error.stack;throw error;}finally{save();await browser.close();await new Promise(r=>server.close(r));}
