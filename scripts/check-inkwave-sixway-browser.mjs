#!/usr/bin/env node
// One emitted Game/context: trusted range input, real hit/HUD, constrained
// native body, synthetic mixed-pool GPU submission, Tri draw, then native Turf
// respawn/display reset through the existing API. Not retail/real-peer QA.
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
  page.on('response',r=>{const u=new URL(r.url());if(/\/src\/(?:main|game\/(?:actor|weapons))\.js$|\/runtime\/(?:spawn-exclusion|weapon-handoff-motion|special-vfx|projectile-presentation)\.mjs$/.test(u.pathname))reads.push(r.body().then(b=>receipt.responses.push({path:u.pathname,status:r.status(),sha256:hash(b)})));});
  await page.addInitScript(()=>{
    localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',lang:'en',shadows:false,bloom:false,minimap:false}));
    localStorage.setItem('inkwave.profile',JSON.stringify({name:'Six-way QA',weapon:'shooter',style:{hair:0,skin:2,outfit:0,eyes:0}}));
    localStorage.setItem('inkwave.splatoon3.gear.v1',JSON.stringify(Array.from({length:3},()=>({main:'none',subs:['none','none','none']}))));
    let seed=0x600019;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  });
  receipt.entry=await enterRangeFromMenu(page,'http://127.0.0.1:'+server.address().port,{timeout:180000,onProgress:r=>console.log('entry',r.route.join('/'))});
  receipt.range=await page.evaluate(async()=>{
    const G=window.__G,g=window.__inkwave,a=G.local,h=g.hud;
    const THREE=await import('three'),{on}=await import(new URL('src/core/ctx.js',document.baseURI));
    g.debug.freeze();g.debug.freezeBots();G.match.range.movingTargets=false;G.match.range.setWeapon('shooter');
    a.pos.set(-14.6,.04,0);a.vel.set(0,0,0);a.yaw=a.aimYaw=0;g.rig.yaw=0;g.rig.pitch=-.12;a.invuln=0;
    await a.character.sourceMotion.ready;
    const hits=[];const off=on('hit',e=>{if(e.attacker===a)hits.push({damage:e.damage,guide:h.ret.style.translate,marker:h.hitEl.style.translate});});
    let muzzlePeak=0;g._skipRender=true;
    try {
      for(let i=0;i<90;i++)g._frame(1/60);g.debug.fire(true);
      for(let i=0;i<180&&!hits.length;i++){g._frame(1/60);G.projectiles._draw();muzzlePeak=Math.max(muzzlePeak,G.projectiles.shooterMuzzleDroplets.drawn);}
    } finally {g.debug.fire(false);g._skipRender=false;off();}
    g._frame(0);
    if(!hits.some(r=>r.damage>0&&r.guide===r.marker)||muzzlePeak===0)throw Error('real Shooter hit/HUD/muzzle interaction missing');
    const normal={hits,muzzlePeak,animations:h.hitEl.getAnimations({subtree:true}).length};
    G.projectiles.clear();G.fx.clear();h._clearReticleFeedback();

    // Native body on the actual dry range collision. Only pad metadata is a
    // controlled boundary fixture; no collider or Actor method is replaced.
    const pads=G.level.spawnPads,barrier=G.level.spawnBarrier;
    G.level.spawnPads=[new THREE.Vector3(-14.6,.04,-20),new THREE.Vector3(-14.6,.04,3)];G.level.spawnBarrier=1;
    a.pos.set(-14.6,.04,0);a.vel.set(0,0,0);a.intent.fire=false;a.intent.move.set(0,0,1);
    const {PLAYER}=await import(new URL('src/config.js',document.baseURI));const radius=1+PLAYER.radius+.02;let minimum=Infinity;
    try{for(let i=0;i<90;i++){G.time+=1/60;a.update(1/60);minimum=Math.min(minimum,Math.hypot(a.pos.x+14.6,a.pos.z-3));}}
    finally{a.intent.move.set(0,0,0);G.level.spawnPads=pads;G.level.spawnBarrier=barrier;}
    if(minimum<radius-1e-6||minimum>radius+.05)throw Error('native opposing exclusion boundary not reached and retained: '+minimum);

    const ps=G.projectiles,V=THREE.Vector3,matrix=new THREE.Matrix4();G.camera.position.set(0,3,-4);
    function round(type,wid,i,y=3){const p=ps._new();Object.assign(p,{type,wid,owner:a,team:0,age:.1,delay:0,size:.12,vis:.086,seed:.37,life:3,straight:1,grav:0,drag:0,tail0:1,tailK:0,wob:0,sats:0});p.start.set(0,y,0);p.pos.set(0,y,1+i*.0001);p.vel.set(0,0,20);ps._push(p);}
    ps.clear();G.time+=1/60;for(let i=0;i<32;i++)round('shot','splatling',i,5);for(let i=0;i<660;i++)round('blast','blaster',i);
    ps._s3SplashDrops=Array.from({length:48},(_,i)=>({owner:a,pos:new V(i*.05,4,2),vel:new V(0,-1,0),radius:.1,seed:i/48,frames:2}));
    const before=JSON.stringify(ps.list.map(p=>[p.pos.toArray(),p.vel.toArray(),p.age,p.life,p.seed])),ink=a.ink,turf=a.stats.turf;
    ps._draw();let oldDrops=0;
    for(let i=0;i<ps.blobs.count;i++){ps.blobs.getMatrixAt(i,matrix);if(Math.abs(matrix.elements[13]-4)<1e-6&&Math.abs(matrix.elements[14]-2)<1e-6)oldDrops++;}
    if(ps.blobs.count!==700||oldDrops!==40||ps.shooterMuzzleDroplets.drawn!==0)throw Error('shared cosmetic capacity priority changed');
    if(JSON.stringify(ps.list.map(p=>[p.pos.toArray(),p.vel.toArray(),p.age,p.life,p.seed]))!==before||a.ink!==ink||a.stats.turf!==turf)throw Error('draw changed native state');
    g.R.render();G.renderer.getContext().finish();
    const saturation={count:ps.blobs.count,oldDrops,muzzle:ps.shooterMuzzleDroplets.drawn};
    ps.clear();const drop={owner:a,pos:new V(1,2,3),vel:new V(0,-6,0),dirX:0,dirZ:1,radius:.94,drawRadius:.2,sourceActor:'WeaponSlosherDiffusion',frames:4,seed:.23};ps._s3SplashDrops=[drop];
    const dropSnapshot=d=>JSON.stringify(d,(key,value)=>key==='owner'?'bound-owner':value);
    const dropBefore=dropSnapshot(drop);ps._draw();const p=new V(),q=new THREE.Quaternion(),scale=new V();ps.blobs.getMatrixAt(0,matrix);matrix.decompose(p,q,scale);
    if(ps.blobs.count!==1||Math.abs(scale.x-.1)>1e-7||new V(0,0,1).applyQuaternion(q).z<.999999||drop.owner!==a||dropSnapshot(drop)!==dropBefore)throw Error('Tri floor calibration/heading/native state changed after pool reuse');
    g.R.render();G.renderer.getContext().finish();const tri={width:scale.x,count:ps.blobs.count,provisional:true};ps.clear();
    return {normal,exclusion:{minimum,radius},saturation,tri};
  });
  console.log('range interactions passed');await page.screenshot({path:path.join(out,'combined-range.png')});save();

  receipt.turf=await page.evaluate(async()=>{
    const g=window.__inkwave;g.profile.weapon='roller';await g.startMatch({mapId:'tidewater',mode:'turf',duration:180});
    const G=window.__G,a=G.local,c=a.character;g.debug.freeze();g.debug.freezeBots();await c._sourceMotionLoader;await c.sourceMotion.ready;
    if(G.match.range)throw Error('controlled native Turf transition did not leave range');
    g.input.mouse.left=false;g.input.mouse.right=false;g.input.keys.clear();g.input.pressed.clear();
    const {weaponHandoffSnapshot}=await import(new URL('patches/splatoon3/runtime/weapon-handoff-motion.mjs',document.baseURI));
    const {spawnMotionAllowsAction}=await import(new URL('patches/splatoon3/runtime/spawn-pose-motion.mjs',document.baseURI));
    const step=()=>{g._skipRender=true;g._frame(1/60);};
    for(let i=0;i<900&&(G.match.state!=='playing'||a.s3.squidSpawn);i++)step();
    if(a.s3.squidSpawn||G.match.state!=='playing')throw Error('opening native spawn did not complete');
    a.splat(null,'weapon');for(let i=0;i<900&&!a.alive;i++)step();
    if(a.s3.squidSpawn?.phase!=='aim')throw Error('real death/countdown did not respawn into aim');
    step();g.debug.fire(true);step();g.debug.fire(false);
    if(a.s3.squidSpawn?.phase!=='flight')throw Error('real release/press did not launch');
    let ticks=0;while(a.s3.squidSpawn&&ticks++<300){step();if(a.s3.squidSpawn&&spawnMotionAllowsAction(c,true))throw Error('action guard yielded during active spawn');}
    if(!a.grounded||a.s3.squidSpawn)throw Error('supported touchdown did not complete');step();step();
    const active=weaponHandoffSnapshot(c);if(!(active?.weight>0&&active.weight<1))throw Error('actual display return not active');
    const nativeBefore={ink:a.ink,turf:a.stats.turf,projectiles:G.projectiles.list.filter(p=>p.owner===a).length};
    a.reset();const immediate=weaponHandoffSnapshot(c);if(immediate!==null)throw Error('old display survived native reset');
    step();const first=weaponHandoffSnapshot(c);if((first?.weight??0)!==0)throw Error('new life resumed old display');
    if(a.weaponRunner.rolling||a.weaponRunner.flick!==-1||a.ink!==100)throw Error('reset created an unsolicited attack');
    g._skipRender=false;g.R.render();G.renderer.getContext().finish();
    return {ticks,activeWeight:active.weight,immediate,firstWeight:first?.weight??0,nativeBefore,ink:a.ink,rolling:a.weaponRunner.rolling,flick:a.weaponRunner.flick};
  });
  await page.screenshot({path:path.join(out,'combined-reset.png')});
  await Promise.all(reads);assert(receipt.responses.length>=7,'actual combined owner/runtime response bodies');
  for(const r of receipt.responses){assert.equal(r.status,200);assert.equal(r.sha256,identity.artifacts[r.path.slice(1)]);}
  assert.deepEqual(receipt.errors,[]);receipt.status='passed';save();console.log(JSON.stringify({status:receipt.status,range:receipt.range,turf:receipt.turf,responses:receipt.responses.length}));
} catch(e){receipt.status='failed';receipt.error=e.stack;await page?.screenshot({path:path.join(out,'failure.png'),timeout:10000}).catch(()=>{});save();throw e;}
finally{await Promise.all(reads);save();await browser?.close();await new Promise(r=>server.close(r));}
