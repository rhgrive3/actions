#!/usr/bin/env node
// Two independently built emitted sites; baseline controls every camera matrix.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const FROZEN='009a9e54898b0ed48e38f5ede105077a736e7a0b';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return path.resolve(i<0?d:process.argv[i+1]);};
const out=arg('--out','weapon-hornz-aperture-ab');fs.mkdirSync(out,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const models=['hornz-dread-wringer.mjs'];
const expected=['5152ba6d54fa9a88f13883d254971ab65f6569fda59132246bdcd1f047f29608'];
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
assert.equal(candidate.modelInputs['patches/splatoon3/runtime/weapon-models/hornz-dread-wringer.mjs'],'5ebfae05dd1fe2adc8e2fd362f7465dda6a4748c3a9b4e85a97932b0317086b1');
// Compare the complete manifested input set. Manifest keys are patch/runtime/,
// not patch/splatoon3/runtime/: filtering the latter silently checked nothing.
function compareInputs(a,b){
 const changed='patch/runtime/weapon-models/hornz-dread-wringer.mjs';
 assert.ok(Object.hasOwn(a.files,changed)&&Object.hasOwn(b.files,changed),'Hornz input must be manifested');
 const keys=Object.keys(a.files).sort();assert.ok(keys.length>1,'Non-vacuous input set');
 assert.deepEqual(Object.keys(b.files).sort(),keys,'A/B input set differs');
 for(const p of keys)if(p!==changed)assert.equal(b.files[p],a.files[p],'Unrelated input changed '+p);
 assert.notEqual(a.files[changed],b.files[changed],'Candidate must change Hornz input');
 assert.equal(a.build.esbuild,b.build.esbuild,'A/B compiler version differs');
 assert.equal(a.build.optimization,b.build.optimization,'A/B optimization differs');
 return {compared:keys.length,unchanged:keys.length-1,changed,compiler:a.build.esbuild,optimization:a.build.optimization};
}
const inputComparison=compareInputs(baseline.manifest,candidate.manifest);
// Pin the actual builder and adapters as well as dependencies in CI.
const pipeline=['scripts/build-inkwave.mjs','scripts/inkwave-source-composition.mjs',...fs.readdirSync(path.join(baseline.source,'scripts/lib')).filter(x=>x.endsWith('.mjs')).map(x=>'scripts/lib/'+x),...['splatoon3','touch-layout','reliability','local-quality','network-replication','loading-cache','practice-range'].map(x=>'patches/'+x+'/adapter.mjs')];
const pipelineHashes={};for(const p of pipeline){const a=path.join(baseline.source,p),b=path.join(candidate.source,p);if(p==='package-lock.json'&&!fs.existsSync(a)&&!fs.existsSync(b))continue;assert.equal(hash(fs.readFileSync(a)),hash(fs.readFileSync(b)),'A/B pipeline differs: '+p);pipelineHashes[p]=hash(fs.readFileSync(a));}
const seed=0x6b17a9c3,ids=['s3-slosher-double-02'];
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
  const {weaponDetailMotionSnapshot}=await import(prefix+'patches/splatoon3/runtime/weapon-detail-motion.mjs');
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
  scene.add(new THREE.HemisphereLight(0xffffff,0x60718d,2.1));
  const key=new THREE.DirectionalLight(0xffffff,3.3);key.position.set(-2,4,3);scene.add(key);
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
  const frames=[],cameras={},poses={},unlitMaterials=new Map();
  function close(a,b,label){if(a.length!==b.length||a.some((v,i)=>!Number.isFinite(v)||Math.abs(v-b[i])>1e-8))throw Error('A/B mismatch '+label);}
  function cameraFrame(key,group,dir,weapon){
   if(weapon.near!==true||weapon.body.visible!==true||weapon.bodyFar.visible!==false)throw Error('A/B requires actual near body '+key);
   if(shared){const c=shared.cameras[key];if(!c)throw Error('Missing frozen camera '+key);camera.up.fromArray(c.up);camera.position.fromArray(c.position);camera.quaternion.fromArray(c.quaternion);camera.scale.fromArray(c.scale);camera.matrixAutoUpdate=false;camera.matrix.fromArray(c.local);camera.matrixWorld.fromArray(c.world);camera.matrixWorldInverse.copy(camera.matrixWorld).invert();camera.projectionMatrix.fromArray(c.projection);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();}
   else{const b=new THREE.Box3().setFromObject(group),center=b.getCenter(new THREE.Vector3()),span=Math.max(...b.getSize(new THREE.Vector3()).toArray());if(!(span>0&&Number.isFinite(span)))throw Error('Bad bounds');camera.position.copy(center).add(new THREE.Vector3(...dir).normalize().multiplyScalar(span*2.5));camera.lookAt(center);camera.updateMatrixWorld(true);}
   cameras[key]={up:camera.up.toArray(),position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),scale:camera.scale.toArray(),local:camera.matrix.toArray(),world:camera.matrixWorld.toArray(),projection:camera.projectionMatrix.toArray()};
   if(shared)for(const p of ['up','position','quaternion','scale','local','world','projection'])close(cameras[key][p],shared.cameras[key][p],key+' '+p);
   for(const mode of ['lit','unlit']){
    if(weapon.near!==true||weapon.body.visible!==true||weapon.bodyFar.visible!==false)throw Error('A/B near-body pass '+key+' '+mode);
    const changed=[];
    if(mode==='unlit')group.traverse(o=>{if(!o.isMesh)return;const convert=m=>{if(!unlitMaterials.has(m)){const flat=new THREE.MeshBasicMaterial({color:m.color?.clone()||new THREE.Color(0xffffff),map:m.map||null,vertexColors:m.vertexColors,side:m.side,transparent:m.transparent,opacity:m.opacity,alphaTest:m.alphaTest,depthTest:m.depthTest,depthWrite:m.depthWrite});unlitMaterials.set(m,flat);}return unlitMaterials.get(m);};changed.push([o,o.material,o.onBeforeRender]);o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);o.onBeforeRender=()=>{};});
    try{renderer.render(scene,camera);renderer.render(scene,camera);if(renderer.getContext().getError()!==0||renderer.info.render.triangles<=0)throw Error('WebGL '+key);frames.push({key,mode,png:renderer.domElement.toDataURL('image/png').split(',')[1],triangles:renderer.info.render.triangles});}
    finally{for(const [o,m,cb]of changed){o.material=m;o.onBeforeRender=cb;}}
   }
  }
  function settlePoolState(a,ch,state,projectiles,G,weaponDetailMotionSnapshot){
    window.__abResetRng();a.weaponRunner.reset();projectiles.clear();
    for(let frame=0;frame<60;frame++){G.time+=1/60;a._finishFrame(1/60);}
    if(state==='drained'){
     let reached=false;
     for(let frame=0;frame<120;frame++){
      const input={fire:frame===0};a.ink=100;a.intent.fire=input.fire;G.time+=1/60;a.weaponRunner.update(1/60,input);a._finishFrame(1/60);
      if(weaponDetailMotionSnapshot(ch).bucketDrain>.99){reached=true;break;}
     }
     if(!reached||projectiles.list.length<1)throw Error('Native admitted full drain was not reached');
    }
    const motion=weaponDetailMotionSnapshot(ch);if(state==='full'&&motion.bucketDrain!==0)throw Error('Native full pool state');
    return motion;
  }
  for(const id of ids)for(const team of [0,1]){
   const baseId=R.weaponBaseModelId(id),variantId=R.weaponDefaultAppearance(id);if(!WEAPONS[id])throw Error('Missing weapon '+id);
   window.__abResetRng();
   const a=new Actor({team,weapon:id,isLocal:false,name:'matched-ab',CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character,w=ch.weapon;ch.actor=a;ch.onEvent=null;G.actors=[a];
   if(ch.root.parent||w.def.modelVariantId!==variantId||w.def.modelId!==baseId)throw Error('Native identity');
   // UUID allocation differs with geometry count; start presentation from the same RNG state.
   window.__abResetRng();
   a.form='kid';a.kidT=10;a.grounded=true;a.ground.hit=true;a.intent.fire=false;a.vel.set(0,0,0);
   for(const state of ['full','drained']){
    const motion=settlePoolState(a,ch,state,projectiles,G,weaponDetailMotionSnapshot);
    ch.root.updateMatrixWorld(true);const snapshots=snapshotHeld(nativeHands(w,false)),group=new THREE.Group(),key=id+'-team'+team+'-'+state;
    poses[key]={near:w.near,bodyVisible:w.body.visible,bodyFarVisible:w.bodyFar.visible,pivot:snapshots[0].before,local:snapshots[0].local.toArray(),muzzle:w.muzzle.getWorldPosition(new THREE.Vector3()).toArray(),bucketDrain:motion.bucketDrain,projectiles:projectiles.list.length,time:G.time,rng:window.__abRngState()};
    if(shared){for(const p of ['pivot','local','muzzle'])close(poses[key][p],shared.poses[key][p],key+' '+p);for(const p of ['near','bodyVisible','bodyFarVisible','bucketDrain','projectiles','time','rng'])if(poses[key][p]!==shared.poses[key][p])throw Error('A/B state mismatch '+key+' '+p);}
    scene.add(group);try{mountHeld(snapshots,group);
     for(const [name,dir]of [['frontal-oblique',[-.5,.3,1]],['front',[0,.15,1]],['upper',[-.6,1,.6]]]){
      const worldDirection=new THREE.Vector3(...dir).transformDirection(w.pivot.matrixWorld).toArray();
      camera.up.set(0,1,0).transformDirection(w.pivot.matrixWorld);
      cameraFrame(key+'-'+name,group,worldDirection,w);
     }
    }finally{restoreHeld(snapshots,group,scene,ch);}
   }
   projectiles.clear();
   ch.dispose();
  }
  for(const m of unlitMaterials.values())m.dispose();env.dispose();sky.dispose();pmrem.dispose();renderer.dispose();return {frames,cameras,poses,rng:window.__abRngState()};
 },{prefix,ids,shared});
 }finally{await context.close();await new Promise(r=>server.close(r));}
}
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const a=await capture(baseline,null);const b=await capture(candidate,{cameras:a.cameras,poses:a.poses});
 assert.equal(a.frames.length,24);assert.equal(b.frames.length,24);assert.equal(Object.keys(a.poses).length,4);assert.deepEqual(a.cameras,b.cameras);assert.deepEqual(a.poses,b.poses);assert.deepEqual(errors,[]);assert.deepEqual(networkFailures,[]);
 const images=[];for(const [label,result]of [['frozen',a],['candidate',b]])for(const f of result.frames){const file=label+'-'+f.key+'-'+f.mode+'.png',bytes=Buffer.from(f.png,'base64');fs.writeFileSync(path.join(out,file),bytes);images.push({file,sha256:hash(bytes),triangles:f.triangles});}
 const summary=input=>({sourceSha:input.sourceSha,contentHash:input.manifest.contentHash,modelInputs:input.modelInputs});
 const receipt={baseline:summary(baseline),candidate:summary(candidate),inputComparison,harnessSHA256:hash(fs.readFileSync(new URL(import.meta.url))),pipelineHashes,seed,rng:a.rng,renderer:'Chromium SwiftShader',size:[720,600],cameraBasis:'Frozen009a native weapon bounds; local model directions transformed through native pivot; exact shared TRS/local/world/projection matrices',unlit:'MeshBasicMaterial diagnostic preserves base color, vertex colors, map, side, opacity and depth flags; production callbacks disabled only for unlit pass',characterRendered:false,method:'Controlled weapon-only presentation: actual WeaponRunner input and Projectiles admission select full/drained states; projectiles remain in a separate non-rendered scene. Reference-like camera is approximate, not calibrated, and projected ratios do not establish 3D dimensions. No gameplay aiming/ballistics or retail-fidelity acceptance claim',strictTolerance:1e-8,poses:a.poses,cameras:a.cameras,images,errors,networkFailures};fs.writeFileSync(path.join(out,'ab-result.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({frames:images.length,poses:Object.keys(a.poses).length,baseline:receipt.baseline,candidate:receipt.candidate}));
}catch(e){fs.writeFileSync(path.join(out,'ab-error.json'),JSON.stringify({error:String(e),errors,networkFailures},null,2));throw e;}finally{await browser?.close();}
