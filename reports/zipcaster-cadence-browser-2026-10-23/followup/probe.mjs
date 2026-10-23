import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from '/workspace/actions/node_modules/playwright/index.mjs';
import { verifyRuntimeBuild } from '/workspace/zipcaster-browser-candidate/scripts/lib/inkwave-runtime-evidence.mjs';
const root='/workspace/zipcaster-cadence-evidence/browser-run',out=path.join(root,'followup');
const hash=b=>createHash('sha256').update(b).digest('hex');
const launchArgs=['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
const result={scope:'Unchanged minified builds; native reset ordering plus emitted VFX input-controlled hook comparison. No model edits, added geometry, browser flag or timeout changes.',launchArgs,errors:[],consoleErrors:[],lanes:[],cancelCases:[]};
const save=()=>fs.writeFileSync(path.join(out,'probe-result.json'),JSON.stringify(result,null,2)+'\n');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.mp3':'audio/mpeg'};
let browser,page,server,canonical=null;
try{
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',env:{...process.env,TMPDIR:'/workspace/zctmp',TMP:'/workspace/zctmp',TEMP:'/workspace/zctmp'},args:launchArgs});result.browser=browser.version();
 for(const lane of ['base','candidate']){
  const site=path.join(root,'builds',lane),source='/workspace/zipcaster-browser-'+lane;
  const sha=lane==='base'?'726e338ac256ba9609086ce65e25a68ddd99df85':'66a271f8fe5d91fc108f1f2a8a3d13860bff410e',m=verifyRuntimeBuild(site,source,sha),served=new Set();
  server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://local');if(u.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}const rel=decodeURIComponent(u.pathname).replace(/^\//,'')||'index.html',file=path.resolve(site,rel);if(!file.startsWith(site+'/')||!m.artifacts[rel])throw Error('unbound');const b=fs.readFileSync(file);assert.equal(hash(b),m.artifacts[rel]);served.add(rel);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(b);}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  page=await browser.newPage({viewport:{width:960,height:540},deviceScaleFactor:1});
  page.on('pageerror',e=>result.errors.push({lane,error:String(e)}));page.on('console',e=>{if(e.type()==='error')result.consoleErrors.push({lane,error:e.text()});});
  await page.addInitScript(()=>{localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,musicVolume:0,audioVolume:0,frameRate:'display'}));let s=0x49373236;Math.random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};});
  console.log('BOOT '+lane);await page.goto('http://127.0.0.1:'+server.address().port+'/?range&skipTitle',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>window.__G?.match?.range&&window.__G.match.state==='playing'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});
  const setup=await page.evaluate(async()=>{
   const G=window.__G,g=window.__inkwave,a=G.local;g.debug.freeze();g.platform.driver.stop();g.debug.freezeBots();g._skipRender=true;for(let i=0;i<240;i++)g._frame(1/60);
   await a.character._sourceMotionLoader;await a.character.sourceMotion?.ready;a.setWeapon('s3-blaster-short');const THREE=await import('three'),d=G.fx.s3SpecialVfx;
   window.p={G,g,a,d,THREE,mode:'none',record:false,callback:0,events:[],births:[],hands:{},ticks:[],serial:0,ids:new WeakMap(),pending:false,resetMode:null,canonical:null,replayHands:false,snapshot:{}};
   const id=t=>{if(!t)return null;if(!p.ids.has(t))p.ids.set(t,++p.serial);return p.ids.get(t);};
   p.reset=()=>{const old=d.tracks.get(a);p.events.push({event:'reset-execute',callback:p.callback,nativeTick:Math.round(G.time*60),phase:a._s3AllSpecialState?.phase??null,record:id(old),carry:old?.d.zipVfxCarry??null,mode:p.resetMode});a.spawnAt(new THREE.Vector3(6,.05,25),0);g.rig.yaw=0;g.rig.pitch=0;g.rig.follow(a,true);p.pending=false;};
   const update=a.update;a.update=function(dt,...args){if(p.record&&p.pending&&p.resetMode==='native')p.reset();const r=update.call(this,dt,...args);if(p.record)p.ticks.push({tick:Math.round(G.time*60),dt,pos:a.pos.toArray(),phase:a._s3AllSpecialState?.phase??null,hook:a._s3AllSpecialState?.hookFlightT??null,zip:a._s3AllSpecialState?.zipT??null});return r;};
   const track=d.track;d.track=function(actor){const old=this.tracks.get(actor),t=track.call(this,actor);if(p.record&&actor===a&&old!==t)p.events.push({event:'track-change',callback:p.callback,nativeTick:Math.round(G.time*60),oldRecord:id(old),newRecord:id(t),oldCarry:old?.d.zipVfxCarry??null,phase:a._s3AllSpecialState?.phase??null});return t;};
   const call=d.call;d.call=function(fn,...args){const yes=p.record&&args[0]===a&&args[1]?.id==='zipcaster'&&typeof args[2]==='number';let e;if(yes)e={event:'frame',callback:p.callback,nativeTick:Math.round(G.time*60),phase:a._s3AllSpecialState?.phase??null,record:id(args[1]),recordStart:args[1].start,carryBefore:args[1].d.zipVfxCarry??null,dt:args[2]};const r=call.call(this,fn,...args);if(e){e.carryAfter=args[1].d.zipVfxCarry??null;p.events.push(e);}return r;};
   const bone=d.bone;d.bone=function(actor,name,out){const actual=bone.call(this,actor,name,out);if(p.record&&p.mode==='hook'&&actor===a&&name==='handR'){
    const tick=Math.round(G.time*60);if(p.replayHands){const expected=p.canonical[tick];if(!expected)throw Error('Canonical hand sample missing '+tick);p.hands[tick]={actual:actual?.toArray()??null,used:expected.used};return expected.used?out.set(...expected.used):null;}
    p.hands[tick]={actual:actual?.toArray()??null,used:actual?.toArray()??null};
   }return actual;};
   const pool=d.kit.puffs,spawn=pool.spawnRaw;pool.spawnRaw=function(...args){const r=spawn.apply(this,args);if(p.record&&p.birthKind){const state=Array.from(this.p.subarray((this.n-1)*this.S,this.n*this.S));p.births.push({kind:p.birthKind,callback:p.callback,nativeTick:Math.round(G.time*60),phase:a._s3AllSpecialState?.phase??null,record:id(d.tracks.get(a)),state});}return r;};
   const drop=d.drop;d.drop=function(...args){p.birthKind=p.record&&args[5]===.09?'hook':p.record&&args[5]===.08?'zip':null;try{return drop.apply(this,args);}finally{p.birthKind=null;}};
   p.prepare=warm=>{p.record=false;p.mode='none';p.replayHands=false;g.input.keys.clear();g.input.pressed.clear();g.input.mouse.left=g.input.mouse.right=false;a.spawnAt(new THREE.Vector3(6,.05,25),0);g.rig.yaw=0;g.rig.pitch=0;g.rig.follow(a,true);g._skipRender=true;for(let i=0;i<60;i++)g._frame(1/60);G.fx.clear();G.projectiles.clear();a.special=a.specialCost();if(warm){g.debug.key('KeyF',true);g._frame(1/60);g.debug.key('KeyF',false);for(let i=0;i<90;i++)g._frame(1/60);}g.s3Clock.reset();G.time=0;p.events=[];p.births=[];p.hands={};p.ticks=[];p.serial=0;p.ids=new WeakMap();p.pending=false;p.snapshot={};p.callback=0;p.record=true;};
   p.snap=()=>{const gl=G.renderer.getContext();return{time:G.time,phase:a._s3AllSpecialState?.phase,pos:a.pos.toArray(),camera:{p:G.camera.position.toArray(),q:G.camera.quaternion.toArray(),projection:G.camera.projectionMatrix.toArray()},glError:gl.getError(),contextLost:gl.isContextLost(),liveHooks:p.births.filter(x=>x.kind==='hook').map(x=>{const key=x.state[19],rot=x.state[17];let index=-1;for(let j=0;j<pool.n;j++)if(pool.p[j*pool.S+19]===key&&pool.p[j*pool.S+17]===rot){index=j;break;}if(index<0)return{birth:x,alive:false};const state=Array.from(pool.p.subarray(index*pool.S,(index+1)*pool.S)),v=new THREE.Vector3(...state.slice(0,3)).project(G.camera);return{birth:x,alive:true,state,pixel:[(v.x+1)*480,(1-v.y)*270],depth:v.z};})};};
   return{sourceMotion:a.character.sourceMotion?.status,cap:pool.cap,bootError:document.getElementById('boot-error')?.textContent};
  });assert(!setup.bootError);console.log('READY '+lane);
  const hz=lane==='base'?60:30;
  await page.evaluate(({canonical,replay})=>{p.prepare(true);p.mode='hook';p.canonical=canonical;p.replayHands=replay;}, {canonical,replay:lane==='candidate'});
  const captures=[];
  for(let f=0;f<Math.round(hz/3);f++){
   const tick=Math.round((f+1)*60/hz),capture=[14,16,18,20].includes(tick);
   const row=await page.evaluate(({f,hz,capture})=>{const {g,G}=p;p.callback=f;g.debug.key('KeyF',f/hz<.1);g.debug.key('KeyE',f/hz>=.2&&f/hz<.3);g._skipRender=!capture;g._frame(1/hz);return capture?p.snap():null;},{f,hz,capture});
   if(capture){captures.push({tick,...row});await page.screenshot({path:path.join(out,lane+'-hook-tick'+tick+'.jpg'),type:'jpeg',quality:84,timeout:30000});}
  }
  const data=await page.evaluate(()=>{p.record=false;return{hands:p.hands,births:p.births,events:p.events,ticks:p.ticks};});
  if(lane==='base')canonical=data.hands;
  result.lanes.push({lane,sourceSha:sha,contentHash:m.contentHash,hz,setup,captures,...data});save();console.log('HOOK '+JSON.stringify({lane,hz,births:data.births.map(x=>({tick:x.nativeTick,seed:x.state[19],rot:x.state[17],p:x.state.slice(0,3),v:x.state.slice(3,6)}))}));
  for(const mode of lane==='base'?['native']:['direct','native']){
   const rate=lane==='base'?60:120;
   await page.evaluate(mode=>{p.prepare(false);p.mode='cancel';p.resetMode=mode;},mode);
   for(let f=0;f<rate*.9;f++)await page.evaluate(({f,hz})=>{const {g,G}=p;p.callback=f;const time=f/hz;if(Math.abs(time-.8)<1e-7){p.events.push({event:'reset-request',callback:f,nativeTick:Math.round(G.time*60),mode:p.resetMode});if(p.resetMode==='direct')p.reset();else p.pending=true;}g.debug.key('KeyF',time<.1);g.debug.key('KeyE',time>=.2&&time<.3);g._skipRender=true;const before=g.s3Clock.ticks;g._frame(1/hz);p.events.push({event:'callback-end',callback:f,nativeTickBefore:before,nativeTickAfter:g.s3Clock.ticks,relativeTick:Math.round(G.time*60),phase:p.a._s3AllSpecialState?.phase??null});},{f,hz:rate});
   const c=await page.evaluate(()=>{p.record=false;return{births:p.births,events:p.events,ticks:p.ticks,glError:p.G.renderer.getContext().getError(),contextLost:p.G.renderer.getContext().isContextLost(),directorErrors:p.d.errors};});
   const counts={zip:c.births.filter(x=>x.kind==='zip').length,hook:c.births.filter(x=>x.kind==='hook').length};result.cancelCases.push({lane,hz:rate,resetMode:mode,counts,...c});save();console.log('CANCEL '+JSON.stringify({lane,hz:rate,mode,counts,ticks:c.ticks.length,reset:c.events.filter(x=>x.event.startsWith('reset')),glError:c.glError}));
  }
  result.lanes.at(-1).servedRelevantArtifacts=[...served].filter(x=>/special-vfx|all-specials|clock.mjs|src\/main.js/.test(x));
  await page.close();page=null;server.closeAllConnections();await new Promise(r=>server.close(r));server=null;
 }
 result.status='completed';save();
}catch(e){result.status='failed';result.error=String(e.stack||e);save();console.log(result.error);process.exitCode=1;}
finally{await page?.close();await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}save();}
