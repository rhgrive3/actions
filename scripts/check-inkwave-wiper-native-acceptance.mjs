#!/usr/bin/env node
// Additive current-head evidence. This is controlled native simulation and
// rendering, NOT ordinary-input, retail-equivalence, or hardware-performance QA.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {captureSourceIdentity} from './lib/inkwave-capture-source-identity.mjs';
import {verifyRuntimeBuild, hash} from './lib/inkwave-runtime-evidence.mjs';
import {enterRangeFromMenu} from './lib/inkwave-range-menu-entry.mjs';
import {launchSandboxBrowser, closeWiperCaptureOwners} from './lib/inkwave-sandbox-browser.mjs';
import {WIPER_CAPTURE_CASES, WIPER_CAPTURE_FRAMES, assertWiperCaptureReceipt, wiperBuildReceiptBinding} from './lib/inkwave-wiper-acceptance-contract.mjs';

export function initializeWiperCapture({id}) {
  localStorage.setItem('inkwave.settings', JSON.stringify({quality:'high',shadows:true,bloom:true,lang:'ja',colorblind:true,fov:82,fovMode:'h',cameraShake:0}));
  localStorage.setItem('inkwave.profile', JSON.stringify({name:'Wiper QA',level:1,xp:0,wins:0,matches:0,totalTurf:0,weapon:id,
    style:{hair:0,skin:7,outfit:5,eyes:1,hat:0,brows:3}}));
  localStorage.setItem('inkwave.splatoon3.gear.v1', JSON.stringify(Array.from({length:3},()=>({main:'none',subs:['none','none','none']}))));
  window.__wiperResetRandom = seed => {
    let state=seed>>>0,calls=0;
    Math.random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;calls++;return(state>>>0)/4294967296;};
    window.__wiperRandomState=()=>({state:state>>>0,calls});
  };
  window.__wiperResetRandom(0x515e7021);
  // Freeze at first publication, before variable rAF world updates. Menu
  // transitions still use trusted pointer gestures in enterRangeFromMenu.
  Object.defineProperty(window,'__inkwave',{configurable:true,set(game){
    Object.defineProperty(window,'__inkwave',{value:game,writable:true,configurable:true,enumerable:true});
    game.frozen=true;
  }});
  document.addEventListener('click',event=>{
    if(event.isTrusted&&event.target?.closest?.('.iw-ui [data-id="mode-range"]')&&window.__inkwave?.menus?.current==='mode') {
      window.__inkwave.api.setLoadout({weapon:id});
      window.__wiperResetRandom(0x515e7021);
    }
  },true);
}

// Shared executable scheduler: the browser uses this exact function, and the
// source regression supplies actual production Actor/controller/projectiles.
export function createWiperNativeShotSchedule(testCase,{setFire,step,readActive,readHeld}) {
  const schedule={tick:0,firstBirth:null,held:null};
  const active=()=>{
    const live=readActive();
    if(live.length){
      const p=live[0];
      if(live.length!==1||p.id!==testCase.id||p.sourceActor!==testCase.sourceActor||p.descriptor!==testCase.descriptor)throw Error('Wrong native shot/action/source owner');
    }
    return live;
  };
  schedule.advance=()=>{
    step();schedule.tick++;const live=active();
    if(live.length&&!schedule.firstBirth)schedule.firstBirth={tick:schedule.tick,...live[0]};
  };
  schedule.advanceTo=frame=>{
    while(schedule.tick-schedule.firstBirth.tick+1<frame)schedule.advance();
    if(schedule.tick-schedule.firstBirth.tick+1!==frame||active().length!==1)throw Error('Required exact active shot phase missing');
  };
  setFire(true);for(let i=0;i<testCase.hold;i++)schedule.advance();
  schedule.held=readHeld();setFire(false);
  while(!schedule.firstBirth&&schedule.tick<140)schedule.advance();
  if(!schedule.firstBirth)throw Error('No bounded first native active slash birth');
  if(schedule.tick!==schedule.firstBirth.tick)throw Error('First active frame was passed before capture');
  return schedule;
}

export function wrapWiperDrawCallback(mesh,observe) {
  const own=Object.getOwnPropertyDescriptor(mesh,'onBeforeRender'),original=mesh.onBeforeRender;
  if(typeof original!=='function'||own&&(!Object.hasOwn(own,'value')||!own.writable))throw Error('Unsupported native draw callback owner');
  const wrapper=function(...args){original.apply(this,args);observe(args);};
  Object.defineProperty(mesh,'onBeforeRender',own?{...own,value:wrapper}:{value:wrapper,writable:true,enumerable:false,configurable:true});
  return ()=>{
    if(mesh.onBeforeRender!==wrapper)throw Error('Native draw callback replaced by unrelated owner');
    if(own)Object.defineProperty(mesh,'onBeforeRender',own);else delete mesh.onBeforeRender;
  };
}

// Read exactly once at the original fail-closed boundary. A pre-existing GL
// error is intentionally not cleared: it remains a capture failure. The code
// and context help diagnose it without claiming which earlier call caused it.
export function assertWiperWebGLError(gl, frame, view) {
  const code=gl.getError();
  if(code) {
    // Optional context reads must never replace the original GL failure.
    let lost='unknown',width='unknown',height='unknown';
    try { if(typeof gl.isContextLost==='function')lost=gl.isContextLost(); } catch {}
    try { width=gl.drawingBufferWidth; } catch {}
    try { height=gl.drawingBufferHeight; } catch {}
    throw Error(`Native render WebGL error: code=0x${Number(code).toString(16)} frame=${frame} view=${view} contextLost=${lost} drawingBuffer=${width}x${height}`);
  }
}

export async function installWiperProbe(testCase) {
  const THREE=await import('three'),G=window.__G,g=window.__inkwave,a=G.local,P=G.projectiles,r=G.renderer,gl=r.getContext();
  if(!g.frozen||!G.match?.range||G.match.state!=='playing'||a.weaponId!==testCase.id)throw Error('Native controlled range admission mismatch');
  await a.character.sourceMotion.ready;
  if(a.character._warmed)await a.character._warmed;
  if(a.character.sourceMotion.status!=='ready')throw Error('Local source motion not ready');
  g.debug.freezeBots();g.input.keys.clear();g.input.pressed.clear();g.debug.fire(false);
  // Explicit controlled fixture: existing range travel, actor pose/ink reset,
  // camera follow and fixed 60Hz settling. No projectile constructor/retagging.
  G.match.range.travel('roller');a.pos.set(-26.5,.04,4);a.vel.set(0,0,0);a.yaw=a.aimYaw=0;a.ink=100;
  const aim=()=>{g.rig.yaw=0;g.rig.pitch=.06;};aim();g.rig.follow(a,true);g.R.setDynamicScale(1);
  const step=()=>{aim();g._skipRender=true;try{g._frame(1/60);}finally{g._skipRender=false;}};
  for(let i=0;i<60;i++)step();
  if(!a.alive||!a.grounded||P.list.length)throw Error('Controlled stance did not settle cleanly');
  g.R.render();
  if(g.settings.quality!=='high'||!g.R.gtao||!r.shadowMap.enabled||gl.drawingBufferWidth!==960||gl.drawingBufferHeight!==720)throw Error('High-quality native AO/shadow/full-frame configuration required');
  const initialWet=P._s3Shapes?.wetSlashV;
  if(initialWet)throw Error('Fresh control must not preallocate wet geometry');
  window.__wiperResetRandom(0x515e7080);
  const camState=cam=>({position:cam.position.toArray(),quaternion:cam.quaternion.toArray(),matrix:cam.matrixWorld.toArray(),projection:cam.projectionMatrix.toArray(),fov:cam.fov,near:cam.near,far:cam.far});
  const state=()=>({time:G.time,gameTime:g.time,rng:window.__wiperRandomState(),camera:camState(G.camera),
    actors:G.actors.map(x=>({id:x.weaponId,hp:x.hp,ink:x.ink,alive:x.alive,pos:x.pos.toArray(),vel:x.vel.toArray(),rootVisible:x.character?.root?.visible})),
    projectiles:P.list.map(p=>({id:p.wid,sourceActor:p.catalog?.r?.sourceActor,descriptor:p.catalog?.descriptor?.key,
      birthPending:!!p.catalog?.birthPending,delay:p.delay??0,age:p.age,seed:p.seed,pos:p.pos.toArray(),vel:p.vel.toArray(),damage:p.damage,life:p.life,radius:p.radius,size:p.size,grav:p.grav,drag:p.drag,travel:p.catalog?.travel,
      lobes:(p.catalog?.lobes||[]).map(l=>({age:l.age??null,pos:l.pos?.toArray?.()??null,vel:l.vel?.toArray?.()??null,travel:l.travel??null,dead:!!l.dead}))})),
    paint:Array.from(G.paint.counts||[]),visibility:(()=>{const rows=[];G.scene.traverse(o=>rows.push([o.id,o.visible,o.layers.mask]));return rows;})()});
  const owned=()=>P.list.filter(p=>p.owner===a&&p.delay<=0&&!p.catalog?.birthPending);
  const camera=new THREE.PerspectiveCamera(50,960/720,.05,250),focus=a.pos.clone().add(new THREE.Vector3(0,1.1,6));
  camera.position.copy(focus).add(new THREE.Vector3(-16,3,2));camera.lookAt(focus);camera.updateMatrixWorld(true);
  const readPixels=()=>{
    const bytes=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
    gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    let lo=255,hi=0;for(let i=0;i<bytes.length;i+=4){const n=(bytes[i]+bytes[i+1]+bytes[i+2])/3;lo=Math.min(lo,n);hi=Math.max(hi,n);}
    if(hi-lo<8)throw Error('Flat rendered image');
    return {luminanceRange:hi-lo,drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight]};
  };
  let refs=null;
  const scheduler=window.__createWiperNativeShotSchedule(testCase,{setFire:on=>g.debug.fire(on),step,
    readActive:()=>owned().map(p=>({id:p.wid,sourceActor:p.catalog?.r?.sourceActor,descriptor:p.catalog?.descriptor?.key,age:p.age,seed:p.seed,pos:p.pos.toArray()})),
    readHeld:()=>({chargeF:a.weaponRunner.catalogState?.chargeF,charge:a.weaponRunner.charge,cooldown:a.weaponRunner.cooldown})});
  const {firstBirth,held}=scheduler;
  window.__wiperProbe={state,firstBirth,held,initial:{actor:a.pos.toArray(),source:a.character.sourceMotion.status,quality:g.settings.quality,
      settings:JSON.parse(localStorage.getItem('inkwave.settings')),profile:JSON.parse(localStorage.getItem('inkwave.profile')),
      gear:JSON.parse(localStorage.getItem('inkwave.splatoon3.gear.v1')),teams:G.teamColors.map(c=>c.getHexString()),camera:camState(G.camera),inspectionCamera:camState(camera),
      environment:{time:G.env?.time,theme:G.env?.theme,grade:G.env?.grade},pipeline:{ao:!!g.R.gtao,shadows:r.shadowMap.enabled,bloom:!!g.R.bloom?.enabled},bootSeed:'0x515e7021',shotSeed:'0x515e7080'},
    capture(frame,view){
      scheduler.advanceTo(frame);
      const R=P._s3Shapes,mesh=R?.[testCase.mesh];
      if(!mesh||mesh.count!==2)throw Error('Missing actual two-instance native slash');
      const currentRefs=[R,mesh,mesh.geometry,mesh.material,mesh.instanceMatrix.array,mesh.instanceColor.array];
      if(refs&&refs.some((x,i)=>x!==currentRefs[i]))throw Error('Native mesh/geometry/buffers replaced during flight');refs=currentRefs;
      const before=JSON.stringify(state()),counts=JSON.stringify(P.s3ShapeCounts);
      P._draw();P._draw();
      if(before!==JSON.stringify(state())||counts!==JSON.stringify(P.s3ShapeCounts))throw Error('Repeated shape draw mutated gameplay/RNG/counts');
      const vertices=mesh.geometry.getAttribute('position'),index=mesh.geometry.index;
      let bytes=0;for(const attribute of Object.values(mesh.geometry.attributes))bytes+=attribute.array.byteLength;if(index)bytes+=index.array.byteLength;
      const m=new THREE.Matrix4(),v=new THREE.Vector3();let visibleProjectedVertices=0;
      mesh.updateMatrixWorld(true);
      for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,m);m.premultiply(mesh.matrixWorld);for(let j=0;j<vertices.count;j++){
        v.fromBufferAttribute(vertices,j).applyMatrix4(m).project(camera);if(Math.abs(v.x)<1&&Math.abs(v.y)<1&&Math.abs(v.z)<1)visibleProjectedVertices++;
      }}
      const matrices=Array.from(mesh.instanceMatrix.array.slice(0,mesh.count*16));
      const drawReceipts=[],restoreDraw=window.__wrapWiperDrawCallback(mesh,args=>drawReceipts.push({override:!!args[1].overrideMaterial,inspection:args[2]===camera}));
      const previousTarget=r.getRenderTarget(),previousAuto=r.autoClear,previousInfoAuto=r.info.autoReset;
      let pixels,render;
      try{
        r.info.autoReset=false;r.info.reset();
        if(view==='native-postprocessed')g.R.render();
        else if(view==='fixed-side-raw'){r.setRenderTarget(null);r.autoClear=true;r.render(G.scene,camera);}
        else throw Error('Unknown capture view');
        render={...r.info.render};pixels=readPixels();
      }finally{try{restoreDraw();}finally{r.setRenderTarget(previousTarget);r.autoClear=previousAuto;r.info.autoReset=previousInfoAuto;}}
      if(!drawReceipts.some(d=>!d.override))throw Error('Actual source-bound mesh did not draw in this view');
      window.__assertWiperWebGLError(gl,frame,view);
      if(before!==JSON.stringify(state()))throw Error('Render changed gameplay/native camera/visibility/clock/RNG');
      return {frame,tick:scheduler.tick,state:state(),drawPure:true,mesh:{name:testCase.mesh,instances:mesh.count,trianglesPerInstance:(index?.count??vertices.count)/3,
        attributeBytes:bytes,projectedVertices:vertices.count*mesh.count,visibleProjectedVertices,matrices,castShadow:mesh.castShadow},
        image:{view,render,...pixels,drawReceipts,camera:camState(view==='native-postprocessed'?G.camera:camera),
          pipeline:view==='native-postprocessed'?'unchanged native composer (including configured shadows/AO)':'raw native scene with independent fixed camera; no postprocess'}};
    },
    finish(){
      g.debug.fire(false);let tail=0;
      while(scheduler.tick<240){scheduler.advance();const R=P._s3Shapes;if(!owned().length&&![R.slashH,R.slashV,R.wetSlashV,R.sheets.mesh].some(m=>m?.count>0)){tail++;if(tail>=21)break;}else tail=0;}
      const R=P._s3Shapes,retired=!owned().length&&![R.slashH,R.slashV,R.wetSlashV,R.sheets.mesh].some(m=>m?.count>0);
      if(!retired||tail<21)throw Error('Native slash/sheet tail did not retire within 240 ticks');
      const wet=R.wetSlashV,events={geometry:0,material:0};
      if(wet){wet.geometry.addEventListener('dispose',()=>events.geometry++);wet.material.addEventListener('dispose',()=>events.material++);}
      // End-of-page resource cleanup only, after all frames and retirement.
      R.dispose();
      const disposed=wet?events.geometry===1&&events.material===1&&!wet.parent&&R.wetSlashV===null:!R.slashH.parent&&!R.slashV.parent;
      if(!disposed)throw Error('Native renderer cleanup failed');
      return {retired,resources:{disposed,wetAllocated:!!wet,events},finalTick:scheduler.tick,quietTailTicks:tail};
    }};
  return {firstBirth,held,initial:window.__wiperProbe.initial};
}

// Always attempt context cleanup. Preserve a primary capture error if close
// also fails, and record the cleanup failure rather than silently discarding it.
export async function finishWiperContext(context,row,save,errors,primaryError) {
  let cleanupError;
  try { await context.close(); row.contextClosed=true; }
  catch(error) { cleanupError=error; errors.push('context cleanup: '+String(error?.stack||error)); }
  finally { save(); }
  if(cleanupError&&!primaryError)throw cleanupError;
}

export async function runWiperCapture(siteArg,outArg,sourceSha,{root=fileURLToPath(new URL('../',import.meta.url))}={}) {
  assert.match(sourceSha||'',/^[a-f0-9]{40}$/,'Full exact --source-sha required');
  const site=path.resolve(siteArg),out=path.resolve(outArg);
  assert.ok(!fs.existsSync(out),'Fresh evidence directory required');fs.mkdirSync(out,{recursive:true});
  const result={schema:1,status:'running',kind:'controlled-native-wiper-visual-acceptance',sourceSha,
    sourceIdentity:captureSourceIdentity({cwd:root}),sandbox:true,errors:[],cases:[],modules:{},consumed:{},
    interventions:['Saved existing profile/settings/empty gear; seeded Math.random at boot and before shot.',
      'Freeze at game publication; trusted menu entry; existing api.setLoadout, range.travel, actor pose/ink reset, camera follow, freezeBots.',
      '60 settling + bounded 60Hz native _frame ticks; debug.fire real native charge/tap admission, never direct projectile creation/retagging.',
      'Fixed rig aim each tick. Native composer view plus independent fixed raw camera; no object hiding, crop, projectile/mesh rewrite, light override or overlay.',
      'Passive shape onBeforeRender wrapper restored after each draw; two repeated draw purity checks; end-of-page native renderer disposal.'],
    limits:['Controlled replay, not ordinary-input acceptance. First observed active birth is inclusive frame 1; ages recorded independently.',
      'Raw inspection does not exercise native postprocessing; native-postprocessed PNG does. Software WebGL is not hardware performance.',
      'Draw/projection/non-flat-pixel receipts do not certify an unoccluded silhouette. Original full-frame PNG visual review required; no retail timing/fidelity claim.'],
    harnessSha256:hash(fs.readFileSync(new URL(import.meta.url))),contractSha256:hash(fs.readFileSync(new URL('./lib/inkwave-wiper-acceptance-contract.mjs',import.meta.url))),
    launcherSha256:hash(fs.readFileSync(new URL('./lib/inkwave-sandbox-browser.mjs',import.meta.url)))};
  let browser,server,failure,expectedBuild;const pending=[];
  const save=()=>fs.writeFileSync(path.join(out,'wiper-native-result.json'),JSON.stringify(result,null,2)+'\n');
  try {
    assert.equal(result.sourceIdentity.checkoutSha,sourceSha,'Capture checkout must equal exact build source head');
    const manifest=verifyRuntimeBuild(site,root,sourceSha);
    expectedBuild=wiperBuildReceiptBinding(fs.readFileSync(path.join(site,'inkwave-build.json')));
    assert.equal(manifest.inputHash,hash(JSON.stringify(manifest.files)),'Manifest input hash');
    assert.equal(manifest.build.esbuild,'0.28.2');assert.equal(manifest.build.optimization,'esbuild-minify');
    Object.assign(result,{contentHash:manifest.contentHash,inputHash:manifest.inputHash,manifestSha256:hash(fs.readFileSync(path.join(site,'inkwave-build.json')))});
    for(const name of ['s3-projectile-shapes.mjs','s3-ink-sheets.mjs']){
      const key=`_versions/${manifest.build.revision}/patches/splatoon3/runtime/${name}`;
      assert.match(manifest.artifacts[key]||'',/^[a-f0-9]{64}$/);result.modules[key]=manifest.artifacts[key];
    }
    const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.wasm':'application/wasm'};
    server=http.createServer((req,res)=>{try{
      const name=new URL(req.url,'http://local').pathname,file=path.resolve(site,'.'+(name==='/'?'/index.html':decodeURIComponent(name)));
      if(!file.startsWith(site+path.sep)||!fs.statSync(file).isFile())throw Error('Unknown artifact');
      const key=path.relative(site,file).split(path.sep).join('/'),bytes=fs.readFileSync(file);
      if(hash(bytes)!==manifest.artifacts[key])throw Error('Served bytes differ from manifest');
      res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.end(bytes);
    }catch{res.writeHead(404);res.end();}});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const {chromium}=await import('playwright');browser=await launchSandboxBrowser(chromium);result.browser=browser.version();save();
    for(const c of WIPER_CAPTURE_CASES){
      const row={...c,frames:[],contextClosed:false};result.cases.push(row);save();
      const context=await browser.newContext({viewport:{width:960,height:720},deviceScaleFactor:1});
      let primaryError;
      try{
        const page=await context.newPage();page.setDefaultTimeout(120000);
        page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
        page.on('response',response=>{const key=new URL(response.url()).pathname.slice(1);if(Object.hasOwn(result.modules,key))pending.push(response.body().then(bytes=>{
          const digest=hash(bytes);assert.equal(digest,result.modules[key],'Actually consumed current emitted module');result.consumed[key]=digest;
        }).catch(e=>result.errors.push('consumed artifact: '+e.message)));});
        await page.addInitScript(initializeWiperCapture,c);
        row.entry=await enterRangeFromMenu(page,'http://127.0.0.1:'+server.address().port,{timeout:120000});
        await page.addScriptTag({content:'window.__createWiperNativeShotSchedule='+createWiperNativeShotSchedule.toString()+';window.__wrapWiperDrawCallback='+wrapWiperDrawCallback.toString()+';window.__assertWiperWebGLError='+assertWiperWebGLError.toString()+';'});
        Object.assign(row,await page.evaluate(installWiperProbe,c));
        for(const frame of WIPER_CAPTURE_FRAMES[c.action]){
          let captured;
          for(const view of ['native-postprocessed','fixed-side-raw']){
            const data=await page.evaluate(({frame,view})=>window.__wiperProbe.capture(frame,view),{frame,view});
            captured??={...data,images:[]};delete captured.image;
            const before=await page.evaluate(()=>JSON.stringify(window.__wiperProbe.state()));
            const file=`${c.key}-f${String(frame).padStart(2,'0')}-${view}.png`;
            const bytes=await page.locator('canvas').first().screenshot({path:path.join(out,file),timeout:120000});
            assert.equal(before,await page.evaluate(()=>JSON.stringify(window.__wiperProbe.state())),'Screenshot must preserve exact native phase');
            captured.images.push({...data.image,file,sha256:hash(bytes),bytes:bytes.length});
          }
          captured.screenshotStateStable=true;row.frames.push(captured);save();console.log('Wiper controlled frame',c.key,frame);
        }
        Object.assign(row,await page.evaluate(()=>window.__wiperProbe.finish()));
      }catch(error){primaryError=error;throw error;}
      finally{await finishWiperContext(context,row,save,result.errors,primaryError);}
    }
    await Promise.all(pending);assert.deepEqual(result.errors,[]);result.status='passed';
  }catch(error){failure=error;result.status='failed';result.error=String(error.stack||error);}
  finally{
    result.cleanup=await closeWiperCaptureOwners({browser,server},result.errors);
    if(result.errors.length)result.status='failed';
    if(result.status==='passed')try{assertWiperCaptureReceipt(result,{sourceSha,...expectedBuild});}catch(error){failure=error;result.status='failed';result.error=String(error.stack||error);}
    save();
  }
  if(failure||result.status!=='passed')throw failure||Error('Wiper capture failed: '+result.errors.join('; '));
  return result;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [site,out,flag,sha]=process.argv.slice(2);
  assert.equal(flag,'--source-sha');assert.equal(process.argv.slice(2).length,4);
  await runWiperCapture(site,out,sha);
}
