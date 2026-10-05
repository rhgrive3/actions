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
