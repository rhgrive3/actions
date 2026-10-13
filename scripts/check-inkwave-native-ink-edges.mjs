#!/usr/bin/env node
// Real source-wall weapon ink; compare the old opaque fringe with the native
// shader's coverage alpha. Private pixels stay outside version control.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {selectNativeProjectileWall} from './lib/native-projectile-probe.mjs';
const site=path.resolve(process.argv[2]||'_site-native-ink-edge');
const out=path.resolve(process.argv[3]||'.browser-evidence/native-ink-edge');
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{
 const u=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
 if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error('Missing');
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
}catch{res.writeHead(404);res.end('Missing');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const result={status:'running',measurement:'Controlled original-source stance, ordinary production Actor/Character/WeaponRunner/Projectiles Shooter; frozen simulation, static source pixels; Chromium SwiftShader, not hardware FPS',stages:[]};
const save=()=>fs.writeFileSync(path.join(out,'edges.json'),JSON.stringify(result,null,2));
try{
 for(const id of (process.env.NATIVE_STAGE_IDS||'mako,scorch').split(',')){
  const c=await browser.newContext({viewport:{width:960,height:640}}),p=await c.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await p.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false,musicVolume:0,audioVolume:0})));
  await p.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
  await p.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
  await p.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:240000});
  assert.equal(await p.locator('#boot-error').textContent(),'');
  await p.evaluate(async id=>{const g=NG.game;g.debug.freeze();g._skipRender=true;g.menus.wipe.cancel();await g.startMatch({mapId:id,mode:'turf',difficulty:'normal'});for(let i=0;i<420;i++)g._frame(1/60);g.debug.freezeBots();},id);
  await p.evaluate('globalThis.selectNativeProjectileWall='+selectNativeProjectileWall.toString());
  const proof=await p.evaluate(async()=>{
   const G=NG,g=G.game,a=G.local,r=G.renderer,gl=r.getContext(),T=await import(new URL('vendor/three/build/three.module.js',document.baseURI));
   const probe=selectNativeProjectileWall(G);a.setWeapon('shooter');G.projectiles.clear();G.paint.clear();
   const aim=probe.target.clone().sub(probe.stance.clone().add(new T.Vector3(0,1.05,0))),yaw=Math.atan2(aim.x,aim.z);
   a.spawnAt(probe.stance,yaw);a.aimPoint.copy(probe.target);a.aimYaw=a.intent.aimYaw=yaw;a.aimPitch=a.intent.aimPitch=Math.atan2(aim.y,Math.hypot(aim.x,aim.z));
   a.intent.move.set(0,0,0);a.intent.squid=a.intent.jump=a.intent.sub=a.intent.special=false;a.intent.fire=true;
   const random=Math.random,splat=G.paint.splat;let admitted=0,naturalWallSplats=0;Math.random=()=>.5;
   G.paint.splat=function(...args){if(args[0].distanceTo(probe.target)<2)naturalWallSplats++;return splat.apply(this,args);};
   try{
    for(let i=0;i<60&&!admitted;i++){G.time+=1/60;a.update(1/60);admitted=G.projectiles.list.length;}
    a.intent.fire=false;
    for(let i=0;i<90;i++){G.time+=1/60;G.projectiles.update(1/60);G.paint.advanceSimulation(1/60);}
   }finally{G.paint.splat=splat;Math.random=random;}
   if(!admitted||!naturalWallSplats||!G.paint.sample(probe.face,probe.u,probe.v))throw Error('No real source-wall shot ownership');
   G.paint.flush(1/60);gl.finish();
   const ink=g.levelMesh,production=ink.material,compile=production.onBeforeCompile,reference=production.clone();
   reference.onBeforeCompile=shader=>{compile(shader);if(!shader.fragmentShader.includes('diffuseColor.a *= gInk;'))throw Error('Coverage-alpha patch missing');shader.fragmentShader=shader.fragmentShader.replace('diffuseColor.a *= gInk;','');};
   reference.onBeforeRender=production.onBeforeRender;reference.customProgramCacheKey=()=> 'native-ink-edge-old-opaque-control';
   const camera=G.camera.clone();G.camera.position.copy(probe.target).addScaledVector(G.level.faces[probe.face].n,4);G.camera.lookAt(probe.target);G.camera.updateMatrixWorld();
   const target=new T.WebGLRenderTarget(480,320),previous=r.getRenderTarget(),background=G.scene.background,clear=r.getClearColor(new T.Color()),clearAlpha=r.getClearAlpha();
   const visible=G.scene.children.map(o=>[o,o.visible]),characters=G.actors.map(a=>[a.character.root,a.character.root.visible]);
   const hooks=new Map();G.scene.traverse(o=>{if(o.isMesh&&o!==ink){hooks.set(o,o.onBeforeRender);o.onBeforeRender=()=>{};}});
   const grid=G.paint.grid.slice(),read=()=>{const b=new Uint8Array(480*320*4);r.readRenderTargetPixels(target,0,0,480,320,b);return b;};
   const draw=(material,on=true)=>{ink.material=material;ink.visible=on;r.clear();r.render(G.scene,G.camera);gl.finish();return read();};
   let metrics;
   try{
    r.setRenderTarget(target);G.scene.background=null;r.setClearColor(0,0);
    for(const [o] of visible)if(o!==ink&&!o.isLight)o.visible=false;ink.visible=true;
    draw(reference);draw(production);const old=draw(reference),fixed=draw(production),fixedAgain=draw(production);
    let oldOpaqueRemoved=0,opaqueCenters=0,opaqueColorErrors=0,fixedSelfPixels=0,partialPixels=0;
    for(let i=0;i<old.length;i+=4){
     if(old[i+3]>250&&fixed[i+3]===0)oldOpaqueRemoved++;
     if(old[i+3]===255&&fixed[i+3]===255){opaqueCenters++;if(old[i]!==fixed[i]||old[i+1]!==fixed[i+1]||old[i+2]!==fixed[i+2])opaqueColorErrors++;}
     if(fixed[i+3]>0&&fixed[i+3]<255)partialPixels++;
     if(fixed.slice(i,i+4).some((v,k)=>v!==fixedAgain[i+k]))fixedSelfPixels++;
    }
    for(const [o,v] of visible)o.visible=v;for(const [root] of characters)root.visible=false;
    G.scene.background=background;r.setClearColor(clear,clearAlpha);
    draw(production);draw(reference);const oldScene=draw(reference),clean=draw(production,false),fixedScene=draw(production,true);
    let sourceRestored=0,oldSourceObscured=0;
    for(let i=0;i<old.length;i+=4)if(old[i+3]>250&&fixed[i+3]===0){
     if([0,1,2].every(k=>fixedScene[i+k]===clean[i+k]))sourceRestored++;
     if([0,1,2].some(k=>oldScene[i+k]!==clean[i+k]))oldSourceObscured++;
    }
    // Whole-source charts can overlap in screen space: removing one chart's
    // white fringe legitimately changes a different chart's ink below it.
    // Check unchanged solid ink on the selected authentic face independently.
    let first=0;for(const f of G.paint.paintFaces){if(f.id===probe.face)break;first+=f.triangles.length*3;}
    const count=G.level.faces[probe.face].triangles.length*3,focusGeometry=new T.BufferGeometry();
    for(const [name,attribute] of Object.entries(ink.geometry.attributes))focusGeometry.setAttribute(name,new T.BufferAttribute(attribute.array.slice(first*attribute.itemSize,(first+count)*attribute.itemSize),attribute.itemSize));
    focusGeometry.computeBoundingSphere();const focus=new T.Mesh(focusGeometry,production);G.scene.add(focus);
    const core=reference.clone();core.onBeforeRender=production.onBeforeRender;
    core.onBeforeCompile=shader=>{reference.onBeforeCompile(shader);shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','if (gInk < 1.0) discard;\n#include <opaque_fragment>');};
    core.customProgramCacheKey=()=> 'native-ink-edge-source-face-solid-control';
    let isolatedOpaqueCenters=0,isolatedOpaqueColorErrors=0;
    try{
     for(const [o] of visible)if(o!==ink&&!o.isLight)o.visible=false;ink.visible=false;G.scene.background=null;r.setClearColor(0,0);
     const focusDraw=material=>{focus.material=material;r.clear();r.render(G.scene,G.camera);gl.finish();return read();};
     focusDraw(core);focusDraw(production);const oldCore=focusDraw(core),newCore=focusDraw(production);
     for(let i=0;i<oldCore.length;i+=4)if(oldCore[i+3]===255){isolatedOpaqueCenters++;if([0,1,2,3].some(k=>oldCore[i+k]!==newCore[i+k]))isolatedOpaqueColorErrors++;}
    }finally{focus.removeFromParent();focusGeometry.dispose();core.dispose();}
    metrics={oldOpaqueRemoved,opaqueCenters,wholeSourceOpaqueColorDifferences:opaqueColorErrors,partialPixels,fixedSelfPixels,sourceRestored,oldSourceObscured,isolatedOpaqueCenters,isolatedOpaqueColorErrors};
    globalThis.nativeInkEdgeScreenshot={reference,production,camera};
   }finally{
    ink.material=production;ink.visible=true;for(const [o,v] of visible)o.visible=v;for(const [root,v] of characters)root.visible=v;
    for(const [o,hook] of hooks)o.onBeforeRender=hook;r.setRenderTarget(previous);r.setClearColor(clear,clearAlpha);G.scene.background=background;target.dispose();
   }
   if(grid.some((v,i)=>v!==G.paint.grid[i]))throw Error('Shader comparison changed gameplay paint');
   if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL error');
   g._skipRender=false;r.render(G.scene,G.camera);
   return {id:G.level.layout.id,sourceSha256:G.level.manifest.sourceSha256,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,weapon:a.weaponId,sourceWeapon:a.weapon.sourceMainActor,sourceObject:probe.sourceObject,face:probe.face,triangle:probe.triangle,admitted,naturalWallSplats,cpuPaintUnchanged:true,...metrics};
  });
  proof.errors=errors;result.stages.push(proof);save();console.log(JSON.stringify(proof));
  assert.equal(errors.length,0);assert.equal(proof.actors,8);assert.equal(proof.bots,7);assert(proof.oldOpaqueRemoved>50,'Old opaque fringe counterexample absent');
  assert(proof.oldSourceObscured>20,'Old fringe did not obscure source texture');assert.equal(proof.sourceRestored,proof.oldOpaqueRemoved,'Outside-ink source pixels not restored');
  assert(proof.isolatedOpaqueCenters>50);assert.equal(proof.isolatedOpaqueColorErrors,0,'Isolated solid original-face ink colour changed');assert.equal(proof.fixedSelfPixels,0);assert(proof.partialPixels>0,'Antialiased edge disappeared');
  await p.screenshot({path:path.join(out,id+'-fixed.png')});
  await p.evaluate(()=>{NG.game.levelMesh.material=nativeInkEdgeScreenshot.reference;NG.renderer.render(NG.scene,NG.camera);});
  await p.screenshot({path:path.join(out,id+'-old.png')});
  await p.evaluate(()=>{NG.game.levelMesh.material=nativeInkEdgeScreenshot.production;nativeInkEdgeScreenshot.reference.dispose();NG.camera.copy(nativeInkEdgeScreenshot.camera);});
  await c.close();
 }
 result.status='passed';
}catch(error){result.status='failed';result.error=error.stack;throw error;}finally{save();await browser.close();await new Promise(r=>server.close(r));}
