#!/usr/bin/env node
// Controlled actual Actor/Physics/paint and rendered VFX from the emitted site.
// No synthetic pointer lock, injected animation clocks, or retail-parity claim.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),errors=[],loaded=new Set();
const server=http.createServer((req,res)=>{
 const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(p==='/favicon.ico'){res.writeHead(204).end();return;}
 if(p==='/probe'){res.setHeader('content-type','text/html');res.end('<!doctype html><style>body{margin:0}</style><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>');return;}
 const file=path.resolve(site,'.'+p);if(!file.startsWith(site+'/')||!fs.existsSync(file)){res.writeHead(404).end();return;}
 loaded.add(p.slice(1));res.setHeader('content-type',file.endsWith('.json')?'application/json':/\.m?js$/.test(file)?'text/javascript':'application/octet-stream');fs.createReadStream(file).pipe(res);
});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:960,height:640}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${server.address().port}/probe`);
 const setup=await page.evaluate(async()=>{
  const profile=await fetch('/patches/splatoon3/profile.json').then(r=>r.json());
  const {install}=await import('/patches/splatoon3/runtime/install.mjs');const api=install(profile);
  const {FX}=await import('/src/fx/fx.js');const {Level}=await import('/src/world/level.js');const {createLevelMaterial}=await import('/src/world/levelMaterial.js');
  const {FixedClock}=await import('/patches/splatoon3/runtime/clock.mjs');
  const {G,THREE:T}=api,V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(960,640);renderer.setPixelRatio(1);renderer.toneMapping=T.NeutralToneMapping;renderer.toneMappingExposure=.94;document.body.appendChild(renderer.domElement);
  Object.assign(G,{renderer,scene:new T.Scene(),camera:new T.PerspectiveCamera(45,1.5,.01,200),settings:{quality:'high',shadows:false},mode:'match',time:0,actors:[],teamColors:[new T.Color('#e4e900'),new T.Color('#2f5bff')],match:{playing:()=>true,canRespawn:()=>false}});
  G.scene.background=new T.Color('#404a58');G.scene.add(new T.HemisphereLight(0xffffff,0x455069,2));const light=new T.DirectionalLight(0xffffff,2.5);light.position.set(3,8,4);G.scene.add(light);
  let mesh;
  window.testWorld=single=>{
   G.time=0;
   G.fx?.dispose();G.projectiles?.clear();G.paint?.dispose();if(mesh){G.scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
   G.level=new Level({bounds:{minX:-20,maxX:20,minZ:-20,maxZ:40},spawnPads:[[0,0,0],[0,20,20]],spawnBarrier:0,half:[],single});G.physics=new api.Physics(G.level);
   G.paint=new api.PaintSystem(renderer,G.level,{atlasSize:1024,maxDensity:16,cell:.25});
   const material=createLevelMaterial(G.paint.texture,G.paint.size);material.userData.uniforms.uTeamA.value.copy(G.teamColors[0]);
   mesh=new T.Mesh(G.level.buildGeometry(G.paint.size),material);G.scene.add(mesh);G.projectiles=new api.Projectiles(G.scene);G.fx=new FX(G.scene,{quality:'high'});
  };
  window.testActor=async(weapon='shooter')=>{
   for(const old of G.actors){G.scene.remove(old.character.root);old.character.dispose();}G.actors=[];
   const a=new api.Actor({team:0,name:'locomotion browser',isLocal:true,weapon,CharacterClass:api.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});G.actors=[a];a.character.actor=a;G.scene.add(a.character.root);a.character.setLod('hero');
   await a.character._sourceMotionLoader;await a.character.sourceMotion.ready;if(a.character.sourceMotion.status!=='ready')throw Error('source not loaded');return a;
  };
  window.testRender=a=>{G.camera.position.copy(a.pos).add(V(1.8,2.5,a.climbing?4:-4));G.camera.lookAt(a.pos.clone().add(V(0,.2,0)));G.camera.updateMatrixWorld();mesh.material.userData.uniforms.uTime.value=G.time;G.paint.flush(0);renderer.render(G.scene,G.camera);};
  window.pixelDifference=(drawn,other)=>{let changed=0;for(let i=0;i<drawn.length;i+=4)if(Math.max(Math.abs(drawn[i]-other[i]),Math.abs(drawn[i+1]-other[i+1]),Math.abs(drawn[i+2]-other[i+2]))>2)changed++;return changed;};
  window.pixels=()=>{const gl=renderer.getContext(),p=new Uint8Array(960*640*4);gl.readPixels(0,0,960,640,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  Object.assign(window,{qa:{api,G,T,V,FixedClock}});return {renderer:renderer.getContext().getParameter(renderer.getContext().RENDERER),source:'emitted production modules; real Actor controls, no match input UI'};
 });
 const roller=[];
 for(const hz of [30,60,120]){
  const row=await page.evaluate(async hz=>{
   const {G,V,FixedClock}=qa;testWorld([{kind:'ramp',low:[0,0,0],high:[0,30,30],width:16,thickness:.5}]);const a=await testActor('roller');
   a.pos.set(0,25,25);a.grounded=true;a.yaw=a.aimYaw=Math.PI;a.aimDir.set(0,0,-1);a.aimPoint.set(0,20,10);a.intent.move.set(0,0,-1);a.intent.fire=true;a.kidT=10;
   const clock=new FixedClock();let rollingTicks=0,paintTicks=0,lastCells=0;const rows=[];
   for(let frame=0;frame<hz*2;frame++)clock.advance(1/hz,dt=>{
    G.time+=dt;a.update(dt);G.paint.advanceSimulation(dt);if(rows.length>=60){if(a.weaponRunner.rolling)rollingTicks++;if(G.paint.counts[0]>lastCells)paintTicks++;}lastCells=G.paint.counts[0];
    rows.push({pos:a.pos.toArray(),ink:a.ink,cells:lastCells,grounded:a.grounded,rolling:a.weaponRunner.rolling});
   });
   testRender(a);return {hz,rollingTicks,paintTicks,cells:G.paint.counts[0],turf:a.stats.turf,rows,image:G.renderer.domElement.toDataURL('image/png')};
  },hz);
  fs.writeFileSync(path.join(out,`roller-downhill-${hz}.png`),Buffer.from(row.image.split(',')[1],'base64'));delete row.image;
  assert.equal(row.rollingTicks,60);assert(row.paintTicks>10);assert(row.cells>100);roller.push(row);
 }
 const swim=[];
 for(const wall of [false,true])for(const speed of [.5,2,8]){
  const row=await page.evaluate(async({wall,speed})=>{
   const {G,V}=qa;testWorld(wall?[{kind:'box',min:[-4,-1,-.4],max:[4,8,0]}]:[{kind:'box',min:[-10,-.5,-10],max:[10,0,10]}]);
   const a=await testActor();a.pos.set(0,wall?1:0,wall?.35:0);a.form='squid';a.grounded=!wall;a.submerged=!wall;a.climbing=wall;a.vel.set(0,wall?speed:0,wall?-1.2:speed);
   a.anim.wallNormal.set(0,0,1);a.wallHit.hit=wall;a.wallHit.point.set(0,1,0);a.ground.face=wall?-1:2;a.groundN.set(0,1,0);
   // A controlled VFX fixture: exact surface states, not a claimed player input replay.
   G.paint.splat(wall?V(0,2,.001):V(0,.001,0),4,0,{instant:true,seed:.4});G.paint.flush(0);
   for(let n=0;n<60;n++){G.time+=1/60;a._finishFrame(1/60);G.fx.update(1/60);}
   const s=G.fx.swimSurface?.slots.find(s=>s.actor===a);testRender(a);
   if(!s?.mesh.visible)return {wall,speed,visible:false};
   const drawn=pixels(),image=G.renderer.domElement.toDataURL('image/png');s.mesh.visible=false;testRender(a);const changed=pixelDifference(drawn,pixels());s.mesh.visible=true;
   const p=s.mesh.geometry.attributes.position.array;return {wall,speed,visible:true,pixels:changed,vertices:p.length/3,maxLift:Math.max(...p.filter((_x,i)=>i%3===1)),position:s.mesh.position.toArray(),up:V(0,1,0).applyQuaternion(s.mesh.quaternion).toArray(),image};
  },{wall,speed});
  if(row.image){fs.writeFileSync(path.join(out,`swim-${wall?'wall':'floor'}-${speed}.png`),Buffer.from(row.image.split(',')[1],'base64'));delete row.image;}
  assert(row.visible);assert(row.pixels>3,JSON.stringify(row));assert(row.vertices<=700);if(wall)assert(Math.abs(row.position[2])<1e-7);swim.push(row);
 }
 const walking=await page.evaluate(async()=>{
  const {G}=qa;testWorld([{kind:'box',min:[-10,-.5,-10],max:[10,0,10]}]);const a=await testActor();a.pos.set(0,0,0);a.smoothY=-.24;a.vel.set(0,0,0);a._face=()=>{};const values=[];
  for(let i=0;i<18;i++){G.time+=1/30;a._finishFrame(1/30);values.push(a.smoothY);}testRender(a);
  return {values,pos:a.pos.toArray(),image:G.renderer.domElement.toDataURL('image/png')};
 });
 fs.writeFileSync(path.join(out,'walk-step.png'),Buffer.from(walking.image.split(',')[1],'base64'));delete walking.image;
 assert(walking.values.every((v,i)=>v<=0&&(i===0||v>=walking.values[i-1])));assert.deepEqual(walking.pos,[0,0,0]);assert.deepEqual(errors,[]);
 for(const rel of ['patches/local-quality/swim-surface.mjs','patches/local-quality/walk-presentation.mjs','patches/splatoon3/runtime/rolling-floor.mjs'])assert(loaded.has(rel),'runtime loaded '+rel);
 fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({status:'passed',browser:browser.version(),build:build.contentHash,setup,roller,swim,walking,errors,loaded:[...loaded],scope:'Renderer: Chromium SwiftShader. Roller: real Actor input/Physics and GPU paint atlas. Swim: controlled floor/wall Actor states and actual FX pixel differences. Walking: exact emitted step-presentation decay. No Switch, iOS, audio, hardware or pointer-lock parity claim.'},null,2));
 console.log(JSON.stringify({status:'passed',build:build.contentHash,roller:roller.map(({rows,...r})=>r),swim,walking,errors}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
