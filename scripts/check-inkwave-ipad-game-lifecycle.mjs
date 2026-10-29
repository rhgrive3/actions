#!/usr/bin/env node
// Real practice-range Game; software Chromium cannot establish physical iPad reliability.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import {chromium,devices} from 'playwright';
import {createResponsiveAssetServer} from './lib/inkwave-responsive-server.mjs';
const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const site=path.resolve(arg('--site','_site')),out=path.resolve(arg('--out','work/ipad-game-lifecycle.json'));
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);
for(const [name,digest] of Object.entries(manifest.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,name))),digest,name);
const server=createResponsiveAssetServer({source:site,html:'unused'});const serve=server.listeners('request')[0];server.removeAllListeners('request');server.on('request',(req,res)=>{if(new URL(req.url,'http://localhost').pathname==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(fs.readFileSync(path.join(site,'index.html')));}else serve(req,res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({...devices['iPad Pro 11'],viewport:{width:1024,height:768}}),page=await context.newPage(),errors=[];
 page.on('console',m=>{if(m.text().startsWith('gpu-check-cycle'))console.log(m.text());});
 page.on('pageerror',e=>{errors.push(e.message);console.error('pageerror',e.message);});
 await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,lang:'en',master:0,music:0,frameRate:60})));
 await page.goto(`http://127.0.0.1:${server.address().port}/?range&skipTitle&news=0`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__G?.match?.range&&__G.match.state==='playing'||document.querySelector('#boot-error')?.textContent,null,{timeout:180000});if(await page.locator('#boot-error').textContent())throw Error(await page.locator('#boot-error').textContent());console.log('range booted');
 const rows=await page.evaluate(async()=>{
  const G=window.__G,g=G.game,rows=[];g.debug.freeze();document.documentElement.classList.add('iw-ios');
  for(let i=0;i<6;i++){
   g.pause();g._frame(1/60);if(!g.R._pauseSnapshot)throw Error('No paused app snapshot');
   await new Promise(r=>requestAnimationFrame(r));g._frame(1/60);
   const time=g.match.time,actor=g.match.local.pos.toArray();
   g._setSettings({quality:i%2?'low':'high'});g._frame(1/60);
   if(g.match.time!==time||JSON.stringify(actor)!==JSON.stringify(g.match.local.pos.toArray()))throw Error('Paused settings advanced gameplay');
   const gl=G.renderer.getContext();if(gl.isContextLost()||gl.getError())throw Error('App GL error');
   rows.push({cycle:i,snapshot:true,quality:g.settings.quality,liveTextures:G.renderer.info.memory.textures});
   g.resume();g._frame(1/60);if(g.R._pauseSnapshot)throw Error('Snapshot survived resume');console.log('gpu-check-cycle',i);
  }
  g.pause();g._frame(1/60);await g.quitToMenu();g._frame(1/60);
  if(g.R._pauseSnapshot||g.menus.current!=='main'||!g.match.attract)throw Error('Paused quit failed');
  return{cycles:rows,quit:true};
 });
 assert.deepEqual(errors,[]);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({status:'passed',contentHash:manifest.contentHash,inputHash:manifest.inputHash,revision:manifest.build.revision,physicalDeviceVerified:false,scope:'Chromium software WebGL; actual practice-range Game',...rows,errors},null,2));console.log(JSON.stringify(rows));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
