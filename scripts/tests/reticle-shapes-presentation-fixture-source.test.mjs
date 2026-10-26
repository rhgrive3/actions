// Node-only source/cascade/selector contract; not a browser/game acceptance gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadNativeBlasterFixture} from './fixtures/blaster-presentation-native-fixture.mjs';
const sourceRoot=process.env.SHAPES_SOURCE_ROOT||new URL('../../',import.meta.url).pathname;
const fixture=await loadNativeBlasterFixture(sourceRoot);
const browser=fs.readFileSync(new URL('./reticle-shapes-presentation-admission-browser.test.mjs',import.meta.url),'utf8');
test('actual composed native CSS keeps SVG root unscaled and owns response on only outer circle',()=>{
 assert.deepEqual(fixture.cssInputs,['inkwave-public/styles/hud.css','patches/splatoon3/ui.css']);
 const root=[...fixture.css.matchAll(/\.iw-ret--blaster \.iw-ret__svg\s*\{([^}]+)\}/g)].at(-1)?.[1];
 assert.match(root,/transform:\s*none/);assert.match(root,/transition:\s*none/);
 const outer=fixture.css.match(/\.iw-ret--blaster \.iw-ret__svg circle\.iw-ret__ring:not\(\.thin\)\s*\{([^}]+)\}/)?.[1];
 assert.match(outer,/transform:\s*scale\(calc\(1 \+ var\(--sp, 0\) \* \.012\)\)/);
 assert.match(outer,/transition:\s*transform \.1s linear/);assert.match(outer,/transform-box:\s*fill-box/);
});
test('baseline and candidate select different actual animation owners and derive different dimensions',()=>{
 const baseline=fixture.spec(false,34.9),candidate=fixture.spec(true,34.9);
 assert.equal(baseline.animationOwner,'.iw-ret__svg circle.iw-ret__ring:not(.thin)');
 assert.equal(candidate.animationOwner,'.iw-reticle-blaster-diagonal-proposal');
 assert(Math.abs(baseline.expectedDiameter-65.2648)<1e-9);assert(Math.abs(candidate.expectedDiameter-113.504)<1e-9);
 assert.equal(baseline.expectedSvgWidth,80);assert.equal(candidate.expectedSvgWidth,80);assert.equal(baseline.expectedSvgTransform,'none');
 assert.notEqual(baseline.expectedDiameter,candidate.expectedDiameter);
});
test('candidate mirrors source installer: original outer r23 hidden, same inner r13; baseline stays r9',()=>{
 assert.match(fixture.nativeMarkup,/iw-ret__bias[^>]*hidden/);
 assert.match(fixture.nativeMarkup,/<circle r="23" class="iw-ret__ring"/);assert.match(fixture.nativeMarkup,/<circle r="9" class="iw-ret__ring thin"/);
 assert.doesNotMatch(fixture.nativeMarkup,/display:none|diagonal-proposal/);
 assert.match(fixture.candidateMarkup,/<circle style="display:none" r="23" class="iw-ret__ring"/);
 assert.match(fixture.candidateMarkup,/<circle r="13" class="iw-ret__ring thin"/);
 assert.equal((fixture.candidateMarkup.match(/iw-reticle-blaster-diagonal-proposal/g)||[]).length,1);
});
test('browser contract consumes source-backed spec instead of asserting candidate geometry on native SVG',()=>{
 assert.match(browser,/loadNativeBlasterFixture\(sourceRoot\)/);assert.match(browser,/fixture\.spec\(candidate,34\.9\)/);
 assert.match(browser,/page\.locator\(spec\.animationOwner\)/);assert.match(browser,/spec\.expectedDiameter/);
 assert.match(browser,/spec\.expectedSvgWidth/);assert.match(browser,/spec\.expectedInnerRadius/);
 assert.doesNotMatch(browser,/css\.width-113\.504|candidate\?'.iw-reticle-blaster-diagonal-proposal':'.iw-ret__svg'/);
});
