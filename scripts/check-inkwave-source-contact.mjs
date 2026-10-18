#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {indexedSoleGeometry,contactPoseSnapshot} from '../patches/local-quality/tests/source-contact-fixture.mjs';
import {catalogInputPath,validateCatalogInputReceipts} from './check-inkwave-motion-catalog.mjs';
const option=(name,fallback)=>{const i=process.argv.indexOf(name);if(i>=0&&process.argv[i+1])return process.argv[i+1];if(fallback!==undefined)return fallback;throw Error('Required '+name);};
const before=fs.realpathSync(option('--before-site')),site=fs.realpathSync(option('--site'));
const output=path.resolve(option('--evidence-dir')),profile=path.resolve(option('--profile-dir')),engine=option('--browser','chromium');
assert.ok(['chromium','webkit'].includes(engine));fs.mkdirSync(output,{recursive:true});fs.mkdirSync(profile,{recursive:true});
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const manifests=[before,site].map(root=>JSON.parse(fs.readFileSync(path.join(root,'inkwave-build.json'))));
const sourceRoot=fileURLToPath(new URL('../',import.meta.url)),git=(...args)=>execFileSync('git',['-C',sourceRoot,...args],{maxBuffer:64*1024*1024});
const sourceHeads=[option('--before-head'),String(git('rev-parse','HEAD')).trim()],blob=(head,file)=>git('cat-file','blob',head+':'+file);
const sourceInputs=manifests.map((m,k)=>{
 const receipts=Object.entries(m.files).map(([key])=>{const file=catalogInputPath(key),committed=blob(sourceHeads[k],file),bytes=k?fs.readFileSync(path.join(sourceRoot,file)):committed;return{key,file,sha256:hash(bytes),committedSHA256:hash(committed),bytes:bytes.length};});
 validateCatalogInputReceipts(m,receipts);assert.equal(m.build.script,hash(blob(sourceHeads[k],'scripts/build-inkwave.mjs')));return receipts;
});
const verifier='scripts/check-inkwave-source-contact.mjs',verifierInputs=Object.fromEntries([verifier,'scripts/check-inkwave-motion-catalog.mjs','patches/local-quality/tests/source-contact-fixture.mjs'].map(file=>{
 const digest=hash(fs.readFileSync(path.join(sourceRoot,file)));assert.equal(digest,hash(blob(sourceHeads[1],file)),'committed verifier identity '+file);return[file,digest];
})),verifierSHA256=verifierInputs[verifier];
for(const [k,root]of [before,site].entries()){
 assert.equal(hash(JSON.stringify(manifests[k].artifacts)),manifests[k].contentHash);
 for(const [file,digest]of Object.entries(manifests[k].artifacts))assert.equal(hash(fs.readFileSync(path.join(root,file))),digest,file);
}
const prefixes=manifests.map((m,k)=>`/${k?'candidate':'baseline'}/_versions/${m.build.revision}/`),errors=[],loaded=[new Set(),new Set()];
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(pathname==='/contact'){
  res.writeHead(200,{'content-type':'text/html'});res.end('<html><head><script type="importmap">'+JSON.stringify({scopes:Object.fromEntries(prefixes.map(p=>[p,{three:p+'vendor/three/build/three.module.js','three/addons/':p+'vendor/three/jsm/'}]))})+'</script></head><body style="margin:0"></body></html>');return;
 }
 const k=pathname.startsWith('/baseline/')?0:pathname.startsWith('/candidate/')?1:-1;if(k<0){res.writeHead(404);res.end();return;}
 const rel=pathname.slice(k?11:10),root=k?site:before,file=path.resolve(root,rel);
 if(!file.startsWith(root+'/')||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 const expected=manifests[k].artifacts[rel];if(!expected){errors.push('Unmanifested request: '+pathname);res.writeHead(404);res.end();return;}
 const bytes=fs.readFileSync(file);assert.equal(hash(bytes),expected);loaded[k].add(rel);
 res.writeHead(200,{'content-type':/\.(m?js)$/.test(file)?'text/javascript':file.endsWith('.json')?'application/json':'application/octet-stream'});res.end(bytes);
});
let browser,result;
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const playwright=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
 const launch=engine==='chromium'?{headless:true,viewport:{width:960,height:720},args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']}
  :{headless:true,viewport:{width:960,height:720},...(process.env.INKWAVE_WEBKIT_EXECUTABLE?{executablePath:process.env.INKWAVE_WEBKIT_EXECUTABLE}:{})};
 browser=await playwright[engine].launchPersistentContext(profile,launch);
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('requestfailed',r=>errors.push('Request failed: '+r.url()));page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+': '+r.url());});
 await page.exposeFunction('saveSourceContact',async(name,data)=>{const file=name+'.png',bytes=Buffer.from(data.split(',')[1],'base64');fs.writeFileSync(path.join(output,file),bytes);return{file,bytes:bytes.length,sha256:hash(bytes)};});
 await page.goto('http://127.0.0.1:'+server.address().port+'/contact');
 await page.addScriptTag({content:'globalThis.indexedSoleGeometry='+indexedSoleGeometry.toString()+';'});
 await page.addScriptTag({content:'globalThis.contactPoseSnapshot='+contactPoseSnapshot.toString()+';'});
 result=await page.evaluate(async({prefixes})=>{
  Math.random=()=>.4;
  const apis=[];
  for(const prefix of prefixes){
   const THREE=await import(prefix+'vendor/three/build/three.module.js'),{install}=await import(prefix+'patches/splatoon3/runtime/install.mjs'),profile=await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json());
   const {Level}=await import(prefix+'src/world/level.js');
   const api={...install(profile),THREE,Level},G=api.G,scene=new THREE.Scene();scene.background=new THREE.Color('#dde4e7');
   Object.assign(G,{scene,settings:{quality:'high',shadows:false},mode:'match',time:0,actors:[],teamColors:[new THREE.Color('#ff8a14'),new THREE.Color('#2f5bff')],paint:{sample:()=>1,splat:()=>0},match:{playing:()=>true,canRespawn:()=>false}});
   G.level=new api.Level({bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10},spawnPads:[[-9,0,0],[9,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-10,-.5,-10],max:[10,0,10]}]});G.physics=new api.Physics(G.level);G.projectiles=new api.Projectiles(scene);
   scene.add(new THREE.HemisphereLight(0xffffff,0x667477,2.2));const light=new THREE.DirectionalLight(0xffffff,2.5);light.position.set(3,5,4);scene.add(light);
   const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(960,720);renderer.setPixelRatio(1);document.body.appendChild(renderer.domElement);G.renderer=renderer;
   const camera=new THREE.OrthographicCamera(-.37,.37,.2775,-.2775,.01,20);camera.position.set(.45,.16,1.2);camera.lookAt(0,.08,0);G.camera=camera;
   const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:0xbfcbd0,roughness:1}));floor.rotation.x=-Math.PI/2;scene.add(floor);
   apis.push({...api,scene,renderer,camera,floor});
  }
  const rows=[],images=[];
  for(const slope of [0,.08,-.08])for(const hz of [30,60,120]){
   const chars=[],actors=[],probes=[{ground:0,ik:0},{ground:0,ik:0}];
   for(let k=0;k<2;k++){
    const api=apis[k],a=new api.Actor({team:0,name:'source contact',weapon:'shooter',isLocal:true,CharacterClass:api.Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character;
    ch.actor=a;a.grounded=a.ground.hit=true;a.ground.block=0;a.pos.set(0,0,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,1,20);api.G.actors.push(a);actors.push(a);
    api.scene.add(ch.root);ch.setLod('hero');ch.onEvent=null;
    await ch._sourceMotionLoader;await ch.sourceMotion.ready;if(ch.sourceMotion.status!=='ready')throw Error('Source bank unavailable');
    const ground=ch._ground,solve=ch._solveLimb;
    ch._ground=function(x,z,n){probes[k].ground++;if(!slope)return ground.call(this,x,z,n);n?.set(-slope,1,-slope*.4).normalize();return slope*x+slope*.4*z;};
    ch._solveLimb=function(...args){probes[k].ik++;return solve.apply(this,args);};
    api.floor.quaternion.setFromUnitVectors(new api.THREE.Vector3(0,0,1),new api.THREE.Vector3(-slope,1,-slope*.4).normalize());chars.push(ch);
   }
   let upperIdentical=true,posesIdentical=true,compared=0;
   const upper=ch=>JSON.stringify({bones:ch.boneList.filter(b=>!['thighL','shinL','footL','toeL','thighR','shinR','footR','toeR'].includes(b.name)).map(b=>[b.name,...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()]),muzzle:ch.getMuzzle(new ch.root.position.constructor()).toArray()});
   for(let frame=0;frame<hz*1.25;frame++){
    for(let k=0;k<2;k++){
     const ch=chars[k],api=apis[k],dt=frame===3?0:frame===5?.1:frame===7?1/144:1/hz;api.G.time+=dt;
     ch.update(dt,{form:'kid',grounded:true,speed:0,localMove:{x:0,z:0},ink:1,hp:1,vy:0});ch.root.updateMatrixWorld(true);ch.skeleton.update();
    }
    upperIdentical&&=upper(chars[0])===upper(chars[1]);
    posesIdentical&&=JSON.stringify(globalThis.contactPoseSnapshot(chars[0]))===JSON.stringify(globalThis.contactPoseSnapshot(chars[1]));compared++;
   }
   const row={slope,hz,upperIdentical,posesIdentical,compared,probes,feet:[],geometry:[]};
   for(let k=0;k<2;k++){
    const ch=chars[k],api=apis[k];
    row.feet.push(ch.sourceMotion.retarget.contacts.map(f=>({locked:f.locked,weight:f.weight,actual:f.actual.toArray(),anchor:f.anchor.toArray(),clearance:f.lastClearance,slip:f.slip,reach:f.reachError})));
    row.geometry.push(globalThis.indexedSoleGeometry(ch,api.THREE,(x,z)=>slope*x+slope*.4*z));
    if(hz===60){api.renderer.render(api.scene,api.camera);images.push(await globalThis.saveSourceContact((k?'after':'before')+'-slope-'+slope,api.renderer.domElement.toDataURL('image/png')));}
   }
   row.movement={frames:0,posesIdentical:true,states:[],displacement:[]};const states=new Set();
   for(let frame=0;frame<36;frame++){
    const dt=frame===3?0:frame===5?.1:frame===7?1/144:1/hz;
    for(let k=0;k<2;k++){
     const a=actors[k],api=apis[k];a.intent.move.set(frame<12?0:frame<24?1:0,0,frame<12?.15:frame<24?0:-1);a.intent.fire=frame>=12&&frame<24;a.intent.jump=frame===24;
     api.G.time+=dt;a.update(dt);a.character.root.updateMatrixWorld(true);a.character.skeleton.update();states.add(a.character.sourceMotion.state);
    }
    row.movement.posesIdentical&&=JSON.stringify(globalThis.contactPoseSnapshot(chars[0]))===JSON.stringify(globalThis.contactPoseSnapshot(chars[1]));row.movement.frames++;
   }
   row.movement.states=[...states];row.movement.displacement=actors.map(a=>a.pos.length());
   for(let k=0;k<2;k++){chars[k].dispose();apis[k].scene.remove(chars[k].root);apis[k].G.actors=[];apis[k].G.projectiles.clear();}
   rows.push(row);
  }
  const gpu=apis.map(({renderer})=>{const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION)};});
  apis.forEach(({renderer})=>renderer.dispose());return{scope:'actual emitted Three.js source-loaded Character, indexed/skinned shoes and WebGL; analytic slopes; no Nintendo/device comparison',rows,images,gpu};
 },{prefixes});
 result.errors=errors;result.browser=engine;result.contentHashes=manifests.map(m=>m.contentHash);result.loaded=loaded.map(s=>[...s]);
 result.sourceBinding={sourceHeads,inputHashes:manifests.map(m=>m.inputHash),verifierSHA256,verifierInputs,sourceInputs};
 for(const row of result.rows){
  assert.deepEqual(row.probes[1],row.probes[0],'terrain/IK calls');assert.equal(row.upperIdentical,true,'upper body/muzzle');assert.equal(row.posesIdentical,true,'native/source poses');
  assert.deepEqual(row.feet[1],row.feet[0],'source contacts');assert.deepEqual(row.geometry[1],row.geometry[0],'actual indexed sole geometry');
  assert.equal(row.movement.frames,36);assert.equal(row.movement.posesIdentical,true,'emitted moving Actor poses');assert.ok(row.movement.displacement.every(d=>d>.01),'real Actor displacement denominator');assert.deepEqual(row.movement.displacement[1],row.movement.displacement[0]);
  for(const f of row.feet[1])assert.ok(Number.isFinite(f.clearance)&&Number.isFinite(f.reach),'finite source support');
  for(const g of row.geometry.flat())assert.ok(g.vertices>20&&Number.isFinite(g.minimum),'indexed shoe denominator');
 }
 assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(result.images.length,6);
 for(let i=0;i<result.images.length;i+=2)assert.equal(result.images[i].sha256,result.images[i+1].sha256,'exact rendered contact pixels');
 for(let k=0;k<2;k++)for(const file of ['src/game/motion/source-controller.js','src/game/motion/retarget.js','src/game/motion/contact-transition.js'])assert.ok(result.loaded[k].some(p=>p.endsWith('/'+file)),file);
 result.status='passed';
}catch(error){result={...result,status:'failed',error:String(error?.stack||error),errors};process.exitCode=1;}
finally{if(browser)await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(output,'source-contact-'+engine+'.json'),JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({status:result.status,error:result.error,rows:result.rows?.length,contentHashes:result.contentHashes,output}));
