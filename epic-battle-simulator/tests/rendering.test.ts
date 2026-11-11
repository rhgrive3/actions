import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { UnitBatchRenderer } from "../src/game/unit-renderer";
import { buildUnitRig } from "../src/game/rigs";
import { DEFS, DEPLOY, GEO } from "../src/game/units";
import { buildStageEnv } from "../src/game/stages3d";
import { BattleSimulation, FIXED_STEP } from "../src/game/simulation";
import { STAGES } from "../src/game/campaign";
import { EffectLayer } from "../src/game/effects";
import { AudioFX, type SfxName } from "../src/game/audio";

const instanced = (scene: THREE.Scene) => scene.children.filter((o): o is THREE.InstancedMesh => o instanceof THREE.InstancedMesh);
const total = (scene: THREE.Scene) => instanced(scene).reduce((n, m) => n + m.count, 0);

test("every unit type bakes into a handful of bone parts with vertex colors", () => {
  for (const kind of DEPLOY) for (const team of [0, 1] as const) {
    const rig = buildUnitRig(kind, team);
    assert.ok(rig.parts.length >= 6 && rig.parts.length <= 26, `${kind}: ${rig.parts.length} parts`);
    for (const p of rig.parts) {
      assert.ok(p.geometry.getAttribute("color"), `${kind} part is vertex colored`);
      assert.ok(p.geometry.getAttribute("position").count > 0);
      let inTree = false;
      rig.root.traverse(o => { if (o === p.group) inTree = true; });
      assert.ok(inTree, `${kind} part belongs to the rig's own bones`);
    }
    assert.ok(rig.head && rig.torso && rig.hand && rig.lArm && rig.rArm && rig.lLeg && rig.rLeg, kind);
  }
});

test("every character has the same eye construction (basic-material head parts)", () => {
  for (const kind of DEPLOY) {
    const rig = buildUnitRig(kind, 0);
    const headParts = rig.parts.filter(p => p.group === rig.head);
    assert.ok(headParts.some(p => p.material instanceof THREE.MeshBasicMaterial), `${kind} head needs unlit eyes`);
    // eyes must sit on the +Z (front) side of the head: some basic geometry has vertices with z > 0.18
    const eyes = headParts.find(p => p.material instanceof THREE.MeshBasicMaterial)!;
    eyes.geometry.computeBoundingBox();
    assert.ok(eyes.geometry.boundingBox!.max.z > 0.18, `${kind} eyes face forward`);
  }
});

test("rigs of the same kind share baked geometry but not skeletons", () => {
  const a = buildUnitRig("orc", 0), b = buildUnitRig("orc", 0), other = buildUnitRig("orc", 1);
  assert.notEqual(a.root, b.root);
  assert.notEqual(a.rArm, b.rArm);
  assert.equal(a.parts[0].geometry, b.parts[0].geometry);
  assert.notEqual(a.parts[0].geometry, other.parts[0].geometry, "team colors are baked per team");
  a.rArm.rotation.x = 1.2;
  assert.ok(Math.abs(b.rArm.rotation.x) < 1e-9, "posing one unit must not move another");
});

test("baked rendering: one instance per bone part, matrices follow the animated skeleton", () => {
  const scene = new THREE.Scene();
  const renderer = new UnitBatchRenderer(scene);
  let expected = 0;
  const rigs: ReturnType<typeof buildUnitRig>[] = [];
  for (let i = 0; i < 70; i++) {
    const rig = buildUnitRig("spear", 0);
    rig.root.position.set(i % 10 * 2, 0, Math.floor(i / 10) * 2);
    rig.rArm.rotation.x = i * 0.02;
    expected += rig.parts.length;
    renderer.add(i, rig);
    rigs.push(rig);
  }
  renderer.sync();
  assert.equal(total(scene), expected);
  assert.ok(renderer.drawCalls <= rigs[0].parts.length, "70 identical units cost no more draw calls than one");
  assert.ok(instanced(scene).every(m => m.count <= m.instanceMatrix.count), "buffers grew to fit 70 units");

  const m = new THREE.Matrix4();
  const arm = rigs[5].parts.find(p => p.group === rigs[5].rArm)!;
  const batch = instanced(scene).find(x => x.geometry === arm.geometry)!;
  const seen = new Set<string>();
  for (let i = 0; i < batch.count; i++) { batch.getMatrixAt(i, m); seen.add(m.elements.map(n => n.toFixed(4)).join()); }
  rigs[5].root.updateMatrixWorld(true);
  assert.ok(seen.has(arm.group.matrixWorld.elements.map(n => n.toFixed(4)).join()), "instance matrix equals the bone's world matrix");

  renderer.remove(0);
  renderer.sync();
  assert.equal(total(scene), expected - rigs[0].parts.length);
  renderer.clear();
  renderer.sync();
  assert.ok(instanced(scene).every(x => x.count === 0 && !x.visible));
  renderer.dispose();
  assert.equal(scene.children.length, 0);
});

test("cavalry has four articulated legs and its head ahead of the tail (+Z is forward)", () => {
  const rig = buildUnitRig("knight", 0);
  assert.ok(rig.flLeg && rig.frLeg && rig.blLeg && rig.brLeg);
  assert.equal(rig.flLeg.position.z, 0.66);
  assert.equal(rig.blLeg.position.z, -0.6);
  const bodyPart = rig.parts.filter(p => p.group === rig.body);
  let max = -Infinity, min = Infinity;
  for (const p of bodyPart) { p.geometry.computeBoundingBox(); max = Math.max(max, p.geometry.boundingBox!.max.z); min = Math.min(min, p.geometry.boundingBox!.min.z); }
  assert.ok(max > 1.5 && min > -1.3 && max > Math.abs(min), "horse head extends further forward than the tail extends back");
});

test("all 4 stage environments build distinct sky/fog/props and dispose cleanly", () => {
  const scene = new THREE.Scene();
  const skies = new Set<number>();
  for (const id of [1, 2, 3, 4]) {
    const env = buildStageEnv(scene, id);
    assert.ok(env.group.children.length >= 25, `stage ${id} should have rich scenery`);
    skies.add((scene.background as THREE.Color).getHex());
    env.dispose();
    assert.equal(scene.children.length, 0, `stage ${id} disposed cleanly`);
  }
  assert.equal(skies.size, 4, "each chapter has a distinct sky atmosphere");
});

test("all 20 campaign stages run autoDeploy + simulation + batch rendering + effects + audio cleanly and dist/index.html is a self-contained build", () => {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(55, 1.6, 0.3, 600);
  const audio = new AudioFX();
  const allSfx: SfxName[] = [
    "click", "tab", "select", "deploy", "error", "horn", "win", "lose",
    "swing", "hit", "block", "arrow", "quarrel", "bolt", "bomb", "boom",
    "pistol", "rail", "lightning", "death", "heal", "charge", "land",
  ];
  for (const name of allSfx) audio.sfx(name, 0);
  audio.toggleMute();
  audio.dispose();

  for (let i = 0; i < STAGES.length; i++) {
    const sim = new BattleSimulation(1000 + i);
    sim.setupStage(STAGES[i], i);
    const deployed = sim.autoDeploy(0);
    assert.ok(deployed > 0, `Stage ${i + 1} autoDeploy placed ${deployed} units`);
    assert.ok(sim.gold[0] < DEFS.spear.cost, `Stage ${i + 1} leftover gold ${sim.gold[0]} < 50`);
    assert.equal(sim.begin(), true);

    const env = buildStageEnv(scene, STAGES[i].scene);
    const ur = new UnitBatchRenderer(scene);
    const fx = new EffectLayer(scene, cam);
    for (const u of sim.units) {
      ur.add(u.id, buildUnitRig(u.kind, u.team));
    }
    for (let step = 0; step < 180; step++) {
      sim.advance(FIXED_STEP);
      for (const ev of sim.drainEvents()) {
        if (ev.type === "hit") fx.impact(ev.position.x, 1.2, ev.position.z, 1, 0, 1, 0xffd08a);
        else if (ev.type === "block") fx.impact(ev.position.x, 1.2, ev.position.z, 1, 0, 1, 0xffffff);
        else if (ev.type === "boom") fx.explosion(ev.position.x, 0.7, ev.position.z, 1);
        else if (ev.type === "lightning") {
          const from = ev.target ?? new THREE.Vector3(ev.position.x, 8, ev.position.z);
          fx.lightning(from.x, from.y, from.z, ev.position.x, 1.4, ev.position.z);
        }
      }
      if (step % 60 === 0) {
        ur.sync();
        fx.update(0.016);
      }
    }
    for (const u of sim.units) {
      assert.ok(Number.isFinite(u.position.x) && Number.isFinite(u.position.y) && Number.isFinite(u.position.z));
    }
    ur.dispose();
    fx.dispose();
    env.dispose();
    assert.equal(scene.children.length, 0, `Stage ${i + 1} cleaned up all scene children`);
  }

  for (const [k, g] of Object.entries(GEO)) {
    assert.ok(g.attributes.position && g.attributes.position.count > 0, `GEO.${k} intact after 20 stage cycles`);
  }

  // The shipped build is one self-contained file: everything inline, nothing fetched at runtime.
  const distPath = path.resolve(process.cwd(), "dist/index.html");
  const html = fs.readFileSync(distPath, "utf8");
  assert.ok(html.includes('<script type="module"'), "dist/index.html inlines its module script");
  assert.ok(!/<script[^>]+src=/.test(html) && !/<link[^>]+rel="stylesheet"[^>]+href=/.test(html), "no external scripts or stylesheets");
  assert.ok(html.length > 300_000, "bundle contains the game");
  assert.ok(html.includes("墓地の夜") && html.includes("槍衾"), "bundle is built from the current campaign and rules");
});
