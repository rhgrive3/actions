import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const from = 'for(const p of this.list)before.add(p);\n        const result = original.call(this, a, w); const group = new Map();\n        for (const p of this.list) if (!before.has(p)) {';
const to = 'const start = this.list.length; const result = original.call(this, a, w); const group = new Map();\n      for (let i = start; i < this.list.length; i++) { const p = this.list[i];';
async function run(candidate, mutation, family) {
  let replaced = 0;
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
    adaptRuntime(rel, code) {
      if (candidate && rel === 'patches/splatoon3/runtime/weapons.mjs') {
        assert.equal(code.split(from).length, 2); replaced++; return code.replace(from, to);
      }
      return code;
    } });
  assert.equal(replaced, candidate ? 1 : 0);
  const ps = f.G.projectiles, a = f.make(family);
  Object.assign(a, { form: 'kid', grounded: true, yaw: 0, aimYaw: 0, aimPitch: 0 });
  a.pos.set(0, 0, 0); a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1, 30);
  const old = ps._new(); old.marker = 'existing'; ps.list.push(old);
  const old2 = ps._new(); old2.marker = 'existing2'; ps.list.push(old2);
  const originalGroup = new Map(); old.s3DamageGroup = originalGroup; old2.s3DamageGroup = originalGroup;
  // Native weapon:fire is synchronous and is publicly subscribable. Run the
  // mutation after native births, before the outer damage-group wrapper ends.
  const off = f.on('weapon:fire', event => {
    if (event.actor !== a) return;
    if (mutation === 'remove') ps.list.splice(0, 2);
    if (mutation === 'reorder') ps.list.reverse();
    if (mutation === 'reuse') {
      ps.list.splice(0, 2);
      ps._recycle(old);
      const reused = ps._new(); assert.equal(reused, old);
      reused.marker = 'reused-in-callback'; ps.list.unshift(reused);
    }
  });
  ps[family === 'roller' ? 'fireFlick' : 'fireSlosh'](a, a.weapon); off();
  return ps.list.map(p => ({ existing: p === old || p === old2, grouped: typeof p.s3DamageGroup?.get === 'function' && typeof p.s3DamageGroup?.set === 'function',
    overwrittenExisting: (p === old || p === old2) && p.s3DamageGroup !== originalGroup,
    freshGroup: ![old, old2].includes(p) && p.s3DamageGroup !== null }));
}
for (const family of ['roller', 'slosher']) for (const mutation of ['remove', 'reorder', 'reuse'])
  test('actual ' + family + ' suffix counterfactual changes group identity under synchronous ' + mutation, async () => {
    const baseline = await run(false, mutation, family), candidate = await run(true, mutation, family);
    assert.equal(baseline.length, candidate.length);
    assert.notDeepEqual(candidate, baseline, 'the proposed suffix cannot replace original object-membership semantics');
    assert.ok(baseline.filter(row => !row.existing).every(row => row.grouped));
  });
