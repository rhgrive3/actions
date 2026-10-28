// Controlled emitted-component load/render smoke; no gameplay/input or retail claim.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const {chromium}=createRequire('/workspace/actions/package.json')('playwright');
const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const result={kind:'controlled real-WebGL emitted component smoke, no gameplay/input/retail acceptance',contentHash:manifest.contentHash,inputHash:manifest.inputHash,chromiumSandbox:true,verified:[],errors:[],requests:[]};
const html=`<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script><canvas></canvas><script type="module">
import * as THREE from 'three';
import {InkVolumes} from '/patches/local-quality/ink-volume/runtime.mjs';
import {loadVolumePack,HISSEN_FALLBACK_VOLUME_URL} from '/patches/local-quality/ink-volume/pack.mjs';
try {
 const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:false});renderer.setSize(128,128);renderer.setClearColor(0,0);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1,.1,100);camera.position.set(0,0,4);camera.lookAt(0,0,0);
 const engine=new InkVolumes(scene,{sunDir:new THREE.Vector3(0,1,1).normalize(),sunCol:new THREE.Color('white'),sky:new THREE.Color('gray'),ground:new THREE.Color('gray')},{capacity:128,triangleBudget:60000});
 const pack=await loadVolumePack(HISSEN_FALLBACK_VOLUME_URL);engine.register('hissen-fallback',pack);
 const asset=engine.assets.get('hissen-fallback'),released=new Map();for(const r of asset.resources)r.addEventListener('dispose',()=>released.set(r,(released.get(r)||0)+1));
 const target=new THREE.WebGLRenderTarget(128,128),pixels=new Uint8Array(128*128*4),source={age:5/60,pos:new THREE.Vector3(),vel:new THREE.Vector3(0,0,1),owner:{color:new THREE.Color('#ff8800')}};
 let nonzero=0;for(let i=0;i<4;i++){engine.begin(camera);if(!engine.submit('hissen-fallback',source,1))throw Error('contour submission rejected');engine.end();renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,128,128,pixels);}
 for(let i=0;i<pixels.length;i+=4)if(pixels[i]||pixels[i+1]||pixels[i+2])nonzero++;
 const gl=renderer.getContext(),glError=gl.getError(),metrics={...engine.metrics},gpu={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
 if(!nonzero||glError||metrics.active!==1||metrics.triangles>5852)throw Error('render acceptance failed:'+JSON.stringify({nonzero,glError,metrics}));
 const resources=asset.resources.length;engine.dispose();const disposedOnce=asset.resources.every(r=>released.get(r)===1);target.dispose();renderer.dispose();
 if(!disposedOnce||engine.metrics.bytes!==0||scene.children.length)throw Error('component resources not released exactly once');
 window.smoke={status:'passed',nonzeroPixels:nonzero,glError,metrics,gpu,resources,disposedOnce,bytesAfterDispose:engine.metrics.bytes};
}catch(error){window.smoke={status:'failed',error:error.stack||String(error)};}
</script>`;
const mime={'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.gz':'application/octet-stream','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/__hissen-smoke.html'){res.setHeader('content-type','text/html');res.end(html);return;}const file=path.resolve(site,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const pending=new Set();
try {
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',chromiumSandbox:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader','--unsafely-disable-devtools-self-xss-warnings']});result.browser=browser.version();
 const page=await browser.newPage({viewport:{width:256,height:256}});page.on('pageerror',e=>result.errors.push(e.message));
 page.on('response',response=>{const rel=new URL(response.url()).pathname.slice(1);if(!manifest.artifacts[rel])return;const work=(async()=>{const bytes=await response.body();if(hash(bytes)!==manifest.artifacts[rel])throw Error('served artifact mismatch:'+rel);result.verified.push(rel);result.requests.push({path:rel,bytes:bytes.length});})();pending.add(work);work.catch(e=>result.errors.push(e.message)).finally(()=>pending.delete(work));});
 await page.goto('http://127.0.0.1:'+server.address().port+'/__hissen-smoke.html');await page.waitForFunction(()=>window.smoke,{timeout:60000});result.render=await page.evaluate(()=>window.smoke);await Promise.all([...pending]);
 result.status=result.render.status==='passed'&&!result.errors.length?'passed':'failed';
}catch(error){result.status='failed';result.error=error.stack||String(error);}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));result.closed=true;fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({status:result.status,render:result.render,error:result.error,verified:result.verified.length,errors:result.errors}));if(result.status!=='passed')process.exitCode=1;
