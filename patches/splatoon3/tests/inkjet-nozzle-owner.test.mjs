import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

let cached;
async function boot() {
  if (cached) return cached;
  const f = await fixture({fullRuntime:true, productionComposition:true, includeCharacter:true, realProjectiles:true});
  const {G, THREE, installedRuntime:api} = f;
  G.scene = new THREE.Scene(); G.settings = {quality:'high'}; G.mode = 'match'; G.match.state = 'playing';
  G.physics.segment = (_a, _b, h) => { h.hit = false; return h; };
  G.camera = new THREE.PerspectiveCamera(60, 4/3, .1, 300);
  G.camera.position.set(0, 8, -10); G.camera.lookAt(0, 5, 0); G.camera.updateMatrixWorld();
  G.projectiles = new api.Projectiles(G.scene);
  G.fx = new api.FX(G.scene, {quality:'high'}); G.fx.setCollider(() => null);
  return cached = f;
}

// The actors, Character models, attached packs and FX director are real. Only
// presentation is stepped: borrowing a live character is an explicit invalid
// identity fixture, not evidence of a reachable gameplay/network path.
for (const remote of [false, true]) for (const invalid of ['foreign', 'detached', 'hidden-model', 'hidden-holder', 'hidden-ancestor'])
test(`Inkjet ${remote?'remote':'local'} ${invalid} pack uses the actor fallback`, async () => {
  const f = await boot(), {G, THREE, installedRuntime:api} = f;
  const make = (x, name) => {
    const a = new api.Actor({team:0, name, weapon:'shooter', CharacterClass:api.Character});
    a.pos.set(x, 5, 0); a.aimYaw = 0; a.aimDir.set(0, 0, 1); a.character.onEvent = null;
    a.specialActive = {id:'inkjet', phase:'active', activation:1, t:0};
    G.actors.push(a); G.scene.add(a.character.root); a._finishFrame(1/60);
    return a;
  };
  const a = make(0, 'expected owner'), b = make(100, 'live model owner'), own = a.character;
  const fx = () => { G.time += 1/60; G.fx.update(1/60, G.camera); };
  const jets = () => G.fx.s3SpecialVfx.tracks.get(a).d.jets.map(r => new THREE.Vector3(r.v[0], r.v[1], r.v[2]));
  const fallback = () => jets().forEach((p, i) => assert.ok(p.distanceTo(new THREE.Vector3(i ? .16 : -.16, 5.55, -.32)) < 1e-5,
    `jet ${i} must stay at actor A's fallback, got ${p.toArray()}`));
  let restore = () => {};
  try {
    a.isLocal = !remote; a.remote = remote; fx();
    assert.equal(b.alive, true); assert.equal(b.character.actor, b);
    const pack = b.character.s3SpecialDevices().find(d => d.spec.model === 'spInkjetPack');
    assert.ok(pack); assert.equal(b.character.root.visible, true);
    assert.ok(pack.holder.getWorldPosition(new THREE.Vector3()).x > 99);
    const ownPack = own.s3SpecialDevices().find(d => d.spec.model === 'spInkjetPack');
    if (invalid === 'foreign') {
      a.character = b.character; restore = () => { a.character = own; };
    } else if (invalid === 'detached') {
      const parent = ownPack.holder.parent; ownPack.holder.removeFromParent(); restore = () => parent.add(ownPack.holder);
    } else {
      const node = invalid === 'hidden-model' ? ownPack.model.root : invalid === 'hidden-holder' ? ownPack.holder : own.kid;
      assert.equal(node.visible, true); node.visible = false; restore = () => { node.visible = true; };
    }
    fx(); fallback();
    assert.equal(a.character.actor, invalid === 'foreign' ? b : a, 'the observer must not repair/reassign ownership');
    restore(); restore = () => {}; fx();
    assert.ok(jets().every(p => p.x < 1 && Math.abs(p.y - 5.55) > .02), 'the matching live pack is used again');
    own.setVisible(false); assert.equal(own.s3SpecialDevices(), null); fx(); fallback();
    own.setVisible(true); a._finishFrame(1/60); fx();
    assert.equal(own.s3SpecialDevices().length, 2, 'showing the same owner creates fresh devices');
    assert.ok(jets().every(p => p.x < 1 && Math.abs(p.y - 5.55) > .02));
    a.alive = false; a._finishFrame(1/60); fx();
    assert.equal(own.s3SpecialDevices(), null); assert.equal(G.fx.s3SpecialVfx.tracks.has(a), false);
    assert.equal(G.fx.s3SpecialVfx.errors, 0);
  } finally {
    restore(); a.character = own; own.dispose(); b.character.dispose(); G.actors = []; G.fx.clear(); G.projectiles.clear();
  }
});
