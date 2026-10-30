#!/usr/bin/env node
// Render the emitted Actor/FX and real painted surface at a fixed clock from
// several cameras. This is a visual fixture, not a retail-input/physics replay.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const site=path.resolve(process.argv[2]||'_site');
const out=path.resolve(process.argv[3]||'.browser-evidence/swim-multiview');
fs.mkdirSync(out,{recursive:true});
const errors=[],loaded=new Set();
const server=http.createServer((req,res)=>{
  const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(p==='/favicon.ico'){res.writeHead(204).end();return;}
  if(p==='/probe'){
    res.setHeader('content-type','text/html');
    res.end('<!doctype html><style>body{margin:0}</style><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>');return;
  }
  const file=path.resolve(site,'.'+p);
  if(!file.startsWith(site+'/')||!fs.existsSync(file)){res.writeHead(404).end();return;}
  loaded.add(p.slice(1));res.setHeader('content-type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.json')?'application/json':'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:800,height:600}});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}/probe`);
  await page.evaluate(async()=>{
    const profile=await fetch('/patches/splatoon3/profile.json').then(r=>r.json());
    const {install}=await import('/patches/splatoon3/runtime/install.mjs'),api=install(profile);
    const {FX}=await import('/src/fx/fx.js'),{Level}=await import('/src/world/level.js');
    const {createLevelMaterial}=await import('/src/world/levelMaterial.js');
    const {G,THREE:T}=api,V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
    const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.setSize(800,600);renderer.setPixelRatio(1);renderer.toneMapping=T.NeutralToneMapping;renderer.toneMappingExposure=.94;document.body.appendChild(renderer.domElement);
    Object.assign(G,{renderer,scene:new T.Scene(),camera:new T.PerspectiveCamera(38,4/3,.01,200),settings:{quality:'high',shadows:false},mode:'match',time:0,actors:[],teamColors:[new T.Color('#e4e900'),new T.Color('#2f5bff')],match:{playing:()=>true,canRespawn:()=>false}});
    G.scene.background=new T.Color('#404a58');G.scene.add(new T.HemisphereLight(0xffffff,0x455069,2));
    const light=new T.DirectionalLight(0xffffff,2.5);light.position.set(3,8,4);G.scene.add(light);
    G.level=new Level({bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10},spawnPads:[[0,0,0],[0,8,8]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-10,-.5,-10],max:[10,0,10]}]});
    G.physics=new api.Physics(G.level);G.paint=new api.PaintSystem(renderer,G.level,{atlasSize:1024,maxDensity:16,cell:.25});
    const mat=createLevelMaterial(G.paint.texture,G.paint.size);mat.userData.uniforms.uTeamA.value.copy(G.teamColors[0]);
    const floor=new T.Mesh(G.level.buildGeometry(G.paint.size),mat);G.scene.add(floor);G.fx=new FX(G.scene,{quality:'high'});G.fx.motes.visible=false;
    const a=new api.Actor({team:0,name:'swim visual fixture',isLocal:true,weapon:'shooter',CharacterClass:api.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
    G.actors=[a];a.character.actor=a;G.scene.add(a.character.root);await a.character._sourceMotionLoader;await a.character.sourceMotion.ready;
    a.pos.set(0,0,0);a.color.copy(G.teamColors[0]);a.form='squid';a.grounded=true;a.submerged=true;a.vel.set(0,0,8);a.groundN.set(0,1,0);a.ground.face=2;
    G.paint.splat(V(0,.001,0),4,0,{instant:true,seed:.4});G.paint.flush(0);
    // Settle one-shot entry effects. Continuous swim owns no generic drops.
    for(let i=0;i<90;i++){G.time+=1/60;a._finishFrame(1/60);G.fx.update(1/60);}
    G.fx.clear();
    window.swimFrame=({time=10,speed=8,heading=0,view=[0,.75,-1.65],color='#e4e900',plane='floor',hidden=false,quiet=false,tearControl=null})=>{
      G.time=time;G.fx._time=time-1/60;a.color.set(color);mat.userData.uniforms.uTeamA.value.copy(a.color);
      a.alive=true;a.form='squid';a.s3.modifiers.ninjaSquid=quiet;a.s3.swimStealth.since=0;
      a.climbing=plane==='wall';a.grounded=!a.climbing;a.submerged=!a.climbing;
      a.groundN.set(0,1,plane==='slope'?.5:0).normalize();
      const normal=a.climbing?V(0,0,1):a.groundN;
      a.anim.wallNormal.copy(normal);a.wallHit.hit=a.climbing;a.wallHit.point.set(0,0,0);
      const forward=a.climbing?V(0,1,0):V(Math.sin(heading),0,Math.cos(heading));forward.addScaledVector(normal,-forward.dot(normal)).normalize();
      a.pos.copy(normal).multiplyScalar(a.climbing?.35:0);a.vel.copy(forward).multiplyScalar(speed);
      // Transform the *actual* painted level mesh with the same supporting plane.
      floor.quaternion.setFromUnitVectors(V(0,1,0),normal);
      a._finishFrame(1/60);G.fx.update(1/60);
      const s=G.fx.swimSurface.slots.find(s=>s.actor===a),q=s?.mesh.quaternion||new T.Quaternion();
      const target=V(0,.09,-.20).applyQuaternion(q);
      G.camera.position.copy(V(...view).applyQuaternion(q)).add(target);
      G.camera.up.copy(V(0,1,0).applyQuaternion(q));G.camera.lookAt(target);G.camera.updateMatrixWorld();
      mat.userData.uniforms.uTime.value=time;G.paint.flush(0);
      if(s&&tearControl)for(const h of s.mesh.geometry.userData.filmHoles)h.set(.5,.5,tearControl==='open'?100:.000001,tearControl==='open'?100:.000001);
      if(s&&hidden)s.mesh.visible=false;
      G.renderer.render(G.scene,G.camera);
      const row={image:renderer.domElement.toDataURL('image/png'),visible:!!s?.mesh.visible,bodyVisible:a.character.squid.body.visible,drops:G.fx.dN,vertices:s?.mesh.geometry.attributes.position.count,triangles:s?.mesh.geometry.index.count/3,position:s?.mesh.position.toArray(),up:s?V(0,1,0).applyQuaternion(s.mesh.quaternion).toArray():null};
      if(tearControl){
        const gl=renderer.getContext(),pixels=new Uint8Array(800*600*4);gl.readPixels(0,0,800,600,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        if(tearControl==='solid')window.solidFilmPixels=pixels;
        else{let changed=0;for(let i=0;i<pixels.length;i+=4)if(Math.max(Math.abs(pixels[i]-solidFilmPixels[i]),Math.abs(pixels[i+1]-solidFilmPixels[i+1]),Math.abs(pixels[i+2]-solidFilmPixels[i+2]))>3)changed++;row.tearControlPixels=changed;}
      }
      if(s&&hidden)s.mesh.visible=true;
      return row;
    };
  });
  const views={play:[1.2,2.5,-4],rear:[0,.75,-1.65],front:[0,.65,1.65],left:[-1.65,.5,0],right:[1.65,.5,0],top:[0,2,.001],quarter:[1.25,1.3,-1.25]};
  const rows=[];
  async function capture(name,params){
    const row=await page.evaluate(p=>swimFrame(p),params),file=path.join(out,name+'.png');fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,Buffer.from(row.image.split(',')[1],'base64'));delete row.image;
    if(!params.hidden&&!params.quiet&&params.speed!==0){assert(row.visible);assert(!row.bodyVisible);assert.equal(row.drops,0);assert(row.vertices<=700);}
    rows.push({name,...params,...row});return row;
  }
  for(const [name,view] of Object.entries(views)){
    for(const frame of [0,6,12,18,24,30])await capture(`${name}/${String(frame).padStart(3,'0')}`,{time:10+frame/60,view});
  }
  for(const [name,view] of Object.entries(views))if(!process.argv.includes('--stills')&&['rear','left','top'].includes(name)){
    for(let frame=0;frame<36;frame++)await capture(`motion-${name}/${String(frame).padStart(3,'0')}`,{time:10+frame/30,view});
  }
  for(const [name,color] of [['yellow','#e4e900'],['orange','#ff6400'],['blue','#2f5bff'],['purple','#9e21f5']]){
    await capture(`colors/${name}`,{time:10.2,color});await capture(`colors/${name}-surface`,{time:10.2,color,hidden:true});
  }
  for(const plane of ['floor','slope','wall'])for(const speed of [.5,3,8,11.8]){
    const row=await capture(`${plane}/${speed}`,{time:10.2,plane,speed});
    if(plane==='wall')assert(Math.abs(row.position[2])<1e-7);
  }
  for(const heading of [Math.PI/2,Math.PI,-Math.PI/2])await capture(`heading/${heading}`,{time:10.2,heading});
  if(process.argv.includes('--verify-tears')){
    await capture('tear-control/solid',{time:10.2,view:views.left,tearControl:'solid'});
    const control=await capture('tear-control/open',{time:10.2,view:views.left,tearControl:'open'});
    assert(control.tearControlPixels>1000,'tear uniforms must affect rendered shoulder pixels');
  }
  assert.equal((await capture('stopped',{time:10.2,speed:0})).visible,false);
  assert.equal((await capture('ninja',{time:10.2,speed:8,quiet:true})).visible,false);
  assert(loaded.has('patches/local-quality/swim-surface.mjs'));assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({browser:browser.version(),build:JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))).contentHash,rows,errors,scope:'Emitted Actor/FX and painted level. Controlled constant-velocity states, seven cameras, 30fps sequences. Chromium/SwiftShader, not native input or Switch/iPad measurements.'},null,2));
  console.log(JSON.stringify({status:'passed',images:rows.length,errors}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
