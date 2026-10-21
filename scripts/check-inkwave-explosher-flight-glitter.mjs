#!/usr/bin/env node
// Reuse the existing native range driver. Only the diagnostic copy receives
// deterministic clocks and receipts; neither production checkout is rewritten.
import fs from 'node:fs';
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
const preflight=process.env.EXPLOSHER_PREFLIGHT==='1';
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
const rangeEntryUrl=new URL('./lib/inkwave-range-menu-entry.mjs',import.meta.url).href;
let driver=fs.readFileSync(path.join(root,'scripts/render-inkwave-projectile-shapes.mjs'),'utf8');
const originalHash=hash(driver);
driver=driver.replace(/^#!.*\n/,'');
driver="import { enterRangeFromMenu } from "+JSON.stringify(rangeEntryUrl)+";\n"+driver;
driver=once(driver,"from 'playwright'","from "+JSON.stringify(import.meta.resolve('playwright')));
driver=once(driver,"  await page.goto(base + '/?range&skipTitle');",`  await page.addInitScript(() => {
    // Normal game accessibility palette selection in this isolated diagnostic browser.
    localStorage.setItem('inkwave.settings',JSON.stringify({colorblind:true}));
    localStorage.setItem('inkwave.profile',JSON.stringify({style:{hair:0,skin:7,outfit:5,eyes:1,hat:0,brows:3}}));
    window.readExplosherSceneClocks=${readExplosherSceneClocks.toString()};
    window.requireExplosherStyle=${requireExplosherStyle.toString()};
    (${installExplosherEarlyFreeze.toString()})();
    (${installExplosherRandom.toString()})(${preflight});
    window.readExplosherEffects=${readExplosherEffects.toString()};
    window.readExplosherCaptureSurface=${readExplosherCaptureSurface.toString()};
    window.explosherSurfaceReady=${explosherSurfaceReady.toString()};
  });
  await enterRangeFromMenu(page,base);
  const surfaceEntry=await page.evaluate(()=>({surface:window.readExplosherCaptureSurface(),clocks:window.readExplosherSceneClocks()}));
  await page.screenshot({path:path.join(out,'normal-ui-entry.png')});
  let uiError=null;
  try {await page.waitForFunction(()=>window.explosherSurfaceReady(window.readExplosherCaptureSurface()),null,{timeout:60000});}
  catch(error){uiError=String(error);}
  const surfaceReady=await page.evaluate(()=>({surface:window.readExplosherCaptureSurface(),clocks:window.readExplosherSceneClocks()}));
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
const resetSource=fs.readFileSync(path.join(root,'scripts/check-inkwave-projectile-visuals.mjs'),'utf8');
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
        measurement.captureSurface=await page.evaluate(()=>{const s=window.readExplosherCaptureSurface();if(!window.explosherSurfaceReady(s))throw Error('Native capture surface/UI no longer ready');return s;});
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
  const accepted=${JSON.stringify(emitted.map(e=>e.sha256))};
  if(!servedShapes.length||servedShapes.some(r=>!accepted.includes(r.sha256)))throw Error('Served shape identity mismatch');
  fs.writeFileSync(path.join(out,'served-shapes.json'),JSON.stringify(servedShapes,null,2));
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));`);
if(preflight){
  driver=once(driver,'for(let j=0;j<30;j++)G.projectiles._draw();','for(let j=0;j<0;j++)G.projectiles._draw();');
  driver=once(driver,'for(let j=0;j<200;j++)G.projectiles._draw();','for(let j=0;j<1;j++)G.projectiles._draw();');
  driver=once(driver,'const drawMs=(performance.now()-start)/200;','const drawMs=(performance.now()-start);');
}

driver="const expectedFrame="+JSON.stringify(expectedFrame)+";\n"+driver;
driver=once(driver,"        if(pageErrors.length)throw Error('Native page errors: '+pageErrors.join(' | '));",`        if(tick===0&&expectedFrame){
          for(const k of ['rng','effects','style','sceneClocks','startup','aimTrace','nativeReset','physical','palette','inkHex','time','sparkles','lighting','viewport'])
            if(JSON.stringify(measurement[k])!==JSON.stringify(expectedFrame.measurement[k]))throw Error('Full-capture frame0 differs from preflight: '+k);
          if(view===expectedFrame.view&&JSON.stringify(measurement.camera)!==JSON.stringify(expectedFrame.measurement.camera))throw Error('Full-capture frame0 differs from preflight: camera');
          for(const k of ['aimPoint','aimDir','aimYaw','aimPitch','characterTime'])
            if(JSON.stringify(measurement.preShot[k])!==JSON.stringify(expectedFrame.measurement.preShot[k]))throw Error('Full-capture preShot differs: '+k);
        }
        if(pageErrors.length)throw Error('Native page errors: '+pageErrors.join(' | '));`);

const copy=path.join(out,'native-capture-driver.mjs');fs.writeFileSync(copy,driver);
const receipt={sourceSha,actualSourceSha,nativeDummy:{path:dummyPath,sha256:dummySha},preflightBindingSha256:expectedText?hash(expectedText):null,build,originalDriverSha256:originalHash,diagnosticDriverSha256:hash(driver),
  nativeResetHelperSha256:hash(nativeReset),
  sourceShapeSha256:hash(fs.readFileSync(path.join(sourceRoot,'patches/splatoon3/runtime/s3-projectile-shapes.mjs'))),
  emittedShapes:emitted,seed:0x515e7021,
  boundaries:['Real emitted game and native renderer; fixed range input.','No historical source/character rewrite.','Only flight glitter changes; muzzle/impact, hit/paint/speed unchanged.','Render CPU and resource counts measured; GPU elapsed time and allocations not measured.']};
fs.writeFileSync(path.join(out,'source-receipt.json'),JSON.stringify(receipt,null,2));
const run=spawnSync(process.execPath,[copy,site,out,'s3-slosher-washtub'],{stdio:'inherit',env:{...process.env,TICKS:preflight?'0':'0,3,8,14,22,30',VIEWS:preflight?'behind':'behind,tele-side,tele-oblique'}});
if(run.status!==0)process.exit(run.status||1);
const captures=JSON.parse(fs.readFileSync(path.join(out,'manifest.json'),'utf8'));
for(const c of captures)c.sha256=hash(fs.readFileSync(path.join(out,c.file)));
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(captures,null,2));
const expected=new Set((preflight?[0]:[0,3,8,14,22,30]).flatMap(t=>(preflight?['behind']:['behind','tele-side','tele-oblique']).map(v=>'s3-slosher-washtub:'+t+':'+v)));
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

