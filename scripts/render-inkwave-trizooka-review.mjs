#!/usr/bin/env node
// Source-loaded visual and native launch evidence for the held Trizooka.
// Flat controlled floor; no claim of Nintendo retail or device FPS parity.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const opt=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1];};
const site=fs.realpathSync(opt('--site','_site')),out=path.resolve(opt('--out','.ci-scratch/trizooka-review'));
const size=Number(opt('--size',480)),seed=Number(opt('--seed',20261030));
if(!Number.isInteger(size)||size<128||size>2048||!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Invalid size or seed');
fs.mkdirSync(out,{recursive:true});const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
if(hash(JSON.stringify(manifest.artifacts))!==manifest.contentHash)throw Error('Invalid content hash');
for(const [p,h]of Object.entries(manifest.artifacts))if(hash(fs.readFileSync(path.join(site,p)))!==h)throw Error('Invalid artifact: '+p);
const prefix=`/_versions/${manifest.build.revision}/`;
const server=http.createServer((req,res)=>{
 if(req.url==='/review'){res.setHeader('content-type','text/html');res.end(`<html><head><link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script></head><body style="margin:0"></body></html>`);return;}
 const p=path.resolve(site,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(site+'/')||!fs.existsSync(p)){res.writeHead(404);res.end();return;}
 res.setHeader('content-type',/\.m?js$/.test(p)?'text/javascript':p.endsWith('.json')?'application/json':'application/octet-stream');fs.createReadStream(p).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const errors=[];
try{
 browser=await chromium.launch({headless:true,executablePath:opt('--browser-executable',undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:size,height:size}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(seed=>{let s=seed>>>0;Math.random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/0x100000000;};},seed);
 await page.goto(`http://127.0.0.1:${server.address().port}/review`);
 const data=await page.evaluate(async({prefix,size})=>{
  const THREE=await import('three'),{install}=await import(prefix+'patches/splatoon3/runtime/install.mjs'),{Level}=await import(prefix+'src/world/level.js');
  const profile=await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json()),api=install(profile),{G}=api;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#d8dce4');scene.add(new THREE.HemisphereLight(0xffffff,0x60718d,1.8));const light=new THREE.DirectionalLight(0xffffff,2.6);light.position.set(-3,5,3);scene.add(light);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x9aa0a8,roughness:.9}));floor.rotation.x=-Math.PI/2;floor.position.y=-.005;scene.add(floor);
  const camera=new THREE.PerspectiveCamera(36,1,.05,200),renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(size,size);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);
  const level=new Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});
  const paint=[];Object.assign(G,{scene,renderer,camera,settings:{quality:'high'},mode:'match',actors:[],time:0,teamColors:[new THREE.Color('#ff8825'),new THREE.Color('#484ce8')],match:{state:'playing',playing:()=>true},level,paint:{sample:()=>1,splat:(...a)=>{paint.push([a[0]?.toArray?.(),a[1],a[2]]);return 0;}}});
  G.physics=new api.Physics(level);G.projectiles=new api.Projectiles(scene);G.fx=new api.FX(scene,{quality:.35});G.fx.setCollider(()=>null);
  const a=new api.Actor({team:0,name:'trizooka review',isLocal:true,weapon:'shooter',CharacterClass:api.Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character;G.actors=[a];scene.add(ch.root);a.pos.set(0,0,0);a._probeGround();a.invuln=0;
  if(ch._sourceMotionLoader)await ch._sourceMotionLoader;if(ch.sourceMotion?.ready)await ch.sourceMotion.ready;if(ch.sourceMotion?.status!=='ready')throw Error('Source motion unavailable');
  const births=[],push=G.projectiles._push;G.projectiles._push=function(p,...args){if(p.wid==='trizooka'){
   const model=ch.kid.getObjectByName('special:trizooka');let visualNozzle=null;
   if(model?.visible&&model.userData.muzzle){model.updateWorldMatrix(true,false);visualNozzle=model.localToWorld(model.userData.muzzle.clone()).toArray();}
   births.push({time:G.time,index:p.s3VolleyIndex,pos:p.pos.toArray(),velocity:p.vel.toArray(),damage:p.damage,radius:p.radius,life:p.life,visualNozzle});
  }return push.call(this,p,...args);};
  const step=()=>{G.time+=1/60;a.update(1/60);G.projectiles.update(1/60);G.fx.update(1/60,camera);};
  function aim(yaw,pitch){a.aimYaw=yaw;a.aimPitch=pitch;a.aimDir.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));a.aimPoint.copy(a.pos).addScaledVector(a.aimDir,30);a.aimPoint.y+=1.05;}
  aim(0,0);for(let i=0;i<60;i++)step();a.weapon={...a.weapon,special:'trizooka',specialCost:200};a.special=200;a._startSpecial();if(a.specialActive?.id!=='trizooka')throw Error('Activation failed');
  const images=[],rows=[];
  function capture(label,views=true){
   ch.root.updateMatrixWorld(true);ch.skeleton.update();const g=ch.kid.getObjectByName('special:trizooka');if(!g||!g.visible)throw Error('Held model missing: '+label);
   g.updateWorldMatrix(true,true);const bone=n=>ch.bones[n].getWorldPosition(new THREE.Vector3());const point=k=>g.localToWorld(g.userData[k].clone());
   const head=bone('head'),eyeMid=ch.bones.head.localToWorld(new THREE.Vector3(0,.188,.15)),hip=bone('hips'),shoulderL=bone('clavL'),shoulderR=bone('clavR'),handL=bone('handL'),handR=bone('handR');
   const rightHole=ch.bones.handR.localToWorld(g.userData.holeR.clone()),leftHole=ch.bones.handL.localToWorld(g.userData.holeL.clone()),trigger=point('gripR'),support=point('gripL'),nozzle=point('muzzle');
   const nativeMuzzle=G.projectiles._muzzle(a,new THREE.Vector3()).clone(),direction=new THREE.Vector3(0,0,1).applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion())).normalize();
   const right=new THREE.Vector3(-Math.cos(a.yaw),0,Math.sin(a.yaw)),axisAtHead=nozzle.clone().addScaledVector(direction,head.clone().sub(nozzle).dot(direction)),axisAtEyes=nozzle.clone().addScaledVector(direction,eyeMid.clone().sub(nozzle).dot(direction));
   const box=new THREE.Box3(),inv=g.matrixWorld.clone().invert();g.traverse(o=>{if(!o.isMesh||!o.visible||!o.geometry?.attributes?.position)return;o.geometry.computeBoundingBox();const b=o.geometry.boundingBox.clone().applyMatrix4(inv.clone().multiply(o.matrixWorld));box.union(b);});
   // Optional authored handle axes are checked against the actual merged
   // green vertex geometry, then compared with source-skeleton hand holes.
   const gripGeometry={};const housing=g.getObjectByName('zooka-housing');
   for(const [side,hole]of [['R',rightHole],['L',leftHole]]){const spec=g.userData.gripAxes?.[side];if(!spec||!housing)continue;
    const center=spec.center.clone(),axis=spec.direction.clone().normalize(),length=spec.halfLength,verts=housing.geometry.attributes.position,colors=housing.geometry.attributes.color,p=new THREE.Vector3();let greenVertices=0;
    for(let i=0;i<verts.count;i++){if(colors&&!(colors.getY(i)>colors.getX(i)*1.5&&colors.getY(i)>colors.getZ(i)*1.5))continue;p.fromBufferAttribute(verts,i).sub(center);const along=p.dot(axis),radial=p.addScaledVector(axis,-along).length();if(Math.abs(along)<=length+.01&&radial>=.02&&radial<=.06)greenVertices++;}
    const p0=g.localToWorld(center.clone().addScaledVector(axis,-length)),p1=g.localToWorld(center.clone().addScaledVector(axis,length)),line=p1.clone().sub(p0),t=Math.max(0,Math.min(1,hole.clone().sub(p0).dot(line)/line.lengthSq()));
    gripGeometry[side]={greenVertices,axisStart:p0.toArray(),axisEnd:p1.toArray(),handHoleToAxis:hole.distanceTo(p0.clone().addScaledVector(line,t))};
   }
   const delta=nozzle.clone().sub(nativeMuzzle),deltaForward=delta.dot(a.aimDir),deltaLateral=delta.clone().addScaledVector(a.aimDir,-deltaForward).length();let wallProbe=null,nearWallProbe=null;
   // In the neutral +Z case, put a thin real collider between separated
   // endpoints and ask the actual Physics and native muzzle fallback paths.
   // This is an isolated LOS probe, not a full gameplay or wall-paint trace.
   if(label==='neutral'&&nozzle.z-nativeMuzzle.z>.04){
    const z=(nozzle.z+nativeMuzzle.z)/2,oldLevel=G.level,oldPhysics=G.physics;
    try{G.level=new Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]},{kind:'box',min:[-3,0,z],max:[3,3,z+.05]}]});G.physics=new api.Physics(G.level);
     const origin=a.pos.clone().add(new THREE.Vector3(0,1.05,0));wallProbe={wallZ:z,actorOrigin:origin.toArray(),legacyLOS:G.physics.los(origin,nativeMuzzle),visualLOS:G.physics.los(origin,nozzle),actualMuzzle:G.projectiles._muzzle(a,new THREE.Vector3()).toArray()};
    }finally{G.level=oldLevel;G.physics=oldPhysics;}
   }
   if(label==='neutral'&&nozzle.z-a.pos.z>.5){
    const z=a.pos.z+(nozzle.z-a.pos.z)*.72,oldLevel=G.level,oldPhysics=G.physics;
    try{G.level=new Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]},{kind:'box',min:[-3,0,z],max:[3,3,z+.05]}]});G.physics=new api.Physics(G.level);
     const origin=a.pos.clone().add(new THREE.Vector3(0,1.05,0)),actual=G.projectiles._muzzle(a,new THREE.Vector3()).clone();
     nearWallProbe={wallZ:z,actorOrigin:origin.toArray(),visualLOS:G.physics.los(origin,nozzle),actualMuzzle:actual.toArray(),expectedFallback:origin.clone().addScaledVector(a.aimDir,.3).toArray(),fallbackError:actual.distanceTo(origin.clone().addScaledVector(a.aimDir,.3))};
    }finally{G.level=oldLevel;G.physics=oldPhysics;}
   }
   rows.push({label,time:G.time,position:a.pos.toArray(),velocity:a.vel.toArray(),yaw:a.yaw,aimYaw:a.aimYaw,aimPitch:a.aimPitch,aim:a.aimDir.toArray(),head:head.toArray(),eyeMid:eyeMid.toArray(),hip:hip.toArray(),shoulderL:shoulderL.toArray(),shoulderR:shoulderR.toArray(),handL:handL.toArray(),handR:handR.toArray(),rightHole:rightHole.toArray(),leftHole:leftHole.toArray(),trigger:trigger.toArray(),support:support.toArray(),gripGeometry,nozzle:nozzle.toArray(),nativeMuzzle:nativeMuzzle.toArray(),visualNativeDistance:delta.length(),visualNativeForward:deltaForward,visualNativeLateral:deltaLateral,wallProbe,nearWallProbe,barrelDirection:direction.toArray(),aimDot:direction.dot(a.aimDir),rightHoleError:rightHole.distanceTo(trigger),leftHoleError:leftHole.distanceTo(support),supportAhead:support.clone().sub(trigger).dot(direction),axisRightOfHead:axisAtHead.sub(head).dot(right),axisRightOfEyes:axisAtEyes.clone().sub(eyeMid).dot(right),axisAboveEyes:axisAtEyes.y-eyeMid.y,axisAboveRightShoulder:axisAtEyes.y-shoulderR.y,triggerShoulderDistance:trigger.distanceTo(shoulderR),modelLocalBounds:{min:box.min.toArray(),max:box.max.toArray()},ammo:a.s3Trizooka?.shots,special:a.special,active:a.specialActive?.id||null});
   if(!views)return;
   G.fx.root.visible=false;
   for(const [view,off]of [['front',[-2.5,1.5,3.0]],['true-front',[0,1.5,3.4]],['opposite-front',[2.5,1.5,3.0]],['side',[3.6,1.3,0]],['back',[-2.5,1.5,-3.0]]]){
    camera.position.copy(a.pos).add(new THREE.Vector3(...off));camera.lookAt(a.pos.clone().add(new THREE.Vector3(0,1.05,0)));renderer.render(scene,camera);images.push({name:label+'-'+view,data:renderer.domElement.toDataURL('image/png')});
   }
   if(label==='recoil'||label==='shot-later'){
    G.fx.root.visible=true;camera.position.copy(a.pos).add(new THREE.Vector3(1.8,1.5,2.3));camera.lookAt(nozzle);renderer.render(scene,camera);images.push({name:label+'-effects-close',data:renderer.domElement.toDataURL('image/png')});G.fx.root.visible=false;
   }
   // Hide the actual character meshes, leaving its hierarchy and held model intact.
   const hidden=[];ch.kid.traverse(o=>{if(!o.isMesh)return;for(let p=o;p;p=p.parent)if(p===g)return;hidden.push([o,o.visible]);o.visible=false;});
   for(const [view,off]of [['device-side',[3.6,1.3,0]],['device-front',[-2.5,1.5,3.0]]]){camera.position.copy(a.pos).add(new THREE.Vector3(...off));camera.lookAt(a.pos.clone().add(new THREE.Vector3(0,1.05,0)));renderer.render(scene,camera);images.push({name:label+'-'+view,data:renderer.domElement.toDataURL('image/png')});}
   for(const [o,v]of hidden)o.visible=v;G.fx.root.visible=true;
  }
  for(let i=0;i<30;i++)step();capture('neutral');
  aim(0,.55);for(let i=0;i<12;i++)step();capture('pitch-up');
  aim(0,-.55);for(let i=0;i<12;i++)step();capture('pitch-down');
  aim(.65,0);for(let i=0;i<12;i++)step();capture('yaw');
  aim(0,0);a.intent.move.set(.45,0,.65);for(let i=0;i<20;i++)step();capture('moving');a.intent.move.set(0,0,0);
  a.intent.fire=true;for(let i=0;i<40&&!births.length;i++)step();if(births.length!==3)throw Error('Trizooka volley not observed: '+births.length);capture('recoil');a.intent.fire=false;for(let i=0;i<3;i++)step();capture('shot-later');
  for(let i=0;i<1200&&a.specialActive;i++)step();if(a.specialActive)throw Error('Trizooka did not expire');for(let i=0;i<60;i++)step();
  const restored={special:a.specialActive?.id||null,mainVisible:ch.weapon.pivot.visible,sourceUpper:ch.sourceMotion.sourceUpper,heldVisible:!!ch.kid.getObjectByName('special:trizooka')?.visible};
  if(!restored.mainVisible||!restored.sourceUpper||restored.heldVisible)throw Error('Main weapon did not restore: '+JSON.stringify(restored));
  const directorErrors=G.fx.s3SpecialVfx.errors;G.fx.dispose();ch.dispose();return {rows,images,births,paint,restored,directorErrors,sourceMotion:ch.sourceMotion?.status};
 },{prefix,size});
 for(const i of data.images)fs.writeFileSync(path.join(out,i.name+'.png'),Buffer.from(i.data.split(',')[1],'base64'));delete data.images;
 if(errors.length||data.directorErrors)throw Error('Browser/director errors: '+JSON.stringify({errors,directorErrors:data.directorErrors}));
 fs.writeFileSync(path.join(out,'trizooka-review.json'),JSON.stringify({status:'passed',revision:manifest.build.revision,contentHash:manifest.contentHash,browser:browser.version(),seed,driverSHA256:hash(fs.readFileSync(new URL(import.meta.url))),fixture:'actual source-loaded Character, Actor.update, Physics, Projectiles and FX on controlled flat floor; cosmetic evidence, not retail or device FPS parity',...data,errors},null,2)+'\n');
 console.log(JSON.stringify({status:'passed',out,shots:data.births.length,restored:data.restored}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
