// Unit tests of the exact browser-serialized helper and its ownership contract.
// Native loaded-source-motion/physics parity is covered by the immutable
// diagnostic run 39015837031 at 556b7bcce64d77dc939de128936ae0acc4fc6d76.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../check-inkwave-projectile-visuals.mjs', import.meta.url), 'utf8');
const matched = source.match(/async function resetCaptureCharacter\(actor\) \{[\s\S]*?\n\}/g);
assert.equal(matched?.length, 1);
const reset = vm.runInNewContext('(' + matched[0] + ')');
function fixture({ status = 'ready', rejection = null, deferred = null, oldDisposeThrows = false, frames = 0 } = {}) {
  const events = [], instances = [];
  class Value { constructor(value) { this.value = value; } copy(other) { this.value = other.value; return this; } }
  const scene = { children: new Set(), add(root) { this.children.add(root); root.parent = this; events.push('attach'); } };
  class Character {
    constructor(options) {
      this.options = options; this.style = options.style; this.visible = true; this.t = 0; this.wAim = 0;
      this.root = { position: new Value(0), quaternion: new Value(0), parent: null, updateMatrixWorld() { events.push('matrices'); } };
      this.sourceMotion = { status, manual: null }; this.disposed = false;
      this._sourceMotionLoader = deferred || (rejection ? Promise.reject(rejection) : Promise.resolve());
      instances.push(this); events.push('construct');
    }
    setVisible(visible) { this.visible = visible; }
    dispose() {
      events.push(this === old ? 'dispose-old' : 'dispose-fresh');
      if (this === old && oldDisposeThrows) throw new Error('old disposal failed');
      this.disposed = true; this._sourceMotionDisposed = true;
      this.root.parent?.children.delete(this.root); this.root.parent = null;
    }
  }
  const style = { hair: 2, skin: 1 }, old = new Character({ style });
  // Old readiness is irrelevant: reset must await the newly-created instance.
  old._sourceMotionLoader.catch(() => {});
  old.t = frames / 60; old.wAim = frames ? 0.4 : 0; old.root.position.value = 42; old.root.quaternion.value = 17;
  old.onEvent = () => {}; old.visible = false; scene.add(old.root);
  const actor = { character: old, color: '#ffd21a', weaponId: 'shooter', name: 'test', isLocal: true, weaponRunner: {} };
  old.actor = actor;
  return { actor, old, scene, events, instances, Character };
}
test('reconstructs through installed native constructor, preserving identity options and actor/scene ownership', async () => {
  const f = fixture(), runner = f.actor.weaponRunner;
  const ch = await reset(f.actor);
  assert.equal(ch.constructor, f.Character);
  assert.equal(ch.actor, f.actor); assert.equal(ch.onEvent, f.old.onEvent);
  assert.equal(ch.options.style, f.old.style); assert.equal(ch.options.color, f.actor.color);
  assert.equal(ch.options.weapon, 'shooter'); assert.equal(ch.options.name, 'test'); assert.equal(ch.options.isLocal, true);
  assert.equal(Object.hasOwn(ch.options, 'sourceMotion'), false, 'uses normal native constructor defaults');
  assert.equal(f.actor.weaponRunner, runner); assert.equal(ch.root.parent, f.scene);
  assert.equal(ch.root.position.value, 42); assert.equal(ch.root.quaternion.value, 17); assert.equal(ch.visible, false);
  assert.equal(f.old.disposed, true); assert.equal(f.old.root.parent, null); assert.equal(f.scene.children.size, 1);
  assert.equal(ch.sourceMotion.manual, null);
});
test('awaits source readiness before replacing or disposing current actor Character', async () => {
  let resolve; const deferred = new Promise(done => { resolve = done; });
  const f = fixture({ deferred }), pending = reset(f.actor);
  assert.equal(f.actor.character, f.old); assert.equal(f.old.disposed, false);
  resolve(); const ch = await pending;
  assert.equal(f.actor.character, ch); assert.equal(f.old.disposed, true);
});
for (const status of ['loading', 'error', 'unavailable', 'disabled']) {
  test('fails closed on source status ' + status + ' without disposing the current Character', async () => {
    const f = fixture({ status });
    await assert.rejects(reset(f.actor), /source motion failed readiness/);
    assert.equal(f.actor.character, f.old); assert.equal(f.old.disposed, false);
    assert.equal(f.instances[1].disposed, true); assert.equal(f.scene.children.size, 1);
  });
}
test('loader rejection cleans only the uncommitted replacement', async () => {
  const f = fixture({ rejection: new Error('load failed') });
  await assert.rejects(reset(f.actor), /load failed/);
  assert.equal(f.actor.character, f.old); assert.equal(f.old.disposed, false); assert.equal(f.instances[1].disposed, true);
});
test('old disposal failure cannot dispose the already-committed replacement', async () => {
  const f = fixture({ oldDisposeThrows: true });
  await assert.rejects(reset(f.actor), /old disposal failed/);
  assert.equal(f.actor.character, f.instances[1]); assert.equal(f.instances[1].disposed, false);
});
test('constructor-owned animation state resets across distinct retained histories', async () => {
  const states = [];
  for (const frames of [0, 133, 208]) { const f = fixture({ frames }); const ch = await reset(f.actor); states.push({t:ch.t,wAim:ch.wAim,manual:ch.sourceMotion.manual}); }
  assert.deepEqual(states, Array(3).fill({t:0,wAim:0,manual:null}));
});
test('capture uses frozen async lifecycle and normal native zero-time frame, never manual clip pinning', () => {
  assert.match(source, /const visualSetup = async/);
  assert.match(source, /if \(!g\.frozen\)[\s\S]*await resetCaptureCharacter\(a\);[\s\S]*if \(!g\.frozen\)/);
  assert.match(source, /const resetAtNativeFloor =[\s\S]*a\._finishFrame\(0\);[\s\S]*resetAtNativeFloor\(canonical\.pos/);
  assert.doesNotMatch(source, /source\.playClip\(|WaitShoot_Nrml/);
});
