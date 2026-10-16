#!/usr/bin/env node
// Synthetic diagnostic Worker bundled from the production converter source.
// The public build intentionally does not expose a placement-import entrypoint.
// This is not an original-stage or hardware-equivalence measurement.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {build as bundle} from 'esbuild';
import crypto from 'node:crypto';
const site=path.resolve(process.argv[2]||'_site'),out=process.argv[3];
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const source=path.resolve(import.meta.dirname,'../patches/native-stages/runtime/source-convert.mjs');
const entry=`import {convertSource} from ${JSON.stringify(source)};self.onmessage=({data:p})=>{try{const d=convertSource(p.stage,p.obj,${JSON.stringify('newmtl Floor\nKd 1 1 1\n')},{},()=>{},p.placement);self.postMessage({first:Array.from(d.vertices.slice(0,3)),triangles:Array.from(d.triangles),maskCells:d.mask.reduce((n,x)=>n+x,0),diagnostic:d.manifest.diagnosticOnly===true,receipt:d.manifest.placementReceipt||null});}catch(e){self.postMessage({error:e.message});}};`;
const compiled=await bundle({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'placement-worker-probe.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2020',minify:true});
const workerCode=compiled.outputFiles[0].contents;
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://local').pathname;
 if(name==='/probe'){res.setHeader('content-type','text/html');res.end('<!doctype html>');return;}
 if(name==='/placement-probe.mjs'){res.setHeader('content-type','text/javascript');res.end(workerCode);return;}
 const file=path.resolve(site,'.'+decodeURIComponent(name));
 if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('content-type','text/javascript');fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/probe');
 const result=await page.evaluate(async()=>{
  const worker=new Worker('/placement-probe.mjs',{type:'module'});
  const request=p=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Worker conversion timeout')),30000);worker.onmessage=({data})=>{clearTimeout(timer);data.error?reject(Error(data.error)):resolve(data);};worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};worker.postMessage(p);});
  const hash='a'.repeat(64),banc='b'.repeat(64),stage={id:'synthetic',sourceSha256:hash,bounds:{minX:-20,minZ:-20,maxX:20,maxZ:20},spawnPads:[[-5,0,0],[5,0,0]],spawnBarrier:0};
  const obj='o Fld_Test\nv 0 0 0\nv 1 0 0\nv 0 0 1\nvn 0 1 0\nvn 0 1 0\nvn 0 1 0\nusemtl Floor\nf 1//1 3//3 2//2\n';
  const document={schema:1,stageId:'synthetic',referenceVersion:'11.3.0',diagnosticOnly:true,versionVerified:false,sourceDocument:{format:'decoded-banc-json',sha256:banc},rails:[],unresolvedRailPoints:[],actors:[{id:'18446744073709551615',layer:'Pnt',translate:[10,3,2],rotate:[0,Math.PI/2,0],scale:[2,1,3]}]};
  const plan={schema:1,stageId:'synthetic',sourceObjSha256:hash,placementSha256:banc,rule:'turf',objectSpace:'actor-local',eulerOrder:'XYZ',vertexScale:1,translationScale:1,bindings:[{object:'Fld_Test',actor:'18446744073709551615'}]};
  try{return {normal:await request({stage,obj}),placed:await request({stage,obj,placement:{document,plan}})};}finally{worker.terminate();}
 });
 assert.deepEqual(result.normal.first,[0,0,0]);assert.equal(result.normal.diagnostic,false);
 assert.deepEqual(result.placed.first,[10,3,2]);assert.equal(result.placed.diagnostic,true);assert.equal(result.placed.receipt.instances,1);assert.ok(result.placed.maskCells>0);
 assert(result.placed.triangles.every((x,i)=>i%3!==1||x===3));assert.equal(errors.length,0);
 const report={build:build.contentHash,workerBundleSha256:crypto.createHash('sha256').update(workerCode).digest('hex'),browser:browser.version(),synthetic:true,diagnosticWorker:true,...result,errors};
 if(out){fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify({workerImport:'passed',normalFirst:result.normal.first,placedFirst:result.placed.first,maskCells:result.placed.maskCells,errors}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
