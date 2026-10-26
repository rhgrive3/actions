#!/usr/bin/env node
// Ordinary menu, pointer-lock and held-mouse input only. No debug stepping,
// gameplay clock changes, actor teleportation, injected fire or mocked audio.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';
import { enterRangeFromMenu, rangeMenuControlReady } from './lib/inkwave-range-menu-entry.mjs';
const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg'};
const server=http.createServer((q,r)=>{
  const file=path.resolve(site,'.'+new URL(q.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){r.writeHead(404);r.end();return;}
  r.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(r);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const receipt={contentHash:JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))).contentHash,kind:'ordinary-input',passed:false,errors:[],scenes:[],console:[],requestFailures:[]};
let page;
try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',e=>receipt.errors.push(e.message));
  page.on('console',e=>{if(e.type()==='error'||e.type()==='warning')receipt.console.push(e.text());});
  page.on('requestfailed',r=>receipt.requestFailures.push({url:r.url(),failure:r.failure()?.errorText}));
  await page.addInitScript(()=>{
    localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',lang:'en'}));
    window.pointerErrors=0;document.addEventListener('pointerlockerror',()=>window.pointerErrors++);
    window.chargeObservations=[];
    function observe(){
      const G=window.__G,a=G?.local,r=a?.weaponRunner;
      if(r&&window.chargeObservations.length<5000)window.chargeObservations.push({wall:performance.now(),time:G.time,id:a.weapon.id,q:r.charge,stage:r.chargeStage,charging:r.charging,ink:a.ink,heads:G.projectiles.list.filter(p=>p.catalog).length,drops:G.projectiles.chargerDrops.length});
      requestAnimationFrame(observe);
    }requestAnimationFrame(observe);
  });
  receipt.entry=await enterRangeFromMenu(page,'http://127.0.0.1:'+server.address().port,{timeout:90000,onProgress:r=>console.log('entry',r.route.join('/'))});
  for(const id of ['s3-charger-light','s3-charger-long','s3-charger-pencil','s3-stringer-normal','s3-stringer-short','s3-stringer-explosion']){
    receipt.activeWeapon=id;
    if(await page.evaluate(()=>window.__inkwave.menus.current!=='pause'))await page.keyboard.press('Escape');
    await page.waitForFunction(rangeMenuControlReady,{selector:'[data-id="r-tab-weapon"]',menu:'pause'},{timeout:15000});
    await page.locator('[data-id="r-tab-weapon"]').click();
    await page.locator('[data-id="w-'+id+'"]').click();
    await page.waitForFunction(id=>window.__G.local.weapon.id===id&&window.__G.match.state==='playing'&&!window.__inkwave.menus.current,id,{timeout:15000});
    if(!await page.evaluate(()=>window.__inkwave.input.locked))await page.locator('#game-canvas').click();
    await page.waitForTimeout(200);
    const locked=await page.evaluate(()=>window.__inkwave.input.locked);
    if(!locked){receipt.blocker={action:'hold mouse fire through the real game input',target:id,reason:'pointer lock not acquired',pointerlockerror:await page.evaluate(()=>window.pointerErrors),outcome:'not executed'};break;}
    const start=await page.evaluate(()=>performance.now());
    await page.mouse.down();
    try{await page.waitForFunction(()=>window.__G.local.weaponRunner.charge>=1,null,{timeout:15000});}
    finally{await page.mouse.up();}
    await page.waitForTimeout(1200);
    const scene=await page.evaluate(({id,start})=>({id,rows:window.chargeObservations.filter(r=>r.id===id&&r.wall>=start),pointerErrors:window.pointerErrors,ink:window.__G.local.ink}),{id,start});
    scene.maxCharge=Math.max(...scene.rows.map(r=>r.q));scene.stagesSeen=[...new Set(scene.rows.map(r=>r.stage))];
    scene.headSeen=scene.rows.some(r=>r.heads>0);scene.dropSeen=scene.rows.some(r=>r.drops>0);
    receipt.scenes.push(scene);console.log('observed',id,'samples',scene.rows.length,'max',scene.maxCharge);
    await page.screenshot({path:path.join(out,id+'.png')});
  }
  receipt.bowStagesObserved=receipt.scenes.filter(s=>s.id.includes('stringer')).length===3&&receipt.scenes.filter(s=>s.id.includes('stringer')).every(s=>s.stagesSeen.includes(1)&&s.stagesSeen.includes(2));
  receipt.passed=!receipt.blocker&&receipt.errors.length===0&&receipt.scenes.length===6&&receipt.scenes.every(s=>s.maxCharge>=1);
}catch(error){
  receipt.failure=error.stack;
  if(page){
    receipt.failureState=await page.evaluate(()=>({menu:window.__inkwave?.menus?.current,mode:window.__G?.mode,body:document.body.innerText.slice(0,3000),pointerErrors:window.pointerErrors,locked:window.__inkwave?.input?.locked,charge:window.__G?.local?.weaponRunner?.charge,time:window.__G?.time,lastFrames:window.chargeObservations?.slice(-15)})).catch(e=>({error:e.message}));
    await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});
  }
  throw error;
}
finally{
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(receipt,null,2)+'\n');
  await browser?.close();await new Promise(r=>server.close(r));
}
