// Browser regression: painted floor must stay painted near the camera when one
// physical floor is split into source charts a few millimetres apart.
// Synthetic source triangles; the real composed paint, detail pages and ink shaders.
// Chart A (y=0) and chart B (y=+2.6 mm) share one 8 m detail cell. Sixteen other
// painted pages are made resident first, so a page that holds only chart A's
// ink is resident while chart B is painted. The ink over chart B must render.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {adaptBuildSource} from './inkwave-source-composition.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const out=path.resolve(arg('--evidence-dir','.browser-evidence/native-detail-planes'));
const executablePath=arg('--chromium',process.env.CHROMIUM_PATH||'/usr/bin/chromium');
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/'){res.setHeader('content-type','text/html');return res.end('<!doctype html><style>body{margin:0;background:#222}</style><script type="importmap">{"imports":{"three":"/source/vendor/three/build/three.module.js","three/addons/":"/source/vendor/three/jsm/"}}</script>');}
  const rel=pathname.replace(/^\/source\//,'');
  if(!pathname.startsWith('/source/')||rel.includes('..'))throw Error('invalid path');
  const input=path.join(root,/^(src|vendor)\//.test(rel)?'inkwave-public':'',rel);
  let data=fs.readFileSync(input);
  if(/\.m?js$/.test(input))data=adaptBuildSource(rel,data.toString());
  if(rel==='patches/native-stages/runtime/engine.mjs')data+="\nexport {nativeInkGeometry,nativeInkMaterial} from './native-render.mjs';\nexport {NativeInkMesh} from './native-ink-chunks.mjs';\n";
  res.setHeader('content-type',input.endsWith('.json')?'application/json':'text/javascript');res.end(data);
 }catch(e){res.writeHead(404);res.end(String(e));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:800,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const rows=[];
 for(const detail of [false,true]){
  rows.push(await page.evaluate(async detail=>{
   const THREE=await import('three');
   const {G}=await import('/source/src/core/ctx.js');
   const {PaintSystem}=await import('/source/src/world/paint.js');
   const {NativeLevel,nativeInkGeometry,nativeInkMaterial,NativeInkMesh}=await import('/source/patches/native-stages/runtime/engine.mjs');
   const {convertSource}=await import('/source/patches/native-stages/runtime/source-convert.mjs');
   globalThis.cleanup?.();
   const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(800,800);document.body.replaceChildren(renderer.domElement);
   renderer.debug.onShaderError=(gl,program)=>{throw Error(gl.getProgramInfoLog(program));};
   renderer.setClearColor('#27303b');G.renderer=renderer;G.netm=null;G.teamColors=[new THREE.Color('#ff8a14'),new THREE.Color('#2f5bff')];
   const obj=[];let count=0;
   const quad=(name,x0,x1,z0,z1,y)=>{obj.push('o '+name,'usemtl Concrete00');for(const v of [[x0,y,z0],[x0,y,z1],[x1,y,z0],[x1,y,z1]])obj.push('v '+v.join(' '),'vn 0 1 0');
    const [a,b,c,d]=[1,2,3,4].map(i=>`${count+i}//${count+i}`);obj.push(`f ${a} ${b} ${c}`,`f ${c} ${b} ${d}`);count+=4;};
   quad('Fld_FloorA',1,4,1,7,0);quad('Fld_FloorB',4,7,1,7,.0026);
   for(let k=1;k<=15;k++)quad('Fld_Plate'+k,1,7,9,15,.02*k);
   const data=convertSource({id:'detail-planes',bounds:{minX:0,maxX:8,minZ:0,maxZ:16},spawnPads:[[1,0,1],[7,0,15]],spawnBarrier:0},obj.join('\n'),'newmtl Concrete00\nKd 1 1 1\n',{});
   const level=G.level=new NativeLevel(data),paint=G.paint=new PaintSystem(renderer,level,{atlasSize:1024,maxDensity:3.2768});
   paint.texture.generateMipmaps=false;paint.texture.minFilter=THREE.LinearFilter;
   const scene=G.scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x718297,2));
   const geometry=nativeInkGeometry(level,paint),groundMaterial=new THREE.MeshBasicMaterial({color:'#79828b'}),ground=new THREE.Mesh(geometry,groundMaterial);scene.add(ground);
   const material=nativeInkMaterial(paint,null,null);paint.nativeDetail.enabled=detail;
   const ink=new NativeInkMesh(geometry,material).bindPaint(paint,{knownEmpty:true});scene.add(ink);
   const camera=new THREE.OrthographicCamera(-4,4,4,-4,.1,30);camera.position.set(4,10,4);camera.up.set(0,0,-1);camera.lookAt(4,0,4);camera.updateMatrixWorld();G.camera=camera;
   paint.setView(camera.position);
   const faceAt=(x,z,y)=>level.faces.find(f=>f.n.y>.9&&Math.abs(f.origin.y-y)<.001&&x>f.bounds[0][0]&&x<f.bounds[1][0]&&z>f.bounds[0][2]&&z<f.bounds[1][2]);
   const stamp=(x,z,y,seed)=>paint.splat(new THREE.Vector3(x,y,z),1.2,0,{kind:'ink-contact',face:faceAt(x,z,y).id,seed,instant:true});
   for(let z=2;z<=6;z+=1)stamp(2.4,z,0,z/9);
   for(let k=1;k<=15;k++)stamp(4,12,.02*k,k/17);
   for(let n=0;n<8;n++)paint.flush(0);
   const resident=paint.nativeDetail.slots.filter(Boolean).length;
   for(let z=2;z<=6;z+=1)stamp(5.6,z,.0026,z/11);
   for(let n=0;n<8;n++)paint.flush(0);
   renderer.render(scene,camera);
   const gl=renderer.getContext(),frame=new Uint8Array(800*800*4);gl.readPixels(0,0,800,800,gl.RGBA,gl.UNSIGNED_BYTE,frame);
   const inked=(x,z)=>{const p=new THREE.Vector3(x,0,z).project(camera),px=Math.floor((p.x*.5+.5)*800),py=Math.floor((p.y*.5+.5)*800),i=(py*800+px)*4;return frame[i]>180&&frame[i+1]>70&&frame[i+2]<70;};
   let a=0,b=0,n=0;for(let z=2.5;z<=5.5;z+=.25)for(let d=-.4;d<=.4;d+=.1){a+=inked(2.4+d,z);b+=inked(5.6+d,z);n++;}
   const cpuB=paint.sampleWorld(faceAt(5.6,4,.0026).id,new THREE.Vector3(5.6,.0026,4));
   globalThis.cleanup=()=>{ink.dispose();material.dispose();geometry.dispose();groundMaterial.dispose();paint.dispose();renderer.dispose();};
   return {detail,resident,chartAInked:a/n,chartBInked:b/n,cpuB,glError:gl.getError()};
  },detail));
  await page.screenshot({path:path.join(out,`detail-${detail?'on':'off'}.png`)});
 }
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({renderer:'Chromium / SwiftShader',scope:'Synthetic split source floor; real paint, detail and ink overlay shaders. Not an original stage asset or a retail capture.',rows,errors},null,2));
 console.log(JSON.stringify({rows,errors}));
 if(errors.length)throw Error(errors.join('\n'));
 const [coarse,fine]=rows;
 assert.equal(fine.resident,16,'sixteen pages are resident before chart B is painted');
 for(const row of rows){assert.equal(row.cpuB,1,'chart B holds team ink');assert.equal(row.glError,0);assert.ok(row.chartAInked>.9,'chart A ink renders');}
 assert.ok(coarse.chartBInked>.9,'the coarse atlas shows chart B ink');
 assert.ok(fine.chartBInked>.9,'chart B ink stays visible with resident detail pages: '+fine.chartBInked);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
