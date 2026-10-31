// 847: Roller-body terrain contact through the canonical current composition.
// The pinned source fixture runs native Actor/Physics/Projectiles/PaintSystem/NetMatch.
// Fault controls below are counterfactual current-source mutations, not old main.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { ALL_31_PRS_FIXTURE_SHA256 } from '../../../scripts/lib/inkwave-31pr-paint-source-pair.mjs';
import { rollerDrumSupport, rollerStickActive } from '../runtime/roller.mjs';
import { traceRollingFloor } from '../runtime/rolling-floor.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');
const FROZEN_B34_SHA256 = '52e587f60d6211054c2bad04f746471e85ebdb0295e051f797b41a0019847eb7';
const adaptProductionSource = adaptBuildSource;
// The 2026-10-25 motion fix retains the admitted lowered pose without drum
// support. Contact paint/damage/ink admission and all three counterfactual
// anchors stay guarded; this pin includes the reviewed pose-only continuation.
// Keep the prior scratch epoch checked against its immutable fixture below.
// Prior #1726 input: 449b10b1eb3127fc86b302115698058aa166b617dc0a9bc35d48e0c73eaed2fb.
const HISTORICAL_ROLLER_SHA256 = '4332009c699ebbabf9ac1f701ed46e932fe293d47254d0e4530712c0d6bfd973';
const QUEUE_20261030_ROLLER_INVERSE = Object.freeze([["// A vertical mode is already a private ordinary data record. Later overlays\n// can define its data fields directly instead of copying the whole weapon a\n// second/third time. DefineProperty keeps spread's own-property semantics even\n// when Object.prototype has a setter; no source config or getter is cached.\nconst MODE_FIELD={value:null,writable:true,enumerable:true,configurable:true};\nfunction setModeField(mode,key,value){\n  MODE_FIELD.value=value;\n  try{Object.defineProperty(mode,key,MODE_FIELD);}finally{MODE_FIELD.value=null;}\n}\n","","queue-optimization-0"],["    if (state) {\n      if(mode===w)mode={...mode,flickWindup:state.windup,flickInterval:state.interval};\n      else {setModeField(mode,'flickWindup',state.windup);setModeField(mode,'flickInterval',state.interval);}\n    }\n","    if (state) mode = { ...mode, flickWindup: state.windup, flickInterval: state.interval };\n","queue-optimization-1"],["      if (drops !== null) {\n        setModeField(mode,'s3Depletion',true);setModeField(mode,'s3DepletionDrops',drops);setModeField(mode,'flickDrops',drops);\n      }\n","      if (drops !== null) mode = { ...mode, s3Depletion: true, s3DepletionDrops: drops, flickDrops: drops };\n","queue-optimization-2"]]);\nconst COUNTERFACTUAL_INPUT_SHA256 = Object.freeze({
  "patches/splatoon3/runtime/roller.mjs": "9f672b542dfd9cf1b2820ac29009afdaebfea3f98d3591342a1dc449b7c37ce3",
  "patches/splatoon3/runtime/roller-contact-paint.mjs": "e108b807923cb68da28673afad22e633cb1aa6345b7832b26cf29cd8d9c0cdf3"
});
const headlessPaintRenderer = () => ({
  capabilities: { getMaxAnisotropy: () => 1 }, target: null,
  getRenderTarget() { return this.target; },
  getClearColor(out) { return out.setRGB(0, 0, 0); },
  getClearAlpha() { return 0; },
  setRenderTarget(target) { this.target = target; },
  setClearColor() {}, clear() {}, render() {}, // GPU surface stub; native CPU paint/contact still run
});
const apis = new Map();
// Runner-only calls do not refresh physical support or commit pose-owned paint.
// Keep pinned movement, but execute the real ground query and frame completion.
function finishNativeFrame(f,a) {
  f.G.physics.groundProbe(a.pos.x,a.pos.y,a.pos.z,f.PLAYER.stepUp,f.PLAYER.stepDown,f.PLAYER.footRadius,a.ground,false);
  a._finishFrame(1/60);
}

function frozenRollerSource() {
  // Preserve the historical single-module identity, including shallow CI checkouts.
  // Its former whole-main paint claim is invalid after independent admission guards.
  const source = fs.readFileSync(new URL('./fixtures/roller.b34a8aaf.source.txt', import.meta.url), 'utf8');
  assert.equal(createHash('sha256').update(source).digest('hex'), FROZEN_B34_SHA256);
  return source;
}
function exactFault(source, needle, replacement, name) {
  assert.equal(source.split(needle).length-1,1,'counterfactual anchor '+name);
  return source.replace(needle,replacement);
}
const ROLLER_PERFORMANCE_REVERSE_EDITS = Object.freeze([
  ["    if (runner.s3RollStop) {\n      const live = rollStopBlocks(now, runner.s3RollStop);\n      if (live.main || live.sub || live.squid) return false;\n    }\n    if (!rollWillStop(runner, fire)) return false;", "    const live = rollStopBlocks(now, runner.s3RollStop);\n    if ((live.main || live.sub || live.squid) || !rollWillStop(runner, fire)) return false;", "performance-owner-1"],
  ["    const blockSquid = !!runner.s3RollStop && rollStopBlocks(now, runner.s3RollStop).squid;", "    const blockSquid = rollStopBlocks(now, runner.s3RollStop).squid;", "performance-owner-2"],
  ["    const coldIdle = !inp.fire && !wasHeld && !this.rolling && !this.s3RollerSuspendedHold;\n    const sup = onFlickPath || coldIdle ? null : rollerDrumSupport(a, G, scratch);", "    const sup = onFlickPath ? null : rollerDrumSupport(a, G, scratch);", "performance-owner-3"],
  ["    // Actor yaw and the fixed shaft angle are constant during this IK search.\n    const contactYaw = this.actor?.yaw || 0, contactCy = Math.cos(contactYaw), contactSy = Math.sin(contactYaw);\n    const shaftCy = Math.cos(ROLL_ROTATION[1]), shaftSy = Math.sin(ROLL_ROTATION[1]);\n", "", "performance-owner-4"],
  ["        const n=this.actor?.groundN,cy=contactCy,sy=contactSy;", "        const n=this.actor?.groundN,yaw=this.actor?.yaw||0,cy=Math.cos(yaw),sy=Math.sin(yaw);", "performance-owner-5"],
  ["        delta.set(shaftCy,0,-shaftSy);", "        delta.set(Math.cos(ROLL_ROTATION[1]),0,-Math.sin(ROLL_ROTATION[1]));", "performance-owner-6"],
  ["      if (penetration > .00001 && Number.isFinite(scale.x) && Math.abs(scale.x) > 1e-4 && Number.isFinite(scale.y) && Math.abs(scale.y) > 1e-4 && Number.isFinite(scale.z) && Math.abs(scale.z) > 1e-4) {", "      if (penetration > .00001 && [scale.x, scale.y, scale.z].every(v => Number.isFinite(v) && Math.abs(v) > 1e-4)) {", "performance-owner-7"],
]);
function withoutReviewedDownhillSupport(source) {
  return exactFault(exactFault(source,
        "import { traceRollingFloor } from './rolling-floor.mjs';\n",'', 'downhill-import'),
        "  // The lowered drum follows continuous floor, including a descending ramp.\n  // A fixed world-height tolerance mistakes the ramp's forward drop for a\n  // ledge. Reuse the paint path's collision intervals: missing floor or an\n  // actual height discontinuity still rejects support.\n  if (!floor && a.grounded && a.ground?.hit) {\n    const contact=scratch.floorContact||=( {point:a.pos.clone(),origin:a.pos.clone(),down:a.pos.clone()} );\n    const at=contact.target||=(a.pos.clone());at.set(cx,a.pos.y,cz);\n    if(traceRollingFloor(a,at,level,G.physics,contact,false))floor=true;\n  }\n",'', 'downhill-continuous-support');
}
function counterfactualSources(read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8')) {
  // Fail before creating/linking any VM modules: an unreviewed input must not
  // strand dependent link promises and reject again after the test has ended.
  const sources = new Map();
  for (const [rel, hash] of Object.entries(COUNTERFACTUAL_INPUT_SHA256)) {
    const raw = read(rel);
    assert.equal(typeof raw, 'string', 'counterfactual input '+rel);
    assert.equal(createHash('sha256').update(raw).digest('hex'), hash, 'counterfactual input '+rel);
    if(rel==='patches/splatoon3/runtime/roller.mjs'){
      // The reviewed follow-through and floor-search changes leave contact
      // admission intact. Recover the exact prior input before checking its
      // sealed history; fault controls below still execute the current source.
      const followThroughBytes=fs.readFileSync(new URL('./fixtures/roller-follow-through-20261030-reviewed-delta.json',import.meta.url));
      assert.equal(createHash('sha256').update(followThroughBytes).digest('hex'),
        '359dc78dfdf663069f20e6a2ea5d35a1d7e68661e78763737c94a82a77d2ab25');
      const followThrough=JSON.parse(followThroughBytes);let beforeFollowThrough=raw;
      for(const [after,before,name] of QUEUE_20261030_ROLLER_INVERSE)
        beforeFollowThrough=exactFault(beforeFollowThrough,after,before,name);
      assert.equal(createHash('sha256').update(beforeFollowThrough).digest('hex'),
        '577593bdc59ebb155e022b9ce4f57328ad82c05130ee67105d86aa635cf7d4fe','reviewed queue 20261030 roller baseline');
      for(const [index,change]of followThrough.changes.entries())
        beforeFollowThrough=exactFault(beforeFollowThrough,change.after,change.before,'follow-through-'+index);
      assert.equal(createHash('sha256').update(beforeFollowThrough).digest('hex'),
        'da13f7a173b2c62986a4b278bca94e6133163ffe4d7ff172973eea6031e2ff82',
        'reviewed roller input before #1943 follow-through changes');
      // The queue only replaces the ephemeral [-1,1] loop with the same two
      // scalar signs. Prove exact recovery of the complete prior input before
      // applying the older, separately sealed downhill support reversals.
      const beforeScalarSign=exactFault(beforeFollowThrough,
        'for(let axisIndex=0;axisIndex<SEARCH_AXES.length;axisIndex++)for(let sign=-1;sign<=1;sign+=2)',
        'for(let axisIndex=0;axisIndex<SEARCH_AXES.length;axisIndex++)for(const sign of [-1,1])',
        'queue-scalar-sign-loop');
      assert.equal(createHash('sha256').update(beforeScalarSign).digest('hex'),
        '27ff1b15e10c10e7d969dde7d35915dd04d890aa26aa0a7e59aae74cbcc0467a',
        'Drive-verified 031426fc queue input');
      // The incoming baseline itself also contained six reviewed optimization
      // hunks absent from this test's older pin. Retain both Drive digests and
      // reverse only those exact hunks before the earlier history checks.
      const deltaBytes=fs.readFileSync(new URL('./fixtures/queue-roller-031426fc-reviewed-delta.json',import.meta.url));
      assert.equal(createHash('sha256').update(deltaBytes).digest('hex'),
        'ca0d84694c66b330cf208530b2c7bc10362108259ba666982349b0d5b8735461');
      const delta=JSON.parse(deltaBytes);let beforeBaselineOptimizations=beforeScalarSign;
      for(const [index,change]of delta.changes.entries())
        beforeBaselineOptimizations=exactFault(beforeBaselineOptimizations,change.after,change.before,'baseline-optimization-'+index);
      assert.equal(createHash('sha256').update(beforeBaselineOptimizations).digest('hex'),
        'f80e6a5f736ef6411dadcf2c0929fd902cd4ee090ee493613940622e4281fb39',
        'previous reviewed #847 input before incoming baseline optimizations');
      // Independently replay the current owner's seven exact reverse edits
      // from the preserved pre-scalar-sign epoch. Both reviewed history paths
      // must converge, and the owner epoch without downhill support stays pinned.
      let reviewed=beforeScalarSign;
      for(const [before,after,name] of ROLLER_PERFORMANCE_REVERSE_EDITS)reviewed=exactFault(reviewed,before,after,name);
      assert.equal(createHash('sha256').update(reviewed).digest('hex'),
        'f80e6a5f736ef6411dadcf2c0929fd902cd4ee090ee493613940622e4281fb39','previous #847 performance-owner input');
      assert.equal(reviewed,beforeBaselineOptimizations,'independent reviewed baseline and performance owner inversions agree');
      assert.equal(createHash('sha256').update(withoutReviewedDownhillSupport(beforeScalarSign)).digest('hex'),
        'dc67c95c5e99e398f994fa5c621c56739ee0b73b7686ba1b3395f31bffba0f96','reviewed #847 performance epoch without downhill support');
      const previous=withoutReviewedDownhillSupport(reviewed);
      assert.equal(createHash('sha256').update(previous).digest('hex'),
        '121d3ae7bb692ff351fecfe65a77704934dccb2ecde87f46ac6187b125c3a6d3', 'previous reviewed #847 roller input');
    } else {
      // Incoming main only replaces the two numeric no-motion predicates.
      // Undo those exact edits and retain the entire pre-merge contact pin.
      const previous=exactFault(exactFault(exactFault(raw,
        'function negligiblePlanarMotion(x, z) {\n  if (x === 0 && z === 0) return true;\n  if (Math.abs(x) > 1e-9 || Math.abs(z) > 1e-9) return false;\n  return Math.hypot(x, z) <= 1e-9;\n}\n','', 'contact-motion-helper'),
        'negligiblePlanarMotion(a.intent?.move?.x || 0, a.intent?.move?.z || 0)',
        'Math.hypot(a.intent?.move?.x || 0, a.intent?.move?.z || 0) <= 1e-9','contact-stick-predicate'),
        'negligiblePlanarMotion(a.vel.x, a.vel.z)',
        'Math.hypot(a.vel.x, a.vel.z) <= 1e-9','contact-velocity-predicate');
      assert.equal(createHash('sha256').update(previous).digest('hex'),
        'e6e06374bc3a0a2bd6dcceafbbe16b4882b8e8d8f9e6ff39f5aeda3dc12ec64d','previous reviewed #847 contact input');
    }
    let source = adaptProductionSource(rel, raw);
    if (rel === 'patches/splatoon3/runtime/roller.mjs') {
      source=exactFault(source,'return !!mv && Math.hypot(mv.x, mv.z) > STICK_EPS;','return true;','roller-stick');
      source=exactFault(source,'const sup = onFlickPath || coldIdle ? null : rollerDrumSupport(a, G, scratch);','const sup = onFlickPath || coldIdle ? null : {floor:a.grounded,wall:false,supported:a.grounded};','roller-support');
    } else {
      source=exactFault(source,'    negligiblePlanarMotion(a.intent?.move?.x || 0, a.intent?.move?.z || 0) ||\n','','physical-paint-stick');
    }
    sources.set(rel, source);
  }
  return sources;
}
async function production({ counterfactual = false } = {}) {
  const cacheKey = counterfactual ? 'counterfactual' : 'current';
  if (apis.has(cacheKey)) return apis.get(cacheKey);
  const faults = counterfactual ? counterfactualSources() : null;
  const context = vm.createContext({ console, performance, URL, innerHeight: 720 });
  const modules = new Map();
  const load = (requested) => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const rel = file.startsWith(SRC + path.sep) ? path.relative(SRC, file) : path.relative(ROOT, file);
    // Faults were hash/anchor-checked before linking. Production stays untouched.
    const source = faults?.get(rel) ?? adaptProductionSource(rel.split(path.sep).join('/'), fs.readFileSync(file, 'utf8'));
    const mod = new vm.SourceTextModule(source,
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, mod); return mod;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { Level } from './inkwave-public/src/world/level.js';
    export { NetMatch } from './inkwave-public/src/net/netmatch.js';
  `, { context, identifier: path.join(ROOT, 'cl8-847-test-entry.mjs') });
  await entry.link((spec, from) => load(spec === 'three' ? path.join(SRC, 'vendor/three/build/three.module.js')
    : spec.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', spec.slice(13))
      : path.resolve(path.dirname(from.identifier), spec)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const installed = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  const { G, THREE, Physics, Level } = installed;
  // Compact native stage: flat pad at z=-5, wall at z=2, and a separate ledge below.
  const level = new Level({ bounds: { minX: -4, maxX: 4, minZ: -7, maxZ: 4 }, spawnPads: [[-3, 0, 0], [3, 0, 0]],
    spawnBarrier: 0, half: [],
    single: [
      { kind: 'box', min: [-4, -.5, -7], max: [4, 0, 4] },
      { kind: 'box', min: [-4, 0, 2], max: [4, 3, 2.5] },
    ] });
  Object.assign(G, { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), settings: { quality: 'high' },
    actors: [], time: 0, level, physics: new Physics(level), mode: 'match',
    teamColors: [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')],
    match: { playing: () => true, canRespawn: () => false },
    paint: new installed.PaintSystem(headlessPaintRenderer(), level, { atlasSize: 512, maxDensity: 2 }) });
  G.projectiles = new installed.Projectiles(G.scene);
  apis.set(cacheKey, installed); return installed;
}

test('847 flat rolling unchanged on full production composition', async () => {
  const f = await production();
  const a = new f.Actor({ team: 0, name: 'r847flat', isLocal: true, weapon: 'roller', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  a.character.onEvent = null; f.G.actors = [a];
  a.pos.set(0, 0, -5); a.yaw = 0; a.aimYaw = 0; a.grounded = true; a.ink = 100; a.vel.set(0, 0, 3);
  const paintBefore = f.G.paint.version;
  a.intent.move.set(0, 0, 1); a.intent.fire = true;
  f.G.time += 1 / 60; a.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false }); finishNativeFrame(f,a);
  a.pos.z += 0.35;
  f.G.time += 1 / 60; a.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false }); finishNativeFrame(f,a);
  assert.equal(a.weaponRunner.rolling, true, 'flat + stick + fire keeps rolling');
  assert.ok(Math.hypot(a.vel.x, a.vel.z) > 1.0, 'roll speed preserved');
  assert.ok(a.ink < 100, 'native roll consumes ink while moving');
  assert.ok(f.G.paint.version > paintBefore, 'native paint system receives the roll stripe');
  f.G.actors = [];
});

test('847 no-stick residual keeps the drum down but stops native paint, ink drain, and damage without changing velocity', async () => {
  const f = await production();
  const a = new f.Actor({ team: 0, name: 'r847stick', isLocal: true, weapon: 'roller', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  a.character.onEvent = null;
  const v = new f.Actor({ team: 1, name: 'r847victim', isLocal: false, weapon: 'shooter', CharacterClass: f.Character, style: { hair: 0, skin: 0, outfit: 0, eyes: 0 } });
  v.character.onEvent = null;
  f.G.actors = [a];
  a.pos.set(0, 0, -5); a.yaw = 0; a.aimYaw = 0; a.grounded = true; a.ink = 100; a.vel.set(0, 0, 3);
  a.intent.move.set(0, 0, 1); a.intent.fire = true;
  f.G.time += 1 / 60; a.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false }); finishNativeFrame(f,a);
  assert.equal(a.weaponRunner.rolling, true);
  assert.ok(Math.hypot(a.vel.x, a.vel.z) > 1.0, 'residual speed present');
  v.pos.set(a.pos.x, a.pos.y, a.pos.z + 0.8); v.hp = 500; v.alive = true; v.invuln = 0;
  f.G.actors = [a, v];
  a.intent.move.set(0, 0, 0); a.intent.fire = true;
  const inkBefore = a.ink, paintBefore = f.G.paint.version;
  a.pos.z += 0.35; a.vel.set(0, 0, 3);
  f.G.time += 1 / 60;
  a.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false }); finishNativeFrame(f,a);
  assert.equal(v.hp, 500, 'no Left Stick input admits no roll damage despite residual speed');
  // Owner report 2026-10-18: releasing Left Stick keeps the drum down while ZR is held.
  assert.equal(a.weaponRunner.rolling, true, 'held ZR keeps the roll state without Left Stick');
  assert.equal(a.ink, inkBefore, 'residual displacement does not drain rolling ink');
  assert.equal(f.G.paint.version, paintBefore, 'residual displacement does not paint a roller stripe');
  assert.deepEqual([a.vel.x, a.vel.y, a.vel.z], [0, 0, 3], 'roller admission leaves native velocity intact');
  f.G.actors = [];
});

test('847 airborne wall drum contact preserves rolling', async () => {
  const f = await production();
  const a = new f.Actor({ team: 0, name: 'r847wall', isLocal: true, weapon: 'roller', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  a.character.onEvent = null; f.G.actors = [a];
  a.ink = 100; a.yaw = 0; a.aimYaw = 0; a.intent.move.set(0, 0, 1); a.intent.fire = true;
  // Just outside the authoritative 0.4 m radius must not count as contact.
  a.yaw = 0; a.aimYaw = 0; a.intent.move.set(0, 0, 1); a.intent.fire = true;
  a.pos.set(0, 1.4, 0.8); a.grounded = false; a.vel.set(0, 0, 1);
  f.G.time += 1 / 60;
  a.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false }); finishNativeFrame(f,a);
  assert.equal(a.weaponRunner.rolling, false, 'a nearby wall outside the body volume does not support rolling');
  // The actual Roller body reaches the wall at z=2 with its center at z=1.6.
  a.pos.set(0, 1.4, 0.85); a.vel.set(0, 0, 1);
  const wallHit = new f.Hit();
  f.G.physics.raycast(new f.THREE.Vector3(0, 1.8, 1.6), new f.THREE.Vector3(0, 0, 1), 0.4, wallHit, false);
  assert.equal(wallHit.hit, true, 'native physics confirms contact within the body radius');
  f.G.time += 1 / 60;
  a.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false }); finishNativeFrame(f,a);
  assert.equal(a.grounded, false, 'actor stays airborne while pinned');
  assert.equal(a.weaponRunner.rolling, true, 'wall drum contact keeps the S3-valid roll while airborne');
  assert.deepEqual([a.vel.x, a.vel.y, a.vel.z], [0, 0, 1], 'wall admission does not overwrite airborne velocity');
  f.G.actors = [];
});

test('847 ledge drum void suspends contact while retaining the held lowered pose', async () => {
  const f = await production();
  // Same realm, ledge stage: floor only at x<0. Fresh actor per stage.
  const ledge = new f.Level({ bounds: { minX: -4, maxX: 4, minZ: -7, maxZ: 4 }, spawnPads: [[-3, 0, 0], [3, 0, 0]],
    spawnBarrier: 0, half: [], single: [{ kind: 'box', min: [-4, -.5, -7], max: [0, 0, 4] }] });
  const keep = { level: f.G.level, physics: f.G.physics, projectiles: f.G.projectiles, paint: f.G.paint };
  f.G.level = ledge; f.G.physics = new f.Physics(ledge);
  f.G.projectiles = new f.Projectiles(f.G.scene);
  f.G.paint = new f.PaintSystem(headlessPaintRenderer(), ledge, { atlasSize: 512, maxDensity: 2 });
  try {
    const a = new f.Actor({ team: 0, name: 'r847ledge', isLocal: true, weapon: 'roller', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    a.character.onEvent = null; f.G.actors = [a];
    a.pos.set(-1.5, 0, 0); a.yaw = Math.PI / 2; a.aimYaw = Math.PI / 2; a.grounded = true; a.ink = 100;
    a.intent.move.set(1, 0, 0); a.intent.fire = true;
    f.G.time += 1 / 60; a.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false }); finishNativeFrame(f,a);
    assert.equal(a.weaponRunner.rolling, true, 'roll establishes on the ledge floor');
    // Pin feet at x=-0.25 (floor under feet) facing +x: drum center x=0.5 over void.
    a.pos.set(-0.25, 0, 0); a.vel.set(0, 0, 0); a.grounded = true;
    const inkBefore = a.ink, paintBefore = f.G.paint.version;
    f.G.time += 1 / 60; a.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false }); finishNativeFrame(f,a);
    assert.equal(a.grounded, true, 'feet stay grounded at the edge while pinned');
    assert.equal(a.weaponRunner.rolling, true, 'held lowered pose survives the unsupported drum');
    assert.equal(a.weaponRunner.s3RollerSuspendedHold, true, 'unsupported drum suspends contact behavior at the ledge');
    assert.equal(a.ink, inkBefore, 'unsupported drum does not drain ink');
    assert.equal(f.G.paint.version, paintBefore, 'unsupported drum does not paint');
  } finally {
    f.G.level = keep.level; f.G.physics = keep.physics; f.G.projectiles = keep.projectiles; f.G.paint = keep.paint;
    f.G.actors = [];
  }
});

test('847 support probe falls back to feet grounding without stage collision', () => {
  const stubG = { physics: {} };
  const scratch = { ids: [], start: {}, delta: {}, contactPoint:{}, wallPoint:{} };
  const a = { grounded: true, yaw: 0, pos: { x: 0, y: 0, z: 0 }, intent: { move: { x: 0, z: 0 } }, remote: false };
  const sup = rollerDrumSupport(a, stubG, scratch);
  assert.equal(sup.supported, true, 'stub physics keeps the previous feet-grounded admission');
  assert.equal(rollerStickActive(a), false, 'zero stick reads inactive for the owner');
  assert.equal(rollerStickActive({ ...a, intent: { move: { x: 0, z: 1 } } }), true);
  assert.equal(rollerStickActive({ ...a, remote: true }), true, 'remote proxies defer to owner authority');
});

test('847 owner and remote share native contact; NetMatch drops remote damage and native hit updates survive', async () => {
  const f = await production();
  const owner = new f.Actor({ team: 0, name: 'r847owner', isLocal: true, weapon: 'roller', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const remote = new f.Actor({ team: 0, name: 'r847remote', isLocal: false, weapon: 'roller', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const victim = new f.Actor({ team: 1, name: 'r847netvictim', isLocal: false, weapon: 'shooter', CharacterClass: f.Character, style: { hair: 0, skin: 0, outfit: 0, eyes: 0 } });
  for (const actor of [owner, remote, victim]) actor.character.onEvent = null;
  owner.pos.set(0, 0, -5); remote.pos.copy(owner.pos); victim.pos.set(0, 0, -4.2);
  owner.yaw = remote.yaw = 0; owner.grounded = remote.grounded = true;
  remote.remote = true; remote.owner = 'peer-2';
  const ownerContact = rollerDrumSupport(owner, f.G, { ids: [], start: {}, delta: {}, contactPoint:{}, wallPoint:{} });
  const remoteContact = rollerDrumSupport(remote, f.G, { ids: [], start: {}, delta: {}, contactPoint:{}, wallPoint:{} });
  assert.deepEqual(ownerContact, remoteContact, 'stage contact depends only on the shared actor pose and stage collision');
  assert.equal(ownerContact.supported, true);

  const net = new f.NetMatch({ myId: 'peer-1', isHost: false }, { map: 'standard' });
  f.G.netm = net; f.G.actors = [owner, remote, victim];
  victim.hp = 500; victim.alive = true; owner.ink = remote.ink = 100;
  owner.vel.set(0, 0, 2); remote.vel.set(0, 0, 2);
  owner.intent.move.set(0, 0, 1); remote.intent.move.set(0, 0, 0);
  let hitEvents = 0;
  const off = f.on('hit', () => { hitEvents++; owner.vel.x = 2.25; });
  try {
    f.G.time += 1 / 60;
    owner.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false }); finishNativeFrame(f,owner);
    assert.ok(victim.hp < 500, 'the owner applies the native Roller contact hit');
    assert.equal(hitEvents, 1, 'native hit event still dispatches once');
    assert.equal(owner.vel.x, 2.25, 'a synchronous native event velocity update is not restored over');

    const hpAfterOwner = victim.hp;
    assert.equal(net.shouldApplyHit(remote, victim), 'drop', 'the receiver remains authoritative for its actor');
    f.G.time += 0.6;
    remote.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false }); finishNativeFrame(f,remote);
    assert.equal(victim.hp, hpAfterOwner, 'a remote roller never applies its own contact damage');
    assert.equal(hitEvents, 1, 'the dropped remote hit emits no local hit event');
  } finally {
    off(); f.G.netm = null; f.G.actors = [];
  }
});

test('847 frozen b34 roller source retains its recorded single-module identity', () => {
  frozenRollerSource();
});

test('847 prior scratch epoch retains its historical hash independently of current source', () => {
  const packed = fs.readFileSync(new URL('../../../scripts/fixtures/inkwave-31pr-paint-source-pair.json.gz', import.meta.url));
  assert.equal(createHash('sha256').update(packed).digest('hex'), ALL_31_PRS_FIXTURE_SHA256);
  const source = JSON.parse(gunzipSync(packed)).post30Pose['patches/splatoon3/runtime/roller.mjs'];
  assert.equal(createHash('sha256').update(source).digest('hex'), HISTORICAL_ROLLER_SHA256);
});

test('847 rejects missing or modified fault inputs before VM linking and keeps exact fault anchors', () => {
  const inputs = new Map(Object.keys(COUNTERFACTUAL_INPUT_SHA256).map(rel => [rel, fs.readFileSync(path.join(ROOT, rel), 'utf8')]));
  for (const rel of inputs.keys()) for (const missing of [false, true]) {
    const drift = new Map(inputs);
    if (missing) drift.delete(rel); else drift.set(rel, drift.get(rel)+' ');
    assert.throws(() => counterfactualSources(p => drift.get(p)), /counterfactual input/);
  }
  assert.throws(() => exactFault('anchor anchor', 'anchor', '', 'duplicate'), /counterfactual anchor/);
  assert.throws(() => exactFault('other', 'anchor', '', 'missing'), /counterfactual anchor/);
  const roller = inputs.get('patches/splatoon3/runtime/roller.mjs');
  for (const [before, after, name] of ROLLER_PERFORMANCE_REVERSE_EDITS) {
    assert.throws(() => exactFault(roller.replace(before,''), before, after, name), /counterfactual anchor/);
    assert.throws(() => exactFault(roller+before, before, after, name), /counterfactual anchor/);
  }
  let reviewed = roller;
  for (const [before, after, name] of ROLLER_PERFORMANCE_REVERSE_EDITS) reviewed=exactFault(reviewed,before,after,name);
  const downhillImport = "import { traceRollingFloor } from './rolling-floor.mjs';\n";
  for (const epoch of [roller, reviewed]) {
    assert.throws(() => withoutReviewedDownhillSupport(epoch.replace(downhillImport,'')), /counterfactual anchor downhill-import/);
    assert.throws(() => withoutReviewedDownhillSupport(epoch+downhillImport), /counterfactual anchor downhill-import/);
  }
  const faults = counterfactualSources(p => inputs.get(p));
  assert.equal(faults.size, 2);
  for (const rel of inputs.keys()) assert.notEqual(faults.get(rel), adaptProductionSource(rel, inputs.get(rel)));
});

test('847 explicit current-source admission faults expose the guarded regressions', async () => {
  const f = await production({ counterfactual:true });
  const a = new f.Actor({ team: 0, name: 'r847main', isLocal: true, weapon: 'roller', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const v = new f.Actor({ team: 1, name: 'r847mainvictim', isLocal: false, weapon: 'shooter', CharacterClass: f.Character, style: { hair: 0, skin: 0, outfit: 0, eyes: 0 } });
  a.character.onEvent = v.character.onEvent = null;
  a.pos.set(0, 0, -5); a.yaw = 0; a.grounded = true; a.ink = 100; a.vel.set(0, 0, 2);
  a.intent.fire = true; a.intent.move.set(0, 0, 1); f.G.actors = [a];
  a.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false }); finishNativeFrame(f,a);
  assert.equal(a.weaponRunner.rolling, true, 'counterfactual retains flat contact');
  v.pos.set(a.pos.x, a.pos.y, a.pos.z + 0.8); v.hp = 500; v.alive = true;
  const inkBefore = a.ink, paintBefore = f.G.paint.version;
  a.intent.move.set(0, 0, 0); a.pos.z += 0.35; a.vel.set(0, 0, 3); f.G.actors = [a, v];
  f.G.time += 1 / 60;
  a.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false }); finishNativeFrame(f,a);
  assert.ok(v.hp < 500, 'counterfactual permits residual-speed damage without Left Stick');
  assert.ok(a.ink < inkBefore, 'counterfactual drains ink from residual displacement');
  assert.ok(f.G.paint.version > paintBefore, 'counterfactual paints from residual displacement');

  const ledge = new f.Level({ bounds: { minX: -4, maxX: 4, minZ: -7, maxZ: 4 }, spawnPads: [[-3, 0, 0], [3, 0, 0]],
    spawnBarrier: 0, half: [], single: [{ kind: 'box', min: [-4, -.5, -7], max: [0, 0, 4] }] });
  f.G.level = ledge; f.G.physics = new f.Physics(ledge);
  const feet = { hit: false, y: 0, normal: new f.THREE.Vector3(), block: -1, face: -1, u: 0, v: 0, center: false, grate: false };
  f.G.physics.groundProbe(-0.25, 0, 0, f.PLAYER.stepUp, f.PLAYER.stepDown, f.PLAYER.footRadius, feet, false);
  assert.equal(feet.hit, true, 'native feet remain grounded at the ledge');
  const ledgeActor = new f.Actor({ team: 0, name: 'r847mainledge', isLocal: true, weapon: 'roller', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  ledgeActor.pos.set(-0.25, 0, 0); ledgeActor.yaw = Math.PI / 2; ledgeActor.grounded = true;
  ledgeActor.intent.move.set(1, 0, 0); ledgeActor.intent.fire = true;
  ledgeActor.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false }); finishNativeFrame(f,ledgeActor);
  assert.equal(ledgeActor.weaponRunner.rolling, true, 'counterfactual feet-only support admits the drum over void');

  f.G.level = new f.Level({ bounds: { minX: -4, maxX: 4, minZ: -7, maxZ: 4 }, spawnPads: [[-3, 0, 0], [3, 0, 0]],
    spawnBarrier: 0, half: [], single: [
      { kind: 'box', min: [-4, -.5, -7], max: [4, 0, 4] },
      { kind: 'box', min: [-4, 0, 2], max: [4, 3, 2.5] },
    ] });
  f.G.physics = new f.Physics(f.G.level);
  const airborne = new f.Actor({ team: 0, name: 'r847mainwall', isLocal: true, weapon: 'roller', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  airborne.pos.set(0, 1.4, 0.85); airborne.yaw = 0; airborne.grounded = false; airborne.intent.move.set(0, 0, 1);
  const wallHit = new f.Hit();
  f.G.physics.raycast(new f.THREE.Vector3(0, 1.8, 1.6), new f.THREE.Vector3(0, 0, 1), 0.4, wallHit, false);
  assert.equal(wallHit.hit, true, 'native stage collision confirms actual Roller-body wall contact');
  airborne.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false }); finishNativeFrame(f,airborne);
  assert.equal(airborne.weaponRunner.rolling, false, 'counterfactual feet-only support rejects airborne drum wall contact');
  f.G.actors = [];
});

// Direct helper CPU controls: no browser/GPU or retail-equivalence claim.
test('847 incoming no-motion shortcut preserves the exact numeric contact threshold',()=>{
  const raw=fs.readFileSync(path.join(ROOT,'patches/splatoon3/runtime/roller-contact-paint.mjs'),'utf8');
  const source=raw.match(/function negligiblePlanarMotion\(x, z\) \{[\s\S]*?\n\}/)?.[0];assert.ok(source);
  const negligible=new Function(source+';return negligiblePlanarMotion;')();
  const values=[0,-0,1e-12,-1e-12,.7e-9,-.7e-9,.8e-9,-.8e-9,1e-9,-1e-9,1.0000001e-9,-1.0000001e-9,1,-1,Infinity,-Infinity,NaN];
  for(const x of values)for(const z of values)assert.equal(negligible(x,z),Math.hypot(x,z)<=1e-9);
});

test('847 shared floor trace retains nested leases and clears pooled references on early returns and errors',async()=>{
  const f=await production(),V=(x=0,y=0,z=0)=>new f.THREE.Vector3(x,y,z);
  const owner={pos:V(),ground:{hit:true,face:0}},at=V(0,0,.75);
  const contact={point:V(),origin:V(),down:V(),hit:new f.Hit()};
  const face={paintable:true,n:V(0,1,0),origin:V(-2,0,-2),u:V(1,0,0),v:V(0,0,1),su:4,sv:4};
  const level={faces:[face],blocks:[{solid:true,grate:false,faces:[0]}]};
  const physics={raycast(_origin,_down,_length,hit){hit.hit=true;hit.face=0;hit.point.copy(at);return hit;}};
  const buffers=[];let inside=false,fail=false,reenter=true;
  level.queryBlocks=(_x,_z,_mx,_mz,ids)=>{
    assert.deepEqual(ids,[]);ids.push(0);buffers.push(ids);
    if(reenter&&!inside){inside=true;try{assert.ok(traceRollingFloor(owner,at,level,physics,contact));}finally{inside=false;}assert.deepEqual(ids,[0]);}
    if(fail)throw Error('floor-query-fault');
  };
  assert.ok(traceRollingFloor(owner,at,level,physics,contact));
  assert.notEqual(buffers[0],buffers[1],'nested invocations cannot borrow the outer ids');
  const leases=contact.rollScratch.slice();assert.equal(leases.length,2);
  const clean=()=>{assert.equal(contact.rollScratchDepth,0);for(const lease of leases){assert.deepEqual(lease.ids,[]);assert.deepEqual(lease.triangle,[null,null,null]);}};
  clean();assert.ok(traceRollingFloor(owner,at,level,physics,contact));assert.equal(buffers[0],buffers[2]);assert.deepEqual(contact.rollScratch,leases);clean();
  fail=true;assert.throws(()=>traceRollingFloor(owner,at,level,physics,contact),/floor-query-fault/);fail=false;clean();
  reenter=false;level.blocks[0].grate=true;assert.equal(traceRollingFloor(owner,at,level,physics,contact),undefined);clean();
  const triangle={a:V(-3,0,-3),b:V(3,0,-3),c:V(0,0,3)};
  level.triangleWorld={flags:[0],normals:[0,1,0],queryBox(_min,_max,visit){visit(0);},triangle:()=>triangle};level.data={triangleFace:[0]};
  level.queryDynamicBlocks=(_x,_z,_mx,_mz,ids)=>{assert.deepEqual(contact.rollScratch[0].triangle,[triangle.a,triangle.b,triangle.c]);ids.push(0);throw Error('native-query-fault');};
  assert.throws(()=>traceRollingFloor(owner,at,level,physics,contact),/native-query-fault/);clean();
});
