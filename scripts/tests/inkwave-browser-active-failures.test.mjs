import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../check-inkwave-browser.mjs',import.meta.url),'utf8');
const listener=source.match(/page\.on\('requestfailed', request => \{[\s\S]*?\n\}\);/)[0];
function capture(url,error) {
 const failures=[];let callback;
 vm.runInNewContext(listener,{page:{on(name,cb){assert.equal(name,'requestfailed');callback=cb;}},failures});
 callback({url:()=>url,failure:()=>error===null?null:{errorText:error}});
 return JSON.parse(JSON.stringify(failures));
}
const audio='http://127.0.0.1:8000/_versions/'+'a'.repeat(64)+'/assets/audio/Jet_Arrow.mp3';
test('exact versioned audio abort stays an active capture failure',()=>{
 assert.deepEqual(capture(audio,'net::ERR_ABORTED'),[{url:audio,error:'net::ERR_ABORTED'}]);
 assert.doesNotMatch(source,/verifiedRequests|import \{ verifiedAudioCancellation \}/);
});
test('all other network errors remain failures',()=>{
 for(const error of ['net::ERR_FAILED','net::ERR_CONNECTION_CLOSED','net::ERR_TIMED_OUT'])assert.deepEqual(capture(audio,error),[{url:audio,error}]);
});
test('non audio and malformed URLs do not escape recording',()=>{
 for(const url of ['not a URL','http://local/src/main.js','http://local/assets/audio/a.mp3'])assert.equal(capture(url,'net::ERR_ABORTED').length,1);
});
test('missing network error detail still fails closed',()=>assert.deepEqual(capture(audio,null),[{url:audio}]));
test('pre-close failure gate and explicit teardown order remain unchanged',()=>{
 const gate=source.indexOf("if(errors.length || consoleErrors.length || failures.length) result.status = 'failed';");
 const write=source.indexOf("fs.renameSync(evidence + '/browser-result.json.writing'");
 const close=source.lastIndexOf('await closeObservedBrowser();');
 assert.ok(gate>0 && gate<write && write<close);
 assert.match(source,/result\.verifiedAudioCancellations = \[\];/);
});
