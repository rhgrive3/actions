import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../runtime/special-vfx-kit.mjs', import.meta.url), 'utf8');
const ink = source.slice(source.indexOf('vec3 sxInk('), source.indexOf('export function inkLightUniforms'));
const f = Math.fround;
function glint(x) {
  const rl = f(x);
  if (!(rl > .65)) return 0;
  const rl2 = f(rl * rl), rl3 = f(rl2 * rl), rl6 = f(rl3 * rl3);
  const rl12 = f(rl6 * rl6), rl24 = f(rl12 * rl12), rl48 = f(rl24 * rl24);
  const rl150 = f(f(f(rl48 * rl48) * rl48) * rl6);
  return f(f(rl150 * 7) + f(rl24 * f(.22)));
}

test('cosmetic glint approximation keeps the crisp highlight and a bounded linear-colour error', () => {
  assert.match(ink, /if \(rl > 0\.65\)/);
  assert.doesNotMatch(ink, /pow\(rl,/);
  assert.match(ink, /smoothstep\(0\.86, 0\.9, rl\) \* 0\.85 \* g/);
  let cutoffError = 0, maxError = 0;
  for (let i = 0; i <= 100000; i++) {
    const x = f(i / 100000), original = Math.pow(x, 150) * 7 + Math.pow(x, 24) * .22;
    const error = Math.abs(glint(x) - original);
    maxError = Math.max(maxError, error);
    if (x <= .65) cutoffError = Math.max(cutoffError, error);
  }
  assert.ok(cutoffError < 7.2e-6, String(cutoffError));
  assert.ok(maxError < 6e-5, String(maxError));
  assert.equal(glint(0), 0);
  assert.ok(Math.abs(glint(1) - 7.22) < 1e-6);
});
