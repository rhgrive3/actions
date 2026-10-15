import assert from 'node:assert/strict';import{MODEL}from'./noct-plan.mjs';
export function validateSourcePair(p,actual){assert.equal(actual.currentHead,p.baseHead);assert.equal(actual.lightParent,p.current.head);assert.deepEqual(actual.changedPaths,[MODEL]);}
