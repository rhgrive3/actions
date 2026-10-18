#!/usr/bin/env node
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {PRODUCTION_LIGHTING_CONFIG,PRODUCTION_EXPOSURE} from '../squid-production-qa/lighting.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2),option=(n,d)=>{let i=args.indexOf(n);return i<0?d:args[i+1];};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const safe=(root,rel)=>{const p=fs.realpathSync(path.resolve(root,rel));assert(p.startsWith(root+path.sep),'path containment');return p;};
async function main(){
 const gearIds=[];
 const site=fs.realpathSync(option('--site','_site')),out=path.resolve(option('--out','.qa-evidence/squid'));fs.mkdirSync(out,{recursive:true});
 const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash,'artifact map identity');
 for(const [file,digest]of Object.entries(manifest.artifacts))assert.equal(hash(fs.readFileSync(safe(site,file))),digest,'build receipt '+file);
 const prefix='/_versions/'+manifest.build.revision+'/',basis={contentHash:manifest.contentHash,buildRevision:manifest.build.revision,sourceSha:process.env.SOURCE_SHA||process.env.GITHUB_SHA||null,gearIds,harnessHashes:{},loaded:[]};
 basis.productionEnvironmentSourceHash=manifest.artifacts['_versions/'+manifest.build.revision+'/src/world/environment.js'];assert(basis.productionEnvironmentSourceHash,'production Environment emitted source');basis.lightingConfigHash=hash(JSON.stringify({config:PRODUCTION_LIGHTING_CONFIG,exposure:PRODUCTION_EXPOSURE}));
 if(basis.sourceSha){basis.checkoutSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();assert.equal(basis.checkoutSha,basis.sourceSha,'exact candidate checkout');}
 for(const f of ['browser.mjs','run.mjs','timeline.mjs','../squid-production-qa/lighting.mjs'])basis.harnessHashes[f]=hash(fs.readFileSync(path.join(here,f)));
 basis.authoredSquidHashes={};for(const file of ['inkwave-public/src/game/character-geo.js','inkwave-public/src/game/character-mats.js','inkwave-public/src/game/motion/squid-rig.js','patches/local-quality/s3-squid-look-adapter.mjs','patches/splatoon3/runtime/swim-motion.mjs','patches/local-quality/squid-motion-binding-adapter.mjs'])basis.authoredSquidHashes[file]=hash(fs.readFileSync(file));
 const write=r=>fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({...basis,...r},null,2));write({status:'verified-build',browserRun:false});
 let server,browser,page;const errors=[],warnings=[],blocked=[],clips=[],loaded=new Set();
 try{
  server=http.createServer((req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);let body,type='text/javascript';
   if(p==='/qa/'){body=`<!doctype html><html><head><meta charset="utf-8"><script type="importmap">${JSON.stringify({imports:{three:prefix+'vendor/three/build/three.module.js','three/addons/':prefix+'vendor/three/jsm/'}})}</script></head><body style="margin:0"></body></html>`;type='text/html';}
   else if(p==='/favicon.ico'){res.writeHead(204);res.end();return;}
   else if(p==='/qa/lighting.mjs'){body=fs.readFileSync(path.join(here,'../squid-production-qa/lighting.mjs'));}
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
  await page.exposeFunction('__saveSquidClip',(name,data)=>{assert.match(name,/^[a-z0-9-]+$/);assert(data.startsWith('data:video/webm'));const bytes=Buffer.from(data.split(',')[1],'base64');assert.equal(bytes.readUInt32BE(0),0x1a45dfa3,'WebM EBML header');assert(bytes.length>10000,'nonempty native video');const file=name+'.webm';fs.writeFileSync(path.join(out,file),bytes);assert.equal(hash(fs.readFileSync(path.join(out,file))),hash(bytes),'saved WebM readback');clips.push({file,sha256:hash(bytes),bytes:bytes.length});write({status:'recorded-awaiting-coverage-replay',browserRun:true,clips,errors,warnings,blocked});console.log('saved clip '+file+' '+bytes.length+' bytes');});
  await page.goto(origin+'/qa/');const result=await page.evaluate(async cfg=>(await import('/qa/browser.mjs')).run(cfg),{prefix,gearIds});
  assert.equal(clips.length,1,'one continuous native clip');assert(result.frames.length>=8,'recorded frame receipts');assert.equal(result.coverage.length,result.frames.length,'every rendered frame coverage replayed');assert.equal(result.states.length,8,'complete state sequence');assert.equal(result.clipConfig.simulationHz,60);assert.equal(result.pacing.simulationDurationMs,8000);assert(result.frames.some(f=>f.state==='jump'&&!f.grounded&&f.sourceDebug?.name==='Sqd_Jump'),'actual source jump');assert(result.frames.some(f=>f.state==='land'&&f.grounded),'actual landed state');assert(result.frames.every((f,i)=>i===0||f.wallMs>result.frames[i-1].wallMs),'strict real timestamp ordering');assert.equal(blocked.length,0);assert.equal(errors.length,0,errors.join('\n'));
  for(const suffix of ['src/world/environment.js','src/game/character.js','src/game/character-geo.js','src/game/character-mats.js','src/game/motion/squid-rig.js','assets/source-motion/Player_Squid.f32.gz','src/core/ctx.js','patches/splatoon3/runtime/install.mjs','vendor/three/build/three.module.js'])assert([...loaded].some(x=>x.endsWith('/'+suffix)),'native runtime receipt '+suffix);
  basis.loaded=[...loaded].sort();write({...result,browserRun:true,browserVersion:browser.version(),clips,errors,warnings,blocked});console.log(JSON.stringify({status:result.status,frames:result.frames.length,pacing:result.pacing,contentHash:manifest.contentHash}));
 }catch(e){const partial=page?await page.evaluate(()=>globalThis.__headgearQA||null).catch(()=>null):null;if(page)await page.screenshot({path:path.join(out,'failed.png')}).catch(()=>{});basis.loaded=[...loaded].sort();write({status:'failed',browserRun:!!page,error:e.message,partial,clips,errors,warnings,blocked});throw e;}
 finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

