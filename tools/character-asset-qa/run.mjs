#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {hash,inspectGLB,assertScenarioMatrix,assertLifecycle} from './glb.mjs';
import {syntheticGLB} from './synthetic.mjs';
import {expandedCore} from './core.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2),has=name=>args.includes(name),option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
export function containedFile(root, relative) {
  const normalized=path.resolve(root,relative);if(!normalized.startsWith(root+path.sep))throw Error('Outside served root');
  const real=fs.realpathSync(normalized);if(!real.startsWith(root+path.sep))throw Error('Symlink outside served root');return real;
}
export function verifyBuild(site) {
  const m=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));assert.equal(hash(JSON.stringify(m.artifacts)),m.contentHash,'build artifact identity');
  assert.match(m.build.revision,/^[a-f0-9]{64}$/);
  for(const [file,digest]of Object.entries(m.artifacts)){const actual=containedFile(site,file);assert.equal(hash(fs.readFileSync(actual)),digest,'artifact '+file);}
  return m;
}
async function main() {
  const site=fs.realpathSync(option('--site')||'_site'),output=path.resolve(option('--out')||'.qa-evidence/character-asset');fs.mkdirSync(output,{recursive:true});
  const explicit=option('--asset');assert(has('--synthetic')!==!!explicit,'Choose --synthetic OR --asset local.glb --sha256 HASH');
  if(explicit)assert(option('--sha256'),'Explicit assets require immutable SHA256');
  const bytes=explicit?fs.readFileSync(explicit):syntheticGLB(),asset=inspectGLB(bytes,explicit?option('--sha256'):undefined);const assetMode=explicit?'local-unpublished':'original-neutral-synthetic';
  const manifest=verifyBuild(site),prefix='/_versions/'+manifest.build.revision+'/';
  const write=value=>fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(value,null,2)+'\n');
  const basis={assetMode,asset,contentHash:manifest.contentHash,buildRevision:manifest.build.revision,publicationNote:explicit?'Local evidence may contain private artwork; do not publish without permission.':'Contains only original generated QA geometry/maps; no adopted character asset.'};
  write({status:'inspected',...basis,browserRun:false});
  if(has('--inspect-only')){console.log(JSON.stringify({status:'inspection-passed',...basis}));return;}
  const vendor=fs.realpathSync(option('--three-root')||'node_modules/three');assert.equal(JSON.parse(fs.readFileSync(path.join(vendor,'package.json'))).version,'0.186.0','QA loader version');
  const vendorRoot=fs.realpathSync(path.join(vendor,'examples/jsm')),browserModule=fs.readFileSync(path.join(here,'browser.mjs'));
  const esbuild=await import(process.env.ESBUILD_MODULE?pathToFileURL(process.env.ESBUILD_MODULE).href:'esbuild');
  const core=await expandedCore({builtFile:containedFile(site,prefix.slice(1)+'vendor/three/build/three.module.js'),sourceRoot:fs.realpathSync(option('--source-three-root')||'inkwave-public/vendor/three/build'),addonRoot:vendorRoot,browserSource:browserModule.toString(),esbuild});
  basis.core=core.report;
  let server,browser,page;const errors=[],loaded=new Set(),blocked=[];let result;
  try {
    server=http.createServer((req,res)=>{
      try {
        const url=new URL(req.url,'http://127.0.0.1'),p=decodeURIComponent(url.pathname);let content,type='text/javascript';
        if(p==='/qa/'){content=`<!doctype html><html><head><meta charset="utf-8"><script type="importmap">${JSON.stringify({imports:{three:'/qa/expanded-three.mjs','three/addons/':prefix+'vendor/three/jsm/'}})}</script></head><body style="margin:0"></body></html>`;type='text/html';}
        else if(p==='/qa/browser.mjs')content=browserModule;
        else if(p==='/qa/expanded-three.mjs')content=core.bytes;
        else if(p==='/qa/candidate.glb'){content=bytes;type='model/gltf-binary';}
        else if(p.startsWith('/qa/three/'))content=fs.readFileSync(containedFile(vendorRoot,p.slice('/qa/three/'.length)));
        else if(p==='/favicon.ico'){res.writeHead(204);res.end();return;}
        else if(p.startsWith(prefix)){const key=p.slice(1);assert(manifest.artifacts[key],'unmanifested build file');content=fs.readFileSync(containedFile(site,key));assert.equal(hash(content),manifest.artifacts[key],'served build receipt');loaded.add(key);type=p.endsWith('.json')?'application/json':p.endsWith('.png')?'image/png':/\.m?js$/.test(p)?'text/javascript':'application/octet-stream';}
        else throw Error('Unexpected request path');
        res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(content);
      } catch(error){errors.push('server: '+error.message);res.writeHead(404);res.end('Not found');}
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const origin='http://127.0.0.1:'+server.address().port;
    const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
    browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
    page=await browser.newPage({viewport:{width:640,height:480},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.route('**/*',route=>{const url=route.request().url();if(url.startsWith(origin+'/'))return route.continue();blocked.push(url);return route.abort();});
    await page.goto(origin+'/qa/');
    result=await page.evaluate(async config=>(await import('/qa/browser.mjs')).run(config),{prefix,asset,assetMode,contentHash:manifest.contentHash,buildRevision:manifest.build.revision,core:core.report});
    assertScenarioMatrix(result.rows);assertLifecycle(result.lifecycle);assert.equal(blocked.length,0,'no external requests');assert.equal(errors.length,0,errors.join('\n'));
    for(const suffix of ['src/game/character.js','src/core/ctx.js','patches/splatoon3/runtime/install.mjs','vendor/three/build/three.module.js'])assert([...loaded].some(f=>f.endsWith('/'+suffix)),'actual built module receipt '+suffix);
    for(const image of result.images){assert.match(image.name,/^[a-z0-9-]+$/);fs.writeFileSync(path.join(output,image.name+'.png'),Buffer.from(image.png.split(',')[1],'base64'));}
    delete result.images;write({...result,...basis,loaded:[...loaded].sort(),browserVersion:browser.version(),browserRun:true,blocked,errors});console.log(JSON.stringify({status:'passed',assetMode,scenarios:result.rows.length,cycles:result.lifecycle.length,contentHash:manifest.contentHash}));
  } catch(error) {write({status:'failed',...basis,browserRun:!!page,error:error.message,blocked,errors,partial:result?{rows:result.rows,lifecycle:result.lifecycle}:null});throw error;}
  finally {await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error);process.exitCode=1;});
