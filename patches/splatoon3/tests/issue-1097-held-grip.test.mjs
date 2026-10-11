import test from 'node:test';
import assert from 'node:assert/strict';
import { production, rig } from './spawn-pose-fixture.mjs';

test('#1097 shooter support-hand stays on its authored grip during hit recovery', async () => {
  const api = await production();
  const r = rig(api, { kind: 'shooter' });
  try {
    for (let i = 0; i < 30; i++) r.step(1 / 60);
    r.ch.trigger('hit', { x: 0, z: 1, amp: 1 });
    for (let frame = 0; frame < 24; frame++) {
      r.step(1 / 60);
      const w = r.ch.weapon;
      const actual = r.ch.bones.handL.getWorldPosition(new api.THREE.Vector3());
      const expected = w.off.localToWorld(w.def.handL.pos.clone());
      const gap = actual.distanceTo(expected);
      assert.ok(Number.isFinite(gap) && gap < 0.025,
        'frame ' + frame + ': left hand must stay within 2.5cm of support grip (gap=' + gap + ')');
    }
  } finally {
    r.close();
  }
});
