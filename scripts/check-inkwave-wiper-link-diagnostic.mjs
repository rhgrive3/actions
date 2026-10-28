#!/usr/bin/env node
// Opt-in isolated link proof. A deliberately interrupted diagnostic capture is
// NOT acceptance; the unchanged original Wiper acceptance runs separately.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {runWiperCapture} from './check-inkwave-wiper-link-diagnostic-capture.mjs';
export function validateWiperLinkProof(result,sourceSha,expectation) {
  assert.ok(expectation==='linked'||expectation==='unlinked');
  assert.equal(result?.sourceSha,sourceSha);assert.equal(result?.sourceIdentity?.checkoutSha,sourceSha);assert.equal(result?.sourceIdentity?.checkoutIdentityStatus,'verified-git-head');
  assert.equal(result?.diagnosticOnly,true);assert.equal(result?.sandbox,true);assert.deepEqual(result?.backend?.extraArgs,[]);
  assert.equal(result?.status,'failed');assert.equal(typeof result?.error,'string');assert.equal(result?.diagnosticFailure?.primaryError,result.error);
  const marker=expectation==='linked'?'Wiper link diagnostic completed:':'Wiper link diagnostic:';assert.ok(result.error.includes(marker),'only intentional link-probe interruption may certify proof');
  assert.equal(result?.moduleObservations?.status,'verified');assert.equal(result?.cleanup?.browserClosed,true);assert.equal(result?.cleanup?.serverClosed,true);
  assert.deepEqual(result?.errors,[]);const probe=result?.passProbe,state=probe?.state,coverage=state?.coverage,obs=state?.observations;
  assert.equal(probe?.acceptance,false);assert.equal(probe?.frame,1);assert.equal(probe?.view,'native-postprocessed');
  assert.ok(coverage?.passCalls===1&&coverage.sceneCalls===1&&coverage.colorTargetSeen>=1&&coverage.programCalls>=1);
  assert.equal(coverage.rendererSame,true);assert.equal(coverage.passSame,true);assert.equal(coverage.composerSame,true);assert.equal(coverage.sceneSame,true);assert.equal(coverage.targetMaterialSame,true);assert.equal(coverage.passStillInComposer,true);
  assert.deepEqual(state.restoreErrors,[]);assert.ok(Array.isArray(obs)&&obs.length>=1);
  if(expectation==='unlinked') {
    assert.equal(probe.ok,false);assert.equal(state.primary?.kind,'link-failed');const bad=obs.find(x=>x.linked===false);assert.ok(bad);assert.equal(bad.nativeUseProgramCalled,false);
    const logs=[bad.programLog?.text,...bad.shaders.map(x=>x.log?.text)].filter(x=>typeof x==='string');assert.ok(logs.some(x=>/\bpatch\b/i.test(x)),'baseline must positively identify patch in actual driver link/compile log');
  } else {
    assert.equal(probe.ok,true);assert.equal(state.status,'completed');assert.equal(state.renderState,'completed');const good=obs.find(x=>x.linked===true&&x.nativeUseProgramCalled===true);assert.ok(good);
    assert.equal(good.shaders.length,2);assert.deepEqual(good.shaders.map(x=>x.type).sort(),['fragment','vertex']);assert.ok(good.shaders.every(x=>x.compiled===true));
  }
  return {kind:'controlled-wiper-native-link-proof',acceptance:false,sourceSha,expectation,observations:obs};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const [site,out,sourceFlag,sha,rootFlag,sourceRoot,harnessFlag,harnessSha,expectFlag,expectation]=process.argv.slice(2);
 assert.equal(sourceFlag,'--source-sha');assert.equal(rootFlag,'--source-root');assert.equal(harnessFlag,'--harness-sha');assert.equal(expectFlag,'--expect');assert.equal(process.argv.slice(2).length,10);
 let interrupted=false;try{await runWiperCapture(site,out,sha,{root:sourceRoot,diagnosticBackend:true,expectedDiagnosticSha:harnessSha});}catch{interrupted=true;}
 assert.equal(interrupted,true,'link probe must intentionally stop, never produce an acceptance pass');
 const result=JSON.parse(fs.readFileSync(path.join(out,'wiper-native-result.json'),'utf8'));
 const proof=validateWiperLinkProof(result,sha,expectation);fs.writeFileSync(path.join(out,'wiper-link-proof.json'),JSON.stringify(proof,null,2)+'\n');
 console.log('Wiper native link proof validated:',expectation,'source',sha,'NOT acceptance');
}
