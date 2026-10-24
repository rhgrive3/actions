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
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
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
  G.fx=new FX(G.scene,{quality:'low'});await G.fx.inkVolumeReady;G.projectiles=new Projectiles(G.scene);
  window.firing={api,renderer,camera,CpuPaint,level,actor:null};
 });
 const all=[],small=process.argv.includes('--small');
 for(const id of (small?['shooter','splatling']:['shooter','splatling','s3-shooter-heavy','s3-spinner-quick']))for(const mode of ['standing','moving-jump'])for(const hz of (small?[60]:[30,60,120])){
  const r=await page.evaluate(async({id,mode,hz})=>{
   const {api,renderer,camera,CpuPaint,level}=window.firing,{G,THREE,Actor,Character,on}=api;
   const old=window.firing.actor;if(old){G.scene.remove(old.character.root);old.character.dispose();}G.projectiles.clear();G.fx.clear();
   G.paint=new CpuPaint(null,level,{atlasSize:1024,maxDensity:10,cell:.5});G.time=0;
   const a=new Actor({team:0,weapon:id,isLocal:false,CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.character.actor=a;G.scene.add(a.character.root);G.actors=[a];a.spawnAt(new THREE.Vector3(0,0,0),0);a.form='kid';a.invuln=0;a.ink=100;a.grounded=true;a.ground.hit=true;a._spawnBarrier=()=>{};window.firing.actor=a;
   const vec=v=>v.toArray(),trace=[],events=[],paint=[],captures=[];let frame=0,carry=0,peakDrops=0,peakBlobs=0;
   const off=on('weapon:fire',e=>events.push({frame,weapon:e.weapon,muzzle:vec(e.muzzle),dir:vec(e.dir),charge:e.charge??null}));
   const splat=G.paint.splat;G.paint.splat=function(...args){paint.push(args.map(v=>v?.isVector3?vec(v):typeof v==='object'?v&&Object.fromEntries(Object.entries(v).filter(([k,x])=>['number','string','boolean'].includes(typeof x))):v));return splat.apply(this,args);};
   window.seedFiring(0x1234abcd);
   const sim=()=>{G.time+=1/60;a.intent.fire=a.weapon.kind==='splatling'||a.weapon.behaviorKind==='splatling'?frame<75:frame<100;
    if(frame===170)a.setWeapon('shooter');if(frame===180)a.intent.fire=true;if(frame>180&&frame<186)a.intent.fire=true;
    a.intent.move.set(mode==='moving-jump'&&frame<100?.35:0,0,0);a.intent.jump=mode==='moving-jump'&&frame===78;
    a.aimDir.set(Math.sin(frame<90?0:.2),.06,Math.cos(frame<90?0:.2)).normalize();a.aimPoint.copy(a.pos).add(new THREE.Vector3(a.aimDir.x*100,1.05+a.aimDir.y*100,a.aimDir.z*100));
    a.update(1/60);G.projectiles.update(1/60);G.paint.advanceSimulation(1/60);G.fx.update(1/60,camera);
    trace.push({frame,pos:vec(a.pos),vel:vec(a.vel),ink:a.ink,ground:a.grounded,charge:a.weaponRunner.charge,stream:a.weaponRunner.streaming,rounds:G.projectiles.list.map(p=>({wid:p.wid,type:p.type,age:p.age,delay:p.delay,seed:p.seed,pos:vec(p.pos),vel:vec(p.vel),size:p.size,damage:p.damage,grav:p.grav,drag:p.drag,life:p.life})),drops:(G.projectiles._s3SplashDrops||[]).map(p=>({pos:vec(p.pos),vel:vec(p.vel),radius:p.radius,seed:p.seed,frames:p.frames}))});frame++;
   };
   for(let d=0;d<hz*4;d++){carry+=60;while(carry>=hz){carry-=hz;sim();}G.projectiles.syncVisuals?.(1);G.scene.updateMatrixWorld(true);if(d%Math.max(1,hz/15)===0)renderer.render(G.scene,camera);peakDrops=Math.max(peakDrops,G.fx.dN);peakBlobs=Math.max(peakBlobs,G.projectiles.blobs.count);if(hz===60&&['shooter','splatling'].includes(id)&&[84,90,188].includes(frame)){renderer.render(G.scene,camera);captures.push({frame,png:renderer.domElement.toDataURL('image/png')});}}
   off();return{id,mode,hz,captures,trace,events,paint,grid:Array.from(G.paint.grid),counts:Array.from(G.paint.counts),resources:{...renderer.info.memory},render:{...renderer.info.render},peakDrops,peakBlobs,last:{rounds:G.projectiles.list.length,drops:G.fx.dN,cosmetic:G.projectiles.shooterMuzzleDroplets?.count??null}};
  },{id,mode,hz});
  for(const c of r.captures){fs.writeFileSync(path.join(out,`${id}-${mode}-f${c.frame}.png`),Buffer.from(c.png.split(',')[1],'base64'));delete c.png;}
  all.push(r);console.log(id,mode,hz,'shots',r.events.length,'peaks',r.peakDrops,r.peakBlobs);
 }
 fs.writeFileSync(path.join(out,'records.json'),JSON.stringify({build:JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),errors,cases:all}));
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser?.close();server.close();}
