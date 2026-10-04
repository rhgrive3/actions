#!/usr/bin/env node
// Runtime-only profile. Loading/warmup are excluded; input probes do not claim
// photon latency. Software WebGL render time is not hardware GPU time.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {persistentDirectory,persistentBrowserTemp,verifyRuntimeBuild,hash,sampleStats,invalidWindows} from './lib/inkwave-runtime-evidence.mjs';
import os from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const site=fs.realpathSync(path.resolve(option('--site'))), evidence=persistentDirectory(option('--evidence-dir'));
const root=fileURLToPath(new URL('../',import.meta.url));
const sourceSha=option('--source-sha',execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim());
const manifest=verifyRuntimeBuild(site,root,sourceSha);
const menuOnly=process.argv.includes('--menu-only'), fixedOnly=process.argv.includes('--fixed-only'), inputOnly=process.argv.includes('--input-only'), parityOnly=process.argv.includes('--parity-only');
// Playwright creates internal artifact directories before Chromium starts.
// Configure this process's browser temporary directory before importing it;
// all child defaults then remain inside the verified persistent evidence root.
const browserTemp=persistentBrowserTemp('/mnt/workspace/.dev-state/agent-work/cache/iwrui');
for(const name of ['TMPDIR','TMP','TEMP'])process.env[name]=browserTemp;
const receipts=new Set();
const {chromium}=await import(pathToFileURL(option('--playwright',process.env.PLAYWRIGHT_MODULE)).href);
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'};
const fixture=`<!doctype html><meta charset="utf-8"><base href="/_versions/${manifest.build.revision}/"><link rel="stylesheet" href="styles/ui.css"><link rel="stylesheet" href="styles/mobile.css"><link rel="stylesheet" href="patches/splatoon3/ui.css"><style>body{margin:0;background:#101420}#ui-root{position:fixed;inset:0}</style><div id="ui-root"></div><script type="module">import {Menus} from './src/ui/menus.js';import {G} from './src/core/ctx.js';import {DEFAULT_SETTINGS} from './src/config.js';import {installMenuQuality} from './patches/local-quality/menu.mjs';installMenuQuality(Menus);let settings={...DEFAULT_SETTINGS};G.settings=settings;const menus=new Menus(document.querySelector('#ui-root'),{getSettings:()=>settings,setSettings:v=>Object.assign(settings,v)});G.game={menus,settings,debug:{freeze(){cancelAnimationFrame(menus._raf);menus._raf=0;menus._extTick=performance.now();}}};G.mode='menu';G.s3={installed:true};window.addEventListener('keydown',e=>menus.handleKey(e));window.probeG=G;</script>`;
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://localhost');if(menuOnly&&url.pathname==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(fixture);return;}const f=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!f.startsWith(site+'/'))throw Error();const b=fs.readFileSync(f),key=path.relative(site,f).split(path.sep).join('/');if(key!=='inkwave-build.json'&&(!manifest.artifacts[key]||hash(b)!==manifest.artifacts[key]))throw Error('Loaded artifact mismatch '+key);receipts.add(key.replace(/^_versions\/[a-f0-9]+\//,''));res.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const quality=option('--quality','low');
const result={status:'running',sourceSha,contentHash:manifest.contentHash,rendererArtifactHash:manifest.artifacts['src/core/renderer.js'],revision:manifest.build.revision,environment:{cpu:os.cpus()[0].model,cores:os.cpus().length,node:process.version,platform:os.platform(),viewport:[960,600],webgl:'SwiftShader',quality,repetitions:3},scenarios:[],input:[],errors:[]};
result.fixture=menuOnly?'production menu DOM/CSS; offline menu owner fixture':'complete installed game';
let context,page;
const stats=sampleStats;
const saveEvidence=(file,value)=>{const pending=file+'.pending',fd=fs.openSync(pending,'w');try{fs.writeFileSync(fd,JSON.stringify(value,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(pending,file);const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}};
const checkpoint=()=>saveEvidence(path.join(evidence,'runtime-progress.json'),{...result,verifiedRuntimeFiles:[...receipts].sort()});
try{
 console.log('Launching browser');
 context=await chromium.launchPersistentContext(path.join(evidence,'browser-profile'),{channel:'chromium',headless:true,viewport:{width:960,height:600},args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 console.log('Browser launched');
 page=context.pages()[0]||await context.newPage();await page.bringToFront();console.log('Page created');page.on('pageerror',e=>result.errors.push(e.message));
 await page.addInitScript(quality=>{let seed=20261004;window.resetRuntimeSeed=()=>{seed=20261004;};Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};localStorage.setItem('inkwave.settings',JSON.stringify({quality,shadows:quality!=='low',bloom:quality!=='low',frameRate:60}));},quality);
 await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
 console.log('Navigation complete');
 await page.evaluate(async()=>{window.probeG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
 await page.waitForFunction(fixed=>{const ready=probeG.game?.menus&&probeG.s3?.installed&&probeG.mode!=='boot';if(ready&&fixed)probeG.game.debug.freeze();return !!ready;},fixedOnly,{timeout:Number(option('--boot-timeout','900000'))});
 console.log('Runtime ready');
 // Audio voices use wall-clock rate limits. Their procedural noise must not
 // consume the gameplay fixture's seeded RNG when a voice is dropped/created.
 // Retain the real audio work with its own seeded stream, in BOTH builds.
 await page.evaluate(()=>{if(probeG.audio){let audioSeed=20261004;probeG.audio.rng=()=>{audioSeed=(Math.imul(audioSeed,1664525)+1013904223)>>>0;return audioSeed/4294967296;};}});
 result.environment.audioRngMode='independent-seeded-audio';
 result.active=await page.evaluate(()=>{const gl=probeG.renderer?.getContext(),ext=gl?.getExtension('WEBGL_debug_renderer_info');return{baseURI:document.baseURI,mode:probeG.mode,browser:navigator.userAgent,dpr:devicePixelRatio,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,gpuTimerQuery:!!gl?.getExtension('EXT_disjoint_timer_query_webgl2')};});
 result.environment.browser=await context.browser().version();result.environment.seed=20261004;result.environment.seedMode='reset-each-profile-window';checkpoint();
 if(fixedOnly&&!menuOnly)await page.evaluate(()=>{probeG.game.debug.freeze();probeG.game.R.setDynamicScale(1);});
 if(parityOnly)await page.evaluate(async()=>{const g=probeG.game;await g.startMatch({mapId:'tidewater',difficulty:'easy',duration:180,mode:'turf'});g.debug.freeze();g.debug.freezeBots();g._skipRender=true;for(let i=0;i<270;i++)g._frame(1/60);g._skipRender=false;g.R.render();});
 if(!result.active.baseURI.includes(result.revision))throw Error('Active revision mismatch');
 const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
 for(const scenario of (inputOnly||parityOnly?[]:menuOnly?['title','settings']:['title','settings','battle'])){
  await page.evaluate(async scenario=>{const g=probeG.game;g.menus.wipe.cancel();if(scenario==='battle'){window.resetRuntimeSeed();await g.startMatch({mapId:'tidewater',difficulty:'easy',duration:180,mode:'turf'});g.debug.freezeBots();}else g.menus.show(scenario,{wipe:false,light:false});},scenario);
  await page.bringToFront();if(fixedOnly)await page.evaluate(scenario=>{const g=probeG.game;g.debug.freeze();g._skipRender=true;g.s3Clock?.reset();for(let i=0;i<(scenario==='battle'?270:30);i++)g._frame?.(1/60);g._skipRender=false;if(scenario==='battle'&&g.match.state!=='playing')throw Error('Battle warmup did not reach playing');},scenario);else await page.waitForTimeout(3000);console.log('Scenario ready '+scenario);if(scenario==='battle')await page.evaluate(()=>probeG.game.debug.fire(true));
  // Warm actual render passes and weapon FX, not just simulation. GPU queue
  // drain and first-use shader work stay outside every measured window.
  const warmup=fixedOnly&&!menuOnly?await page.evaluate(scenario=>{const g=probeG.game;window.resetRuntimeSeed();for(let i=0;i<30;i++)g._frame(1/60);const t=performance.now();probeG.renderer.getContext().finish();return{simulationOnlySteps:scenario==='battle'?270:30,renderedSteps:30,drainMs:performance.now()-t};},scenario):null;
  // Instrument actual owners, retaining their receiver and return values.
  await page.evaluate(()=>{window.counts={};window.timings={};window.restore=[];window.runtimeOwnerNames=[];const G=probeG,g=G.game;for(const [name,o,key]of [['sceneMatrices',G.scene,'updateMatrixWorld'],['frame',g,'_frame'],['match',g.match,'update'],['character',g.match?.local?.character?.constructor.prototype,'update'],['projectiles',G.projectiles,'update'],['rig',g.rig,'update'],['screenfx',g.screenfx,'update'],['paint',G.paint,'flush'],['fx',G.fx,'update'],['env',G.env,'update'],['decor',g.decor,'update'],['props',g.props,'update'],['render',g.R,'render'],['showcase',g.showcase,'update'],['menu',g.menus,'update'],['menuTick',g.menus,'_tick'],['cursor',g.menus,'_updateCursor'],['hud',g,'_updateHud'],['minimap',g.minimap,'update']]){if(!o||typeof o[key]!=='function')continue;runtimeOwnerNames.push(name);const old=o[key];o[key]=function(...a){const t=performance.now();try{return old.apply(this,a);}finally{counts[name]=(counts[name]||0)+1;(timings[name]??=[]).push(performance.now()-t);}};restore.push(()=>o[key]=old);}window.longtasks=[];window.ltObserver=new PerformanceObserver(l=>longtasks.push(...l.getEntries().map(x=>x.duration)));ltObserver.observe({type:'longtask',buffered:false});window.rafTimes=[];window.rafProbeOn=true;const tick=t=>{rafTimes.push(t);if(rafProbeOn)window.rafProbeId=requestAnimationFrame(tick);};window.rafProbeId=requestAnimationFrame(tick);});
  const runs=[];result.scenarios.push({scenario,warmup,runs});checkpoint();
  for(let repeat=0;repeat<3;repeat++){
   await page.evaluate(()=>{counts=Object.fromEntries(runtimeOwnerNames.map(name=>[name,0]));timings={};longtasks=[];rafTimes=[];});
   const before=(await cdp.send('Performance.getMetrics')).metrics;
   await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
   if(fixedOnly)await page.evaluate(()=>{const g=probeG.game;window.resetRuntimeSeed();for(let i=0;i<30;i++)g._frame?.(1/60);});else await page.waitForTimeout(3000);
   const {profile}=await cdp.send('Profiler.stop');saveEvidence(path.join(evidence,`${scenario}-${repeat}.cpuprofile`),profile);
   const after=(await cdp.send('Performance.getMetrics')).metrics;
   const samples=await page.evaluate(()=>({counts,probedOwners:runtimeOwnerNames,timings,longtasks,frames:rafTimes.slice(1).map((t,i)=>t-rafTimes[i]),heap:performance.memory?.usedJSHeapSize,menu:{hidden:document.hidden,current:probeG.game.menus.current,raf:probeG.game.menus._raf,extAge:performance.now()-probeG.game.menus._extTick},renderInfo:probeG.renderer?{calls:probeG.renderer.info.render.calls,triangles:probeG.renderer.info.render.triangles,geometries:probeG.renderer.info.memory.geometries,textures:probeG.renderer.info.memory.textures,programs:probeG.renderer.info.programs?.length}:null,matchState:probeG.game.match?.state,gameplay:probeG.game.match?{time:probeG.game.match.time,actors:probeG.game.match.actors.map(a=>({pos:[a.pos.x,a.pos.y,a.pos.z],hp:a.hp,ink:a.ink,alive:a.alive,weapon:a.weaponId})),coverage:probeG.paint.coverage(),projectiles:probeG.projectiles.list.length}:null,quality:probeG.game.settings.quality,scale:probeG.game.R?.dynScale}));
   const metrics=Object.fromEntries(after.map(x=>[x.name,x.value]));for(const x of before)if(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration'].includes(x.name))metrics[x.name]-=x.value;
   runs.push({repeat,metrics,...samples,frames:stats(samples.frames),fixedSteps:fixedOnly?30:null,timings:Object.fromEntries(Object.entries(samples.timings).map(([k,v])=>[k,stats(v)])),longtasks:stats(samples.longtasks)});checkpoint();console.log(JSON.stringify({phase:'completed-window',scenario,repeat,sourceSha,counts:samples.counts,frame:runs.at(-1).timings.frame}));
  }
  await page.evaluate(()=>{restore.forEach(f=>f());ltObserver.disconnect();rafProbeOn=false;cancelAnimationFrame(window.rafProbeId);window.rafProbeId=0;});
 }
 // Drain already submitted GPU work outside the profile windows, for BOTH builds.
 // A screenshot's default30s limit is shorter than observed SwiftShader queue stalls.
 if(!menuOnly){result.renderDrainMs=await page.evaluate(()=>{const t=performance.now();probeG.renderer.getContext().finish();return performance.now()-t;});checkpoint();}
 if(process.argv.includes('--verify-render')){
  result.renderParity=await page.evaluate(()=>{
   const G=probeG,g=G.game,r=G.renderer,gl=r.getContext(),native=r.render,w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,out=[];
   const moving=g.match.local.character.root,oldX=moving.position.x;
   const composer=g.R.composer,readBuffer=composer.readBuffer,writeBuffer=composer.writeBuffer;
   const shadowCache=g.shadowCache,wasDirty=shadowCache?.dirty;
   const uniforms=()=>{const rows={};G.scene.traverse(o=>{for(const m of (Array.isArray(o.material)?o.material:[o.material])){if(!m)continue;for(const [key,u] of Object.entries(m.uniforms||m.userData?.uniforms||{})){const v=u.value;if(typeof v==='number'||typeof v==='boolean')rows[m.id+':'+key]=v;else if(v?.toArray&&!v.isTexture)rows[m.id+':'+key]=v.toArray();}}});return rows;};
   const differences=(a,b)=>Object.keys(b).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])).slice(0,30).map(key=>({key,before:a[key],after:b[key]}));
   // Same ping-pong target and shadow-cache rebuild path for each image.
   // The moved character is dynamic: no static-caster demotion between images.
   const draw=()=>{composer.readBuffer=readBuffer;composer.writeBuffer=writeBuffer;r.shadowMap.needsUpdate=true;G.env._reflFrame=-1;if(shadowCache)shadowCache.dirty=true;g.R.render();};
   g.debug.freeze();
   const read=()=>{const bytes=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;};
   try{for(let i=0;i<3;i++){
    // Fresh transform FIRST: a missing initial update must fail, even when an
    // earlier frozen image had valid matrices. This modifies only the render fixture.
    moving.position.x=oldX+.1*(i+1);
    draw();const a=read(),ua=uniforms();draw();const optimizedRepeat=read(),uo=uniforms();
    r.render=function(scene,camera){if(scene===G.scene&&!scene.matrixWorldAutoUpdate)scene.updateMatrixWorld();return native.call(this,scene,camera);};
    let b,nativeRepeat,ub,un;try{draw();b=read();ub=uniforms();draw();nativeRepeat=read();un=uniforms();}finally{r.render=native;}
    let changed=0,maxDelta=0,optimizedRepeatChanges=0,nativeRepeatChanges=0;
    for(let j=0;j<a.length;j++){if(a[j]!==b[j]){changed++;maxDelta=Math.max(maxDelta,Math.abs(a[j]-b[j]));}if(a[j]!==optimizedRepeat[j])optimizedRepeatChanges++;if(b[j]!==nativeRepeat[j])nativeRepeatChanges++;}
    const pixels=[];for(let j=0;j<a.length&&pixels.length<20;j++)if(a[j]!==optimizedRepeat[j])pixels.push({x:Math.floor(j/4)%w,y:Math.floor(j/4/w),channel:j%4,a:a[j],repeat:optimizedRepeat[j]});
    out.push({...(i===0?{diagnosticImage:r.domElement.toDataURL()}:{}),pixelSamples:pixels,optimizedUniformChanges:differences(ua,uo),nativeUniformChanges:differences(ub,un),glError:gl.getError(),repeat:i,width:w,height:h,changedChannels:changed,maxDelta,optimizedRepeatChanges,nativeRepeatChanges,nonempty:a.some(v=>v!==0),freshTransform:Math.abs(moving.matrixWorld.elements[12]-moving.position.x)<1e-6,sceneAutoRestored:G.scene.matrixWorldAutoUpdate});
   }}finally{moving.position.x=oldX;r.render=native;composer.readBuffer=readBuffer;composer.writeBuffer=writeBuffer;if(shadowCache)shadowCache.dirty=wasDirty;G.scene.updateMatrixWorld();}
   return out;
  });
  for(const row of result.renderParity)if(row.diagnosticImage){const file=path.join(evidence,`render-parity-${row.repeat}.png`),fd=fs.openSync(file,'w');try{fs.writeFileSync(fd,Buffer.from(row.diagnosticImage.split(',')[1],'base64'));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}delete row.diagnosticImage;}
  if(parityOnly)result.renderIsolation=await page.evaluate(()=>{
   const G=probeG,g=G.game,r=G.renderer,gl=r.getContext(),cache=g.shadowCache,comp=g.R.composer,read=comp.readBuffer,write=comp.writeBuffer;
   const cases=[['unchanged',null,null],['full-native-shadows',cache,'enabled'],['without-GTAO-diagnostic',g.R.gtao,'enabled'],['without-bloom-diagnostic',g.R.bloom,'enabled']],rows=[];
   const image=()=>{const bytes=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;};
   for(const [name,owner,key]of cases){if(name!=='unchanged'&&!owner)continue;const saved=owner?.[key];try{if(owner)owner[key]=false;const draw=()=>{comp.readBuffer=read;comp.writeBuffer=write;r.shadowMap.needsUpdate=true;G.env._reflFrame=-1;if(cache)cache.dirty=true;g.R.render();};draw();const a=image();draw();const b=image();let changed=0,maxDelta=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i]){changed++;maxDelta=Math.max(maxDelta,Math.abs(a[i]-b[i]));}rows.push({name,changedChannels:changed,maxDelta,glError:gl.getError(),diagnosticOnly:true});}finally{if(owner)owner[key]=saved;}}
   comp.readBuffer=read;comp.writeBuffer=write;return rows;
  });
  if(result.renderParity.some(r=>!r.nonempty||!r.freshTransform||r.changedChannels||r.optimizedRepeatChanges||r.nativeRepeatChanges||!r.sceneAutoRestored))result.errors.push('Frozen-frame render repeatability failed');
 }
 // Pause the game owner, then dispatch real menu entry points in one task.
 // A stale target here proves an extra engine-tick dependency independent of GPU.
 await page.evaluate(()=>{const g=probeG.game;g.debug.freeze();g.menus.wipe.cancel();g.menus.show('settings',{wipe:false,light:false});});
 await page.waitForTimeout(1500);
 result.input=await page.evaluate(()=>{const m=probeG.game.menus;const out=[];for(const mode of ['kbm','pad','touch'])for(let i=0;i<12;i++){if(probeG.game._onDevice)probeG.game._onDevice(mode);else m.setInputMode(mode);const rows=m._candidates().filter(e=>e.dataset.nav==='row');const a=rows[i%Math.max(1,rows.length-1)],b=rows[i%Math.max(1,rows.length-1)+1];m._setFocus(a,{snap:true});m._updateCursor(1/60);const oldVisual={x:m._cur.x.x,y:m._cur.y.x};const t=performance.now();if(mode==='touch')b.dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',bubbles:true}));else if(mode==='kbm')window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',code:'ArrowDown',bubbles:true,cancelable:true}));else if(probeG.game.input){const inp=probeG.game.input,prev=inp.padPrev,desc=Object.getOwnPropertyDescriptor(navigator,'getGamepads');const fake={connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},(_,i)=>({pressed:i===13,value:i===13?1:0}))};try{Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[fake]});inp.padPrev=[];inp.pollPad();probeG.game._padMenus();}finally{inp.padPrev=prev;inp.padPressed.clear();if(desc)Object.defineProperty(navigator,'getGamepads',desc);else delete navigator.getGamepads;}}else m.nav('down');const focus=m._focus,r=focus.getBoundingClientRect(),pad=focus.dataset.curPad!=null?+focus.dataset.curPad:7;out.push({mode,entry:mode==='pad'?(probeG.game.input?'navigator.getGamepads -> Input.pollPad -> Game._padMenus -> Menus.nav':'Menus.nav fixture'):mode==='kbm'?'DOM keydown':'DOM pointerdown',state:focus!==a,targetOwnerCorrect:m._cur.targetEl===focus,targetError:Math.hypot(m._cur.x.target-(r.left-pad),m._cur.y.target-(r.top-pad),m._cur.w.target-(r.width+pad*2),m._cur.h.target-(r.height+pad*2)),syncMs:performance.now()-t,ringOn:m._cur.on,ringVisibility:getComputedStyle(m.cursorEl).visibility,ringOpacity:+getComputedStyle(m.cursorEl).opacity,oldVisual,visual:{x:m._cur.x.x,y:m._cur.y.x},transform:m.cursorEl.style.transform});m._updateCursor(1/60);}return out;});
 // Prime the existing native fade in separate tasks before retirement. A
 // batched navigation probe alone can observe opacity 0 before its first paint.
 result.ringRetirement=[];
 for(let repeat=0;repeat<3;repeat++){
  await page.evaluate(()=>{const m=probeG.game.menus;if(probeG.game._onDevice)probeG.game._onDevice('pad');else m.setInputMode('pad');const a=m._candidates().find(e=>e.dataset.nav==='row');m._setFocus(a,{snap:true});m._updateCursor(1/60);getComputedStyle(m.cursorEl).opacity;});
  await page.screenshot({path:path.join(evidence,`ring-prime-${repeat}.png`),timeout:900000});await page.waitForTimeout(250);
  result.ringRetirement.push(await page.evaluate(repeat=>{const m=probeG.game.menus,before=+getComputedStyle(m.cursorEl).opacity,oldFocus=m._focus;if(repeat===1)m._setFocus(null);else{if(probeG.game._onDevice)probeG.game._onDevice('touch');else m.setInputMode('touch');const row=m._candidates().filter(e=>e.dataset.nav==='row')[1];row.dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',bubbles:true}));}const css=getComputedStyle(m.cursorEl);return{repeat,entry:repeat===1?'deselect':'pad -> touch',beforeOpacity:before,stateChanged:m._focus!==oldFocus,ringOn:m._cur.on,visibility:css.visibility,opacity:+css.opacity,ghost:css.visibility!=='hidden'&&+css.opacity>.001};},repeat));
 }
 result.menuLifecycle=await page.evaluate(()=>{
  const m=probeG.game.menus,old=m._tick,hidden=[];let ticks=0;
  m._tick=function(...args){ticks++;return old.apply(this,args);};
  try{m.show(null,{wipe:false,instantLeave:true});for(let repeat=0;repeat<3;repeat++){ticks=0;for(let i=0;i<600;i++)m.update(1/60);hidden.push({repeat,ticks,raf:m._raf});}m.show('settings',{wipe:false,light:false});ticks=0;m.update(1/60);const resumedTicks=ticks,hiddenDocument=[],descriptor=Object.getOwnPropertyDescriptor(document,'hidden');try{Object.defineProperty(document,'hidden',{configurable:true,value:true});for(let repeat=0;repeat<3;repeat++){ticks=0;for(let i=0;i<600;i++)m.update(1/60);hiddenDocument.push({repeat,ticks,raf:m._raf});}}finally{if(descriptor)Object.defineProperty(document,'hidden',descriptor);else delete document.hidden;}ticks=0;m.update(1/60);return{hidden,resumedTicks,hiddenDocument,documentResumedTicks:ticks};}finally{m._tick=old;}
 });
 result.menuLifetime=await page.evaluate(async()=>{
  const M=probeG.game.menus.constructor,fonts=document.fonts,added=new Set(),observed=new Set(),add=fonts.addEventListener,remove=fonts.removeEventListener,observe=ResizeObserver.prototype.observe,disconnect=ResizeObserver.prototype.disconnect;
  fonts.addEventListener=function(type,fn,...args){if(type==='loadingdone')added.add(fn);return add.call(this,type,fn,...args);};
  fonts.removeEventListener=function(type,fn,...args){if(type==='loadingdone')added.delete(fn);return remove.call(this,type,fn,...args);};
  ResizeObserver.prototype.observe=function(...args){observed.add(this);return observe.apply(this,args);};
  ResizeObserver.prototype.disconnect=function(){observed.delete(this);return disconnect.call(this);};
  const results=[];
  try{for(let repeat=0;repeat<3;repeat++){for(let i=0;i<20;i++){const root=document.createElement('div');document.body.append(root);const m=new M(root);m.dispose();root.remove();}await Promise.resolve();results.push({repeat,disposed:(repeat+1)*20,fontListeners:added.size,observedOwners:observed.size});}}finally{fonts.addEventListener=add;fonts.removeEventListener=remove;ResizeObserver.prototype.observe=observe;ResizeObserver.prototype.disconnect=disconnect;}
  return results;
 });
 result.emptyWindows=invalidWindows(result.scenarios,fixedOnly);
 result.inputErrors=result.input.filter(r=>!r.state||!Number.isFinite(r.targetError)||r.targetError>.5);result.inputStatus=result.inputErrors.length?'stale':'synchronous';
 result.status=result.errors.length||result.emptyWindows.length?'failed':'passed';
}catch(e){result.status='failed';result.error=e.stack;result.bootState=await page?.evaluate(()=>({hidden:document.hidden,mode:window.probeG?.mode,installed:window.probeG?.s3,marks:window.probeG?.game?.bootMarks,bootError:document.querySelector('#boot-error')?.textContent,baseURI:document.baseURI})).catch(()=>null);}finally{result.verifiedRuntimeFiles=[...receipts].sort();if(context)await context.close();await new Promise(r=>server.close(r));const file=path.join(evidence,'runtime-result.json');saveEvidence(file,result);console.log(JSON.stringify({status:result.status,error:result.error,bootState:result.bootState,contentHash:result.contentHash,scenarios:result.scenarios.map(s=>({scenario:s.scenario,frame:s.runs.map(r=>r.timings.frame),counts:s.runs.map(r=>r.counts)})),inputErrors:result.input.filter(r=>r.targetError>.5).length}));}
if(result.status!=='passed')process.exitCode=1;
