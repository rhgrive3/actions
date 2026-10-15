// One aperture calibration for held and detached cloth. Only the cloth grows;
// grips, shaft and muzzle remain at their authored attachment sizes.
import { BRELLA_APERTURE } from './brella-aperture.mjs';
export function showDetachedCanopy(api, owner, canopy, id) {
  const { THREE, G } = api;
  if (!G.scene?.add || !THREE.Group || !canopy.visualSource) return;
  if (!canopy.mesh) {
    const group = new THREE.Group(), def = canopy.visualSource, aperture = BRELLA_APERTURE[id];
    group.name = 'brella-canopy:' + id;
    for (const name of ['canopy', 'canopyInk']) {
      const p = def.parts[name]; if (!p) continue;
      // Cached geometry belongs to the model bank; each flight owns materials.
      const material = new THREE.MeshStandardMaterial({ color: name === 'canopyInk' ? owner.color : 0xffffff,
        vertexColors: name !== 'canopyInk', roughness: .7, side: THREE.DoubleSide });
      const cloth = new THREE.Mesh(p.geo, material);cloth.name = name;
      cloth.scale.set(aperture.scale / .11, aperture.scale / .11, 1 / aperture.depth);
      group.add(cloth);
    }
    const paper = def.detachedCanopyInk;
    if (paper && id === 's3-shelter-focus' && !def.parts.canopyInk
      && paper.geo === def.ink && paper.pivot?.equals(def.parts.canopy.pivot)) {
      // Recycled's held ink draw is the paper, in weapon space rather than part-local space.
      // Borrow the exact cached buffer; flight owns only its material and mesh.
      const material = new THREE.MeshStandardMaterial({ color: owner.color, roughness: .7, side: THREE.DoubleSide });
      const cloth = new THREE.Mesh(paper.geo, material); cloth.name = 'canopyInk';
      cloth.scale.set(aperture.scale / .11, aperture.scale / .11, 1 / aperture.depth);
      cloth.position.copy(paper.pivot).multiply(cloth.scale).negate();
      group.add(cloth);
    }
    canopy.mesh = group;G.scene.add(group);
  }
  canopy.mesh.position.copy(canopy.pos);
  canopy.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), canopy.dir.clone().normalize());
}
export function retireDetachedCanopy(canopy) {
  const mesh = canopy?.mesh; if (!mesh) return;
  mesh.removeFromParent();mesh.traverse(n => n.material?.dispose?.());canopy.mesh = null;
}
