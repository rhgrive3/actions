import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
let loaded;
async function setup() {
  if (!loaded) loaded = fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
    extraExports: `export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';
    export { MAIN_WEAPON_CATALOG } from './patches/splatoon3/runtime/main-weapon-catalog-data.mjs';` }).then(f => {
      f.installMainWeaponCatalogRuntime(f.installedRuntime, f.profile);
      f.G.physics.segment = (_a, _b, h) => { h.hit = false; return h; }; return f;
    });
  return loaded;
}
function actor(f, id = 's3-slosher-double-02') {
  f.G.projectiles.clear(); f.G.actors.length = 0;
  const a = f.make(id); a.form = 'kid'; a.ink = 100; return a;
}
function step(f, a, input = {}, ink = null) {
  if (ink !== null) a.ink = ink;
  f.G.time += 1 / 60; a.weaponRunner.update(1 / 60, input);
}
const sloshes = a => a.character.events.filter(e => e[0] === 'slosh');
test('Added catalogue sloshers expose source windup to the existing presentation owner', async () => {
  const f = await setup();
  for (const r of f.MAIN_WEAPON_CATALOG.records.filter(r => !r.legacy && r.family === 'slosher')) {
    const w = f.WEAPONS[r.id]; assert.equal(w.windup, (r.parameters.WeaponParam.SwingLiftFrame ?? 12) / 60);
    assert.ok(w.fireInterval > w.windup, r.id);
  }
  assert.equal(f.WEAPONS['s3-slosher-double-02'].windup, f.WEAPONS['s3-slosher-double'].windup);
});
test('One native slosh notification follows actual admitted volley, never reservation', async () => {
  const f = await setup(), a = actor(f), startInk = a.ink;
  step(f, a, { fire: true });
  assert.ok(a.weaponRunner.catalogState.pending); assert.ok(a.ink < startInk);
  assert.equal(f.G.projectiles.list.length, 0); assert.equal(sloshes(a).length, 0);
  let frame = 0;
  while (!f.G.projectiles.list.length && frame++ < 90) {
    assert.equal(sloshes(a).length, 0); step(f, a);
  }
  assert.ok(f.G.projectiles.list.length > 0); assert.equal(sloshes(a).length, 1);
  assert.equal(a.character.events.filter(e => e[0] === 'shoot').length, 0);
  for (let i = 0; i < 90; i++) step(f, a);
  assert.equal(sloshes(a).length, 1, 'multi-unit delayed volley must not duplicate notification');
});
test('Empty ink cannot reserve or emit a catalogue slosh presentation', async () => {
  const f = await setup(), a = actor(f);
  for (let i = 0; i < 90; i++) step(f, a, { fire: true }, 0);
  assert.equal(a.weaponRunner.catalogState.pending, null); assert.equal(f.G.projectiles.list.length, 0); assert.equal(sloshes(a).length, 0);
});
test('Sub, death and reset cancellation discard reserved shots without slosh-only animation', async () => {
  const f = await setup();
  for (const cancellation of ['sub', 'death', 'reset']) {
    const a = actor(f); step(f, a, { fire: true }); assert.ok(a.weaponRunner.catalogState.pending);
    if (cancellation === 'reset') a.weaponRunner.reset();
    else if (cancellation === 'death') { a.alive = false; step(f, a); }
    else step(f, a, { sub: true });
    for (let i = 0; i < 90; i++) step(f, a);
    assert.equal(f.G.projectiles.list.length, 0, cancellation); assert.equal(sloshes(a).length, 0, cancellation);
  }
});
