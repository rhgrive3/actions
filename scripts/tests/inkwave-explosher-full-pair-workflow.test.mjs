import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../../',import.meta.url);
const workflow=()=>fs.readFileSync(new URL('.github/workflows/inkwave-explosher-flight-glitter.yml',root),'utf8');
const common='364dd0a7fad9508652b4b4c6ec3d82eb124e9c5c';
const step=(s,name)=>{
 const marker='      - name: '+name+'\n';assert.equal(s.split(marker).length,2,'one step: '+name);
 const tail=s.slice(s.indexOf(marker)+marker.length),end=tail.search(/^      - (?:name:|uses:)/m);
 return tail.slice(0,end<0?undefined:end);
};
function requireWorkflow(s){
 assert.match(s,/^    timeout-minutes: 45$/m);
 assert.match(s,/ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
 assert(s.includes('EXPECTED_HEAD: ${{ github.event.pull_request.head.sha }}'));
 const names=['Build exact candidate and admitted immutable common source','Require latest-head native Explosher input and rendering','Compile reviewed inverse pair without changing production artifacts','Short admitted same-build native preflight before long capture','Enforce original absolute Explosher geometry guard','Capture admitted inverse baseline stills','Capture admitted inverse candidate stills','Require all-frame same-build inverse acceptance'];
 const positions=names.map(name=>{step(s,name);return s.indexOf('      - name: '+name+'\n');});
 assert(positions.every((n,i)=>n>=0&&(!i||n>positions[i-1])),'strict ordered ladder');
 const guarded=s.slice(positions[0],s.indexOf('      - uses: actions/upload-artifact@v4',positions.at(-1)));
 assert.doesNotMatch(guarded,/^\s+(?:if|continue-on-error):/m,'no bypass of required gates');
 assert.doesNotMatch(guarded,/\|\|\s*(?:true|:)|;\s*(?:true|:)\s*(?:#|$)/m,'no shell success waiver');
 assert(guarded.includes('node scripts/check-inkwave-current-explosher-native.mjs .built-site/explosher-current .ci-scratch/explosher/current-native "$EXPECTED_HEAD"'));
 const pre=step(s,names[3]);for(const x of ["EXPLOSHER_PREFLIGHT: '1'",'EXPLOSHER_CONTROLLED_MAIN: .ci-scratch/explosher/main/controlled-main-receipt.json','EXPLOSHER_SHAPE_OVERLAY=".ci-scratch/explosher/shape/${lane}-shape-receipt.json"',` .built-site/explosher-common ".ci-scratch/explosher/preflight-\${lane}" ${common} .ci-explosher-base`,"readExplosherStagePair('preflight','.ci-scratch/explosher/preflight-before','.ci-scratch/explosher/preflight-after')"])assert(pre.includes(x),'preflight '+x);
 const absolute=step(s,names[4]);assert(absolute.includes('check-inkwave-explosher-absolute-geometries.mjs preflight .ci-scratch/explosher/preflight-before .ci-scratch/explosher/preflight-after .ci-scratch/explosher/preflight-diagnostic.json .ci-scratch/explosher/absolute-geometry-admission.json'));
 for(const [name,lane]of [[names[5],'before'],[names[6],'after']]){
  const b=step(s,name);for(const x of ["EXPLOSHER_PREFLIGHT: '0'","EXPLOSHER_VIDEO: '0'",'EXPLOSHER_CONTROLLED_MAIN: .ci-scratch/explosher/main/controlled-main-receipt.json',`EXPLOSHER_SHAPE_OVERLAY: .ci-scratch/explosher/shape/${lane}-shape-receipt.json`,'EXPLOSHER_ADMIT_BEFORE: .ci-scratch/explosher/preflight-before','EXPLOSHER_ADMIT_AFTER: .ci-scratch/explosher/preflight-after',`EXPLOSHER_EXPECT_PREFLIGHT: .ci-scratch/explosher/preflight-${lane}/manifest.json`,`run: node scripts/check-inkwave-explosher-flight-glitter.mjs .built-site/explosher-common .ci-scratch/explosher/stills-${lane} ${common} .ci-explosher-base`])assert(b.includes(x),name+' '+x);
 }
 const all=step(s,names[7]);assert(all.includes('set -euo pipefail'));assert(all.includes("readExplosherStagePair('stills','.ci-scratch/explosher/stills-before','.ci-scratch/explosher/stills-after')"));assert(all.includes("{flag:'wx'}"));assert(all.includes('check-inkwave-explosher-absolute-geometries.mjs stills .ci-scratch/explosher/stills-before .ci-scratch/explosher/stills-after .ci-scratch/explosher/stills-admission.json .ci-scratch/explosher/stills-absolute-geometry-admission.json'));
 assert(s.includes('Historical same-build inverse only: not current-head two-build acceptance.'));
 assert(s.includes("      - 'scripts/tests/inkwave-explosher-full-pair-workflow.test.mjs'\n"));
 assert.match(s,/run: node --test [^\n]*scripts\/tests\/inkwave-explosher-full-pair-workflow\.test\.mjs/);
}
test('same-run preflight and absolute gates precede both bound inverse stills and strict all-frame admission',()=>requireWorkflow(workflow()));
test('negative workflow controls cannot skip, reorder, swap identity, or waive the full-pair gates',()=>{
 const s=workflow();
 for(const [from,to]of [
  ['      - name: Enforce original absolute Explosher geometry guard\n','      - name: Enforce original absolute Explosher geometry guard\n        if: false\n'],
  ['      - name: Capture admitted inverse baseline stills\n','      - name: Capture admitted inverse baseline stills\n        if: false\n'],
  ['      - name: Capture admitted inverse candidate stills\n','      - name: Capture admitted inverse candidate stills\n        continue-on-error: true\n'],
  ['EXPLOSHER_ADMIT_BEFORE: .ci-scratch/explosher/preflight-before','EXPLOSHER_ADMIT_BEFORE: .ci-scratch/explosher/preflight-after'],
  ['EXPLOSHER_EXPECT_PREFLIGHT: .ci-scratch/explosher/preflight-after/manifest.json','EXPLOSHER_EXPECT_PREFLIGHT: .ci-scratch/explosher/preflight-before/manifest.json'],
  ['EXPLOSHER_SHAPE_OVERLAY: .ci-scratch/explosher/shape/before-shape-receipt.json','EXPLOSHER_SHAPE_OVERLAY: .ci-scratch/explosher/shape/after-shape-receipt.json'],
  ['.built-site/explosher-common .ci-scratch/explosher/stills-before','.built-site/explosher-current .ci-scratch/explosher/stills-before'],
  ["readExplosherStagePair('stills'","readExplosherStagePair('preflight'"],
  ['check-inkwave-explosher-absolute-geometries.mjs stills','check-inkwave-explosher-absolute-geometries.mjs preflight'],
  ["{flag:'wx'}","{flag:'w'}"],
  ['set -euo pipefail','true # no failure propagation'],
  ['timeout-minutes: 45','timeout-minutes: 90'],
 ]){assert(s.includes(from),from);assert.throws(()=>requireWorkflow(s.replace(from,to)),from);}
});
test('driver requests bounded RNG/resource trace for every stage and stage admission stays strict',()=>{
 const driver=fs.readFileSync(new URL('scripts/check-inkwave-explosher-flight-glitter.mjs',root),'utf8');
 assert(driver.includes('(${installExplosherRandom.toString()})(true);'));
 assert(!driver.includes('(${installExplosherRandom.toString()})(${preflight});'));
 for(const token of ["readExplosherStagePair(video?'stills':'preflight'",'!beforeEvidence||!afterEvidence||!expectedFrame',"hash(expectedText)!==admittedPreflightHash"])assert(driver.includes(token),token);
 const gate=fs.readFileSync(new URL('scripts/lib/inkwave-explosher-stage-admission.mjs',root),'utf8');
 for(const token of ["rngDiagnostic?.enabled===true","requireComparableExplosherGeometryGrowth(a,b,stage)","assert.equal(mismatches.length,0",'fullGameTwoBuildAcceptance:false'])assert(gate.includes(token),token);
});
