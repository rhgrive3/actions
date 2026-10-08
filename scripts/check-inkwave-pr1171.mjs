#!/usr/bin/env node
// Focused rendered acceptance for PR1171. Run against the production build.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const site = path.resolve(process.argv[2] || '_site');
const mime = { '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json' };
const server = http.createServer((req,res) => {
  if (req.url === '/__probe') {
    res.setHeader('content-type','text/html');
    res.end('<!doctype html><style>:root{--spring:ease;--self-light:white}</style><link rel="stylesheet" href="/styles/hud.css"><link rel="stylesheet" href="/patches/splatoon3/ui.css"><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>');
    return;
  }
  const file=path.resolve(site,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(site+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,
    args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/__probe`);
  const result=await page.evaluate(async()=>{
    const {HUD}=await import('/src/ui/hud.js');
    const hud=Object.create(HUD.prototype);hud._L={};hud.ret=document.createElement('div');document.body.append(hud.ret);hud._buildReticle('dualies');
    const shape=()=>Object.fromEntries(['l','r','merged','lock'].map(k=>{
      const el=hud.ret.querySelector(k==='l'||k==='r'?'.iw-ret__twin.'+k:'.iw-ret__'+k);
      const css=getComputedStyle(el);return [k,css.visibility!=='hidden'&&Number(css.opacity)>.01];
    }));
    const normal=shape();hud.ret.classList.add('is-lock');await new Promise(r=>setTimeout(r,240));
    const locked=shape();hud.ret.classList.remove('is-lock');await new Promise(r=>setTimeout(r,240));const restored=shape();
    const THREE=await import('three');const {PaintSystem}=await import('/src/world/paint.js');const {G}=await import('/src/core/ctx.js');
    G.netm=null;G.settings={quality:'low'};G.actors=[];
    // Native built Character gun hierarchy, Projectiles/beam and world sweep.
    // Controlled hand poses isolate coordinate retargeting from gait animation.
    const {Character}=await import('/src/game/character.js');
    const {Projectiles}=await import('/src/game/weapons.js');
    const {Physics,Hit}=await import('/src/game/physics.js');
    const {WEAPONS,PLAYER}=await import('/src/config.js');
    const {installChargerFlight}=await import('/patches/splatoon3/runtime/weapons-charger-flight.mjs');
    const {sweptWorldHit}=await import('/patches/splatoon3/runtime/weapons-collision.mjs');
    const profile=await (await fetch('/patches/splatoon3/profile.json')).json();
    const completion=profile.weaponsFidelityCompletion;
    Object.assign(WEAPONS.charger,profile.weapons.charger);
    const scene=new THREE.Scene(),character=new Character({weapon:'charger',isLocal:false});
    scene.add(character.root);character.kid.add(character.weapon.pivot);
    character.weapon.off.position.set(0,0,0);character.weapon.off.quaternion.identity();
    character.weapon.pivot.position.set(0,1.05,0);character.wAim=1;character.form='kid';
    const blocks=[],coverLevel={blocks,faces:[],queryBlocks:()=>blocks.map((_,i)=>i)};
    G.physics=new Physics(coverLevel);G.paint={splat:()=>0};
    const packets=[];
    installChargerFlight({Projectiles,WEAPONS,THREE,G,Hit,PLAYER,
      emit:(name,event)=>{if(name==='weapon:fire')packets.push(event);}},completion);
    const system=new Projectiles(scene), actor={character,pos:new THREE.Vector3(),form:'kid',team:0,alive:true,
      weapon:WEAPONS.charger,weaponRunner:{chargeT:1,s3KeepMuzzleFiring:true},color:new THREE.Color('orange'),
      aimDir:new THREE.Vector3(0,0,1),aimPoint:new THREE.Vector3(),addTurf(){},_nearCamera:()=>false};
    const same=(a,b,label)=>{if(a.distanceTo(b)>1e-10)throw Error(label+JSON.stringify({a:a.toArray(),b:b.toArray()}));};
    let chargerPoses=0,coverWitness=false,blockedFallback=false;
    for(const yaw of [0,Math.PI/2,-1.1])for(const pitch of [-.35,.4]){
      character.root.rotation.y=yaw;character.weapon.pivot.rotation.x=pitch;
      character.root.updateMatrixWorld(true);
      actor.aimDir.set(0,0,1).transformDirection(character.weapon.off.matrixWorld);
      actor.aimPoint.copy(actor.pos).addScaledVector(actor.aimDir,30);
      const expected=new THREE.Vector3(-.12542104647188532,.07090750328831108,.8058901380945089)
        .applyMatrix4(character.weapon.off.matrixWorld);
      const ordinary=system._muzzle(actor,new THREE.Vector3()).clone();
      actor.weaponRunner.s3KeepMuzzleFiring=true;system.fireCharger(actor,WEAPONS.charger,1);
      const job=system._fidelityChargerFlights.at(-1),packet=packets.at(-1);
      same(job.origin,expected,'Stored origin must use calibrated native gun transform');
      same(job.beam.mesh.position,expected,'Native beam origin');same(packet.muzzle,expected,'Packet origin');
      // Replay must use the packet even after the remote gun pose changes.
      character.root.position.x+=4;system.ghostFire(actor,packet);character.root.position.x-=4;
      same(system._fidelityChargerFlights.at(-1).origin,expected,'Ghost packet origin');
      actor.weaponRunner.s3KeepMuzzleFiring=false;system.fireCharger(actor,WEAPONS.charger,1);
      same(system._fidelityChargerFlights.at(-1).origin,ordinary,'Ordinary muzzle isolation');
      if(expected.distanceTo(ordinary)<.1)throw Error('Missing dedicated stored offset');
      system.clear();chargerPoses++;
    }
    character.root.rotation.set(0,0,0);character.weapon.pivot.rotation.set(0,0,0);
    character.root.updateMatrixWorld(true);actor.aimDir.set(0,0,1);actor.aimPoint.set(0,1.05,30);
    const ordinary=system._muzzle(actor,new THREE.Vector3()).clone();
    actor.weaponRunner.s3KeepMuzzleFiring=true;system.fireCharger(actor,WEAPONS.charger,1);
    const kept=system._fidelityChargerFlights.at(-1).origin.clone();
    const radius=completion.weapons.charger.CollisionParam.InitRadiusForField;
    const edge=(ordinary.x+kept.x)/2-radius;
    const box={id:0,solid:true,grate:false,center:new THREE.Vector3(edge-.2,kept.y,1.5),half:new THREE.Vector3(.2,.5,.05),
      axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]};
    blocks.push(box);
    const sweep=origin=>sweptWorldHit(G.physics,origin,origin.clone().add(new THREE.Vector3(0,0,2)),radius,radius,new Hit()).hit;
    if(!sweep(kept)||sweep(ordinary))throw Error('Close-cover witness must distinguish stored and ordinary flight origins');
    coverWitness=true;
    // Move cover across the chest-to-stored-muzzle segment: native LOS must
    // reject the candidate and preserve the generic resolver's safe fallback.
    box.center.set(kept.x/2,1.05,.4);box.half.set(.4,.5,.03);
    const safe=system._muzzle(actor,new THREE.Vector3()).clone();system.fireCharger(actor,WEAPONS.charger,1);
    same(system._fidelityChargerFlights.at(-1).origin,safe,'Blocked anchor fallback');blockedFallback=true;
    blocks.length=0;system.clear();character.dispose();
    const renderer=new THREE.WebGLRenderer();
    const v=(x,y,z)=>new THREE.Vector3(x,y,z);
    const face={paintable:true,turf:true,origin:v(0,0,0),u:v(1,0,0),v:v(0,0,1),n:v(0,1,0),su:8,sv:8,block:0,wall:false};
    const level={faces:[face],blocks:[{aabbMin:v(0,-1,0),aabbMax:v(8,1,8),faces:[0,-1,-1,-1,-1,-1]}],pointInside:()=>false,queryBlocks:()=>[0]};
    const paint=new PaintSystem(renderer,level,{atlasSize:512,maxDensity:60,cell:.25});G.paint=paint;
    let cells=0,edgeTolerance=0,witness=false;
    const pixel=new Uint8Array(4), r=.62;
    for(const seed of [0,Math.PI/60,.1,.5,.99]) for(const angle of [0,.3,1.3,2.8]) for(const team of [0,1]) {
      paint.clear();const other=1-team;
      paint.splat(v(4,0,4),100,other,{seed:0,kind:'shot',instant:true});paint.flush(1/60);
      const x=3.125,z=3.125-.73*r,dx=Math.cos(angle),dz=Math.sin(angle);
      paint.splat(v(x,0,z),r,team,{seed,kind:'roll',stretch:v(dx,0,dz),instant:true});paint.flush(1/60);
      for(let j=8;j<18;j++)for(let i=8;i<18;i++){
        const u=(i+.5)*face.cu,w=(j+.5)*face.cv,px=u-x,py=w-z;
        const along=px*dx+py*dz,across=-px*dz+py*dx;
        const wob=r*(.03*Math.sin(along/r*9+seed*30)+.018*Math.sin(along/r*23+seed*11));
        const a=Math.abs(along)-r*.55,b=Math.abs(across)-r*.62-wob;
        const sd=Math.hypot(Math.max(a,0),Math.max(b,0))+Math.min(Math.max(a,b),0)-r*.1;
        const ax=Math.floor(face.atlas.x+face.atlas.pad+u*face.atlas.ppm),ay=Math.floor(face.atlas.y+face.atlas.pad+w*face.atlas.ppm);
        renderer.readRenderTargetPixels(paint.rt,ax,ay,1,1,pixel);
        const gpu=(pixel[0]>=128?2:1),cpu=paint.sample(0,u,w);cells++;
        if(gpu!==cpu){if(Math.abs(sd)>2/face.atlas.ppm)throw Error('Roller interior GPU/CPU mismatch '+JSON.stringify({seed,angle,team,u,w,gpu,cpu,sd,pixel:[...pixel]}));edgeTolerance++;}
        if(seed===Math.PI/60&&angle===0&&i===12&&j===12&&team===0){if(cpu!==1||pixel[0]>=128)throw Error('Published Roller witness still mismatches');witness=true;}
      }
      const counts=[0,0];for(let k=0;k<paint.grid.length;k++)if(!paint.dead[k]&&paint.grid[k])counts[paint.grid[k]-1]++;
      const cov=paint.coverage();for(let t=0;t<2;t++)if(Math.abs(cov[t]-counts[t]/paint.turfTotal)>1e-12)throw Error('Coverage differs from ownership');
    }
    // The shared Roller outline is also used by Dualies. Its radius conversion
    // must preserve the sourced 1.8 half-width in the actual GPU footprint.
    const {slideStampRadius}=await import('/patches/splatoon3/runtime/dualies-slide-paint.mjs');
    const atlasPixels=new Uint8Array(paint.rt.width*paint.rt.height*4);let slideWidths=0;
    for(const seed of [0,.1,.5,.99]) for(const angle of [0,.3,Math.PI/2]) {
      paint.clear();paint.splat(v(4,.03,4),slideStampRadius(1.8),0,{seed,kind:'roll',stretch:v(Math.sin(angle),0,Math.cos(angle)),instant:true});paint.flush(1/60);
      renderer.readRenderTargetPixels(paint.rt,0,0,paint.rt.width,paint.rt.height,atlasPixels);
      const a=face.atlas;let lo=Infinity,hi=-Infinity;
      for(let y=0;y<paint.rt.height;y++)for(let x=0;x<paint.rt.width;x++)if(atlasPixels[(y*paint.rt.width+x)*4+3]>=128) {
        const u=(x+.5-a.x-a.pad)/a.ppm-4,w=(y+.5-a.y-a.pad)/a.ppm-4;
        const across=u*Math.cos(angle)-w*Math.sin(angle);lo=Math.min(lo,across);hi=Math.max(hi,across);
      }
      if(lo< -1.8-2/a.ppm||hi>1.8+2/a.ppm||hi-lo<3.45)throw Error('Dualies rendered source-width regression '+JSON.stringify({seed,angle,lo,hi}));
      slideWidths++;
    }
    paint.clear();let draws=0;const render=renderer.render.bind(renderer);renderer.render=(...args)=>{draws++;return render(...args);};
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
    for(let i=0;i<6100;i++)paint.splat(v(4,0,4),.62,i%2,{seed:.1,kind:'roll',stretch:v(1,0,0),instant:true});
    paint.flush(1/60);const hidden={draws,pending:paint._hiddenQuads?.length||0,owner:paint.sample(0,4,4)};
    delete document.hidden;paint.flush(1/60);
    const resumed={draws,pending:paint._hiddenQuads?.length||0,owner:paint.sample(0,4,4)};
    const a=face.atlas;renderer.readRenderTargetPixels(paint.rt,Math.floor(a.x+a.pad+4*a.ppm),Math.floor(a.y+a.pad+4*a.ppm),1,1,pixel);
    resumed.gpuOwner=pixel[0]>=128?2:1;
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});paint.splat(v(4,0,4),.62,0,{seed:0,kind:'roll',stretch:v(1,0,0),instant:true});
    paint.clear();const cleared=paint._hiddenQuads===null;delete document.hidden;
    paint.dispose();renderer.dispose();
    return {chargerPoses,coverWitness,blockedFallback,normal,locked,restored,cells,edgeTolerance,witness,slideWidths,hidden,resumed,cleared};
  });
  assert.equal(result.chargerPoses,6);assert.equal(result.coverWitness,true);assert.equal(result.blockedFallback,true);
  assert.deepEqual(result.normal,{l:true,r:true,merged:false,lock:false});
  assert.deepEqual(result.locked,{l:false,r:false,merged:true,lock:false});
  assert.deepEqual(result.restored,result.normal);
  assert.equal(result.slideWidths,12);
  assert.equal(result.witness,true);assert.equal(result.hidden.draws,0);assert.equal(result.hidden.pending,6100);
  assert.equal(result.hidden.owner,2);assert.ok(result.resumed.draws>0);assert.equal(result.resumed.pending,0);assert.equal(result.resumed.gpuOwner,2);assert.equal(result.cleared,true);
  assert.deepEqual(errors,[]);console.log(JSON.stringify(result,null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
