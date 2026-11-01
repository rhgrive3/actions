#!/usr/bin/env node
// Render colour + live shadow maps for sphere and conservative box culling.
// The same source triangles, shader, lighting and cameras are used on each side.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';import {execFileSync} from 'node:child_process';
const site=path.resolve(process.argv[2]||'_site'),out=path.resolve(process.argv[3]||'.ci-scratch/stage-tight-synthetic.json');
if(!process.env.INKWAVE_NATIVE_DISPLAY_EXPERIMENT)throw Error('Set INKWAVE_NATIVE_DISPLAY_EXPERIMENT to the candidate native-render.mjs');
const candidate=fs.readFileSync(path.resolve(process.env.INKWAVE_NATIVE_DISPLAY_EXPERIMENT));
const baseline=execFileSync('git',['show','2f3acacdb5296605cdc675e4feb564dc1a491d51:patches/native-stages/runtime/native-render.mjs']);
const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://local').pathname;
 if(u==='/fixture'){res.writeHead(200,{'content-type':'text/html'});res.end('<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js"}}</script>');return;}
 if(u==='/patches/native-stages/runtime/native-render-candidate.mjs'||u==='/patches/native-stages/runtime/native-render.mjs'){
  res.writeHead(200,{'content-type':'text/javascript'});res.end(u.includes('-candidate')?candidate:baseline);return;
 }
 if(u==='/patches/native-stages/runtime/native-work.mjs'||u==='/patches/native-stages/runtime/native-paint-detail.mjs'){
  res.writeHead(200,{'content-type':'text/javascript'});res.end(fs.readFileSync(path.resolve('.'+u)));return;
 }
 if(u==='/favicon.ico'){res.writeHead(204);res.end();return;}const f=path.resolve(site,'.'+decodeURIComponent(u));if(!f.startsWith(site+path.sep)||!fs.statSync(f).isFile())throw Error();
 res.writeHead(200,{'content-type':/\.(js|mjs)$/.test(f)?'text/javascript':'application/octet-stream'});fs.createReadStream(f).pipe(res);
}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;const report={status:'running',errors:[],scope:'Synthetic WebGL native culling, colour and directional shadow maps; not native-stage or device FPS'};
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
 await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');
 report.browser=browser.version();report.result=await page.evaluate(async()=>{
  const THREE=await import('/vendor/three/build/three.module.js');
  const old=(await import('/patches/native-stages/runtime/native-render.mjs')).installNativeDisplayCulling;
  const current=(await import('/patches/native-stages/runtime/native-render-candidate.mjs')).installNativeDisplayCulling;
  const r=new THREE.WebGLRenderer({antialias:false});r.setSize(256,256,false);r.shadowMap.enabled=true;r.shadowMap.type=THREE.PCFShadowMap;
  const gl=r.getContext(),scene=new THREE.Scene();scene.background=new THREE.Color('#b8cce0');scene.add(new THREE.HemisphereLight(0xffffff,0x404040,.5));
  const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(30,55,40);light.castShadow=true;light.shadow.mapSize.set(256,256);
  Object.assign(light.shadow.camera,{left:-80,right:80,top:80,bottom:-80,near:.1,far:250});light.shadow.camera.updateProjectionMatrix();scene.add(light);scene.add(light.target);
  const receiver=new THREE.Mesh(new THREE.PlaneGeometry(400,400),new THREE.MeshStandardMaterial({color:0x909090,side:THREE.DoubleSide}));receiver.rotation.x=-Math.PI/2;receiver.position.y=-3;receiver.receiveShadow=true;scene.add(receiver);
  const positions=[],indices=[];for(let x=-9;x<9;x++)for(let z=-9;z<5;z++){
   const n=positions.length/3,X=x*16,Z=z*16,y=-1;
   positions.push(X,y,Z,X+15,y,Z,X+15,y,Z+15,X,y,Z+15);indices.push(n,n+1,n+2,n,n+2,n+3);
  }
  function create(install,tight){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(new THREE.BufferAttribute(Uint16Array.from(indices),1));g.computeVertexNormals();g.computeBoundingSphere();
   const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0x997b60,side:THREE.DoubleSide}));m.castShadow=true;m.receiveShadow=true;scene.add(m);return{m,g,c:install(m,16,1,tight)};}
  const base=create(old,false),trial=create(current,true),target=new THREE.WebGLRenderTarget(256,256,{depthBuffer:true});
  const c=new THREE.PerspectiveCamera(38,1,.1,250),bytes=new Uint8Array(256*256*4),rows=[];let shadowPixels=0;
  const draw=(subject)=>{base.m.visible=subject===base;trial.m.visible=subject===trial;r.setRenderTarget(target);r.clear();r.render(scene,c);r.readRenderTargetPixels(target,0,0,256,256,bytes);return bytes.slice();};
  try{
   const transforms=[{r:0,s:[1,1,1]},{r:.3,s:[-1,1,1]},{r:-.35,s:[.6,1,1.6]}];
   for(const t of transforms){for(const o of [base.m,trial.m]){o.rotation.y=t.r;o.scale.set(...t.s);o.updateMatrixWorld();}
    for(let i=0;i<12;i++){
     const angle=i*Math.PI/6;c.position.set(Math.sin(angle)*30,8+Math.cos(i*.7)*2,Math.cos(angle)*30);c.lookAt(0,-2,0);c.updateMatrixWorld();
     light.position.set(30*Math.cos(angle*.3),55,40*Math.sin(angle*.3));light.target.position.set(0,-3,0);light.updateMatrixWorld();light.target.updateMatrixWorld();
     const a0=draw(base),a=draw(base),b0=draw(trial),b=draw(trial);let diff=0,selfA=0,selfB=0;
     for(let j=0;j<a.length;j++){if(a[j]!==b[j])diff++;if(a[j]!==a0[j])selfA++;if(b[j]!==b0[j])selfB++;}
     if(!rows.length){light.castShadow=false;const noShadow=draw(base);light.castShadow=true;for(let j=0;j<a.length;j++)if(a[j]!==noShadow[j])shadowPixels++;}
     rows.push({transform:t,angle,differingBytes:diff,baselineNoise:selfA,trialNoise:selfB,baseIndices:base.g.drawRange.count,trialIndices:trial.g.drawRange.count,glError:gl.getError()});
    }
   }
   return{rows,shadowPixels,renderer:gl.getParameter(gl.RENDERER)};
  }finally{base.c.dispose();trial.c.dispose();base.g.dispose();trial.g.dispose();base.m.material.dispose();trial.m.material.dispose();receiver.geometry.dispose();receiver.material.dispose();target.dispose();r.dispose();}
 });
 assert.deepEqual(report.errors,[]);assert(report.result.shadowPixels>0,'shadow map did not affect any pixels');
 assert(report.result.rows.every(x=>!x.differingBytes&&!x.baselineNoise&&!x.trialNoise&&!x.glError),'rendered colour or shadows differ');
 assert(report.result.rows.every(x=>x.trialIndices<=x.baseIndices),'candidate increased submitted geometry');
 assert(report.result.rows.some(x=>x.trialIndices<x.baseIndices),'did not exercise tighter culling');
 report.status='passed';
}catch(e){report.errors.push(e.stack||String(e));console.error(e);process.exitCode=1;}
finally{fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');await browser?.close();await new Promise(r=>server.close(r));}
