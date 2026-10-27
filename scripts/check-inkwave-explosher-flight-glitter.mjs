#!/usr/bin/env node
// Reuse the existing native range driver. Only the diagnostic copy receives
// deterministic clocks and receipts; neither production checkout is rewritten.
import fs from 'node:fs';
import {requireRuntimeUIPreflight} from './lib/inkwave-explosher-runtime-ui-preflight.mjs';
import {instrumentExplosherGeometryDriver} from './lib/inkwave-explosher-geometry-lifetime.mjs';
import {requireApprovedCommonBuild} from './lib/inkwave-explosher-common-build.mjs';
import {requireInverseShapePair} from './lib/inkwave-explosher-inverse-contract.mjs';
import {requireControlledStartupPair}from'./lib/inkwave-explosher-volume-barrier.mjs';
import {requireExplosherVideoTools,explosherCaptureIdentity}from'./lib/inkwave-explosher-video-gate.mjs';
import {readExplosherStagePair}from'./lib/inkwave-explosher-stage-admission.mjs';
import { installProjectileCaptureUiGate } from './lib/inkwave-projectile-capture-ui.mjs';
import { readExplosherCaptureSurface, explosherSurfaceReady } from './lib/inkwave-explosher-capture-surface.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { awaitExplosherSceneSources, explosherSceneCensus } from './lib/inkwave-explosher-scene-census.mjs';
import { readExplosherSceneClocks, requireExplosherStyle, installExplosherEarlyFreeze, installExplosherRandom, readExplosherEffects } from './lib/inkwave-explosher-startup.mjs';
const [siteArg,outArg,sourceSha,sourceRootArg]=process.argv.slice(2);
if(!siteArg||!outArg||!/^[a-f0-9]{40}$/.test(sourceSha||''))throw Error('Usage: <built-site> <evidence-dir> <source-sha>');
const root=fileURLToPath(new URL('../',import.meta.url)),site=path.resolve(siteArg),out=path.resolve(outArg);
const sourceRoot=sourceRootArg?path.resolve(sourceRootArg):root;
// Fail before creating evidence, loading Playwright or launching a browser.
const runtimeUIRoute=Boolean(process.env.EXPLOSHER_RUNTIME_UI_PREFLIGHT);
const commonBuildAdmission=runtimeUIRoute
  ?requireRuntimeUIPreflight({root:sourceRoot,site,sourceSha,baseline:path.join(root,'.ci-explosher-base'),candidate:root})
  :requireApprovedCommonBuild(sourceRoot,site);
if(commonBuildAdmission.head!==sourceSha)throw Error('Admitted common source differs');
const preflight=process.env.EXPLOSHER_PREFLIGHT==='1';
const video=!preflight&&process.env.EXPLOSHER_VIDEO==='1';
const captureTicks=preflight?[0]:video?Array.from({length:61},(_,i)=>i):[0,3,8,14,22,30];
const captureViews=preflight||video?['behind']:['behind','tele-side','tele-oblique'];
const expectedPath=process.env.EXPLOSHER_EXPECT_PREFLIGHT;
const expectedText=expectedPath?fs.readFileSync(expectedPath,'utf8'):null;
const expectedFrame=expectedText?JSON.parse(expectedText)[0]:null;
if(expectedFrame&&(expectedFrame.tick!==0||expectedFrame.view!=='behind'))throw Error('Invalid preflight binding');
// Receipt identity comes from the checkout, not the caller's label.
const git=(args)=>{const r=spawnSync('git',['-C',sourceRoot,...args],{encoding:'utf8'});if(r.status!==0)throw Error('Cannot establish checkout identity');return r.stdout;};
const actualSourceSha=git(['rev-parse','HEAD']).trim();
if(actualSourceSha!==sourceSha)throw Error('Requested SHA does not match checkout HEAD');
fs.mkdirSync(out,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const once=(s,a,b)=>{if(s.split(a).length!==2)throw Error('capture anchor mismatch: '+a);return s.replace(a,b);};
const controlledPath=process.env.EXPLOSHER_CONTROLLED_MAIN;
const controlled=controlledPath?JSON.parse(fs.readFileSync(controlledPath,'utf8')):null;
if(controlled&&(controlled.controlledInitialCondition!==true||controlled.naturalBootAccepted!==false||controlled.site!==site||controlled.sourceRoot!==sourceRoot||hash(fs.readFileSync(controlled.file))!==controlled.transformedEmittedSha256))throw Error('Invalid controlled main provenance');
const shapeOverlayPath=process.env.EXPLOSHER_SHAPE_OVERLAY;
const shapeOverlay=shapeOverlayPath?JSON.parse(fs.readFileSync(shapeOverlayPath,'utf8')):null;
if(shapeOverlay&&(shapeOverlay.schema!==2||shapeOverlay.sameBuildComparison!==true||shapeOverlay.fullGameTwoBuildAcceptance!==false||shapeOverlay.expectedCommonSourceHead!==actualSourceSha||!['before','after'].includes(shapeOverlay.lane)||shapeOverlay.site!==site||shapeOverlay.sourceRoot!==sourceRoot||shapeOverlay.baselineSourceBlob!=='7afb76e80960dde61d51effb89057dd1f183d16f'||shapeOverlay.candidateSourceBlob!=='ff05f46db9eb5179440cd2c375663148ca05f48a'||hash(fs.readFileSync(shapeOverlay.file))!==shapeOverlay.transformedEmittedSha256||shapeOverlay.transformedEmittedSha256!==(shapeOverlay.lane==='before'?shapeOverlay.baselineEmittedSha256:shapeOverlay.candidateEmittedSha256)))throw Error('Invalid same-build shape overlay provenance');
let stageAdmission=null;
if(!runtimeUIRoute&&(!shapeOverlay||!controlled))throw Error('This LOCAL stage candidate requires the reviewed common shape and controlled-main receipts');
if(!preflight){
 fs.writeFileSync(path.join(out,'encoder-capabilities.json'),JSON.stringify(requireExplosherVideoTools(),null,2));
 const beforeEvidence=process.env.EXPLOSHER_ADMIT_BEFORE,afterEvidence=process.env.EXPLOSHER_ADMIT_AFTER;
 if(!beforeEvidence||!afterEvidence||!expectedFrame)throw Error('Full stage requires strict prior pair and bound own preflight');
 stageAdmission=readExplosherStagePair(video?'stills':'preflight',beforeEvidence,afterEvidence);
 if(stageAdmission.commonHead!==actualSourceSha||stageAdmission.buildContentHash!==shapeOverlay.buildContentHash)throw Error('Prior stage uses a different source/build');
 const admittedPreflightHash=video?stageAdmission.preflightManifestSha256[shapeOverlay.lane]:stageAdmission[shapeOverlay.lane].manifestSha256;
 if(hash(expectedText)!==admittedPreflightHash)throw Error('Own frame0 binding is not the admitted preflight manifest');
 fs.writeFileSync(path.join(out,'stage-admission.json'),JSON.stringify(stageAdmission,null,2));
}
const rangeEntryUrl=new URL('./lib/inkwave-range-menu-entry.mjs',import.meta.url).href;
let driver=fs.readFileSync(path.join(sourceRoot,'scripts/render-inkwave-projectile-shapes.mjs'),'utf8');
const originalHash=hash(driver);
driver=driver.replace(/^#!.*\n/,'');
driver="import { enterRangeFromMenu } from "+JSON.stringify(rangeEntryUrl)+";\n"+driver;
driver=once(driver,"from 'playwright'","from "+JSON.stringify(import.meta.resolve('playwright')));
driver=once(driver,"  await page.goto(base + '/?range&skipTitle');",`  await page.addInitScript(() => {
    // Normal game accessibility palette selection in this isolated diagnostic browser.
    localStorage.setItem('inkwave.settings',JSON.stringify({colorblind:true}));
    localStorage.setItem('inkwave.profile',JSON.stringify({style:{hair:0,skin:7,outfit:5,eyes:1,hat:0,brows:3}}));
    (${installProjectileCaptureUiGate.toString()})();
    window.readExplosherSceneClocks=${readExplosherSceneClocks.toString()};
    window.requireExplosherStyle=${requireExplosherStyle.toString()};
    (${installExplosherEarlyFreeze.toString()})();
    (${installExplosherRandom.toString()})(${preflight});
    window.readExplosherEffects=${readExplosherEffects.toString()};
    window.readExplosherCaptureSurface=${readExplosherCaptureSurface.toString()};
    window.explosherSurfaceReady=${explosherSurfaceReady.toString()};
  });
  await enterRangeFromMenu(page,base);
  const surfaceEntry=await page.evaluate(()=>({surface:window.readExplosherCaptureSurface(),clocks:window.readExplosherSceneClocks(),captureUi:window.__iwProjectileCaptureUiGate({phase:'observe'}),captureUiHistory:window.__iwProjectileCaptureUiHistory}));
  await page.screenshot({path:path.join(out,'normal-ui-entry.png')});
  let uiError=null;
  try {await page.waitForFunction(()=>{const ui=window.__iwProjectileCaptureUiGate({phase:'admission'});return window.explosherSurfaceReady(window.readExplosherCaptureSurface())&&ui.ready===true;},null,{timeout:60000});}
  catch(error){uiError=String(error);}
  const surfaceReady=await page.evaluate(()=>({surface:window.readExplosherCaptureSurface(),clocks:window.readExplosherSceneClocks(),captureUi:window.__iwProjectileCaptureUiGate({phase:'observe'}),captureUiHistory:window.__iwProjectileCaptureUiHistory}));
  await page.screenshot({path:path.join(out,'normal-ui-after-wait.png')});
  fs.writeFileSync(path.join(out,'surface-admission.json'),JSON.stringify({uiError,entry:surfaceEntry,after:surfaceReady},null,2));
  if(uiError)throw Error(uiError);
  if(JSON.stringify(surfaceEntry.clocks)!==JSON.stringify(surfaceReady.clocks))throw Error('Native scene clocks advanced while awaiting ordinary UI completion');`);
driver=once(driver,"    const st = document.createElement('style'); st.textContent = 'body *{visibility:hidden!important}canvas{visibility:visible!important}'; document.head.appendChild(st);",
 "    // Preserve ordinary native UI visibility; capture admission owns no CSS override.");

driver=once(driver,"  await page.evaluate(() => {\n    const G = window.__G, g = window.__inkwave; g.debug.freeze(); g.debug.freezeBots();",`  await page.evaluate(async () => {
    const G=window.__G,g=window.__inkwave;
    if(!window.explosherEntry?.trusted||!g.frozen)throw Error('Missing trusted frozen startup');
    window.requireExplosherStyle(g.profile.style);
    window.requireExplosherStyle(G.local.character.style);
    window.explosherTargetDummyClass=(await import('__EXPLOSHER_NATIVE_DUMMY_URL__')).TargetDummyCharacter;
    window.explosherSceneSources=await (${awaitExplosherSceneSources.toString()})(G,180000,window.explosherTargetDummyClass);
    window.explosherSceneCensus=${explosherSceneCensus.toString()};
    g.debug.freeze();g.debug.freezeBots();`);
const resetSource=fs.readFileSync(path.join(sourceRoot,'scripts/check-inkwave-projectile-visuals.mjs'),'utf8');
const resetMatches=resetSource.match(/async function resetCaptureCharacter\(actor\) \{[\s\S]*?\n\}/g);
if(resetMatches?.length!==1)throw Error('Native reset helper is not unique');
const nativeReset=resetMatches[0];
driver=once(driver,'const ready = await page.evaluate(({ id, hold }) => {','const ready = await page.evaluate(async ({ id, hold }) => {');
driver=once(driver,"      G.projectiles.clear(); G.fx.clear?.();",nativeReset+`
      if(!g.frozen)throw Error('Capture loop must be frozen before native reset');
      window.resetExplosherRandom('character-reset');
      const oldCharacter=a.character;
      await resetCaptureCharacter(a);
      if(!g.frozen)throw Error('Capture loop unfroze during native reset');
      window.explosherResetReceipt={oldDisposed:oldCharacter._sourceMotionDisposed===true,oldDetached:oldCharacter.root.parent===null,
        actorOwned:a.character.actor===a,sceneOwned:a.character.root.parent===G.scene,
        constructorPreserved:a.character.constructor===oldCharacter.constructor,
        stylePreserved:JSON.stringify(a.character.style)===JSON.stringify(oldCharacter.style),
        sourceReady:a.character.sourceMotion?.status==='ready'};
      if(Object.values(window.explosherResetReceipt).some(v=>v!==true))throw Error('Native reset ownership/readiness failed');
      G.projectiles.clear(); G.fx.clear?.();`);


driver=once(driver,'      const n0 = G.projectiles.list.length;',`      const rig=G.rig;
      window.explosherPreShot={aimPoint:a.aimPoint.toArray(),aimDir:a.aimDir.toArray(),aimYaw:a.aimYaw,aimPitch:a.aimPitch,
        rig:{shoulder:rig.shoulder??0,diagnosticShoulderInitial:window.explosherShoulderInitial,time:rig.time,yaw:rig.yaw,pitch:rig.pitch,shakeSeed:rig.shakeSeed,trauma:rig.trauma,pendingTrauma:rig._traumaIn,fovKick:rig.fovKick,
          mode:rig.mode,previousMode:rig._prevMode,previousTargetMatches:rig._prevTarget===a,mapK:rig.mapK,mapOpen:rig.mapOpen,
          superJumpWasFlight:rig._sjWasFlight,superJumpLandTime:rig._sjLandT,
          dip:{x:rig.dipS.x,v:rig.dipS.v},blend:rig.blend?{active:rig.blend.active,t:rig.blend.t,dur:rig.blend.dur,
            pos:rig.blend.pos.toArray(),quaternion:rig.blend.quat.toArray(),fov:rig.blend.fov}:null,
          pivot:rig.pivot.toArray(),
          camera:rig.gameCam.position.toArray(),quaternion:rig.gameCam.quaternion.toArray(),
          springs:Object.fromEntries(['sx','sy','sz','boom','hgt','side','lensLift','kickS'].map(k=>[k,{x:rig[k].x,v:rig[k].v}]))},
        characterTime:a.character.t};
      window.explosherAimTrace=[];
      const aimFrom=G.projectiles._aimFrom;
      G.projectiles._aimFrom=function(actor,from,out){
        const result=aimFrom.call(this,actor,from,out);
        window.explosherAimTrace.push({time:G.time,local:actor===G.local,wid:actor.weapon?.id??actor.weaponId,from:from.toArray(),aimPoint:actor.aimPoint.toArray(),aimDir:actor.aimDir.toArray(),result:result.toArray()});
        return result;
      };
      const n0 = G.projectiles.list.length;`);
driver=once(driver,'      window.shapeTick = 0;',`      window.markExplosherRandomBoundary('native-birth');
      G.projectiles._aimFrom=aimFrom;
      window.shapeTick = 0;`);
driver=once(driver,'      window.shapeAim = aim; aim();',`      window.shapeAim = aim; aim();
      // Normal camera snap clears retained follow springs without changing shot physics.
      G.rig.follow(a,true);
      // Diagnostic only: follow snap omits shoulder; native first-follow uses undefined || 0.
      G.rig.shoulder=0;window.explosherShoulderInitial=0;
      G.rig.update(0);`);

driver=once(driver,'      g.debug.fire(true);',`      window.resetExplosherRandom('shot-input');
      window.markExplosherRandomBoundary('shot-input-start');
      g.debug.fire(true);`);
driver=once(driver,"        const file = `\${label}-t\${String(tick).padStart(2, '0')}-\${view}.png`;",`        const measurement = await page.evaluate(async () => {
          const G=window.__G,g=window.__inkwave,r=g.R.renderer;
          const physical=()=>JSON.stringify(G.projectiles.list.map(p=>({wid:p.wid,age:p.age,delay:p.delay,seed:p.seed,pos:p.pos.toArray(),vel:p.vel.toArray(),damage:p.damage,life:p.life,travel:p.catalog?.travel})));
          window.markExplosherRandomBoundary('before-draw-probe');
          const initial=physical(),buffers=G.projectiles._s3Shapes;
          const pos=buffers?.sparkPos.array,size=buffers?.sparkSize.array;
          for(let j=0;j<30;j++)G.projectiles._draw();
          const start=performance.now();for(let j=0;j<200;j++)G.projectiles._draw();
          const drawMs=(performance.now()-start)/200;
          if(initial!==physical()||pos!==buffers?.sparkPos.array||size!==buffers?.sparkSize.array)throw Error('draw changes physics or replaces sparkle buffers');
          r.info.reset();const t=performance.now();g.R.render();const submitMs=performance.now()-t;
          const lighting=[];g.R.scene.traverse(o=>{if(o.isLight)lighting.push({type:o.type,color:o.color?.getHex(),intensity:o.intensity,position:o.position.toArray()});});
          const palette={colorblind:G.settings.colorblind,teamHex:[...G.teamHex],teamColors:G.teamColors.map(c=>c.getHex()),local:a=>a.color.getHex()};
          const paletteReceipt={...palette,local:palette.local(G.local)};
          if(paletteReceipt.colorblind!==true||paletteReceipt.local!==0xffd21a)throw Error('Native fixed palette was not applied');
          window.markExplosherRandomBoundary('after-draw-probe');
          return {rngDiagnostic:window.readExplosherRandomDiagnostic(),rng:window.readExplosherRandom(),effects:await window.readExplosherEffects(),style:window.requireExplosherStyle(G.local.character.style),sceneClocks:window.readExplosherSceneClocks(),startup:window.explosherEntry,sceneCensus:window.explosherSceneCensus(G,g.R.scene,window.explosherTargetDummyClass),sceneSources:window.explosherSceneSources,palette:paletteReceipt,preShot:window.explosherPreShot,aimTrace:window.explosherAimTrace,nativeReset:window.explosherResetReceipt,lighting,viewport:{width:r.domElement.width,height:r.domElement.height,pixelRatio:r.getPixelRatio()},physical:JSON.parse(initial),camera:{position:G.camera.position.toArray(),quaternion:G.camera.quaternion.toArray(),fov:G.camera.fov},
            time:G.time,inkHex:G.local.color.getHex(),render:{...r.info.render},memory:{...r.info.memory},
            sparkles:G.projectiles.s3ShapeCounts?.sparkles??0,drawCpuMs:drawMs,renderSubmitMs:submitMs,
            gpuTimerMs:null,gpuTimerStatus:'not measured; submit CPU time is not GPU time',
            reusedSparkleBuffers:true};
        });
        const file = \`\${label}-t\${String(tick).padStart(2, '0')}-\${view}.png\`;`);
driver=once(driver,"  page.on('pageerror', e => console.error('pageerror', String(e)));","  const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e)));");
driver=once(driver,"        await page.locator('canvas').first().screenshot({ path: path.join(out, file) });",`        if(pageErrors.length)throw Error('Native page errors: '+pageErrors.join(' | '));
        if(!(measurement.render.calls>0&&measurement.render.triangles>0))throw Error('Native scene did not draw');
        measurement.captureSurface=await page.evaluate(()=>{const s=window.readExplosherCaptureSurface();if(!window.explosherSurfaceReady(s))throw Error('Native capture surface/UI no longer ready');window.__iwProjectileCaptureUiGate({phase:'capture',requireReady:true});return s;});
        const png=await page.locator('#game-canvas').screenshot({path:path.join(out,file)});
        const imageStats=await page.evaluate(async data=>{
          const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();
          const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
          const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
          const pixels=ctx.getImageData(0,0,img.width,img.height).data;
          let lo=255,hi=0,opaque=0;for(let i=0;i<pixels.length;i+=4){if(!pixels[i+3])continue;opaque++;const v=(pixels[i]+pixels[i+1]+pixels[i+2])/3;lo=Math.min(lo,v);hi=Math.max(hi,v);}
          return {width:img.width,height:img.height,opaque,range:hi-lo};
        },png.toString('base64'));
        if(imageStats.width!==measurement.viewport.width||imageStats.height!==measurement.viewport.height||!imageStats.opaque||imageStats.range<8)throw Error('Empty or flat native capture');
        if(pageErrors.length)throw Error('Native page errors during capture: '+pageErrors.join(' | '));`);
driver=once(driver,'manifest.push({ label, tick, view, file, ...info });','manifest.push({ label, tick, view, file, ...info, measurement, imageStats });');
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
const dummyPath='_versions/'+build.build.revision+'/patches/practice-range/runtime/dummy.mjs';
if(!build.artifacts[dummyPath])throw Error('Native target dummy module missing from build');
const dummySha=hash(fs.readFileSync(path.join(site,dummyPath)));
if(dummySha!==build.artifacts[dummyPath])throw Error('Native target dummy emitted hash mismatch');
driver=once(driver,"'__EXPLOSHER_NATIVE_DUMMY_URL__'",JSON.stringify('/'+dummyPath));
if(hash(JSON.stringify(build.artifacts))!==build.contentHash)throw Error('Build content hash mismatch');
const shapePath='patches/splatoon3/runtime/s3-projectile-shapes.mjs';
if(hash(git(['show',actualSourceSha+':'+shapePath]))!==hash(fs.readFileSync(path.join(sourceRoot,shapePath))))throw Error('Checkout shape differs from committed source');
const emittedPaths=Object.keys(build.artifacts).filter(p=>p===shapePath||p.endsWith('/'+shapePath));
if(!emittedPaths.length)throw Error('Shape missing from manifest');
const emitted=emittedPaths.map(p=>{const sha256=hash(fs.readFileSync(path.join(site,p)));if(sha256!==build.artifacts[p])throw Error('Emitted shape hash mismatch');return {path:p,sha256};});
driver="import crypto from 'node:crypto';\n"+driver;
driver=once(driver,'let browser;',"const servedShapes=[],servedDummy=[],responseErrors=[],pendingShapes=new Set();\nlet browser;");
driver=once(driver,"  page.setDefaultTimeout(240000);",`  page.setDefaultTimeout(240000);
  page.on('response',res=>{
    const p=new URL(res.url()).pathname;
    if(!p.endsWith('/patches/splatoon3/runtime/s3-projectile-shapes.mjs')&&p!==${JSON.stringify('/'+dummyPath)})return;
    const pending=res.body().then(body=>(p===${JSON.stringify('/'+dummyPath)}?servedDummy:servedShapes).push({url:res.url(),sha256:crypto.createHash('sha256').update(body).digest('hex')})).catch(error=>responseErrors.push(String(error)));
    pendingShapes.add(pending);pending.finally(()=>pendingShapes.delete(pending));
  });`);
driver=once(driver,"  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));",`  await Promise.all([...pendingShapes]);
  if(responseErrors.length)throw Error('Response body verification failed: '+responseErrors.join(' | '));
  if(!servedDummy.length||servedDummy.some(r=>r.sha256!==${JSON.stringify(dummySha)}))throw Error('Served dummy identity mismatch');
  fs.writeFileSync(path.join(out,'served-dummy.json'),JSON.stringify(servedDummy,null,2));
  const accepted=${JSON.stringify(shapeOverlay?[shapeOverlay.transformedEmittedSha256]:emitted.map(e=>e.sha256))};
  fs.writeFileSync(path.join(out,'served-shapes.json'),JSON.stringify(servedShapes,null,2));
  if(!servedShapes.length||servedShapes.some(r=>!accepted.includes(r.sha256)))throw Error('Served shape identity mismatch');
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));`);
if(preflight){
  driver=once(driver,'for(let j=0;j<30;j++)G.projectiles._draw();','for(let j=0;j<0;j++)G.projectiles._draw();');
  driver=once(driver,'for(let j=0;j<200;j++)G.projectiles._draw();','for(let j=0;j<1;j++)G.projectiles._draw();');
  driver=once(driver,'const drawMs=(performance.now()-start)/200;','const drawMs=(performance.now()-start);');
}

driver="const requireControlledStartupPair="+requireControlledStartupPair.toString()+";\nconst expectedFrame="+JSON.stringify(expectedFrame)+";\n"+driver;
driver=once(driver,"        if(pageErrors.length)throw Error('Native page errors: '+pageErrors.join(' | '));",`        if(tick===0&&expectedFrame){
          requireControlledStartupPair(expectedFrame.measurement.controlledStartup,measurement.controlledStartup);
          const effective=r=>({...r,blend:r.blend?.active?r.blend:null,superJumpLandTime:r.superJumpLandTime<.45?r.superJumpLandTime:null});
          if(!measurement.preShot?.rig||!expectedFrame.measurement.preShot?.rig||JSON.stringify(effective(measurement.preShot.rig))!==JSON.stringify(effective(expectedFrame.measurement.preShot.rig)))throw Error('Full-capture effective rig differs from preflight');
          for(const k of ['rng','effects','style','sceneClocks','startup','aimTrace','nativeReset','physical','palette','inkHex','time','sparkles','lighting','viewport'])
            if(JSON.stringify(measurement[k])!==JSON.stringify(expectedFrame.measurement[k]))throw Error('Full-capture frame0 differs from preflight: '+k);
          if(view===expectedFrame.view&&JSON.stringify(measurement.camera)!==JSON.stringify(expectedFrame.measurement.camera))throw Error('Full-capture frame0 differs from preflight: camera');
          for(const k of ['aimPoint','aimDir','aimYaw','aimPitch','characterTime'])
            if(JSON.stringify(measurement.preShot[k])!==JSON.stringify(expectedFrame.measurement.preShot[k]))throw Error('Full-capture preShot differs: '+k);
        }
        if(pageErrors.length)throw Error('Native page errors: '+pageErrors.join(' | '));`);

if(shapeOverlay){
  const rel='patches/splatoon3/runtime/s3-projectile-shapes.mjs';
  if(shapeOverlay.buildContentHash!==build.contentHash||JSON.stringify(shapeOverlay.paths)!==JSON.stringify([rel,'_versions/'+build.build.revision+'/'+rel]))throw Error('Shape overlay build/path mismatch');
  for(const p of shapeOverlay.paths)if(build.artifacts[p]!==shapeOverlay.nativeEmittedSha256||hash(fs.readFileSync(path.join(site,p)))!==shapeOverlay.nativeEmittedSha256)throw Error('Shape overlay original byte mismatch');
  driver=once(driver,"  const file = path.resolve(site, u === '/' ? 'index.html' : '.' + decodeURIComponent(u));",`  if(${JSON.stringify(shapeOverlay.paths.map(p=>'/'+p))}.includes(u)){
    res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});fs.createReadStream(${JSON.stringify(shapeOverlay.file)}).pipe(res);return;
  }
  const file = path.resolve(site, u === '/' ? 'index.html' : '.' + decodeURIComponent(u));`);
  driver=once(driver,'let browser;', 'const servedShapeOverlay=[],pendingShapeOverlay=new Set(),shapeOverlayErrors=[];\nlet browser;');
  driver=once(driver,'  page.setDefaultTimeout(240000);',`  page.setDefaultTimeout(240000);
  page.on('response',res=>{
    if(!${JSON.stringify(shapeOverlay.paths.map(p=>'/'+p))}.includes(new URL(res.url()).pathname))return;
    const p=res.body().then(body=>servedShapeOverlay.push({url:res.url(),sha256:crypto.createHash('sha256').update(body).digest('hex')})).catch(e=>shapeOverlayErrors.push(String(e)));
    pendingShapeOverlay.add(p);p.finally(()=>pendingShapeOverlay.delete(p));
  });`);
  driver=once(driver,'  await enterRangeFromMenu(page,base);',`  await enterRangeFromMenu(page,base);
  await Promise.all([...pendingShapeOverlay]);
  fs.writeFileSync(path.join(out,'served-shape-overlay.json'),JSON.stringify({responses:servedShapeOverlay,errors:shapeOverlayErrors},null,2));
  if(shapeOverlayErrors.length||!servedShapeOverlay.length||servedShapeOverlay.some(r=>r.sha256!==${JSON.stringify(shapeOverlay.transformedEmittedSha256)}))throw Error('Consumed shape overlay byte mismatch');`);
}
if(controlled){
  if(controlled.buildContentHash!==build.contentHash||controlled.paths.length!==2||controlled.paths[0]!=='src/main.js'||controlled.paths[1]!=='_versions/'+build.build.revision+'/src/main.js')throw Error('Controlled module build/path mismatch');
  for(const p of controlled.paths)if(build.artifacts[p]!==controlled.originalEmittedSha256||hash(fs.readFileSync(path.join(site,p)))!==controlled.originalEmittedSha256)throw Error('Controlled original main mismatch');
  driver=once(driver,"  const file = path.resolve(site, u === '/' ? 'index.html' : '.' + decodeURIComponent(u));",`  if(${JSON.stringify(controlled.paths.map(p=>'/'+p))}.includes(u)){
    res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});fs.createReadStream(${JSON.stringify(controlled.file)}).pipe(res);return;
  }
  const file = path.resolve(site, u === '/' ? 'index.html' : '.' + decodeURIComponent(u));`);
  driver=once(driver,'let browser;', 'const servedControlledMain=[],pendingControlledMain=new Set(),controlledMainErrors=[];\nlet browser;');
  driver=once(driver,'  page.setDefaultTimeout(240000);',`  page.setDefaultTimeout(240000);
  page.on('response',res=>{
    if(!${JSON.stringify(controlled.paths.map(p=>'/'+p))}.includes(new URL(res.url()).pathname))return;
    const p=res.body().then(body=>servedControlledMain.push({url:res.url(),sha256:crypto.createHash('sha256').update(body).digest('hex')})).catch(e=>controlledMainErrors.push(String(e)));
    pendingControlledMain.add(p);p.finally(()=>pendingControlledMain.delete(p));
  });`);
  driver=once(driver,'  await enterRangeFromMenu(page,base);',`  await enterRangeFromMenu(page,base);
  await Promise.all([...pendingControlledMain]);
  fs.writeFileSync(path.join(out,'served-controlled-main.json'),JSON.stringify({responses:servedControlledMain,errors:controlledMainErrors},null,2));
  if(controlledMainErrors.length||!servedControlledMain.length||servedControlledMain.some(r=>r.sha256!==${JSON.stringify(controlled.transformedEmittedSha256)}))throw Error('Consumed controlled main mismatch');
  const startup=await page.evaluate(()=>globalThis.__inkwaveExplosherControlledStartup);
  if(!startup?.controlledInitialCondition||startup.naturalBootAccepted!==false)throw Error('Controlled boot did not complete');
  fs.writeFileSync(path.join(out,'controlled-startup.json'),JSON.stringify(startup,null,2));`);
  driver=once(driver,'return {rngDiagnostic:', 'return {controlledStartup:globalThis.__inkwaveExplosherControlledStartup,rngDiagnostic:');
}
// Controlled QA observation only; ordinary startup is not delayed, geometry is
// not repaired, and the original native memory/resource assertion is unchanged.
if(!runtimeUIRoute)driver=instrumentExplosherGeometryDriver(driver);
const copy=path.join(out,'native-capture-driver.mjs');fs.writeFileSync(copy,driver);
const captureProtocolSha256=hash(JSON.stringify([fs.readFileSync(fileURLToPath(import.meta.url),'utf8'),...['inkwave-explosher-startup.mjs','inkwave-explosher-scene-census.mjs','inkwave-explosher-capture-surface.mjs','inkwave-explosher-volume-barrier.mjs','inkwave-explosher-stage-admission.mjs','inkwave-explosher-video-gate.mjs','inkwave-projectile-capture-ui.mjs','inkwave-range-menu-entry.mjs','inkwave-explosher-geometry-lifetime.mjs'].map(p=>fs.readFileSync(path.join(root,'scripts/lib',p),'utf8'))]));
const receipt={commonBuildAdmission,captureProtocolSha256,stageAdmission,captureMode:preflight?'preflight':video?'continuous-native-60Hz':'multi-view-stills',captureTicks,captureViews,simulationHz:60,captureUiGateSha256:hash(installProjectileCaptureUiGate.toString()),shapeOverlay,controlledMain:controlled,sourceSha,actualSourceSha,nativeDummy:{path:dummyPath,sha256:dummySha},preflightBindingSha256:expectedText?hash(expectedText):null,build,originalDriverSha256:originalHash,diagnosticDriverSha256:hash(driver),
  geometryLifetime:{controlledInstrumentedQA:!runtimeUIRoute,artifact:runtimeUIRoute?null:'geometry-lifetime.json',nativeResourceGateUnchanged:true,ordinaryInputAcceptance:false,gpuAllocationOwnershipProven:false},
  nativeResetHelperSha256:hash(nativeReset),
  sourceShapeSha256:hash(fs.readFileSync(path.join(sourceRoot,'patches/splatoon3/runtime/s3-projectile-shapes.mjs'))),
  emittedShapes:emitted,seed:0x515e7021,
  boundaries:['Real emitted game and native renderer; fixed range input.',controlled?'QA-only awaited native volume readiness in main; no Character rewrite.':'No historical source/character rewrite.',runtimeUIRoute?'Exact reviewed runtime/UI four-delta pair; projectile shape unchanged. No flight improvement claim.':'Only flight glitter changes; muzzle/impact, hit/paint/speed unchanged.','Render CPU and resource counts measured; GPU elapsed time and allocations not measured.']};
// Validate the exact current lane using a role-complete counterpart; cross-lane equality remains in stage gates.
if(!runtimeUIRoute){
const counterpart={...receipt,shapeOverlay:{...shapeOverlay,lane:shapeOverlay.lane==='before'?'after':'before',transformedEmittedSha256:shapeOverlay.lane==='before'?shapeOverlay.nativeEmittedSha256:shapeOverlay.baselineEmittedSha256}};
requireInverseShapePair(...(shapeOverlay.lane==='before'?[receipt,counterpart]:[counterpart,receipt]));
}else{receipt.diagnosticOnly=true;receipt.fullPairAccepted=false;receipt.protocol=commonBuildAdmission.mode;}
if(stageAdmission&&JSON.stringify(explosherCaptureIdentity(receipt))!==JSON.stringify(stageAdmission.laneProvenance[shapeOverlay.lane]))throw Error('Current capture provenance differs from admitted prior stage');
fs.writeFileSync(path.join(out,'source-receipt.json'),JSON.stringify(receipt,null,2));
const run=spawnSync(process.execPath,[copy,site,out,'s3-slosher-washtub'],{stdio:'inherit',env:{...process.env,TICKS:captureTicks.join(','),VIEWS:captureViews.join(',')}});
if(run.status!==0)process.exit(run.status||1);
const captures=JSON.parse(fs.readFileSync(path.join(out,'manifest.json'),'utf8'));
for(const c of captures)c.sha256=hash(fs.readFileSync(path.join(out,c.file)));
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(captures,null,2));
const expected=new Set(captureTicks.flatMap(t=>captureViews.map(v=>'s3-slosher-washtub:'+t+':'+v)));
if(captures.length!==expected.size)throw Error('Wrong native capture count');
for(const c of captures){
  if(!expected.delete(c.label+':'+c.tick+':'+c.view))throw Error('Duplicate or unexpected native capture');
  if((c.tick===3||preflight)&&!(c.count>0&&c.measurement.sparkles>0&&c.measurement.render.points>0))throw Error('Missing live Explosher in native capture');
  if(preflight){
    const ps=c.measurement.physical,trace=c.measurement.aimTrace;
    if(c.count!==1||ps.length!==1||ps[0].wid!=='s3-slosher-washtub'||!Number.isFinite(ps[0].seed))throw Error('Unexpected native shot identity');
    if(!Array.isArray(trace)||!trace.length||trace.some(t=>!t.local||t.wid!=='s3-slosher-washtub'||![t.time,...t.from,...t.aimPoint,...t.aimDir,...t.result].every(Number.isFinite)))throw Error('Missing or invalid native aim trace');
  }
}
if(expected.size)throw Error('Missing expected native captures');
if(preflight)console.log('EXPLOSHER_PREFLIGHT_RECEIPT '+JSON.stringify(captures));

