// INKWAVE issue #480 focused regression.
//
// Negative main control: the unmodified CameraRig shake term is multiplied by
// the non-native `settings.cameraShake`, so an identical trauma input produces a
// different gameplay-camera shake for cameraShake=0 vs 1. The adapted source must
// produce identical output for both, and the non-native slider row must be gone.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {
  adaptIssue480Source, ISSUE_480_CAMERA_RIG, ISSUE_480_SCREENFX, ISSUE_480_MENUS,
} from '../issue-480-camera-shake-fidelity.mjs';

const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, ROOT), 'utf8');
const upstream = (rel) => read('inkwave-public/' + rel);

// Evaluate the real shipped `const sh = ...;` statement from the source text.
function shakeStatement(source) {
  const m = source.match(/const sh = this\.trauma \* this\.trauma \*[^\n]*;/);
  assert.ok(m, 'cameraRig shake statement not found');
  return m[0];
}
function evalShake(stmt, { trauma, shakeScale, cameraShake }) {
  const fn = vm.runInNewContext(`(function(s){ ${stmt} return sh; })`, {});
  return fn.call({ trauma, shakeScale }, { cameraShake });
}

test('#480 negative main control: baseline shake term depends on the non-native cameraShake setting', () => {
  const raw = upstream(ISSUE_480_CAMERA_RIG);
  assert.match(raw, /cameraShake/);
  const stmt = shakeStatement(raw);
  const a = evalShake(stmt, { trauma: 0.8, shakeScale: 1, cameraShake: 0 });
  const b = evalShake(stmt, { trauma: 0.8, shakeScale: 1, cameraShake: 1 });
  assert.notEqual(a, b, 'baseline must let the non-native setting alter the gameplay camera shake');
  assert.equal(a, 0);
});

test('#480 adapted CameraRig: identical trauma gives identical shake regardless of stale cameraShake', () => {
  const adapted = adaptIssue480Source(ISSUE_480_CAMERA_RIG, upstream(ISSUE_480_CAMERA_RIG));
  assert.doesNotMatch(adapted, /s\?\.cameraShake/);
  assert.match(adapted, /const sh = this\.trauma \* this\.trauma \* this\.shakeScale;/);
  const stmt = shakeStatement(adapted);
  const zero = evalShake(stmt, { trauma: 0.8, shakeScale: 1, cameraShake: 0 });
  const one = evalShake(stmt, { trauma: 0.8, shakeScale: 1, cameraShake: 1 });
  assert.equal(zero, one);
  const expected = 0.8 * 0.8 * 1; // trauma^2 * shakeScale, unchanged native curve
  assert.ok(Math.abs(zero - expected) < 1e-12);
});

test('#480 screenfx and menus drop the non-native setting; transform is scoped and once-only', () => {
  const rawMenus = upstream(ISSUE_480_MENUS);
  const rawFx = upstream(ISSUE_480_SCREENFX);
  assert.match(rawMenus, /key: 'cameraShake'/);
  const adaptedMenus = adaptIssue480Source(ISSUE_480_MENUS, rawMenus);
  assert.doesNotMatch(adaptedMenus, /cameraShake/);
  assert.equal(rawMenus.split('{ key:').length - adaptedMenus.split('{ key:').length, 1, 'exactly one settings row removed');
  new vm.SourceTextModule(adaptedMenus, { context: vm.createContext({}) }); // parses

  const adaptedFx = adaptIssue480Source(ISSUE_480_SCREENFX, rawFx);
  assert.doesNotMatch(adaptedFx, /G\.settings\?\.cameraShake/);
  assert.match(adaptedFx, /const shake = 1;/);
  assert.match(adaptedFx, /reducedMotion\(\) \? 0\.35 : 1/);

  assert.equal(adaptIssue480Source('src/main.js', 'untouched'), 'untouched');
  assert.throws(() => adaptIssue480Source(ISSUE_480_MENUS, adaptedMenus), /issue-480 patch conflict/);
  assert.throws(() => adaptIssue480Source(ISSUE_480_CAMERA_RIG, adaptedMenus), /issue-480 patch conflict/);
});
