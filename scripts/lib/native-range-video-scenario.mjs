// QA extraction of the existing native volume probe's /?range&skipTitle startup.
// Uses shipped/default assets. No source pack registration or scene/model/light edits.
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {sha256}from'./continuous-browser-video.mjs';
export function nativeRangeScenario({url,seed=0x49574b33}){
 assert(Number.isSafeInteger(seed)&&seed>0&&seed<=0xffffffff);
 const meta={seed,scenarioHash:sha256(readFileSync(new URL(import.meta.url))),inputScheduleHash:sha256('default shooter; hold debug.fire for8 wall seconds; no movement'),viewportHash:sha256('960x540 dpr1'),simulationClock:'fixed-60Hz-from-wall-RAF'};
 return {
 async prepare(page){
  await page.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===url?route.continue():route.abort('blockedbyclient');});
  await page.addInitScript(seed=>{let x=seed>>>0;Math.random=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};},seed);
  await page.goto(url+'/?range&skipTitle',{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>window.__G?.match?.range&&window.__G.match.state==='playing',null,{timeout:180000});
  const setup=await page.evaluate(async()=>{const G=window.__G,g=window.__inkwave;g.debug.freeze();g.debug.freezeBots();if(await G.fx.inkVolumeReady!==true)throw Error('default native assets not ready');
   if(G.fx.inkVolumeError||!G.renderer||!g.s3Clock)throw Error('native range renderer/clock/assets missing');
   const a=G.local;a.setWeapon('shooter');a.ink=100;a.weaponRunner.reset();g.debug.fire(false);g._skipRender=false;
   const originalRender=G.renderer.render,originalSplat=G.paint.splat;
   window.__video={frames:0,splats:0,started:false,originalRender,originalSplat};
   G.renderer.render=function(scene,camera,...rest){const r=originalRender.call(this,scene,camera,...rest);if(scene===G.scene&&camera===G.camera)window.__video.frames++;return r;};
   G.paint.splat=function(...args){const r=originalSplat.apply(this,args);window.__video.splats++;return r;};
   const lights=[];G.scene.traverse(o=>{if(o.isLight)lights.push({type:o.type,color:o.color.toArray(),intensity:o.intensity,position:o.position.toArray()});});
   window.__video.fingerprint=()=>{const lights=[];G.scene.traverse(o=>{if(o.isLight)lights.push({type:o.type,color:o.color.toArray(),intensity:o.intensity,position:o.position.toArray()});});return {lights:JSON.stringify(lights),camera:JSON.stringify({position:G.camera.position.toArray(),quaternion:G.camera.quaternion.toArray(),projection:G.camera.projectionMatrix.toArray()})};};Object.assign(window.__video,window.__video.fingerprint());
   g.debug.unfreeze();return {camera:window.__video.camera,lights:window.__video.lights,range:!!G.match.range,weapon:a.weaponId};});
  assert(setup.range);meta.cameraHash=sha256(setup.camera);meta.lightingHash=sha256(setup.lights);
 },
 async start(page){await page.evaluate(()=>{window.__video.started=true;window.__video.actionWallMs=performance.now();document.getElementById('__videoMarker').style.background='#00ff00';window.__inkwave.debug.fire(true);});},
 async observe(page){return page.evaluate(()=>{const G=window.__G,g=window.__inkwave,v=window.__video;const f=v.fingerprint();if(f.camera!==v.camera||f.lights!==v.lights)throw Error('camera/light invariant drift');return {gameTime:G.time,playing:G.match.state==='playing',paused:!!G.match.paused,alive:!!G.local.alive,camera:f.camera,lights:f.lights,world:JSON.stringify(G.projectiles.list.filter(p=>p.owner===G.local).map(p=>({pos:p.pos?.toArray?.(),age:p.age,life:p.life}))),wallMs:performance.now(),renderedFrames:v.frames,simulationTicks:g.s3Clock.ticks,activity:G.projectiles.list.some(p=>p.owner===G.local),paintEvents:v.splats,activeOwnedProjectiles:G.projectiles.list.filter(p=>p.owner===G.local).length};});},
 async finish(page){const timing=await page.evaluate(()=>{const G=window.__G,g=window.__inkwave,v=window.__video;g.debug.fire(false);document.getElementById('__videoMarker').style.background='#0000ff';const f=v.fingerprint();if(f.camera!==v.camera||f.lights!==v.lights)throw Error('end camera/light invariant drift');G.renderer.render=v.originalRender;G.paint.splat=v.originalSplat;return {actionWallMs:v.actionWallMs,endWallMs:performance.now(),finalCamera:f.camera,finalLights:f.lights,renderer:G.renderer.getContext().getParameter(G.renderer.getContext().RENDERER)};});return {...meta,timing,scope:'native practice diagnostic scene; actual production classes, not full match or physical-device performance'};}
 };
}
