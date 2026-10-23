import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from '/workspace/actions/node_modules/playwright/index.mjs';
import { verifyRuntimeBuild } from '/workspace/zipcaster-browser-candidate/scripts/lib/inkwave-runtime-evidence.mjs';

const root='/workspace/zipcaster-cadence-evidence/browser-run',runKind=process.argv[4]||'final',out=path.join(root,runKind),lane=process.argv[2]||'candidate';
assert(['final','control60'].includes(runKind));
fs.mkdirSync(out,{recursive:true});
const rates=process.argv[3]?process.argv[3].split(',').map(Number):[30,60,120];
const site=path.join(root,'builds',lane),source='/workspace/zipcaster-browser-'+lane;
const sourceSha=lane==='base'?'726e338ac256ba9609086ce65e25a68ddd99df85':'66a271f8fe5d91fc108f1f2a8a3d13860bff410e';
const manifest=verifyRuntimeBuild(site,source,sourceSha);
const hash=x=>createHash('sha256').update(x).digest('hex');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.mp3':'audio/mpeg'};
fs.mkdirSync('/workspace/zctmp',{recursive:true});
const served=new Set(),requests=[];
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://local');if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}const rel=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';const file=path.resolve(site,rel);if(!file.startsWith(site+'/')||!manifest.artifacts[rel])throw Error('unbound');const data=fs.readFileSync(file);assert.equal(hash(data),manifest.artifacts[rel]);served.add(rel);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(data);}catch(e){requests.push({path:req.url,error:String(e)});res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const launchArgs=['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
const result={schema:2,lane,sourceSha,contentHash:manifest.contentHash,revision:manifest.build.revision,status:'running',launchArgs,launchProvenance:'Exact existing scripts/check-inkwave-browser.mjs Chromium args; no added GPU flags',viewport:[960,540],quality:'low',scope:'Real minified production Game/FixedClock/Actor/Physics/Character/FX/renderer on the ordinary practice range; manually paced FX callbacks, with GPU drawing limited to representative moving hook/zip windows and still captures; not continuous playback or a hardware-FPS test',errors:[],consoleErrors:[],requestFailures:[],cases:[]};
const save=()=>fs.writeFileSync(path.join(out,lane+'-browser.json'),JSON.stringify(result,null,2)+'\n');
let browser,page;
try{
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',env:{...process.env,TMPDIR:'/workspace/zctmp',TMP:'/workspace/zctmp',TEMP:'/workspace/zctmp'},args:launchArgs});
 result.browser=browser.version();page=await browser.newPage({viewport:{width:960,height:540},deviceScaleFactor:1});
 page.on('pageerror',e=>{result.errors.push(String(e));console.log('PAGE_ERROR '+e.message);});
 page.on('console',m=>{if(m.type()==='error'){result.consoleErrors.push(m.text());console.log('CONSOLE_ERROR '+m.text().slice(0,200));}});
 page.on('requestfailed',r=>result.requestFailures.push({url:r.url(),error:r.failure()?.errorText}));
 await page.addInitScript(()=>{localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,musicVolume:0,audioVolume:0,frameRate:'display'}));let s=0x49373236;Math.random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};});
 console.log('BOOT '+lane);await page.goto('http://127.0.0.1:'+server.address().port+'/?range&skipTitle',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>window.__G?.match?.range&&window.__G.match.state==='playing'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});
 result.boot=await page.evaluate(()=>({error:document.getElementById('boot-error')?.textContent,mode:window.__G?.mode,state:window.__G?.match?.state,baseURI:document.baseURI}));assert(!result.boot.error,result.boot.error);
 result.setup=await page.evaluate(async()=>{
  const G=window.__G,g=window.__inkwave;g.debug.freeze();
  if(!g.platform?.driver?.stop)throw Error('Existing PlatformFrameDriver.stop API required for sole manual delivery ownership');
  g.platform.driver.stop();g.debug.freezeBots();g._skipRender=true;
  for(let i=0;i<240;i++)g._frame(1/60);
  const a=G.local;await a.character._sourceMotionLoader;await a.character.sourceMotion?.ready;
  a.setWeapon('s3-blaster-short');if(a.weapon.special!=='zipcaster')throw Error('Canonical Zipcaster kit missing');
  const THREE=await import('three'),{Hit}=await import(new URL('src/game/physics.js',document.baseURI));
  const d=G.fx.s3SpecialVfx;
  window.zc={G,g,a,d,THREE,Hit,drop:d.drop,puff:d.puff,update:a.update,render:g.R.render,frame:0,record:false,rows:[],ticks:[],snapshots:{},contextLost:0};
  g.R.render=function(...args){const r=zc.render.apply(this,args);if(zc.record)zc.drawCount++;return r;};
  G.renderer.domElement.addEventListener('webglcontextlost',()=>zc.contextLost++);
  d.drop=function(p,vx,vy,vz,life,size,col,o){if(zc.record&&(size===.08||size===.09))zc.rows.push({frame:zc.frame,time:G.time,phase:a._s3AllSpecialState?.phase,kind:size===.08?'zip':'hook',p:[p.x,p.y,p.z],v:[vx,vy,vz],life,size});return zc.drop.apply(this,arguments);};
  d.puff=function(kind,p,vx,vy,vz,life,s0,s1,col,alpha,o){if(zc.record&&life===.6&&s0===.06)zc.rows.push({frame:zc.frame,time:G.time,kind:'coat',p:[p.x,p.y,p.z]});return zc.puff.apply(this,arguments);};
  a.update=function(dt,...args){const r=zc.update.call(this,dt,...args);if(zc.record)zc.ticks.push({time:G.time,dt,pos:a.pos.toArray(),phase:a._s3AllSpecialState?.phase??null,hook:a._s3AllSpecialState?.hookFlightT??null,zip:a._s3AllSpecialState?.zipT??null});return r;};
  const gl=G.renderer.getContext();return{kitId:a.weaponId,special:a.weapon.special,sourceMotion:a.character.sourceMotion?.status,range:!!G.match.range,renderer:gl.getParameter(gl.RENDERER),webgl:gl.getParameter(gl.VERSION),initialGlError:gl.getError(),cap:d.kit.puffs.cap,manualDeliveryOwner:true,automaticDriver:g.platform.driver.snapshot()};
 });
 console.log('READY '+lane+' '+JSON.stringify(result.setup));save();
 for(const hz of rates){
  console.log('CASE '+lane+' '+hz+'Hz');
  const initial=await page.evaluate(hz=>{
   const z=zc,{a,g,G,d,THREE,Hit}=z;z.record=false;
   g.input.keys.clear();g.input.pressed.clear();g.input.mouse.left=g.input.mouse.right=false;
   a.spawnAt(new THREE.Vector3(6,.05,25),0);a.setWeapon('s3-blaster-short');a.invuln=0;
   g.rig.yaw=0;g.rig.pitch=0;g.rig.follow(a,true);g._skipRender=true;
   for(let i=0;i<60;i++)g._frame(1/60);
   G.fx.clear();G.projectiles.clear();a.special=a.specialCost();g.debug.key('KeyF',true);g._frame(1/60);g.debug.key('KeyF',false);
   for(let i=0;i<90;i++)g._frame(1/60);
   if(a._s3AllSpecialState?.phase!=='ready')throw Error('Native activation warmup did not retain Zipcaster ready');
   g.s3Clock.reset();G.time=0;
   z.rows=[];z.ticks=[];z.snapshots={};z.frame=0;z.hz=hz;z.glErrors=[];z.record=true;z.drawCount=0;z.peak=0;z.beforeTicks=g.s3Clock.ticks;z.nativeResets=[];z.trails=[];
   const origin=a.pos.clone().add(new THREE.Vector3(0,1.05,0)),h=G.physics.raycast(origin,new THREE.Vector3(0,0,1),35,new Hit(),true);
   if(!h.hit||h.dist<20)throw Error('Native range wall target not admitted');
   g._skipRender=false;
   return {pos:a.pos.toArray(),target:h.point.toArray(),targetNormal:h.normal.toArray(),distance:h.dist,camera:{mode:g.rig.mode,targetLocal:g.rig.target===a,pos:G.camera.position.toArray(),pitch:g.rig.pitch,yaw:g.rig.yaw},nativeTick:g.s3Clock.ticks};
  },hz);
  const seconds=runKind==='control60'?2:4.4;
  const captures=[['hook',Math.round(hz*.2666666667)-1],['zip',Math.round(hz*.8)-1],['phase-end',Math.round(hz*1.9)-1],['cancel',Math.round(hz*3.0666666667)-1],['reuse',Math.round(hz*3.7)-1],['clear',Math.round(hz*4.3666666667)-1]].filter(([,f])=>f<hz*seconds);
  const frames=Math.round(hz*seconds),timings=[];const started=performance.now();
  for(let frame=0;frame<frames;frame++){
   const capture=captures.some(([,index])=>index===frame);
   const receipt=await page.evaluate(({frame,hz,capture})=>{
    const z=zc,{g,G,a,d,THREE}=z,t=frame/hz;z.frame=frame;
    if([2,3,4].some(x=>Math.abs(t-x)<1e-7)){
     const track=d.tracks.get(a);if(track?.d.trail)z.trails.push(track.d.trail);
     a.spawnAt(new THREE.Vector3(6,.05,25),0);g.rig.yaw=0;g.rig.pitch=0;g.rig.follow(a,true);a.special=a.specialCost();z.nativeResets.push({time:t,hadTrack:!!track,phase:track?.phase,trail:!!track?.d.trail});
    }
    const f=t<.1||t>=2.2&&t<2.3||t>=3.2&&t<3.3,e=t>=.2&&t<.3||t>=2.4&&t<2.5||t>=3.4&&t<3.5;
    g.debug.key('KeyF',f);g.debug.key('KeyE',e);
    const draw=capture||(t>=.2&&t<.3666666667)||(t>=.65&&t<.95)||(t>=3.65&&t<3.8);
    g._skipRender=!draw;
    const start=performance.now();g._frame(1/hz);const end=performance.now();
    z.peak=Math.max(z.peak,d.kit.puffs.n);
    const gl=G.renderer.getContext(),error=gl.getError();if(error)z.glErrors.push({frame,error});
    return{frame,at:end,ms:end-start,draw,ticks:g.s3Clock.ticks,phase:a._s3AllSpecialState?.phase??null,pos:a.pos.toArray()};
   },{frame,hz,capture});timings.push(receipt);
   for(const[label,index]of captures)if(frame===index){
    const snap=await page.evaluate(label=>{const z=zc,t=z.d.tracks.get(z.a),gl=z.G.renderer.getContext();const x={frame:z.frame,time:z.G.time,phase:z.a._s3AllSpecialState?.phase??null,pos:z.a.pos.toArray(),camera:{mode:z.g.rig.mode,targetLocal:z.g.rig.target===z.a,pos:z.G.camera.position.toArray()},particles:z.d.kit.stats(),lineAlpha:t?.d.line?.v[11]??null,trailEnded:t?.d.trail?.ended??null,oldTrails:z.trails.map(r=>({ended:r.ended,points:r.pts.length})),liveRibbonCount:z.d.kit.ribbons.list.length,contextLost:gl.isContextLost(),glError:gl.getError()};z.snapshots[label]=x;return x;},label);
    const image=lane+'-'+hz+'-'+label+'.jpg';await page.screenshot({path:path.join(out,image),type:'jpeg',quality:84,timeout:30000});snap.image=image;
   }
   // Pace requested delivery against wall time when the renderer can keep up.
   // Falling behind is recorded, never relabelled as actual target FPS.
   const remaining=started+(frame+1)*1000/hz-performance.now();if(remaining>0)await new Promise(r=>setTimeout(r,Math.min(remaining,1000/hz)));
  }
  const elapsedWallMs=performance.now()-started;
  const data=await page.evaluate(()=>{const z=zc;z.record=false;return{rows:z.rows,ticks:z.ticks,snapshots:z.snapshots,renderedFrames:z.drawCount,peakPuffs:z.peak,glErrors:z.glErrors,contextLost:z.contextLost,nativeResets:z.nativeResets,nativeTickDelta:z.g.s3Clock.ticks-z.beforeTicks,directorErrors:z.d.errors,finalRibbons:z.d.kit.ribbons.list.map(r=>({ended:r.ended,points:r.pts.length}))};});
  const counts=Object.fromEntries(['hook','zip','coat'].map(k=>[k,data.rows.filter(r=>r.kind===k).length]));
  const groups=new Map();for(const row of data.rows.filter(r=>r.kind==='hook'||r.kind==='zip')){const key=row.frame+':'+row.kind;const group=groups.get(key)||[];group.push(row);groups.set(key,group);}
  const packetSummary=Object.fromEntries(['hook','zip'].map(kind=>{const packets=[...groups.values()].filter(g=>g[0].kind===kind);let sameOriginPairs=0;for(const g of packets)for(let i=0;i<g.length;i++)for(let j=i+1;j<g.length;j++)if(g[i].p.every((x,k)=>x===g[j].p[k]))sameOriginPairs++;return[kind,{packets:packets.length,maxBirthsPerPacket:Math.max(0,...packets.map(g=>g.length)),sameOriginPairs}];}));
  const row={hz,requestedIntervalMs:1000/hz,initial,simulatedSeconds:frames/hz,effectCallbacks:frames,elapsedWallMs,effectCallbacksPerWallSecond:frames*1000/elapsedWallMs,actualRenderCallsPerWallSecond:data.renderedFrames*1000/elapsedWallMs,counts,packetSummary,traceHash:hash(JSON.stringify(data.ticks)),...data,timings};
  result.cases.push(row);save();console.log('RESULT '+JSON.stringify({lane,hz,counts,packetSummary,wallSeconds:elapsedWallMs/1000,effectCallbacksPerWallSecond:row.effectCallbacksPerWallSecond,renderedFrames:row.renderedFrames,actualRenderCallsPerWallSecond:row.actualRenderCallsPerWallSecond,nativeTicks:row.nativeTickDelta,peakPuffs:row.peakPuffs,glErrors:row.glErrors,directorErrors:row.directorErrors,finalRibbons:row.finalRibbons}));
 }
 result.status=result.errors.length||result.consoleErrors.length||result.requestFailures.length?'completed-with-errors':'completed';
 result.servedArtifacts=[...served].sort();result.httpFailures=requests;
}catch(e){result.status='failed';result.error=String(e.stack||e);console.log(result.error);if(page){result.failureState=await page.evaluate(()=>({url:location.href,body:document.body.innerText.slice(-2000),mode:window.__G?.mode,state:window.__G?.match?.state})).catch(()=>null);await page.screenshot({path:path.join(out,lane+'-failure.png'),timeout:15000}).catch(()=>{});}process.exitCode=1;}
finally{save();await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
