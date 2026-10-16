#!/usr/bin/env node
import {runCaptureGpuLifecycle} from './capture-gpu-lifecycle.mjs';
import {closeCaptureResources} from './capture-resources.mjs';
import {getLane} from './lanes.mjs';
import {writeCaptureCheckpoint} from './capture-checkpoint.mjs';
import {validateBuildBinding,validateDelivered} from './build-binding.mjs';
// Single-site integration smoke. Original frozen A/B remains a separate gate.
import {safeJSON} from './compact-receipt.mjs';import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {chromium} from 'playwright';import {PNG} from 'pngjs';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return path.resolve(i<0?d:process.argv[i+1]);};
const laneIndex=process.argv.indexOf('--lane');const lane=getLane(laneIndex<0?undefined:process.argv[laneIndex+1]);
const out=arg('--out','print-integration');fs.mkdirSync(out,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const plan=JSON.parse(fs.readFileSync(arg('--plan','acceptance-plan.json')));
assert.match(plan.head,/^[a-f0-9]{40}$/);
const site=arg('--site','_site'),source=arg('--source','.');
assert.equal(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),plan.head);
assert.equal(execFileSync('git',['-C',source,'rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),plan.tree);
execFileSync('git',['-C',source,'diff','--exit-code','HEAD','--'],{stdio:'pipe'});
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const buildBinding=validateBuildBinding(manifest,plan,p=>fs.readFileSync(path.join(source,p)),p=>fs.readFileSync(path.join(site,p)),hash);
const gpuLifecycleSource=runCaptureGpuLifecycle.toString();
const seed=0x6b17a9c3,ids=[];const bSource=lane.capture.toString();
const errors=[],networkFailures=[],delivered={};let browser,primaryBrowserFailure=null;
async function capture(input,shared){
 const {site,manifest}=input,prefix='/_versions/'+manifest.build.revision+'/';
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/review'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><link rel="icon" href="data:,"><script type="importmap">'+JSON.stringify({imports:{three:prefix+'vendor/three/build/three.module.js','three/addons/':prefix+'vendor/three/jsm/'}})+'</script><body style="margin:0"></body>');return;}const rel=pathname.startsWith(prefix)?decodeURIComponent(pathname.slice(prefix.length)):null;if(!rel||!Object.hasOwn(manifest.artifacts,rel)){res.writeHead(404);res.end();return;}const file=path.resolve(site,rel);if(!file.startsWith(site+path.sep)){res.writeHead(404);res.end();return;}const bytes=fs.readFileSync(file);if(hash(bytes)!==manifest.artifacts[rel]){res.writeHead(409);res.end();return;}res.setHeader('Content-Type',/\.(m?js)$/.test(file)?'text/javascript':file.endsWith('.json')?'application/json':'application/octet-stream');delivered[rel]=hash(bytes);res.end(bytes);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let context,primaryFailure=null;
 try{
 context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 await context.routeWebSocket('**/*',ws=>{networkFailures.push({url:ws.url(),error:'WebSocket rejected'});ws.close();});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://127.0.0.1:'+server.address().port){networkFailures.push({url:u.href,error:'external origin rejected'});return route.abort();}return route.continue();});
 await context.addInitScript(({seed})=>{window.__captureNativeNow=performance.now.bind(performance);let state=seed>>>0;Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};Date.now=()=>1700000000000;Object.defineProperty(performance,'now',{value:()=>1000});window.__abRngState=()=>state;window.__abResetRng=()=>{state=seed>>>0;};},{seed});
 const page=await context.newPage();page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(String(e)));page.on('requestfailed',r=>networkFailures.push({url:r.url(),error:r.failure()}));page.on('response',r=>{if(r.status()>=400)networkFailures.push({url:r.url(),status:r.status()});});
 await page.exposeFunction('__captureCheckpoint',(phase,data)=>writeCaptureCheckpoint(out,plan.head,phase,data));
 await page.goto('http://127.0.0.1:'+server.address().port+'/review');
 return await page.evaluate(async({prefix,ids,shared,bSource,variantIds,baseModelCount,gpuLifecycleSource})=>{
  function validateThreeExports(namespace){
   const required=['Box3','Color','Group','HalfFloatType','NeutralToneMapping','PerspectiveCamera','SRGBColorSpace','Scene','Vector3','WebGLRenderer'];
   for(const name of required)if(namespace[name]===undefined)throw Error('Missing emitted THREE export: '+name);
   return required;
  }
  const THREE=await import('three');validateThreeExports(THREE);
  const {Environment}=await import(prefix+'src/world/environment.js');
  const {install}=await import(prefix+'patches/splatoon3/runtime/install.mjs');
  const {installMainWeaponCatalogRuntime}=await import(prefix+'patches/splatoon3/runtime/main-weapon-catalog.mjs');
  const R=await import(prefix+'patches/splatoon3/runtime/weapon-models/registry.mjs');
  if(R.registeredWeaponModels().length!==baseModelCount)throw Error('Base model catalog changed');
  const actualVariantIds=R.registeredWeaponVariantModels().slice().sort();
  if(JSON.stringify(actualVariantIds)!==JSON.stringify(variantIds.slice().sort())||new Set(actualVariantIds).size!==59)throw Error('Expected exactly the fifty-nine approved variant registrations');
  const profile=await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json());
  const api=install(profile);installMainWeaponCatalogRuntime(api,profile);
  const {ALTERNATE_WEAPON_KITS}=await import(prefix+'patches/splatoon3/runtime/alternate-weapon-kits-data.mjs');api.ALTERNATE_WEAPON_KITS=ALTERNATE_WEAPON_KITS;
  if(typeof api.Projectiles!=='function'||!Array.isArray(ALTERNATE_WEAPON_KITS))throw Error('Missing native projectile or alternate kit API');
  const nativeCtx=await import(prefix+'src/core/ctx.js');const {on}=nativeCtx;
  if(nativeCtx.G!==api.G)throw Error('Native event context mismatch');api.onNativeEvent=on;
  if(typeof on!=='function')throw Error('Missing native event subscription');
  const appearance=await import(prefix+'patches/splatoon3/runtime/weapon-appearance.mjs');
  if(R.registeredWeaponVariants().length!==94)throw Error('Manual appearance inventory drift');
  const {Actor,Character,G,Physics,WEAPONS}=api;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e6eaf2');G.scene=scene;
  let renderer,nativeEnvironment;
  const lifecycle=(0,eval)('('+gpuLifecycleSource+')');
  return await lifecycle(async()=>{
  renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1920,1080);
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
  window.__abResetRng();const nativeScene=new THREE.Scene();nativeEnvironment=new Environment(renderer,nativeScene,{theme:'day',shadowSize:512});
  const environmentReceipt=environmentEvidence(nativeEnvironment);
  let undersizedRejected=false;try{validateEnvironmentContract({...environmentReceipt,cubeSize:8,width:336,height:32});}catch(e){undersizedRejected=/PMREM/.test(String(e));}
  if(!undersizedRejected)throw Error('Undersized PMREM negative control was not rejected');
  if(shared&&JSON.stringify(environmentReceipt)!==JSON.stringify(shared.environment))throw Error('A/B native environment drift');
  scene.add(nativeEnvironment.sun,nativeEnvironment.sun.target,nativeEnvironment.hemi);scene.environment=nativeEnvironment.envMap;scene.environmentIntensity=environmentReceipt.environmentIntensity;

  const C=await (0,eval)('('+bSource+')')({api,R,THREE,scene,renderer,camera,appearance});
  try{await window.__captureCheckpoint('C',C);}catch(error){error.capturePartial=C;throw error;}
  if(shaderErrors.length){const error=Error('Shader errors: '+shaderErrors.join('\n'));error.capturePartial=C;throw error;}
  return {C,environment:environmentReceipt,undersizedRejected,shaderErrors};
  },[
   ()=>{if(nativeEnvironment)scene.remove(nativeEnvironment.sun,nativeEnvironment.sun.target,nativeEnvironment.hemi);scene.environment=null;},
   ()=>nativeEnvironment?.dispose(),
   ()=>renderer?.dispose(),
   ()=>renderer?.domElement?.remove()
  ],partial=>window.__captureCheckpoint('GPU-failure',partial));
 },{prefix,ids,shared,bSource,variantIds:plan.variantIds,baseModelCount:plan.baseModelCount,gpuLifecycleSource});
 }catch(error){primaryFailure=error;throw error;}finally{await closeCaptureResources(context,server,primaryFailure);}
}
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const result=await capture({site,manifest},null);validateDelivered(delivered,manifest);assert.ok(result.undersizedRejected);assert.deepEqual(result.shaderErrors,[]);assert.deepEqual(errors,[]);assert.deepEqual(networkFailures,[]);
 const images=[];for(const group of ['C']){lane.validateFrames(result[group].frames,group);for(const [index,f]of result[group].frames.entries()){
  const bytes=Buffer.from(f.png,'base64'),image=PNG.sync.read(bytes);assert.equal(image.width,1920);assert.equal(image.height,1080);let foreground=0;const colors=new Set();for(let i=0;i<image.data.length;i+=4){if(Math.abs(image.data[i]-image.data[0])+Math.abs(image.data[i+1]-image.data[1])+Math.abs(image.data[i+2]-image.data[2])>12)foreground++;if(i%64===0)colors.add((image.data[i]>>3)*1024+(image.data[i+1]>>3)*32+(image.data[i+2]>>3));}assert.ok(foreground>=250&&colors.size>=16,'blank frame '+group+index);
  const file=group+'-'+index+'-'+f.id+'-team'+f.team+'-'+f.state+'.png';fs.writeFileSync(path.join(out,file),bytes);const {png,...row}=f;images.push({group,...row,file,sha256:hash(bytes),foregroundPixels:foreground,quantizedColors:colors.size});
 }}assert.equal(images.length,8);
 fs.writeFileSync(path.join(out,'visible-pair-observations.json'),safeJSON({sourceSha:plan.head,acceptanceComplete:false,images}));
 const visiblePairs=lane.validateVisiblePairs(images);
 fs.writeFileSync(path.join(out,'native-integration.json'),safeJSON({sourceSha:plan.head,contentHash:manifest.contentHash,buildBinding,delivered,environment:result.environment,images,visiblePairs,scopes:{C:result.C.scope},errors,networkFailures}));
}catch(e){primaryBrowserFailure=e;fs.writeFileSync(path.join(out,'native-integration-error.json'),JSON.stringify({error:String(e),errors,networkFailures},null,2));throw e;}finally{try{await browser?.close();}catch(cleanup){throw new AggregateError([...(primaryBrowserFailure?[primaryBrowserFailure]:[]),cleanup],'Browser cleanup failed',primaryBrowserFailure?{cause:primaryBrowserFailure}:undefined);}}
