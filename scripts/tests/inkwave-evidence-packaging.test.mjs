import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {packageEvidence} from '../ci/package-inkwave-evidence.mjs';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const fixture=()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'recovery-evidence-')),input=path.join(root,'original'),output=path.join(root,'bounded');fs.mkdirSync(input);return {root,input,output};};
test('at the limit submits identical full originals; one byte over produces a failed bounded package',async()=>{
 const f=fixture();try{fs.writeFileSync(path.join(f.input,'record.bin'),Buffer.alloc(4096,7));const before=fs.readFileSync(path.join(f.input,'record.bin'));
 const full=await packageEvidence(f.input,{output:f.output,limit:4096});assert.equal(full.path,f.input);assert.equal(full.failed,false);assert.equal(full.submittedBytes,4096);assert(!fs.existsSync(f.output));
 const bounded=await packageEvidence(f.input,{output:f.output,limit:4095,sourceSha:'a'.repeat(40)});assert.equal(bounded.failed,true);assert.equal(bounded.eligible,true);assert(bounded.submittedBytes<=4095);assert.deepEqual(fs.readFileSync(path.join(f.input,'record.bin')),before);assert.equal(bounded.manifest.files[0].sha256,hash(before));assert.equal(bounded.manifest.files[0].reason,'artifact-budget');
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('over-budget selection preserves logs, error identity, final PNG and complete omission hashes',async()=>{
 const f=fixture();try{const files={'source/tests.log':'failure log\n','stage/result.json':'{"status":"failed"}','stage/failure-last.png':Buffer.alloc(100,3),'stage/huge.bin':Buffer.alloc(100000,9)};for(const [name,bytes]of Object.entries(files)){fs.mkdirSync(path.dirname(path.join(f.input,name)),{recursive:true});fs.writeFileSync(path.join(f.input,name),bytes);}
 const result=await packageEvidence(f.input,{output:f.output,limit:16384,sourceSha:'b'.repeat(40)});assert(result.failed&&result.overBudget);assert(result.submittedBytes<=16384);for(const name of ['source/tests.log','stage/result.json','stage/failure-last.png'])assert.equal(hash(fs.readFileSync(path.join(f.output,'files',name))),hash(files[name]));
 const omitted=result.manifest.files.find(row=>row.path==='stage/huge.bin');assert.equal(omitted.reason,'artifact-budget');assert.equal(omitted.bytes,100000);assert.equal(omitted.sha256,hash(files['stage/huge.bin']));assert.equal(result.manifest.sourceSha,'b'.repeat(40));
 const again=await packageEvidence(f.input,{output:f.output,limit:16384,sourceSha:'b'.repeat(40)});assert.deepEqual(again.manifest,result.manifest);
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('single giant log retains a marked tail; empty or unsupported evidence still submits a failed manifest',async()=>{
 const f=fixture();try{fs.writeFileSync(path.join(f.input,'tests.log'),'start\n'+'x'.repeat(50000)+'\nlast failure');const result=await packageEvidence(f.input,{output:f.output,limit:8192});assert(result.submittedBytes<=8192);const row=result.manifest.files[0];assert.equal(row.disposition,'tail-copy');assert(fs.readFileSync(path.join(f.output,row.submittedPath),'utf8').endsWith('last failure'));assert(row.originalByteOffset>0);
 fs.unlinkSync(path.join(f.input,'tests.log'));const empty=await packageEvidence(f.input,{output:f.output,limit:8192});assert(empty.failed&&empty.eligible);assert.equal(empty.manifest.status,'no-evidence');
 fs.symlinkSync(f.root,path.join(f.input,'outside'));const unsupported=await packageEvidence(f.input,{output:f.output,limit:8192});assert(unsupported.failed);assert.equal(unsupported.manifest.files[0].reason,'non-regular-file');
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('CLI publishes upload eligibility and path before preserving the failed budget status',()=>{
 const f=fixture();try{fs.writeFileSync(path.join(f.input,'tests.log'),'x'.repeat(10000));const output=path.join(f.root,'github-output');const run=spawnSync(process.execPath,[new URL('../ci/package-inkwave-evidence.mjs',import.meta.url).pathname,f.input,f.output],{env:{...process.env,GITHUB_OUTPUT:output,INKWAVE_ARTIFACT_LIMIT_BYTES:'4096'},encoding:'utf8'});assert.equal(run.status,1,run.stderr);assert.match(fs.readFileSync(output,'utf8'),/eligible=true\npath=/);assert(fs.existsSync(path.join(f.output,'EVIDENCE_MANIFEST.json')));
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});

import {packageBrowserFailureEvidence} from '../ci/package-inkwave-evidence.mjs';
test('browser failure budget retains failed viewport images and diagnostics before passed captures',async()=>{
 const f=fixture();try{
  const failed='responsive/cases/webkit-small-phone';
  const passed='responsive/cases/chromium-desktop';
  const files={
   'responsive/responsive-result.json':JSON.stringify({status:'failed',shards:[{engine:'webkit',name:'small-phone',ok:false},{engine:'chromium',name:'desktop',ok:true}]}),
   [failed+'/diagnostic-progress.json']:JSON.stringify({pendingOperation:'setup-stage-settle',firstError:{message:'page crashed'}}),
   [failed+'/child-stderr.txt']:'WebProcess failed',
   [failed+'/last-frame.png']:Buffer.alloc(8192,7),
   [passed+'/passed.png']:Buffer.alloc(8192,9),
  };
  for(const [name,body]of Object.entries(files)){
   fs.mkdirSync(path.dirname(path.join(f.input,name)),{recursive:true});fs.writeFileSync(path.join(f.input,name),body);
  }
  fs.utimesSync(path.join(f.input,failed+'/last-frame.png'),1,1);
  fs.utimesSync(path.join(f.input,passed+'/passed.png'),2,2);
  const result=await packageBrowserFailureEvidence(f.input,{output:f.output,limit:16384,sourceSha:'c'.repeat(40)});
  assert.equal(result.failed,true);assert(result.submittedBytes<=16384);
  for(const name of [failed+'/last-frame.png',failed+'/diagnostic-progress.json',failed+'/child-stderr.txt']){
   const row=result.manifest.files.find(row=>row.path===name);assert.equal(row.disposition,'copied');
   assert.equal(hash(fs.readFileSync(path.join(f.output,row.submittedPath))),hash(files[name]));
  }
  const omitted=result.manifest.files.find(row=>row.path===passed+'/passed.png');
  assert.equal(omitted.disposition,'omitted');assert.equal(omitted.sha256,hash(files[passed+'/passed.png']));
  assert.equal(result.manifest.sourceSha,'c'.repeat(40));
  assert.equal(hash(fs.readFileSync(path.join(f.input,passed+'/passed.png'))),omitted.sha256,'originals remain intact');
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});

test('failed Wiper receipt and its original PNGs outrank large catalog JSON without relaxing the budget',async()=>{
 const f=fixture();try{
  const png=Buffer.alloc(4096,7),receipt=JSON.stringify({status:'failed',kind:'controlled-native-wiper-visual-acceptance',cases:[{frames:[{images:[{file:'normal-charged-f01-native-postprocessed.png'}]}]}]});
  const files={'catalog/motion-catalog-result.json':'x'.repeat(12000),'wiper-native/wiper-native-result.json':receipt,'wiper-native/normal-charged-f01-native-postprocessed.png':png,'catalog/escape.png':Buffer.alloc(4096,8)};
  for(const [name,body] of Object.entries(files)){const file=path.join(f.input,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,body);}
  const result=await packageBrowserFailureEvidence(f.input,{output:f.output,limit:16384,sourceSha:'d'.repeat(40)});
  assert.equal(result.failed,true);assert.equal(result.overBudget,true);assert(result.submittedBytes<=16384);
  for(const name of ['wiper-native/wiper-native-result.json','wiper-native/normal-charged-f01-native-postprocessed.png']){
   const row=result.manifest.files.find(row=>row.path===name);assert.equal(row.disposition,'copied');assert.equal(hash(fs.readFileSync(path.join(f.output,row.submittedPath))),hash(files[name]));
  }
  assert.equal(result.manifest.files.find(row=>row.path==='catalog/motion-catalog-result.json').disposition,'omitted');
  assert.equal(result.manifest.files.find(row=>row.path==='catalog/escape.png').disposition,'copied' /* spare capacity, not preferred */);
  assert.equal(hash(fs.readFileSync(path.join(f.input,'catalog/motion-catalog-result.json'))),hash(files['catalog/motion-catalog-result.json']));
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});

test('priority survives inventory trimming and duplicate receipt references',async()=>{
 const f=fixture();try{
  for(let i=0;i<130;i++)fs.writeFileSync(path.join(f.input,`a-${String(i).padStart(3,'0')}.json`),'x');
  const dir=path.join(f.input,'wiper-native');fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'one.png'),Buffer.alloc(100,5));
  fs.writeFileSync(path.join(dir,'wiper-native-result.json'),JSON.stringify({status:'failed',kind:'controlled-native-wiper-visual-acceptance',cases:[{frames:[{images:[{file:'one.png'},{file:'one.png'}]}]}]}));
  fs.writeFileSync(path.join(f.input,'large.json'),Buffer.alloc(20000));
  const r=await packageBrowserFailureEvidence(f.input,{output:f.output,limit:8192});assert(r.failed&&r.overBudget);assert(r.submittedBytes<=8192);assert(r.manifest.omittedInventoryEntries>0);
  for(const name of ['wiper-native/wiper-native-result.json','wiper-native/one.png'])assert.equal(r.manifest.files.find(x=>x.path===name)?.disposition,'copied');
  assert.equal(r.manifest.files.filter(x=>x.path==='wiper-native/one.png').length,1);
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('receipt and image symlinks are not followed, traversal names do not obtain priority',async()=>{
 const f=fixture();try{
  const outside=path.join(f.root,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'private.png'),Buffer.alloc(900,7));
  const dir=path.join(f.input,'wiper-native');fs.mkdirSync(dir);fs.symlinkSync(path.join(outside,'private.png'),path.join(dir,'link.png'));
  fs.writeFileSync(path.join(dir,'wiper-native-result.json'),JSON.stringify({status:'failed',kind:'controlled-native-wiper-visual-acceptance',cases:[{frames:[{images:[{file:'link.png'},{file:'../../outside/private.png'},{file:'/tmp/private.png'}]}]}]}));
  fs.writeFileSync(path.join(f.input,'big.json'),Buffer.alloc(10000));const r=await packageBrowserFailureEvidence(f.input,{output:f.output,limit:4096});
  assert(r.failed);assert(r.submittedBytes<=4096);assert.equal(r.manifest.files.find(x=>x.path==='wiper-native/link.png').reason,'non-regular-file');
  assert(!r.manifest.files.some(x=>x.path.includes('..')||x.path.includes('private.png')));assert(!fs.existsSync(path.join(f.output,'files/wiper-native/link.png')));
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('symlinked receipt or directory is never preferred or followed',async()=>{
 for(const target of ['receipt','directory']){const f=fixture();try{
  const outside=path.join(f.root,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'wiper-native-result.json'),JSON.stringify({status:'failed',kind:'controlled-native-wiper-visual-acceptance',cases:[]}));
  if(target==='directory')fs.symlinkSync(outside,path.join(f.input,'wiper-native'));else{fs.mkdirSync(path.join(f.input,'wiper-native'));fs.symlinkSync(path.join(outside,'wiper-native-result.json'),path.join(f.input,'wiper-native/wiper-native-result.json'));}
  const r=await packageBrowserFailureEvidence(f.input,{output:f.output,limit:4096});assert(r.failed);assert(r.manifest.files.some(x=>x.reason==='non-regular-file'));assert(r.submittedBytes<=4096);
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}}
});
test('symlinked evidence root or output ancestor is rejected before writes',async()=>{
 const f=fixture();try{const alias=path.join(f.root,'alias');fs.symlinkSync(f.input,alias);await assert.rejects(packageBrowserFailureEvidence(alias,{output:f.output,limit:4096}),/symlinks/);await assert.rejects(packageBrowserFailureEvidence(f.input,{output:path.join(alias,'child'),limit:4096}),/symlinks/);assert(!fs.existsSync(path.join(f.input,'child')));}
 finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('browser CLI still signals over-budget failure after writing upload path',()=>{
 const f=fixture();try{fs.writeFileSync(path.join(f.input,'big.json'),Buffer.alloc(10000));const out=path.join(f.root,'github-output');const run=spawnSync(process.execPath,[new URL('../ci/package-inkwave-evidence.mjs',import.meta.url).pathname,'--browser-failure',f.input,f.output],{env:{...process.env,GITHUB_OUTPUT:out,INKWAVE_ARTIFACT_LIMIT_BYTES:'4096'},encoding:'utf8'});assert.equal(run.status,1);assert.match(fs.readFileSync(out,'utf8'),/eligible=true\npath=/);assert(fs.existsSync(path.join(f.output,'EVIDENCE_MANIFEST.json')));}
 finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('malformed failed receipt grants no partial PNG priority',async()=>{
 const f=fixture();try{const d=path.join(f.input,'wiper-native');fs.mkdirSync(d);fs.writeFileSync(path.join(d,'a.png'),Buffer.alloc(4000));fs.writeFileSync(path.join(d,'wiper-native-result.json'),JSON.stringify({status:'failed',kind:'controlled-native-wiper-visual-acceptance',cases:[{frames:[{images:[{file:'a.png'}]}]},{frames:'invalid'}]}));fs.writeFileSync(path.join(f.input,'other.json'),Buffer.alloc(5000));const r=await packageBrowserFailureEvidence(f.input,{output:f.output,limit:8192});assert(r.failed);assert.equal(r.manifest.files.find(x=>x.path==='wiper-native/a.png').disposition,'omitted');}
 finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('an individually oversized linked image is omitted rather than exceeding budget',async()=>{
 const f=fixture();try{const d=path.join(f.input,'wiper-native');fs.mkdirSync(d);fs.writeFileSync(path.join(d,'big.png'),Buffer.alloc(10000));fs.writeFileSync(path.join(d,'wiper-native-result.json'),JSON.stringify({status:'failed',kind:'controlled-native-wiper-visual-acceptance',cases:[{frames:[{images:[{file:'big.png'}]}]}]}));const r=await packageBrowserFailureEvidence(f.input,{output:f.output,limit:4096});assert(r.failed&&r.overBudget);assert(r.submittedBytes<=4096);assert.equal(r.manifest.files.find(x=>x.path==='wiper-native/wiper-native-result.json').disposition,'copied');assert.equal(r.manifest.files.find(x=>x.path==='wiper-native/big.png').reason,'artifact-budget');}
 finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('duplicate injected build identity path is rejected',async()=>{
 const f=fixture();try{fs.mkdirSync(path.join(f.input,'build'));fs.writeFileSync(path.join(f.input,'build/inkwave-build.json'),'a');fs.writeFileSync(path.join(f.input,'large.bin'),Buffer.alloc(5000));const id=path.join(f.root,'manifest.json');fs.writeFileSync(id,'b');await assert.rejects(packageEvidence(f.input,{output:f.output,limit:4096,buildIdentity:id}),/Duplicate build evidence path/);}
 finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('failed Wiper receipt and linked PNG precede even a giant log tail',async()=>{
 const f=fixture();try{const d=path.join(f.input,'wiper-native');fs.mkdirSync(d);fs.writeFileSync(path.join(d,'small.png'),Buffer.alloc(1000,7));fs.writeFileSync(path.join(d,'wiper-native-result.json'),JSON.stringify({status:'failed',kind:'controlled-native-wiper-visual-acceptance',cases:[{frames:[{images:[{file:'small.png'}]}]}]}));fs.writeFileSync(path.join(f.input,'a.log'),Buffer.alloc(20000));const r=await packageBrowserFailureEvidence(f.input,{output:f.output,limit:4096});assert(r.failed&&r.overBudget);assert(r.submittedBytes<=4096);for(const p of ['wiper-native/wiper-native-result.json','wiper-native/small.png'])assert.equal(r.manifest.files.find(x=>x.path===p)?.disposition,'copied');assert.equal(r.manifest.files.find(x=>x.path==='a.log').disposition,'tail-copy');}
 finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('invalid mixed image paths and types invalidate all receipt-derived priority',async()=>{
 for(const bad of ['../escape.png','/tmp/outside.png','dir\\escape.png',42,null,{},'a.jpg']){const f=fixture();try{const d=path.join(f.input,'wiper-native');fs.mkdirSync(d);fs.writeFileSync(path.join(d,'a.png'),Buffer.alloc(4000));fs.writeFileSync(path.join(d,'wiper-native-result.json'),JSON.stringify({status:'failed',kind:'controlled-native-wiper-visual-acceptance',cases:[{frames:[{images:[{file:'a.png'},typeof bad==='object'?bad:{file:bad}]}]}]}));fs.writeFileSync(path.join(f.input,'other.json'),Buffer.alloc(5000));const r=await packageBrowserFailureEvidence(f.input,{output:f.output,limit:8192});assert(r.failed);assert.equal(r.manifest.files.find(x=>x.path==='wiper-native/a.png')?.disposition,'omitted',JSON.stringify(bad));assert(r.submittedBytes<=8192);}
 finally{fs.rmSync(f.root,{recursive:true,force:true});}}
});
test('all six receipt-linked Wiper images fit before unlinked catalog evidence',async()=>{
 const f=fixture();try{const d=path.join(f.input,'wiper-native');fs.mkdirSync(d);const names=Array.from({length:6},(_,i)=>`frame-${i}.png`);for(const name of names)fs.writeFileSync(path.join(d,name),Buffer.alloc(500,9));fs.writeFileSync(path.join(d,'wiper-native-result.json'),JSON.stringify({status:'failed',kind:'controlled-native-wiper-visual-acceptance',cases:[{frames:[{images:names.map(file=>({file}))}]}]}));fs.writeFileSync(path.join(f.input,'catalog.json'),Buffer.alloc(16000));const r=await packageBrowserFailureEvidence(f.input,{output:f.output,limit:8192});assert(r.failed&&r.overBudget);assert(r.submittedBytes<=8192);for(const name of names)assert.equal(r.manifest.files.find(x=>x.path==='wiper-native/'+name)?.disposition,'copied');assert.equal(r.manifest.files.find(x=>x.path==='catalog.json').disposition,'omitted');}
 finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
