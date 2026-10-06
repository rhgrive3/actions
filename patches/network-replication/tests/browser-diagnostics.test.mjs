import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('browser trajectory failures retain raw traces and maximum-error pair before assertions',()=>{
  const code=fs.readFileSync(new URL('../../../scripts/check-inkwave-network-browser.mjs',import.meta.url),'utf8');
  const traces=code.indexOf("fs.writeFileSync(path.join(evidence,'network-traces.json')");
  const compare=code.indexOf("assert(b,'missing remote birth");
  const diagnostic=code.indexOf("fs.writeFileSync(path.join(evidence,'network-comparison-diagnostic.json')");
  const tolerance=code.indexOf("assert(maxPositionError<.08,'trajectory quantization tolerance')");
  assert(traces>0&&traces<compare,'raw traces survive every comparison failure');
  assert(diagnostic>compare&&diagnostic<tolerance,'worst pair survives tolerance failure');
  assert(code.includes('authoritative:l,reconstructed:s,delta'));
  for(const field of ['fidelityPhase','fidelityMode','fidelityMove','fidelityPlayerCollision','fidelityFieldCollision'])
    assert(code.includes(field+':p.'+field),field+' retained for diagnosis');
});
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

test('browser trajectory failures retain raw traces and maximum-error pair before assertions',()=>{
  const code=fs.readFileSync(new URL('../../../scripts/check-inkwave-network-browser.mjs',import.meta.url),'utf8');
  const traces=code.indexOf("fs.writeFileSync(path.join(evidence,'network-traces.json')");
  const compare=code.indexOf("assert(b,'missing remote birth");
  const diagnostic=code.indexOf("fs.writeFileSync(path.join(evidence,'network-comparison-diagnostic.json')");
  const tolerance=code.indexOf("assert(maxPositionError<.08,'trajectory quantization tolerance')");
  assert(traces>0&&traces<compare,'raw traces survive every comparison failure');
  assert(diagnostic>compare&&diagnostic<tolerance,'worst pair survives tolerance failure');
  assert(code.includes('authoritative:l,reconstructed:s,delta'));
  for(const field of ['fidelityPhase','fidelityMode','fidelityMove','fidelityPlayerCollision','fidelityFieldCollision'])
    assert(code.includes(field+':p.'+field),field+' retained for diagnosis');
});


test('actual browser acceptance block retains traces and worst pair on a forced tolerance failure',()=>{
  const code=fs.readFileSync(new URL('../../../scripts/check-inkwave-network-browser.mjs',import.meta.url),'utf8');
  const begin=code.indexOf(' // Keep raw evidence'),end=code.indexOf(' const ticks=wire',begin);
  assert(begin>=0&&end>begin);
  const birth={owner:0,id:1,ghost:false,start:[0,0,0],vel:[1,0,0],vertical:false,grav:0,drag:0,life:1,seed:.5};
  const remote={...birth,ghost:true};
  const flags={invalidLinkedVisible:0,invalidPuffVisible:0,remoteDropLinks:1,remotePuffLinks:1,unboundCurtains:0,curtains:10,maxEnvelopeError:0,puffEnvelopeError:0};
  const traces=[{remaining:0,trace:{...flags,births:[birth],steps:[{...birth,age:1,pos:[1,0,0]}]}},
    {remaining:0,trace:{...flags,births:[remote],steps:[{...remote,age:1,pos:[1.2,0,0]}]}}];
  const saved=new Map(),fakeFs={writeFileSync(file,body){saved.set(path.basename(file),JSON.parse(body));}};
  assert.throws(()=>vm.runInNewContext(code.slice(begin,end),{traces,fs:fakeFs,path,evidence:'/evidence',sourceSha:'source',build:{contentHash:'content'},assert,baseline:false,errors:[]}),/trajectory quantization tolerance/);
  assert.equal(saved.get('network-traces.json').length,2);
  const diagnostic=saved.get('network-comparison-diagnostic.json');
  assert.equal(diagnostic.paired,1);assert.ok(Math.abs(diagnostic.maxPositionError-.2)<1e-9);
  assert.equal(diagnostic.worstPosition.authoritative.pos[0],1);assert.equal(diagnostic.worstPosition.reconstructed.pos[0],1.2);
});
