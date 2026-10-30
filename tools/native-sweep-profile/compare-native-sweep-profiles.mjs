import assert from 'node:assert/strict';
export function compareNativeSweepProfiles(source,emitted){
 assert.equal(source.schema,1);assert.equal(emitted.schema,1);
 assert.equal(source.mode,'source');assert.equal(emitted.mode,'emitted');
 assert.match(source.sourceHead||'',/^[a-f0-9]{40}$/);assert.equal(emitted.sourceHead,source.sourceHead);
 assert.match(emitted.manifestContentHash||'',/^[a-f0-9]{64}$/);
 for(const key of ['sourceInputHash','buildRevision','manifestContentHash','dt','steps','seeds','rows','cacheMeaning','instrumentation','scope','observationScope'])assert.deepEqual(emitted[key],source[key],key+' source/emitted mismatch');
 for(const x of [source,emitted]){assert.match(x.runtimeOriginalSHA256||'',/^[a-f0-9]{64}$/);assert.equal(x.runtimeOriginalSHA256,x.runtimeExpectedSHA256);assert.equal(x.runtimeBoundToSelectedBytes,true);assert.match(x.sourceInputHash||'',/^[a-f0-9]{64}$/);assert.match(x.buildRevision||'',/^[a-f0-9]{64}$/);}assert.equal(source.dt,1/60);assert.equal(source.steps,120);assert.deepEqual(source.seeds,[0x17571671,0x32501]);
 for(const key of ['cacheMeaning','instrumentation','scope'])assert.equal(typeof source[key],'string');
 assert.equal(source.rows.length,12);
 const expected=[];for(const scenario of ['flat','wall','moving'])for(const weapon of ['shooter','s3-blaster-short'])for(const seed of source.seeds)expected.push({scenario,weapon,seed});
 assert.deepEqual(source.rows.map(({scenario,weapon,seed})=>({scenario,weapon,seed})),expected);
 for(const row of source.rows){
  assert.equal(row.observerParity,true);assert.match(row.behaviorSHA256,/^[a-f0-9]{64}$/);
  const c=row.counters;assert.ok(c.catalogue+c.level>0);assert.equal(c.totalHits+c.misses,c.catalogue+c.level);assert.equal(c.errors,0);
  for(const key of ['catalogue','level','sourceQueries','queryCountDelta','sourceHits','totalHits','misses','queryBoxCalls','bvhNodeVisits','candidateTriangles','triangleTests','dynamicOBBCalls','sourceOptionsReused','sourceOutputReused','bvhStackReused','errors'])assert.ok(Number.isSafeInteger(c[key])&&c[key]>=0,key);
  assert.equal(row.hitRate,c.totalHits/(c.catalogue+c.level));
 }
 return {sourceHead:source.sourceHead,mode:'source-emitted-compared',cases:12,conditionsAndObservedBehaviorMatch:true,performanceClaim:false};
}
