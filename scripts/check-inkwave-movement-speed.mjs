#!/usr/bin/env node
// Browser acceptance of the emitted, fully installed movement/weapon owners.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
const option=name=>{const i=process.argv.indexOf(name);if(i<0||!process.argv[i+1])throw Error('Required '+name);return path.resolve(process.argv[i+1]);};
const site=option('--site'),evidence=option('--evidence-dir'),profile=option('--profile-dir');
fs.mkdirSync(evidence,{recursive:true});fs.mkdirSync(profile,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
if(hash(JSON.stringify(manifest.artifacts))!==manifest.contentHash)throw Error('Invalid build identity');
for(const [file,expected]of Object.entries(manifest.artifacts))if(hash(fs.readFileSync(path.join(site,file)))!==expected)throw Error('Artifact drift: '+file);
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.glb':'model/gltf-binary'};
const server=http.createServer((req,res)=>{
  const file=path.resolve(site,'.'+(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':decodeURIComponent(new URL(req.url,'http://localhost').pathname)));
  if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser=await chromium.launchPersistentContext(profile,{headless:true,viewport:{width:1000,height:700},args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage();
  await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false})));
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{globalThis.movementG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
  await page.waitForFunction(()=>movementG?.game?.menus&&movementG.s3?.installed&&movementG.mode!=='boot',null,{timeout:180000});
  await page.evaluate(async()=>{const g=movementG.game;g.debug.freeze();g.menus.wipe.cancel();await g.startMatch({mapId:'tidewater',difficulty:'easy',duration:180,mode:'turf'});});
  await page.waitForFunction(()=>movementG.game.hud?._visible,null,{timeout:20000});
  const result=await page.evaluate(async()=>{
    const G=movementG,g=G.game;g.debug.freezeBots();g._skipRender=true;
    for(let i=0;i<270;i++)g._frame(1/60);
    const a=g.match.local,r=a.weaponRunner;
    const {Level}=await import(new URL('src/world/level.js',document.baseURI));
    const {Physics}=await import(new URL('src/game/physics.js',document.baseURI));
    const profile=await fetch(new URL('patches/splatoon3/profile.json',document.baseURI)).then(r=>r.json());
    const saved={level:G.level,physics:G.physics,actors:G.actors,sample:G.paint.sample};
    const rows=[];const near=(x,y,label)=>{if(Math.abs(x-y)>1e-7)throw Error(`${label}: ${x} != ${y}`);};
    try {
      // Deliberately controlled clean flat geometry, real installed Actor/Physics.
      // This isolates direction from map obstacles/old paint; it is not a Switch measurement.
      G.level=new Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});
      G.physics=new Physics(G.level);G.actors=[a];G.paint.sample=()=>0;
      a.s3.loadout=Array.from({length:3},()=>({main:'none',subs:['none','none','none']}));
      for(const mode of ['walk','shoot','roller']) {
        for(let degrees=0;degrees<360;degrees+=15) {
          a.setWeapon(mode==='roller'?'roller':'shooter');r.reset();
          a.alive=true;a.form='kid';a.grounded=true;a.climbing=false;a.superJumpState=null;a.specialActive=null;
          a.pos.set(0,0,0);a.vel.set(0,0,0);a.kidT=1;a.hardLand=0;a.ink=100;a.onEnemy=false;
          a.intent.sub=a.intent.squid=a.intent.jump=a.intent.special=false;
          a.intent.fire=mode!=='walk';
          const angle=degrees*Math.PI/180;a.intent.move.set(Math.sin(angle),0,Math.cos(angle));
          let baseRoll=false,dash=false,min=Infinity,max=0;
          for(let i=0;i<150;i++) {
            G.time+=1/60;a.update(1/60);
            const speed=Math.hypot(a.vel.x,a.vel.z);
            if(mode==='roller'&&r.rolling){near(r.moveSpeed(),r.rollT+1e-10<1.5?6.48:7.92,'roller target');baseRoll ||= r.rollT<1.5;dash ||= r.rollT>=1.5;}
            if(i>=130){min=Math.min(min,speed);max=Math.max(max,speed);}
          }
          const expected=mode==='walk'?5.76:mode==='shoot'?4.32:7.92;
          near(min,expected,`${mode} ${degrees}deg min`);near(max,expected,`${mode} ${degrees}deg max`);
          if(mode==='roller'&&(!baseRoll||!dash))throw Error('Actual roller never traversed normal/dash states');
          rows.push({mode,degrees,min,max,distance:Math.hypot(a.pos.x,a.pos.z),baseRoll,dash});
          G.projectiles.clear();
        }
      }
      for(const mode of ['walk','shoot','roller']) {
        const subset=rows.filter(r=>r.mode===mode),first=subset[0].distance;
        for(const row of subset)near(row.distance,first,`${mode} equal direction travel`);
      }
      return {status:'passed',referenceVersion:profile.referenceVersion,conditions:rows.length,rows,
        scope:'fully installed browser runtime on controlled native clean flat geometry; Switch/device comparison unmeasured'};
    } finally {Object.assign(G,{level:saved.level,physics:saved.physics,actors:saved.actors});G.paint.sample=saved.sample;g._skipRender=false;}
  });
  result.contentHash=manifest.contentHash;
  fs.writeFileSync(path.join(evidence,'movement-speed.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,conditions:result.conditions,contentHash:result.contentHash}));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
