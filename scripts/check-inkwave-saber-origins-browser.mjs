// Real production Character + WeaponRunner in Chromium, on a controlled empty
// stage. Verifies source offsets/optical aim/event positions, not Switch parity.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]||'_site');
const reportPath=process.argv[3];
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/probe')return res.end('<!doctype html><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>');
  const file=path.resolve(site,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  res.setHeader('content-type',file.endsWith('.json')?'application/json':file.endsWith('.png')?'image/png':'text/javascript');
  fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
  browser=await chromium.launch({headless:true,
    executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
    args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader']});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/probe`);
  const result=await page.evaluate(async()=>{
    const profile=await fetch('/patches/splatoon3/profile.json').then(r=>r.json());
    const {install}=await import('/patches/splatoon3/runtime/install.mjs');
    const api=install(profile);
    const {installMainWeaponCatalogRuntime}=await import('/patches/splatoon3/runtime/main-weapon-catalog.mjs');
    installMainWeaponCatalogRuntime(api,profile);
    const {G,THREE,Actor,Character,Projectiles,Physics,on}=api;
    G.scene=new THREE.Scene();G.teamColors=[new THREE.Color('#f80'),new THREE.Color('#03f')];G.settings={};G.time=0;
    G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,o)=>{o.length=0;return o;}};
    G.physics=new Physics(G.level);G.paint={sample:()=>0,splat:()=>0};G.match={playing:()=>true,canRespawn:()=>false};
    G.projectiles=new Projectiles(G.scene);G.netm=null;G.actors=[];
    let fire;on('weapon:fire',e=>{fire=e;});const checks=[];
    for(const id of ['s3-saber-lite','s3-saber-normal','s3-saber-heavy'])for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
      G.projectiles.clear();
      const a=new Actor({team:0,weapon:id,isLocal:false,CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
      a.character.actor=a;a.form='kid';a.grounded=true;a.ground.hit=true;a.ink=100;a.pos.set(3,4,-5);a.yaw=yaw;
      a.aimDir.set(Math.sin(yaw),0,Math.cos(yaw));a.aimPoint.copy(a.pos).add(new THREE.Vector3(0,1,0)).addScaledVector(a.aimDir,50);
      a.character.root.position.copy(a.pos);a.character.root.rotation.y=yaw;G.actors=[a];G.scene.add(a.character.root);
      a.weaponRunner.update(1/60,{fire:true,firePressed:true});
      for(let i=0;i<45;i++)a.weaponRunner.update(1/60,{fire:false});
      const p=G.projectiles.list.find(p=>p.catalog);if(!p)throw Error(id+' no wave');
      const o=a.weapon.catalogRecord.parameters.spl__WeaponSaberParam.SwingParam.ShotBulletOffset_L;
      const expected=a.pos.clone().add(new THREE.Vector3(o.X*Math.cos(yaw)+o.Z*Math.sin(yaw),o.Y,-o.X*Math.sin(yaw)+o.Z*Math.cos(yaw)));
      const error=p.start.distanceTo(expected),fxError=fire.muzzle.distanceTo(p.start);
      if(error>1e-8||fxError>1e-8)throw Error(JSON.stringify({id,yaw,error,fxError}));
      const aimed=a.aimPoint.clone().sub(p.start).normalize();
      if(p.vel.clone().normalize().distanceTo(aimed)>1e-8)throw Error(id+' optical aim');
      checks.push({id,yaw,birth:p.start.toArray(),error,fxError});
      G.scene.remove(a.character.root);a.character.dispose();
    }
    return {realCharacter:true,checks};
  });
  if(errors.length)throw Error(errors.join('\n'));
  const report={build:build.contentHash,browser:browser.version(),...result,errors};
  if(reportPath){fs.mkdirSync(path.dirname(path.resolve(reportPath)),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({cases:result.checks.length,maxError:Math.max(...result.checks.map(c=>c.error)),errors}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
