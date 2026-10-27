import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import crypto from 'node:crypto';import {createRequire}from'node:module';
import {catalogAudioGraph as original}from'/workspace/actions/scripts/lib/inkwave-catalog-audio.mjs';
import {catalogAudioGraph as candidate}from'/workspace/catalog-charge-worker-90706e/scripts/lib/inkwave-catalog-audio.mjs';
import {validateCatalogAudioGraphResult}from'/workspace/catalog-charge-worker-90706e/scripts/check-inkwave-motion-catalog.mjs';
const {chromium}=createRequire('/workspace/actions/package.json')('playwright');
const site='/workspace/scratch/integration-reviewed-batch-site',out='/workspace/scratch/catalog-charge-worker-90706e',manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(manifest.contentHash!=='af180bade0c09f1c0b32a8eab99016aa5f697991a32a7cd8ccb076cf3311ae84')throw Error('Expected exact907 runtime');
const workerFile=Object.keys(manifest.artifacts).find(x=>x.endsWith('/patches/splatoon3/runtime/audio/pitch-preserving-charge-worker.mjs')),prefix='/'+workerFile.slice(0,workerFile.indexOf('/patches/'))+'/';
const result={status:'running',kind:'actual browser Worker graph/protocol only; no gameplay/device/playback/motion catalog acceptance',runtimeHead:'90706e3778586fa6c9d09a64ac354e547086e1c0',candidate:'4870f55f6',contentHash:manifest.contentHash,chromiumSandbox:true,errors:[],outcomes:[]};
const server=http.createServer((req,res)=>{if(req.url==='/qa'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>Catalog Worker observation</title>');return;}const file=path.resolve(site,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.setHeader('Content-Type',/\.(?:mjs|js)$/.test(file)?'text/javascript':'application/octet-stream');fs.createReadStream(file).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const deadline=setTimeout(()=>void browser?.close(),60000);
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',chromiumSandbox:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader','--unsafely-disable-devtools-self-xss-warnings']});result.browser=browser.version();const context=await browser.newContext(),page=await context.newPage(),loaded=new Map();
 page.on('pageerror',e=>result.errors.push(e.message));
 await context.route('http://127.0.0.1:'+server.address().port+'/**',async route=>{try{const response=await route.fetch(),bytes=await response.body(),file=new URL(response.url()).pathname.slice(1);if(file!=='qa'){if(hash(bytes)!==manifest.artifacts[file])throw Error('Emitted identity mismatch '+file);loaded.set(file,{file,sha256:hash(bytes),bytes:bytes.length});}await route.fulfill({response,body:bytes});}catch(e){result.errors.push(e.message);await route.abort();}});
 await page.goto('http://127.0.0.1:'+server.address().port+'/qa');
 for(const [label,fn]of[['original907',original],['candidate',candidate]]){
  await page.addScriptTag({content:'window.probeAudioGraph='+fn.toString()});
  const graph=await page.evaluate(prefix=>window.probeAudioGraph(prefix),prefix),receipts=[...loaded.values()];
  const row={label,graph,loaded:receipts,chargeWorkerLoaded:loaded.has(workerFile)};
  try{validateCatalogAudioGraphResult({artifacts:manifest.artifacts,loaded:receipts,audioGraph:graph});row.strictSavedProof='passed';}catch(e){row.strictSavedProof='rejected';row.message=e.message;}
  result.outcomes.push(row);console.log(label,JSON.stringify({chargeWorkerLoaded:row.chargeWorkerLoaded,strictSavedProof:row.strictSavedProof,message:row.message,workers:graph.prewarmWorkers}));
 }
 const [before,after]=result.outcomes;if(before.chargeWorkerLoaded||before.strictSavedProof!=='rejected'||!after.chargeWorkerLoaded||after.strictSavedProof!=='passed'||result.errors.length)throw Error('Focused before/after Worker proof failed');result.status='passed';
}catch(e){result.status='failed';result.error=e.stack;console.error(e.stack);process.exitCode=1;}
finally{clearTimeout(deadline);await browser?.close();await new Promise(r=>server.close(r));result.closed=true;fs.writeFileSync(path.join(out,'browser-result.json'),JSON.stringify(result,null,2)+'\n');}
