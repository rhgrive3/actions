import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {HEAD,FRAMES,VARIANT,SHELL_ALPHA} from './capture-main91-blast.mjs';
const [mode,source,qa,out]=process.argv.slice(2);
const git=(dir,...args)=>execFileSync('git',['-C',dir,...args],{encoding:'utf8'}).trim();
const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(git(source,'rev-parse','HEAD'),HEAD);
assert.equal(git(source,'status','--porcelain','--untracked-files=no'),'');
const reviewedScripts={
 'run-main91-blast.mjs':'ebb2151d3f2ca322147e6df5f9e40d31b147befbf103c8b092d1c89e2f01cbe3',
 'capture-main91-blast.mjs':'2c88db12585d98ad73f9e344c3580b42c9990105efcbb62b888d72affbcf6dce'
};
const scripts=Object.fromEntries([...Object.keys(reviewedScripts),'verify-blast-artifacts.mjs'].map(f=>[f,hash(fs.readFileSync(new URL(f,import.meta.url)))]));
for(const [file,expected] of Object.entries(reviewedScripts))assert.equal(scripts[file],expected,'reviewed QA script '+file);
const qaHead=git(qa,'rev-parse','HEAD');
assert.match(process.env.EXPECTED_QA_SHA||'',/^[0-9a-f]{40}$/,'workflow must bind immutable QA SHA');
assert.equal(qaHead,process.env.EXPECTED_QA_SHA,'QA checkout must equal event head');
const lockSHA256=hash(fs.readFileSync(path.join(source,'package-lock.json')));
if(mode==='provenance'){
 const receipt={sourceHead:HEAD,variant:VARIANT,shellAlpha:SHELL_ALPHA,qaHead,sourceTrackedClean:true,lockSHA256,scripts,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,checkedAt:new Date().toISOString(),scope:'isolated ordinary blaster alpha A/B on pinned main0cc5 baseline and QA-only candidate; not product main merge'};
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
 assert.equal(capture.variant,VARIANT);assert.equal(driver.variant,VARIANT);assert.equal(capture.shellAlpha,SHELL_ALPHA);assert.equal(driver.shellAlpha,SHELL_ALPHA);
 const regression=JSON.parse(fs.readFileSync(path.join(out,'regression-receipt.json')));assert.equal(regression.sourceHead,HEAD);assert.equal(regression.variant,VARIANT);assert.equal(regression.source,'passed');assert.equal(regression.emitted,'passed');assert.equal(regression.tests.length,5);
 assert.equal(capture.status,'captured-not-reviewed');assert.equal(driver.status,'captured-not-reviewed');
 assert.equal(capture.expectedContentHash,driver.manifestHash);
 assert.equal(capture.cases.length,2);
 const expected=['blast-only','blast-roll'].flatMap(prefix=>FRAMES.map(f=>`${prefix}-F${String(f).padStart(2,'0')}.png`)).sort();
 assert.deepEqual(fs.readdirSync(out).filter(f=>f.endsWith('.png')).sort(),expected);
 const records=capture.cases.flatMap(c=>c.captures);assert.equal(records.length,16);
 assert.deepEqual(records.map(r=>r.file).sort(),expected);
 for(const r of records){const bytes=fs.readFileSync(path.join(out,r.file));assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(hash(bytes),r.sha256);assert.equal(bytes.readUInt32BE(16),1280);assert.equal(bytes.readUInt32BE(20),720);}
 fs.writeFileSync(path.join(out,'artifact-verification.json'),JSON.stringify({sourceHead:HEAD,variant:VARIANT,shellAlpha:SHELL_ALPHA,count:16,hashesVerified:true,visualReview:'pending',checkedAt:new Date().toISOString()},null,2));
}
