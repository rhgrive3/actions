#!/usr/bin/env node
// Same-runner ABBA: actual Actors and native postprocessor, serialized final-output reads.
// Isolated studio scene; valid PMREM on the SAME renderer/context. No world geometry/shadows.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import {chromium} from 'playwright';
import {rosters,expectedWeaponNear,canopyWeapons} from './verify-inkwave-nine-model-crowd.mjs';
const arg=(key,fallback)=>{const at=process.argv.indexOf(key);return at<0?fallback:process.argv[at+1];};
const site=path.resolve(arg('--site','_site')),out=path.resolve(arg('--out','.model-crowd')),roster=arg('--roster','A'),size=600;
if(!rosters[roster])throw Error('Unknown roster');
fs.mkdirSync(out,{recursive:true});
const identity=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),prefix='/_versions/'+identity.build.revision+'/';
const server=http.createServer((req,res)=>{
 if(req.url==='/review'){res.setHeader('Content-Type','text/html');res.end(`<html><head><script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script></head><body style="margin:0"></body></html>`);return;}
 const p=path.resolve(site,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!p.startsWith(site+'/')||!fs.existsSync(p)){res.statusCode=404;res.end();return;}
 res.setHeader('Content-Type',/\.m?js$/.test(p)?'text/javascript':p.endsWith('.json')?'application/json':'application/octet-stream');fs.createReadStream(p).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const errors=[];
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:size,height:size},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.exposeFunction('__recordNineFrame',row=>fs.appendFileSync(path.join(out,'frames.jsonl'),JSON.stringify({...row,hostLoad:os.loadavg(),hostAt:new Date().toISOString()})+'\n'));
 await page.exposeFunction('__recordNineFailure',({image,...state})=>{fs.writeFileSync(path.join(out,'completion-failure.json'),JSON.stringify(state,null,2));if(image)fs.writeFileSync(path.join(out,'completion-failure.png'),Buffer.from(image,'base64'));});
 await page.goto('http://127.0.0.1:'+server.address().port+'/review');
 const result=await page.evaluate(async({prefix,ids,size,expectedNear,expectedCanopy})=>{
  let seed=0x51a7c0de;const resetSeed=()=>{seed=0x51a7c0de;};Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const THREE=await import('three'),{install}=await import(prefix+'patches/splatoon3/runtime/install.mjs');
  const profile=await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json()),api=install(profile),{G,Physics}=api;
  const {installWeaponsFidelity}=await import(prefix+'patches/splatoon3/runtime/weapons-fidelity.mjs'),{installMainWeaponCatalogRuntime}=await import(prefix+'patches/splatoon3/runtime/main-weapon-catalog.mjs');
  installWeaponsFidelity(api,profile);installMainWeaponCatalogRuntime(api,profile);
  const {Renderer}=await import(prefix+'src/core/renderer.js'),container=document.createElement('div');document.body.append(container);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,.05,60),target=new THREE.Vector3(0,.8,0);camera.position.set(-5,3.5,8);camera.lookAt(target);
  const full=new Renderer(container,{quality:'high',shadows:true,bloom:true});full.setScene(scene,camera);
  const renderer=full.renderer,gl=renderer.getContext();if(!full.gtao||!full.bloom?.enabled)throw Error('Native post stack missing');
  if(gl.drawingBufferWidth!==size||gl.drawingBufferHeight!==size)throw Error('Unexpected render resolution');
  const width=1024,height=512,px=new Uint8Array(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const v=y/height<9/16?235:130;px.set([v,v,Math.min(255,v+12),255],(y*width+x)*4);}
  const sky=new THREE.DataTexture(px,width,height);sky.mapping=THREE.EquirectangularReflectionMapping;sky.colorSpace=THREE.SRGBColorSpace;sky.needsUpdate=true;
  const pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromEquirectangular(sky);scene.environment=env.texture;sky.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff,0x60718d,2.1));const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(-3,4,2);scene.add(key);
  G.scene=scene;G.camera=camera;G.renderer=renderer;G.post=full;G.settings={quality:'high'};G.env=null;
  G.teamColors=[new THREE.Color('#ff8825'),new THREE.Color('#484ce8')];G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,o)=>{o.length=0;return o;}};
  G.physics=new Physics(G.level);G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};G.paint={sample:()=>1,splat:()=>0};G.match={playing:()=>true};G.time=0;G.projectiles=new api.Projectiles({add(){},remove(){}});
  resetSeed();const setupStart=performance.now(),actors=[];
  for(let k=0;k<ids.length;k++){
   const a=new api.Actor({team:k%2,name:'Nine-'+k,weapon:ids[k],isLocal:k===0,CharacterClass:api.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
   a.character.actor=a;a.character.onEvent=null;a.grounded=a.ground.hit=true;a.pos.set((k%4-1.5)*1.15,0,Math.floor(k/4)*1.5);scene.add(a.character.root);actors.push(a);
   if(a.character._sourceMotionLoader)await a.character._sourceMotionLoader;if(a.character.sourceMotion?.ready)await a.character.sourceMotion.ready;
   if(a.character.sourceMotion?.status!=='ready')throw Error('Actual Actor source motion not ready');
  }
  G.actors=actors;const actorSetupMs=performance.now()-setupStart;
  for(const a of actors){a.character.setLod('game');for(let j=0;j<40;j++)a._finishFrame(1/60);}
  // Same warmAll API/batched promises used by main.js, including all tier shaders and far geometry.
  const warmStart=performance.now(),programsBeforeWarm=renderer.info.programs.length;
  const warmValues=await Promise.all(actors.map(a=>a.character.warmAll(renderer,camera,scene)));
  if(warmValues.some(x=>!x))throw Error('Native Character warmAll did not complete');
  const warm={actorSetupMs,warmAllMs:performance.now()-warmStart,programsBeforeWarm,programsAfterWarm:renderer.info.programs.length};
  const pixel=new Uint8Array(4);let lastReadState=null;
  const readComplete=()=>{
   if(renderer.getRenderTarget()!==null)throw Error('Postprocessor did not finish at default output');
   gl.bindFramebuffer(gl.READ_FRAMEBUFFER,null);
   gl.readPixels(Math.floor(gl.drawingBufferWidth/2),Math.floor(gl.drawingBufferHeight/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
   const error=gl.getError();lastReadState={pixel:[...pixel],glError:error,contextLost:gl.isContextLost(),defaultReadFramebuffer:gl.getParameter(gl.READ_FRAMEBUFFER_BINDING)===null};if(error!==gl.NO_ERROR||lastReadState.contextLost||!lastReadState.defaultReadFramebuffer)throw Error('Invalid completion read '+JSON.stringify(lastReadState));
   if(pixel[3]!==255||pixel.slice(0,3).every(x=>x===0))throw Error('Empty completion pixel '+[...pixel]);
   return{pixel:[...pixel],glError:error,defaultReadFramebuffer:true,contextLost:false};
  };
  const quant=values=>{const sorted=[...values].sort((a,b)=>a-b);return{p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],min:sorted[0],max:sorted.at(-1)};};
  const tiers={};
  for(const tier of['game','far']){
   const prepare=performance.now();for(const a of actors){a.character.setLod(tier);for(let j=0;j<40;j++)a._finishFrame(1/60);}const tierPrepareMs=performance.now()-prepare;
   const expected=tier==='game'?1:2,lodStates=actors.map(a=>({force:a.character.lod.force,tier:a.character.lod.tier,to:a.character.lod.to})),weaponNear=actors.map(a=>a.character.weapon.near);
   if(lodStates.some(s=>s.force!==expected||s.tier!==expected||s.to!==-1)||weaponNear.some((x,i)=>x!==expectedNear[tier][i])||actors.some((a,i)=>!!a.character.weapon.def.parts?.canopy!==expectedCanopy[i]))throw Error('Unexpected settled LOD');
   const frames=[];let image;
   for(let index=0;index<15;index++){
    const t=performance.now();G.time+=1/60;for(const a of actors)a._finishFrame(1/60);const animated=performance.now();
    const programsBefore=renderer.info.programs.length;renderer.info.reset();full.render();const submitted=performance.now();
    let verification;try{verification=readComplete();}catch(error){const image=renderer.domElement.toDataURL('image/png').split(',')[1];await window.__recordNineFailure({tier,index,error:String(error),state:lastReadState,image});throw error;}const completed=performance.now();
    const row={tier,index,phase:index<3?'warmup':'measured',animationMs:animated-t,submitMs:submitted-animated,readbackWaitMs:completed-submitted,renderThroughReadbackMs:completed-animated,programsBefore,programsAfter:renderer.info.programs.length,fullPostDrawCalls:renderer.info.render.calls,fullPostTriangles:renderer.info.render.triangles,width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,...verification};
    if(index===0){image=renderer.domElement.toDataURL('image/png').split(',')[1];if(tier==='game')warm.firstPostFrame=row;}
    frames.push(row);await window.__recordNineFrame(row); // after synchronous read/capture; no default-buffer discard race
   }
   // Geometry budget is one logical beauty pass, separate from multipass post/zero-count submissions.
   renderer.info.reset();renderer.setRenderTarget(null);renderer.render(scene,camera);readComplete();
   const geos=new Set();scene.traverseVisible(o=>{if(o.isMesh&&o.geometry)geos.add(o.geometry);});
   let visibleGeometryBytes=0;for(const g of geos){if(g.index)visibleGeometryBytes+=g.index.array.byteLength;for(const a of Object.values(g.attributes))visibleGeometryBytes+=a.array.byteLength;}
   const measured=frames.filter(x=>x.phase==='measured');
   tiers[tier]={actors:8,ids:actors.map(a=>a.weaponId||a.character.weaponModel),lodTiers:actors.map(a=>a.character.lodTier),lodStates,weaponNear,camera:{position:camera.position.toArray(),target:target.toArray(),fov:camera.fov,direction:camera.getWorldDirection(new THREE.Vector3()).toArray()},tierPrepareMs,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,visibleGeometryBytes,rendererGeometries:renderer.info.memory.geometries,frames,animationMs:quant(measured.map(x=>x.animationMs)),renderSubmitMs:quant(measured.map(x=>x.submitMs)),completionWaitMs:quant(measured.map(x=>x.readbackWaitMs)),renderThroughReadbackMs:quant(measured.map(x=>x.renderThroughReadbackMs)),image};
  }
  const debug=gl.getExtension('WEBGL_debug_renderer_info'),browser={userAgent:navigator.userAgent,unmaskedRenderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,contextAttributes:gl.getContextAttributes(),width:gl.drawingBufferWidth,height:gl.drawingBufferHeight};
  for(const a of actors){a.weaponRunner.reset();scene.remove(a.character.root);a.character.dispose();}
  return{scope:'Native Renderer high-quality full post stack on an isolated 8-Actor studio scene, valid cube256 IBL in the same GL context. No world geometry/shadow workload. Synchronous final-output 1px read proves completion; times include CPU and SwiftShader/backpressure, not dedicated GPU timing or physical-device FPS.',environment:{inputWidth:width,pmremWidth:env.width,pmremHeight:env.height,toneMapping:renderer.toneMapping,exposure:renderer.toneMappingExposure},post:{gtao:!!full.gtao,bloomEnabled:!!full.bloom?.enabled,passes:full.composer.passes.map(p=>p.constructor.name),dynamicScale:full.dynScale,quality:'high',shaderStatusChecks:renderer.debug.checkShaderErrors},browser,warm,tiers};
 },{prefix,ids:rosters[roster],size,expectedNear:Object.fromEntries(['game','far'].map(t=>[t,rosters[roster].map(id=>expectedWeaponNear(id,t))])),expectedCanopy:rosters[roster].map(id=>canopyWeapons.has(id))});
 for(const[tier,row]of Object.entries(result.tiers)){fs.writeFileSync(path.join(out,'crowd-'+tier+'.png'),Buffer.from(row.image,'base64'));delete row.image;}
 const report={revision:identity.build.revision,contentHash:identity.contentHash,roster,errors,...result};fs.writeFileSync(path.join(out,'crowd.json'),JSON.stringify(report,null,2));
 if(errors.length)throw Error(errors.join('\n'));console.log('NINE_COMPLETED_CROWD '+JSON.stringify(report));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
