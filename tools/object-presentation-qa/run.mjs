#!/usr/bin/env node
// One already-built production site, per-suite bounded captures. The before
// namespace overlays only the listed historical modules, NOT a full main build.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {execFileSync}from'node:child_process';import{fileURLToPath,pathToFileURL}from'node:url';
import { adaptBuildSource } from '../../scripts/inkwave-source-composition.mjs';
import { verifyFrameComparisons, verifyContactSheetPlan } from './frame-contract.mjs';
import { SUITES, sourceKey, suiteBase } from './config.mjs';
import { FRAME_LIMIT, ARTIFACT_LIMIT, assertArtifactBudget, writeBoundedArtifact } from './artifact-budget.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const args=process.argv.slice(2),option=(name,def)=>{const i=args.indexOf(name);return i<0?def:args[i+1];},suite=option('--suite');assert(Object.hasOwn(SUITES,suite),'known suite');const beforeBase=suiteBase(suite);
const site=fs.realpathSync(option('--site','_site')),out=path.resolve(option('--out','.qa-evidence/'+suite)),here=path.join(ROOT,'tools',suite+'-production-qa');fs.mkdirSync(out,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),git=(...a)=>execFileSync('git',a,{cwd:ROOT,encoding:'utf8'}).trim();
const safe=(root,rel)=>{const file=fs.realpathSync(path.resolve(root,rel));assert(file.startsWith(root+path.sep),'path containment');return file;};
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));assert.equal(manifest.build.optimization,'esbuild-minify','native QA requires the production optimization path');assert.match(manifest.build.revision,/^[a-f0-9]{64}$/,'immutable build revision');assert.equal(manifest.build.script,hash(fs.readFileSync(path.join(ROOT,'scripts/build-inkwave.mjs'))),'production builder identity');assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash,'artifact identity');assert.equal(hash(JSON.stringify(manifest.files)),manifest.inputHash,'official source input identity');
for(const file of SUITES[suite].before.concat(SUITES[suite].added)){assert.equal(manifest.files[sourceKey(file)],hash(fs.readFileSync(path.join(ROOT,file))),'required runtime in official inputHash '+file);assert(manifest.artifacts['_versions/'+manifest.build.revision+'/'+file],'required emitted runtime '+file);}
for(const[file,digest]of Object.entries(manifest.artifacts))assert.equal(hash(fs.readFileSync(safe(site,file))),digest,'emitted artifact '+file);
const sourceSha=process.env.SOURCE_SHA||git('rev-parse','HEAD');assert.equal(git('rev-parse','HEAD'),sourceSha,'exact source checkout');assert.equal(git('hash-object','scripts/build-inkwave.mjs'),git('rev-parse',sourceSha+':scripts/build-inkwave.mjs'),'production builder commit');
const namespaces={'upstream/':'inkwave-public/','patch/':'patches/splatoon3/','touch-layout/':'patches/touch-layout/','reliability/':'patches/reliability/','local-quality/':'patches/local-quality/','network-replication/':'patches/network-replication/','loading-cache/':'patches/loading-cache/','practice-range/':'patches/practice-range/','native-stages/':'patches/native-stages/','build-script/':'scripts/'};
for(const[key,digest]of Object.entries(manifest.files)){
 const namespace=Object.keys(namespaces).find(n=>key.startsWith(n));assert(namespace,'known source namespace '+key);const file=namespaces[namespace]+key.slice(namespace.length),bytes=fs.readFileSync(path.join(ROOT,file));assert.equal(hash(bytes),digest,'source receipt '+file);assert.equal(git('hash-object',file),git('rev-parse',sourceSha+':'+file),'source commit '+file);
}
const overlay=new Map(),beforeFiles={};for(const file of SUITES[suite].before){const content=execFileSync('git',['show',beforeBase+':'+file],{cwd:ROOT});const composed=Buffer.from(adaptBuildSource(file,content.toString('utf8')));overlay.set(file,composed);beforeFiles[file]={sourceSha:beforeBase,sha256:hash(content),gitBlob:git('rev-parse',beforeBase+':'+file),servedSha256:hash(composed),servedBytes:composed.length,productionAdapterChangedSource:!content.equals(composed)};}
const prefix='/_versions/'+manifest.build.revision+'/',baselinePrefix='/_before'+prefix,loaded=new Set(),beforeLoaded=new Set(),errors=[],warnings=[],blocked=[],screenshots=[],contactSheets=[];
const basis={suite,sourceSha,contentHash:manifest.contentHash,inputHash:manifest.inputHash,artifactLimit:ARTIFACT_LIMIT,buildRevision:manifest.build.revision,beforeBase,beforeDescription:'Same composed production candidate with listed runtime sources from '+beforeBase+' passed through current production adapters and overlaid without minification; not a full baseline build',beforeFiles,harnessHashes:{},sourceAndEmittedVerified:true};
for(const file of ['tools/object-presentation-qa/run.mjs','tools/object-presentation-qa/production-scene.mjs','tools/object-presentation-qa/artifact-budget.mjs','tools/object-presentation-qa/config.mjs','tools/object-presentation-qa/frame-contract.mjs','tools/'+suite+'-production-qa/browser.mjs']){const bytes=fs.readFileSync(path.join(ROOT,file));basis.harnessHashes[file]=hash(bytes);assert.equal(git('hash-object',file),git('rev-parse',sourceSha+':'+file),'harness commit');}
const write=result=>writeBoundedArtifact(out,'result.json',JSON.stringify({...basis,...result,loaded:[...loaded].sort(),beforeLoaded:[...beforeLoaded].sort(),screenshots,contactSheets,errors,warnings,blocked},null,2));write({status:'verified-build',browserRun:false});
let browser,server,page,totalBytes=0;
try{
 server=http.createServer((req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let body,type='text/javascript';
 if(p==='/qa/'){body=`<!doctype html><html><head><meta charset="utf-8"><script type="importmap">${JSON.stringify({imports:{three:prefix+'vendor/three/build/three.module.js','three/addons/':prefix+'vendor/three/jsm/'}})}</script></head><body style="margin:0"></body></html>`;type='text/html';}
 else if(p==='/favicon.ico'){res.writeHead(204);res.end();return;}
 else if(p.startsWith('/qa/shared/'))body=fs.readFileSync(safe(path.join(ROOT,'tools/object-presentation-qa'),p.slice('/qa/shared/'.length)));
 else if(p.startsWith('/qa/'))body=fs.readFileSync(safe(here,p.slice(4)));
 else if(p.startsWith(prefix)||p.startsWith(baselinePrefix)){
 const before=p.startsWith(baselinePrefix),rel=p.slice((before?baselinePrefix:prefix).length),key=prefix.slice(1)+rel;assert(manifest.artifacts[key],'artifact allowlist '+key);
 if(before&&overlay.has(rel)){body=overlay.get(rel);beforeLoaded.add(rel);}else{body=fs.readFileSync(safe(site,key));assert.equal(hash(body),manifest.artifacts[key],'served receipt');}
 loaded.add((before?'before:':'after:')+key);type=rel.endsWith('.json')?'application/json':rel.endsWith('.png')?'image/png':rel.endsWith('.gz')?'application/gzip':'text/javascript';
 }else throw Error('unexpected path '+p);res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(body);
 }catch(e){errors.push('server: '+e.message);res.writeHead(404);res.end('not found');}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const origin='http://127.0.0.1:'+server.address().port;
 const{chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 page=await browser.newPage({viewport:{width:900,height:900},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());else if(m.type()==='warning'&&warnings.length<80)warnings.push(m.text());});
 await page.route('**/*',r=>{const u=r.request().url();if(u.startsWith(origin+'/'))return r.continue();blocked.push(u);return r.abort();});
 await page.exposeFunction('__saveObjectFrame',(name,png)=>{assert.match(name,/^[a-z0-9-]+$/);assert(!screenshots.some(s=>s.name===name),'unique frame name');assert(png.startsWith('data:image/png;base64,'));const bytes=Buffer.from(png.split(',')[1],'base64');totalBytes+=bytes.length;assert(totalBytes<FRAME_LIMIT,'frames leave space for receipts and diagnostics');const file=name+'.png';writeBoundedArtifact(out,file,bytes);const saved=fs.readFileSync(path.join(out,file));assert.equal(hash(saved),hash(bytes),'PNG readback');assert.equal(saved.readUInt32BE(16),900,'PNG width');assert.equal(saved.readUInt32BE(20),900,'PNG height');screenshots.push({name,file,bytes:bytes.length,sha256:hash(saved),width:900,height:900});write({status:'running',browserRun:true,frames:screenshots.length,totalBytes});console.log(suite+' frame '+screenshots.length+' '+name);});
 await page.goto(origin+'/qa/?shadercheck');const result=await page.evaluate(async cfg=>(await import('/qa/browser.mjs')).run(cfg),{prefix,baselinePrefix});
 assert.equal(result.status,'passed');assert(Number.isSafeInteger(result.expectedFrames)&&result.expectedFrames>0,'explicit expected frame denominator');assert.equal(screenshots.length,result.expectedFrames,'all expected PNGs saved');result.comparison=verifyFrameComparisons(result.rows,screenshots);assert.equal(errors.length,0,errors.join('\n'));assert.equal(blocked.length,0,'no external assets');
 for(const file of SUITES[suite].before)assert(beforeLoaded.has(file),'before module loaded '+file);
 for(const suffix of ['src/world/environment.js','src/core/renderer.js','patches/splatoon3/runtime/install.mjs'])assert([...loaded].some(p=>p.endsWith('/'+suffix)),'production path '+suffix);
 for(const sheet of verifyContactSheetPlan(result.rows,screenshots,result.contactSheets)){
  const frames=sheet.frames.map(frame=>({label:frame.label,png:'data:image/png;base64,'+fs.readFileSync(path.join(out,frame.file)).toString('base64')}));
  const png=await page.evaluate(async({frames,width,height})=>{
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle='#17212d';ctx.fillRect(0,0,width,height);ctx.fillStyle='#ffffff';ctx.font='22px sans-serif';
   for(let i=0;i<frames.length;i++){const img=new Image();img.src=frames[i].png;await img.decode();ctx.drawImage(img,i*450,42,450,450);ctx.fillText(frames[i].label,i*450+16,29);}
   return canvas.toDataURL('image/png');
  },{frames,width:sheet.width,height:sheet.height});
  const bytes=Buffer.from(png.split(',')[1],'base64'),file=sheet.name+'.png';assert.equal(bytes.readUInt32BE(16),sheet.width);assert.equal(bytes.readUInt32BE(20),sheet.height);writeBoundedArtifact(out,file,bytes);assert.equal(hash(fs.readFileSync(path.join(out,file))),hash(bytes),'contact-sheet PNG readback');
  contactSheets.push({...sheet,file,bytes:bytes.length,sha256:hash(bytes),kind:'ordered-contact-sheet-not-video'});
 }
 write({...result,browserRun:true,browserVersion:browser.version(),frames:screenshots.length,totalBytes});const inventory=assertArtifactBudget(out);console.log(JSON.stringify({suite,status:result.status,frames:screenshots.length,frameBytes:totalBytes,artifactBytes:inventory.totalBytes,artifactLimit:ARTIFACT_LIMIT}));
}catch(e){if(page)await page.screenshot().then(bytes=>writeBoundedArtifact(out,'failed.png',bytes)).catch(error=>warnings.push('Failure screenshot: '+error.message));write({status:'failed',browserRun:!!page,error:e.stack,totalBytes});assertArtifactBudget(out);throw e;}
finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
