import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright';
import {adaptWorldNative20261029} from '../patches/local-quality/queue-world-native-20261029-adapter.mjs';
const root=path.resolve(new URL('..',import.meta.url).pathname),output=path.join(root,'reports/queue-world-native-20261029');fs.mkdirSync(output,{recursive:true});
const source=JSON.parse(fs.readFileSync(path.join(root,'patches/local-quality/tests/fixtures/queue-world-native-composed-before-20261029.json')))['src/world/environment.js'];
const after=adaptWorldNative20261029('src/world/environment.js',source);
function shaders(s){
 const names=['GLSL_NOISE','GLSL_SKY_COMMON','GLSL_DECK','GLSL_SWELL','GLSL_SEA_MARINA','SEA_VERT','SEA_FRAG'];
 const definitions=names.map(name=>{const a=s.indexOf('const '+name+' ='),b=s.indexOf('`;',a);if(a<0||b<a)throw Error(name);return s.slice(a,b+2);}).join('\n');
 return new Function('const MAX_RECTS=32,MAX_WET=12,WATER_Y=-1.6;\n'+definitions+'\nreturn {vertex:SEA_VERT,fragment:SEA_FRAG};')();
}
const beforeShader=shaders(source),afterShader=shaders(after);
const initStart=source.indexOf('  _initUniforms() {'),initEnd=source.indexOf('\n  }',initStart);
const initBody=source.slice(source.indexOf('{',initStart)+1,initEnd).replace('    this._writeRects();','');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/favicon.ico'){res.writeHead(204).end();return;}
 if(pathname==='/'){res.setHeader('content-type','text/html');res.end('<html><body></body></html>');return;}
 const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{res.setHeader('content-type',file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/workspace/scratch/38167f88d8b3/tooling/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:300,height:300}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:'+server.address().port);
 const result=await page.evaluate(async({beforeShader,afterShader,initBody})=>{
  const THREE=await import('/inkwave-public/vendor/three/build/three.module.js');
  const r=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});r.setSize(256,256);document.body.appendChild(r.domElement);
  const env={};new Function('THREE','MAX_RECTS','MAX_WET',initBody).call(env,THREE,32,12);const U=env.U;
  const {makeWaveData}=await import('/inkwave-public/src/world/wave-data.js');
  const wave=new THREE.DataTexture(makeWaveData(256,11),256,256);wave.wrapS=wave.wrapT=THREE.RepeatWrapping;wave.minFilter=THREE.LinearMipmapLinearFilter;wave.magFilter=THREE.LinearFilter;wave.generateMipmaps=true;wave.anisotropy=8;wave.needsUpdate=true;
  const foam=new THREE.DataTexture(Uint8Array.from({length:64*64},(_,i)=>Math.min(255,Math.round(Math.hypot(i%64-32,(i/64|0)-32)*8))),64,64,THREE.RedFormat);foam.minFilter=foam.magFilter=THREE.LinearFilter;foam.generateMipmaps=false;foam.needsUpdate=true;
  const blank=new THREE.DataTexture(new Uint8Array([60,90,120,0]),1,1);blank.needsUpdate=true;
  U.uWaveTex.value=wave;U.uFoamTex.value=foam;U.uCloudTex.value=blank;U.uReflTex.value=blank;
  U.uFoamRect.value.set(-20,-20,1/40,1/40);U.uArena.value.set(0,0,20,20);U.uMarinaK.value.set(.55,1,2,8);
  U.uSunDir.value.set(.5,.6,-.4).normalize();U.uHaze.value.set(1/1850,.9,260,0);U.uGlowParams.value.set(900,.9,7,.06);U.uCloudParams.value.set(.44,1,1,.5);
  const palette={uZenith:0x1d6fdc,uSkyMid:0x5aa8f2,uHorizon:0xd4ecfa,uGround:0x6fa4bd,uSeaDeep:0x0a4f8a,uSeaShallow:0x12a7b8,uSeaCrest:0x48e2d6,uFoamColor:0xf7fcff,uSunLight:0xfff0dc,uSeaAmbient:0x9baec8,uChannelCol:0x0b4552,uShadeCol:0x05121a};
  for(const [name,value] of Object.entries(palette))U[name].value.setHex(value);
  const rt=new THREE.WebGLRenderTarget(256,256),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1,.01,10000);
  const geometry=new THREE.PlaneGeometry(12000,12000,32,32);geometry.rotateX(-Math.PI/2);
  const mesh=new THREE.Mesh(geometry);mesh.frustumCulled=false;mesh.position.y=-1.6;scene.add(mesh);
  const cases=[];let nonzero=0;
  for(const marina of [false,true])for(const dist of [5.99,6,6.01,39.99,40,40.01,100,1000])for(const time of [0,5.5]){
   const pixels=[];camera.position.set(12,-1.6+dist*.35,dist*Math.sqrt(1-.35*.35));camera.lookAt(12,-1.6,0);camera.updateMatrixWorld();U.uTime.value=time;
   for(const shaders of [beforeShader,afterShader]){
    const mat=new THREE.ShaderMaterial({uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.lights),...U},vertexShader:shaders.vertex,fragmentShader:shaders.fragment,lights:true,defines:marina?{MARINA:''}:{}});mesh.material=mat;r.setRenderTarget(rt);r.render(scene,camera);const p=new Uint8Array(256*256*4);r.readRenderTargetPixels(rt,0,0,256,256,p);pixels.push(p);mat.dispose();
   }
   let changed=0,max=0,total=0;for(let i=0;i<pixels[0].length;i++){if(i%4===3)continue;const d=Math.abs(pixels[0][i]-pixels[1][i]);if(d)changed++;max=Math.max(max,d);total+=d;if(pixels[0][i])nonzero++;}
   cases.push({marina,dist,time,changedChannels:changed,maxChannelDifference:max,meanChannelDifference:total/(256*256*3)});
  }
  r.setRenderTarget(null);r.render(scene,camera);const png=r.domElement.toDataURL();
  return {cases,nonzero,glError:r.getContext().getError(),renderer:r.getContext().getParameter(r.getContext().RENDERER),png};
 },{beforeShader,afterShader,initBody});
 fs.writeFileSync(path.join(output,'sea-shader-after.png'),Buffer.from(result.png.split(',')[1],'base64'));delete result.png;
 const report={scope:'actual bundled Three.js full sea shader variants; Chromium SwiftShader WebGL2; actual deterministic wave texture and synthetic foam atlas; no physical-device or GPU-performance claim',...result,errors};
 fs.writeFileSync(path.join(output,'sea-shader-browser.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({cases:result.cases.length,maxDifference:Math.max(...result.cases.map(c=>c.maxChannelDifference)),nonzero:result.nonzero,errors,glError:result.glError}));
 if(errors.length||result.glError||!result.nonzero||result.cases.some(c=>c.maxChannelDifference>1))process.exitCode=1;
}finally{await browser?.close();server.close();}
