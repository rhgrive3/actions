import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {instrumentMenuPage,secureLaunchOptions} from '../check-inkwave-turf-menu-probe.mjs';

const selector='.iw-modesel [data-id="mode-turf"]';
function fake(fail) {
  const calls=[],error=Error('native tap failed'), target={async tap(options){calls.push(['tap',options]);if(fail)throw error;}},other={};
  return {calls,error,target,other,page:{mouse:{move:async(...args)=>calls.push(['move',...args])},evaluate:async fn=>fn(),locator:s=>s===selector?target:other}};
}
test('probe observes exactly one native tap and preserves the original options',async()=>{
  const h=fake(false),seen=[],page=instrumentMenuPage(h.page,async stage=>seen.push(stage));
  assert.equal(page.locator('other'),h.other);await page.mouse.move(1,1);
  await page.locator(selector).tap({timeout:1234});
  assert.deepEqual(h.calls,[['move',1,1],['tap',{timeout:1234}]]);assert.deepEqual(seen,['before-tap','tap-succeeded']);
});
test('probe records failure and propagates the exact native error without fallback',async()=>{
  const h=fake(true),seen=[],page=instrumentMenuPage(h.page,async stage=>seen.push(stage));
  await page.mouse.move(1,1);await assert.rejects(page.locator(selector).tap({timeout:1234}),error=>error===h.error);
  assert.deepEqual(h.calls,[['move',1,1],['tap',{timeout:1234}]]);assert.deepEqual(seen,['before-tap','tap-failed']);
});
test('observer failure cannot suppress or replace a native tap error',async()=>{
  const h=fake(true),errors=[],page=instrumentMenuPage(h.page,async()=>{throw Error('observer fault');},(stage,error)=>errors.push([stage,error.message]));
  await page.mouse.move(1,1);await assert.rejects(page.locator(selector).tap({timeout:9}),error=>error===h.error);
  assert.deepEqual(errors,[['before-tap','observer fault'],['tap-failed','observer fault']]);
  assert.deepEqual(h.calls,[['move',1,1],['tap',{timeout:9}]]);
});
test('workflow is narrowly push-scoped and diagnostics cannot change acceptance paths',()=>{
  const wf=readFileSync(new URL('../../.github/workflows/inkwave-menu-probe-diagnostic.yml',import.meta.url),'utf8');
  assert.match(wf,/branches: \[diagnostic\/inkwave-menu-probe-20261028\]/);assert.doesNotMatch(wf,/pull_request:|workflow_dispatch:|deploy|write-all|contents: write/);
  assert.match(wf,/contents: read/);assert.match(wf,/timeout-minutes: 25/);assert.match(wf,/if: always\(\)/);assert.match(wf,/897bbaa4550aae24c1d710216127ff5e52a64ad6/);
  const source=readFileSync(new URL('../check-inkwave-turf-menu-probe.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/dispatchEvent\(|\.press\(|_setFocus\(|\.click\(|\.tap\([^\n]*force\s*:/);
  assert.match(source,/startProjectileThroughMenu\(menu,/);assert.match(source,/viewport:\{width:844,height:390\}/);assert.match(source,/reducedMotion:'reduce'/);
  assert.match(source,/if\(!process\.env\.MENU_SITE\|\|!process\.env\.MENU_EVIDENCE\)/);assert.match(source,/if\(originalError\)throw originalError/);
});

test('diagnostic launch keeps Chromium sandboxed and forbids insecure overrides',()=>{
  assert.equal(secureLaunchOptions.chromiumSandbox,true);
  assert.equal(Object.hasOwn(secureLaunchOptions,'args'),false);
  const source=readFileSync(new URL('../check-inkwave-turf-menu-probe.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/--(?:no-sandbox|disable-setuid-sandbox|disable-web-security|disable-features|enable-unsafe-swiftshader|ignore-gpu-blocklist|disable-gpu-sandbox|allow-insecure-localhost)/i);
  assert.match(source,/launchPersistentContext\(profile,secureLaunchOptions\)/);
  const wf=readFileSync(new URL('../../.github/workflows/inkwave-menu-probe-diagnostic.yml',import.meta.url),'utf8');
  assert.match(wf,/runs-on: ubuntu-22\.04/);
  assert.match(source,/Non-reproduction cannot clear that earlier failure/);
});
