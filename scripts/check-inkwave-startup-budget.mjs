#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {parse} from '../patches/loading-cache/vendor/acorn.mjs';
const root=path.resolve(process.argv[2]||'_site');const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const identity=JSON.parse(fs.readFileSync(path.join(root,'inkwave-build.json')));
assert.equal(hash(JSON.stringify(identity.artifacts)),identity.contentHash,'artifact manifest identity');
for(const[file,sha]of Object.entries(identity.artifacts))assert.equal(hash(fs.readFileSync(path.join(root,file))),sha,'artifact '+file);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const revision=html.match(/<base href="\.\/_versions\/([a-f0-9]{64})\/">/)?.[1];assert.equal(revision,identity.build.revision);
const preloads=[...html.matchAll(/<link rel="modulepreload" href="\.\/([^"]+)">/g)].map(m=>m[1]);assert.equal(new Set(preloads).size,preloads.length);
const rangePreloads=preloads.filter(file=>file.startsWith('patches/practice-range/'));
const corePreloads=preloads.filter(file=>!file.startsWith('patches/practice-range/'));
const hasRange=Object.keys(identity.files||{}).some(key=>key.startsWith('practice-range/'));
assert(corePreloads.length<=131,'core preload request budget');
assert(rangePreloads.length<=(hasRange?14:0),'practice-range preload request budget');
const rangePreloadBytes=rangePreloads.reduce((sum,file)=>sum+fs.statSync(path.join(root,file)).size,0);
assert(rangePreloadBytes<=(hasRange?192*1024:0),'practice-range preload byte budget');
const entry=html.match(/<script type="module" src="\.\/([^"]+)"/)?.[1];assert.equal(entry,'patches/loading-cache/runtime/startup.mjs');
const initial=[...new Set([...preloads,entry])];const initialJSBytes=initial.reduce((sum,file)=>sum+fs.statSync(path.join(root,file)).size,0);assert(initialJSBytes<=3.2*1024*1024,'initial JS raw budget');
assert(fs.statSync(path.join(root,entry)).size<=12*1024,'new startup module budget');assert(Buffer.byteLength(html)<=24*1024,'critical HTML budget');
const worker=fs.readFileSync(path.join(root,'sw.js'),'utf8');assert(Buffer.byteLength(worker)<=64*1024,'worker budget');
const ast=parse(worker,{ecmaVersion:'latest',sourceType:'script'});const build=ast.body.find(node=>node.type==='VariableDeclaration'&&node.declarations[0].id.name==='BUILD').declarations[0].init;
const config=JSON.parse(worker.slice(build.start,build.end));assert.equal(config.revision,revision);assert.equal(config.index.sha256,hash(Buffer.from(html)));assert(config.index.bytes===Buffer.byteLength(html));
// The generated manifest stores asset descriptors as compact [bytes, sha256]
// tuples. Decode only after validating the complete shape; never sum undefined.
for(const [file,entry] of Object.entries(config.assets)){
 assert(Array.isArray(entry)&&entry.length===2&&Number.isSafeInteger(entry[0])&&entry[0]>=0&&typeof entry[1]==='string'&&/^[a-f0-9]{64}$/.test(entry[1]),'asset descriptor '+file);
 config.assets[file]={bytes:entry[0],sha256:entry[1]};
}
const core=new Set(config.precache);assert.equal(core.size,config.precache.length);const precacheBytes=config.precache.reduce((sum,file)=>sum+config.assets[file].bytes,0);assert(precacheBytes<=5*1024*1024,'core precache budget');assert(config.declaredBytes<=12*1024*1024,'revision payload budget');
const importMap=JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
const resolve=(from,spec)=>{for(const[k,v]of Object.entries(importMap).sort((a,b)=>b[0].length-a[0].length))if(k.endsWith('/')?spec.startsWith(k):spec===k)return path.posix.normalize(v.replace(/^\.\//,'')+(k.endsWith('/')?spec.slice(k.length):''));return spec.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(from),spec)):null;};
for(const file of core){
 const bytes=fs.readFileSync(path.join(root,'_versions',revision,file));assert.equal(hash(bytes),config.assets[file].sha256,'cache digest '+file);assert.equal(bytes.length,config.assets[file].bytes);
 if(/\.m?js$/.test(file)){
  const program=parse(bytes.toString(),{ecmaVersion:'latest',sourceType:'module'});
  for(const imp of program.body.filter(n=>['ImportDeclaration','ExportAllDeclaration','ExportNamedDeclaration'].includes(n.type)&&n.source)){
   const target=resolve(file,imp.source.value);assert(target&&core.has(target),`core static dependency missing: ${file} -> ${target}`);
  }
 }
 if(file.endsWith('.css'))for(const match of bytes.toString().matchAll(/@import\s*(?:url\()?['"]([^'"]+)['"]/g))assert(core.has(resolve(file,'./'+match[1])),`CSS import missing: ${file} -> ${match[1]}`);
}
for(const file of Object.keys(config.assets)){assert(!file.includes('..'));const bytes=fs.readFileSync(path.join(root,'_versions',revision,file));assert.equal(hash(bytes),config.assets[file].sha256);}
assert(!fs.readFileSync(path.join(root,'src/main.js'),'utf8').includes('.png?h='),'lightmap URL must match precache');
assert(!html.includes('navigator.serviceWorker.register'),'single runtime registration owner');
console.log(JSON.stringify({status:'passed',revision,initialJSRequests:initial.length,modulePreloads:preloads.length,coreModulePreloads:corePreloads.length,practiceRangeModulePreloads:rangePreloads.length,practiceRangePreloadBytes:rangePreloadBytes,initialJSBytes,criticalHTMLBytes:Buffer.byteLength(html),precacheCount:core.size,precacheBytes,workerBytes:Buffer.byteLength(worker),declaredBytes:config.declaredBytes,measurementKind:'deterministic file and dependency gates; not native browser timings'},null,2));
