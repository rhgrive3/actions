import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');
let loaded;

async function production() {
  if (loaded) return loaded;
  const context = vm.createContext({ console, performance, URL }), modules = new Map();
  function load(requested) {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const source = fs.readFileSync(file, 'utf8');
    const patched = file.startsWith(SRC + path.sep) ? adaptSource(path.relative(SRC, file), source) : source;
    const mod = new vm.SourceTextModule(patched, {
      context, identifier: file,
      initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; },
    });
    modules.set(file, mod);
    return mod;
  }
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { ROLLER_FOLD, rollerFoldSnapshot } from './patches/splatoon3/runtime/roller-fold.mjs';
  `, { context, identifier: path.join(ROOT, 'roller-fold-native-entry.mjs') });
  // The loader applies the same S3 source adapter as the installed native runtime.
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  const { G, THREE } = api;
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.scene = new THREE.Scene(); G.level = { blocks: [], groundHeight: () => 0 };
  G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true, canRespawn: () => false };
  G.physics = { los: () => true, raycast: (_a, _b, _c, hit) => { hit.hit = false; return hit; } };
  G.actors = []; G.time = 0;
  let shots = 0;
  G.projectiles = Object.fromEntries(['fireFlick', 'fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling', 'fireBlaster', 'fireSlosh', 'throwBomb']
    .map(name => [name, () => { shots++; }]));
  api.testShotCount = () => shots;
  loaded = api;
  return api;
}

function rig(api, { remote = false } = {}) {
  const { Actor, Character, G } = api;
  const actor = new Actor({ team: 0, name: remote ? 'remote fold rig' : 'owner fold rig', weapon: 'roller',
    isLocal: !remote, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 }, CharacterClass: Character });
  actor.remote = remote;
  const ch = actor.character; ch.actor = actor; ch.onEvent = null;
  G.actors.push(actor); G.scene.add(ch.root); actor.grounded = true; actor.ground.hit = true;
  let closed = false;
  function step(dt = 1 / 60, input = {}) {
    actor.intent.fire = !!input.fire;
    if (input.grounded !== undefined) actor.grounded = input.grounded;
    if (input.speed !== undefined) actor.vel.set(0, 0, input.speed);
    actor.pos.addScaledVector(actor.vel, dt); G.time += dt;
    if (!remote) actor.weaponRunner.update(dt, input);
    actor._finishFrame(dt);
    ch.root.updateMatrixWorld(true);
  }
  ch.fidget = -1; ch.idleT = 0; ch.shufT = 99;
  animate(ch, 1 / 60);
  return { actor, ch, step, close() {
    if (closed) return;
    closed = true; G.actors = G.actors.filter(x => x !== actor); G.scene.remove(ch.root); ch.dispose();
  } };
}

function gameplay(r, api) {
  const { actor: a, ch } = r, w = a.weaponRunner;
  return {
    ink: a.ink, hp: a.hp, pos: a.pos.toArray(), vel: a.vel.toArray(), alive: a.alive,
    weapon: a.weapon?.kind, shots: api.testShotCount(), cooldown: w.cooldown, flick: w.flick,
    flickRecover: w.flickRecover, rollT: w.rollT, rolling: w.rolling,
    attack: w.s3RollerAttack ? { ...w.s3RollerAttack } : null,
    vertical: w.s3FlickVertical, flickTimer: ch.tr[api.CHARACTER_TIMERS.T_FLICK],
  };
}

function animate(ch, dt) {
  return ch._animWeapon(dt, { ...ch.actor.anim, runner: ch.actor.weaponRunner }, ch.weapon);
}

function assertAbsoluteHinge(api, ch) {
  const w = ch.weapon;
  assert.ok(Math.abs(w.fold.rotation.x - api.ROLLER_FOLD.angle * w.foldT) < 1e-12);
}

test('installed native Character builds articulated body, ink and drum under one real hinge', async () => {
  const api = await production(), r = rig(api);
  try {
    const w = r.ch.weapon, def = w.def;
    assert.equal(def.kind, 'roller');
    assert.equal(w.fold.name, 'rollerFold');
    assert.ok(w.fold instanceof api.THREE.Group);
    assert.ok(w.parts.hinge, 'body yoke is separated from the static handle mesh');
    assert.ok(w.parts.hingeInk, 'ink yoke overlay is also articulated');
    assert.equal(w.parts.hinge.parent, w.fold);
    assert.equal(w.parts.hingeInk.parent, w.fold);
    assert.equal(w.drum.parent, w.fold);
    assert.equal(api.rollerFoldSnapshot(r.ch, w).fold, 1, 'neutral carry starts folded');
  } finally { r.close(); }
});

test('owner and remote Character use the same attack state; the fold hook leaves gameplay unchanged', async () => {
  const api = await production(), local = rig(api), remote = rig(api, { remote: true });
  try {
    local.actor.isLocal = true;
    for (let i = 0; i < 9; i++) {
      local.step(1 / 60, { fire: i === 0, firePressed: i === 0 });
      const attack = local.actor.weaponRunner.s3RollerAttack;
      assert.ok(attack, 'the native Roller runner owns the active horizontal attack');
      assert.equal(attack.vertical, false);
      remote.actor.weaponRunner.s3RollerAttack = { ...attack };
      remote.ch.s3RollerFlick = null; // exercise the remote owner-runner presentation path
      const before = gameplay(remote, api);
      animate(remote.ch, 1 / 60);
      assert.deepEqual(gameplay(remote, api), before);
      assert.deepEqual(api.rollerFoldSnapshot(remote.ch, remote.ch.weapon), api.rollerFoldSnapshot(local.ch, local.ch.weapon));
      assertAbsoluteHinge(api, local.ch); assertAbsoluteHinge(api, remote.ch);
    }
    assert.ok(local.ch.weapon.foldT < 0.02, 'horizontal flick unfolds the roller-side assembly');
    assert.equal(api.testShotCount(), 0, 'presentation does not emit projectiles');
  } finally { local.close(); remote.close(); }
});

test('vertical, horizontal, rolling and carry hinge curves stay stable at 30/60/120Hz, including zero elapsed updates', async () => {
  const api = await production();
  const rows = [];
  for (const hz of [30, 60, 120]) {
    const r = rig(api), w = r.ch.weapon, dt = 1 / hz;
    try {
      // Begin open, then fold for a vertical flick over the same elapsed time.
      w.foldT = 0; w.fold.rotation.x = 0;
      r.ch.s3RollerFlick = { vertical: true, elapsed: 0, interval: 47 / 60 };
      for (let i = 0; i < hz / 5; i++) { animate(r.ch, dt); assertAbsoluteHinge(api, r.ch); }
      const vertical = w.foldT;
      assert.ok(Math.abs(vertical - (1 - Math.exp(-api.ROLLER_FOLD.rate * 0.2))) < 1e-10);

      // Horizontal flick and rolling both keep the hinge open.
      r.ch.s3RollerFlick = { vertical: false, elapsed: 0, interval: 42 / 60 };
      for (let i = 0; i < hz / 5; i++) animate(r.ch, dt);
      const horizontal = w.foldT;
      assert.ok(Math.abs(horizontal - vertical * Math.exp(-api.ROLLER_FOLD.rate * 0.2)) < 1e-10);
      r.ch.s3RollerFlick = null; r.ch.wRoll = 1;
      for (let i = 0; i < hz / 5; i++) animate(r.ch, dt);
      assert.equal(w.foldT, 0, 'rolling settles fully unfolded');

      // Idle/carry returns to folded. A paused render update must not advance it.
      r.ch.wRoll = 0;
      for (let i = 0; i < hz / 5; i++) animate(r.ch, dt);
      const carry = w.foldT, paused = carry;
      animate(r.ch, 0);
      assert.equal(w.foldT, paused);
      assert.ok(Math.abs(carry - (1 - Math.exp(-api.ROLLER_FOLD.rate * 0.2))) < 1e-10);
      assertAbsoluteHinge(api, r.ch);
      rows.push({ vertical, horizontal, carry });
    } finally { r.close(); }
  }
  assert.ok(rows.every(x => Math.abs(x.vertical - rows[0].vertical) < 1e-10
    && Math.abs(x.horizontal - rows[0].horizontal) < 1e-10 && Math.abs(x.carry - rows[0].carry) < 1e-10));
});

test('reset, death, weapon swap and disposal do not retain or accumulate a hinge transform', async () => {
  const api = await production(), r = rig(api);
  try {
    r.step(1 / 60, { fire: true, firePressed: true });
    assert.ok(r.ch.weapon.foldT < 1);
    r.actor.weaponRunner.reset();
    for (let i = 0; i < 20; i++) r.step(1 / 60);
    assert.equal(r.ch.s3RollerFlick, null);
    assert.equal(r.ch.weapon.foldT, 1, 'reset returns the visual hinge to its neutral carry state');
    assertAbsoluteHinge(api, r.ch);

    r.step(1 / 60, { fire: true, firePressed: true });
    r.actor.setWeapon('shooter');
    assert.equal(r.ch.weaponKind, 'shooter');
    assert.ok(!r.ch.weapon.fold);
    r.actor.setWeapon('roller');
    assert.ok(r.ch.weapon.fold, 'the Roller hinge is restored when the weapon returns');
    assert.equal(r.ch.weapon.fold.rotation.x, api.ROLLER_FOLD.angle * r.ch.weapon.foldT);
    for (let i = 0; i < 20; i++) r.step(1 / 60);
    assert.equal(r.ch.weapon.foldT, 1);
    assertAbsoluteHinge(api, r.ch);

    r.step(1 / 60, { fire: true, firePressed: true });
    r.actor.splat(null);
    assert.equal(r.actor.alive, false);
    assert.equal(r.ch.s3RollerFlick, null);
    assert.equal(r.ch.weapon.foldT, 1, 'death resets the hidden Character hinge immediately');
    assertAbsoluteHinge(api, r.ch);

    const disposedWeapon = r.ch.weapon;
    disposedWeapon.foldT = 0.5; disposedWeapon.fold.rotation.x = api.ROLLER_FOLD.angle * 0.5;
    r.close();
    assert.equal(disposedWeapon.foldT, 1, 'dispose clears the last visual transform');
    assert.equal(disposedWeapon.fold.rotation.x, api.ROLLER_FOLD.angle);
  } finally { r.close(); }
});
