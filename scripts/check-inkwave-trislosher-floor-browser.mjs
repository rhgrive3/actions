// Controlled Chromium A/B of the real emitted Actor, Character, FX, physics,
// source splash queue and CPU paint. Simulation frames are 60Hz, NOT video
// encoded frames or retail input frames. No Nintendo media is distributed.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const full=process.argv.includes('--full');
fs.mkdirSync(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const served={},errors=[];
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);
  if(name==='probe')return res.end('<!doctype html><style>body{margin:0}</style><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>');
  const file=path.resolve(site,name);
  if(!file.startsWith(site+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end(name);}
  const bytes=fs.readFileSync(file);served[name]=hash(bytes);
  assert.equal(served[name],manifest.artifacts[name],'served bytes match immutable build: '+name);
  res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.end(bytes);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
const receipt={status:'running',contentHash:manifest.contentHash,inputHash:manifest.inputHash,served,errors,cases:[],
  limits:['Controlled scene, fixed camera and lighting, real production modules. CPU paint is measured; ground material is a diagnostic plane.',
    'Chromium / ANGLE SwiftShader CPU times are not physical GPU, iPad or console performance.',
    'No accessible matching Tri-Slosher native retail footage: encoded frames, retail version, gear, camera FOV and input timings remain unverified.']};
try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  receipt.browser=await browser.version();
  const page=await browser.newPage({viewport:{width:960,height:640}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/probe');
  await page.evaluate(async()=>{
    const THREE=await import('three'),{install}=await import('/patches/splatoon3/runtime/install.mjs');
    const profile=await fetch('/patches/splatoon3/profile.json').then(r=>r.json()),api=install(profile);
    const {installMainWeaponCatalogRuntime}=await import('/patches/splatoon3/runtime/main-weapon-catalog.mjs');
    const {installWeaponsFidelity}=await import('/patches/splatoon3/runtime/weapons-fidelity.mjs');
    const {Level}=await import('/src/world/level.js');
    const {DEFAULT_SETTINGS}=await import('/src/config.js');
    const {FixedClock}=await import('/patches/splatoon3/runtime/clock.mjs');
    installWeaponsFidelity(api,profile);installMainWeaponCatalogRuntime(api,profile);
    const {G}=api,scene=new THREE.Scene(),renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.setSize(960,640);renderer.setClearColor(0xd5d9df);document.body.append(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff,0x556677,2));
    const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(-3,4,2);scene.add(sun);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshStandardMaterial({color:0xb9bdc8,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.002;scene.add(floor);
    const camera=new THREE.PerspectiveCamera(42,1.5,.01,100);
    G.scene=scene;G.camera=camera;G.settings={...DEFAULT_SETTINGS,quality:'low'};
    G.teamColors=[new THREE.Color('#ff8725'),new THREE.Color('#4048db')];G.netm=null;
    G.match={playing:()=>true,canRespawn:()=>false,state:'playing',opts:{range:true}};
    G.fx=new api.FX(scene,{quality:'low'});
    if(!await G.fx.inkVolumeReady)throw Error('production source volumes unavailable');
    G.projectiles=new api.Projectiles(scene);
    class CpuPaint extends api.PaintSystem{
      _initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};}
      _pushQuad(){} _drawQuads(){this.quads=0;this.dryMesh.visible=false;}
    }
    window.probe={THREE,api,G,scene,renderer,camera,Level,FixedClock,CpuPaint};
  });
  const plan=full?[{hz:60,pitch:0,moving:false},...[-20,0,20].flatMap(pitch=>[30,60,120].map(hz=>({hz,pitch,moving:true})))]:[{hz:60,pitch:0,moving:false}];
  for(const config of plan){
    const name=`${config.hz}hz-pitch${config.pitch}-${config.moving?'moving':'still'}`;
    await page.evaluate(async config=>{
      const {THREE,api,G,scene,renderer,camera,Level,FixedClock,CpuPaint}=window.probe;
      const old=window.probe.actor;if(old){scene.remove(old.character.root);old.character.dispose();}
      G.projectiles.clear();G.fx.clear();G.time=0;
      G.level=new Level({bounds:{minX:-40,maxX:40,minZ:-20,maxZ:60},spawnPads:[[-15,0,-15],[15,0,15]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-40,-1,-20],max:[40,0,60]}]});
      G.physics=new api.Physics(G.level);G.paint=new CpuPaint(null,G.level,{atlasSize:4096,maxDensity:30,cell:.25});
      const a=new api.Actor({team:0,weapon:'s3-slosher-diffusion',isLocal:true,CharacterClass:api.Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character;
      ch.actor=a;ch.onEvent=null;scene.add(ch.root);G.actors=[a];G.match.local=a;
      if(ch._sourceMotionLoader)await ch._sourceMotionLoader;if(ch.sourceMotion?.ready)await ch.sourceMotion.ready;
      if(ch.sourceMotion?.status!=='ready')throw Error('real motion not ready');
      a.pos.set(0,.04,0);a.aimPitch=config.pitch*Math.PI/180;a.yaw=a.aimYaw=0;a.grounded=a.ground.hit=true;a.ground.y=0;a.kidT=1;
      a.aimPoint.set(0,1.09+60*Math.sin(a.aimPitch),60*Math.cos(a.aimPitch));
      const clock=new FixedClock();G.game={s3Clock:clock};
      const stamps=[],raw=G.paint.splat;
      G.paint.splat=function(p,r,t,o={}){const area=raw.call(this,p,r,t,o);stamps.push({tick:window.probe.tick,at:p.toArray(),radius:r,team:t,seed:o.seed,kind:o.kind,face:o.face,stretch:o.stretch?.toArray(),stretchAmt:o.stretchAmt,area});return area;};
      Object.assign(window.probe,{actor:a,clock,tick:0,config,stamps,trace:[],cpuMs:[],peakDrops:0,peakBlobs:0,peakMain:0,matrices:[]});
      Math.random=()=>.5;
      camera.position.set(-11,5,5);camera.lookAt(0,.8,4);
      renderer.render(scene,camera);
    },config);
    const frames=[30,42,44,48,54,60,72,90,120];
    for(const target of frames){
      await page.evaluate(target=>{
        const p=window.probe,{G,actor:a,config,renderer,scene,camera,THREE}=p;
        while(p.tick<target){
          p.clock.advance(1/config.hz,dt=>{
            a.intent.fire=p.tick===30;a.intent.move.set(config.moving?1:0,0,0);a.ink=100;G.time+=dt;
            const start=performance.now();a.update(dt);a.character.root.updateMatrixWorld(true);G.projectiles.update(dt);G.paint.advanceSimulation(dt);p.cpuMs.push(performance.now()-start);
            p.tick++;
            const drops=G.projectiles._s3SplashDrops||[];
            p.peakDrops=Math.max(p.peakDrops,drops.length);p.peakMain=Math.max(p.peakMain,G.projectiles.list.length);
            p.trace.push({tick:p.tick,ink:a.ink,pos:a.pos.toArray(),main:G.projectiles.list.map(q=>({unit:q.catalog?.descriptor.unit,index:q.catalog?.index,age:q.age,pos:q.pos.toArray(),vel:q.vel.toArray(),damage:q.damage,radius:q.radius,ghost:q.ghost})),drops:drops.map(d=>({pos:d.pos.toArray(),vel:d.vel.toArray(),radius:d.radius,seed:d.seed,frames:d.frames,release:[d.releaseX,d.spawnY,d.releaseZ]})),cells:G.paint.counts[0]});
          });
        }
        G.projectiles.syncVisuals(1);G.projectiles._draw();renderer.render(scene,camera);
        p.peakBlobs=Math.max(p.peakBlobs,G.projectiles.blobs.count);
        const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
        for(const d of G.projectiles._s3SplashDrops||[]){
          for(let i=0;i<G.projectiles.blobs.count;i++){
            G.projectiles.blobs.getMatrixAt(i,matrix);matrix.decompose(position,rotation,scale);
            if(position.distanceTo(d.pos)<1e-5){const direction=new THREE.Vector3(0,0,1).applyQuaternion(rotation);p.matrices.push({tick:p.tick,frames:d.frames,source:d.sourceActor,drawRadius:d.drawRadius,scale:scale.toArray(),direction:direction.toArray(),physicalVelocity:d.vel.toArray()});break;}
          }
        }
      },target);
      if(config.hz===60&&!config.moving)await page.screenshot({path:path.join(out,`${name}-sim${target}.png`)});
    }
    const result=await page.evaluate(()=>{
      const p=window.probe,grid=Array.from(p.G.paint.grid);return {config:p.config,sourceMotion:p.actor.character.sourceMotion.status,trace:p.trace,stamps:p.stamps,grid,cells:p.G.paint.counts[0],matrices:p.matrices,peakDrops:p.peakDrops,peakMain:p.peakMain,peakBlobs:p.peakBlobs,cpuMs:p.cpuMs,render:p.renderer.info.render,camera:{position:p.camera.position.toArray(),fov:p.camera.fov}};
    });
    result.gridSha256=hash(JSON.stringify(result.grid));delete result.grid;
    result.cpu={samples:result.cpuMs.length,totalMs:result.cpuMs.reduce((a,b)=>a+b,0),medianMs:[...result.cpuMs].sort((a,b)=>a-b)[Math.floor(result.cpuMs.length/2)]};delete result.cpuMs;
    fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(result,null,2));
    receipt.cases.push({name,config,...Object.fromEntries(['cells','gridSha256','peakDrops','peakMain','peakBlobs','cpu','camera','sourceMotion'].map(k=>[k,result[k]])),traceSha256:hash(JSON.stringify(result.trace)),stampsSha256:hash(JSON.stringify(result.stamps)),matrixSamples:result.matrices.length});
    console.log(name,JSON.stringify(receipt.cases.at(-1)));
  }
  assert.equal(errors.length,0,JSON.stringify(errors));
  assert(receipt.cases.every(c=>c.peakDrops>0&&c.matrixSamples>0),'actual Tri-Slosher drops must be simulated AND rendered');
  receipt.status='passed';
}finally{
  fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(receipt,null,2));
  await browser?.close();await new Promise(r=>server.close(r));
}
