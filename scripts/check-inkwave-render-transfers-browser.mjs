// Local WebGL proof for the actual composed ring methods/shaders. This is a
// renderer/transfer regression, not a whole-game or physical-device FPS test.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { ringFixtureSource } from '../patches/local-quality/tests/render-transfer-fixture.mjs';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const out=path.resolve(process.argv[2]||'.browser-evidence/render-transfers.json');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const server=http.createServer((req,res)=>{
  if(req.url==='/favicon.ico'){res.statusCode=204;res.end();return;}
  if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/inkwave-public/vendor/three/build/three.module.js"}}</script>');return;}
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;res.end();return;}
  res.setHeader('content-type','text/javascript');fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.INKWAVE_CHROMIUM?{executablePath:process.env.INKWAVE_CHROMIUM}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:256,height:256}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  const result=await page.evaluate(async({baseline,optimized})=>{
    const THREE=await import('three');
    const stream=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    const a=new (new Function('THREE','rand',baseline)(THREE,stream(90210)))(300);
    const b=new (new Function('THREE','rand',optimized)(THREE,stream(90210)))(300);
    const r=new THREE.WebGLRenderer({antialias:false});r.setSize(256,256);r.setClearColor(0x19212b,1);r.debug.checkShaderErrors=true;
    const gl=r.getContext(),info=gl.getExtension('WEBGL_debug_renderer_info');
    let transferBytes=0,transferCalls=0;
    const sub=gl.bufferSubData.bind(gl);
    gl.bufferSubData=function(target,offset,src,srcOffset,length){
      if(target===gl.ARRAY_BUFFER){transferBytes+=(length??src.length-(srcOffset||0))*src.BYTES_PER_ELEMENT;transferCalls++;}
      return sub(...arguments);
    };
    const target=new THREE.WebGLRenderTarget(256,256),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1,.01,50);
    camera.position.set(0,7,8);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    const render=f=>{scene.clear();scene.add(f.root);r.setRenderTarget(target);r.render(scene,camera);};
    const pixels=()=>{const p=new Uint8Array(256*256*4);r.readRenderTargetPixels(target,0,0,256,256,p);return p;};
    const captures=[],totals={baseline:{bytes:0,uploads:0,draws:0},optimized:{bytes:0,uploads:0,draws:0}};
    let compared=0,maxDiff=0,differentPixels=0;
    function pair(label){
      transferBytes=transferCalls=0;render(a);const ap=pixels(),ac=r.info.render.calls;
      totals.baseline.bytes+=transferBytes;totals.baseline.uploads+=transferCalls;totals.baseline.draws+=ac;
      transferBytes=transferCalls=0;render(b);const bp=pixels(),bc=r.info.render.calls;
      totals.optimized.bytes+=transferBytes;totals.optimized.uploads+=transferCalls;totals.optimized.draws+=bc;
      let count=0,diff=0;for(let i=0;i<ap.length;i++){const d=Math.abs(ap[i]-bp[i]);if(d)count++;diff=Math.max(diff,d);}
      compared++;maxDiff=Math.max(maxDiff,diff);differentPixels+=count;
      if(label)captures.push({label,maxByteDifference:diff,differentChannels:count,baselineDraws:ac,optimizedDraws:bc,instances:b.rings.geo.instanceCount});
    }
    for(let i=0;i<300;i++)for(const f of [a,b])f._ringRaw(new THREE.Vector3((i%20-9.5)*.3,.01*(i%3),(Math.floor(i/20)-7)*.3),new THREE.Vector3(i%5===0?.2:0,1,i%7===0?.3:0),new THREE.Color(i%2?.9:.15,.2,i%2?.1:.95),.25,10,i%8,.8,1);
    a._updateRings(0);b._updateRings(0);render(a);render(b);
    for(let i=0;i<120;i++){
      a._updateRings(1/60);b._updateRings(1/60);pair(i%30===0?'steady '+i:null);
    }
    const steady=JSON.parse(JSON.stringify(totals));
    for(const k of Object.keys(totals))for(const n of Object.keys(totals[k]))totals[k][n]=0;
    const rnd=stream(31812);
    for(let frame=0;frame<180;frame++){
      if(frame%43===0){a.clear();b.clear();}
      for(let n=0;n<(frame%17===0?340:3);n++){
        const p=new THREE.Vector3((rnd()-.5)*6,rnd()*.2,(rnd()-.5)*6),normal=new THREE.Vector3(rnd()-.5,rnd(),rnd()-.5),col=new THREE.Color(rnd(),rnd(),rnd()),style=Math.floor(rnd()*8),life=.04+rnd()*1.5;
        for(const f of [a,b])f._ringRaw(p,normal,col,.2+rnd()*0,life,style,.75,1,.02,0,-.01);
      }
      const markN=frame%11===0?48:3;
      for(let n=0;n<markN;n++){
        const p=new THREE.Vector3((rnd()-.5)*5,.05,(rnd()-.5)*5),col=new THREE.Color(rnd(),rnd(),rnd());
        for(const f of [a,b])f.mark(p,new THREE.Vector3(0,1,0),col,.4,n%8,.8,.2,1,.3);
      }
      a._updateRings(1/60);b._updateRings(1/60);
      if(frame%5===0)pair('mixed '+frame);
      if(frame===90){a.rings.geo.dispose();b.rings.geo.dispose();}
    }
    const contextRenderer=info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
    const glError=gl.getError();
    a.rings.geo.dispose();b.rings.geo.dispose();a.rings.mesh.material.dispose();b.rings.mesh.material.dispose();target.dispose();r.dispose();r.forceContextLoss();
    return {contextRenderer,steady,mixed:totals,captures,compared,maxDiff,differentPixels,glError};
  },{baseline:ringFixtureSource(false),optimized:ringFixtureSource(true)});
  assert.equal(result.maxDiff,0);assert.equal(result.differentPixels,0);assert.equal(result.glError,0);assert.deepEqual(errors,[]);
  assert.equal(result.steady.baseline.bytes,2304000);assert.equal(result.steady.optimized.bytes,1152000);
  assert.equal(result.steady.baseline.draws,result.steady.optimized.draws);
  const report={status:'passed',browser:browser.version(),scope:'Actual source ring simulation, shaders and geometry in Chromium WebGL2/SwiftShader; native bufferSubData instrumentation and completed RGBA8 readback. No iPad/hardware FPS claim.',...result,errors};
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,compared:result.compared,maxDiff:result.maxDiff,steady:result.steady,mixed:result.mixed}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
