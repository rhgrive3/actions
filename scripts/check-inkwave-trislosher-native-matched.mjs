// Trusted menu admission followed by a controlled native _frame replay, not
// ordinary-input projectile acceptance. --measure-main adds passive QA reads;
// it does not make the inherited pose/time/RNG/debug assignments natural input.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {chromium} from 'playwright';
import {enterRangeFromMenu} from './lib/inkwave-range-menu-entry.mjs';
import {captureSourceIdentity} from './lib/inkwave-capture-source-identity.mjs';
import {installHissenCaptureObserver} from './lib/inkwave-hissen-capture-observer.mjs';
const measureMain=process.argv.includes('--measure-main');
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
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
if(measureMain){
  const bytes=fs.readFileSync(path.join(site,'inkwave-build.json')),manifest=JSON.parse(bytes);
  assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);
  for(const[file,digest]of Object.entries(manifest.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,file))),digest,'Hissen capture artifact '+file);
  Object.assign(result,{kind:'controlled-passive-hissen-main-observation',sourceIdentity:captureSourceIdentity(),
    inputHash:manifest.inputHash,manifestSha256:hash(bytes),harnessSha256:hash(fs.readFileSync(new URL(import.meta.url))),observerSha256:hash(fs.readFileSync(new URL('./lib/inkwave-hissen-capture-observer.mjs',import.meta.url))),
    timing:'5/7/9 fixed native ticks after the first observed active Hissen main birth; not retail encoded-frame timing',
    correction:'Additive QA only. Default historical 18F capture and separate 52-view projectile contract are unchanged.',
    limits:[...result.limits,'No object hiding, instance rewriting or synthetic isolation. Indexed projection bounds are not alpha/depth-tested pixel silhouettes.']});
  assert.equal(result.sourceIdentity.checkoutIdentityStatus,'verified-git-head');
}
try{
  browser=await chromium.launch({...(!measureMain?{executablePath:'/usr/bin/chromium'}:process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
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
  if(measureMain)await page.addScriptTag({content:'window.installHissenCaptureObserver='+installHissenCaptureObserver.toString()+';'});
  await page.evaluate(async measureMain=>{
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
    if(measureMain){
      // Await existing native requests only; do not fabricate readiness or an
      // additional asset route. This is not cold-first-shot acceptance.
      await G.fx.inkVolumeReady;await G.fx._hissenFallbackReady;
      const THREE=await import('three');
      window.__iwHissenObservation=window.installHissenCaptureObserver(G.fx.inkVolumes,THREE,{width:innerWidth,height:innerHeight});
      window.__iwHissenFirstBirth=null;
    }
    window.qaResetRandom(0x18550018);window.nativeTick=0;g.debug.fire(true);
  },measureMain);
  for(const target of (measureMain?[5,7,9]:[18])){
    const row=await page.evaluate(async({target,measureMain})=>{
      const G=window.__G,g=window.__inkwave,a=G.local,THREE=await import('three');
      const reached=()=>measureMain?window.__iwHissenFirstBirth&&window.nativeTick-window.__iwHissenFirstBirth.tick>=target:window.nativeTick>=target;
      while(!reached()){
        if(window.nativeTick>=120)throw Error('No bounded Hissen first-birth capture');
        g.debug.step(1000/60);window.nativeTick++;
        if(measureMain){
          const born=G.projectiles.list.find(p=>p.catalog?.r?.sourceActor==='WeaponSlosherDiffusion'&&p.delay<=0&&!p.catalog.birthPending&&!p._s3SloshBirthPending);
          if(!window.__iwHissenFirstBirth&&born)window.__iwHissenFirstBirth={tick:window.nativeTick,seed:born.seed,unit:born.catalog.descriptor.unit,index:born.catalog.index,age:born.age};
          if(window.__iwHissenFirstBirth)g.debug.fire(false);
        }else if(window.nativeTick===12)g.debug.fire(false);
      }
      const matrices=[],m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
      for(const d of G.projectiles._s3SplashDrops||[]){
        for(let i=0;i<G.projectiles.blobs.count;i++){
          G.projectiles.blobs.getMatrixAt(i,m);m.decompose(p,q,s);
          if(p.distanceTo(d.pos)<1e-5){matrices.push({radius:d.drawRadius,scale:s.toArray(),direction:new THREE.Vector3(0,0,1).applyQuaternion(q).toArray(),frames:d.frames});break;}
        }
      }
      return {
        ...(measureMain?{birthRelativeTick:target,firstBirth:window.__iwHissenFirstBirth,mainObservation:window.__iwHissenObservation.snapshot(G.camera)}:{}),
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
    },{target,measureMain});
    result.frames.push(row);const file=measureMain?'main-birth-f'+String(target).padStart(2,'0')+'.png':'sim'+target+'.png';
    await page.screenshot({path:path.join(out,file)});
    if(measureMain){
      const image=fs.readFileSync(path.join(out,file));row.image={file,sha256:hash(image),bytes:image.length};
      const after=await page.evaluate(()=>({time:__G.time,camera:{matrixWorld:__G.camera.matrixWorld.toArray(),projection:__G.camera.projectionMatrix.toArray()},
        drops:(__G.projectiles._s3SplashDrops||[]).map(d=>({frames:d.frames,seed:d.seed,pos:d.pos.toArray(),vel:d.vel.toArray(),radius:d.radius,heading:[d.dirX,d.dirZ]})),
        trace:__G.projectiles.list.map(p=>({unit:p.catalog?.descriptor?.unit,index:p.catalog?.index,age:p.age,seed:p.seed,pos:p.pos.toArray(),vel:p.vel.toArray(),damage:p.damage}))}));
      assert.equal(after.time,row.simulationTime);assert.deepEqual(after.trace,row.projectileTrace,'screenshot must not advance native phase');
      assert.deepEqual(after.drops,row.dropTrace);assert.deepEqual(after.camera,{matrixWorld:row.camera.matrixWorld,projection:row.camera.projection});
      assert.ok(row.mainObservation.draws.length,'real visible native main draw required');
    }
    console.log('native frame',JSON.stringify(row));
  }
  if(measureMain)assert.deepEqual(result.frames.map(f=>f.birthRelativeTick),[5,7,9]);
  else assert(result.frames.some(f=>f.drops>0&&f.matrices.length>0),'ordinary menu build must render real floor drops');
  assert.equal(result.errors.length,0,JSON.stringify(result.errors));result.status='passed';
}catch(error){
  if(measureMain){result.status='failed';result.error=String(error.stack||error);}
  throw error;
}finally{
  if(measureMain&&browser){
    try{
      for(const context of browser.contexts())for(const page of context.pages())if(await page.evaluate(()=>!!window.__iwHissenObservation).catch(()=>false))result.observerRestored=await page.evaluate(()=>window.__iwHissenObservation.restore());
      if(result.status==='passed')assert.equal(result.observerRestored,true);
    }catch(error){result.status='failed';result.error=String(error.stack||error);process.exitCode=1;}
  }
  fs.writeFileSync(path.join(out,'native-browser.json'),JSON.stringify(result,null,2));await browser?.close();await new Promise(r=>server.close(r));
}
