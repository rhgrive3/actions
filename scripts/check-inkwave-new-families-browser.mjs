// Production modules, actual Actor/Character/Physics and CPU paint. Fixed 60Hz
// simulation grouped into 30/60/120Hz display updates; software WebGL timings
// are submission cost, not hardware GPU timings or Nintendo parity evidence.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]||'_site'),output=path.resolve(process.argv[3]||'.ci-scratch/new-families.json');
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/probe')return res.end('<!doctype html><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>');
 const f=path.resolve(site,'.'+decodeURIComponent(url.pathname));
 if(!f.startsWith(site+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end();}
 res.setHeader('content-type',f.endsWith('.json')?'application/json':f.endsWith('.png')?'image/png':'text/javascript');fs.createReadStream(f).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,
  args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--js-flags=--expose-gc']});
 const page=await browser.newPage(),errors=[];page.on('console',m=>{if(m.text().startsWith('new-family checked '))console.log(m.text());});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/probe`);
 const stressOnly=process.argv.includes('--stress-only');let cdp,heapBefore=null,gcPauses=[];
 if(stressOnly){cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');await cdp.send('HeapProfiler.collectGarbage');heapBefore=(await cdp.send('Performance.getMetrics')).metrics.find(m=>m.name==='JSHeapUsedSize')?.value;
  cdp.on('Tracing.dataCollected',e=>{for(const v of e.value)if((v.name==='MinorGC'||v.name==='MajorGC')&&v.ph==='X'&&Number.isFinite(v.dur))gcPauses.push({name:v.name,ms:v.dur/1000});});
  await cdp.send('Tracing.start',{categories:'v8',transferMode:'ReportEvents'});}
 const result=await page.evaluate(async({benchmarkOnly,stressOnly})=>{
  const profile=await fetch('/patches/splatoon3/profile.json').then(r=>r.json());
  const {install}=await import('/patches/splatoon3/runtime/install.mjs'),api=install(profile);
  const {MAIN_WEAPON_CATALOG:C}=await import('/patches/splatoon3/runtime/main-weapon-catalog-data.mjs');
  const {ALTERNATE_WEAPON_KITS:K}=await import('/patches/splatoon3/runtime/alternate-weapon-kits-data.mjs');
  const {Level}=await import('/src/world/level.js');
  const {G,THREE,Actor,Character,Projectiles,Physics,PaintSystem,on}=api;
  const target=C.records.filter(r=>['dualies','brella','stringer','splatana'].includes(r.family));
  if(target.length!==16)throw Error('Expected all sixteen base mains: '+target.length);
  const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(320,200);document.body.append(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(55,1.6,.1,500);camera.position.set(12,10,-12);camera.lookAt(0,1,3);
  G.scene=new THREE.Scene();G.camera=camera;G.renderer=renderer;G.settings={quality:'low',shadows:false};G.mode='match';
  G.teamColors=[new THREE.Color('#f80'),new THREE.Color('#03f')];G.netm=null;G.match={playing:()=>true,canRespawn:()=>false};
  const level=new Level({bounds:{minX:-60,maxX:60,minZ:-60,maxZ:100},spawnPads:[[-50,0,0],[50,0,0]],spawnBarrier:0,half:[],single:[
   {kind:'box',min:[-60,-1,-60],max:[60,0,100]},{kind:'box',min:[-20,0,25],max:[20,20,26]}]});
  class CpuPaint extends PaintSystem {
   _initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};}
   _pushQuad(){} _drawQuads(){this.quads=0;this.dryMesh.visible=false;}
  }
  G.level=level;G.physics=new Physics(level);G.paint=new CpuPaint(null,level,{atlasSize:1024,maxDensity:10,cell:.5});G.projectiles=new Projectiles(G.scene);
  const round=v=>Math.round(v*1e7)/1e7,vec=v=>v.toArray().map(round);
  const digest=values=>{let h=2166136261;for(const v of values)h=Math.imul(h^v,16777619);return h>>>0;};
  const measurements=[],cases=[];let events=[],frame=0;
  const random=Math.random;Math.random=()=>.37;
  const off=on('weapon:fire',e=>events.push({frame,weapon:e.weapon,origin:vec(e.muzzle),dir:vec(e.dir),charge:round(e.charge||0)}));
  const actors=[];const clear=()=>{G.projectiles.clear();for(const a of actors){G.scene.remove(a.character.root);a.character.dispose();}actors.length=0;G.actors=[];
   G.paint=new CpuPaint(null,level,{atlasSize:1024,maxDensity:10,cell:.5});G.time=0;events=[];};
  const summaries=[];
  try{for(const r of target){
   const ids=benchmarkOnly||stressOnly?[r.id]:[r.id,...K.filter(k=>k.baseId===r.id).map(k=>k.id)];
   for(const id of ids){
    if(api.WEAPONS[id].catalogRecord!==api.WEAPONS[r.id].catalogRecord)throw Error(id+' does not inherit main source');
    const modes=stressOnly?['stress']:benchmarkOnly?['hold']:id===r.id?['tap','hold','air','squid-cancel',...(['stringer','splatana'].includes(r.family)?['partial',...(r.family==='stringer'?['mid']:[]),'full','charge-jump']:[]),...(r.family==='dualies'?['slide']:[])]:['tap','hold'];
    const chargeParam=r.parameters.spl__WeaponStringerParam?.ChargeParam||r.parameters.spl__WeaponSaberParam?.ChargeParam||{};
    const fullFrames=chargeParam.ChargeFrameFullCharge??72,midFrames=chargeParam.ChargeFrameMidCharge??Math.floor(fullFrames/2);
    for(const mode of modes){let canonical;
     for(const hz of (stressOnly?[60]:[30,60,120])){
      clear();frame=0;
      const a=new Actor({team:0,weapon:id,isLocal:false,CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
      a.character.actor=a;actors.push(a);G.actors=[a];G.scene.add(a.character.root);a.spawnAt(new THREE.Vector3(0,0,0),0);
      a.form='kid';a.invuln=0;a.ink=100;a.grounded=true;a.ground.hit=true;a._spawnBarrier=()=>{};
      if(mode==='air'){a.pos.y=8;a.grounded=false;a.ground.hit=false;}
      a.aimDir.set(0,0,1);a.aimPoint.set(0,a.pos.y+1.05,100);
      G.scene.updateMatrixWorld(true);renderer.render(G.scene,camera);
      const trace=[],timings=[],draw=[];let carry=0,peak=0;
      for(let display=0;display<hz*(stressOnly?22:3);display++){
       carry+=60;while(carry>=hz){carry-=hz;
        // Frame zero supplies the first held sample. Charge is released well
        // after the longest published max stage; hold also exercises canopies.
        a.intent.fire=mode==='stress'?(frame<900&&(!['stringer','splatana'].includes(r.family)||frame%(fullFrames+20)<fullFrames)):mode==='tap'?frame<3:mode==='mid'?frame<midFrames:mode==='partial'?frame<Math.max(1,Math.floor(midFrames/2)):mode==='full'?frame<fullFrames:mode==='charge-jump'?frame<fullFrames+8:mode==='squid-cancel'?frame<15:frame<120;
        if(stressOnly&&frame<900&&frame%60===0)a.ink=100; // bounded full-tank throughput fixture
        a.intent.jump=mode==='charge-jump'&&frame===fullFrames+2;
        a.intent.squid=mode==='squid-cancel'&&frame>=15&&frame<35;
        a.intent.move.set(0,0,mode==='full'&&r.family==='splatana'?1:0);
        G.time+=1/60;const start=performance.now();a.update(1/60);
        if(mode==='slide'&&(frame===1||frame===25||frame===49||frame===73)){a.intent.fire=true;a.weaponRunner.tryDodge(new THREE.Vector3(frame%2?1:0,0,frame%2?0:1));}
        G.projectiles.update(1/60);G.paint.advanceSimulation(1/60);if(frame>=30)timings.push(performance.now()-start);
        peak=Math.max(peak,G.projectiles.list.length+(G.projectiles._s3SplashDrops?.length||0));
        if(frame%15===0)trace.push({frame,pos:vec(a.pos),ink:round(a.ink),cooldown:round(a.weaponRunner.cooldown),
         shots:G.projectiles.list.filter(p=>!p.dead).map(p=>[p.type,vec(p.pos),vec(p.vel)]),paint:digest(G.paint.grid)});
        if(![...a.pos.toArray(),a.ink].every(Number.isFinite))throw Error(id+' '+mode+' nonfinite');frame++;
       }
       if((id===r.id&&mode==='hold'&&display<hz/4)||display===0||display===hz||display===hz*2){const t=performance.now();G.scene.updateMatrixWorld(true);renderer.render(G.scene,camera);draw.push(performance.now()-t);}
      }
      if(stressOnly&&(G.projectiles.list.length||(G.projectiles._s3SplashDrops?.length||0)))throw Error(id+' retains attacks after the seven-second drain');
      const state={trace,events,paint:digest(G.paint.grid),cells:Array.from(G.paint.counts)};
      if(canonical&&JSON.stringify(canonical)!==JSON.stringify(state))throw Error(JSON.stringify({id,mode,hz,firstDifferentTrace:state.trace.findIndex((t,i)=>JSON.stringify(t)!==JSON.stringify(canonical.trace[i])),oldEvents:canonical.events,newEvents:state.events}));canonical=state;
      if(!events.length&&mode!=='squid-cancel')throw Error(id+' '+mode+' never emitted a shot');
      timings.sort((a,b)=>a-b);draw.sort((a,b)=>a-b);measurements.push({id,mode,hz,steps:frame,shots:events.length,peakProjectiles:peak,
       cpuMeanMs:timings.reduce((a,b)=>a+b,0)/timings.length,cpuP95Ms:timings[Math.floor(timings.length*.95)],draws:draw.length,drawSubmitMeanMs:draw.reduce((a,b)=>a+b,0)/draw.length,drawSubmitP95Ms:draw[Math.floor(draw.length*.95)],
       cells:state.cells,paint:state.paint,renderInfo:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures},heapHintBytes:performance.memory?.usedJSHeapSize});
     }
     cases.push({id,base:r.id,mode,shots:canonical.events.length,firstShot:canonical.events[0]?.frame,chargeFrames:mode==='mid'?midFrames:mode==='full'?fullFrames:null,paint:canonical.paint,cells:canonical.cells});
    }
   }
   summaries.push({id:r.id,name:r.names.ja,variants:ids.length-1});console.log('new-family checked '+r.id);
  }}finally{off();Math.random=random;clear();renderer.dispose();}
  return {bases:summaries,cases,measurements,renderer:'SwiftShader',fixedHz:60,renderHz:[30,60,120],
   randomMode:'constant .37; angular distributions require separate statistical tests',
   stress:stressOnly?{firingSeconds:15,drainSeconds:7,refill:'100 ink each second',remainingProjectiles:G.projectiles.list.length,remainingDrops:G.projectiles._s3SplashDrops?.length||0}:null,
   evidence:'production modules, actual Character/Actor/Physics, CPU paint, first quarter-second rendered at each display rate for sixteen base hold scenarios; three sampled renders in other scenarios; no hardware GPU or Nintendo parity claim'};
 },{benchmarkOnly:process.argv.includes('--benchmark-only'),stressOnly});
 if(errors.length)throw Error(errors.join('\n'));
 let memory=null;if(cdp){const done=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');await done;
  const heapBeforeGC=(await cdp.send('Performance.getMetrics')).metrics.find(m=>m.name==='JSHeapUsedSize')?.value;await cdp.send('HeapProfiler.collectGarbage');
  const heapAfterGC=(await cdp.send('Performance.getMetrics')).metrics.find(m=>m.name==='JSHeapUsedSize')?.value;
  memory={heapBefore,heapBeforeGC,heapAfterGC,gcEvents:gcPauses.length,gcPauseTotalMs:gcPauses.reduce((a,p)=>a+p.ms,0),gcPauseMaxMs:Math.max(0,...gcPauses.map(p=>p.ms)),scope:'whole sixteen-case fixture including module/model setup; memory hints inside synchronous page task are coarsely cached'};}
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({contentHash:build.contentHash,buildRevision:build.build?.revision,browser:browser.version(),...result,memory,errors},null,2)+'\n');
 console.log(JSON.stringify({bases:result.bases.length,cases:result.cases.length,frequencyRuns:result.measurements.length,errors}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
