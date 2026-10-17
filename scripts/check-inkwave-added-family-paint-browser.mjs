// Real production Character, WeaponRunner, Physics and CPU paint in Chromium.
// Controlled floor, 15 main weapons at 30/60/120Hz; not Switch parity.
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
    const {G,THREE,Actor,Character,Projectiles,Physics,PaintSystem}=api;
    G.scene=new THREE.Scene();G.teamColors=[new THREE.Color('#f80'),new THREE.Color('#03f')];G.settings={};G.time=0;G.netm=null;
    G.match={playing:()=>true,canRespawn:()=>false};
    class CpuPaint extends PaintSystem {
      _initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};}
      _pushQuad(){} _drawQuads(){this.quads=0;this.dryMesh.visible=false;}
    }
    const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
    const floor=()=>{
      const face={origin:V(-40,0,-5),u:V(1,0,0),v:V(0,0,1),n:V(0,1,0),su:80,sv:105,wall:false,turf:true,paintable:true};
      const block={id:0,solid:true,grate:false,center:V(0,-1,47.5),half:V(40,1,52.5),axes:[V(1,0,0),V(0,1,0),V(0,0,1)],
        faces:[-1,-1,0,-1,-1,-1],aabbMin:V(-40,-2,-5),aabbMax:V(40,0,100)};
      G.level={faces:[face],blocks:[block],pointInside:()=>false,groundHeight:()=>0,
        queryBlocks(_x0,_z0,_x1,_z1,out=[]){out.length=0;out.push(0);return out;}};
      G.physics=new Physics(G.level);G.paint=new CpuPaint(null,G.level,{atlasSize:4096,maxDensity:30,cell:.25});
      G.projectiles=new Projectiles(G.scene);G.actors=[];
    };
    const ids=['s3-stringer-normal','s3-stringer-short','s3-stringer-explosion','s3-saber-normal','s3-saber-lite','s3-saber-heavy',
      's3-shelter-normal','s3-shelter-wide','s3-shelter-compact','s3-shelter-focus',
      's3-maneuver-short','s3-maneuver-gallon','s3-maneuver-dual','s3-maneuver-stepper','s3-maneuver-long'];
    const checks=[];
    const random=Math.random;Math.random=()=>.37;
    try{for(const id of ids){let previous;
      for(const hz of [30,60,120]){
        G.projectiles?.clear();floor();
        const a=new Actor({team:0,weapon:id,isLocal:false,CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
        a.character.actor=a;a.form='kid';a.grounded=true;a.ground.hit=true;a.ground.face=0;a.ink=100;
        const slide=id.includes('maneuver');a.pos.set(0,slide?0:8,0);a.yaw=0;a.aimDir.set(0,0,1);a.aimPoint.set(0,a.pos.y+1.05,100);
        a.character.root.position.copy(a.pos);G.actors=[a];G.scene.add(a.character.root);
        let splashes=0,rolls=0,ownerless=0;const raw=G.paint.splat;
        G.paint.splat=function(at,r,t,o={}){if(o.kind==='source-splash')splashes++;if(o.kind==='roll')rolls++;if(!o.claimOwner)ownerless++;return raw.call(this,at,r,t,o);};
        if(slide){
          a.intent.fire=true;a.weaponRunner.update(1/60,{fire:false});a.weaponRunner.tryDodge(V(0,0,1));
          for(let i=0;i<30;i++){const roll=a.weaponRunner.catalogState.roll;if(roll)a.pos.z+=roll.speed/60;a.weaponRunner.update(1/60,{fire:false});}
        }else{
          a.weaponRunner.update(1/60,{fire:true,firePressed:true});
          for(let i=0;i<50;i++)a.weaponRunner.update(1/60,{fire:false});
        }
        for(let i=0;i<hz*3;i++){G.time+=1/hz;G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);}
        const grid=Array.from(G.paint.grid),cells=G.paint.counts[0];
        if(!cells||(!slide&&!splashes)||(slide&&!rolls)||ownerless||a.stats.turf!==cells*.0625)throw Error(JSON.stringify({id,hz,cells,splashes,rolls,ownerless,turf:a.stats.turf}));
        if(previous&&JSON.stringify(previous)!==JSON.stringify(grid))throw Error(id+' different final ownership at '+hz+'Hz');previous=grid;
        checks.push({id,hz,cells,turf:a.stats.turf,splashes,rolls,ownerless,landings:G.projectiles._s3SplashLandings?.length||0});
        G.scene.remove(a.character.root);a.character.dispose();
      }
    }}finally{Math.random=random;}
    return {realCharacter:true,realPhysics:true,cpuPaint:true,hardwareParity:false,checks};
  });
  if(errors.length)throw Error(errors.join('\n'));
  const report={build:build.contentHash,browser:browser.version(),...result,errors};
  if(reportPath){fs.mkdirSync(path.dirname(path.resolve(reportPath)),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({cases:result.checks.length,realCharacter:result.realCharacter,realPhysics:result.realPhysics,errors}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
