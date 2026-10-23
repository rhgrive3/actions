#!/usr/bin/env node
// Emitted normal-game capture and separately labelled interruption inspection.
import {chromium} from 'playwright';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
const opt=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const site=fs.realpathSync(opt('--site','_site')),out=path.resolve(opt('--evidence-dir','.ci-scratch/triple-splashdown/normal'));
fs.mkdirSync(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifestBytes=fs.readFileSync(path.join(site,'inkwave-build.json')),manifest=JSON.parse(manifestBytes);
assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);
for(const [name,digest] of Object.entries(manifest.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,name))),digest,name);
const served=new Set(),mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.glb':'model/gltf-binary','.webp':'image/webp','.jpg':'image/jpeg','.mp3':'audio/mpeg'};
const server=http.createServer((req,res)=>{try{
 const name=decodeURIComponent(new URL(req.url,'http://local').pathname),rel=name==='/'?'index.html':name.slice(1),file=path.resolve(site,rel);
 assert.ok(file.startsWith(site+'/')&&fs.statSync(file).isFile());const body=fs.readFileSync(file);
 assert.equal(hash(body),rel==='inkwave-build.json'?hash(manifestBytes):manifest.artifacts[rel],rel+' served build identity');served.add(rel);
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body);
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,400));});
await page.addInitScript(()=>{localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false}));let seed=12345;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};});
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=180',{timeout:120000});
 await page.waitForFunction(()=>window.__G?.mode==='match'&&window.__inkwave?.match?.local&&!window.__inkwave.match.attract&&window.__inkwave.match.state==='playing',null,{timeout:180000});
 await page.waitForTimeout(800);
 const info=await page.evaluate(async()=>{
  const g=window.__inkwave,G=window.__G;g.debug.freeze();g.debug.freezeBots();
  const manifest=await fetch('/inkwave-build.json').then(r=>r.json()),prefix='/_versions/'+manifest.build.revision+'/';
  const api={...await import(prefix+'src/config.js'),...await import(prefix+'src/core/ctx.js')};
  const {applyCatalogueChoice,CATALOGUE_STORAGE}=await import(prefix+'patches/splatoon3/runtime/catalogue.mjs');
  const a=g.match.local;window.splashProbe={g,G,a,api,events:[],blasts:[],rows:[],fxCpu:[]};
  if(!a)throw Error('No local actor');
  // Leave the opening spawner through the ordinary fire input, then finish
  // its native flight before measuring a ground activation.
  g.debug.step(1000/60);g.debug.fire(true);g.debug.step(1000/60);g.debug.fire(false);
  for(let i=0;i<12&&a.s3?.squidSpawn;i++)g.debug.step(20*1000/60);
  if(a.s3?.squidSpawn||!a.grounded)throw Error('Opening spawn has not landed');
  G.fx.clear();G.projectiles.clear();
  const choice={sub:'bomb',special:'tripleSplashdown'};
  localStorage.setItem(CATALOGUE_STORAGE,JSON.stringify({[a.weaponId]:choice}));
  if(!applyCatalogueChoice(a,choice,api))throw Error('Catalogue choice rejected');a.special=a.specialCost();a.invuln=0;
  const d=G.fx.s3SpecialVfx,blast=d.inkBlast,update=d.update;
  d.update=function(){const start=performance.now();try{return update.apply(this,arguments);}finally{window.splashProbe.fxCpu.push(performance.now()-start);}};
  d.inkBlast=function(p,c,r,o){window.splashProbe.blasts.push({time:G.time,pos:p.toArray(),streaks:o.streaks});return blast.apply(this,arguments);};
  api.on('all:special',e=>{if(e.actor===a&&e.id==='tripleSplashdown')window.splashProbe.events.push({time:G.time,action:e.action,index:e.index??-1,pos:e.pos});});
  const gl=G.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
  return {revision:manifest.build.revision,contentHash:manifest.contentHash,inputHash:manifest.inputHash,map:g.mapDef.id,pos:a.pos.toArray(),webgl2:gl instanceof WebGL2RenderingContext,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),browser:navigator.userAgent};
 });
 await page.screenshot({path:out+'/normal-before.png'});
 await page.evaluate(()=>{const {g,a}=window.splashProbe;g.debug.key('KeyQ',true);});
 let previous=0;
 for(const frame of [1,30,60,68,69,70,71,72,85,86,87,88,90,100,110]){
  await page.evaluate(({frame,steps})=>{const {g,a,G,rows}=window.splashProbe;g.debug.step(steps*1000/60);g.debug.key('KeyQ',false);rows.push({frame,time:G.time,phase:a.specialActive?.phase??null,pos:a.pos.toArray(),fists:(G.projectiles._catalogueFists||[]).length,drawCalls:G.renderer.info.render.calls,triangles:G.renderer.info.render.triangles});},{frame,steps:frame-previous});
  previous=frame;
  await page.screenshot({path:out+'/normal-f'+String(frame).padStart(3,'0')+'.png'});
 }
 const result=await page.evaluate(()=>{const {events,blasts,rows,G,fxCpu}=window.splashProbe;return {events:[...events],blasts:[...blasts],rows,fxCpu,vfxErrors:G.fx.s3SpecialVfx.errors};});
 // Inspection deliberately resets the actor and clears its live projectiles;
 // it is not an ordinary uninterrupted activation or a retail comparison.
 await page.evaluate(()=>{const {g,G,a}=window.splashProbe;G.fx.clear();G.projectiles.clear();a.reset();a.spawnAt(a.pos.clone(),a.yaw);a.special=a.specialCost();g.debug.key('KeyQ',true);g.debug.step(1000/60);g.debug.key('KeyQ',false);if(a.specialActive?.id!=='tripleSplashdown'||G.projectiles._catalogueFists?.length!==2)throw Error('Inspection activation missing its two live fists');window.splashProbe.blasts.length=0;});
 await page.screenshot({path:out+'/inspection-before-clear.png'});
 await page.evaluate(()=>{const {g,G}=window.splashProbe;G.projectiles.clear();g.debug.step(1000/60);});
 await page.screenshot({path:out+'/inspection-after-clear.png'});
 const inspection=await page.evaluate(()=>({scenario:'Native projectiles.clear during live fists; one normal debug step afterwards',blasts:window.splashProbe.blasts,vfxErrors:window.splashProbe.G.fx.s3SpecialVfx.errors}));
 const expectedBaseline=process.argv.includes('--expect-baseline-bug');
 fs.writeFileSync(out+'/result.json',JSON.stringify({scope:'Normal boot, stage, HUD and camera; native opening launch, bots frozen and catalogue/gauge setup. Fixed 60Hz native debug steps render selected snapshots only; frame labels are simulation steps after input, not reference recording frames or wall-clock FPS.',...info,...result,inspection,served:[...served],errors},null,2));
 console.log(JSON.stringify({out,info,events:result.events,blasts:result.blasts,inspection,errors}));
 assert.deepEqual(errors,[]);assert.equal(info.webgl2,true);assert.equal(result.vfxErrors,0);assert.equal(inspection.vfxErrors,0);
 assert.equal(result.events.filter(e=>e.action==='impact').length,3);assert.equal(result.blasts.length,3);
 assert.equal(inspection.blasts.length,expectedBaseline?2:0,'retiring live fists must not fabricate a ground impact');
}catch(e){console.log(JSON.stringify({failure:String(e),errors,body:(await page.locator('body').innerText()).slice(0,2000)}));await page.screenshot({path:out+'/failure.png'});throw e;}finally{await browser.close();await new Promise(r=>server.close(r));}
