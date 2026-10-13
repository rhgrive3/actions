#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]||'.browser-evidence/native-spawn-nav');fs.mkdirSync(out,{recursive:true});
const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),result={status:'running',stages:[],errors:[]};
try{
 const c=await browser.newContext({viewport:{width:960,height:640}}),p=await c.newPage();p.on('pageerror',e=>result.errors.push(e.message));
 await p.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0})));
 await p.goto('http://127.0.0.1:'+server.address().port+'/?map=tidewater',{waitUntil:'domcontentloaded'});
 await p.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
 await p.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});assert.equal(await p.locator('#boot-error').textContent(),'');
 await p.evaluate(()=>NG.game.debug.freeze());
 const legacy=await p.evaluate(async()=>{const {MAPS}=await import(new URL('src/config.js',document.baseURI));await NG.game._buildWorld(MAPS.find(m=>m.id==='tidewater'));const bytes=new TextEncoder().encode(JSON.stringify([NG.nav.nodes,Array.from(NG.nav.valid)])),digest=await crypto.subtle.digest('SHA-256',bytes);return{nodes:NG.nav.nodes.length,valid:NG.nav.validIds.length,digest:Array.from(new Uint8Array(digest))};});
 for(const id of (process.env.NATIVE_STAGE_IDS||'scorch,hagglefish,inkblot,mako,brinewater').split(',')){
  await p.evaluate(async id=>{const g=NG.game;g.menus.wipe.cancel();await g.startMatch({mapId:id,mode:'turf',difficulty:'normal'});g._skipRender=true;for(let i=0;i<330;i++)g._frame(1/60);g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<100;i++)g._frame(1/60);g._skipRender=false;},id);
  const numeric=await p.evaluate(()=>{
   const G=NG,L=G.level,N=G.nav,down=G.local.pos.clone().set(0,-1,0),seeds=L.spawnPads.map((pad,team)=>{
    const h=G.physics.raycast(pad.clone().setY(pad.y+.3),down,.6),node=N.nodes[N.nearest(pad,1.2)];
    if(!h.hit||!node||Math.abs(node.y-h.point.y)>.7)throw Error('Spawn navigation changed source layer');
    return {team,pad:pad.toArray(),node:node.id,nodeHeight:node.y,sourceHeight:h.point.y,sourceTriangle:h.triangle};
   });
   G.game.minimap.ensure();G.paint.flush(1/60);G.renderer.render(G.scene,G.camera);G.renderer.getContext().finish();
   const gl=G.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
   return{id:L.layout.id,sourceSha256:L.manifest.sourceSha256,seeds,nodes:N.nodes.length,validNodes:N.validIds.length,lowerHullCandidates:N.nodes.filter(n=>n.y< -4).length,lowerHullValid:N.validIds.filter(id=>N.nodes[id].y< -4).length,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,positions:G.actors.map(a=>({team:a.team,alive:a.alive,grounded:a.grounded,pos:a.pos.toArray(),launch:!!a.s3?.squidSpawn})),sourceCollisionTriangles:L.triangleWorld.triangleCount,minimap:{built:!!G.game.minimap._built,width:G.game.minimap.canvas.width,height:G.game.minimap.canvas.height,livePaintPixels:Array.from(G.game.minimap.pixCell).filter(k=>k>=0).length},renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
  });
  assert.equal(numeric.id,id);assert.equal(numeric.actors,8);assert.equal(numeric.bots,7);assert(numeric.minimap.built&&numeric.minimap.livePaintPixels>0);if(id==='manta'){assert(numeric.lowerHullCandidates>5000);assert.equal(numeric.lowerHullValid,0);}
  result.stages.push(numeric);await p.screenshot({path:path.join(out,id+'.png'),timeout:60000});console.log(JSON.stringify(numeric));
 }
 result.legacy=await p.evaluate(async()=>{const {MAPS}=await import(new URL('src/config.js',document.baseURI));await NG.game._buildWorld(MAPS.find(m=>m.id==='tidewater'));const bytes=new TextEncoder().encode(JSON.stringify([NG.nav.nodes,Array.from(NG.nav.valid)])),digest=await crypto.subtle.digest('SHA-256',bytes);return{nodes:NG.nav.nodes.length,valid:NG.nav.validIds.length,digest:Array.from(new Uint8Array(digest))};});
 assert.deepEqual(result.legacy,legacy);result.legacy={nodes:legacy.nodes,valid:legacy.valid,unchanged:true};assert.equal(result.errors.length,0);result.status='passed';
}catch(e){result.status='failed';result.error=e.stack;throw e;}finally{fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(result,null,2));await browser.close();await new Promise(r=>server.close(r));}
