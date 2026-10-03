#!/usr/bin/env node
// Runtime-only profile. Loading/warmup are excluded; input probes do not claim
// photon latency. Software WebGL render time is not hardware GPU time.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {persistentDirectory,verifyRuntimeBuild,hash,sampleStats,invalidWindows} from './lib/inkwave-runtime-evidence.mjs';
import os from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const site=fs.realpathSync(path.resolve(option('--site'))), evidence=persistentDirectory(option('--evidence-dir'));
const root=fileURLToPath(new URL('../',import.meta.url));
const sourceSha=option('--source-sha',execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim());
const manifest=verifyRuntimeBuild(site,root,sourceSha);
const menuOnly=process.argv.includes('--menu-only'), fixedOnly=process.argv.includes('--fixed-only'), inputOnly=process.argv.includes('--input-only');
const receipts=new Set();
const {chromium}=await import(pathToFileURL(option('--playwright',process.env.PLAYWRIGHT_MODULE)).href);
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'};
const fixture=`<!doctype html><meta charset="utf-8"><base href="/_versions/${manifest.build.revision}/"><link rel="stylesheet" href="styles/ui.css"><link rel="stylesheet" href="styles/mobile.css"><link rel="stylesheet" href="patches/splatoon3/ui.css"><style>body{margin:0;background:#101420}#ui-root{position:fixed;inset:0}</style><div id="ui-root"></div><script type="module">import {Menus} from './src/ui/menus.js';import {G} from './src/core/ctx.js';import {DEFAULT_SETTINGS} from './src/config.js';import {installMenuQuality} from './patches/local-quality/menu.mjs';installMenuQuality(Menus);let settings={...DEFAULT_SETTINGS};G.settings=settings;const menus=new Menus(document.querySelector('#ui-root'),{getSettings:()=>settings,setSettings:v=>Object.assign(settings,v)});G.game={menus,settings,debug:{freeze(){cancelAnimationFrame(menus._raf);menus._raf=0;menus._extTick=performance.now();}}};G.mode='menu';G.s3={installed:true};window.addEventListener('keydown',e=>menus.handleKey(e));window.probeG=G;</script>`;
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://localhost');if(menuOnly&&url.pathname==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(fixture);return;}const f=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!f.startsWith(site+'/'))throw Error();const b=fs.readFileSync(f),key=path.relative(site,f).split(path.sep).join('/');if(key!=='inkwave-build.json'&&(!manifest.artifacts[key]||hash(b)!==manifest.artifacts[key]))throw Error('Loaded artifact mismatch '+key);receipts.add(key.replace(/^_versions\/[a-f0-9]+\//,''));res.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const quality=option('--quality','low');
const result={status:'running',sourceSha,contentHash:manifest.contentHash,revision:manifest.build.revision,environment:{cpu:os.cpus()[0].model,cores:os.cpus().length,node:process.version,platform:os.platform(),viewport:[960,600],webgl:'SwiftShader',quality,repetitions:3},scenarios:[],input:[],errors:[]};
result.fixture=menuOnly?'production menu DOM/CSS; offline menu owner fixture':'complete installed game';
let context,page;
const stats=sampleStats;
try{
 console.log('Launching browser');
 context=await chromium.launchPersistentContext(path.join(evidence,'browser-profile'),{channel:'chromium',headless:true,viewport:{width:960,height:600},args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 console.log('Browser launched');
 page=context.pages()[0]||await context.newPage();await page.bringToFront();console.log('Page created');page.on('pageerror',e=>result.errors.push(e.message));
 await page.addInitScript(quality=>{let seed=20261004;window.resetRuntimeSeed=()=>{seed=20261004;};Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};localStorage.setItem('inkwave.settings',JSON.stringify({quality,shadows:quality!=='low',bloom:quality!=='low',frameRate:60}));},quality);
 await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
 console.log('Navigation complete');
 await page.evaluate(async()=>{window.probeG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
 await page.waitForFunction(()=>probeG.game?.menus&&probeG.s3?.installed&&probeG.mode!=='boot',null,{timeout:Number(option('--boot-timeout','900000'))});
 console.log('Runtime ready');
 result.active=await page.evaluate(()=>{const gl=probeG.renderer?.getContext(),ext=gl?.getExtension('WEBGL_debug_renderer_info');return{baseURI:document.baseURI,mode:probeG.mode,browser:navigator.userAgent,dpr:devicePixelRatio,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,gpuTimerQuery:!!gl?.getExtension('EXT_disjoint_timer_query_webgl2')};});
 result.environment.browser=await context.browser().version();result.environment.seed=20261004;
 if(fixedOnly&&!menuOnly)await page.evaluate(()=>{probeG.game.debug.freeze();probeG.game.R.setDynamicScale(1);});
 if(!result.active.baseURI.includes(result.revision))throw Error('Active revision mismatch');
 const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
 for(const scenario of (inputOnly?[]:menuOnly?['title','settings']:['title','settings','battle'])){
  await page.evaluate(async scenario=>{const g=probeG.game;g.menus.wipe.cancel();if(scenario==='battle'){window.resetRuntimeSeed();await g.startMatch({mapId:'tidewater',difficulty:'easy',duration:180,mode:'turf'});g.debug.freezeBots();}else g.menus.show(scenario,{wipe:false,light:false});},scenario);
  await page.bringToFront();if(fixedOnly)await page.evaluate(scenario=>{const g=probeG.game;g.debug.freeze();g._skipRender=true;g.s3Clock?.reset();for(let i=0;i<(scenario==='battle'?270:30);i++)g._frame?.(1/60);g._skipRender=false;if(scenario==='battle'&&g.match.state!=='playing')throw Error('Battle warmup did not reach playing');},scenario);else await page.waitForTimeout(3000);console.log('Scenario ready '+scenario);
  // Instrument actual owners, retaining their receiver and return values.
  await page.evaluate(()=>{window.counts={};window.timings={};window.restore=[];const G=probeG,g=G.game;for(const [name,o,key]of [['sceneMatrices',G.scene,'updateMatrixWorld'],['frame',g,'_frame'],['match',g.match,'update'],['paint',G.paint,'flush'],['fx',G.fx,'update'],['env',G.env,'update'],['decor',g.decor,'update'],['props',g.props,'update'],['render',g.R,'render'],['showcase',g.showcase,'update'],['menu',g.menus,'update'],['cursor',g.menus,'_updateCursor'],['hud',g,'_updateHud'],['minimap',g.minimap,'update']]){if(!o||typeof o[key]!=='function')continue;const old=o[key];o[key]=function(...a){const t=performance.now();try{return old.apply(this,a);}finally{counts[name]=(counts[name]||0)+1;(timings[name]??=[]).push(performance.now()-t);}};restore.push(()=>o[key]=old);}window.longtasks=[];window.ltObserver=new PerformanceObserver(l=>longtasks.push(...l.getEntries().map(x=>x.duration)));ltObserver.observe({type:'longtask',buffered:false});window.rafTimes=[];window.rafProbeOn=true;const tick=t=>{rafTimes.push(t);if(rafProbeOn)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
  const runs=[];
  for(let repeat=0;repeat<3;repeat++){
   await page.evaluate(()=>{counts={};timings={};longtasks=[];rafTimes=[];});
   const before=(await cdp.send('Performance.getMetrics')).metrics;
   await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
   if(fixedOnly)await page.evaluate(()=>{const g=probeG.game;for(let i=0;i<30;i++)g._frame?.(1/60);});else await page.waitForTimeout(3000);
   const {profile}=await cdp.send('Profiler.stop');fs.writeFileSync(path.join(evidence,`${scenario}-${repeat}.cpuprofile`),JSON.stringify(profile));
   const after=(await cdp.send('Performance.getMetrics')).metrics;
   const samples=await page.evaluate(()=>({counts,timings,longtasks,frames:rafTimes.slice(1).map((t,i)=>t-rafTimes[i]),heap:performance.memory?.usedJSHeapSize,menu:{hidden:document.hidden,current:probeG.game.menus.current,raf:probeG.game.menus._raf,extAge:performance.now()-probeG.game.menus._extTick},renderInfo:probeG.renderer?{calls:probeG.renderer.info.render.calls,triangles:probeG.renderer.info.render.triangles,geometries:probeG.renderer.info.memory.geometries,textures:probeG.renderer.info.memory.textures}:null,matchState:probeG.game.match?.state,quality:probeG.game.settings.quality,scale:probeG.game.R?.dynScale}));
   const metrics=Object.fromEntries(after.map(x=>[x.name,x.value]));for(const x of before)if(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration'].includes(x.name))metrics[x.name]-=x.value;
   runs.push({repeat,metrics,...samples,frames:stats(samples.frames),fixedSteps:fixedOnly?30:null,timings:Object.fromEntries(Object.entries(samples.timings).map(([k,v])=>[k,stats(v)])),longtasks:stats(samples.longtasks)});
  }
  result.scenarios.push({scenario,runs});
  await page.evaluate(()=>{restore.forEach(f=>f());ltObserver.disconnect();rafProbeOn=false;});
 }
 if(process.argv.includes('--verify-render')){
  result.renderParity=await page.evaluate(()=>{
   const G=probeG,g=G.game,r=G.renderer,gl=r.getContext(),native=r.render,w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,out=[];
   g.debug.freeze();
   const read=()=>{const bytes=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;};
   for(let i=0;i<3;i++){
    // Counterfactual: restore the native automatic update before every game-scene pass,
    // including nested reflection. No simulation/animation advance between the two images.
    r.render=function(scene,camera){if(scene===G.scene&&!scene.matrixWorldAutoUpdate)scene.updateMatrixWorld();return native.call(this,scene,camera);};
    let a,b;try{g.R.render();a=read();}finally{r.render=native;}
    g.R.render();b=read();let changed=0,maxDelta=0;
    for(let j=0;j<a.length;j++)if(a[j]!==b[j]){changed++;maxDelta=Math.max(maxDelta,Math.abs(a[j]-b[j]));}
    out.push({repeat:i,width:w,height:h,changedChannels:changed,maxDelta,nonempty:a.some(v=>v!==0),sceneAutoRestored:G.scene.matrixWorldAutoUpdate});
   }
   return out;
  });
  if(result.renderParity.some(r=>!r.nonempty||r.changedChannels||!r.sceneAutoRestored))result.errors.push('Render matrix transaction pixel parity failed');
 }
 // Pause the game owner, then dispatch real menu entry points in one task.
 // A stale target here proves an extra engine-tick dependency independent of GPU.
 await page.evaluate(()=>{const g=probeG.game;g.debug.freeze();g.menus.wipe.cancel();g.menus.show('settings',{wipe:false,light:false});});
 await page.waitForTimeout(1500);
 result.input=await page.evaluate(()=>{const m=probeG.game.menus;const out=[];for(const mode of ['kbm','pad','touch'])for(let i=0;i<12;i++){m.setInputMode(mode);const rows=m._candidates().filter(e=>e.dataset.nav==='row');const a=rows[i%Math.max(1,rows.length-1)],b=rows[i%Math.max(1,rows.length-1)+1];m._setFocus(a,{snap:true});m._updateCursor(1/60);const oldVisual={x:m._cur.x.x,y:m._cur.y.x};const t=performance.now();if(mode==='touch')b.dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',bubbles:true}));else if(mode==='kbm')window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',code:'ArrowDown',bubbles:true,cancelable:true}));else m.nav('down');const focus=m._focus,r=focus.getBoundingClientRect(),pad=focus.dataset.curPad!=null?+focus.dataset.curPad:7;out.push({mode,entry:mode==='pad'?'Menus.nav (after gamepad polling)':mode==='kbm'?'DOM keydown':'DOM pointerdown',state:focus!==a,targetError:Math.hypot(m._cur.x.target-(r.left-pad),m._cur.y.target-(r.top-pad)),syncMs:performance.now()-t,ringOn:m._cur.on,oldVisual,visual:{x:m._cur.x.x,y:m._cur.y.x},transform:m.cursorEl.style.transform});m._updateCursor(1/60);}return out;});
 result.emptyWindows=invalidWindows(result.scenarios,fixedOnly);
 result.inputErrors=result.input.filter(r=>!r.state||r.targetError>.5);result.inputStatus=result.inputErrors.length?'stale':'synchronous';
 result.status=result.errors.length||result.emptyWindows.length?'failed':'passed';
}catch(e){result.status='failed';result.error=e.stack;result.bootState=await page?.evaluate(()=>({hidden:document.hidden,mode:window.probeG?.mode,installed:window.probeG?.s3,marks:window.probeG?.game?.bootMarks,bootError:document.querySelector('#boot-error')?.textContent,baseURI:document.baseURI})).catch(()=>null);}finally{result.verifiedRuntimeFiles=[...receipts].sort();if(context)await context.close();await new Promise(r=>server.close(r));const file=path.join(evidence,'runtime-result.json');fs.writeFileSync(file+'.pending',JSON.stringify(result,null,2));fs.renameSync(file+'.pending',file);console.log(JSON.stringify({status:result.status,error:result.error,bootState:result.bootState,contentHash:result.contentHash,scenarios:result.scenarios.map(s=>({scenario:s.scenario,frame:s.runs.map(r=>r.timings.frame),counts:s.runs.map(r=>r.counts)})),inputErrors:result.input.filter(r=>r.targetError>.5).length}));}
if(result.status!=='passed')process.exitCode=1;
