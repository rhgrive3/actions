#!/usr/bin/env node
// Actual built Actor/FX/surface material on a painted native range lane. Controlled moving poses, not input/retail parity.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]||'_site'),out=path.resolve(process.argv[3]||'.browser-evidence/swim-spray');fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const p=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.resolve(site,'.'+(p==='/'?'/index.html':p));if(!file.startsWith(site+'/')||!fs.existsSync(file)){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{localStorage.setItem('inkwave.settings',JSON.stringify({quality:'high',shadows:false,bloom:false,minimap:false}));let seed=12345678;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);});
 console.log('loading built game');
 await page.goto('http://127.0.0.1:'+server.address().port+'/?range&skipTitle');await page.waitForFunction(()=>window.__G?.match?.range&&__G.match.state==='playing',null,{timeout:180000});
 console.log('range ready');
 const setup=await page.evaluate(async()=>{
  const G=__G,g=G.game,a=G.local,T=await import('three');g.debug.freeze();g.debug.freezeBots();window.sprayT=T;
  // Court lane is level at y=0, away from the raised spawn grate.
  a.pos.set(-3,0,-6);a.vel.set(0,0,0);a.setWeapon('shooter');a.color.set('#d6e31b');G.teamColors[a.team].copy(a.color);
  for(let z=-12;z<=18;z+=.4)G.paint.splat(new T.Vector3(-3,.01,z),2.4,a.team,{instant:true,seed:.4});
  G.paint.flush(1 / 60);window.sprayOrigin=a.pos.clone();
  const cam=G.camera;cam.position.copy(a.pos).add(new T.Vector3(2,2.7,-4));cam.lookAt(a.pos.clone().add(new T.Vector3(0,.15,0)));cam.updateMatrixWorld();
  window.sprayStep=(frame,speed)=>{G.time+=1/60;a.pos.copy(sprayOrigin).add(new T.Vector3(0,0,frame*speed/60));a.form='squid';a.submerged=true;a.climbing=false;a.grounded=true;a.groundN.set(0,1,0);a.vel.set(0,0,speed);a._finishFrame(1/60);cam.position.copy(a.pos).add(new T.Vector3(2,2.7,-4));cam.lookAt(a.pos.clone().add(new T.Vector3(0,.15,0)));cam.updateMatrixWorld();G.fx.update(1/60,cam);g.swimWake.update(1/60,g.levelMat.userData.uniforms,cam.position);g.levelMat.userData.uniforms.uTime.value=G.time;};
  return {origin:a.pos.toArray(),paint:(()=>{const h=G.physics.raycast(a.pos.clone().add(new sprayT.Vector3(0,1,0)),new sprayT.Vector3(0,-1,0),2);return G.paint.sampleWorld(h.face,a.pos);})(),ground:G.level.groundHeight?.(-3,-6,2),quality:g.settings.quality,fxQuality:G.fx.q,sourceReady:a.character.sourceMotion?.status};
 });
 console.log('setup',JSON.stringify(setup));
 const cases=[];
 for(const speed of [3,8,11.8]){
  const dir=path.join(out,String(speed));fs.mkdirSync(dir,{recursive:true});
  await page.evaluate(()=>{__G.fx.clear();__G.game.swimWake.reset();__G.local._wakeT=0;});
  const frames=[];
  for(let frame=0;frame<100;frame++){
   const row=await page.evaluate(({frame,speed})=>{sprayStep(frame,speed);const G=__G,a=G.local;if(frame>=60&&frame%2===0)G.renderer.render(G.scene,G.camera);let maxHeight=0,maxRadius=0;for(let i=0;i<G.fx.dN;i++){maxHeight=Math.max(maxHeight,G.fx.dP[i*3+1]-a.pos.y);maxRadius=Math.max(maxRadius,G.fx.dA[i*8]);}return {frame,drops:G.fx.dN,maxHeight,maxRadius,bodyVisible:a.character.squid.body.visible,paint:(()=>{const h=G.physics.raycast(a.pos.clone().add(new sprayT.Vector3(0,1,0)),new sprayT.Vector3(0,-1,0),2);return G.paint.sampleWorld(h.face,a.pos);})(),image:frame>=60&&frame%2===0?G.renderer.domElement.toDataURL('image/png'):null};},{frame,speed});
   if(row.image)fs.writeFileSync(path.join(dir,String(frame).padStart(3,'0')+'.png'),Buffer.from(row.image.split(',')[1],'base64'));delete row.image;frames.push(row);
  }
  assert(frames.some(f=>f.drops>0));assert(frames.every(f=>!f.bodyVisible));assert(frames.every(f=>f.paint===1),'actual lane stays painted');cases.push({speed,frames});console.log(JSON.stringify({speed,last:frames.at(-1)}));
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({browser:browser.version(),contentHash:JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))).contentHash,setup,cases,errors,scope:'60Hz controlled moving Actor/FX, actual painted range surface, deterministic random. Fixed camera relative to swimmer. Not native-input physics or Switch parity.'},null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
