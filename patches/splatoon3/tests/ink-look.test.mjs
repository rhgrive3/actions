// Airborne ink silhouette (render only): the per-kind spike/flatten/tail/width
// look reaches the real instanced renderer, Slosher sheets drop the detached
// beads, and the shader consumes the attribute. Logic check of the composed
// renderer; the look itself is a calibration against public S3 footage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../network-replication/tests/robustness-fixture.mjs';
import { fixture as sourceFixture } from './source-fixture.mjs';
import { INK_LOOK, SHOT_TAIL_FRAMES_DEFAULT, fidelityInkTail } from '../runtime/weapons-fidelity.mjs';

function round(f, type, extra = {}) {
  const p = f.projectiles._new();
  const owner = { color: new f.THREE.Color(1, 0, 1), team: 0 };
  Object.assign(p, { type, owner, team: 0, age: 0.2, life: 2, delay: 0, vis: 0.2, size: 0.2, tail0: 1, tailK: 0, wob: 0, nose: 0, sats: 2, seed: 0.25 }, extra);
  p.pos.set(0, 1, 10); p.start.set(0, 1, 0); p.vel.set(0, 0, 30);
  return p;
}

test('each projectile kind writes its own look; the slosher sheet is narrower and bead-free', async () => {
  const f = await fixture();
  const P = f.projectiles;
  P.list = [round(f, 'shot'), round(f, 'drop'), round(f, 'slosh'), round(f, 'blast')];
  P._draw();
  const look = P.blobInkLook.array, shp = P.blobShape.array;
  assert.equal(P.blobs.geometry.getAttribute('aInkLook'), P.blobInkLook);
  // shot: head + 2 beads; drop: head + 2; slosh: head only; blast: head + 2 (satellites when the head is clear of the start)
  const heads = [0, 3, 6, 7];
  ['shot', 'drop', 'slosh', 'blast'].forEach((kind, k) => {
    const i = heads[k], L = INK_LOOK[kind];
    assert.deepEqual([look[i * 4], look[i * 4 + 1], look[i * 4 + 2]].map(v => +v.toFixed(4)), L.slice(0, 3).map(v => +v.toFixed(4)), kind);
    const want = kind === 'shot' ? 30 * SHOT_TAIL_FRAMES_DEFAULT / 60 / (0.2 * L[4]) : Math.max(1, 1 + (1 * L[3] - 1) / L[4]);
    assert.ok(Math.abs(shp[i * 4] - want) < 1e-6, kind + ' tail: ' + shp[i * 4] + ' != ' + want);
  });
  assert.equal(P.blobs.count, 10, 'the slosher sheet has no trailing beads');
  const m = new f.THREE.Matrix4(), s = new f.THREE.Vector3();
  P.blobs.getMatrixAt(6, m); m.decompose(new f.THREE.Vector3(), new f.THREE.Quaternion(), s);
  assert.ok(Math.abs(s.x - 0.2 * INK_LOOK.slosh[4]) < 1e-6, 'slosher drawn half-width = DrawSize radius x 0.5');
  assert.deepEqual([look[4], look[5], look[6]], INK_LOOK.satellite.slice(0, 3), 'beads take the bead look');
});

test('the blob shader consumes aInkLook (spikes + vertical-thin cross-section)', async () => {
  const f = await fixture();
  const shader = {
    vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>',
    fragmentShader: '#include <clipping_planes_fragment>\n#include <emissivemap_fragment>',
  };
  f.projectiles.blobs.material.onBeforeCompile(shader);
  assert.match(shader.vertexShader, /attribute vec4 aInkLook;/);
  assert.match(shader.vertexShader, /transpose\(mat3\(instanceMatrix\)\)/);
  assert.match(shader.vertexShader, /aInkLook\.z - 1\.0/);
  assert.equal(f.projectiles.blobs.material.customProgramCacheKey(), 'iw-blob-5-ink-look');
});

test('a Shooter round rod is its tail: MaxLengthFrame frames of travel behind the head, never behind the muzzle', async () => {
  const f = await fixture();
  const look = INK_LOOK.shot, r = 0.1 * look[4];
  assert.ok(look[1] < 0, 'shot uses the rod body');
  const p = round(f, 'shot', { vis: 0.1, wid: 'shooter' });
  p.vel.set(0, 0, 136);
  p.pos.set(0, 1, 2.2); // first frame: still joined to the launch point
  assert.ok(Math.abs(fidelityInkTail(p, 1, r, look) * r - 2.2) < 1e-9);
  p.pos.set(0, 1, 9);   // past two frames of travel: a detached rod of that length
  assert.ok(Math.abs(fidelityInkTail(p, 1, r, look) * r - 136 * 2 / 60) < 1e-9);
  p.vel.set(0, -10, 60); // braking/falling: the rod shortens with the speed
  assert.ok(Math.abs(fidelityInkTail(p, 1, r, look) * r - Math.hypot(10, 60) * 2 / 60) < 1e-9);
  // Production composition: the installed runtime reads the pinned Splatling MaxLengthFrame 3.
  const g = await sourceFixture({ productionComposition: true, realProjectiles: true, fullRuntime: true,
    extraExports: "export * from './patches/splatoon3/runtime/weapons-fidelity.mjs';" });
  assert.equal(g.profile.weaponsFidelityCompletion.weapons.splatling.spl__BulletShooterTailLengthParam.MaxLengthFrame, 3);
  const s = { type: 'shot', wid: 'splatling', start: new g.THREE.Vector3(0, 1, 0), pos: new g.THREE.Vector3(0, 1, 20), vel: new g.THREE.Vector3(0, 0, 120) };
  assert.ok(Math.abs(g.fidelityInkTail(s, 1, r, look) * r - 120 * 3 / 60) < 1e-9, 'Splatling uses the sourced MaxLengthFrame 3');
  s.wid = 'shooter';
  assert.ok(Math.abs(g.fidelityInkTail(s, 1, r, look) * r - 120 * 2 / 60) < 1e-9, 'Shooter falls back to the measured 2 frames');
  assert.equal(fidelityInkTail({ type: 'drop' }, 3, r, INK_LOOK.drop), 3 * INK_LOOK.drop[3]);
  assert.ok(Math.abs(fidelityInkTail({ type: 'slosh' }, 3, r, INK_LOOK.slosh) - (1 + 2 / INK_LOOK.slosh[4])) < 1e-12, 'slosh keeps the sourced length beyond the narrower head');
});
