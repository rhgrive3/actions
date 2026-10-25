import * as THREE from 'three';

const point = new THREE.Vector3();
const margin = (box) => 2e-6 * (Math.max(box.min.length(), box.max.length()) + 1);
function finishEnvelope(mesh, box) {
  if (box.isEmpty() || ![...box.min, ...box.max].every(Number.isFinite)) return;
  box.expandByScalar(margin(box));
  mesh.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  mesh.frustumCulled = true;
}
function originRadius(geometry, extra = 0) {
  geometry.computeBoundingSphere();
  return geometry.boundingSphere.center.length() + geometry.boundingSphere.radius + extra;
}
function expandBall(box, x, y, z, radius) {
  box.expandByPoint(point.set(x - radius, y - radius, z - radius));
  box.expandByPoint(point.set(x + radius, y + radius, z + radius));
}

// The full revolution/cloth envelope is independent of animation time. Bounds
// are local to the mesh, so every draw camera (including shadows and cubes)
// gets the normal renderer culling before it uploads instance attributes.
export function setPropInstanceEnvelope(mesh) {
  const box = new THREE.Box3(), sphere = new THREE.Sphere();
  const { recs, axis, cloth } = mesh.userData;
  if (axis) {
    sphere.center.set(0, 0, 0); sphere.radius = originRadius(mesh.geometry);
    for (const r of recs) {
      // Frobenius norm also encloses unusual sheared user-authored bases.
      const e = r.base.elements;
      const stretch = Math.hypot(e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10]);
      expandBall(box, e[12], e[13], e[14], sphere.radius * stretch);
    }
  } else {
    mesh.geometry.computeBoundingBox();
    const local = mesh.geometry.boundingBox.clone(), flex = mesh.geometry.attributes.flex, wave = mesh.geometry.attributes.wave;
    if (cloth && flex && wave) {
      let sway = 0;
      for (let i = 0; i < flex.count; i++) sway = Math.max(sway, Math.abs(flex.getX(i) * wave.getZ(i)) * 1.35);
      if (!Number.isFinite(sway)) return; // preserve uncullable fallback for unsupported shader data
      local.min.z -= sway; local.max.z += sway;
    }
    // union copies extrema; one local scratch box serves every placement.
    const transformed = new THREE.Box3();
    for (const r of recs) box.union(transformed.copy(local).applyMatrix4(r.m));
  }
  finishEnvelope(mesh, box);
}

export function setEnvironmentLifeEnvelopes(env, waterY) {
  for (const [mesh, records, kind] of [[env.sailInst, env.sailboats, 'sail'], [env.buoyInst, env.buoys, 'buoy'], [env.gullInst, env.gulls, 'gull']]) {
    let extra = 0;
    if (kind === 'gull') {
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const side = Math.abs(p.getX(i));
        extra = Math.max(extra, side * 0.62 + 0.12 * side * side);
      }
    }
    const localRadius = originRadius(mesh.geometry, extra), box = new THREE.Box3();
    for (const r of records) {
      const radius = localRadius * Math.abs(r.s);
      if (kind === 'sail') {
        const horizontal = Math.abs(r.d) + radius;
        box.expandByPoint(point.set(-horizontal, waterY - 0.16 - radius, -horizontal));
        box.expandByPoint(point.set(horizontal, waterY + 0.16 + radius, horizontal));
      } else if (kind === 'buoy') {
        expandBall(box, r.x, waterY, r.z, radius + 0.16 + 0.06);
      } else {
        const horizontal = Math.abs(r.r) + radius;
        box.expandByPoint(point.set(r.cx - horizontal, r.h - 1.5 - radius, r.cz - horizontal));
        box.expandByPoint(point.set(r.cx + horizontal, r.h + 1.5 + radius, r.cz + horizontal));
      }
    }
    finishEnvelope(mesh, box);
  }
}

