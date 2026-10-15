import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./capture-third-integration.mjs',import.meta.url),'utf8');
test('B failure evidence finishes saving before original rejection escapes',async()=>{
 const start=source.indexOf('  let B;try');assert(start>=0);
 const line=source.slice(start,source.indexOf('\n',start)),calls=[];
 const context={window:{__captureCheckpoint:async(phase,data)=>{await Promise.resolve();calls.push({phase,data});}},api:{},R:{},THREE:{},scene:{},renderer:{},camera:{},bSource:'async()=>{const error=new Error("controlled B mismatch");error.capturePartial={frames:[],state:{stage:"charged",kit:"test"}};throw error;}'};
 await assert.rejects(vm.runInNewContext('(async()=>{'+line+'})()',context),/controlled B mismatch/);
 assert.equal(calls.length,1);assert.equal(calls[0].phase,'B-failure');assert.equal(calls[0].data.state.stage,'charged');
});
test('completed work and C are saved before entering B and full acceptance gates remain',()=>{
 assert(source.indexOf("await window.__captureCheckpoint('work',work)")<source.indexOf('  let B;try'));
 assert(source.indexOf("await window.__captureCheckpoint('C',C)")<source.indexOf('  let B;try'));
 assert(source.includes('await page.exposeFunction'));
 assert(source.includes('if(shaderErrors.length)throw Error'));
});
