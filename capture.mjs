#!/usr/bin/env node

import {validateBuildBinding,validateDelivered} from './build-binding.mjs';
// Single-site integration smoke. Original frozen A/B remains a separate gate.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {chromium} from 'playwright';import {PNG} from 'pngjs';import {probeRemote} from './probe.mjs';import {validateRenderHealth} from './render-health.mjs';import {finishCleanup} from './cleanup.mjs';import {validateResults} from './gate.mjs';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return path.resolve(i<0?d:process.argv[i+1]);};
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
const seed=0x6b17a9c3,probeSource=probeRemote.toString(),healthSource=validateRenderHealth.toString(),cleanupSource=finishCleanup.toString();
const errors=[],networkFailures=[],delivered={};let browser;
async function capture(input,shared){
 const {site,manifest}=input,prefix='/_versions/'+manifest.build.revision+'/';
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/review'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><link rel="icon" href="data:,"><script type="importmap">'+JSON.stringify({imports:{three:prefix+'vendor/three/build/three.module.js','three/addons/':prefix+'vendor/three/jsm/'}})+'</script><body style="margin:0"></body>');return;}const rel=pathname.startsWith(prefix)?decodeURIComponent(pathname.slice(prefix.length)):null;if(!rel||!Object.hasOwn(manifest.artifacts,rel)){res.writeHead(404);res.end();return;}const file=path.resolve(site,rel);if(!file.startsWith(site+path.sep)){res.writeHead(404);res.end();return;}const bytes=fs.readFileSync(file);if(hash(bytes)!==manifest.artifacts[rel]){res.writeHead(409);res.end();return;}res.setHeader('Content-Type',/\.(m?js)$/.test(file)?'text/javascript':file.endsWith('.json')?'application/json':'application/octet-stream');delivered[rel]=hash(bytes);res.end(bytes);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 try{
 await context.routeWebSocket('**/*',ws=>{networkFailures.push({url:ws.url(),error:'WebSocket rejected'});ws.close();});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://127.0.0.1:'+server.address().port){networkFailures.push({url:u.href,error:'external origin rejected'});return route.abort();}return route.continue();});
 await context.addInitScript(({seed})=>{window.__captureNativeNow=performance.now.bind(performance);let state=seed>>>0;Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};Date.now=()=>1700000000000;Object.defineProperty(performance,'now',{value:()=>1000});window.__abRngState=()=>state;window.__abResetRng=()=>{state=seed>>>0;};},{seed});
 const page=await context.newPage();page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(String(e)));page.on('requestfailed',r=>networkFailures.push({url:r.url(),error:r.failure()}));page.on('response',r=>{if(r.status()>=400)networkFailures.push({url:r.url(),status:r.status()});});

 await page.goto('http://127.0.0.1:'+server.address().port+'/review');
 const evaluated=await page.evaluate(async({prefix,shared,probeSource,healthSource,cleanupSource})=>{
  function validateThreeExports(namespace){
   const required=['Box3','Color','Group','HalfFloatType','NeutralToneMapping','PerspectiveCamera','SRGBColorSpace','Scene','Vector3','WebGLRenderer'];
   for(const name of required)if(namespace[name]===undefined)throw Error('Missing emitted THREE export: '+name);
   return required;
  }
  const THREE=await import('three');validateThreeExports(THREE);
  const {Environment}=await import(prefix+'src/world/environment.js');
  const {install}=await import(prefix+'patches/splatoon3/runtime/install.mjs');
  const {installMainWeaponCatalogRuntime}=await import(prefix+'patches/splatoon3/runtime/main-weapon-catalog.mjs');
  const {NetMatch}=await import(prefix+'src/net/netmatch.js');
  const profile=await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json());
  const api=install(profile);installMainWeaponCatalogRuntime(api,profile);
  const nativeCtx=await import(prefix+'src/core/ctx.js');const {on}=nativeCtx;
  if(nativeCtx.G!==api.G)throw Error('Native event context mismatch');api.onNativeEvent=on;
  if(typeof on!=='function')throw Error('Missing native event subscription');
  const {G,Character}=api;const publicCharacter=await import(prefix+'src/game/character.js');if(publicCharacter.Character!==Character)throw Error('Character identity mismatch');await import(prefix+'src/game/character-weapons.js');await import(prefix+'src/game/weapons.js');
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e6eaf2');G.scene=scene;
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(960,540);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=.94;document.body.append(renderer.domElement);
  const shaderErrors=[];renderer.debug.checkShaderErrors=true;renderer.debug.onShaderError=(gl,program,vs,fs)=>shaderErrors.push([gl.getProgramInfoLog(program),gl.getShaderInfoLog(vs),gl.getShaderInfoLog(fs)].join('\n'));
  const camera=new THREE.PerspectiveCamera(34,1920/1080,.15,6500);G.camera=camera;camera.position.set(2,1.7,2.5);camera.lookAt(0,1,0);camera.updateMatrixWorld();
  G.teamColors=[new THREE.Color('#ff8825'),new THREE.Color('#484ce8')];
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
  let remote;try{remote=await (0,eval)('('+probeSource+')')({api,NetMatch,on,THREE,scene,renderer,camera,validateRenderHealth:(0,eval)('('+healthSource+')'),finishCleanup:(0,eval)('('+cleanupSource+')')});}catch(error){const failure=(0,eval)('('+cleanupSource+')')([()=>nativeEnvironment.dispose(),()=>renderer.dispose()],error);return {failure:String(failure),stack:failure.stack,capturePartial:failure.capturePartial||{results:[]},environment:environmentReceipt};}
  const primary=shaderErrors.length?Error('Shader errors: '+shaderErrors.join('\n')):null;if(primary)primary.capturePartial=remote;
  const failure=(0,eval)('('+cleanupSource+')')([()=>scene.remove(nativeEnvironment.sun,nativeEnvironment.sun.target,nativeEnvironment.hemi),()=>nativeEnvironment.dispose(),()=>renderer.dispose()],primary);if(failure)return {failure:String(failure),stack:failure.stack,capturePartial:failure.capturePartial||remote,environment:environmentReceipt};
  return {remote,environment:environmentReceipt,undersizedRejected,shaderErrors};
 },{prefix,shared,probeSource,healthSource,cleanupSource});
 fs.writeFileSync(path.join(out,'remote-page-checkpoint.json'),JSON.stringify({head:plan.head,tree:plan.tree,...evaluated},null,2));return evaluated;
 }finally{await context.close();await new Promise(r=>server.close(r));}
}
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const result=await capture({site,manifest},null);if(result.failure){fs.writeFileSync(path.join(out,'remote-partial.json'),JSON.stringify({head:plan.head,tree:plan.tree,...result},null,2));throw Error(result.failure+'\n'+(result.stack||''));}validateDelivered(delivered,manifest);assert.ok(result.undersizedRejected);assert.deepEqual(result.shaderErrors,[]);assert.deepEqual(errors,[]);assert.deepEqual(networkFailures,[]);
 validateResults(result.remote);const images=[];
 for(const row of result.remote.results)for(const f of row.frames){const bytes=Buffer.from(f.png,'base64'),image=PNG.sync.read(bytes);assert.equal(image.width,960);assert.equal(image.height,540);let foreground=0;const colors=new Set();for(let i=0;i<image.data.length;i+=4){if(Math.abs(image.data[i]-image.data[0])+Math.abs(image.data[i+1]-image.data[1])+Math.abs(image.data[i+2]-image.data[2])>12)foreground++;if(i%64===0)colors.add((image.data[i]>>3)*1024+(image.data[i+1]>>3)*32+(image.data[i+2]>>3));}assert.ok(foreground>=250&&colors.size>=16,'blank remote frame');const file=row.id+'-'+f.tick+'.png';fs.writeFileSync(path.join(out,file),bytes);images.push({id:row.id,tick:f.tick,file,sha256:hash(bytes),foreground,colors:colors.size});delete f.png;}
 fs.writeFileSync(path.join(out,'remote-result.json'),JSON.stringify({head:plan.head,tree:plan.tree,contentHash:manifest.contentHash,buildBinding,delivered,environment:result.environment,remote:result.remote,images,errors,networkFailures},null,2));
}catch(e){fs.writeFileSync(path.join(out,'remote-error.json'),JSON.stringify({error:String(e),errors,networkFailures},null,2));throw e;}finally{await browser?.close();}
