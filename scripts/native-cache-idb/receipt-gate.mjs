import assert from 'node:assert/strict';
export function compareResults(a,b){
 assert.equal(a.variant,'baseline');assert.equal(b.variant,'candidate');assert.equal(a.scenario,b.scenario);
 assert.equal(a.restorationVerifiedOnExit,true);assert.equal(b.restorationVerifiedOnExit,true);assert.equal(b.schema?.version,2);assert(Array.isArray(b.schema?.metadata));
 if(!['fresh','migration-read','blocked-upgrade'].includes(b.scenario)){assert(b.migrationCounts);assert.equal(b.migrationCounts.returnedDataBytes,b.scenario==='empty'?0:5*1024*1024);}
 assert.deepEqual(b.saved,a.saved,'saved rows, times and data seals');assert.equal(b.readSeal,a.readSeal);
 if(!['migration-read','blocked-upgrade'].includes(b.scenario)){assert.equal(b.counts.stageGetAll,0,'candidate full read');assert.equal(b.counts.returnedDataBytes,0,'candidate data rehydration');}
 if(['third','same-key','equal-time','abort'].includes(a.scenario))assert.equal(a.counts.returnedDataBytes,5*1024*1024,'baseline read control');
}
