#!/usr/bin/env node
// Bounded real-Game browser diagnostic for the frozen same-seed sheet blocker.
// A separate native pool per seed control; no clear, pool reset or effect reset.
// Expected to fail its retained sheet assertion until an independently reviewed fix.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {enterRangeFromMenu} from './lib/inkwave-range-menu-entry.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const [siteArg,outArg]=process.argv.slice(2),site=fs.realpathSync(siteArg),out=path.resolve(outArg);
assert(!fs.existsSync(out),'preserve existing browser evidence');fs.mkdirSync(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const identity=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
assert.equal(identity.contentHash,'8e3a99d990ef0f2185c0b013386c24b8e1c676975927a255efd6808ff2b0e09f');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),relative=decodeURIComponent(url.pathname).replace(/\/$/,'/index.html'),file=path.resolve(site,'.'+relative);
  if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser,page;
const receipt={build:{inputHash:identity.inputHash,contentHash:identity.contentHash},scriptSha256:hash(fs.readFileSync(new URL(import.meta.url))),errors:[],responses:[],scope:'one real offline Game/Chromium SwiftShader; controlled fixed60 replay and synthetic saturation; no real-peer, hardware or retail acceptance'};
const reads=[],save=()=>fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
try {
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  receipt.browser=await browser.version();page=await browser.newPage({viewport:{width:1000,height:760}});
  page.on('pageerror',e=>receipt.errors.push(e.message));
  page.on('response',r=>{const u=new URL(r.url());if(/\/src\/(?:main|game\/(?:actor|weapons))\.js$|\/runtime\/(?:spawn-exclusion|weapon-handoff-motion|special-vfx|projectile-presentation|s3-projectile-shapes|shooter-muzzle-droplets|kit-trizooka)\.mjs$/.test(u.pathname))reads.push(r.body().then(b=>receipt.responses.push({path:u.pathname,status:r.status(),sha256:hash(b)})));});
  await page.addInitScript(()=>{
    localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',lang:'en',shadows:false,bloom:false,minimap:false}));
    localStorage.setItem('inkwave.profile',JSON.stringify({name:'Six-way QA',weapon:'shooter',style:{hair:0,skin:2,outfit:0,eyes:0}}));
    localStorage.setItem('inkwave.splatoon3.gear.v1',JSON.stringify(Array.from({length:3},()=>({main:'none',subs:['none','none','none']}))));
    let seed=0x600019;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  });
  receipt.entry=await enterRangeFromMenu(page,'http://127.0.0.1:'+server.address().port,{timeout:180000,onProgress:r=>console.log('entry',r.route.join('/'))});
  receipt.pool=await page.evaluate(async()=>{
    const G=window.__G,g=window.__inkwave,a=G.local;g.debug.freeze();g.debug.freezeBots();
    await a.character.sourceMotion.ready;
    const {Projectiles}=await import(new URL('src/game/weapons.js',document.baseURI));
    const {throwVolley,trizookaSpecialWeapon}=await import(new URL('patches/splatoon3/runtime/kit-trizooka.mjs',document.baseURI));
    a.pos.set(-14.6,.04,0);a.character.root.position.copy(a.pos);a.aimDir.set(0,0,1);a.aimPoint.set(-14.6,.5,25);a.yaw=a.aimYaw=0;
    const nativeRandom=Math.random;let randomSeed=.37;Math.random=()=>randomSeed;
    const cases=[];
    try {for(const finalSeed of [.37,.38]){
      randomSeed=.37;const ps=new Projectiles(G.scene),ids=new WeakMap();let nextId=1;
      const id=p=>{if(!ids.has(p))ids.set(p,nextId++);return ids.get(p);};
      const rows=[];
      const step=()=>{G.time+=1/60;ps.update(1/60);ps._draw();};
      const draw=phase=>{ps._draw();const row={phase,ids:ps.list.map(id),seeds:ps.list.map(p=>p.seed),shapes:ps.list.map(p=>p.s3Shape),sheets:ps._s3Shapes.sheets.bursts.length,sheetInstances:ps.s3ShapeCounts.sheets,addedDrops:ps.shooterMuzzleDroplets.drawn};rows.push(row);return row;};
      const expire=()=>{let frames=0;while((ps.list.length||ps.shooterMuzzleDroplets.count||ps._s3Shapes?.sheets.bursts.length)&&frames++<1800)step();if(frames>=1800)throw Error('normal pool expiry did not complete');};
      a.setWeapon('shooter');throwVolley(ps,a,trizookaSpecialWeapon());step();const specialIds=ps.list.map(id);draw('special');expire();
      ps.fireShooter(a,a.weapon,0);const first=ps.list[0];if(!specialIds.includes(id(first)))throw Error('first Shooter did not reuse actual special');step();const initial=draw('first-shooter');if(initial.sheets!==1||initial.addedDrops!==3)throw Error('initial Shooter controls failed');expire();
      a.setWeapon('splatling');ps.fireSplatling(a,a.weapon,0);if(ps.list[0]!==first)throw Error('Splatling object reuse missing');step();draw('splatling');expire();
      a.setWeapon('slosher');ps.fireSlosh(a,a.weapon);if(!ps.list.includes(first))throw Error('Slosher object reuse missing');step();draw('slosher');expire();
      if(!ps.pool.includes(first))throw Error('retired original missing');let occupied=0;
      while(ps.pool.at(-1)!==first){const p=ps._new();Object.assign(p,{type:'blast',wid:'blaster',owner:a,team:a.team,age:0,delay:999,life:1,seed:.37,size:.12,vis:.1,radius:.1,damage:0,grav:0,drag:0});p.pos.set(0,3,2);p.prev.copy(p.pos);p.start.copy(p.pos);p.vel.set(0,0,1);ps._push(p);if(++occupied>100)throw Error('unbounded sibling occupancy');}
      a.setWeapon('shooter');randomSeed=finalSeed;ps.fireShooter(a,a.weapon,0);const reused=ps.list.at(-1);step();const final=draw('last-shooter');
      if(reused!==first||reused.seed!==finalSeed||final.addedDrops!==3)throw Error('actual reuse/seed/added-drop controls failed');
      g.R.render();G.renderer.getContext().finish();
      cases.push({finalSeed,sameObject:true,firstId:id(first),finalId:id(reused),occupiedSiblings:occupied,rows,sheetPass:final.sheets===1,newDropsPass:true});
    }}finally{Math.random=nativeRandom;}
    return cases;
  });
  await Promise.all(reads);
  for(const r of receipt.responses){assert.equal(r.status,200);assert.equal(r.sha256,identity.artifacts[r.path.slice(1)]);}
  assert.deepEqual(receipt.errors,[]);
  receipt.status=receipt.pool.every(c=>c.sheetPass)?'passed':'blocked-known-same-seed-sheet';save();
  await page.screenshot({path:path.join(out,'pool-final.png')});
  console.log(JSON.stringify({status:receipt.status,pool:receipt.pool,responses:receipt.responses.length}));
  assert(receipt.pool.every(c=>c.sheetPass),'same-seed recycled Shooter must retain its legacy muzzle sheet');
} catch(e){if(receipt.status!=='blocked-known-same-seed-sheet')receipt.status='failed';receipt.error=e.stack;save();throw e;}
finally{await Promise.all(reads);save();await browser?.close();await new Promise(r=>server.close(r));}
