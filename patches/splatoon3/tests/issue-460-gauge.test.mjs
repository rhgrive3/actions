// Issue #460 actual-render acceptance: a real gauge (geometry + progress
// shader + label) must appear at the committed Super Jump destination,
// drain with flight progress, and clear on arrival/cancel/splat/respawn.
// The negative baseline proves stored marker data / legacy ring options can
// never satisfy the same detector (the data-only regression is caught here).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, ROOT), 'utf8');
const THREE = await import(new URL('../../../inkwave-public/vendor/three/build/three.module.js', import.meta.url));
const { ownerJumpProgress, jumpMarkerSnapshot } = await import('../issue-460-marker.mjs');
const { renderJumpGauge460, clearJumpGauge460, findArrivalGauge, createArrivalGauge, ARRIVAL_GAUGE_NAME } =
  await import('../issue-460-gauge.mjs');

const flightAt = (t, dur, jumper) =>
  jumpMarkerSnapshot({ progress: ownerJumpProgress({ phase: 'flight', t, dur }), dur, jumper });

test('visible arrival gauge: real geometry at the committed destination drains with flight progress', () => {
  const scene = new THREE.Scene();
  const G = { scene };
  const owner = { name: 'Ninja' };
  const dest = new THREE.Vector3(3, 0.5, -2);
  const dur = 2.3;
  const seen = [];
  for (const frac of [0.25, 0.5, 0.75]) {
    const gauge = renderJumpGauge460(G, owner, flightAt(frac * dur, dur, owner.name), dest, 0xff8a14, THREE);
    assert.ok(gauge, 'render arms a gauge');
    const found = findArrivalGauge(scene);
    assert.ok(found, `gauge must be discoverable at ${frac * 100}%`);
    assert.equal(found.name, ARRIVAL_GAUGE_NAME);
    assert.ok(found.position.distanceTo(new THREE.Vector3(3, 0.55, -2)) < 1e-6,
      'planted on the committed landing point (native ring lift +0.05)');
    const arc = found.children.find((c) => c.userData && c.userData.issue460Arc);
    assert.ok(arc, 'progress arc exists');
    const pos = arc.geometry.getAttribute('position');
    assert.ok(pos && pos.count >= 128, 'real RingGeometry with vertices (not a data record)');
    assert.equal(arc.material.type, 'ShaderMaterial');
    assert.match(arc.material.fragmentShader, /uProgress/);
    assert.match(arc.material.fragmentShader, /discard/, 'pixels are gated by the countdown uniform');
    seen.push(arc.material.uniforms.uProgress.value);
    assert.equal(gauge.labelText, `Ninja · ${(dur * (1 - frac)).toFixed(1)}s`);
    assert.ok(found.children.some((c) => c.userData && c.userData.issue460Track), 'ground track ring present');
  }
  assert.ok(seen[0] > seen[1] && seen[1] > seen[2], 'countdown drains monotonically with progress');
  assert.ok(Math.abs(seen[0] - 0.75) < 1e-9 && Math.abs(seen[1] - 0.5) < 1e-9 && Math.abs(seen[2] - 0.25) < 1e-9);
});

test('negative baseline: stored marker data / legacy ring options fail the acceptance detector', () => {
  // what commit 7c67325 shipped: the snapshot stored, nothing rendered
  const scene = new THREE.Scene();
  const owner = { name: 'Ninja', s3: {} };
  owner.s3.jumpMarker460 = flightAt(1.15, 2.3, 'Ninja');
  assert.equal(findArrivalGauge(scene), null, 'data-only marker must not pass acceptance');
  // the legacy native pulse-ring quad fx.ring actually draws: unnamed, no uniform
  scene.add(new THREE.Mesh(new THREE.RingGeometry(1, 1.6, 32), new THREE.MeshBasicMaterial()));
  assert.equal(findArrivalGauge(scene), null, 'legacy pulse mesh must not pass acceptance');
  // native fx.ring silently ignores the `marker` option the data-only pass passed
  const fxSrc = read('inkwave-public/src/fx/fx.js');
  assert.ok(!/opts\.marker/.test(fxSrc), 'native fx.ring never reads opts.marker');
  assert.match(fxSrc, /opts\.radius \?\? 1\.5/);
  // native jumpMarker reticle forwards t, but its shader style never reads it
  const target = (fxSrc.match(/\/\/ super-jump target:[\s\S]*?(?=\} else if \(st < 5\.5\))/) || [''])[0];
  assert.ok(target.length > 1, 'native reticle style extracted');
  assert.ok(!/vT/.test(target), 'native reticle has no progress-driven pixels');
});

test('lifecycle: arrival/cancel/splat/respawn detach the gauge; a fresh flight re-arms it', () => {
  const scene = new THREE.Scene();
  const G = { scene };
  const owner = { name: 'A' };
  const dest = new THREE.Vector3(0, 0, 0);
  const snap = flightAt(0.4, 2.0, 'A');
  // no scene yet: defensive no-op, never throws
  assert.equal(renderJumpGauge460({}, { name: 'X' }, snap, dest, 0xffffff, THREE), null);
  assert.ok(renderJumpGauge460(G, owner, snap, dest, 0xffffff, THREE));
  assert.ok(findArrivalGauge(scene), 'gauge visible mid-flight');
  // the adapter's land / cancel / splat / reset anchors all funnel here
  assert.equal(clearJumpGauge460(owner), true, 'first clear detaches');
  assert.equal(findArrivalGauge(scene), null, 'nothing visible after arrival/clear');
  assert.equal(clearJumpGauge460(owner), false, 'idempotent: no stale handles');
  // defensive: a null snapshot render is itself a clear
  assert.ok(renderJumpGauge460(G, owner, snap, dest, 0xffffff, THREE));
  assert.equal(renderJumpGauge460(G, owner, null, dest, 0xffffff, THREE), null);
  assert.equal(findArrivalGauge(scene), null);
  // respawn → next flight re-arms the same bounded gauge (no leak across jumps)
  assert.ok(renderJumpGauge460(G, owner, snap, dest, 0xffffff, THREE));
  assert.ok(findArrivalGauge(scene));
});

test('stealth: concealed snapshots expose no destination, arc, or name but keep the handle', () => {
  const scene = new THREE.Scene();
  const G = { scene };
  const owner = { name: 'Stealth' };
  const dest = new THREE.Vector3(5, 1, 5);
  const visible = renderJumpGauge460(G, owner, flightAt(1, 2, 'Stealth'), dest, 0xffffff, THREE);
  assert.ok(visible && findArrivalGauge(scene));
  const hidden = jumpMarkerSnapshot({ progress: 0.5, dur: 2.3, jumper: 'Stealth', concealed: true });
  const gauge = renderJumpGauge460(G, owner, hidden, dest, 0xffffff, THREE);
  assert.equal(gauge, visible, 'handle reused, not reallocated');
  assert.equal(findArrivalGauge(scene), null, 'concealed destination never leaks');
  assert.equal(gauge.labelText, '', 'no name leak');
  assert.equal(gauge.arc.material.uniforms.uProgress.value, 0, 'no countdown arc leak');
  // unconcealed snapshot re-arms for the owning view
  renderJumpGauge460(G, owner, flightAt(1, 2, 'Stealth'), dest, 0xffffff, THREE);
  assert.ok(findArrivalGauge(scene));
  assert.ok(gauge.labelText.startsWith('Stealth · '));
});

test('label: name + countdown seconds are drawn to the canvas texture and wiped on clear', () => {
  const ops = [];
  const ctx = {
    clearRect: (...a) => ops.push(['clearRect', ...a]),
    fillRect: (...a) => ops.push(['fillRect', ...a]),
    fillText: (t) => ops.push(['fillText', t]),
    font: '', fillStyle: '', textAlign: '', textBaseline: '',
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const doc = { createElement: (tag) => { assert.equal(tag, 'canvas'); return canvas; } };
  const gauge = createArrivalGauge({ THREE, doc });
  assert.ok(gauge.label && gauge.label.userData.issue460Label, 'label sprite exists');
  assert.ok(gauge.texture, 'canvas texture feeds the sprite (GPU label)');
  assert.equal(canvas.width, 256);
  gauge.update(jumpMarkerSnapshot({ progress: 0.25, dur: 2.3, jumper: 'Ninja' }), 0xff8a14);
  assert.equal(gauge.labelText, 'Ninja · 1.7s');
  assert.ok(ops.some((o) => o[0] === 'fillText' && o[1] === 'Ninja · 1.7s'), 'name + countdown actually drawn');
  gauge.clear();
  assert.equal(gauge.labelText, '');
  const kinds = ops.map((o) => o[0]);
  assert.ok(kinds.lastIndexOf('fillText') < kinds.lastIndexOf('clearRect'), 'clear wipes the label surface');
  assert.ok(!ops.some((o) => o[0] === 'fillText' && o[1] === ''), 'nothing drawn while cleared');
});



test('native character disposal releases every arrival GPU resource once, even during flight', () => {
  const scene=new THREE.Scene();let characterDisposals=0;
  const owner={character:{dispose(){characterDisposals++;}}};
  const gauge=renderJumpGauge460({scene},owner,flightAt(.4,2,'A'),new THREE.Vector3(),0xffffff,THREE);
  const resources=[gauge.track.geometry,gauge.track.material,gauge.arc.material,...(gauge.texture?[gauge.texture]:[]),...(gauge.label?[gauge.label.material]:[])];
  const counts=resources.map(()=>0);resources.forEach((r,i)=>r.addEventListener('dispose',()=>counts[i]++));
  owner.character.dispose();owner.character.dispose();
  assert.equal(characterDisposals,2,'native disposal still runs');
  assert.equal(scene.children.length,0,'no abandoned world gauge');
  assert.deepEqual(counts,resources.map(()=>1),'every owned GPU resource disposed exactly once');
  assert.equal(clearJumpGauge460(owner),false,'no cached disposed gauge');
  const next=renderJumpGauge460({scene},owner,flightAt(.2,2,'A'),new THREE.Vector3(),0xffffff,THREE);
  assert.notEqual(next,gauge,'new flight never reuses disposed resources');
  clearJumpGauge460(owner);
});
