#!/usr/bin/env node
// Actual-browser source parity: selected optional packs and font-generation redraws.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const frozen='patches/local-quality/tests/fixtures/props-before-selected-packs.js.txt';
const baseline=fs.readFileSync(path.join(root,frozen));
const baselineHash='ae01fb9e56d093357ed6fb29fd4b1888d8486d609b571c0c984b22b6a5aa38d8';
assert.equal(crypto.createHash('sha256').update(baseline).digest('hex'),baselineHash,'independent frozen baseline changed');
const server=http.createServer((req,res)=>{try{
 let url=new URL(req.url,'http://localhost').pathname;
 if(url==='/'){res.setHeader('content-type','text/html');return res.end('<script type="importmap">{"imports":{"three":"/inkwave-public/vendor/three/build/three.module.js","three/addons/":"/inkwave-public/vendor/three/jsm/"}}</script>');}
 if(url==='/inkwave-public/src/world/props-before.js'){res.setHeader('content-type','text/javascript');return res.end(baseline);}
 if(url.startsWith('/inkwave-public/patches/'))url=url.replace('/inkwave-public/patches/','/patches/');
 if(url.startsWith('/src/'))url='/inkwave-public'+url;
 const file=path.resolve(root,'.'+decodeURIComponent(url));if(!file.startsWith(root+path.sep))throw Error('escape');
 res.setHeader('content-type',/\.woff2$/.test(file)?'font/woff2':/\.(m?js)$/.test(file)?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(file));
 }catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
const address='http://127.0.0.1:'+server.address().port;
const receipts=[];
try{
 const page=await browser.newPage();const requested=[];page.on('request',r=>requested.push(new URL(r.url()).pathname));await page.goto(address);
 receipts.push(await page.evaluate(async()=>{
  const C=await import('/inkwave-public/src/world/props-core.js'),P=await import('/inkwave-public/src/world/prop-packs.js');
  const {dressingFor}=await import('/inkwave-public/src/world/dressing.js');
  const before=C.PROP_TYPES.map(x=>x.type);await P.preparePropPacks('tidewater');
  const {NATIVE_IDS}=await import('/patches/native-stages/runtime/registry.mjs');
  for(const id of NATIVE_IDS){if(dressingFor(id).length!==0)throw Error('native placement inventory changed');await P.preparePropPacks(id);}
  if(JSON.stringify(before)!==JSON.stringify(C.PROP_TYPES.map(x=>x.type)))throw Error('native preparation registered unrelated props');
  return {scenario:'cold-tidewater',baseTypes:before,selectedTypes:C.PROP_TYPES.map(x=>x.type),placements:dressingFor('tidewater').length,nativeIds:NATIVE_IDS};
 }));
 assert(!requested.some(p=>/props-marina-(vessels|dock)\.js$|cargo\/props\.js$|world\/props\.js$|stages\/index\.js$/.test(p)),JSON.stringify(requested));
 receipts.push({scenario:'cold-request-graph',optionalBuilderRequests:[],requests:requested});
 // Failed and canceled preparation never register a partial pack.
 await page.route('**/cargo/props.js',route=>route.abort());
 receipts.push(await page.evaluate(async()=>{
  const C=await import('/inkwave-public/src/world/props-core.js'),P=await import('/inkwave-public/src/world/prop-packs.js');
  const before=JSON.stringify(C.PROP_TYPES);let rejected=false;try{await P.preparePropPacks('cargo')}catch{rejected=true}
  if(!rejected||before!==JSON.stringify(C.PROP_TYPES))throw Error('failed import changed registry');
  await P.preparePropPacks('halyard',()=>false);if(before!==JSON.stringify(C.PROP_TYPES))throw Error('canceled import changed registry');
  try{C.registerPropPacks([['failed-a',(D,H)=>{D.__transient={desc:'test'};H.spinTemplate('__transient',()=>null)}],['failed-b',()=>{throw Error('injected')}]]);throw Error('missing failure')}catch(e){if(e.message!=='injected')throw e}
  if(before!==JSON.stringify(C.PROP_TYPES))throw Error('failed registration changed registry');
  return {scenario:'failed-and-canceled-preparation',passed:true};
 }));
 await page.close();
 const actual=await browser.newPage();await actual.goto(address);
 receipts.push(await actual.evaluate(async()=>{
  const C=await import('/inkwave-public/src/world/props-core.js'),P=await import('/inkwave-public/src/world/prop-packs.js');
  const B=await import('/inkwave-public/src/world/props-before.js');const {dressingFor}=await import('/inkwave-public/src/world/dressing.js');
  const {G}=await import('/inkwave-public/src/core/ctx.js');G.settings={quality:'high'};G.game={mobile:{touch:false}};
  const hash=async array=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(array.buffer,array.byteOffset,array.byteLength)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const state=async kit=>Promise.all([...kit._meshes,...kit._inst].map(async m=>({name:m.name,count:m.count??1,material:m.material.type,castShadow:m.castShadow,
   attrs:Object.fromEntries(await Promise.all(Object.entries(m.geometry.attributes).map(async([name,a])=>[name,await hash(a.array)]))),index:m.geometry.index&&await hash(m.geometry.index.array)})));
  const results=[];
  for(const stage of ['tidewater','kelpline','halyard','cargo','range']){
   if(!await P.preparePropPacks(stage))throw Error('unexpected cancellation');
   const a=new B.PropKit(null),b=new C.PropKit(null),placements=dressingFor(stage);
   const ca=placements.flatMap(p=>a.add(p.type,p).colliders),cb=placements.flatMap(p=>b.add(p.type,p).colliders);a.build();b.build();
   if(JSON.stringify(ca)!==JSON.stringify(cb)||JSON.stringify(a.stats())!==JSON.stringify(b.stats())||JSON.stringify(await state(a))!==JSON.stringify(await state(b)))throw Error(stage+' world parity');
   a.update(1/60,2);b.update(1/60,2);
   const ia=await Promise.all(a._inst.map(m=>hash(m.instanceMatrix.array))),ib=await Promise.all(b._inst.map(m=>hash(m.instanceMatrix.array)));
   if(JSON.stringify(ia)!==JSON.stringify(ib))throw Error(stage+' animation parity');
   results.push({stage,placements:placements.length,colliders:ca.length,stats:a.stats()});a.dispose();b.dispose();
  }
  const full=await import('/inkwave-public/src/world/props.js');
  if(JSON.stringify(Object.keys(full))!==JSON.stringify(Object.keys(B))||full.PropKit!==C.PropKit||full.PALETTE!==C.PALETTE||JSON.stringify(full.PALETTE)!==JSON.stringify(B.PALETTE)||JSON.stringify(full.PROP_TYPES)!==JSON.stringify(B.PROP_TYPES))throw Error('public synchronous catalogue/order changed');
  for(let i=0;i<20;i++)for(const stage of ['tidewater','halyard','cargo','range','kelpline'])await P.preparePropPacks(stage);
  if(JSON.stringify(full.PROP_TYPES)!==JSON.stringify(B.PROP_TYPES))throw Error('duplicate registration');
  const before=JSON.stringify(C.PROP_TYPES);
  try{C.registerPropPacks([['failed-a',(D,H)=>{D.__transient={desc:'test'};H.spinTemplate('__transient',()=>null)}],['failed-b',()=>{throw Error('injected')}]]);throw Error('missing failure')}catch(e){if(e.message!=='injected')throw e}
  if(JSON.stringify(C.PROP_TYPES)!==before)throw Error('batch rollback');
  const probe=new C.PropKit(null,{headless:true});
  if(probe.add('__transient').colliders.length!==0||probe.count!==0||!probe._tplGeo('__transient').isBufferGeometry)throw Error('failed batch leaked definition/spinner');probe.dispose();
  try{C.registerPropPack('bad-override',D=>{D.bench={}});throw Error('missing override failure')}catch(e){if(!e.message.includes('overrides existing type'))throw e}
  return {scenario:'all-stage-geometry-collider-animation-and-catalogue-parity',results,registrationTransitions:100,rollbackControls:true};
 }));await actual.close();
 for(const mode of ['success','failure','unsupported']){
  const p=await browser.newPage();await p.goto(address);
  receipts.push(await p.evaluate(async mode=>{
   const NativeFontFace=FontFace,gates=[];let created=0;
   if(mode==='unsupported')globalThis.FontFace=undefined;
   else globalThis.FontFace=function(...args){const f=new NativeFontFace(...args);created++;f.load=()=>new Promise((resolve,reject)=>gates.push(async()=>{if(mode==='failure')reject(Error('font fault'));else{await NativeFontFace.prototype.load.call(f);resolve(f)}}));return f};
   const draws=new WeakMap(),setTransform=CanvasRenderingContext2D.prototype.setTransform;
   CanvasRenderingContext2D.prototype.setTransform=function(...args){draws.set(this.canvas,(draws.get(this.canvas)||0)+1);return setTransform.apply(this,args)};
   const B=await import('/inkwave-public/src/world/props-before.js'),C=await import('/inkwave-public/src/world/props-core.js');
   const {G}=await import('/inkwave-public/src/core/ctx.js');G.settings={quality:'high'};G.game={mobile:{touch:false}};
   const hash=async canvas=>{const a=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',a))].map(x=>x.toString(16).padStart(2,'0')).join('')};
   const same=async(a,b)=>{if(await hash(a.atlas.image)!==await hash(b.atlas.image))throw Error(mode+' atlas pixels changed')};
   const a=new B.PropKit(null),b=new C.PropKit(null),dead=new C.PropKit(null),deadImage=dead.atlas.image,deadDraws=draws.get(deadImage);dead.dispose();
   await same(a,b);const fallback=await hash(b.atlas.image);
   await Promise.all(gates.splice(0).map(g=>g()));await new Promise(r=>setTimeout(r,0));await same(a,b);
   if(draws.get(deadImage)!==deadDraws)throw Error('disposed continuation drew');
   const first=[draws.get(a.atlas.image),draws.get(b.atlas.image)],a2=new B.PropKit(null),b2=new C.PropKit(null);
   await new Promise(r=>setTimeout(r,0));await same(a2,b2);
   const warm=[draws.get(a2.atlas.image),draws.get(b2.atlas.image)];if(warm[0]!==2||warm[1]!==1)throw Error('warm redraw counts '+warm);
   if(mode==='success'&&(first[0]!==2||first[1]!==2||fallback===await hash(b.atlas.image)))throw Error('font ready redraw missing');
   if(mode!=='success'&&(first[0]!==2||first[1]!==1))throw Error('fallback redraw count');
   const image=b2.atlas.image,texture=b2.atlas;let disposals=0;texture.addEventListener('dispose',()=>disposals++);
   for(const low of [true,false,true]){G.settings.quality=low?'low':'high';a2.update(1/60,1);b2.update(1/60,1);await same(a2,b2);if(b2.atlas!==texture||b2.atlas.image!==image||image.width!==(low?1024:2048))throw Error('resize ownership');}
   if(disposals!==3)throw Error('resize disposal count');const resizeDisposals=disposals;
   // Escaped writable old handles demonstrate why cross-kit Canvas/Texture sharing is unsafe.
   const next=new C.PropKit(null);if(next.atlas===b2.atlas||next.atlas.image===b2.atlas.image)throw Error('cross-kit writable resource alias');
   const nextHash=await hash(next.atlas.image);b2.dispose();image.getContext('2d').clearRect(0,0,image.width,image.height);if(await hash(next.atlas.image)!==nextHash)throw Error('disposed escaped canvas changed next kit');
   for(const k of[a,b,a2,next])k.dispose();
   return {scenario:'actual-canvas-'+mode,firstDraws:first,warmDraws:warm,actualPixelParity:true,resizeDisposals,independentWritableCanvas:true,fontFacesCreated:created};
  },mode));await p.close();
 }
 const candidateSources=Object.fromEntries(['inkwave-public/src/world/props-core.js','inkwave-public/src/world/props.js','inkwave-public/src/world/prop-packs.js','inkwave-public/src/world/dressing.js','inkwave-public/src/world/stages/data.js','inkwave-public/src/world/stages/cargo/props.js','inkwave-public/src/world/stages/cargo/placements.js','inkwave-public/src/world/props-marina-vessels.js','inkwave-public/src/world/props-marina-placements.js','inkwave-public/src/world/murals.js','patches/reliability/start-adapter.mjs','scripts/inkwave-source-composition.mjs','scripts/build-inkwave.mjs'].map(rel=>[rel,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,rel))).digest('hex')]));
 const output={schema:1,baseline_sha256:baselineHash,candidate_sources:candidateSources,receipts,limits:['Desktop Chromium source/Canvas evidence only; no iPad, network-byte, FPS, GPU upload or cold latency claim.','Cargo mural implementation remains eagerly imported to preserve the synchronous public setStage API.','100 registration transitions verify memoization; geometry parity is exercised once per complete stage.']};
 const file=process.env.INKWAVE_PROP_EVIDENCE;if(file){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(output,null,2)+'\n')}console.log(JSON.stringify(output,null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
