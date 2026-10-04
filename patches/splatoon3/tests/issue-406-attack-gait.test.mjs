// Issue #406 — firing directional lower-body locomotion (presentation only).
// Native path: the real skinned Character + active S3 walk layer, with the
// adapter chained exactly as the build wires it (shared adaptSource first).
// Negative main control: the same rig driven identically with the main-only
// transform (no issue-406 patch) must stay bit-identical when the state is
// inactive, and main's source must not contain the state at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { adaptIssue406Source, attackGaitState } from '../issue-406-adapter.mjs';
import { realCharacter } from './real-character-fixture.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const CHARACTER_REL = 'src/game/character.js';
const readUpstream = rel => fs.readFileSync(path.join(SRC, rel), 'utf8');

// ---------------------------------------------------------------- selector
test('attack gait resolves four distinguishable states while firing', () => {
  const base = { moving: true, kid: true, firing: true, speedScale: 1 };
  const states = {
    forward: attackGaitState({ ...base, mx: 0, mz: 1 }),
    backward: attackGaitState({ ...base, mx: 0, mz: -1 }),
    left: attackGaitState({ ...base, mx: 1, mz: 0 }),
    right: attackGaitState({ ...base, mx: -1, mz: 0 }),
  };
  for (const [name, st] of Object.entries(states)) {
    assert.ok(st, `${name} state resolves`);
    assert.equal(st.id, name);
    const total = st.forward + st.backward + st.left + st.right;
    assert.ok(Math.abs(total - 1) < 1e-12, `${name} weights form a partition`);
    assert.ok([st.forward, st.backward, st.left, st.right].every(w => w >= 0), 'weights non-negative');
  }
  // Pelvis stays on the aim line forward/backpedal, turns toward travel on strafes.
  assert.ok(Math.abs(states.forward.twist) < 1e-12 && Math.abs(states.backward.twist) < 1e-12);
  assert.ok(states.left.twist > 0.5 && states.right.twist < -0.5);
  assert.notEqual(states.left.twist, states.right.twist);
  assert.notEqual(states.forward.id, states.backward.id);
  // Canonical strafe twist is the native formula's own clamp, not a new number.
  assert.ok(Math.abs(states.left.twist - 0.8) < 1e-9);
});

test('attack gait is presentation-mode isolated (gates return null)', () => {
  const base = { moving: true, kid: true, firing: true, mx: 1, mz: 0, speedScale: 1 };
  assert.equal(attackGaitState({ ...base, moving: false }), null, 'standing still stays on the native path');
  assert.equal(attackGaitState({ ...base, kid: false }), null, 'squid/other forms stay on the native path');
  assert.equal(attackGaitState({ ...base, firing: false }), null, 'not firing stays on the native path');
  assert.equal(attackGaitState({ ...base, firing: false, charge: 1 }), null, 'charge is folded into the firing gate by the injection site; the selector only sees the combined flag');
  assert.equal(attackGaitState({ ...base, mx: 0, mz: 0 }), null, 'zero travel velocity has no direction');
  assert.equal(attackGaitState(undefined), null);
  // Raw velocity magnitude is normalized away: any speed classifies identically.
  const fast = attackGaitState({ ...base, mx: 4.2, mz: 0 });
  assert.equal(fast.id, 'left');
  assert.equal(fast.twist, attackGaitState(base).twist);
});

test('attack gait blends across direction boundaries instead of snapping', () => {
  const part = mz => {
    const mx = Math.sqrt(Math.max(0, 1 - mz * mz));
    return attackGaitState({ moving: true, kid: true, firing: true, mx, mz, speedScale: 1 });
  };
  let prev = null;
  for (let i = 0; i <= 100; i++) {
    const st = part(1 - i / 100); // forward -> left quarter circle
    assert.ok(st, 'state present along the sweep');
    if (prev) assert.ok(Math.abs(st.twist - prev.twist) < 0.1, `twist stays continuous (${prev.twist} -> ${st.twist})`);
    prev = st;
  }
  assert.equal(part(1).id, 'forward');
  assert.equal(part(0).id, 'left');
  const diag = part(Math.SQRT1_2);
  assert.ok(Math.abs(diag.forward - diag.left) < 1e-9, 'diagonal holds both lobes equally');
  const slow = attackGaitState({ moving: true, kid: true, firing: true, mx: 1, mz: 0, speedScale: 0 });
  assert.equal(slow.id, 'left', 'state identity does not depend on speed');
  assert.equal(slow.twist, 0, 'slow-motion twist scaling keeps the native speed factor');
});

// ------------------------------------------------- source transform / scope
test('character build transform injects the state and nothing else', () => {
  const shared = adaptSource(CHARACTER_REL, readUpstream(CHARACTER_REL)); // recommended chain: shared first
  const patched = adaptIssue406Source(CHARACTER_REL, shared);
  // Negative main control: main (shared-only) has no attack gait anywhere.
  assert.equal(shared.includes('attackGaitState'), false, 'main source carries no #406 state');
  assert.equal(patched.includes('attackGaitState('), true);
  assert.equal(patched.split("import { attackGaitState } from '../../patches/splatoon3/issue-406-adapter.mjs';").length, 2, 'exactly one import');
  // Exactly one changed region: removing the four injected lines from the
  // patched body must reproduce the shared build source byte-for-byte.
  const a = shared;
  const b = patched.slice(patched.indexOf('\n') + 1);
  const added = l => l.includes('// issue-406:') || l.includes('const ag = attackGaitState(')
    || l.includes('this.attackGait = ag;') || l.includes('if (ag) tw = ag.twist;');
  const bLines = b.split('\n');
  assert.equal(bLines.filter(added).length, 4, 'exactly the four injected lines');
  const rebuilt = bLines.filter(l => !added(l)).join('\n');
  assert.equal(rebuilt, a, 'outside the four injected lines the build source is untouched');
  const regionA = a.split('\n').filter(l => l.includes('this.hipTwist = damp(this.hipTwist, tw, 7, dt);'));
  assert.equal(regionA.length, 1, 'the native hip-twist statement survives verbatim, exactly once');
  assert.ok(b.includes('this.attackGait = ag;'), 'state recorded on the character');
  assert.ok(b.includes('if (ag) tw = ag.twist;'), 'native tw overridden only while active');
  // Authoritative paths are out of scope: every other rel passes through byte-identical.
  const rels = ['src/game/actor.js', 'src/game/weapons.js', 'src/game/player.js', 'patches/splatoon3/runtime/walk.mjs', 'patches/splatoon3/profile.json', 'index.html'];
  for (const rel of rels) assert.equal(adaptIssue406Source(rel, 'SENTINEL'), 'SENTINEL', `${rel} untouched`);
  // Missing/duplicated anchor and double install are hard errors, not silent no-ops.
  assert.throws(() => adaptIssue406Source(CHARACTER_REL, shared.replace('    this.hipTwist = damp(this.hipTwist, tw, 7, dt);', '')), /patch conflict/);
  assert.throws(() => adaptIssue406Source(CHARACTER_REL, patched), /already applied/);
});


// ------------------------------------------------------ native rig (skinned)
// Real Character + active S3 walk layer, loaded through the actual adapter
// chain in a vm — same native path the build ships.
let patchedRigPromise;
function loadRig(withIssue406) {
  if (!withIssue406) return realCharacter();
  return (patchedRigPromise ??= (async () => {
    const src = path.join(ROOT, 'inkwave-public');
    const context = vm.createContext({ console, performance });
    const modules = new Map();
    const load = requested => {
      const file = requested.startsWith(path.join(src, 'patches') + path.sep)
        ? path.join(ROOT, path.relative(src, requested)) : requested;
      if (modules.has(file)) return modules.get(file);
      const rel = path.relative(src, file);
      let text = fs.readFileSync(file, 'utf8');
      text = adaptSource(rel, text);
      text = adaptIssue406Source(rel, text);
      const m = new vm.SourceTextModule(text, { context, identifier: file });
      modules.set(file, m);
      return m;
    };
    const entry = new vm.SourceTextModule(`
      export * from ${JSON.stringify(path.join(src, 'src/game/character.js'))};
      export * as THREE from 'three';
      export { installWalkMotion, walkLean } from ${JSON.stringify(path.join(ROOT, 'patches/splatoon3/runtime/walk.mjs'))};
      export { installRollerMotion } from ${JSON.stringify(path.join(ROOT, 'patches/splatoon3/runtime/roller.mjs'))};
    `, { context, identifier: path.join(ROOT, 'issue-406-entry.mjs') });
    await entry.link((spec, from) => load(
      spec === 'three' ? path.join(src, 'vendor/three/build/three.module.js')
        : spec.startsWith('three/addons/') ? path.join(src, 'vendor/three/jsm', spec.slice('three/addons/'.length))
          : path.resolve(path.dirname(from.identifier), spec)));
    await entry.evaluate();
    const api = { ...entry.namespace };
    api.profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
    api.installWalkMotion(api, api.profile);
    api.installRollerMotion(api, api.profile);
    return api;
  })());
}

const DIRS = [
  ['forward', { x: 0, z: 1 }],
  ['backward', { x: 0, z: -1 }],
  ['left', { x: 1, z: 0 }],
  ['right', { x: -1, z: 0 }],
];

async function drive(api, dir, firing, form = 'kid') {
  const ch = new api.Character({ name: 'issue-406 rig', weapon: 'shooter', style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  ch.onEvent = null;
  const state = { form, grounded: true, speed: 0, localMove: { x: 0, z: 0 }, firing, charge: 0, ink: 1, hp: 1, vy: 0 };
  for (let i = 0; i < 120; i++) ch.update(1 / 60, state);
  const rows = [];
  const v = 4.2;
  for (let i = 0; i < 150; i++) {
    ch.root.position.x += dir.x * v / 60;
    ch.root.position.z += dir.z * v / 60;
    state.speed = v;
    state.localMove = { x: -dir.x, z: dir.z };
    ch.update(1 / 60, state);
    if (i >= 90) rows.push({ id: ch.attackGait && ch.attackGait.id, twist: ch.hipTwist, moving: ch.moving });
  }
  return rows;
}


test('native rig: aim-fixed firing resolves four distinguishable lower-body states', async () => {
  const api = await loadRig(true);
  const seen = [];
  for (const [name, dir] of DIRS) {
    const rows = await drive(api, dir, true);
    assert.ok(rows.every(r => r.moving), `${name}: character is actually walking`);
    const ids = new Set(rows.map(r => r.id));
    assert.equal(ids.size, 1, `${name}: state settles (${[...ids]})`);
    const id = [...ids][0];
    const mean = rows.reduce((s, r) => s + r.twist, 0) / rows.length;
    if (name === 'left') assert.ok(mean > 0.3, `left strafe turns the pelvis toward travel (${mean})`);
    else if (name === 'right') assert.ok(mean < -0.3, `right strafe turns the pelvis toward travel (${mean})`);
    else assert.ok(Math.abs(mean) < 0.1, `${name} keeps the pelvis on the aim line (${mean})`);
    seen.push(id);
  }
  assert.deepEqual(seen, ['forward', 'backward', 'left', 'right'], 'four distinguishable states');
});

test('native rig negative control: inactive state is bit-identical to main', async () => {
  const mainApi = await realCharacter();
  const patchedApi = await loadRig(true);
  for (const [name, dir] of DIRS) {
    const baseline = await drive(mainApi, dir, false);
    const patched = await drive(patchedApi, dir, false);
    assert.equal(baseline.length, patched.length);
    for (let i = 0; i < baseline.length; i++) {
      assert.ok(!baseline[i].id, `main carries no attack gait (${name}[${i}])`);
      assert.ok(!patched[i].id, `patched stays inert while not firing (${name}[${i}])`);
      assert.ok(Math.abs(baseline[i].twist - patched[i].twist) < 1e-12,
        `hipTwist identical to main while inactive (${name}[${i}]: ${baseline[i].twist} vs ${patched[i].twist})`);
    }
  }
});

test('native rig mode isolation: no attack gait outside kid-form firing', async () => {
  const api = await loadRig(true);
  const squid = await drive(api, { x: 1, z: 0 }, true, 'squid');
  assert.ok(squid.every(r => !r.id), 'squid form never selects the attack gait');
  const idle = await drive(api, { x: 1, z: 0 }, false);
  assert.ok(idle.every(r => !r.id), 'kid form without firing stays on the native path');
});

