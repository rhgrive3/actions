import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import zlib from 'node:zlib';import assert from 'node:assert/strict';import {chromium} from 'playwright';
const root=path.resolve(new URL('../../../',import.meta.url).pathname),frozen=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('./fixtures/queue-visual-continuation-20261029-before.json.gz',import.meta.url))));
const server=http.createServer((req,res)=>{try{if(req.url==='/'){res.end('<!doctype html><link rel="icon" href="data:,">');return;}const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+'/'))throw Error();res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage(),browserErrors=[];page.on('pageerror',e=>browserErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')browserErrors.push(m.text());});await page.goto(origin);
 const old=frozen['special-vfx-kit.mjs'].replace(/from\s+(['"])(\.[^'"]+)\1/g,(_,q,p)=>'from '+JSON.stringify(new URL(p,origin+'/patches/splatoon3/runtime/').href));
 const result=await page.evaluate(async ({origin,old})=>{
  const T=await import(origin+'/inkwave-public/vendor/three/build/three.module.js'),A=await import('data:text/javascript;base64,'+btoa(unescape(encodeURIComponent(old)))),B=await import(origin+'/patches/splatoon3/runtime/special-vfx-kit.mjs');
  const renderer=new T.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(128,128);renderer.setClearColor(0x111111);renderer.toneMapping=T.NoToneMapping;
  const target=new T.WebGLRenderTarget(128,128),camera=new T.PerspectiveCamera(60,1,.1,100);renderer.setRenderTarget(target);renderer.render(new T.Scene(),camera);const background=new Uint8Array(4);renderer.readRenderTargetPixels(target,0,0,1,1,background);
  const names=['beams','inkBeams','shells','inkShells','bands','inkBands','discs','inkDiscs'];
  const make=API=>{const scene=new T.Scene(),parent=new T.Group();scene.add(parent);parent.position.set(127,3,2);const kit=new API.SpecialVfxKit(T,parent);return {scene,kit};};
  const worlds=[make(A),make(B)];let follows=[0,0];
  for(let i=0;i<2;i++)for(const name of names){const p=worlds[i].kit[name],v=[0,0,-8,1,.8,1,-8,1,1,.3,.4,.9,0,.2,.3,.4];if(name.toLowerCase().includes('shell'))v.splice(4,4,1,2,3,.5);if(name.toLowerCase().includes('band'))v.splice(4,4,1,2,.8,.5);if(name.toLowerCase().includes('disc'))v.splice(4,4,0,0,1,.5);p.add(3,v,()=>{follows[i]++;});}
  const rows=[];let diff=0;
  const draw=(world,x)=>{camera.position.x=x;camera.updateMatrixWorld();renderer.info.reset();renderer.render(world.scene,camera);const count=renderer.info.render.calls,pixels=new Uint8Array(128*128*4);renderer.readRenderTargetPixels(target,0,0,128,128,pixels);let nonbackground=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]!==background[0]||pixels[i+1]!==background[1]||pixels[i+2]!==background[2])nonbackground++;return {count,pixels,nonbackground};};
  for(const w of worlds){w.kit.update(1/60,camera);draw(w,0);w.kit.update(1/60,camera);}
  for(const [label,x] of [['visible',0],['outside',1000],['sameFrameReturn',0],['edge',4],['outsideAgain',-1000]]){
   const a=draw(worlds[0],x),b=draw(worlds[1],x);let mismatch=0;for(let i=0;i<a.pixels.length;i++)if(a.pixels[i]!==b.pixels[i])mismatch++;diff+=mismatch;rows.push({label,beforeCalls:a.count,afterCalls:b.count,differingChannels:mismatch,nonbackgroundPixels:a.nonbackground,firstPixel:Array.from(a.pixels.slice(0,4))});
  }
  // Same scene + new pass camera still evaluates from that pass's matrices.
  worlds[1].kit._restoreWarmMeshes();const restored=draw(worlds[1],1000);rows.push({label:'contextRestoreWarmHook',afterCalls:restored.count});
  const gl=renderer.getContext(),error=gl.getError();target.dispose();renderer.dispose();return {rows,background:Array.from(background),differingChannels:diff,followCalls:follows,glError:error};
 },{origin,old});
 result.browserErrors=browserErrors;result.browser=browser.version();result.scope='Actual Three.js WebGL2 draws, transformed scene parent, two alternating pass positions, callback and warmup preservation; SwiftShader not hardware performance.';
 fs.writeFileSync(process.env.VISUAL_POOLS_RECEIPT||'../continuation/visual/pools-webgl-receipt.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 assert.equal(result.glError,0);assert.equal(result.browserErrors.length,0);assert(result.rows[0].nonbackgroundPixels>0);assert.equal(result.differingChannels,0);assert.deepEqual(result.followCalls,[16,16]);
 for(const row of result.rows.filter(r=>r.label==='outside'||r.label==='outsideAgain')){assert.equal(row.beforeCalls,8);assert.equal(row.afterCalls,0);}
}finally{await browser.close();await new Promise(r=>server.close(r));}
