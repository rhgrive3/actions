import assert from 'node:assert/strict';
const ROWS=[['Shooter_TripleQuick_02','s3-shooter-triplequick']];
export function validateGlitterzVisiblePairs(rows){
 assert.equal(rows.length,8,'exact B image count');
 const by=new Map();
 for(const r of rows){
  assert.equal(r.group,'C');
  const spec=ROWS.find(([kit])=>kit===r.rowId);assert.ok(spec,'known B kit');
  assert.ok(['base','variant'].includes(r.role));assert.ok([0,1].includes(r.team));assert.ok(['rest','fire'].includes(r.state));
  assert.equal(r.baseId,spec[1]);assert.equal(r.variantId,r.role==='base'?null:spec[0]);assert.equal(r.id,r.role==='base'?spec[1]:spec[0]);assert.match(r.sha256,/^[a-f0-9]{64}$/);
  const key=[r.rowId,r.role,r.team,r.state].join(':');assert.ok(!by.has(key),'duplicate B image');by.set(key,r);
 }
 const pairs=[];
 for(const [kit] of ROWS)for(const team of [0,1])for(const state of ['rest','fire']){
  const base=by.get([kit,'base',team,state].join(':')),variant=by.get([kit,'variant',team,state].join(':'));
  assert.ok(base&&variant,'missing B image pair');assert.deepEqual(variant.camera,base.camera,'paired camera');
  assert.notEqual(variant.sha256,base.sha256,'unchanged visible finish: '+[kit,team,state].join(':'));
  pairs.push({kit,team,state,baseSHA:base.sha256,variantSHA:variant.sha256});
 }
 assert.equal(pairs.length,4);return pairs;
}
