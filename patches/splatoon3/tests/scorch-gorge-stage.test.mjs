import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource, checkCompatibility, replaceOnce, PATCH_ROOT } from '../adapter.mjs';
import { adaptScorchGorge } from '../scorch-gorge-adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';
import { fixture } from './source-fixture.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');

function compose(rel, code) {
  return adaptRange(rel, adaptSource(rel, code));
}

async function loadRealm() {
  const context = vm.createContext({ console, performance, URL, setTimeout, clearTimeout });
  const modules = new Map();

  const resolve = (spec, from) => {
    if (spec === 'three') return path.join(SRC, 'vendor/three/build/three.module.js');
    if (spec.startsWith('three/addons/')) return path.join(SRC, 'vendor/three/jsm', spec.slice('three/addons/'.length));
    return path.resolve(path.dirname(from), spec);
  };

  const load = requested => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep) ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep) || file.startsWith(path.join(ROOT, 'assets') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const source = fs.readFileSync(file, 'utf8');
    const rel = file.startsWith(SRC + path.sep)
      ? path.relative(SRC, file)
      : path.relative(ROOT, file);
    const transformed = compose(rel.split(path.sep).join('/'), source);
    const mod = new vm.SourceTextModule(transformed, {
      context,
      identifier: file,
      initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; },
    });
    modules.set(file, mod);
    return mod;
  };

  const entry = new vm.SourceTextModule(`
    export * as THREE from 'three';
    export { MAP_LAYOUTS } from './inkwave-public/src/world/maps.js';
    export { MAPS, OFFLINE_MAPS, mapById, mapNoBots, PLAYER } from './inkwave-public/src/config.js';
    export { Level } from './inkwave-public/src/world/level.js';
    export { PATTERN } from './inkwave-public/src/world/mapkit.js';
  `, { context, identifier: path.join(ROOT, 'scorch-stage-test-entry.mjs') });

  await entry.link((spec, from) => load(resolve(spec, from.identifier)));
  await entry.evaluate();
  return entry.namespace;
}

test('build/adapter: Scorch Gorge adapter connects cleanly, fails closed on re-application, upstream locked', () => {
  checkCompatibility(SRC);

  const mapsSrc = fs.readFileSync(path.join(SRC, 'src/world/maps.js'), 'utf8');
  const configSrc = fs.readFileSync(path.join(SRC, 'src/config.js'), 'utf8');
  const i18nSrc = fs.readFileSync(path.join(SRC, 'src/i18n.js'), 'utf8');

  const adaptedMaps = adaptScorchGorge('src/world/maps.js', mapsSrc, replaceOnce);
  assert.ok(adaptedMaps.includes("MAP_LAYOUTS.scorch = SCORCH;"));
  assert.throws(() => adaptScorchGorge('src/world/maps.js', adaptedMaps, replaceOnce), /already connected/);

  const adaptedConfig = adaptScorchGorge('src/config.js', configSrc, replaceOnce);
  assert.ok(adaptedConfig.includes("id: 'scorch'"));
  assert.throws(() => adaptScorchGorge('src/config.js', adaptedConfig, replaceOnce), /already connected/);

  const adaptedI18n = adaptScorchGorge('src/i18n.js', i18nSrc, replaceOnce);
  assert.ok(adaptedI18n.includes("scorch: ['ユノハナ大渓谷'"));
  assert.throws(() => adaptScorchGorge('src/i18n.js', adaptedI18n, replaceOnce), /already connected/);
});

test('startup/registry: scorch stage registered in MAP_LAYOUTS, MAPS, OFFLINE_MAPS, and i18n', async () => {
  const R = await loadRealm();
  assert.ok(R.MAP_LAYOUTS.scorch, 'MAP_LAYOUTS must contain scorch');
  assert.equal(R.MAP_LAYOUTS.scorch.id, 'scorch');

  const meta = R.mapById('scorch');
  assert.ok(meta, 'mapById("scorch") must return stage metadata');
  assert.equal(meta.name, 'Scorch Gorge');
  assert.equal(meta.theme, 'day');
  assert.ok(R.MAPS.some(m => m.id === 'scorch'), 'MAPS must include scorch');
  assert.ok(R.OFFLINE_MAPS.some(m => m.id === 'scorch'), 'OFFLINE_MAPS must include scorch');
  assert.equal(R.mapNoBots('scorch'), false, 'Scorch Gorge must admit bots');

  const i18n = fs.readFileSync(path.join(SRC, 'src/i18n.js'), 'utf8');
  assert.match(compose('src/i18n.js', i18n), /scorch:\s*\['ユノハナ大渓谷'/);
});

test('spawn: Team Alpha and Bravo spawn pads are elevated, supported, and above death boundary', async () => {
  const R = await loadRealm();
  const L = R.MAP_LAYOUTS.scorch;

  assert.equal(L.spawnPads.length, 2, 'two team spawn pads');
  const [alpha, bravo] = L.spawnPads;
  assert.deepEqual([...alpha], [0, 3.2, -44]);
  assert.deepEqual([...bravo], [0, 3.2, 44]);
  assert.ok(L.spawnBarrier >= 4.0, 'spawn barrier must be at least 4.0 m');

  assert.ok(alpha[1] > R.PLAYER.fallDeathY, 'alpha spawn well above fall death plane');
  assert.ok(bravo[1] > R.PLAYER.fallDeathY, 'bravo spawn well above fall death plane');

  const level = new R.Level(L);
  const alphaGround = level.groundHeight(alpha[0], alpha[2]);
  const bravoGround = level.groundHeight(bravo[0], bravo[2]);
  assert.ok(Math.abs(alphaGround - alpha[1]) < 0.05, `alpha ground height ${alphaGround} matches pad height ${alpha[1]}`);
  assert.ok(Math.abs(bravoGround - bravo[1]) < 0.05, `bravo ground height ${bravoGround} matches pad height ${bravo[1]}`);
});

test('support/geometry: Level constructs valid geometry, key tactical elevations match layout', async () => {
  const R = await loadRealm();
  const L = R.MAP_LAYOUTS.scorch;
  const level = new R.Level(L);

  assert.ok(level.blocks.length > 20, 'level contains substantial block count');
  assert.ok(level.faces.length > 80, 'level contains substantial face count');

  // Ground height queries at key tactical areas
  const spawnHeight = level.groundHeight(0, -42);
  assert.ok(Math.abs(spawnHeight - 3.2) < 0.05, `spawn deck elevation ≈ 3.2 (got ${spawnHeight})`);

  const plazaHeight = level.groundHeight(0, -28);
  assert.ok(Math.abs(plazaHeight - 1.8) < 0.05, `base plaza elevation ≈ 1.8 (got ${plazaHeight})`);

  const leftFlankHeight = level.groundHeight(-18, -8);
  assert.ok(Math.abs(leftFlankHeight - 0.0) < 0.05, `left low lane elevation ≈ 0.0 (got ${leftFlankHeight})`);

  const rightPerchHeight = level.groundHeight(15, -18);
  assert.ok(Math.abs(rightPerchHeight - 2.6) < 0.05, `right sniper perch elevation ≈ 2.6 (got ${rightPerchHeight})`);

  const gorgeBasinHeight = level.groundHeight(0, -10);
  assert.ok(Math.abs(gorgeBasinHeight - 0.0) < 0.05, `gorge basin floor elevation ≈ 0.0 (got ${gorgeBasinHeight})`);

  const midTowerHeight = level.groundHeight(0, 0);
  // Center tower has a crate on top (y: 2.6 to 3.8)
  assert.ok(midTowerHeight >= 2.6, `mid tower top elevation ≥ 2.6 (got ${midTowerHeight})`);
});

test('abyss: open chasms outside the gorge platforms have no floor and trigger fall death', async () => {
  const R = await loadRealm();
  const L = R.MAP_LAYOUTS.scorch;
  const level = new R.Level(L);

  // Outside mid flank platforms (chasm at x = ±22, z = 0)
  const leftChasm = level.groundHeight(-22, 0);
  const rightChasm = level.groundHeight(22, 0);
  assert.ok(leftChasm === -Infinity || leftChasm < R.PLAYER.fallDeathY, `left chasm must be lethal void (got ${leftChasm})`);
  assert.ok(rightChasm === -Infinity || rightChasm < R.PLAYER.fallDeathY, `right chasm must be lethal void (got ${rightChasm})`);
});

test('grates: catwalk grates have grate semantics (unpaintable, permeable to ink/squid)', async () => {
  const R = await loadRealm();
  const L = R.MAP_LAYOUTS.scorch;
  const level = new R.Level(L);

  const grateBlocks = level.blocks.filter(b => b.grate);
  assert.ok(grateBlocks.length >= 3, 'at least 3 grate blocks (crossing and flank catwalks)');
  for (const b of grateBlocks) {
    assert.equal(b.paint, false, 'grate blocks must not be paintable');
    for (const fid of b.faces) {
      if (fid < 0) continue;
      const f = level.faces[fid];
      assert.equal(f.paintable, false, 'grate faces must not be paintable');
    }
  }
});

test('turf: paintable surfaces yield positive scoreable turf area, unpaintable safety walls excluded', async () => {
  const R = await loadRealm();
  const L = R.MAP_LAYOUTS.scorch;
  const level = new R.Level(L);

  const scoreableTurfFaces = level.faces.filter(f => f.paintable && f.turf);
  assert.ok(scoreableTurfFaces.length > 10, 'must have numerous scoreable turf faces');

  let totalTurfArea = 0;
  for (const f of scoreableTurfFaces) {
    assert.ok(f.paintable, 'turf face must be paintable');
    assert.ok(f.n.y > 0.7, 'turf face must face upward');
    totalTurfArea += f.su * f.sv;
  }
  assert.ok(totalTurfArea > 1000, `turf area must be substantial (got ${totalTurfArea.toFixed(1)} m²)`);

  // Unpaintable safety rails/backwalls/grates have paintable === false
  const unpaintableBlocks = level.blocks.filter(b => !b.paint);
  assert.ok(unpaintableBlocks.length > 0, 'safety walls and grates are unpaintable');
  for (const b of unpaintableBlocks) {
    for (const fid of b.faces) {
      if (fid < 0) continue;
      assert.equal(level.faces[fid].paintable, false, 'unpaintable block faces cannot be paintable');
    }
  }
});

test('range isolation: Practice Range isolation and layout registry remain intact with scorch present', async () => {
  const R = await loadRealm();
  assert.ok(R.MAP_LAYOUTS.range, 'MAP_LAYOUTS must contain range');
  assert.ok(R.MAP_LAYOUTS.scorch, 'MAP_LAYOUTS must contain scorch');

  // Verify Scorch does not use range texture slots (31-33)
  const L = R.MAP_LAYOUTS.scorch;
  for (const b of [...L.single, ...L.half]) {
    assert.ok(b.pattern !== 31 && b.pattern !== 32 && b.pattern !== 33, 'scorch must not use range slots');
  }

  // Verify MAPS and OFFLINE_MAPS do not list range, but list scorch
  assert.ok(!R.MAPS.some(m => m.id === 'range'));
  assert.ok(!R.OFFLINE_MAPS.some(m => m.id === 'range'));
  assert.ok(R.MAPS.some(m => m.id === 'scorch'));
  assert.ok(R.OFFLINE_MAPS.some(m => m.id === 'scorch'));
});

test('route/gap-defect: central ramp-to-basin transition at z=-16..-14 is continuous and prevents Actor fall death (#203)', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, extraExports: "export { MAP_LAYOUTS } from './inkwave-public/src/world/maps.js';" });
  const level = new f.Level(f.MAP_LAYOUTS.scorch);
  f.G.level = level;
  f.G.physics = new f.Physics(level);
  f.G.paint = { sample: () => 0, splat: () => 0 };
  f.G.match = { mode: 'turf', opts: {}, playing: () => true, canRespawn: () => false };

  const a = f.make('shooter');
  // CRITICAL: source-fixture.make assigns ownstub a._integrate = () => {};
  // Delete ownstub to allow prototype Actor._integrate and Physics integration to execute.
  delete a._integrate;

  a.spawnAt(new f.THREE.Vector3(0, level.groundHeight(0, -24), -24), 0);
  a.invuln = 0;
  a.intent.move.set(0, 0, 1);

  let lowest = Infinity;
  for (let i = 0; i < 360 && a.alive; i++) {
    f.G.time = i / 60;
    a.update(1 / 60);
    lowest = Math.min(lowest, a.pos.y);
    if (a.pos.z > -10) break;
  }

  // Parent candidate 099a5e09 died at (0, -1.4756, -14.3501) due to a 2-unit gap between ramp (z=-16) and basin (z=-14).
  assert.equal(a.alive, true, 'actor must remain alive across the continuous ramp-to-basin transition');
  assert.ok(a.pos.z > -10, `actor must cross into basin past z=-10 (reached z=${a.pos.z})`);
  assert.ok(lowest >= -1e-6, `lowest y reached (${lowest}) must not breach basin elevation 0.0`);
  assert.equal(a.grounded, true, 'actor must maintain ground contact upon entering gorge basin');
});

test('route/spawn-to-mid: real Actor and Physics traversal from spawn pad to mid basin succeeds for both teams at 30, 60, and 120 Hz', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, extraExports: "export { MAP_LAYOUTS } from './inkwave-public/src/world/maps.js';" });
  const level = new f.Level(f.MAP_LAYOUTS.scorch);
  f.G.level = level;
  f.G.physics = new f.Physics(level);
  f.G.paint = { sample: () => 0, splat: () => 0 };
  f.G.match = { mode: 'turf', opts: {}, playing: () => true, canRespawn: () => false };

  const frequencies = [30, 60, 120];

  for (const hz of frequencies) {
    const dt = 1 / hz;

    // Team Alpha: spawn at [0, 3.2, -44], move +Z toward mid
    const alpha = f.make('shooter');
    alpha.team = 0;
    delete alpha._integrate;
    alpha.spawnAt(new f.THREE.Vector3(0, level.groundHeight(0, -44), -44), 0);
    alpha.invuln = 0;
    alpha.intent.move.set(0, 0, 1);

    let alphaLowest = Infinity;
    let alphaFrames = 0;
    while (alpha.alive && alpha.pos.z < -4 && alphaFrames < 20 * hz) {
      f.G.time += dt;
      alpha.update(dt);
      alphaLowest = Math.min(alphaLowest, alpha.pos.y);
      alphaFrames++;
    }

    assert.equal(alpha.alive, true, `Alpha at ${hz}Hz must remain alive`);
    assert.equal(alpha.grounded, true, `Alpha at ${hz}Hz must remain grounded at mid`);
    assert.ok(alpha.pos.z >= -4, `Alpha at ${hz}Hz must reach mid-basin target (z=${alpha.pos.z})`);
    assert.ok(alphaLowest >= -1e-6, `Alpha at ${hz}Hz lowest elevation (${alphaLowest}) must not breach 0.0`);

    // Team Bravo: spawn at [0, 3.2, 44], move -Z toward mid
    const bravo = f.make('shooter');
    bravo.team = 1;
    delete bravo._integrate;
    bravo.spawnAt(new f.THREE.Vector3(0, level.groundHeight(0, 44), 44), Math.PI);
    bravo.invuln = 0;
    bravo.intent.move.set(0, 0, -1);

    let bravoLowest = Infinity;
    let bravoFrames = 0;
    while (bravo.alive && bravo.pos.z > 4 && bravoFrames < 20 * hz) {
      f.G.time += dt;
      bravo.update(dt);
      bravoLowest = Math.min(bravoLowest, bravo.pos.y);
      bravoFrames++;
    }

    assert.equal(bravo.alive, true, `Bravo at ${hz}Hz must remain alive`);
    assert.equal(bravo.grounded, true, `Bravo at ${hz}Hz must remain grounded at mid`);
    assert.ok(bravo.pos.z <= 4, `Bravo at ${hz}Hz must reach mid-basin target (z=${bravo.pos.z})`);
    assert.ok(bravoLowest >= -1e-6, `Bravo at ${hz}Hz lowest elevation (${bravoLowest}) must not breach 0.0`);

    // Bilateral point-symmetry check
    assert.equal(alphaFrames, bravoFrames, `Alpha and Bravo frame counts must match at ${hz}Hz`);
    assert.ok(Math.abs(alpha.pos.z + bravo.pos.z) < 0.01, `Alpha z (${alpha.pos.z}) and Bravo z (${bravo.pos.z}) must be 180° symmetric`);
    assert.ok(Math.abs(alpha.pos.y - bravo.pos.y) < 0.01, `Alpha y (${alpha.pos.y}) and Bravo y (${bravo.pos.y}) must match`);
  }
});
