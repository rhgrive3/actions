import test from 'node:test';import assert from 'node:assert/strict';import{validateTestCounts}from'./test-count.mjs';
const report='# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
test('exact positive TAP count',()=>assert.equal(validateTestCounts(report,2),true));
test('missing duplicate and truncated summaries reject',()=>{for(const x of ['',report.replace('# pass 2\n',''),report+'# pass 2\n'])assert.throws(()=>validateTestCounts(x,2));});
test('failure skip cancellation todo and wrong count reject',()=>{for(const k of ['fail','skipped','cancelled','todo'])assert.throws(()=>validateTestCounts(report.replace('# '+k+' 0','# '+k+' 1'),2));assert.throws(()=>validateTestCounts(report,3));});
test('unknown expected count rejects',()=>{for(const n of [undefined,null,NaN,0,-1,1.5])assert.throws(()=>validateTestCounts(report,n));});
