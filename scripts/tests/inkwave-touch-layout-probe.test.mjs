import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {secureLaunchOptions} from '../check-touch-menu-layout-probe.mjs';
const script=readFileSync(new URL('../check-touch-menu-layout-probe.mjs',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../../.github/workflows/inkwave-touch-layout-diagnostic.yml',import.meta.url),'utf8');
test('probe preserves Chromium sandbox and normal input',()=>{
  assert.equal(secureLaunchOptions.chromiumSandbox,true);
  assert.doesNotMatch(script,/--no-sandbox|--disable-setuid-sandbox|(?:tap|click)\([^)]*force:\s*true|dispatchEvent\(/);
  assert.match(script,/locator\.tap\(\{timeout:15000\}\)/);
  assert.match(script,/locator\.click\(\{timeout:15000\}\)/);
  assert.match(script,/elementsFromPoint/);
  assert.match(script,/setup-after-revisit/);
});
test('before and after are separate source builds and viewport cases',()=>{
  assert.match(workflow,/side: \[before, after\]/);
  assert.match(workflow,/viewport: \[landscape, portrait, desktop\]/);
  assert.match(workflow,/c694e177a443a79801bf73f8b6cd986d100cf531/);
  assert.match(workflow,/if: always\(\)/);
});
