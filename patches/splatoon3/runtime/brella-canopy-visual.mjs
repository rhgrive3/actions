// One aperture calibration for held and detached cloth. Only the cloth grows;
// grips, shaft and muzzle remain at their authored attachment sizes.
import { BRELLA_APERTURE } from './brella-aperture.mjs';
function buildDetachedCanopy(THREE, def, id, color) {
  const group = new THREE.Group(), aperture = BRELLA_APERTURE[id];
  group.name = 'brella-canopy:' + id;
  for (const name of ['canopy', 'canopyInk']) {
    const p = def.parts[name]; if (!p) continue;
    // Cached geometry belongs to the model bank; each flight owns materials.
    const material = new THREE.MeshStandardMaterial({ color: name === 'canopyInk' ? color : 0xffffff,
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
    const material = new THREE.MeshStandardMaterial({ color, roughness: .7, side: THREE.DoubleSide });
    const cloth = new THREE.Mesh(paper.geo, material); cloth.name = 'canopyInk';
    cloth.scale.set(aperture.scale / .11, aperture.scale / .11, 1 / aperture.depth);
    cloth.position.copy(paper.pivot).multiply(cloth.scale).negate();
    group.add(cloth);
  }
  return group;
}
// Every launch disposes its cloth materials on retirement. The program goes with the
// last material that uses it, so each launch linked the cloth shader again mid-match
// (measured in Chromium: the Recycled Brella paper relinked at every launch). One
// never-disposed, never-drawn copy per brella model keeps those programs alive once
// the match-load warm-up has compiled it; flights still own and dispose their materials.
const canopyKeepers = new Map();
export function detachedCanopyProgramKeeper(THREE, def, id) {
  if (!def?.parts?.canopy || !BRELLA_APERTURE[id] || !THREE?.Group) return null;
  let keeper = canopyKeepers.get(def);
  if (!keeper) {
    keeper = buildDetachedCanopy(THREE, def, id, 0xffffff);keeper.name = 'keeper:' + keeper.name;
    canopyKeepers.set(def, keeper);
  }
  return keeper;
}
export function showDetachedCanopy(api, owner, canopy, id) {
  const { THREE, G } = api;
  if (!G.scene?.add || !THREE.Group || !canopy.visualSource) return;
  if (!canopy.mesh) {
    canopy.mesh = buildDetachedCanopy(THREE, canopy.visualSource, id, owner.color);G.scene.add(canopy.mesh);
  }
  canopy.mesh.position.copy(canopy.pos);
  canopy.visualForward ||= new THREE.Vector3(0,0,1);
  canopy.visualDirection ||= new THREE.Vector3();
  canopy.mesh.quaternion.setFromUnitVectors(canopy.visualForward, canopy.visualDirection.copy(canopy.dir).normalize());
}
export function retireDetachedCanopy(canopy) {
  const mesh = canopy?.mesh; if (!mesh) return;
  mesh.removeFromParent();mesh.traverse(n => n.material?.dispose?.());canopy.mesh = null;
}
