#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
// Pure checks are exported so failure cases can be tested without launching Chrome.
export function pixelDifference(a,b){
 if(a.length!==b.length||!a.length||a.length%4)throw Error('Invalid rendered pixel denominator');
 let changedPixels=0,totalRgbDifference=0,maxChannelDifference=0;
 for(let i=0;i<a.length;i+=4){let changed=false;for(let c=0;c<3;c++){const d=Math.abs(a[i+c]-b[i+c]);if(!Number.isFinite(d))throw Error('Non-finite rendered pixel');totalRgbDifference+=d;maxChannelDifference=Math.max(maxChannelDifference,d);changed ||= d>=3;}if(changed)changedPixels++;}
 return {pixels:a.length/4,changedPixels,totalRgbDifference,maxChannelDifference};
}
export function validateWalkingResult(result){
 const finite=(v,label)=>{if(typeof v!=='number'||!Number.isFinite(v))throw Error('Non-finite walking '+label);};
 const vector=(v,label)=>{if(!Array.isArray(v)||v.length!==3)throw Error('Walking vector denominator '+label);v.forEach(x=>finite(x,label));};
 const expected=['slow','walk','run','back','strafe','stop','turn','fire-forward','fire-back','fire-strafe'];
 if(!Array.isArray(result.data)||result.data.length!==expected.length||new Set(result.data.map(r=>r.name)).size!==expected.length||expected.some(n=>!result.data.some(r=>r.name===n)))throw Error('Walking scenario denominator');
 const summary=result.data.map(({name,samples,renderMetrics})=>{
  if(!Array.isArray(samples)||samples.length!==180)throw Error('Walking frame denominator: '+name);
  samples.forEach((s,i)=>{
   if(s.frame!==i||typeof s.moving!=='boolean'||!Array.isArray(s.feet)||s.feet.length!==2)throw Error('Walking frame/foot identity: '+name);
   for(const key of ['time','v','phase','cad','duty','hipDrop','hipY'])finite(s[key],name+'.'+key);
   s.feet.forEach(f=>{if(typeof f.planted!=='boolean')throw Error('Walking contact identity');for(const key of ['mode','su','kneeFlex','solePitch','ankleError','nativeReachError','plantedDrift','pitch'])finite(f[key],name+'.'+key);for(const key of ['cw','actual','knee'])vector(f[key],name+'.'+key);});
  });
  const steady=samples.filter(s=>s.time>=.8),moving=steady.filter(s=>s.moving),contacts=moving.flatMap(s=>s.feet.filter(f=>f.planted));
  const perFoot=[0,1].map(i=>moving.filter(s=>s.feet[i].planted).length);
  if(steady.length<100||moving.length<20||contacts.length<20||perFoot.some(n=>n<8))throw Error('Walking moving/planted denominator: '+name);
  if(steady.filter(s=>s.v>=.3).some(s=>!s.moving))throw Error('Walking input has no gait: '+name);
  const renderFrames=Array.from({length:180},(_,f)=>f).filter(f=>f>=60&&f<108&&f%6===0||name==='stop'&&f>=96&&f<150&&f%9===0);
  if(!Array.isArray(renderMetrics)||renderMetrics.length!==renderFrames.length||new Set(renderMetrics.map(m=>m.frame)).size!==renderFrames.length||renderFrames.some(f=>!renderMetrics.some(m=>m.frame===f)))throw Error('Walking render denominator: '+name);
  for(const m of renderMetrics){for(const key of ['frame','pixels','changedPixels','totalRgbDifference','maxChannelDifference'])finite(m[key],name+'.render.'+key);if(m.pixels!==960*720||m.changedPixels<16)throw Error('Walking rig produced no visible pixels: '+name);}
  const planted=steady.flatMap(s=>s.feet.filter(f=>f.planted));
  const row={name,movingFrames:moving.length,plantedMovingContacts:contacts.length,contactsPerFoot:perFoot,maxAnkleError:Math.max(...planted.map(f=>f.ankleError)),maxPlantedMovingError:Math.max(...contacts.map(f=>f.ankleError)),maxNativeLegReachError:Math.max(...planted.map(f=>f.nativeReachError)),maxHipDrop:Math.max(...steady.map(s=>s.hipDrop)),hipTravel:Math.max(...steady.map(s=>s.hipY))-Math.min(...steady.map(s=>s.hipY)),plantSlide:Math.max(...steady.flatMap(s=>s.feet.map(f=>f.plantedDrift))),catchFrames:steady.filter(s=>s.feet.some(f=>!f.planted&&f.mode===1)).length};
  Object.entries(row).filter(([,v])=>typeof v==='number').forEach(([k,v])=>finite(v,k));
  if(row.plantSlide>1e-8||row.maxHipDrop>.10||row.hipTravel>(name==='run'?.075:.11))throw Error('Motion regression: '+name);
  if(row.maxPlantedMovingError>=.001||row.maxNativeLegReachError>=1e-6)throw Error('Rendered planted ankle regression: '+name);
  return row;
 });return summary;
}
export function validateWalkingReceipts(loaded){
 for(const file of ['patches/splatoon3/runtime/walk.mjs','src/game/character.js'])if(!loaded.some(f=>f.endsWith('/'+file)))throw Error('Actual walking module not loaded: '+file);
}
async function main(){
const option=name=>{const i=process.argv.indexOf(name);if(i<0||!process.argv[i+1])throw Error('Required '+name);return path.resolve(process.argv[i+1]);};
let site=option('--site');const output=option('--evidence-dir'),profileDir=option('--profile-dir');
const physicalLocation=p=>fs.existsSync(p)?fs.realpathSync(p):path.join(physicalLocation(path.dirname(p)),path.basename(p));
for(const dir of [output,profileDir]){const resolved=physicalLocation(dir);if(['/tmp','/var/tmp','/dev/shm'].some(root=>resolved===root||resolved.startsWith(root+'/')))throw Error('Persistent workspace storage required');fs.mkdirSync(dir,{recursive:true});}
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const publish=value=>{fs.writeFileSync(path.join(output,'motion-result.json.writing'),JSON.stringify(value,null,2)+'\n');fs.renameSync(path.join(output,'motion-result.json.writing'),path.join(output,'motion-result.json'));};
let manifest,browser,server,result,failure,page;const errors=[],loaded=[];
const recordError=value=>{if(errors.length<20)errors.push(String(value).slice(0,1500));};
publish({status:'running',gate:'walking',startedAt:new Date().toISOString()});
try{
site=fs.realpathSync(site);manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));const prefix='/_versions/'+manifest.build.revision+'/';
if(hash(JSON.stringify(manifest.artifacts))!==manifest.contentHash)throw Error('Build identity mismatch');
for(const [file,digest]of Object.entries(manifest.artifacts))if(hash(fs.readFileSync(path.join(site,file)))!==digest)throw Error('Artifact mismatch: '+file);
server=http.createServer((req,res)=>{
  if(req.url==='/motion'){res.writeHead(200,{'content-type':'text/html'});res.end(`<html><head><script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script></head><body style="margin:0;background:#e5ebed"></body></html>`);return;}
  const file=path.resolve(site,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(site+'/')||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':file.endsWith('.json')?'application/json':/\.(m?js)$/.test(file)?'text/javascript':'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
browser=await chromium.launchPersistentContext(profileDir,{headless:true,viewport:{width:960,height:720},args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
page=await browser.newPage();page.on('pageerror',error=>recordError(error.message));page.on('console',message=>{if(message.type()==='error')recordError(message.text());});

await page.route('http://127.0.0.1:'+server.address().port+'/**',async route=>{
 try{const response=await route.fetch(),body=await response.body(),key=decodeURIComponent(new URL(response.url()).pathname).slice(1);if(manifest.artifacts[key]){if(hash(body)!==manifest.artifacts[key])throw Error('Active artifact mismatch: '+key);loaded.push(key);}await route.fulfill({response,body});}catch(error){recordError(error.message);await route.abort();}
});
await page.goto('http://127.0.0.1:'+server.address().port+'/motion');
await page.addScriptTag({content:'globalThis.motionPixelDifference = '+pixelDifference.toString()+';'});
result=await page.evaluate(async({prefix,contentHash})=>{
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
 const data=[],images=[];
 const pixels=()=>{const gl=renderer.getContext(),p=new Uint8Array(960*720*4);gl.readPixels(0,0,960,720,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
 try{
 for(const scenario of cases){
  const ch=new Character({name:'Motion fixture',style:{hair:0,skin:2,outfit:0,eyes:0},weapon:'shooter'});scene.add(ch.root);ch.onEvent=null;
  const state={form:'kid',grounded:true,speed:0,localMove:{x:0,z:0},firing:!!scenario.firing,charge:0,ink:1,hp:1,vy:0};
  const samples=[],last=[null,null],renderMetrics=[];
  try{
  for(let i=0;i<90;i++)ch.update(1/60,state);
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
   globalThis.motionProbeProgress={scenario:scenario.name,frame,casesFinished:data.length,feet:feet.map(f=>({planted:f.planted,ankleError:f.ankleError,nativeReachError:f.nativeReachError}))};
   if(frame>=60&&frame<108&&frame%6===0 || scenario.stop&&frame>=96&&frame<150&&frame%9===0){
    camera.position.copy(ch.root.position).add(new THREE.Vector3(2.6,1.3,3.4));camera.lookAt(ch.root.position.clone().add(new THREE.Vector3(0,.62,0)));camera.updateMatrixWorld();renderer.render(scene,camera);
    const drawn=pixels(),image=renderer.domElement.toDataURL('image/png'),visible=ch.root.visible;
    try{ch.root.visible=false;renderer.render(scene,camera);renderMetrics.push({frame,...globalThis.motionPixelDifference(drawn,pixels())});}
    finally{ch.root.visible=visible;renderer.render(scene,camera);}
    images.push({name:scenario.name+'-'+String(frame).padStart(3,'0'),image});
   }
  }
  data.push({name:scenario.name,firing:!!scenario.firing,speed:scenario.v,samples,renderMetrics});
  }finally{scene.remove(ch.root);ch.dispose();}
 }
 return {contentHash,data,images};
 }finally{floor.geometry.dispose();floor.material.dispose();renderer.dispose();renderer.domElement.remove();}
},{prefix,contentHash:manifest.contentHash});
// Preserve completed native samples and pixels before a semantic assertion.
// The bounded failure receipt still stays small, while a failing transition
// retains the actual frames needed to diagnose it instead of a disposed scene.
fs.writeFileSync(path.join(output,'motion-samples.json'),JSON.stringify({contentHash:result.contentHash,data:result.data})+'\n');
for(const entry of result.images)fs.writeFileSync(path.join(output,entry.name+'.png'),Buffer.from(entry.image.split(',')[1],'base64'));delete result.images;
result.summary=validateWalkingResult(result);validateWalkingReceipts(loaded);
if(errors.length)throw Error('Browser walking error: '+errors.join('; '));
}catch(error){failure=error;try{if(page)result={...(result||{}),progress:await page.evaluate(()=>globalThis.motionProbeProgress||null)};}catch{};try{await page?.screenshot({path:path.join(output,'motion-failed.png'),timeout:10000});}catch{}}
finally{for(const cleanup of [()=>browser?.close(),()=>server?.listening?new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())):null])try{await cleanup();}catch(error){failure ||= error;}}
if(failure){publish({status:'failed',contentHash:manifest?.contentHash||null,build:manifest?.build||null,message:String(failure.message||failure).slice(0,2500),errors,loaded:[...new Set(loaded)].slice(0,200),progress:result?.progress||null,casesFinished:result?.data?.length||0});console.error(JSON.stringify({status:'failed',message:String(failure.message||failure).slice(0,1200),evidence:path.join(output,'motion-result.json')}));process.exitCode=1;return;}
Object.assign(result,{status:'passed',errors,build:manifest.build,loaded:[...new Set(loaded)],fixture:{source:'production install once; complete native Character/Three.js/IK',driver:'Character.update with manual root movement and shoot events; no Actor.update or Physics',terrain:'flat diagnostic plane',device:'Chromium software WebGL; not Switch/iOS',pixelCheck:'same-frame rig visible/hidden pixel difference; no Nintendo image-parity claim',scenarios:result.data.length,framesPerScenario:180,hz:60}});publish(result);console.log(JSON.stringify({status:result.status,contentHash:result.contentHash,summary:result.summary,errors}));
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)await main();
