#!/usr/bin/env node
// Native gameplay + separate inspection camera. No physical GPU/retail fidelity claim.
import {createWiperResourceLifecycle,isWiperResourceLifecycleWarning} from './lib/inkwave-wiper-resource-lifecycle.mjs';
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {inspectWiperSceneOcclusion} from './lib/inkwave-wiper-occlusion.mjs';
import {configureWiperCoverageCamera,assertWiperFlightCoverage,assertWiperFullFrame} from './lib/inkwave-wiper-flight-coverage.mjs';
import {createWiperAmbientObserver} from './lib/inkwave-wiper-ambient-observer.mjs';
import {readWiperAmbientState} from './lib/inkwave-wiper-ambient-state.mjs';
import {assertWiperCurrentBinding,WIPER_SOURCE,WIPER_BASELINE} from './lib/inkwave-wiper-current-binding.mjs';
import {verifyRuntimeBuild,hash} from './lib/inkwave-runtime-evidence.mjs';
import {enterRangeFromMenu} from './lib/inkwave-range-menu-entry.mjs';
import {awaitWiperSceneSources,wiperSceneCensus,validWiperProfileStyle} from './lib/inkwave-wiper-scene-readiness.mjs';
assert.ok([7,8].includes(process.argv.slice(2).length),'Unexpected CLI argument count');
const [siteArg,sourceArg,overlayArg,outArg,variant,id,action,costArg]=process.argv.slice(2);
const visibilityProbe=costArg==='--visibility-probe';
const costProbe=costArg==='--cost-probe',dentalPilot=costArg==='--dental-pilot',rngDiagnostic=costArg==='--rng-diagnostic';assert.ok(costArg===undefined||costProbe||dentalPilot||rngDiagnostic||visibilityProbe);if(visibilityProbe)assert.ok(id==='s3-saber-heavy'&&action==='charged');if(rngDiagnostic)assert.ok(id==='s3-saber-heavy'&&action==='charged');if(dentalPilot)assert.ok(id==='s3-saber-heavy'&&action==='charged');if(costProbe)assert.ok(variant==='A'&&id==='s3-saber-heavy'&&action==='charged');
assert.ok(outArg&&['A','B'].includes(variant));assert.ok(['s3-saber-heavy','s3-saber-normal','s3-saber-lite'].includes(id));assert.ok(['tap','charged'].includes(action));
const site=path.resolve(siteArg),source=path.resolve(sourceArg),overlay=path.resolve(overlayArg),out=path.resolve(outArg);
const nodeTimings={started:performance.now()};
const head=WIPER_SOURCE,baseline=WIPER_BASELINE;
const manifest=verifyRuntimeBuild(site,source,head),binding=JSON.parse(fs.readFileSync(path.join(overlay,'receipt.json'),'utf8'));
assertWiperCurrentBinding(manifest,binding);
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
await new Promise(r=>server.listen(0,'127.0.0.1',r));let page,browser,result,failure;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 page=await browser.newPage({viewport:{width:960,height:720}});
 page.on('response',response=>{const key=new URL(response.url()).pathname.slice(1);if(!replacements.has(key)&&key!==dummyPath)return;
  responsePending.push(response.body().then(bytes=>consumed.set(key,hash(bytes))).catch(e=>responseErrors.push(e.message)));});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||(m.type()==='warning'&&isWiperResourceLifecycleWarning(m.text())))errors.push(m.text());});
 await page.addInitScript('window.__createWiperResourceLifecycle='+createWiperResourceLifecycle.toString());
 await page.addInitScript('window.__readWiperAmbientState='+readWiperAmbientState.toString());
 if(rngDiagnostic)await page.addInitScript('window.__createWiperAmbientObserver='+createWiperAmbientObserver.toString());
 await page.addInitScript(({id,rngDiagnostic})=>{
  localStorage.setItem('inkwave.settings',JSON.stringify({quality:'high',shadows:true,bloom:true,colorblind:true,frameRate:60}));
  localStorage.setItem('inkwave.profile',JSON.stringify({style:{hair:0,skin:7,outfit:5,eyes:1,hat:0,brows:3}}));
  let n=0x515e7021,calls=0;
  window.__wiperResetSeed=()=>{n=0x515e7021;calls=0;};
  window.__wiperRng=()=>({state:n>>>0,calls});
  const observer=rngDiagnostic?window.__createWiperAmbientObserver(window.__wiperRng,()=>{const g=window.__inkwave,G=window.__G,h=g?.fxHooks;return {gameTime:G?.time??null,mode:G?.mode??null,matchState:G?.match?.state??null,ambientTriggerCounts:h?{seaSpray:h.count.seaSpray??0,feather:h.count.feather??0}:null,ambientEdges:h?.edges.length??null,sprayT:h?.sprayT??null,featherT:h?.featherT??null,seaState:G?.env?.seaState??null,gullT:g?._gullT??null,gustT:g?._gustT??null,clinkT:g?._clinkT??null,hornT:g?._hornT??null};}):null;window.__wiperObserver=observer;
  Math.random=observer?()=>{n^=n<<13;n^=n>>>17;n^=n<<5;calls++;observer.onRandom();return(n>>>0)/4294967296;}:()=>{n^=n<<13;n^=n>>>17;n^=n<<5;calls++;return(n>>>0)/4294967296;};
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
        if(observer){observer.mark('first-publication');observer.wrap(game.fxHooks,'_ambient');observer.wrap(game.fxHooks.fx,'seaSpray');observer.setPhase('published-idle');}
        const boundary=window.__wiperBootFreeze={schema:1,boundary:'first-native-game-publication',clocks:null};
        queueMicrotask(()=>{
          if(window.__G?.game!==game||!game.frozen||typeof game.debug?.freeze!=='function')
            throw Error('Native game publication did not complete before first frame');
          game.debug.freeze();
          window.__wiperResources=window.__createWiperResourceLifecycle(window.__G,game);
          window.__wiperResources.snapshot('native-publication');
          boundary.clocks=window.__wiperClocks();
        });
      }});

  document.addEventListener('click',e=>{
   if(!e.isTrusted||!e.target?.closest?.('.iw-ui [data-id="mode-range"]')||window.__inkwave?.menus?.current!=='mode')return;
   const g=window.__inkwave;g.debug.freeze();
   if(JSON.stringify(window.__wiperBootFreeze?.clocks)!==JSON.stringify(window.__wiperClocks()))throw Error('Scene drift before range');
   observer?.setPhase('trusted-entry');observer?.mark('before-entry-seed-reset');window.__wiperResetSeed();observer?.mark('after-entry-seed-reset');g.api.setLoadout({weapon:id});
   if(g.api.getLoadout()?.weapon!==id)throw Error('Native loadout selection failed');
   window.__wiperResources.snapshot('trusted-entry');
   window.__wiperEntry={trusted:true,clocks:window.__wiperClocks(),rng:window.__wiperRng()};
  },true);
 },{id,rngDiagnostic});
 nodeTimings.beforeEntry=performance.now();const entry=await enterRangeFromMenu(page,'http://127.0.0.1:'+server.address().port,{timeout:300000});
 await page.evaluate('window.__awaitWiperSources='+awaitWiperSceneSources.toString()+';window.__wiperCensus='+wiperSceneCensus.toString()+';window.__validWiperProfileStyle='+validWiperProfileStyle.toString()+';window.__configureWiperCoverageCamera='+configureWiperCoverageCamera.toString()+';window.__assertWiperFlightCoverage='+assertWiperFlightCoverage.toString()+';window.__assertWiperFullFrame='+assertWiperFullFrame.toString()+';window.__inspectWiperSceneOcclusion='+inspectWiperSceneOcclusion.toString());
 nodeTimings.afterEntry=performance.now();
 const setup=await page.evaluate(async({id,action,dummyPath,costProbe,dentalPilot,rngDiagnostic,visibilityProbe})=>{
  const THREE=await import('three'),G=window.__G,g=window.__inkwave,a=G.local;
  if(!g.frozen||!window.__wiperEntry?.trusted||!G.match?.range||G.match.state!=='playing'||a.weaponId!==id)throw Error('Native range/weapon admission failed');
  const dummyUrl=new URL('/'+dummyPath,location.origin).href;
  const {TargetDummyCharacter}=await import(dummyUrl);
  window.__wiperObserver?.setPhase('readiness');
  const startupTiming={beforeReadiness:performance.now()};const readiness=await window.__awaitWiperSources(G,TargetDummyCharacter);
  startupTiming.afterReadiness=performance.now();
  await window.__wiperResources.settle('range-ready');
  if(!Object.hasOwn(Object.getPrototypeOf(G.projectiles),Symbol.for('inkwave.s3.projectile-shapes.v1')))throw Error('Missing native shape installer');
  g.debug.freezeBots();g.input.keys.clear();g.input.pressed.clear();g.debug.fire(false);g.R.setDynamicScale(1);
  const aim=()=>{G.rig.yaw=0;G.rig.pitch=.06;};
  window.__wiperObserver?.setPhase('warm');window.__wiperObserver?.mark('before-warm-seed-reset');window.__wiperResetSeed();window.__wiperObserver?.mark('after-warm-seed-reset');startupTiming.warmStart=performance.now();for(let i=0;i<60;i++){aim();g._frame(1/60);}startupTiming.warmEnd=performance.now();
  await window.__wiperResources.settle('after-native-warm');
  if(!a.alive||!a.grounded||G.projectiles.list.length)throw Error('Unsettled native stance or preexisting projectile');
  if(!window.__validWiperProfileStyle(g.profile.style)||!window.__validWiperProfileStyle(a.character.style))throw Error('Native profile/style binding mismatch');
  window.__wiperObserver?.mark('after-warm');const beforeReset=window.__wiperRng();window.__wiperResetSeed();window.__wiperObserver?.mark('after-capture-seed-reset');window.__wiperObserver?.setPhase('setup-tail');
  const initial={ambientState:window.__readWiperAmbientState(G,g),entry:window.__wiperEntry,readiness,clocks:window.__wiperClocks(),rng:window.__wiperRng(),profileStyle:{...g.profile.style},character:{t:a.character.t,phase:a.character.phase,seed:a.character.seed,style:{...a.character.style}},pos:a.pos.toArray(),ink:a.ink,hp:a.hp,census:window.__wiperCensus(G,G.scene,TargetDummyCharacter)};
  const r=G.renderer,gl=r.getContext();if(g.settings.quality!=='high'||G.paint.size!==4096||gl.drawingBufferWidth!==960||gl.drawingBufferHeight!==720)throw Error('Unexpected quality/viewport');
  const target=a.pos.clone().add(new THREE.Vector3(0,1.1,3)),camera=new THREE.PerspectiveCamera(50,960/720,.05,250);
  if(camera===G.camera||camera===g.R.camera||camera===G.rig.gameCam)throw Error('Inspection camera must be independent');
  const gameCamera=cam=>({position:cam.position.toArray(),quaternion:cam.quaternion.toArray(),scale:cam.scale.toArray(),up:cam.up.toArray(),
   matrix:cam.matrix.toArray(),matrixWorld:cam.matrixWorld.toArray(),matrixWorldInverse:cam.matrixWorldInverse.toArray(),projectionMatrix:cam.projectionMatrix.toArray(),projectionMatrixInverse:cam.projectionMatrixInverse.toArray(),
   fov:cam.fov,aspect:cam.aspect,near:cam.near,far:cam.far,zoom:cam.zoom,filmGauge:cam.filmGauge,filmOffset:cam.filmOffset,view:cam.view,layers:cam.layers.mask,matrixAutoUpdate:cam.matrixAutoUpdate,matrixWorldAutoUpdate:cam.matrixWorldAutoUpdate});
  const physical=()=>({ambientState:window.__readWiperAmbientState(G,g),clocks:window.__wiperClocks(),rng:window.__wiperRng(),actors:G.actors.map(x=>({style:x.character?.style?{...x.character.style}:null,color:x.color?.getHex()??null,wid:x.weaponId,hp:x.hp,ink:x.ink,pos:x.pos.toArray(),vel:x.vel.toArray(),alive:x.alive})),
   projectiles:G.projectiles.list.map(p=>({wid:p.wid,type:p.type,key:p.catalog?.descriptor?.key,seed:p.seed,age:p.age,delay:p.delay,pos:p.pos.toArray(),vel:p.vel.toArray(),damage:p.damage,life:p.life,radius:p.radius,size:p.size,grav:p.grav,drag:p.drag,travel:p.catalog?.travel})),
   camera:gameCamera(G.camera),rigCamera:gameCamera(G.rig.gameCam),aim:{from:a.aimPoint.toArray(),dir:a.aimDir.toArray(),yaw:a.aimYaw,pitch:a.aimPitch}});
  const paints=[],aimTrace=[],originalSplat=G.paint.splat,originalAim=G.projectiles._aimFrom;
  G.paint.splat=function(...args){paints.push({tick:window.__wiperStep?.tick??-1,point:args[0].toArray(),radius:args[1],team:args[2],seed:args[3]?.seed,kind:args[3]?.kind,face:args[3]?.face});return originalSplat.apply(this,args);};
  G.projectiles._aimFrom=function(actor,from,out){const result=originalAim.call(this,actor,from,out);if(actor===a)aimTrace.push({tick:window.__wiperStep?.tick??-1,from:from.toArray(),target:actor.aimPoint.toArray(),result:result.toArray()});return result;};
  const buffers=new Map();let firstBirth=null,firstRetirement=null,seen=false,expired=false,capturedLive=false,lastRelatedGeometryTick=-1;
  const fingerprint=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  window.__wiperStep={tick:-1,async step(tick,capture){
   if(tick!==this.tick+1)throw Error('Nonconsecutive native frame');this.tick=tick;
   window.__wiperObserver?.setPhase('native:'+tick);
   if(tick===0){await window.__wiperResources.settle('pre-tick-zero');}
   const resourceRecordStart=window.__wiperResources.records.length;
   if(tick===2)window.__wiperResources.observeBoundary('native:2:before');
   aim();g.debug.fire(tick<(action==='charged'?80:2));G.renderer.info.reset();
   const t=performance.now();g._frame(1/60);const frameCpuMs=performance.now()-t;window.__wiperObserver?.mark('native-end');window.__wiperObserver?.setPhase('post-native:'+tick);
   const nativeRender={...r.info.render},memory={...r.info.memory};
   if(tick===2)window.__wiperResources.observeBoundary('native:2:after');
   const state=physical(),owned=G.projectiles.list.filter(p=>p.owner===a&&p.delay<=0),shape=G.projectiles._s3Shapes;
   const birthNow=owned.length>0&&!seen,expiryNow=owned.length===0&&seen&&!expired;
   if(expiryNow)firstRetirement=tick;
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
   if(shape.slashV.count||shape.slashH.count||shape.sheets.mesh.count)lastRelatedGeometryTick=tick;
   const phases={nativeSubmitMs:frameCpuMs,inspection:[]},hashStart=performance.now();const paintHash=await fingerprint(G.paint.grid),images=[];phases.paintHashMs=performance.now()-hashStart;
   const views=rngDiagnostic?[]:visibilityProbe?(owned.length&&!capturedLive?['front','top']:[]):dentalPilot?(tick>=75?['front']:[]):((capture||(owned.length&&!capturedLive))?['front','top']:[]);
   if(dentalPilot&&(tick===75||birthNow||expiryNow||tick===160))views.push('top');
   if(dentalPilot&&birthNow&&tick<75)throw Error('Dental birth precedes continuous capture window');
   for(const view of views){
    const before=JSON.stringify(physical()),prevTarget=r.getRenderTarget(),prevAuto=r.autoClear;
    window.__configureWiperCoverageCamera(THREE,camera,target,view);
    const flightCoverage={slashH:window.__assertWiperFlightCoverage(THREE,shape.slashH,camera),slashV:window.__assertWiperFlightCoverage(THREE,shape.slashV,camera)};
    const occlusion=window.__inspectWiperSceneOcclusion(THREE,G.scene,[shape.slashH,shape.slashV,shape.sheets.mesh],camera);
    try{r.setRenderTarget(null);r.autoClear=true;const fullFrame=window.__assertWiperFullFrame(THREE,r,camera);window.__wiperResources.observeBoundary('inspection:'+tick+':'+view+':before');const renderStart=performance.now();r.render(G.scene,camera);const submitEnd=performance.now();window.__wiperResources.observeBoundary('inspection:'+tick+':'+view+':after');
     const readStart=performance.now();const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const readEnd=performance.now();
     let lo=255,hi=0;for(let j=0;j<pixels.length;j+=4){const v=(pixels[j]+pixels[j+1]+pixels[j+2])/3;lo=Math.min(lo,v);hi=Math.max(hi,v);}
     if(hi-lo<8)throw Error('Flat inspection frame');const pixelHash=await fingerprint(pixels),encodeStart=performance.now(),png=r.domElement.toDataURL('image/png').split(',')[1],encodeEnd=performance.now();phases.inspection.push({view,submitMs:submitEnd-renderStart,readPixelsWithQueuedGpuMs:readEnd-readStart,pixelCheckHashMs:encodeStart-readEnd,pngEncodeMs:encodeEnd-encodeStart});images.push({view,pixelHash,png,camera:gameCamera(camera),flightCoverage,fullFrame,occlusion});
    }finally{r.setRenderTarget(prevTarget);r.autoClear=prevAuto;}
    if(JSON.stringify(physical())!==before)throw Error('Inspection render changed gameplay camera/physics/aim/clock/RNG');
   }
   if(owned.length)capturedLive=true;
   if(gl.getError())throw Error('WebGL error');
   window.__wiperObserver?.setPhase('await-gap:'+tick);
   return {resourceLifecycle:tick===0?window.__wiperResources.records:(window.__wiperResources.records.length>resourceRecordStart?window.__wiperResources.records.slice(resourceRecordStart):null),tick,state,axes,paintHash,paintEvents:paints.slice(),aimTrace:aimTrace.slice(),nativeRender,memory,frameCpuMs,phases,images,census:window.__wiperCensus(G,G.scene,TargetDummyCharacter)};
  },finish(){g.debug.fire(false);G.paint.splat=originalSplat;G.projectiles._aimFrom=originalAim;
   if(!costProbe&&!rngDiagnostic&&(!seen||!firstBirth||!expired))throw Error('Native slash birth and termination required');
   let gpuDrained=false;if(dentalPilot||rngDiagnostic){if(dentalPilot){const shape=G.projectiles._s3Shapes;if(this.tick-lastRelatedGeometryTick<21)throw Error('Need 21 native frames after last related geometry for slash speck lifetime');if(shape.slashV.count!==0||shape.slashH.count!==0||shape.sheets.mesh.count!==0)throw Error('Related slash/sheet geometry still live at final native tick');}const drainStart=performance.now();gl.finish();window.__wiperFinalDrainMs=performance.now()-drainStart;if(gl.getError())throw Error('Final GPU drain error');gpuDrained=true;}
   return {firstBirth,firstRetirement,expired,aimTrace,paintEvents:paints,gpuDrained,relatedFx:{lastGeometryTick:lastRelatedGeometryTick,finalTick:this.tick,speckTailFrames:21},final:physical()};}};
  return {resourceLifecycle:window.__wiperResources.records,startupTiming,costProbe,dentalPilot,capturePolicy:dentalPilot?{continuous:{view:'front',firstTick:75,lastTick:160},top:'pre-release, actual birth, actual retirement, final frame',unchangedControls:'pending native acceptance'}:null,initial,dummyModuleUrl:dummyUrl,startupRngBeforeReset:beforeReset,target:target.toArray(),quality:g.settings.quality,atlasSize:G.paint.size,palette:{colorblind:g.settings.colorblind,teams:G.teamColors.map(c=>c.getHex()),local:a.color.getHex()},scope:'native simulation plus separate inspection-camera raw renderer; not native postprocessed view; CPU diagnostic not performance acceptance'};
 },{id,action,dummyPath,costProbe,dentalPilot,rngDiagnostic,visibilityProbe});
 console.log(JSON.stringify({schema:1,status:'wiper-resource-lifecycle',records:setup.resourceLifecycle}));
 nodeTimings.afterSetup=performance.now();
 const frames=[],pilot=id==='s3-saber-heavy'&&action==='charged';
 result={setup,frames,status:'partial',costProbe};
 for(let tick=0;tick<=(rngDiagnostic?15:costProbe?9:160);tick++){
  fs.writeFileSync(path.join(out,'frame-progress.json'),JSON.stringify({status:'stepping',tick,completedFrames:frames.length,nodeWall:performance.now(),setup,costProbe}));
  const transferStart=performance.now();
  const row=await page.evaluate(({tick,capture})=>window.__wiperStep.step(tick,capture),{tick,capture:costProbe?tick%2===0:pilot||[0,90,120,160].includes(tick)});
  row.nodeEvaluateWallMs=performance.now()-transferStart;const saveStart=performance.now();
  if(row.resourceLifecycle)console.log(JSON.stringify({schema:1,status:'wiper-resource-lifecycle',records:row.resourceLifecycle}));
  for(const im of row.images){const bytes=Buffer.from(im.png,'base64');delete im.png;assert.ok(bytes.length>1000);assert.equal(bytes.subarray(1,4).toString(),'PNG');const file=action+'-'+im.view+'-'+String(tick).padStart(4,'0')+'.png';fs.writeFileSync(path.join(out,file),bytes);im.file=file;im.pngSha256=hash(bytes);}
  row.pngDecodeWriteHashMs=performance.now()-saveStart;frames.push(row);
  fs.writeFileSync(path.join(out,'partial-frames.json'),JSON.stringify({status:'partial',setup,frames,nodeTimings,costProbe}));
  console.log(JSON.stringify({phase:'completed-frame-cost',tick,images:row.images.length,nativeSubmitMs:row.frameCpuMs,phases:row.phases,nodeEvaluateWallMs:row.nodeEvaluateWallMs,pngDecodeWriteHashMs:row.pngDecodeWriteHashMs}));
  if(visibilityProbe&&row.axes.main&&row.images.length===2)break;
 }
 if(visibilityProbe)assert.ok(frames.at(-1)?.axes.main&&frames.at(-1).images.length===2,'Visibility probe requires an actual live slash in both full-frame views');
 const completion=visibilityProbe?{scope:'first live frame only; no retirement/tail acceptance'}:await page.evaluate(()=>window.__wiperStep.finish());
 const ambientObservation=rngDiagnostic?await page.evaluate(()=>{const o=window.__wiperObserver;o.mark('finished');const result=o.report();o.restore();return result;}):null;if(rngDiagnostic){assert.deepEqual(ambientObservation.errors,[]);assert.equal(ambientObservation.eventOverflow,0);assert.equal(ambientObservation.sampleOverflow,0);assert.ok(completion.gpuDrained);}
 await Promise.all(responsePending);assert.equal(consumed.get(dummyPath),manifest.artifacts[dummyPath],'consumed exact native dummy module');assert.deepEqual(errors,[]);assert.deepEqual(responseErrors,[]);
 for(const [key,{m}]of replacements){const expected=variant==='A'?m.baselineEmittedSha256:m.candidateEmittedSha256;
 assert.equal(loaded.get(key),expected,'actual served module '+key);assert.equal(consumed.get(key),expected,'browser consumed module body '+key);}
 result={setup,completion,frames,ambientObservation,dt:1/60,frameCount:frames.length,visibilityProbe,rngDiagnostic,costProbe,dentalPilot,nodeTimings,finalGpuDrainMs:dentalPilot?await page.evaluate(()=>window.__wiperFinalDrainMs):null,variant,id,action,pilot,physicalGpuMeasured:false,performanceAccepted:false};
}catch(e){failure=e;}
finally{
 if(page){try{const records=await page.evaluate(()=>window.__wiperResources?.records??[]);result??={};result.resourceLifecycle=records;console.log(JSON.stringify({schema:1,status:'wiper-resource-lifecycle-final',records}));}catch(e){errors.push('resource-lifecycle-recovery: '+e.message);}}
 if(rngDiagnostic&&page){try{const partial=await page.evaluate(()=>window.__wiperObserver?.report());result??={};result.ambientObservation??=partial;}catch(e){errors.push('observer-recovery: '+e.message);}}
 await browser?.close();await new Promise(r=>server.close(r));
 const receipt={status:failure?'failed':visibilityProbe?'visibility-diagnostic-only':rngDiagnostic?'rng-diagnostic-only':costProbe?'cost-diagnostic-only':'passed',head,baseline,variant,id,action,inputHash:manifest.inputHash,contentHash:manifest.contentHash,binding,loaded:[...loaded],consumed:[...consumed],responseErrors,result,errors,error:failure?.stack};
 fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,variant,id,action,error:failure?.message}));
 if(failure)process.exitCode=1;
}
