// #841: ordinary native input, Actor/WeaponRunner and real Storm throw in a
// normally booted game. Controlled HP/timer setup; no replacement throw method.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
fs.mkdirSync(out,{recursive:true});
const identity=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://local');if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
 const file=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(site+'/')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser,page;const errors=[],report={status:'running',contentHash:identity.contentHash,inputHash:identity.inputHash,cases:[],errors,scope:'Chromium SwiftShader; genuine range bootstrap and native input; controlled HP/damage age/special gauge. No hardware or Nintendo animation equivalence.'};
const write=()=>fs.writeFileSync(path.join(out,'storm-recovery.json'),JSON.stringify(report,null,2)+'\n');
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 page=await browser.newPage({viewport:{width:960,height:640},serviceWorkers:'block'});
 page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false,musicVolume:0})));
 await page.goto('http://127.0.0.1:'+server.address().port+'/?range&skipTitle',{waitUntil:'commit'});
 await page.waitForFunction(()=>window.__G?.match?.range&&window.__G.match.state==='playing',null,{timeout:240000});
 await page.evaluate(()=>{const g=window.__inkwave;g.debug.freeze();g.debug.freezeBots();g._skipRender=true;});
 report.cases=await page.evaluate(async()=>{
  const G=window.__G,g=window.__inkwave,{WEAPONS}=await import(new URL('src/config.js',document.baseURI));
  const weapon=Object.values(WEAPONS).find(w=>w.special==='storm');if(!weapon)throw Error('No real Storm kit');
  const a=G.local,spawn=a.pos.clone(),rows=[];globalThis.__stormRecoveryRows=rows;
  for(const hz of [30,60,120])for(const scenario of ['eligible','delay','cap']){
   G.projectiles.clear();a.spawnAt(spawn,0);a.setWeapon(weapon.id);
   g.debug.key('ShiftLeft',false);g.debug.key('KeyQ',false);g.debug.key('KeyE',false);g.debug.fire(false);
   // Independent fully charged case setup, not a rapid special-reuse claim.
   a.stormGaugeLock=0;a.stormGaugeDuration=0;
   a.ink=80;a.special=weapon.specialCost;a.hp=scenario==='cap'?99:50;a.lastDamage=scenario==='delay'?0:10;
   // Release the previous physical input before admitting a fresh native edge.
   g._frame(1/60);a.hp=scenario==='cap'?99:50;a.lastDamage=scenario==='delay'?0:10;
   g.debug.key('KeyQ',true);g._frame(1/60);g.debug.key('KeyQ',false);
   if(a.specialActive?.id!=='storm')throw Error('Native Q input did not admit Storm');
   g.debug.key('KeyE',true);g._frame(1/60);g.debug.key('KeyE',false);
   a.hp=scenario==='cap'?99:50;a.lastDamage=scenario==='delay'?0:10;
   const before={hp:a.hp,ink:a.ink,position:a.pos.toArray(),lastDamage:a.lastDamage};
   g._frame(1/60);
   if(a.specialActive?.phase!=='throw'||!G.projectiles.bombs.some(b=>b.kind==='storm'))throw Error('Native sub release did not emit the actual Storm device');
   let ticks=1,activeTicks=1;const original=a.update;
   a.update=function(dt){ticks++;if(this.specialActive?.id==='storm')activeTicks++;return original.call(this,dt);};
   try{for(let frame=0;frame<hz/5;frame++)g._frame(1/hz);}finally{a.update=original;}
   const expected=scenario==='delay'?before.hp:Math.min(100,before.hp+ticks*.21);
   const row={hz,scenario,weapon:weapon.id,ticks,activeTicks,before,hp:a.hp,expected,ink:a.ink,submerged:a.submerged,active:a.specialActive?.id??null,clouds:G.projectiles.clouds.length,position:a.pos.toArray()};
   if(Math.abs(row.hp-expected)>1e-5)throw Error('HP recovery mismatch '+JSON.stringify(row));
   if(row.submerged||activeTicks!==ticks)throw Error('Case left ordinary throw state '+JSON.stringify(row));
   rows.push(row);
  }
  // Continue one real paid throw through release to prove its emitter was not stubbed.
  for(let i=0;i<90&&!G.projectiles.clouds.length;i++)g._frame(1/60);
  if(!G.projectiles.clouds.length)throw Error('Real Storm emitter did not create its cloud');
  return rows;
 });
 assert.equal(report.cases.length,9);assert.deepEqual(errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=String(error?.stack||error);if(page)report.observed=await page.evaluate(()=>({mode:window.__G?.mode,state:window.__G?.match?.state,boot:document.body.innerText.slice(-600),cases:globalThis.__stormRecoveryRows||[]})).catch(()=>null);throw error;}
finally{write();if(browser)await browser.close();await new Promise(r=>server.close(r));}
