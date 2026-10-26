// A baseline may explicitly expect the defect; ordinary checks require release.
export function validateLifecycleExpectation(expectedLifecycle,crabLifecycle,explicit=false) {
 if(!['released','leak-observed'].includes(expectedLifecycle))throw new RangeError('Expected lifecycle must be released or leak-observed');
 if(!crabLifecycle&&(explicit||expectedLifecycle!=='released'))throw new RangeError('--expect-lifecycle requires --crab-lifecycle');
 return expectedLifecycle;
}
export function gameplayVerdict({errors,crabLifecycle=false,lifecycleStatus,expectedLifecycle='released'}) {
 if(!Array.isArray(errors))throw new TypeError('Error receipts must be an array');
 validateLifecycleExpectation(expectedLifecycle,crabLifecycle);
 return errors.length||(crabLifecycle&&lifecycleStatus!==expectedLifecycle)?'failed':'passed';
}
