#!/usr/bin/env node
// Load the actual minified production engine into Chromium. Geometry is an
// explicit synthetic CPU fixture, not a full-game or mobile FPS benchmark.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {geometry,oldWorld,oldPhysics} from '../patches/native-stages/tests/fixtures/bvh-query-fixture.mjs';
const option=n=>{const i=process.argv.indexOf(n);assert.ok(i>=0&&process.argv[i+1],n+' required');return path.resolve(process.argv[i+1]);};
const site=option('--site'),out=option('--evidence-dir');fs.mkdirSync(out,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8')),hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);
const base='/_versions/'+manifest.build.revision+'/',receipts=new Set();
const html=`<!doctype html><meta charset="utf-8"><script type="importmap">${JSON.stringify({imports:{three:base+'vendor/three/build/three.module.js','three/addons/':base+'vendor/three/jsm/'}})}</script>`;
const server=http.createServer((req,res)=>{try{const name=new URL(req.url,'http://local').pathname;if(name==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return;}const rel=decodeURIComponent(name.slice(1)),file=path.resolve(site,rel);if(!file.startsWith(site+'/')||!manifest.artifacts[rel])throw Error('Unlisted artifact');const bytes=fs.readFileSync(file);if(hash(bytes)!==manifest.artifacts[rel])throw Error('Artifact mismatch');receipts.add(rel);res.writeHead(200,{'content-type':/\.m?js$/.test(file)?'text/javascript':'application/octet-stream'});res.end(bytes);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/');
 const d=geometry(),data=Object.fromEntries(Object.entries(d).map(([k,v])=>[k,ArrayBuffer.isView(v)?Array.from(v):v]));
 const result=await page.evaluate(async({data,base,oldWorld,oldPhysics})=>{
  const THREE=await import('three'),{NativeLevel,NativePhysics}=await import(base+'patches/native-stages/runtime/engine.mjs'),{Physics,Hit}=await import(base+'src/game/physics.js');
  const unmodule=s=>s.replace(/^import .*;$/gm,'').replace(/^export /gm,'');
  const W=new Function('THREE',unmodule(oldWorld)+'\nreturn TriangleWorld;')(THREE),P=new Function('THREE','Physics','Hit',unmodule(oldPhysics)+'\nreturn NativePhysics;')(THREE,Physics,Hit);
  for(const [key,C]of Object.entries({triangles:Float32Array,normals:Float32Array,nodes:Float32Array,flags:Uint32Array,objectIds:Uint32Array,order:Uint32Array,triangleFace:Int32Array,mask:Uint8Array}))data[key]=new C(data[key]);
  const make=old=>{const level=new NativeLevel(data);if(old)level.triangleWorld=new W(data);return {level,world:level.triangleWorld,physics:new (old?P:NativePhysics)(level)};};
  const pairs={before:make(true),after:make(false)},V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),outputs={before:new Hit(),after:new Hit()};
  const flat=h=>({...h,point:h.point.toArray(),normal:h.normal.toArray()}),equal=(a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Browser result mismatch');};
  const inputs=Array.from({length:300},(_,i)=>({origin:V((i%19-9)*.4,3+(i%7)*.2,(i%13-6)*.4),dir:i%4?V(0,-1,0):V(.3,-.8,.1).normalize(),feet:V((i%23-11)*.4,(i%9)*.3,0),grate:i%2===0}));
  let rayChecks=0,fitChecks=0;
  for(let repeat=0;repeat<10;repeat++)for(const {origin,dir,feet,grate}of inputs){equal(flat(pairs.before.physics.raycast(origin,dir,12,outputs.before,grate)),flat(pairs.after.physics.raycast(origin,dir,12,outputs.after,grate)));rayChecks++;equal(pairs.before.physics.bodyFits(feet,.38,.1,1.45,grate),pairs.after.physics.bodyFits(feet,.38,.1,1.45,grate));fitChecks++;}
  const min=V(-8,-8,-8),max=V(8,8,8),ids=w=>{const a=[];w.queryBox(min,max,id=>a.push(id));return a;},expected=ids(pairs.before.world),actual=[];
  pairs.after.world.queryBox(min,max,id=>{actual.push(id);if(actual.length===1)equal(ids(pairs.after.world),expected);});equal(actual,expected);
  try{pairs.after.world.queryBox(min,max,()=>{throw Error('expected callback interruption');});}catch(e){if(e.message!=='expected callback interruption')throw e;}
  equal(ids(pairs.after.world),expected);if(pairs.after.world._queryDepth!==0||pairs.after.world._queryStacks.some(s=>s.length))throw Error('Retained active query');
  const counts={};for(const name of ['before','after']){let callbacks=0;const w=pairs[name].world,native=w.queryBox;w.queryBox=function(a,b,fn,stop){return native.call(this,a,b,id=>{callbacks++;return fn(id);},stop);};for(const {feet,grate}of inputs)pairs[name].physics.bodyFits(feet,.38,.1,1.45,grate);counts[name]=callbacks;w.queryBox=native;}
  if(!(counts.after<counts.before))throw Error('No reduction in traversal work');
  const run=(name,kind,loops)=>{const p=pairs[name].physics;let checksum=0;for(let j=0;j<loops;j++)for(const {origin,dir,feet,grate}of inputs)if(kind==='raycast'){p.raycast(origin,dir,12,outputs[name],grate);checksum+=outputs[name].hit?outputs[name].dist:0;}else checksum+=p.bodyFits(feet,.38,.1,1.45,grate)?1:0;return checksum;},timings=[];
  for(const kind of ['raycast','bodyFits']){for(const name of ['before','after','after','before'])run(name,kind,10);for(const name of ['before','after','after','before','before','after','after','before']){const t=performance.now(),checksum=run(name,kind,50);timings.push({kind,name,queries:15000,ms:performance.now()-t,checksum});}}
  for(const kind of ['raycast','bodyFits'])if(new Set(timings.filter(r=>r.kind===kind).map(r=>r.checksum)).size!==1)throw Error('Timing window checksum mismatch');
  return {rayChecks,fitChecks,callbackCounts:counts,nestedOrder:true,exceptionRecovery:true,timings,triangles:data.triangles.length/9};
 },{data,base,oldWorld,oldPhysics});
 assert.deepEqual(errors,[]);assert.ok([...receipts].some(p=>p.endsWith('/patches/native-stages/runtime/engine.mjs')));
 const report={status:'passed',browser:await browser.version(),contentHash:manifest.contentHash,revision:manifest.build.revision,baseline:'ee06c87fc623cc793ebf9aaffd3ffc3a5081c60a',synthetic:true,...result,verifiedArtifacts:[...receipts].sort(),errors,limits:['Actual emitted production modules in Chromium; explicit synthetic triangle geometry.','Component CPU timings, not full-game rendering, device FPS or native-stage load evidence.']};
 fs.writeFileSync(path.join(out,'bvh-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,browser:report.browser,rayChecks:result.rayChecks,fitChecks:result.fitChecks,callbackCounts:result.callbackCounts}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
