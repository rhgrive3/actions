#!/usr/bin/env node
// Two independently built emitted sites; baseline controls every camera matrix.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const FROZEN='fc99fcd099548723b7c76e1be0b1512d84c18444';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return path.resolve(i<0?d:process.argv[i+1]);};
const out=arg('--out','custom-hydra-metal-ab');fs.mkdirSync(out,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const models=['variants-ranged-defense.mjs'];
const expected=['289572f2ef015a7b2c6edbc3dea33bbd22aa90ec8500ce3ca6ae06fb05bdb4e5'];
function validate(site,source,frozen){
 const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
 assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);
 for(const [file,digest]of Object.entries(manifest.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,file))),digest,file);
 const sourceSha=execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim();if(frozen)assert.equal(sourceSha,FROZEN);
 const modelInputs={};for(const [i,name]of models.entries()){const p='patches/splatoon3/runtime/weapon-models/'+name,digest=hash(fs.readFileSync(path.join(source,p)));assert.equal(manifest.files['patch/'+p.slice('patches/splatoon3/'.length)],digest);if(frozen)assert.equal(digest,expected[i]);modelInputs[p]=digest;}
 return {site,source,sourceSha,manifest,modelInputs};
}
const baseline=validate(arg('--baseline-site','_baseline_site'),arg('--baseline-source','_baseline_source'),true);
const candidate=validate(arg('--candidate-site','_site'),arg('--candidate-source','.'),false);
assert.equal(candidate.modelInputs['patches/splatoon3/runtime/weapon-models/variants-ranged-defense.mjs'],'a2373b31e844cddbbdf05e6dfc6eb7bb497d220d7cce55303947d286c690cb80');
// Compare the complete manifested input set. Manifest keys are patch/runtime/,
// not patch/splatoon3/runtime/: filtering the latter silently checked nothing.
function compareInputs(a,b){
 const changed='patch/runtime/weapon-models/variants-ranged-defense.mjs';
 assert.ok(Object.hasOwn(a.files,changed)&&Object.hasOwn(b.files,changed),'Hydra input must be manifested');
 const keys=Object.keys(a.files).sort();assert.ok(keys.length>1,'Non-vacuous input set');
 assert.deepEqual(Object.keys(b.files).sort(),keys,'A/B input set differs');
 for(const p of keys)if(p!==changed)assert.equal(b.files[p],a.files[p],'Unrelated input changed '+p);
 assert.notEqual(a.files[changed],b.files[changed],'Candidate must change Hydra input');
 assert.equal(a.build.esbuild,b.build.esbuild,'A/B compiler version differs');
 assert.equal(a.build.optimization,b.build.optimization,'A/B optimization differs');
 return {compared:keys.length,unchanged:keys.length-1,changed,compiler:a.build.esbuild,optimization:a.build.optimization};
}
const inputComparison=compareInputs(baseline.manifest,candidate.manifest);
// Pin the actual builder and adapters as well as dependencies in CI.
const pipeline=['scripts/build-inkwave.mjs','scripts/inkwave-source-composition.mjs',...fs.readdirSync(path.join(baseline.source,'scripts/lib')).filter(x=>x.endsWith('.mjs')).map(x=>'scripts/lib/'+x),...['splatoon3','touch-layout','reliability','local-quality','network-replication','loading-cache','practice-range'].map(x=>'patches/'+x+'/adapter.mjs')];
const pipelineHashes={};for(const p of pipeline){const a=path.join(baseline.source,p),b=path.join(candidate.source,p);if(p==='package-lock.json'&&!fs.existsSync(a)&&!fs.existsSync(b))continue;assert.equal(hash(fs.readFileSync(a)),hash(fs.readFileSync(b)),'A/B pipeline differs: '+p);pipelineHashes[p]=hash(fs.readFileSync(a));}
const seed=0x6b17a9c3,ids=['s3-spinner-hyper-01'];
const errors=[],networkFailures=[];let browser;
async function capture(input,shared){
 const {site,manifest}=input,prefix='/_versions/'+manifest.build.revision+'/';
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/review'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><link rel="icon" href="data:,"><script type="importmap">'+JSON.stringify({imports:{three:prefix+'vendor/three/build/three.module.js','three/addons/':prefix+'vendor/three/jsm/'}})+'</script><body style="margin:0"></body>');return;}const file=path.resolve(site,'.'+decodeURIComponent(pathname));if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',/\.(m?js)$/.test(file)?'text/javascript':file.endsWith('.json')?'application/json':'application/octet-stream');fs.createReadStream(file).pipe(res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const context=await browser.newContext({viewport:{width:720,height:600},deviceScaleFactor:1});
 try{
 await context.addInitScript(({seed})=>{let state=seed>>>0;Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};Date.now=()=>1700000000000;Object.defineProperty(performance,'now',{value:()=>1000});window.__abRngState=()=>state;window.__abResetRng=()=>{state=seed>>>0;};},{seed});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('requestfailed',r=>networkFailures.push({url:r.url(),error:r.failure()}));page.on('response',r=>{if(r.status()>=400)networkFailures.push({url:r.url(),status:r.status()});});
 await page.goto('http://127.0.0.1:'+server.address().port+'/review');
 return await page.evaluate(async({prefix,ids,shared})=>{
  const THREE=await import('three');
  const {install}=await import(prefix+'patches/splatoon3/runtime/install.mjs');
  const {installMainWeaponCatalogRuntime}=await import(prefix+'patches/splatoon3/runtime/main-weapon-catalog.mjs');
  const R=await import(prefix+'patches/splatoon3/runtime/weapon-models/registry.mjs');
  if(R.registeredWeaponVariants().length!==93||new Set(R.registeredWeaponVariants()).size!==93)throw Error('Expected 93 unique inherited variant registrations');
  const profile=await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json());
  const api=install(profile);installMainWeaponCatalogRuntime(api,profile);
  const {Actor,Character,G,Physics,WEAPONS}=api;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e6eaf2');G.scene=scene;
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(720,600);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);
  const pixels=new Uint8Array(32*16*4);for(let y=0;y<16;y++)for(let x=0;x<32;x++){const n=(y*32+x)*4,v=y<9?235:130;pixels.set([v,v,Math.min(255,v+12),255],n);}
  const sky=new THREE.DataTexture(pixels,32,16);sky.mapping=THREE.EquirectangularReflectionMapping;sky.colorSpace=THREE.SRGBColorSpace;sky.needsUpdate=true;
  const pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromEquirectangular(sky);scene.environment=env.texture;
  const hemi=new THREE.HemisphereLight(0xffffff,0x60718d,2.1);scene.add(hemi);
  const keyLight=new THREE.DirectionalLight(0xffffff,3.3);keyLight.position.set(-2,4,3);scene.add(keyLight);
  const camera=new THREE.PerspectiveCamera(34,720/600,.01,50);G.camera=camera;
  G.teamColors=[new THREE.Color('#ff8825'),new THREE.Color('#484ce8')];
  G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,o)=>{o.length=0;return o;}};
  G.physics=new Physics(G.level);G.paint={sample:()=>1,splat:()=>0};G.match={playing:()=>true};G.time=0;
  const projectileScene=new THREE.Scene();const projectiles=new api.Projectiles(projectileScene);G.projectiles=projectiles;
  function captureModes(baseId){
   const chargeFamily=baseId==='s3-stringer-normal'||baseId==='s3-charger-quick',pairedFamily=baseId==='s3-maneuver-short';
   return {chargeFamily,pairedFamily,poseStates:chargeFamily?['rest','charge','release']:['rest'],groundStates:chargeFamily?[true,false]:[true]};
  }
  function nativeHands(w,paired){
   const hands=[],seen=new Set();
   for(let current=w;current;current=current.left){if(seen.has(current)||hands.length>=2)throw Error('Invalid native weapon chain');seen.add(current);hands.push(current);}
   if(hands.length!==(paired?2:1))throw Error('Unexpected native hand count');
   return hands;
  }
  function snapshotHeld(weapons){
   return weapons.map(weapon=>{const pivot=weapon.pivot,parent=pivot.parent;return {weapon,pivot,parent,sibling:parent.children.indexOf(pivot),before:pivot.matrixWorld.elements.slice(),local:pivot.matrix.clone(),world:pivot.matrixWorld.clone(),position:pivot.position.clone(),quaternion:pivot.quaternion.clone(),scale:pivot.scale.clone(),matrixAutoUpdate:pivot.matrixAutoUpdate,matrixWorldAutoUpdate:pivot.matrixWorldAutoUpdate,matrixWorldNeedsUpdate:pivot.matrixWorldNeedsUpdate};});
  }
  function mountHeld(snapshots,group){
   group.updateWorldMatrix(true,false);
   const inverse=group.matrixWorld.clone().invert();
   for(const s of snapshots){group.add(s.pivot);s.pivot.matrixAutoUpdate=false;s.pivot.matrixWorldAutoUpdate=true;s.pivot.matrix.copy(inverse).multiply(s.world);s.pivot.matrixWorldNeedsUpdate=true;}
   group.updateMatrixWorld(true);
   for(const {pivot,before} of snapshots)if(pivot.matrixWorld.elements.some((v,k)=>!Number.isFinite(v)||Math.abs(v-before[k])>1e-8))throw Error('Held capture changed rendered native pivot');
  }
  function restoreHeld(snapshots,group,scene,ch){
   for(const s of snapshots){
    s.parent.add(s.pivot);
    s.pivot.position.copy(s.position);s.pivot.quaternion.copy(s.quaternion);s.pivot.scale.copy(s.scale);
    s.pivot.matrix.copy(s.local);s.pivot.matrixWorld.copy(s.world);s.pivot.matrixAutoUpdate=s.matrixAutoUpdate;s.pivot.matrixWorldAutoUpdate=s.matrixWorldAutoUpdate;s.pivot.matrixWorldNeedsUpdate=s.matrixWorldNeedsUpdate;
   }
   for(const s of [...snapshots].sort((a,b)=>a.sibling-b.sibling)){const children=s.parent.children;children.splice(children.indexOf(s.pivot),1);children.splice(s.sibling,0,s.pivot);}
   scene.remove(group);ch.root.updateMatrixWorld(true);
   for(const {pivot,parent,before,local} of snapshots)if(pivot.parent!==parent||pivot.matrix.elements.some((v,k)=>!Number.isFinite(v)||Math.abs(v-local.elements[k])>1e-8)||pivot.matrixWorld.elements.some((v,k)=>!Number.isFinite(v)||Math.abs(v-before[k])>1e-8))throw Error('Held capture changed native pivot');
   for(const s of snapshots)s.pivot.matrixWorldNeedsUpdate=s.matrixWorldNeedsUpdate;
  }
  const frames=[],cameras={},poses={};
  function close(a,b,label){if(a.length!==b.length||a.some((v,i)=>!Number.isFinite(v)||Math.abs(v-b[i])>1e-8))throw Error('A/B mismatch '+label);}
  function visibleCan(weapon,group){
   const body=weapon.body,geo=body.geometry,c=geo.attributes.color,silver=new THREE.Color('#c7cacd'),selected=[];
   for(let i=0;i<c.count;i++)if(Math.abs(c.getX(i)-silver.r)<1e-6&&Math.abs(c.getY(i)-silver.g)<1e-6&&Math.abs(c.getZ(i)-silver.b)<1e-6)selected.push(i);
   if(selected.length!==142)throw Error('Expected 142 rear-can vertices');
   const colors=new Float32Array(c.count*3);for(const i of selected)colors.fill(1,i*3,i*3+3);
   const clone=geo.clone();clone.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
   const saved=[],materials=[],background=scene.background,tone=renderer.toneMapping;
   try{
    scene.background=new THREE.Color(0);renderer.toneMapping=THREE.NoToneMapping;
    group.traverse(o=>{if(!o.isMesh)return;saved.push([o,o.material,o.onBeforeRender,o.geometry]);const convert=original=>{const m=new THREE.MeshBasicMaterial({color:o===body?0xffffff:0,vertexColors:o===body,side:original.side,depthTest:original.depthTest,depthWrite:original.depthWrite});materials.push(m);return m;};o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);o.onBeforeRender=()=>{};if(o===body)o.geometry=clone;});
    renderer.render(scene,camera);const gl=renderer.getContext(),pixels=new Uint8Array(720*600*4);gl.readPixels(0,0,720,600,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const indices=[];let minX=720,minY=600,maxX=0,maxY=0;for(let i=0;i<720*600;i++)if(pixels[i*4]>250&&pixels[i*4+1]>250&&pixels[i*4+2]>250){indices.push(i);const x=i%720,y=Math.floor(i/720);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
    if(indices.length<100||minX<2||maxX>717||minY<2||maxY>597)throw Error('Can ROI absent, obscured or clipped');
    return {indices,bounds:[minX,minY,maxX,maxY]};
   }finally{for(const[o,m,cb,g]of saved){o.material=m;o.onBeforeRender=cb;o.geometry=g;}scene.background=background;renderer.toneMapping=tone;clone.dispose();for(const m of materials)m.dispose();}
  }
  function cameraFrame(key,group,dir,weapon){
   if(weapon.near!==true||weapon.body.visible!==true||weapon.bodyFar.visible!==false)throw Error('A/B requires actual near body '+key);
   if(shared){const c=shared.cameras[key];if(!c)throw Error('Missing frozen camera '+key);camera.up.fromArray(c.up);camera.position.fromArray(c.position);camera.quaternion.fromArray(c.quaternion);camera.scale.fromArray(c.scale);camera.matrixAutoUpdate=false;camera.matrix.fromArray(c.local);camera.matrixWorld.fromArray(c.world);camera.matrixWorldInverse.copy(camera.matrixWorld).invert();camera.projectionMatrix.fromArray(c.projection);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();}
   else{const b=new THREE.Box3().setFromObject(group),center=b.getCenter(new THREE.Vector3()),span=Math.max(...b.getSize(new THREE.Vector3()).toArray());if(!(span>0&&Number.isFinite(span)))throw Error('Bad bounds');camera.position.copy(center).add(new THREE.Vector3(...dir).normalize().multiplyScalar(span*2.5));camera.lookAt(center);camera.updateMatrixWorld(true);}
   cameras[key]={up:camera.up.toArray(),position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),scale:camera.scale.toArray(),local:camera.matrix.toArray(),world:camera.matrixWorld.toArray(),projection:camera.projectionMatrix.toArray()};
   if(shared)for(const p of ['up','position','quaternion','scale','local','world','projection'])close(cameras[key][p],shared.cameras[key][p],key+' '+p);
   const can=visibleCan(weapon,group);
   for(const mode of ['day','dark']){
    hemi.intensity=mode==='day'?2.1:.28;keyLight.intensity=mode==='day'?3.3:.4;scene.environmentIntensity=mode==='day'?1:.12;
    renderer.render(scene,camera);renderer.render(scene,camera);
    if(renderer.getContext().getError()!==0||renderer.info.render.triangles<=0)throw Error('WebGL '+key);
    const gl=renderer.getContext(),pixels=new Uint8Array(720*600*4);gl.readPixels(0,0,720,600,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const brightness=can.indices.map(i=>(.2126*pixels[i*4]+.7152*pixels[i*4+1]+.0722*pixels[i*4+2])/255).sort((a,b)=>a-b);
    if(brightness.at(-1)<.005)throw Error('Blank production can ROI');
    frames.push({key,mode,png:renderer.domElement.toDataURL('image/png').split(',')[1],triangles:renderer.info.render.triangles,can:{metric:"display-encoded weighted RGB brightness (not physical luminance)",bounds:can.bounds,pixels:can.indices.length,mask:can.indices,mean:brightness.reduce((a,b)=>a+b,0)/brightness.length,p10:brightness[Math.floor(brightness.length*.1)],p50:brightness[Math.floor(brightness.length*.5)],p90:brightness[Math.floor(brightness.length*.9)]}});
   }
  }
  function settleHydraState(a,ch,state,projectiles,G){
    window.__abResetRng();a.weaponRunner.reset();projectiles.clear();
    const tick=fire=>{a.ink=100;a.intent.fire=fire;G.time+=1/60;a.weaponRunner.update(1/60,{fire});a._finishFrame(1/60);};
    for(let frame=0;frame<60;frame++)tick(false);
    if(state!=='rest'){
     for(let frame=0;frame<600&&a.weaponRunner.charge<.999;frame++)tick(true);
     if(!a.weaponRunner.charging||a.weaponRunner.charge<.999)throw Error('Native full charge missing');
     if(state==='release'){tick(false);tick(false);if(!a.weaponRunner.streaming||projectiles.list.length<1)throw Error('Native stream admission missing');}
    }
    return {charge:a.weaponRunner.charge,charging:a.weaponRunner.charging,streaming:a.weaponRunner.streaming,barrelSpeed:ch.weapon.spinW,barrelAngle:ch.weapon.spinA};
  }
  for(const id of ids)for(const team of [0,1]){
   const baseId=R.weaponBaseModelId(id),variantId=R.weaponDefaultAppearance(id);if(!WEAPONS[id])throw Error('Missing weapon '+id);
   window.__abResetRng();
   const a=new Actor({team,weapon:id,isLocal:false,name:'matched-ab',CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character,w=ch.weapon;ch.actor=a;ch.onEvent=null;G.actors=[a];
   if(ch.root.parent||w.def.modelVariantId!==variantId||w.def.modelId!==baseId)throw Error('Native identity');
   // UUID allocation differs with geometry count; start presentation from the same RNG state.
   window.__abResetRng();
   a.form='kid';a.kidT=10;a.grounded=true;a.ground.hit=true;a.intent.fire=false;a.vel.set(0,0,0);
   for(const state of ['rest','charge','release']){
    const motion=settleHydraState(a,ch,state,projectiles,G);
    ch.root.updateMatrixWorld(true);const snapshots=snapshotHeld(nativeHands(w,false)),group=new THREE.Group(),key=id+'-team'+team+'-'+state;
    poses[key]={near:w.near,bodyVisible:w.body.visible,bodyFarVisible:w.bodyFar.visible,pivot:snapshots[0].before,local:snapshots[0].local.toArray(),muzzle:w.muzzle.getWorldPosition(new THREE.Vector3()).toArray(),motion,projectiles:projectiles.list.length,time:G.time,rng:window.__abRngState()};
    if(shared){close(Object.values(poses[key].motion).map(Number),Object.values(shared.poses[key].motion).map(Number),key+' motion');for(const p of ['pivot','local','muzzle'])close(poses[key][p],shared.poses[key][p],key+' '+p);for(const p of ['near','bodyVisible','bodyFarVisible','projectiles','time','rng'])if(poses[key][p]!==shared.poses[key][p])throw Error('A/B state mismatch '+key+' '+p);}
    scene.add(group);try{mountHeld(snapshots,group);
     for(const [name,dir]of [['rear-side',[-1,.35,-1]],['rear',[.2,.3,-1]]]){
      const worldDirection=new THREE.Vector3(...dir).transformDirection(w.body.matrixWorld).toArray();
      camera.up.set(0,1,0).transformDirection(w.body.matrixWorld);
      cameraFrame(key+'-'+name,group,worldDirection,w);
     }
    }finally{restoreHeld(snapshots,group,scene,ch);}
   }
   projectiles.clear();
   ch.dispose();
  }
  env.dispose();sky.dispose();pmrem.dispose();renderer.dispose();return {frames,cameras,poses,rng:window.__abRngState()};
 },{prefix,ids,shared});
 }finally{await context.close();await new Promise(r=>server.close(r));}
}
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const a=await capture(baseline,null);const b=await capture(candidate,{cameras:a.cameras,poses:a.poses});
 assert.equal(a.frames.length,24);assert.equal(b.frames.length,24);assert.equal(Object.keys(a.poses).length,6);assert.deepEqual(a.cameras,b.cameras);assert.deepEqual(a.poses,b.poses);assert.deepEqual(errors,[]);assert.deepEqual(networkFailures,[]);
 const images=[];for(const [label,result]of [['frozen',a],['candidate',b]])for(const f of result.frames){const file=label+'-'+f.key+'-'+f.mode+'.png',bytes=Buffer.from(f.png,'base64');fs.writeFileSync(path.join(out,file),bytes);const {mask,...can}=f.can;images.push({file,key:f.key,mode:f.mode,sha256:hash(bytes),triangles:f.triangles,can:{...can,maskSHA256:hash(JSON.stringify(mask))}});}
 for(let i=0;i<a.frames.length;i++){assert.equal(a.frames[i].key,b.frames[i].key);assert.equal(a.frames[i].mode,b.frames[i].mode);assert.deepEqual(a.frames[i].can.mask,b.frames[i].can.mask,'Visible can mask drift');}
 const summary=input=>({sourceSha:input.sourceSha,contentHash:input.manifest.contentHash,modelInputs:input.modelInputs});
 const receipt={baseline:summary(baseline),candidate:summary(candidate),inputComparison,harnessSHA256:hash(fs.readFileSync(new URL(import.meta.url))),pipelineHashes,seed,rng:a.rng,renderer:'Chromium SwiftShader',size:[720,600],cameraBasis:'Immutable fc99 native held weapon bounds; direction and up transformed by actual body.matrixWorld; exact shared cameras',characterRendered:false,method:'Weapon-only actual native rest, charge and admitted stream; both teams, two rear-can views, day and dark lighting. White-can mask uses full occluding geometry; ROI display-encoded weighted RGB brightness is diagnostic, not material adoption.',strictTolerance:1e-8,poses:a.poses,cameras:a.cameras,images,errors,networkFailures};fs.writeFileSync(path.join(out,'ab-result.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({frames:images.length,poses:Object.keys(a.poses).length,baseline:receipt.baseline,candidate:receipt.candidate}));
}catch(e){fs.writeFileSync(path.join(out,'ab-error.json'),JSON.stringify({error:String(e),errors,networkFailures},null,2));throw e;}finally{await browser?.close();}
