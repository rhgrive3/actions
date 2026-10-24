#!/usr/bin/env node
// Real emitted Game, native controller/physics/runner/Character and native death
// countdown/Squid Spawn. Deterministic public debug input and _frame stepping;
// this does not measure display FPS, retail Switch behavior or network transport.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {rangeMenuControlReady} from './lib/inkwave-range-menu-entry.mjs';
const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),overlay=process.argv[4]?path.resolve(process.argv[4]):null;
if(fs.existsSync(out))throw Error('Preserve prior evidence: choose a new output directory');
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const servedOverrides=new Set(), runtimeReads=[];
const server=http.createServer((req,res)=>{const requestPath=new URL(req.url,'http://local').pathname;const override=overlay&&path.join(overlay,requestPath.replace(/^\/_versions\/[a-f0-9]{64}(?=\/)/,''));if(override&&override.startsWith(overlay+path.sep)&&fs.existsSync(override)&&fs.statSync(override).isFile()){servedOverrides.add(requestPath);res.setHeader('content-type','text/javascript');fs.createReadStream(override).pipe(res);return;}const f=path.resolve(site,'.'+new URL(req.url,'http://local').pathname.replace(/\/$/,'/index.html'));if(!f.startsWith(site+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);res.end();return;}res.setHeader('content-type',mime[path.extname(f)]||'application/octet-stream');fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser,page;
const receipt={site,build:JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))).contentHash,overlay:overlay?JSON.parse(fs.readFileSync(path.join(overlay,'manifest.json'))):null,scope:'full emitted Game, offline match, deterministic native input/60Hz fixed simulation; no display FPS or transport claim',errors:[],rows:[],gestures:[],runtimeResponses:[]};
const save=()=>{receipt.servedOverrides=[...servedOverrides];return fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));};
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 page=await browser.newPage({viewport:{width:1000,height:760},deviceScaleFactor:1});page.on('pageerror',e=>receipt.errors.push(e.message));
 page.on('response',response=>{const url=new URL(response.url());if(/\/patches\/splatoon3\/runtime\/(?:roller|roller-detail-motion|spawn-pose-motion|respawn-lifecycle)\.mjs$/.test(url.pathname))runtimeReads.push(response.body().then(bytes=>receipt.runtimeResponses.push({path:url.pathname,status:response.status(),sha256:createHash('sha256').update(bytes).digest('hex')})));});
 await page.addInitScript(()=>{localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',lang:'ja',lastStage:'tidewater',lastMode:'turf'}));localStorage.setItem('inkwave.profile',JSON.stringify({name:'Player',weapon:'roller',style:{hair:0,hat:0,skin:2,outfit:0,eyes:0}}));let rng=0x52455350;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};});
 await page.goto('http://127.0.0.1:'+server.address().port+'/?skipTitle');
 for(const [id,menu] of [['play','main'],['mode-turf','mode']]){
  const selector='.iw-ui [data-id="'+id+'"]';await page.waitForFunction(rangeMenuControlReady,{selector,menu},{timeout:240000});const b=await page.locator(selector).boundingBox();assert(b);await page.mouse.click(b.x+b.width/2,b.y+b.height/2);receipt.gestures.push(id);console.log('menu',id);
 }
 await page.waitForFunction(rangeMenuControlReady,{selector:'.iw-ui [data-id="start"]',menu:'setup'},{timeout:240000});
 await page.evaluate(()=>{const g=window.__inkwave;g.debug.freeze();window.__G.time=0;let rng=0x52455350;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};});
 const start=await page.locator('.iw-ui [data-id="start"]').boundingBox();assert(start);await page.mouse.click(start.x+start.width/2,start.y+start.height/2);receipt.gestures.push('start');
 await page.waitForFunction(()=>window.__G?.match&&!window.__G.match.attract&&window.__G.mode==='match',{timeout:240000});console.log('native match created');
 receipt.setup=await page.evaluate(async()=>{
  const g=window.__inkwave,G=window.__G,a=G.local;g.debug.freeze();g.debug.freezeBots();
  await a.character._sourceMotionLoader;await a.character.sourceMotion.ready;
  g.input.mouse.left=false;g.input.mouse.right=false;g.input.keys.clear();g.input.pressed.clear();
  const {CHARACTER_CHANNELS:C,CHARACTER_TIMERS:T}=await import('/src/game/character.js');
  const {spawnPoseSnapshot}=await import('/patches/splatoon3/runtime/spawn-pose-motion.mjs');
  let shotCount=0,paintCalls=0;
  for(const key of ['fireFlick','fireShooter','fireCharger','fireSplatling','fireSlosh']){const orig=G.projectiles[key];G.projectiles[key]=function(...args){if(args[0]===a)shotCount++;return orig.apply(this,args);};}
  const paint=G.paint.splat;G.paint.splat=function(...args){paintCalls++;return paint.apply(this,args);};
  let tick=0;globalThis.__respawnStep=()=>{g._skipRender=true;g._frame(1/60);tick++;};
  globalThis.__respawnRead=label=>{const c=a.character;return {label,tick,state:G.match.state,phase:a.s3.squidSpawn?.phase??null,alive:a.alive,fire:a.intent.fire,physical:g.input.mouse.left,previous:a._prevIntent.fire,blocked:[...(a.s3.respawnRearm||[])],grounded:a.grounded,groundHit:a.ground.hit,position:a.pos.toArray(),velocity:a.vel.toArray(),rolling:a.weaponRunner.rolling,flick:a.weaponRunner.flick,charge:a.weaponRunner.charge,firing:a.anim.firing,ink:a.ink,turf:a.stats.turf,shotCount,paintCalls,projectileCount:G.projectiles.list.filter(p=>p.owner===a).length,wRoll:c.wRoll,spawnTime:c.tr[T.T_SPAWN],spawnPose:spawnPoseSnapshot(c),anchor:Array.from(c.P.slice(C.ANC,C.ANC+3)),rotation:Array.from(c.P.slice(C.ANCR,C.ANCR+3)),source:c.sourceMotion.debug?.state,camera:{position:G.camera.position.toArray(),quaternion:G.camera.quaternion.toArray()},seed:c.seed,palette:G.teamColors.map(c=>c.getHexString())};};
  // Boot/intro and the opening Squid Spawn retain their own native transitions.
  for(let i=0;i<900&&(G.match.state!=='playing'||a.s3.squidSpawn);i++)__respawnStep();
  if(G.match.state!=='playing'||a.s3.squidSpawn)throw Error('Opening spawn did not finish');
  for(let i=0;i<100;i++)__respawnStep();
  // Restart only the deterministic random stream; retain the native existing
  // avatar, gear, camera, weapon and stage throughout the actual death sequence.
  let rng=0x4c414e44;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  return __respawnRead('settled');
 });
 console.log('opening spawn completed');save();
 // Real splat owns reset/onDeath and native countdown owns respawn. No forced
 // phase/position/ground flags and no direct runner or animator replay.
 receipt.rows.push(await page.evaluate(()=>{window.__G.local.splat(null,'weapon');return __respawnRead('death');}));
 receipt.rows.push(await page.evaluate(()=>{for(let i=0;i<900&&!window.__G.local.alive;i++)__respawnStep();if(!window.__G.local.s3.squidSpawn)throw Error('Countdown failed to enter respawn');return __respawnRead('aim');}));
 await page.evaluate(()=>{__respawnStep();window.__inkwave.debug.fire(true);__respawnStep();window.__inkwave.debug.fire(false);});
 receipt.rows.push(await page.evaluate(()=>{globalThis.__flightCaptureTick=0;return __respawnRead('launch');}));save();console.log('native death/countdown/launch completed');
 for(const target of [49,59,60,61,67,85,110,145]){
  const row=await page.evaluate(target=>{for(;globalThis.__flightCaptureTick<target;globalThis.__flightCaptureTick++)__respawnStep();const G=window.__G;G.game._skipRender=false;G.game.R.render();G.renderer.getContext().finish();return __respawnRead('flight-'+target);},target).catch(async e=>{throw e;});
  receipt.rows.push(row);await page.screenshot({path:path.join(out,'flight-'+target+'.png'),timeout:30000});save();console.log(row.label,JSON.stringify({phase:row.phase,grounded:row.grounded,rolling:row.rolling,rotation:row.rotation}));
 }
 assert.equal(receipt.errors.length,0,JSON.stringify(receipt.errors));receipt.status='captured';
}catch(e){receipt.status='failed';receipt.error=e.stack;await page?.screenshot({path:path.join(out,'failure.png'),timeout:10000}).catch(()=>{});throw e;}
finally{await Promise.all(runtimeReads);save();await browser?.close();await new Promise(r=>server.close(r));}
