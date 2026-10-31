// Register this exact additive contract before the historical PR1869 seal.
// Unknown bytes still fail; none of the approved historical digests changes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {sha256} from './inkwave-slosher-phase-control.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/inkwave-slosher-phase-workflow-20261027.json',import.meta.url)));
// Exact additive checkout-only successor from 339029d9. Preserve the old
// phase seal and reject every unknown byte before normalizing the three blocks.
const sparseCheckoutEpochSha='4c360faa9ad52c4766770b1839f43fcee8098167bdfd423444fccfa7af9136cd';
const sparseCheckoutBlock=`          sparse-checkout: |
            /*
            !/tools/inkwave-modeler/blender/
            !/tools/inkwave-modeler/docs/
            !/reports/*
            /reports/ink-volume/
            !/reports/ink-volume/*
            /reports/ink-volume/source/
            *.js
            *.mjs
            *.cjs
          sparse-checkout-cone-mode: false
          filter: blob:none
`;
export function restoreBeforeSlosherPhaseWorkflow(text){
  if(sha256(text)===sparseCheckoutEpochSha){
    assert.equal(text.split(sparseCheckoutBlock).length,4,'three exact reviewed sparse checkout blocks');
    text=text.split(sparseCheckoutBlock).join('');
  }
  assert.equal(fixture.sourceCommit,'90706e3778586fa6c9d09a64ac354e547086e1c0');
  assert.equal(fixture.beforeSha256,'6402a428fbc726542c8566537f449bccb7b591bcfb46f0f8b7c234f50ef1ed9d');
  assert.equal(fixture.afterSha256,'8a0de1c78f47b01c7d99061ad06994abe57faf348986e8d76b9478f19240a9fa');
  assert.equal(sha256(fixture.before),fixture.beforeSha256,'preserved original workflow');
  assert.equal(sha256(text),fixture.afterSha256,'exact phase-only workflow contract; mutations fail closed');
  return fixture.before;
}
