import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {compareBlastAB} from './compare-blast-ab.mjs';
const [root,expectedQA,shardArg]=process.argv.slice(2);
const shard=Number(shardArg);assert.ok(Number.isInteger(shard)&&shard>=0&&shard<8,'exact shard 0..7 required');
assert.ok(root);assert.match(expectedQA||'',/^[a-f0-9]{40}$/);
const hash=b=>createHash('sha256').update(b).digest('hex');
const frames=[0,1,3,5,9,13,21,29];
const pngNames=['blast-only','blast-roll'].flatMap(p=>frames.map(f=>p+'-F'+String(f).padStart(2,'0')+'.png')).sort();
const jsonNames=['capture-receipt.json','driver-receipt.json','provenance.json','artifact-verification.json','regression-receipt.json','standard-launcher.json'];
const files=[],lanes={};let totalBytes=0;
for(const variant of ['baseline','candidate']){
 const dir=path.resolve(root,variant),receipts={};
 for(const name of jsonNames){const b=fs.readFileSync(path.join(dir,name));assert.ok(b.length<=8*1024*1024,'bounded JSON '+name);receipts[name]=JSON.parse(b.toString('utf8'));files.push({variant,name,bytes:b});}
 const p=receipts['provenance.json'],r=receipts['regression-receipt.json'];
 const expectedSource=variant==='baseline'?'0cc5ce3712f93c275095d36c1f35ffdbd8565e2e':expectedQA;
 const capture=receipts['capture-receipt.json'],driver=receipts['driver-receipt.json'],verification=receipts['artifact-verification.json'];
 for(const record of [capture,driver])assert.equal(record.head,expectedSource,'exact source head before export');
 for(const record of [p,r,verification])assert.equal(record.sourceHead,expectedSource,'exact source head before export');
 for(const record of [capture,driver,p,r,verification])assert.equal(record.variant,variant,'exact variant before export');
 assert.equal(capture.status,'captured-not-reviewed');assert.equal(driver.status,'captured-not-reviewed');
 assert.equal(verification.hashesVerified,true);assert.equal(verification.count,16);
 assert.equal(capture.expectedContentHash,driver.manifestHash);assert.match(driver.manifestHash,/^[a-f0-9]{64}$/);
 assert.equal(p.qaHead,expectedQA);assert.equal(p.runId,process.env.GITHUB_RUN_ID);assert.equal(p.runAttempt,process.env.GITHUB_RUN_ATTEMPT);
 for(const [name,sha]of Object.entries(p.scripts)){assert.equal(path.basename(name),name);assert.equal(hash(fs.readFileSync(new URL('./'+name,import.meta.url))),sha,'current QA byte binding '+name);}
 assert.deepEqual(r.routing,{source:'passed',emitted:'passed'});
 assert.equal(r.authorityFixture.file,'test-blaster-knockback-authority.mjs');
 assert.equal(r.authorityFixture.sha256,p.scripts[r.authorityFixture.file]);
 assert.equal(r.authorityFixture.source,'passed');assert.equal(r.authorityFixture.emitted,'passed');
 assert.deepEqual(r.qaContracts,['verify-blast-clocks.test.mjs','audio-request-trace.test.mjs']);
 assert.deepEqual(fs.readdirSync(dir).filter(n=>n.endsWith('.png')).sort(),pngNames);
 const captures=receipts['capture-receipt.json'].cases.flatMap(c=>c.captures),dimensions={};
 assert.equal(captures.length,16);
 for(const name of pngNames){
  const b=fs.readFileSync(path.join(dir,name));assert.ok(b.length>24&&b.length<=8*1024*1024,'bounded PNG '+name);
  assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  const matches=captures.filter(c=>c.file===name);assert.equal(matches.length,1);assert.equal(hash(b),matches[0].sha256,name);
  dimensions[name]=[b.readUInt32BE(16),b.readUInt32BE(20)];assert.deepEqual(dimensions[name],[1280,720]);
  files.push({variant,name,bytes:b});
 }
 lanes[variant]={capture:receipts['capture-receipt.json'],driver:receipts['driver-receipt.json'],provenance:p,verification:receipts['artifact-verification.json'],regression:r,pngDimensions:dimensions};
}
for(const f of files)totalBytes+=f.bytes.length;
assert.ok(totalBytes<=64*1024*1024,'bounded total evidence; never silently truncate');
const selectedPng=files.filter(f=>f.name.endsWith('.png')).slice(shard*4,shard*4+4);
const selected=[...(shard===0?files.filter(f=>f.name.endsWith('.json')):[]),...selectedPng];
const exportedBytes=selected.reduce((sum,f)=>sum+f.bytes.length,0);
assert.ok(exportedBytes<=12*1024*1024,'bounded per-job log: split required, no truncation');
const emit=o=>new Promise((resolve,reject)=>process.stdout.write('BLAST_AB_V1 '+JSON.stringify(o)+'\n',error=>error?reject(error):resolve()));
await emit({kind:'begin',exporterSHA256:hash(fs.readFileSync(new URL(import.meta.url))),comparatorSHA256:hash(fs.readFileSync(new URL('./compare-blast-ab.mjs',import.meta.url))),qaHead:expectedQA,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,shard,shards:8,fileCount:selected.length,pngCount:4,totalBytes:exportedBytes,allEvidenceBytes:totalBytes,encoding:'base64',chunkChars:16384,scope:'original artifact bytes; no image transformation; visual review not performed'});
for(const f of selected){
 const encoded=f.bytes.toString('base64'),chunks=Math.ceil(encoded.length/16384),sha256=hash(f.bytes);
 await emit({kind:'file',variant:f.variant,name:f.name,length:f.bytes.length,sha256,chunks});
 for(let index=0;index<chunks;index++)await emit({kind:'chunk',variant:f.variant,name:f.name,index,data:encoded.slice(index*16384,(index+1)*16384)});
 await emit({kind:'file-end',variant:f.variant,name:f.name,sha256,chunks});
}
await emit({kind:'complete',shard,shards:8,fileCount:selected.length,pngCount:4,totalBytes:exportedBytes});
let result;
try{result=compareBlastAB(lanes.baseline,lanes.candidate,expectedQA);await emit({kind:'comparison',...result});}
catch(error){await emit({kind:'comparison',conditionsMatch:false,error:String(error.message),visualReview:'pending',performance:'not evaluated'});process.exitCode=1;}
