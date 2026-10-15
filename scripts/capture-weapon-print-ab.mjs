#!/usr/bin/env node
// Two independently built emitted sites; baseline controls every camera matrix.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
const FROZEN='009a9e54898b0ed48e38f5ede105077a736e7a0b';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return path.resolve(i<0?d:process.argv[i+1]);};
const out=arg('--out','weapon-print-ab');fs.mkdirSync(out,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const models=['variants-bulbz-followup.mjs','variants-squiffer-v4-followup.mjs'];
const expected=['029ee01b39fb223d120882360dc7752f29ccb8d6df594d45c83b800989a6617f','288505b0dbe7991f487239edf73804af1c264322c1bdf6d9614d100ac278c9ff'];
function validate(site,source,frozen){
 const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
 assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);assert.equal(hash(JSON.stringify(manifest.files)),manifest.inputHash);
 for(const [file,digest]of Object.entries(manifest.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,file))),digest,file);
 const sourceSha=execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim();if(frozen)assert.equal(sourceSha,FROZEN);
 const modelInputs={};for(const [i,name]of models.entries()){const p='patches/splatoon3/runtime/weapon-models/'+name,digest=hash(fs.readFileSync(path.join(source,p)));assert.equal(manifest.files['patch/'+p.slice('patches/splatoon3/'.length)],digest);assert.equal(digest,frozen?expected[i]:i===0?'95f0f7d3f9a10de6309097e66e3e45d7515b6c36ef425fb6d1ea7f6d24df9d23':expected[i]);modelInputs[p]=digest;}
 return {site,source,sourceSha,manifest,modelInputs};
}
const baseline=validate(arg('--baseline-site','_baseline_site'),arg('--baseline-source','_baseline_source'),true);
const candidate=validate(arg('--candidate-site','_site'),arg('--candidate-source','.'),false);
// Pin the actual builder and adapters as well as dependencies in CI.
const pipeline=['scripts/build-inkwave.mjs','scripts/inkwave-source-composition.mjs',...fs.readdirSync(path.join(baseline.source,'scripts/lib')).filter(x=>x.endsWith('.mjs')).map(x=>'scripts/lib/'+x),...['splatoon3','touch-layout','reliability','local-quality','network-replication','loading-cache','practice-range'].map(x=>'patches/'+x+'/adapter.mjs')];
const pipelineHashes={};for(const p of pipeline){const a=path.join(baseline.source,p),b=path.join(candidate.source,p);if(p==='package-lock.json'&&!fs.existsSync(a)&&!fs.existsSync(b))continue;assert.equal(hash(fs.readFileSync(a)),hash(fs.readFileSync(b)),'A/B pipeline differs: '+p);pipelineHashes[p]=hash(fs.readFileSync(a));}
const seed=0x6b17a9c3,ids=['s3-stringer-normal-02','s3-charger-quick-01'];
const errors=[],networkFailures=[];let browser;
async function capture(input,shared){
 const {site,manifest}=input,prefix='/_versions/'+manifest.build.revision+'/';
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/review'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><link rel="icon" href="data:,"><script type="importmap">'+JSON.stringify({imports:{three:prefix+'vendor/three/build/three.module.js','three/addons/':prefix+'vendor/three/jsm/'}})+'</script><body style="margin:0"></body>');return;}const file=path.resolve(site,'.'+decodeURIComponent(pathname));if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',/\.(m?js)$/.test(file)?'text/javascript':file.endsWith('.json')?'application/json':'application/octet-stream');fs.createReadStream(file).pipe(res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 try{
 await context.addInitScript(({seed})=>{let state=seed>>>0;Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};Date.now=()=>1700000000000;Object.defineProperty(performance,'now',{value:()=>1000});window.__abRngState=()=>state;window.__abResetRng=()=>{state=seed>>>0;};},{seed});
 const page=await context.newPage();page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(String(e)));page.on('requestfailed',r=>networkFailures.push({url:r.url(),error:r.failure()}));page.on('response',r=>{if(r.status()>=400)networkFailures.push({url:r.url(),status:r.status()});});
 await page.goto('http://127.0.0.1:'+server.address().port+'/review');
 return await page.evaluate(async({prefix,ids,shared})=>{
  function validateThreeExports(namespace){
   const required=['Box3','Color','Float32BufferAttribute','Group','HalfFloatType','MeshBasicMaterial','NeutralToneMapping','PerspectiveCamera','SRGBColorSpace','Scene','Vector3','WebGLRenderer'];
   for(const name of required)if(namespace[name]===undefined)throw Error('Missing emitted THREE export: '+name);
   return required;
  }
  const THREE=await import('three');validateThreeExports(THREE);
  const {Environment}=await import(prefix+'src/world/environment.js');
  const {install}=await import(prefix+'patches/splatoon3/runtime/install.mjs');
  const {installMainWeaponCatalogRuntime}=await import(prefix+'patches/splatoon3/runtime/main-weapon-catalog.mjs');
  const R=await import(prefix+'patches/splatoon3/runtime/weapon-models/registry.mjs');
  if(R.registeredWeaponVariants().length!==93||new Set(R.registeredWeaponVariants()).size!==93)throw Error('Expected 93 unique inherited variant registrations');
  const profile=await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json());
  const api=install(profile);installMainWeaponCatalogRuntime(api,profile);
  const {Actor,Character,G,Physics,WEAPONS}=api;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e6eaf2');G.scene=scene;
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1920,1080);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=.94;document.body.append(renderer.domElement);
  const shaderErrors=[];renderer.debug.checkShaderErrors=true;renderer.debug.onShaderError=(gl,program,vs,fs)=>shaderErrors.push([gl.getProgramInfoLog(program),gl.getShaderInfoLog(vs),gl.getShaderInfoLog(fs)].join('\n'));
  const camera=new THREE.PerspectiveCamera(34,1920/1080,.15,6500);G.camera=camera;
  G.teamColors=[new THREE.Color('#ff8825'),new THREE.Color('#484ce8')];
  G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,o)=>{o.length=0;return o;}};
  G.physics=new Physics(G.level);G.paint={sample:()=>1,splat:()=>0};G.match={playing:()=>true};G.time=0;
  G.projectiles=Object.fromEntries(['fireShooter','fireDualies','fireBlaster','fireSlosh','fireFlick','fireCharger','fireSplatling','throwBomb'].map(n=>[n,()=>{}]));
  function validateEnvironmentContract(e){
   if(e.cubeSize!==256||e.width!==768||e.height!==1024||e.colorSpace!=='srgb-linear'||e.type!==THREE.HalfFloatType||e.mapping!==306)throw Error('Invalid production PMREM dimensions, LOD or color-space contract');
   if(!Number.isFinite(e.meanRadiance)||e.meanRadiance<=0||!Number.isFinite(e.maxRadiance)||e.maxRadiance<=0||e.nonfinite!==0||e.negative!==0||e.positivePixels<1000)throw Error('Invalid PMREM radiance');
   return e;
  }
  // IEEE754 binary16 readback; do not require tree-shaken DataUtils exports.
  function halfFloat(bits){
   const sign=bits&0x8000?-1:1,exponent=(bits>>>10)&31,fraction=bits&1023;
   return exponent===31?(fraction?NaN:sign*Infinity):sign*(exponent?2**(exponent-15)*(1+fraction/1024):2**-14*fraction/1024);
  }
  function environmentEvidence(env){
   const rt=env._envRT,raw=new Uint16Array(rt.width*rt.height*4);renderer.readRenderTargetPixels(rt,0,0,rt.width,rt.height,raw);
   let sum=0,max=0,nonfinite=0,negative=0,positivePixels=0;
   for(let i=0;i<raw.length;i+=4){let lit=false;for(let c=0;c<3;c++){const v=halfFloat(raw[i+c]);if(!Number.isFinite(v))nonfinite++;if(v<0)negative++;if(v>0)lit=true;sum+=v;max=Math.max(max,v);}if(lit)positivePixels++;}
   if(renderer.getContext().getError()!==0||shaderErrors.length)throw Error('Native environment GPU/shader error');
   return validateEnvironmentContract({theme:env.theme,cubeSize:rt.height/4,width:rt.width,height:rt.height,colorSpace:rt.texture.colorSpace,type:rt.texture.type,mapping:rt.texture.mapping,meanRadiance:sum/(rt.width*rt.height*3),maxRadiance:max,nonfinite,negative,positivePixels,environmentIntensity:env.scene.environmentIntensity,sun:{position:env.sun.position.toArray(),target:env.sun.target.position.toArray(),color:env.sun.color.toArray(),intensity:env.sun.intensity},hemi:{color:env.hemi.color.toArray(),ground:env.hemi.groundColor.toArray(),intensity:env.hemi.intensity}});
  }
  window.__abResetRng();const nativeScene=new THREE.Scene(),nativeEnvironment=new Environment(renderer,nativeScene,{theme:'day',shadowSize:512});
  const environmentReceipt=environmentEvidence(nativeEnvironment);
  let undersizedRejected=false;try{validateEnvironmentContract({...environmentReceipt,cubeSize:8,width:336,height:32});}catch(e){undersizedRejected=/PMREM/.test(String(e));}
  if(!undersizedRejected)throw Error('Undersized PMREM negative control was not rejected');
  if(shared&&JSON.stringify(environmentReceipt)!==JSON.stringify(shared.environment))throw Error('A/B native environment drift');
  scene.add(nativeEnvironment.sun,nativeEnvironment.sun.target,nativeEnvironment.hemi);scene.environment=nativeEnvironment.envMap;scene.environmentIntensity=environmentReceipt.environmentIntensity;
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
  function printBounds(key,weapon){
   const bounds=new THREE.Box3(),p=weapon.body.geometry.attributes.position,c=weapon.body.geometry.attributes.color,vein=new THREE.Color('#8b918f');let count=0;
   for(let i=0;i<p.count;i++){
    const selected=key.startsWith('s3-charger-quick')?p.getZ(i)<-.16:Math.abs(c.getX(i)-vein.r)<1e-6&&Math.abs(c.getY(i)-vein.g)<1e-6&&Math.abs(c.getZ(i)-vein.b)<1e-6&&(key.includes('-team0-')?p.getY(i)>.085:p.getY(i)<.085);
    if(selected){bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(weapon.body.matrixWorld));count++;}
   }
   if(count<60||bounds.isEmpty())throw Error('Missing print target');return bounds;
  }
  function validatePrintMask(key,group,weapon){
   const originalGeometry=weapon.body.geometry,geometry=originalGeometry.clone(),p=geometry.attributes.position,c=geometry.attributes.color,colors=new Float32Array(p.count*3),isSquiffer=key.startsWith('s3-charger-quick');
   const palette=(isSquiffer?['#dfe1dc','#242a29','#ebc139','#c7372d','#202627']:['#8b918f']).map(x=>new THREE.Color(x));let selected=0,inFrame=0,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
   for(let i=0;i<p.count;i++){
    const match=palette.some(x=>Math.abs(c.getX(i)-x.r)<1e-6&&Math.abs(c.getY(i)-x.g)<1e-6&&Math.abs(c.getZ(i)-x.b)<1e-6)&&(isSquiffer?p.getZ(i)<-.16:key.includes('-team0-')?p.getY(i)>.085:p.getY(i)<.085);
    if(!match)continue;selected++;colors.set([1,1,1],i*3);const q=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(weapon.body.matrixWorld).project(camera);if(!q.toArray().every(Number.isFinite))throw Error('Nonfinite print ROI');if(Math.abs(q.x)<=1&&Math.abs(q.y)<=1&&Math.abs(q.z)<=1)inFrame++;minX=Math.min(minX,q.x);maxX=Math.max(maxX,q.x);minY=Math.min(minY,q.y);maxY=Math.max(maxY,q.y);
   }
   if(selected<60||inFrame/selected<.75)throw Error('Print ROI outside frame '+key);geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
   const changed=[],created=[],background=scene.background;
   try{
    group.traverse(o=>{if(!o.isMesh)return;const convert=m=>{const mask=new THREE.MeshBasicMaterial({color:o===weapon.body?0xffffff:0x000000,vertexColors:o===weapon.body,side:m.side,depthTest:m.depthTest,depthWrite:m.depthWrite,transparent:m.transparent,opacity:m.opacity,toneMapped:false});created.push(mask);return mask;};changed.push([o,o.material,o.onBeforeRender]);o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);o.onBeforeRender=()=>{};});
    weapon.body.geometry=geometry;scene.background=new THREE.Color(0);renderer.render(scene,camera);const gl=renderer.getContext(),rgba=new Uint8Array(1920*1080*4);gl.readPixels(0,0,1920,1080,gl.RGBA,gl.UNSIGNED_BYTE,rgba);let visiblePixels=0;for(let i=0;i<rgba.length;i+=4)if(rgba[i]>200&&rgba[i+1]>200&&rgba[i+2]>200)visiblePixels++;if(visiblePixels<32)throw Error('Print target occluded or absent '+key+' visiblePixels='+visiblePixels);return {selectedVertices:selected,inFrameVertices:inFrame,ndcBounds:[minX,minY,maxX,maxY],visiblePixels,method:'White print-only vertex mask with black depth-writing weapon occluders; actual body matrixWorld and material side/depth flags'};
   }finally{weapon.body.geometry=originalGeometry;scene.background=background;for(const [o,m,cb]of changed){o.material=m;o.onBeforeRender=cb;}geometry.dispose();for(const m of created)m.dispose();}
  }
  function printDirection(id,team,frame){
   const angle=(75+frame*.025)*Math.PI/180,limbY=team===0?-.25:.25;
   return id==='s3-charger-quick-01'?(frame<0?[1,.15,0]:[-Math.cos(angle),.10,Math.sin(angle)]):(frame<0?[0,limbY,-1]:[Math.sin(angle),limbY,-Math.cos(angle)]);
  }
  function cameraFrame(key,group,dir,weapon,modes=['lit','unlit'],drift=0){
   if(weapon.near!==true||weapon.body.visible!==true||weapon.bodyFar.visible!==false)throw Error('A/B requires actual near body '+key);
   if(shared){const c=shared.cameras[key];if(!c)throw Error('Missing frozen camera '+key);camera.position.fromArray(c.position);camera.quaternion.fromArray(c.quaternion);camera.scale.fromArray(c.scale);camera.matrixAutoUpdate=false;camera.matrix.fromArray(c.local);camera.matrixWorld.fromArray(c.world);camera.matrixWorldInverse.copy(camera.matrixWorld).invert();camera.projectionMatrix.fromArray(c.projection);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();}
   else{const b=printBounds(key,weapon),center=b.getCenter(new THREE.Vector3()),span=Math.max(...b.getSize(new THREE.Vector3()).toArray());if(!(span>0&&Number.isFinite(span)))throw Error('Bad print bounds');const direction=new THREE.Vector3(...dir).transformDirection(weapon.body.matrixWorld);camera.position.copy(center).add(direction.multiplyScalar(span*2.1));camera.lookAt(center);camera.updateMatrixWorld(true);const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),shift=2*span*2.1*Math.tan(camera.fov*Math.PI/360)/1080*drift;camera.position.addScaledVector(right,shift);camera.updateMatrixWorld(true);}
   cameras[key]={position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),scale:camera.scale.toArray(),local:camera.matrix.toArray(),world:camera.matrixWorld.toArray(),projection:camera.projectionMatrix.toArray()};
   if(shared)for(const p of ['position','quaternion','scale','local','world','projection'])close(cameras[key][p],shared.cameras[key][p],key+' '+p);
   for(const mode of modes){
    if(weapon.near!==true||weapon.body.visible!==true||weapon.bodyFar.visible!==false)throw Error('A/B near-body pass '+key+' '+mode);
    const changed=[];
    if(mode==='unlit')group.traverse(o=>{if(!o.isMesh)return;const convert=m=>{if(!unlitMaterials.has(m)){const flat=new THREE.MeshBasicMaterial({color:m.color?.clone()||new THREE.Color(0xffffff),map:m.map||null,vertexColors:m.vertexColors,side:m.side,transparent:m.transparent,opacity:m.opacity,alphaTest:m.alphaTest,depthTest:m.depthTest,depthWrite:m.depthWrite});unlitMaterials.set(m,flat);}return unlitMaterials.get(m);};changed.push([o,o.material,o.onBeforeRender]);o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);o.onBeforeRender=()=>{};});
    try{renderer.render(scene,camera);renderer.render(scene,camera);if(renderer.getContext().getError()!==0||renderer.info.render.triangles<=0)throw Error('WebGL '+key);const gl=renderer.getContext(),rgba=new Uint8Array(1920*1080*4);gl.readPixels(0,0,1920,1080,gl.RGBA,gl.UNSIGNED_BYTE,rgba);let foreground=0;const colors=new Set();for(let i=0;i<rgba.length;i+=4){if(Math.abs(rgba[i]-rgba[0])+Math.abs(rgba[i+1]-rgba[1])+Math.abs(rgba[i+2]-rgba[2])>12)foreground++;if(i%64===0)colors.add((rgba[i]>>3)*1024+(rgba[i+1]>>3)*32+(rgba[i+2]>>3));}if(foreground<250||colors.size<16)throw Error('Blank or trivial frame '+key);const png=renderer.domElement.toDataURL('image/png').split(',')[1],triangles=renderer.info.render.triangles,printROI=validatePrintMask(key,group,weapon);frames.push({key,mode,png,triangles,foregroundPixels:foreground,quantizedColors:colors.size,printROI});}
    finally{for(const [o,m,cb]of changed){o.material=m;o.onBeforeRender=cb;}}
   }
  }
  for(const id of ids)for(const team of [0,1]){
   const baseId=R.weaponBaseModelId(id),variantId=R.weaponDefaultAppearance(id);if(!WEAPONS[id])throw Error('Missing weapon '+id);
   window.__abResetRng();
   const a=new Actor({team,weapon:id,isLocal:false,name:'matched-ab',CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character,w=ch.weapon;ch.actor=a;ch.onEvent=null;G.actors=[a];
   if(ch.root.parent||w.def.modelVariantId!==variantId||w.def.modelId!==baseId)throw Error('Native identity');
   // UUID allocation differs with geometry count; start presentation from the same RNG state.
   window.__abResetRng();
   a.form='kid';a.kidT=10;a.grounded=true;a.ground.hit=true;a.intent.fire=false;a.vel.set(0,0,0);a.weaponRunner.charge=1;a.weaponRunner.charging=true;ch.lastRelease=99;
   for(let frame=0;frame<60;frame++){G.time+=1/60;a._finishFrame(1/60);}
   if(!(ch._wst.charge>.99))throw Error('Native charge');
   for(let frame=-1;frame<4;frame++){
    if(frame===0){a.weaponRunner.charge=0;a.weaponRunner.charging=false;ch.trigger('charge_release');}
    if(frame>=0){G.time+=1/60;a._finishFrame(1/60);if(!(ch._wst.sinceRelease<.1))throw Error('Native release progression');}
    ch.root.updateMatrixWorld(true);const snapshots=snapshotHeld(nativeHands(w,false)),group=new THREE.Group(),key=id+'-team'+team+'-'+(frame<0?'charge-close':'release-motion-'+frame);
    poses[key]={near:w.near,bodyVisible:w.body.visible,bodyFarVisible:w.bodyFar.visible,pivot:snapshots[0].before,local:snapshots[0].local.toArray(),muzzle:w.muzzle.getWorldPosition(new THREE.Vector3()).toArray(),charge:ch._wst.charge,sinceRelease:ch._wst.sinceRelease,time:G.time,rng:window.__abRngState()};
    if(shared){for(const p of ['pivot','local','muzzle'])close(poses[key][p],shared.poses[key][p],key+' '+p);for(const p of ['near','bodyVisible','bodyFarVisible','charge','sinceRelease','time','rng'])if(poses[key][p]!==shared.poses[key][p])throw Error('A/B state mismatch '+key+' '+p);}
    const direction=printDirection(id,team,frame);
    scene.add(group);try{mountHeld(snapshots,group);cameraFrame(key,group,direction,w,frame<0?['lit','unlit']:['lit'],frame<0?0:frame*.125);}finally{restoreHeld(snapshots,group,scene,ch);}
   }
   ch.dispose();
  }
  if(shaderErrors.length)throw Error('Shader errors: '+shaderErrors.join('\n'));for(const m of unlitMaterials.values())m.dispose();scene.remove(nativeEnvironment.sun,nativeEnvironment.sun.target,nativeEnvironment.hemi);nativeEnvironment.dispose();return {frames,cameras,poses,environment:environmentReceipt,undersizedRejected,shaderErrors,rng:window.__abRngState(),gpu:{depthBits:renderer.getContext().getParameter(renderer.getContext().DEPTH_BITS),context:renderer.getContext().getContextAttributes(),logarithmicDepthBuffer:renderer.capabilities.logarithmicDepthBuffer,reverseDepthBuffer:renderer.capabilities.reverseDepthBuffer}};
 },{prefix,ids,shared});
 }finally{await context.close();await new Promise(r=>server.close(r));}
}
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const a=await capture(baseline,null);const b=await capture(candidate,{cameras:a.cameras,poses:a.poses,environment:a.environment});
 assert.equal(a.frames.length,24);assert.equal(b.frames.length,24);assert.equal(Object.keys(a.poses).length,20);assert.deepEqual(a.cameras,b.cameras);assert.deepEqual(a.poses,b.poses);assert.deepEqual(a.environment,b.environment);assert.ok(a.undersizedRejected&&b.undersizedRejected);assert.deepEqual(a.shaderErrors,[]);assert.deepEqual(b.shaderErrors,[]);assert.deepEqual(errors,[]);assert.deepEqual(networkFailures,[]);
 const images=[];for(const [label,result]of [['frozen',a],['candidate',b]])for(const f of result.frames){const file=label+'-'+f.key+'-'+f.mode+'.png',bytes=Buffer.from(f.png,'base64');fs.writeFileSync(path.join(out,file),bytes);images.push({file,sha256:hash(bytes),triangles:f.triangles,foregroundPixels:f.foregroundPixels,quantizedColors:f.quantizedColors,printROI:f.printROI});}
 const comparisons=[];for(let i=0;i<a.frames.length;i++){
  const left=a.frames[i],right=b.frames[i];assert.equal(left.key,right.key);assert.equal(left.mode,right.mode);
  const x=PNG.sync.read(Buffer.from(left.png,'base64')),y=PNG.sync.read(Buffer.from(right.png,'base64'));assert.equal(x.width,1920);assert.equal(x.height,1080);assert.equal(y.width,x.width);assert.equal(y.height,x.height);
  let changed=0,maxChannelDelta=0,minX=1920,minY=1080,maxX=-1,maxY=-1;
  for(let j=0;j<x.data.length;j+=4){let delta=0;for(let k=0;k<3;k++)delta=Math.max(delta,Math.abs(x.data[j+k]-y.data[j+k]));maxChannelDelta=Math.max(maxChannelDelta,delta);if(delta>3){changed++;const px=j/4%1920,py=Math.floor(j/4/1920);minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);}}
  if(left.key.startsWith('s3-charger-quick'))assert.equal(maxChannelDelta,0,'unchanged Squiffer A/B pixels '+left.key);
  comparisons.push({key:left.key,mode:left.mode,changedPixelsAbove3:changed,maxChannelDelta,bounds:changed?[minX,minY,maxX,maxY]:null});
 }
 assert.ok(comparisons.some(x=>x.key.startsWith('s3-stringer-normal')&&x.changedPixelsAbove3>0),'Bulbz surface change must be visible in at least one matched frame');
 const summary=input=>({sourceSha:input.sourceSha,contentHash:input.manifest.contentHash,inputHash:input.manifest.inputHash,modelInputs:input.modelInputs});
 const receipt={baseline:summary(baseline),candidate:summary(candidate),pipelineHashes,seed,rng:a.rng,renderer:'Chromium SwiftShader',size:[1920,1080],environment:a.environment,undersizedRejected:a.undersizedRejected,colorPipeline:{output:'sRGB',toneMapping:'Neutral',exposure:.94,postprocessing:false},gpu:{baseline:a.gpu,candidate:b.gpu},cameraBasis:'Frozen print-region bounds; exact shared local/world/projection matrices; four consecutive release frames and 0.125-pixel camera drift',unlit:'MeshBasicMaterial diagnostic preserves base color, vertex colors, map, side, opacity and depth flags; production callbacks disabled only for unlit pass',characterRendered:false,method:'Production day Environment PMREM and native lights, Neutral tone mapping/exposure .94; no production compositor/postprocess. Controlled native presentation comparison: manually assigned runner charge, native charge_release event, and stubbed projectile methods; no gameplay admission or ballistics claim',strictTolerance:1e-8,poses:a.poses,cameras:a.cameras,images,comparisons,errors,networkFailures};fs.writeFileSync(path.join(out,'ab-result.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({frames:images.length,poses:Object.keys(a.poses).length,baseline:receipt.baseline,candidate:receipt.candidate}));
}catch(e){fs.writeFileSync(path.join(out,'ab-error.json'),JSON.stringify({error:String(e),errors,networkFailures},null,2));throw e;}finally{await browser?.close();}
