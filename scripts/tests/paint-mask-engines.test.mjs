import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const script=fs.readFileSync(new URL('../check-inkwave-paint-mask.mjs',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml',import.meta.url),'utf8');
test('paint GPU verifier uses explicit Chromium/WebKit engines with Chromium-only flags',()=>{
 assert.match(script,/\['chromium', 'webkit'\]\.includes\(engine\)/);assert.match(script,/engines\[engine\]\.launchPersistentContext/);assert.match(script,/engine === 'chromium' \? \{ args:/);assert.match(script,/status: 'passed', engine, sourceSha/);
 assert.match(script,/assert\.deepEqual\(results\.source, results\.built/);assert.match(script,/assert\.equal\(outcome\.error, undefined/);
});
test('both required paint engine jobs retain immutable source and independent evidence paths',()=>{
 assert.match(workflow,/- suite: network\n\s+browsers: chromium webkit/);assert.match(workflow,/check-inkwave-paint-mask\.mjs --site[^\n]+--exact-source/);assert.match(workflow,/check-inkwave-paint-mask\.mjs --engine webkit[^\n]+paint-mask-webkit[^\n]+--exact-source/);
});
