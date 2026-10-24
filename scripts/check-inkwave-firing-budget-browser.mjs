// Real emitted Actor/Character/Physics/FX in Chromium; CPU paint fixture.
// Separate from full Game/native-camera acceptance and from hardware performance.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';
const [siteArg,outArg]=process.argv.slice(2),site=path.resolve(siteArg),out=path.resolve(outArg);
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/probe'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><style>body{margin:0}</style><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>');}
 const f=path.resolve(site,'.'+decodeURIComponent(u.pathname));if(!f.startsWith(site+path.sep)||!fs.existsSync(f)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',f.endsWith('.json')?'application/json':f.endsWith('.png')?'image/png':'text/javascript');fs.createReadStream(f).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-precise-memory-info','--js-flags=--expose-gc']});
 const page=await browser.newPage({viewport:{width:800,height:450}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{let s=1;window.seedFiring=n=>s=n;Math.random=()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};});
 await page.goto(`http://127.0.0.1:${server.address().port}/probe`);
 await page.evaluate(async()=>{
  const profile=await fetch('/patches/splatoon3/profile.json').then(r=>r.json()),{install}=await import('/patches/splatoon3/runtime/install.mjs');
  const api=install(profile),{Level}=await import('/src/world/level.js');
  const {G,THREE,PaintSystem,Projectiles,Physics,FX}=api;
  const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(800,450);document.body.append(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(48,800/450,.1,200);camera.position.set(-5,3,-4);camera.lookAt(0,1.2,3);
  G.scene=new THREE.Scene();G.scene.background=new THREE.Color('#ccd6df');G.scene.add(new THREE.HemisphereLight(0xffffff,0x444444,3));
  const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-4,9,-3);G.scene.add(light);
  G.camera=camera;G.renderer=renderer;G.settings={quality:'low',shadows:false};G.mode='match';G.netm=null;G.match={playing:()=>true,canRespawn:()=>false};
  G.teamColors=[new THREE.Color('#f80'),new THREE.Color('#03f')];
  const level=new Level({bounds:{minX:-60,maxX:60,minZ:-60,maxZ:100},spawnPads:[[-50,0,0],[50,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-60,-1,-60],max:[60,0,100]},{kind:'box',min:[-20,0,25],max:[20,20,26]}]});
  class CpuPaint extends PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){this.quads=0;this.dryMesh.visible=false;}}
  G.level=level;G.physics=new Physics(level);G.paint=new CpuPaint(null,level,{atlasSize:1024,maxDensity:10,cell:.5});
  G.fx=new FX(G.scene,{quality:'high'});await G.fx.inkVolumeReady;G.projectiles=new Projectiles(G.scene);
  window.firing={api,renderer,camera,CpuPaint,level,actor:null};
 });
 const result=await page.evaluate(()=>{
  const {api,renderer,camera,CpuPaint,level}=window.firing,{G,THREE,Actor,Character}=api,V=THREE.Vector3;
  renderer.setSize(400,225);camera.aspect=400/225;camera.updateProjectionMatrix();camera.position.set(-10,6,-8);camera.lookAt(0,2,5);
  const owners=['splatling','blaster','shooter'].map(weapon=>new Actor({team:0,weapon,CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0},name:'budget-'+weapon}));
  const add=(owner,type,i,y=3)=>{const p=G.projectiles._new();Object.assign(p,{type,wid:owner.weapon.id,owner,team:0,age:owner===owners[2]?1/60:.1,delay:0,size:.12,vis:.086,seed:.37,life:3,straight:1,grav:0,drag:0,tail0:1,tailK:0,wob:0,sats:0});p.start.set(0,y,0);p.pos.set(0,y,1+i*.0001);p.vel.set(0,0,20);G.projectiles._push(p);};
  const resources=()=>{const geometries=new Set(),materials=new Set();G.scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])materials.add(m);});return{geometries:geometries.size,materials:materials.size,gpu:{...renderer.info.memory},matrixCapacity:G.projectiles.blobs.instanceMatrix.array.length/16,burstCapacity:G.projectiles.shooterMuzzleDroplets?.pool.length??0,volumeCapacity:G.fx.inkVolumes.capacity};};
  const draw=(ordinary,splats,falling,shooter)=>{G.projectiles.clear();G.fx.clear();G.time=1/60;for(let i=0;i<splats;i++)add(owners[0],'shot',i,5);for(let i=0;i<ordinary;i++)add(owners[1],'blast',i);if(shooter)add(owners[2],'shot',0,2);G.projectiles._s3SplashDrops=Array.from({length:falling},(_,i)=>({owner:owners[1],pos:new V(i*.05,4,2),vel:new V(0,-1,0),radius:.1,seed:i/48,frames:2}));G.projectiles._draw();G.projectiles.syncVisuals(1);G.scene.updateMatrixWorld(true);renderer.render(G.scene,camera);
   const m=new THREE.Matrix4(),prefix=[];let drops=0,spinners=0;for(let i=0;i<G.projectiles.blobs.count;i++){G.projectiles.blobs.getMatrixAt(i,m);const e=m.elements;if(Math.abs(e[13]-4)<1e-6&&Math.abs(e[14]-2)<1e-6)drops++;if(Math.abs(e[13]-5)<1e-6)spinners++;prefix.push(Array.from(e));}
   return{ordinary,splats,falling,shooter,count:G.projectiles.blobs.count,drops,spinners,muzzle:G.projectiles.shooterMuzzleDroplets?.drawn??0,prefix,resources:resources(),submitted:{...renderer.info.render}};
  };
  const pool=[draw(660,0,40,false),draw(660,32,48,false),draw(660,32,40,true),draw(650,0,48,false),draw(650,1,48,true),draw(12,2,4,true)];
  // Native Actor->Runner->Projectiles bursts, bounded two-actor scene. Real
  // CPU paint/FX, sampled software WebGL submission; no hardware GPU claim.
  const perf=[];
  for(const id of ['shooter','splatling']){
   G.projectiles.clear();G.fx.clear();G.paint=new CpuPaint(null,level,{atlasSize:1024,maxDensity:10,cell:.5});G.time=0;G.actors=[];const actors=[];
   for(let j=0;j<2;j++){const a=new Actor({team:0,weapon:id,isLocal:false,CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0},name:'firing-'+j});a.character.actor=a;G.scene.add(a.character.root);a.spawnAt(new V(j*4-2,0,0),0);a.invuln=0;a.form='kid';a.ink=100;a.grounded=true;a._spawnBarrier=()=>{};G.actors.push(a);actors.push(a);}
   window.seedFiring(0x1234abcd);const times=[],drawTimes=[];let peak=0,muzzlePeak=0,maxRounds=0,mid=null,heapStart=null;const beginResources=resources();
   for(let frame=0;frame<360;frame++){
    const t=performance.now();G.time+=1/60;for(const a of actors){a.intent.fire=id==='shooter'?frame<180:frame<70;a.intent.jump=false;a.intent.move.set(0,0,0);a.aimDir.set(0,.06,1).normalize();a.aimPoint.copy(a.pos).add(new V(0,7.05,100));a.update(1/60);}G.projectiles.update(1/60);G.paint.advanceSimulation(1/60);G.fx.update(1/60,camera);G.projectiles.syncVisuals(1);if(frame>=100&&frame<180)times.push(performance.now()-t);
    peak=Math.max(peak,G.projectiles.blobs.count);muzzlePeak=Math.max(muzzlePeak,G.projectiles.shooterMuzzleDroplets?.drawn??0);maxRounds=Math.max(maxRounds,G.projectiles.list.length);
    if(frame%2===0){const d=performance.now();G.scene.updateMatrixWorld(true);renderer.render(G.scene,camera);if(frame>=100&&frame<180)drawTimes.push(performance.now()-d);}
    if(frame===100){globalThis.gc?.();mid=resources();heapStart=performance.memory?.usedJSHeapSize??null;}
   }
   globalThis.gc?.();const heapEnd=performance.memory?.usedJSHeapSize??null,endResources=resources();times.sort((a,b)=>a-b);drawTimes.sort((a,b)=>a-b);perf.push({id,actors:2,simulationSteps:360,displaySamplingHz:30,cpuMean:times.reduce((a,b)=>a+b,0)/times.length,cpuP95:times[Math.floor(times.length*.95)],submitMean:drawTimes.reduce((a,b)=>a+b,0)/drawTimes.length,submitP95:drawTimes[Math.floor(drawTimes.length*.95)],peakShared:peak,peakMuzzle:muzzlePeak,maxNativeRounds:maxRounds,beginResources,steadyResources:mid,endResources,heapStart,heapEnd,remaining:{rounds:G.projectiles.list.length,drops:G.fx.dN,bursts:G.projectiles.shooterMuzzleDroplets?.count??0}});
   for(const a of actors){G.scene.remove(a.character.root);a.character.dispose();}G.actors=[];
  }
  return{pool,perf,scope:'emitted components in real Chromium/SwiftShader; synthetic mixed-pool occupancy + two native actors; fixed60 simulation, 30Hz sampled submission; high particle preset keeps the original128-part volume budget, 400x225 buffer; not full Game or mobile hardware'};
 });
 result.build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))).contentHash;result.errors=errors;fs.writeFileSync(path.join(out,'budget.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({build:result.build,pool:result.pool.map(({prefix,...r})=>r),perf:result.perf,errors}));if(errors.length)throw Error(errors.join('\n'));
}finally{await browser?.close();server.close();}
