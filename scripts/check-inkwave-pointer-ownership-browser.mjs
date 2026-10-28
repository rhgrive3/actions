#!/usr/bin/env node
// Full-game pointer ownership only. No clock stepping, engine state writes,
// mouse-lock API replacement, injected input or weapon charge assertions.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { enterRangeFromMenu, rangeMenuControlReady } from './lib/inkwave-range-menu-entry.mjs';

const site=path.resolve(process.argv[2]), out=path.resolve(process.argv[3]);
fs.mkdirSync(out,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
assert.equal(sha(JSON.stringify(manifest.files)),manifest.inputHash);
assert.equal(sha(JSON.stringify(manifest.artifacts)),manifest.contentHash);
for(const file of ['src/core/input.js','src/core/ctx.js','src/main.js','patches/practice-range/runtime/menu.mjs'])
  assert.equal(sha(fs.readFileSync(path.join(site,file))),manifest.artifacts[file],file+' emitted hash');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg'};
const server=http.createServer((req,res)=>{
  const f=path.resolve(site,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!f.startsWith(site+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('content-type',mime[path.extname(f)]||'application/octet-stream');fs.createReadStream(f).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const receipt={kind:'full-game-pointer-ownership',status:'running',scope:'Trusted UI clicks and keyboard Escape; actual DOM pointer lock and Input owner. No frame stepping, input API replacement, weapon charge, all-weapons or performance claim.',inputHash:manifest.inputHash,contentHash:manifest.contentHash,viewport:{width:960,height:600},settings:{quality:'low',lang:'en'},entry:null,cycles:[],pageErrors:[],consoleErrors:[],pointerErrors:0};
let browser,page,step='launch';
const weapons=['s3-charger-light','s3-charger-long','s3-charger-pencil','s3-stringer-normal','s3-stringer-short','s3-stringer-explosion'];
async function snapshot(){return page.evaluate(()=>({sameMatch:window.__G?.match===window.__pointerOwner,playing:window.__G?.match?.state==='playing',paused:window.__G?.match?.paused,menu:window.__inkwave?.menus?.current,domLocked:document.pointerLockElement===window.__inkwave?.input?.canvas,inputLocked:window.__inkwave?.input?.locked,weapon:window.__G?.local?.weapon?.id,pointerErrors:window.__pointerErrors,gestures:window.__pointerGestures.slice(-8)}));}
async function pause(){
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>window.__G?.match===window.__pointerOwner&&window.__G.match.paused&&window.__inkwave?.menus?.current==='pause',null,{timeout:45000});
}
async function clickReady(selector){
  await page.waitForFunction(rangeMenuControlReady,{selector,menu:'pause'},{timeout:45000});
  await page.locator(selector).click({timeout:45000});
}
async function lock(expectedWeapon){
  await page.waitForFunction(expected=>window.__G?.match===window.__pointerOwner&&window.__G.match.state==='playing'&&!window.__G.match.paused&&!window.__inkwave?.menus?.current&&document.pointerLockElement===window.__inkwave?.input?.canvas&&window.__inkwave?.input?.locked&&(!expected||window.__G.local.weapon.id===expected),expectedWeapon,{timeout:45000});
  const s=await snapshot();assert.equal(s.sameMatch,true);assert.equal(s.domLocked,true);assert.equal(s.inputLocked,true);return s;
}
try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  receipt.browser=browser.version();page=await browser.newPage({viewport:receipt.viewport});
  page.on('pageerror',e=>receipt.pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')receipt.consoleErrors.push(m.text());});
  await page.addInitScript(()=>{
    localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',lang:'en'}));
    window.__pointerErrors=0;window.__pointerGestures=[];
    document.addEventListener('pointerlockerror',()=>window.__pointerErrors++);
    document.addEventListener('click',e=>{const el=e.target?.closest?.('[data-id]');window.__pointerGestures.push({id:el?.dataset.id||null,trusted:e.isTrusted});},true);
  });
  step='enter range';receipt.entry=await enterRangeFromMenu(page,'http://127.0.0.1:'+server.address().port,{timeout:180000,onProgress:r=>console.log('entry',r.route.join('/'))});
  await page.evaluate(()=>{window.__pointerOwner=window.__G.match;});
  if(!await page.evaluate(()=>document.pointerLockElement===window.__inkwave.input.canvas&&window.__inkwave.input.locked))await page.locator('#game-canvas').click({timeout:45000});
  step='initial ownership';receipt.initial=await lock(null);
  for(let i=0;i<weapons.length;i++){
    const cycle={number:i+1,weapon:weapons[i]};receipt.cycles.push(cycle);
    step=`cycle ${i+1} pause for resume`;await pause();
    step=`cycle ${i+1} resume`;await clickReady('[data-id="resume"]');cycle.resume=await lock(null);
    assert.ok(cycle.resume.gestures.some(g=>g.id==='resume'&&g.trusted),'trusted resume click');
    step=`cycle ${i+1} pause for weapon`;await pause();
    step=`cycle ${i+1} weapon tab`;await clickReady('[data-id="r-tab-weapon"]');
    step=`cycle ${i+1} weapon select`;await clickReady(`[data-id="w-${weapons[i]}"]`);cycle.selected=await lock(weapons[i]);
    assert.ok(cycle.selected.gestures.some(g=>g.id==='w-'+weapons[i]&&g.trusted),'trusted weapon click');
    console.log('cycle',i+1,'passed',weapons[i]);
  }
  assert.deepEqual(receipt.pageErrors,[]);receipt.pointerErrors=await page.evaluate(()=>window.__pointerErrors);receipt.status='passed';
}catch(error){
  receipt.status='failed';receipt.failure={step,error:error.stack,state:page?await snapshot().catch(()=>null):null};
  process.exitCode=1;
}finally{
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(receipt,null,2)+'\n');
  await browser?.close();await new Promise(resolve=>server.close(resolve));
}
console.log(JSON.stringify(receipt,null,2));
