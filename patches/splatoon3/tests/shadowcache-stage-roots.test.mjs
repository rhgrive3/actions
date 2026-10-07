import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// Issue #658: while Shadows are OFF the shadow-map render path never runs, so
// nothing rebuilds the collected static casters. The stage-switch root handoff
// (`setStaticRoots`) is the only boundary that can release the previous stage's
// disposed caster graph (merged geometry, materials, PropKit paint atlas).
test('stage switch releases the previous static caster generation while shadows stay disabled', async () => {
  const { ShadowCache } = await fixture();
  const cache = new ShadowCache({ shadowMap: { render() {} } });

  const stageA = { name: 'stage-a-caster' };
  cache.static = [{ o: stageA, m: new Float64Array(16), iv: 0, pv: 0, vis: true, cnt: 0 }];

  const stageB = { name: 'stage-b-root' };
  cache.setStaticRoots([stageB]);

  assert.deepEqual(cache.roots, [stageB], 'roots must point only at the new stage');
  assert.equal(cache.dirty, true, 'the cache must rebuild on the next shadow update');
  assert.equal(cache.static.length, 0, 'stale stage-A casters must not outlive the root handoff');
  assert.equal(cache.static.some((entry) => entry.o === stageA), false,
    'no stage-A mesh may stay reachable through ShadowCache.static');
});

test('repeated stage transitions never accumulate a stale caster generation', async () => {
  const { ShadowCache } = await fixture();
  const cache = new ShadowCache({ shadowMap: { render() {} } });

  for (let stage = 0; stage < 3; stage++) {
    const stale = { name: `stage-${stage}-caster` };
    cache.static = [{ o: stale, m: new Float64Array(16), iv: 0, pv: 0, vis: true, cnt: 0 }];
    const next = { name: `stage-${stage + 1}-root` };
    cache.setStaticRoots([next]);
    assert.deepEqual(cache.roots, [next]);
    assert.equal(cache.static.length, 0, `stage ${stage} generation retained after handoff`);
  }
  assert.equal(typeof cache.dynamic.has, 'function', 'dynamic demotion bookkeeping is reset, not dropped');
});
