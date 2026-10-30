import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const [root,expectedQA,shardArg]=process.argv.slice(2),shard=Number(shardArg);
assert.match(expectedQA||'',/^[a-f0-9]{40}$/);assert.ok(Number.isInteger(shard)&&shard>=0&&shard<3);
const hash=b=>createHash('sha256').update(b).digest('hex'),dir=path.resolve(root);
const files=[],json={};
for(const [name,relative] of [['paired-receipt.json','paired/paired-receipt.json'],['provenance.json','provenance.json'],['artifact-verification.json','artifact-verification.json']]){
 const bytes=fs.readFileSync(path.join(dir,relative));assert.ok(bytes.length<=8*1024*1024);json[name]=JSON.parse(bytes);files.push({variant:'candidate',name,bytes});
}
const p=json['provenance.json'],v=json['artifact-verification.json'],r=json['paired-receipt.json'];
assert.equal(p.qaHead,expectedQA);assert.equal(p.sourceHead,expectedQA);assert.equal(p.variant,'candidate');assert.equal(p.sourceTrackedClean,true);assert.equal(p.runId,process.env.GITHUB_RUN_ID);assert.equal(p.runAttempt,process.env.GITHUB_RUN_ATTEMPT);
for(const [name,sha] of Object.entries(p.scripts)){assert.ok(/^[a-z0-9.-]+\.mjs$/.test(name));assert.equal(hash(fs.readFileSync(new URL('./'+name,import.meta.url))),sha,'exact QA script');}
assert.equal(v.sourceHead,expectedQA);assert.equal(v.variant,'candidate');assert.equal(v.hashesVerified,true);assert.equal(v.count,16);assert.deepEqual(v.paired,{count:6,restorationVerified:true,visualReview:'pending'});
assert.equal(r.head,expectedQA);assert.equal(r.variant,'candidate');assert.equal(r.status,'captured-restoration-verified-not-reviewed');assert.deepEqual(r.pairs.map(x=>x.frame),[0,3,9]);
for(const pair of r.pairs){
 assert.equal(pair.restoration.exactPixels,true);assert.equal(pair.restoration.originalPngSHA256,pair.restoration.restoredPngSHA256);
 for(const key of ['originalPngSHA256','restoredPngSHA256','cpuSHA256','nonTargetGPU_SHA256','paintAtlasSHA256'])assert.match(pair.restoration[key],/^[a-f0-9]{64}$/);
 assert.equal(pair.dimensions.format,'image/png');assert.equal(pair.originalAlpha,Math.fround(.92));
 for(const key of ['alpha1','alpha092']){
  const file='blast-only-F'+String(pair.frame).padStart(2,'0')+'-'+key+'.png',m=pair[key];assert.equal(m.file,file);
  const bytes=fs.readFileSync(path.join(dir,'paired',file));assert.ok(bytes.length<=8*1024*1024);assert.equal(bytes.length,m.byteLength);assert.equal(hash(bytes),m.sha256);
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),pair.dimensions.width);assert.equal(bytes.readUInt32BE(20),pair.dimensions.height);
  if(key==='alpha092')assert.equal(m.sha256,pair.restoration.originalPngSHA256);
  files.push({variant:'candidate',name:file,bytes});
 }
}
const png=files.filter(f=>f.name.endsWith('.png'));assert.deepEqual(fs.readdirSync(path.join(dir,'paired')).sort(),files.filter(f=>f.name!=='provenance.json'&&f.name!=='artifact-verification.json').map(f=>f.name).sort());
const selected=[...files.filter(f=>f.name.endsWith('.json')),...png.slice(shard*2,shard*2+2)];
const totalBytes=selected.reduce((n,f)=>n+f.bytes.length,0),allEvidenceBytes=files.reduce((n,f)=>n+f.bytes.length,0);assert.ok(totalBytes<=8*1024*1024);assert.ok(allEvidenceBytes<=32*1024*1024);
const emit=x=>new Promise((resolve,reject)=>process.stdout.write('BLAST_PAIRED_V1 '+JSON.stringify(x)+'\n',e=>e?reject(e):resolve()));
await emit({kind:'begin',exporterSHA256:hash(fs.readFileSync(new URL(import.meta.url))),qaHead:expectedQA,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,shard,shards:3,fileCount:5,pngCount:2,totalBytes,allEvidenceBytes,encoding:'base64',chunkChars:16384,scope:'same-scene same-frame candidate-only alpha sensitivity; original PNG bytes; no separate-build or visual acceptance'});
for(const f of selected){const data=f.bytes.toString('base64'),chunks=Math.ceil(data.length/16384),sha256=hash(f.bytes);await emit({kind:'file',variant:f.variant,name:f.name,length:f.bytes.length,sha256,chunks});for(let index=0;index<chunks;index++)await emit({kind:'chunk',variant:f.variant,name:f.name,index,data:data.slice(index*16384,(index+1)*16384)});await emit({kind:'file-end',variant:f.variant,name:f.name,sha256,chunks});}
await emit({kind:'complete',shard,shards:3,fileCount:5,pngCount:2,totalBytes});
