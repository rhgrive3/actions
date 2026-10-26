#!/usr/bin/env node
// Actual built Actor/FX/surface material on a painted native range lane. Controlled moving poses, not input/retail parity.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]||'_site'),out=path.resolve(process.argv[3]||'.browser-evidence/swim-film');fs.mkdirSync(out,{recursive:true});const quick=process.argv.includes('--quick');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const p=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.resolve(site,'.'+(p==='/'?'/index.html':p));if(!file.startsWith(site+'/')||!fs.existsSync(file)){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|GLSL|shader error/i.test(m.text()))errors.push(m.text());});
 await page.addInitScript(()=>{localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false}));let seed=12345678;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);});
 console.log('loading built game');
 await page.goto('http://127.0.0.1:'+server.address().port+'/?range&skipTitle');await page.waitForFunction(()=>window.__G?.match?.range&&__G.match.state==='playing',null,{timeout:180000});
 console.log('range ready');
 const setup=await page.evaluate(async()=>{
  const G=__G,g=G.game,a=G.local,T=await import('three');g.debug.freeze();g.debug.freezeBots();window.sprayT=T;const {updateFXQuality}=await import(new URL('patches/local-quality/world-quality.mjs',document.baseURI).href);updateFXQuality(G.fx,1,T);G.renderer.setPixelRatio(1);G.renderer.setSize(960,600,false);g.levelMat.userData.uniforms.uTeamA.value.set('#e4e900');g.levelMat.userData.uniforms.uTeamB.value.set('#2f5bff');
  // Court lane is level at y=0, away from the raised spawn grate.
  a.pos.set(-3,0,-6);a.vel.set(0,0,0);a.setWeapon('shooter');a.color.set('#e4e900');G.teamColors[a.team].copy(a.color);
  for(let z=-12;z<=18;z+=.4)G.paint.splat(new T.Vector3(-3,.01,z),2.4,a.team,{instant:true,seed:.4});
  G.paint.flush(1 / 60);window.sprayOrigin=a.pos.clone();
  G.time=10;const cam=G.camera;cam.fov=45;cam.updateProjectionMatrix();cam.position.copy(a.pos).add(new T.Vector3(1.2,2.5,-4));cam.lookAt(a.pos.clone().add(new T.Vector3(0,.15,0)));cam.updateMatrixWorld();
  window.sprayStep=(frame,speed)=>{G.time+=1/60;a.pos.copy(sprayOrigin).add(new T.Vector3(0,0,frame*speed/60));a.form='squid';a.submerged=true;a.climbing=false;a.grounded=true;a.groundN.set(0,1,0);a.vel.set(0,0,speed);a._finishFrame(1/60);cam.position.copy(a.pos).add(new T.Vector3(1.2,2.5,-4));cam.lookAt(a.pos.clone().add(new T.Vector3(0,.15,0)));cam.updateMatrixWorld();G.fx.update(1/60,cam);g.swimWake.update(1/60,g.levelMat.userData.uniforms,cam.position);g.levelMat.userData.uniforms.uTime.value=G.time;};
  return {origin:a.pos.toArray(),paint:(()=>{const h=G.physics.raycast(a.pos.clone().add(new sprayT.Vector3(0,1,0)),new sprayT.Vector3(0,-1,0),2);return G.paint.sampleWorld(h.face,a.pos);})(),ground:G.level.groundHeight?.(-3,-6,2),diagnostic:'fixed yellow ink and film; 45deg FOV, fixed follow camera, initial G.time10; low startup preset, FX multiplier1 and960x600 output',quality:g.settings.quality,fxQuality:G.fx.q,sourceReady:a.character.sourceMotion?.status};
 });
 console.log('setup',JSON.stringify(setup));
 const cases=[];
 for(const {speed,native} of (quick?[{speed:8,native:true}]:[{speed:3},{speed:8,native:true},{speed:11.8}])){
  const dir=path.join(out,native?'normal8':String(speed));fs.mkdirSync(dir,{recursive:true});
  await page.evaluate(({native,speed})=>{
   if(native)__G.local.color.set('#e4e900');
   // Settle the entry/dive first. The comparison is continuous ordinary swimming.
   for(let n=0;n<90;n++)sprayStep(0,speed);
   __G.fx.clear();__G.game.swimWake.reset();__G.local._wakeT=0;__G.time=10;__G.fx._time=10;
  },{native:!!native,speed});
  const frames=[];
  for(let frame=0;frame<90;frame++){
   const row=await page.evaluate(({frame,speed,quick})=>{sprayStep(frame,speed);const G=__G,a=G.local;if(frame>=30&&frame%2===0&&speed===8)G.renderer.render(G.scene,G.camera);let maxHeight=0,maxRadius=0;for(let i=0;i<G.fx.dN;i++){maxHeight=Math.max(maxHeight,G.fx.dP[i*3+1]-a.pos.y);maxRadius=Math.max(maxRadius,G.fx.dA[i*8]);}const film=G.fx.swimSurface?.slots.filter(s=>s.mesh.visible)||[];return {frame,film:film.length,triangles:film.reduce((n,s)=>n+s.mesh.geometry.index.count/3,0),dots:G.fx.dN,drops:G.fx.dN,maxHeight,maxRadius,bodyVisible:a.character.squid.body.visible,paint:(()=>{const h=G.physics.raycast(a.pos.clone().add(new sprayT.Vector3(0,1,0)),new sprayT.Vector3(0,-1,0),2);return G.paint.sampleWorld(h.face,a.pos);})(),image:frame>=30&&frame%2===0&&speed===8?G.renderer.domElement.toDataURL('image/png'):null};},{frame,speed,quick});
   if(row.image)fs.writeFileSync(path.join(dir,String(frame).padStart(3,'0')+'.png'),Buffer.from(row.image.split(',')[1],'base64'));delete row.image;frames.push(row);
  }
  fs.writeFileSync(path.join(dir,'frames.json'),JSON.stringify(frames));assert(frames.slice(30).every(f=>f.film>0&&f.dots===0),'continuous surface geometry at low and high speed; no unbounded particle-pool emission');assert(frames.every(f=>!f.bodyVisible));assert(frames.every(f=>f.paint===1),'actual lane stays painted');cases.push({speed,native:!!native,frames});console.log(JSON.stringify({speed,last:frames.at(-1)}));
 }
 const colors=[];
 for(const [name,color] of [['yellow','#e4e900'],['orange','#ff6400'],['blue','#2f5bff'],['purple','#9e21f5']]){
  const result=await page.evaluate(({color})=>{
   const G=__G,a=G.local;a.color.set(color);G.teamColors[a.team].copy(a.color);G.game.levelMat.userData.uniforms.uTeamA.value.copy(a.color);
   G.fx.clear();G.game.swimWake.reset();a._wakeT=0;G.time=10;G.fx._time=10;
   for(let i=0;i<=46;i++)sprayStep(i,8);
   const slots=G.fx.swimSurface.slots.filter(s=>s.mesh.visible);
   for(const s of slots)if(!s.mesh.material.color.equals(a.color))throw new Error('film team pigment drift');
   G.renderer.render(G.scene,G.camera);const film=G.renderer.domElement.toDataURL('image/png');
   for(const s of slots)s.mesh.visible=false;
   G.renderer.render(G.scene,G.camera);const surface=G.renderer.domElement.toDataURL('image/png');
   for(const s of slots)s.mesh.visible=true;
   return {film,surface,filmCount:slots.length,bodyVisible:a.character.squid.body.visible,drops:G.fx.dN};
  },{color});
  const dir=path.join(out,'colors');fs.mkdirSync(dir,{recursive:true});
  for(const label of ['film','surface']){fs.writeFileSync(path.join(dir,name+'-'+label+'.png'),Buffer.from(result[label].split(',')[1],'base64'));delete result[label];}
  assert.equal(result.filmCount,1);assert.equal(result.bodyVisible,false);assert.equal(result.drops,0);colors.push({name,color,...result});
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({browser:browser.version(),contentHash:JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))).contentHash,setup,cases,colors,errors,scope:'60Hz controlled moving Actor/FX, actual painted range surface, deterministic random. Fixed camera relative to swimmer. Not native-input physics or Switch parity.'},null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
