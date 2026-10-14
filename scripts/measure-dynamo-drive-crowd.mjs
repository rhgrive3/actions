// Isolated eight-Dynamo source-Actor cost; native day IBL, no FPS/device claim.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const opt=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const site=path.resolve(opt('--site','_site')),out=path.resolve(opt('--out','.dynamo-crowd'));
fs.mkdirSync(out,{recursive:true});
const identity=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),prefix='/_versions/'+identity.build.revision+'/';
const errors=[],host={at:new Date().toISOString(),cpus:os.cpus().length,load:os.loadavg()};
const server=http.createServer((req,res)=>{
 if(req.url==='/review'){res.setHeader('Content-Type','text/html');res.end(`<script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script>`);return;}
 const p=path.resolve(site,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!p.startsWith(site+'/')||!fs.existsSync(p)){res.statusCode=404;res.end();errors.push('missing '+req.url);return;}
 res.setHeader('Content-Type',/\.m?js$/.test(p)?'text/javascript':p.endsWith('.json')?'application/json':'application/octet-stream');fs.createReadStream(p).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:720,height:540}});page.on('pageerror',e=>errors.push(String(e)));await page.goto('http://127.0.0.1:'+server.address().port+'/review');
 const result=await page.evaluate(async prefix=>{
  let seed=0x51a7c0de;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const THREE=await import('three'),{install}=await import(prefix+'patches/splatoon3/runtime/install.mjs'),profile=await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json()),api=install(profile),{G}=api;
  const {installWeaponsFidelity}=await import(prefix+'patches/splatoon3/runtime/weapons-fidelity.mjs'),{installMainWeaponCatalogRuntime}=await import(prefix+'patches/splatoon3/runtime/main-weapon-catalog.mjs');installWeaponsFidelity(api,profile);installMainWeaponCatalogRuntime(api,profile);
  const {Environment}=await import(prefix+'src/world/environment.js'),{getWeaponDef}=await import(prefix+'src/game/character-weapons.js'),{farGeometry}=await import(prefix+'src/game/character-lod.js');
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(720,540);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e6eaf2');const envScene=new THREE.Scene(),env=new Environment(renderer,envScene);scene.environment=env.envMap;scene.environmentIntensity=envScene.environmentIntensity;scene.add(env.sun,env.hemi);
  G.scene=scene;G.env=env;G.teamColors=[new THREE.Color('#ff8825'),new THREE.Color('#484ce8')];G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,o)=>{o.length=0;return o;}};G.physics=new api.Physics(G.level);G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};G.paint={sample:()=>1,splat:()=>0};G.match={playing:()=>true};G.time=0;G.projectiles=new api.Projectiles({add(){},remove(){}});
  const actors=[];for(let k=0;k<8;k++){
   const a=new api.Actor({team:Math.floor(k/4),weapon:'s3-roller-heavy',isLocal:k===0,CharacterClass:api.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.character.actor=a;a.character.onEvent=null;a.grounded=a.ground.hit=true;a.pos.set((k%4-1.5)*1.5,0,Math.floor(k/4)*2);scene.add(a.character.root);actors.push(a);
   if(a.character._sourceMotionLoader)await a.character._sourceMotionLoader;if(a.character.sourceMotion?.ready)await a.character.sourceMotion.ready;if(a.character.sourceMotion?.status!=='ready')throw Error('source motion unavailable');
  }G.actors=actors;
  const camera=new THREE.PerspectiveCamera(42,720/540,.05,80);camera.position.set(8,4,9);camera.lookAt(0,1.0,1.0);
  const gl=renderer.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2'),quant=values=>{const a=[...values].sort((x,y)=>x-y);return{p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)]};};
  const geometry=g=>({vertices:g.attributes.position.count,triangles:(g.index?.count||g.attributes.position.count)/3,bytes:(g.index?.array.byteLength||0)+Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0)});
  const d=getWeaponDef('s3-roller-heavy'),far=farGeometry(d.body,700),model={body:geometry(d.body),hinge:geometry(d.parts.hinge.geo),drum:geometry(d.drum),farBody:geometry(far),farCacheStable:far===farGeometry(d.body,700)},tiers={};
  for(const tier of ['game','far']){
   for(const a of actors){a.character.setLod(tier);for(let i=0;i<30;i++)a._finishFrame(1/60);}
   const animation=[],submit=[],complete=[],wait=[],queries=[],syncPixel=new Uint8Array(4);
   for(let n=0;n<100;n++){
    const t0=performance.now();for(const a of actors)a._finishFrame(1/60);const t1=performance.now(),q=timer?gl.createQuery():null;
    if(q)gl.beginQuery(timer.TIME_ELAPSED_EXT,q);renderer.render(scene,camera);if(q)gl.endQuery(timer.TIME_ELAPSED_EXT);const t2=performance.now();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,syncPixel);const t3=performance.now();
    if(n>=20){animation.push(t1-t0);submit.push(t2-t1);complete.push(t3-t1);wait.push(t3-t2);if(q)queries.push(q);}else if(q)gl.deleteQuery(q);
   }
   // WebGL commands and timer availability cross the browser GPU process.
   // Yield/poll instead of deleting all queries after one microtask-sized wait.
   let disjoint=timer?gl.getParameter(timer.GPU_DISJOINT_EXT):null;const gpu=[],pending=new Set(queries),deadline=performance.now()+15000;
   while(pending.size&&performance.now()<deadline&&!disjoint){
    await new Promise(r=>setTimeout(r,50));disjoint=gl.getParameter(timer.GPU_DISJOINT_EXT);
    for(const q of pending)if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)){if(!disjoint)gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);pending.delete(q);}
   }
   for(const q of queries)gl.deleteQuery(q);
   const geometries=new Set();let meshes=0;scene.traverseVisible(m=>{if(m.isMesh){geometries.add(m.geometry);meshes++;}});
   tiers[tier]={actors:actors.length,sourceMotion:actors.map(a=>a.character.sourceMotion.status),visibleMeshes:meshes,uniqueGeometryBytes:[...geometries].reduce((n,g)=>n+geometry(g).bytes,0),triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,animationMs:quant(animation),renderSubmitMs:quant(submit),renderCompleteMs:quant(complete),completionWaitMs:quant(wait),completionMethod:'synchronous 1px readPixels',gpuTimer:{supported:!!timer,disjoint,requested:queries.length,samples:gpu.length,missing:queries.length-gpu.length,timedOut:pending.size>0&&!disjoint,timeoutMs:15000,ms:gpu.length?quant(gpu):null},raw:{animation,submit,complete,wait,gpu},image:renderer.domElement.toDataURL('image/png').split(',')[1]};
  }
  const environment={theme:env.theme,pmrem:[env.envMap.image.width,env.envMap.image.height],intensity:scene.environmentIntensity,toneMapping:'Neutral',sameRenderer:true};
  for(const a of actors){scene.remove(a.character.root);a.character.dispose();}env.dispose();renderer.dispose();return{model,environment,tiers};
 },prefix);
 for(const[tier,row]of Object.entries(result.tiers)){fs.writeFileSync(path.join(out,tier+'.png'),Buffer.from(row.image,'base64'));delete row.image;assert.equal(row.actors,8);assert.ok(row.sourceMotion.every(s=>s==='ready'));if(row.gpuTimer.supported)assert.equal(row.gpuTimer.disjoint,false);}
 const record={revision:identity.build.revision,contentHash:identity.contentHash,pipelineDefinition:'actors-native-ibl-only-sync-readPixels-v2',scope:'Eight real Dynamo Actors with native day IBL/lights only in an isolated scene (Environment background props excluded); renderCompleteMs includes synchronous 1px readPixels completion; software WebGL timing is not full-stage FPS or a device benchmark',host,errors,...result};
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(record,null,2));assert.deepEqual(errors,[]);assert.equal(result.model.farCacheStable,true);console.log(JSON.stringify(record));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
