#!/usr/bin/env node
// #1671: per-category main-thread simulation time of one seeded offline Turf
// match, without rendering (the HUD "sim" share). Wrapper timers are
// inclusive and nested, so categories overlap and are not additive. The
// wrappers add their own overhead; compare builds only within one harness.
//
// node scripts/measure-inkwave-native-sim.mjs --site _site-native --stage scorch \
//   [--frames 3600] [--hz 60] [--browser chromium|webkit] [--mobile] [--no-wrappers] [--out file.json]
// WebKit needs `npx playwright install webkit` into PLAYWRIGHT_BROWSERS_PATH
// plus its GTK/GStreamer libraries; it runs JavaScriptCore, not the iPad's
// hardware, and is no substitute for a physical-device trace.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import { chromium, webkit } from 'playwright';
const args=process.argv.slice(2),get=(n,d)=>{const i=args.indexOf(n);return i<0?d:args[i+1];},has=n=>args.includes(n);
const site=path.resolve(get('--site','_site-native')),stage=get('--stage','scorch'),frames=Number(get('--frames',3600)),hz=Number(get('--hz',60));
const engine=get('--browser','chromium'),mobile=has('--mobile'),wrappers=!has('--no-wrappers'),out=get('--out',null);
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json'};
const server=http.createServer((req,res)=>{try{const rel=decodeURIComponent(new URL(req.url,'http://local').pathname),file=path.resolve(site,'.'+(rel==='/'?'/index.html':rel));if(!file.startsWith(site+path.sep)||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=engine==='webkit'?await webkit.launch({headless:true}):await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const context=await browser.newContext(mobile?{viewport:{width:1180,height:820},hasTouch:true,isMobile:engine!=='webkit',userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'}:{viewport:{width:960,height:640}});
 const page=await context.newPage();page.on('pageerror',e=>console.error('page-error '+e.message));
 await page.addInitScript(m=>{localStorage.setItem('inkwave.settings',JSON.stringify(m?{musicVolume:0,audioVolume:0}:{quality:'low',shadows:false,bloom:false,musicVolume:0,audioVolume:0}));
  let s=987654321;Math.random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};},mobile);
 await page.goto('http://127.0.0.1:'+server.address().port+'/?map='+stage,{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__G?.mode==='menu',null,{timeout:300000});
 const report=await page.evaluate(async({stage,frames,hz,wrappers})=>{
  const g=window.__inkwave,G=window.__G;let s=13579;Math.random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
  // Same deterministic start as check-inkwave-native-sim-digest.mjs, so two
  // builds replay one workload (compare the printed roster and final digest).
  // Match.setup draws the roster synchronously; async menu work may draw
  // before it. Re-seed exactly there (the menu's attract match shares the class).
  const MatchProto=G.match&&Object.getPrototypeOf(G.match),setup=MatchProto?.setup;
  if(setup)MatchProto.setup=function(...args){s=11223;return setup.apply(this,args);};
  g.debug.freeze();G.time=0;g.s3Clock?.reset();g.menus.wipe.cancel();await g.startMatch({mapId:stage,mode:'turf',duration:180,difficulty:'normal'});g._skipRender=true;
  s=24680;for(const a of G.actors){const b=a.bot;if(!b)continue;b.sweep=Math.random()*10;b.strafe=Math.random()<.5?1:-1;b.bombCd=3+Math.random()*4;b.think=Math.random()*.2;b.chargeRelease=.95+Math.random()*.05;b.ph1=Math.random()*20;b.ph2=Math.random()*20;b.t=Math.random()*10;b.dodgeCd=1+Math.random()*2;}
  for(let i=0,n=(g.match.turfIntroFrames??253)+47;i<n;i++)g._frame(1/60);g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<300;i++)g._frame(1/60);
  const acc={},w=G.level.triangleWorld;
  const wrap=(obj,name,label)=>{const fn=obj?.[name];if(typeof fn!=='function')return;let depth=0;obj[name]=function(...a){if(depth++){try{return fn.apply(this,a);}finally{depth--;}}const t=performance.now();try{return fn.apply(this,a);}finally{depth--;const m=acc[label]||(acc[label]={ms:0,calls:0});m.ms+=performance.now()-t;m.calls++;}};};
  if(wrappers){
   const P=Object.getPrototypeOf;wrap(P(G.actors[0].character),'update','character.update');wrap(G.match,'update','match.update');
   const bot=G.actors.find(a=>a.bot)?.bot;if(bot)for(const n of ['update','_edgeGuard','_pickPaintGoal'])wrap(P(bot),n,'bot.'+n);
   for(const n of ['update','_resolve'])wrap(P(G.actors[0]),n,'actor.'+n);
   for(const n of ['raycast','groundProbe','collideBody','bodyFits','cameraProbe','segment'])wrap(G.physics,n,'physics.'+n);
   if(w)for(const n of ['ray','queryBox','sweepSphere'])wrap(w,n,'bvh.'+n);
   for(const n of ['advanceSimulation','splat','regionStats','_advanceSplatOwnership','_emitGrowth','_drawQuads','coverage'])wrap(G.paint,n,'paint.'+n);
   for(const n of ['path','nearest'])wrap(G.nav,n,'nav.'+n);wrap(G.projectiles,'update','projectiles.update');wrap(G.fx,'update','fx.update');
  }
  const times=[],spikes=[],q0=w?.queryCount||0,t0=w?.triangleTests||0,ticks0=g.s3Clock.ticks;let prev={};
  g.debug.key('KeyW',true);g.debug.fire(true);const T0=performance.now();
  for(let i=0;i<frames;i++){g.rig.yaw+=.6/hz;const t=performance.now();g._frame(1/hz);const ft=performance.now()-t;times.push(ft);
   const now={};for(const k in acc)now[k]=acc[k].ms;
   if(ft>100)spikes.push({frame:i,ms:Math.round(ft),top:Object.entries(now).map(([k,v])=>[k,Math.round(v-(prev[k]||0))]).filter(x=>x[1]>2).sort((a,b)=>b[1]-a[1]).slice(0,6)});prev=now;}
  const total=performance.now()-T0,ticks=g.s3Clock.ticks-ticks0;g.debug.key('KeyW',false);g.debug.fire(false);
  let digest=2166136261;const mix=x=>{digest=Math.imul(digest^x,16777619)>>>0;};for(const v of G.paint.grid)mix(v);for(const a of G.actors)for(const v of a.pos.toArray())mix(Math.round(v*1e6));
  const sorted=[...times].sort((a,b)=>a-b),pick=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))];
  return {stage,hz,frames,ticks,msPerTick:total/ticks,frameMs:{mean:total/frames,p50:pick(.5),p95:pick(.95),p99:pick(.99),max:sorted.at(-1)},
   bvh:w?{queriesPerTick:(w.queryCount-q0)/ticks,triangleTestsPerTick:(w.triangleTests-t0)/ticks,triangles:w.triangleCount}:null,
   roster:G.actors.map(a=>a.weapon?.id).join(' '),digest,paint:{atlas:G.paint.size,ppm:G.paint.ppm,faces:G.paint.paintFaces?.length},mobile:!!g.mobile?.touch,quality:g.settings?.quality,
   categories:Object.fromEntries(Object.entries(acc).sort((a,b)=>b[1].ms-a[1].ms).map(([k,v])=>[k,{msPerTick:+(v.ms/ticks).toFixed(3),callsPerTick:+(v.calls/ticks).toFixed(1)}])),spikes:spikes.slice(0,40),spikeCount:spikes.length};
 },{stage,frames,hz,wrappers});
 report.browser=engine;report.site=path.basename(site);
 if(out)fs.writeFileSync(out,JSON.stringify(report,null,1));
 const {categories,spikes,...summary}=report;console.log(JSON.stringify(summary));
 for(const [k,v] of Object.entries(categories))console.log(String(v.msPerTick).padStart(9),String(v.callsPerTick).padStart(8),k);
}finally{await browser.close();server.close();}
