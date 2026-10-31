import test from 'node:test';
import assert from 'node:assert/strict';
import { installSelfOcclusion, selfOcclusionSnapshot, projectedSelfOverlap, stepSelfOpacity } from '../runtime/self-occlusion.mjs';

const THREE = await import(process.env.INKWAVE_SELF_OCCLUSION_THREE || new URL('../../../inkwave-public/vendor/three/build/three.module.js', import.meta.url).href);

function fixture() {
  const shared = new THREE.MeshPhysicalMaterial({ color: '#667788', opacity: .42, transparent: true });
  const privateMaterial = new THREE.MeshPhysicalMaterial({ color: '#ff8844' });
  class Character {
    constructor(local = true) {
      this.isLocal = local; this.visible = true;
      this.root = new THREE.Group();
      this.body = new THREE.Mesh(new THREE.BoxGeometry(.6, 1.7, .5), privateMaterial);
      this.weapon = new THREE.Mesh(new THREE.BoxGeometry(.3, .4, .9), shared);
      this.body.position.y = .85;
      this.root.add(this.body, this.weapon);
      this.bones = { chest: new THREE.Object3D() };
      this.bones.chest.position.y = .95; this.root.add(this.bones.chest);
    }
    warmAll() { this.warmed = true; return 17; }
    update() { return 19; }
    setVisible(value) { this.root.visible = this.visible = !!value; }
    getHeadPosition(out) { this.root.updateWorldMatrix(true, true); return out.set(0, 1.4, 0).applyMatrix4(this.root.matrixWorld); }
    dispose() { this.root.removeFromParent(); this.disposed = true; }
  }
  class CameraRig {
    constructor(actor) {
      this.target = actor; this.mode = 'follow'; this.mapK = 0; this.mapOpen = false;
      this.camera = new THREE.PerspectiveCamera(58, 16 / 9, .1, 100);
      this.angle = 0; this.distance = 4.5; this.side = .25;
    }
    update() {
      this.camera.position.set(this.side, 1.85 + Math.sin(this.angle) * this.distance, -Math.cos(this.angle) * this.distance);
      this.camera.lookAt(this.side, 1.85, 0);
      this.camera.updateMatrixWorld(true);
      return 23;
    }
  }
  class PlayerController {
    constructor(a, rig) { this.a = a; this.rig = rig; this.enabled = true; this.shotGuide = null; this.nextGuide = null; }
    computeAim() { this.shotGuide = this.nextGuide; return 29; }
  }
  const ch = new Character(), actor = { character: ch, alive: true, form: 'kid', remote: false, hp: 100, score: 35 };
  const other = new Character(false), rig = new CameraRig(actor);
  const controller = new PlayerController(actor, rig);
  const G = { match: { local: actor, attract: false, controller }, post: {} };
  installSelfOcclusion({ THREE, Character, CameraRig, PlayerController, G });
  return { ch, actor, other, rig, G, controller, shared, privateMaterial, Character, CameraRig, PlayerController };
}

function settle(f, angle = 1.2, frames = 60, dt = 1 / 60) {
  f.rig.angle = angle;
  for (let i = 0; i < frames; i++) f.rig.update(dt);
  return selfOcclusionSnapshot(f.ch);
}

test('looking down fades only the overlapping local avatar; looking forward restores it', () => {
  const f = fixture(), remoteSource = f.other.weapon.material;
  assert.equal(f.ch.warmAll(), 17);
  assert.equal(f.ch.update(1 / 60), 19);
  assert.equal(f.rig.update(1 / 60), 23);
  assert.equal(selfOcclusionSnapshot(f.ch).opacity, 1);
  const faded = settle(f);
  assert(faded.overlap > .8, `expected overlap, got ${faded.overlap}`);
  assert(faded.opacity < .3, `expected background visibility, got ${faded.opacity}`);
  assert.equal(f.other.weapon.material, remoteSource);
  assert.equal(selfOcclusionSnapshot(f.other), null);
  assert.equal(f.shared.opacity, .42);
  assert.equal(f.actor.hp, 100); assert.equal(f.actor.score, 35);
  assert.equal(settle(f, 0).opacity, 1);
  f.rig.side = .8;
  assert.equal(settle(f).opacity, 1, 'a down-looking camera clear of the silhouette does not fade the avatar');
});

test('screen-space overlap anticipates contact and rejects separated, upward and invalid views', () => {
  assert(projectedSelfOverlap(.01, .02, .12, .9) > .99);
  assert(projectedSelfOverlap(.17, 0, .12, .9) > 0);
  assert.equal(projectedSelfOverlap(.8, 0, .12, .9), 0);
  assert.equal(projectedSelfOverlap(0, 0, .12, -.8), 0);
  assert.equal(projectedSelfOverlap(NaN, 0, .12, .9), 0);
});

test('a wall-compressed camera fades the nearby body even when the player is looking up', () => {
  const f = fixture();
  assert.equal(settle(f, -.3).opacity, 1);
  f.rig.distance = .35;
  assert(settle(f, -.3).opacity < .3);
  f.rig.distance = 4.5;
  assert.equal(settle(f, -.3).opacity, 1);
});

test('fresh off-center shot guide fades the body in the same frame without advancing the clock twice', () => {
  const f = fixture(); f.rig.side = 2.4;
  assert.equal(settle(f).opacity, 1, 'the central crosshair is clear of the body');
  f.controller.nextGuide = { x: 0, y: 1.4, z: 0, frames: 12 };
  f.rig.update(1 / 60);
  assert.equal(selfOcclusionSnapshot(f.ch).opacity, 1, 'old guide was absent');
  assert.equal(f.controller.computeAim(false), 29);
  const fresh = selfOcclusionSnapshot(f.ch);
  assert(fresh.overlap > .99); assert(fresh.opacity < 1);
  assert.equal(fresh.opacity, stepSelfOpacity(1, fresh.overlap, 1 / 60));
  f.controller.computeAim(false);
  assert.equal(selfOcclusionSnapshot(f.ch).opacity, fresh.opacity);
  f.controller.nextGuide = null;
  f.controller.computeAim(true);
  assert.equal(selfOcclusionSnapshot(f.ch).opacity, fresh.opacity, 'simulation ticks do not update visual fade');
  f.controller.computeAim(false);
  assert.equal(selfOcclusionSnapshot(f.ch).opacity, 1, 'current render query can clear the old visual guide');
});

test('an impact guide crossing the body also fades it while the camera looks upward', () => {
  const f = fixture(); f.rig.side = 2.4;
  assert.equal(settle(f, -.3).opacity, 1);
  f.controller.nextGuide = { x: 0, y: 1.4, z: 0, frames: 12 };
  f.rig.update(1 / 60); f.controller.computeAim(false);
  const faded = selfOcclusionSnapshot(f.ch);
  assert(faded.overlap > .99);
  assert(faded.opacity < 1);
  f.controller.nextGuide = null; f.controller.computeAim(false);
  assert.equal(selfOcclusionSnapshot(f.ch).opacity, 1);
});

test('Blaster, Slosher and custom catalog profiles consume the native cached HUD guide after fresh aim', () => {
  for (const weapon of [
    { id: 'blaster', kind: 'blaster' }, { id: 'slosher', kind: 'slosher' },
    { id: 'custom-hotblaster', kind: 'catalog', behaviorKind: 'blaster' },
    { id: 'custom-elite', kind: 'catalog', catalogRecord: { family: 'blaster' } },
  ]) {
    const f = fixture(); f.rig.side = 2.4;
    f.actor.weapon = weapon; f.actor.weaponId = 'unrelated-selection-id';
    assert.equal(settle(f, -.3).opacity, 1);
    f.G.rig = f.rig; f.rig.gameCam = f.rig.camera.clone();
    const head = f.ch.getHeadPosition(new THREE.Vector3());
    // A translated gameplay camera needs a matching translated endpoint to
    // occupy the head's position in the rendered camera. This detects using
    // the wrong projection camera as well as passing the wrong cache inputs.
    f.rig.gameCam.position.x += 2; f.rig.gameCam.updateMatrixWorld(true);
    const endpoint = head.clone(); endpoint.x += 2;
    let queries = 0, replays = 0, cached = null;
    f.G.projectiles = { s3WeaponGuide(actor, liveWeapon, camera, width, height) {
      queries++;
      assert.equal(actor, f.actor); assert.equal(liveWeapon, weapon);
      assert.equal(camera, f.rig.gameCam); assert.equal(width, 1280); assert.equal(height, 720);
      if (!cached) { replays++; cached = endpoint; }
      return cached;
    } };
    f.rig.update(1 / 60); assert.equal(queries, 0, 'camera update does not predict against stale aim');
    f.controller.computeAim(true); assert.equal(queries, 0, 'simulation ticks do not query visual guides');
    assert.equal(f.controller.shotGuide, null, 'Blaster/Slosher do not use the controller guide');
    f.controller.computeAim(false);
    const faded = selfOcclusionSnapshot(f.ch);
    assert(faded.overlap > .99); assert.equal(faded.opacity, stepSelfOpacity(1, faded.overlap, 1 / 60));
    f.controller.computeAim(false);
    assert.equal(selfOcclusionSnapshot(f.ch).opacity, faded.opacity, 'render aim does not advance the fade twice');
    const hudPoint = f.G.projectiles.s3WeaponGuide(f.actor, weapon, f.rig.gameCam, 1280, 720);
    assert.equal(hudPoint, endpoint); assert.equal(replays, 1, 'HUD and fade share the existing cached point');
    const priorQueries = queries;
    f.controller.enabled = false; f.controller.computeAim(false);
    assert.equal(queries, priorQueries); assert.equal(selfOcclusionSnapshot(f.ch).opacity, 1);
    f.controller.enabled = true; f.actor.weapon = { id: 'shooter', kind: 'shooter' };
    f.controller.computeAim(false);
    assert.equal(queries, priorQueries); assert.equal(selfOcclusionSnapshot(f.ch).opacity, 1, 'weapon switch does not reuse a former family guide');
  }
});

test('Blaster aim and impact marks each fade the body using one shared pair query', () => {
  for (const overBody of ['aim', 'impact']) {
    const f = fixture(); f.rig.side = 2.4; f.actor.weapon = { kind: 'catalog', catalogRecord: { family: 'blaster' } };
    assert.equal(settle(f, -.3).opacity, 1);
    const head = f.ch.getHeadPosition(new THREE.Vector3());
    const away = head.clone(); away.x -= 20;
    const pair = { aim: away.clone(), impact: away.clone() }; pair[overBody].copy(head);
    const before = { aim: pair.aim.toArray(), impact: pair.impact.toArray() };
    let queries = 0;
    f.G.projectiles = {
      s3BlasterReticleGuides(actor, weapon, camera, width, height) {
        queries++; assert.equal(actor, f.actor); assert.equal(weapon, f.actor.weapon);
        assert.equal(camera, f.rig.camera); assert.equal(width, 1280); assert.equal(height, 720);
        return pair;
      },
      s3WeaponGuide() { assert.fail('a valid Blaster pair must not trigger another prediction'); },
    };
    f.rig.update(1 / 60); f.controller.computeAim(true); assert.equal(queries, 0);
    f.controller.computeAim(false); assert.equal(queries, 1);
    const faded = selfOcclusionSnapshot(f.ch);
    assert(faded.overlap > .99, overBody + ' overlaps the rendered head');
    assert.equal(faded.opacity, stepSelfOpacity(1, faded.overlap, 1 / 60));
    assert.deepEqual({ aim: pair.aim.toArray(), impact: pair.impact.toArray() }, before, 'HUD-owned cached points remain unchanged');
    f.controller.computeAim(false); assert.equal(selfOcclusionSnapshot(f.ch).opacity, faded.opacity);
  }
});

test('dual Blaster marks exclude the unmarked screen center but retain camera-near fading', () => {
  const f = fixture(); f.actor.weapon = { kind: 'blaster' };
  f.rig.angle = 1.2;
  const pair = { aim: new THREE.Vector3(-100, 1.4, 0), impact: new THREE.Vector3(-90, 1.4, 0) };
  f.G.projectiles = { s3BlasterReticleGuides: () => pair };
  for (let i = 0; i < 60; i++) { f.rig.update(1 / 60); f.controller.computeAim(false); }
  assert.equal(selfOcclusionSnapshot(f.ch).opacity, 1, 'the body covers the center, but both visible marks are away');
  f.rig.distance = .35; f.rig.angle = -.3;
  for (let i = 0; i < 60; i++) { f.rig.update(1 / 60); f.controller.computeAim(false); }
  assert(selfOcclusionSnapshot(f.ch).opacity < .3, 'physical camera-body proximity still fades');
  f.rig.distance = 4.5; f.rig.angle = 1.2;
  for (let i = 0; i < 60; i++) { f.rig.update(1 / 60); f.controller.computeAim(false); }
  assert.equal(selfOcclusionSnapshot(f.ch).opacity, 1);
});

test('a hidden out-of-range impact mark cannot cause a Blaster fade', () => {
  const f = fixture(); f.rig.side = 2.4; f.actor.weapon = { kind: 'blaster' };
  assert.equal(settle(f, -.3).opacity, 1);
  const pair = { aim: new THREE.Vector3(-100, 1.4, 0), impact: f.ch.getHeadPosition(new THREE.Vector3()) };
  f.G.projectiles = { s3BlasterReticleGuides: () => pair };
  f.controller.inRange = false;
  f.rig.update(1 / 60); f.controller.computeAim(false);
  assert.equal(selfOcclusionSnapshot(f.ch).opacity, 1);
  f.controller.inRange = true; f.controller.computeAim(false);
  assert(selfOcclusionSnapshot(f.ch).opacity < 1, 'the same impact fades when the HUD displays it');
  f.controller.inRange = false; pair.aim.copy(pair.impact); f.controller.computeAim(false);
  assert(selfOcclusionSnapshot(f.ch).opacity < 1, 'the always-visible aim mark remains active');
});

test('an unavailable Blaster pair falls back and Slosher keeps its single-guide API', () => {
  const f = fixture(); f.rig.side = 2.4; f.actor.weapon = { kind: 'blaster' };
  assert.equal(settle(f, -.3).opacity, 1);
  let pairs = 0, singles = 0;
  f.G.projectiles = {
    s3BlasterReticleGuides() { pairs++; return null; },
    s3WeaponGuide() { singles++; return f.ch.getHeadPosition(new THREE.Vector3()); },
  };
  f.rig.update(1 / 60); f.controller.computeAim(false);
  assert.equal(pairs, 1); assert.equal(singles, 1); assert(selfOcclusionSnapshot(f.ch).opacity < 1);
  f.actor.weapon = { kind: 'slosher' }; f.controller.computeAim(false);
  assert.equal(pairs, 1); assert.equal(singles, 2); assert(selfOcclusionSnapshot(f.ch).opacity < 1);
});

test('Blaster HUD guide projection stays outside the viewport instead of adopting Shooter edge clamping', () => {
  const f = fixture(); f.rig.side = 4;
  f.actor.weapon = { id: 'custom-blaster', kind: 'blaster' };
  assert.equal(settle(f, -.3).opacity, 1);
  const outside = { x: -100, y: 1.4, z: 0 };
  f.G.projectiles = { s3WeaponGuide: () => outside };
  f.rig.update(1 / 60); f.controller.computeAim(false);
  assert.equal(selfOcclusionSnapshot(f.ch).opacity, 1, 'the Blaster marker is far outside the viewport');
  f.actor.weapon = { id: 'shooter', kind: 'shooter' }; f.controller.nextGuide = outside;
  f.controller.computeAim(false);
  assert(selfOcclusionSnapshot(f.ch).opacity < 1, 'the Shooter marker is visibly clamped beside the edge of the body');
});

test('behind-camera Blaster endpoints return to the HUD center without a mirrored guide over the body', () => {
  const f = fixture(); f.rig.side = 2.4; f.actor.weapon = { kind: 'blaster' };
  assert.equal(settle(f, -.3).opacity, 1);
  const head = f.ch.getHeadPosition(new THREE.Vector3());
  const behind = f.rig.camera.position.clone().multiplyScalar(2).sub(head);
  assert(behind.clone().project(f.rig.camera).z > 1);
  f.G.projectiles = { s3WeaponGuide: () => behind };
  f.rig.update(1 / 60); f.controller.computeAim(false);
  assert.equal(selfOcclusionSnapshot(f.ch).opacity, 1);
});

test('steady fade integrates the same visible time at 30, 60 and 120 Hz', () => {
  const run = (hz, initial, overlap) => {
    let opacity = initial;
    for (let i = 0; i < hz * .5; i++) opacity = stepSelfOpacity(opacity, overlap, 1 / hz);
    return opacity;
  };
  for (const [initial, overlap] of [[1, .85], [.1, 0]]) {
    const expected = run(30, initial, overlap);
    for (const hz of [60, 120]) assert(Math.abs(run(hz, initial, overlap) - expected) < 1e-12);
  }
  assert.equal(stepSelfOpacity(.4, 1, 0), .4);
  assert.equal(stepSelfOpacity(.4, 1, -1), .4);
  assert.equal(stepSelfOpacity(1, .0001, 1 / 60), 1, 'numerical boundary coverage does not start a fade');
});

test('aspect and pixel-density changes do not alter the height-normalized overlap', () => {
  const f = fixture();
  const wide = settle(f).overlap;
  f.rig.camera.aspect = 1; f.rig.camera.updateProjectionMatrix();
  assert(Math.abs(settle(f).overlap - wide) < 1e-12);
  f.G.post.dynScale = .6; f.G.renderer = { getPixelRatio: () => 2.2 };
  assert(Math.abs(settle(f).overlap - wide) < 1e-12);
});

test('shared materials stay native and clone follows live opacity, colors, flags and source version', () => {
  const f = fixture(); f.ch.warmAll();
  const copy = f.ch.weapon.material, originalVersion = f.shared.version;
  assert.notEqual(copy, f.shared); assert.equal(f.other.weapon.material, f.shared);
  assert.notEqual(copy.uuid, f.shared.uuid);
  assert.equal(copy.color, f.shared.color);
  f.shared.color.set('#ffee33'); f.shared.opacity = .21; f.shared.depthWrite = false;
  assert.equal(copy.opacity, .21); assert.equal(copy.depthWrite, false);
  assert.equal(copy.color.getHex(), f.shared.color.getHex());
  f.shared.side = THREE.DoubleSide;
  copy.side = THREE.BackSide;
  assert.equal(f.shared.side, THREE.DoubleSide);
  assert.equal(copy.side, THREE.BackSide);
  copy.side = THREE.FrontSide;
  assert.equal(f.shared.side, THREE.DoubleSide);
  copy.side = THREE.DoubleSide;
  f.shared.side = THREE.FrontSide;
  assert.equal(copy.side, THREE.FrontSide);
  const version = copy.version;
  f.shared.needsUpdate = true;
  assert.equal(copy.version, version + 1);
  const steadyVersion = copy.version;
  settle(f); settle(f, 0);
  assert.equal(copy.version, steadyVersion);
  assert.equal(f.shared.version, originalVersion + 1);
  assert.equal(f.shared.opacity, .21);
});

test('shader keeps native hooks and uniforms, skips Flow fragmentless calls and disables fade for alternate cameras', () => {
  const f = fixture(), nativeUniform = { value: .7 };
  f.shared.onBeforeCompile = function (shader) {
    assert.equal(this, f.shared);
    shader.uniforms.nativeSpawnCoating = nativeUniform;
  };
  f.shared.customProgramCacheKey = () => 'native|lod|spawn';
  f.ch.warmAll(); settle(f);
  const material = f.ch.weapon.material;
  const shader = { uniforms: {}, fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }' };
  material.onBeforeCompile(shader, {});
  assert.equal(shader.uniforms.nativeSpawnCoating, nativeUniform);
  assert.match(shader.fragmentShader, /gl_FragColor = vec4\(1\.0\)/);
  assert.equal((shader.fragmentShader.match(/uniform float uIwLocalAimOpacity/g) || []).length, 1);
  assert.equal(material.customProgramCacheKey(), 'native|lod|spawn|iwLocalAimFade1');
  material.onBeforeRender({}, {}, f.rig.camera);
  assert(shader.uniforms.uIwLocalAimOpacity.value < .3);
  material.onBeforeRender({}, {}, new THREE.PerspectiveCamera());
  assert.equal(shader.uniforms.uIwLocalAimOpacity.value, 1);
  const flow = { uniforms: {}, fragmentShader: '' };
  material.onBeforeCompile(flow, {});
  assert.equal(flow.fragmentShader, ''); assert.equal(flow.uniforms.uIwLocalAimOpacity, undefined);
  const raw = { uniforms: {}, fragmentShader: '#version 300 es\nprecision highp float;\nvoid main() {}' };
  material.onBeforeCompile(raw, {});
  assert(raw.fragmentShader.startsWith('#version 300 es\nprecision highp float;\n'));
  assert.equal(f.shared.transparent, true);
});

test('ShaderMaterial compilation owns injected uniform entries without changing the shared source map', () => {
  const f = fixture(), native = { value: .6 };
  const source = new THREE.ShaderMaterial({ uniforms: { native }, vertexShader: 'void main() {}', fragmentShader: 'void main() {}' });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), source); f.ch.root.add(mesh);
  f.ch.warmAll(); const local = mesh.material;
  assert.notEqual(local.uniforms, source.uniforms);
  assert.equal(local.uniforms.native, native);
  const shader = { uniforms: local.uniforms, fragmentShader: source.fragmentShader };
  local.onBeforeCompile(shader, {});
  assert.deepEqual(Object.keys(source.uniforms), ['native']);
  assert.equal(source.uniforms.uIwLocalAimOpacity, undefined);
  assert.equal('uIwLocalAimOpacity' in local.uniforms, true);
  const replacement = { value: .9 }; source.uniforms.native = replacement;
  assert.equal(local.uniforms.native, replacement);
  source.uniforms.newValue = { value: 5 };
  assert.equal('newValue' in local.uniforms, true);
  assert(Object.keys(local.uniforms).includes('newValue'));
  f.ch.dispose();
  assert.equal(source.uniforms.uIwLocalAimOpacity, undefined);
});

test('late parts, LOD material assignments and material arrays remain covered and restore their current source', () => {
  const f = fixture(); f.ch.warmAll();
  const depth = new THREE.MeshDepthMaterial(), lateSource = new THREE.MeshBasicMaterial();
  const late = new THREE.Mesh(new THREE.BoxGeometry(), lateSource); late.customDepthMaterial = depth;
  const originalDescriptor = Object.getOwnPropertyDescriptor(late, 'material');
  f.ch.root.add(late);
  assert.notEqual(late.material, lateSource);
  assert.equal(late.customDepthMaterial, depth);
  late.material = f.privateMaterial;
  assert.notEqual(late.material, f.privateMaterial);
  const nativeArray = [f.shared, lateSource]; late.material = nativeArray;
  assert.equal(Array.isArray(late.material), true);
  assert.notEqual(late.material[0], f.shared);
  assert.equal(nativeArray[0], f.shared);
  nativeArray[1] = f.privateMaterial;
  assert.notEqual(late.material[1], f.privateMaterial);
  late.material[0] = lateSource;
  assert.equal(nativeArray[0], lateSource);
  f.ch.root.remove(late);
  assert.equal(late.material, nativeArray);
  const restoredDescriptor = Object.getOwnPropertyDescriptor(late, 'material');
  assert.equal(restoredDescriptor.writable, originalDescriptor.writable);
  assert.equal(restoredDescriptor.get, undefined);
  f.ch.root.add(late);
  assert.notEqual(late.material[0], lateSource);
  f.ch.dispose();
  assert.equal(late.material, nativeArray);
  assert.equal(selfOcclusionSnapshot(f.ch).nodes, 0);
  assert.equal(selfOcclusionSnapshot(f.ch).materials, 0);
});

test('hidden, dead, squid, map, spectator, wrong owner and attract states restore full opacity', () => {
  const cases = [
    f => f.ch.setVisible(false), f => { f.actor.alive = false; }, f => { f.actor.form = 'squid'; },
    f => { f.rig.mapOpen = true; }, f => { f.rig.mapK = .5; }, f => { f.rig.mode = 'spectate'; },
    f => { f.G.match.local = {}; }, f => { f.G.match.attract = true; },
  ];
  for (const change of cases) {
    const f = fixture(); assert(settle(f).opacity < .3);
    change(f); f.rig.update(1 / 60);
    assert.equal(selfOcclusionSnapshot(f.ch).opacity, 1);
  }
  const f = fixture(); settle(f); f.rig.target = { character: f.other, alive: true, form: 'kid' };
  f.rig.update(1 / 60); assert.equal(selfOcclusionSnapshot(f.ch).opacity, 1);
});

test('GTAO normal-only exclusion restores model and shadow flags even when the pass throws', () => {
  const f = fixture(), seen = [];
  const gtao = f.G.post.gtao = { normalMaterial: {}, camera: f.rig.camera,
    _renderOverride(renderer, material) {
      seen.push({ visible: f.ch.root.visible, auto: renderer.shadowMap.autoUpdate, dirty: renderer.shadowMap.needsUpdate });
      if (this.fail) throw new Error('expected pass failure');
      return 31;
    } };
  const renderer = { shadowMap: { autoUpdate: true, needsUpdate: true } };
  settle(f);
  assert.equal(gtao._renderOverride(renderer, gtao.normalMaterial), 31);
  assert.deepEqual(seen.pop(), { visible: false, auto: false, dirty: false });
  assert.equal(f.ch.root.visible, true);
  assert.deepEqual(renderer.shadowMap, { autoUpdate: true, needsUpdate: true });
  gtao._renderOverride(renderer, {});
  assert.deepEqual(seen.pop(), { visible: true, auto: true, dirty: true });
  gtao.fail = true;
  assert.throws(() => gtao._renderOverride(renderer, gtao.normalMaterial), /expected pass failure/);
  assert.equal(f.ch.root.visible, true);
  assert.deepEqual(renderer.shadowMap, { autoUpdate: true, needsUpdate: true });
});

test('GTAO retains almost-opaque normals, crosses hysteresis thresholds once, and resets on lifecycle changes', () => {
  const f = fixture(), seen = [];
  const gtao = f.G.post.gtao = { normalMaterial: {}, camera: f.rig.camera,
    _renderOverride() { seen.push(f.ch.root.visible); } };
  const renderer = { shadowMap: { autoUpdate: false, needsUpdate: false } };
  f.rig.angle = 1.2;
  f.rig.update(.001);
  assert(selfOcclusionSnapshot(f.ch).opacity > .96);
  gtao._renderOverride(renderer, gtao.normalMaterial);
  assert.equal(seen.pop(), true, 'an almost-opaque edge retains its native AO');
  settle(f);
  assert.equal(selfOcclusionSnapshot(f.ch).normalOmitted, true);
  gtao._renderOverride(renderer, gtao.normalMaterial); assert.equal(seen.pop(), false);
  f.rig.angle = 0;
  while (selfOcclusionSnapshot(f.ch).opacity < .92) f.rig.update(.001);
  assert.equal(selfOcclusionSnapshot(f.ch).normalOmitted, true, 'recovery does not chatter at the entry threshold');
  while (selfOcclusionSnapshot(f.ch).opacity < .97) f.rig.update(.001);
  assert.equal(selfOcclusionSnapshot(f.ch).normalOmitted, false);
  gtao._renderOverride(renderer, gtao.normalMaterial); assert.equal(seen.pop(), true);
  settle(f); f.rig.mapOpen = true; f.rig.update(1 / 60);
  assert.equal(selfOcclusionSnapshot(f.ch).normalOmitted, false);
  assert.equal(selfOcclusionSnapshot(f.ch).opacity, 1);
});

test('install is idempotent and disposal removes shared-source listeners and releases clones', () => {
  const f = fixture();
  const update = f.CameraRig.prototype.update;
  installSelfOcclusion({ THREE, Character: f.Character, CameraRig: f.CameraRig, G: f.G });
  assert.equal(f.CameraRig.prototype.update, update);
  f.ch.warmAll();
  const clone = f.ch.weapon.material;
  let disposed = 0; clone.addEventListener('dispose', () => disposed++);
  assert((f.shared._listeners?.dispose?.length || 0) > 0);
  f.ch.dispose(); f.ch.dispose();
  assert.equal(disposed, 1);
  assert.equal(f.ch.weapon.material, f.shared);
  assert.equal(f.shared._listeners?.dispose?.length || 0, 0);
  assert.equal(selfOcclusionSnapshot(f.ch).disposed, true);
});
