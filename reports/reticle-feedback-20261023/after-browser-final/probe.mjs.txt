// Normal emitted app entry plus explicit HUD component diagnostics. No retail/GPU parity claim.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {enterRangeFromMenu} from './lib/inkwave-range-menu-entry.mjs';
const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),before=process.argv.includes('--before');
fs.mkdirSync(out,{recursive:true});
const probeSource=fs.readFileSync(new URL(import.meta.url));fs.writeFileSync(path.join(out,'probe.mjs.txt'),probeSource);
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.mp3':'audio/mpeg'};
const server=http.createServer((req,res)=>{const file=path.resolve(site,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const receipt={before,probeScriptSha256:crypto.createHash('sha256').update(probeSource).digest('hex'),build:JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))).contentHash,seed:0x52455449,errors:[],scenarios:[],acceptance:{component:'pending',browser:'pending',gpu:'SwiftShader only; hardware GPU and Switch unverified'}};
let browser,activePage;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const [name,width,height,touch] of [['desktop',1280,720,false],['phone',844,390,true]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});
  const page=activePage=await context.newPage();page.on('pageerror',e=>receipt.errors.push({name,error:e.message}));
  await page.addInitScript(()=>{let seed=0x52455449;window.__reticleSeed=n=>{seed=n>>>0;};Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',lang:'en',shadows:false,bloom:false,minimap:false}));});
  const entry=await enterRangeFromMenu(page,'http://127.0.0.1:'+server.address().port,{touch,timeout:240000,onProgress:r=>console.log(name,r.route.join('/'))});
  await page.evaluate(async()=>{
   const G=window.__G,g=window.__inkwave,a=G.local;g.debug.freeze();g.debug.freezeBots();G.match.range.movingTargets=false;
   G.match.range.setWeapon('shooter');a.pos.set(-14.6,.04,0);a.vel.set(0,0,0);a.yaw=a.aimYaw=0;g.rig.yaw=0;g.rig.pitch=-.12;a.invuln=0;
   await a.character.sourceMotion.ready;g._skipRender=true;try{for(let n=0;n<90;n++)g._frame(1/60);}finally{g._skipRender=false;}g._frame(0);
   const {on}=await import(new URL('src/core/ctx.js',document.baseURI));window.__reticleHits=[];on('hit',e=>{if(e.attacker===a)window.__reticleHits.push({damage:e.damage,killed:e.killed,weapon:e.weaponId});});
  });
  await page.screenshot({path:path.join(out,name+'-normal-idle.png')});
  const normal=await page.evaluate(()=>{
   const G=window.__G,g=window.__inkwave,h=g.hud;window.__reticleSeed(0x52455449);g.debug.fire(true);let ticks=0;g._skipRender=true;
   try{for(;ticks<180;ticks++){g._frame(1/60);if(window.__reticleHits.length)break;}}finally{g._skipRender=false;g.debug.fire(false);}g._frame(0);
   return{ticks,hits:window.__reticleHits,position:G.local.pos.toArray(),camera:G.camera.position.toArray(),yaw:g.rig.yaw,pitch:g.rig.pitch,renderer:G.renderer.getContext().getParameter(G.renderer.getContext().RENDERER),reticle:h.ret.getBoundingClientRect().toJSON(),kind:h._L.kind};
  });
  // Capture the emitted UI's own first accepted pulse at an identical elapsed time.
  await page.evaluate(()=>{const h=window.__inkwave.hud;for(const a of h.hitEl.getAnimations({subtree:true})) {a.pause();a.currentTime=50;}for(const a of h.ret.getAnimations({subtree:true})){if(/hit|kill/.test(a.animationName||'')){a.pause();a.currentTime=50;}}});
  await page.screenshot({path:path.join(out,name+'-normal-hit.png')});
  const sustained=await page.evaluate(()=>{
   const G=window.__G,g=window.__inkwave;g.debug.fire(true);g._skipRender=true;let ticks=0;
   try{for(;ticks<120;ticks++){g._frame(1/60);if(window.__reticleHits.some(x=>x.killed))break;}}finally{g._skipRender=false;g.debug.fire(false);}g._frame(0);
   return{ticks,hits:window.__reticleHits.slice(),kill:G.game.hud.killEl.className};
  });
  await page.evaluate(()=>{for(const a of window.__inkwave.hud.killEl.getAnimations({subtree:true})){a.pause();a.currentTime=50;}});
  await page.screenshot({path:path.join(out,name+'-normal-kill.png')});
  const component=await page.evaluate(()=>{
   const g=window.__inkwave,h=g.hud,G=window.__G,rows=[];
   const read=()=>({scale:getComputedStyle(h.ret).scale,rotate:getComputedStyle(h.ret).rotate,spread:h.ret.style.getPropertyValue('--sp'),retTranslate:h.ret.style.translate,hitTranslate:h.hitEl.style.translate,hitScale:getComputedStyle(h.hitEl).scale,tickTransition:getComputedStyle(h.ret.querySelector('.iw-ret__tick')).transitionDuration,animations:h.hitEl.getAnimations({subtree:true}).length,hit:h.hitEl.className,kill:h.killEl.className});
   // Explicit component fixture: same guide/cone/aim state, isolated from live collision.
   for(const hz of [30,60,120,144]){
    h._clearReticleFeedback?.();h.ret.classList.remove('is-hitflash','is-killflash');
    h._updCrosshair({weapon:'shooter',crosshair:{spread:18.3,onTarget:'enemy',inRange:true,guide:{x:innerWidth/2+37,y:innerHeight/2-19}}},1/hz);
    const target=read();h.hitMarker('hit',{damage:36});const first=read();
    const fade=[];for(let frame=0;frame<=Math.ceil(hz*.24);frame++){const ms=frame/hz*1000;for(const a of h.hitEl.getAnimations({subtree:true})){a.pause();a.currentTime=ms;}fade.push({ms,opacity:Number(getComputedStyle(h.hitEl.children[0]).opacity)});}
    for(let n=0;n<20;n++)h.hitMarker('hit',{damage:36});const repeated=read();
    h._updCrosshair({weapon:'shooter',crosshair:{spread:0,onTarget:null,inRange:false,guide:{x:innerWidth/2-28,y:innerHeight/2+9}}},1/hz);
    rows.push({hz,target,first,repeated,switched:read(),fade});
   }
   const animations=h.hitEl.getAnimations({subtree:true});for(const a of animations){a.pause();a.currentTime=240;}
   const expired=Array.from(h.hitEl.children,n=>getComputedStyle(n).opacity);
   h.hitMarker('kill',{damage:0});const zeroKill=read();
   h.setVisible(false);const hidden=read();h.setVisible(true);g._updateHud(0);
   return{rows,expired,zeroKill,hidden,children:h.hitEl.children.length,life:G.local.alive};
  });
  const miss=await page.evaluate(()=>{
   const G=window.__G,g=window.__inkwave,h=g.hud;G.projectiles.clear();h._clearReticleFeedback?.();g.rig.yaw=Math.PI;g.rig.pitch=0;
   g._skipRender=true;let count;try{for(let n=0;n<60;n++)g._frame(1/60);count=window.__reticleHits.length;window.__reticleSeed(0x52455449);g.debug.fire(true);for(let n=0;n<30;n++)g._frame(1/60);g.debug.fire(false);for(let n=0;n<60;n++)g._frame(1/60);}finally{g._skipRender=false;g.debug.fire(false);}g._frame(0);
   return{hitDelta:window.__reticleHits.length-count,animations:h.hitEl.getAnimations({subtree:true}).length,spread:h._L.spread};
  });
  await page.screenshot({path:path.join(out,name+'-normal-miss-recovery.png')});
  let portrait=null;
  if(touch){await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'phone-portrait-rotation-guard.png')});portrait=await page.evaluate(()=>({width:innerWidth,height:innerHeight,rotationGuard:document.body.innerText.includes('Rotate to landscape')}));assert(portrait.rotationGuard,'portrait is an existing rotation guard, not a playable HUD state');}
  receipt.scenarios.push({name,width,height,touch,entry,normal,sustained,miss,component,portrait});
  fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));
  assert(normal.hits.some(x=>x.damage>0),'normal projectile must reach a real target');
  assert(sustained.hits.length>=3&&sustained.hits.some(x=>x.killed),'real repeated projectile hits must confirm a splat');assert.equal(miss.hitDelta,0,'real missed shots cannot emit hits');if(!before)assert.equal(miss.animations,0);
  if(!before){for(const r of component.rows){assert.equal(r.target.scale,'1');assert.equal(r.target.animations,0);assert.equal(r.first.hitTranslate,r.first.retTranslate);assert.equal(r.repeated.hitScale,r.first.hitScale);assert.equal(r.switched.hitTranslate,r.first.hitTranslate);assert.equal(r.target.tickTransition,'0s');assert.equal(r.repeated.animations,4);assert.equal(r.fade[0].opacity,1);assert.equal(r.fade.at(-1).opacity,0);assert(r.fade.every((x,i)=>!i||x.opacity<=r.fade[i-1].opacity));}assert(component.expired.every(x=>Number(x)===0));assert(component.zeroKill.kill.includes('is-on'));assert(!component.hidden.kill.includes('is-on'));}
  await context.close();
 }
 assert.deepEqual(receipt.errors,[]);receipt.acceptance.component=before?'baseline recorded':'passed';receipt.acceptance.browser='normal app entered through trusted pointer/touch input; real projectile hit observed';
 receipt.status=before?'baseline recorded':'passed';
}catch(e){receipt.status='failed';receipt.failure=String(e);if(activePage){await activePage.screenshot({path:path.join(out,'failure.png'),timeout:15000}).catch(()=>{});receipt.diagnostic=await activePage.evaluate(()=>({title:document.title,text:document.body.innerText.slice(0,2500),menu:window.__inkwave?.menus?.current,boot:document.getElementById('boot-error')?.textContent})).catch(String);}throw e;}
finally{fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));await browser?.close();await new Promise(r=>server.close(r));}
