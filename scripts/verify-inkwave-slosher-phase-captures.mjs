// Existing comparator stays unchanged. Original mismatch and all images remain
// separate inputs; only the independently generated control can pass equality.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {sha256,verifyPhaseExecutionSources} from './lib/inkwave-slosher-phase-control.mjs';
import {verifyPhaseTrace,verifyCausalDifference,verifyControlReceipt} from './lib/inkwave-slosher-phase-verification.mjs';
const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>{if(i%2===0)a.push([v.replace(/^--/,''),all[i+1]]);return a;},[]));
const root=path.dirname(new URL(import.meta.url).pathname),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const input=dir=>path.join(dir,'projectile-visuals-result.json');
const [original,control,target]=['original','control','target'].map(k=>read(input(args[k])));
const output=path.resolve(args.out);fs.mkdirSync(output,{recursive:true});
const files=Object.fromEntries(['original','control','target'].map(k=>[k,{path:input(args[k]),sha256:sha256(fs.readFileSync(input(args[k])))}]));
const receipt=read(args.receipt);verifyControlReceipt(receipt);
verifyPhaseExecutionSources(receipt.executionSources,path.resolve(root,'..'));
for(const doc of [original,control,target]){
  assert.equal(doc.provenance.harnessSha256,receipt.executionSources['scripts/check-inkwave-projectile-visuals.mjs'],'committed capture execution body');
  assert.equal(doc.provenance.slosherPhaseObserverSha256,receipt.executionSources['scripts/lib/inkwave-slosher-phase-observer.mjs'],'committed observer execution body');
}
assert.equal(sha256(fs.readFileSync(new URL(import.meta.url))),receipt.executionSources['scripts/verify-inkwave-slosher-phase-captures.mjs'],'committed contract verifier');
assert.equal(original.build.contentHash,receipt.builds.original,'actual original capture build');
assert.equal(control.build.contentHash,receipt.builds.control,'actual independent control capture build');
assert.equal(target.sourceIdentity.checkoutSha,receipt.targetSha,'actual target capture checkout');
assert.equal(target.phaseRuntimeInputSha256,receipt.targetPhaseSourceSha256,'actual target phase source input');
function compare(left,right,name){
  const file=path.join(output,name+'.json'),r=spawnSync('python3',[path.join(root,'compare-inkwave-projectile-captures.py'),'--before',args[left],'--after',args[right],'--output',file,'--require-complete'],{encoding:'utf8'});
  fs.writeFileSync(path.join(output,name+'.log'),r.stdout+r.stderr);assert.ok([0,1].includes(r.status),'comparator process completed');
  return {exitCode:r.status,file,result:read(file)};
}
const historical=compare('original','target','original-target-failed-comparison');
assert.equal(historical.exitCode,1,'old fallback is a required negative physical control');
const causal=compare('original','control','original-phase-control-comparison');
assert.equal(causal.exitCode,1,'phase change must remain visible in the original comparison');
for(const r of [historical.result,causal.result]){
  assert.ok(Object.values(r.completeVerification).every(row=>row.status==='pass'),'all original/control full capture and media gates');
  assert.ok(Object.values(r.washtubResourceVerification).every(row=>row.status==='pass'),'all original/control resource bounds');
}
const cause=verifyCausalDifference(original,control,causal.result);
verifyPhaseTrace(target.slosherPhase);
assert.equal(control.slosherPhase.birth.seed,target.slosherPhase.birth.seed,'same actual control/target seed');
assert.deepEqual(control.slosherPhase,target.slosherPhase,'all control/target owned cells, head steps and credit operations remain exact');
const strict=compare('control','target','paired-verification');
assert.equal(strict.exitCode,0,'full existing physical equality, including coverage/SP, is required');
assert.equal(strict.result.physicalVerification.status,'pass');
assert.equal(strict.result.pairedCaptureVerification.matchedPairCount,52);
for(const [key,value] of Object.entries(files))assert.equal(sha256(fs.readFileSync(value.path)),value.sha256,key+' original receipt unchanged');
const result={schema:1,status:'pass',kind:'source-backed-slosher-phase-acceptance',files,baseSha:receipt.baseSha,targetSha:receipt.targetSha,
  controlBuild:receipt.builds,causal: cause,originalMismatch:historical.file,originalPhaseChange:causal.file,strictComparison:strict.file,
  oldFallbackNegativeControl:'failed as required',comparatorSha256:sha256(fs.readFileSync(path.join(root,'compare-inkwave-projectile-captures.py'))),
  limitations:['Control is base plus only the accepted source phase; not unchanged main or retail equivalence.','No comparator fields, numeric tolerances or image baselines are changed.']};
fs.writeFileSync(path.join(output,'slosher-phase-contract.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,baseSha:result.baseSha,targetSha:result.targetSha,matchedPairs:52}));
