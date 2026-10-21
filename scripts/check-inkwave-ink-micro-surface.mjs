#!/usr/bin/env node
// Actual emitted level shader and authored-Level runtime geometry (not an
// imported source-stage mesh). Compare a double-sided grate face with
// the same indexed face reversed into a front-facing reference. The
// reference changes winding/normals only; no lighting or coverage is mocked.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { verifyRuntimeBuild } from './lib/inkwave-runtime-evidence.mjs';

const option = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return path.resolve(i < 0 ? fallback : process.argv[i + 1]);
};
const site = fs.realpathSync(option('--site', '_site'));
const sourceRoot = fs.realpathSync(option('--source-root', fileURLToPath(new URL('../', import.meta.url))));
const shaAt = process.argv.indexOf('--source-sha');
const sourceSha = shaAt < 0 ? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim() : process.argv[shaAt + 1];
const output = option('--evidence-dir', '.ci-scratch/ink-micro-surface');
const browserName = process.argv[process.argv.indexOf('--browser') + 1] === 'webkit' ? 'webkit' : 'chromium';
const executableAt = process.argv.indexOf('--executable-path');
const executablePath = executableAt < 0 ? (browserName === 'webkit' ? undefined : process.env.CHROMIUM_PATH) : process.argv[executableAt + 1];
if (output === site || output.startsWith(site + '/')) throw Error('Evidence must be outside the immutable build');
fs.mkdirSync(output, { recursive: true });
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const manifest = verifyRuntimeBuild(site, sourceRoot, sourceSha);
assert.equal(hash(JSON.stringify(manifest.artifacts)), manifest.contentHash);
assert.equal(hash(JSON.stringify(manifest.files)), manifest.inputHash);
const verifierSha256 = hash(fs.readFileSync(fileURLToPath(import.meta.url)));
const prefix = '/_versions/' + manifest.build.revision + '/';
const loaded = new Map(), errors = [];
const server = http.createServer((request, response) => {
  if (request.url === '/ink-micro-surface') {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(`<html><head><link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script></head><body style="margin:0;background:#20242b"></body></html>`);
    return;
  }
  try {
    const key = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1);
    const file = fs.realpathSync(path.resolve(site, key));
    if (!file.startsWith(site + '/') || !manifest.artifacts[key]) throw Error('Missing artifact');
    const bytes = fs.readFileSync(file);
    assert.equal(hash(bytes), manifest.artifacts[key], key + ' differs from its manifest');
    loaded.set(key, { path: key, bytes: bytes.length, sha256: hash(bytes) });
    response.writeHead(200, { 'content-type': /\.m?js$/.test(key) ? 'text/javascript' : 'application/json', 'cache-control': 'no-store' });
    response.end(bytes);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser, result, failure;
try {
  browser = await (browserName === 'webkit' ? webkit : chromium).launch({ executablePath, headless: true,
    ...(browserName === 'webkit' ? {} : { args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }) });
  const page = await browser.newPage({ viewport: { width: 960, height: 360 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:' + server.address().port + '/ink-micro-surface');

  result = await page.evaluate(async ({prefix}) => {
    const THREE=await import('three');
    const {Level}=await import(prefix+'src/world/level.js');
    const {Environment}=await import(prefix+'src/world/environment.js');
    const {createLevelMaterial}=await import(prefix+'src/world/levelMaterial.js');
    const {createTextureLibrary}=await import(prefix+'src/world/texlib.js');
    const {G}=await import(prefix+'src/core/ctx.js');
    const r=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
    r.setPixelRatio(1);r.setSize(960,360);r.outputColorSpace=THREE.SRGBColorSpace;r.toneMapping=THREE.NeutralToneMapping;
    r.debug.checkShaderErrors=true;document.body.appendChild(r.domElement);G.renderer=r;G.settings={quality:'high'};
    let seed=1234567;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const level=new Level({id:'ink-material-fixture',bounds:{minX:-5,maxX:5,minZ:-5,maxZ:5},spawnPads:[[0,0,-4],[0,0,4]],spawnBarrier:1,half:[],single:[
      {kind:'box',min:[-1.5,-.15,-1],max:[1.5,0,1],pattern:1,color:'#87969d',bevel:0,grate:true}]});
    G.level=level;
    const world=new THREE.Scene(),env=new Environment(r,world,{bounds:level.bounds,theme:'day',shadowSize:256});
    if(!world.environment)throw Error('Production environment PMREM missing');
    const scene=new THREE.Scene();scene.background=new THREE.Color('#20242b');scene.environment=world.environment;scene.environmentIntensity=world.environmentIntensity;
    scene.add(env.sun.clone(),env.hemi.clone());scene.children[0].target=env.sun.target.clone();scene.add(scene.children[0].target);
    const geometry=level.buildGeometry(1,block=>block.grate),idx=[];
    for(let i=0;i<geometry.index.count;i+=3){const ids=[0,1,2].map(k=>geometry.index.getX(i+k));if(ids.every(j=>geometry.attributes.normal.getY(j)>.999))idx.push(...ids);}
    if(idx.length!==6)throw Error('Fixture must contain one production floor face');
    geometry.setIndex(idx);geometry.computeBoundingSphere();
    const size=64,data=new Uint8Array(size*size*4);
    const texture=new THREE.DataTexture(data,size,size);texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;
    for(let i=0;i<geometry.attributes.faceData.count;i++){
      geometry.attributes.faceData.setX(i,1);geometry.attributes.faceData.setY(i,1);
      geometry.attributes.paintUv.setXY(i,.1+geometry.attributes.faceUv.getX(i)*.25,.1+geometry.attributes.faceUv.getY(i)*.35);
    }
    const library=await createTextureLibrary(r,{size:128});
    if(!(library.layers.gel>=0)||!library.normal)throw Error('Actual texlib gel not loaded');
    const variants={},shaders={};
    for(const lib of [false,true])for(const before of [false,true]){
      const key=(lib?'texlib':'fallback')+(before?'-before':'-after');
      const mat=createLevelMaterial(texture,size,null,lib?{texlib:library}:{});
      if(lib&&!(mat.userData.uniforms.uGel.value>=0))throw Error('Inactive gel uniform');
      const compile=mat.onBeforeCompile;
      mat.customProgramCacheKey=()=>key;
      mat.onBeforeCompile=function(shader,...args){
        compile.call(this,shader,...args);
        for(const anchor of ['(0.7125 - 0.375 * gFresh)','* 0.02625 * gf * gInk;','gInkD *= uPpm * 0.004 / 1.9'])if(!shader.fragmentShader.includes(anchor))throw Error('Missing emitted candidate/film '+anchor);
        if(before)shader.fragmentShader=shader.fragmentShader.replace('(0.7125 - 0.375 * gFresh)','(0.95 - 0.5 * gFresh)').replace('* 0.02625 * gf * gInk;','* 0.035 * gf * gInk;');
        shaders[key]=shader.fragmentShader;
      };variants[key]=mat;
    }
    const mesh=new THREE.Mesh(geometry,variants['texlib-after']);scene.add(mesh);
    const camera=new THREE.PerspectiveCamera(40,480/360,.05,30);
    const gl=r.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
    function setCase(lib,wall,wet,inked=true){
      for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const u=(x+.5)/size,v=(y+.5)/size,rad=Math.hypot((u-.5)*1.15,(v-.5)*1.5),edge=Math.max(0,Math.min(1,(.46-rad)/.13)),coverage=inked?edge*edge*(3-2*edge):0,i=(y*size+x)*4;
        data[i]=Math.round(255*coverage*(x<size/2?0:1));data[i+1]=Math.round(255*coverage*wet);data[i+2]=Math.round(255*coverage*.7);data[i+3]=Math.round(255*coverage);
      }
      texture.needsUpdate=true;mesh.rotation.x=wall?Math.PI/2:0;
      camera.position.set(.2,wall?.15:1.35,3.4);camera.lookAt(0,0,0);camera.updateMatrixWorld();
      return {lib,wall,wet,inked};
    }
    function draw(key,time=1,side=0){
      mesh.material=variants[key];mesh.material.userData.uniforms.uTime.value=time;
      r.setViewport(side*480,0,480,360);r.setScissor(side*480,0,480,360);r.setScissorTest(true);
      r.info.reset();const t=performance.now();r.render(scene,camera);const submit=performance.now()-t;
      const d=performance.now();gl.finish();const drain=performance.now()-d;
      return {submit,drain,calls:r.info.render.calls,triangles:r.info.render.triangles,geometries:r.info.memory.geometries,textures:r.info.memory.textures,programs:r.info.programs.length};
    }
    function pixels(){const p=new Uint8Array(480*360*4);gl.readPixels(0,0,480,360,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;}
    function diff(a,b){let changed=0,max=0,sum=0;for(let i=0;i<a.length;i+=4){let yes=false;for(let k=0;k<4;k++){const d=Math.abs(a[i+k]-b[i+k]);max=Math.max(max,d);sum+=d;yes||=d>0;}changed+=yes;}return{changed,max,mean:sum/a.length};}
    window.inkQA={setCase,draw,pixels,diff,r,gl,camera,variants,shaders,texture,data};
    return {gpu:{renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),timerQueryAvailable:!!gl.getExtension('EXT_disjoint_timer_query_webgl2'),gpuTime:'not measured',allocationRate:'not measured'},lighting:{theme:'production Environment day',themeValues:Environment.THEMES.day,environmentIntensity:scene.environmentIntensity,environmentWidth:world.environment.image?.width??null},color:{toneMapping:r.toneMapping,outputColorSpace:r.outputColorSpace},viewport:[960,360],eachView:[480,360],texlib:{gel:library.layers.gel,resolution:128},cases:[]};
  },{prefix});
  for(const lib of ['fallback','texlib'])for(const wall of [false,true])for(const wet of [0,1]){
    const name=lib+'-'+(wall?'wall':'floor')+'-'+(wet?'fresh':'settled');
    const row=await page.evaluate(({lib,wall,wet})=>{
      const q=window.inkQA,receipt=q.setCase(lib,wall,wet),before=lib+'-before',after=lib+'-after';
      for(let i=0;i<4;i++){q.draw(before);q.draw(after);}
      const samples=[];
      // No image encoding, readPixels or file I/O in this timed ABBA section.
      for(let block=0;block<8;block++)for(const key of [before,after,after,before])samples.push({block,key,...q.draw(key)});
      q.draw(before);const a=q.pixels();q.draw(after);const b=q.pixels();q.draw(after);const repeat=q.pixels();
      q.draw(before,1,0);q.draw(after,1,1);
      const image=q.r.domElement.toDataURL();
      return {receipt,samples,difference:q.diff(a,b),repeat:q.diff(b,repeat),image,glError:q.gl.getError()};
    },{lib,wall,wet});
    fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(row.image.split(',')[1],'base64'));delete row.image;row.name=name;result.cases.push(row);
    assert.equal(row.repeat.changed,0,name+' unstable frozen frame');assert.equal(row.glError,0);
    const count=x=>[x.calls,x.triangles,x.geometries,x.textures,x.programs];
    for(const sample of row.samples)assert.deepEqual(count(sample),count(row.samples[0]),name+' changed resource cost');
    // Sequential rendered frames, not interpolated stills. Left=before, right=candidate.
    if(lib==='texlib')for(let frame=0;frame<24;frame++){
      const image=await page.evaluate(({lib,frame,wall})=>{const q=window.inkQA; q.camera.position.x=.2+Math.sin(frame/23*Math.PI)*.45;q.camera.lookAt(0,0,0);q.camera.updateMatrixWorld();q.draw(lib+'-before',1+frame/30,0);q.draw(lib+'-after',1+frame/30,1);return q.r.domElement.toDataURL();},{lib,frame,wall});
      fs.writeFileSync(path.join(output,name+'-'+String(frame).padStart(3,'0')+'.png'),Buffer.from(image.split(',')[1],'base64'));
    }
  }
  result.unpainted=await page.evaluate(()=>{const q=window.inkQA;q.setCase('texlib',false,0,false);q.draw('texlib-before');const a=q.pixels();q.draw('texlib-after');return q.diff(a,q.pixels());});
  assert.equal(result.unpainted.changed,0,'Unpainted surface changed');
  result.shaders=await page.evaluate(()=>window.inkQA.shaders);
  for(const [key,shader]of Object.entries(result.shaders))fs.writeFileSync(path.join(output,key+'.glsl'),shader);
  delete result.shaders;
  assert.equal(errors.length,0,errors.join('\n'));
} catch(error){failure=error;}
finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));
  const receipt={status:failure?'failed':'passed',scope:'Real emitted Level material and texlib, production daylight Environment lighting; isolated floor/wall fixture, NOT full gameplay performance or retail parity. Left video panel original; right candidate. Timings are browser CPU submission and synchronous completion diagnostics, not physical GPU or FPS.',sourceSha,verifierSha256,inputHash:manifest.inputHash,contentHash:manifest.contentHash,result,errors,loaded:[...loaded.values()],...(failure?{error:failure.stack}:{})};
  fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({status:receipt.status,error:failure?.message}));
  if(failure)process.exitCode=1;
}
