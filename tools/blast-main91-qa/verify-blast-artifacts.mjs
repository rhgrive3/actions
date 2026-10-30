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
 'decode-blast-paired-evidence.test.mjs':'7593fbd6a4b91693ff393c363524becbf7a488804f398c46262abbcb6a80cb86',
 'decode-blast-paired-evidence.mjs':'7def2e649bb1d12eeeb0d861bb532f2c768630729ceac5d73bc300426498bd93',
 'stream-paired-blast-evidence.mjs':'aa199cf5710e72fd7b1d42b562a417dfc89376fe494d84a895c1b9fbf0878a98',
 'settle-recorded-capture-audio.test.mjs':'fe8f820b2cd809d0e5ba3078eb9f1ec24ed92750f9d9ae469e99d685216e3ef7',
 'settle-recorded-capture-audio.mjs':'8bce5ddcb2593ce3e316bb3fb74df65acd67abaeb4a35f3b5d57bfcb0959af77',
 'paired-blast-diagnostics.test.mjs':'2fda644d73e0c8c662017cc4e905fe674e3428dbe927c62a884079a683ef797a',
 'paired-blast-diagnostics.mjs':'31223178c3aa79a062e250bbe048f2f95326f859e8535e77455e54396049a872',
 'stable-scenario-random.test.mjs':'f5b3cfb249f5b80cea892483f96534857b81d79ad28ffa6b6b230179101e7040',
 'stable-scenario-random.mjs':'4256e8ec9515f7d54912379b0762231740273ace71672d347cbfdd7bb987829f',
 'test-blaster-knockback-authority.mjs':'626a9760d62aec74ead19ed3cac03ffaa834631769ef2248440914bf931c8a83',
 'audio-request-trace.mjs':'3f8be5e75a736afb01ca34deb24f5a5271c4a7df4cab16db37f002547c7da695',
 'audio-request-trace.test.mjs':'86fa9a80411726f57c6bbe731b87c6c65c1e487ae47efc3ef007afd2f1d3b709',
 'verify-blast-clocks.test.mjs':'f8e4b56c8d9930511645566e9a91937db0f05939b51f2bccb6d2e2da52f95c5a',
 'test-blast-alpha-routing.mjs':'71ae5a0c70c7bddcaf58efe3606ac677733fec9bafb067aa85aad74ba97bafe6',
 'compare-blast-ab.mjs':'b2efd403b04e9f5e2519e2d55a1280018f87b39bd7845f271365e84a6a886b2f',
 'run-main91-blast.mjs':'e33cf33a5234f71e8d2b8c26dbaa8864739a6c1d09d58aa38ff073237f6d6104',
 'capture-main91-blast.mjs':'e296bffd0e93d91a38456e1795b1df27d86ae0854fdf387266fb3ab68980f982'
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
 const regression=JSON.parse(fs.readFileSync(path.join(out,'regression-receipt.json')));assert.equal(regression.sourceHead,HEAD);assert.equal(regression.variant,VARIANT);assert.equal(regression.source,'passed');assert.equal(regression.emitted,'passed');assert.equal(regression.tests.length,5);assert.deepEqual(regression.authorityFixture,{reason:"original authority cases preserved; real fire and authenticated owner tick provide required proof in final composition; immutable source tests untouched",file:'test-blaster-knockback-authority.mjs',sha256:scripts['test-blaster-knockback-authority.mjs'],source:'passed',emitted:'passed'});assert.deepEqual(regression.routing,{source:'passed',emitted:'passed'});assert.deepEqual(regression.qaContracts,['verify-blast-clocks.test.mjs','audio-request-trace.test.mjs','stable-scenario-random.test.mjs','paired-blast-diagnostics.test.mjs','settle-recorded-capture-audio.test.mjs']);
 assert.equal(driver.audioSettlements?.length,2);for(const a of driver.audioSettlements)assert.equal(a.status,'ready','native selected kit audio ready');
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
 let pairedVerification=null;
 if(VARIANT==='candidate'){
  const p=JSON.parse(fs.readFileSync(path.join(out,'paired','paired-receipt.json')));assert.equal(p.head,HEAD);assert.equal(p.variant,VARIANT);assert.equal(p.status,'captured-restoration-verified-not-reviewed');assert.deepEqual(p.pairs.map(x=>x.frame),[0,3,9]);
  const names=['paired-receipt.json'];
  for(const pair of p.pairs){assert.equal(pair.originalAlpha,Math.fround(.92));assert.equal(pair.restoration.exactPixels,true);assert.equal(pair.restoration.originalPngSHA256,pair.restoration.restoredPngSHA256);for(const k of ['originalPngSHA256','restoredPngSHA256','cpuSHA256','nonTargetGPU_SHA256','paintAtlasSHA256'])assert.match(pair.restoration[k],/^[a-f0-9]{64}$/);
   assert.equal(pair.dimensions.format,'image/png');for(const key of ['alpha1','alpha092']){const file='blast-only-F'+String(pair.frame).padStart(2,'0')+'-'+key+'.png',r=pair[key];assert.equal(r.file,file);const b=fs.readFileSync(path.join(out,'paired',file));assert.equal(b.length,r.byteLength);assert.equal(hash(b),r.sha256);assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(b.readUInt32BE(16),pair.dimensions.width);assert.equal(b.readUInt32BE(20),pair.dimensions.height);if(key==='alpha092')assert.equal(r.sha256,pair.restoration.originalPngSHA256);names.push(file);}
  }
  assert.deepEqual(fs.readdirSync(path.join(out,'paired')).sort(),names.sort());pairedVerification={count:6,restorationVerified:true,visualReview:'pending'};
 }

 fs.writeFileSync(path.join(out,'artifact-verification.json'),JSON.stringify({sourceHead:HEAD,variant:VARIANT,shellAlpha:SHELL_ALPHA,count:16,paired:pairedVerification,hashesVerified:true,visualReview:'pending',checkedAt:new Date().toISOString()},null,2));
}
