import * as THREE from "three";
import type { UnitRig } from "./rigs";

interface Batch { mesh: THREE.InstancedMesh }
interface Slot { group: THREE.Group; batch: Batch }
interface Entry { rig: UnitRig; slots: Slot[] }

/**
 * Draws baked rig parts with InstancedMesh. One instance per (unit, bone, material class),
 * so per-frame CPU work is ~10 matrix copies per unit regardless of how detailed the model is.
 */
export class UnitBatchRenderer {
  private entries = new Map<number, Entry>();
  private batches = new Map<string, Batch>();

  constructor(private scene: THREE.Scene) {}

  get drawCalls() {
    let n = 0;
    for (const { mesh } of this.batches.values()) if (mesh.visible && mesh.count > 0) n++;
    return n;
  }

  add(id: number, rig: UnitRig) {
    const slots: Slot[] = [];
    for (const part of rig.parts) {
      const key = `${part.geometry.uuid}:${part.material.uuid}`;
      let batch = this.batches.get(key);
      if (!batch) {
        batch = { mesh: this.createMesh(part.geometry, part.material, 32) };
        this.batches.set(key, batch);
      }
      slots.push({ group: part.group, batch });
    }
    this.entries.set(id, { rig, slots });
  }

  private createMesh(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.castShadow = !(material instanceof THREE.MeshBasicMaterial);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    return mesh;
  }

  private grow(batch: Batch) {
    const old = batch.mesh;
    const next = this.createMesh(old.geometry, old.material as THREE.Material, old.instanceMatrix.count * 2);
    next.instanceMatrix.array.set(old.instanceMatrix.array);
    next.count = old.count;
    this.scene.remove(old);
    old.dispose();
    batch.mesh = next;
  }

  sync() {
    for (const batch of this.batches.values()) batch.mesh.count = 0;
    for (const entry of this.entries.values()) {
      entry.rig.root.updateMatrixWorld(true);
      for (const slot of entry.slots) {
        const mesh = slot.batch.mesh;
        const index = mesh.count;
        if (index >= mesh.instanceMatrix.count) this.grow(slot.batch);
        const target = slot.batch.mesh;
        target.setMatrixAt(index, slot.group.matrixWorld);
        target.count = index + 1;
      }
    }
    for (const { mesh } of this.batches.values()) {
      mesh.visible = mesh.count > 0;
      if (mesh.count > 0) {
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  remove(id: number) { this.entries.delete(id); }

  clear() {
    this.entries.clear();
    for (const { mesh } of this.batches.values()) { mesh.count = 0; mesh.visible = false; }
  }

  dispose() {
    this.clear();
    for (const { mesh } of this.batches.values()) { this.scene.remove(mesh); mesh.dispose(); }
    this.batches.clear();
  }
}
