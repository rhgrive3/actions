// Normal range bootstrap/native Q and sub-release; controlled position/gauge.
// Screenshots marked inspection use a temporary visibility diagnostic.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://local').pathname;if(p==='/favicon.ico'){res.writeHead(204);res.end();return;}const file=path.resolve(site,'.'+(p==='/'?'/index.html':p));if(!file.startsWith(site+'/')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const report={scope:'Normal game range, native Storm input, controlled starting position/gauge; software WebGL2. Simulation frame labels are not reference recording frames.',errors:[],identity:JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))).contentHash};
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:960,height:640},serviceWorkers:'block'});page.on('pageerror',e=>report.errors.push(String(e)));
 await page.addInitScript(()=>{localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false,musicVolume:0}));let seed=1134;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);});
 await page.goto('http://127.0.0.1:'+server.address().port+'/?range&skipTitle',{waitUntil:'commit'});
 await page.waitForFunction(()=>window.__G?.match?.range&&window.__G.match.state==='playing',null,{timeout:240000});
 await page.evaluate(()=>{const g=window.__inkwave;g.debug.freeze();g.debug.freezeBots();});
 await page.screenshot({path:path.join(out,'normal-boot.png')});
 await page.evaluate(async()=>{await window.__G.local.character.sourceMotion?.ready;});
 report.sequence=await page.evaluate(async()=>{
  const G=window.__G,g=window.__inkwave,{WEAPONS}=await import(new URL('src/config.js',document.baseURI));
  const a=G.local,weapon=Object.values(WEAPONS).find(w=>w.special==='storm');
  a.spawnAt(a.pos.clone().set(-28,0,39),0);a.setWeapon(weapon.id);a.stormGaugeLock=0;a.special=weapon.specialCost;
  g.rig.follow(a,true);g.rig.yaw=0;g.rig.pitch=-.35;g._skipRender=true;
  for(let i=0;i<90;i++)g._frame(1/60);
  a.special=weapon.specialCost;a.stormGaugeLock=0;
  g.debug.key('KeyQ',true);g._frame(1/60);g.debug.key('KeyQ',false);g._skipRender=false;g._frame(1/60);
  if(a.specialActive?.phase!=='hold')throw Error('Native Storm hold not admitted');
  const gl=G.renderer.getContext();return {webgl:gl.getParameter(gl.VERSION),renderer:gl.getParameter(gl.RENDERER),weapon:weapon.id,pos:a.pos.toArray()};
 });
 await page.screenshot({path:path.join(out,'normal-hold.png')});
 await page.evaluate(()=>{const g=window.__inkwave;g._skipRender=true;g.debug.key('KeyE',true);g._frame(1/60);g.debug.key('KeyE',false);g._frame(1/60);if(!window.__G.projectiles.bombs.some(b=>b.kind==='storm'))throw Error('No native throw');});
 report.frames=[];
 for(const target of (process.argv.includes('--budget-only')?[90]:[1,15,45,90,120,180,300,462,479,600])){
  const previous=report.frames.at(-1)?.frame||0;
  const data=await page.evaluate(({target,previous})=>{
   const g=window.__inkwave,G=window.__G;g._skipRender=true;for(let i=previous;i<target;i++)g._frame(1/60);g._skipRender=false;g._frame(0);
   const c=G.projectiles.clouds[0];return {frame:target,active:G.local.specialActive?.phase??null,cloud:c?{t:c.t,dur:c.dur,pos:c.group.position.toArray(),radius:c.group.scale.x,boundary:!!c.rainBoundary,boundaryRadius:c.rainBoundary?.material.uniforms.radius.value,boundaryVisible:c.rainBoundary?.visible,occlusion:c.rainBoundary?.userData.occlusion,vertices:c.rainBoundary?.geometry.attributes.position.count}:null,calls:G.renderer.info.render.calls,triangles:G.renderer.info.render.triangles,hp:G.local.hp,ink:G.local.ink,gauge:G.local.special,lock:G.local.stormGaugeLock,paint: Array.from(G.paint.grid||[]).length,webglError:G.renderer.getContext().getError()};
  },{target,previous});report.frames.push(data);
  if(target===90&&data.cloud?.boundary){
   // The cache-specific runner measures cold/repeated construction. Keep this
   // normal-game probe to the live production cache so it cannot switch
   // production meshes into an unframed diagnostic cache.
   report.boundaryCpu=await page.evaluate(async()=>{const G=window.__G,THREE=await import(new URL('vendor/three/build/three.module.js',document.baseURI)),b=await import(new URL('patches/splatoon3/runtime/storm-boundary.mjs',document.baseURI));return {scope:'live production cache after native input',snapshot:b.stormBoundaryCacheSnapshot?.(G.projectiles)??null};});
   report.visibilityControl=await page.evaluate(()=>{const G=window.__G,g=window.__inkwave,c=G.projectiles.clouds[0],mesh=c.rainBoundary,gl=G.renderer.getContext();const read=()=>{const a=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;};g.R.render();const before=read(),times={on:[],off:[]};for(let i=0;i<12;i++)for(const state of ['off','on']){mesh.visible=state==='on';const t=performance.now();g.R.render();gl.finish();times[state].push(performance.now()-t);}mesh.visible=false;g.R.render();const hidden=read();let pixels=0;for(let i=0;i<before.length;i+=4)if(Math.abs(before[i]-hidden[i])+Math.abs(before[i+1]-hidden[i+1])+Math.abs(before[i+2]-hidden[i+2])>8)pixels++;for(const state of ['on','off'])times[state].sort((a,b)=>a-b);return {pixels,onMedianMs:times.on[6],offMedianMs:times.off[6],onP90Ms:times.on[10],offP90Ms:times.off[10],vertices:mesh.geometry.attributes.position.count};});
   await page.screenshot({path:path.join(out,'inspection-boundary-hidden-simf90.png')});
   await page.evaluate(()=>{window.__G.projectiles.clouds[0].rainBoundary.visible=true;window.__inkwave.R.render();});
  }
  await page.screenshot({path:path.join(out,`normal-throw-simf${target}.png`)});
 }
 if(!process.argv.includes('--visual-only')&&!process.argv.includes('--budget-only')) report.rates=await page.evaluate(async()=>{
  const G=window.__G,g=window.__inkwave,{WEAPONS}=await import(new URL('src/config.js',document.baseURI)),a=G.local,weapon=Object.values(WEAPONS).find(w=>w.special==='storm'),rows=[];
  const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  const original=a.update,physics=G.physics.raycast;let ticks=0,rays=0;G.physics.raycast=function(...args){rays++;return physics.apply(this,args);};
  a.update=function(...args){ticks++;return original.apply(this,args);};
  try{for(const hz of [30,60,120]){
   G.projectiles.clear();G.paint.clear();a.spawnAt(a.pos.clone().set(-28,0,39),0);a.setWeapon(weapon.id);a.stormGaugeLock=0;a.stormGaugeDuration=0;a.special=weapon.specialCost;
   g.rig.follow(a,true);g.rig.yaw=0;g.rig.pitch=-.35;g._skipRender=true;g.debug.key('KeyQ',false);g.debug.key('KeyE',false);g._frame(1/60);
   let seed=991;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);G.time=10;
   ticks=0;rays=0;const trace=[];
   g.debug.key('KeyQ',true);g._frame(1/60);g.debug.key('KeyQ',false);const hold=a.specialActive?.phase;
   g.debug.key('KeyE',true);g._frame(1/60);g.debug.key('KeyE',false);g._frame(1/60);
   for(let frame=0;frame<hz*2;frame++){g._frame(1/hz);const c=G.projectiles.clouds[0];trace.push({ticks,pos:a.pos.toArray(),hp:a.hp,ink:a.ink,special:a.special,lock:a.stormGaugeLock,phase:a.specialActive?.phase??null,cloud:c?{t:c.t,pos:c.group.position.toArray(),scale:c.group.scale.x}:null});}
   const c=G.projectiles.clouds[0],boundary=c?.rainBoundary;rows.push({hz,hold,ticks,rays,final:trace.at(-1),traceHash:await digest(new TextEncoder().encode(JSON.stringify(trace))),paintHash:await digest(new Uint8Array(G.paint.grid.buffer)),boundary:!!boundary,boundaryCenter:boundary?.material.uniforms.center.value.toArray(),radius:boundary?.material.uniforms.radius.value});
   if(c){a.splat(null,'test');g._frame(1/60);if(!G.projectiles.clouds.includes(c))throw Error('Owner death removed native deployed cloud');rows.at(-1).survivesDeath=true;G.projectiles.clear();rows.at(-1).cleared=!c.rainBoundary&&!G.scene.getObjectByName('storm-rain-boundary');}
  }}finally{a.update=original;G.physics.raycast=physics;g._skipRender=false;}
  return rows;
 });
 if(process.argv.includes('--cache-production')){
  report.cacheProduction=await page.evaluate(async()=>{
   const G=window.__G,g=window.__inkwave,p=G.projectiles,THREE=await import(new URL('vendor/three/build/three.module.js',document.baseURI)),b=await import(new URL('patches/splatoon3/runtime/storm-boundary.mjs',document.baseURI)),rows=[];
   if(!b.beginStormBoundaryFrame)throw Error('Cache hooks missing');
   for(const hz of [30,60,120])for(const separated of [false,true]){
    p.clear();for(let i=0;i<8;i++)p._spawnCloud({owner:G.local,team:0,pos:new THREE.Vector3(-28+(separated?(i-3.5)*2:0),0,49.6),dir:new THREE.Vector3(0,0,1)});
    const frames=[],times=[];g._skipRender=true;
    for(let f=0;f<hz*2;f++){const t=performance.now();g._frame(1/hz);times.push(performance.now()-t);if(f<16)frames.push({delivery:f+1,frameN:g._frameN,ticks:g.s3Clock.ticks,ready:p.clouds.filter(c=>c.rainBoundary?.userData.cacheStatus==='ready').length,snapshot:b.stormBoundaryCacheSnapshot(p)});}
    g._skipRender=false;g.R.render();G.renderer.getContext().finish();times.sort((a,b)=>a-b);
    const live={geometryCount:new Set(p.clouds.map(c=>c.rainBoundary.geometry)).size,visible:p.clouds.filter(c=>c.rainBoundary.visible).length,snapshot:b.stormBoundaryCacheSnapshot(p),uniformsCurrent:p.clouds.every(c=>c.rainBoundary.material.uniforms.center.value.equals(c.group.position)),calls:G.renderer.info.render.calls,triangles:G.renderer.info.render.triangles};
    rows.push({hz,separated,frames,live,wholeGameCpuMedianMs:times[Math.floor(times.length/2)],wholeGameCpuP95Ms:times[Math.ceil(times.length*.95)-1]});p.clear();rows.at(-1).clear={snapshot:b.stormBoundaryCacheSnapshot(p),remainingBoundaryMeshes:G.scene.children.filter(o=>o.name==='storm-rain-boundary').length};
   }
   return rows;
  });
  for(const row of report.cacheProduction){assert.equal(row.live.visible,8);assert.equal(row.live.uniformsCurrent,true);assert.equal(row.live.snapshot.maxBuildsPerRender,1);assert.ok(row.live.snapshot.entries<=12);assert.equal(row.clear.snapshot.entries,0);assert.equal(row.clear.snapshot.pending,0);assert.equal(row.clear.remainingBoundaryMeshes,0);if(!row.separated)assert.equal(row.live.geometryCount,1);}
  await page.screenshot({path:path.join(out,'inspection-after-eight-cloud-clear.png')});
 }
 console.log(JSON.stringify(report));

} catch(e){report.error=String(e.stack||e);throw e;}finally{fs.writeFileSync(path.join(out,'probe.json'),JSON.stringify(report,null,2));if(browser)await browser.close();await new Promise(r=>server.close(r));}
