import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const audit=JSON.parse(fs.readFileSync(new URL('../../reports/inkwave-paint-reference-audit-2026-10-11.json',import.meta.url)));
test('paint audit retains all98 explicit source identities without claiming retail parity',()=>{
 assert.equal(audit.schema,2);assert.equal(audit.mains.length,65);assert.equal(audit.subs.length,14);assert.equal(audit.specials.length,19);
 for(const group of[audit.mains,audit.subs,audit.specials]){assert.equal(new Set(group.map(x=>x.id)).size,group.length);for(const r of group){assert.equal(r.retailParity,'unverified');assert.match(r.sourceSha256,/^[a-f0-9]{64}$/);}}
 assert.equal(audit.mains.filter(r=>r.runtimeCoverage.fallingSplash?.startsWith('Explicit')).length,22);
 assert.ok(audit.unadoptedCandidates.some(x=>x.pr===1235));
 assert.doesNotMatch(JSON.stringify(audit),/Fixed paint seed 0|Airborne splash immediately projects to floor|DepthScale below 1 is clamped/);
});
test('source-omitted SpecUpType is visible without inventing its meaning',()=>{
 for(const[id,curve]of[['tentaMissiles',{High:3.78,Low:3.15,Mid:3.465}],['inkjet',{High:4,Low:3.2,Mid:3.6}],['superChump',{High:4.1,Low:3.5,Mid:3.8}]]){
  const r=audit.specials.find(x=>x.id===id),entry=r.implicitSpecUpEntries.find(x=>x.pointer.endsWith('/SubSpecialSpecUpList/0'));
  assert.deepEqual(entry.value,{Value:curve});assert.match(entry.semantic,/omits SpecUpType/);assert.match(entry.semantic,/does not establish/);
 }
});
