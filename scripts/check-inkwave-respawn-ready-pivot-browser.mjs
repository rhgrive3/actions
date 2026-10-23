#!/usr/bin/env node
// Bounded native Game pose/camera diagnostic. No runtime/model edits or overlays.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {rangeMenuControlReady} from './lib/inkwave-range-menu-entry.mjs';
const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
assert(!fs.existsSync(out),'Preserve previous evidence');fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const file=path.resolve(site,'.'+new URL(req.url,'http://local').pathname.replace(/\/$/,'/index.html'));if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser,page;const reads=[],receipt={site,scriptSha256:createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex'),normalOnly:process.argv.includes('--normal-only'),build:JSON.parse(fs.readFileSync(site+'/inkwave-build.json')).contentHash,scope:'real offline Game at fixed 60Hz, normal production versioned site; controlled lower dry floor only in missed-support case; no runtime/model/geometry edits, overlays, FPS or transport claim',errors:[],rows:[],runtimeResponses:[]};
const save=()=>fs.writeFileSync(out+'/receipt.json',JSON.stringify(receipt,null,2)+'\n');
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 page=await browser.newPage({viewport:{width:1000,height:760},deviceScaleFactor:1});page.on('pageerror',e=>receipt.errors.push(e.message));
 page.on('response',r=>{const url=new URL(r.url());if(/\/patches\/splatoon3\/runtime\/(?:roller|spawn-pose-motion|roller-detail-motion|respawn-lifecycle)\.mjs$/.test(url.pathname))reads.push(r.body().then(b=>receipt.runtimeResponses.push({path:url.pathname,status:r.status(),sha256:createHash('sha256').update(b).digest('hex')})));});
 await page.addInitScript(()=>{localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',lang:'ja',lastStage:'tidewater',lastMode:'turf'}));localStorage.setItem('inkwave.profile',JSON.stringify({name:'Player',weapon:'roller',style:{hair:0,hat:0,skin:2,outfit:0,eyes:0}}));let rng=0x52455350;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};});
 await page.goto('http://127.0.0.1:'+server.address().port+'/?skipTitle');
 for(const[id,menu]of [['play','main'],['mode-turf','mode']]){const selector='.iw-ui [data-id="'+id+'"]';await page.waitForFunction(rangeMenuControlReady,{selector,menu},{timeout:240000});const b=await page.locator(selector).boundingBox();assert(b);await page.mouse.click(b.x+b.width/2,b.y+b.height/2);console.log('menu',id);}
 await page.waitForFunction(rangeMenuControlReady,{selector:'.iw-ui [data-id="start"]',menu:'setup'},{timeout:240000});
 await page.evaluate(()=>{window.__inkwave.debug.freeze();window.__G.time=0;let rng=0x52455350;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};});
 const b=await page.locator('.iw-ui [data-id="start"]').boundingBox();assert(b);await page.mouse.click(b.x+b.width/2,b.y+b.height/2);
 await page.waitForFunction(()=>window.__G?.match&&!window.__G.match.attract&&window.__G.mode==='match',{timeout:240000});console.log('native match created');
 await page.evaluate(async()=>{
  const G=window.__G,g=window.__inkwave,a=G.local,c=a.character;g.debug.freeze();g.debug.freezeBots();await c._sourceMotionLoader;await c.sourceMotion.ready;
  const THREE=await import('three'),{CHARACTER_CHANNELS:C,CHARACTER_TIMERS:T}=await import(new URL('src/game/character.js',document.baseURI).href),{spawnPoseSnapshot,spawnMotionAllowsAction}=await import(new URL('patches/splatoon3/runtime/spawn-pose-motion.mjs',document.baseURI).href);
  g.input.mouse.left=false;g.input.mouse.right=false;g.input.keys.clear();g.input.pressed.clear();
  const diag=globalThis.__readyDiag={tick:0,capture:false,layers:{},saved:new Map(),missRows:[],shotCount:0,paintCalls:0,lowerFloor:null};
  for(const name of ['_poseWeapon','_poseSpawn','_poseLand']){
   const native=c[name];c[name]=function(x,y){const before=diag.capture?Array.from(this.P):null;const result=native.call(this,x,y);if(diag.capture)diag.layers[name]={before,after:Array.from(this.P)};return result;};
  }
  for(const name of ['fireFlick','fireShooter','fireCharger','fireSplatling','fireSlosh']){const native=G.projectiles[name];G.projectiles[name]=function(...args){if(args[0]===a)diag.shotCount++;return native.apply(this,args);};}
  const splat=G.paint.splat;G.paint.splat=function(...args){diag.paintCalls++;return splat.apply(this,args);};
  const step=globalThis.__readyStep=(capture=false)=>{diag.capture=capture;if(capture)diag.layers={};g._skipRender=true;g._frame(1/60);diag.tick++;diag.capture=false;};
  const matrix=o=>{const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();o.matrixWorld.decompose(p,q,s);return {localPosition:o.position.toArray(),localQuaternion:o.quaternion.toArray(),localScale:o.scale.toArray(),position:p.toArray(),quaternion:q.toArray(),scale:s.toArray(),matrixWorld:o.matrixWorld.toArray()};};
  const project=(points,cameraRelative,projection)=>{const m=new THREE.Matrix4().fromArray(projection).multiply(new THREE.Matrix4().fromArray(cameraRelative).invert()),v=new THREE.Vector3(),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const p of points){v.fromArray(p).applyMatrix4(m);for(let i=0;i<3;i++){const n=v.getComponent(i);min[i]=Math.min(min[i],n);max[i]=Math.max(max[i],n);}}return {min,max,pixelWidth:(max[0]-min[0])*500,pixelHeight:(max[1]-min[1])*380};};
  const basic=globalThis.__readyBasic=()=>({tick:diag.tick,position:a.pos.toArray(),velocity:a.vel.toArray(),alive:a.alive,grounded:a.grounded,groundHit:a.ground.hit,phase:a.s3.squidSpawn?.phase??null,spawnTime:c.tr[T.T_SPAWN],spawnPose:spawnPoseSnapshot(c),eligible:typeof spawnMotionAllowsAction==='function'?spawnMotionAllowsAction(c,c.tr[T.T_SPAWN]>=1.4):c.tr[T.T_SPAWN]>=1.4,ink:a.ink,turf:a.stats.turf,rolling:a.weaponRunner.rolling,flick:a.weaponRunner.flick,fire:a.intent.fire,physical:g.input.mouse.left,previous:a._prevIntent.fire,shotCount:diag.shotCount,paintCalls:diag.paintCalls,projectiles:G.projectiles.list.filter(p=>p.owner===a).length});
  globalThis.__readySnapshot=label=>{
   g._skipRender=false;g.R.render();G.renderer.getContext().finish();c.root.updateMatrixWorld(true);G.camera.updateMatrixWorld(true);
   const w=c.weapon,invRoot=c.root.matrixWorld.clone().invert(),invDrum=w.drum.matrixWorld.clone().invert(),worldBox=new THREE.Box3(),localBox=new THREE.Box3(),rootPoints=[],v=new THREE.Vector3(),geometry=[];
   w.drum.traverseVisible(mesh=>{const pos=mesh.geometry?.attributes?.position;if(!pos)return;geometry.push({name:mesh.name,vertices:pos.count,indices:mesh.geometry.index?.count??0});for(let i=0;i<pos.count;i++){mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);worldBox.expandByPoint(v);rootPoints.push(v.clone().applyMatrix4(invRoot).toArray());v.applyMatrix4(invDrum);localBox.expandByPoint(v);}});
   const cameraRelative=new THREE.Matrix4().multiplyMatrices(invRoot,G.camera.matrixWorld).toArray(),projection=G.camera.projectionMatrix.toArray(),pivotRoot=new THREE.Matrix4().multiplyMatrices(invRoot,w.pivot.matrixWorld),drumRoot=new THREE.Matrix4().multiplyMatrices(invRoot,w.drum.matrixWorld);
   diag.saved.set(label,{rootPoints,cameraRelative,projection});
   const channels={};for(const[name,index]of Object.entries(C)){const size=['HIPS_P','HIPS','SPINE','CHEST','NECK','HEAD','CLAVL','CLAVR','UARML','UARMR','FARML','FARMR','HANDL','HANDR','FOOTL','FOOTLR','FOOTR','FOOTRR','ANC','ANCR','ANL','ANLR','POLER','POLEL','LTGT','LTGTR','KNEEL','KNEER','MODEL','MODELR'].includes(name)?3:1;channels[name]=Array.from(c.P.slice(index,index+size));}
   return {label,...basic(),seed:c.seed,palette:G.teamColors.map(x=>x.getHexString()),channels,pose:Array.from(c.P),layers:structuredClone(diag.layers),body:{form:c.form,formPrev:c.formPrev,formT:c.formT,kidScale:c.kidScale,kidSY:c.kidSY,kidSXZ:c.kidSXZ,kidLift:c.kidLift,wAir:c.wAir,wAim:c.wAim,wRoll:c.wRoll,wSub:c.wSub,vyS:c.vyS,sourceState:c.sourceMotion.state,sourceUpper:c.sourceMotion.sourceUpper,sourceClips:c.sourceMotion.debug?.clips},root:matrix(c.root),kid:matrix(c.kid),chest:matrix(c.bones.chest),handR:matrix(c.bones.handR),pivot:matrix(w.pivot),off:matrix(w.off),drum:matrix(w.drum),pivotRootMatrix:pivotRoot.toArray(),drumRootMatrix:drumRoot.toArray(),geometry,localDrumBounds:{min:localBox.min.toArray(),max:localBox.max.toArray(),size:localBox.getSize(new THREE.Vector3()).toArray()},worldDrumBounds:{min:worldBox.min.toArray(),max:worldBox.max.toArray(),size:worldBox.getSize(new THREE.Vector3()).toArray()},projectedDrum:project(rootPoints,cameraRelative,projection),camera:{...matrix(G.camera),fov:G.camera.fov,zoom:G.camera.zoom,near:G.camera.near,far:G.camera.far,relativeMatrix:cameraRelative,projection}};
  };
  globalThis.__readyCameraCross=()=>{const names=['settled','normal-61','normal-145'],rows=[];for(const pose of names)for(const camera of names){const p=diag.saved.get(pose),v=diag.saved.get(camera);rows.push({pose,camera,projected:project(p.rootPoints,v.cameraRelative,v.projection)});}return rows;};
  for(let i=0;i<900&&(G.match.state!=='playing'||a.s3.squidSpawn);i++)step();if(a.s3.squidSpawn||G.match.state!=='playing')throw Error('Opening spawn did not finish');
  for(let i=0;i<100;i++)step(i===99);
  globalThis.__readyResetRng=seed=>{let rng=seed;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};};
 });
 const capture=async(label,png=true)=>{const row=await page.evaluate(label=>__readySnapshot(label),label);receipt.rows.push(row);if(png)await page.screenshot({path:out+'/'+label+'.png',timeout:30000});save();console.log(label,JSON.stringify({phase:row.phase,grounded:row.grounded,eligible:row.eligible,pivot:row.pivot.quaternion,worldSize:row.worldDrumBounds.size,pixels:[row.projectedDrum.pixelWidth,row.projectedDrum.pixelHeight]}));};
 await capture('settled');
 const launch=async seed=>page.evaluate(seed=>{const a=window.__G.local;window.__readyResetRng(seed);a.splat(null,'weapon');for(let i=0;i<900&&!a.alive;i++)__readyStep();if(a.s3.squidSpawn?.phase!=='aim')throw Error('Native countdown did not respawn');__readyStep();window.__inkwave.debug.fire(true);__readyStep();window.__inkwave.debug.fire(false);if(a.s3.squidSpawn?.phase!=='flight')throw Error('Native launch failed');__readyDiag.flightTick=0;},seed);
 await launch(0x4c414e44);
 for(const target of [59,60,61,62,133,134,145]){await page.evaluate(target=>{for(;__readyDiag.flightTick<target;__readyDiag.flightTick++)__readyStep(__readyDiag.flightTick===target-1);},target);await capture('normal-'+target,[61,145].includes(target));}
 receipt.cameraCross=await page.evaluate(()=>__readyCameraCross());
 if (!process.argv.includes('--normal-only')) {
 await launch(0x4d495353);
 receipt.lowerFloor=await page.evaluate(async()=>{
  const G=window.__G,a=G.local,{Level}=await import(new URL('src/world/level.js',document.baseURI).href),{Physics}=await import(new URL('src/game/physics.js',document.baseURI).href),old=G.level,y=a.s3.squidSpawn.to.y-8;
  // Controlled support-loss fixture: keep the real Game/Actor/renderer and
  // existing visual stage; replace only native collision support, not results.
  const level=new Level({bounds:{...old.bounds},spawnPads:old.spawnPads.map(p=>p.toArray()),spawnBarrier:old.spawnBarrier,half:[],single:[{kind:'box',min:[old.bounds.minX,y-.5,old.bounds.minZ],max:[old.bounds.maxX,y,old.bounds.maxZ]}]});
  G.level=level;G.physics=new Physics(level);__readyDiag.lowerFloor=y;return {y,visualStageRetained:true,physics:'real emitted Level and Physics with an actual lower dry floor'};
 });
 await page.evaluate(()=>{const a=window.__G.local;for(let i=0;i<180;i++){__readyStep(true);__readyDiag.missRows.push(__readyBasic());if(a.s3.squidSpawn?.phase==='landing'&&!a.grounded&&__readyBasic().spawnPose?.phase==='off')break;}if(a.s3.squidSpawn?.phase!=='landing'||a.grounded||__readyBasic().spawnPose?.phase!=='off')throw Error('Missed support did not outlive calibrated overlay');});
 await capture('miss-air');
 await page.evaluate(()=>{const a=window.__G.local;for(let i=0;i<180&&a.s3.squidSpawn;i++){__readyStep(true);__readyDiag.missRows.push(__readyBasic());}if(a.s3.squidSpawn||!a.grounded||!a.ground.hit)throw Error('Lower dry floor failed supported touchdown');});
 await capture('miss-touchdown',false);await page.evaluate(()=>__readyStep(true));await capture('miss-post');
 receipt.missTrace=await page.evaluate(()=>__readyDiag.missRows);
 }
 assert.equal(receipt.errors.length,0,JSON.stringify(receipt.errors));receipt.status='captured';
}catch(error){receipt.status='failed';receipt.error=error.stack;await page?.screenshot({path:out+'/failure.png',timeout:10000}).catch(()=>{});throw error;}
finally{await Promise.all(reads);save();await browser?.close();await new Promise(r=>server.close(r));}
