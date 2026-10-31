#!/usr/bin/env node
// Real pinned Scorch geometry/material metadata with deterministic lighting.
// Deliberately no textures, gameplay, post-processing or device FPS claims.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {chromium} from 'playwright';
import {admitPrebuiltStages} from './lib/inkwave-native-prebuilt.mjs';import {nativeStageCatalog,nativeBrowserStageIntegrity} from './lib/inkwave-native-stages.mjs';
const site=path.resolve(process.argv[2]||'_site'),root=path.resolve(process.argv[3]||'native-prebuilt'),out=path.resolve(process.argv[4]||'.ci-scratch/stage-prebuilt-tight.json');
const admission=admitPrebuiltStages(nativeStageCatalog().stages.map(s=>({...s,integritySha256:nativeBrowserStageIntegrity(s)})),root);assert(admission.admitted.scorch&&!admission.stale.includes('scorch'),'Scorch source/converter/payload admission failed');
const dir=path.join(root,'scorch'),record=JSON.parse(fs.readFileSync(path.join(dir,'stage.json')));
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
 if(u==='/favicon.ico'){res.writeHead(204);res.end();return;}
 const fromNative=u.startsWith('/native-input/');const base=fromNative?dir:site;
 const f=path.resolve(base,fromNative?'.'+u.slice('/native-input'.length):'.'+decodeURIComponent(u));
 if(!f.startsWith(base+path.sep)||!fs.statSync(f).isFile())throw Error('missing '+u);
 res.writeHead(200,{'content-type':/\.(js|mjs)$/.test(f)?'text/javascript':/\.json$/.test(f)?'application/json':'application/octet-stream'});fs.createReadStream(f).pipe(res);
}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;const report={status:'running',errors:[],scope:'Admitted native Scorch source geometry and material metadata; deterministic lights and cast shadows; textures, gameplay, postprocessing and full-game FPS are not covered.',sourceSha256:record.sourceSha256,converterSha256:record.converter.sha256};
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
 await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');report.browser=browser.version();
 report.result=await page.evaluate(async()=>{
  const THREE=await import('/vendor/three/build/three.module.js');
  const old=(await import('/patches/native-stages/runtime/native-render.mjs')).nativeDisplay;
  const current=(await import('/patches/native-stages/runtime/native-render-candidate.mjs')).nativeDisplay;
  const record=await(await fetch('/native-input/stage.json')).json();
  async function load(name,C){const a=record.arrays[name];const parts=await Promise.all(a.chunks.map(async c=>new Uint8Array(await(await fetch('/native-input/'+c.file)).arrayBuffer())));const bytes=new Uint8Array(a.length*C.BYTES_PER_ELEMENT);let pos=0;for(const p of parts){bytes.set(p,pos);pos+=p.length}if(pos!==bytes.length)throw Error('invalid '+name+' length');return new C(bytes.buffer);}
  const vertices=await load('vertices',Float32Array),indices=await load('indices',Uint32Array);
  const make=(fn)=>fn({manifest:structuredClone(record.manifest),vertices:vertices.slice(),indices:indices.slice()},new Map(),'low');
  const a=make(old),b=make(current);const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(320,240,false);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  const gl=renderer.getContext(),scene=new THREE.Scene();scene.background=new THREE.Color('#b8cce0');scene.add(a.group,b.group,new THREE.HemisphereLight(0xffffff,0x505050,1));
  const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(-80,160,-40);light.castShadow=true;light.shadow.mapSize.set(512,512);Object.assign(light.shadow.camera,{left:-160,right:160,top:160,bottom:-160,near:.1,far:500});light.shadow.camera.updateProjectionMatrix();scene.add(light);scene.add(light.target);
  const target=new THREE.WebGLRenderTarget(320,240,{depthBuffer:true}),cam=new THREE.PerspectiveCamera(60,320/240,.1,500),bytes=new Uint8Array(320*240*4);
  let counts={};const owner=new Map();for(const [name,group]of [['base',a.group],['trial',b.group]])for(const mesh of group.children){if(mesh.geometry?.index?.array)owner.set(mesh.geometry.index.array,name);}
  const oldSub=gl.bufferSubData;gl.bufferSubData=function(kind,offset,array,start,len){const name=owner.get(array);if(kind===gl.ELEMENT_ARRAY_BUFFER&&name===counts.side){counts.uploads++;counts.bytes+=(len??(array.length-(start||0)))*array.BYTES_PER_ELEMENT}return oldSub.apply(this,arguments)};
  const hook=[];for(const [name,group]of [['base',a.group],['trial',b.group]])for(const m of group.children){if(!m.isMesh)continue;const before=m.onBeforeRender;hook.push([m,before]);m.onBeforeRender=function(renderer,scene,camera,geometry,material,group){const result=before.call(this,renderer,scene,camera,geometry,material,group);if(name===counts.side&&!material.transparent&&!material.alphaTest){counts.objects++;counts.triangles+=Math.min(geometry.index?.count??geometry.attributes.position.count,geometry.drawRange.count)/3;}return result;};}
  const hash=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',x))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const draw=async side=>{a.group.visible=side==='base';b.group.visible=side==='trial';counts={side,objects:0,triangles:0,uploads:0,bytes:0};renderer.setRenderTarget(target);renderer.clear();const start=performance.now();renderer.render(scene,cam);gl.finish();const milliseconds=performance.now()-start;renderer.readRenderTargetPixels(target,0,0,320,240,bytes);return{...counts,milliseconds,hash:await hash(bytes),glError:gl.getError()};};
  const rows=[];
  try{
   // Same deterministic frame order and scene; alternate sides to avoid time-order bias.
   for(let frame=0;frame<12;frame++){
    const t=frame/11,yaw=Math.sin(t*7)*.75;cam.position.set(Math.sin(t*3)*7,16,-70+140*t);cam.lookAt(cam.position.x+Math.sin(yaw)*20,14,cam.position.z+Math.cos(yaw)*20);cam.updateMatrixWorld();
    let x,y;if(frame%2){y=await draw('trial');x=await draw('base');}else{x=await draw('base');y=await draw('trial');}
    const xx=await draw('base'),yy=await draw('trial');rows.push({frame,base:x,trial:y,baseRepeat:xx,trialRepeat:yy});
   }
   return{rows,objects:a.group.children.length,shadowMap:renderer.shadowMap.enabled,renderer:gl.getParameter(gl.RENDERER)};
  }finally{gl.bufferSubData=oldSub;for(const[m,fn]of hook)m.onBeforeRender=fn;target.dispose();a.dispose();b.dispose();renderer.dispose();}
 });
 assert.deepEqual(report.errors,[]);assert(report.result.shadowMap,'shadow map disabled');
 assert(report.result.rows.every(v=>v.base.hash===v.trial.hash&&v.base.hash===v.baseRepeat.hash&&v.trial.hash===v.trialRepeat.hash&&![v.base,v.trial,v.baseRepeat,v.trialRepeat].some(x=>x.glError)),'pixels or repeat changed');
 assert(report.result.rows.every(v=>v.trial.triangles<=v.base.triangles),'candidate submitted more triangles');
 assert(report.result.rows.some(v=>v.trial.triangles<v.base.triangles),'candidate did not reduce geometry');
 report.status='passed';
}catch(e){report.status='failed';report.errors.push(e.stack||String(e));console.error(e);process.exitCode=1;}
finally{fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');await browser?.close();await new Promise(r=>server.close(r));}
