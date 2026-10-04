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
  // The normalized presentation direction the injected block feeds to md.
  assert.deepEqual([states.forward.dx, states.forward.dz], [0, 1]);
  assert.deepEqual([states.backward.dx, states.backward.dz], [0, -1]);
  assert.ok(Math.abs(states.left.dx - 1) < 1e-12 && Math.abs(states.left.dz) < 1e-12);
  assert.ok(Math.abs(states.right.dx + 1) < 1e-12 && Math.abs(states.right.dz) < 1e-12);
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
  // Exactly one changed region: removing the injected block from the patched
  // body must reproduce the shared build source byte-for-byte.
  const START = '    // issue-406: attack-locomotion presentation direction (presentation only).';
  const END = '    } else this.attackDir = null;';
  const b = patched.slice(patched.indexOf('\n') + 1);
  assert.equal(b.split(START).length, 2, 'exactly one injected block');
  const start = b.indexOf(START), end = b.indexOf(END);
  assert.ok(start >= 0 && end > start, 'injection block markers present in order');
  const rebuilt = b.slice(0, start) + b.slice(end + END.length + 1);
  assert.equal(rebuilt, shared, 'outside the injected block the build source is untouched');
  // The native statements around the block — including the hip-twist target —
  // survive verbatim: the pelvis is still owned by the native formula.
  assert.equal(shared.split('this.hipTwist = damp(this.hipTwist, tw, 7, dt);').length, 2, 'the native hip-twist statement survives verbatim, exactly once');
  assert.equal(patched.split('this.hipTwist = damp(this.hipTwist, tw, 7, dt);').length, 2, 'the correction does not touch the hip-twist statement');
  assert.equal(patched.includes('if (ag) tw = ag.twist;'), false, 'no twist override: the native formula runs on the fed direction');
  assert.equal(patched.split('this.mdx = this.attackDir.x; this.mdz = this.attackDir.z;').length, 2, 'presentation direction is fed to md exactly once');
  assert.ok(b.includes('this.attackGait = ag;'), 'state recorded on the character');
  // Authoritative paths are out of scope: every other rel passes through byte-identical.
  const rels = ['src/game/actor.js', 'src/game/weapons.js', 'src/game/player.js', 'patches/splatoon3/runtime/walk.mjs', 'patches/splatoon3/profile.json', 'index.html'];
  for (const rel of rels) assert.equal(adaptIssue406Source(rel, 'SENTINEL'), 'SENTINEL', `${rel} untouched`);
  // Missing/duplicated anchor and double install are hard errors, not silent no-ops.
  assert.throws(() => adaptIssue406Source(CHARACTER_REL, shared.replace('      const ml = Math.hypot(this.mdx, this.mdz) || 1; this.mdx /= ml; this.mdz /= ml;', '')), /patch conflict/);
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

function metrics(api, ch) {
  ch.root.updateWorldMatrix(true, true);
  const T = api.THREE;
  const yawQ = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), ch.yaw);
  const invYaw = yawQ.clone().invert();
  const wq = n => ch.bones[n].getWorldQuaternion(new T.Quaternion());
  const unyaw = w => invYaw.clone().multiply(w);
  const eu = n => new T.Euler().setFromQuaternion(unyaw(wq(n)), 'YXZ');
  const wp = n => ch.bones[n].getWorldPosition(new T.Vector3());
  const knee = (up, lo, end) => {
    const a = wp(lo).sub(wp(up)), b = wp(end).sub(wp(lo));
    return Math.acos(Math.max(-1, Math.min(1, a.normalize().dot(b.normalize()))));
  };
  const rel = n => wp(n).sub(ch.root.position).applyQuaternion(invYaw);
  const fl = rel('footL'), fr = rel('footR');
  const h = eu('hips');
  return {
    hipsPitch: h.x, hipsYaw: h.y,
    footPitchL: eu('footL').x, footPitchR: eu('footR').x,
    kneeL: knee('thighL', 'shinL', 'footL'), kneeR: knee('thighR', 'shinR', 'footR'),
    footLx: fl.x, footLz: fl.z, footRx: fr.x, footRz: fr.z,
    mdx: ch.mdx, mdz: ch.mdz, hipTwist: ch.hipTwist, phase: ch.phase,
    moving: ch.moving, planted: ch.feet[0].planted && ch.feet[1].planted,
    id: (ch.attackGait && ch.attackGait.id) || null,
  };
}

async function drive(api, dir, firing, form = 'kid', sweep = false) {
  const ch = new api.Character({ name: 'issue-406 rig', weapon: 'shooter', style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  ch.onEvent = null;
  const state = { form, grounded: true, speed: 0, localMove: { x: 0, z: 0 }, firing, charge: 0, ink: 1, hp: 1, vy: 0 };
  for (let i = 0; i < 120; i++) ch.update(1 / 60, state);
  const rows = [];
  const v = 4.2;
  for (let i = 0; i < 150; i++) {
    const direction = sweep ? { x: Math.sin(i / 150 * Math.PI * 2), z: Math.cos(i / 150 * Math.PI * 2) } : dir;
    ch.root.position.x += direction.x * v / 60;
    ch.root.position.z += direction.z * v / 60;
    state.speed = v;
    state.localMove = { x: -direction.x, z: direction.z };
    ch.update(1 / 60, state);
    if (sweep || i >= 90) rows.push({ ...metrics(api, ch), twist: ch.hipTwist });
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
      for (const key of ['footPitchL','footPitchR','kneeL','kneeR','footLx','footLz','footRx','footRz','phase']) assert.equal(patched[i][key], baseline[i][key], `${name}: inactive ${key}`);
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



test('native backward counterexample changes actual knee and foot presentation, forward stays identical', async () => {
  const a = await realCharacter(), b = await loadRig(true);
  const backwardA = await drive(a, {x:0,z:-1}, true), backwardB = await drive(b, {x:0,z:-1}, true);
  assert.ok(backwardA.every(r => r.mdz > .99), 'main reproduces stuck forward direction during actual backward travel');
  assert.ok(backwardB.every(r => r.mdz < -.99), 'patched native backpedal receives backward direction');
  const mean = (rows,key) => rows.reduce((n,r)=>n+r[key],0)/rows.length;
  assert.ok(Math.abs(mean(backwardA,'kneeL')-mean(backwardB,'kneeL'))>.01, 'actual skinned knee changes, beyond labels');
  assert.ok(backwardA.some((r,i)=>Math.abs(r.footPitchL-backwardB[i].footPitchL)>.01), 'actual foot pitch changes');
  const fa=await drive(a,{x:0,z:1},true),fb=await drive(b,{x:0,z:1},true);
  for(let i=0;i<fa.length;i++) for(const key of ['kneeL','footPitchL','footLz','phase']) assert.equal(fb[i][key],fa[i][key],`forward ${key}`);
});

test('native diagonal sweep retains phase and continuous actual foot travel', async () => {
  const rows=await drive(await loadRig(true),{x:0,z:1},true,'kid',true);
  assert.equal(new Set(rows.map(r=>r.id).filter(Boolean)).size,4);
  for(let i=1;i<rows.length;i++) {
    if(rows[i].moving && rows[i-1].moving) assert.ok(rows[i].phase>rows[i-1].phase,'no phase restart');
    for(const side of ['L','R']) assert.ok(Math.hypot(rows[i][`foot${side}x`]-rows[i-1][`foot${side}x`],rows[i][`foot${side}z`]-rows[i-1][`foot${side}z`])<.3,'no foot teleport');
  }
});
