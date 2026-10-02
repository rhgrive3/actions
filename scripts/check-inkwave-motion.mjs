#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
const option=name=>{const i=process.argv.indexOf(name);if(i<0||!process.argv[i+1])throw Error('Required '+name);return path.resolve(process.argv[i+1]);};
const site=fs.realpathSync(option('--site')),output=option('--evidence-dir'),profileDir=option('--profile-dir');
const physicalLocation=p=>fs.existsSync(p)?fs.realpathSync(p):path.join(physicalLocation(path.dirname(p)),path.basename(p));
for(const dir of [output,profileDir]){const resolved=physicalLocation(dir);if(['/tmp','/var/tmp','/dev/shm'].some(root=>resolved===root||resolved.startsWith(root+'/')))throw Error('Persistent workspace storage required');fs.mkdirSync(dir,{recursive:true});}
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))), prefix='/_versions/'+manifest.build.revision+'/';
if(hash(JSON.stringify(manifest.artifacts))!==manifest.contentHash)throw Error('Build identity mismatch');
for(const [file,digest]of Object.entries(manifest.artifacts))if(hash(fs.readFileSync(path.join(site,file)))!==digest)throw Error('Artifact mismatch: '+file);
const server=http.createServer((req,res)=>{
  if(req.url==='/motion'){res.writeHead(200,{'content-type':'text/html'});res.end(`<html><head><script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script></head><body style="margin:0;background:#e5ebed"></body></html>`);return;}
  const file=path.resolve(site,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(site+'/')||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':file.endsWith('.json')?'application/json':/\.(m?js)$/.test(file)?'text/javascript':'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
browser=await chromium.launchPersistentContext(profileDir,{headless:true,viewport:{width:960,height:720},args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage(),errors=[],loaded=[];page.on('pageerror',error=>errors.push(error.message));
await page.route('http://127.0.0.1:'+server.address().port+'/**',async route=>{
 try{const response=await route.fetch(),body=await response.body(),key=decodeURIComponent(new URL(response.url()).pathname).slice(1);if(manifest.artifacts[key]){if(hash(body)!==manifest.artifacts[key])throw Error('Active artifact mismatch: '+key);loaded.push(key);}await route.fulfill({response,body});}catch(error){errors.push(error.message);await route.abort();}
});
await page.goto('http://127.0.0.1:'+server.address().port+'/motion');
const result=await page.evaluate(async({prefix,contentHash})=>{
 const THREE=await import('three'), {G}=await import(prefix+'src/core/ctx.js');
 const profile=await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json());
 const {install}=await import(prefix+'patches/splatoon3/runtime/install.mjs');install(profile);
 const {Character,CHARACTER_FOOT_METRICS}=await import(prefix+'src/game/character.js');
 const scene=new THREE.Scene();scene.background=new THREE.Color('#dfe7e9');
 const camera=new THREE.OrthographicCamera(-1.4,1.4,1.05,-1.05,.01,200);
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(960,720);renderer.setPixelRatio(1);document.body.appendChild(renderer.domElement);
 Object.assign(G,{scene,camera,renderer,settings:{quality:'high',shadows:false},mode:'match',actors:[]});
 scene.add(new THREE.HemisphereLight(0xffffff,0x667477,2.2));const light=new THREE.DirectionalLight(0xffffff,2.5);light.position.set(3,5,4);scene.add(light);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0xbfcbd0,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.004;scene.add(floor);
 const firingSpeed=profile.weapons.shooter.moveSpeedFiring;
 const cases=[{name:'slow',v:.35,d:[0,1]},{name:'walk',v:1.5,d:[0,1]},{name:'run',v:5.76,d:[0,1]},{name:'back',v:4.2,d:[0,-1]},{name:'strafe',v:4.2,d:[1,0]},{name:'stop',v:5.76,d:[0,1],stop:true},{name:'turn',v:4.2,d:[0,1],turn:true},{name:'fire-forward',v:firingSpeed,d:[0,1],firing:true},{name:'fire-back',v:firingSpeed,d:[0,-1],firing:true},{name:'fire-strafe',v:firingSpeed,d:[1,0],firing:true}];
 const data=[], images=[];
 for(const scenario of cases){
  const ch=new Character({name:'Motion fixture',style:{hair:0,skin:2,outfit:0,eyes:0},weapon:'shooter'});scene.add(ch.root);ch.onEvent=null;
  const state={form:'kid',grounded:true,speed:0,localMove:{x:0,z:0},firing:!!scenario.firing,charge:0,ink:1,hp:1,vy:0};
  for(let i=0;i<90;i++)ch.update(1/60,state);
  const samples=[],last=[null,null];
  for(let frame=0;frame<180;frame++){
   const time=frame/60;
   let v=scenario.v*Math.min(1,time/.18),dx=scenario.d[0],dz=scenario.d[1];
   if(scenario.stop&&time>=1.4)v=scenario.v*Math.max(0,1-(time-1.4)/.15);
   if(scenario.turn&&time>=1.4){dx=1;dz=0;}
   ch.root.position.x+=dx*v/60;ch.root.position.z+=dz*v/60;
   state.speed=v;state.localMove.x=-dx;state.localMove.z=dz;G.time+=1/60;
   if(scenario.firing&&frame%Math.round(profile.weapons.shooter.fireInterval*60)===0)ch.trigger('shoot');
   ch.update(1/60,state);ch.root.updateMatrixWorld(true);
   const feet=ch.feet.map((f,i)=>{
    const pitch=f.pitch, {ANKLE_H:h,BALL_Z:ball,HEEL_Z:heel}=CHARACTER_FOOT_METRICS;
    const ay=h*Math.cos(pitch)+(pitch>=0?ball:-heel)*Math.sin(pitch),az=pitch>=0?ball+h*Math.sin(pitch)-ball*Math.cos(pitch):-heel+h*Math.sin(pitch)+heel*Math.cos(pitch);
    const normal=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),f.cn);
    normal.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),f.cyaw));
    const expected=f.cw.clone().add(new THREE.Vector3(0,ay,az).applyQuaternion(normal));
    const actual=ch.bones[i===0?'footL':'footR'].getWorldPosition(new THREE.Vector3());
    const leg=i===0?ch.limbs.legL:ch.limbs.legR,hip=leg.up.getWorldPosition(new THREE.Vector3()),knee=leg.lo.getWorldPosition(new THREE.Vector3());
    const kneeFlex=Math.PI-knee.clone().sub(hip).angleTo(knee.clone().sub(actual));
    const soleForward=new THREE.Vector3(0,0,1).applyQuaternion(leg.end.getWorldQuaternion(new THREE.Quaternion()));
    const plantedDrift=f.planted&&last[i]?.planted?f.cw.distanceTo(last[i].cw):0;
    last[i]={planted:f.planted,cw:f.cw.clone()};
    return {planted:f.planted,mode:f.mode,su:f.su,cw:f.cw.toArray(),actual:actual.toArray(),knee:knee.toArray(),kneeFlex,solePitch:Math.atan2(soleForward.y,Math.hypot(soleForward.x,soleForward.z)),ankleError:actual.distanceTo(expected),nativeReachError:ch.ikErr[i+2],plantedDrift,pitch};
   });
   samples.push({frame,time,v,moving:ch.moving,phase:ch.phase,cad:ch.cad,duty:ch.duty,hipDrop:ch.hipDrop,hipY:ch.bones.hips.position.y,feet});
   if(frame>=60&&frame<108&&frame%6===0 || scenario.stop&&frame>=96&&frame<150&&frame%9===0){
    camera.position.copy(ch.root.position).add(new THREE.Vector3(2.6,1.3,3.4));camera.lookAt(ch.root.position.clone().add(new THREE.Vector3(0,.62,0)));camera.updateMatrixWorld();renderer.render(scene,camera);
    images.push({name:scenario.name+'-'+String(frame).padStart(3,'0'),image:renderer.domElement.toDataURL('image/png')});
   }
  }
  data.push({name:scenario.name,firing:!!scenario.firing,speed:scenario.v,samples});scene.remove(ch.root);ch.dispose();
 }
 const summary=data.map(({name,samples})=>{const steady=samples.filter(s=>s.time>=.8);return {name,maxAnkleError:Math.max(...steady.flatMap(s=>s.feet.filter(f=>f.planted).map(f=>f.ankleError))),maxPlantedMovingError:Math.max(0,...steady.filter(s=>s.moving).flatMap(s=>s.feet.filter(f=>f.planted).map(f=>f.ankleError))),maxNativeLegReachError:Math.max(0,...steady.flatMap(s=>s.feet.filter(f=>f.planted).map(f=>f.nativeReachError))),maxHipDrop:Math.max(...steady.map(s=>s.hipDrop)),hipTravel:Math.max(...steady.map(s=>s.hipY))-Math.min(...steady.map(s=>s.hipY)),plantSlide:Math.max(...steady.flatMap(s=>s.feet.map(f=>f.plantedDrift))),catchFrames:steady.filter(s=>s.feet.some(f=>!f.planted&&f.mode===1)).length};});
 renderer.dispose();return {contentHash,data,summary,images};
},{prefix,contentHash:manifest.contentHash});
for(const entry of result.images)fs.writeFileSync(path.join(output,entry.name+'.png'),Buffer.from(entry.image.split(',')[1],'base64'));delete result.images;
result.errors=errors;result.build=manifest.build;result.loaded=[...new Set(loaded)];result.fixture={source:'complete actual Character rig + actual Three.js renderer; firing uses the real Character recoil events',terrain:'flat plane',device:'Chromium software WebGL; not Switch or iOS',scenarios:result.data.length,framesPerScenario:180,hz:60};fs.writeFileSync(path.join(output,'motion-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({contentHash:result.contentHash,summary:result.summary,errors}));
if(errors.length)throw Error('Browser animation error');
for(const row of result.summary){
 if(row.plantSlide>1e-8||row.maxHipDrop>.10||row.hipTravel>(row.name==='run'?.075:.11))throw Error('Motion regression: '+row.name);
 if(row.maxPlantedMovingError>=.001||row.maxNativeLegReachError>=1e-6)throw Error('Rendered planted ankle regression: '+row.name);
}
if(!loaded.some(file=>file.endsWith('/patches/splatoon3/runtime/walk.mjs'))||!loaded.some(file=>file.endsWith('/src/game/character.js')))throw Error('Actual walking modules were not loaded');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
