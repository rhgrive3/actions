#!/usr/bin/env node
// QA-only full native frame transaction. No hardware GPU/FPS/allocated-byte claim.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import os from 'node:os';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {verifyRuntimeBuild} from './lib/inkwave-runtime-evidence.mjs';
import {enterRangeFromMenu} from './lib/inkwave-range-menu-entry.mjs';
const [siteArg,sourceArg,overlayArg,outArg,variant]=process.argv.slice(2);
assert.ok(['A','B'].includes(variant));
const site=path.resolve(siteArg),source=path.resolve(sourceArg),out=path.resolve(outArg),hash=x=>createHash('sha256').update(x).digest('hex');
fs.mkdirSync(out,{recursive:true});
const sourceSha='429cc1352d9b13ffe83c579ed714b84acf6139ed',manifest=verifyRuntimeBuild(site,source,sourceSha);
const overlay=fs.readFileSync(overlayArg),bound=JSON.parse(fs.readFileSync(path.join(path.dirname(overlayArg),'receipt.json'),'utf8'));
assert.equal(bound.sourceSha,sourceSha);assert.equal(bound.contentHash,manifest.contentHash);assert.equal(bound.inputHash,manifest.inputHash);assert.equal(bound.revision,manifest.build.revision);assert.equal(bound.modulePath,'src/world/inkShading.js');
assert.equal(hash(overlay),bound.baselineEmittedSha256);
const prefix='/_versions/'+manifest.build.revision+'/',target=prefix+bound.modulePath;
assert.equal(hash(fs.readFileSync(path.join(site,target))),bound.candidateEmittedSha256);
const loaded=new Map(),errors=[],mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.mp3':'audio/mpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{try{
 const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(site,'.'+(p==='/'?'/index.html':decodeURIComponent(p)));
 if(!file.startsWith(site+path.sep))throw Error('outside site');
 const key=path.relative(site,file).split(path.sep).join('/'),original=fs.readFileSync(file);assert.equal(hash(original),manifest.artifacts[key]);
 const bytes=variant==='A'&&p===target?overlay:original;loaded.set(key,hash(bytes));
 res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.end(bytes);
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser,result,failure;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:960,height:600}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{
  localStorage.setItem('inkwave.settings',JSON.stringify({quality:'high',shadows:true,bloom:true,frameRate:60}));
  let rng=20261021;window.__materialSeed=(step)=>{rng=(20261021+Math.imul(step,2654435761))>>>0;};
  Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  window.__rollerVideoClocks=()=>{
        const G=window.__G,g=window.__inkwave;
        const finite=(value,label,required=false)=>{
          if(value===undefined||value===null){if(required)throw Error('Missing clock '+label);return null;}
          if(!Number.isFinite(value))throw Error('Non-finite clock '+label);return value;
        };
        const uniforms=[];
        G.scene.traverse(o=>{
          for(const [slot,m]of (Array.isArray(o.material)?o.material:[o.material]).entries()){
            if(!m)continue;
            for(const [kind,bank]of [['direct',m.uniforms],['userData',m.userData?.uniforms]]){
              for(const [key,u]of Object.entries(bank||{})){
                if(/time|clock/i.test(key)&&typeof u?.value==='number')
                  uniforms.push([o.name||'',m.name||'',slot,kind,key,finite(u.value,key)]);
              }
            }
          }
        });
        uniforms.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
        return {game:finite(G.time,'game',true),environment:finite(G.env?.time,'environment',true),
          environmentUniform:finite(G.env?.U?.uTime?.value,'environmentUniform',true),
          fx:finite(G.fx?._time,'fx',true),fxHooks:finite(g.fxHooks?.time,'fxHooks'),
          paint:finite(G.paint?.clock,'paint',true),decor:finite(g.decor?.time,'decor'),
          decorUniform:finite(g.decor?.uTime?.value,'decorUniform'),propsUniform:finite(g.props?.uTime?.value,'propsUniform'),
          levelUniform:finite(g.levelMat?.userData?.uniforms?.uTime?.value,'levelUniform'),
          grateUniform:finite(g.grateMat?.userData?.uniforms?.uTime?.value,'grateUniform'),uniforms};
      };
      if(Object.hasOwn(window,'__inkwave'))throw Error('Game was already published before early-freeze hook');
      Object.defineProperty(window,'__inkwave',{configurable:true,set(game){
        Object.defineProperty(window,'__inkwave',{value:game,writable:true,configurable:true,enumerable:true});
        if(!game||typeof game!=='object')throw Error('Invalid native game publication');
        game.frozen=true;
        const boundary=window.__rollerBootFreeze={schema:1,boundary:'first-native-game-publication',clocks:null};
        queueMicrotask(()=>{
          if(window.__G?.game!==game||!game.frozen||typeof game.debug?.freeze!=='function')
            throw Error('Native game publication did not complete before first frame');
          game.debug.freeze();
          boundary.clocks=window.__rollerVideoClocks();
        });
      }});

  document.addEventListener('click',e=>{
   if(!e.isTrusted||!e.target?.closest?.('.iw-ui [data-id="mode-range"]'))return;
   const g=window.__inkwave;if(g?.menus?.current!=='mode')return;
   g.debug.freeze();const boot=window.__rollerBootFreeze?.clocks,entry=window.__rollerVideoClocks();
   if(!boot||JSON.stringify(boot)!==JSON.stringify(entry))throw Error('Publication-to-entry scene drift');
   window.__materialEntry={trusted:true,boot,entry};window.__materialSeed(0);
   g.api.setLoadout({weapon:'shooter'});
   if(g.api.getLoadout()?.weapon!=='shooter')throw Error('Native shooter selection failed');
  },true);
 });
 const entry=await enterRangeFromMenu(page,'http://127.0.0.1:'+server.address().port,{timeout:300000});
 result=await page.evaluate(async()=>{
  const G=window.__G,g=window.__inkwave,a=G.local;
  const THREE=await import('three');
  if(!g.frozen||!G.match?.range||G.match.state!=='playing'||!window.__materialEntry?.trusted)throw Error('Native range admission');
  const character=a.character,warm=character._warmed,loader=character._sourceMotionLoader;
  if(!warm?.then)throw Error('Native startup warmup missing');
  if(!loader?.then)throw Error('Native local Character source loader missing');
  await warm;await loader;
  const motion=character.sourceMotion;
  if(!motion?.ready?.then)throw Error('Native local Character source owner ready Promise missing');
  await motion.ready;
  if(a.character!==character||character._warmed!==warm||character._sourceMotionLoader!==loader)
   throw Error('Native local Character readiness ownership changed');
  const requireMotionReady=(character,owner)=>{
   if(!owner||owner!==character.sourceMotion||owner.character!==character||owner.status!=='ready'||owner.error||owner.disposed||!owner.enabled||!owner.bank||!owner.squidBank)
    throw Error('Native local Character source motion not ready');
  };
  requireMotionReady(character,motion);
  // Exercise the same predicate with isolated fake owners, never mutate the native Character.
  const controlCharacter={},controlOwner={character:controlCharacter,status:'ready',error:null,disposed:false,enabled:true,bank:{},squidBank:{}};
  controlCharacter.sourceMotion=controlOwner;requireMotionReady(controlCharacter,controlOwner);
  for(const override of [{status:'loading'},{status:'error',error:'load failed'},{disposed:true},{enabled:false},{bank:null},{squidBank:null},{character:{}}]){
   const owner={...controlOwner,...override};controlCharacter.sourceMotion=owner;
   let rejected=false;try{requireMotionReady(controlCharacter,owner);}catch{rejected=true;}
   if(!rejected)throw Error('Invalid source motion negative control accepted');
  }
  controlCharacter.sourceMotion=controlOwner;
  for(const owner of [null,{...controlOwner}]){
   let rejected=false;try{requireMotionReady(controlCharacter,owner);}catch{rejected=true;}
   if(!rejected)throw Error('Missing or replaced source owner negative control accepted');
  }
  const motionReady={status:motion.status,enabled:motion.enabled,error:motion.error,disposed:motion.disposed,
   ownerMatches:motion.character===a.character,variant:motion.variant,humanBankPresent:!!motion.bank,squidBankPresent:!!motion.squidBank};
  if(a.weaponId!=='shooter')throw Error('Wrong native loadout');
  g.debug.freeze();g.R.setDynamicScale(1);g.input.keys.clear();g.debug.fire(false);
  if(G.audio){let seed=20261021;G.audio.rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
  if(!(g.levelMat?.userData?.uniforms?.uGel?.value>=0))throw Error('Production gel texture inactive');
  const initial={motionReady,entry:window.__materialEntry,clocks:window.__rollerVideoClocks(),character:{time:a.character.t,phase:a.character.phase,seed:a.character.seed,name:a.character.name},pos:a.pos.toArray()};
  const frame=i=>{window.__materialSeed(i);g._frame(1/60);};
  for(let i=0;i<60;i++)frame(i);
  const r=G.renderer,gl=r.getContext();gl.finish();
  const U=g.levelMat.userData.uniforms;
  const atlasConditions={size:G.paint.size,width:G.paint.rt.width,height:G.paint.rt.height,
   textureBinding:U.uPaint.value===G.paint.texture&&G.paint.texture===G.paint.rt.texture,
   uniformSize:U.uAtlasSize.value,texel:U.uTexel.value,pixelRatio:r.getPixelRatio(),
   devicePixelRatio:window.devicePixelRatio,viewport:[gl.drawingBufferWidth,gl.drawingBufferHeight]};
  if(g.settings.quality!=='high'||atlasConditions.size!==4096||atlasConditions.width!==4096||atlasConditions.height!==4096||
   !atlasConditions.textureBinding||atlasConditions.uniformSize!==4096||atlasConditions.texel!==1/4096||
   atlasConditions.pixelRatio!==1||atlasConditions.devicePixelRatio!==1||atlasConditions.viewport[0]!==960||atlasConditions.viewport[1]!==600)
   throw Error('Actual high-quality atlas or viewport mismatch: '+JSON.stringify(atlasConditions));
  const clocks=()=>window.__rollerVideoClocks();
  const camera=()=>({position:G.camera.position.toArray(),quaternion:G.camera.quaternion.toArray(),projection:G.camera.projectionMatrix.toArray()});
  const state=()=>({clocks:clocks(),camera:camera(),actors:G.actors.map(x=>({name:x.name,pos:x.pos.toArray(),hp:x.hp,ink:x.ink,weapon:x.weaponId})),coverage:G.paint.coverage(),projectiles:G.projectiles.list.length});
  // Capture pass is separate from timings. Fix only render ping-pong state for repeated frozen images.
  const image=()=>{
   const c=g.R.composer,read=c?.readBuffer,write=c?.writeBuffer;
   try{g.R.render();const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;}
   finally{if(c){c.readBuffer=read;c.writeBuffer=write;}}
  };
  G.paint.clear();G.paint.flush(0);const unpainted=image();
  const placements=[],h={normal:new THREE.Vector3(),block:-1,face:-1};
  for(let z=-8;z<=8;z+=2)for(let x=-8;x<=8;x+=2){
   G.physics.groundProbe(a.pos.x+x,64,a.pos.z+z,0,128,.38,h,false);
   if(!h.hit||!h.center||h.grate||h.normal.y<.98)continue;
   const point=new THREE.Vector3(a.pos.x+x,h.y+.02,a.pos.z+z),seed=(placements.length+1)/100;
   const area=G.paint.splat(point,1.5,placements.length%2,{seed,kind:'shot',instant:true});
   placements.push({point:point.toArray(),seed,area});
  }
  if(placements.length<16)throw Error('Insufficient native painted floor samples');
  G.paint.flush(0);const painted=image(),repeat=image();
  const difference=(x,y)=>{let changed=0,max=0;for(let i=0;i<x.length;i+=4){let any=false;for(let k=0;k<4;k++){const d=Math.abs(x[i+k]-y[i+k]);max=Math.max(max,d);any ||= d>0;}changed+=any;}return{changed,max};};
  const paintSignal=difference(unpainted,painted),repeatSignal=difference(painted,repeat);
  if(paintSignal.changed<=1000||repeatSignal.changed!==0)throw Error('Paint visibility or frozen-repeat gate failed');
  // Fail-closed controls prove the visibility predicate does not accept an empty signal.
  const validates=x=>x.changed>1000;if(validates(difference(unpainted,unpainted)))throw Error('Blank negative accepted');
  const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  const pixels={unpainted:await digest(unpainted),painted:await digest(painted),paintSignal,repeatSignal};
  const atlas=new Uint8Array(G.paint.size*G.paint.size*4);r.readRenderTargetPixels(G.paint.rt,0,0,G.paint.size,G.paint.size,atlas);
  const atlasHash=await digest(atlas),beforeWarm=state();
  // Warm the actual full-game renderer and shaders after native painting.
  for(let i=60;i<90;i++)frame(i);gl.finish();
  const before=state(),samples=[],render=g.R.render,webglRender=r.render;
  let sample=null;
  g.R.render=function(...args){const t=performance.now();try{return render.apply(this,args);}finally{if(sample){sample.renderCpuMs+=performance.now()-t;sample.renderCalls++;}}};
  r.render=function(...args){const t=performance.now();try{return webglRender.apply(this,args);}finally{if(sample){sample.webglSubmitMs+=performance.now()-t;sample.webglPasses++;}}};
  const windowStart=performance.now();
  try{
   for(let i=0;i<120;i++){
    sample={frame:i,frameCpuMs:0,renderCpuMs:0,webglSubmitMs:0,renderCalls:0,webglPasses:0,drawCalls:0,triangles:0};
    const t=performance.now();frame(90+i);sample.frameCpuMs=performance.now()-t;
    sample.drawCalls=r.info.render.calls;sample.triangles=r.info.render.triangles;
    sample.resources={textures:r.info.memory.textures,geometries:r.info.memory.geometries,programs:r.info.programs.length};
    samples.push(sample);sample=null;
   }
  }finally{g.R.render=render;r.render=webglRender;}
  const drainStart=performance.now();gl.finish();const completionDrainMs=performance.now()-drainStart;
  const completedTransactionMsPerFrame=(performance.now()-windowStart)/120,after=state();
  if(samples.some(s=>!(s.frameCpuMs>0)||s.renderCalls!==1||s.webglPasses<1||s.drawCalls<1)||gl.getError())throw Error('Invalid complete native frame work');
  const debug=gl.getExtension('WEBGL_debug_renderer_info'),lights=[];G.scene.traverse(o=>{if(o.isLight)lights.push({type:o.type,name:o.name,color:o.color.toArray(),intensity:o.intensity,position:o.getWorldPosition(new THREE.Vector3()).toArray()});});
  return {scope:'complete native practice-range Game._frame and normal compositor; fixed-step CPU, not live FPS or physical GPU',
   initial,placements,pixels,atlasHash,beforeWarm,before,after,samples,completionDrainMs,completedTransactionMsPerFrame,
   conditions:{atlas:atlasConditions,viewport:[gl.drawingBufferWidth,gl.drawingBufferHeight],quality:g.settings.quality,dynamicScale:g.R.dynScale,
    gelLayer:g.levelMat.userData.uniforms.uGel.value,lights,environmentIntensity:G.scene.environmentIntensity,environmentPresent:!!G.scene.environment,toneMapping:r.toneMapping,outputColorSpace:r.outputColorSpace,exposure:r.toneMappingExposure},
   gpu:{renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),timerQueryAvailable:!!gl.getExtension('EXT_disjoint_timer_query_webgl2'),measured:false},
   allocations:{allocatedBytesPerFrame:null,heapAfter:performance.memory?.usedJSHeapSize??null,note:'heap occupancy is not allocation rate'},physicalDeviceMeasured:false};
 });
 assert.deepEqual(errors,[]);assert.ok(loaded.has(target.slice(1)),'actual ink module loaded');
 result.entry=entry;
}catch(e){failure=e;}
finally{
 await browser?.close();await new Promise(r=>server.close(r));
 const receipt={status:failure?'failed':'passed',sourceSha,variant,inputHash:manifest.inputHash,contentHash:manifest.contentHash,overlay:bound,loaded:[...loaded],environment:{cpu:os.cpus()[0]?.model,node:process.version},result,errors,error:failure?.stack};
 fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));
 console.log(JSON.stringify({status:receipt.status,variant,sourceSha,error:failure?.message}));
 if(failure)process.exitCode=1;
}
