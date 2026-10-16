import test from 'node:test';import assert from 'node:assert/strict';import {validateTestCounts} from './test-count.mjs';
const good='# tests 3\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
test('exact three native tests and zero skipped required',()=>{assert.ok(validateTestCounts(good));for(const[k,v]of Object.entries({tests:4,pass:2,fail:1,cancelled:1,skipped:1,todo:1}))assert.throws(()=>validateTestCounts(good.replace(new RegExp('# '+k+' \\d+'),'# '+k+' '+v)));assert.throws(()=>validateTestCounts(''));assert.throws(()=>validateTestCounts(good+good));});
