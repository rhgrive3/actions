// Ordinary emitted menu -> range -> native _frame smoke/capture. Separate
// from the controlled comparison and its fully instrumented CPU-paint oracle.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {enterRangeFromMenu} from './lib/inkwave-range-menu-entry.mjs';
const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.mp3':'audio/mpeg','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{
  const name=new URL(q.url,'http://localhost').pathname.replace(/\/$/,'/index.html'),file=path.resolve(site,'.'+name);
  if(!file.startsWith(site+path.sep)||!fs.existsSync(file)){r.writeHead(404);return r.end();}
  r.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(r);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const result={status:'running',contentHash:JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))).contentHash,errors:[],frames:[],
  correction:'Only the new 18F pair uses fixed identical saved palette/style/gear/camera/seed. Prior native images remain smoke/physical evidence, not matched appearance A/B.',
  limits:['Native _frame is stepped at 60Hz under debug freeze; software Chromium is not a hardware performance or Nintendo retail acceptance.','Frames are INKWAVE simulation ticks after the controlled fire press, not retail encoded frames.']};
try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  result.browser=await browser.version();const page=await browser.newPage({viewport:{width:960,height:640}});
  page.on('pageerror',e=>result.errors.push(e.message));
  await page.addInitScript(()=>{
    // Existing saved settings/profile/ability slots, exactly as read by boot.
    // Rookie is an existing locker preset; no geometry or model is modified.
    localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',lang:'ja',colorblind:true,fov:82,fovMode:'h',cameraShake:0}));
    localStorage.setItem('inkwave.profile',JSON.stringify({name:'Tri QA',level:1,xp:0,wins:0,matches:0,totalTurf:0,weapon:'s3-slosher-diffusion',
      style:{hair:0,skin:0,outfit:0,eyes:0,hat:0,brows:0}}));
    localStorage.setItem('inkwave.splatoon3.gear.v1',JSON.stringify(Array.from({length:3},()=>({main:'none',subs:['none','none','none']}))));
    // Seed before boot (unique PRNG values also preserve distinct Three UUIDs).
    window.qaResetRandom=seed=>{let state=seed>>>0;Math.random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};};
    window.qaResetRandom(0x18550001);
  });
  result.entry=await enterRangeFromMenu(page,'http://127.0.0.1:'+server.address().port,{timeout:120000,onProgress:r=>console.log('native entry',r.route.join('/'))});
  await page.evaluate(async()=>{
    const G=window.__G,g=window.__inkwave;g.debug.freeze();
    // The trusted menu route above proves ordinary admission. Restart through
    // the existing match API under freeze so the fresh selected avatar has no
    // variable number of live rAF updates before the controlled 60Hz replay.
    const replayOptions={...g.lastMatchOpts,mapId:g.mapDef.id};
    window.qaResetRandom(0x18550001);await g.startMatch(replayOptions);
    g.debug.freeze();g.debug.freezeBots();G.match.range.setWeapon('s3-slosher-diffusion');G.match.range.travel('roller');
    const a=G.local;await a.character.sourceMotion.ready;
    a.pos.set(-26.5,.04,4);a.vel.set(0,0,0);a.yaw=a.aimYaw=0;g.rig.yaw=0;g.rig.pitch=0;a.ink=100;
    g.rig.follow(a,true);
    G.time=0;g.s3Clock.reset();
    g.debug.fire(false);g.debug.step(1000);G.projectiles.clear();G.paint.clear();
    window.qaResetRandom(0x18550018);window.nativeTick=0;g.debug.fire(true);
  });
  for(const target of [18]){
    const row=await page.evaluate(async target=>{
      const G=window.__G,g=window.__inkwave,a=G.local,THREE=await import('three');
      while(window.nativeTick<target){g.debug.step(1000/60);window.nativeTick++;if(window.nativeTick===12)g.debug.fire(false);}
      const matrices=[],m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
      for(const d of G.projectiles._s3SplashDrops||[]){
        for(let i=0;i<G.projectiles.blobs.count;i++){
          G.projectiles.blobs.getMatrixAt(i,m);m.decompose(p,q,s);
          if(p.distanceTo(d.pos)<1e-5){matrices.push({radius:d.drawRadius,scale:s.toArray(),direction:new THREE.Vector3(0,0,1).applyQuaternion(q).toArray(),frames:d.frames});break;}
        }
      }
      return {
        tick:window.nativeTick,weapon:a.weapon.id,actor:a.pos.toArray(),pitch:a.aimPitch,main:G.projectiles.list.length,drops:G.projectiles._s3SplashDrops?.length||0,
        matrices,paintCells:G.paint.counts?.[0],sourceMotion:a.character.sourceMotion.status,
        saved:{settings:JSON.parse(localStorage.getItem('inkwave.settings')),profile:JSON.parse(localStorage.getItem('inkwave.profile')),gear:JSON.parse(localStorage.getItem('inkwave.splatoon3.gear.v1'))},
        style:a.character.style,gear:a.s3?.loadout,palette:g.palette,teamHex:G.teamHex,teamColors:G.teamColors.map(c=>c.getHexString()),
        characterColor:a.character.color.getHexString(),characterTeamUniform:a.character.u?.uTeam?.value?.getHexString(),
        camera:{position:G.camera.position.toArray(),quaternion:G.camera.quaternion.toArray(),fov:G.camera.fov,aspect:G.camera.aspect,matrixWorld:G.camera.matrixWorld.toArray(),projection:G.camera.projectionMatrix.toArray(),yaw:g.rig.yaw,pitch:g.rig.pitch},
        characterRoot:{position:a.character.root.position.toArray(),quaternion:a.character.root.quaternion.toArray(),scale:a.character.root.scale.toArray()},
        bones:Object.fromEntries(Object.entries(a.character.bones||{}).filter(([,b])=>b?.isObject3D).map(([name,b])=>[name,{position:b.position.toArray(),quaternion:b.quaternion.toArray(),scale:b.scale.toArray()}])),
        simulationTime:G.time,bootSeed:'0x18550001',shotSeed:'0x18550018',
        projectileTrace:G.projectiles.list.map(p=>({unit:p.catalog?.descriptor?.unit,index:p.catalog?.index,age:p.age,seed:p.seed,pos:p.pos.toArray(),vel:p.vel.toArray(),damage:p.damage})),
        dropTrace:(G.projectiles._s3SplashDrops||[]).map(d=>({frames:d.frames,seed:d.seed,pos:d.pos.toArray(),vel:d.vel.toArray(),radius:d.radius,heading:[d.dirX,d.dirZ]}))
      };
    },target);
    result.frames.push(row);await page.screenshot({path:path.join(out,'sim'+target+'.png')});console.log('native frame',JSON.stringify(row));
  }
  assert(result.frames.some(f=>f.drops>0&&f.matrices.length>0),'ordinary menu build must render real floor drops');
  assert.equal(result.errors.length,0,JSON.stringify(result.errors));result.status='passed';
}finally{fs.writeFileSync(path.join(out,'native-browser.json'),JSON.stringify(result,null,2));await browser?.close();await new Promise(r=>server.close(r));}
