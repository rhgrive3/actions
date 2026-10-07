import test from 'node:test';
import assert from 'node:assert/strict';
import { resourceSurface } from '../runtime/resources.mjs';

test('#1069 resourceSurface returns a scalar while preserving the post-movement surface sample', () => {
  let calls = 0;
  const a = {
    form: 'squid', grounded: true, groundTeam: 1, submerged: false, onEnemy: false,
    _surface() { calls++; },
  };
  const isSquid = resourceSurface(a);
  assert.equal(calls, 1);
  assert.equal(isSquid, true);
  assert.equal(a.submerged, true);
  assert.equal(a.onEnemy, false);
  assert.equal(typeof isSquid, 'boolean',
    'hot resource pass no longer returns a temporary surface-state object');

  a.form = 'kid'; a.groundTeam = 2;
  assert.equal(resourceSurface(a), false);
  assert.equal(a.submerged, false);
  assert.equal(a.onEnemy, true);
});
