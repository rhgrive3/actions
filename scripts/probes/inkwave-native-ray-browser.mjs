// Bounded Chromium ray-only replay. No renderer, FPS or whole-game claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import v8 from 'node:v8';
import http from 'node:http';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {SOURCE_STAGES,sourceURL} from '../../patches/native-stages/runtime/source-catalog.mjs';
import {convertSource} from '../../patches/native-stages/runtime/source-convert.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const OUT=path.resolve(arg('--out','.ray-browser-evidence'));
const ASSETS=path.resolve(arg('--assets','.ray-browser-assets'));
const BASE='ac1159b76b42a10ff02fe58add74a8285cc08d32';
const CANDIDATE='9e97f5f734586f667f960d8b29b862add708e96d';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
fs.mkdirSync(OUT,{recursive:true});fs.mkdirSync(ASSETS,{recursive:true});
const stage=SOURCE_STAGES.find(s=>s.id==='scorch');
async function input(name,url){const f=path.join(ASSETS,name);if(!fs.existsSync(f)){const r=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error(url+': '+r.status);fs.writeFileSync(f,Buffer.from(await r.arrayBuffer()));}return fs.readFileSync(f);}
const obj=await input(stage.internal+'.obj',sourceURL(stage,stage.internal+'.obj'));
assert.equal(hash(obj),stage.sourceSha256,'pinned source OBJ');
const tree=JSON.parse(await input('scorch-tree.json','https://api.github.com/repos/kirakira-dev/KiTrix/git/trees/'+stage.tree+'?recursive=1'));
assert.equal(tree.sha,stage.tree);assert.equal(tree.truncated,false);
const files=Object.fromEntries(tree.tree.filter(f=>f.type==='blob').map(f=>[f.path,{bytes:f.size,gitSha1:f.sha}]));
const mtl=await input(stage.internal+'.mtl',sourceURL(stage,stage.internal+'.mtl'));
assert.equal(crypto.createHash('sha1').update(Buffer.from('blob '+mtl.length+'\0')).update(mtl).digest('hex'),files[stage.internal+'.mtl'].gitSha1,'pinned MTL');
const baseline=execFileSync('git',['show',BASE+':patches/native-stages/runtime/triangle-world.mjs'],{cwd:ROOT,encoding:'utf8'});
const candidate=fs.readFileSync(path.join(ROOT,'patches/native-stages/runtime/triangle-world.mjs'),'utf8');
assert.equal(hash(baseline),'216165efa7be96b47def23f11740696efff64478e31c6253ea2728745d650b91');
assert.equal(hash(candidate),'76206bdf0a42a5122759ca0914435e3a3f89da590740253e8c4f18d6127af92f');
fs.writeFileSync(path.join(ASSETS,'triangle-world-baseline.mjs'),baseline);
const cache=path.join(ASSETS,'scorch-data.v8');
if(!fs.existsSync(cache))fs.writeFileSync(cache,v8.serialize(convertSource(stage,obj.toString(),mtl.toString(),files)));
const data=v8.deserialize(fs.readFileSync(cache));assert.equal(data.manifest.sourceSha256,stage.sourceSha256);assert.equal(data.flags.length,133737);
const bufferNames=['triangles','normals','flags','objectIds','nodes','order'];
const sceneDir=path.join(ASSETS,'scene');fs.mkdirSync(sceneDir,{recursive:true});
const sceneReceipt={};for(const name of bufferNames){const a=data[name],bytes=Buffer.from(a.buffer,a.byteOffset,a.byteLength);fs.writeFileSync(path.join(sceneDir,name+'.bin'),bytes);sceneReceipt[name]={bytes:bytes.length,sha256:hash(bytes)};}
let traceFile=arg('--trace',null);
if(!traceFile){
 traceFile=path.join(ASSETS,'trace.json');
 let probe=fs.readFileSync(path.join(ROOT,'scripts/probes/inkwave-native-down-ray.mjs'),'utf8');
 const once=(a,b)=>{assert.equal(probe.split(a).length,2,'protected trace anchor');probe=probe.replace(a,b);};
 once('const start=performance.now();',`const captured=[];const originalRay=G.level.triangleWorld.ray;G.level.triangleWorld.ray=function(o,d,far=1000,opts={}){const h=originalRay.call(this,o,d,far,opts);captured.push([o.toArray(),d.toArray(),far,{...opts},h?{triangle:h.triangle,distance:h.distance,point:h.point.toArray(),normal:h.normal.toArray(),u:h.u,v:h.v,flags:h.flags,object:h.object}:null]);return h;};const start=performance.now();`);
 once('const hash=x=>',`fs.writeFileSync(process.env.RAY_TRACE_OUT,JSON.stringify(captured));const hash=x=>`);
 const generated=path.join(ROOT,'scripts/probes/.native-ray-trace-generated.mjs');fs.writeFileSync(generated,probe);
 execFileSync(process.execPath,['--experimental-vm-modules',generated,'--reference','--out',path.join(OUT,'trace-state.json')],{cwd:ROOT,env:{...process.env,INKWAVE_NATIVE_QUERY_ASSETS:ASSETS,PROBE_HZ:'60',PROBE_FRAMES:'600',RAY_TRACE_OUT:traceFile},stdio:'inherit'});
}
traceFile=path.resolve(traceFile);const traceBytes=fs.readFileSync(traceFile),trace=JSON.parse(traceBytes);
assert.equal(hash(traceBytes),'6b105de41b5bb11e4ee09716bd9bc1cb9d91f4c72867f4cf3b6a2c60d95cd4a5','immutable original ray trace');
assert.equal(trace.length,79827,'recorded eight-Actor600-frame trace');
const down=trace.filter(([,d])=>d[0]===0&&d[2]===0&&d[1]===-1).length;assert.equal(down,69884);
const receipt={baseline:BASE,candidate:CANDIDATE,baselineModuleSha256:hash(baseline),candidateModuleSha256:hash(candidate),sourceSha256:stage.sourceSha256,scene:sceneReceipt,traceSha256:hash(traceBytes),queries:trace.length,down,other:trace.length-down,provenance:'Node BotBrain/Actor/paint logic trace; Character and FX are absent. Not the failed full-game trace.',limitations:['No renderer/GPU/FPS/device comparison','No FX or Character ray distribution inference','Direct A/B hits are compared with signed zero preserved; captured JSON expected hits normalize signed zero']};
fs.writeFileSync(path.join(OUT,'input-receipt.json'),JSON.stringify(receipt,null,2));
if(process.argv.includes('--prepare-only'))process.exit(0);
const html='<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"/vendor/three.module.js"}}</script><title>Native ray replay</title>';
const routes=new Map([['/before.mjs',{text:baseline,type:'text/javascript'}],['/after.mjs',{text:candidate,type:'text/javascript'}],['/trace.json',{file:traceFile,type:'application/json'}],['/',{text:html,type:'text/html'}]]);
for(const name of bufferNames)routes.set('/scene/'+name+'.bin',{file:path.join(sceneDir,name+'.bin'),type:'application/octet-stream'});
for(const name of ['three.module.js','three.core.js'])routes.set('/vendor/'+name,{file:path.join(ROOT,'inkwave-public/vendor/three/build',name),type:'text/javascript'});
const server=http.createServer((req,res)=>{const route=routes.get(new URL(req.url,'http://localhost').pathname);if(!route){res.writeHead(404);res.end('missing');return;}res.writeHead(200,{'Content-Type':route.type,'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'});if(route.file)fs.createReadStream(route.file).pipe(res);else res.end(route.text);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {chromium}=await import(pathToFileURL(path.resolve(arg('--playwright','node_modules/playwright/index.mjs'))));
let browser;try{
 browser=await chromium.launch({headless:true,args:['--disable-gpu','--no-sandbox']});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(180000);
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
 const result=await page.evaluate(async()=>{
  const [{TriangleWorld:A},{TriangleWorld:B},THREE,raw]=await Promise.all([import('/before.mjs'),import('/after.mjs'),import('three'),fetch('/trace.json').then(r=>r.json())]);
  const types={triangles:Float32Array,normals:Float32Array,flags:Uint32Array,objectIds:Uint32Array,nodes:Float32Array,order:Uint32Array},data={};
  await Promise.all(Object.entries(types).map(async([name,T])=>{data[name]=new T(await(await fetch('/scene/'+name+'.bin')).arrayBuffer());}));
  const a=new A(data),b=new B(data),queries=raw.map(([o,d,far,opts,expected])=>({o:new THREE.Vector3(...o),d:new THREE.Vector3(...d),far,opts,expected}));
  const flat=h=>h?{triangle:h.triangle,distance:h.distance,point:h.point.toArray(),normal:h.normal.toArray(),u:h.u,v:h.v,flags:h.flags,object:h.object}:null;
  function exact(x,y){if(Object.is(x,y))return true;if(!x||!y||typeof x!=='object'||typeof y!=='object')return false;const k=Object.keys(x);return k.length===Object.keys(y).length&&k.every(k=>Object.hasOwn(y,k)&&exact(x[k],y[k]));}
  for(let i=0;i<queries.length;i++){const q=queries[i],x=flat(a.ray(q.o,q.d,q.far,q.opts)),y=flat(b.ray(q.o,q.d,q.far,q.opts));if(!exact(x,y))throw Error('A/B exact ray mismatch at '+i);if(JSON.stringify(x)!==JSON.stringify(q.expected))throw Error('Captured expected hit mismatch at '+i);}
  if(a.queryCount!==b.queryCount||a.triangleTests!==b.triangleTests)throw Error('Traversal counter mismatch');
  const parity={queries:a.queryCount,triangleTests:a.triangleTests};
  const groups={all:queries,verticalDown:queries.filter(q=>q.d.x===0&&q.d.z===0&&q.d.y===-1),other:queries.filter(q=>!(q.d.x===0&&q.d.z===0&&q.d.y===-1))};
  const measurements={};
  for(const [name,list] of Object.entries(groups)){
   const execute=w=>{for(let repeat=0;repeat<4;repeat++)for(const q of list)w.ray(q.o,q.d,q.far,q.opts);};
   execute(a);execute(b);const runs=[];
   for(let cycle=0;cycle<3;cycle++)for(const [label,w] of [['A',a],['B',b],['B2',b],['A2',a]]){const start=performance.now();execute(w);runs.push({cycle,label,milliseconds:performance.now()-start});}
   const median=v=>{v.sort((x,y)=>x-y);return(v[(v.length-1)>>1]+v[v.length>>1])/2;};
   const before=median(runs.filter(r=>r.label.startsWith('A')).map(r=>r.milliseconds)),after=median(runs.filter(r=>r.label.startsWith('B')).map(r=>r.milliseconds));
   measurements[name]={queries:list.length,repetitionsPerSample:4,runs,beforeMedianMs:before,afterMedianMs:after,reduction:1-after/before,fasterEachCycle:[0,1,2].every(c=>median(runs.filter(r=>r.cycle===c&&r.label.startsWith('B')).map(r=>r.milliseconds))<median(runs.filter(r=>r.cycle===c&&r.label.startsWith('A')).map(r=>r.milliseconds)))};
  }
  return {parity,measurements,userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,crossOriginIsolated,wholeGameAcceptance:false};
 });
 assert.deepEqual(errors,[]);result.browserVersion=browser.version();result.input=receipt;result.host={node:process.version,platform:os.platform(),cpus:os.cpus().length,loadAverage:os.loadavg()};
 fs.writeFileSync(path.join(OUT,'browser-ray-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(error){fs.writeFileSync(path.join(OUT,'failure.json'),JSON.stringify({error:error.stack,receipt},null,2));throw error;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
