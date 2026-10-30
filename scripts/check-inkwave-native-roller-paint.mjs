// Browser regression for native roller chart continuity and contour density.
// Synthetic source triangles; the real composed/emitted paint and ink shaders.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {adaptBuildSource} from './inkwave-source-composition.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const out=path.resolve(arg('--evidence-dir','.browser-evidence/native-roller'));
const site=arg('--site',null);
const engine=arg('--engine','chromium');
assert.ok(engine==='chromium'||engine==='webkit');
const build=site?JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8')):null;
fs.mkdirSync(out,{recursive:true});
function exposeRendering(source){
 if(!site)return source+"\nexport {nativeInkGeometry,nativeInkMaterial} from './native-render.mjs';\nexport {NativeInkMesh} from './native-ink-chunks.mjs';\n";
 const position=marker=>{const at=source.indexOf(marker);assert.ok(at>=0&&at===source.lastIndexOf(marker),marker);return at;};
 const functionBefore=marker=>[...source.slice(0,position(marker)).matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].at(-1)[1];
 const classes=[...source.slice(0,position('native-game-ink')).matchAll(/\bvar\s+([A-Za-z_$][\w$]*)=class\s+extends\b/g)];
 assert.ok(classes.length);
 return source+'\nexport{'+classes.at(-1)[1]+' as NativeInkMesh,'+functionBefore('"nativeFaceSize",2')+' as nativeInkGeometry,'+functionBefore('native-ink-overlay-v')+' as nativeInkMaterial};\n';
}
const server=http.createServer((req,res)=>{
 try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/'){res.setHeader('content-type','text/html');return res.end('<!doctype html><style>body{margin:0;background:#222}</style><script type="importmap">{"imports":{"three":"/source/vendor/three/build/three.module.js","three/addons/":"/source/vendor/three/jsm/"}}</script>');}
  const rel=pathname.replace(/^\/source\//,'');
  if(!pathname.startsWith('/source/')||rel.includes('..'))throw Error('invalid path');
  const original=path.join(root,/^(src|vendor)\//.test(rel)?'inkwave-public':'',rel);
  const built=site&&path.join(path.resolve(site),rel);
  // Source conversion is a fixture input builder; rendered game owners use the emitted files.
  const input=built&&fs.existsSync(built)?built:original;
  if(site&&input===original)assert.ok(/native-stages\/runtime\/source-(convert|catalog|placement)\.mjs$/.test(rel),'missing emitted game owner: '+rel);
  let data=fs.readFileSync(input);
  if(site&&input===built)assert.equal(createHash('sha256').update(data).digest('hex'),build.artifacts[rel],rel+' differs from build manifest');
  if(/\.m?js$/.test(input)&&!site)data=adaptBuildSource(rel,data.toString());
  if(rel==='patches/native-stages/runtime/engine.mjs')data=exposeRendering(data.toString());
  res.setHeader('content-type',input.endsWith('.json')?'application/json':'text/javascript');res.end(data);
 }catch(e){res.writeHead(404);res.end(String(e));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{})});
 const page=await browser.newPage({viewport:{width:1000,height:800},isMobile:process.argv.includes('--ipad'),hasTouch:process.argv.includes('--ipad')}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const result=[];
 for(const settings of [{ppm:3.2768,detail:false,id:'coarse-control'},{ppm:3.2768,detail:true,id:'detail'},{ppm:30,detail:false,id:'reference'},{ppm:3.2768,detail:true,id:'slope-detail',slope:.25}]){
  const row=await page.evaluate(async ({ppm,detail,id,slope=0})=>{
   const THREE=await import('three');
   const {G}=await import('/source/src/core/ctx.js');
   const {PaintSystem}=await import('/source/src/world/paint.js');
   const {NativeLevel,nativeInkGeometry,nativeInkMaterial,NativeInkMesh}=await import('/source/patches/native-stages/runtime/engine.mjs');
   const {convertSource}=await import('/source/patches/native-stages/runtime/source-convert.mjs');
   globalThis.cleanup?.();
   const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1000,800);document.body.replaceChildren(renderer.domElement);
   renderer.debug.onShaderError=(gl,program)=>{throw Error(gl.getProgramInfoLog(program));};
   renderer.setClearColor('#27303b');G.renderer=renderer;G.netm=null;G.teamColors=[new THREE.Color('#ff8a14'),new THREE.Color('#2f5bff')];
   const rows=['o Fld_Floor','usemtl Concrete00'];
   let count=0;
   for(const [left,right] of [[4,8],[8,12],...Array.from({length:24},(_,i)=>[40+i*16,48+i*16])]){
    const normal=new THREE.Vector3(0,1,-slope).normalize();
    for(const v of [[left,0,0],[left,8*slope,8],[right,0,0],[right,8*slope,8]])rows.push('v '+v.join(' '),'vn '+normal.toArray().join(' '));
    const [a,b,c,d]=[1,2,3,4].map(i=>`${count+i}//${count+i}`);rows.push(`f ${a} ${b} ${c}`,`f ${c} ${b} ${d}`);count+=4;
   }
   const data=convertSource({id:'roller-browser',bounds:{minX:4,maxX:440,minZ:0,maxZ:8},spawnPads:[[5,0,2],[11,0,6]],spawnBarrier:0},rows.join('\n'),'newmtl Concrete00\nKd 1 1 1\n',{});
   const level=G.level=new NativeLevel(data),paint=G.paint=new PaintSystem(renderer,level,{atlasSize:id==='reference'?2048:1024,maxDensity:ppm});
   paint.texture.generateMipmaps=false;paint.texture.minFilter=THREE.LinearFilter;
   const scene=G.scene=new THREE.Scene();
   scene.add(new THREE.HemisphereLight(0xffffff,0x718297,2));const sun=new THREE.DirectionalLight(0xffffff,2.5);sun.position.set(4,10,5);scene.add(sun);
   const geometry=nativeInkGeometry(level,paint),groundMaterial=new THREE.MeshBasicMaterial({color:'#79828b'}),ground=new THREE.Mesh(geometry,groundMaterial);scene.add(ground);
   const material=nativeInkMaterial(paint,null,null);paint.nativeDetail.enabled=detail;
   const ink=new NativeInkMesh(geometry,material).bindPaint(paint,{knownEmpty:true});scene.add(ink);
   const camera=new THREE.OrthographicCamera(-5,5,4,-4,.1,30);camera.position.set(8,15,4);camera.up.set(0,0,-1);camera.lookAt(8,0,4);camera.updateMatrixWorld();G.camera=camera;
   paint.setView(camera.position);
   const reference=level.faces.find(f=>f.bounds[1][0]===8),direction=new THREE.Vector3(0,0,1);
   for(let n=0;n<39;n++){const z=1.5+n*.132;paint.splat(new THREE.Vector3(7.9,slope*z,z),2,0,{kind:'ink-contact',face:reference.id,seed:((n*37)%997)/997,instant:true,stretch:direction,stretchAmt:-.375});}
   paint.flush(0);
   const pixels=new Uint8Array(paint.size*paint.size*4);renderer.readRenderTargetPixels(paint.rt,0,0,paint.size,paint.size,pixels);
   let cpuGaps=0,gpuGaps=0,samples=0;
   for(let z=2;z<=6;z+=.25)for(let x=6.5;x<=9.25;x+=.125){
    const p=new THREE.Vector3(x,slope*z,z),face=level.faces.find(f=>x>=f.bounds[0][0]&&x<=f.bounds[1][0]);
    if(paint.sampleWorld(face.id,p)!==1)cpuGaps++;
    const rel=p.clone().sub(face.origin),a=face.atlas,u=Math.floor(a.x+a.pad+rel.dot(face.u)*a.ppm),v=Math.floor(a.y+a.pad+rel.dot(face.v)*a.ppm);
    if(pixels[(v*paint.size+u)*4+3]<128)gpuGaps++;samples++;
   }
   renderer.render(scene,camera);
   const gl=renderer.getContext(),glError=gl.getError();
   // Exercise the same fixed-function mask used by the native offscreen frame.
   const stencil=new THREE.WebGLRenderTarget(1000,800,{stencilBuffer:true});
   renderer.setRenderTarget(stencil);renderer.render(scene,camera);
   const stencilPixels=new Uint8Array(1000*800*4);renderer.readRenderTargetPixels(stencil,0,0,1000,800,stencilPixels);
   let stencilGaps=0;
   for(let z=2;z<=6;z+=.25)for(let x=6.5;x<=9.25;x+=.125){
    const p=new THREE.Vector3(x,slope*z,z).project(camera),px=Math.floor((p.x*.5+.5)*1000),py=Math.floor((p.y*.5+.5)*800),i=(py*1000+px)*4;
    if(stencilPixels[i]<=stencilPixels[i+2])stencilGaps++;
   }
   renderer.setRenderTarget(null);stencil.dispose();
   if(stencilGaps)throw Error('native stencil clipped interior ink: '+stencilGaps);
   const maskOf=bytes=>{const mask=new Uint8Array(bytes.length/4);for(let i=0;i<mask.length;i++)mask[i]=bytes[i*4]>180&&bytes[i*4+1]>70&&bytes[i*4+2]<70?1:0;return mask;};
   const initialFrame=new Uint8Array(1000*800*4);gl.readPixels(0,0,1000,800,gl.RGBA,gl.UNSIGNED_BYTE,initialFrame);
   const initialMask=maskOf(initialFrame);
   let replayed=false;
   if(detail){
    const old=[...paint.nativeDetail.pages.values()].find(p=>p.x===0&&p.z===-8);
    for(let i=0;i<24;i++){
      const x=44+i*16,f=level.faces.find(f=>x>f.bounds[0][0]&&x<f.bounds[1][0]);
      paint.splat(new THREE.Vector3(x,4*slope,4),1,0,{kind:'ink-contact',face:f.id,seed:.2,instant:true,stretch:direction,stretchAmt:0});
      paint.setView(new THREE.Vector3(x,15,4));paint.flush(0);
    }
    if(old.slot>=0)throw Error('detail page was not evicted');
    paint.setView(camera.position);for(let n=0;n<8;n++)paint.flush(0);
    if(old.slot<0||!old.ready)throw Error('detail page did not replay');
    replayed=true;
   }
   renderer.render(scene,camera);
   const frame=new Uint8Array(1000*800*4);gl.readPixels(0,0,1000,800,gl.RGBA,gl.UNSIGNED_BYTE,frame);
   const mask=maskOf(frame);
   let replayDifference=0,replayUnion=0,referenceIoU=null;
   if(detail){
    for(let i=0;i<mask.length;i++){replayDifference+=mask[i]!==initialMask[i]?1:0;replayUnion+=mask[i]|initialMask[i];}
    // Moving the same samples to a different tile can change edge rounding by
    // a pixel. Reject a changed shape rather than demand byte-identical shading.
    if(replayDifference>replayUnion*.0005)throw Error('detail replay changed the silhouette: '+replayDifference);
   }
   if(id==='detail')globalThis.nativeDetailMask=mask;
   if(id==='reference'){
    let intersection=0,union=0;for(let i=0;i<mask.length;i++){intersection+=mask[i]&globalThis.nativeDetailMask[i];union+=mask[i]|globalThis.nativeDetailMask[i];}
    referenceIoU=intersection/union;
   }
   const edges=[];
   for(let y=200;y<600;y++){let edge=-1;for(let x=230;x<410;x++){const i=(y*1000+x)*4;if(frame[i]>180&&frame[i+1]>70&&frame[i+2]<70){edge=x;break;}}if(edge<0)throw Error('missing rendered ink');edges.push(edge);}
   const edgeVariation=edges.slice(1).reduce((n,x,i)=>n+Math.abs(x-edges[i]),0);
   if(gl.getError())throw Error('GL error after native detail/stencil render');
   globalThis.cleanup=()=>{ink.dispose();material.dispose();geometry.dispose();groundMaterial.dispose();paint.dispose();renderer.dispose();};
   return {id,requestedPpm:ppm,ppm:paint.ppm,cpuGaps,gpuGaps,stencilGaps,samples,glError,faces:level.faces.length,draws:renderer.info.render.calls,edgeVariation,replayed,replayDifference,referenceIoU,detailPages:paint.nativeDetail.slots.filter(Boolean).length,detailBytes:1024*1024*4};
  },settings);
  result.push(row);await page.screenshot({path:path.join(out,`native-${settings.id}.png`)});
  if(row.cpuGaps||row.gpuGaps||row.glError)throw Error('paint failure '+JSON.stringify(row));
 }
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({renderer:engine==='webkit'?'Playwright WebKit':'Chromium / SwiftShader',contentHash:build?.contentHash??null,scope:'Real composed/emitted paint and native ink overlay; synthetic coplanar source geometry, not an original stage asset or retail capture.',result,errors},null,2));
 assert.ok(result[1].edgeVariation>result[0].edgeVariation*2,'detail restores the contour on a crowded-atlas density');
 assert.ok(Math.abs(result[1].edgeVariation-result[2].edgeVariation)<=result[2].edgeVariation*.2,'detail follows the ordinary-resolution contour');
 assert.ok(result[2].referenceIoU>.995,'detail retains the original 30ppm silhouette');
 if(errors.length)throw Error(errors.join('\n'));
 console.log(JSON.stringify({result,errors}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
