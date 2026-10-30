import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {HEAD,FRAMES} from './capture-main91-blast.mjs';
const [mode,source,qa,out]=process.argv.slice(2);
const git=(dir,...args)=>execFileSync('git',['-C',dir,...args],{encoding:'utf8'}).trim();
const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(git(source,'rev-parse','HEAD'),HEAD);
assert.equal(git(source,'status','--porcelain','--untracked-files=no'),'');
const reviewedScripts={
 'run-main91-blast.mjs':'be301892fc218cb6cd6cfd58a576cfc4d298012f248be2ae7731a01769d5af0f',
 'capture-main91-blast.mjs':'97de633af2b28f6d8ad6bb337f06ca363749f6abc76a98d3dca000961a9b8fdd'
};
const scripts=Object.fromEntries([...Object.keys(reviewedScripts),'verify-blast-artifacts.mjs'].map(f=>[f,hash(fs.readFileSync(new URL(f,import.meta.url)))]));
for(const [file,expected] of Object.entries(reviewedScripts))assert.equal(scripts[file],expected,'reviewed QA script '+file);
const qaHead=git(qa,'rev-parse','HEAD');
assert.match(process.env.EXPECTED_QA_SHA||'',/^[0-9a-f]{40}$/,'workflow must bind immutable QA SHA');
assert.equal(qaHead,process.env.EXPECTED_QA_SHA,'QA checkout must equal event head');
const lockSHA256=hash(fs.readFileSync(path.join(source,'package-lock.json')));
if(mode==='provenance'){
 const receipt={sourceHead:HEAD,qaHead,sourceTrackedClean:true,lockSHA256,scripts,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,checkedAt:new Date().toISOString(),scope:'isolated main0cc5 blast comparison; not PR1918/1919 checks, Ready transition, product change or merge'};
 fs.writeFileSync(path.join(out,'provenance.json'),JSON.stringify(receipt,null,2));
}else{
 assert.equal(mode,'verify');
 const provenance=JSON.parse(fs.readFileSync(path.join(out,'provenance.json')));
 assert.equal(provenance.sourceHead,HEAD);assert.equal(provenance.qaHead,qaHead);
 assert.equal(provenance.sourceTrackedClean,true);assert.equal(provenance.lockSHA256,lockSHA256);
 assert.deepEqual(provenance.scripts,scripts,'QA scripts unchanged since provenance');
 assert.equal(provenance.runId,process.env.GITHUB_RUN_ID);assert.equal(provenance.runAttempt,process.env.GITHUB_RUN_ATTEMPT);
 const capture=JSON.parse(fs.readFileSync(path.join(out,'capture-receipt.json')));
 const driver=JSON.parse(fs.readFileSync(path.join(out,'driver-receipt.json')));
 assert.equal(capture.head,HEAD);assert.equal(driver.head,HEAD);
 assert.equal(capture.status,'captured-not-reviewed');assert.equal(driver.status,'captured-not-reviewed');
 assert.equal(capture.expectedContentHash,driver.manifestHash);
 assert.equal(capture.cases.length,2);
 const expected=['blast-only','blast-roll'].flatMap(prefix=>FRAMES.map(f=>`${prefix}-F${String(f).padStart(2,'0')}.png`)).sort();
 assert.deepEqual(fs.readdirSync(out).filter(f=>f.endsWith('.png')).sort(),expected);
 const records=capture.cases.flatMap(c=>c.captures);assert.equal(records.length,16);
 assert.deepEqual(records.map(r=>r.file).sort(),expected);
 for(const r of records){const bytes=fs.readFileSync(path.join(out,r.file));assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(hash(bytes),r.sha256);assert.equal(bytes.readUInt32BE(16),1280);assert.equal(bytes.readUInt32BE(20),720);}
 fs.writeFileSync(path.join(out,'artifact-verification.json'),JSON.stringify({sourceHead:HEAD,count:16,hashesVerified:true,visualReview:'pending',checkedAt:new Date().toISOString()},null,2));
}
