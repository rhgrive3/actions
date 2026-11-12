import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { EffectLayer } from "../src/game/effects";

function layer() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1.6, 0.1, 100);
  camera.position.set(0, 20, 30);
  camera.lookAt(0, 0, 0);
  const fx = new EffectLayer(scene, camera);
  return { scene, fx };
}
function instances(scene: THREE.Scene) {
  return scene.children.filter((o): o is THREE.InstancedMesh => o instanceof THREE.InstancedMesh);
}
function alive(scene: THREE.Scene) {
  return instances(scene).reduce((n, m) => n + m.count, 0);
}

test("a hit burst is directional, layered and not a uniform radial puff", () => {
  const { scene, fx } = layer();
  fx.impact(0, 1.2, 0, 1, 0, 1, 0xffd08a);
  fx.update(0.016);
  const pools = instances(scene);
  assert.ok(pools.length >= 5, "impact touches flash, spark, debris, smoke and blood pools");
  assert.ok(alive(scene) >= 25, `impact produces a layered burst (got ${alive(scene)} particles)`);
  // Spark directions must cluster along the impact normal, not radiate evenly.
  const streaks = pools.find(m => m.count >= 5 && (m.material as THREE.MeshBasicMaterial).blending === THREE.AdditiveBlending && m.count < 60)!;
  assert.ok(streaks.count >= 8, "the directional spark cone has real density");
  const matrix = new THREE.Matrix4();
  let ahead = 0, behind = 0;
  for (let i = 0; i < streaks.count; i++) {
    streaks.getMatrixAt(i, matrix);
    const m = matrix.elements;
    const vx = m[4], vz = m[6]; // instance basis Y = streak direction
    if (Math.abs(vx) > Math.abs(vz)) { if (vx > 0) ahead++; else behind++; }
  }
  assert.ok(ahead > behind, `sparks spray along the blow direction (forward ${ahead}, back ${behind})`);
  fx.dispose();
  assert.equal(scene.children.length, 0, "all pools disposed");
});

test("explosion layers flash, fireball, shock ring, smoke, embers and a scorch mark", () => {
  const { scene, fx } = layer();
  fx.explosion(0, 0.8, 0, 1.5);
  fx.update(0.016);
  assert.ok(alive(scene) >= 30, `a big blast is dense (got ${alive(scene)} particles)`);
  const rings = instances(scene).filter(m => m.geometry.type === "RingGeometry");
  assert.ok(rings.some(m => m.count > 0), "a shock ring expands on the ground");
  const flats = instances(scene).filter(m => (m.geometry as THREE.PlaneGeometry).type === "PlaneGeometry" && m.count > 0);
  assert.ok(flats.length >= 2, "smoke and scorch layers are both present");
  fx.update(3);
  const durable = instances(scene).filter(m => m.count > 0 && (m.material as THREE.MeshBasicMaterial).map !== null).length;
  assert.equal(alive(scene) - durable, 0, "blast particles decay away");
  assert.ok(durable > 0, "only the scorch mark remains on the ground");
  fx.dispose();
});

test("lightning forks into multiple jagged branches instead of one straight line", () => {
  const { scene, fx } = layer();
  fx.lightning(0, 12, 0, 6, 1.4, 0, 0xdfeeff);
  const lines = scene.children.filter(o => o instanceof THREE.Line && !(o as THREE.Line).userData.isBoltHost);
  assert.equal(lines.length, 3, "a strike forks into three branches");
  const pts = (lines[0] as THREE.Line).geometry.getAttribute("position").count;
  assert.ok(pts >= 5, `each branch is jagged (got ${pts} points)`);
  fx.update(0.05);
  const mat = (lines[0] as THREE.Line).material as THREE.LineBasicMaterial;
  assert.ok(mat.opacity < 1 && mat.opacity > 0, "lightning branches fade smoothly before expiring");
  fx.update(0.4);
  assert.equal(scene.children.filter(o => o instanceof THREE.Line && !(o as THREE.Line).userData.isBoltHost).length, 0, "forks fade away");
  fx.dispose();
});

test("blood sprays droplets and leaves a ground stain; debris bounces", () => {
  const { scene, fx } = layer();
  fx.blood(0, 1, 0, 1, 0, 12);
  fx.chip(0, 1, 0, 1, 0, 5, 0xc9b89a);
  fx.update(0.016);
  assert.ok(alive(scene) >= 15);
  const stains = instances(scene).find(m => m.count > 0 && (m.material as THREE.MeshBasicMaterial).map !== null);
  assert.ok(stains && stains.count > 0, "a blood stain is left on the ground");
  const solid = instances(scene).find(m => (m.material as THREE.MeshStandardMaterial).isMeshStandardMaterial);
  assert.ok(solid && solid.count >= 5, "solid chips tumble");
  fx.dispose();
});

test("effect pools recycle and hold a flat draw-call budget", () => {
  const { scene, fx } = layer();
  for (let i = 0; i < 60; i++) fx.impact(i * 0.2, 1, 0, 1, 0, 1, 0xffd08a);
  fx.update(0.016);
  const drawCalls = instances(scene).filter(m => m.count > 0).length;
  assert.ok(drawCalls <= 8, `effects stay instanced and cheap (got ${drawCalls} draw calls)`);
  assert.ok(alive(scene) > 0);
  fx.clear();
  assert.equal(alive(scene), 0);
  fx.dispose();
});

test("shield block, magic impact and weapon trail ribbons differentiate cleanly with bounded buffers", () => {
  const { scene, fx } = layer();
  fx.impact(0, 1.3, 0, 1, 0, 0.6, 0xffffff); // guard block even at lower power emits a guard shock ring
  fx.update(0.016);
  const rings = instances(scene).find(m => m.geometry.type === "RingGeometry")!;
  assert.equal(rings.count, 1, "shield block emits a guard shock ring even at power <= 0.7");
  assert.equal(rings.instanceMatrix.updateRanges[0]?.count, 16, "only active instances are uploaded to GPU");

  fx.clear();
  fx.impact(0, 1.3, 0, 1, 0, 1.1, 0xd0a0ff); // magic impact spawns arcane embers
  fx.update(0.016);
  const additiveBoxes = instances(scene).filter(
    m => m.geometry.type === "BoxGeometry" && (m.material as THREE.MeshBasicMaterial).blending === THREE.AdditiveBlending && m.count > 0,
  );
  assert.equal(additiveBoxes.length, 2, "magic impact activates both sparks and arcane embers");

  for (let i = 0; i < 14; i++) {
    fx.trail("u1", i * 0.15, 1.2, 0, 0xfff0c8);
  }
  fx.update(0.016);
  const trailMesh = instances(scene)[instances(scene).length - 1];
  assert.ok(trailMesh.count > 0 && trailMesh.count <= 7, `weapon trail caps ribbon segments at <= 7 (got ${trailMesh.count})`);
  fx.endTrail("u1");
  fx.update(0.016);
  assert.equal(trailMesh.count, 0, "ended weapon trail clears on next update");
  fx.dispose();
});
