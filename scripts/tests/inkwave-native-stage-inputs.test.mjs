import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {nativeStageIdentity,NATIVE_ROOT} from '../lib/inkwave-native-stages.mjs';
const root=path.resolve(process.env.NATIVE_INPUT_ROOT||fileURLToPath(new URL('../../',import.meta.url)));
const {catalogInputPath,validateCatalogInputReceipts}=await import(pathToFileURL(path.join(root,'scripts/check-inkwave-motion-catalog.mjs')));
const {verifyRuntimeBuild,hash}=await import(pathToFileURL(path.join(root,'scripts/lib/inkwave-runtime-evidence.mjs')));
const native=nativeStageIdentity(),read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const malformed=['native-stage/adapter.mjs','foreign/adapter.mjs','native-stages/../adapter.mjs','native-stages//adapter.mjs','native-stages/./adapter.mjs','native-stages/runtime\\escape.mjs'];
// Execute the actual small mapping expressions/callbacks without starting their
// top-level browser runners. Mock bytes serve ONLY mapping-unit checks; real
// committed receipts and all native source bytes are verified in the tests below.
function mappings(){
 const sandbox={assert,path,ROOT:'/repo',repo:'/repo',source:'/repo/inkwave-public',inside:(a,b)=>b.startsWith(a+'/'),hash:()=> 'digest',fs:{realpathSync:p=>path.resolve(p),readFileSync:()=>''}};
 const result={catalog:catalogInputPath};
 for(const [label,rel,prefix,arg]of[
  ['network','scripts/check-inkwave-network-browser.mjs','const files=Object.entries(build.files).map(',['key','digest']],
  ['paint','scripts/check-inkwave-paint-mask.mjs','const files = Object.entries(build.files).map(',['key','digest']],
  ['runtime','scripts/lib/inkwave-runtime-evidence.mjs','const inputs=Object.entries(manifest.files).map(',['key','digest']],
  ['flow','scripts/check-inkwave-flow-render.mjs','const files = Object.entries(manifest.files).map(',['key','digest']],
  ['wall','scripts/check-inkwave-wall-render.mjs','const files = Object.entries(manifest.files).map(',['key','digest']],
 ]){
  const source=read(rel),start=source.indexOf(prefix);assert(start>=0,rel);const from=start+prefix.length;const end=source.indexOf('});',from);assert(end>from,rel);
  const context={...sandbox};const literal=source.match(/const (roots|namespaces)\s*=\s*(\{[^;]+\});/);if(literal)context[literal[1]]=vm.runInNewContext('('+literal[2]+')');
  const fn=vm.runInNewContext('('+source.slice(from,end+1)+')',context);
  result[label]=key=>{const value=fn([key,'digest']);return Array.isArray(value)?value[0]:value;};
 }
 const source=read('scripts/check-inkwave-touch-layout-identity.mjs'),start=source.indexOf('const sourcePath = '),end=source.indexOf('\n};',start);assert(start>=0&&end>start);const fn=vm.runInNewContext('('+source.slice(start+'const sourcePath = '.length,end+2)+')',sandbox);result.touch=key=>fn(key)[0];return result;
}
test('all seven actual input mappers accept only the canonical native-stage namespace',()=>{
 const maps=mappings();assert.equal(Object.keys(maps).length,7);
 for(const [name,map]of Object.entries(maps)){
  for(const file of Object.keys(native))assert.equal(map('native-stages/'+file),'patches/native-stages/'+file,name+' '+file);
  for(const key of malformed)assert.throws(()=>map(key),undefined,name+' rejects '+key);
 }
});
test('catalog binds every declared native source byte and rejects forged or missing receipts',()=>{
 const files=Object.fromEntries(Object.entries(native).map(([f,h])=>['native-stages/'+f,h]));
 const manifest={files,inputHash:hash(JSON.stringify(files))};
 const receipts=Object.entries(native).map(([file,sha256])=>{const bytes=fs.readFileSync(path.join(NATIVE_ROOT,file));assert.equal(hash(bytes),sha256);return{key:'native-stages/'+file,file:catalogInputPath('native-stages/'+file),sha256,committedSHA256:sha256,bytes:bytes.length};});
 assert(receipts.some(r=>r.key==='native-stages/adapter.mjs'));assert(receipts.some(r=>r.key==='native-stages/runtime/source-worker.mjs'));assert.doesNotThrow(()=>validateCatalogInputReceipts(manifest,receipts));
 assert.throws(()=>validateCatalogInputReceipts(manifest,receipts.slice(1)),/denominator/);
 assert.throws(()=>validateCatalogInputReceipts(manifest,receipts.map((r,i)=>i? r:{...r,committedSHA256:'0'.repeat(64)})),/committed source input identity/);
});
test('native build receipts require exact committed bytes; forged manifest and traversal stay rejected',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'native-input-receipts-')),repo=path.join(tmp,'repo'),site=path.join(tmp,'site');fs.mkdirSync(repo);fs.mkdirSync(site);
 try{
  for(const file of Object.keys(native)){const target=path.join(repo,'patches/native-stages',file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(NATIVE_ROOT,file),target);}
  fs.mkdirSync(path.join(repo,'scripts'));fs.writeFileSync(path.join(repo,'scripts/build-inkwave.mjs'),'// builder fixture');fs.writeFileSync(path.join(site,'probe.js'),'// artifact fixture');
  const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();git('init','--quiet');git('add','.');git('-c','user.name=Input test','-c','user.email=input-test@example.invalid','commit','--quiet','-m','committed native inputs');const sha=git('rev-parse','HEAD');
  const artifacts={'probe.js':hash('// artifact fixture')},good={artifacts,contentHash:hash(JSON.stringify(artifacts)),files:Object.fromEntries(Object.entries(native).map(([f,h])=>['native-stages/'+f,h])),build:{script:hash('// builder fixture')}};
  const save=m=>fs.writeFileSync(path.join(site,'inkwave-build.json'),JSON.stringify(m));save(good);assert.doesNotThrow(()=>verifyRuntimeBuild(site,repo,sha));
  const changed=path.join(repo,'patches/native-stages/adapter.mjs');fs.appendFileSync(changed,'\n// uncommitted change');const forged=structuredClone(good);forged.files['native-stages/adapter.mjs']=hash(fs.readFileSync(changed));save(forged);assert.throws(()=>verifyRuntimeBuild(site,repo,sha),/Build differs from source SHA: patches\/native-stages\/adapter.mjs/);
  for(const key of malformed){const invalid=structuredClone(good);invalid.files[key]=hash('fake');save(invalid);assert.throws(()=>verifyRuntimeBuild(site,repo,sha),/Unknown input/);}
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
