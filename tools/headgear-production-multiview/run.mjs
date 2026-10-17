#!/usr/bin/env node
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2),option=(n,d)=>{let i=args.indexOf(n);return i<0?d:args[i+1];};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const safe=(root,rel)=>{const p=fs.realpathSync(path.resolve(root,rel));assert(p.startsWith(root+path.sep),'path containment');return p;};
async function main(){
 const site=fs.realpathSync(option('--site','_site')),out=path.resolve(option('--out','.qa-evidence/headgear-production-views'));fs.mkdirSync(out,{recursive:true});
 const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash,'artifact map identity');
 for(const [file,digest]of Object.entries(manifest.artifacts))assert.equal(hash(fs.readFileSync(safe(site,file))),digest,'build receipt '+file);
 const prefix='/_versions/'+manifest.build.revision+'/',basis={contentHash:manifest.contentHash,buildRevision:manifest.build.revision,sourceSha:process.env.SOURCE_SHA||process.env.GITHUB_SHA||null,harnessHashes:{},loaded:[]};
 if(basis.sourceSha){basis.checkoutSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();assert.equal(basis.checkoutSha,basis.sourceSha,'exact candidate checkout');}
 for(const f of ['browser.mjs','run.mjs','registry.mjs'])basis.harnessHashes[f]=hash(fs.readFileSync(path.join(here,f)));
 const write=r=>fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({...basis,...r},null,2));write({status:'verified-build',browserRun:false});
 let server,browser,page;const errors=[],warnings=[],blocked=[],loaded=new Set();
 try{
  server=http.createServer((req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);let body,type='text/javascript';
   if(p==='/qa/'){body=`<!doctype html><html><head><meta charset="utf-8"><script type="importmap">${JSON.stringify({imports:{three:prefix+'vendor/three/build/three.module.js','three/addons/':prefix+'vendor/three/jsm/'}})}</script></head><body style="margin:0"></body></html>`;type='text/html';}
   else if(p==='/favicon.ico'){res.writeHead(204);res.end();return;}
   else if(p.startsWith('/qa/')){body=fs.readFileSync(safe(here,p.slice(4)));}
   else if(p.startsWith(prefix)){const key=p.slice(1);assert(manifest.artifacts[key],'manifest allowlist');body=fs.readFileSync(safe(site,key));assert.equal(hash(body),manifest.artifacts[key],'served receipt');loaded.add(key);type=p.endsWith('.json')?'application/json':p.endsWith('.png')?'image/png':'text/javascript';}
   else throw Error('unexpected path');res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(body);
  }catch(e){errors.push('server: '+e.message);res.writeHead(404);res.end('not found');}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin='http://127.0.0.1:'+server.address().port;
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  page=await browser.newPage({viewport:{width:720,height:720},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());else if(m.type()==='warning'&&warnings.length<80)warnings.push(m.text());});
  await page.route('**/*',route=>{const u=route.request().url();if(u.startsWith(origin+'/'))return route.continue();blocked.push(u);return route.abort();});
  let frames=0;const screenshots=[];await page.exposeFunction('__saveHeadgearFrame',(name,png)=>{assert.match(name,/^[a-z0-9-]+$/);assert(png.startsWith('data:image/png;base64,'));const bytes=Buffer.from(png.split(',')[1],'base64'),file=name+'.png';fs.writeFileSync(path.join(out,file),bytes);const reread=fs.readFileSync(path.join(out,file));assert.equal(hash(reread),hash(bytes),'saved PNG readback');assert.equal(reread.readUInt32BE(16),720,'PNG width');assert.equal(reread.readUInt32BE(20),720,'PNG height');screenshots.push({file,sha256:hash(reread),bytes:reread.length,width:720,height:720});frames++;});
  await page.goto(origin+'/qa/');const result=await page.evaluate(async cfg=>(await import('/qa/browser.mjs')).run(cfg),{prefix});
  assert.equal(result.rows.length,76,'complete case denominator');assert.equal(frames,152,'fitted and hidden screenshots');assert.equal(blocked.length,0,'no external traffic');assert.equal(errors.length,0,errors.join('\n'));
  for(const suffix of ['src/game/character.js','src/core/ctx.js','patches/splatoon3/runtime/install.mjs','vendor/three/build/three.module.js'])assert([...loaded].some(x=>x.endsWith('/'+suffix)),'native runtime receipt '+suffix);
  basis.loaded=[...loaded].sort();write({...result,browserRun:true,browserVersion:browser.version(),frames,screenshots,errors,warnings,blocked});console.log(JSON.stringify({status:result.status,cases:result.rows.length,frames,contentHash:manifest.contentHash}));
 }catch(e){const partial=page?await page.evaluate(()=>globalThis.__headgearQA||null).catch(()=>null):null;if(page)await page.screenshot({path:path.join(out,'failed.png')}).catch(()=>{});basis.loaded=[...loaded].sort();write({status:'failed',browserRun:!!page,error:e.message,partial,errors,warnings,blocked});throw e;}
 finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
