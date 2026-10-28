#!/usr/bin/env node
// Normal trusted touch input, live rAF/fixed clock and production emitted bytes.
// Observers record existing cue submissions; no debug stepping/state edits.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { enterRangeFromMenu } from './lib/inkwave-range-menu-entry.mjs';
const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
fs.mkdirSync(out,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const result={status:'running',contentHash:manifest.contentHash,inputHash:manifest.inputHash,errors:[],cases:[],verified:[],
 limits:['Chromium with SwiftShader and touch emulation; no hardware/Switch equivalence.',
 'Live inputs and clocks only. Short-flight captures may be missed; cue submission is separate from pixel evidence.',
 'No original Nintendo footage is bundled or claimed as a matched reference.']};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'),file=path.resolve(site,'.'+decodeURIComponent(name));
 if(!file.startsWith(site+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const address='http://127.0.0.1:'+server.address().port;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 result.browser=await browser.version();
 const context=await browser.newContext({viewport:{width:960,height:640},hasTouch:true,isMobile:true,deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage();
 const verified=new Set(),pending=new Set();
 page.on('response',response=>{
  const key=new URL(response.url()).pathname.slice(1);
  if(!/(?:fxHooks\.js|bomb-cues\.mjs|main-weapon-catalog\.mjs|game\/weapons\.js)$/.test(key))return;
  const work=(async()=>{const bytes=await response.body(),digest=crypto.createHash('sha256').update(bytes).digest('hex');
   if(manifest.artifacts[key]!==digest)throw Error('Loaded runtime hash mismatch: '+key);verified.add(key);})();
  pending.add(work);work.catch(e=>result.errors.push(e.message)).finally(()=>pending.delete(work));
 });
 page.on('pageerror',e=>result.errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',lang:'en',cameraShake:0,shadows:false,bloom:false,minimap:false}));
  localStorage.setItem('inkwave.profile',JSON.stringify({name:'Cue QA',level:1,xp:0,wins:0,matches:0,totalTurf:0,weapon:'roller'}));
 });
 result.entry=await enterRangeFromMenu(page,address,{touch:true,timeout:120000,onProgress:r=>console.log('entry',r.route.join('/'))});
 await page.evaluate(()=>{
  window.qaCues=[];window.qaRounds=[];window.qaBombFrames=[];window.qaCanvasFrames=[];window.qaGestures=[];window.qaPointerErrors=0;
  document.addEventListener('pointerlockerror',()=>window.qaPointerErrors++);
  for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,e=>{
   const el=e.target.closest('[data-c],[data-id]');if(el)window.qaGestures.push({type,trusted:e.isTrusted,control:el.dataset.c||el.dataset.id});
  },true);
  const G=window.__G,g=window.__inkwave;
  for(const name of ['dangerRing','mark','beepPulse']){
   const original=G.fx[name];G.fx[name]=function(...args){
    if(window.qaCues.length<4000)window.qaCues.push({name,time:G.time,weapon:G.local.weaponId,args:args.map(v=>v?.toArray?v.toArray():typeof v==='number'?v:null),bombs:G.projectiles.bombs.map(b=>({id:b.s3Sub,age:b.age,fuse:b.fuse,pos:b.pos.toArray(),phase:b.s3Auto?.phase}))});
    return original.apply(this,args);
   };
  }
  const render=g.R.render;
  g.R.render=function(...args){
   const output=render.apply(this,args),id=G.local.weaponId;
   if(window.qaCanvasFrames.some(f=>f.id===id))return output;
   const rings=G.fx.rings,styles=rings.geo.attributes.aMisc.array,positions=rings.geo.attributes.aPosR.array;
   const scan=Array.from({length:rings.geo.instanceCount},(_,i)=>({style:styles[i*4+1],radius:positions[i*4+3]})).filter(s=>s.style===7&&s.radius>10);
   const main=G.projectiles.list.filter(p=>p.owner===G.local&&p.delay<=0&&p.age>0&&p.age<.051&&p.catalog?.descriptor?.unit===0&&p.catalog?.index===0);
   if(id==='blaster'&&scan.length||['s3-slosher-double','s3-slosher-diffusion'].includes(id)&&main.length)
    window.qaCanvasFrames.push({id,time:G.time,scan,main:main.map(p=>({age:p.age,start:p.start.toArray(),pos:p.pos.toArray()})),dataURL:this.renderer.domElement.toDataURL('image/png')});
   return output;
  };
  const draw=G.projectiles._draw;G.projectiles._draw=function(...args){
   const output=draw.apply(this,args);
   if(window.qaBombFrames.length<1600&&this.bombs.length)window.qaBombFrames.push({time:G.time,weapon:G.local.weaponId,bombs:this.bombs.map(b=>({id:b.s3Sub,age:b.age,fuse:b.fuse,pos:b.pos.toArray(),phase:b.s3Auto?.phase}))});
   if(window.qaRounds.length<1200&&this.list.some(p=>p.owner===G.local))window.qaRounds.push({time:G.time,pitch:G.local.aimPitch,actor:G.local.pos.toArray(),rounds:this.list.filter(p=>p.owner===G.local).map(p=>({age:p.age,start:p.start.toArray(),pos:p.pos.toArray(),velocity:p.vel.toArray(),unit:p.catalog?.descriptor?.unit,index:p.catalog?.index,damage:p.damage})),drops:(this._s3SplashDrops||[]).map(d=>({actor:d.sourceActor,pos:d.pos.toArray(),drawRadius:d.drawRadius}))});
   return output;
  };
 });
 const cdp=await context.newCDPSession(page);
 async function hold(control,milliseconds){
  const box=await page.locator('[data-c="'+control+'"]').boundingBox();if(!box)throw Error('Touch control missing: '+control);
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  await page.waitForTimeout(milliseconds);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }
 async function equip(id){
  const current=await page.evaluate(()=>window.__G.local.weaponId);if(current===id)return;
  await page.locator('[data-c="pause"]').tap();
  await page.waitForFunction(()=>window.__inkwave.menus.current==='pause');
  await page.locator('[data-id="r-tab-weapon"]').tap();
  const chip=page.locator('[data-id="w-'+id+'"]');await chip.scrollIntoViewIfNeeded();await chip.tap();
  await page.waitForFunction(id=>window.__G.local.weaponId===id&&!window.__G.match.paused,id);
 }
 const selected=process.env.INKWAVE_CUE_CASES?.split(',');
 for(const [id,control] of [['roller','sub'],['charger','sub'],['blaster','sub'],['s3-slosher-double','fire'],['s3-slosher-diffusion','fire']].filter(([id])=>!selected||selected.includes(id))){
  await equip(id);await page.waitForTimeout(700);
  const from=await page.evaluate(()=>({cue:qaCues.length,round:qaRounds.length,bomb:qaBombFrames.length,time:__G.time}));
  await hold(control,control==='sub'?250:650);
  const capture={};
  try {
   if(control==='fire')await page.waitForFunction(n=>qaRounds.length>n,from.round,{timeout:30000});
   else if(id==='blaster')await page.waitForFunction(n=>qaCues.slice(n).some(c=>c.name==='mark'),from.cue,{timeout:30000});
   else if(id==='charger')await page.waitForFunction(n=>qaCues.slice(n).some(c=>c.name==='dangerRing'),from.cue,{timeout:30000});
   else await page.waitForFunction(n=>qaBombFrames.length>n,from.bomb,{timeout:30000});
   capture.time=await page.evaluate(()=>__G.time);
   await page.screenshot({path:path.join(out,id+'-active.png')});
  }catch(e){capture.missed=e.message;}
  await page.waitForFunction(t=>__G.time-t>=4,from.time,{timeout:60000});
  const row=await page.evaluate(({id,from})=>({id,from,time:__G.time,paused:__G.match.paused,frozen:__inkwave.frozen,
   cues:qaCues.slice(from.cue).filter(c=>c.weapon===id),rounds:qaRounds.slice(from.round),bombFrames:qaBombFrames.slice(from.bomb),ink:__G.local.ink,
   audioState:__G.audio?.ctx?.state||__G.audio?.context?.state||null,pointerErrors:qaPointerErrors}),{id,from});
  row.capture=capture;result.cases.push(row);await page.screenshot({path:path.join(out,id+'-after.png')});
  console.log('case',id,JSON.stringify({cues:row.cues.length,roundFrames:row.rounds.length,paused:row.paused,ink:row.ink}));
 }
 const canvasFrames=await page.evaluate(()=>qaCanvasFrames);result.canvasFrames=[];
 for(const {dataURL,...frame} of canvasFrames){const file=frame.id+'-native-render.png',bytes=Buffer.from(dataURL.split(',')[1],'base64');fs.writeFileSync(path.join(out,file),bytes);result.canvasFrames.push({...frame,file,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
 result.allCues=await page.evaluate(()=>qaCues);result.gestures=await page.evaluate(()=>qaGestures);result.end=await page.evaluate(()=>({time:__G.time,frame:__inkwave.s3Clock?.ticks,audio:__G.audio?.stats?.()}));
 await Promise.allSettled([...pending]);result.verified=[...verified].sort();
 result.status=result.errors.length?'failed':'observed';
} catch(e){result.status='failed';result.error=e.stack;console.error(e.stack);}
finally{fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(result,null,2));await browser?.close();await new Promise(r=>server.close(r));}
console.log(JSON.stringify({status:result.status,error:result.error,contentHash:result.contentHash,cases:result.cases.map(r=>({id:r.id,cues:r.cues.length,roundFrames:r.rounds.length})),errors:result.errors}));
if(result.status==='failed')process.exitCode=1;
