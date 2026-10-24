#!/usr/bin/env node
// Actual emitted Actor/Character/Physics/FX. Close cameras below are inspection
// views; ordinary gameplay captures are kept separately. No retail timing claim.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const opt=(k,f)=>{const i=process.argv.indexOf(k);return i<0?f:process.argv[i+1];};
const site=fs.realpathSync(opt('--site','_site')),out=path.resolve(opt('--evidence-dir','.browser-evidence/inkjet-presentation'));
fs.mkdirSync(out,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),hash=x=>createHash('sha256').update(x).digest('hex');
assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);
for(const [file,digest]of Object.entries(manifest.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,file))),digest,file);
const prefix=`/_versions/${manifest.build.revision}/`;
const server=http.createServer((req,res)=>{try{
 if(req.url==='/inspect'){res.setHeader('content-type','text/html');res.end(`<html><head><link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script></head><body style="margin:0"></body></html>`);return;}
 const f=path.resolve(site,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!f.startsWith(site+'/')||!fs.statSync(f).isFile())throw Error();
 res.setHeader('content-type',/\.m?js$/.test(f)?'text/javascript':f.endsWith('.json')?'application/json':'application/octet-stream');fs.createReadStream(f).pipe(res);
}catch{res.writeHead(404);res.end();}});
let browser;const errors=[];
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:opt('--browser-executable','/usr/bin/chromium'),args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:800,height:600}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.exposeFunction('saveInkjetImage',(name,data)=>fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(data.split(',')[1],'base64')));
 await page.goto(`http://127.0.0.1:${server.address().port}/inspect`);
 const result=await page.evaluate(async({prefix,detached})=>{
  const THREE=await import('three'),{install}=await import(prefix+'patches/splatoon3/runtime/install.mjs');
  const api=install(await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json())),{G}=api;
  const {Level}=await import(prefix+'src/world/level.js');
  const scene=new THREE.Scene();scene.background=new THREE.Color('#cad8e2');
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(800,600);document.body.appendChild(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(45,4/3,.01,200);scene.add(new THREE.HemisphereLight(0xffffff,0x637278,2.4));
  const light=new THREE.DirectionalLight(0xffffff,2.8);light.position.set(-3,8,5);scene.add(light);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x8798a8,roughness:1}));floor.rotation.x=-Math.PI/2;scene.add(floor);
  Object.assign(G,{scene,renderer,camera,settings:{quality:'high'},mode:'match',actors:[],time:0,teamColors:[new THREE.Color('#ff7711'),new THREE.Color('#2255dd')],match:{state:'playing',playing:()=>true,canRespawn:()=>false}});
  G.level=new Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});
  G.physics=new api.Physics(G.level);G.projectiles=new api.Projectiles(scene);G.paint={sample:()=>1,splat:()=>0};
  G.fx=new api.FX(scene,{quality:'high'});G.fx.setCollider(()=>null);
  const failures=[],cases=[],events=[],shots=[];let seed=7;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  api.on('all:special',e=>{if(e.id==='inkjet')events.push({action:e.action,activation:e.activation,pos:e.pos,target:e.target,seed:e.seed,time:G.time});});
  const push=G.projectiles._push;G.projectiles._push=function(p){if(p.wid==='inkjet')shots.push({pos:p.pos.toArray(),vel:p.vel.toArray(),life:p.life,damage:p.damage,seed:p.seed,time:G.time});return push.call(this,p);};
  const expect=(ok,label,data)=>{if(!ok)failures.push({label,data});};
  const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
  const step=(a,hz,n=1)=>{for(let i=0;i<n;i++){const dt=1/hz;G.time+=dt;a.update(dt);a.intent.special=false;G.projectiles.update(dt);G.fx.update(dt,camera);}};
  const image=async(name,a)=>{const yaw=a.yaw||0;camera.position.copy(a.pos).add(V(-Math.sin(yaw)*3+Math.cos(yaw)*1.2,1.5,-Math.cos(yaw)*3-Math.sin(yaw)*1.2));camera.lookAt(a.pos.clone().add(V(0,.65,-.1)));renderer.render(scene,camera);const gl=renderer.getContext();expect(!gl.isContextLost()&&gl.getError()===gl.NO_ERROR,name+' WebGL');await window.saveInkjetImage(name,renderer.domElement.toDataURL('image/png'));};
  // Compare effect origins with the actual two circular openings in the mesh,
  // rather than duplicating the presentation socket formula in an assertion.
  const anchors=a=>{
   const pack=a.character.s3SpecialDevices()?.find(d=>d.spec.model==='spInkjetPack'),track=G.fx.s3SpecialVfx.tracks.get(a);
   if(!pack||!track?.d.jets)return null;
   const holes=pack.model.groups.body.children.find(m=>m.userData.s3Finish==='hole'),p=holes.geometry.attributes.position;
   holes.updateWorldMatrix(true,false);
   const centers=[-1,1].map(s=>{const box=new THREE.Box3();for(let i=0;i<p.count;i++){const v=V().fromBufferAttribute(p,i);if(v.x*s>0)box.expandByPoint(v);}return holes.localToWorld(box.getCenter(V()));});
   return centers.map((center,i)=>{const jet=track.d.jets[i].v,origin=V(jet[0],jet[1],jet[2]);return {center:center.toArray(),origin:origin.toArray(),error:center.distanceTo(origin)};});
  };
  for(const hz of [30,60,120]){
   G.projectiles.clear();G.fx.clear();const a=new api.Actor({team:0,name:'Inkjet inspection',isLocal:true,weapon:'shooter',CharacterClass:api.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
   scene.add(a.character.root);G.actors=[a];a.pos.set(0,0,0);a._probeGround();a.invuln=0;
   await a.character._sourceMotionLoader;await a.character.sourceMotion?.ready;expect(a.character.sourceMotion?.status==='ready','source motion ready');
   a.weapon={...a.weapon,special:'inkjet',specialCost:200};a.special=200;a.aimPoint.set(0,6,30);a.aimDir.set(0,0,1);
   step(a,hz,Math.round(hz*.5));a.intent.special=true;step(a,hz);expect(a._s3AllSpecialState?.id==='inkjet',hz+' native activation');
   step(a,hz,Math.round(hz*.75));const measured=[];
   if(hz===60)await image('inspection-hover-back',a);
   for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
    a.aimYaw=yaw;a.aimPitch=.6;a.aimDir.set(Math.sin(yaw)*Math.cos(.6),Math.sin(.6),Math.cos(yaw)*Math.cos(.6));a.aimPoint.copy(a.pos).addScaledVector(a.aimDir,30);
    a.intent.move.set(Math.sin(yaw),0,Math.cos(yaw));step(a,hz,Math.round(hz*.1));const row=anchors(a);expect(!!row,'live anchors');
    if(row){measured.push(...row.map(r=>r.error));expect(detached?row.every(r=>r.error>.05):row.every(r=>r.error<.02),hz+' nozzle attachment',{yaw,row});}
   }
   a.intent.move.set(0,0,0);a.intent.fire=true;const count=shots.length;step(a,hz);a.intent.fire=false;expect(shots.length===count+1,hz+' native emission');
   const cannon=a.character.s3SpecialDevices()?.find(d=>d.spec.aim);const recoil=cannon.holder.position.toArray();
   if(hz===60){await image('inspection-flight-shot',a);const fxVisible=G.fx.root.visible;G.fx.root.visible=false;await image('inspection-pack-without-fx',a);G.fx.root.visible=fxVisible;}
   // A paused visual frame cannot change native state or spawn effects.
   const before=[G.time,a.special,a._s3AllSpecialState.t,shots.length];a.character.update(0,a.anim);G.fx.update(0,camera);expect(JSON.stringify(before)===JSON.stringify([G.time,a.special,a._s3AllSpecialState.t,shots.length]),'paused frame inert');
   a.intent.squid=true;step(a,hz);expect(G.fx.s3SpecialVfx.tracks.get(a).d.jets.every(r=>r.v[11]===0),'squid suppresses jets');a.intent.squid=false;step(a,hz);
   for(let i=0;i<hz*10&&a.specialActive;i++)step(a,hz);
   expect(!a.specialActive&&!!a.superJumpState,hz+' native timed return');expect(!a.character.s3SpecialDevices(),hz+' return retires devices');expect(!G.fx.s3SpecialVfx.tracks.has(a),hz+' return retires jets');
   const returnPhase=a.superJumpState?.phase;for(let i=0;i<hz*5&&a.superJumpState;i++)step(a,hz);
   expect(!a.superJumpState,hz+' native return lands');expect(a.character.weapon.pivot.visible,hz+' ordinary weapon restored');
   a.special=200;a.intent.special=true;step(a,hz);step(a,hz);expect(a.character.s3SpecialDevices()?.length===2,hz+' reuse creates fresh devices');
   a.reset();step(a,hz);expect(!a.character.s3SpecialDevices()&&!G.fx.s3SpecialVfx.tracks.has(a),hz+' native reset cancels presentation');
   // Reset reapplies the actor's stored loadout. Re-equip this inspection kit.
   a.weapon={...a.weapon,special:'inkjet',specialCost:200};a.special=200;a.intent.special=true;step(a,hz);step(a,hz);expect(a.character.s3SpecialDevices()?.length===2,hz+' reuse after reset');
   a.splat(null,'inspection');step(a,hz);expect(!a.character.s3SpecialDevices(),hz+' death retires devices');expect(!G.fx.s3SpecialVfx.tracks.has(a),hz+' death retires jets');
   cases.push({hz,anchorErrors:measured,recoil,returnPhase,landed:!a.superJumpState,sourceMotion:a.character.sourceMotion.status,position:a.pos.toArray(),stats:{...a.stats}});
   a.character.dispose();G.actors=[];
  }
  renderer.render(scene,camera);const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
  return {cases,events,shots,failures,directorErrors:G.fx.s3SpecialVfx.errors,render:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles},webgl:{version:gl.getParameter(gl.VERSION),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null}};
 },{prefix,detached:process.argv.includes('--expect-detached')});
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({browser:browser.version(),contentHash:manifest.contentHash,result,errors},null,2)+'\n');
 console.log(JSON.stringify({cases:result.cases,failures:result.failures,errors}));assert.equal(result.directorErrors,0);assert.deepEqual(errors,[]);assert.deepEqual(result.failures,[]);
}finally{await browser?.close();await new Promise(r=>server.close(r));}
