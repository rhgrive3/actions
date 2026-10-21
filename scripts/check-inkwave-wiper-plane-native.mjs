#!/usr/bin/env node
// Native gameplay + separate inspection camera. No physical GPU/retail fidelity claim.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {verifyRuntimeBuild,hash} from './lib/inkwave-runtime-evidence.mjs';
import {enterRangeFromMenu} from './lib/inkwave-range-menu-entry.mjs';
import {awaitWiperSceneSources,wiperSceneCensus} from './lib/inkwave-wiper-scene-readiness.mjs';
const [siteArg,sourceArg,overlayArg,outArg,variant,id,action]=process.argv.slice(2);
assert.ok(outArg&&['A','B'].includes(variant));assert.ok(['s3-saber-heavy','s3-saber-normal','s3-saber-lite'].includes(id));assert.ok(['tap','charged'].includes(action));
const site=path.resolve(siteArg),source=path.resolve(sourceArg),overlay=path.resolve(overlayArg),out=path.resolve(outArg);
const head='0430673b09a5009628fc87baa414b3560090fc1d',baseline='7581ca9be8cf87d253918b8abb3b8ebe728c2093';
const manifest=verifyRuntimeBuild(site,source,head),binding=JSON.parse(fs.readFileSync(path.join(overlay,'receipt.json'),'utf8'));
assert.equal(binding.candidate,head);assert.equal(binding.baseline,baseline);assert.equal(binding.contentHash,manifest.contentHash);assert.equal(binding.inputHash,manifest.inputHash);assert.equal(binding.revision,manifest.build.revision);
assert.deepEqual(binding.modules.map(x=>x.name).sort(),['s3-ink-sheets.mjs','s3-projectile-shapes.mjs']);
const dummyPath='_versions/'+manifest.build.revision+'/patches/practice-range/runtime/dummy.mjs';
assert.ok(manifest.artifacts[dummyPath]);
const replacements=new Map();
for(const m of binding.modules){assert.equal(m.rel,'patches/splatoon3/runtime/'+m.name);const served='_versions/'+manifest.build.revision+'/'+m.rel;
 assert.equal(hash(fs.readFileSync(path.join(site,served))),m.candidateEmittedSha256);
 const bytes=fs.readFileSync(path.join(overlay,m.name));assert.equal(hash(bytes),m.baselineEmittedSha256);replacements.set(served,{m,bytes});}
fs.mkdirSync(out,{recursive:true});
const loaded=new Map(),consumed=new Map(),responsePending=[],responseErrors=[],errors=[],mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg'};
const server=http.createServer((req,res)=>{try{
 const p=new URL(req.url,'http://local').pathname,file=path.resolve(site,'.'+(p==='/'?'/index.html':decodeURIComponent(p)));
 if(!file.startsWith(site+path.sep))throw Error('outside');const key=path.relative(site,file).split(path.sep).join('/'),original=fs.readFileSync(file);
 assert.equal(hash(original),manifest.artifacts[key]);const bytes=variant==='A'&&replacements.has(key)?replacements.get(key).bytes:original;
 loaded.set(key,hash(bytes));res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.end(bytes);
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser,result,failure;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:960,height:720}});
 page.on('response',response=>{const key=new URL(response.url()).pathname.slice(1);if(!replacements.has(key)&&key!==dummyPath)return;
  responsePending.push(response.body().then(bytes=>consumed.set(key,hash(bytes))).catch(e=>responseErrors.push(e.message)));});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(({id})=>{
  localStorage.setItem('inkwave.settings',JSON.stringify({quality:'high',shadows:true,bloom:true,colorblind:true,frameRate:60}));
  let n=0x515e7021,calls=0;
  window.__wiperResetSeed=()=>{n=0x515e7021;calls=0;};
  window.__wiperRng=()=>({state:n>>>0,calls});
  Math.random=()=>{n^=n<<13;n^=n>>>17;n^=n<<5;calls++;return(n>>>0)/4294967296;};
  window.__wiperClocks=()=>{
        const G=window.__G,g=window.__inkwave;
        const finite=(value,label,required=false)=>{
          if(value===undefined||value===null){if(required)throw Error('Missing clock '+label);return null;}
          if(!Number.isFinite(value))throw Error('Non-finite clock '+label);return value;
        };
        const uniforms=[];
        G.scene.traverse(o=>{
          for(const [slot,m]of (Array.isArray(o.material)?o.material:[o.material]).entries()){
            if(!m)continue;
            for(const [kind,bank]of [['direct',m.uniforms],['userData',m.userData?.uniforms]]){
              for(const [key,u]of Object.entries(bank||{})){
                if(/time|clock/i.test(key)&&typeof u?.value==='number')
                  uniforms.push([o.name||'',m.name||'',slot,kind,key,finite(u.value,key)]);
              }
            }
          }
        });
        uniforms.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
        return {game:finite(G.time,'game',true),environment:finite(G.env?.time,'environment',true),
          environmentUniform:finite(G.env?.U?.uTime?.value,'environmentUniform',true),
          fx:finite(G.fx?._time,'fx',true),fxHooks:finite(g.fxHooks?.time,'fxHooks'),
          paint:finite(G.paint?.clock,'paint',true),decor:finite(g.decor?.time,'decor'),
          decorUniform:finite(g.decor?.uTime?.value,'decorUniform'),propsUniform:finite(g.props?.uTime?.value,'propsUniform'),
          levelUniform:finite(g.levelMat?.userData?.uniforms?.uTime?.value,'levelUniform'),
          grateUniform:finite(g.grateMat?.userData?.uniforms?.uTime?.value,'grateUniform'),uniforms};
      };
      if(Object.hasOwn(window,'__inkwave'))throw Error('Game was already published before early-freeze hook');
      Object.defineProperty(window,'__inkwave',{configurable:true,set(game){
        Object.defineProperty(window,'__inkwave',{value:game,writable:true,configurable:true,enumerable:true});
        if(!game||typeof game!=='object')throw Error('Invalid native game publication');
        game.frozen=true;
        const boundary=window.__wiperBootFreeze={schema:1,boundary:'first-native-game-publication',clocks:null};
        queueMicrotask(()=>{
          if(window.__G?.game!==game||!game.frozen||typeof game.debug?.freeze!=='function')
            throw Error('Native game publication did not complete before first frame');
          game.debug.freeze();
          boundary.clocks=window.__wiperClocks();
        });
      }});

  document.addEventListener('click',e=>{
   if(!e.isTrusted||!e.target?.closest?.('.iw-ui [data-id="mode-range"]')||window.__inkwave?.menus?.current!=='mode')return;
   const g=window.__inkwave;g.debug.freeze();
   if(JSON.stringify(window.__wiperBootFreeze?.clocks)!==JSON.stringify(window.__wiperClocks()))throw Error('Scene drift before range');
   window.__wiperResetSeed();g.api.setLoadout({weapon:id});
   if(g.api.getLoadout()?.weapon!==id)throw Error('Native loadout selection failed');
   window.__wiperEntry={trusted:true,clocks:window.__wiperClocks(),rng:window.__wiperRng()};
  },true);
 },{id});
 const entry=await enterRangeFromMenu(page,'http://127.0.0.1:'+server.address().port,{timeout:300000});
 await page.evaluate('window.__awaitWiperSources='+awaitWiperSceneSources.toString()+';window.__wiperCensus='+wiperSceneCensus.toString());
 const setup=await page.evaluate(async({id,action,dummyPath})=>{
  const THREE=await import('three'),G=window.__G,g=window.__inkwave,a=G.local;
  if(!g.frozen||!window.__wiperEntry?.trusted||!G.match?.range||G.match.state!=='playing'||a.weaponId!==id)throw Error('Native range/weapon admission failed');
  const dummyUrl=new URL('/'+dummyPath,location.origin).href;
  const {TargetDummyCharacter}=await import(dummyUrl);
  const readiness=await window.__awaitWiperSources(G,TargetDummyCharacter);
  if(!Object.hasOwn(Object.getPrototypeOf(G.projectiles),Symbol.for('inkwave.s3.projectile-shapes.v1')))throw Error('Missing native shape installer');
  g.debug.freezeBots();g.input.keys.clear();g.input.pressed.clear();g.debug.fire(false);g.R.setDynamicScale(1);
  const aim=()=>{G.rig.yaw=0;G.rig.pitch=.06;};
  window.__wiperResetSeed();for(let i=0;i<60;i++){aim();g._frame(1/60);}
  if(!a.alive||!a.grounded||G.projectiles.list.length)throw Error('Unsettled native stance or preexisting projectile');
  const beforeReset=window.__wiperRng();window.__wiperResetSeed();
  const initial={entry:window.__wiperEntry,readiness,clocks:window.__wiperClocks(),rng:window.__wiperRng(),character:{t:a.character.t,phase:a.character.phase,seed:a.character.seed},pos:a.pos.toArray(),ink:a.ink,hp:a.hp,census:window.__wiperCensus(G,G.scene,TargetDummyCharacter)};
  const r=G.renderer,gl=r.getContext();if(g.settings.quality!=='high'||G.paint.size!==4096||gl.drawingBufferWidth!==960||gl.drawingBufferHeight!==720)throw Error('Unexpected quality/viewport');
  const target=a.pos.clone().add(new THREE.Vector3(0,1.1,3)),camera=new THREE.PerspectiveCamera(50,960/720,.05,250);
  if(camera===G.camera||camera===g.R.camera||camera===G.rig.gameCam)throw Error('Inspection camera must be independent');
  const gameCamera=cam=>({position:cam.position.toArray(),quaternion:cam.quaternion.toArray(),scale:cam.scale.toArray(),up:cam.up.toArray(),
   matrix:cam.matrix.toArray(),matrixWorld:cam.matrixWorld.toArray(),matrixWorldInverse:cam.matrixWorldInverse.toArray(),projectionMatrix:cam.projectionMatrix.toArray(),projectionMatrixInverse:cam.projectionMatrixInverse.toArray(),
   fov:cam.fov,aspect:cam.aspect,near:cam.near,far:cam.far,zoom:cam.zoom,filmGauge:cam.filmGauge,filmOffset:cam.filmOffset,view:cam.view,layers:cam.layers.mask,matrixAutoUpdate:cam.matrixAutoUpdate,matrixWorldAutoUpdate:cam.matrixWorldAutoUpdate});
  const physical=()=>({clocks:window.__wiperClocks(),rng:window.__wiperRng(),actors:G.actors.map(x=>({wid:x.weaponId,hp:x.hp,ink:x.ink,pos:x.pos.toArray(),vel:x.vel.toArray(),alive:x.alive})),
   projectiles:G.projectiles.list.map(p=>({wid:p.wid,type:p.type,key:p.catalog?.descriptor?.key,seed:p.seed,age:p.age,delay:p.delay,pos:p.pos.toArray(),vel:p.vel.toArray(),damage:p.damage,life:p.life,radius:p.radius,size:p.size,grav:p.grav,drag:p.drag,travel:p.catalog?.travel})),
   camera:gameCamera(G.camera),rigCamera:gameCamera(G.rig.gameCam),aim:{from:a.aimPoint.toArray(),dir:a.aimDir.toArray(),yaw:a.aimYaw,pitch:a.aimPitch}});
  const paints=[],aimTrace=[],originalSplat=G.paint.splat,originalAim=G.projectiles._aimFrom;
  G.paint.splat=function(...args){paints.push({tick:window.__wiperStep?.tick??-1,point:args[0].toArray(),radius:args[1],team:args[2],seed:args[3]?.seed,kind:args[3]?.kind,face:args[3]?.face});return originalSplat.apply(this,args);};
  G.projectiles._aimFrom=function(actor,from,out){const result=originalAim.call(this,actor,from,out);if(actor===a)aimTrace.push({tick:window.__wiperStep?.tick??-1,from:from.toArray(),target:actor.aimPoint.toArray(),result:result.toArray()});return result;};
  const buffers=new Map();let firstBirth=null,seen=false,expired=false,capturedLive=false;
  const fingerprint=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  window.__wiperStep={tick:-1,async step(tick,capture){
   if(tick!==this.tick+1)throw Error('Nonconsecutive native frame');this.tick=tick;
   aim();g.debug.fire(tick<(action==='charged'?80:2));G.renderer.info.reset();
   const t=performance.now();g._frame(1/60);const frameCpuMs=performance.now()-t;
   const nativeRender={...r.info.render},memory={...r.info.memory};
   const state=physical(),owned=G.projectiles.list.filter(p=>p.owner===a&&p.delay<=0),shape=G.projectiles._s3Shapes;
   if(owned.length){seen=true;if(!firstBirth)firstBirth={tick,projectiles:state.projectiles,ink:a.ink,aimTrace:aimTrace.slice()};
    if(owned.some(p=>p.catalog?.descriptor?.key!==(action==='charged'?'saber-vertical':'saber-horizontal')))throw Error('Wrong native action descriptor');
    if(owned.length!==1)throw Error('More than one native paid slash');}
   else if(seen)expired=true;
   const axes={main:null,trailing:null,sheet:null,counts:G.projectiles.s3ShapeCounts??null};
   if(owned.length){const mesh=action==='charged'?shape.slashV:shape.slashH,m=new THREE.Matrix4(),v=new THREE.Vector3();
    if(mesh.count<2)throw Error('Missing slab instances');mesh.getMatrixAt(0,m);axes.main=v.setFromMatrixColumn(m,0).normalize().toArray();mesh.getMatrixAt(1,m);axes.trailing=v.setFromMatrixColumn(m,0).normalize().toArray();
    if(shape.sheets.mesh.count){shape.sheets.mesh.getMatrixAt(0,m);axes.sheet=v.setFromMatrixColumn(m,1).normalize().toArray();}
    for(const [key,value]of [['main',mesh.instanceMatrix.array],['sheet',shape.sheets.mesh.instanceMatrix.array]]){if(buffers.has(key)&&buffers.get(key)!==value)throw Error('Instance buffer replaced');buffers.set(key,value);}
   }
   const paintHash=await fingerprint(G.paint.grid),images=[];
   if(capture||(owned.length&&!capturedLive))for(const view of ['front','top']){
    const before=JSON.stringify(physical()),prevTarget=r.getRenderTarget(),prevAuto=r.autoClear;
    camera.position.copy(target).add(view==='front'?new THREE.Vector3(.2,2,12):new THREE.Vector3(0,15,-.01));camera.up.set(0,1,0);camera.lookAt(target);camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
    try{r.setRenderTarget(null);r.autoClear=true;r.render(G.scene,camera);
     const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
     let lo=255,hi=0;for(let j=0;j<pixels.length;j+=4){const v=(pixels[j]+pixels[j+1]+pixels[j+2])/3;lo=Math.min(lo,v);hi=Math.max(hi,v);}
     if(hi-lo<8)throw Error('Flat inspection frame');images.push({view,pixelHash:await fingerprint(pixels),png:r.domElement.toDataURL('image/png').split(',')[1],camera:gameCamera(camera)});
    }finally{r.setRenderTarget(prevTarget);r.autoClear=prevAuto;}
    if(JSON.stringify(physical())!==before)throw Error('Inspection render changed gameplay camera/physics/aim/clock/RNG');
   }
   if(owned.length)capturedLive=true;
   if(gl.getError())throw Error('WebGL error');
   return {tick,state,axes,paintHash,paintEvents:paints.slice(),aimTrace:aimTrace.slice(),nativeRender,memory,frameCpuMs,images,census:window.__wiperCensus(G,G.scene,TargetDummyCharacter)};
  },finish(){g.debug.fire(false);G.paint.splat=originalSplat;G.projectiles._aimFrom=originalAim;
   if(!seen||!firstBirth||!expired)throw Error('Native slash birth and termination required');
   return {firstBirth,expired,aimTrace,paintEvents:paints,final:physical()};}};
  return {initial,dummyModuleUrl:dummyUrl,startupRngBeforeReset:beforeReset,target:target.toArray(),quality:g.settings.quality,atlasSize:G.paint.size,palette:{colorblind:g.settings.colorblind,teams:G.teamColors.map(c=>c.getHex()),local:a.color.getHex()},scope:'native simulation plus separate inspection-camera raw renderer; not native postprocessed view; CPU diagnostic not performance acceptance'};
 },{id,action,dummyPath});
 const frames=[],pilot=id==='s3-saber-heavy'&&action==='charged';
 for(let tick=0;tick<=160;tick++){
  const row=await page.evaluate(({tick,capture})=>window.__wiperStep.step(tick,capture),{tick,capture:pilot||[0,90,120,160].includes(tick)});
  for(const im of row.images){const bytes=Buffer.from(im.png,'base64');delete im.png;assert.ok(bytes.length>1000);assert.equal(bytes.subarray(1,4).toString(),'PNG');const file=action+'-'+im.view+'-'+String(tick).padStart(4,'0')+'.png';fs.writeFileSync(path.join(out,file),bytes);im.file=file;im.pngSha256=hash(bytes);}
  frames.push(row);
 }
 const completion=await page.evaluate(()=>window.__wiperStep.finish());
 await Promise.all(responsePending);assert.equal(consumed.get(dummyPath),manifest.artifacts[dummyPath],'consumed exact native dummy module');assert.deepEqual(errors,[]);assert.deepEqual(responseErrors,[]);
 for(const [key,{m}]of replacements){const expected=variant==='A'?m.baselineEmittedSha256:m.candidateEmittedSha256;
 assert.equal(loaded.get(key),expected,'actual served module '+key);assert.equal(consumed.get(key),expected,'browser consumed module body '+key);}
 result={setup,completion,frames,dt:1/60,frameCount:161,variant,id,action,pilot,physicalGpuMeasured:false,performanceAccepted:false};
}catch(e){failure=e;}
finally{
 await browser?.close();await new Promise(r=>server.close(r));
 const receipt={status:failure?'failed':'passed',head,baseline,variant,id,action,inputHash:manifest.inputHash,contentHash:manifest.contentHash,binding,loaded:[...loaded],consumed:[...consumed],responseErrors,result,errors,error:failure?.stack};
 fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,variant,id,action,error:failure?.message}));
 if(failure)process.exitCode=1;
}
