#!/usr/bin/env node
// Render the shipped, source-loaded Character and actual special owners. This
// is a WebGL regression diagnostic, not evidence of Nintendo pixel parity.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const opt=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const site=fs.realpathSync(opt('--site','_site')),out=path.resolve(opt('--evidence-dir','.ci-scratch/special-presentation'));
fs.mkdirSync(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);
for(const [file,digest]of Object.entries(manifest.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,file))),digest,file);
const prefix=`/_versions/${manifest.build.revision}/`,errors=[];
const server=http.createServer((req,res)=>{
 if(req.url==='/specials'){res.setHeader('content-type','text/html');res.end(`<html><head><link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script></head><body style="margin:0"></body></html>`);return;}
 const file=path.resolve(site,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(site+'/')||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('content-type',/\.(m?js)$/.test(file)?'text/javascript':file.endsWith('.json')?'application/json':file.endsWith('.gz')?'application/gzip':'application/octet-stream');fs.createReadStream(file).pipe(res);
});
let browser,result;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const {chromium}=await import('playwright');browser=await chromium.launch({headless:true,executablePath:opt('--browser-executable',undefined),args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:960,height:720}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${server.address().port}/specials`);
 result=await page.evaluate(async prefix=>{
  const THREE=await import('three'),{G}=await import(prefix+'src/core/ctx.js'),{install}=await import(prefix+'patches/splatoon3/runtime/install.mjs');
  const profile=await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json()),api=install(profile);
  const storms=await import(prefix+'patches/splatoon3/runtime/storm-effects.mjs');
  const {Level}=await import(prefix+'src/world/level.js');
  const art=await import(prefix+'patches/splatoon3/runtime/special-motion.mjs'),vac=await import(prefix+'patches/splatoon3/runtime/kit-ink-vac.mjs'),bubble=await import(prefix+'patches/splatoon3/runtime/kit-big-bubbler.mjs');
  const scene=new THREE.Scene();scene.background=new THREE.Color('#dae2e7');
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(960,720);document.body.appendChild(renderer.domElement);
  // renderer.info.memory omits InstancedMesh's per-object matrix buffers.
  const glBuffers=new Set(),gl=renderer.getContext(),createBuffer=gl.createBuffer.bind(gl),deleteBuffer=gl.deleteBuffer.bind(gl);
  gl.createBuffer=()=>{const b=createBuffer();if(b)glBuffers.add(b);return b;};gl.deleteBuffer=b=>{glBuffers.delete(b);return deleteBuffer(b);};
  const camera=new THREE.PerspectiveCamera(40,4/3,.01,200);camera.position.set(2.2,1.9,3.2);camera.lookAt(0,.8,0);
  scene.add(new THREE.HemisphereLight(0xffffff,0x637278,2.4));const light=new THREE.DirectionalLight(0xffffff,2.8);light.position.set(-3,4,3);scene.add(light);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:'#b7c3cb',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.005;scene.add(floor);
  Object.assign(G,{scene,renderer,camera,settings:{quality:'high'},mode:'match',actors:[],time:0,teamColors:[new THREE.Color('#ff7711'),new THREE.Color('#2255dd')],match:{state:'playing',playing:()=>true},level:{blocks:[],groundHeight:()=>0},paint:{sample:()=>1,splat:()=>0}});
  G.physics={los:()=>true,segment:(_a,_b,h)=>{h.hit=false;return h;},raycast:(a,_b,_c,h)=>{h.hit=true;h.point.copy(a).setY(0);h.normal.set(0,1,0);h.distance=a.y;return h;}};
  const diagnosticLevel=G.level,diagnosticPhysics=G.physics;
  G.projectiles=new api.Projectiles(scene);const rows=[],images=[];let stormOwner;
  const render=()=>{renderer.render(scene,camera);const gl=renderer.getContext(),p=new Uint8Array(960*720*4);gl.readPixels(0,0,960,720,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  const changed=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>=9)n++;return n;};
  const clear=()=>{G.projectiles.clear();bubble.clearBigBubblers?.();};
  for(const id of ['trizooka','inkVac','storm','slam','bubbler','tacticooler']){
    G.level=diagnosticLevel;G.physics=diagnosticPhysics;
    if(id==='inkVac'){
      G.level=new Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});
      G.physics=new api.Physics(G.level);
    }
    clear();const a=new api.Actor({team:0,name:'special render',isLocal:id==='inkVac',weapon:'shooter',CharacterClass:api.Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character;
    G.actors=[a];scene.add(ch.root);a.grounded=a.ground.hit=true;
    if(id==='inkVac'){a.pos.set(0,0,0);a.ground.block=0;a.groundN.set(0,1,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,1,20);}
    else {ch.onEvent=null;a._integrate=()=>{};a._resolve=()=>{};a._spawnBarrier=()=>{};}
    if(id==='storm')stormOwner=a;
    if(ch._sourceMotionLoader)await ch._sourceMotionLoader;if(ch.sourceMotion?.ready)await ch.sourceMotion.ready;
    if(ch.sourceMotion?.status!=='ready')throw Error('Source motion unavailable: '+id);
    a.weapon={...a.weapon,special:id,specialCost:200};a.special=200;
    const step=dt=>{G.time+=dt;if(id==='inkVac')a.update(dt);else a._finishFrame(dt);};for(let i=0;i<40;i++)step(1/60);
    a._startSpecial();if(!a.specialActive&&!(id==='bubbler'&&bubble.bigBubblerDomes().length))throw Error('Activation refused: '+id);
    let maxHandError=0;
    for(let frame=0;frame<100;frame++){
      a.intent.fire=id==='inkVac'||id==='trizooka'&&frame>38;if(id==='tacticooler'){a.aimDir.set(0,-1,0);a.intent.sub=frame===0;}if(id==='storm'&&a.specialActive?.phase==='hold')storms.updateStormHold(a,1/60,G);else if(id!=='inkVac'&&a.specialActive)a._updateSpecial(1/60);if(id==='bubbler')bubble.tickBigBubblers(1/60);G.projectiles.update(1/60);step(1/60);
      if(id==='inkVac'&&(ch.sourceMotion.sourceUpper||art.specialPresentationSnapshot(ch)?.kind!=='inkVac'))throw Error('Real Actor.update lost native Vac presentation at frame '+frame);
      maxHandError=Math.max(maxHandError,art.specialPresentationSnapshot(ch)?.handError||0);
      if(id==='slam'&&frame===12){a.specialActive.phase='hang';a.specialActive.t=0;a.pos.y=2;}
      if(id==='slam'&&frame===17)break;
      if(id==='storm'&&frame===35)break;
      if(id==='inkVac'&&frame===50)break;
    }
    let objects=[];
    if(id==='trizooka'||id==='inkVac'||id==='storm')objects=[ch.kid.getObjectByName('special:'+id)];
    if(id==='slam')objects=[scene.getObjectByName('splashdown-paired-fists')];
    if(id==='bubbler')objects=bubble.bigBubblerDomes().map(d=>d.group);
    if(id==='tacticooler')objects=(G.projectiles._s3SupportCoolers||[]).map(d=>d.mesh);
    if(!objects.length||objects.some(o=>!o))throw Error('No actual presentation: '+id);
    camera.position.set(2.2,1.9,3.2);camera.lookAt(0,.8+a.pos.y*.6,0);
    if(id==='slam'){camera.position.set(3,3.5,5);camera.lookAt(0,2.2,1);}
    if(id==='bubbler'){camera.position.set(15,10,20);camera.lookAt(0,2,3);}
    if(id==='tacticooler'){camera.position.set(2.5,1.8,4);camera.lookAt(0,.5,1.5);}
    const before=render(),calls=renderer.info.render.calls,triangles=renderer.info.render.triangles,clocks=[G.time,ch.t,a.specialActive?.t];
    images.push({name:id,data:renderer.domElement.toDataURL('image/png')});
    const bodyVisible=ch.root.visible;ch.root.visible=false;const actorPixels=changed(before,render());ch.root.visible=bodyVisible;render();
    if(actorPixels<50)throw Error(`Actor is obscured/hidden: ${id} position=${a.pos.toArray()} scale=${ch.kidScale} visible=${ch.kid.visible}`);
    const visibility=objects.map(o=>o.visible);objects.forEach(o=>o.visible=false);const pixels=changed(before,render());objects.forEach((o,i)=>o.visible=visibility[i]);render();
    if(JSON.stringify(clocks)!==JSON.stringify([G.time,ch.t,a.specialActive?.t]))throw Error('Render advanced a clock: '+id);
    if(pixels<50||maxHandError>1e-5)throw Error(`Invalid visible/grip result: ${id} pixels=${pixels} hand=${maxHandError} state=${JSON.stringify(a.specialActive)} art=${JSON.stringify(art.specialPresentationSnapshot(ch))} model=${JSON.stringify(objects.map(o=>({name:o.name,visible:o.visible,pos:o.getWorldPosition(new THREE.Vector3()).toArray()})))}`);
    rows.push({id,driver:id==='inkVac'?'real Actor.update with native Physics':'manual phase/finish diagnostic',sourceMotion:ch.sourceMotion.status,phase:a.specialActive?.phase||null,position:a.pos.toArray(),changedPixels:pixels,actorPixels,maxHandError,calls,triangles});
    if(id==='inkVac'){
      for(let frame=0;vac.inkVacState(a)?.phase==='inhale'&&frame<600;frame++){
        step(1/60);
        const snap=art.specialPresentationSnapshot(ch);
        if(ch.sourceMotion.sourceUpper||snap?.kind!=='inkVac'||snap.handError>1e-5)throw Error('Vac inhale lost native ownership/grip');
      }
      if(vac.inkVacState(a)?.phase!=='exhale')throw Error('Vac did not reach native exhale');
      const exhale=render(),prop=ch.kid.getObjectByName('special:inkVac');
      images.push({name:'inkVac-exhale',data:renderer.domElement.toDataURL('image/png')});
      prop.visible=false;const exhalePixels=changed(exhale,render());prop.visible=true;
      if(exhalePixels<50)throw Error('Vac exhale prop is not visibly rendered');
      const beforeShot=G.projectiles.list.length;a.intent.fire=false;
      for(let frame=1;frame<=20;frame++){
        step(1/60);
        if(frame<20&&(!a.specialActive||G.projectiles.list.length!==beforeShot))throw Error('Vac countershot skipped native20F transition');
      }
      if(a.specialActive||vac.inkVacState(a)||G.projectiles.list.length!==beforeShot+1)throw Error('Vac countershot/cleanup boundary');
      for(let frame=0;frame<60;frame++)step(1/60);
      if(art.specialPresentationSnapshot(ch)?.kind||!ch.sourceMotion.sourceUpper||!ch.weapon.pivot.visible)throw Error('Vac failed to return to ordinary carry');
      render();images.push({name:'inkVac-return',data:renderer.domElement.toDataURL('image/png')});
      rows.at(-1).nativeLifecycle={exhalePixels,transitionFrames:20,countershots:1,returnedToCarry:true};
    }
    a.specialActive=null;a._s3TripleSlamFists=null;vac.disposeInkVac(a);step(1/60);ch.dispose();G.actors=[];clear();
  }
  // Compile the deployed suction shader and the instanced rain cloud as well.
  const vortex=art.createVacVortex('#ff7711',3,.10,.7,THREE);vortex.position.set(0,.8,0);vortex.rotation.x=Math.PI/2;scene.add(vortex);
  const cloud=art.createStormCloud('#2255dd',THREE);cloud.position.set(0,3,0);scene.add(cloud);camera.position.set(5,4,8);camera.lookAt(0,1.8,0);render();
  const cloudCallsBefore=renderer.info.render.calls;cloud.visible=false;render();const cloudDrawCalls=cloudCallsBefore-renderer.info.render.calls;
  if(cloudDrawCalls!==1)throw Error('Cloud instancing regression');art.disposeSpecialModel(vortex);art.disposeSpecialModel(cloud);render();
  const memory=()=>({...renderer.info.memory,programs:renderer.info.programs.length,buffers:glBuffers.size}),baseline=memory();
  for(let cycle=0;cycle<12;cycle++)for(const create of [art.createTrizooka,art.createInkVac,art.createInkFist,art.createBubblerHardware,art.createTacticooler,art.createStormCloud]){const g=create('#ff7711',THREE);scene.add(g);render();art.disposeSpecialModel(g);}render();
  let nativeCloudRetirements=0;
  for(let cycle=0;cycle<12;cycle++)for(const end of ['expiry','release','clear']){
    G.projectiles._spawnCloud({owner:stormOwner,team:0,pos:new THREE.Vector3(),dir:new THREE.Vector3(0,0,1)});
    const c=G.projectiles.clouds.at(-1);c.group.scale.setScalar(1);render();
    if(glBuffers.size<=baseline.buffers)throw Error('Native cloud instance buffer was not uploaded');
    if(end==='expiry')G.projectiles._updateClouds(c.dur+1/60);else if(end==='release')G.projectiles._releaseCloud(c);else G.projectiles.clear();
    G.projectiles._releaseCloud(c);G.projectiles.clear();render();nativeCloudRetirements++;
    if(glBuffers.size!==baseline.buffers)throw Error('Native cloud instance buffer survived '+end);
  }
  const after=memory();if(after.geometries>baseline.geometries||after.textures>baseline.textures||after.programs>baseline.programs||after.buffers>baseline.buffers)throw Error('GPU resource count grew after repeated use');
  // Targeted emitted WebGL checks: actual FX/director and production fist factory.
  // Projectile records below are injected component inputs, not match activation.
  const vfxResources={pool:[],fists:[],scope:'emitted native FX/director + production factory; injected fist records; no retail or gameplay qualification'};
  const ensure=(ok,label)=>{if(!ok)throw Error('VFX resource gate: '+label);};
  const noGrowth=(before,after,label)=>{for(const k of ['geometries','textures','programs','buffers'])ensure(after[k]<=before[k],label+' '+k);};
  const drawVfx=()=>{render();ensure(!gl.isContextLost(),'WebGL context');ensure(gl.getError()===gl.NO_ERROR,'WebGL error after real draw');};
  const previousFx=G.fx,previousFists=G.projectiles._catalogueFists,previousActors=G.actors;
  const liveFx=new Set();
  const openFx=q=>{const fx=new api.FX(scene,{quality:q});liveFx.add(fx);G.fx=fx;fx.setCollider(()=>null);const d=fx.s3SpecialVfx;ensure(d?.kit&&d.fists,'production installed director');return{fx,d};};
  const directorHealthy=(d,label)=>ensure(d.errors===0,'director callback errors '+label);
  const closeFx=fx=>{const d=fx.s3SpecialVfx;directorHealthy(d,'before dispose');fx.dispose();directorHealthy(d,'after dispose');liveFx.delete(fx);};
  try {
    G.actors=[];G.projectiles._catalogueFists=[];
    // Existing factory loop above has warmed shared model resources/programs.
    drawVfx();const totalBefore=memory();
    for(const quality of [.35,1]){
      const {fx,d}=openFx(quality);d.kit.update(1/60,camera);drawVfx();const baseline=memory();
      for(const key of ['sparks','puffs']){
        const p=d.kit[key],mesh=p.mesh,oldDraw=mesh.onBeforeRender;let draws=0;
        mesh.onBeforeRender=function(...args){draws++;return oldDraw?.apply(this,args);};
        const spawn=i=>p.spawn((i%11)*.025,1.5+(i%7)*.025,0,0,0,0,10,.2,.3,1,.5,.1,1,0,{rot:0,seed:.5});
        const verify=label=>{for(const a of [p.aPos,p.aDir,p.aCol,p.aPar]){ensure(mesh.geometry.instanceCount<=a.count,label+' attribute capacity');for(const r of a.updateRanges)ensure(r.start+r.count<=a.array.length,label+' upload bounds');}ensure(mesh.geometry.instanceCount===p.n+1,label+' reserved warm slot');ensure(p.aCol.array[3]===0,label+' warm slot transparent');const n=draws;drawVfx();ensure(draws>n,label+' actual pool draw');};
        try {
          p.clear();p.update(1/60);drawVfx();const blank=render();
          for(let i=0;i<p.cap;i++)spawn(i);p.update(1/60);ensure(p.n===p.cap,'full '+key);verify('saturation '+key);
          const pixels=changed(blank,render());ensure(pixels>0,'visible saturated '+key);
          spawn(999);p.update(1/60);ensure(p.n===p.cap,'bounded eviction '+key);verify('eviction '+key);
          p.clear();p.update(1/60);ensure(p.n===0,'clear '+key);verify('empty '+key);
          spawn(7);p.update(1/60);ensure(p.n===1,'reuse '+key);verify('reuse '+key);
          p.clear();p.update(1/60);drawVfx();const after=memory();noGrowth(baseline,after,'pool cycle');
          vfxResources.pool.push({quality,key,cap:p.cap,attributeCapacity:p.aPos.count,draws,pixels,baseline,after});
        } finally {mesh.onBeforeRender=oldDraw;}
      }
      closeFx(fx);drawVfx();noGrowth(totalBefore,memory(),'FX pool disposal');
    }
    for(const quality of [.35,1])for(const mode of ['clear','dispose','normal'])for(let cycle=0;cycle<2;cycle++){
      const before=memory(),{fx,d}=openFx(quality);d.kit.update(1/60,camera);drawVfx();const allocated=memory();
      const f={owner:{team:0},index:0,pos:new THREE.Vector3(0,1.5,0),origin:new THREE.Vector3(0,2,0),target:new THREE.Vector3(0,0,0),age:.5,hp:10};
      G.projectiles._catalogueFists=[f];fx.update(1/60,camera);const record=d.fists.get(f),model=record?.model;
      directorHealthy(d,'fist birth');ensure(model?.parent===scene,'actual external production fist birth');
      const counts=new Map(),shared=new Set(),listeners=[];model.traverse(o=>{if(o.geometry){counts.set(o.geometry,0);if(o.geometry.userData.specialShared)shared.add(o.geometry);}for(const mat of Array.isArray(o.material)?o.material:o.material?[o.material]:[])counts.set(mat,0);});
      ensure(counts.size>shared.size,'owned fist resources');
      for(const obj of counts.keys()){const cb=()=>counts.set(obj,counts.get(obj)+1);obj.addEventListener('dispose',cb);listeners.push([obj,cb]);}
      let draws=0;const oldDraw=[];model.traverse(o=>{if(o.isMesh){const old=o.onBeforeRender;oldDraw.push([o,old]);o.onBeforeRender=function(...a){draws++;return old?.apply(this,a);};}});
      try {
        drawVfx();ensure(draws>0,'production fist actually rendered');const rendered=memory();
        G.projectiles._catalogueFists=[];
        if(mode==='clear')fx.clear();else if(mode==='dispose')closeFx(fx);else {f.dead=true;f.hp=0;fx.update(1/60,camera);fx.clear();}
        directorHealthy(d,'fist retirement');drawVfx();ensure(model.parent===null&&d.fists.size===0,'external fist retired '+mode);
        for(const [obj,n]of counts)ensure(n===(shared.has(obj)?0:1),'fist owned/shared exact disposal '+mode);
        // Repeated clear is safe without assuming the native base FX.dispose is idempotent.
        if(mode!=='dispose'){fx.clear();directorHealthy(d,'repeated clear');drawVfx();noGrowth(allocated,memory(),'fist clear allocation');closeFx(fx);}
        drawVfx();for(const [obj,n]of counts)ensure(n===(shared.has(obj)?0:1),'no double fist disposal '+mode);
        const after=memory();noGrowth(before,after,'fist complete lifetime '+mode);
        vfxResources.fists.push({quality,mode,cycle,directorErrors:d.errors,draws,owned:counts.size-shared.size,shared:shared.size,before,allocated,rendered,after});
      } finally {for(const[o,cb]of listeners)o.removeEventListener('dispose',cb);for(const[o,cb]of oldDraw)o.onBeforeRender=cb;}
    }
    drawVfx();vfxResources.baseline=totalBefore;vfxResources.after=memory();noGrowth(totalBefore,vfxResources.after,'all VFX lifetimes');
  } finally {
    G.projectiles._catalogueFists=[];for(const fx of liveFx){try{fx.dispose();}catch{}}
    G.fx=previousFx;G.projectiles._catalogueFists=previousFists;G.actors=previousActors;
  }
  return {rows,images,cloudDrawCalls,nativeCloudRetirements,baseline,after,vfxResources,renderer:renderer.getContext().getParameter(renderer.getContext().RENDERER),fixture:'source-loaded native rig; Vac uses actual Actor.update/Physics and native lifecycle, other specials use manual phase/finish with flat collision stub; Chromium software WebGL; no retail parity claim'};
 },prefix);
 for(const item of result.images)fs.writeFileSync(path.join(out,item.name+'.png'),Buffer.from(item.data.split(',')[1],'base64'));delete result.images;
 assert.deepEqual(errors,[]);result={status:'passed',contentHash:manifest.contentHash,revision:manifest.build.revision,...result,errors};
 fs.writeFileSync(path.join(out,'special-presentation-result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch(e){fs.writeFileSync(path.join(out,'special-presentation-result.json'),JSON.stringify({status:'failed',error:e.message,errors},null,2));throw e;}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
