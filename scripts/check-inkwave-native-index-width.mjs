// Exact index values across the restored native stage assets, plus WebGL2
// primitive-restart boundary pixels from the real nativeDisplay constructor.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const assets=path.resolve(process.argv[2]||'native-prebuilt'),out=path.resolve(process.argv[3]||'.browser-evidence/native-index-width.json');
const raw=fs.readFileSync(path.join(root,'patches/native-stages/runtime/native-render.mjs'),'utf8');
const code=raw.replace(/^import[^\n]+\n/gm,'').replaceAll('export function ','function ');
const {compactNativeIndices}=new Function(code+'\nreturn {compactNativeIndices};')();
const stages=[];let totalBefore=0,totalAfter=0,checked=0;
for(const name of fs.readdirSync(assets).sort()){
 const metaPath=path.join(assets,name,'stage.json');if(!fs.existsSync(metaPath))continue;
 const data=JSON.parse(fs.readFileSync(metaPath,'utf8')),spec=data.arrays.indices;
 if(!spec?.chunks)continue;
 const bytes=Buffer.concat(spec.chunks.map(c=>fs.readFileSync(path.join(assets,name,c.file))));
 const indices=new Uint32Array(bytes.buffer,bytes.byteOffset,bytes.length/4);let beforeBytes=0,afterBytes=0,objects=0,narrowed=0;
 for(const o of data.manifest.objects){if(!o.active)continue;objects++;const src=indices.subarray(o.io,o.io+o.ic),dst=compactNativeIndices(src);
  assert.equal(src.length,o.ic);assert.equal(dst.length,src.length);for(let i=0;i<src.length;i++)assert.equal(dst[i],src[i]);checked+=src.length;
  beforeBytes+=src.byteLength;afterBytes+=dst.byteLength;if(dst.BYTES_PER_ELEMENT===2)narrowed++;
 }
 stages.push({id:name,objects,narrowed,beforeBytes,afterBytes,savedBytes:beforeBytes-afterBytes});totalBefore+=beforeBytes;totalAfter+=afterBytes;
}
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const server=http.createServer((req,res)=>{if(req.url==='/favicon.ico'){res.statusCode=204;res.end();return;}if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><script type="importmap">{"imports":{"three":"/inkwave-public/vendor/three/build/three.module.js"}}</script>');return;}const file=path.resolve(root,'.'+req.url);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;res.end();return;}res.setHeader('content-type','text/javascript');fs.createReadStream(file).pipe(res);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.INKWAVE_CHROMIUM?{executablePath:process.env.INKWAVE_CHROMIUM}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('http://127.0.0.1:'+server.address().port+'/');
 const result=await page.evaluate(async code=>{
  const THREE=await import('three'),make=new Function('THREE',code+'\nreturn nativeDisplay;')(THREE),base=new Function('THREE',code.replace('compactNativeIndices(ib)','ib')+'\nreturn nativeDisplay;')(THREE),forced=new Function('THREE',code.replace('compactNativeIndices(ib)','new Uint16Array(ib)')+'\nreturn nativeDisplay;')(THREE);
  const r=new THREE.WebGLRenderer();r.setSize(64,64);r.setClearColor(0);const gl=r.getContext(),target=new THREE.WebGLRenderTarget(64,64),scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(50,1,.1,10);cam.position.set(0,0,2);cam.lookAt(0,0,0);cam.updateMatrixWorld();
  let uploadBytes=0,drawType=null;const bd=gl.bufferData.bind(gl),de=gl.drawElements.bind(gl);gl.bufferData=function(t,a,u){if(t===gl.ELEMENT_ARRAY_BUFFER)uploadBytes+=typeof a==='number'?a:a.byteLength;return bd(...arguments);};gl.drawElements=function(m,c,t,o){drawType=t;return de(...arguments);};
  function run(max,fn){const vertices=new Float32Array((max+1)*8);vertices.set([-.7,-.7,0,0,0,1,0,0],0);vertices.set([.7,-.7,0,0,0,1,1,0],8);vertices.set([0,.7,0,0,0,1,.5,1],max*8);
   const display=fn({vertices,indices:new Uint32Array([0,1,max]),manifest:{materials:{surface:{tint:'#ff4411'}},objects:[{name:'boundary',active:true,material:'surface',vo:0,vc:max+1,io:0,ic:3,collidable:true}]}},new Map(),'low');
   scene.clear();scene.add(display.group,new THREE.AmbientLight(0xffffff,3));uploadBytes=0;drawType=null;r.setRenderTarget(target);r.render(scene,cam);const p=new Uint8Array(64*64*4);r.readRenderTargetPixels(target,0,0,64,64,p);const lit=p.reduce((n,v,i)=>n+(i%4!==3&&v>0),0),result={pixels:p,lit,indexBytes:uploadBytes,drawType,cpuIndexReleased:display.group.children[0].geometry.index.array===null};display.dispose();return result;
  }
  const cases=[];let badControl=null;
  for(const max of [2,65534,65535,65536]){const a=run(max,base),b=run(max,make);let diff=0;for(let i=0;i<a.pixels.length;i++)if(a.pixels[i]!==b.pixels[i])diff++;cases.push({maxIndex:max,beforeBytes:a.indexBytes,afterBytes:b.indexBytes,beforeType:a.drawType,afterType:b.drawType,litChannels:b.lit,differentChannels:diff,cpuIndexReleased:b.cpuIndexReleased});if(max===65535){const bad=run(max,forced);badControl={maxIndex:max,correctLitChannels:b.lit,unsafeUint16LitChannels:bad.lit};}}
  const glError=gl.getError();target.dispose();r.dispose();r.forceContextLoss();return {cases,badControl,glError};
 },code);
 assert.deepEqual(errors,[]);assert.equal(result.glError,0);for(const c of result.cases){assert.equal(c.differentChannels,0);assert(c.litChannels>0);assert(c.cpuIndexReleased);assert.equal(c.afterBytes,c.maxIndex<65535?6:12);assert.equal(c.afterType,c.maxIndex<65535?5123:5125);}assert.equal(result.badControl.unsafeUint16LitChannels,0);
 const report={status:'passed',scope:'Exact values for active native stage object indices; real nativeDisplay bufferData/drawElements/readback on Chromium WebGL2 SwiftShader. GPU index allocation counts exclude other graphics memory; no hardware FPS claim.',browser:browser.version(),stages,totalBefore,totalAfter,savedBytes:totalBefore-totalAfter,checkedIndices:checked,...result,errors};fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,stages:stages.length,totalBefore,totalAfter,savedBytes:report.savedBytes,checkedIndices:checked,boundary:result}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
