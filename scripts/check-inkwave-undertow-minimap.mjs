#!/usr/bin/env node
// Real built runtime and Canvas2D projection; source pixels remain ignored.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]||'_site-native-undertow-final'),out=path.resolve(process.argv[3]||'.browser-evidence/undertow-minimap-browser');
fs.mkdirSync(out,{recursive:true});
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{const pathname=new URL(req.url,'http://local').pathname,file=path.resolve(site,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],result={status:'running',errors};
try{
 const page=await browser.newPage({viewport:{width:960,height:640}});page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0})));
 await page.goto('http://127.0.0.1:'+server.address().port+'/?map=undertow',{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G);
 await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});
 assert.equal(await page.locator('#boot-error').textContent(),'');
 await page.evaluate(async()=>{const g=NG.game;g.debug.freeze();g._skipRender=true;g.menus.wipe.cancel();await g.startMatch({mapId:'undertow',mode:'turf',difficulty:'normal'});for(let i=0;i<330;i++)g._frame(1/60);g.debug.freezeBots();});
 result.proof=await page.evaluate(()=>{
  const G=NG,map=G.game.minimap,level=G.level,nav=G.nav,w=level.triangleWorld,origin=level.spawnPads[0].clone(),down=origin.clone().set(0,-1,0);
  if(level.nativeNav!==nav||nav.level!==level)throw Error('Minimap borrowed navigation from a different world');
  map.ensure();let selected=null;
  for(let i=0;i<map.pixCell.length;i++){
   if(map.pixCell[i]<0)continue;
   const x=map._worldX(i%map.w+.5),z=map._worldZ(Math.floor(i/map.w)+.5),top=w.ray(origin.set(x,w.nodes[4]+1,z),down,w.nodes[4]-w.nodes[1]+2,{minNormalY:.45});
   if(!top||top.point.y<map.hgt[i]+3)continue;
   const h=w.ray(origin.set(x,map.hgt[i]+.1,z),down,.3,{minNormalY:.68});if(!h)continue;
   G.paint.splat(h.point.clone().addScaledVector(h.normal,.03),1.5,0,{seed:.3125,instant:true});
   if(G.paint.grid[map.pixCell[i]]!==1)continue;
   selected={pixel:i,x,z,floor:map.hgt[i],cover:top.point.y,sourceFloorTriangle:h.triangle,sourceCoverTriangle:top.triangle,paintCell:map.pixCell[i]};break;
  }
  if(!selected)throw Error('No painted reachable source floor beneath overhead cover');
  for(let i=0;i<3;i++)map.update(1/60,true); // settle any in-flight band before the forced full projection
  if(map.owner[selected.pixel]!==1||map.inkImg.data[selected.pixel*4+3]!==255)throw Error('Reachable floor ink missing from Canvas2D minimap');
  const preview=document.createElement('canvas');preview.width=map.w;preview.height=map.h;preview.getContext('2d').drawImage(map.canvas,0,0);Object.assign(preview.style,{position:'fixed',right:'8px',top:'8px',zIndex:100000,width:map.w+'px',height:map.h+'px',border:'2px solid white'});document.body.append(preview);
  G.renderer.render(G.scene,G.camera);
  return {id:level.layout.id,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,levelOwnsCurrentNav:true,selected,mapOwner:map.owner[selected.pixel],mapAlpha:map.inkImg.data[selected.pixel*4+3],version1130Verified:false};
 });
 assert.equal(result.proof.id,'undertow');assert.equal(result.proof.actors,8);assert.equal(result.proof.bots,7);assert.equal(errors.length,0);
 await page.screenshot({path:path.join(out,'undertow-minimap.png'),timeout:60000});result.status='passed';console.log(JSON.stringify(result));
}catch(error){result.status='failed';result.error=error.stack;throw error;}
finally{fs.writeFileSync(path.join(out,'minimap-browser.json'),JSON.stringify(result,null,2));await browser.close();await new Promise(r=>server.close(r));}
