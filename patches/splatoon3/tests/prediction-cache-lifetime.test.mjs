import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { productionComposition as compose } from './weapon-edgecases-fixture.mjs';

async function world(old = false) {
  const source = fs.readFileSync(new URL('../bootstrap.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/^import \{ (\w+) \} from '(.*?)';/gm)].filter(m => m[1] !== 'install');
  const extraExports = "export { computeShotGuide, updateShotGuide } from './patches/splatoon3/runtime/weapons-fidelity.mjs';\n" + imports.map(m => `export { ${m[1]} } from './patches/splatoon3/${m[2]}';`).join('\n');
  const adapt = (rel, raw) => {
    const code = compose(rel, raw);
    if (old === true && rel === 'patches/splatoon3/runtime/weapons-fidelity.mjs') {
      const start = code.indexOf('    // Presentation predictions never enter list/pool.');
      const end = code.indexOf('    this._s3DetachedWallDrops?.splice(0);', start);
      assert(start > 0 && end > start, 'remove only the new prediction-cache cleanup');
      return code.slice(0, start) + code.slice(end);
    }
    if (old === 'arc' && rel === 'patches/splatoon3/runtime/weapons.mjs') {
      const start = code.indexOf('  const clearArc = Projectiles.prototype.clear;');
      const end = code.indexOf('  Object.defineProperty(Projectiles.prototype, ARC_PREVIEW_INSTALL', start);
      assert(start > 0 && end > start, 'remove only arc cache clear ownership');
      return code.slice(0, start) + code.slice(end);
    }
    return code;
  };
  const f = await fixture({ fullRuntime: true, adapt, adaptRuntime: adapt, realProjectiles: true, extraExports });
  // installS3 alone is not the production bootstrap. Apply every additional
  // installer in the actual entry's order, including disconnect and quality.
  const calls = [...source.matchAll(/^  (install\w+)\(/gm)];
  assert.equal(calls.length, imports.length);
  for (const [, name] of calls) {
    assert.equal(typeof f[name], 'function', `${name} is exported from the real bootstrap import`);
    if (name === 'installQuality') f[name](f.profile);
    else f[name](f.installedRuntime, f.profile);
  }
  const level = new f.Level({ bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    spawnPads: [[-10, 0, 0], [10, 0, 0]], spawnBarrier: 0, half: [],
    single: [{ kind: 'box', min: [-50, -1, -50], max: [50, 0, 50] }] });
  f.G.level = level; f.G.physics = new f.Physics(level);
  f.G.camera = new f.THREE.PerspectiveCamera(60, 16 / 9, .1, 400);
  f.G.camera.position.set(0, 3, -6); f.G.camera.lookAt(0, 1, 20); f.G.camera.updateMatrixWorld();
  f.G.match.state = 'playing'; f.setRandom(() => .5);
  return f;
}
function previews(f) {
  const ps = f.G.projectiles, actors = {}, values = {};
  for (const kind of ['shooter', 'splatling', 'slosher', 'blaster', 'dualies']) {
    const a = actors[kind] = f.make(kind);
    a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1.05, 20);
    if (kind === 'shooter') {
      const hit = ps.muzzleBlockFeedback(a);
      values.muzzle = hit ? [hit.dist, ...hit.point.toArray()] : null;
    }
    if (kind === 'shooter' || kind === 'splatling') values[kind] = { ...f.updateShotGuide({ enabled: true, a }) };
    if (kind === 'slosher' || kind === 'blaster') values[kind] = [...ps.s3WeaponGuide(a, a.weapon, f.G.camera, 1280, 720).toArray()];
    if (kind === 'dualies') values[kind] = ps.s3DualiesGuides(a, a.weapon, f.G.camera).map(p => [...p.toArray()]);
  }
  assert.equal(ps.list.length, 0, 'HUD predictions are never active gameplay rounds');
  return { ps, actors, values };
}
function scratches(f, ps = f.G.projectiles) {
  return [ps._s3ShooterImpact, ps._s3SlosherGuideProjectile, ps._s3BlasterGuideProjectile,
    ...ps._s3DualiesGuideProjectiles, f.installedRuntime._shotGuide.probe];
}
function released(f) {
  const ps = f.G.projectiles;
  for (const p of scratches(f)) assert.equal(p.owner, null);
  for (const name of ['_s3GuideCache', '_s3ShooterImpactCache', '_s3MuzzleFeedbackCache', '_dualiesGuideCache'])
    assert.equal(ps[name], null, `${name} releases its Actor, Character and world keys`);
}

test('counterfactual presentation caches keep retired Actors and the old Level after native clear', async () => {
  const f = await world(true), { ps, actors } = previews(f), oldLevel = f.G.level;
  ps.clear();
  assert.equal(ps._s3ShooterImpact.owner, actors.shooter);
  assert.equal(ps._s3ShooterImpactCache.actor, actors.shooter);
  assert.equal(ps._s3MuzzleFeedbackCache.actor, actors.shooter);
  assert.equal(ps._s3MuzzleFeedbackCache.level, oldLevel);
  assert.equal(ps._s3GuideCache.key.actor, actors.blaster);
  assert.equal(ps._s3GuideCache.key.level, oldLevel);
  assert.equal(ps._s3SlosherGuideProjectile.owner, actors.slosher);
  assert.equal(ps._s3BlasterGuideProjectile.owner, actors.blaster);
  assert(ps._s3DualiesGuideProjectiles.every(p => p.owner === actors.dualies));
  assert.equal(f.installedRuntime._shotGuide.probe.owner, actors.splatling);
});

test('native clear releases guide owners and world keys without discarding reusable scratch storage', async () => {
  const f = await world(), { ps } = previews(f), records = scratches(f);
  const vectors = records.map(p => [p.pos, p.prev, p.vel]);
  ps.clear(); released(f);
  for (const [i, p] of scratches(f).entries()) {
    assert.equal(p, records[i]);
    for (const [j, v] of [p.pos, p.prev, p.vel].entries()) assert.equal(v, vectors[i][j]);
  }
  ps.clear(); released(f);
});

test('clear followed by fresh previews preserves every guide result and resumes cache reuse', async () => {
  const f = await world(), first = previews(f).values, ps = f.G.projectiles;
  for (let match = 0; match < 20; match++) {
    ps.clear(); released(f); f.G.actors.length = 0;
    const { actors, values } = previews(f); assert.deepEqual(values, first);
    const impact = ps._s3ShooterImpactCache, muzzle = ps._s3MuzzleFeedbackCache, guide = ps._s3GuideCache;
    for (let frame = 0; frame < 60; frame++) {
      ps.muzzleBlockFeedback(actors.shooter);
      ps.s3WeaponGuide(actors.blaster, actors.blaster.weapon, f.G.camera, 1280, 720);
      ps.s3DualiesGuides(actors.dualies, actors.dualies.weapon, f.G.camera);
    }
    assert.equal(ps._s3ShooterImpactCache, impact); assert.equal(ps._s3MuzzleFeedbackCache, muzzle);
    assert.equal(ps._s3GuideCache, guide);
  }
  ps.clear(); released(f);
});

test('clearing an unrelated Projectiles instance preserves the current controller guide scratch', async () => {
  const f = await world(), { actors } = previews(f);
  const other = new f.Projectiles({ add() {}, remove() {} }); other.clear();
  assert.equal(f.installedRuntime._shotGuide.probe.owner, actors.splatling);
  f.G.projectiles.clear(); released(f);
});

test('prediction methods remain connected to actual production HUD and player consumers', () => {
  const root = new URL('../../../', import.meta.url);
  const player = compose('src/game/player.js', fs.readFileSync(new URL('inkwave-public/src/game/player.js', root), 'utf8'));
  const hud = compose('src/ui/hud.js', fs.readFileSync(new URL('inkwave-public/src/ui/hud.js', root), 'utf8'));
  const main = compose('src/main.js', fs.readFileSync(new URL('inkwave-public/src/main.js', root), 'utf8'));
  assert.match(player, /updateShotGuide\(this\)/);
  assert.match(main, /muzzleBlockFeedback\?\.\(a\)/);
  assert.match(main, /G\.projectiles\.clear\(\)/);
  assert.match(hud, /s3WeaponGuide\?\.\(guideMe, guideMe\.weapon/);
  assert.match(hud, /s3DualiesGuides\?\.\(guideMe, guideMe\.weapon/);
});

function arcState(ps) {
  const key = Object.getOwnPropertySymbols(ps).find(k => k.description === 'inkwave.s3.arc-preview-performance.state');
  return key ? ps[key] : undefined;
}
test('counterfactual bomb arc retains Actor and Physics after clear, and hide still retains Physics', async () => {
  const f = await world('arc'), actor = f.make('shooter'), ps = f.G.projectiles;
  ps.updateArc(actor, true); ps.clear();
  assert.equal(arcState(ps).actor, actor); assert.equal(arcState(ps).physics, f.G.physics);
  assert.equal(ps._arcCache.physics, f.G.physics);
  ps.updateArc(actor, false);
  assert.equal(arcState(ps), undefined);
  assert.equal(ps._arcCache.physics, f.G.physics, 'hiding alone was not world-reference cleanup');
});

test('bomb arc clear releases owner/world keys, preserves geometry and rebuilds identical prediction', async () => {
  const f = await world(), actor = f.make('shooter'), ps = f.G.projectiles;
  ps.updateArc(actor, true);
  const pos = ps.arcGeo.attributes.position, dist = ps.arcGeo.attributes.lineDistance;
  const expected = [...pos.array], pathLength = ps.arcGeo.drawRange.count;
  for (let match = 0; match < 10; match++) {
    ps.clear(); assert.equal(arcState(ps), undefined); assert.equal(ps._arcCache, null);
    assert.equal(ps.arcGeo.attributes.position, pos); assert.equal(ps.arcGeo.attributes.lineDistance, dist);
    ps.updateArc(actor, true);
    assert.equal(arcState(ps).actor, actor); assert.equal(ps._arcCache.physics, f.G.physics);
    assert.deepEqual([...pos.array], expected); assert.equal(ps.arcGeo.drawRange.count, pathLength);
    assert.equal(ps.bombs.length, 0, 'preview clear/rebuild never emits a gameplay bomb');
  }
});

test('clearing another projectile system cannot retire the active bomb arc cache', async () => {
  const f = await world(), actor = f.make('shooter'), ps = f.G.projectiles;
  ps.updateArc(actor, true); const state = arcState(ps), cache = ps._arcCache;
  const other = new f.Projectiles({ add() {}, remove() {} }); other.clear();
  assert.equal(arcState(ps), state); assert.equal(ps._arcCache, cache);
});
