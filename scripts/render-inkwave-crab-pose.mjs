#!/usr/bin/env node
// Controlled visual evidence for actual Actor/Character/Physics at different
// simulation intervals. This does not measure retail parity or device FPS.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const arg=(key,def)=>{const i=process.argv.indexOf(key);return i<0?def:process.argv[i+1];};
const site=fs.realpathSync(arg('--site','_site')), out=path.resolve(arg('--out','.ci-scratch/special-trajectory'));
const hz=Number(arg('--hz',60)), size=Number(arg('--size',480)), seed=Number(arg('--seed',20261030)), ids=['crabTank'];
if(![30,60,120].includes(hz)||!Number.isInteger(size)||size<128||size>2048||!ids.every(id=>['crabTank','reefslider','ultraStamp'].includes(id))) throw Error('Invalid hz, size, or special IDs');
if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Seed must be an unsigned 32-bit integer');
fs.mkdirSync(out,{recursive:true});
const hash=x=>createHash('sha256').update(x).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
if(hash(JSON.stringify(manifest.artifacts))!==manifest.contentHash)throw Error('Manifest content hash mismatch');
for(const [file,digest] of Object.entries(manifest.artifacts))if(hash(fs.readFileSync(path.join(site,file)))!==digest)throw Error('Artifact hash mismatch: '+file);
const prefix=`/_versions/${manifest.build.revision}/`;
const server=http.createServer((req,res)=>{
 if(req.url==='/review'){res.setHeader('content-type','text/html');res.end(`<html><head><link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script></head><body style="margin:0"></body></html>`);return;}
 const file=path.resolve(site,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(site+'/')||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('content-type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.json')?'application/json':'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;const errors=[];
try{
 browser=await chromium.launch({headless:true,executablePath:arg('--browser-executable',undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:size,height:size}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(seed=>{let state=seed>>>0;Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/0x100000000;};},seed);
 await page.goto(`http://127.0.0.1:${server.address().port}/review`);
 const result=await page.evaluate(async({prefix,hz,size,ids})=>{
  const THREE=await import('three'),{install}=await import(prefix+'patches/splatoon3/runtime/install.mjs'),{Level}=await import(prefix+'src/world/level.js');
  const profile=await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json()),api=install(profile),{G}=api;
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(size,size);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#d8dce4');scene.add(new THREE.HemisphereLight(0xffffff,0x60718d,1.8));const light=new THREE.DirectionalLight(0xffffff,2.6);light.position.set(-3,5,3);scene.add(light);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x9aa0a8,roughness:.9}));floor.rotation.x=-Math.PI/2;floor.position.y=-.005;scene.add(floor);
  const camera=new THREE.PerspectiveCamera(36,1,.05,200);
  const level=new Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});
  Object.assign(G,{scene,renderer,camera,settings:{quality:'high'},mode:'match',actors:[],time:0,teamColors:[new THREE.Color('#ff8825'),new THREE.Color('#484ce8')],match:{state:'playing',playing:()=>true},level,paint:{sample:()=>1,splat:()=>0}});
  G.physics=new api.Physics(level);G.projectiles=new api.Projectiles(scene);G.fx=new api.FX(scene,{quality:1});G.fx.setCollider(()=>null);
  const images=[],rows=[];
  for(const id of ids){
   const a=new api.Actor({team:0,name:'trajectory',isLocal:true,weapon:'shooter',CharacterClass:api.Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character;
   G.actors=[a];scene.add(ch.root);a.pos.set(0,0,0);a._probeGround();a.invuln=0;a.aimYaw=0;a.aimPitch=.1;a.yaw=0;a.aimDir.set(0,0,1);a.aimPoint.set(0,1,20);
   if(ch._sourceMotionLoader)await ch._sourceMotionLoader;if(ch.sourceMotion?.ready)await ch.sourceMotion.ready;if(ch.sourceMotion?.status!=='ready')throw Error('Source motion unavailable: '+id);
   const step=()=>{G.time+=1/hz;a.update(1/hz);G.projectiles.update(1/hz);G.fx.update(1/hz,camera);};
   for(let i=0;i<hz;i++)step();a.weapon={...a.weapon,special:id,specialCost:200};a.special=200;a._startSpecial();if(a.specialActive?.id!==id)throw Error('Activation failed: '+id);
   const samples=[];let sampleIndex=1;
   for(let frame=1;frame<=2*hz;frame++){
    const t=frame/hz;a.intent.fire=id==='ultraStamp'&&t>=.5&&t<1.5;step();ch.root.updateMatrixWorld(true);ch.skeleton.update();
    if(frame!==Math.round(sampleIndex*hz/4))continue;
    const nominal=sampleIndex++/4,label=String(Math.round(nominal*1000)).padStart(4,'0');
    if(nominal===.5||nominal===1){
     const device=ch.s3SpecialDevices()?.find(d=>d.model?.id==='spCrabTank');if(!device)throw Error('Crab device unavailable');
     for(const [view,offset] of [['front',[-2.6,1.6,3.2]],['side',[3.4,1.3,0]]]){
      camera.position.copy(a.pos).add(new THREE.Vector3(...offset));camera.lookAt(a.pos.clone().add(new THREE.Vector3(0,.9,0)));
      for(const hidden of [false,true]){G.fx.root.visible=false;device.holder.visible=!hidden;renderer.render(scene,camera);images.push({name:`${id}-${hz}-${label}-${view}${hidden?'-chassis-hidden':''}`,data:renderer.domElement.toDataURL('image/png')});}
     }G.fx.root.visible=true;device.holder.visible=true;
    }
    const bones={};for(const name of ['hips','chest','head','clavL','clavR','thighL','thighR','shinL','shinR','handL','handR','footL','footR'])if(ch.bones[name])bones[name]=ch.bones[name].getWorldPosition(new THREE.Vector3()).sub(a.pos).toArray();
    // Reef slots are the actual black hole geometry, independent of IK target
    // coordinates. The other hole meshes are behind the saddle (z < .1).
    let slotDistances=null;
    if(id==='reefslider'){
     const device=ch.s3SpecialDevices()?.find(d=>d.model?.id==='spReefShark');
     const holes=device?.model.groups.body.children.find(m=>m.userData.s3Finish==='hole');
     if(holes){const boxes=[new THREE.Box3(),new THREE.Box3()],p=new THREE.Vector3(),attr=holes.geometry.attributes.position;
      for(let i=0;i<attr.count;i++){p.fromBufferAttribute(attr,i);if(p.z>.1)boxes[p.x<0?0:1].expandByPoint(p);}
      if(boxes.every(b=>!b.isEmpty()))slotDistances=boxes.map((b,i)=>{const center=holes.localToWorld(b.getCenter(new THREE.Vector3())),hand=ch.bones[i?'handL':'handR'];
       const hole=hand.localToWorld(new THREE.Vector3(i?-.0255:.0255,-.0525,0));
       return {center:center.toArray(),wristDistance:center.distanceTo(hand.getWorldPosition(new THREE.Vector3())),handHoleDistance:center.distanceTo(hole)};});
     }
    }
    // Crab black control-bar midpoints from the authored rod endpoints in
    // model space, transformed by the actual rendered model matrix.
    if(id==='crabTank'){
     const device=ch.s3SpecialDevices()?.find(d=>d.model?.id==='spCrabTank');
     if(device)slotDistances=[[-.225,1.13,.34],[.225,1.13,.34]].map((point,i)=>{
      const center=device.model.root.localToWorld(new THREE.Vector3(...point)),hand=ch.bones[i?'handL':'handR'];
      const hole=hand.localToWorld(new THREE.Vector3(i?-.0255:.0255,-.0525,0));
      return {center:center.toArray(),wristDistance:center.distanceTo(hand.getWorldPosition(new THREE.Vector3())),handHoleDistance:center.distanceTo(hole)};
     });
    }
    samples.push({t,nominal,phase:a.specialActive?.phase||null,position:a.pos.toArray(),velocity:a.vel.toArray(),bones,slotDistances});
   }
   rows.push({id,hz,sourceMotion:ch.sourceMotion.status,samples,directorErrors:G.fx.s3SpecialVfx.errors});
   a.specialActive=null;step();a.reset?.();ch.dispose();scene.remove(ch.root);G.actors=[];G.projectiles.clear();G.fx.clear();
  }
  G.fx.dispose();return {rows,images};
 },{prefix,hz,size,ids});
 for(const image of result.images)fs.writeFileSync(path.join(out,image.name+'.png'),Buffer.from(image.data.split(',')[1],'base64'));delete result.images;
 if(errors.length)throw Error('Browser errors: '+errors.join('; '));
 fs.writeFileSync(path.join(out,'special-trajectory.json'),JSON.stringify({status:'passed',revision:manifest.build.revision,contentHash:manifest.contentHash,browser:browser.version(),seed,driverSHA256:hash(fs.readFileSync(new URL(import.meta.url))),fixture:'real Actor.update, Physics, Projectiles, FX and source-loaded Character on a controlled flat floor; simulation intervals are not device FPS or retail parity',...result,errors},null,2)+'\n');
 console.log(JSON.stringify({status:'passed',out,rows:result.rows.length}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
