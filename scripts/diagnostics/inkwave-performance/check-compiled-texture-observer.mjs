import fs from 'node:fs';import http from 'node:http';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';import {installCompiledTextureReceipts} from '../../lib/inkwave-compiled-texture-receipts.mjs';
const arg=(name,def)=>{const i=process.argv.indexOf(name);return i<0?def:process.argv[i+1];};
const {chromium}=await import(pathToFileURL(path.resolve(arg('--playwright','node_modules/playwright/index.mjs'))).href);
const site=path.resolve(arg('--site')),reportFile=path.resolve(arg('--out')),chromiumPath=arg('--chromium'),manifest=JSON.parse(fs.readFileSync(site+'/inkwave-build.json')),base='/_versions/'+manifest.build.revision+'/',receipts=new Set(),hash=b=>createHash('sha256').update(b).digest('hex');
const html='<!doctype html><script type="importmap">'+JSON.stringify({imports:{three:base+'vendor/three/build/three.module.js'}})+'</script>';
const server=http.createServer((req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname;if(name==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}if(name==='/favicon.ico'){res.writeHead(204);res.end();return;}const key=name.slice(1),file=path.resolve(site,key);assert(file.startsWith(site+'/'));const bytes=fs.readFileSync(file);assert.equal(hash(bytes),manifest.artifacts[key]);receipts.add(key);res.setHeader('Content-Type','text/javascript');res.end(bytes);}catch(e){res.writeHead(404);res.end(String(e));}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({executablePath:chromiumPath,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/');
 await page.evaluate('window.installTextures='+installCompiledTextureReceipts.toString());
 const result=await page.evaluate(async()=>{
  const T=await import('three'),r=new T.WebGLRenderer({antialias:false}),gl=r.getContext();r.setSize(8,8);
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;
  const geo=new T.PlaneGeometry(2,2),target=new T.WebGLRenderTarget(4,4,{type:T.HalfFloatType,depthBuffer:false});
  const control=new T.MeshBasicMaterial({color:0x5588aa}),mesh=new T.Mesh(geo,control);scene.add(mesh);r.setRenderTarget(target);r.render(scene,camera);r.setRenderTarget(null);
  const textures={dfgLUT:new T.DataTexture(Uint16Array.of(0x3800,0x3400),1,1,T.RGFormat,T.HalfFloatType),s3Ring:new T.DataTexture(Uint8Array.of(128),1,1,T.RedFormat),s3Splash:new T.DataTexture(Uint8Array.of(64),1,1,T.RedFormat),uMainInkProfiles:new T.DataTexture(Float32Array.of(.25,.5,.75,1),1,1,T.RGBAFormat,T.FloatType),tLens:target.texture};
  for(const t of Object.values(textures))if(t!==target.texture)t.needsUpdate=true;
  const uniforms=Object.fromEntries(Object.entries(textures).map(([k,t])=>[k,{value:t}]));
  // Supply these through onBeforeCompile, not Material.uniforms.
  const mat=new T.MeshPhysicalMaterial();
  mat.onBeforeCompile=shader=>{shader.vertexShader='varying vec2 coord;void main(){coord=uv;gl_Position=vec4(position,1.);}';shader.fragmentShader='varying vec2 coord;'+Object.keys(textures).map(k=>'uniform sampler2D '+k+';').join('')+'void main(){vec4 a='+Object.keys(textures).map(k=>'texture2D('+k+',coord)').join('+')+';gl_FragColor=vec4(a.rgb*.15,1.);}';Object.assign(shader.uniforms,uniforms);};mesh.material=mat;
  const read=()=>{const a=new Uint8Array(8*8*4);gl.readPixels(0,0,8,8,gl.RGBA,gl.UNSIGNED_BYTE,a);return [...a];};
  r.render(scene,camera);const native=read();gl.pixelStorei(gl.PACK_ALIGNMENT,8);const before=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),original=r.renderBufferDirect;
  const probe=window.installTextures({renderer:r});r.render(scene,camera);const observed=read(),receipts=await probe.stop();
  if(gl.getParameter(gl.READ_FRAMEBUFFER_BINDING)!==before||gl.getParameter(gl.PACK_ALIGNMENT)!==8||r.renderBufferDirect!==original||gl.getError())throw Error('Compiled observer changed native GL state');
  r.render(scene,camera);const restored=read();if(JSON.stringify(native)!==JSON.stringify(observed)||JSON.stringify(native)!==JSON.stringify(restored)||gl.getError())throw Error('Compiled observer changed pixels');
  for(const t of Object.values(textures))if(t!==target.texture)t.dispose();target.dispose();geo.dispose();mat.dispose();control.dispose();r.dispose();r.forceContextLoss();
  return {receipts,control:{nativeObservedExact:true,nativeRestoredExact:true,rgba:native},hiddenSourceUniforms:Object.keys(mat.uniforms||{})};
 });
 assert.deepEqual(errors,[]);assert.deepEqual(result.receipts.missing,[]);assert.deepEqual(result.hiddenSourceUniforms,[]);assert.equal(result.receipts.textures.length,5);
 for(const t of result.receipts.textures){assert.ok(t.gpu.sha256,'Missing native GPU texture receipt: '+JSON.stringify(t));assert.notEqual(t.gpu.sha256,hash(Buffer.alloc(t.gpu.byteLength)));}
 const report={status:'passed',preflightHarnessSha256:hash(fs.readFileSync(new URL(import.meta.url))),contentHash:manifest.contentHash,browser:browser.version(),collectorSha256:hash(Buffer.from(installCompiledTextureReceipts.toString())),scope:'Hidden onBeforeCompile uniforms, actual R8/RG16F/RGBA32F/RGBA16F GPU texture color reads and native/observed/restored pixel control; no gameplay or benchmark acceptance',result,receipts:[...receipts]};
 fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,textures:result.receipts.textures.length}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
