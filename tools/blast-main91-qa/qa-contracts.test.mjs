import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Regression for run41022607170: exporter retained two old QA contracts while
// driver/verifier required five. This tests the real assertion, not a looser mirror.
const expected=['verify-blast-clocks.test.mjs','audio-request-trace.test.mjs','stable-scenario-random.test.mjs','paired-blast-diagnostics.test.mjs','settle-recorded-capture-audio.test.mjs'];
const read=name=>readFileSync(new URL('./'+name,import.meta.url),'utf8');
const driver=read('run-main91-blast.mjs'),verifier=read('verify-blast-artifacts.mjs'),exporter=read('stream-blast-ab-evidence.mjs');
const parse=text=>JSON.parse(text.replaceAll("'",'"'));
const driverList=driver.match(/const qaRegressionTests=(\[[^\]]+\]);/);
const verifierList=verifier.match(/assert\.deepEqual\(regression\.qaContracts,(\[[^\]]+\])\);/);
const exportAssertion=exporter.match(/assert\.deepEqual\(r\.qaContracts,(\[[^\]]+\])\);/);
assert.ok(driverList&&verifierList&&exportAssertion,'all actual exact contract bindings required');
const validate=new Function('assert','r',exportAssertion[0]);
test('driver verifier and exporter bind the exact same five required QA contracts',()=>{
 assert.deepEqual(parse(driverList[1]),expected);assert.deepEqual(parse(verifierList[1]),expected);assert.deepEqual(parse(exportAssertion[1]),expected);assert.equal(new Set(expected).size,5);validate(assert,{qaContracts:expected.slice()});
});
test('actual exporter assertion rejects missing extra duplicate reordered and malformed contracts',()=>{
 const bad=[expected.slice(0,2),expected.slice(1),[...expected,'not-reviewed.test.mjs'],[...expected.slice(0,4),expected[0]],expected.slice().reverse(),[],undefined,null,'passed'];
 for(const qaContracts of bad)assert.throws(()=>validate(assert,{qaContracts}));
});
test('historical two-contract assertion rejects the new receipt and is not reintroduced',()=>{
 assert.throws(()=>assert.deepEqual(expected,expected.slice(0,2)));
 assert.equal(exporter.includes("assert.deepEqual(r.qaContracts,['verify-blast-clocks.test.mjs','audio-request-trace.test.mjs']);"),false);
});
