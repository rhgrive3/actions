#!/usr/bin/env node
// Normal startMatch/load/render smoke across all shipped native stages.
// Caller holds .ci-scratch/native-stage-browser.lock; this is not a FPS test.
// node scripts/check-native-mobile-browser.mjs --site SITE --out EVIDENCE --device ipad|phone|both
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {nativeStageCatalog} from './lib/inkwave-native-stages.mjs';

const arg=(key,fallback)=>{const at=process.argv.indexOf(key);return at<0?fallback:process.argv[at+1];};
const site=fs.realpathSync(arg('--site','_site'));
const out=path.resolve(arg('--out','.browser-evidence/native-mobile'));
const device=arg('--device','both'),frames=Number(arg('--render-frames','2'));
assert(['ipad','phone','both'].includes(device),'Unknown device profile');
assert(Number.isSafeInteger(frames)&&frames>=1&&frames<=3,'Use 1–3 rendered smoke frames');
assert(!['/tmp','/var/tmp','/dev/shm'].some(p=>out===p||out.startsWith(p+'/')),'Evidence requires a persistent directory');
fs.mkdirSync(out,{recursive:true});
const temporary=path.resolve('.ci-scratch/native-mobile-browser');fs.mkdirSync(temporary,{recursive:true});
for(const key of ['TMPDIR','TMP','TEMP'])process.env[key]=temporary;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function checkedEvaluate(page,fn,value,label){
 let timer;
 try{return await Promise.race([page.evaluate(fn,value),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native smoke deadline: '+label)),300000);})]);}
 finally{clearTimeout(timer);}
}
const buildBytes=fs.readFileSync(path.join(site,'inkwave-build.json')),build=JSON.parse(buildBytes);
assert.equal(hash(JSON.stringify(build.artifacts)),build.contentHash,'Build artifact map identity');
// Bind the emitted owners this smoke executes without repeatedly hashing all
// large payloads; stage loading authenticates the selected prebuilt payloads.
for(const file of ['src/main.js','patches/native-stages/runtime/engine.mjs','patches/native-stages/runtime/build-config.mjs']){
 assert.ok(build.artifacts[file],'Missing emitted owner: '+file);
 assert.equal(hash(fs.readFileSync(path.join(site,file))),build.artifacts[file],file);
}
const {stages:catalog}=nativeStageCatalog();
const requested=arg('--stages','all');
const ids=requested==='all'?catalog.map(s=>s.id):requested.split(',').map(s=>s.trim());
assert(ids.length&&ids.every(Boolean)&&new Set(ids).size===ids.length,'Invalid or duplicate stage selection');
for(const id of ids)assert(catalog.some(s=>s.id===id),'Unknown native stage: '+id);
const definitions=new Map(catalog.map(s=>[s.id,s]));
const profiles={
 ipad:{viewport:{width:1024,height:768},screen:{width:1024,height:768},deviceScaleFactor:2,isMobile:true,hasTouch:true,
  userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'},
 phone:{viewport:{width:844,height:390},screen:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true,
  userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36'},
};
const result={schema:1,status:'running',site,pathBoundBuildSha256:hash(buildBytes),contentHash:build.contentHash,
 revision:build.build.revision,renderFrames:frames,requestedStages:ids,profiles:[],
 scope:'Chromium mobile emulation: normal stage load, intro render and disposal smoke; not physical iPad/phone FPS or full-match acceptance.'};
const save=()=>{const file=path.join(out,'mobile-browser.json');fs.writeFileSync(file+'.pending',JSON.stringify(result,null,2)+'\n');fs.renameSync(file+'.pending',file);};
save();
const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 try{const url=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
  if(!file.startsWith(site+path.sep)||!fs.statSync(file).isFile())throw Error('Missing file');
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 result.browserVersion=browser.version();
 for(const name of device==='both'?['ipad','phone']:[device]){
  const record={device:name,status:'running',stages:[],errors:[],blockedExternal:[]};result.profiles.push(record);save();
  const context=await browser.newContext({...profiles[name],locale:'ja-JP'});
  try{
   await context.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(origin+'/')||url.startsWith('blob:')||url.startsWith('data:'))return route.continue();
    if(record.blockedExternal.length<20)record.blockedExternal.push(url.split('?')[0]);
    return route.abort('blockedbyclient');
   });
   const page=await context.newPage();page.setDefaultTimeout(300000);
   page.on('pageerror',error=>{record.errors.push(error.message);save();});
   page.on('console',message=>{if(message.type()==='error'&&/THREE\.WebGLProgram|GL_INVALID|shader error/i.test(message.text())){record.errors.push(message.text());save();}});
   await page.addInitScript(()=>{
    Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5});
    Object.defineProperty(navigator,'deviceMemory',{get:()=>undefined});
    localStorage.setItem('inkwave.settings',JSON.stringify({quality:'high',frameRate:'display',musicVolume:0,audioVolume:0,minimap:true}));
    let seed=13579;globalThis.__nativeMobileSeed=value=>{seed=value>>>0;};
    Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
   });
   console.log('boot '+name);await page.goto(origin+'/?map=tidewater&shadercheck',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>globalThis.__G?.game?.menus&&__G.mode!=='boot'||document.querySelector('#boot-error')?.textContent,null,{timeout:300000});
   await page.evaluate(()=>{if(document.querySelector('#boot-error')?.textContent)throw Error(document.querySelector('#boot-error').textContent);__G.game.debug.freeze();__G.game._skipRender=true;});
   const enabled=await page.evaluate(async()=>{const {nativeStageBuild}=await import(new URL('patches/native-stages/runtime/build-config.mjs',document.baseURI));return Object.keys(nativeStageBuild?.prebuilt?.stages||{});});
   for(const id of ids)assert(enabled.includes(id),'Stage lacks shipped prebuilt data: '+id);
   for(const [index,id]of ids.entries()){
    const row={id,name:definitions.get(id).name,status:'running'};record.stages.push(row);save();console.log(name+' start '+id);
    const started=Date.now();
    Object.assign(row,await checkedEvaluate(page,async({id,index,frames})=>{
     const G=__G,g=G.game,previous=g.nativeWorld,oldLevel=G.level,oldPaint=G.paint,oldPhysics=G.physics,oldNav=G.nav;
     g.debug.freeze();g._skipRender=true;g.menus.wipe.cancel();globalThis.__nativeMobileSeed(13579+index);
     await g.startMatch({mapId:id,mode:'turf',difficulty:'normal',duration:180});
     g.menus.wipe.cancel();
     if(!G.level?.native||G.level.layout.id!==id||g.nativeWorld?.level!==G.level)throw Error('Native stage publication mismatch');
     const world=g.nativeWorld,q=g.R.q,gl=G.renderer.getContext();
     if(!g.mobile?.touch)throw Error('Touch profile was not selected');
     if(G.actors.length!==8||G.actors.filter(a=>a.bot).length!==7)throw Error('Normal eight-actor match missing');
     if(G.physics.level!==G.level||G.paint.level!==G.level||G.nav.level!==G.level||G.nav.physics!==G.physics)throw Error('Mismatched live native authorities');
     if(!G.level.data.sourceMetrics?.prebuilt)throw Error('Native load fell back from shipped converted data');
     if(world.metrics.quality!=='balanced')throw Error('Mobile High used detail texture profile '+world.metrics.quality);
     if(!(q.pixelRatio<=1&&q.shadowSize<=1024&&q.reflectionScale<=.1&&q.reflectionInterval>=4&&q.reflectionActors===false&&q.ao===false&&q.msaa===0&&q.bloom===false))throw Error('Mobile native rendering caps missing');
     if(G.paint.size>2048)throw Error('Unbounded native paint atlas');
     let detailMaterials=0;world.display.group.traverse(o=>{if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.normalMap||m.roughnessMap||m.emissiveMap)detailMaterials++;});
     if(detailMaterials)throw Error('Balanced native profile still binds detail maps');
     if(previous&&previous!==world&&(!previous.disposed||previous.display.group.parent||G.level===oldLevel||G.paint===oldPaint||G.physics===oldPhysics||G.nav===oldNav))throw Error('Previous native world remains published');
     const nativeGroups=G.scene.children.filter(o=>o.name==='native-source-display').length;
     const nativeInk=G.scene.children.filter(o=>o.name==='native-game-ink').length;
     if(nativeGroups!==1||nativeInk!==1)throw Error('Duplicate or missing native render roots');
     const frameRows=[];g._skipRender=false;
     try{for(let i=0;i<frames;i++){
      g._frame(1/60);const pixel=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      const error=gl.getError();if(error||gl.isContextLost())throw Error('WebGL failure '+error);
      frameRows.push({calls:G.renderer.info.render.calls,triangles:G.renderer.info.render.triangles,glError:error});
     }}finally{g._skipRender=true;}
     if(!['intro','playing'].includes(G.match.state))throw Error('Unexpected match state '+G.match.state);
     return{native:true,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,matchState:G.match.state,
      touch:g.mobile,quality:q,textureQuality:world.metrics.quality,textureCount:world.metrics.textureCount,
      textureLimit:world.metrics.textureLimit,atlas:G.paint.size,framebuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],
      prebuilt:true,nativeGroups,nativeInk,detailMaterials,previousDisposed:!previous||previous===world||previous.disposed,
      sourceSha256:G.level.manifest.sourceSha256,geometry:G.level.manifest.geometry,frameRows,memory:{...G.renderer.info.memory}};
    },{id,index,frames},name+' '+id));
    assert.equal(row.sourceSha256,definitions.get(id).sourceSha256,id+' source identity');
    if(name==='ipad')assert(row.touch.ipad&&row.touch.ios,'iPad profile detection');
    else assert(row.touch.phone&&row.touch.android,'Phone profile detection');
    assert.equal(record.errors.length,0,record.errors.join('\n'));
    row.elapsedMs=Date.now()-started;row.status='passed';save();console.log(name+' passed '+id+' '+row.elapsedMs+'ms');
   }
   record.release=await checkedEvaluate(page,async()=>{
    const G=__G,g=G.game,previous=g.nativeWorld;g.menus.wipe.cancel();await g.startMatch({mapId:'tidewater',mode:'turf',difficulty:'normal'});g.menus.wipe.cancel();
    if(G.level.native||g.nativeWorld||!previous.disposed||previous.display.group.parent||G.scene.children.some(o=>o.name==='native-source-display'||o.name==='native-game-ink')||g.R.__nativeGpuBudget?.caps)throw Error('Native world release or preset restoration failed');
    return{nativeReleased:true,previousDisposed:true,rawPresetRestored:g.R.q===g.R.__nativeGpuBudget.raw};
   },undefined,name+' native release');
   assert.equal(record.release.rawPresetRestored,true);record.status='passed';save();
  }catch(error){record.status='failed';record.error=error.stack;save();throw error;}
  finally{await context.close();}
 }
 result.status='passed';
}catch(error){result.status='failed';result.error=error.stack;process.exitCode=1;}
finally{save();await browser?.close();await new Promise(resolve=>server.close(resolve));}
console.log(JSON.stringify({status:result.status,profiles:result.profiles.map(p=>({device:p.device,status:p.status,passed:p.stages.filter(s=>s.status==='passed').length})),error:result.error}));
