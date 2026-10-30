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
 'test-blaster-knockback-authority.mjs':'626a9760d62aec74ead19ed3cac03ffaa834631769ef2248440914bf931c8a83',
 'audio-request-trace.mjs':'3f8be5e75a736afb01ca34deb24f5a5271c4a7df4cab16db37f002547c7da695',
 'audio-request-trace.test.mjs':'86fa9a80411726f57c6bbe731b87c6c65c1e487ae47efc3ef007afd2f1d3b709',
 'verify-blast-clocks.test.mjs':'f8e4b56c8d9930511645566e9a91937db0f05939b51f2bccb6d2e2da52f95c5a',
 'test-blast-alpha-routing.mjs':'71ae5a0c70c7bddcaf58efe3606ac677733fec9bafb067aa85aad74ba97bafe6',
 'compare-blast-ab.mjs':'af8dee25d8670c606a13e99b2dbc938c294dc3439cdde57982a6532d25f6bf8c',
 'run-main91-blast.mjs':'2018b384489ac7069a8d34552703f840fd171eb91b82113f17ec4f2541fb7ca4',
 'capture-main91-blast.mjs':'7d67ef87436b1fadb3707d1c03f71869519ca528398bb275bfd2e140f194b513'
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
 const regression=JSON.parse(fs.readFileSync(path.join(out,'regression-receipt.json')));assert.equal(regression.sourceHead,HEAD);assert.equal(regression.variant,VARIANT);assert.equal(regression.source,'passed');assert.equal(regression.emitted,'passed');assert.equal(regression.tests.length,5);assert.deepEqual(regression.authorityFixture,{reason:"original authority cases preserved; real fire and authenticated owner tick provide required proof in final composition; immutable source tests untouched",file:'test-blaster-knockback-authority.mjs',sha256:scripts['test-blaster-knockback-authority.mjs'],source:'passed',emitted:'passed'});assert.deepEqual(regression.routing,{source:'passed',emitted:'passed'});assert.deepEqual(regression.qaContracts,['verify-blast-clocks.test.mjs','audio-request-trace.test.mjs']);
 assert.equal(capture.status,'captured-not-reviewed');assert.equal(driver.status,'captured-not-reviewed');
 assert.equal(capture.expectedContentHash,driver.manifestHash);assert.match(driver.buildRevision,/^[a-f0-9]{64}$/);for(const c of capture.cases)assert.equal(c.setup.manifestRevision,driver.buildRevision,'same-lane content addressed revision');
 assert.equal(capture.cases.length,2);
 const expected=['blast-only','blast-roll'].flatMap(prefix=>FRAMES.map(f=>`${prefix}-F${String(f).padStart(2,'0')}.png`)).sort();
 assert.deepEqual(fs.readdirSync(out).filter(f=>f.endsWith('.png')).sort(),expected);
 const records=capture.cases.flatMap(c=>c.captures);assert.equal(records.length,16);
 const verifyFxClock=(clock,frame)=>{let expected=0;for(let i=0;i<=frame;i++)expected+=1/60;for(const key of ['time','shell','ring','beam','mote']){assert.ok(Number.isFinite(clock?.[key]),key+' finite');assert.equal(clock[key],expected,key+' fixed QA effect epoch');}assert.equal(clock.dt,1/60);};
 for(const c of capture.cases){assert.equal(c.setup.initialFxTime,0);assert.ok(Number.isFinite(c.setup.originalFxClock.time));assert.ok(Number.isFinite(c.setup.originalFxClock.dt));verifyFxClock(c.setup.firstTick.fxClock,0);assert.equal(c.setup.firstTick.environmentClock.time,0);assert.equal(c.setup.firstTick.environmentClock.shader,0);for(const r of c.captures){verifyFxClock(r.fxClock,r.frame);assert.equal(r.environmentClock.time,0);assert.equal(r.environmentClock.shader,0);}}
 assert.deepEqual(records.map(r=>r.file).sort(),expected);
 for(const r of records){const bytes=fs.readFileSync(path.join(out,r.file));assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(hash(bytes),r.sha256);assert.equal(bytes.readUInt32BE(16),1280);assert.equal(bytes.readUInt32BE(20),720);}
 fs.writeFileSync(path.join(out,'artifact-verification.json'),JSON.stringify({sourceHead:HEAD,variant:VARIANT,shellAlpha:SHELL_ALPHA,count:16,hashesVerified:true,visualReview:'pending',checkedAt:new Date().toISOString()},null,2));
}
