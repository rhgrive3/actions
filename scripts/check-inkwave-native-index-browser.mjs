// Source-order native ink index publication, using real WebGL buffers/readback.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),out=path.resolve(process.argv[2]||'.browser-evidence/native-index.json');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const code=fs.readFileSync(path.join(root,'patches/native-stages/runtime/native-ink-chunks.mjs'),'utf8').replace("import * as THREE from 'three';",'').replaceAll('export function ','function ').replace('export class ','class ')+'\nreturn NativeInkMesh;';
const before=fs.readFileSync(path.join(root,'patches/native-stages/tests/fixtures/native-ink-selection-before.mjs.txt'),'utf8');
const server=http.createServer((req,res)=>{if(req.url==='/favicon.ico'){res.statusCode=204;res.end();return;}if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><script type="importmap">{"imports":{"three":"/inkwave-public/vendor/three/build/three.module.js"}}</script>');return;}const file=path.resolve(root,'.'+req.url);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;res.end();return;}res.setHeader('content-type','text/javascript');fs.createReadStream(file).pipe(res);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.INKWAVE_CHROMIUM?{executablePath:process.env.INKWAVE_CHROMIUM}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('http://127.0.0.1:'+server.address().port+'/');
 const result=await page.evaluate(async({code,before})=>{
  const THREE=await import('three'),NativeInkMesh=new Function('THREE',code)(THREE),oldSelect=new Function(before)();
  const r=new THREE.WebGLRenderer();r.setSize(128,128);r.setClearColor(0x17202a);r.debug.checkShaderErrors=true;
  const gl=r.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');let bytes=0,uploads=0;
  const sub=gl.bufferSubData.bind(gl);gl.bufferSubData=function(target,offset,src,srcOffset,length){if(target===gl.ELEMENT_ARRAY_BUFFER){bytes+=(length??src.length-(srcOffset||0))*src.BYTES_PER_ELEMENT;uploads++;}return sub(...arguments);};
  function make(baseline){const pos=new Float32Array(2400*9),colors=new Float32Array(pos.length);for(let i=0;i<2400;i++){const x=(i%20-10)*.08,z=(Math.floor(i/20)%20-10)*.08;pos.set([x,0,z,x+.3,0,z,x,0,z+.3],i*9);for(let k=0;k<3;k++)colors.set([i%2?.9:.1,(i%3)*.3,i%2?.1:.9],i*9+k*3);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(colors,3));const m=new NativeInkMesh(g,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.2,depthWrite:false,side:THREE.DoubleSide}));m._facePainted=new Uint8Array(24);m._paintedFaceWords=new Uint32Array(1);m._faceStart=Uint32Array.from({length:25},(_,i)=>i*100);if(baseline)m.selectVisible=oldSelect;return m;}
  const a=make(true),b=make(false),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1,.1,30);camera.position.set(0,3,3);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const target=new THREE.WebGLRenderTarget(128,128),ap=new Uint8Array(128*128*4),bp=new Uint8Array(ap.length);
  const stats={baseline:{bytes:0,uploads:0,draws:0},optimized:{bytes:0,uploads:0,draws:0}};let comparisons=0,differentChannels=0,maxDiff=0;
  function render(m,out){scene.clear();scene.add(m);r.setRenderTarget(target);r.render(scene,camera);r.readRenderTargetPixels(target,0,0,128,128,out);}
  function pair(){bytes=uploads=0;render(a,ap);stats.baseline.bytes+=bytes;stats.baseline.uploads+=uploads;stats.baseline.draws+=r.info.render.calls;bytes=uploads=0;render(b,bp);stats.optimized.bytes+=bytes;stats.optimized.uploads+=uploads;stats.optimized.draws+=r.info.render.calls;for(let i=0;i<ap.length;i++){const d=Math.abs(ap[i]-bp[i]);if(d)differentChannels++;maxDiff=Math.max(maxDiff,d);}comparisons++;}
  render(a,ap);render(b,bp);
  for(let i=0;i<24;i++){for(const m of [a,b]){m._facePainted[i]=1;m._paintedFaceWords[0]|=1<<i;m._faceDirty=true;}pair();}
  const progressive=JSON.parse(JSON.stringify(stats));for(const s of Object.values(stats))s.bytes=s.uploads=s.draws=0;
  for(let frame=0;frame<180;frame++){
   for(const m of [a,b]){if(frame%37===0){m._facePainted.fill(0);m._paintedFaceWords.fill(0);}m._facePainted[frame%24]=1;m._paintedFaceWords[0]|=1<<(frame%24);m._faceDirty=true;}
   camera.position.x=frame%9===0?60:Math.sin(frame*.1)*3;camera.lookAt(frame%9===0?60:0,0,0);camera.updateMatrixWorld();
   for(const m of [a,b]){m.updateMatrixWorld();m.selectVisible(camera);}
   if(frame%5===0)pair();
   if(frame%47===0){a.geometry.dispose();b.geometry.dispose();}
  }
  const glError=gl.getError(),renderer=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);a.dispose();b.dispose();a.material.dispose();b.material.dispose();target.dispose();r.dispose();r.forceContextLoss();
  return {renderer,progressive,mixed:stats,comparisons,differentChannels,maxDiff,glError};
 },{code,before});
 assert.deepEqual(errors,[]);assert.equal(result.glError,0);assert.equal(result.maxDiff,0);assert.equal(result.differentChannels,0);assert.equal(result.progressive.baseline.draws,result.progressive.optimized.draws);assert(result.progressive.optimized.bytes<result.progressive.baseline.bytes*.1);
 const report={status:'passed',browser:browser.version(),scope:'Actual NativeInkMesh index selector and transparent source-order geometry with real bufferSubData and completed RGBA8 pixels in Chromium SwiftShader. Whole-game/mobile FPS unmeasured.',...result,errors};fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
