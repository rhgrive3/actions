// Native Game/Range entry, then shipped deterministic debug input/60 Hz steps.
// The inspection camera changes only the evidence view. No replacement floor,
// shader, Character, Physics, paint or controller is installed.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { enterRangeFromMenu } from './lib/inkwave-range-menu-entry.mjs';
const site=path.resolve(process.argv[2]||'_site'), out=path.resolve(process.argv[3]||'.browser-evidence/roller-scale/range');
// Fixed inspection views are authored once from the baseline and reused verbatim.
// BEGIN GRIP CAMERA CONTRACT
function validateGripCameras(plan) {
  const names=['rear','side','front-oblique'];
  if(plan?.schema!==1||!Array.isArray(plan.views)||plan.views.length!==3)throw Error('Invalid grip camera plan');
  for(let i=0;i<names.length;i++){
    const v=plan.views[i],vec=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
    if(v.name!==names[i]||!vec(v.position)||!vec(v.target)||v.fov!==45||v.aspect!==1280/840||v.near!==.1||v.far!==100||
       Math.hypot(...v.position.map((n,j)=>n-v.target[j]))<.1)throw Error('Invalid fixed grip view: '+names[i]);
  }
  return plan;
}
function makeGripCameras(anchor){
  if(!Array.isArray(anchor)||anchor.length!==3||!anchor.every(Number.isFinite))throw Error('Invalid baseline camera anchor');
  const views=[['rear',[0,2,-5]],['side',[5,2,0]],['front-oblique',[3,2,4]]].map(([name,offset])=>({
    name,position:offset.map((n,i)=>n+anchor[i]),target:anchor.map((n,i)=>n+[0,.8,.5][i]),fov:45,aspect:1280/840,near:.1,far:100}));
  return validateGripCameras({schema:1,views});
}
// END GRIP CAMERA CONTRACT
const seedIndex=process.argv.indexOf('--grip-seed');
const gripSeed=seedIndex<0?null:Number(process.argv[seedIndex+1]);
if(seedIndex>=0&&(!/^\d+$/.test(process.argv[seedIndex+1]||'')||!Number.isInteger(gripSeed)||gripSeed<0||gripSeed>0xffffffff))throw Error('Invalid grip seed: expected uint32');
const cameraIndex=process.argv.indexOf('--grip-camera-reference');
if(cameraIndex>=0&&!process.argv[cameraIndex+1])throw Error('Missing grip camera reference');
const cameraReference=cameraIndex<0?null:validateGripCameras(JSON.parse(fs.readFileSync(process.argv[cameraIndex+1],'utf8')));
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json',
  '.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.css':'text/css','.mp3':'audio/mpeg','.woff2':'font/woff2'};
const server=http.createServer((q,r)=>{
  const u=new URL(q.url,'http://localhost'), file=path.resolve(site,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
  if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){r.writeHead(404);r.end();return;}
  r.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(r);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser,page,diagnosticTimer;
const receipt={build:JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))).contentHash,errors:[],requests:[],console:[]};
const snapshot=async()=>page?.evaluate(()=>({mode:window.__G?.mode,match:window.__G?.match?.state,
  menu:window.__inkwave?.menus?.current,layout:window.__G?.level?.layout?.id,
  range:!!window.__G?.match?.range,text:document.body.innerText.slice(-1800)})).catch(()=>null);
try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',
    ...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}}:{}),
    args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  page=await browser.newPage({viewport:{width:1280,height:840}});
  page.on('pageerror',e=>receipt.errors.push(e.message));
  page.on('requestfailed',r=>{if(receipt.requests.length<30)receipt.requests.push({url:r.url(),failure:r.failure()});});
  page.on('response',r=>{if(r.status()>=400&&receipt.requests.length<30)receipt.requests.push({url:r.url(),status:r.status()});});
  page.on('console',m=>{if(['error','warning'].includes(m.type())&&receipt.console.length<30)receipt.console.push(m.text().slice(0,1500));});
  diagnosticTimer=setInterval(async()=>{receipt.state=await snapshot();fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(receipt,null,2));},15000);
  await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',lang:'ja'})));
  receipt.entry=await enterRangeFromMenu(page,'http://127.0.0.1:'+server.address().port,{timeout:240000,
    onProgress:r=>{receipt.entry=r;fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(receipt,null,2));}});
  console.log('Native Range ready');
  receipt.measurement=await page.evaluate(async({cameraReference,gripSeed})=>{
    const G=window.__G,g=window.__inkwave,a=G.local;
    const {Vector3,OrthographicCamera,PerspectiveCamera}=await import('three');
    g.debug.freeze();G.match.range.setWeapon('roller');
    await G.audio?.prepareWeapon?.('roller',{urgent:true});
    await a.character.sourceMotion.ready;
    G.match.range.travel('roller');
    a.pos.set(-26.5,.04,4);a.vel.set(0,0,0);a.yaw=a.aimYaw=0;g.rig.yaw=0;g.rig.pitch=-.3;
    g.input.keys.clear();g.debug.key('KeyW',true);g.debug.fire(true);
    // BEGIN SCOPED ROLL RNG CONTRACT
    // Opt-in QA randomness only. Default capture leaves the game's RNG untouched.
    // No await occurs until both shipped 90-tick batches finish and RNG is restored.
    const originalRandom=Math.random,originalSplat=G.paint.splat;
    const recipeRandom={mode:gripSeed===null?'unseeded':'seeded-synchronous-180-tick',
      algorithm:gripSeed===null?null:'mulberry32-u32-v1',seed:gripSeed,draws:0,restored:false,contactSeeds:[]};
    let word=gripSeed,recipePhase='settle',recipeMeasurement;
    if(gripSeed!==null)Math.random=()=>{
      recipeRandom.draws++;
      let t=word=(word+0x6D2B79F5)|0;
      t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
      return ((t^(t>>>14))>>>0)/4294967296;
    };
    G.paint.splat=function(at,r,team,o){
      const contact=o?.footprint==='ink-contact'?{order:recipeRandom.contactSeeds.length,
        phase:recipePhase,seed:o.seed,face:o.face??null,kind:o.kind??null,completed:false}:null;
      if(contact)recipeRandom.contactSeeds.push(contact);
      const result=originalSplat.call(this,at,r,team,o);
      if(contact){contact.completed=true;contact.returnedClaimedArea=result;}
      return result;
    };
    try{
    // Batch the shipped 60 Hz debug steps: simulate every tick and draw once,
    // instead of forcing ninety unnecessary full-world software renders.
    a.ink=100;g.debug.step(1500);
    if(!a.weaponRunner.rolling)throw Error('Native controller did not enter rolling');
    G.paint.clear();G.projectiles.clear();
    recipePhase='measurement';
    const start=a.pos.clone(), events=[],splat=G.paint.splat;
    G.paint.splat=function(at,r,team,o){if(o?.footprint==='ink-contact')events.push({at:at.toArray(),r,heading:o.stretch?.toArray(),amount:o.stretchAmt});return splat.call(this,at,r,team,o);};
    try{a.ink=100;g.debug.step(1500);}
    finally{G.paint.splat=splat;g.debug.fire(false);g.debug.key('KeyW',false);}
    recipeMeasurement={start,events};
    }finally{
      Math.random=originalRandom;G.paint.splat=originalSplat;
      recipeRandom.restored=Math.random===originalRandom&&G.paint.splat===originalSplat;
      g.debug.fire(false);g.debug.key('KeyW',false);
    }
    const {start,events}=recipeMeasurement;
    // END SCOPED ROLL RNG CONTRACT
    const gameplayPng=G.renderer.domElement.toDataURL('image/png').split(',')[1];
    G.paint.flush(0);
    const f=G.level.faces[a.ground.face],atlas=f.atlas;
    if(!atlas)throw Error('Native roller court has no paint atlas');
    const pixels=new Uint8Array(G.paint.size**2*4);
    G.renderer.readRenderTargetPixels(G.paint.rt,0,0,G.paint.size,G.paint.size,pixels);
    // BEGIN GPU FOOTPRINT CONTRACT
    // Hash the already-read full GPU atlas, not CPU owners or team RGB.
    // Use the same alpha admission boundary as the existing width/hole probes.
    const gpuMask=new Uint8Array(G.paint.size**2);
    let occupiedPixels=0;
    for(let i=0;i<gpuMask.length;i++)occupiedPixels+=(gpuMask[i]=pixels[4*i+3]>=128?1:0);
    const gpuDigest=await globalThis.crypto.subtle.digest('SHA-256',gpuMask);
    const gpuFootprint={schema:1,width:G.paint.size,height:G.paint.size,alphaThreshold:128,
      encoding:'uint8-row-major-0-or-1',algorithm:'SHA-256',occupiedPixels,
      sha256:Array.from(new Uint8Array(gpuDigest),b=>b.toString(16).padStart(2,'0')).join('')};
    // END GPU FOOTPRINT CONTRACT
    const p=new Vector3(),sample=(x,z)=>{
      p.set(x,f.origin.y,z).sub(f.origin);
      const u=p.dot(f.u),v=p.dot(f.v);
      const col=Math.floor(atlas.x+atlas.pad+u*atlas.ppm),row=Math.floor(atlas.y+atlas.pad+v*atlas.ppm);
      return pixels[4*(row*G.paint.size+col)+3];
    };
    let holes=0,rows=0;const widths=[];
    for(let z=start.z+1;z<a.pos.z-.5;z+=.1){
      rows++;if(sample(a.pos.x,z)<128)holes++;
      let lo=Infinity,hi=-Infinity;
      for(let x=a.pos.x-4;x<=a.pos.x+4;x+=.025)if(sample(x,z)>=128){lo=Math.min(lo,x);hi=Math.max(hi,x);}
      if(hi>=lo)widths.push(hi-lo);
    }
    a.character.root.updateMatrixWorld(true);
    const w=a.character.weapon,box=w.def.drum.boundingBox;
    const centre=w.drum.localToWorld(box.min.clone().add(box.max).multiplyScalar(.5));
    const event=events.at(-1),front=new Vector3(...event.at).addScaledVector(new Vector3(...event.heading),.6*event.r*(1+event.amount));
    const m=w.drum.matrixWorld.elements,drumWidth=(box.max.x-box.min.x)*Math.hypot(m[0],m[2]);
    const halfHeight=7.5,halfWidth=halfHeight*G.renderer.domElement.width/G.renderer.domElement.height;
    const view=new OrthographicCamera(-halfWidth,halfWidth,halfHeight,-halfHeight,.1,100),cz=a.pos.z-3;
    view.up.set(0,0,1);view.position.set(a.pos.x,30,cz);view.lookAt(a.pos.x,0,cz);
    G.renderer.setRenderTarget(null);G.renderer.render(G.scene,view);
    G.renderer.domElement.id='roller-scale-canvas';
    const inspectionPng=G.renderer.domElement.toDataURL('image/png').split(',')[1];
    const anchor=a.pos.toArray();
    const cameraPlan=cameraReference||{schema:1,views:[['rear',[0,2,-5]],['side',[5,2,0]],['front-oblique',[3,2,4]]].map(([name,offset])=>({
      name,position:offset.map((n,i)=>n+anchor[i]),target:anchor.map((n,i)=>n+[0,.8,.5][i]),fov:45,aspect:1280/840,near:.1,far:100}))};
    const state=()=>JSON.stringify({time:G.time,pos:a.pos.toArray(),yaw:a.yaw,rolling:a.weaponRunner.rolling,phase:a.character.phase,pose:Array.from(a.character.P)});
    const frozen=state(),gripViews=[];
    const renderSize={width:G.renderer.domElement.width,height:G.renderer.domElement.height};
    const renderAspect=renderSize.width/renderSize.height;
    if(!Number.isInteger(renderSize.width)||!Number.isInteger(renderSize.height)||renderSize.width<=0||renderSize.height<=0)throw Error('Invalid renderer dimensions');
    for(const spec of cameraPlan.views){
      if(Math.abs(renderAspect-spec.aspect)>1e-10)throw Error('Renderer aspect differs from fixed grip camera');
      const camera=new PerspectiveCamera(spec.fov,spec.aspect,spec.near,spec.far);
      camera.position.fromArray(spec.position);camera.up.set(0,1,0);camera.lookAt(new Vector3(...spec.target));camera.updateMatrixWorld(true);
      G.renderer.render(G.scene,camera);
      if(state()!==frozen)throw Error('Grip inspection advanced or changed simulation');
      gripViews.push({name:spec.name,position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),projection:camera.projectionMatrix.toArray(),
        png:G.renderer.domElement.toDataURL('image/png').split(',')[1]});
    }
    // Preserve the original final overhead canvas and its range.png contract.
    G.renderer.render(G.scene,view);
    if(state()!==frozen)throw Error('Restoring inspection changed simulation');
    return {layout:G.level.layout.id,start:start.toArray(),end:a.pos.toArray(),face:f.id,
      floorTag:G.level.blocks[f.block].tag,drumWidth,paintHalf:event.r,contactDepth:1.2*event.r*(1+event.amount),
      gpuMinWidth:Math.min(...widths),gpuMaxWidth:Math.max(...widths),rows,holes,gpuFootprint,recipeRandom,
      contactError:Math.hypot(centre.x-front.x,centre.z-front.z),events:events.length,
      debugFixedTicks:180,controller:'shipped KeyW + held fire',inspectionCameraOnly:true,
      gameplayPng,inspectionPng,cameraPlan,gripViews,renderSize,renderAspect,frozenState:JSON.parse(frozen),gripCameraReference:!!cameraReference};
  },{cameraReference,gripSeed});
  validateGripCameras(receipt.measurement.cameraPlan);
  assert.deepEqual(receipt.measurement.cameraPlan,cameraReference||makeGripCameras(receipt.measurement.end));
  fs.writeFileSync(path.join(out,'grip-cameras.json'),JSON.stringify(receipt.measurement.cameraPlan,null,2)+'\n');
  for(const view of receipt.measurement.gripViews){
    fs.writeFileSync(path.join(out,'grip-'+view.name+'.png'),Buffer.from(view.png,'base64'));delete view.png;
  }
  for(const [key,name] of [['gameplayPng','gameplay.png'],['inspectionPng','scene.png']]){
    fs.writeFileSync(path.join(out,name),Buffer.from(receipt.measurement[key],'base64'));delete receipt.measurement[key];
  }
  await page.locator('#roller-scale-canvas').screenshot({path:path.join(out,'range.png'),timeout:60000});
  const m=receipt.measurement;
  assert.equal(m.layout,'range');assert.equal(m.floorTag,'floor:roller');
  assert.equal(m.holes,0);assert.ok(m.rows>40);assert.ok(m.contactError<1e-5);
  assert.ok(Math.abs(m.drumWidth-2.5712)<1e-4);assert.ok(Math.abs(m.paintHalf-2.8*0.8103533592449264)<1e-10);
  assert.ok(Math.abs(m.contactDepth-1.5)<1e-10);
  assert.ok(m.gpuMaxWidth>4.3&&m.gpuMaxWidth<4.8);
  assert.equal(receipt.errors.length,0);
  // Persist the complete steady comparison before any release simulation.
  fs.writeFileSync(path.join(out,'steady-result.json'),JSON.stringify({...receipt,passed:true},null,2)+'\n');
  receipt.release=await page.evaluate(async({side,expectedState})=>{
    const {Vector3,PerspectiveCamera}=await import('three');
    // BEGIN RELEASE CAMERA CONTRACT
    const G=window.__G,g=window.__inkwave,a=G.local;
    const state=()=>({time:G.time,pos:a.pos.toArray(),yaw:a.yaw,rolling:a.weaponRunner.rolling,
      phase:a.character.phase,pose:Array.from(a.character.P)});
    if(JSON.stringify(state())!==JSON.stringify(expectedState))throw Error('Steady state changed before release capture');
    const hands=()=>({right:a.character.bones.handR.getWorldPosition(new Vector3()).toArray(),
      left:a.character.bones.handL.getWorldPosition(new Vector3()).toArray()});
    const camera=new PerspectiveCamera(side.fov,side.aspect,side.near,side.far);
    camera.position.fromArray(side.position);camera.up.set(0,1,0);camera.lookAt(new Vector3(...side.target));camera.updateMatrixWorld(true);
    const actualCamera={name:'side',position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),projection:camera.projectionMatrix.toArray()};
    const start={...state(),hands:hands()},frames=[];let previousTick=0;
    // Continue walking as in the numerical release trace; do not reset any pose.
    g.debug.fire(false);g.debug.key('KeyW',true);
    try{for(const tick of [1,4,12]){
      g.debug.step((tick-previousTick)*1000/60);previousTick=tick;
      a.character.root.updateMatrixWorld(true);
      const frame={tick,...state(),hands:hands()},frozen=JSON.stringify(state());
      G.renderer.setRenderTarget(null);G.renderer.render(G.scene,camera);
      if(JSON.stringify(state())!==frozen)throw Error('Release inspection changed simulation');
      frame.png=G.renderer.domElement.toDataURL('image/png').split(',')[1];frames.push(frame);
    }}finally{g.debug.fire(false);g.debug.key('KeyW',false);}
    return {schema:1,controller:'shipped fire released + KeyW held',start,frames,cameraSpec:side,actualCamera,
      renderSize:{width:G.renderer.domElement.width,height:G.renderer.domElement.height}};
    // END RELEASE CAMERA CONTRACT
  },{side:m.cameraPlan.views.find(v=>v.name==='side'),expectedState:m.frozenState});
  for(const frame of receipt.release.frames){
    fs.writeFileSync(path.join(out,'release-side-'+frame.tick+'.png'),Buffer.from(frame.png,'base64'));delete frame.png;
  }
  assert.deepEqual(receipt.release.frames.map(f=>f.tick),[1,4,12]);
  assert.deepEqual(receipt.release.actualCamera,m.gripViews.find(v=>v.name==='side'));
  assert.deepEqual(receipt.release.renderSize,m.renderSize);
  for(const frame of receipt.release.frames)assert.ok(Math.abs(frame.time-receipt.release.start.time-frame.tick/60)<1e-8);
  assert.equal(receipt.errors.length,0);
  receipt.passed=true;console.log(JSON.stringify({measurement:m,release:receipt.release}));
}catch(error){receipt.passed=false;receipt.failure=String(error.stack||error);receipt.state=await snapshot();await page?.screenshot({path:path.join(out,'failure.png'),timeout:30000}).catch(()=>{});throw error;}
finally{clearInterval(diagnosticTimer);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(receipt,null,2)+'\n');await browser?.close();await new Promise(r=>server.close(r));}
