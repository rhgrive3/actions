import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const fetchWorkflow = fs.readFileSync(new URL('../../.github/workflows/fetch-inkwave.yml', import.meta.url), 'utf8');
const navigation = fs.readFileSync(new URL('../../inkwave-public/src/game/nav.js', import.meta.url), 'utf8');
const murals = fs.readFileSync(new URL('../../inkwave-public/src/world/murals.js', import.meta.url), 'utf8');
const worldProps = fs.readFileSync(new URL('../../inkwave-public/src/world/props.js', import.meta.url), 'utf8');
const marinaVessels = fs.readFileSync(new URL('../../inkwave-public/src/world/props-marina-vessels.js', import.meta.url), 'utf8');
const lobbySetTexture = fs.readFileSync(new URL('../../inkwave-public/src/game/lobbySet-tex.js', import.meta.url), 'utf8');
const uiIcons = fs.readFileSync(new URL('../../inkwave-public/src/ui/ui-icons.js', import.meta.url), 'utf8');
const runtimeUiStrings = fs.readFileSync(new URL('../../patches/splatoon3/runtime/ui-strings.mjs', import.meta.url), 'utf8');
const muralAdapter = fs.readFileSync(new URL('../../patches/local-quality/mural-atlas-adapter.mjs', import.meta.url), 'utf8');
const mainComposition = fs.readFileSync(new URL('../inkwave-source-composition.mjs', import.meta.url), 'utf8');
const composition = fs.readFileSync(new URL('../../patches/local-quality/adapter.mjs', import.meta.url), 'utf8');

test('public-source fetch is a read-only candidate workflow, never a direct-source overwrite', () => {
  assert.match(fetchWorkflow, /permissions:\s*\n\s*contents: read/);
  assert.match(fetchWorkflow, /candidate="\$\{RUNNER_TEMP\}\/inkwave-upstream-candidate"/);
  assert.match(fetchWorkflow, /review-inkwave-upstream\.mjs/);
  assert.match(fetchWorkflow, /actions\/upload-artifact@v4/);
  assert.doesNotMatch(fetchWorkflow, /rm -rf inkwave-public/);
  assert.doesNotMatch(fetchWorkflow, /git (?:push|commit|add inkwave-public)/);
});

test('migrated A-star heuristic owner is the readable game source', () => {
  assert.match(navigation, /this\._h = new Float64Array\(N\)/);
  assert.match(navigation, /heap\.push\(e\.to, ng \+ heuristic\[e\.to\]\)/);
  assert.doesNotMatch(composition, /adaptNavHeuristic/);
  assert.match(navigation, /buildNativeNav\(this\)/);
  assert.match(navigation, /const heap = this\._heap \|\| \(this\._heap = new Heap\(\)\)/);
});

test('mural atlas and world branding use directly editable source without rebuild-time rewriting', async () => {
  const { adaptBuildSource } = await import('../inkwave-source-composition.mjs');
  assert.equal(adaptBuildSource('src/world/murals.js', murals), murals);
  assert.match(murals, /const W = 2048, RH = 256, ROWS = 4, FULL_H = 2048/);
  assert.match(murals, /let H = stageId === 'halyard' \|\| STAGE_MURALS\[stageId\] \? FULL_H : RH \* ROWS/);
  assert.match(murals, /tex\.dispose\(\)/);
  assert.match(murals, /strokeText\('ZEVANT', ox \+ 300, 186\)/);
  assert.match(murals, /fillText\('ZEVANT', ox \+ 294, 180\)/);
  assert.doesNotMatch(muralAdapter, /if \(rel !== 'src\/world\/murals\.js'\)/);
  assert.doesNotMatch(mainComposition, /'src\/world\/murals\.js':/);
  assert.match(muralAdapter, /if \(rel === 'src\/main\.js'\)/, 'selected-stage main hook remains until main.js is migrated');
});

test('ZEVANT stage and lobby lettering is directly owned by authored game modules', async () => {
  const { adaptBuildSource } = await import('../inkwave-source-composition.mjs');
  for (const [path, source] of [
    ['src/world/props-marina-vessels.js', marinaVessels],
    ['src/game/lobbySet-tex.js', lobbySetTexture],
  ]) assert.equal(adaptBuildSource(path, source), source, path + ' must not be rewritten by the build');
  assert.match(worldProps, /ZEVANT HARBOR · SEWER · ZEVANT HARBOR · SEWER/);
  assert.match(marinaVessels, /text\(B, 'ZEVANT', 0\.19/);
  assert.match(marinaVessels, /text\(B, 'ZEVANT', 0\.1,/);
  assert.match(marinaVessels, /text\(B, 'ZEVANT', 0\.11/);
  assert.match(lobbySetTexture, /const word = 'ZEVANT', size =/);
  assert.match(uiIcons, /logoMarkup\(title = 'ZEVANT'/);
  assert.match(runtimeUiStrings, /The ZEVANT servers didn’t answer/);
  assert(!mainComposition.includes("  'patches/splatoon3/runtime/ui-strings.mjs': ["));
  for (const path of ['src/world/props.js', 'src/world/props-marina-vessels.js', 'src/game/lobbySet-tex.js', 'src/ui/ui-icons.js']) {
    assert(!mainComposition.includes("  '" + path + "': ["), path + ' must not require late string replacement');
  }
});

test('level, stage map and Cargo spawn/return geometry live in game source, not Splatoon3 string patches', () => {
  const level = fs.readFileSync(new URL('../../inkwave-public/src/world/level.js', import.meta.url), 'utf8');
  const maps = fs.readFileSync(new URL('../../inkwave-public/src/world/maps.js', import.meta.url), 'utf8');
  const cargo = fs.readFileSync(new URL('../../inkwave-public/src/world/stages/cargo/layout.js', import.meta.url), 'utf8');
  const s3 = fs.readFileSync(new URL('../../patches/splatoon3/adapter.mjs', import.meta.url), 'utf8');
  assert.match(level, /squidReturner: !!d\.squidReturner/);
  assert.match(level, /this\.homeSuperJumpPoints = \(layout\.homeSuperJumpPoints \|\| layout\.spawnPads\)/);
  assert.match(maps, /homeSuperJumpPoints: \[\[0, 0, -33\.5\], \[0, 0, 33\.5\]\]/);
  assert.match(maps, /homeSuperJumpPoints: \[\[0, 0, -38\.5\], \[0, 0, 38\.5\]\]/);
  assert.match(maps, /homeSuperJumpPoints: \[\[0, 0, -31\.5\], \[0, 0, 31\.5\]\]/);
  assert.match(cargo, /const home = W\(0, 0, -36\.5\)/);
  assert.match(cargo, /homeSuperJumpPoints: \[home, \[-home\[0\], home\[1\], -home\[2\]\]\]/);
  for (const path of ['src/world/level.js', 'src/world/maps.js', 'src/world/stages/cargo/layout.js']) {
    assert(!s3.includes("if (rel === '" + path + "') {"), path + ' must not have the old Splatoon3 world-source rewrite');
  }
});

test('PropKit atlas, lifetime and rematch behavior are authored in the real module, without prototype rewriting', async () => {
  const { adaptBuildSource } = await import('../inkwave-source-composition.mjs');
  const legacy = fs.readFileSync(new URL('../../patches/local-quality/tests/fixtures/props-before-direct-migration.js.txt', import.meta.url), 'utf8');
  const loader = fs.readFileSync(new URL('../../patches/local-quality/tests/prop-retention-loader.mjs', import.meta.url), 'utf8');
  const buildOnly = fs.readFileSync(new URL('../lib/inkwave-build-only-modules.mjs', import.meta.url), 'utf8');
  assert.notEqual(legacy, worldProps, 'negative control must remain the pre-migration module');
  assert.match(legacy, /cv\.width = AW; cv\.height = AH/);
  assert.doesNotMatch(legacy, /this\._placements = \[\]/);
  assert.match(loader, /fixtures\/props-before-direct-migration\.js\.txt/);
  assert.match(worldProps, /import \{ G as propAtlasGame \} from '\.\.\/core\/ctx\.js'/);
  assert.match(worldProps, /_replayBuckets\(\)/);
  assert.match(worldProps, /this\._buckets\.clear\(\);\s*this\._released = true/);
  assert.match(worldProps, /build\(\) \{\s*syncPropAtlas\(this\)/);
  assert.match(worldProps, /update\(dt, time\) \{\s*syncPropAtlas\(this\)/);
  assert.match(worldProps, /this\._propAtlasRedraw = null/);
  assert.doesNotMatch(worldProps, /PropKit\.prototype\./);
  assert.doesNotMatch(composition, /adaptProp(?:Retention|Atlas)/);
  assert.doesNotMatch(buildOnly, /prop-(?:retention|atlas)-adapter\.mjs/);
  for (const p of ['prop-atlas-adapter.mjs', 'prop-retention-adapter.mjs']) {
    assert(!fs.existsSync(new URL('../../patches/local-quality/' + p, import.meta.url)), p + ' must be retired');
  }
  assert.equal(adaptBuildSource('src/world/props.js', worldProps), worldProps,
    'production must use the authored PropKit class, not a build-time transformed copy');
});

test('registered Scorch and native layouts live directly in the stage map module', () => {
  const maps = fs.readFileSync(new URL('../../inkwave-public/src/world/maps.js', import.meta.url), 'utf8');
  const scorch = fs.readFileSync(new URL('../../patches/splatoon3/scorch-gorge-adapter.mjs', import.meta.url), 'utf8');
  const native = fs.readFileSync(new URL('../../patches/native-stages/adapter.mjs', import.meta.url), 'utf8');
  assert.match(maps, /import \{ LAYOUT as SCORCH \} from/);
  assert.match(maps, /import \{ nativeStageEnabled, NATIVE_LAYOUTS \} from/);
  assert.match(maps, /cargo: CARGO, scorch: SCORCH/);
  assert.match(maps, /if \(nativeStageEnabled\) Object\.assign\(MAP_LAYOUTS, NATIVE_LAYOUTS\)/);
  assert(!scorch.includes("if (rel === 'src/world/maps.js') {"));
  assert(!native.includes("if(rel==='src/world/maps.js')"));
});

test('native ink and catalogue sweep entry points and AABB early-outs live in real collision source', async () => {
  const collision = fs.readFileSync(new URL('../../inkwave-public/src/game/inkCollision.js', import.meta.url), 'utf8');
  const catalogue = fs.readFileSync(new URL('../../patches/splatoon3/runtime/weapons-collision.mjs', import.meta.url), 'utf8');
  const native = fs.readFileSync(new URL('../../patches/native-stages/adapter.mjs', import.meta.url), 'utf8');
  const quality = fs.readFileSync(new URL('../../patches/local-quality/adapter.mjs', import.meta.url), 'utf8');
  const { adaptBuildSource } = await import('../inkwave-source-composition.mjs');
  assert.match(collision, /import \{ sweepNativeLevelSphere \} from/);
  assert.match(collision, /if \(level\.native\) return sweepNativeLevelSphere/);
  assert.match(collision, /if \(box\.aabbMin &&/);
  assert.match(collision, /if \(Math\.min\(from\.y, to\.y\) > hi \+ r \+ 1e-7/);
  assert.match(catalogue, /import \{ sweepNativeCatalogueSphere \} from/);
  assert.match(catalogue, /if \(physics\?\.level\?\.native\) return sweepNativeCatalogueSphere/);
  assert(!quality.includes("if (rel === 'src/game/inkCollision.js') {"));
  assert(!native.includes("if(rel==='src/game/inkCollision.js')"));
  assert(!native.includes("if(rel==='patches/splatoon3/runtime/weapons-collision.mjs')"));
  assert.equal(adaptBuildSource('src/game/inkCollision.js', collision), collision);
  assert.equal(adaptBuildSource('patches/splatoon3/runtime/weapons-collision.mjs', catalogue), catalogue);
});


test('standalone native sweep keeps Node collision regression free of the full stage engine and three dependency', async () => {
  const { sweepNativeCatalogueSphere, sweepNativeLevelSphere } =
    await import('../../patches/native-stages/runtime/native-projectile-sweep.mjs');
  const { sweptWorldHit } = await import('../../patches/splatoon3/runtime/weapons-collision.mjs');
  assert.equal(typeof sweptWorldHit, 'function', 'shared weapons solver remains directly importable by Node');

  class Vec {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    distanceTo(other) { return Math.hypot(this.x - other.x, this.y - other.y, this.z - other.z); }
    copy(other) { this.x = other.x; this.y = other.y; this.z = other.z; return this; }
  }
  const from = new Vec(0, 0, 0), to = new Vec(5, 0, 0);
  const level = {
    blocks: [], faces: [], data: { triangleFace: new Int32Array([-1]) },
    triangleWorld: { sweepSphere: () => null },
    queryDynamicBlocks: () => [],
    blockForTriangle: () => 7,
  };
  const out = () => ({ hit: false, point: new Vec(), normal: new Vec(), block: -1, face: -1 });
  const misses = (view, a, b, r0, r1, result) => {
    assert(result.point instanceof Vec && result.normal instanceof Vec);
    return { hit: false, dist: 5 };
  };
  const first = out();
  assert.equal(sweepNativeCatalogueSphere({ level }, from, to, 0.2, 0.2, first, true, misses), first);
  assert.equal(first.hit, false);
  assert.equal(first.dist, 5);
  const second = out();
  assert.equal(sweepNativeLevelSphere(level, from, to, 0.2, second, true,
    (view, a, b, radius, result) => misses(view, a, b, radius, radius, result)), second);
  assert.equal(second.hit, false);
  level.triangleWorld.sweepSphere = () => ({
    distance: 1.25, point: new Vec(1.25, 0, 0), normal: new Vec(-1, 0, 0), triangle: 0,
  });
  const impact = out();
  sweepNativeCatalogueSphere({ level }, from, to, 0.2, 0.2, impact, true, misses);
  assert.equal(impact.hit, true);
  assert.equal(impact.dist, 1.25);
  assert.equal(impact.block, 7);
  assert.equal(impact.face, -1);
  assert.deepEqual([impact.point.x, impact.normal.x], [1.25, -1]);
});
